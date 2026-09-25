// Ebru: Akışkan Sanatı — Stam "Stable Fluids" (adveksiyon, viskozite, basınç izdüşümü) + alan koruyan damla dönüşümü; kâğıda baskı.
import { createSim, THREE, RoundedBoxGeometry, fmt, clamp, lerp, rand } from '@core';

const NX = 128, NY = 96, SX = NX + 2, SY = NY + 2, SIZE = SX * SY;
const W = 8, H = 6, SURF_Y = 0.62;          // tekne iç ölçüsü (dünya birimi) ve su yüzeyi yüksekliği
const IX = (i, j) => i + SX * j;
const DT = 1 / 30, TOOL_SPEED = 45;          // hücre/sn
const WATER = [0.91, 0.88, 0.79];            // kitreli su (krem)
const PALETTE = {
  lacivert: [0x1d2f6f, 'Lacivert'], al: [0xb3261e, 'Al (kırmızı)'], sari: [0xe0a526, 'Hardal sarısı'], yesil: [0x2e7d4f, 'Yeşil'],
  turkuaz: [0x2aa3a8, 'Turkuaz'], beyaz: [0xf7f3ea, 'Beyaz'], siyah: [0x1f1f1f, 'Siyah'], gul: [0xd66a86, 'Gül pembesi'], toprak: [0x8a5a2b, 'Toprak'],
};

