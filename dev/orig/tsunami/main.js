// Tsunami Yayılımı — doğrusal sığ su denklemleri (2B ızgara), sığlaşma, kıyıya varış, taşkın, dalgakıran ve tahliye.
import { createSim, THREE, clamp, smoothstep, lerp, fmt, instanced, rand } from '@core';

const G = 9.81;
const NX = 160, NZ = 100;             // ızgara
const DX = 2500;                      // m (400 km × 250 km)
const LX = NX * DX / 1000, LZ = NZ * DX / 1000; // km
const SEC_PER_SIM = 60;               // 1 sn simülasyon = 1 dk gerçek zaman
const S = 0.1;                        // dünya birimi / km
const VEX = 0.05;                     // kara yükseltisi: birim / m
const H_MIN = 1.5;                    // bundan sığ hücreler kara (duvar) sayılır

const sim = createSim({
  background: 0x0a1626,
  camera: { position: [-6, 21, 27], target: [5, -1.2, 0], fov: 45 },
  controls: { minDistance: 4, maxDistance: 70, maxPolarAngle: 1.4 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Solda derin okyanus (≈4.000 m), ortada kıta yamacı, sağda sığ kıta sahanlığı ve körfezdeki <b>Liman kasabası</b>.
    Deniz tabanındaki bir fay kırılınca taban bir yanda yükselir, öbür yanda çöker; üstündeki su kütlesi de aynı şekli alır
    ve tsunami her yöne yayılır. Kırmızı: deniz seviyesinin üstü, mavi-beyaz: altı (çekilme).</p>
    <h3>Neden kıyıda büyüyor?</h3>
    <p>Tsunami dalga boyu yüzlerce kilometre olduğundan hızı yalnız derinliğe bağlıdır: <b>c = √(g·h)</b>.
    4.000 m derinlikte ≈ 200 m/sn (jet uçağı hızı!), 50 m derinlikte ≈ 22 m/sn. Sığ suda dalga yavaşlar, arkadan gelen su
    üstüne biner ve yükselir (<b>sığlaşma</b>; Green yasası: yükseklik ∝ h<sup>−1/4</sup>). Açık denizde gemiler tsunamiyi fark etmez bile.</p>
    <h3>Dene</h3>
    <ul>
      <li>Denize tıkla: o noktadaki derinlik ve dalga hızı "Ölçüm noktası" kutusunda görünür.</li>
      <li>Mw 8,5 hazır ayarında sireni kapat, sonra aç: kasabadaki kişiler ne zaman yüksek yere ulaşıyor?</li>
      <li>Dalgakıranı ve kıyı duvarını aç/kapat; taşkına ve su basan ev sayısına bak.</li>
      <li>Kaynağı kıyıya yaklaştır: varış süresi dakikalara iner. Marmara ve Ege gibi kapalı denizlerde kaynak yakındır, uyarı süresi çok kısadır.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <ul>
      <li>Kıyıdayken güçlü ya da uzun süren bir deprem hissettiysen, <b>deniz çekilirse ya da denizden gelen bir uğultu duyarsan</b>
      resmî uyarıyı bekleme: hemen kıyıdan uzaklaş ve <b>yüksek yere</b> çık (ya da sağlam, yüksek bir binanın üst katlarına).</li>
      <li>Çekilen denize, balık ya da deniz kabuğu toplamaya gitme. Tsunami tek dalga değildir; ilk dalga en büyüğü olmayabilir.
      Yetkililer "tehlike geçti" diyene kadar kıyıya dönme.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p>Doğrusal sığ su denklemleri, kaydırmalı (C) ızgarada ileri-geri adımla çözülür (2,5 km hücre). İlk yüzey şekli,
    taban yükselmesinin suya aynen aktarıldığı basit bir yükselme/çökme çiftidir (Okada modelinin yerine). Mw, kayma ≈ 2 × yükselme
    varsayımıyla M₀ = μ·A·D'den kabaca hesaplanır. Kıyıdaki tırmanma ve taşkın doğrusal olmayan etkiler içerdiğinden yalnız yaklaşık
    gösterilir. Dikey ölçek büyük ölçüde abartılıdır.</p>`,
});

// --- Batimetri ---
const xc = (z) => 370 + 10 * Math.sin(z / 37) - 30 * Math.exp(-(((z - 125) / 24) ** 2)); // kıyı çizgisi (km)
const SHELF = 110;
function depthAt(x, z) {                 // m; + su derinliği, − kara yükseltisi
  const c = xc(z), s = c - SHELF;
  if (x >= c) {
    const d = x - c;
    const hill = 38 * Math.exp(-(((x - (c + 5.5)) / 2.6) ** 2 + ((z - 128) / 5) ** 2));
    return -(0.5 + d * 1.6 + hill + 6 * Math.sin(z / 9) * smoothstep(3, 12, d));
  }
  if (x > s) return 2 + 148 * ((c - x) / SHELF) ** 1.3;
  const t = smoothstep(s - 55, s, x);
  return lerp(4000 + 150 * Math.sin(z / 23) * Math.cos(x / 31), 150, t);
}

const N = NX * NZ;
const h = new Float32Array(N), wet = new Uint8Array(N);
const eta = new Float32Array(N), etaMax = new Float32Array(N);
const U = new Float32Array((NX + 1) * NZ), V = new Float32Array(NX * (NZ + 1));
const uOpen = new Float32Array((NX + 1) * NZ), vOpen = new Float32Array(NX * (NZ + 1));
const damp = new Float32Array(N);
const cx = (i) => (i + 0.5) * DX / 1000, cz = (k) => (k + 0.5) * DX / 1000; // hücre merkezi (km)
for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
  const d = depthAt(cx(i), cz(k)), c = k * NX + i;
  h[c] = d; wet[c] = d > H_MIN ? 1 : 0;
  // Batı, kuzey ve güney kenarında sönümleme (açık okyanus sınırı)
  const e = Math.max(smoothstep(12, 0, i), smoothstep(10, 0, k), smoothstep(NZ - 11, NZ - 1, k));
  damp[c] = e * 0.004;
}
// Her satırın kıyı hücresi
const iShore = new Int16Array(NZ);
for (let k = 0; k < NZ; k++) { let i = NX - 1; while (i > 0 && !wet[k * NX + i]) i--; iShore[k] = i; }

const BW_I = Math.round(352 / 2.5), BW_K0 = 38, BW_K1 = 62, GAP0 = 48, GAP1 = 51;
function buildFaces() {
  for (let k = 0; k < NZ; k++) for (let i = 0; i <= NX; i++) {
    const a = i > 0 ? k * NX + i - 1 : -1, b = i < NX ? k * NX + i : -1;
    let o = a >= 0 && b >= 0 && wet[a] && wet[b] ? Math.min(h[a], h[b]) : 0;
    if (breakwater.value && i === BW_I && k >= BW_K0 && k <= BW_K1 && (k < GAP0 || k > GAP1)) o *= 0.12;
    uOpen[k * (NX + 1) + i] = o;
  }
  for (let k = 0; k <= NZ; k++) for (let i = 0; i < NX; i++) {
    const a = k > 0 ? (k - 1) * NX + i : -1, b = k < NZ ? k * NX + i : -1;
    vOpen[k * NX + i] = a >= 0 && b >= 0 && wet[a] && wet[b] ? Math.min(h[a], h[b]) : 0;
  }
}

function step(dt) {
  const r = G * dt / DX;
  for (let k = 0; k < NZ; k++) {
    const row = k * NX, fr = k * (NX + 1);
    for (let i = 1; i < NX; i++) { const f = fr + i, o = uOpen[f]; U[f] = o ? U[f] - o * r * (eta[row + i] - eta[row + i - 1]) : 0; }
  }
  for (let k = 1; k < NZ; k++) {
    const row = k * NX;
    for (let i = 0; i < NX; i++) { const f = row + i, o = vOpen[f]; V[f] = o ? V[f] - o * r * (eta[f] - eta[f - NX]) : 0; }
  }
  const q = dt / DX;
  for (let k = 0; k < NZ; k++) {
    const row = k * NX, fr = k * (NX + 1);
    for (let i = 0; i < NX; i++) {
      const c = row + i;
      if (!wet[c]) continue;
      let e = eta[c] - q * (U[fr + i + 1] - U[fr + i] + V[c + NX] - V[c]);
      if (damp[c]) { const f = 1 - damp[c] * dt; e *= f; U[fr + i] *= f; V[c] *= f; }
      eta[c] = e;
      if (e > etaMax[c]) etaMax[c] = e;
    }
  }
}
const CMAX = Math.sqrt(G * 4200);
const DT_MAX = 0.45 * DX / CMAX / Math.SQRT2 * 1.4;

// --- Sahne: taban/kara ve su yüzeyi ---
const X = (xkm) => (xkm - LX / 2) * S, Z = (zkm) => (zkm - LZ / 2) * S;
const bedY = (d) => (d > 0 ? -Math.sqrt(d / 4000) * 3.2 : -d * VEX);
function gridGeo() {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), idx = [];
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) pos.set([X(cx(i)), 0, Z(cz(k))], (k * NX + i) * 3);
  for (let k = 0; k < NZ - 1; k++) for (let i = 0; i < NX - 1; i++) {
    const a = k * NX + i, b = a + 1, c = a + NX, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  g.setIndex(idx);
  return g;
}
const bedGeo = gridGeo();
{
  const p = bedGeo.attributes.position.array, col = bedGeo.attributes.color.array, c = new THREE.Color();
  for (let j = 0; j < N; j++) {
    const d = h[j];
    p[j * 3 + 1] = bedY(d);
    if (d > 0) c.setHex(0xd9c38f).lerp(new THREE.Color(0x0f2c4d), clamp(Math.sqrt(d / 4000) * 1.4, 0, 1));
    else if (-d < 3) c.setHex(0xe8d6a0);
    else if (-d < 25) c.setHex(0x7fb069).lerp(new THREE.Color(0x4d7c3a), (-d - 3) / 22);
    else c.setHex(0x4d7c3a).lerp(new THREE.Color(0x8b7d5b), clamp((-d - 25) / 25, 0, 1));
    col.set([c.r, c.g, c.b], j * 3);
  }
  bedGeo.computeVertexNormals();
}
sim.scene.add(new THREE.Mesh(bedGeo, new THREE.MeshLambertMaterial({ vertexColors: true })));
{
  // Kesit kaidesi
  const m = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(LX * S + 0.2, 0.6, LZ * S + 0.2), m);
  base.position.y = -3.6;
  sim.scene.add(base);
}
const waterGeo = gridGeo();
const water = new THREE.Mesh(waterGeo, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.86 }));
sim.scene.add(water);

// Fay işareti (deniz tabanında)
const faultMark = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 1), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
sim.scene.add(faultMark);
const faultLabel = sim.label('Fay (deniz tabanı)', { parent: faultMark, position: [0, 0.8, 0] });

// Dalgakıran
const bwGroup = new THREE.Group();
{
  const m = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
  const x = X(BW_I * 2.5);
  for (const [k0, k1] of [[BW_K0, GAP0 - 1], [GAP1 + 1, BW_K1]]) {
    const z0 = Z(k0 * 2.5), z1 = Z((k1 + 1) * 2.5);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.5, z1 - z0), m);
    b.position.set(x, -0.1, (z0 + z1) / 2);
    bwGroup.add(b);
  }
  sim.scene.add(bwGroup);
}

// --- Kasaba: evler, kıyı duvarı, yüksek yer, kişiler ---
const TOWN_K0 = 42, TOWN_K1 = 58;
const houses = [];
for (let k = TOWN_K0; k <= TOWN_K1; k += 1) {
  const zc = cz(k), x0 = xc(zc);
  for (let n = 0; n < 3; n++) {
    const x = x0 + 0.6 + n * 1.1 + rand(-0.3, 0.3), z = zc + rand(-0.9, 0.9);
    houses.push({ x, z, k, elev: -depthAt(x, z), flooded: false });
  }
}
const houseMesh = instanced(new THREE.BoxGeometry(0.1, 0.08, 0.1), new THREE.MeshLambertMaterial({ color: 0xffffff }), houses.length);
const roofMesh = instanced(new THREE.ConeGeometry(0.085, 0.06, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }), houses.length);
{
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)), s1 = new THREE.Vector3(1, 1, 1);
  houses.forEach((hs, j) => {
    const y = hs.elev * VEX;
    m.makeTranslation(X(hs.x), y + 0.04, Z(hs.z)); houseMesh.setMatrixAt(j, m);
    m.compose(new THREE.Vector3(X(hs.x), y + 0.11, Z(hs.z)), q, s1); roofMesh.setMatrixAt(j, m);
  });
  sim.scene.add(houseMesh, roofMesh);
}
const seawall = new THREE.Group();
{
  const m = new THREE.MeshLambertMaterial({ color: 0xcbd5e1 });
  for (let k = TOWN_K0 - 1; k <= TOWN_K1 + 1; k++) {
    const zc = cz(k), x = xc(zc) + 0.25;
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 6 * VEX, DX / 1000 * S * 1.02), m);
    b.position.set(X(x), 6 * VEX / 2 + 0.5 * VEX, Z(zc));
    seawall.add(b);
  }
  sim.scene.add(seawall);
}
const HILL = { x: xc(128) + 5.5, z: 128 };
const hillY = -depthAt(HILL.x, HILL.z) * VEX;
sim.label('⛰️ Yüksek yer (tahliye alanı)', { position: [X(HILL.x), hillY + 0.6, Z(HILL.z)] });
const townLabel = sim.label('🏘️ Liman', { position: [X(xc(125) + 1.5), 0.9, Z(118)], className: 'big' });

const PEOPLE = 60;
const people = [];
for (let j = 0; j < PEOPLE; j++) {
  const hs = houses[j % houses.length];
  people.push({ x: hs.x + rand(-0.3, 0.3), z: hs.z + rand(-0.3, 0.3), x0: 0, z0: 0, state: 0, delay: rand(0, 5), know: Math.random() < 0.5, tx: HILL.x + rand(-0.8, 0.8), tz: HILL.z + rand(-1.2, 1.2) });
}
people.forEach((p) => { p.x0 = p.x; p.z0 = p.z; });
const personMesh = instanced(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), PEOPLE);
sim.scene.add(personMesh);
const WALK = 5 / 60;  // km/dk (≈5 km/sa)

// Ölçüm noktaları
const GAUGE = { k: 50, i: iShore[50] };
const DART = { k: 50, i: Math.round(200 / 2.5) };
function marker(color, i, k, text) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), new THREE.MeshBasicMaterial({ color }));
  pole.position.y = 0.45;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color }));
  ball.position.y = 0.95;
  g.add(pole, ball);
  g.position.set(X(cx(i)), 0, Z(cz(k)));
  sim.scene.add(g);
  const lb = sim.label(text, { parent: g, position: [0, 1.4, 0] });
  return { g, lb };
}
const gaugeM = marker(0xfacc15, GAUGE.i, GAUGE.k, '📏 Mareograf');
const dartM = marker(0xa78bfa, DART.i, DART.k, '📡 DART şamandırası');
const probe = marker(0x22d3ee, 60, 30, '');
const probeLabel = probe.lb;

// --- Durum ---
const st = { T: 0, acc: 0, arrival: null, firstSign: 0, maxGauge: 0, retreatWarned: false, warnT: 8 * 60, sirenOn: false, flooded: 0, runup: 0, alarm: false, retreatSeen: false, source: {} };
const rowFlood = new Float32Array(NZ);

function initial() {
  eta.fill(0); U.fill(0); V.fill(0); etaMax.fill(0); rowFlood.fill(0);
  const L = lenS.value, Up = upS.value, W = Math.min(L / 2, 100);
  const zc = LZ / 2, xf = xc(zc) - distS.value;
  const sig = W / 4;
  for (let k = 0; k < NZ; k++) {
    const z = cz(k), along = smoothstep(zc - L / 2 - 15, zc - L / 2 + 15, z) * (1 - smoothstep(zc + L / 2 - 15, zc + L / 2 + 15, z));
    for (let i = 0; i < NX; i++) {
      const c = k * NX + i;
      if (!wet[c]) continue;
      const x = cx(i);
      eta[c] = along * Up * (Math.exp(-(((x - xf) / sig) ** 2)) - 0.45 * Math.exp(-(((x - xf - W / 2) / sig) ** 2)));
    }
  }
  const slip = 2 * Up, M0 = 3e10 * L * 1e3 * W * 1e3 * slip;
  st.source = { L, W, Up, xf, Mw: (2 / 3) * (Math.log10(M0) - 9.1), depth: depthAt(xf, zc) };
  Object.assign(st, { T: 0, acc: 0, arrival: null, firstSign: 0, maxGauge: 0, flooded: 0, runup: 0, alarm: false, retreatSeen: false, sirenOn: false });
  faultMark.scale.z = L * S;
  faultMark.position.set(X(xf), bedY(st.source.depth) + 0.1, Z(zc));
  faultLabel.position.y = -bedY(st.source.depth) + 0.4;
  houses.forEach((hs) => (hs.flooded = false));
  people.forEach((p) => { p.x = p.x0; p.z = p.z0; p.state = 0; p.delay = rand(0, 5); });
  chart.clear();
  buildFaces();
  updateStats(true);
}

// --- Döngü ---
const _m = new THREE.Matrix4(), _c = new THREE.Color();
const cHi = new THREE.Color(0xef4444), cLo = new THREE.Color(0xe0f2fe), cFlood = new THREE.Color(0x5b8db8);
let frame = 0;
sim.onUpdate((dt) => {
  // Fiziksel zaman: kararlı alt adımlar (8× hızda da)
  let rem = dt * SEC_PER_SIM, n = 0;
  while (rem > 1e-6 && n < 60) { const d = Math.min(DT_MAX, rem); step(d); rem -= d; n++; }
  const prevT = st.T;
  st.T += dt * SEC_PER_SIM;
  const Tm = st.T / 60;

  // Mareograf: ilk varış ve çekilme
  const eg = eta[GAUGE.k * NX + GAUGE.i];
  if (st.arrival == null && Math.abs(eg) > 0.08 * Math.max(0.5, st.source.Up)) {
    st.arrival = Tm; st.firstSign = Math.sign(eg);
    sim.toast(eg < 0 ? '🌊 Liman\'da deniz çekiliyor! Bu bir tsunami işaretidir: hemen yüksek yere!' : '🌊 Tsunami Liman\'a ulaştı!', 'bad');
  }
  if (eg < -0.4) st.retreatSeen = true;
  st.maxGauge = Math.max(st.maxGauge, eg);
  if (siren.value && !st.sirenOn && st.T >= st.warnT) { st.sirenOn = true; sim.toast('🚨 Tsunami uyarısı! Siren çalıyor: kıyıdan uzaklaş, yüksek yere çık.', 'warn'); }

  // Kıyı taşkını (satır başına kıyıdaki su seviyesi)
  for (let k = 0; k < NZ; k++) {
    const e = eta[k * NX + iShore[k]];
    let f = e > 0 ? e * 1.2 : 0;
    if (wall.value && k >= TOWN_K0 - 1 && k <= TOWN_K1 + 1 && f < 6) f = 0;
    rowFlood[k] = f;
    if (k >= TOWN_K0 && k <= TOWN_K1 && f > st.runup) st.runup = f;
  }
  for (const hs of houses) if (!hs.flooded && rowFlood[hs.k] > hs.elev + 0.3) { hs.flooded = true; st.flooded++; }

  // Kişiler: siren, çekilen deniz ya da su gelince yüksek yere yürür
  const dtm = (st.T - prevT) / 60;
  for (const p of people) {
    if (p.state === 0) {
      const k = clamp(Math.floor(p.z / 2.5), 0, NZ - 1);
      if ((st.sirenOn && Tm > st.warnT / 60 + p.delay) || (st.retreatSeen && p.know) || rowFlood[k] > 0.5) p.state = 1;
    }
    if (p.state === 1) {
      const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz), s = WALK * dtm;
      if (d <= s) { p.x = p.tx; p.z = p.tz; p.state = 2; } else { p.x += dx / d * s; p.z += dz / d * s; }
    }
    if (p.state < 2) {
      const k = clamp(Math.floor(p.z / 2.5), 0, NZ - 1);
      if (rowFlood[k] > -depthAt(p.x, p.z) + 0.5) p.state = 3;
    }
  }
  if (++frame % 3 === 0) updateStats();
});

sim.onRender(() => {
  // Su yüzeyi
  const p = waterGeo.attributes.position.array, col = waterGeo.attributes.color.array;
  const ex = exag.value * 0.06, sc = Math.max(0.3, st.source.Up || 1) * 0.35;
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    const j = k * NX + i;
    let y;
    if (wet[j]) {
      const e = eta[j];
      y = e * ex;
      const by = bedY(h[j]);
      if (e < -h[j] + 0.3) y = by - 0.02;      // deniz çekildi: taban açıkta
      const t = clamp(e / sc, -1, 1);
      const deep = clamp(Math.sqrt(h[j] / 4000), 0, 1);
      _c.setRGB(0.1 + 0.15 * (1 - deep), 0.35 + 0.25 * (1 - deep), 0.65 + 0.2 * (1 - deep));
      if (t > 0) _c.lerp(cHi, t); else _c.lerp(cLo, -t * 0.9);
    } else {
      const el = -h[j], f = rowFlood[k];
      const inland = (i - iShore[k]) * 2.5;
      if (f > el && inland < 12) { y = (el + Math.min(f - el, 4)) * VEX + 0.015; _c.copy(cFlood); }
      else { y = el * VEX - 0.05; _c.copy(cFlood); }
    }
    p[j * 3 + 1] = y;
    col[j * 3] = _c.r; col[j * 3 + 1] = _c.g; col[j * 3 + 2] = _c.b;
  }
  waterGeo.attributes.position.needsUpdate = true;
  waterGeo.attributes.color.needsUpdate = true;
  if (sim.frame % 2 === 0) waterGeo.computeVertexNormals();
  // Evler ve kişiler
  houses.forEach((hs, j) => houseMesh.setColorAt(j, _c.setHex(hs.flooded ? 0xf87171 : 0xf8fafc)));
  houses.forEach((hs, j) => roofMesh.setColorAt(j, _c.setHex(hs.flooded ? 0x7f1d1d : 0xc2410c)));
  houseMesh.instanceColor.needsUpdate = roofMesh.instanceColor.needsUpdate = true;
  people.forEach((pp, j) => {
    const y = Math.max(-depthAt(pp.x, pp.z), 0) * VEX + 0.05;
    _m.makeTranslation(X(pp.x), y, Z(pp.z));
    personMesh.setMatrixAt(j, _m);
    personMesh.setColorAt(j, _c.setHex(pp.state === 2 ? 0x22c55e : pp.state === 3 ? 0xef4444 : pp.state === 1 ? 0xfacc15 : 0xffffff));
  });
  personMesh.instanceMatrix.needsUpdate = true;
  personMesh.instanceColor.needsUpdate = true;
  bwGroup.visible = breakwater.value;
  seawall.visible = wall.value;
  gaugeM.g.position.y = Math.max(0, eta[GAUGE.k * NX + GAUGE.i]) * exag.value * 0.06;
});

// Denize tıkla → ölçüm noktası
sim.onClick([water], (hit) => {
  const i = clamp(Math.floor((hit.point.x / S + LX / 2) / 2.5), 0, NX - 1);
  const k = clamp(Math.floor((hit.point.z / S + LZ / 2) / 2.5), 0, NZ - 1);
  if (!wet[k * NX + i]) { sim.toast('Burası kara; ölçüm noktası denizde olmalı.', 'warn'); return; }
  probe.g.position.set(X(cx(i)), 0, Z(cz(k)));
  probeAt = { i, k };
  updateStats(true);
});
let probeAt = { i: 60, k: 30 };

// --- Panel ---
const ui = sim.ui;
ui.section('Kaynak (deniz altı depremi)');
const PRESETS = { 7.5: [80, 1], 8: [150, 2], 8.5: [240, 3.2] };
ui.segmented({ label: 'Hazır ayar', options: [{ value: '7.5', label: 'Mw ≈ 7,5' }, { value: '8', label: 'Mw ≈ 8,0' }, { value: '8.5', label: 'Mw ≈ 8,5' }], value: '8',
  onChange: (v) => { const [L, Up] = PRESETS[v]; lenS.set(L); upS.set(Up); initial(); } });
const lenS = ui.slider({ label: 'Fay uzunluğu', min: 40, max: 240, step: 10, value: 150, unit: 'km', onChange: () => initial() });
const upS = ui.slider({ label: 'Taban yükselmesi', min: 0.5, max: 10, step: 0.1, value: 2, unit: 'm', onChange: () => initial() });
const distS = ui.slider({ label: 'Kaynağın kıyıya uzaklığı', min: 60, max: 280, step: 10, value: 220, unit: 'km', onChange: () => initial() });
const stMw = ui.stat({ label: 'Tahmini büyüklük' });
const stSrcD = ui.stat({ label: 'Kaynakta deniz derinliği', unit: 'm' });
ui.button({ label: '🌊 Depremi yeniden başlat', variant: 'primary', onClick: () => sim.reset() });

ui.section('Önlemler');
const siren = ui.toggle({ label: 'Erken uyarı sireni (8. dakikada)', value: true });
const breakwater = ui.toggle({ label: 'Dalgakıran (körfez ağzında)', value: false, onChange: () => buildFaces() });
const wall = ui.toggle({ label: 'Kıyı duvarı (6 m)', value: false });

ui.section('Sonuçlar');
const stArr = ui.stat({ label: 'Liman\'a varış', unit: 'dk' });
const stMax = ui.stat({ label: 'En yüksek dalga (mareograf)', unit: 'm' });
const stRun = ui.stat({ label: 'Kasabada su seviyesi (maks.)', unit: 'm' });
const stHouse = ui.stat({ label: 'Su basan ev' });
const stSafe = ui.stat({ label: 'Yüksek yerde' });
const stRisk = ui.stat({ label: 'Suya yakalanan' });
const chart = ui.chart({ title: 'Deniz seviyesi (m) — zamanla', series: [{ name: 'Mareograf (Liman)', color: '#facc15' }, { name: 'DART (açık deniz)', color: '#a78bfa' }], maxPoints: 240 });

ui.section('Ölçüm noktası (denize tıkla)');
const stDepth = ui.stat({ label: 'Derinlik', unit: 'm' });
const stC = ui.stat({ label: 'Dalga hızı √(g·h)', unit: 'm/sn' });
const stKmh = ui.stat({ label: 'Hız', unit: 'km/sa' });
const stTravel = ui.stat({ label: '100 km yol', unit: 'dk' });

ui.section('Görünüm');
const exag = ui.slider({ label: 'Dalga yüksekliği abartması', min: 1, max: 20, step: 1, value: 8, unit: '×' });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => document.querySelectorAll('.label-layer .lbl').forEach((e) => (e.style.display = v ? '' : 'none')) });
ui.buttons([
  { label: '🔭 Genel bakış', onClick: () => sim.moveCamera([-6, 21, 27], [5, -1.2, 0]) },
  { label: '🏘️ Kasabaya yakınlaş', onClick: () => sim.moveCamera([X(xc(125) - 30), 3.2, Z(160)], [X(xc(125) + 2), 0, Z(125)]) },
]);
ui.text('🧭 <b>Deniz çekilirse ya da güçlü bir deprem hissedersen</b>, uyarıyı bekleme: hemen kıyıdan uzaklaş, yüksek yere çık.', 'bad');

function updateStats(force = false) {
  const s = st.source;
  stMw.set(`Mw ${fmt(s.Mw, 1)}`);
  stSrcD.set(fmt(s.depth, 0));
  stArr.set(st.arrival == null ? '—' : fmt(st.arrival, 0), st.arrival == null ? '' : 'warn');
  if (st.arrival != null) stArr.el.title = st.firstSign < 0 ? 'İlk hareket: çekilme' : 'İlk hareket: yükselme';
  stMax.set(fmt(st.maxGauge, 1), st.maxGauge > 3 ? 'bad' : st.maxGauge > 1 ? 'warn' : '');
  stRun.set(fmt(st.runup, 1), st.runup > 2 ? 'bad' : '');
  stHouse.set(`${st.flooded}/${houses.length}`, st.flooded ? 'bad' : 'good');
  const safe = people.filter((p) => p.state === 2).length, caught = people.filter((p) => p.state === 3).length;
  stSafe.set(`${safe}/${PEOPLE}`, safe === PEOPLE ? 'good' : '');
  stRisk.set(caught, caught ? 'bad' : 'good');
  const d = h[probeAt.k * NX + probeAt.i], c = Math.sqrt(G * d);
  stDepth.set(fmt(d, 0)); stC.set(fmt(c, 0)); stKmh.set(fmt(c * 3.6, 0)); stTravel.set(fmt(100000 / c / 60, 0));
  probeLabel.setText(`${fmt(d, 0)} m · ${fmt(c, 0)} m/sn`);
  if (!force) chart.push([eta[GAUGE.k * NX + GAUGE.i], eta[DART.k * NX + DART.i]]);
}

sim.formatTime = (t) => `${fmt(st.T / 60, 0)}. dakika`;
sim.onReset(() => initial());
initial();
