// Fay Hattı Haritası — temsili bölge haritasında P/S dalga cepheleri, şiddet (MMI) azalımı, zemin etkisi ve erken uyarı süresi.
import { createSim, THREE, ImprovedNoise, clamp, smoothstep, fmt } from '@core';

const VP = 6, VS = 3.5;          // km/sn
const KM = 10;                   // 1 dünya birimi = 10 km
const MAP_W = 40, MAP_D = 25;    // birim (400 × 250 km)

const sim = createSim({
  background: 0x0b1424,
  camera: { position: [2, 30, 27], target: [0, 0, 1], fov: 45 },
  controls: { minDistance: 12, maxDistance: 70, maxPolarAngle: 1.35 },
  fog: [70, 140],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Kuzey Anadolu Fayı'na benzeyen bir fayın geçtiği <b>temsili</b> bir bölge (şehir adları hayalîdir). Fay üzerine
    tıklayınca deprem o noktada başlar. Mavi halka <b>P dalgası</b> (≈6 km/sn), turuncu halka <b>S dalgası</b> (≈3,5 km/sn).
    Hasarın çoğunu daha yavaş gelen S ve yüzey dalgaları yapar. S dalgası geçtikçe haritada tahmini
    <b>şiddet (MMI)</b> renkleri belirir.</p>
    <h3>Büyüklük mü, şiddet mi?</h3>
    <p><b>Büyüklük (Mw)</b> depremin kaynağında açığa çıkan enerjiyi anlatır; her deprem için tek bir sayıdır.
    <b>Şiddet (MMI, I–XII)</b> ise bir yerde sarsıntının nasıl hissedildiğini ve yaptığı etkiyi anlatır; yerden yere değişir:
    uzaklık arttıkça azalır, yumuşak zeminde (alüvyon) artar. Mw logaritmiktir: <b>+1 Mw ≈ 32 kat</b>, +2 Mw ≈ 1.000 kat enerji.</p>
    <h3>Dene</h3>
    <ul>
      <li>Aynı noktada Mw 6 ve Mw 7 depremleri karşılaştır; şiddet haritasının ne kadar büyüdüğüne bak.</li>
      <li>Derinliği 5 km'den 35 km'ye çıkar: merkez üssündeki şiddet azalır ama sarsıntı daha geniş alanda benzer hissedilir.</li>
      <li>Zemin büyütmesini sıfırla ve tekrar aç: kıyıdaki alüvyon şehirlerin şiddeti nasıl değişiyor?</li>
      <li>Erken uyarı: Merkeze çok yakın şehirlerde uyarı S dalgasından sonra gelir ("kör bölge"); uzak şehirler birkaç
      saniyeden onlarca saniyeye kadar önceden uyarılabilir.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p>Şiddet, Atkinson ve Wald (2007) biçimindeki bir şiddet tahmin denklemiyle (MMI = f(Mw, uzaklık)) hesaplanır;
    uzaklık olarak kırılan fay parçasına olan en kısa mesafe ve derinlik kullanılır. Kırılma uzunluğu Wells ve Coppersmith (1994)
    ilişkisinden yaklaşık alınır. Katsayılar başka bir bölgenin verisinden türetildiği için sonuçlar <b>eğitim amaçlı
    yaklaşık</b> değerlerdir; gerçek şiddet bina türü, zemin ve yönlenme etkilerine göre ±1 birim ya da daha fazla değişebilir.
    Harita yükseklikleri abartılıdır.</p>
    <h3>Gerçek hayatta</h3>
    <p>Türkiye'nin resmî deprem bilgisi AFAD ve Kandilli Rasathanesi'nden yayınlanır. Deprem anında nerede olursan ol:
    <b>Çök – Kapan – Tutun</b>. Birkaç saniyelik uyarı bile masanın altına geçmeye yeter.</p>`,
});
sim.setSpeed(2);

// --- Arazi ---
const noise = new ImprovedNoise();
const fbm = (x, z, oct = 4) => { let a = 0, f = 0.09, amp = 1; for (let i = 0; i < oct; i++) { a += amp * noise.noise(x * f, z * f, 3.7); f *= 2.1; amp *= 0.5; } return a; };
function seaField(x, z) {
  const e1 = 1 - ((x + 3) / 11.5) ** 2 - ((z - 0.3) / 3.3) ** 2;
  const zc = 0.6 + 0.07 * (x - 7);
  const e2 = x > 5 && x < 16 ? 1 - ((z - zc) / 0.85) ** 2 - Math.max(0, (x - 14) / 1.8) ** 2 : -1;
  return Math.max(e1, e2 * 0.8) + 0.18 * fbm(x * 2.2, z * 2.2, 2);
}
function height(x, z) {
  const s = seaField(x, z);
  if (s > 0) return -Math.min(1.2, s * 1.6) - 0.05;
  const coast = smoothstep(0, 0.9, -s);
  const mtn = 1.3 * Math.exp(-(((z - 7.5) / 2.4) ** 2)) * (0.6 + 0.5 * fbm(x, z + 20, 3)) + 0.9 * Math.exp(-(((z + 8.8) / 2.2) ** 2)) * (0.6 + 0.5 * fbm(x + 30, z, 3));
  const plain = 1 - 0.85 * Math.exp(-(((x - 16.5) / 2.6) ** 2 + ((z - 3.6) / 1.8) ** 2)); // doğudaki ova
  return 0.03 + coast * plain * (0.2 + Math.max(0, mtn) + 0.35 * Math.max(0, fbm(x, z)));
}
const soilOf = (h) => (h < 0.3 ? 2 : h < 0.75 ? 1 : 0); // 0 kaya, 1 sıkı, 2 yumuşak (alüvyon)
const SOIL = [
  { name: 'Kaya', icon: '🪨', d: 0, color: 0x94a3b8 },
  { name: 'Sıkı zemin', icon: '🟫', d: 0.35, color: 0xd6a35c },
  { name: 'Yumuşak zemin (alüvyon)', icon: '🟨', d: 0.9, color: 0xfde047 },
];

const SEG_X = 200, SEG_Z = 125;
const terrGeo = new THREE.PlaneGeometry(MAP_W, MAP_D, SEG_X, SEG_Z);
terrGeo.rotateX(-Math.PI / 2);
const tPos = terrGeo.attributes.position;
const NV = tPos.count;
const vH = new Float32Array(NV), vSoil = new Uint8Array(NV);
const tCol = new Float32Array(NV * 3);
{
  const c = new THREE.Color();
  for (let i = 0; i < NV; i++) {
    const x = tPos.getX(i), z = tPos.getZ(i), h = height(x, z);
    vH[i] = h; vSoil[i] = soilOf(h);
    tPos.setY(i, Math.max(h, -1.3));
    if (h < 0) c.setHex(0x1e3a5f).lerp(new THREE.Color(0x2b5f8a), clamp(1 + h, 0, 1));
    else if (h < 0.3) c.setHex(0x9dbb6a).lerp(new THREE.Color(0x6f9a4a), h / 0.3);
    else if (h < 0.9) c.setHex(0x6f9a4a).lerp(new THREE.Color(0x7c6a48), (h - 0.3) / 0.6);
    else c.setHex(0x7c6a48).lerp(new THREE.Color(0xd8d2c4), clamp((h - 0.9) / 0.8, 0, 1));
    tCol.set([c.r, c.g, c.b], i * 3);
  }
  terrGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
  terrGeo.computeVertexNormals();
}
const terrain = new THREE.Mesh(terrGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
sim.scene.add(terrain);
const water = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_D), new THREE.MeshLambertMaterial({ color: 0x2f7fc1, transparent: true, opacity: 0.55 }));
water.rotation.x = -Math.PI / 2;
water.position.y = -0.02;
sim.scene.add(water);
// Harita kenar kaidesi
{
  const base = new THREE.Mesh(new THREE.BoxGeometry(MAP_W + 0.4, 1.6, MAP_D + 0.4), new THREE.MeshLambertMaterial({ color: 0x1f2937 }));
  base.position.y = -2.15;
  sim.scene.add(base);
}

// Şiddet / zemin kaplaması (arazinin kopyası, köşe başına RGBA)
const ovGeo = new THREE.BufferGeometry();
const ovPos = new Float32Array(NV * 3);
for (let i = 0; i < NV; i++) ovPos.set([tPos.getX(i), Math.max(vH[i], 0) + 0.03, tPos.getZ(i)], i * 3);
ovGeo.setAttribute('position', new THREE.BufferAttribute(ovPos, 3));
ovGeo.setIndex(terrGeo.index);
const ovCol = new Float32Array(NV * 4);
ovGeo.setAttribute('color', new THREE.BufferAttribute(ovCol, 4));
const overlay = new THREE.Mesh(ovGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
overlay.renderOrder = 2;
sim.scene.add(overlay);

// --- Fay hattı ---
const FAULT_CTRL = [[-20, 1.9], [-15, 1.2], [-10, 0.7], [-5, 0.1], [0, -0.2], [4, 0.1], [8, 0.8], [11, 1.0], [14, 1.4], [17, 2.2], [20, 2.6]];
const fault = []; // yoğun örnek noktaları {x, z, s(km)}
{
  const curve = new THREE.CatmullRomCurve3(FAULT_CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const pts = curve.getSpacedPoints(400);
  let s = 0;
  pts.forEach((p, i) => { if (i) s += p.distanceTo(pts[i - 1]) * KM; fault.push({ x: p.x, z: p.z, s }); });
}
const FAULT_LEN = fault[fault.length - 1].s;
const hAt = (x, z) => Math.max(height(x, z), 0);

function ribbon(points, width, color, lift = 0.07, opacity = 1) {
  const n = points.length, pos = new Float32Array(n * 2 * 3), idx = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const p = points[i], y = hAt(p.x, p.z) + lift;
    pos.set([p.x - dz * width, y, p.z + dx * width, p.x + dz * width, y, p.z - dx * width], i * 6);
    if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.renderOrder = 3;
  return m;
}
const faultLine = ribbon(fault, 0.09, 0xdc2626);
sim.scene.add(faultLine);
let ruptureMesh = null;
sim.label('Fay hattı (temsili)', { position: [-17, 0.8, 1.6], className: 'plain' });
sim.label('🗺️ Temsili harita · yükseklikler abartılı', { position: [6, -1.3, 13.2], className: 'plain' });
{
  // 50 km ölçek çubuğu
  const bar = new THREE.Mesh(new THREE.BoxGeometry(5, 0.08, 0.25), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  bar.position.set(-15, -1.3, 13.0);
  sim.scene.add(bar);
  sim.label('50 km', { position: [-15, -0.9, 13.0], className: 'plain' });
}

// --- Şehirler ve istasyonlar ---
const CITIES = [
  { name: 'Körfezkent', x: 12.4, z: 2.0 }, { name: 'Yalıova', x: 7.5, z: 2.7 }, { name: 'Deniztepe', x: -2.5, z: -3.55 },
  { name: 'Kuzeyliman', x: -10.5, z: -2.3 }, { name: 'Güneykıyı', x: -6, z: 3.95 }, { name: 'Dağbaşı', x: 3.5, z: 7.6 },
  { name: 'Ovacık', x: 16.8, z: 3.9 }, { name: 'Batıköy', x: -16.5, z: 4.2 }, { name: 'Kuzeytepe', x: 6.5, z: -8.4 },
];
const cityGroup = new THREE.Group();
sim.scene.add(cityGroup);
{
  const bm = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
  const rm = new THREE.MeshLambertMaterial({ color: 0xb45309 });
  const bg = new THREE.BoxGeometry(0.22, 1, 0.22);
  CITIES.forEach((c, k) => {
    c.h = hAt(c.x, c.z);
    c.soil = soilOf(height(c.x, c.z));
    const g = new THREE.Group();
    g.position.set(c.x, c.h, c.z);
    for (let i = 0; i < 6; i++) {
      const hh = 0.15 + ((i * 37 + k * 11) % 7) * 0.05;
      const b = new THREE.Mesh(bg, i % 3 ? bm : rm);
      b.scale.y = hh;
      b.position.set(Math.cos(i * 2.4) * 0.28 * (i % 2 + 0.6), hh / 2, Math.sin(i * 2.4) * 0.28 * (i % 2 + 0.6));
      g.add(b);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    g.add(ring);
    c.ring = ring;
    cityGroup.add(g);
    c.label = sim.label(c.name, { parent: g, position: [0, 0.9, 0] });
  });
}
const STATIONS = [[-14, -5], [-7, 6], [-1, -6.5], [3, 4.5], [9, -4], [11, 6.5], [17, -1], [-18, -1]].map(([x, z]) => ({ x, z }));
const stationGroup = new THREE.Group();
sim.scene.add(stationGroup);
{
  const g = new THREE.ConeGeometry(0.22, 0.45, 3);
  const m = new THREE.MeshLambertMaterial({ color: 0xa78bfa, emissive: 0x2e1065 });
  STATIONS.forEach((s) => {
    const c = new THREE.Mesh(g, m);
    c.position.set(s.x, hAt(s.x, s.z) + 0.23, s.z);
    stationGroup.add(c);
    s.mesh = c;
  });
}

// --- Dalga cephesi halkaları (araziyi izleyen bant) ---
const RING_N = 200;
function makeBand(color, opacity = 0.85) {
  const pos = new Float32Array(RING_N * 2 * 3), idx = [];
  for (let i = 0; i < RING_N; i++) {
    const j = (i + 1) % RING_N;
    idx.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  m.frustumCulled = false;
  m.renderOrder = 4;
  sim.scene.add(m);
  return m;
}
const pBand = makeBand(0x38bdf8), sBand = makeBand(0xf97316), blindBand = makeBand(0xffffff, 0.6);
function setBand(band, cx, cz, r, w) {
  const a = band.geometry.attributes.position.array;
  band.visible = r > 0.05;
  if (!band.visible) return;
  for (let i = 0; i < RING_N; i++) {
    const t = (i / RING_N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    for (let k = 0; k < 2; k++) {
      const rr = Math.max(0, r - k * w);
      let x = cx + c * rr, z = cz + s * rr;
      const out = Math.abs(x) > MAP_W / 2 || Math.abs(z) > MAP_D / 2;
      if (out) { x = clamp(x, -MAP_W / 2, MAP_W / 2); z = clamp(z, -MAP_D / 2, MAP_D / 2); }
      a.set([x, out ? -50 : hAt(x, z) + 0.12, z], (i * 2 + k) * 3);
    }
  }
  // Harita dışına düşen bölümleri çökert (çizgi uzamasın)
  for (let i = 0; i < RING_N * 2; i++) if (a[i * 3 + 1] < -40) { const j = i ^ 1; a[i * 3] = a[j * 3]; a[i * 3 + 2] = a[j * 3 + 2]; a[i * 3 + 1] = a[j * 3 + 1]; }
  band.geometry.attributes.position.needsUpdate = true;
}

// Merkez üssü işareti
const epiMark = new THREE.Group();
{
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
  star.position.y = 0.6;
  epiMark.add(star);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
  stem.position.y = 0.3;
  epiMark.add(stem);
  epiMark.userData.star = star;
  sim.scene.add(epiMark);
}
const epiLabel = sim.label('', { parent: epiMark, position: [0, 1.4, 0], className: 'big' });

// --- Şiddet modeli ---
// Atkinson–Wald (2007) biçimi: MMI = c1 + c2(M−6) + c3(M−6)² + c4·logR + c5·R + c6·B + c7·M·logR,  B = max(0, log(R/30))
const C = [12.27, 2.27, 0.1304, -1.3, -0.000707, 1.95, -0.577];
function ipe(M, R) {
  R = Math.max(R, 5);
  const lr = Math.log10(R), B = Math.max(0, Math.log10(R / 30));
  return C[0] + C[1] * (M - 6) + C[2] * (M - 6) ** 2 + C[3] * lr + C[4] * R + C[5] * B + C[6] * M * lr;
}
const ROMAN = ['I', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const MMI_COL = [0xffffff, 0xffffff, 0xbfccff, 0xa0e6ff, 0x80ffff, 0x7aff93, 0xffff00, 0xffc800, 0xff9100, 0xff0000, 0xc80000, 0x800000, 0x800000];
const MMI_TXT = ['', 'Hissedilmez', 'Zayıf', 'Zayıf', 'Hafif', 'Orta', 'Kuvvetli', 'Çok kuvvetli', 'Şiddetli', 'Çok şiddetli', 'Aşırı', 'Aşırı', 'Aşırı'];
const MMI_DMG = ['', 'yok', 'yok', 'yok', 'yok', 'çok hafif', 'hafif', 'orta', 'orta–ağır', 'ağır', 'çok ağır', 'çok ağır', 'çok ağır'];
const mmiInt = (v) => clamp(Math.round(v), 1, 12);
const mmiColor = (v, out) => {
  const f = clamp(v, 1, 11.99), i = Math.floor(f);
  return out.setHex(MMI_COL[i]).lerp(new THREE.Color(MMI_COL[Math.min(12, i + 1)]), f - i);
};
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
// Kırılma uzunluğu (doğrultu atımlı, Wells & Coppersmith 1994, yeraltı kırılma uzunluğu): log L = −2,57 + 0,62·Mw
const ruptureKm = (M) => 10 ** (-2.57 + 0.62 * M);

// --- Olay durumu ---
const ev = { i: 200, x: 0, z: 0, t0: 0, M: 7, depth: 12, rs: 0, re: 0, alertT: 0, maxMmi: 0, done: false };
const vDist = new Float32Array(NV), vHyp = new Float32Array(NV), vMmi = new Float32Array(NV);
let lastReveal = -1;

function distToRupture(x, z) {
  let best = Infinity;
  for (let k = ev.rs; k < ev.re; k++) {
    const a = fault[k], b = fault[k + 1];
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
    const d = (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
    if (d < best) best = d;
  }
  if (ev.rs === ev.re) best = (x - ev.x) ** 2 + (z - ev.z) ** 2;
  return Math.sqrt(best) * KM;
}
const siteTerm = (soil) => SOIL[soil].d * amp.value;
const hypoKm = (x, z) => Math.hypot(Math.hypot(x - ev.x, z - ev.z) * KM, ev.depth);
const mmiAt = (x, z, soil) => ipe(ev.M, Math.hypot(distToRupture(x, z), ev.depth)) + siteTerm(soil);

function startEvent(i = ev.i) {
  ev.i = clamp(i, 0, fault.length - 1);
  const f = fault[ev.i];
  Object.assign(ev, { x: f.x, z: f.z, t0: sim.time, M: magS.value, depth: depthS.value, done: false, alerted: false });
  const L = Math.min(ruptureKm(ev.M), FAULT_LEN);
  let s0 = f.s - L / 2, s1 = f.s + L / 2;
  if (s0 < 0) { s1 -= s0; s0 = 0; }
  if (s1 > FAULT_LEN) { s0 -= s1 - FAULT_LEN; s1 = FAULT_LEN; }
  ev.rs = fault.findIndex((p) => p.s >= s0);
  ev.re = Math.max(ev.rs, fault.findIndex((p) => p.s >= s1 - 1e-6));
  ev.L = L;
  if (ruptureMesh) { ruptureMesh.geometry.dispose(); ruptureMesh.removeFromParent(); ruptureMesh = null; }
  if (ev.re > ev.rs) { ruptureMesh = ribbon(fault.slice(ev.rs, ev.re + 1), 0.22, 0xfacc15, 0.09, 0.9); sim.scene.add(ruptureMesh); }
  epiMark.position.set(ev.x, hAt(ev.x, ev.z), ev.z);
  epiLabel.setText(`Mw ${fmt(ev.M, 1)} · ${fmt(ev.depth)} km derinlik`);
  // Köşe başına şiddet ve S varışı (bir kez)
  ev.maxMmi = 0;
  for (let k = 0; k < NV; k++) {
    const x = tPos.getX(k), z = tPos.getZ(k);
    vHyp[k] = hypoKm(x, z);
    vMmi[k] = vH[k] >= 0 ? mmiAt(x, z, vSoil[k]) : 0;
    if (vMmi[k] > ev.maxMmi) ev.maxMmi = vMmi[k];
  }
  // Erken uyarı: P dalgasını algılayan 3. istasyon + işleme süresi
  const tp = STATIONS.map((s) => hypoKm(s.x, s.z) / VP).sort((a, b) => a - b);
  ev.alertT = tp[2] + procS.value;
  ev.blindKm = Math.sqrt(Math.max(0, (ev.alertT * VS) ** 2 - ev.depth ** 2));
  for (const c of CITIES) {
    c.R = hypoKm(c.x, c.z);
    c.tP = c.R / VP; c.tS = c.R / VS;
    c.mmi = mmiAt(c.x, c.z, c.soil);
    c.warn = c.tS - ev.alertT;
  }
  lastReveal = -1;
  paintOverlay(0);
  updatePanel(0, true);
}

const _c = new THREE.Color();
function paintOverlay(t) {
  const soilMode = view.value === 'zemin';
  const sR = t * VS;
  for (let k = 0; k < NV; k++) {
    let a = 0;
    if (soilMode) {
      if (vH[k] >= 0) { _c.setHex(SOIL[vSoil[k]].color); a = 0.55; }
    } else if (view.value === 'siddet' && vH[k] >= 0 && vHyp[k] <= sR && vMmi[k] >= 2.5) {
      mmiColor(vMmi[k], _c);
      a = clamp((vMmi[k] - 2.5) * 0.35, 0, 0.72);
    }
    ovCol[k * 4] = _c.r; ovCol[k * 4 + 1] = _c.g; ovCol[k * 4 + 2] = _c.b; ovCol[k * 4 + 3] = a;
  }
  ovGeo.attributes.color.needsUpdate = true;
}

// --- Döngü ---
let tick = 0;
sim.onUpdate(() => {
  const t = sim.time - ev.t0;
  const rP = Math.sqrt(Math.max(0, (t * VP) ** 2 - ev.depth ** 2)) / KM;
  const rS = Math.sqrt(Math.max(0, (t * VS) ** 2 - ev.depth ** 2)) / KM;
  const far = Math.hypot(MAP_W, MAP_D);
  setBand(pBand, ev.x, ev.z, rP < far ? rP : 0, 0.28);
  setBand(sBand, ev.x, ev.z, rS < far ? rS : 0, 0.4);
  pBand.visible &&= showWaves.value; sBand.visible &&= showWaves.value;
  if (!ev.alerted && t >= ev.alertT) {
    ev.alerted = true;
    sim.toast(`📢 Erken uyarı yayınlandı (t = ${fmt(ev.alertT, 1)} sn)`, 'warn');
  }
  setBand(blindBand, ev.x, ev.z, ev.alerted && showWaves.value ? ev.blindKm / KM : 0, 0.08);
  // S dalgası ilerledikçe şiddet haritasını aç (her birkaç karede)
  const reveal = Math.floor(rS * 2);
  if (view.value !== 'yok' && reveal !== lastReveal && rS < far + 1) { lastReveal = reveal; paintOverlay(t); }
  if (!ev.done && rS > far) { ev.done = true; paintOverlay(t); }
  if (++tick % 6 === 0) updatePanel(t);
});

sim.onRender(() => {
  const s = epiMark.userData.star;
  s.rotation.y += 0.03;
  const t = sim.time - ev.t0;
  for (const c of CITIES) {
    const shaking = t > c.tS && t < c.tS + 6 + ev.M;
    c.ring.scale.setScalar(shaking ? 1 + 0.15 * Math.sin(sim.time * 25) : 1);
  }
  for (const st of STATIONS) st.mesh.visible = showStations.value;
});

function cityText(c, t) {
  if (t < c.tP) return `<b>${c.name}</b>`;
  if (t < c.tS) return `<b>${c.name}</b> · ⚠️ S'ye ${fmt(c.tS - t, 0)} sn`;
  const m = mmiInt(c.mmi);
  return `<b>${c.name}</b> <span style="background:${hex(MMI_COL[m])};color:#111;padding:0 5px;border-radius:5px">${ROMAN[m]}</span>`;
}

function updatePanel(t, full = false) {
  for (const c of CITIES) {
    c.label.setText(cityText(c, t));
    c.label.visible = showLabels.value;
    const m = mmiInt(c.mmi);
    c.ring.material.color.setHex(t >= c.tS ? MMI_COL[m] : t >= c.tP ? 0x38bdf8 : 0xffffff);
  }
  if (!full && tick % 12) return;
  const rows = [...CITIES].sort((a, b) => a.R - b.R).map((c) => {
    const m = mmiInt(c.mmi), felt = t >= c.tS;
    const warn = c.warn <= 0 ? '<span style="color:#f87171">kör bölge</span>' : `${fmt(c.warn, 1)}`;
    return `<tr><td>${c.name}<br><small style="color:#94a3b8">${SOIL[c.soil].icon} ${SOIL[c.soil].name.split(' ')[0]} · ${fmt(c.R, 0)} km</small></td>
      <td style="text-align:right">${fmt(c.tP, 1)}</td><td style="text-align:right">${fmt(c.tS, 1)}</td><td style="text-align:right">${warn}</td>
      <td style="text-align:center"><span style="background:${hex(MMI_COL[m])};color:#111;padding:0 5px;border-radius:5px;opacity:${felt ? 1 : 0.45}">${ROMAN[m]}</span></td></tr>`;
  }).join('');
  table.set(`<table style="width:100%;font-size:12px;border-collapse:collapse;line-height:1.25">
    <tr style="color:#94a3b8;font-size:11px"><td>Şehir</td><td style="text-align:right">P sn</td><td style="text-align:right">S sn</td><td style="text-align:right">Uyarı sn</td><td style="text-align:center">MMI</td></tr>${rows}</table>
    <small style="color:#94a3b8">Soluk MMI: S dalgası henüz ulaşmadı (tahmin).</small>`);
  const E = (M) => 10 ** (1.5 * M + 4.8);
  stEnergy.set(`${fmt(E(ev.M) / E(6), E(ev.M) / E(6) < 10 ? 1 : 0)}×`);
  stTnt.set(fmtBig(E(ev.M) / 4.184e9));
  stRupt.set(fmt(ev.L, 0));
  const mx = mmiInt(ev.maxMmi);
  stMax.set(`${ROMAN[mx]}`, mx >= 8 ? 'bad' : mx >= 6 ? 'warn' : 'good');
  stAlert.set(fmt(ev.alertT, 1));
  stBlind.set(fmt(ev.blindKm, 0));
  mmiCard.set(`<b>En yüksek tahmini şiddet: ${ROMAN[mx]} (${MMI_TXT[mx]})</b><br>Beklenen hasar: ${MMI_DMG[mx]}.`);
}
const fmtBig = (v) => (v >= 1e6 ? `${fmt(v / 1e6, v >= 1e7 ? 0 : 1)} milyon` : v >= 1e3 ? `${fmt(v / 1e3, v >= 1e4 ? 0 : 1)} bin` : fmt(v, 0));

// Haritaya tıkla → fay üzerindeki en yakın noktada deprem
sim.onClick([terrain, water], (hit) => {
  const p = hit.point;
  let best = 0, bd = Infinity;
  fault.forEach((f, k) => { const d = (f.x - p.x) ** 2 + (f.z - p.z) ** 2; if (d < bd) { bd = d; best = k; } });
  const dk = Math.sqrt(bd) * KM;
  if (dk > 40) sim.toast(`Fay hattına ${fmt(dk, 0)} km uzağa tıkladın; deprem fay üzerindeki en yakın noktada başlatıldı.`, 'warn');
  startEvent(best);
});

// --- Panel ---
const ui = sim.ui;
ui.section('Deprem');
ui.text('Haritada <b>fay hattına tıkla</b>: deprem orada başlar.', 'card');
const magS = ui.slider({ label: 'Büyüklük (Mw)', min: 4, max: 8, step: 0.1, value: 7.2, format: (v) => `Mw ${fmt(v, 1)}`, onChange: () => startEvent() });
const depthS = ui.slider({ label: 'Odak derinliği', min: 5, max: 40, step: 1, value: 12, unit: 'km', onChange: () => startEvent() });
const amp = ui.slider({ label: 'Zemin büyütmesi', min: 0, max: 2, step: 0.1, value: 1, format: (v) => (v === 0 ? 'kapalı' : `×${fmt(v, 1)}`), onChange: () => startEvent() });
ui.buttons([
  { label: '▶ Yeniden başlat', variant: 'primary', onClick: () => startEvent() },
  { label: '🎲 Rastgele yer', onClick: () => startEvent(Math.floor(Math.random() * fault.length)) },
]);
ui.buttons([
  { label: 'Mw 6,0', onClick: () => { magS.set(6); startEvent(); } },
  { label: 'Mw 7,0', onClick: () => { magS.set(7); startEvent(); } },
  { label: 'Mw 7,8', onClick: () => { magS.set(7.8); startEvent(); } },
]);
const stEnergy = ui.stat({ label: 'Enerji (Mw 6\'ya göre)' });
const stTnt = ui.stat({ label: 'TNT eşdeğeri', unit: 'ton' });
const stRupt = ui.stat({ label: 'Kırılma uzunluğu', unit: 'km' });
const stMax = ui.stat({ label: 'En yüksek şiddet (MMI)' });
const mmiCard = ui.text('', 'card');

ui.section('Erken uyarı');
const procS = ui.slider({ label: 'Algılama + işleme süresi', min: 1, max: 10, step: 0.5, value: 4, unit: 'sn', onChange: () => startEvent() });
const stAlert = ui.stat({ label: 'Uyarı yayını', unit: 'sn' });
const stBlind = ui.stat({ label: 'Kör bölge yarıçapı', unit: 'km' });
ui.text('Uyarı süresi = S dalgasının şehre varışı − (3 istasyonun P dalgasını algılaması + işleme). Beyaz halka kör bölgeyi gösterir: içinde kalan yerlere S dalgası uyarıdan önce ulaşır.', 'card');

ui.section('Şehirler');
const table = ui.text('');

ui.section('Görünüm');
const view = ui.segmented({ label: 'Kaplama', options: [{ value: 'siddet', label: 'Şiddet' }, { value: 'zemin', label: 'Zemin sınıfı' }, { value: 'yok', label: 'Yok' }], value: 'siddet',
  onChange: () => { lastReveal = -1; paintOverlay(sim.time - ev.t0); } });
const showWaves = ui.toggle({ label: 'Dalga cepheleri (P mavi, S turuncu)', value: true });
const showLabels = ui.toggle({ label: 'Şehir etiketleri', value: true, onChange: () => updatePanel(sim.time - ev.t0, true) });
const showStations = ui.toggle({ label: 'Sismometre istasyonları (mor)', value: true });
ui.text(`<div style="display:flex;flex-wrap:wrap;gap:3px;font-size:11px">${[3, 4, 5, 6, 7, 8, 9, 10].map((m) => `<span style="background:${hex(MMI_COL[m])};color:#111;padding:1px 5px;border-radius:4px">${ROMAN[m]} ${MMI_TXT[m]}</span>`).join('')}</div>`);

sim.formatTime = (t) => `t = ${fmt(Math.max(0, t - ev.t0), 1)} sn`;
sim.onReset(() => { ev.t0 = 0; startEvent(); });
startEvent(Math.round(fault.length * 0.6));