const sim = createSim({
  background: 0x151a24,
  camera: { position: [0, 9.2, 6.6], target: [0, 0.4, 0.2], fov: 45 },
  controls: { minDistance: 5, maxDistance: 22, maxPolarAngle: Math.PI * 0.42 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Bir <b>ebru teknesi</b>: içinde <b>kitre</b> (bir bitki zamkı) ile koyulaştırılmış su var. Boyalar suyun yüzeyinde yüzer;
    her yeni damla eskileri <b>dışarı iter</b> ama karışmaz. Tarak ve biz (sivri çubuk) sıvıyı sürükleyerek desen çizer.
    "Kâğıda bas" deyince kâğıt yüzeye yatırılır, boyayı alır ve kaldırılır — gerçek ebrudaki gibi desen bir kez basılır.</p>
    <h3>Nasıl kullanılır?</h3>
    <ul>
      <li><b>💧 Damla</b>: tekneye tıkla. <b>✨ Serpme</b>: fırçayla serper gibi çok sayıda küçük damla.</li>
      <li><b>✒️ Biz</b> ve <b>🪮 Tarak</b>: teknenin üzerinde sürükle (sürüklerken kamera dönmez). Tarak tüm tekne boyunca
      paralel dişlerle çeker.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li><b>Battal</b> hazır ayarı (serpilmiş zemin), sonra biz ile ileri-geri çizerek kendi <b>gelgit</b>ini yap.</li>
      <li>Kitreyi en aza indir: sıvı uzun süre akar, desen dağılır. En çoğa çıkar: hareket hemen söner, çizgiler keskin kalır.</li>
      <li>Aynı yere üst üste farklı renkte damlalar bırak: halkalar oluşur (her damla öncekileri alanını koruyarak halkaya çevirir).</li>
      <li>"Çiçekli (lale)" hazır ayarını izle, sonra kâğıda bas.</li>
    </ul>
    <h3>Akışkanlar dinamiği</h3>
    <p>Hareket, sıkıştırılamaz <b>Navier–Stokes</b> denklemleriyle hesaplanır (Jos Stam, "Stable Fluids", SIGGRAPH 1999):
    her adımda hız alanı <b>kendini taşır</b> (adveksiyon), <b>viskozite</b> ile yayılır ve <b>basınç izdüşümü</b> ile
    ıraksaması sıfırlanır (su sıkışmaz). Boya bu hız alanıyla taşınır. Kitre viskoziteyi artırır: <b>Reynolds sayısı</b>
    düşer, akış ağdalı ve düzenli olur, desen bozulmadan kalır. Damla bırakma, alan koruyan
    <b>p' = c + (p − c)·√(1 + r²/|p − c|²)</b> dönüşümüyle yapılır (Lu, Jaffer ve ark., "Mathematical Marbling", 2012).</p>
    <h3>Gerçek ebru</h3>
    <p>Ebru, kitreyle koyulaştırılmış su üzerine boya serpip fırça, biz ve tarakla desen oluşturup kâğıda aktarma sanatıdır.
    Boyaya katılan <b>öd</b> (sığır ödü) boyanın suyun üstünde açılmasını sağlar. Osmanlı döneminde hattatlar tarafından
    geliştirilmiş, usta–çırak ilişkisiyle aktarılmıştır. "Geleneksel Türk Ebru Sanatı" 2014'te <b>UNESCO İnsanlığın Somut
    Olmayan Kültürel Mirası Temsili Listesi</b>'ne alınmıştır. Başlıca türler: battal, gelgit, taraklı, şal, bülbülyuvası,
    çiçekli (lale, gelincik, papatya…; çiçekli ebru Necmeddin Okyay ile anılır).</p>
    <p><small>Sınırlar: iki boyutlu, tek katmanlı yüzey akışı; boyalar arası yüzey gerilimi ve boya kalınlığı modellenmedi;
    ızgara 128 × 96 olduğundan ince çizgiler zamanla yumuşar. Kaynak: UNESCO ICH, "Ebru, Turkish art of marbling" (2014).</small></p>`,
});
sim.formatTime = () => `${drops} damla`;

// --- Akışkan alanları ---
let u = new Float32Array(SIZE), v = new Float32Array(SIZE), u0 = new Float32Array(SIZE), v0 = new Float32Array(SIZE);
let R = new Float32Array(SIZE), G = new Float32Array(SIZE), B = new Float32Array(SIZE);
let R0 = new Float32Array(SIZE), G0 = new Float32Array(SIZE), B0 = new Float32Array(SIZE);
const P = new Float32Array(SIZE), DIV = new Float32Array(SIZE);
let drops = 0, dirty = true, activeSteps = 0;

function setBnd(b, x) {
  for (let j = 1; j <= NY; j++) {
    x[IX(0, j)] = b === 1 ? -x[IX(1, j)] : x[IX(1, j)];
    x[IX(NX + 1, j)] = b === 1 ? -x[IX(NX, j)] : x[IX(NX, j)];
  }
  for (let i = 1; i <= NX; i++) {
    x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
    x[IX(i, NY + 1)] = b === 2 ? -x[IX(i, NY)] : x[IX(i, NY)];
  }
  x[IX(0, 0)] = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)]);
  x[IX(0, NY + 1)] = 0.5 * (x[IX(1, NY + 1)] + x[IX(0, NY)]);
  x[IX(NX + 1, 0)] = 0.5 * (x[IX(NX, 0)] + x[IX(NX + 1, 1)]);
  x[IX(NX + 1, NY + 1)] = 0.5 * (x[IX(NX, NY + 1)] + x[IX(NX + 1, NY)]);
}
function linSolve(b, x, x0, a, c, iters) {
  const ic = 1 / c;
  for (let k = 0; k < iters; k++) {
    for (let j = 1; j <= NY; j++) {
      let id = IX(1, j);
      for (let i = 1; i <= NX; i++, id++) x[id] = (x0[id] + a * (x[id - 1] + x[id + 1] + x[id - SX] + x[id + SX])) * ic;
    }
    setBnd(b, x);
  }
}
function diffuse(b, x, x0, visc) {
  const a = DT * visc;
  linSolve(b, x, x0, a, 1 + 4 * a, 8);
}
function advect(b, d, d0, uu, vv) {
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      const id = IX(i, j);
      let x = i - DT * uu[id], y = j - DT * vv[id];
      x = clamp(x, 0.5, NX + 0.5); y = clamp(y, 0.5, NY + 0.5);
      const i0 = x | 0, j0 = y | 0, s1 = x - i0, t1 = y - j0, s0 = 1 - s1, t0 = 1 - t1;
      const a = IX(i0, j0);
      d[id] = s0 * (t0 * d0[a] + t1 * d0[a + SX]) + s1 * (t0 * d0[a + 1] + t1 * d0[a + 1 + SX]);
    }
  }
  setBnd(b, d);
}
// Boya için MacCormack adveksiyonu (sayısal bulanıklığı azaltır), yerel min/max ile sınırlanır
const FWD = new Float32Array(SIZE), BACK = new Float32Array(SIZE), MN = new Float32Array(SIZE), MX = new Float32Array(SIZE);
function advectMC(d, d0) {
  for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
    const id = IX(i, j);
    const x = clamp(i - DT * u[id], 0.5, NX + 0.5), y = clamp(j - DT * v[id], 0.5, NY + 0.5);
    const i0 = x | 0, j0 = y | 0, s1 = x - i0, t1 = y - j0, a = IX(i0, j0);
    const c0 = d0[a], c1 = d0[a + 1], c2 = d0[a + SX], c3 = d0[a + SX + 1];
    FWD[id] = (1 - s1) * ((1 - t1) * c0 + t1 * c2) + s1 * ((1 - t1) * c1 + t1 * c3);
    MN[id] = Math.min(c0, c1, c2, c3); MX[id] = Math.max(c0, c1, c2, c3);
  }
  setBnd(0, FWD);
  for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
    const id = IX(i, j);
    const x = clamp(i + DT * u[id], 0.5, NX + 0.5), y = clamp(j + DT * v[id], 0.5, NY + 0.5);
    const i0 = x | 0, j0 = y | 0, s1 = x - i0, t1 = y - j0, a = IX(i0, j0);
    BACK[id] = (1 - s1) * ((1 - t1) * FWD[a] + t1 * FWD[a + SX]) + s1 * ((1 - t1) * FWD[a + 1] + t1 * FWD[a + SX + 1]);
  }
  for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
    const id = IX(i, j);
    d[id] = clamp(FWD[id] + 0.5 * (d0[id] - BACK[id]), MN[id], MX[id]);
  }
  setBnd(0, d);
}
function project() {
  for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
    const id = IX(i, j);
    DIV[id] = -0.5 * (u[id + 1] - u[id - 1] + v[id + SX] - v[id - SX]);
    P[id] = 0;
  }
  setBnd(0, DIV); setBnd(0, P);
  linSolve(0, P, DIV, 1, 4, 18);
  for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
    const id = IX(i, j);
    u[id] -= 0.5 * (P[id + 1] - P[id - 1]);
    v[id] -= 0.5 * (P[id + SX] - P[id - SX]);
  }
  setBnd(1, u); setBnd(2, v);
}
const kitreVisc = () => lerp(0.3, 6, kitre.value / 100);
const kitreDamp = () => lerp(0.4, 5, kitre.value / 100);
let lastEnergy = 0;
function fluidStep() {
  // Viskozite
  [u, u0] = [u0, u]; [v, v0] = [v0, v];
  u.set(u0); v.set(v0);
  diffuse(1, u, u0, kitreVisc()); diffuse(2, v, v0, kitreVisc());
  project();
  // Adveksiyon
  [u, u0] = [u0, u]; [v, v0] = [v0, v];
  advect(1, u, u0, u0, v0); advect(2, v, v0, u0, v0);
  project();
  [R, R0] = [R0, R]; [G, G0] = [G0, G]; [B, B0] = [B0, B];
  advectMC(R, R0); advectMC(G, G0); advectMC(B, B0);
  // Kitre sönümü
  const f = Math.exp(-kitreDamp() * DT);
  let e = 0, mx = 0;
  for (let id = 0; id < SIZE; id++) {
    u[id] *= f; v[id] *= f;
    const s = u[id] * u[id] + v[id] * v[id];
    e += s; if (s > mx) mx = s;
  }
  lastEnergy = e / (NX * NY);
  maxSpeed = Math.sqrt(mx);
  dirty = true;
}
let maxSpeed = 0;

// Alan koruyan damla: dışarıdaki her nokta, (p − c)·√(1 − r²/d²) konumundan örneklenir.
// Keskin kenarlar için Catmull-Rom (komşu min/max ile sınırlı) örnekleme; çok küçük kaymalar atlanır.
function cr1(a, b, c, d, t) { return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a))); }
function sampleCubic(arr, x, y) {
  x = clamp(x, 1, NX); y = clamp(y, 1, NY);
  const i1 = Math.min(x | 0, NX - 1), j1 = Math.min(y | 0, NY - 1), tx = x - i1, ty = y - j1;
  const row = (j) => {
    const b = IX(0, clamp(j, 0, NY + 1));
    const g = (i) => arr[b + clamp(i, 0, NX + 1)];
    return cr1(g(i1 - 1), g(i1), g(i1 + 1), g(i1 + 2), tx);
  };
  const v0 = cr1(row(j1 - 1), row(j1), row(j1 + 1), row(j1 + 2), ty);
  const a = IX(i1, j1), c0 = arr[a], c1 = arr[a + 1], c2 = arr[a + SX], c3 = arr[a + SX + 1];
  return clamp(v0, Math.min(c0, c1, c2, c3), Math.max(c0, c1, c2, c3));
}
function drop(cx, cy, r, hex) {
  const cr = ((hex >> 16) & 255) / 255, cg = ((hex >> 8) & 255) / 255, cb = (hex & 255) / 255; // sRGB değerleri
  R0.set(R); G0.set(G); B0.set(B);
  const r2 = r * r;
  for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
    const id = IX(i, j), dx = i - cx, dy = j - cy, d2 = dx * dx + dy * dy;
    if (d2 <= r2) {
      const k = clamp(Math.sqrt(r2) - Math.sqrt(d2) + 0.5, 0, 1); // kenarı hafif yumuşat
      R[id] = lerp(R0[id], cr, k); G[id] = lerp(G0[id], cg, k); B[id] = lerp(B0[id], cb, k);
    } else {
      const d = Math.sqrt(d2), s = Math.sqrt(1 - r2 / d2);
      if (d * (1 - s) < 0.12) continue;
      const x = cx + dx * s, y = cy + dy * s;
      R[id] = sampleCubic(R0, x, y); G[id] = sampleCubic(G0, x, y); B[id] = sampleCubic(B0, x, y);
    }
  }
  setBnd(0, R); setBnd(0, G); setBnd(0, B);
  drops++;
  dirty = true;
}
function clearTray() {
  R.fill(WATER[0]); G.fill(WATER[1]); B.fill(WATER[2]);
  u.fill(0); v.fill(0);
  drops = 0; dirty = true;
}

// Araç kuvveti: araç ucu çevresindeki sıvıyı aracın hızına çeker (yapışma)
function pull(x, y, dx, dy, rad) {
  const r2 = rad * rad, i0 = Math.max(1, Math.floor(x - rad * 2)), i1 = Math.min(NX, Math.ceil(x + rad * 2));
  const j0 = Math.max(1, Math.floor(y - rad * 2)), j1 = Math.min(NY, Math.ceil(y + rad * 2));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d2 = (i - x) ** 2 + (j - y) ** 2;
    const w = Math.exp(-d2 / r2) * 0.9;
    const id = IX(i, j);
    u[id] += (dx * TOOL_SPEED - u[id]) * w;
    v[id] += (dy * TOOL_SPEED - v[id]) * w;
  }
}
function toolSegment(tool, a, b) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-3) return;
  const dx = (b.x - a.x) / len, dy = (b.y - a.y) / len;
  const n = Math.max(1, Math.ceil(len));
  for (let s = 1; s <= n; s++) {
    const x = a.x + (b.x - a.x) * (s / n), y = a.y + (b.y - a.y) * (s / n);
    if (tool === 'biz') pull(x, y, dx, dy, 1.6);
    else {
      const sp = combGap.value;
      if (Math.abs(dx) >= Math.abs(dy)) for (let t = 1 + (sp / 2) % sp; t <= NY; t += sp) pull(x, t, dx, dy, 1.4);
      else for (let t = 1 + (sp / 2) % sp; t <= NX; t += sp) pull(t, y, dx, dy, 1.4);
    }
  }
  activeSteps = 45;
}

// --- Sahne: masa, tekne, su ---
const table = new THREE.Mesh(new RoundedBoxGeometry(14, 0.4, 10, 3, 0.1), new THREE.MeshStandardMaterial({ color: 0x3b2a1e, roughness: 0.8 }));
table.position.y = -0.2;
sim.scene.add(table);
const wood = (() => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#8a5a34'; g.fillRect(0, 0, 256, 32);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(60,30,10,${rand(0.1, 0.35)})`; g.lineWidth = rand(0.5, 2); g.beginPath(); const y = rand(0, 32); g.moveTo(0, y); g.bezierCurveTo(80, y + rand(-4, 4), 160, y + rand(-4, 4), 256, y + rand(-3, 3)); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const woodMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.6 });
const RIM = 0.35, RH = 0.8;
const trayBottom = new THREE.Mesh(new THREE.BoxGeometry(W + RIM * 2, 0.2, H + RIM * 2), woodMat);
trayBottom.position.y = 0.1;
sim.scene.add(trayBottom);
[[0, (H + RIM) / 2, W + RIM * 2, RIM], [0, -(H + RIM) / 2, W + RIM * 2, RIM], [(W + RIM) / 2, 0, RIM, H], [-(W + RIM) / 2, 0, RIM, H]].forEach(([x, z, sx, sz]) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(sx, RH, sz, 2, 0.05), woodMat);
  m.position.set(x, RH / 2 + 0.1, z);
  sim.scene.add(m);
});
const texData = new Uint8Array(NX * NY * 4);
const tex = new THREE.DataTexture(texData, NX, NY, THREE.RGBAFormat);
tex.colorSpace = THREE.SRGBColorSpace;
tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
const surface = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0 }));
surface.rotation.x = -Math.PI / 2;
surface.position.y = SURF_Y;
sim.scene.add(surface);
const glint = new THREE.PointLight(0xffffff, 10, 20, 1.5);
glint.position.set(-3, 6, 3);
sim.scene.add(glint);

