// Mars Kolonisi — sol döngüsü, toz fırtınası ve O₂ / su / besin / enerji için kütle-enerji dengesi.
import { createSim, THREE, fmt, clamp, lerp, smoothstep, rand, ImprovedNoise, instanced, TAU } from '@core';

// --- Model sabitleri ---
const SOL_H = 24 + 39 / 60 + 35 / 3600; // bir sol ≈ 24 sa 39 dk 35 sn
const S_MARS = 590;     // W/m², Mars yörüngesinde ortalama güneş ışınımı (Dünya'nın ≈ %43'ü)
const ETA = 0.2;        // panel verimi (toz, sıcaklık kayıpları dahil, temsili)
const O2_PP = 0.84;     // kg O₂ / kişi / sol (NASA BVAD nominal)
const DRINK = 2.5;      // kg içme suyu / kişi / sol
const W_USE = 6;        // kg toplam su kullanımı / kişi / sol (içme + yemek + hijyen, temsili)
const AREA_PP = 45;     // m² sera ≈ bir kişinin tüm besini ve O₂'si (40–50 m²)
const KWH_O2 = 10;      // kWh / kg O₂ (CO₂ elektrolizi; kuramsal alt sınır ≈ 5, temsili)
const KWH_ICE = 0.5;    // kWh / kg buz kazı + eritme (temsili)
const GH_KW = 0.1;      // kW / m² sera LED aydınlatması (ortalama, temsili)
const BASE_KW = 1.5, CREW_KW = 1.0; // ısıtma, hava, su arıtma, iletişim (temsili)
const TAU_CLEAR = 0.5;  // açık havada tipik toz optik derinliği
const SEC_PER_SOL = 12; // 1× hızda bir sol kaç saniye sürer
const CAP = { o2: 3000, water: 30000, food: 5000 };
const M_PANEL = 40;     // her panel modeli 40 m²'yi temsil eder

