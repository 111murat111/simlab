// Arı Kolonisi — kraliçe, işçiler, bal-polen ve mevsimler; koloniyi kıştan sağ çıkar.
import { createSim, THREE, BufferGeometryUtils, clamp, lerp, seeded, fmt, rand } from '@core';
import * as M from './model.js';

const DAYS_PER_SEC = 2;
const HIVE = new THREE.Vector3(-3.2, 0, 2.2);
const ENTR = new THREE.Vector3(-2.2, 0.55, 2.2);

const sim = createSim({
  background: 0x9fd4f5,
  camera: { position: [7, 8.5, 15], target: [-2, 2, -0.5], fov: 50 },
  controls: { minDistance: 5, maxDistance: 45 },
  lights: false,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Solda <b>kovanın içi</b> (petek kesiti), ortada kovan, sağda çayır var. Her altıgen gözün içinde bir şey saklanır:</p>
    <ul>
      <li>⚪ <b>Yumurta</b> → 🐛 <b>larva</b> → 🟫 <b>kapalı yavru</b> (pupa). Yumurtadan işçi arı çıkması <b>21 gün</b> sürer.</li>
      <li>🟠 <b>Bal</b> (nektardan yapılır) ve 🟡 <b>polen</b> (arıların protein kaynağı, larvaları besler).</li>
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
    </ul>
    <p><small>Sayılar basitleştirilmiş bir nüfus modelinden gelir (gerçek kovanlara yakın ama temsili). Bir yıl = 360 gün.</small></p>`,
});

// --- Model durumu ---
const O = { flowers: 150, rainChance: 0.2, pesticide: false, varroa: false, harvestFrac: 0.3 };
let col, rng, dayAcc = 0, lastSeason = -1, ended = false;

// --- Işık ve zemin ---
const scene = sim.scene;
const hemi = new THREE.HemisphereLight(0xffffff, 0x4a6b2a, 1.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d0, 2.2);
sun.position.set(10, 16, 8);
scene.add(sun);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x6fbf4a, roughness: 1 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(34, 48), groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Uzak ağaçlar (dekor)
{
  const trunkG = new THREE.CylinderGeometry(0.15, 0.22, 1.4, 8);
  const topG = new THREE.ConeGeometry(1, 2.4, 10);
  const r = seeded(4);
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 1.3 - Math.PI * 0.9, d = 22 + r() * 8;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x6b4423 }));
    trunk.position.y = 0.7;
    const top = new THREE.Mesh(topG, new THREE.MeshStandardMaterial({ color: 0x2f7a3a }));
    top.position.y = 2.4;
    t.add(trunk, top);
    t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    t.scale.setScalar(1 + r() * 0.8);
    scene.add(t);
  }
}

// --- Kovan kutusu ---
{
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
  const stand = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 2.2), mat(0x5b4636));
  stand.position.y = 0.18;
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(2, 1.1, 2), mat(0xf4d35e));
  b1.position.y = 0.95;
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 2), mat(0xf0a04b));
  b2.position.y = 1.95;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.25, 2.3), mat(0xb45309));
  roof.position.y = 2.53;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.9), new THREE.MeshBasicMaterial({ color: 0x1a1208 }));
  slot.position.set(1.01, 0.48, 0);
  g.add(stand, b1, b2, roof, slot);
  g.position.copy(HIVE);
  scene.add(g);
  sim.label('🏠 Kovan', { position: [HIVE.x, 3.1, HIVE.z], className: 'plain' });
}

// --- Arı geometrisi (çizgili gövde + kanat) ---
function beeGeometry(scale = 1) {
  const body = new THREE.SphereGeometry(0.09, 12, 8);
  body.scale(1, 0.9, 1.7);
  const pos = body.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    const stripe = z < 0.05 && Math.floor((z + 0.2) * 28) % 2 === 0;
    const c = z > 0.1 ? [0.1, 0.08, 0.05] : stripe ? [0.12, 0.1, 0.06] : [1, 0.78, 0.1];
    col.set(c, i * 3);
  }
  body.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const wing = (s) => {
    const w = new THREE.CircleGeometry(0.1, 8);
    w.scale(1, 0.55, 1);
    w.rotateX(-Math.PI / 2);
    w.translate(s * 0.1, 0.08, -0.02);
    w.setAttribute('color', new THREE.BufferAttribute(new Float32Array(w.attributes.position.count * 3).fill(0.92), 3));
    return w;
  };
  const g = BufferGeometryUtils.mergeGeometries([body.toNonIndexed(), wing(1).toNonIndexed(), wing(-1).toNonIndexed()]);
  g.scale(scale, scale, scale);
  return g;
}
const beeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
const dummy = new THREE.Object3D();
// Petek düzleminde yatan arı: sırtı dışarı (+z), başı a açısına
const flat = (o, a) => { o.rotation.order = 'ZYX'; o.rotation.set(Math.PI / 2, 0, a + Math.PI / 2); };

// --- Petek kesiti ---
const COMB_C = 26, COMB_R = 16, HR = 0.2;
const comb = new THREE.Group();
comb.position.set(-8.6, 3.4, -2.8);
comb.rotation.y = 0.62;
scene.add(comb);
const HX = Math.sqrt(3) * HR, HY = 1.5 * HR;
const combW = COMB_C * HX, combH = COMB_R * HY;
{
  const back = new THREE.Mesh(new THREE.BoxGeometry(combW + 0.6, combH + 0.6, 0.12), new THREE.MeshStandardMaterial({ color: 0x8a5a2b }));
  back.position.z = -0.1;
  comb.add(back);
  const legG = new THREE.BoxGeometry(0.2, 3.4, 0.2), legM = new THREE.MeshStandardMaterial({ color: 0x5b3a1e });
  [-1, 1].forEach((s) => { const l = new THREE.Mesh(legG, legM); l.position.set(s * (combW / 2 + 0.1), -combH / 2 - 1.5, -0.1); comb.add(l); });
}
const cellGeo = new THREE.CylinderGeometry(HR * 0.93, HR * 0.93, 0.08, 6);
cellGeo.rotateX(Math.PI / 2);
const cells = new THREE.InstancedMesh(cellGeo, new THREE.MeshStandardMaterial({ roughness: 0.55 }), COMB_C * COMB_R);
comb.add(cells);
const cellPos = [];
for (let r = 0; r < COMB_R; r++) for (let c = 0; c < COMB_C; c++) {
  const x = -combW / 2 + HX * (c + 0.5 + (r % 2 ? 0.5 : 0)) - HX * 0.25;
  const y = combH / 2 - HY * (r + 0.5);
  cellPos.push(new THREE.Vector3(x, y, 0));
  dummy.position.set(x, y, 0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
  cells.setMatrixAt(cellPos.length - 1, dummy.matrix);
}
const NC = cellPos.length;
// Hücre sıraları: yavru merkezde, bal üstte
const cellHash = cellPos.map((_, i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1);
const byCenter = [...cellPos.keys()].sort((a, b) => nd(cellPos[a]) - nd(cellPos[b]));
function nd(p) { return Math.hypot(p.x / (combW * 0.5), (p.y + combH * 0.08) / (combH * 0.62)); }
const CELL = {
  empty: new THREE.Color(0xe9d8a6), egg: new THREE.Color(0xfffdf5), larva: new THREE.Color(0xfff0c2),
  capped: new THREE.Color(0xa86b32), honey: new THREE.Color(0xf29f05), cappedHoney: new THREE.Color(0xf7d774),
  pollen: [new THREE.Color(0xf97316), new THREE.Color(0xfacc15), new THREE.Color(0xdc2626), new THREE.Color(0xa3e635)],
};
const cellKind = new Array(NC).fill('empty');
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
  for (let i = 0; i < NC; i++) {
    const kind = cellKind[i];
    const c = kind === 'pollen' ? CELL.pollen[Math.floor(cellHash[i] * 4)] : kind === 'honey' ? (cellHash[i] < Math.min(0.8, col.honey / 50) ? CELL.cappedHoney : CELL.honey) : CELL[kind];
    cells.setColorAt(i, c);
  }
  cells.instanceColor.needsUpdate = true;
}
const combLbl = sim.label('🔍 Kovanın içi — petek kesiti', { parent: comb, position: [0, combH / 2 + 0.6, 0] });

// Petek üzerindeki arılar, kraliçe ve dansçı
const COMB_BEES = 150;
const combBees = new THREE.InstancedMesh(beeGeometry(1.1), beeMat, COMB_BEES);
combBees.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
comb.add(combBees);
const cb = Array.from({ length: COMB_BEES }, () => ({ p: new THREE.Vector3(rand(-3, 3), rand(-2, 2), 0.14), t: new THREE.Vector3(), a: rand(0, 6), w: rand(0, 3) }));
const queen = new THREE.Mesh(beeGeometry(1.7), beeMat);
queen.scale.z = 1.4;
comb.add(queen);
const queenLbl = sim.label('👑 Kraliçe', { parent: queen, position: [0, 0.35, 0], className: 'plain' });
const qState = { p: new THREE.Vector3(0, 0, 0.16), t: new THREE.Vector3(), wait: 0 };
const dancer = new THREE.Mesh(beeGeometry(1.2), beeMat);
comb.add(dancer);
const danceLbl = sim.label('💃 Sallanma dansı', { parent: dancer, position: [0, 0.35, 0], className: 'plain' });

// --- Çiçekler ---
const MAXF = 300;
const flowerR = seeded(11);
const PAL = [[0xf472b6, 0xfbcfe8, 0xffffff, 0xc084fc], [0xfacc15, 0xf87171, 0xffffff, 0x60a5fa], [0xa855f7, 0xf59e0b, 0xfde68a, 0xffffff]];
const flowers = [];
const patchC = [[5, -3], [9, 3], [3, 5], [12, -6], [7, 8]];
for (let i = 0; i < MAXF; i++) {
  const pc = patchC[i % patchC.length];
  const a = flowerR() * Math.PI * 2, d = Math.sqrt(flowerR()) * 3.6;
  const type = Math.floor(flowerR() * 3); // 0 ilkbahar, 1 yaz, 2 sonbahar
  const start = [-10, 80, 160][type] + flowerR() * 30, len = 60 + flowerR() * 35;
  flowers.push({ x: pc[0] + Math.cos(a) * d, z: pc[1] + Math.sin(a) * d, h: 0.5 + flowerR() * 0.5, start, len,
    color: new THREE.Color(PAL[type][Math.floor(flowerR() * 4)]), open: 0 });
}
const stemG = new THREE.CylinderGeometry(0.02, 0.025, 1, 5); stemG.translate(0, 0.5, 0);
const stems = new THREE.InstancedMesh(stemG, new THREE.MeshStandardMaterial({ color: 0x3f8f2f }), MAXF);
const headG = new THREE.CylinderGeometry(0.34, 0.1, 0.08, 10);
const heads = new THREE.InstancedMesh(headG, new THREE.MeshStandardMaterial({ roughness: 0.7 }), MAXF);
const eyeG = new THREE.SphereGeometry(0.11, 8, 6);
const centers = new THREE.InstancedMesh(eyeG, new THREE.MeshStandardMaterial({ color: 0xf59e0b }), MAXF);
[stems, heads, centers].forEach((m) => { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); });
flowers.forEach((f, i) => heads.setColorAt(i, f.color));
function updateFlowers() {
  const d = col.day % M.YEAR;
  const n = O.flowers;
  for (let i = 0; i < MAXF; i++) {
    const f = flowers[i];
    const x = (d - f.start) / f.len;
    // (ilkbahar çiçekleri yıl başından önce açmaya başlar)
    f.open = x > 0 && x < 1 ? Math.sin(Math.PI * clamp(x * 1.3, 0, 1)) ** 0.5 : 0;
    const winter = d >= 270;
    const sh = winter ? 0.05 : f.h * (0.4 + 0.6 * Math.max(f.open, 0.3));
    dummy.rotation.order = 'XYZ'; dummy.rotation.set(0, 0, 0);
    dummy.position.set(f.x, 0, f.z); dummy.scale.set(1, sh, 1); dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    const s = Math.max(0.001, f.open);
    dummy.position.set(f.x, sh, f.z); dummy.scale.set(s, s, s); dummy.updateMatrix();
    heads.setMatrixAt(i, dummy.matrix);
    dummy.position.y = sh + 0.03; dummy.updateMatrix();
    centers.setMatrixAt(i, dummy.matrix);
  }
  stems.count = heads.count = centers.count = n;
  stems.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = centers.instanceMatrix.needsUpdate = true;
  heads.instanceColor.needsUpdate = true;
}

// --- Uçan tarlacılar ---
const FLY = 120;
const fliers = new THREE.InstancedMesh(beeGeometry(1.6), beeMat, FLY);
fliers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
fliers.frustumCulled = false;
scene.add(fliers);
const fl = Array.from({ length: FLY }, () => ({ state: 0, t: 0, f: -1, from: new THREE.Vector3(), to: new THREE.Vector3(), wob: rand(0, 6), dur: 1 }));
function pickFlower() {
  const n = O.flowers;
  for (let k = 0; k < 8; k++) { const i = Math.floor(Math.random() * n); if (flowers[i].open > 0.35) return i; }
  return -1;
}

// --- Yağmur / kar ---
const RAIN = 700;
const rainPos = new Float32Array(RAIN * 3);
for (let i = 0; i < RAIN; i++) rainPos.set([rand(-14, 16), rand(0, 14), rand(-10, 10)], i * 3);
const rainMat = new THREE.PointsMaterial({ color: 0xa5c8ff, size: 0.09, transparent: true, opacity: 0.8 });
const rain = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(rainPos, 3)), rainMat);
scene.add(rain);

// --- Görsel güncelleme ---
const SKY = [0x9fd4f5, 0x7cc4f5, 0xc7b99a, 0xcbd5e1];
const GROUND = [0x6fbf4a, 0x93b447, 0xb39a4a, 0xeef2f7];
const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
const flowerCentroid = new THREE.Vector3();
let visTimer = 0, time = 0;
sim.onRender((real) => {
  if (!col) return;
  time += real;
  const run = sim.paused ? 0 : real * Math.min(sim.speed, 3);
  const d = col.day % M.YEAR, s = M.seasonOf(col.day);
  // Gökyüzü ve zemin mevsime göre (yumuşak geçiş)
  const sf = (d % 90) / 90, next = (s + 1) % 4;
  const blend = smooth(clamp((sf - 0.8) / 0.2, 0, 1));
  tmpC.setHex(SKY[s]).lerp(tmpC2.setHex(SKY[next]), blend);
  if (col.rain) tmpC.lerp(tmpC2.setHex(0x64748b), 0.55);
  scene.background.copy(tmpC);
  groundMat.color.setHex(GROUND[s]).lerp(tmpC2.setHex(GROUND[next]), blend);
  sun.intensity = col.rain ? 0.9 : 2.2;
  // Yağış
  const winter = d >= 270;
  rain.visible = col.rain;
  if (rain.visible) {
    rainMat.color.setHex(winter ? 0xffffff : 0xa5c8ff);
    rainMat.size = winter ? 0.14 : 0.08;
    const v = (winter ? 1.5 : 9) * real;
    for (let i = 0; i < RAIN; i++) { let y = rainPos[i * 3 + 1] - v; if (y < 0) y += 14; rainPos[i * 3 + 1] = y; }
    rain.geometry.attributes.position.needsUpdate = true;
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
        if (f >= 0) { b.f = f; b.state = 1; b.t = 0; b.from.copy(ENTR); b.to.set(flowers[f].x, flowers[f].h + 0.25, flowers[f].z); b.dur = b.from.distanceTo(b.to) / 3.2; }
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
      dummy.position.y += Math.sin(time * 8 + b.wob) * 0.05;
      dummy.lookAt(b.to.x + Math.sin(time * 3 + b.wob), b.to.y, b.to.z + Math.cos(time * 3 + b.wob));
      flowerCentroid.add(b.to); fc++;
    } else {
      const u = clamp(b.t / b.dur, 0, 1);
      dummy.position.lerpVectors(b.from, b.to, u);
      dummy.position.y += Math.sin(u * Math.PI) * 1.4 + Math.sin(time * 9 + b.wob) * 0.06;
      dummy.position.x += Math.sin(u * 7 + b.wob) * 0.25;
      dummy.lookAt(b.to.x, dummy.position.y, b.to.z);
    }
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    fliers.setMatrixAt(vis++, dummy.matrix);
  }
  fliers.count = vis;
  fliers.instanceMatrix.needsUpdate = true;

  // Petek arıları: kışın salkım, diğer mevsimlerde gezinme
  const nb = Math.min(COMB_BEES, Math.round(col.hive / 220));
  const cluster = winter && col.hive > 0;
  const cr = 0.35 + Math.sqrt(nb) * 0.13;
  for (let i = 0; i < nb; i++) {
    const b = cb[i];
    if (cluster) {
      const a = i * 2.399, rr = cr * Math.sqrt((i + 0.5) / nb);
      b.t.set(Math.cos(a) * rr, -0.5 + Math.sin(a) * rr * 0.9, 0.14 + (i % 3) * 0.05);
      b.p.lerp(b.t, Math.min(1, real * 2));
      dummy.position.copy(b.p);
      dummy.position.x += Math.sin(time * 30 + i) * 0.01; // titreşerek ısınma
      flat(dummy, a);
    } else {
      b.w -= run;
      if (b.w <= 0) { const c = cellPos[byCenter[Math.floor(Math.random() * NC * 0.6)]]; b.t.set(c.x, c.y, 0.14); b.w = rand(1, 4); }
      const dx = b.t.x - b.p.x, dy = b.t.y - b.p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.02) { b.a = Math.atan2(dy, dx); const st = Math.min(dist, run * 0.5); b.p.x += (dx / dist) * st; b.p.y += (dy / dist) * st; }
      b.p.z = 0.14;
      dummy.position.copy(b.p);
      flat(dummy, b.a);
    }
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    combBees.setMatrixAt(i, dummy.matrix);
  }
  combBees.count = nb;
  combBees.instanceMatrix.needsUpdate = true;

  // Kraliçe: yavru alanında dolaşır
  qState.wait -= run;
  if (qState.wait <= 0) { const c = cellPos[byCenter[Math.floor(Math.random() * NC * 0.3)]]; qState.t.set(c.x, c.y, 0.18); qState.wait = rand(1.5, 3); }
  qState.p.lerp(qState.t, Math.min(1, run * 1.2));
  queen.position.copy(cluster ? new THREE.Vector3(0, -0.5, 0.35) : qState.p);
  flat(queen, Math.atan2(qState.t.y - qState.p.y, qState.t.x - qState.p.x));

  // Sallanma dansı: düz koşu açısı = çiçek yönü ile güneş yönü arasındaki açı
  const dancing = !cluster && fc > 0 && activity;
  dancer.visible = dancing;
  danceLbl.visible = dancing;
  if (dancing) {
    flowerCentroid.divideScalar(fc);
    const angF = Math.atan2(flowerCentroid.z - HIVE.z, flowerCentroid.x - HIVE.x);
    const angS = Math.atan2(sun.position.z, sun.position.x);
    const phi = -(angF - angS);                 // petek üzerinde yukarı = güneş yönü
    const ph = (time * 0.8) % 2, u = ph % 1;
    const dir = new THREE.Vector2(Math.sin(phi), Math.cos(phi));
    const side = ph < 1 ? 1 : -1;
    const base = new THREE.Vector2(combW * 0.28, -0.2);
    let x, y;
    if (u < 0.5) { const k = u / 0.5 - 0.5; x = base.x + dir.x * k * 0.9; y = base.y + dir.y * k * 0.9; x += Math.sin(time * 40) * 0.03; }
    else { const k = (u - 0.5) / 0.5; const a = Math.PI * k; x = base.x + dir.x * 0.45 * Math.cos(a) + side * dir.y * 0.4 * Math.sin(a); y = base.y + dir.y * 0.45 * Math.cos(a) - side * dir.x * 0.4 * Math.sin(a); }
    dancer.position.set(x, y, 0.2);
    flat(dancer, Math.atan2(dir.y, dir.x));
  }
  visTimer += real;
  if (visTimer > 0.25) { visTimer = 0; updateComb(); updateFlowers(); }
});
const smooth = (t) => t * t * (3 - 2 * t);

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
const legend = ui.text('<span style="color:#fffdf5">⬤</span> yumurta <span style="color:#fff0c2">⬤</span> larva <span style="color:#a86b32">⬤</span> kapalı yavru <span style="color:#f29f05">⬤</span> bal <span style="color:#f97316">⬤</span> polen', 'card');

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