function upload() {
  let k = 0;
  for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++, k += 4) {
    const id = IX(i, j);
    texData[k] = clamp(R[id], 0, 1) * 255; texData[k + 1] = clamp(G[id], 0, 1) * 255; texData[k + 2] = clamp(B[id], 0, 1) * 255; texData[k + 3] = 255;
  }
  tex.needsUpdate = true;
  dirty = false;
}

// Araç modelleri
const bizMesh = new THREE.Group();
{
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.01, 1.6, 8), new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.7, roughness: 0.3 }));
  rod.position.y = 0.8;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0x7c4a21 }));
  grip.position.y = 1.7;
  bizMesh.add(rod, grip);
}
bizMesh.visible = false;
sim.scene.add(bizMesh);
const combMesh = new THREE.Group();
combMesh.visible = false;
sim.scene.add(combMesh);
let combKey = '';
function buildComb(horizontalMove) {
  const key = combGap.value + (horizontalMove ? 'h' : 'v');
  if (key === combKey) return;
  combKey = key;
  combMesh.children.slice().forEach((c) => { c.geometry.dispose(); combMesh.remove(c); });
  const span = horizontalMove ? H : W, n = horizontalMove ? NY : NX, cell = span / n;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, span + 0.4), woodMat);
  bar.position.y = 0.9;
  combMesh.add(bar);
  const toothGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.85, 5);
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.7 });
  for (let t = 1 + (combGap.value / 2) % combGap.value; t <= n; t += combGap.value) {
    const m = new THREE.Mesh(toothGeo, toothMat);
    m.position.set(0, 0.45, -span / 2 + (t - 0.5) * cell);
    combMesh.add(m);
  }
  combMesh.rotation.y = horizontalMove ? 0 : Math.PI / 2;
}
const toWorld = (gx, gy) => [((gx - 0.5) / NX) * W - W / 2, H / 2 - ((gy - 0.5) / NY) * H];
function showTool(tool, g, dir) {
  const [x, z] = toWorld(g.x, g.y);
  if (tool === 'biz') { bizMesh.visible = true; combMesh.visible = false; bizMesh.position.set(x, SURF_Y, z); }
  else if (tool === 'tarak') {
    const hor = Math.abs(dir.x) >= Math.abs(dir.y);
    buildComb(hor);
    combMesh.visible = true; bizMesh.visible = false;
    combMesh.position.set(hor ? x : 0, SURF_Y, hor ? 0 : z);
  }
}
function hideTools() { bizMesh.visible = false; combMesh.visible = false; }

