// Orman Yangını — Alexandridis tipi hücresel otomat: rüzgâr, eğim, nem ve bitki örtüsüne bağlı yayılma; yangın şeridi ve su uçağı.
import { createSim, THREE, ImprovedNoise, fmt, clamp, lerp, seeded, instanced, disposeObject } from '@core';

const N = 80;            // N×N hücre
const CELL_M = 20;       // bir hücre 20 m × 20 m
const HA = (CELL_M * CELL_M) / 10000; // hücre başına hektar (0,04)
const VEX = 1.4;         // dikey abartı (yalnız görünüm)
const W = N;             // dünya genişliği (1 birim = 1 hücre)
const HALF = W / 2;

const sim = createSim({
  background: 0x9fb8cf,
  camera: { position: [0, 60, 64], target: [0, 0, 3], fov: 45, far: 800 },
  controls: { minDistance: 20, maxDistance: 180, maxPolarAngle: Math.PI * 0.46 },
  fog: [140, 320],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>${fmt(N * N * HA, 0)} hektarlık tepelik bir arazi: çam, meşe, çalı (maki) ve çayır alanları, bir göl, bir orman yolu ve bir köy.
    Arazi 20 m × 20 m'lik hücrelere bölünmüştür. Her dakika yanan her hücre komşularını belli bir olasılıkla tutuşturur.</p>
    <h3>Model</h3>
    <p>Yayılma olasılığı Alexandridis ve ark. (2008) hücresel otomat modelinden uyarlanmıştır:
    <b>p = p<sub>h</sub> · (1+p<sub>bitki</sub>) · (1+p<sub>yoğunluk</sub>) · p<sub>rüzgâr</sub> · p<sub>eğim</sub></b>.</p>
    <ul>
      <li><b>Rüzgâr:</b> p<sub>w</sub> = e<sup>0,045·V</sup> · e<sup>0,131·V·(cos θ − 1)</sup> (V m/s, θ rüzgârla yayılma yönü arası açı). Rüzgâr yönünde hızlanır, tersine neredeyse durur.</li>
      <li><b>Eğim:</b> p<sub>s</sub> = e<sup>0,078·θ<sub>eğim</sub></sup>. Alev yokuş yukarı eğildiği için yangın <b>yokuş yukarı daha hızlı</b> ilerler.</li>
      <li><b>Bitki:</b> çam (reçineli) en kolay, çayır en zor tutuşur; ama çayır hızlı yanıp söner, meşe uzun süre yanar.</li>
      <li><b>Nem:</b> kuru hava (düşük bağıl nem) yakıtı kurutur. Nem etkisi modele yaklaşık bir çarpan olarak eklenmiştir (varsayım).</li>
      <li><b>Kıvılcım sıçraması:</b> kuvvetli rüzgârda çam kozalakları ve közler rüzgâr yönünde yüzlerce metre uçup yeni yangınlar başlatabilir.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li>Rüzgârı 50 km/sa, nemi %10 yap: yangının köye nasıl koştuğunu gör. Sonra nemi %60 yap.</li>
      <li>"Şerit çiz" modunda yangının önüne bir <b>yangın şeridi</b> çek. Kıvılcım sıçraması açıkken şerit her zaman yeterli mi?</li>
      <li>"Su bırak" moduyla uçağı alev cephesine gönder. Uçak her seferden sonra dolmak için zamana ihtiyaç duyar.</li>
      <li>Vadiden yokuş yukarı ve tepeden aşağı yangın başlat, hızları karşılaştır.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Türkiye'de orman yangınlarının büyük çoğunluğu insan kaynaklıdır (anız yakma, sigara, piknik ateşi, elektrik hatları).
    Ormanda ateş yakma; yangın görürsen <b>112</b>'yi ara. Kızılçam ormanları yazın çok kolay tutuşur ve yangına uyum sağlamıştır:
    kozalakları yangından sonra açılarak ormanı yeniler.</p>
    <p><small>Hücre boyu 20 m, zaman adımı 1 dakika. Dikey ölçek görsel olarak ${fmt(VEX, 1)}× abartılmıştır. Model eğitim amaçlıdır; gerçek yangın davranışı yakıt nemi, alev boyu, taç yangını gibi pek çok etkene bağlıdır.</small></p>`,
});

// --- Bitki / hücre tipleri ---
const V_WATER = 0, V_CAM = 1, V_MESE = 2, V_CALI = 3, V_CAYIR = 4, V_YOL = 5, V_SERIT = 6, V_EV = 7;
const VEG = [
  { name: 'Göl', burn: false, color: 0x3b6e8f },
  { name: 'Çam', burn: true, pveg: 0.4, dur: 5, color: 0x3f5a2a },
  { name: 'Meşe', burn: true, pveg: -0.2, dur: 8, color: 0x4d6230 },
  { name: 'Çalı (maki)', burn: true, pveg: 0, dur: 3, color: 0x6f7d3c },
  { name: 'Çayır', burn: true, pveg: -0.3, dur: 1, color: 0x9aa35a },
  { name: 'Orman yolu', burn: false, color: 0xa88f6a },
  { name: 'Yangın şeridi', burn: false, color: 0x8a6a48 },
  { name: 'Ev', burn: true, pveg: 0, dur: 12, color: 0x9aa35a },
];
const PRESETS = {
  karisik: { label: 'Karışık', f: [0.36, 0.28, 0.2, 0.16] },
  cam: { label: 'Çam ağırlıklı', f: [0.7, 0.1, 0.12, 0.08] },
  mese: { label: 'Meşe ağırlıklı', f: [0.1, 0.66, 0.14, 0.1] },
  maki: { label: 'Maki/çalılık', f: [0.08, 0.08, 0.64, 0.2] },
};

// --- Hücre dizileri ---
const NN = N * N;
const H = new Float32Array(NN);      // yükseklik (m)
const Y = new Float32Array(NN);      // görüntü yüksekliği
const veg = new Uint8Array(NN);
const origVeg = new Uint8Array(NN);
const state = new Uint8Array(NN);    // 0 yanmaz, 1 yakıt, 2 yanıyor, 3 kül
const burnT = new Uint8Array(NN);
const wet = new Float32Array(NN);    // dakika
let burning = [];
const idx = (i, j) => j * N + i;

// --- Arazi ---
const terrGeo = new THREE.PlaneGeometry(W, W, N - 1, N - 1);
terrGeo.rotateX(-Math.PI / 2);
const colors = new Float32Array(NN * 3);
terrGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
const terrain = new THREE.Mesh(terrGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
sim.scene.add(terrain);
// Kenar "etek" (arazinin yan yüzü)
const skirt = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 1, W + 0.2), new THREE.MeshLambertMaterial({ color: 0x5b4636 }));
sim.scene.add(skirt);
const water = new THREE.Mesh(new THREE.PlaneGeometry(W, W), new THREE.MeshLambertMaterial({ color: 0x3b82b6, transparent: true, opacity: 0.85 }));
water.rotation.x = -Math.PI / 2;
sim.scene.add(water);

let seed = 7;
let waterLevel = 0;
function genTerrain() {
  const noise = new ImprovedNoise();
  const ox = seed * 17.31, oz = seed * 7.77;
  let mn = Infinity, mx = -Infinity;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i / N, z = j / N;
    let h = 0.62 * noise.noise(x * 2.1 + ox, z * 2.1 + oz, 0.37) + 0.27 * noise.noise(x * 4.7 + oz, z * 4.7 + ox, 1.7) + 0.11 * noise.noise(x * 10 + ox, z * 10, 4.1);
    // Güneydoğuya doğru hafif alçalan eğim (köy vadide)
    h += -0.12 * (x + z);
    H[idx(i, j)] = h;
    mn = Math.min(mn, h); mx = Math.max(mx, h);
  }
  for (let k = 0; k < NN; k++) H[k] = ((H[k] - mn) / (mx - mn)) * 300; // 0–300 m rölyef
  const sorted = Float32Array.from(H).sort();
  waterLevel = sorted[Math.floor(NN * 0.05)];
  const pos = terrGeo.attributes.position;
  for (let k = 0; k < NN; k++) {
    Y[k] = (Math.max(H[k], waterLevel) / CELL_M) * VEX;
    pos.setY(k, (H[k] / CELL_M) * VEX);
  }
  pos.needsUpdate = true;
  terrGeo.computeVertexNormals();
  water.position.y = (waterLevel / CELL_M) * VEX + 0.05;
  skirt.position.y = -1.5;
  skirt.scale.y = 3;
}

let village = { i: 60, j: 50, houses: [] };
function genVegetation(presetKey) {
  const f = PRESETS[presetKey].f;
  const noise = new ImprovedNoise();
  const o = seed * 3.3;
  const score = new Float32Array(NN);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = idx(i, j);
    // Yüksek yerlerde çam, alçakta çalı/çayır
    score[k] = noise.noise(i * 0.09 + o, j * 0.09, 2.2) + 0.5 * noise.noise(i * 0.25, j * 0.25 + o, 5.5) + 0.9 * (H[k] / 300);
  }
  const land = [];
  for (let k = 0; k < NN; k++) if (H[k] > waterLevel) land.push(k); else veg[k] = V_WATER;
  land.sort((a, b) => score[b] - score[a]);
  const cum = [f[0], f[0] + f[1], f[0] + f[1] + f[2]];
  land.forEach((k, r) => {
    const q = r / land.length;
    veg[k] = q < cum[0] ? V_CAM : q < cum[1] ? V_MESE : q < cum[2] ? V_CALI : V_CAYIR;
  });
  // Orman yolu (kıvrımlı, 4-bağlantılı)
  let pj = Math.round(N * 0.3);
  for (let i = 0; i < N; i++) {
    const tj = Math.round(N * 0.3 + Math.sin(i * 0.09 + seed) * 7 + i * 0.25);
    while (pj !== tj) { setRoad(i, pj); pj += Math.sign(tj - pj); }
    setRoad(i, pj);
  }
  // Köy: güneydoğuda en düz, sudan olmayan yer
  let best = null, bestS = Infinity;
  for (let j = 44; j < 66; j++) for (let i = 54; i < 70; i++) {
    const k = idx(i, j);
    if (veg[k] === V_WATER || veg[k] === V_YOL) continue;
    const s = Math.abs(H[k] - H[idx(i + 2, j)]) + Math.abs(H[k] - H[idx(i, j + 2)]) + Math.abs(H[k] - H[idx(i - 2, j)]) + H[k] * 0.05;
    if (s < bestS) { bestS = s; best = [i, j]; }
  }
  village = { i: best[0], j: best[1], houses: [] };
  for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) {
    const i = best[0] + di, j = best[1] + dj, k = idx(i, j);
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    if (veg[k] !== V_WATER && veg[k] !== V_YOL && di * di + dj * dj <= 16) veg[k] = V_CAYIR;
  }
  const spots = [[-2, -2], [1, -2], [-3, 1], [0, 1], [3, 0], [1, 3]];
  for (const [di, dj] of spots) {
    const k = idx(best[0] + di, best[1] + dj);
    if (veg[k] === V_WATER || veg[k] === V_YOL) continue;
    veg[k] = V_EV;
    village.houses.push({ k, burned: false });
  }
  origVeg.set(veg);
}
function setRoad(i, j) {
  if (i < 0 || j < 0 || i >= N || j >= N) return;
  const k = idx(i, j);
  if (veg[k] !== V_WATER) veg[k] = V_YOL;
}

// --- Ağaçlar (instanced) ---
const treeGeos = {
  [V_CAM]: new THREE.ConeGeometry(0.36, 1.35, 6).translate(0, 0.75, 0),
  [V_MESE]: new THREE.IcosahedronGeometry(0.46, 0).scale(1, 0.85, 1).translate(0, 0.62, 0),
  [V_CALI]: new THREE.IcosahedronGeometry(0.32, 0).scale(1, 0.55, 1).translate(0, 0.14, 0),
};
const TREE_COL = { [V_CAM]: 0x1f4d2b, [V_MESE]: 0x3f6b2a, [V_CALI]: 0x5c7a2e };
const treeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
let treeMeshes = {};
const treeOf = new Int32Array(NN).fill(-1);
const tBase = []; // [x,y,z,s,rot]
function buildTrees() {
  Object.values(treeMeshes).forEach((m) => { m.removeFromParent(); m.dispose(); });
  treeMeshes = {};
  treeOf.fill(-1);
  const rnd = seeded(seed * 101 + 3);
  const counts = { [V_CAM]: 0, [V_MESE]: 0, [V_CALI]: 0 };
  for (let k = 0; k < NN; k++) if (counts[veg[k]] !== undefined) counts[veg[k]]++;
  for (const v of [V_CAM, V_MESE, V_CALI]) {
    const m = instanced(treeGeos[v], treeMat, Math.max(1, counts[v]));
    m.count = counts[v];
    m.userData.n = 0;
    treeMeshes[v] = m;
    sim.scene.add(m);
  }
  tBase.length = 0;
  for (let k = 0; k < NN; k++) {
    const m = treeMeshes[veg[k]];
    if (!m) continue;
    const i = k % N, j = (k / N) | 0;
    const n = m.userData.n++;
    treeOf[k] = n;
    tBase[k] = [i - HALF + 0.5 + (rnd() - 0.5) * 0.5, Y[k] - 0.05, j - HALF + 0.5 + (rnd() - 0.5) * 0.5, 0.8 + rnd() * 0.45, rnd() * 6.28, rnd()];
    setTree(k);
  }
  for (const m of Object.values(treeMeshes)) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
function setTree(k) {
  const v = origVeg[k];
  const m = treeMeshes[v];
  if (!m || treeOf[k] < 0) return;
  const b = tBase[k];
  let sx = b[3], sy = b[3];
  if (veg[k] === V_SERIT) { sx = sy = 0.0001; _c.setHex(0x000000); }
  else if (state[k] === 2) _c.setHex(b[5] > 0.5 ? 0xff5a14 : 0xffa826);
  else if (state[k] === 3) { _c.setHex(0x1c1917); sx *= 0.55; sy *= 0.85; }
  else { _c.setHex(TREE_COL[v]); _c.offsetHSL(0, 0, (b[5] - 0.5) * 0.08); if (wet[k] > 0) _c.lerp(_v2c.setHex(0x3b6e8f), 0.35); }
  _q.setFromAxisAngle(UP, b[4]);
  _m.compose(_v.set(b[0], b[1], b[2]), _q, _s.set(sx, sy, sx));
  m.setMatrixAt(treeOf[k], _m);
  m.setColorAt(treeOf[k], _c);
  m.instanceMatrix.needsUpdate = true;
  m.instanceColor.needsUpdate = true;
}
const _v2c = new THREE.Color();

function setGround(k) {
  const v = veg[k];
  if (state[k] === 2) _c.setHex(0xff6a1a);
  else if (state[k] === 3) _c.setHex(0x2a2522);
  else {
    _c.setHex(VEG[v].color);
    if (v !== V_WATER && H[k] > 250) _c.lerp(_v2c.setHex(0x8f8a78), (H[k] - 250) / 60);
    if (wet[k] > 0) _c.lerp(_v2c.setHex(0x3b6e8f), 0.45);
  }
  colors[k * 3] = _c.r; colors[k * 3 + 1] = _c.g; colors[k * 3 + 2] = _c.b;
  colorDirty = true;
}
let colorDirty = false;
function paint(k) { setGround(k); setTree(k); }

// --- Köy evleri ---
const houseGroup = new THREE.Group();
sim.scene.add(houseGroup);
const wallMat = new THREE.MeshLambertMaterial({ color: 0xf1e3c8 });
const roofMat = new THREE.MeshLambertMaterial({ color: 0xb4432f });
const burntMat = new THREE.MeshLambertMaterial({ color: 0x24201d });
let villageLabel;
function buildHouses() {
  disposeObject(houseGroup);
  sim.scene.add(houseGroup);
  houseGroup.clear();
  for (const h of village.houses) {
    const i = h.k % N, j = (h.k / N) | 0;
    const g = new THREE.Group();
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.7), wallMat);
    w.position.y = 0.3;
    const r = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.45, 4), roofMat);
    r.position.y = 0.82; r.rotation.y = Math.PI / 4;
    g.add(w, r);
    g.position.set(i - HALF + 0.5, Y[h.k], j - HALF + 0.5);
    houseGroup.add(g);
    h.mesh = g;
  }
  if (villageLabel) villageLabel.removeFromParent();
  villageLabel = sim.label('🏘 Köy', { position: [village.i - HALF + 0.5, Y[idx(village.i, village.j)] + 3, village.j - HALF + 0.5] });
}

// --- Parçacıklar: alev ve duman ---
function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.45, 'rgba(255,255,255,.5)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const DOT = softDot();
function particleSystem(max, additive) {
  const geo = new THREE.BufferGeometry();
  const P = new Float32Array(max * 3), C = new Float32Array(max * 3), A = new Float32Array(max), S = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  geo.setAttribute('alpha', new THREE.BufferAttribute(A, 1));
  geo.setAttribute('size', new THREE.BufferAttribute(S, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: DOT }, scale: { value: 300 } },
    vertexShader: `attribute float alpha; attribute float size; attribute vec3 color; varying float vA; varying vec3 vC; uniform float scale;
      void main(){ vA=alpha; vC=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/max(-mv.z,1.0); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC;
      void main(){ vec4 t=texture2D(map, gl_PointCoord); gl_FragColor=vec4(vC, t.a*vA); }`,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  sim.scene.add(pts);
  const life = new Float32Array(max), maxLife = new Float32Array(max), vel = new Float32Array(max * 3);
  return { pts, geo, P, C, A, S, life, maxLife, vel, max, next: 0 };
}
const flames = particleSystem(900, true);
const smoke = particleSystem(700, false);
const drops = particleSystem(500, false);
function spawn(ps, x, y, z, vx, vy, vz, lifeS, size, r, g, b) {
  const n = ps.next; ps.next = (n + 1) % ps.max;
  ps.P[n * 3] = x; ps.P[n * 3 + 1] = y; ps.P[n * 3 + 2] = z;
  ps.vel[n * 3] = vx; ps.vel[n * 3 + 1] = vy; ps.vel[n * 3 + 2] = vz;
  ps.life[n] = lifeS; ps.maxLife[n] = lifeS; ps.S[n] = size;
  ps.C[n * 3] = r; ps.C[n * 3 + 1] = g; ps.C[n * 3 + 2] = b;
}

// --- Rüzgâr oku ---
const windArrow = new THREE.Group();
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1, 10).rotateZ(-Math.PI / 2).translate(0.5, 0, 0), arrowMat);
const head = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 12).rotateZ(-Math.PI / 2), arrowMat);
windArrow.add(shaft, head);
windArrow.position.set(-HALF + 6, 26, -HALF + 4);
sim.scene.add(windArrow);
const windLabel = sim.label('', { parent: windArrow, position: [0, 3.2, 0] });
// Pusula harfleri
for (const [t, x, z] of [['K', 0, -HALF - 3], ['G', 0, HALF + 3], ['D', HALF + 3, 0], ['B', -HALF - 3, 0]]) sim.label(t, { position: [x, 2, z], className: 'plain big' });

// --- Su uçağı ---
const plane = new THREE.Group();
{
  const y = new THREE.MeshLambertMaterial({ color: 0xfacc15 }), r = new THREE.MeshLambertMaterial({ color: 0xdc2626 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.35, 6, 10).rotateZ(Math.PI / 2), y);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 9), r);
  wing.position.set(0.3, 0.55, 0);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.15), r);
  tail.position.set(-2.7, 0.8, 0);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 3), y);
  stab.position.set(-2.7, 1.4, 0);
  plane.add(body, wing, tail, stab);
  plane.visible = false;
  sim.scene.add(plane);
}
const flight = { active: false, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), target: null, dropped: false };
let planeCooldown = 0; // dakika
const REFILL_MIN = 12;
const DROP_R = 2.6; // hücre (≈50 m)

function sendPlane(i, j) {
  if (flight.active) { sim.toast('Uçak zaten görevde.', 'warn'); return; }
  if (planeCooldown > 0) { sim.toast(`✈️ Uçak su alıyor: ${Math.ceil(planeCooldown)} dk sonra hazır.`, 'warn'); return; }
  const k = idx(i, j);
  const tx = i - HALF + 0.5, tz = j - HALF + 0.5, ty = Y[k] + 9;
  // Uçak rüzgâra karşı yaklaşır
  const dx = -wind.x, dz = -wind.z, L = Math.hypot(dx, dz) || 1;
  const ux = L > 0.01 ? dx / L : 1, uz = L > 0.01 ? dz / L : 0;
  flight.from.set(tx - ux * 70, ty + 6, tz - uz * 70);
  flight.to.set(tx + ux * 70, ty + 6, tz + uz * 70);
  flight.target = { i, j, x: tx, y: ty, z: tz };
  flight.active = true; flight.t = 0; flight.dropped = false;
  plane.visible = true;
  plane.rotation.set(0, -Math.atan2(uz, ux), 0);
}
function applyDrop(ci, cj) {
  let put = 0;
  const R = Math.ceil(DROP_R);
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
    if (di * di + dj * dj > DROP_R * DROP_R) continue;
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const k = idx(i, j);
    if (state[k] === 2) { state[k] = 1; burnT[k] = 0; put++; }
    if (state[k] === 1) wet[k] = 90;
    paint(k);
  }
  if (put) burning = burning.filter((k) => state[k] === 2);
  planeCooldown = REFILL_MIN;
  sim.toast(put ? `💧 ${put} hücrede alev söndürüldü. Islak alan ~90 dk tutuşmaz.` : '💧 Su bırakıldı: bitki ıslandı, tutuşması zorlaştı.', 'good');
}

// --- Durum ---
let minutes = 0, stepAcc = 0, fuel0 = 0, extinguishedToast = true, breakMeters = 0;
const hist = [];
const wind = { x: 1, z: 0, V: 0 };
const dirW = new Float32Array(8);
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function computeWind() {
  const th = (windDir.value * Math.PI) / 180; // nereden esiyor (0 = kuzey)
  wind.x = -Math.sin(th); wind.z = Math.cos(th); // estiği yön (kuzey = -z)
  wind.V = windSpeed.value / 3.6; // m/s
  for (let n = 0; n < 8; n++) {
    const [dx, dz] = NB[n];
    const L = Math.hypot(dx, dz);
    const cos = (dx * wind.x + dz * wind.z) / L;
    dirW[n] = Math.exp(wind.V * (0.045 + 0.131 * (cos - 1)));
  }
  // Ok
  windArrow.rotation.y = -Math.atan2(wind.z, wind.x);
  const len = 3 + windSpeed.value * 0.25;
  shaft.scale.x = len;
  head.position.x = len + 1.1;
  windArrow.visible = windSpeed.value > 0.5;
  windLabel.setText(`💨 Rüzgâr ${fmt(windSpeed.value, 0)} km/sa · ${compass(windDir.value)}`);
}
const DIRS = ['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı'];
const compass = (d) => `${DIRS[Math.round(d / 45) % 8]}dan`.replace('kuzeydan', 'kuzeyden').replace('doğudan', 'doğudan').replace('batıdan', 'batıdan').replace('güneydan', 'güneyden');
const moisture = () => clamp(Math.exp(-0.035 * (humidity.value - 30)), 0.12, 1.6);
const DENS = { seyrek: -0.4, normal: 0, sik: 0.3 };

function ignite(k) {
  if (state[k] !== 1) return false;
  state[k] = 2;
  burnT[k] = VEG[veg[k]].dur;
  wet[k] = 0;
  burning.push(k);
  paint(k);
  if (veg[k] === V_EV) {
    const h = village.houses.find((x) => x.k === k);
    if (h && !h.burned) {
      h.burned = true;
      h.mesh.children.forEach((c) => (c.material = burntMat));
      sim.toast('🏚 Köyde bir ev yandı!', 'bad');
    }
  }
  extinguishedToast = false;
  return true;
}

function step() {
  minutes++;
  if (planeCooldown > 0) planeCooldown--;
  const PH = 0.58 * moisture();
  const den = 1 + DENS[density.value];
  const next = [];
  const spotOn = spotting.value && wind.V > 5;
  for (const k of burning) {
    if (state[k] !== 2) continue;
    const i = k % N, j = (k / N) | 0;
    const dur = VEG[veg[k]].dur;
    for (let n = 0; n < 8; n++) {
      const ni = i + NB[n][0], nj = j + NB[n][1];
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = nj * N + ni;
      if (state[nk] !== 1) continue;
      const dist = n < 4 ? CELL_M : CELL_M * Math.SQRT2;
      const slopeDeg = (Math.atan((H[nk] - H[k]) / dist) * 180) / Math.PI;
      let p = PH * (1 + VEG[veg[nk]].pveg) * den * dirW[n] * Math.exp(0.078 * slopeDeg);
      if (wet[nk] > 0) p *= 0.05;
      if (p >= 1) p = 1;
      // Yanma süresine yayılmış olasılık: toplamda ≈ p
      const ps = 1 - Math.pow(1 - p, 1 / dur);
      if (Math.random() < ps) next.push(nk);
    }
    // Kıvılcım sıçraması (yalnız çam, rüzgâr > 5 m/s)
    if (spotOn && veg[k] === V_CAM && Math.random() < 0.006 * (wind.V - 5)) {
      const d = 3 + Math.random() * wind.V * 0.9; // hücre (≈60–300 m)
      const a = (Math.random() - 0.5) * 0.5;
      const ca = Math.cos(a), sa = Math.sin(a);
      const si = Math.round(i + (wind.x * ca - wind.z * sa) * d), sj = Math.round(j + (wind.x * sa + wind.z * ca) * d);
      if (si >= 0 && sj >= 0 && si < N && sj < N) {
        const sk = sj * N + si;
        if (state[sk] === 1 && wet[sk] <= 0 && Math.random() < 0.5 * moisture()) { next.push(sk); spotted++; }
      }
    }
    if (--burnT[k] <= 0) { state[k] = 3; paint(k); }
  }
  burning = burning.filter((k) => state[k] === 2);
  for (const k of next) ignite(k);
  // Kuruma
  if (minutes % 5 === 0) for (let k = 0; k < NN; k++) if (wet[k] > 0) { wet[k] -= 5; if (wet[k] <= 0) { wet[k] = 0; paint(k); } }
  if (!burning.length && !extinguishedToast) {
    extinguishedToast = true;
    sim.toast(`🧯 Yangın söndü. Toplam yanan alan: ${fmt(burnedHa(), 1)} ha`, 'good');
  }
  if (minutes % 5 === 0) {
    const b = burnedHa();
    hist.push([minutes, b]);
    if (hist.length > 400) hist.shift();
    chart.push([b, burning.length * HA]);
  }
}
let spotted = 0;
function burnedHa() {
  let c = 0;
  for (let k = 0; k < NN; k++) if (state[k] >= 2 && origVeg[k] !== V_WATER) c++;
  return c * HA;
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('🖱 Tıklama modu');
const modeSeg = ui.segmented({
  options: [{ value: 'fire', label: '🔥 Tutuştur' }, { value: 'break', label: '🚧 Şerit çiz' }, { value: 'water', label: '✈️ Su bırak' }],
  value: 'fire',
  onChange: (v) => {
    if (sim.controls) sim.controls.enableRotate = v !== 'break';
    modeHelp.set({ fire: 'Araziye tıkla: o noktada yangın başlar.', break: 'Sol tuşla <b>sürükleyerek</b> yangın şeridi çiz (bitki temizlenir, ~60 m genişlik). Döndürmek için modu değiştir; sağ tuşla kaydırabilirsin.', water: 'Araziye tıkla: su uçağı rüzgâra karşı gelip ~100 m çaplı alana su bırakır.' }[v]);
  },
});
const modeHelp = ui.text('Araziye tıkla: o noktada yangın başlar.', 'card');

ui.section('🌬 Hava');
const windSpeed = ui.slider({ label: 'Rüzgâr hızı', min: 0, max: 60, step: 1, value: 20, unit: 'km/sa', onChange: () => computeWind() });
const windDir = ui.slider({ label: 'Rüzgâr yönü (nereden)', min: 0, max: 359, step: 1, value: 270, format: (v) => `${fmt(v, 0)}° · ${compass(v)}`, onChange: () => computeWind() });
const humidity = ui.slider({ label: 'Bağıl nem', min: 5, max: 90, step: 1, value: 25, unit: '%', onChange: () => humidityTone() });
const spotting = ui.toggle({ label: 'Kıvılcım sıçraması (közler uçar)', value: true });

ui.section('🌲 Orman');
const presetSel = ui.select({ label: 'Bitki örtüsü', options: Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })), value: 'karisik', onChange: () => rebuild() });
const density = ui.segmented({ label: 'Orman yoğunluğu', options: [{ value: 'seyrek', label: 'Seyrek' }, { value: 'normal', label: 'Normal' }, { value: 'sik', label: 'Sık' }], value: 'normal' });
ui.buttons([
  { label: '🗺 Yeni arazi', onClick: () => { seed = (seed * 31 + 11) % 997; rebuild(); } },
  { label: '🧹 Şeritleri sil', onClick: () => clearBreaks() },
]);
ui.buttons([
  { label: '🔥 Rastgele tutuştur', variant: 'danger', onClick: () => randomIgnite() },
  { label: '✈️ Alev cephesine su', variant: 'primary', onClick: () => autoDrop() },
]);

ui.section('📊 Durum');
const stBurn = ui.stat({ label: 'Yanan alan', unit: 'ha' });
const stActive = ui.stat({ label: 'Şu an yanan', unit: 'ha' });
const stRate = ui.stat({ label: 'Yanma hızı', unit: 'ha/sa' });
const stSaved = ui.stat({ label: 'Kurtarılan orman', unit: '%' });
const stVillage = ui.stat({ label: 'Köy (sağlam ev)' });
const stPlane = ui.stat({ label: 'Su uçağı' });
const chart = ui.chart({ title: 'Yanan alan (ha) — zamanla', series: [{ name: 'Toplam yanan', color: '#f97316', fill: true }, { name: 'Aktif yangın', color: '#ef4444' }], maxPoints: 240 });
const riskCard = ui.text('', 'card');

function humidityTone() {
  const h = humidity.value;
  const m = moisture();
  riskCard.set(`Yangın riski: <b style="color:${m > 1.2 ? 'var(--bad)' : m > 0.7 ? 'var(--warn)' : 'var(--good)'}">${m > 1.2 ? 'çok yüksek' : m > 0.7 ? 'yüksek' : m > 0.35 ? 'orta' : 'düşük'}</b> · nem %${fmt(h, 0)}, rüzgâr ${fmt(windSpeed.value, 0)} km/sa.
    <br><small>"30-30-30 kuralı": sıcaklık > 30 °C, nem < %30, rüzgâr > 30 km/sa ise yangın riski en yüksektir.</small>`);
}

function updateStats() {
  const b = burnedHa();
  stBurn.set(b, b > 50 ? 'bad' : b > 10 ? 'warn' : '');
  stActive.set(burning.length * HA, burning.length ? 'bad' : 'good');
  // Son 60 dakikadaki artış
  let rate = 0;
  if (hist.length > 1) {
    const last = hist[hist.length - 1];
    let first = hist[0];
    for (let q = hist.length - 1; q >= 0; q--) { if (last[0] - hist[q][0] >= 60) { first = hist[q]; break; } first = hist[q]; }
    const dm = last[0] - first[0];
    if (dm > 0) rate = ((last[1] - first[1]) / dm) * 60;
  }
  stRate.set(rate, rate > 30 ? 'bad' : rate > 5 ? 'warn' : '');
  let alive = 0;
  for (let k = 0; k < NN; k++) { const v = origVeg[k]; if ((v === V_CAM || v === V_MESE || v === V_CALI) && state[k] === 1) alive++; }
  const saved = fuel0 ? (100 * alive) / fuel0 : 100;
  stSaved.set(saved, saved > 90 ? 'good' : saved > 70 ? 'warn' : 'bad');
  const ok = village.houses.filter((h) => !h.burned).length;
  stVillage.set(`${ok}/${village.houses.length}`, ok === village.houses.length ? 'good' : ok ? 'warn' : 'bad');
  stPlane.set(flight.active ? 'Görevde' : planeCooldown > 0 ? `${Math.ceil(planeCooldown)} dk` : 'Hazır', flight.active || planeCooldown > 0 ? 'warn' : 'good');
}

// --- Etkileşim ---
function cellFromHit(p) {
  const i = Math.floor(p.x + HALF), j = Math.floor(p.z + HALF);
  return i >= 0 && j >= 0 && i < N && j < N ? [i, j] : null;
}
sim.onClick([terrain], (hit) => {
  const c = cellFromHit(hit.point);
  if (!c) return;
  if (modeSeg.value === 'fire') {
    let n = 0;
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const i = c[0] + di, j = c[1] + dj;
      if (i >= 0 && j >= 0 && i < N && j < N && ignite(idx(i, j))) n++;
    }
    if (!n) sim.toast('Burada yanacak bir şey yok (su, yol, şerit ya da kül).', 'warn');
  } else if (modeSeg.value === 'water') sendPlane(c[0], c[1]);
});

let drawing = false, lastPt = null;
function stamp(fi, fj) {
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (di * di + dj * dj > 1) continue;
    const i = Math.floor(fi) + di, j = Math.floor(fj) + dj;
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const k = idx(i, j);
    if (state[k] !== 1 || veg[k] === V_EV) continue;
    veg[k] = V_SERIT; state[k] = 0;
    paint(k);
  }
}
function drawAt(e) {
  const hits = sim.raycast(e, [terrain]);
  if (!hits.length) return;
  const fi = hits[0].point.x + HALF, fj = hits[0].point.z + HALF;
  if (lastPt) {
    const d = Math.hypot(fi - lastPt[0], fj - lastPt[1]);
    const n = Math.ceil(d / 0.3);
    for (let s = 1; s <= n; s++) stamp(lerp(lastPt[0], fi, s / n), lerp(lastPt[1], fj, s / n));
    breakMeters += d * CELL_M;
  } else stamp(fi, fj);
  lastPt = [fi, fj];
}
sim.dom.addEventListener('pointerdown', (e) => {
  if (modeSeg.value !== 'break' || e.button !== 0) return;
  drawing = true; lastPt = null;
  drawAt(e);
});
sim.dom.addEventListener('pointermove', (e) => { if (drawing) drawAt(e); });
const endDraw = () => {
  if (drawing && breakMeters > 0) sim.toast(`🚧 Yangın şeridi: toplam ${fmt(breakMeters, 0)} m`, '');
  drawing = false; lastPt = null;
};
sim.dom.addEventListener('pointerup', endDraw);
sim.dom.addEventListener('pointerleave', endDraw);

function clearBreaks() {
  for (let k = 0; k < NN; k++) if (veg[k] === V_SERIT) { veg[k] = origVeg[k]; state[k] = VEG[veg[k]].burn ? 1 : 0; paint(k); }
  breakMeters = 0;
}
function randomIgnite() {
  for (let tries = 0; tries < 200; tries++) {
    const k = Math.floor(Math.random() * NN);
    if (state[k] === 1 && veg[k] !== V_EV) {
      ignite(k);
      const i = k % N, j = (k / N) | 0;
      sim.toast(`🔥 Yeni yangın: ${Math.round(i * CELL_M)} m doğu, ${Math.round(j * CELL_M)} m güney`, 'bad');
      return;
    }
  }
}
function autoDrop() {
  if (!burning.length) { sim.toast('Şu an yanan bir alan yok.', 'warn'); return; }
  // Rüzgâr yönünde en öndeki yanan hücre (alev cephesi)
  let best = burning[0], bs = -Infinity;
  for (const k of burning) {
    const s = (k % N) * wind.x + ((k / N) | 0) * wind.z + Math.random() * 0.5;
    if (s > bs) { bs = s; best = k; }
  }
  sendPlane(best % N, (best / N) | 0);
}

// --- Döngü ---
const STEP_REAL = 0.25; // 1× hızda 1 dakikalık adım = 0,25 s
sim.onUpdate((dt) => {
  stepAcc += dt / STEP_REAL;
  let n = 0;
  while (stepAcc >= 1 && n < 40) { step(); stepAcc -= 1; n++; }
  if (n >= 40) stepAcc = 0;
});

let uiTick = 0;
sim.onRender((real) => {
  const dtp = sim.paused ? 0 : real * Math.min(sim.speed, 3);
  if (colorDirty) { terrGeo.attributes.color.needsUpdate = true; colorDirty = false; }
  // Alevler ve duman
  const nb = burning.length;
  if (dtp > 0 && nb) {
    const fl = Math.min(nb * 2, 60), sm = Math.min(Math.ceil(nb / 3), 14);
    for (let q = 0; q < fl; q++) {
      const k = burning[(Math.random() * nb) | 0];
      const x = (k % N) - HALF + Math.random(), z = ((k / N) | 0) - HALF + Math.random();
      const big = veg[k] === V_CAM || veg[k] === V_MESE ? 1.4 : 0.8;
      spawn(flames, x, Y[k] + 0.2, z, wind.x * 0.4, 1.4 + Math.random() * 1.6, wind.z * 0.4, 0.35 + Math.random() * 0.4, (1.4 + Math.random()) * big, 1, 0.45 + Math.random() * 0.4, 0.1);
    }
    for (let q = 0; q < sm; q++) {
      const k = burning[(Math.random() * nb) | 0];
      const x = (k % N) - HALF + Math.random(), z = ((k / N) | 0) - HALF + Math.random();
      const gcol = 0.25 + Math.random() * 0.2;
      spawn(smoke, x, Y[k] + 1.5, z, wind.x * (0.6 + wind.V * 0.35), 2.2 + Math.random(), wind.z * (0.6 + wind.V * 0.35), 5 + Math.random() * 3, 3 + Math.random() * 2, gcol, gcol, gcol * 1.05);
    }
  }
  for (const ps of [flames, smoke, drops]) {
    let any = false;
    for (let n = 0; n < ps.max; n++) {
      if (ps.life[n] <= 0) { if (ps.A[n] !== 0) { ps.A[n] = 0; any = true; } continue; }
      any = true;
      ps.life[n] -= dtp;
      const f = Math.max(0, ps.life[n] / ps.maxLife[n]);
      ps.P[n * 3] += ps.vel[n * 3] * dtp; ps.P[n * 3 + 1] += ps.vel[n * 3 + 1] * dtp; ps.P[n * 3 + 2] += ps.vel[n * 3 + 2] * dtp;
      if (ps === smoke) { ps.A[n] = Math.min(1, (1 - f) * 4) * f * 0.55; ps.S[n] += dtp * 1.6; }
      else if (ps === flames) { ps.A[n] = f * 0.9; ps.C[n * 3 + 1] *= 1 - dtp * 1.5; }
      else { ps.A[n] = f * 0.8; ps.vel[n * 3 + 1] -= 18 * dtp; }
    }
    if (any) { ps.geo.attributes.position.needsUpdate = true; ps.geo.attributes.alpha.needsUpdate = true; ps.geo.attributes.size.needsUpdate = true; ps.geo.attributes.color.needsUpdate = true; }
  }
  // Uçak (gerçek zamanlı animasyon; duraklatılınca bekler)
  if (flight.active && !sim.paused) {
    flight.t += real / 3.2;
    const t = Math.min(flight.t, 1);
    plane.position.lerpVectors(flight.from, flight.to, t);
    plane.position.y = flight.from.y - Math.sin(Math.PI * t) * 5;
    if (!flight.dropped && t >= 0.47) {
      flight.dropped = true;
      applyDrop(flight.target.i, flight.target.j);
    }
    if (flight.dropped && t < 0.62) {
      for (let q = 0; q < 14; q++) spawn(drops, plane.position.x + (Math.random() - 0.5) * 2, plane.position.y - 0.6, plane.position.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, -2, (Math.random() - 0.5) * 3, 0.8, 1.6 + Math.random(), 0.75, 0.88, 1);
    }
    if (flight.t >= 1) { flight.active = false; plane.visible = false; }
  }
  if (++uiTick % 10 === 0) updateStats();
});

sim.formatTime = () => `${Math.floor(minutes / 60)} sa ${String(minutes % 60).padStart(2, '0')} dk`;

// --- Kurulum / sıfırlama ---
function resetFire() {
  state.fill(0); burnT.fill(0); wet.fill(0);
  veg.set(origVeg);
  burning = [];
  fuel0 = 0;
  for (let k = 0; k < NN; k++) {
    state[k] = VEG[veg[k]].burn ? 1 : 0;
    const v = veg[k];
    if (v === V_CAM || v === V_MESE || v === V_CALI) fuel0++;
  }
  for (let k = 0; k < NN; k++) setGround(k);
  buildTrees();
  village.houses.forEach((h) => { h.burned = false; });
  buildHouses();
  minutes = 0; stepAcc = 0; hist.length = 0; spotted = 0; breakMeters = 0; planeCooldown = 0;
  flight.active = false; plane.visible = false;
  for (const ps of [flames, smoke, drops]) ps.life.fill(0);
  chart.clear();
  extinguishedToast = true;
  // Başlangıç yangını: batıdaki bir ormanlık hücre (rüzgâr doğuya eserken köye doğru)
  let start = -1;
  for (let r = 0; r < 20 && start < 0; r++) for (let dj = -r; dj <= r && start < 0; dj++) for (let di = -r; di <= r; di++) {
    const i = 16 + di, j = 46 + dj;
    if (i < 0 || j < 0 || i >= N || j >= N) continue;
    const k = idx(i, j);
    if (state[k] === 1 && (veg[k] === V_CAM || veg[k] === V_CALI || veg[k] === V_MESE)) { start = k; break; }
  }
  if (start >= 0) {
    const si = start % N, sj = (start / N) | 0;
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) if (si + di >= 0 && sj + dj >= 0 && si + di < N && sj + dj < N) ignite(idx(si + di, sj + dj));
  }
  updateStats();
}
function rebuild() {
  genTerrain();
  genVegetation(presetSel.value);
  resetFire();
}

sim.onReset(() => resetFire());
computeWind();
humidityTone();
rebuild();
sim.toast('🔥 Batıda bir yangın başladı. Rüzgâr doğudaki köye doğru esiyor!', 'warn');