const sim = createSim({
  background: 0xc19a6b,
  camera: { position: [10, 13, 38], target: [8, 1, -4], fov: 55, far: 900 },
  controls: { maxDistance: 160, minDistance: 8, maxPolarAngle: Math.PI * 0.47 },
  lights: false,
  fog: [70, 260],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Ekvatordaki bir Mars üssü: yaşam modülleri, sera tüneli, CO₂'den oksijen üreten <b>MOXIE benzeri</b> ünite, buz madeni,
    batarya ve güneş paneli tarlası. Güneş bir <b>sol</b> (≈ 24 sa 39 dk) içinde doğup batar; toz fırtınası gökyüzünü karartır.
    Panelde üssün <b>oksijen, su, besin ve enerji</b> stokları ve "kaç sol yeter?" rezervi izlenir.</p>
    <h3>Model</h3>
    <ul>
      <li><b>Güneş:</b> Mars'ta atmosfer üstünde ortalama ≈ 590 W/m² (Dünya'nın ≈ %43'ü, Güneş'e 1,52 AU uzaklık).
      Yüzeye ulaşan ışık, toz optik derinliği τ ile Beer–Lambert (e<sup>−τ·m</sup>, m = hava kütlesi) + yaklaşık saçılmış ışık payıyla hesaplanır.
      Paneller yatay ve sabittir, verim %20 (temsili).</li>
      <li><b>Tüketim (kişi başı / sol):</b> O₂ ≈ 0,84 kg (NASA BVAD nominal), içme suyu ≈ 2,5 kg; toplam su kullanımı 6 kg (temsili),
      bunun geri kazanılamayan kısmı kaybolur.</li>
      <li><b>Sera:</b> Kişi başına ≈ 40–50 m² yoğun ışıklı ekim alanı hem tüm besini hem O₂'yi karşılayabilir; burada 45 m² = 1 kişi.
      LED'ler sürekli ≈ 0,1 kW/m² çeker (temsili).</li>
      <li><b>O₂ ünitesi:</b> Katı oksit elektroliziyle CO₂ → CO + O₂. Kuramsal enerji ≈ 5 kWh/kg; ısıtma kayıplarıyla 10 kWh/kg alındı (temsili).</li>
      <li><b>Enerji önceliği:</b> Güç yetmezse sırayla temel yaşam desteği → O₂ ünitesi → sera → buz madeni beslenir; önce maden ve sera kapanır.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li><b>Toz fırtınası</b> senaryosu: güneş gücü %80'den fazla düşer, batarya boşalır, sera karanlıkta kalır. O₂ rezervi kaç sol dayanıyor?</li>
      <li>Fırtına sırasında batarya kapasitesini artır ya da panel alanını iki katına çıkar: hangisi daha çok işe yarıyor?</li>
      <li><b>Kalabalık ekip</b>: 12 kişiye aynı altyapı yetmez. Sera alanını kişi başı 45 m² olacak şekilde büyütmeyi dene.</li>
      <li><b>Su geri kazanımı</b>nı %98'den %60'a düşür: buz madeni ne kadar hızlı çalışmak zorunda kalıyor?</li>
      <li>Sahnedeki yapılara tıkla: anlık üretim/tüketim değerlerini gösterir.</li>
    </ul>
    <h3>Sınırlar</h3>
    <p><small>Enerji yükleri, panel verimi, sera verimi ve su kullanımı temsili değerlerdir; gerçek bir üs tasarımı çok daha ayrıntılıdır
    (ısıl kontrol, CO₂ temizleme, yedek sistemler, ikmal). Üs ekvatorda ve ekinoks koşulunda varsayılır; mevsimler yoktur.
    ISS'te su geri kazanımı 2023'te %98'e ulaştı.</small></p>
    <p><small>Kaynaklar: NASA Life Support Baseline Values and Assumptions Document (BVAD, NASA/TP-2015-218570);
    Appelbaum & Flood, "Solar Radiation on Mars" (NASA TM-102299); NASA JPL MOXIE (Perseverance, 2021–2023: saatte 6–12 g O₂, toplam 122 g);
    NASA 2018 küresel toz fırtınası (Opportunity üzerinde τ ≈ 11).</small></p>`,
});

// --- Parametreler ve durum ---
const P = { crew: 4, panel: 1200, batt: 500, gh: 100, o2: 3.5, rec: 90, ice: 5, start: 60, stormTau: 5, stormDur: 35 };
const S = {};
let storm = null;
let scenario = 'dengeli';

function resetState() {
  Object.assign(S, {
    sol: 9.5 / 24, batt: P.batt * 0.8,
    o2: P.start * P.crew * O2_PP, water: P.start * P.crew * DRINK, food: P.start * P.crew,
    tau: TAU_CLEAR, gen: 0, irr: 0, dem: [0, 0, 0, 0], served: [1, 1, 1, 1],
    rate: null, lastSol: 0, warned: {},
  });
  storm = scenario === 'firtina' ? { t: -0.4, peak: P.stormTau, dur: P.stormDur } : null;
  resChart?.clear(); enChart?.clear();
}

function tauNow() {
  if (!storm || storm.t < 0) return TAU_CLEAR;
  const t = storm.t;
  const env = t < 4 ? smoothstep(0, 4, t) : t < storm.dur ? 1 : Math.exp(-(t - storm.dur) / 6);
  return TAU_CLEAR + (storm.peak - TAU_CLEAR) * env;
}

// Yüzeye ulaşan ışık oranı: doğrudan (Beer–Lambert) + saçılan ışık payı (yaklaşık)
function trans(tau, sinh) {
  const m = 1 / Math.max(sinh, 0.05);
  const e = Math.exp(-tau * m);
  return e + (1 - e) * 0.7 * Math.exp(-0.25 * tau);
}
const sunSin = (sol) => Math.max(0, Math.cos(((sol % 1) - 0.5) * TAU));

function step(ds) {
  const hours = ds * SOL_H;
  S.sol += ds;
  if (storm) { storm.t += ds; if (storm.t > storm.dur + 25) storm = null; }
  S.tau = tauNow();
  const sinh = sunSin(S.sol);
  S.irr = sinh > 0 ? S_MARS * sinh * trans(S.tau, sinh) : 0;
  S.gen = (S.irr * P.panel * ETA) / 1000;
  const dem = [BASE_KW + CREW_KW * P.crew, (P.o2 * KWH_O2) / SOL_H, P.gh * GH_KW, (P.ice * KWH_ICE) / SOL_H];
  let avail = S.gen * hours + S.batt;
  const f = dem.map((d) => {
    const need = d * hours;
    if (need <= 0) return 1;
    const got = Math.min(need, avail);
    avail -= got;
    return got / need;
  });
  S.batt = Math.min(P.batt, avail);
  S.dem = dem;
  for (let i = 0; i < 4; i++) S.served[i] = lerp(S.served[i], f[i], Math.min(1, ds * 8));
  // Kütle dengesi (sol başına hız)
  const plantShare = (f[2] * P.gh) / AREA_PP;
  const r = {
    o2: f[1] * P.o2 + plantShare * O2_PP - P.crew * O2_PP,
    water: f[3] * P.ice - P.crew * W_USE * (1 - (P.rec / 100) * f[0]),
    food: plantShare - P.crew,
  };
  for (const k of ['o2', 'water', 'food']) {
    S[k] = clamp(S[k] + r[k] * ds, 0, CAP[k]);
    if (S[k] >= CAP[k] && r[k] > 0) r[k] = 0;
  }
  if (!S.rate) S.rate = { ...r };
  const a = Math.min(1, ds / 1.2);
  for (const k in r) S.rate[k] = lerp(S.rate[k], r[k], a);
}

const need = () => ({ o2: P.crew * O2_PP, water: P.crew * DRINK, food: P.crew });
function reserve(k) {
  const rt = S.rate?.[k] ?? 0;
  return rt < -1e-6 ? S[k] / -rt : Infinity;
}

// --- Sahne: gökyüzü, ışıklar ---
const hemi = new THREE.HemisphereLight(0xffe2c4, 0x4a2414, 0.9);
const sunLight = new THREE.DirectionalLight(0xfff0dc, 2.4);
sim.scene.add(hemi, sunLight, sunLight.target);
const nightLight = new THREE.PointLight(0xffc27a, 0, 30, 1.6);
nightLight.position.set(1, 4, 2);
sim.scene.add(nightLight);

const stars = (() => {
  const n = 1500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection();
    v.y = Math.abs(v.y) + 0.05;
    v.normalize().multiplyScalar(400);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.5, sizeAttenuation: false, transparent: true, fog: false }));
  sim.scene.add(p);
  return p;
})();

const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff4e0, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
sunDisc.scale.setScalar(40);
sim.scene.add(sunDisc);

function dotTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function glowTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.12, 'rgba(255,250,235,1)');
  gr.addColorStop(0.3, 'rgba(210,225,255,.35)');
  gr.addColorStop(1, 'rgba(200,210,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// --- Arazi ---
const noise = new ImprovedNoise();
function height(x, z) {
  const flat = smoothstep(40, 75, Math.hypot(x - 4, z + 3));
  const n = noise.noise(x * 0.03, 0, z * 0.03) * 10 + noise.noise(x * 0.12, 3, z * 0.12) * 1.5;
  return flat * (n + 3) + (1 - flat) * noise.noise(x * 0.2, 7, z * 0.2) * 0.25;
}
{
  const g = new THREE.PlaneGeometry(320, 320, 140, 140);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = height(x, z);
    pos.setY(i, y);
    const t = 0.5 + noise.noise(x * 0.08, 11, z * 0.08) * 0.6;
    c.setHSL(0.035 + t * 0.02, 0.55, 0.28 + t * 0.12 + y * 0.008);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  sim.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));

  const rocks = instanced(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x6b3522, roughness: 1, flatShading: true }), 260);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0;
  while (k < 260) {
    const x = rand(-90, 90), z = rand(-90, 60);
    if (x > -32 && x < 38 && z > -24 && z < 14) continue;
    const sc = rand(0.4, 2.2);
    p.set(x, height(x, z) + sc * 0.2, z);
    q.setFromEuler(new THREE.Euler(rand(0, 3), rand(0, 3), rand(0, 3)));
    s.set(sc, sc * rand(0.5, 1), sc);
    rocks.setMatrixAt(k++, m.compose(p, q, s));
  }
  sim.scene.add(rocks);
}

// --- Üs yapıları ---
const clickables = [];
const labels = {};
const white = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.6, metalness: 0.1 });
const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.4, metalness: 0.6 });
const winMat = new THREE.MeshStandardMaterial({ color: 0x223044, emissive: 0xffb45a, emissiveIntensity: 0, roughness: 0.3 });
function tag(obj, key) { obj.traverse((o) => { o.userData.key = key; }); clickables.push(obj); }

function dome(r, x, z) {
  const g = new THREE.Group();
  const d = new THREE.Mesh(new THREE.SphereGeometry(r, 36, 18, 0, TAU, 0, Math.PI / 2), white);
  d.position.y = 0.5;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.15, r + 0.3, 0.6, 36), metal);
  ring.position.y = 0.3;
  const win = new THREE.Mesh(new THREE.TorusGeometry(r * 0.93, 0.13, 6, 40), winMat);
  win.rotation.x = Math.PI / 2;
  win.position.y = 0.5 + r * 0.38;
  g.add(d, ring, win);
  g.position.set(x, 0, z);
  sim.scene.add(g);
  return g;
}
const hab = new THREE.Group();
hab.add(dome(3.4, 0, 0), dome(2.4, 6.6, -1.2));
{
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 3.2, 16), white);
  tube.rotation.z = Math.PI / 2;
  tube.rotation.y = 0.18;
  tube.position.set(3.6, 0.9, -0.6);
  hab.add(tube);
}
sim.scene.add(hab);
tag(hab, 'hab');
labels.hab = sim.label('Yaşam modülü', { position: [0, 5.2, 0], className: 'plain' });

// Sera tüneli
const ghGroup = new THREE.Group();
sim.scene.add(ghGroup);
const ghSegGeo = new THREE.CylinderGeometry(1.7, 1.7, 1.2, 20, 1, true, 0, Math.PI);
const ghMat = new THREE.MeshStandardMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
const ghRibMat = new THREE.MeshStandardMaterial({ color: 0xb6bec8, metalness: 0.5, roughness: 0.4 });
const plantMat = new THREE.MeshStandardMaterial({ color: 0x3fae4b, emissive: 0xc04dff, emissiveIntensity: 0, roughness: 0.8 });
const MAX_GH_SEG = 30;
const ghShell = instanced(ghSegGeo, ghMat, MAX_GH_SEG);
const ghRib = instanced(new THREE.TorusGeometry(1.72, 0.06, 4, 20, Math.PI), ghRibMat, MAX_GH_SEG);
const plants = instanced(new THREE.BoxGeometry(1.1, 0.35, 0.8), plantMat, MAX_GH_SEG * 2);
ghGroup.add(ghShell, ghRib, plants);
tag(ghGroup, 'gh');
labels.gh = sim.label('Sera', { parent: ghGroup, position: [-5, 3, 0], className: 'plain' });
const ghLight = new THREE.PointLight(0xd070ff, 0, 14, 1.5);
ghGroup.add(ghLight);

function layoutGreenhouse() {
  const n = clamp(Math.ceil(P.gh / 20), 0, MAX_GH_SEG);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const x0 = -4.2;
  for (let i = 0; i < n; i++) {
    const x = x0 - i * 1.2;
    const row = Math.floor(i / 15), xx = row ? x0 - (i - 15) * 1.2 : x;
    const zz = row ? 4.2 : 0;
    ghShell.setMatrixAt(i, m.compose(new THREE.Vector3(xx, 0, zz), q.setFromEuler(e.set(0, 0, Math.PI / 2)), one));
    ghRib.setMatrixAt(i, m.compose(new THREE.Vector3(xx - 0.6, 0, zz), q.setFromEuler(e.set(0, Math.PI / 2, 0)), one));
    plants.setMatrixAt(i * 2, m.compose(new THREE.Vector3(xx, 0.2, zz - 0.7), q.identity(), one));
    plants.setMatrixAt(i * 2 + 1, m.compose(new THREE.Vector3(xx, 0.2, zz + 0.7), q.identity(), one));
  }
  ghShell.count = ghRib.count = n;
  plants.count = n * 2;
  [ghShell, ghRib, plants].forEach((o) => { o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere(); });
  const len = Math.min(n, 15) * 1.2;
  labels.gh.position.set(x0 - len / 2, 2.8, n > 15 ? 2 : 0);
  labels.gh.visible = n > 0;
  ghLight.position.set(x0 - len / 2, 1.5, n > 15 ? 2 : 0);
}

// O₂ ünitesi (MOXIE benzeri)
const moxie = new THREE.Group();
{
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0xd4a53a, metalness: 0.7, roughness: 0.35 }));
  box.position.y = 0.6;
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8), metal);
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(-1.8, 0.4, 0);
  const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.8, 10), metal);
  vent.position.set(0.4, 1.5, 0);
  moxie.add(box, pipe, vent);
}
moxie.position.set(4.6, 0, 4.4);
sim.scene.add(moxie);
tag(moxie, 'o2');
labels.o2 = sim.label('O₂ ünitesi', { parent: moxie, position: [0, 2.4, 0], className: 'plain' });
const moxieGlow = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: 0x46e0ff }));
moxieGlow.position.set(0.81, 0.8, 0);
moxie.add(moxieGlow);

// Batarya
const battGroup = new THREE.Group();
const battCells = [];
for (let i = 0; i < 4; i++) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 1.6), new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.4, roughness: 0.5 }));
  b.position.set(i * 1.1, 0.65, 0);
  const lvl = new THREE.Mesh(new THREE.BoxGeometry(0.92, 1, 0.3), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
  lvl.position.set(i * 1.1, 0.65, 0.66);
  battGroup.add(b, lvl);
  battCells.push(lvl);
}
battGroup.position.set(8.5, 0, 4.5);
sim.scene.add(battGroup);
tag(battGroup, 'batt');
labels.batt = sim.label('Batarya', { parent: battGroup, position: [3.2, 1.4, 0.8], className: 'plain' });

// Güneş panelleri (her model 40 m²)
const MAX_PANELS = 80;
const panelMesh = instanced(new THREE.BoxGeometry(2.0, 0.06, 1.3), new THREE.MeshStandardMaterial({ color: 0x1d3b8f, metalness: 0.5, roughness: 0.25, emissive: 0x0a1330 }), MAX_PANELS);
const postMesh = instanced(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 5), metal, MAX_PANELS);
const panelGroup = new THREE.Group();
panelGroup.add(panelMesh, postMesh);
sim.scene.add(panelGroup);
tag(panelGroup, 'panel');
labels.panel = sim.label('Güneş panelleri', { position: [22, 2.4, -1], className: 'plain' });
function layoutPanels() {
  const n = clamp(Math.round(P.panel / M_PANEL), 1, MAX_PANELS);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  const cols = 10;
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const x = 13 + c * 2.3, z = -9 + r * 1.75;
    panelMesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0.85, z), q, one));
    postMesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, 0.4, z), q, one));
  }
  panelMesh.count = postMesh.count = n;
  [panelMesh, postMesh].forEach((o) => { o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere(); });
  const rows = Math.ceil(n / cols);
  labels.panel.position.set(13 + (Math.min(n, cols) - 1) * 1.15, 2.2, -9 + (rows - 1) * 0.875);
}

// Buz madeni + gezgin
const MINE = new THREE.Vector3(-18, 0, -17);
MINE.y = height(MINE.x, MINE.z);
const mine = new THREE.Group();
{
  const pit = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), new THREE.MeshStandardMaterial({ color: 0x2b150d, roughness: 1 }));
  pit.rotation.x = -Math.PI / 2;
  pit.position.y = 0.05;
  const ice = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), new THREE.MeshStandardMaterial({ color: 0xdff4ff, roughness: 0.2, emissive: 0x335566 }));
  ice.rotation.x = -Math.PI / 2;
  ice.position.y = 0.07;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 4.5, 6), metal);
  tower.position.set(2, 2.25, 0);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 0.2), metal);
  arm.position.set(1, 4.3, 0);
  mine.add(pit, ice, tower, arm);
}
const drill = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.5 }));
drill.rotation.x = Math.PI;
drill.position.set(0, 2.5, 0);
mine.add(drill);
mine.position.copy(MINE);
sim.scene.add(mine);
tag(mine, 'ice');
labels.ice = sim.label('Buz madeni', { parent: mine, position: [0, 5.4, 0], className: 'plain' });

const rover = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 1), white);
  body.position.y = 0.6;
  const cargo = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), new THREE.MeshStandardMaterial({ color: 0xbfe6ff }));
  cargo.position.set(-0.3, 1.1, 0);
  rover.add(body, cargo);
  const wg = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10);
  for (const [x, z] of [[-0.6, -0.55], [0.6, -0.55], [-0.6, 0.55], [0.6, 0.55]]) {
    const w = new THREE.Mesh(wg, metal);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 0.3, z);
    rover.add(w);
  }
}
sim.scene.add(rover);
const ROVER_HOME = new THREE.Vector3(-3, 0, -6);

// Ekip (EVA'daki astronotlar)
const crewMesh = instanced(new THREE.CapsuleGeometry(0.25, 0.6, 4, 8), new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.6 }), 12);
sim.scene.add(crewMesh);
const crewDummy = new THREE.Object3D();

// Toz parçacıkları
const DUST_N = 1400;
const dustPos = new Float32Array(DUST_N * 3);
for (let i = 0; i < DUST_N; i++) dustPos.set([rand(-60, 60), rand(0, 14), rand(-45, 40)], i * 3);
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dustMat = new THREE.PointsMaterial({ color: 0xc98a5a, size: 3, sizeAttenuation: false, map: dotTex(), alphaTest: 0.01, transparent: true, opacity: 0.1, depthWrite: false });
const dust = new THREE.Points(dustGeo, dustMat);
dust.frustumCulled = false;
sim.scene.add(dust);

// --- Görsel güncelleme ---
const SKY_DAY = new THREE.Color(0xc59d72), SKY_DUSK = new THREE.Color(0x46618a), SKY_NIGHT = new THREE.Color(0x07080f), SKY_STORM = new THREE.Color(0x8a5a38);
const sky = new THREE.Color();
const sunDir = new THREE.Vector3();

function updateVisuals(realDt) {
  const H = ((S.sol % 1) - 0.5) * TAU;
  const sinh = Math.cos(H);
  sunDir.set(-Math.sin(H), sinh, -0.35).normalize();
  const day = smoothstep(-0.05, 0.25, sinh);
  const stormF = clamp((S.tau - TAU_CLEAR) / 5, 0, 1);
  // Gökyüzü: gündüz karamela, gün batımında mavimsi, gece koyu; fırtınada kahverengi ve karanlık
  sky.copy(SKY_NIGHT).lerp(SKY_DUSK, smoothstep(-0.12, 0.05, sinh)).lerp(SKY_DAY, smoothstep(0.05, 0.35, sinh));
  sky.lerp(SKY_STORM, stormF * 0.85).multiplyScalar(lerp(1, 0.35 + 0.65 * day, stormF));
  sim.scene.background.copy(sky);
  sim.scene.fog.color.copy(sky);
  sim.scene.fog.near = lerp(70, 8, stormF);
  sim.scene.fog.far = lerp(260, 70, stormF);
  const trs = sinh > 0 ? trans(S.tau, sinh) : 0;
  sunLight.position.copy(sunDir).multiplyScalar(60);
  sunLight.intensity = 3 * Math.max(0, sinh) * Math.exp(-S.tau / Math.max(sinh, 0.05) * 0.6) + 0.02;
  hemi.intensity = 0.25 + 1.1 * day * (0.35 + 0.65 * trs);
  hemi.color.copy(sky).lerp(new THREE.Color(0xffffff), 0.4);
  sunDisc.position.copy(sunDir).multiplyScalar(300);
  sunDisc.visible = sinh > -0.05;
  sunDisc.material.opacity = clamp(Math.exp(-S.tau * 0.45), 0.03, 1);
  stars.material.opacity = (1 - smoothstep(-0.15, 0.1, sinh)) * (1 - stormF);
  const night = 1 - day;
  winMat.emissiveIntensity = 0.3 + night * 1.6;
  nightLight.intensity = night * 12;
  // Sera LED'leri: gücü verildikçe mor ışık
  const ghOn = S.served[2];
  plantMat.emissiveIntensity = ghOn * 0.35;
  ghLight.intensity = ghOn * 18 * (0.4 + night);
  moxieGlow.material.color.setHex(S.served[1] > 0.5 && P.o2 > 0 ? 0x46e0ff : 0x475569);
  // Batarya doluluk
  const bf = P.batt ? S.batt / P.batt : 0;
  battCells.forEach((c, i) => {
    const lvl = clamp(bf * 4 - i, 0, 1);
    c.scale.y = Math.max(lvl, 0.02);
    c.position.y = 0.15 + lvl * 0.5;
    c.material.color.setHex(bf < 0.15 ? 0xef4444 : bf < 0.4 ? 0xf59e0b : 0x22c55e);
  });
  // Maden matkabı ve gezgin
  const mineOn = S.served[3] * (P.ice > 0 ? 1 : 0);
  drill.rotation.y += realDt * 8 * mineOn;
  drill.position.y = 2.3 + Math.sin(S.sol * 60) * 0.5 * mineOn;
  const trips = P.ice / 8;
  const u = trips > 0 ? (S.sol * trips) % 1 : 0;
  const k = u < 0.5 ? smoothstep(0, 0.5, u) : 1 - smoothstep(0.5, 1, u);
  const rp = new THREE.Vector3().lerpVectors(ROVER_HOME, MINE.clone().add(new THREE.Vector3(3.5, 0, 3)), k);
  rp.y = height(rp.x, rp.z);
  rover.position.copy(rp);
  rover.rotation.y = Math.atan2(-(MINE.z - ROVER_HOME.z), MINE.x - ROVER_HOME.x) + (u < 0.5 ? Math.PI : 0);
  // Ekip: gündüz dışarıda EVA, gece ve fırtınada içeride
  const outside = day > 0.5 && stormF < 0.3 ? Math.min(P.crew, 12) : 0;
  for (let i = 0; i < outside; i++) {
    const a = S.sol * TAU * 0.6 * (i % 2 ? 1 : -1) + (i * TAU) / outside;
    const rr = 5 + (i % 3) * 1.2;
    crewDummy.position.set(Math.cos(a) * rr + 1.5, 0.55, Math.sin(a) * rr + 1.5);
    crewDummy.updateMatrix();
    crewMesh.setMatrixAt(i, crewDummy.matrix);
  }
  crewMesh.count = outside;
  crewMesh.instanceMatrix.needsUpdate = true;
  // Toz
  dustMat.opacity = 0.06 + stormF * 0.6;
  dustMat.size = 2 + stormF * 3;
  const wind = (2 + stormF * 25) * realDt * Math.max(sim.speed, 1);
  for (let i = 0; i < DUST_N; i++) {
    let x = dustPos[i * 3] + wind * (0.6 + (i % 7) * 0.1);
    if (x > 60) x -= 120;
    dustPos[i * 3] = x;
    dustPos[i * 3 + 1] += Math.sin(x * 0.3 + i) * 0.01;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır senaryolar');
const PRESETS = {
  dengeli: { crew: 4, panel: 1200, batt: 500, gh: 100, o2: 3.5, rec: 90, ice: 5, start: 60 },
  firtina: { crew: 4, panel: 1200, batt: 500, gh: 100, o2: 3.5, rec: 90, ice: 5, start: 60, stormTau: 6, stormDur: 40 },
  kalabalik: { crew: 12, panel: 1200, batt: 500, gh: 100, o2: 3.5, rec: 90, ice: 5, start: 60 },
  su: { crew: 4, panel: 1200, batt: 500, gh: 100, o2: 3.5, rec: 60, ice: 5, start: 60 },
};
ui.buttons([
  { label: '⚖️ Dengeli üs', variant: 'primary', onClick: () => applyPreset('dengeli') },
  { label: '🌪 Toz fırtınası', onClick: () => applyPreset('firtina') },
]);
ui.buttons([
  { label: '👥 Kalabalık ekip', onClick: () => applyPreset('kalabalik') },
  { label: '💧 Su geri kazanımı düşük', onClick: () => applyPreset('su') },
]);

ui.section('Ekip ve altyapı');
const ctl = {};
ctl.crew = ui.slider({ label: 'Ekip', min: 1, max: 12, step: 1, value: P.crew, unit: 'kişi', onInput: (v) => { P.crew = v; } });
ctl.panel = ui.slider({ label: 'Güneş paneli alanı', min: 100, max: 3000, step: 50, value: P.panel, unit: 'm²', onInput: (v) => { P.panel = v; layoutPanels(); } });
ctl.batt = ui.slider({ label: 'Batarya kapasitesi', min: 50, max: 2000, step: 50, value: P.batt, unit: 'kWh', onInput: (v) => { P.batt = v; S.batt = Math.min(S.batt, v); } });
ctl.gh = ui.slider({ label: 'Sera alanı', min: 0, max: 600, step: 10, value: P.gh, unit: 'm²', onInput: (v) => { P.gh = v; layoutGreenhouse(); } });
ctl.o2 = ui.slider({ label: 'O₂ ünitesi üretimi', min: 0, max: 12, step: 0.1, value: P.o2, unit: 'kg/sol', onInput: (v) => { P.o2 = v; } });
ctl.rec = ui.slider({ label: 'Su geri kazanım verimi', min: 0, max: 98, step: 1, value: P.rec, unit: '%', onInput: (v) => { P.rec = v; } });
ctl.ice = ui.slider({ label: 'Buz madeni', min: 0, max: 40, step: 1, value: P.ice, unit: 'kg su/sol', onInput: (v) => { P.ice = v; } });
ctl.start = ui.slider({ label: 'Başlangıç stoku (sıfırlamada)', min: 10, max: 300, step: 10, value: P.start, unit: 'sol', onInput: (v) => { P.start = v; } });
const needTxt = ui.text('', 'card');

ui.section('Toz fırtınası ve zaman');
ctl.stormTau = ui.slider({ label: 'Fırtına şiddeti (optik derinlik τ)', min: 1, max: 10, step: 0.5, value: P.stormTau, format: (v) => `τ = ${fmt(v, 1)}`, onInput: (v) => { P.stormTau = v; if (storm) storm.peak = v; } });
ctl.stormDur = ui.slider({ label: 'Fırtına süresi', min: 5, max: 90, step: 1, value: P.stormDur, unit: 'sol', onInput: (v) => { P.stormDur = v; if (storm) storm.dur = v; } });
ui.buttons([
  { label: '🌪 Fırtına başlat', variant: 'danger', onClick: () => { storm = { t: 0, peak: P.stormTau, dur: P.stormDur }; sim.toast('🌪 Toz fırtınası yaklaşıyor: gökyüzü kararıyor', 'warn'); } },
  { label: '☀️ Fırtınayı bitir', onClick: () => { if (storm && storm.t < storm.dur) storm.dur = Math.max(storm.t, 0); } },
]);
const timeSl = ui.slider({ label: 'Zaman akışı', min: 0.25, max: 8, step: 0.25, value: 1, format: (v) => `${fmt(v, 2)}× · 1 sol ≈ ${fmt(SEC_PER_SOL / v / Math.max(sim.speed, 0.25), 1)} sn` });

ui.section('Durum');
const st = {
  sol: ui.stat({ label: 'Sol' }),
  sun: ui.stat({ label: 'Güneş gücü', unit: 'kW' }),
  tau: ui.stat({ label: 'Toz (τ)' }),
  batt: ui.stat({ label: 'Batarya', unit: '%' }),
  o2: ui.stat({ label: 'O₂ rezervi', unit: 'sol' }),
  water: ui.stat({ label: 'Su rezervi', unit: 'sol' }),
  food: ui.stat({ label: 'Besin rezervi', unit: 'sol' }),
  load: ui.stat({ label: 'Yük', unit: 'kW' }),
};
const mO2 = ui.meter({ label: 'O₂ stoku', color: '#38bdf8' });
const mW = ui.meter({ label: 'Su stoku', color: '#60a5fa' });
const mF = ui.meter({ label: 'Besin stoku', color: '#4ade80' });
const statusTxt = ui.text('', 'card');
const resChart = ui.chart({
  title: 'Rezerv: mevcut gidişle kaç sol yeter? (son 200 sol; 400 = sınırsız)',
  series: [{ name: 'O₂', color: '#38bdf8' }, { name: 'Su', color: '#818cf8' }, { name: 'Besin', color: '#4ade80' }],
  maxPoints: 400, yMin: 0, yMax: 400, height: 110,
});
const enChart = ui.chart({
  title: 'Enerji, son 40 sol: batarya, güneş gücü (açık gök tepesine göre) ve beslenen yük (%)',
  series: [{ name: 'Batarya', color: '#facc15', fill: true }, { name: 'Güneş', color: '#fb923c' }, { name: 'Güç verilen yük', color: '#f87171' }],
  maxPoints: 400, yMin: 0, yMax: 100, height: 100, format: (v) => fmt(v, 0),
});

function applyPreset(name) {
  scenario = name;
  const p = { stormTau: 5, stormDur: 35, ...PRESETS[name] };
  for (const k in p) { P[k] = p[k]; ctl[k].set(p[k]); }
  layoutPanels();
  layoutGreenhouse();
  resetState();
}

const fmtRes = (v) => (v === Infinity ? '∞' : v > 999 ? '999+' : fmt(v, 0));
const tone = (v) => (v === Infinity || v > 120 ? 'good' : v > 30 ? 'warn' : 'bad');

function updatePanel() {
  const r = { o2: reserve('o2'), water: reserve('water'), food: reserve('food') };
  st.sol.set(Math.floor(S.sol) + 1);
  st.sun.set(fmt(S.gen, 0));
  st.tau.set(fmt(S.tau, 1), S.tau > 3 ? 'bad' : S.tau > 1.5 ? 'warn' : 'good');
  const bf = P.batt ? S.batt / P.batt : 0;
  st.batt.set(fmt(bf * 100, 0), bf < 0.1 ? 'bad' : bf < 0.35 ? 'warn' : 'good');
  st.o2.set(fmtRes(r.o2), tone(r.o2));
  st.water.set(fmtRes(r.water), tone(r.water));
  st.food.set(fmtRes(r.food), tone(r.food));
  const totalDem = S.dem.reduce((a, b) => a + b, 0);
  st.load.set(fmt(totalDem, 1));
  const n = need();
  mO2.set(Math.min(1, S.o2 / (n.o2 * 120)), `${fmt(S.o2, 0)} kg · ${S.rate ? (S.rate.o2 >= 0 ? '+' : '') + fmt(S.rate.o2, 1) : '—'} kg/sol`);
  mW.set(Math.min(1, S.water / (n.water * 120)), `${fmt(S.water, 0)} kg · ${S.rate ? (S.rate.water >= 0 ? '+' : '') + fmt(S.rate.water, 1) : '—'} kg/sol`);
  mF.set(Math.min(1, S.food / (n.food * 120)), `${fmt(S.food, 0)} kişi-sol · ${S.rate ? (S.rate.food >= 0 ? '+' : '') + fmt(S.rate.food, 1) : '—'}/sol`);
  // Günlük enerji dengesi (açık gök, ortalama)
  const clearDay = (S_MARS * P.panel * ETA / 1000) * (SOL_H / Math.PI) * 0.85;
  needTxt.set(`<small>Günlük ihtiyaç (${P.crew} kişi): O₂ <b>${fmt(n.o2, 1)} kg</b> · içme suyu <b>${fmt(n.water, 1)} kg</b> ·
    su kaybı <b>${fmt(P.crew * W_USE * (1 - P.rec / 100), 1)} kg</b> · besin için sera <b>${fmt(P.crew * AREA_PP, 0)} m²</b><br>
    Enerji: açık gökte panel ≈ <b>${fmt(clearDay, 0)} kWh/sol</b>, yük <b>${fmt(totalDem * SOL_H, 0)} kWh/sol</b>.</small>`);
  const warn = [];
  const names = ['temel yaşam desteği', 'O₂ ünitesi', 'sera ışıkları', 'buz madeni'];
  S.served.forEach((f, i) => { if (f < 0.97 && S.dem[i] > 0) warn.push(`${names[i]} %${fmt(f * 100, 0)} güçle`); });
  let html = '';
  if (S.o2 <= 0) html += '🔴 <b>Oksijen stoku bitti!</b> Ekip acil tahliye ya da ikmal gerektirir.<br>';
  if (S.water <= 0) html += '🔴 <b>Su bitti!</b><br>';
  if (S.food <= 0) html += '🔴 <b>Besin bitti!</b><br>';
  if (warn.length) html += `⚡ Enerji yetersiz: ${warn.join(', ')} çalışıyor.<br>`;
  if (storm && storm.t >= 0) html += `🌪 Toz fırtınası: ${fmt(Math.max(0, storm.t), 0)}. sol, yüzeye ulaşan ışık açık günün ≈ %${fmt(100 * trans(S.tau, 1) / trans(TAU_CLEAR, 1), 0)}’i.<br>`;
  if (!html) html = [r.o2, r.water, r.food].every((v) => v === Infinity) ? '✅ Üs kendi kendine yetiyor: tüm stoklar artıyor.' : '✅ Sistemler çalışıyor; azalan stokların rezervini izle.';
  statusTxt.set(html);
  // Eşik uyarıları (bir kez)
  for (const [k, nm] of [['o2', 'O₂'], ['water', 'Su'], ['food', 'Besin']]) {
    if (r[k] < 15 && !S.warned[k]) { S.warned[k] = true; sim.toast(`⚠️ ${nm} rezervi 15 solün altına düştü`, 'bad'); }
    if (r[k] > 30) S.warned[k] = false;
  }
  labels.panel.setText(`Paneller · ${fmt(S.gen, 0)} kW`);
  labels.batt.setText(`Batarya %${fmt(bf * 100, 0)}`);
}

// --- Döngü ---
let chartAcc = 0, resAcc = 0, panelAcc = 0;
sim.formatTime = () => {
  const f = S.sol % 1, h = Math.floor(f * 24), m = Math.floor((f * 24 - h) * 60);
  return `Sol ${Math.floor(S.sol) + 1} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

sim.onUpdate((dt) => {
  let dsol = (dt * timeSl.value) / SEC_PER_SOL;
  while (dsol > 1e-9) {
    const h = Math.min(dsol, 0.01);
    step(h);
    dsol -= h;
    chartAcc += h;
    resAcc += h;
    if (resAcc >= 0.5) {
      resAcc = 0;
      resChart.push(['o2', 'water', 'food'].map((k) => Math.min(400, reserve(k))));
    }
    if (chartAcc >= 0.1) {
      chartAcc = 0;
      const clearPeak = (S_MARS * trans(TAU_CLEAR, 1) * P.panel * ETA) / 1000;
      const served = S.dem.reduce((a, d, i) => a + d * S.served[i], 0) / (S.dem.reduce((a, b) => a + b, 0) || 1);
      enChart.push([P.batt ? (100 * S.batt) / P.batt : 0, (100 * S.gen) / clearPeak, served * 100]);
    }
  }
});

sim.onRender((dt) => {
  updateVisuals(dt);
  panelAcc += dt;
  if (panelAcc > 0.25) { panelAcc = 0; updatePanel(); }
});

// Yapıya tıkla → anlık akış
sim.onClick(clickables, (hit) => {
  const key = hit.object.userData.key;
  const f = (i) => `%${fmt(S.served[i] * 100, 0)}`;
  const msg = {
    hab: `<b>Yaşam modülü</b> · ${P.crew} kişi · ${fmt(S.dem[0], 1)} kW (ısıtma, hava, su arıtma) · güç ${f(0)}`,
    gh: `<b>Sera</b> · ${fmt(P.gh, 0)} m² ≈ ${fmt(P.gh / AREA_PP, 1)} kişinin besini ve O₂'si · LED ${fmt(S.dem[2], 1)} kW · güç ${f(2)}`,
    o2: `<b>O₂ ünitesi</b> · CO₂ → CO + O₂ · ${fmt(P.o2 * S.served[1], 1)} kg/sol · ${fmt(S.dem[1], 1)} kW`,
    batt: `<b>Batarya</b> · ${fmt(S.batt, 0)} / ${fmt(P.batt, 0)} kWh`,
    panel: `<b>Güneş panelleri</b> · ${fmt(P.panel, 0)} m² · yüzeyde ${fmt(S.irr, 0)} W/m² · ${fmt(S.gen, 1)} kW`,
    ice: `<b>Buz madeni</b> · ${fmt(P.ice * S.served[3], 1)} kg su/sol · ${fmt(S.dem[3], 2)} kW`,
  }[key];
  if (msg) sim.toast(msg);
});

sim.onReset(() => resetState());
layoutPanels();
layoutGreenhouse();
resetState();
updatePanel();