// Kâğıt
const paperPivot = new THREE.Group();
paperPivot.position.set(0, SURF_Y + 0.02, -H / 2);
const paperData = new Uint8Array(NX * NY * 4);
const paperTex = new THREE.DataTexture(paperData, NX, NY, THREE.RGBAFormat);
paperTex.colorSpace = THREE.SRGBColorSpace;
paperTex.magFilter = paperTex.minFilter = THREE.LinearFilter;
const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
const paper = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.96, H * 0.96), paperMat);
paper.position.set(0, (H * 0.96) / 2 + H * 0.02, 0.001);
paperPivot.add(paper);
paperPivot.visible = false;
sim.scene.add(paperPivot);
let paperAnim = -1; // <0: yok
function printPaper() {
  if (paperAnim >= 0 && paperAnim < 2.4) return;
  paperMat.map = null; paperMat.color.setHex(0xfaf6ea); paperMat.needsUpdate = true;
  paperPivot.visible = true;
  paperPivot.scale.setScalar(1);
  paperAnim = 0;
  sim.moveCamera([0, 10.5, 9.5], [0, 1.5, -1.5]);
}
function capture() {
  // Baskı, tekne görüntüsünün aynadaki hâlidir (kâğıt ters çevrilir); kâğıdı dik tutunca sol–sağ yer değiştirir
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = (j * NX + i) * 4, b = (j * NX + (NX - 1 - i)) * 4;
    paperData[a] = texData[b]; paperData[a + 1] = texData[b + 1]; paperData[a + 2] = texData[b + 2]; paperData[a + 3] = 255;
  }
  paperTex.needsUpdate = true;
  paperMat.map = paperTex; paperMat.color.setHex(0xffffff); paperMat.needsUpdate = true;
  printed++;
  clearTray();
  sim.toast('🖨 Desen kâğıda geçti; tekne temizlendi', 'good');
}
let printed = 0;

