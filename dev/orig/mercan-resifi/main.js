// Mercan Resifi ve Okyanus Isınması — Derece Isınma Haftası (DHW), ağarma/toparlanma/ölüm, asitlenme, kirlilik ve koruma alanı.
import { createSim, THREE, BufferGeometryUtils, ImprovedNoise, fmt, clamp, instanced, seeded, heatColor, TAU } from '@core';
import { createModel, STEP, START_WEEK, omega, calcFactor } from './model.js';

const WEEKS_PER_SEC = 1.5;   // 1× hızda 1 sn = 1,5 hafta
const N = 150;               // mercan kolonisi
const MAXF = 280;            // ekranda en çok balık
const REEF_R = 13;

const sim = createSim({
  background: 0x0b5d86,
  fog: [22, 70],
  camera: { position: [0, 11, 25], target: [0, 1.2, 0], fov: 48 },
  controls: { maxDistance: 55, minDistance: 5, maxPolarAngle: Math.PI * 0.49 },
  lights: false,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Sığ, tropikal bir mercan resifi. Mercanlar aslında küçük hayvanlardır; dokularında yaşayan minik
    <b>algler (zooksantel)</b> onlara hem besin hem de renk verir. Su çok uzun süre fazla ısınırsa mercan bu algleri dışarı atar:
    renksizleşir ve beyaz iskeleti görünür. Buna <b>ağarma</b> denir. Ağarmış mercan henüz ölmemiştir; su zamanında serinlerse
    algler geri döner ve renk yavaş yavaş geri gelir. Ağarma çok uzun sürerse mercan aç kalır, ölür ve üzerini
    <b>yosun</b> kaplar (yeşil-kahverengi). Balıklar yuva ve besin için canlı mercana bağlıdır.</p>
    <p>Soldaki <b>termometre</b> suyun, normal yaz en yüksek sıcaklığından ne kadar sıcak olduğunu gösterir.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Deniz ısı dalgası</b>: önce hassas dallı ve masa mercanları ağarır, ardından iri beyin mercanları. Isı dalgası
        bitince kaç tanesi toparlandı, kaç tanesi yosunla kaplandı?</li>
      <li>Isı dalgası süresini kısalt (4 hafta) ya da uzat (16 hafta): <b>süre</b> de sıcaklık kadar önemli.</li>
      <li>Aynı ısı dalgasını <b>Koruma alanı</b> açıkken ve kapalıyken karşılaştır: koruma ağarmayı durduramaz ama
        toparlanmayı hızlandırır (daha çok otçul balık yosunu yer, yeni mercan yavruları tutunabilir).</li>
      <li>pH'yı <b>7,7</b>'ye indir: mercanlar ağarmasa bile çok yavaş büyür (aragonit doygunluğu Ω azalır).</li>
      <li>Bir mercana tıkla: türünü ve durumunu gör.</li>
    </ul>
    <h3>Model</h3>
    <p><b>Derece Isınma Haftası (DHW)</b>, NOAA Coral Reef Watch'ın kullandığı ısı stresi ölçüsüdür: suyun, o bölgenin normal
    en sıcak ay ortalamasını (MMM) <b>en az 1 °C</b> aştığı günlerdeki aşım miktarları son <b>12 hafta</b> boyunca toplanır
    (birimi °C-hafta). NOAA'ya göre <b>DHW ≈ 4</b>'te resif genelinde, özellikle hassas türlerde ağarma beklenir;
    <b>DHW ≥ 8</b>'de yaygın ağarma ve ısıya hassas mercanlarda ölüm olasıdır. Bu simülasyon DHW'yi aynı kuralla hesaplar;
    her mercanın tür ve bireye göre biraz farklı bir toleransı vardır.</p>
    <p>Asitlenme: CO₂ suda çözününce pH ve karbonat iyonu azalır; iskelet yapımı <b>aragonit doygunluğu Ω</b> ile yavaşlar
    (burada büyüme ∝ Ω − 1). Kıyıdan gelen besin/kirlilik yosunu besler, suyu bulandırır ve ısı toleransını düşürür.
    Kaynaklar: NOAA Coral Reef Watch (DHW ürün açıklaması); pH değerleri IPCC'nin yaklaşık değerleridir
    (sanayi öncesi ≈ 8,2, bugün ≈ 8,05; yüksek emisyonda 2100 ≈ 7,7).</p>
    <p><small>Sınırlar: Mevsim eğrisi, tolerans, ölüm ve toparlanma hızları, balık sayısı <b>temsilidir</b>; gerçek bir resifin
    verisi değildir. "2100 yüksek emisyon" hazır ayarı bir tahmin değil, olası bir durumu gösteren temsili bir senaryodur.
    Gerçekte toparlanma yıllar–on yıllar sürer; burada zaman sıkıştırılmıştır.</small></p>`,
});

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
sim.formatTime = () => { const w = model.week(); return `${Math.floor(w / 52) + 1}. yıl · ${MONTHS[Math.floor(((w % 52) / 52) * 12)]}`; };

const rnd = seeded(11);
const model = createModel(N, rnd);
const { c } = model;

// --- Işıklar ---
const hemi = new THREE.HemisphereLight(0xaef0ff, 0x0f3b52, 1.7);
const sun = new THREE.DirectionalLight(0xe8fbff, 1.9);
sun.position.set(6, 20, 8);
sim.scene.add(hemi, sun);

// --- Deniz tabanı ---
const noise = new ImprovedNoise();
const reefH = (x, z) => 1.3 * Math.exp(-(x * x + z * z) / 110) + noise.noise(x * 0.12, 3.1, z * 0.12) * 0.9 + noise.noise(x * 0.5, 7, z * 0.5) * 0.12;
{
  const g = new THREE.PlaneGeometry(130, 130, 110, 110);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), cc = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = reefH(x, z);
    pos.setY(i, y);
    const n = noise.noise(x * 0.3, 1, z * 0.3);
    cc.setHex(0xd8c79a).offsetHSL(0, 0, n * 0.08 - 0.02).lerp(new THREE.Color(0x9c8f6c), clamp(y / 2.2, 0, 0.5));
    col.set([cc.r, cc.g, cc.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  sim.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
  // Kayalar
  const rg = new THREE.DodecahedronGeometry(1, 1);
  const rocks = instanced(rg, new THREE.MeshStandardMaterial({ color: 0x6f7470, roughness: 1, flatShading: true }), 26);
  const o = new THREE.Object3D(), r = seeded(5);
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU, d = 4 + r() * 16;
    o.position.set(Math.cos(a) * d, reefH(Math.cos(a) * d, Math.sin(a) * d) - 0.2, Math.sin(a) * d);
    o.scale.set(0.6 + r() * 1.4, 0.4 + r() * 0.8, 0.6 + r() * 1.2);
    o.rotation.set(r(), r() * 6, r());
    o.updateMatrix();
    rocks.setMatrixAt(i, o.matrix);
  }
  sim.scene.add(rocks);
}

// --- Mercan geometrileri (yükseklik ≈ 1 birim) ---
function part(g, x, y, z) { g.translate(x, y, z); return g; }
function branchingGeo() {
  const parts = [], r = seeded(21);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + r() * 0.4, tilt = 0.25 + r() * 0.45, L = 0.7 + r() * 0.45;
    const cyl = new THREE.CylinderGeometry(0.045, 0.075, L, 5);
    cyl.translate(0, L / 2, 0);
    cyl.rotateZ(tilt);
    cyl.rotateY(a);
    parts.push(cyl);
    const tip = new THREE.SphereGeometry(0.06, 5, 4);
    const tx = -Math.sin(tilt) * L, ty = Math.cos(tilt) * L;
    tip.translate(tx, ty, 0); tip.rotateY(a);
    parts.push(tip);
    const sub = new THREE.CylinderGeometry(0.03, 0.05, L * 0.45, 5);
    sub.translate(0, L * 0.22, 0); sub.rotateZ(tilt + 0.55); sub.translate(tx * 0.55, ty * 0.55, 0); sub.rotateY(a + 0.2);
    parts.push(sub);
  }
  parts.push(part(new THREE.SphereGeometry(0.22, 8, 6), 0, 0.08, 0));
  return BufferGeometryUtils.mergeGeometries(parts.map((p) => p.toNonIndexed()));
}
function brainGeo() {
  const g = new THREE.SphereGeometry(0.75, 28, 18, 0, TAU, 0, Math.PI * 0.62);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.06 * Math.sin(x * 14 + Math.sin(z * 9) * 2.2);  // kıvrımlar
    p.setXYZ(i, x * k, y * k * 0.75, z * k);
  }
  g.computeVertexNormals();
  g.translate(0, -0.05, 0);
  return g;
}
function tableGeo() {
  return BufferGeometryUtils.mergeGeometries([
    part(new THREE.CylinderGeometry(0.1, 0.16, 0.6, 7), 0, 0.3, 0).toNonIndexed(),
    part(new THREE.CylinderGeometry(0.95, 0.75, 0.1, 20), 0, 0.64, 0).toNonIndexed(),
    part(new THREE.CylinderGeometry(0.55, 0.5, 0.08, 16), 0.1, 0.72, 0.05).toNonIndexed(),
  ]);
}
function tubeGeo() {
  const parts = [], r = seeded(8);
  for (let k = 0; k < 7; k++) {
    const a = r() * TAU, d = k ? 0.12 + r() * 0.2 : 0, L = 0.55 + r() * 0.5;
    const g = new THREE.CylinderGeometry(0.07, 0.09, L, 7, 1, true);
    g.translate(Math.cos(a) * d, L / 2, Math.sin(a) * d);
    parts.push(g.toNonIndexed());
    const top = new THREE.TorusGeometry(0.075, 0.025, 4, 8);
    top.rotateX(Math.PI / 2); top.translate(Math.cos(a) * d, L, Math.sin(a) * d);
    parts.push(top.toNonIndexed());
  }
  return BufferGeometryUtils.mergeGeometries(parts);
}
const TYPES = [
  { name: 'Dallı mercan', note: 'ısıya en hassas türlerden', geo: branchingGeo(), base: 1.1, pal: [0xe879f9, 0xa78bfa, 0x60a5fa, 0xf472b6] },
  { name: 'Beyin mercanı', note: 'iri, ısıya daha dayanıklı', geo: brainGeo(), base: 1.25, pal: [0xf59e0b, 0x84cc16, 0xfbbf24, 0x22c55e] },
  { name: 'Masa mercanı', note: 'hızlı büyür ama ısıya hassas', geo: tableGeo(), base: 1.4, pal: [0x2dd4bf, 0x38bdf8, 0x86efac, 0xa3e635] },
  { name: 'Tüp mercan', note: 'orta düzeyde dayanıklı', geo: tubeGeo(), base: 1.0, pal: [0xfb7185, 0xf97316, 0xef4444, 0xfda4af] },
];
const coralMat = new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0, side: THREE.DoubleSide });
const meshes = TYPES.map((T) => {
  const m = instanced(T.geo, coralMat, N);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  m.frustumCulled = false;
  m.count = 0;
  sim.scene.add(m);
  return m;
});

// Koloni yerleşimi (tür, konum, dönüş, boy)
const col = [];
{
  const r = seeded(3), types = [];
  for (let i = 0; i < N; i++) {
    let x, z, tries = 0;
    do {
      const a = r() * TAU, d = Math.sqrt(r()) * REEF_R;
      x = Math.cos(a) * d; z = Math.sin(a) * d * 0.8;
      tries++;
    } while (tries < 40 && col.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 1.6));
    const type = r() < 0.32 ? 0 : r() < 0.4 ? 1 : r() < 0.5 ? 2 : 3;
    types.push(type);
    col.push({ x, z, y: reefH(x, z) - 0.05, type, rot: r() * TAU, s: TYPES[type].base * (0.75 + r() * 0.55), slot: 0, tint: r() });
  }
  const counts = [0, 0, 0, 0];
  col.forEach((q) => (q.slot = counts[q.type]++));
  meshes.forEach((m, k) => (m.count = counts[k]));
  model.init(types);
}

const cBleach = new THREE.Color(0xf6f4ec), cDead = new THREE.Color(0x8a8070), cAlgae = new THREE.Color(0x5d6e2c), tc = new THREE.Color();
const qs = new THREE.Quaternion(), ax = new THREE.Vector3(1, 0, 0);
const mtx = new THREE.Matrix4(), q4 = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
function drawCorals() {
  for (let i = 0; i < N; i++) {
    const q = col[i], T = TYPES[q.type], mesh = meshes[q.type];
    tc.setHex(T.pal[Math.floor(c.hue[i] * T.pal.length) % T.pal.length]);
    let sway = 0;
    if (c.dead[i]) {
      tc.copy(cDead).lerp(cAlgae, c.algae[i]);
    } else {
      tc.lerp(cBleach, clamp(c.b[i] * 1.05, 0, 1));
      if (q.type === 3) sway = Math.sin(sim.time * 1.3 + q.x) * 0.04;
    }
    const s = q.s * (0.3 + 0.7 * c.size[i]) * (c.dead[i] ? 0.92 : 1);
    q4.setFromAxisAngle(up, q.rot);
    if (sway) q4.multiply(qs.setFromAxisAngle(ax, sway));
    mtx.compose(pv.set(q.x, q.y, q.z), q4, sv.set(s, s, s));
    mesh.setMatrixAt(q.slot, mtx);
    mesh.setColorAt(q.slot, tc);
  }
  meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });
}

// --- Balıklar ---
function fishGeo() {
  const body = new THREE.SphereGeometry(0.5, 10, 7);
  body.scale(0.42, 0.2, 0.08);
  const tail = new THREE.ConeGeometry(0.1, 0.18, 4);
  tail.rotateZ(Math.PI / 2); tail.scale(1, 1, 0.3); tail.translate(-0.27, 0, 0);
  const fin = new THREE.ConeGeometry(0.05, 0.12, 3);
  fin.translate(0.02, 0.12, 0); fin.scale(1, 1, 0.3);
  return BufferGeometryUtils.mergeGeometries([body.toNonIndexed(), tail.toNonIndexed(), fin.toNonIndexed()]);
}
const fishMesh = instanced(fishGeo(), new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.15 }), MAXF);
fishMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 3), 3);
fishMesh.frustumCulled = false;
sim.scene.add(fishMesh);
const SCHOOLS = [
  { color: 0xfacc15, r: 9, y: 3.2, w: 0.22, size: 1.0 },
  { color: 0x38bdf8, r: 12, y: 4.5, w: -0.16, size: 0.9 },
  { color: 0xfb923c, r: 6, y: 2.4, w: 0.3, size: 0.8 },
  { color: 0xc084fc, r: 14, y: 5.5, w: 0.12, size: 1.1 },
  { color: 0x4ade80, r: 8, y: 5.0, w: -0.25, size: 0.85 },
  { color: 0xf8fafc, r: 11, y: 2.8, w: 0.19, size: 1.2 },
];
const fish = [];
{
  const r = seeded(9);
  for (let i = 0; i < MAXF; i++) {
    const s = i % SCHOOLS.length;
    fish.push({ s, ph: r() * TAU, dr: (r() - 0.5) * 3, dy: (r() - 0.5) * 1.6, spd: 0.85 + r() * 0.3, sc: SCHOOLS[s].size * (0.8 + r() * 0.4) });
    fishMesh.setColorAt(i, tc.setHex(SCHOOLS[s].color).offsetHSL((r() - 0.5) * 0.05, 0, (r() - 0.5) * 0.12));
  }
}
const eul = new THREE.Euler();
function drawFish(t) {
  const n = Math.min(MAXF, Math.round(model.fish));
  for (let i = 0; i < n; i++) {
    const f = fish[i], S = SCHOOLS[f.s];
    const a = t * S.w * f.spd + f.ph * 0.35 + f.s * 1.3;
    const rr = S.r + f.dr + Math.sin(t * 0.4 + f.ph) * 0.8;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.8;
    const y = S.y + f.dy + Math.sin(t * 0.9 + f.ph) * 0.3;
    const dir = Math.sign(S.w);
    const heading = Math.atan2(-(Math.cos(a) * rr * 0.8) * dir, -Math.sin(a) * rr * dir);
    eul.set(0, heading + Math.sin(t * 8 + f.ph) * 0.12, 0);
    q4.setFromEuler(eul);
    mtx.compose(pv.set(x, y, z), q4, sv.setScalar(f.sc));
    fishMesh.setMatrixAt(i, mtx);
  }
  fishMesh.count = n;
  fishMesh.instanceMatrix.needsUpdate = true;
}

// --- Işık hüzmeleri ve deniz karı ---
const rayTex = (() => {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 256;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
  const hg = g.createLinearGradient(0, 0, 64, 0);
  hg.addColorStop(0, 'rgba(0,0,0,1)'); hg.addColorStop(0.5, 'rgba(0,0,0,0)'); hg.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = hg; g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(cv);
})();
const rays = [];
for (let k = 0; k < 7; k++) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3 + k % 3, 34), new THREE.MeshBasicMaterial({
    map: rayTex, color: 0xcff6ff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  }));
  m.position.set(-14 + k * 4.6, 15, -6 + (k % 3) * 4);
  m.rotation.z = 0.28;
  m.userData.ph = k * 1.7;
  rays.push(m);
  sim.scene.add(m);
}
const snow = (() => {
  const n = 500, p = new Float32Array(n * 3), r = seeded(4);
  for (let i = 0; i < n; i++) p.set([(r() - 0.5) * 50, r() * 16, (r() - 0.5) * 40], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xe0f7ff, size: 0.07, transparent: true, opacity: 0.6 }));
  sim.scene.add(pts);
  return pts;
})();

// --- Termometre ---
const thermo = new THREE.Group();
thermo.position.set(-11, reefH(-11, -9), -9);
sim.scene.add(thermo);
const TH = 7;
const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, TH, 16, 1, true),
  new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
tube.position.y = TH / 2 + 0.6;
thermo.add(tube);
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x330000 }));
bulb.position.y = 0.4;
const fillGeo = new THREE.CylinderGeometry(0.3, 0.3, 1, 12);
fillGeo.translate(0, 0.5, 0);
const fillMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x220000 });
const fill = new THREE.Mesh(fillGeo, fillMat);
fill.position.y = 0.6;
thermo.add(bulb, fill);
// Eşik çizgileri: normal yaz en yüksek (MMM) ve ağarma eşiği (MMM + 1 °C). Termometre ölçeği: −4 … +4 °C
const T_MIN = -4, T_MAX = 4;
const tY = (v) => 0.6 + ((clamp(v, T_MIN, T_MAX) - T_MIN) / (T_MAX - T_MIN)) * TH;
for (const [v, color] of [[0, 0xfacc15], [1, 0xf97316]]) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 20), new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = tY(v);
  thermo.add(ring);
}
const thermoLabel = sim.label('', { parent: thermo, position: [0, TH + 1.6, 0], className: 'plain' });
const ringLabel = sim.label('ağarma eşiği', { parent: thermo, position: [1.9, tY(1), 0], className: 'plain' });
ringLabel.el.style.fontSize = '11px';
const labels = [thermoLabel, ringLabel];

// --- Arayüz ---
const ui = sim.ui;
ui.section('Senaryo');
const preset = ui.segmented({
  options: [{ value: 'normal', label: 'Normal yıl' }, { value: 'dalga', label: 'Deniz ısı dalgası' },
    { value: 'y2100', label: '2100 yüksek emisyon (temsili)' }, { value: 'koruma', label: 'Koruma alanı' }],
  value: 'normal', onChange: () => { sim.reset(); sim.play(); },
});

ui.section('🌡️ Deniz sıcaklığı');
const warming = ui.slider({ label: 'Uzun vadeli ısınma', min: 0, max: 3, step: 0.1, value: 0, format: (v) => `+${fmt(v, 1)} °C`, onChange: (v) => (model.p.warming = v) });
const waveMode = ui.select({ label: 'Isı dalgası', value: 'yok', options: [{ value: 'yok', label: 'Yok' }, { value: 'bir', label: 'Yalnız ilk yaz' }, { value: 'her', label: 'Her yaz' }],
  onChange: (v) => (model.p.waveMode = v) });
const waveI = ui.slider({ label: 'Isı dalgası şiddeti', min: 0.5, max: 3, step: 0.1, value: 1.6, format: (v) => `+${fmt(v, 1)} °C`, onChange: (v) => (model.p.waveI = v) });
const waveD = ui.slider({ label: 'Isı dalgası süresi', min: 2, max: 20, step: 1, value: 10, unit: 'hafta', onChange: (v) => (model.p.waveD = v) });
ui.button({ label: '🔥 Şimdi bir ısı dalgası başlat', variant: 'danger', onClick: () => {
  model.triggerWave();
  sim.toast('🔥 Isı dalgası başladı: su normalden daha sıcak olacak', 'warn');
} });

ui.section('🧪 Su kalitesi ve koruma');
const pH = ui.slider({ label: 'Okyanus pH', min: 7.6, max: 8.2, step: 0.01, value: 8.05,
  format: (v) => `${fmt(v, 2)} · Ω ≈ ${fmt(omega(v), 1)}`, onChange: (v) => (model.p.pH = v) });
const pollution = ui.slider({ label: 'Kıyıdan kirlilik / gübre akışı', min: 0, max: 100, step: 1, value: 15, unit: '%', onChange: (v) => (model.p.pollution = v / 100) });
const mpa = ui.toggle({ label: '🛡️ Deniz koruma alanı (avcılık yasak)', value: false, onChange: (v) => (model.p.mpa = v) });

ui.section('📊 Durum');
const stTemp = ui.stat({ label: 'Normal yaz zirvesine göre', unit: '°C' });
const stDhw = ui.stat({ label: 'Isı stresi (DHW)', unit: '°C-hafta' });
const stFish = ui.stat({ label: '🐠 Balık' });
const stHealthy = ui.stat({ label: '🪸 Sağlıklı', unit: '%' });
const stBleach = ui.stat({ label: '🤍 Ağarmış', unit: '%' });
const stDead = ui.stat({ label: '🟫 Ölü / yosunlu', unit: '%' });
const alert = ui.meter({ label: 'Ağarma uyarısı', color: '#22c55e' });
const coralChart = ui.chart({ title: 'Mercanlar (%)', series: [{ name: 'Sağlıklı', color: '#f472b6', fill: true }, { name: 'Ağarmış', color: '#e2e8f0' }, { name: 'Ölü/yosunlu', color: '#a3a36b' }], maxPoints: 320, yMin: 0, yMax: 100 });
const heatChart = ui.chart({ title: 'Isı: sıcaklık farkı (°C) ve DHW (°C-hafta)', series: [{ name: 'Sıcaklık farkı', color: '#fb923c' }, { name: 'DHW', color: '#ef4444', fill: true }], maxPoints: 320, height: 100 });
const fishChart = ui.chart({ title: 'Balık sayısı', series: [{ name: 'Balık', color: '#38bdf8', fill: true }], maxPoints: 320, yMin: 0, height: 80 });
const note = ui.text('', 'card');

ui.section('Görünüm', { open: false });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => labels.forEach((l) => (l.visible = v)) });
ui.toggle({ label: 'Işık hüzmeleri', value: true, onChange: (v) => rays.forEach((r) => (r.visible = v)) });
ui.buttons([
  { label: '🎥 Genel', onClick: () => sim.moveCamera([0, 11, 25], [0, 1.2, 0]) },
  { label: '🤿 Yakın dalış', onClick: () => sim.moveCamera([5, 4, 9], [0, 1.2, 0]) },
  { label: '⬇️ Yukarıdan', onClick: () => sim.moveCamera([0, 30, 3], [0, 0, 0]) },
]);

// --- Hazır ayarlar ---
const PRESETS = {
  normal: { warming: 0, wave: 'yok', I: 1.6, D: 10, pH: 8.05, pol: 15, mpa: false },
  dalga: { warming: 0.3, wave: 'bir', I: 1.6, D: 10, pH: 8.05, pol: 20, mpa: false },
  y2100: { warming: 1.5, wave: 'yok', I: 1.6, D: 10, pH: 7.72, pol: 30, mpa: false },
  koruma: { warming: 0.3, wave: 'bir', I: 1.6, D: 10, pH: 8.05, pol: 5, mpa: true },
};
function load(name) {
  const P = PRESETS[name];
  warming.set(P.warming, true); waveMode.set(P.wave, true); waveI.set(P.I, true); waveD.set(P.D, true);
  pH.set(P.pH, true); pollution.set(P.pol, true); mpa.set(P.mpa, true);
  model.init(col.map((q) => q.type));
  model.sst = model.sstAt(0);
  acc = 0; nextPush = 0;
  coralChart.clear(); heatChart.clear(); fishChart.clear();
  drawCorals();
  updateStats();
}

// --- Döngü ---
let acc = 0, nextPush = 0, drawTick = 0, lastDeaths = 0;
sim.onUpdate((dt) => {
  acc += dt * WEEKS_PER_SEC;
  while (acc >= STEP) { model.step(); acc -= STEP; }
  if (model.t >= nextPush) {
    nextPush = model.t + 0.5;
    coralChart.push([model.healthy * 100, model.bleached * 100, model.deadF * 100]);
    heatChart.push([model.sst, model.dhw]);
    fishChart.push([model.fish]);
  }
  if (model.deaths - lastDeaths >= 10) { lastDeaths = model.deaths; sim.toast('🟫 Uzun süre ağarmış kalan mercanlar ölmeye başladı', 'bad'); }
});

const fogBlue = new THREE.Color(0x0b5d86), fogGreen = new THREE.Color(0x3b6b55), fogHot = new THREE.Color(0x167a8a), bgc = new THREE.Color();
sim.onRender((rdt) => {
  const t = sim.time;
  drawFish(t);
  if (drawTick++ % 3 === 0) drawCorals();
  if (drawTick % 12 === 1) updateStats();
  rays.forEach((r) => { r.material.opacity = 0.07 + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.7 + r.userData.ph)); });
  snow.position.y = -((t * 0.15) % 2);
  snow.rotation.y += rdt * 0.004;
  // Su rengi: kirlilik bulanık yeşil, sıcaklık hafif turkuaz
  bgc.copy(fogBlue).lerp(fogHot, clamp(model.sst / 3, 0, 0.5)).lerp(fogGreen, model.p.pollution * 0.75);
  sim.scene.background.copy(bgc);
  sim.scene.fog.color.copy(bgc);
  sim.scene.fog.far = 70 - model.p.pollution * 35;
  // Termometre
  const v = model.sst;
  fill.scale.y = Math.max(0.01, tY(v) - 0.6);
  heatColor(clamp((v + 3) / 5, 0, 1), fillMat.color);
  bulb.material.color.copy(fillMat.color);
});

const ALERTS = [
  [0, 'Stres yok', '#22c55e'], [0, 'İzle: su ısınıyor', '#a3e635'], [0, 'Dikkat: ısı stresi birikiyor', '#facc15'],
  [4, '1. düzey: ağarma bekleniyor', '#f97316'], [8, '2. düzey: yaygın ağarma, ölüm riski', '#dc2626'],
];
function updateStats() {
  const sst = model.sst, dhw = model.dhw;
  stTemp.set(`${sst >= 0 ? '+' : ''}${fmt(sst, 1)}`, sst >= 1 ? 'bad' : sst >= 0 ? 'warn' : 'good');
  stDhw.set(fmt(dhw, 1), dhw >= 8 ? 'bad' : dhw >= 4 ? 'warn' : '');
  stFish.set(Math.round(model.fish), model.fish < 50 ? 'bad' : model.fish > 120 ? 'good' : '');
  stHealthy.set(fmt(model.healthy * 100, 0), model.healthy > 0.7 ? 'good' : model.healthy < 0.3 ? 'bad' : '');
  stBleach.set(fmt(model.bleached * 100, 0), model.bleached > 0.3 ? 'warn' : '');
  stDead.set(fmt(model.deadF * 100, 0), model.deadF > 0.3 ? 'bad' : '');
  const lvl = ALERTS[dhw >= 8 ? 4 : dhw >= 4 ? 3 : dhw > 0.01 ? 2 : sst >= 0 ? 1 : 0];
  alert.set(dhw / 12, `${lvl[1]} · ${fmt(dhw, 1)}`);
  alert.color(lvl[2]);
  thermoLabel.setText(`🌡️ <b>${sst >= 0 ? '+' : ''}${fmt(sst, 1)} °C</b><br><small>en sıcak ay ortalamasına göre · DHW ${fmt(dhw, 1)}</small>`);

  const calc = calcFactor(model.p.pH);
  let msg;
  if (dhw >= 8) msg = '🔥 <b>Çok uzun süren sıcak su!</b> Mercanlar alglerini attı ve bembeyaz oldu. Aç kalan hassas mercanlar ölmeye başlıyor.';
  else if (dhw >= 4) msg = '🤍 <b>Ağarma:</b> su haftalardır fazla sıcak. Mercanlar renk veren alglerini dışarı atıyor. Su zamanında serinlerse toparlanabilirler.';
  else if (model.bleached > 0.05 && model.hotspot < 1) msg = '🌈 <b>Toparlanma:</b> su serinledi, algler geri dönüyor ve renkler yavaş yavaş geri geliyor.';
  else if (model.deadF > 0.3 && model.p.pollution > 0.5) msg = '🟢 <b>Yosun baskısı:</b> kirli su yosunu besliyor; ölü iskeletleri kaplayan yosun yeni mercan yavrularının tutunmasını engelliyor.';
  else if (model.deadF > 0.3 && model.p.mpa) msg = '🛡️ <b>Koruma alanı:</b> otçul balıklar yosunu kırpıyor, boşalan yerlere yeni mercan yavruları tutunuyor. Toparlanma yavaş ama sürüyor.';
  else if (model.deadF > 0.3) msg = '🟫 <b>Resif yaralı:</b> ölü mercanlar yosunla kaplı; balıklar yuva bulamadığı için azaldı. Toparlanma yıllar sürer.';
  else if (calc < 0.45) msg = '🧪 <b>Asitlenme:</b> sudaki karbonat azaldı (Ω düşük). Mercanlar iskelet yapmakta zorlanıyor, çok yavaş büyüyor.';
  else if (sst >= 0) msg = '☀️ <b>Yaz:</b> su yılın en sıcak dönemine yaklaşıyor. Normal yaz zirvesini 1 °C aşarsa ısı stresi (DHW) birikmeye başlar.';
  else msg = '💙 <b>Sağlıklı resif:</b> mercanlar alg ortaklarıyla birlikte renkli ve büyüyor; balıklar bol.';
  note.set(msg);
}

// Mercana tıkla → bilgi
sim.onClick(() => meshes, (hit) => {
  const k = meshes.indexOf(hit.object);
  if (k < 0 || hit.instanceId == null) return;
  const i = col.findIndex((q) => q.type === k && q.slot === hit.instanceId);
  if (i < 0) return;
  const T = TYPES[k];
  const state = c.dead[i] ? (c.algae[i] > 0.5 ? 'ölmüş, üzeri yosun kaplı' : 'yeni ölmüş, beyaz iskelet')
    : c.b[i] > 0.7 ? 'ağarmış (algler gitmiş), aç kalıyor' : c.b[i] > 0.3 ? 'solgun, ağarmaya başlamış' : 'sağlıklı ve renkli';
  sim.toast(`🪸 <b>${T.name}</b> (${T.note}) · ${state}`, c.dead[i] ? 'bad' : c.b[i] > 0.5 ? 'warn' : 'good');
});

sim.onReset(() => { lastDeaths = 0; load(preset.value); });
load('normal');
