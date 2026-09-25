// Kalabalık Tahliyesi — sosyal kuvvet modeli + akış alanı; çıkış sayısı/genişliği, panik, yangın ve duman.
import { createSim, THREE, fmt, fmtClock, rand, seeded, heatColor, instanced, BufferGeometryUtils } from '@core';
import { createFloor, createCrowd, stepCrowd, applyLayout, computeField, ignite, stepFire, wallSide, PLANS, CS, T } from './model.js';

const sim = createSim({
  background: 0x0c1322,
  camera: { position: [0, 40, 29], target: [0, 0, 1], fov: 45 },
  controls: { maxDistance: 140, minDistance: 8 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Her nokta bir insan. <b>Sosyal kuvvet modeli</b>nde (Helbing ve ark.) herkes en yakın çıkışa giden yöne
    hızlanır; diğer insanlardan ve duvarlardan itilir, sıkışınca vücut teması ve sürtünme oluşur. Yön, kat planı
    üzerinde hesaplanan bir <b>akış alanı</b>ndan (Dijkstra en kısa yol) gelir; duman ve ateş yakını "pahalı" sayılır.
    Renkler çevredeki yoğunluğu gösterir: yeşil rahat, sarı sıkışık, kırmızı tehlikeli (≈ 5 kişi/m² üstü).</p>
    <h3>Dene</h3>
    <ul>
      <li>Çıkış genişliğini 0,8 m'den 2,4 m'ye çıkar: tahliye süresi neredeyse yarıya iner, çünkü akış kapı genişliğiyle orantılıdır.</li>
      <li><b>Duvara tıkla</b>: çıkış ekle ya da kaldır. <b>Zemine tıkla</b>: yangın başlat; ateş yayılır, duman insanları yavaşlatır.</li>
      <li><b>Sütun deneyi</b>: önce sütunsuz çalıştır, sonra "Çıkış önüne sütun"u aç. Grafikte önceki denemeyle karşılaştır ve
      kapı önü yoğunluğuna bak.</li>
      <li>Panik seviyesini artır: insanlar hızlanır ama kapıda kemerlenme ve itişme artar. Araştırmalarda dar çıkışlarda bu, tahliyeyi yavaşlatabilir ("daha hızlı = daha yavaş"); bu basit modelde etki zayıftır, kapı önündeki yoğunluğu izle.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Yönetmelikler kişi sayısına göre çıkış sayısı ve genişliği ister; çıkışlar birbirinden uzak ve her zaman açık olmalıdır.
    Tahliyede koşmamak, sağa yaslanıp akışı izlemek ve asansör kullanmamak gerekir; dumanda eğilerek ilerlenir.
    Kapı önüne yerleştirilen engellerin etkisi deneylerde tartışmalıdır: bazı çalışmalarda basıncı azaltmış,
    bazılarında fark yaratmamıştır — konumu önemlidir.</p>
    <p><small>Model basitleştirilmiştir: tek kat, merdiven yok, herkes çıkışları bilir; sayısal sonuçlar gösterim amaçlıdır.</small></p>`,
});

// ---------- Kalıcı meshler ----------
const floorMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.95 });
let floorMesh = null;
const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
let wallMesh = null;
const exitMesh = instanced(new THREE.BoxGeometry(CS, 0.06, CS), new THREE.MeshBasicMaterial({ color: 0x22c55e }), 400);
exitMesh.count = 0;
sim.scene.add(exitMesh);
const pillarMesh = instanced(new THREE.CylinderGeometry(1, 1, 2.2, 20).translate(0, 1.1, 0), new THREE.MeshStandardMaterial({ color: 0xcbd5e1 }), 12);
pillarMesh.count = 0;
sim.scene.add(pillarMesh);
const fireMesh = instanced(new THREE.ConeGeometry(0.28, 1, 7).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff }), 1400);
fireMesh.count = 0;
fireMesh.frustumCulled = false;
sim.scene.add(fireMesh);
const MAXP = 800;
const personGeo = BufferGeometryUtils.mergeGeometries([
  new THREE.CylinderGeometry(0.2, 0.22, 1.2, 10).translate(0, 0.6, 0),
  new THREE.SphereGeometry(0.15, 10, 8).translate(0, 1.38, 0),
]);
const people = instanced(personGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), MAXP);
for (let i = 0; i < MAXP; i++) people.setColorAt(i, new THREE.Color(1, 1, 1));
people.count = 0;
people.frustumCulled = false;
sim.scene.add(people);
// Isı haritası ve duman katmanları (hücre başına bir piksel)
let heatTex, heatPlane, smokeTex, smokePlane, dgrid;
const dummy = new THREE.Object3D();
const col = new THREE.Color();

let F, C, exitLabels = [], planKey = 'salon', runSeed = 7;
let fireAcc = 0, fieldAcc = 0, fieldDirty = false, done = false, evacT = 0, chartAcc = 0;
let cur = [], prev = [];

function buildPlan(key) {
  planKey = key;
  const oldPillar = F ? F.pillarOn : false;
  F = createFloor(key);
  F.width = widthS.value;
  F.pillarOn = oldPillar;
  applyLayout(F);
  // Zemin
  if (floorMesh) { sim.scene.remove(floorMesh); floorMesh.geometry.dispose(); }
  floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(F.W, F.H).rotateX(-Math.PI / 2), floorMat);
  sim.scene.add(floorMesh);
  // Katmanlar
  for (const p of [heatPlane, smokePlane]) if (p) { sim.scene.remove(p); p.geometry.dispose(); p.material.map.dispose(); p.material.dispose(); }
  const mk = (y, opacity) => {
    const data = new Uint8Array(F.NX * F.NZ * 4);
    const tex = new THREE.DataTexture(data, F.NX, F.NZ, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(F.NX * CS, F.NZ * CS).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false }));
    m.position.y = y;
    sim.scene.add(m);
    return [tex, m];
  };
  [heatTex, heatPlane] = mk(0.03, 0.85);
  [smokeTex, smokePlane] = mk(2.4, 1);
  heatPlane.visible = heatOn.value;
  dgrid = new Float32Array(F.N);
  const k = Math.max(F.W, F.H * 1.5);
  sim.moveCamera([0, 1.08 * k, 0.8 * k], [0, 0, 1.5]);
  rebuildStatic();
  restart(false);
}

function rebuildStatic() {
  if (wallMesh) { sim.scene.remove(wallMesh); wallMesh.dispose(); }
  const cells = [];
  for (let k = 0; k < F.N; k++) if (F.type[k] === T.WALL || F.type[k] === T.SEAT) cells.push(k);
  wallMesh = new THREE.InstancedMesh(unitBox, wallMat, Math.max(1, cells.length));
  cells.forEach((k, n) => {
    const i = k % F.NX, j = (k - i) / F.NX, seat = F.type[k] === T.SEAT;
    const isPillar = F.pillars.some((p) => Math.hypot(F.cx(i) - p.x, F.cz(j) - p.z) < p.r + 0.2);
    dummy.position.set(F.cx(i), 0, F.cz(j));
    dummy.scale.set(CS, seat ? 0.45 : isPillar ? 0.01 : 1.3, CS);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    wallMesh.setMatrixAt(n, dummy.matrix);
    wallMesh.setColorAt(n, col.setHex(seat ? 0x9a6b4f : 0x94a3b8));
  });
  dummy.scale.set(1, 1, 1);
  wallMesh.count = cells.length;
  sim.scene.add(wallMesh);
  // Çıkış karoları
  let n = 0;
  for (let k = 0; k < F.N && n < 400; k++) {
    if (F.type[k] !== T.EXIT && F.type[k] !== T.SRC) continue;
    const i = k % F.NX, j = (k - i) / F.NX;
    dummy.position.set(F.cx(i), 0.03, F.cz(j));
    dummy.updateMatrix();
    exitMesh.setMatrixAt(n++, dummy.matrix);
  }
  exitMesh.count = n;
  exitMesh.instanceMatrix.needsUpdate = true;
  // Sütunlar
  F.pillars.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z); dummy.scale.set(p.r, 1, p.r); dummy.updateMatrix();
    pillarMesh.setMatrixAt(i, dummy.matrix);
  });
  dummy.scale.set(1, 1, 1);
  pillarMesh.count = F.pillars.length;
  pillarMesh.instanceMatrix.needsUpdate = true;
  // Çıkış etiketleri
  exitLabels.forEach((l) => l.parent && l.parent.remove(l));
  exitLabels = F.exits.map((e) => {
    const L = e.side === 'N' || e.side === 'S' ? F.W : F.H, c = -L / 2 + e.t * L;
    const pos = e.side === 'N' ? [c, 1.8, -F.H / 2 - 1.4] : e.side === 'S' ? [c, 1.8, F.H / 2 + 1.4] : e.side === 'W' ? [-F.W / 2 - 1.6, 1.8, c] : [F.W / 2 + 1.6, 1.8, c];
    const l = sim.label('<span style="color:#4ade80">🚪 ÇIKIŞ</span>', { position: pos });
    return l;
  });
}

function restart(newSeed = false) {
  if (newSeed) runSeed = Math.floor(Math.random() * 1e6);
  if (cur.length > 5) prev = cur;
  cur = [];
  C = createCrowd(F, Math.round(countS.value), seeded(runSeed));
  done = false; evacT = 0; chartAcc = 0;
  chart.clear();
}

function clearFire() {
  F.fire.fill(0); F.fireList = []; F.fireCount = 0; F.smoke.fill(0);
  computeField(F);
}

function igniteAround(i, j) {
  let ok = false;
  for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) ok = ignite(F, i + di, j + dj) || ok;
  if (ok) { fieldDirty = true; computeField(F); fieldDirty = false; }
  return ok;
}

function relayout() {
  applyLayout(F);
  rebuildStatic();
  exitCountS.set(Math.min(6, F.exits.length));
}

// ---------- Arayüz ----------
const ui = sim.ui;
ui.section('Kat planı');
const planSel = ui.segmented({
  options: [{ value: 'salon', label: 'Konferans salonu' }, { value: 'avm', label: 'AVM' }, { value: 'stadyum', label: 'Stadyum' }, { value: 'sutun', label: 'Sütun deneyi' }],
  value: 'salon',
  onChange: (v) => {
    const P = PLANS[v];
    prev = []; cur = [];
    countS.set(P.n); widthS.set(P.width || 1.6); exitCountS.set(P.nExit);
    if (P.panic != null) panicS.set(P.panic);
    buildPlan(v);
    if (v === 'sutun') sim.toast('Önce sütunsuz çalıştır, sonra "Çıkış önüne sütun"u açıp karşılaştır', 'warn');
  },
});
ui.section('Kalabalık');
const countS = ui.slider({ label: 'Kişi sayısı', min: 100, max: 800, step: 10, value: 400, onChange: () => restart() });
const panicS = ui.slider({ label: 'Panik seviyesi', min: 0, max: 1, step: 0.05, value: 0.3,
  format: (v) => `${fmt(v * 100)}% · ${v < 0.25 ? 'sakin' : v < 0.6 ? 'telaşlı' : 'panik'}` });
ui.section('Çıkışlar');
const exitCountS = ui.slider({ label: 'Çıkış sayısı', min: 1, max: 6, step: 1, value: 2,
  onChange: (v) => { const P = PLANS[planKey]; F.exits = P.cand.slice(0, Math.min(v, P.cand.length)).map(([side, t]) => ({ side, t })); relayout(); } });
const widthS = ui.slider({ label: 'Çıkış genişliği', min: 0.8, max: 4, step: 0.1, value: 1.6, unit: 'm', onChange: (v) => { F.width = v; relayout(); } });
const pillarT = ui.toggle({ label: 'Çıkış önüne sütun', value: false, onChange: (v) => { F.pillarOn = v; relayout(); restart(); } });
ui.text('🖱️ <b>Duvara tıkla:</b> çıkış ekle / kaldır', 'card');
ui.section('Yangın');
const spreadS = ui.slider({ label: 'Yangın yayılma hızı', min: 0, max: 1, step: 0.05, value: 0.4 });
ui.buttons([
  { label: '🔥 Rastgele yangın', variant: 'danger', onClick: () => {
    for (let tries = 0; tries < 200; tries++) {
      const i = Math.floor(rand(0, F.NX)), j = Math.floor(rand(0, F.NZ));
      if (F.inside(i, j) && F.type[F.idx(i, j)] !== T.WALL && igniteAround(i, j)) { sim.toast('🔥 Yangın çıktı! Duman yayılıyor', 'bad'); break; }
    }
  } },
  { label: '🧯 Söndür', variant: 'good', onClick: () => clearFire() },
]);
ui.text('🖱️ <b>Zemine tıkla:</b> o noktada yangın başlat', 'card');
ui.section('Görünüm');
const heatOn = ui.toggle({ label: 'Yoğunluk ısı haritası', value: false, onChange: (v) => heatPlane && (heatPlane.visible = v) });
ui.buttons([
  { label: '⟲ Aynı dağılımla yeniden', variant: 'primary', onClick: () => restart(false) },
  { label: '🎲 Yeni dağılım', onClick: () => restart(true) },
]);
ui.section('Durum');
const stTime = ui.stat({ label: 'Tahliye süresi' });
const stOut = ui.stat({ label: 'Dışarıda', unit: '%' });
const stDens = ui.stat({ label: 'Kapı önü yoğunluk', unit: 'kişi/m²' });
const stFlow = ui.stat({ label: 'Çıkış akışı', unit: 'kişi/dk' });
const stSmoke = ui.stat({ label: 'Dumandan etkilenen' });
const stTrap = ui.stat({ label: 'Yolu kesilen' });
const chart = ui.chart({ title: 'Dışarı çıkanlar (%) — zaman (s)', series: [{ name: 'Bu deneme', color: '#22c55e' }, { name: 'Önceki deneme', color: '#94a3b8' }], maxPoints: 400, yMin: 0, yMax: 100 });

// ---------- Tıklama: duvar → çıkış, zemin → yangın ----------
sim.onClick(() => [floorMesh, wallMesh, exitMesh].filter(Boolean), (hit) => {
  const p = hit.point;
  const i = F.ci(p.x), j = F.cj(p.z);
  const ws = wallSide(F, i, j);
  if (ws && (F.base[F.idx(i, j)] === T.WALL)) {
    const L = ws.side === 'N' || ws.side === 'S' ? F.W : F.H;
    const near = F.exits.findIndex((e) => e.side === ws.side && Math.abs(e.t - ws.t) * L < F.width / 2 + 0.8);
    if (near >= 0) {
      if (F.exits.length <= 1) { sim.toast('En az bir çıkış olmalı', 'warn'); return; }
      F.exits.splice(near, 1);
      sim.toast('Çıkış kapatıldı', 'warn');
    } else {
      F.exits.push(ws);
      sim.toast('Yeni çıkış açıldı', 'good');
    }
    relayout();
    return;
  }
  if (F.inside(i, j) && igniteAround(i, j)) sim.toast('🔥 Yangın başladı', 'bad');
});

// ---------- Döngü ----------
sim.onUpdate((dt) => {
  const n = Math.min(40, Math.ceil(dt / 0.02));
  const h = Math.min(dt / n, 0.02);
  for (let s = 0; s < n; s++) stepCrowd(F, C, h, panicS.value);
  if (F.fireCount) {
    fireAcc += dt;
    while (fireAcc >= 0.1) { fireAcc -= 0.1; if (stepFire(F, 0.1, spreadS.value)) fieldDirty = true; }
    fieldAcc += dt;
    if ((fieldDirty && fieldAcc > 0.5) || fieldAcc > 2) { computeField(F); fieldDirty = false; fieldAcc = 0; }
  }
  if (!done && C.outCount >= C.n) {
    done = true; evacT = C.t;
    sim.toast(`✅ Tahliye tamamlandı: ${fmtClock(evacT)}`, 'good');
  }
  chartAcc += dt;
  while (chartAcc >= 1) {
    chartAcc -= 1;
    if (done && cur.length && cur[cur.length - 1] >= 100 && (!prev.length || cur.length >= prev.length)) continue;
    const pct = (C.outCount / C.n) * 100;
    cur.push(pct);
    const pv = prev.length ? prev[Math.min(cur.length - 1, prev.length - 1)] : 0;
    chart.push([pct, pv]);
  }
});

let statT = 0;
sim.onRender((real) => {
  // İnsanlar
  let m = 0;
  for (let a = 0; a < C.n; a++) {
    if (C.out[a]) continue;
    dummy.position.set(C.px[a], 0, C.pz[a]);
    const s = C.r[a] / 0.22;
    dummy.scale.set(s, 1, s);
    dummy.updateMatrix();
    people.setMatrixAt(m, dummy.matrix);
    if (C.t < C.delay[a] * 6 * (1 - 0.7 * panicS.value)) col.setHex(0x93c5fd);
    else col.setHSL(0.33 * Math.max(0, Math.min(1, 1 - (C.dens[a] - 1.5) / 4)), 0.85, 0.52);
    people.setColorAt(m, col);
    m++;
  }
  dummy.scale.set(1, 1, 1);
  people.count = m;
  people.instanceMatrix.needsUpdate = true;
  people.instanceColor.needsUpdate = true;
  // Alevler
  const fl = F.fireList;
  const nf = Math.min(fl.length, 1400);
  for (let q = 0; q < nf; q++) {
    const k = fl[q], i = k % F.NX, j = (k - i) / F.NX;
    const flick = 0.6 + 0.5 * Math.abs(Math.sin(performance.now() / 180 + k * 1.7));
    dummy.position.set(F.cx(i), 0, F.cz(j));
    dummy.scale.set(1, flick * 1.4, 1);
    dummy.updateMatrix();
    fireMesh.setMatrixAt(q, dummy.matrix);
    fireMesh.setColorAt(q, col.setHSL(0.02 + 0.1 * ((k * 7) % 5) / 5, 1, 0.55));
  }
  dummy.scale.set(1, 1, 1);
  fireMesh.count = nf;
  fireMesh.instanceMatrix.needsUpdate = true;
  if (fireMesh.instanceColor) fireMesh.instanceColor.needsUpdate = true;

  statT += real;
  if (statT < 0.35) return;
  statT = 0;
  // Duman ve yoğunluk dokuları
  const sd = smokeTex.image.data;
  let anySmoke = false;
  for (let j = 0; j < F.NZ; j++) for (let i = 0; i < F.NX; i++) {
    const k = j * F.NX + i, o = ((F.NZ - 1 - j) * F.NX + i) * 4, s = F.smoke[k];
    if (s > 0.02) anySmoke = true;
    sd[o] = 70; sd[o + 1] = 72; sd[o + 2] = 78; sd[o + 3] = Math.min(170, s * 200);
  }
  smokeTex.needsUpdate = true;
  smokePlane.visible = anySmoke;
  const counts = new Float32Array(F.N);
  for (let a = 0; a < C.n; a++) if (!C.out[a]) { const k = F.cj(C.pz[a]) * F.NX + F.ci(C.px[a]); if (k >= 0 && k < F.N) counts[k]++; }
  if (heatOn.value) {
    const hd = heatTex.image.data;
    for (let j = 1; j < F.NZ - 1; j++) for (let i = 1; i < F.NX - 1; i++) {
      const k = j * F.NX + i;
      let c = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) c += counts[k + dj * F.NX + di];
      dgrid[k] += (c / (9 * CS * CS) - dgrid[k]) * 0.5;
      const o = ((F.NZ - 1 - j) * F.NX + i) * 4;
      const t = Math.min(1, dgrid[k] / 6);
      heatColor(t, col);
      hd[o] = col.r * 255; hd[o + 1] = col.g * 255; hd[o + 2] = col.b * 255; hd[o + 3] = t < 0.04 ? 0 : 90 + t * 150;
    }
    heatTex.needsUpdate = true;
  }
  // İstatistikler
  const pct = (C.outCount / C.n) * 100;
  stTime.set(done ? fmtClock(evacT) : fmtClock(C.t) + ' …', done ? 'good' : '');
  stOut.set(fmt(pct, 0), pct >= 100 ? 'good' : '');
  let dmax = 0, smokeN = 0, trap = 0;
  const centers = F.exits.map((e) => {
    const L = e.side === 'N' || e.side === 'S' ? F.W : F.H, c = -L / 2 + e.t * L;
    return e.side === 'N' ? [c, -F.H / 2] : e.side === 'S' ? [c, F.H / 2] : e.side === 'W' ? [-F.W / 2, c] : [F.W / 2, c];
  });
  for (let a = 0; a < C.n; a++) {
    if (C.smokeT[a] > 5) smokeN++;
    if (C.out[a]) continue;
    const k = F.cj(C.pz[a]) * F.NX + F.ci(C.px[a]);
    if (!(F.D[k] < Infinity) && F.type[k] === T.FLOOR) trap++;
    for (const [x, z] of centers) if (Math.abs(C.px[a] - x) < 2.5 && Math.abs(C.pz[a] - z) < 2.5) { dmax = Math.max(dmax, C.dens[a]); break; }
  }
  stDens.set(fmt(dmax, 1), dmax > 5 ? 'bad' : dmax > 3.5 ? 'warn' : 'good');
  const recent = C.outTimes.filter((t) => t > C.t - 10).length;
  stFlow.set(fmt((recent / Math.min(10, Math.max(C.t, 1))) * 60, 0));
  stSmoke.set(smokeN, smokeN ? 'warn' : '');
  stTrap.set(trap, trap ? 'bad' : '');
});

sim.onReset(() => { clearFire(); restart(false); });
buildPlan('salon');