// --- İşlem kuyruğu (hazır ayarlar) ---
let queue = [];
let cur = null;
function stroke(tool, pts) { queue.push({ type: 'stroke', tool, pts, k: 0 }); }
function dropOp(x, y, r, hex) { queue.push({ type: 'drop', x, y, r, hex }); }
function processQueue() {
  let dropBudget = 6;
  while (queue.length || cur) {
    if (!cur) cur = queue.shift();
    if (cur.type === 'drop') {
      if (dropBudget-- <= 0) return;
      drop(cur.x, cur.y, cur.r, cur.hex);
      cur = null;
      continue;
    }
    // Fırça darbesi: her karede birkaç nokta ilerle
    const pts = cur.pts;
    for (let s = 0; s < 4 && cur.k < pts.length - 1; s++, cur.k++) toolSegment(cur.tool, pts[cur.k], pts[cur.k + 1]);
    const a = pts[Math.max(cur.k - 1, 0)], b = pts[cur.k];
    showTool(cur.tool, b, { x: b.x - a.x, y: b.y - a.y });
    if (cur.k >= pts.length - 1) { cur = null; hideTools(); }
    return;
  }
}
const line = (x0, y0, x1, y1) => {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: lerp(x0, x1, i / n), y: lerp(y0, y1, i / n) }));
};
function battal(colors, n = 150, rmin = 2.5, rmax = 5.5) {
  for (let i = 0; i < n; i++) dropOp(rand(2, NX - 1), rand(2, NY - 1), rand(rmin, rmax), PALETTE[colors[i % colors.length]][0]);
}
function gelgit(gap = 8, horizontal = true) {
  let dir = 1;
  if (horizontal) for (let y = gap / 2; y < NY; y += gap, dir = -dir) stroke('biz', dir > 0 ? line(2, y, NX - 1, y) : line(NX - 1, y, 2, y));
  else for (let x = gap / 2; x < NX; x += gap, dir = -dir) stroke('biz', dir > 0 ? line(x, 2, x, NY - 1) : line(x, NY - 1, x, 2));
}
const PRESETS = {
  battal: () => battal(['lacivert', 'al', 'sari', 'beyaz']),
  gelgit: () => { battal(['lacivert', 'sari', 'al', 'turkuaz'], 140); gelgit(8, true); },
  tarakli: () => { battal(['al', 'lacivert', 'sari', 'beyaz'], 140); gelgit(10, true); combGap.set(6); stroke('tarak', line(NX / 2, NY - 1, NX / 2, 2)); },
  lale: () => {
    battal(['turkuaz', 'beyaz'], 70, 2, 4);
    const cx = NX / 2, cy = NY / 2 + 8;
    dropOp(cx, cy, 12, PALETTE.al[0]);
    dropOp(cx, cy - 2, 7, PALETTE.gul[0]);
    dropOp(cx, cy - 3, 3.5, PALETTE.sari[0]);
    for (let y = cy - 16; y > 10; y -= 5) dropOp(cx, y, 2.4, PALETTE.yesil[0]);
    dropOp(cx - 9, cy - 26, 4, PALETTE.yesil[0]);
    dropOp(cx + 9, cy - 30, 4, PALETTE.yesil[0]);
    stroke('biz', line(cx, cy - 15, cx, cy + 7));        // alttan yukarı: lalenin çentiği
    stroke('biz', line(cx - 10, cy + 14, cx - 4, cy + 4)); // taç yaprak uçları
    stroke('biz', line(cx + 10, cy + 14, cx + 4, cy + 4));
    stroke('biz', line(cx, 10, cx, cy - 12));             // sap
    stroke('biz', line(cx - 16, cy - 32, cx - 3, cy - 22)); // yapraklar
    stroke('biz', line(cx + 16, cy - 36, cx + 3, cy - 26));
  },
};

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır desenler');
ui.segmented({ options: [{ value: 'battal', label: 'Battal' }, { value: 'gelgit', label: 'Gelgit' }, { value: 'tarakli', label: 'Taraklı' }, { value: 'lale', label: 'Çiçekli (lale)' }],
  value: 'battal', onChange: (v) => { queue = []; cur = null; hideTools(); clearTray(); PRESETS[v](); } });

