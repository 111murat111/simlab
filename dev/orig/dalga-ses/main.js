// Dalga ve Ses — dalga havuzunda girişim, hareketli kaynakta Doppler/Mach konisi, telde ve boruda rezonans (duran dalga).
import { createSim, THREE, fmt, clamp, smoothstep, instanced, heatColor, TAU } from '@core';

const TW = 24, TD = 18, SX = 144, SZ = 108;   // havuz boyutu ve ızgara
const C = 4;                                   // havuzdaki dalga hızı (birim/s)
const ZS = -5;                                 // girişim kaynaklarının z konumu
const Q = 25;                                  // rezonans keskinliği (kalite çarpanı)
const MODES = 12;
const MU = 0.001;                              // tel: 1 g/m
const VOL = 0.05;

const sim = createSim({
  background: 0x081018,
  camera: { position: [0, 22, 21], target: [0, -1, 1], fov: 50 },
  controls: { minDistance: 6, maxDistance: 60 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p><b>Girişim:</b> İki nokta kaynak aynı frekansta su yüzeyine vuruyor. Dalgaların tepe ile tepe buluştuğu yerde yapıcı
    girişim (büyük dalga), tepe ile çukur buluştuğu yerde yıkıcı girişim olur. Yıkıcı noktalar <b>düğüm çizgileri</b>
    denen hiperboller oluşturur: yol farkı |r₁ − r₂| = (m + ½)·λ.</p>
    <p><b>Doppler:</b> Kaynak hareket ettikçe öndeki dalga tepeleri sıkışır, arkadakiler seyrekleşir:
    f<sub>ön</sub> = f·c/(c − v), f<sub>arka</sub> = f·c/(c + v). Kaynak dalgadan hızlı giderse (v ≥ c) tepeler üst üste
    binip bir <b>Mach konisi</b> (şok dalgası) oluşturur: sin θ = c/v.</p>
    <p><b>Rezonans:</b> Titreştirici bir teli ya da borudaki havayı sürer. Sürücü frekansı doğal frekanslardan birine
    (harmonik) eşit olunca genlik büyür ve <b>duran dalga</b> oluşur. Tel ve açık boru: fₙ = n·v/(2L); bir ucu kapalı boru:
    yalnız tek harmonikler, fₙ = (2n−1)·v/(4L). Telde dalga hızı v = √(T/μ), havada v ≈ 331 + 0,6·t(°C) m/s.</p>
    <h3>Dene</h3>
    <ul>
      <li>Kaynak aralığını artır: düğüm çizgisi sayısı artar. Frekansı artır (λ küçülür): yine artar.</li>
      <li>Faz farkını 180° yap: ortadaki çizgi yapıcıdan yıkıcıya döner.</li>
      <li>Suya tıklayıp gözlem noktasını bir düğüm çizgisine koy ve "Sesi dinle"yi aç: ses neredeyse kaybolur.</li>
      <li>Doppler'de hızı 1,0 c'nin üstüne çıkar: Mach konisini gör. Konik açı hız arttıkça daralır.</li>
      <li>Rezonansta sürücüyü yavaşça kaydır: yalnız harmoniklerde tel büyük genlikle titreşir.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Gürültü önleyici kulaklıklar yıkıcı girişim kullanır. Ambulans sireninin geçerken incelip kalınlaşması Doppler
    etkisidir; radar hız ölçerler ve tıptaki Doppler ultrason da buna dayanır. Ses hızını aşan uçakların "ses patlaması"
    Mach konisidir. Gitar, keman ve flüt; tel ve hava sütunlarındaki duran dalgalarla ses üretir.</p>
    <p><small>Havuzdaki dalgalar gözle izlenebilsin diye yavaşlatılmıştır; birimler ölçeklidir. Tel ve boru titreşimi de
    yavaş çekimde gösterilir, frekanslar ise gerçek değerlerdir.</small></p>`,
});
sim.formatTime = (t) => `${fmt(t, 1)} s`;

const st = {
  mode: 'girisim', n: 2, f: 1.2, d: 6, phase: 0, amp: 0.7, nodes: true,
  v: 0.6, medium: 'tel', L: 0.65, T: 80, temp: 20, r: 1,
  sound: false, probe: new THREE.Vector2(0, 4),
};
let t0 = 0;           // kaynakların başladığı an
let dirty = true;

// --- Havuz ---
const tank = new THREE.Group();
sim.scene.add(tank);
const geo = new THREE.PlaneGeometry(TW, TD, SX, SZ);
geo.rotateX(-Math.PI / 2);
const P = geo.attributes.position;
P.setUsage(THREE.DynamicDrawUsage);
const NV = P.count;
const VX = new Float32Array(NV), VZ = new Float32Array(NV);
for (let i = 0; i < NV; i++) { VX[i] = P.getX(i); VZ[i] = P.getZ(i); }
const colors = new Float32Array(NV * 3);
geo.setAttribute('color', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
const water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.08 }));
tank.add(water);
{
  const rimMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.7 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(TW + 1, 0.3, TD + 1), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 }));
  floor.position.y = -1.4;
  tank.add(floor);
  for (const [w, d, x, z] of [[TW + 1, 0.5, 0, TD / 2 + 0.25], [TW + 1, 0.5, 0, -TD / 2 - 0.25], [0.5, TD, TW / 2 + 0.25, 0], [0.5, TD, -TW / 2 - 0.25, 0]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, d), rimMat);
    r.position.set(x, -0.6, z);
    tank.add(r);
  }
}
// Kaynaklar (titreşen uçlar)
const srcMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x854d0e, emissiveIntensity: 0.6, metalness: 0.4, roughness: 0.4 });
const srcs = [0, 1].map(() => {
  const g = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3, 12), srcMat);
  rod.position.y = 1.5;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), srcMat);
  g.add(rod, tip);
  tank.add(g);
  return g;
});
const srcLabels = srcs.map((g, i) => sim.label(`K${i + 1}`, { parent: g, position: [0, 3.5, 0], className: 'plain' }));
// Gözlem noktası (şamandıra)
const buoy = new THREE.Group();
{
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 }));
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0xf8fafc }));
  s.position.y = 0.6;
  buoy.add(b, s);
}
tank.add(buoy);
const buoyLabel = sim.label('Gözlem noktası', { parent: buoy, position: [0, 1.6, 0], className: 'plain' });
// Mach konisi çizgileri
const machGeo = new THREE.BufferGeometry();
const machPos = new Float32Array(9);
machGeo.setAttribute('position', new THREE.BufferAttribute(machPos, 3).setUsage(THREE.DynamicDrawUsage));
const mach = new THREE.Line(machGeo, new THREE.LineBasicMaterial({ color: 0xf97316 }));
mach.frustumCulled = false;
tank.add(mach);
// Doppler gözlemcileri
const obsLabels = [-1, 1].map((s) => {
  const m = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.4, 12), new THREE.MeshStandardMaterial({ color: s > 0 ? 0x22c55e : 0x60a5fa }));
  m.position.set(s * (TW / 2 + 1.3), 0.7, 0);
  tank.add(m);
  const l = sim.label('', { parent: m, position: [0, 1.4, 0], className: 'plain' });
  return { m, l };
});

// --- Girişim: her köşe için karmaşık genlik önceden hesaplanır ---
const Z1r = new Float32Array(NV), Z1i = new Float32Array(NV), Z2r = new Float32Array(NV), Z2i = new Float32Array(NV);
const R1 = new Float32Array(NV), R2 = new Float32Array(NV), ENV = new Float32Array(NV);
const k = () => (TAU * st.f) / C;
const decay = (r) => 1 / Math.sqrt(1 + r / 2);
function srcPos(i) { return st.n === 1 ? 0 : (i ? 1 : -1) * st.d / 2; }
function precompute() {
  dirty = false;
  const kk = k(), ph2 = (st.phase * Math.PI) / 180;
  const x1 = srcPos(0), x2 = srcPos(1);
  for (let i = 0; i < NV; i++) {
    const r1 = Math.hypot(VX[i] - x1, VZ[i] - ZS), a1 = st.amp * decay(r1), p1 = kk * r1;
    Z1r[i] = a1 * Math.cos(p1); Z1i[i] = a1 * Math.sin(p1); R1[i] = r1;
    if (st.n === 2) {
      const r2 = Math.hypot(VX[i] - x2, VZ[i] - ZS), a2 = st.amp * decay(r2), p2 = kk * r2 - ph2;
      Z2r[i] = a2 * Math.cos(p2); Z2i[i] = a2 * Math.sin(p2); R2[i] = r2;
    } else { Z2r[i] = 0; Z2i[i] = 0; R2[i] = 0; }
    ENV[i] = Math.hypot(Z1r[i] + Z2r[i], Z1i[i] + Z2i[i]);
  }
}
function interfAt(x, z, t) {
  const kk = k(), w = TAU * st.f, ph2 = (st.phase * Math.PI) / 180, age = C * (t - t0);
  const r1 = Math.hypot(x - srcPos(0), z - ZS);
  let h = st.amp * decay(r1) * Math.sin(kk * r1 - w * t) * front(r1, age), zr = 0, zi = 0;
  zr += st.amp * decay(r1) * Math.cos(kk * r1); zi += st.amp * decay(r1) * Math.sin(kk * r1);
  if (st.n === 2) {
    const r2 = Math.hypot(x - srcPos(1), z - ZS);
    h += st.amp * decay(r2) * Math.sin(kk * r2 - ph2 - w * t) * front(r2, age);
    zr += st.amp * decay(r2) * Math.cos(kk * r2 - ph2); zi += st.amp * decay(r2) * Math.sin(kk * r2 - ph2);
  }
  probeEnv = Math.hypot(zr, zi);
  return h;
}
const front = (r, age) => clamp((age - r) / 1.5 + 0.5, 0, 1);
let probeEnv = 0;

// --- Doppler: gecikmeli zaman çözümü (sabit hızlı kaynak) ---
let srcX = 0, dopFobs = 0;
function dopplerAt(x, z, t) {
  const v = st.v * C, w = TAU * st.f, Dx = x - srcX, D2 = Dx * Dx + z * z, tmax = t - t0;
  const a = v * v - C * C, b = 2 * v * Dx;
  let h = 0, first = -1;
  if (Math.abs(a) < 1e-6) {
    if (b < 0) { const tau = -D2 / b; if (tau <= tmax) { h += decay(C * tau) * Math.sin(w * (t - tau)); first = tau; } }
  } else {
    const disc = b * b - 4 * a * D2;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      const ta = (-b - s) / (2 * a), tb = (-b + s) / (2 * a);
      if (ta >= 0 && ta <= tmax) { h += decay(C * ta) * Math.sin(w * (t - ta)) * smoothstep(0, 0.4, tmax - ta); first = ta; }
      if (a > 0 && tb >= 0 && tb <= tmax && tb !== ta) { h += decay(C * tb) * Math.sin(w * (t - tb)) * smoothstep(0, 0.4, tmax - tb); if (first < 0) first = tb; }
    }
  }
  if (first > 0) { // gözlemcideki frekans: f / (1 − (v/c)·cos θ)
    const cos = (Dx + v * first) / (C * first);
    dopFobs = st.f / Math.abs(1 - (v / C) * cos);
  } else dopFobs = 0;
  return h * st.amp;
}
function dopplerStart() { return st.v > 0.001 ? -TW / 2 + 2 : 0; }

// --- Havuz güncelleme ---
const cLow = new THREE.Color(0x041c36), cHigh = new THREE.Color(0x67d4f5), cNode = new THREE.Color(0x020617), tmpC = new THREE.Color();
function updateWater(t) {
  const arr = P.array, col = colors;
  const w = TAU * st.f, cw = Math.cos(w * t), sw = Math.sin(w * t), age = C * (t - t0);
  const HV = 0.6;
  const inter = st.mode === 'girisim';
  for (let i = 0; i < NV; i++) {
    let h;
    if (inter) {
      const m1 = front(R1[i], age), m2 = st.n === 2 ? front(R2[i], age) : 0;
      h = m1 * (Z1i[i] * cw - Z1r[i] * sw) + m2 * (Z2i[i] * cw - Z2r[i] * sw);
    } else h = dopplerAt(VX[i], VZ[i], t);
    arr[i * 3 + 1] = h * HV;
    const u = clamp(0.32 + h * 0.6, 0, 1);
    tmpC.copy(cLow).lerp(cHigh, u);
    if (inter && st.nodes) {
      const m = Math.min(front(R1[i], age), st.n === 2 ? front(R2[i], age) : 1);
      tmpC.lerp(cNode, (1 - smoothstep(0.02, 0.35, ENV[i] / Math.max(st.amp, 0.05))) * m * 0.9);
    }
    col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
  }
  P.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
  geo.computeVertexNormals();
}

// --- Rezonans: tel / boru ---
const res = new THREE.Group();
sim.scene.add(res);
const SL = 16, X0 = -SL / 2, NBEAD = 161;
const beadMesh = instanced(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.5, roughness: 0.3 }), NBEAD);
res.add(beadMesh);
const posts = [X0, X0 + SL].map((x) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 1.2), new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.8 }));
  m.position.set(x + (x < 0 ? -0.25 : 0.25), 0, 0);
  res.add(m);
  return m;
});
const driver = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 16), new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x713f12, metalness: 0.4 }));
res.add(driver);
const base = new THREE.Mesh(new THREE.BoxGeometry(SL + 3, 0.3, 4), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 }));
base.position.y = -2.2;
res.add(base);
// Boru
const PR = 1.5, PCOLS = 64, PRING = 14, NP = PCOLS * PRING;
const pipe = new THREE.Mesh(new THREE.CylinderGeometry(PR, PR, SL, 40, 1, true),
  new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false }));
pipe.rotation.z = Math.PI / 2;
res.add(pipe);
const cap = new THREE.Mesh(new THREE.CircleGeometry(PR, 32), new THREE.MeshStandardMaterial({ color: 0x64748b, side: THREE.DoubleSide }));
cap.rotation.y = Math.PI / 2;
cap.position.x = X0;
res.add(cap);
const air = instanced(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), NP);
air.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(NP * 3), 3).setUsage(THREE.DynamicDrawUsage);
res.add(air);
const AIRY = new Float32Array(NP), AIRZ = new Float32Array(NP);
for (let c = 0; c < PCOLS; c++) for (let j = 0; j < PRING; j++) {
  const i = c * PRING + j, a = (j / PRING) * TAU + c * 0.9, rr = PR * (0.25 + 0.6 * ((j * 7) % PRING) / PRING);
  AIRY[i] = Math.cos(a) * rr; AIRZ[i] = Math.sin(a) * rr;
}
// Zarf çizgileri ve düğüm işaretleri
const envGeo = new THREE.BufferGeometry();
const envPos = new Float32Array(NBEAD * 2 * 3);
envGeo.setAttribute('position', new THREE.BufferAttribute(envPos, 3).setUsage(THREE.DynamicDrawUsage));
const envLines = new THREE.LineSegments(envGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.22 }));
envLines.frustumCulled = false;
res.add(envLines);
const nodeMesh = instanced(new THREE.TorusGeometry(0.28, 0.06, 8, 20), new THREE.MeshBasicMaterial({ color: 0xef4444 }), 16);
res.add(nodeMesh);
const resLabel = sim.label('', { parent: res, position: [0, 3.4, 0], className: 'big' });

const isPipe = () => st.medium !== 'tel';
function waveSpeed() { return st.medium === 'tel' ? Math.sqrt(st.T / MU) : 331 + 0.6 * st.temp; }
function f1() { const v = waveSpeed(); return st.medium === 'kapali' ? v / (4 * st.L) : v / (2 * st.L); }
const modeMul = (m) => (st.medium === 'kapali' ? 2 * m - 1 : m);   // m = 1.. → fₘ / f₁
const rMax = () => (st.medium === 'kapali' ? 12.5 : 6.5);
function shape(m, u) { // u = x/L ∈ [0,1]
  if (st.medium === 'tel') return Math.sin(m * Math.PI * u);
  if (st.medium === 'acik') return Math.cos(m * Math.PI * u);
  return Math.sin(((2 * m - 1) * Math.PI * u) / 2);
}
function dshape(m, u) {
  if (st.medium === 'tel') return m * Math.PI * Math.cos(m * Math.PI * u);
  if (st.medium === 'acik') return -m * Math.PI * Math.sin(m * Math.PI * u);
  const q = ((2 * m - 1) * Math.PI) / 2;
  return q * Math.cos(q * u);
}
const AMP = new Float32Array(MODES + 1), DEL = new Float32Array(MODES + 1);
function respAt(r, out) {
  let s2 = 0;
  for (let m = 1; m <= MODES; m++) {
    const q = r / modeMul(m), A = 1 / (Q * Math.sqrt((1 - q * q) ** 2 + (q / Q) ** 2));
    if (out) { AMP[m] = A; DEL[m] = Math.atan2(q / Q, 1 - q * q); }
    s2 += A * A;
  }
  return Math.min(1.2, Math.sqrt(s2));
}
let dominant = 1;
function resUpdate(t) {
  respAt(st.r, true);
  dominant = 1;
  for (let m = 2; m <= MODES; m++) if (AMP[m] > AMP[dominant]) dominant = m;
  const wv = TAU * (0.6 + 0.25 * Math.sqrt(st.r));
  const pipeMode = isPipe();
  const Y = 1.8, S = 0.55, ps = 0.45 / (Math.PI * modeMul(dominant));
  if (!pipeMode) {
    const a = beadMesh.instanceMatrix.array;
    for (let i = 0; i < NBEAD; i++) {
      const u = i / (NBEAD - 1);
      let y = 0, e = 0;
      for (let m = 1; m <= MODES; m++) { const sh = shape(m, u); y += AMP[m] * sh * Math.cos(wv * t - DEL[m]); e += AMP[m] * Math.abs(sh); }
      mat(a, i * 16, X0 + u * SL, clamp(y, -1.3, 1.3) * Y, 0, 0.09);
      envPos[i * 6] = X0 + u * SL; envPos[i * 6 + 1] = Math.min(e, 1.3) * Y;
      envPos[i * 6 + 3] = X0 + u * SL; envPos[i * 6 + 4] = -Math.min(e, 1.3) * Y;
    }
    beadMesh.instanceMatrix.needsUpdate = true;
    driver.position.set(X0 + 0.6, -1.2 + 0.15 * Math.cos(wv * t), 0);
  } else {
    const a = air.instanceMatrix.array, col = air.instanceColor.array;
    for (let c = 0; c < PCOLS; c++) {
      const u = (c + 0.5) / PCOLS;
      let s = 0, p = 0;
      for (let m = 1; m <= MODES; m++) {
        const cc = AMP[m] * Math.cos(wv * t - DEL[m]);
        s += cc * shape(m, u); p -= cc * dshape(m, u);
      }
      const x = X0 + u * SL + clamp(s, -1.3, 1.3) * S;
      heatColor(clamp(0.5 + p * ps, 0, 1), tmpC);
      for (let j = 0; j < PRING; j++) {
        const i = c * PRING + j;
        mat(a, i * 16, x, AIRY[i], AIRZ[i], 0.1);
        col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
      }
    }
    air.instanceMatrix.needsUpdate = true;
    air.instanceColor.needsUpdate = true;
    for (let i = 0; i < NBEAD; i++) {
      const u = i / (NBEAD - 1);
      let e = 0;
      for (let m = 1; m <= MODES; m++) e += AMP[m] * Math.abs(shape(m, u));
      envPos[i * 6] = X0 + u * SL; envPos[i * 6 + 1] = -PR - 1.4 - Math.min(e, 1.3) * 0.8;
      envPos[i * 6 + 3] = X0 + u * SL; envPos[i * 6 + 4] = -PR - 1.4 + Math.min(e, 1.3) * 0.8;
    }
  }
  envGeo.attributes.position.needsUpdate = true;
  // Düğümler (baskın mod, rezonansa yakınsa)
  let nc = 0;
  if (AMP[dominant] > 0.35) {
    const na = nodeMesh.instanceMatrix.array, M = modeMul(dominant);
    for (let s = 0; s <= 2 * M && nc < 16; s++) {
      const u = st.medium === 'tel' ? s / dominant : st.medium === 'acik' ? (s + 0.5) / dominant : (2 * s) / (2 * dominant - 1);
      if (u < -1e-6 || u > 1 + 1e-6) continue;
      if (st.medium === 'tel' && s > dominant) break;
      mat(na, nc++ * 16, X0 + u * SL, pipeMode ? -PR - 1.4 : 0, 0, 1);
    }
  }
  nodeMesh.count = nc;
  nodeMesh.instanceMatrix.needsUpdate = true;
}
function mat(a, o, x, y, z, s) {
  a[o] = s; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = s; a[o + 11] = 0; a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}

// --- Ses (yalnız kullanıcı açınca) ---
const audio = { ctx: null, osc: null, gain: null };
function setSound(on) {
  st.sound = on;
  if (on && !audio.ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      audio.ctx = new AC();
      audio.osc = audio.ctx.createOscillator();
      audio.gain = audio.ctx.createGain();
      audio.gain.gain.value = 0;
      audio.osc.connect(audio.gain).connect(audio.ctx.destination);
      audio.osc.start();
    } catch {
      audio.ctx = null;
      sim.toast('Tarayıcın Web Audio desteklemiyor.', 'warn');
      return;
    }
  }
  if (audio.ctx) (on ? audio.ctx.resume() : audio.ctx.suspend()).catch(() => {});
}
function setTone(freq, level) {
  if (!st.sound || !audio.ctx) return;
  const t = audio.ctx.currentTime;
  audio.osc.frequency.setTargetAtTime(clamp(freq, 30, 5000), t, 0.03);
  audio.gain.gain.setTargetAtTime(sim.paused ? 0 : clamp(level, 0, 1) * VOL, t, 0.05);
}

// --- Döngü ---
let chartT = 0;
sim.onUpdate((dt, t) => {
  if (st.mode === 'doppler') {
    srcX = dopplerStart() + st.v * C * (t - t0);
    if (srcX > TW / 2 - 1.5) { t0 = t; srcX = dopplerStart(); }
  }
  chartT += dt;
  if (chartT >= 0.05 && st.mode !== 'rezonans') {
    chartT = 0;
    probeChart.push([probeHeight(t)]);
  }
});
function probeHeight(t) { return st.mode === 'girisim' ? interfAt(st.probe.x, st.probe.y, t) : dopplerAt(st.probe.x, st.probe.y, t); }

let uiT = 0;
sim.onRender((real) => {
  const t = sim.time;
  if (st.mode === 'rezonans') {
    resUpdate(t);
    setTone(st.r * f1(), respAt(st.r, false));
  } else {
    if (dirty) precompute();
    updateWater(t);
    const w = TAU * st.f, hv = 0.6;
    if (st.mode === 'girisim') {
      srcs.forEach((g, i) => { g.visible = i < st.n; g.position.set(srcPos(i), 0.2 + 0.25 * Math.sin(w * t), ZS); });
      mach.visible = false;
    } else {
      srcs[0].position.set(srcX, 0.2 + 0.25 * Math.sin(w * t), 0);
      srcs[1].visible = false;
      updateMach(t);
    }
    const h = probeHeight(t);
    buoy.position.set(st.probe.x, h * hv, st.probe.y);
    if (st.mode === 'girisim') setTone(110 * (st.f / 0.5), (probeEnv / Math.max(st.amp, 0.05)) * 0.8);
    else setTone(dopFobs > 0 ? 440 * (dopFobs / st.f) : 440, dopFobs > 0 ? 0.8 : 0);
  }
  uiT += real;
  if (uiT > 0.25) { uiT = 0; updateStats(); }
});

function updateMach() {
  const v = st.v;
  if (v < 1) { mach.visible = false; return; }
  mach.visible = true;
  const th = Math.asin(1 / v), tau0 = sim.time - t0;
  const len = Math.min((srcX + TW / 2) / Math.cos(th), TD / 2 / Math.sin(th), tau0 * C * Math.sqrt(v * v - 1));
  const ex = srcX - Math.cos(th) * len, ez = Math.sin(th) * len;
  machPos.set([ex, 0.9, ez, srcX, 0.9, 0, ex, 0.9, -ez]);
  machGeo.attributes.position.needsUpdate = true;
}

// --- Tıklama: gözlem noktası ---
sim.onClick([water], (hit) => {
  if (st.mode === 'rezonans') return;
  st.probe.set(clamp(hit.point.x, -TW / 2 + 0.5, TW / 2 - 0.5), clamp(hit.point.z, -TD / 2 + 0.5, TD / 2 - 0.5));
  probeChart.clear();
  sim.toast('Gözlem noktası taşındı', 'good');
});

// --- Panel ---
const ui = sim.ui;
ui.section('Mod');
const modeSeg = ui.segmented({
  options: [{ value: 'girisim', label: 'Girişim' }, { value: 'doppler', label: 'Doppler' }, { value: 'rezonans', label: 'Rezonans / duran dalga' }],
  value: st.mode, onChange: (v) => setMode(v),
});
const soundT = ui.toggle({ label: '🔊 Sesi dinle (düşük ses)', value: false, onChange: (v) => setSound(v) });

const secI = ui.section('Kaynaklar');
ui.segmented({ label: 'Kaynak sayısı', options: [{ value: 1, label: 'Tek kaynak' }, { value: 2, label: 'İki kaynak' }], value: 2,
  onChange: (v) => { st.n = v; dirty = true; } });
const sF = ui.slider({ label: 'Frekans', min: 0.4, max: 3, step: 0.05, value: st.f, unit: 'Hz', onChange: (v) => { st.f = v; sF2.set(v); dirty = true; } });
const sD = ui.slider({ label: 'Kaynak aralığı d', min: 0, max: 14, step: 0.25, value: st.d, unit: 'br', onChange: (v) => { st.d = v; dirty = true; } });
const sPh = ui.slider({ label: 'Faz farkı', min: 0, max: 360, step: 5, value: 0, unit: '°', onChange: (v) => { st.phase = v; dirty = true; } });
const sA = ui.slider({ label: 'Genlik', min: 0.1, max: 1, step: 0.05, value: st.amp, onChange: (v) => { st.amp = v; dirty = true; } });
ui.toggle({ label: 'Düğüm çizgilerini koyulaştır', value: true, onChange: (v) => { st.nodes = v; } });
ui.buttons([
  { label: 'Az çizgi', onClick: () => presetI(0.8, 4, 0) },
  { label: 'Çok çizgi', onClick: () => presetI(2, 10, 0) },
  { label: 'Zıt faz', onClick: () => presetI(1.2, 6, 180) },
]);
const stLam = ui.stat({ label: 'Dalga boyu λ', unit: 'br' });
const stDL = ui.stat({ label: 'd / λ' });
const stNodes = ui.stat({ label: 'Düğüm çizgisi' });
const stLocal = ui.stat({ label: 'Gözlemde genlik', unit: '%' });

const secD = ui.section('Doppler');
const sV = ui.slider({ label: 'Kaynak hızı v', min: 0, max: 1.8, step: 0.05, value: st.v, format: (v) => `${fmt(v, 2)} c`, onChange: (v) => { st.v = v; t0 = sim.time; } });
const sF2 = ui.slider({ label: 'Kaynak frekansı', min: 0.4, max: 3, step: 0.05, value: st.f, unit: 'Hz', onChange: (v) => { st.f = v; sF.set(v); dirty = true; } });
ui.buttons([
  { label: 'Duran', onClick: () => sV.set(0, true) },
  { label: 'Ambulans (0,3 c)', onClick: () => sV.set(0.3, true) },
  { label: 'Ses hızı (1 c)', onClick: () => sV.set(1, true) },
  { label: 'Süpersonik (1,6 c)', onClick: () => sV.set(1.6, true) },
]);
const stMach = ui.stat({ label: 'Mach sayısı' });
const stFront = ui.stat({ label: 'Öndeki gözlemci', unit: 'Hz' });
const stBack = ui.stat({ label: 'Arkadaki gözlemci', unit: 'Hz' });
const stAngle = ui.stat({ label: 'Mach açısı θ', unit: '°' });
const stObs = ui.stat({ label: 'Gözlem noktasında', unit: 'Hz' });

const secP = ui.section('Gözlem noktası');
ui.text('Suya tıklayarak kırmızı şamandırayı taşı.', '');
const probeChart = ui.chart({ title: 'Gözlem noktasında su yüksekliği', series: [{ name: 'yükseklik', color: '#38bdf8', fill: true }], maxPoints: 200, yMin: -1.6, yMax: 1.6 });

const secR = ui.section('Rezonans');
const medSeg = ui.segmented({ label: 'Ortam', options: [{ value: 'tel', label: 'Tel' }, { value: 'acik', label: 'Açık boru' }, { value: 'kapali', label: 'Bir ucu kapalı boru' }],
  value: st.medium, onChange: (v) => { st.medium = v; sR.input.max = rMax(); harm.set(1, true); layoutRes(); } });
const sL = ui.slider({ label: 'Uzunluk L', min: 0.3, max: 2, step: 0.05, value: st.L, unit: 'm', onChange: (v) => { st.L = v; drawRes(); } });
const sT = ui.slider({ label: 'Tel gerilimi T', min: 20, max: 200, step: 5, value: st.T, unit: 'N', onChange: (v) => { st.T = v; drawRes(); } });
const sTemp = ui.slider({ label: 'Hava sıcaklığı', min: 0, max: 40, step: 1, value: st.temp, unit: '°C', onChange: (v) => { st.temp = v; drawRes(); } });
const sR = ui.slider({ label: 'Sürücü frekansı', min: 0.2, max: 6.5, step: 0.01, value: st.r,
  format: (r) => `${fmt(r * f1(), 0)} Hz (${fmt(r, 2)}·f₁)`, onChange: (v) => { st.r = v; drawRes(); } });
const harm = ui.segmented({ label: 'Harmoniğe git', options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: n, label: `n=${n}` })), value: 1,
  onChange: (n) => { sR.set(modeMul(n), true); } });
const stF1 = ui.stat({ label: 'Temel frekans f₁', unit: 'Hz' });
const stFd = ui.stat({ label: 'Sürücü', unit: 'Hz' });
const stLn = ui.stat({ label: 'λ (baskın mod)', unit: 'm' });
const stV = ui.stat({ label: 'Dalga hızı v', unit: 'm/s' });
const resCv = (() => {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  wrap.innerHTML = '<div class="chart-title">Rezonans eğrisi: genlik – sürücü frekansı</div>';
  const cv = document.createElement('canvas');
  cv.style.width = '100%'; cv.style.height = '130px';
  wrap.append(cv);
  ui.append(wrap);
  return cv;
})();
const resText = ui.text('', 'card');

function drawRes() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = resCv.clientWidth || 280, H = 130;
  if (resCv.width !== Math.round(W * dpr)) { resCv.width = Math.round(W * dpr); resCv.height = Math.round(H * dpr); }
  const g = resCv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const pl = 8, pr = 8, pt = 8, pb = 18, iw = W - pl - pr, ih = H - pt - pb, rm = rMax();
  sR.set(st.r);
  const X = (r) => pl + (iw * r) / rm, Y = (a) => pt + ih * (1 - a / 1.25);
  g.strokeStyle = 'rgba(148,163,184,.2)'; g.beginPath(); g.moveTo(pl, Y(0)); g.lineTo(W - pr, Y(0)); g.stroke();
  g.strokeStyle = '#38bdf8'; g.lineWidth = 1.8; g.beginPath();
  for (let s = 0; s <= 400; s++) { const r = (rm * s) / 400, y = Y(respAt(Math.max(r, 0.001), false)); s ? g.lineTo(X(r), y) : g.moveTo(X(r), y); }
  g.stroke();
  g.fillStyle = 'rgba(148,163,184,.85)'; g.font = '10px system-ui'; g.textAlign = 'center'; g.textBaseline = 'top';
  for (let m = 1; m <= 6; m++) { const r = modeMul(m); if (r <= rm) g.fillText(`${fmt(r * f1(), 0)}`, X(r), H - pb + 4); }
  g.strokeStyle = '#facc15'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(st.r), pt); g.lineTo(X(st.r), Y(0)); g.stroke();
}

function presetI(f, d, ph) { sF.set(f, true); sD.set(d, true); sPh.set(ph, true); }

const nodeCount = () => {
  if (st.n === 1) return 0;
  const lam = C / st.f, off = st.phase / 360;
  let n = 0;
  for (let m = -60; m <= 60; m++) if (Math.abs((m + 0.5 + off) * lam) < st.d) n++;
  return n;
};

function updateStats() {
  if (st.mode === 'girisim') {
    const lam = C / st.f;
    stLam.set(fmt(lam, 2)); stDL.set(fmt(st.d / lam, 2)); stNodes.set(String(nodeCount()));
    stLocal.set(fmt((100 * probeEnv) / Math.max(st.amp * decay(Math.hypot(st.probe.x, st.probe.y - ZS)) * st.n, 1e-6), 0));
  } else if (st.mode === 'doppler') {
    const v = st.v;
    stMach.set(fmt(v, 2), v >= 1 ? 'bad' : v > 0.8 ? 'warn' : '');
    stFront.set(v < 1 ? fmt(st.f / (1 - v), 2) : 'şok');
    stBack.set(fmt(st.f / (1 + v), 2));
    stAngle.set(v >= 1 ? fmt((Math.asin(1 / v) * 180) / Math.PI, 0) : '—');
    stObs.set(dopFobs > 0 ? fmt(dopFobs, 2) : '—');
    obsLabels[1].l.setText(`Ön: ${v < 1 ? fmt(st.f / (1 - v), 2) + ' Hz' : 'şok dalgası'}`);
    obsLabels[0].l.setText(`Arka: ${fmt(st.f / (1 + v), 2)} Hz`);
    srcLabels[0].setText(v >= 1 ? `Mach ${fmt(v, 2)}` : `f = ${fmt(st.f, 2)} Hz`);
  } else {
    const F1 = f1(), v = waveSpeed(), fn = modeMul(dominant) * F1;
    stF1.set(fmt(F1, 1)); stFd.set(fmt(st.r * F1, 0)); stLn.set(fmt(v / fn, 3)); stV.set(fmt(v, 0));
    const A = respAt(st.r, false), on = AMP[dominant] > 0.7;
    const name = st.medium === 'tel' ? 'Tel' : st.medium === 'acik' ? 'Açık boru' : 'Kapalı boru';
    resLabel.setText(`${name} · L = ${fmt(st.L, 2)} m · ${on ? `${modeMul(dominant)}. harmonik (${fmt(fn, 0)} Hz)` : 'rezonans yok'}`);
    resText.set('<div>' + (on
      ? `✅ <b>Rezonans!</b> ${modeMul(dominant)}. harmonik: f = ${fmt(fn, 0)} Hz, λ = ${fmt(v / fn, 3)} m. Kırmızı halkalar ${isPipe() ? '<b>yer değiştirme düğümleri</b> (hava kıpırdamaz, basınç en çok değişir)' : '<b>düğüm</b> noktaları'}.`
      : `Genlik düşük (%${fmt(A * 100, 0)}). Sürücüyü bir harmoniğe (${fmt(F1, 0)} Hz'in ${st.medium === 'kapali' ? 'tek ' : ''}katları) yaklaştır.`) + '</div>');
  }
}

function layoutRes() {
  const pipeMode = isPipe();
  beadMesh.visible = !pipeMode; posts.forEach((p) => (p.visible = !pipeMode)); driver.visible = !pipeMode;
  pipe.visible = air.visible = pipeMode;
  cap.visible = st.medium === 'kapali';
  base.position.y = pipeMode ? -PR - 2.8 : -2.2;
  sT.el.style.display = pipeMode ? 'none' : '';
  sTemp.el.style.display = pipeMode ? '' : 'none';
  if (st.r > rMax()) sR.set(rMax(), true);
  drawRes();
}

const sections = { girisim: [secI, secP], doppler: [secD, secP], rezonans: [secR] };
function setMode(m) {
  st.mode = m;
  modeSeg.set(m);
  for (const s of [secI, secD, secP, secR]) s.parentElement.style.display = sections[m].includes(s) ? '' : 'none';
  tank.visible = m !== 'rezonans';
  res.visible = m === 'rezonans';
  obsLabels.forEach((o) => { o.m.visible = m === 'doppler'; o.l.visible = m === 'doppler'; });
  buoyLabel.visible = m !== 'rezonans';
  srcLabels[0].setText('K1');
  srcLabels[1].visible = m === 'girisim';
  srcs[1].visible = m === 'girisim' && st.n === 2;
  if (m === 'girisim') st.probe.set(st.d / 2 + 2, 4);
  else if (m === 'doppler') st.probe.set(6, 3);
  t0 = sim.time - (m === 'girisim' ? 2.5 : 0);
  srcX = dopplerStart();
  probeChart.clear();
  dirty = true;
  if (m === 'rezonans') { sim.moveCamera([0, 4, 19], [0, 0.3, 0]); layoutRes(); }
  else sim.moveCamera([0, 22, 21], [0, -1, 1]);
}

sim.onReset(() => { t0 = st.mode === 'girisim' ? -2.5 : 0; srcX = dopplerStart(); probeChart.clear(); });
setMode('girisim');
