// Kuantum Çift Yarık — tek tek parçacıklar, Huygens–Fresnel ile hesaplanan |ψ|² dağılımından örneklenir.
import { createSim, THREE, clamp, mapRange, gauss, fmt } from '@core';

const NB = 100;            // histogram kutusu
const GRID = 600;          // olasılık tablosu çözünürlüğü
const GUN_X = -11, SCREEN_X = 10;
const SCR_W = 16, SCR_H = 9, SLIT_H = 5;

const sim = createSim({
  background: 0x05070f,
  camera: { position: [-12, 12, 19], target: [1.5, 0, -2], fov: 55 },
  controls: { minDistance: 8, maxDistance: 60 },
  lights: false,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Kaynak parçacıkları <b>tek tek</b> gönderir. Her biri ekranda <b>tek bir noktaya</b> çarpar — bu yönüyle parçacık gibidir.
    Ama hangi noktaya düşeceği önceden belli değildir: yalnızca olasılığı bellidir ve bu olasılık <b>|ψ|²</b>, iki yarıktan
    gelen dalgaların toplamıyla hesaplanır. Binlerce nokta birikince ortaya <b>girişim çizgileri</b> çıkar — bu yönüyle dalga gibidir.</p>
    <p>Uzak alanda desen: <b>I(θ) ∝ cos²(π·d·sinθ/λ) · [sin(β)/β]²</b>, β = π·a·sinθ/λ. Saçak aralığı ≈ <b>λ·L/d</b>,
    tek yarık zarfının ilk sıfırı ≈ <b>λ·L/a</b>. Simülasyon bu formülün de kaynağı olan Huygens–Fresnel toplamını
    sayısal olarak çözer; ekran yakınken (küçük L) de doğru sonuç verir.</p>
    <h3>Dene</h3>
    <ul>
      <li>Atış hızını düşük tut: ilk yüz nokta rastgele görünür, desen ancak istatistikle belirir.</li>
      <li>Dalga boyunu artır → çizgiler açılır. Yarık aralığını artır → çizgiler sıklaşır. Yarık genişliğini artır → zarf daralır.</li>
      <li><b>Dedektör (hangi yol?)</b> aç: her parçacığın hangi yarıktan geçtiği kaydedilir, girişim terimi kaybolur,
      geriye iki tek-yarık deseninin toplamı kalır. "Yakın alan" hazır ayarında bu toplam iki ayrı bant olarak görünür.</li>
      <li>Tek yarığa geç: çizgiler kaybolur, yalnızca geniş kırınım tepesi kalır.</li>
    </ul>
    <h3>Gizem yok, fizik var</h3>
    <p>"Gözlem" bir insanın bakması demek değildir: parçacığın yolunu kalıcı olarak kaydeden <b>her fiziksel etkileşim</b>
    (dedektör, bir foton saçılması, çevre) iki yolu birbirinden ayırt edilebilir kılar ve girişimi siler (dekoherans).
    Elektronlarla bu deney gerçekten yapılmıştır (Jönsson 1961, Tonomura 1989, Bach 2013).</p>
    <p><small>Elektron modunda aynı desen için uzunluklar 1000 kat küçüktür (λ pikometre, yarıklar mikrometre).
    3B sahnedeki yarık boyutları ve dalga görünümü ölçekli değildir; ekrandaki nokta dağılımı gerçek hesaptır.</small></p>`,
});

// --- Durum ---
const P = { type: 'foton', slits: 2, det: false, lam: 550, d: 0.15, a: 0.04, L: 1, rate: 1.6, wave: true };
let W = 0.02;               // ekran yarı genişliği (m)
let cdfBoth, cdf1, cdf2, pdf; // örnekleme tabloları
let hits = 0;
const bins = new Float64Array(NB);
const theoryBins = new Float64Array(NB);

// --- Fizik: Huygens–Fresnel toplamı ---
function computePattern() {
  const lam = P.lam * 1e-9, d = P.d * 1e-3, a = P.a * 1e-3, L = P.L;
  const k = (2 * Math.PI) / lam;
  W = clamp(1.15 * (d / 2 + a / 2) + 2.6 * (lam * L) / a, 2e-4, 0.5);
  const centers = P.slits === 2 ? [-d / 2, d / 2] : [d / 2];
  const I = centers.map(() => new Float64Array(GRID));
  const re = centers.map(() => new Float64Array(GRID));
  const im = centers.map(() => new Float64Array(GRID));
  const reach = W + d / 2 + a;
  const N = clamp(Math.ceil((k * a * reach) / L / 0.4), 16, 900);
  const dx = a / N;
  for (let g = 0; g < GRID; g++) {
    const z = -W + (2 * W * (g + 0.5)) / GRID;
    centers.forEach((c, j) => {
      let sr = 0, si = 0;
      for (let n = 0; n < N; n++) {
        const x = c - a / 2 + (n + 0.5) * dx;
        const D2 = (z - x) * (z - x);
        const r = Math.sqrt(L * L + D2);
        const ph = k * (D2 / (r + L)); // k·(r − L), sayısal olarak kararlı
        const amp = 1 / Math.sqrt(r);
        sr += Math.cos(ph) * amp;
        si += Math.sin(ph) * amp;
      }
      re[j][g] = sr * dx; im[j][g] = si * dx;
      I[j][g] = re[j][g] ** 2 + im[j][g] ** 2;
    });
  }
  const both = new Float64Array(GRID);
  for (let g = 0; g < GRID; g++) {
    if (centers.length === 2 && !P.det) both[g] = (re[0][g] + re[1][g]) ** 2 + (im[0][g] + im[1][g]) ** 2;
    else both[g] = I.reduce((s, arr) => s + arr[g], 0);
  }
  pdf = both;
  cdfBoth = toCdf(both);
  cdf1 = toCdf(I[0]);
  cdf2 = I[1] ? toCdf(I[1]) : null;
  // Kuram histogramı (kutu olasılıkları)
  theoryBins.fill(0);
  const tot = both.reduce((s, v) => s + v, 0) || 1;
  for (let g = 0; g < GRID; g++) theoryBins[Math.floor((g * NB) / GRID)] += both[g] / tot;
}
function toCdf(arr) {
  const c = new Float64Array(arr.length);
  let s = 0;
  for (let i = 0; i < arr.length; i++) { s += arr[i]; c[i] = s; }
  for (let i = 0; i < arr.length; i++) c[i] /= s || 1;
  return c;
}
function sample(cdf) {
  const u = Math.random();
  let lo = 0, hi = cdf.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; }
  return (lo + Math.random()) / cdf.length; // 0..1 ekran boyunca
}

// --- Renk ---
function wavelengthColor(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = (440 - nm) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; } else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; } else r = 1;
  const f = nm < 420 ? 0.4 + (0.6 * (nm - 380)) / 40 : nm > 700 ? 0.4 + (0.6 * (750 - nm)) / 50 : 1;
  return new THREE.Color(Math.min(1, r * f + 0.08), Math.min(1, g * f + 0.08), Math.min(1, b * f + 0.08));
}
const partColor = new THREE.Color();
function updateColor() {
  partColor.copy(P.type === 'foton' ? wavelengthColor(P.lam) : new THREE.Color(0x7dd3fc));
}

// --- Sahne ---
sim.scene.add(new THREE.AmbientLight(0x8090b0, 0.9));
const dl = new THREE.DirectionalLight(0xffffff, 1.6);
dl.position.set(-6, 12, 10);
sim.scene.add(dl);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: 0x0c1222, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -4.6;
sim.scene.add(floor);
const grid = new THREE.GridHelper(40, 40, 0x1e293b, 0x141c2e);
grid.position.y = -4.59;
sim.scene.add(grid);

// Kaynak (tabanca)
const gun = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 3, 32), new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.35 }));
  body.rotation.z = Math.PI / 2;
  gun.add(body);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3.6, 1.2), new THREE.MeshStandardMaterial({ color: 0x334155 }));
  stand.position.set(0, -2.8, 0);
  gun.add(stand);
  gun.position.set(GUN_X - 1.4, 0, 0);
  sim.scene.add(gun);
}
const nozzleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const nozzle = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 12, 32), nozzleMat);
nozzle.rotation.y = Math.PI / 2;
nozzle.position.set(GUN_X + 0.15, 0, 0);
sim.scene.add(nozzle);
sim.label('Kaynak', { position: [GUN_X - 1.4, 1.8, 0], className: 'plain' });

// Engel ve yarıklar (parametre değişince yeniden kurulur)
const barrier = new THREE.Group();
sim.scene.add(barrier);
const barrierMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.5, roughness: 0.45 });
const shutterMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 });
let slitZ = [], slitAv = 0.4;
const detLamps = [];
const detGroup = new THREE.Group();
sim.scene.add(detGroup);
function visualSlits() {
  const dv = mapRange(P.d, 0.05, 0.5, 1.0, 4.4);
  slitAv = mapRange(P.a, 0.01, 0.12, 0.18, 0.95);
  slitZ = [-dv / 2, dv / 2];
}
function buildBarrier() {
  barrier.children.slice().forEach((c) => { c.geometry.dispose(); barrier.remove(c); });
  visualSlits();
  const T = 0.3, HALF = 4.6, H = 7;
  const add = (z0, z1, y0, y1, mat = barrierMat, x = 0) => {
    if (z1 - z0 < 0.01) return;
    const m = new THREE.Mesh(new THREE.BoxGeometry(T, y1 - y0, z1 - z0), mat);
    m.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
    barrier.add(m);
  };
  add(-HALF, HALF, SLIT_H / 2, H / 2);
  add(-HALF, HALF, -H / 2, -SLIT_H / 2);
  const [s1, s2] = slitZ, h = slitAv / 2;
  add(-HALF, s1 - h, -SLIT_H / 2, SLIT_H / 2);
  add(s1 + h, s2 - h, -SLIT_H / 2, SLIT_H / 2);
  add(s2 + h, HALF, -SLIT_H / 2, SLIT_H / 2);
  if (P.slits === 1) {
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.12, SLIT_H + 0.4, slitAv + 0.5), shutterMat);
    sh.position.set(-0.25, 0, s1);
    barrier.add(sh);
  }
  // Dedektör halkaları
  detGroup.children.slice().forEach((c) => { c.geometry.dispose(); detGroup.remove(c); });
  detLamps.length = 0;
  (P.slits === 2 ? [0, 1] : [1]).forEach((i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(Math.max(0.5, slitAv * 0.9), 0.07, 8, 24), new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x3a2000 }));
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0.45, 0, slitZ[i]);
    detGroup.add(ring);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: 0x3a2a08 }));
    lamp.position.set(0.45, SLIT_H / 2 + 1.2, slitZ[i]);
    lamp.userData.flash = 0;
    detGroup.add(lamp);
    detLamps[i] = lamp;
  });
  detGroup.visible = P.det;
}
sim.label('Engel (yarıklar)', { position: [0, 4.1, 3.2], className: 'plain' });
const detLabel = sim.label('🔍 Dedektör', { position: [0.45, SLIT_H / 2 + 2, 0], className: 'plain' });

// Ekran (nokta birikimi tuval dokusunda)
const CW = 1024, CH = 576;
const scrCanvas = document.createElement('canvas');
scrCanvas.width = CW; scrCanvas.height = CH;
const sctx = scrCanvas.getContext('2d');
const scrTex = new THREE.CanvasTexture(scrCanvas);
scrTex.colorSpace = THREE.SRGBColorSpace;
const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCR_W, SCR_H), new THREE.MeshBasicMaterial({ map: scrTex }));
screen.rotation.y = -Math.PI / 2;
screen.position.set(SCREEN_X, 0, 0);
sim.scene.add(screen);
const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, SCR_H + 0.4, SCR_W + 0.4), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.4 }));
frame.position.set(SCREEN_X + 0.2, 0, 0);
sim.scene.add(frame);
sim.label('Ekran', { position: [SCREEN_X, -SCR_H / 2 - 0.5, 0], className: 'plain' });
const scaleL = sim.label('', { position: [SCREEN_X, -SCR_H / 2 - 0.5, -SCR_W / 2 + 0.8], className: 'plain' });
const scaleR = sim.label('', { position: [SCREEN_X, -SCR_H / 2 - 0.5, SCR_W / 2 - 0.8], className: 'plain' });
let texDirty = true;
function clearScreen() {
  sctx.globalCompositeOperation = 'source-over';
  sctx.fillStyle = '#070a12';
  sctx.fillRect(0, 0, CW, CH);
  sctx.strokeStyle = 'rgba(148,163,184,.12)';
  for (let i = 1; i < 8; i++) { sctx.beginPath(); sctx.moveTo((CW * i) / 8, 0); sctx.lineTo((CW * i) / 8, CH); sctx.stroke(); }
  texDirty = true;
}
let dotStyle = '';
function drawDot(u) {
  const x = u * CW;
  const y = CH / 2 - ((Math.random() * 2 - 1) * (SLIT_H / 2) + gauss(0, 0.12)) / (SCR_H / 2) * (CH / 2);
  sctx.fillStyle = dotStyle;
  sctx.fillRect(x - 2, y - 2, 4, 4);
  texDirty = true;
}

// Histogram çubukları (ekranın üstünde)
const barGeo = new THREE.BoxGeometry(0.12, 1, SCR_W / NB * 0.85);
barGeo.translate(0, 0.5, 0);
const bars = new THREE.InstancedMesh(barGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), NB);
bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
sim.scene.add(bars);
const theoryLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(NB * 3), 3)),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
theoryLine.frustumCulled = false;
sim.scene.add(theoryLine);
const BAR_Y = SCR_H / 2 + 0.35, BAR_H = 3.2;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
function updateBars() {
  const maxT = Math.max(...theoryBins) || 1;
  const maxH = Math.max(...bins);
  // Ölçek: kuramın tepe noktası sabit yükseklikte; histogram beklenen sayıya göre
  const scale = hits > 0 ? BAR_H / (maxT * hits) : 0;
  for (let i = 0; i < NB; i++) {
    const z = -SCR_W / 2 + (SCR_W * (i + 0.5)) / NB;
    const h = Math.max(0.001, Math.min(BAR_H * 1.4, bins[i] * scale));
    _p.set(SCREEN_X - 0.05, BAR_Y, z); _s.set(1, h, 1);
    bars.setMatrixAt(i, _m.compose(_p, _q, _s));
  }
  bars.instanceMatrix.needsUpdate = true;
  const arr = theoryLine.geometry.attributes.position.array;
  for (let i = 0; i < NB; i++) {
    arr[i * 3] = SCREEN_X - 0.15;
    arr[i * 3 + 1] = BAR_Y + (theoryBins[i] / maxT) * BAR_H;
    arr[i * 3 + 2] = -SCR_W / 2 + (SCR_W * (i + 0.5)) / NB;
  }
  theoryLine.geometry.attributes.position.needsUpdate = true;
  return maxH;
}
sim.label('Sayım histogramı · beyaz çizgi: |ψ|² kuramı', { position: [SCREEN_X, BAR_Y + BAR_H + 0.6, -3], className: 'plain' });

// Dalga görünümü (yatay kesit, gölgelendirici)
const waveMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uT: { value: 0 }, uK: { value: 8 }, uS: { value: new THREE.Vector2(-1, 1) }, uN: { value: 2 }, uDet: { value: 0 }, uC: { value: new THREE.Color() } },
  vertexShader: `varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    varying vec3 vP; uniform float uT, uK, uN, uDet; uniform vec2 uS; uniform vec3 uC;
    void main(){
      float v = 0.0;
      if (vP.x < -0.15) {
        float w = cos(uK * vP.x - uT);
        float beam = smoothstep(4.5, 2.8, abs(vP.z)) * smoothstep(${GUN_X.toFixed(1)}, ${(GUN_X + 1.5).toFixed(1)}, vP.x);
        v = w * w * beam * 0.3;
      } else if (vP.x > 0.15) {
        float r1 = length(vec2(vP.x, vP.z - uS.y));
        float w1 = cos(uK * r1 - uT) / sqrt(0.6 + r1 * 0.35);
        float w2 = 0.0;
        if (uN > 1.5) { float r2 = length(vec2(vP.x, vP.z - uS.x)); w2 = cos(uK * r2 - uT) / sqrt(0.6 + r2 * 0.35); }
        float coh = (w1 + w2) * (w1 + w2);
        float inc = w1 * w1 + w2 * w2;
        v = mix(coh, inc, uDet) * 0.55 * smoothstep(${SCREEN_X.toFixed(1)}, ${(SCREEN_X - 0.6).toFixed(1)}, vP.x);
      }
      gl_FragColor = vec4(uC * v, 1.0);
    }`,
});
const wavePlane = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_X - GUN_X, 16, 1, 1), waveMat);
wavePlane.rotation.x = -Math.PI / 2;
wavePlane.position.set((SCREEN_X + GUN_X) / 2, -0.02, 0);
sim.scene.add(wavePlane);

// Uçuştaki parçacıklar ve dalga halkaları
const POOL = 70;
const flights = [];
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const partPoints = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(POOL * 3), 3)),
  new THREE.PointsMaterial({ size: 0.9, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
partPoints.frustumCulled = false;
sim.scene.add(partPoints);
const ringGeo = new THREE.RingGeometry(0.985, 1, 48, 1, -Math.PI / 2, Math.PI);
const rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), POOL);
rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
rings.frustumCulled = false;
const ringQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
for (let i = 0; i < POOL; i++) rings.setColorAt(i, new THREE.Color(0));
sim.scene.add(rings);
const FLY1 = 0.55, FLY2 = 0.55; // kaynak→engel, engel→ekran süreleri (s)

function registerHit(u, slit) {
  hits++;
  bins[Math.min(NB - 1, Math.floor(u * NB))]++;
  drawDot(u);
  if (slit != null && detLamps[slit]) detLamps[slit].userData.flash = 1;
}
function fire() {
  // Hangi yarık? (dedektör varsa yol kaydedilir)
  let slit = null, u;
  if (P.det || P.slits === 1) {
    slit = P.slits === 1 ? 1 : (Math.random() < 0.5 ? 0 : 1);
    u = sample(slit === 0 || P.slits === 1 ? cdf1 : cdf2);
  } else u = sample(cdfBoth);
  if (flights.length < POOL) flights.push({ t: 0, u, slit, y: gauss(0, 0.5) });
  else registerHit(u, P.det ? slit : null);
}

let acc = 0, barTimer = 0;
sim.onUpdate((dt) => {
  const rate = Math.pow(10, P.rate);
  acc += rate * dt;
  let n = Math.min(Math.floor(acc), 5000);
  acc -= Math.floor(acc);
  while (n-- > 0) fire();
  for (let i = flights.length - 1; i >= 0; i--) {
    const f = flights[i];
    f.t += dt;
    if (f.t >= FLY1 + FLY2) {
      registerHit(f.u, P.det ? f.slit : null);
      flights.splice(i, 1);
    }
  }
  barTimer += dt;
});

const posArr = partPoints.geometry.attributes.position.array;
const ringCol = new THREE.Color();
sim.onRender((real) => {
  waveMat.uniforms.uT.value += real * 5;
  // Parçacık konumları
  let pi = 0, ri = 0;
  for (const f of flights) {
    const zHit = -SCR_W / 2 + f.u * SCR_W;
    if (f.t < FLY1) {
      const s = f.t / FLY1;
      posArr.set([GUN_X + (0 - GUN_X) * s, f.y * s * 0.5, 0], pi++ * 3);
    } else {
      const s = (f.t - FLY1) / FLY2;
      if (f.slit != null && (P.det || P.slits === 1)) {
        const z0 = slitZ[f.slit];
        posArr.set([SCREEN_X * s, f.y * 0.5, z0 + (zHit - z0) * s], pi++ * 3);
      } else {
        // Yol belirsiz: yalnızca yayılan dalga cephesi çizilir
        const r = 0.3 + s * SCREEN_X;
        _p.set(0.2, f.y * 0.5, 0); _s.set(r, r, r);
        rings.setMatrixAt(ri, _m.compose(_p, ringQ, _s));
        rings.setColorAt(ri, ringCol.copy(partColor).multiplyScalar(0.6 * (1 - s)));
        ri++;
      }
    }
  }
  for (let i = pi; i < POOL; i++) posArr.set([0, -999, 0], i * 3);
  partPoints.geometry.attributes.position.needsUpdate = true;
  partPoints.geometry.setDrawRange(0, pi);
  rings.count = ri;
  if (ri) { rings.instanceMatrix.needsUpdate = true; if (rings.instanceColor) rings.instanceColor.needsUpdate = true; }
  for (const l of detLamps) {
    if (!l) continue;
    l.userData.flash = Math.max(0, l.userData.flash - real * 4);
    l.material.color.setRGB(0.23 + l.userData.flash * 0.77, 0.16 + l.userData.flash * 0.7, 0.03 + l.userData.flash * 0.2);
  }
  if (texDirty) { scrTex.needsUpdate = true; texDirty = false; }
  if (barTimer > 0.15) { barTimer = 0; updateBars(); drawHist(); updateStats(); }
});

// --- Panel ---
const ui = sim.ui;
const lenU = () => (P.type === 'foton' ? { lam: 'nm', d: 'mm', scr: 'mm' } : { lam: 'pm', d: 'µm', scr: 'µm' });
ui.section('Deney');
const typeSeg = ui.segmented({ label: 'Parçacık', options: [{ value: 'foton', label: '💡 Foton' }, { value: 'elektron', label: '⚛️ Elektron' }], value: P.type,
  onChange: (v) => { P.type = v; refreshLabels(); rebuild(); } });
const slitSeg = ui.segmented({ label: 'Yarık', options: [{ value: 2, label: 'Çift yarık' }, { value: 1, label: 'Tek yarık' }], value: 2,
  onChange: (v) => { P.slits = v; rebuild(); } });
const detT = ui.toggle({ label: '🔍 Dedektör (hangi yol?)', value: false, onChange: (v) => { P.det = v; rebuild(); } });
ui.toggle({ label: '🌊 Dalga görünümü', value: true, onChange: (v) => { P.wave = v; wavePlane.visible = v; } });
const rateS = ui.slider({ label: 'Atış hızı', min: 0, max: 3.5, step: 0.05, value: P.rate,
  format: (v) => `${fmt(Math.pow(10, v), Math.pow(10, v) < 10 ? 1 : 0)} /s`, onChange: (v) => { P.rate = v; } });

ui.section('Geometri');
const lamS = ui.slider({ label: 'Dalga boyu λ', min: 380, max: 750, step: 5, value: P.lam, format: (v) => lamText(v),
  onInput: (v) => { P.lam = v; rebuild(); } });
const dS = ui.slider({ label: 'Yarık aralığı d', min: 0.05, max: 0.5, step: 0.01, value: P.d, format: (v) => `${fmt(v, 2)} ${lenU().d}`,
  onInput: (v) => { P.d = v; rebuild(); } });
const aS = ui.slider({ label: 'Yarık genişliği a', min: 0.01, max: 0.12, step: 0.005, value: P.a, format: (v) => `${fmt(v, 3)} ${lenU().d}`,
  onInput: (v) => { P.a = v; rebuild(); } });
const LS = ui.slider({ label: 'Ekran uzaklığı L', min: -1.7, max: 0.3, step: 0.05, value: 0, format: (v) => `${fmt(Math.pow(10, v), Math.pow(10, v) < 0.1 ? 3 : 2)} m`,
  onInput: (v) => { P.L = Math.pow(10, v); rebuild(); } });
ui.buttons([
  { label: 'Uzak alan', onClick: () => preset(550, 0.15, 0.04, 0) },
  { label: 'Yakın alan', onClick: () => { preset(550, 0.5, 0.1, -1.7); } },
  { label: '🧹 Ekranı temizle', onClick: () => clearAll() },
]);
function lamText(v) {
  if (P.type === 'foton') return `${fmt(v)} nm`;
  const eV = Math.pow(1226.4 / v, 2);
  return `${fmt(v)} pm · ≈${fmt(eV)} eV`;
}
function preset(lam, d, a, lg) {
  P.lam = lam; P.d = d; P.a = a; P.L = Math.pow(10, lg);
  lamS.set(lam); dS.set(d); aS.set(a); LS.set(lg);
  rebuild();
}
function refreshLabels() { lamS.set(P.lam); dS.set(P.d); aS.set(P.a); }

ui.section('Ölçüm');
const stN = ui.stat({ label: 'Parçacık' });
const stFr = ui.stat({ label: 'Saçak aralığı λL/d' });
const stEnv = ui.stat({ label: 'Merkez tepe (2λL/a)' });
const stF = ui.stat({ label: 'Fresnel sayısı a²/λL' });
const vis = ui.meter({ label: 'Desen görünürlüğü (kuram)', color: 'linear-gradient(90deg,#38bdf8,#a78bfa)' });
// Histogram + kuram eğrisi
const histWrap = document.createElement('div');
histWrap.className = 'chart';
histWrap.innerHTML = '<div class="chart-title">Ekran boyunca sayım (çubuk) ve |ψ|² (çizgi)</div>';
const hc = document.createElement('canvas');
histWrap.append(hc);
const lg = document.createElement('div');
lg.className = 'legend';
lg.innerHTML = '<span><i style="background:#38bdf8"></i>Ölçülen</span><span><i style="background:#f8fafc"></i>Kuram</span>';
histWrap.append(lg);
ui.append(histWrap);
const note = ui.text('', 'card');

function drawHist() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const Wc = hc.clientWidth || 260, Hc = 130;
  if (hc.width !== Wc * dpr) { hc.width = Wc * dpr; hc.height = Hc * dpr; hc.style.height = Hc + 'px'; }
  const c = hc.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, Wc, Hc);
  const maxT = Math.max(...theoryBins) || 1;
  const exp = maxT * Math.max(hits, 1);
  const top = Math.max(exp, Math.max(...bins)) * 1.08;
  const bw = Wc / NB;
  c.fillStyle = '#' + partColor.getHexString();
  c.globalAlpha = 0.85;
  for (let i = 0; i < NB; i++) { const h = (bins[i] / top) * (Hc - 16); c.fillRect(i * bw + 0.3, Hc - 14 - h, bw - 0.6, h); }
  c.globalAlpha = 1;
  c.strokeStyle = '#f8fafc'; c.lineWidth = 1.6; c.beginPath();
  for (let i = 0; i < NB; i++) { const y = Hc - 14 - ((theoryBins[i] * Math.max(hits, 1)) / top) * (Hc - 16); i ? c.lineTo((i + 0.5) * bw, y) : c.moveTo((i + 0.5) * bw, y); }
  c.stroke();
  c.fillStyle = 'rgba(148,163,184,.9)'; c.font = '10px system-ui'; c.textBaseline = 'bottom';
  const Ws = scrUnits(W);
  c.textAlign = 'left'; c.fillText(`−${Ws}`, 2, Hc);
  c.textAlign = 'center'; c.fillText('0', Wc / 2, Hc);
  c.textAlign = 'right'; c.fillText(`+${Ws}`, Wc - 2, Hc);
}
function scrUnits(m) { const v = m * 1000; return `${fmt(v, v < 1 ? 2 : v < 10 ? 1 : 0)} ${lenU().scr}`; }

function theoryVisibility() {
  // Merkez yakınındaki saçakların kuramsal görünürlüğü
  let mx = 0, mn = Infinity;
  const c = GRID / 2, span = Math.max(4, Math.round(GRID * ((P.lam * 1e-9 * P.L) / (P.d * 1e-3)) / (2 * W) * 1.2));
  for (let g = Math.max(0, c - span); g < Math.min(GRID, c + span); g++) { mx = Math.max(mx, pdf[g]); mn = Math.min(mn, pdf[g]); }
  return mx > 0 ? (mx - mn) / (mx + mn) : 0;
}
function updateStats() {
  stN.set(hits);
  const lam = P.lam * 1e-9, L = P.L;
  stFr.set(P.slits === 2 ? scrUnits((lam * L) / (P.d * 1e-3)) : '—');
  stEnv.set(scrUnits((2 * lam * L) / (P.a * 1e-3)));
  const F = (P.a * 1e-3) ** 2 / (lam * L);
  stF.set(fmt(F, F < 1 ? 2 : 1), F < 0.3 ? 'good' : F < 1.5 ? 'warn' : 'bad');
}

function rebuild() {
  computePattern();
  buildBarrier();
  updateColor();
  nozzleMat.color.copy(partColor);
  waveMat.uniforms.uC.value.copy(partColor);
  waveMat.uniforms.uK.value = (2 * Math.PI) / mapRange(P.lam, 380, 750, 0.5, 1.0);
  waveMat.uniforms.uS.value.set(slitZ[0], slitZ[1]);
  waveMat.uniforms.uN.value = P.slits;
  waveMat.uniforms.uDet.value = P.det ? 1 : 0;
  bars.material.color.copy(partColor);
  dotStyle = `rgba(${Math.round(partColor.r * 255)},${Math.round(partColor.g * 255)},${Math.round(partColor.b * 255)},0.85)`;
  detLabel.visible = P.det;
  detLabel.position.z = P.slits === 2 ? 0 : slitZ[1];
  scaleL.setText(`−${scrUnits(W)}`);
  scaleR.setText(`+${scrUnits(W)}`);
  clearAll();
  const v = P.slits === 2 ? theoryVisibility() : 0;
  vis.set(v, `${fmt(v * 100)}%`);
  const F = (P.a * 1e-3) ** 2 / (P.lam * 1e-9 * P.L);
  note.set(P.det && P.slits === 2
    ? `🔍 Yol bilgisi kaydediliyor: girişim terimi yok, desen = iki tek-yarık deseninin <b>toplamı</b>.${F > 1 ? ' Yakın alanda iki ayrı bant görünür.' : ' Uzak alanda iki tepe üst üste biner: tek geniş tepe.'}`
    : P.slits === 1 ? 'Tek yarık: yalnızca kırınım zarfı — saçak yok.'
      : `Yol bilgisi yok: iki yolun genlikleri <b>toplanır</b>, sonra karesi alınır → girişim saçakları.${F > 1.5 ? ' <br><small>Fresnel sayısı büyük: yakın alan, desen Fraunhofer formülünden sapar.</small>' : ''}`);
}
function clearAll() {
  hits = 0; bins.fill(0); flights.length = 0; acc = 0;
  clearScreen();
  updateBars(); drawHist(); updateStats();
}

sim.formatTime = () => `${fmt(hits)} parçacık`;
sim.onReset(() => {
  P.type = 'foton'; P.det = false; P.slits = 2; detT.set(false); typeSeg.set('foton'); slitSeg.set(2);
  rateS.set(1.6); P.rate = 1.6;
  preset(550, 0.15, 0.04, 0);
});
rebuild();