ui.section('Araç ve boya');
const tool = ui.segmented({ options: [{ value: 'damla', label: '💧 Damla' }, { value: 'serp', label: '✨ Serpme' }, { value: 'biz', label: '✒️ Biz' }, { value: 'tarak', label: '🪮 Tarak' }], value: 'damla' });
const color = ui.segmented({ label: 'Boya', options: Object.entries(PALETTE).map(([k, [hex, name]]) => ({ value: k, label: `<span style="color:#${hex.toString(16).padStart(6, '0')};text-shadow:0 0 2px #fff8">●</span> ${name}` })), value: 'lacivert' });
const dropR = ui.slider({ label: 'Damla büyüklüğü', min: 2, max: 20, step: 1, value: 8, unit: 'birim' });
const combGap = ui.slider({ label: 'Tarak diş aralığı', min: 4, max: 16, step: 1, value: 8, unit: 'birim' });
const kitre = ui.slider({ label: 'Kitre (suyun koyuluğu)', min: 0, max: 100, step: 5, value: 60, unit: '%' });
ui.buttons([
  { label: '🖨 Kâğıda bas', variant: 'primary', onClick: () => printPaper() },
  { label: '🧽 Tekneyi temizle', onClick: () => { queue = []; cur = null; hideTools(); clearTray(); } },
]);

ui.section('Akış');
const sDrops = ui.stat({ label: 'Damla' });
const sSpeed = ui.stat({ label: 'En hızlı akış', unit: 'birim/sn' });
const sVisc = ui.stat({ label: 'Viskozite', unit: 'birim²/sn' });
const sPrint = ui.stat({ label: 'Basılan kâğıt' });
const chart = ui.chart({ title: 'Akışın kinetik enerjisi (kitre sönümler)', series: [{ name: 'enerji', color: '#38bdf8', fill: true }], maxPoints: 200, yMin: 0, format: (v) => fmt(v, 0) });
ui.text('Tekneye tıkla (damla) ya da biz/tarak seçip sürükle. Desen hoşuna gidince <b>Kâğıda bas</b>.', 'card');

// --- Etkileşim ---
const surfPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SURF_Y);
function toGrid(ev) {
  const p = sim.pointOnPlane(ev, surfPlane);
  if (!p || Math.abs(p.x) > W / 2 || Math.abs(p.z) > H / 2) return null;
  return { x: ((p.x + W / 2) / W) * NX + 0.5, y: ((H / 2 - p.z) / H) * NY + 0.5 };
}
let drag = null;
sim.dom.addEventListener('pointerdown', (ev) => {
  if (tool.value !== 'biz' && tool.value !== 'tarak') return;
  const g = toGrid(ev);
  if (!g) return;
  drag = { last: g, id: ev.pointerId };
  if (sim.controls) sim.controls.enabled = false;
}, { capture: true });
sim.dom.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const g = toGrid(ev);
  if (!g) return;
  toolSegment(tool.value, drag.last, g);
  showTool(tool.value, g, { x: g.x - drag.last.x, y: g.y - drag.last.y });
  drag.last = g;
});
const endDrag = () => { if (!drag) return; drag = null; hideTools(); if (sim.controls) sim.controls.enabled = true; };
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

sim.onClick([surface], (hit, ev) => {
  const g = toGrid(ev);
  if (!g) return;
  const hex = PALETTE[color.value][0];
  if (tool.value === 'damla') drop(g.x, g.y, dropR.value, hex);
  else if (tool.value === 'serp') for (let i = 0; i < 18; i++) {
    const a = rand(0, Math.PI * 2), d = rand(0, dropR.value * 2.5);
    queue.push({ type: 'drop', x: clamp(g.x + Math.cos(a) * d, 1, NX), y: clamp(g.y + Math.sin(a) * d, 1, NY), r: rand(1.2, 2.8), hex });
  }
});

// --- Döngü ---
let chartT = 0;
sim.onUpdate((dt) => {
  processQueue();
  const steps = clamp(Math.round(dt / DT), 1, 3);
  if (activeSteps > 0 || lastEnergy > 0.02) {
    for (let s = 0; s < steps; s++) fluidStep();
    activeSteps = Math.max(0, activeSteps - steps);
  } else { lastEnergy = 0; maxSpeed = 0; }
  chartT += dt;
  if (chartT > 0.2) { chartT = 0; chart.push([lastEnergy]); }
});
let uiT = 0;
sim.onRender((rdt) => {
  if (dirty) upload();
  if (paperAnim >= 0 && paperAnim < 3) {
    paperAnim += sim.paused ? 0 : rdt;
    const a = paperAnim;
    if (a < 0.8) { paperPivot.rotation.x = Math.PI / 2; paperPivot.position.y = SURF_Y + 0.02 + (1 - a / 0.8) * 2.5; }
    else if (a < 1.2) { paperPivot.position.y = SURF_Y + 0.02; if (!paperMat.map) capture(); }
    else { const t = clamp((a - 1.2) / 1.2, 0, 1), e = t * t * (3 - 2 * t); paperPivot.rotation.x = lerp(Math.PI / 2, -0.5, e); paperPivot.scale.setScalar(lerp(1, 0.62, e)); paperPivot.position.y = SURF_Y + 0.02 + e * 0.6; }
  }
  uiT += rdt;
  if (uiT < 0.25) return;
  uiT = 0;
  sDrops.set(drops); sSpeed.set(fmt(maxSpeed, 1)); sVisc.set(fmt(kitreVisc(), 1)); sPrint.set(printed);
});

sim.onReset(() => { queue = []; cur = null; hideTools(); clearTray(); paperPivot.visible = false; sim.moveCamera([0, 9.2, 6.6], [0, 0.4, 0.2]); paperAnim = -1; chart.clear(); PRESETS.battal(); });
clearTray();
PRESETS.battal();
