// Kalabalık Tahliyesi — sosyal kuvvet modeli + akış alanı; çıkış sayısı/genişliği, panik, yangın ve duman.
import { createSim, THREE, mat, procedural, RoundedBoxGeometry, fmt, fmtClock, rand, seeded, heatColor, instanced, BufferGeometryUtils, landscape, createTerrain, terrainSkirt, createVegetation,
  makeCity, streetMaterials as groundMats, streetTrees, crowd } from '@core';
import { buildingMats, cutawayWalls, mergeRuns, stageSet, fireCabinet, assemblySign, bench, zoneDecal, routeArrows } from './building.js';
import { createSmoke } from './smoke.js';
import { mats, theatreChair, stadiumSeat, exitDoor } from './venue.js';
import { createFloor, createCrowd, stepCrowd, applyLayout, computeField, ignite, stepFire, wallSide, PLANS, CS, T } from './model.js';

const sim = createSim({
  sky: { elevation: 34, azimuth: 235, clouds: 0.3, haze: 1.0, visibility: 6000 },
  camera: { position: [27, 18.6, 37.5], target: [0, 0, 6], fov: 42, near: 0.2, far: 30000 },
  controls: { maxDistance: 160, minDistance: 6, maxPolarAngle: Math.PI * 0.47 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Her figür bir insan; bina kesit olarak (duvarları kesilmiş) görünüyor. <b>Sosyal kuvvet modeli</b>nde (Helbing ve ark.) herkes en yakın çıkışa giden yöne
    hızlanır; diğer insanlardan ve duvarlardan itilir, sıkışınca vücut teması ve sürtünme oluşur. Yön, kat planı
    üzerinde hesaplanan bir <b>akış alanı</b>ndan (Dijkstra en kısa yol) gelir; duman ve ateş yakını "pahalı" sayılır.
    Ayak altındaki halkanın rengi çevredeki yoğunluğu gösterir: yeşil rahat, sarı sıkışık, kırmızı tehlikeli (≈ 5 kişi/m² üstü).
    Dışarı çıkanlar binanın güneyindeki <b>toplanma alanı</b>na yürür (yalnızca görsel; süre ve istatistikler kapıdan çıkışta sayılır).</p>
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

// ---------- Çevre: kesit bina, çevresinde site (taş döşeme, çim, ağaç, bank, toplanma alanı), dışında şehir adaları ----------
const LOW = /[?&]low\b/.test(location.search);
const K = mats(), G = groundMats(), KB = buildingMats();
const hfun = landscape({ seed: 12, size: 900, height: 60, octaves: 5, warp: 0.3,
  shape: (x, z, h) => -0.35 + THREE.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(z)), 145, 600) * (h + 4) });
const SITE = { x0: -50, x1: 50, z0: -40, z1: 50 };
let signGroup = null, zoneMesh = null, arrows = null;
{
  const t = createTerrain(hfun, { size: [1600, 1600], res: LOW ? [90, 90] : [140, 140], materialOptions: { water: -60, grassAmount: 0.85, forest: 0.35, grass: 0x5c6d2e, dry: 0x958a58 } });
  t.userData.noFit = true;
  sim.scene.add(t, terrainSkirt(hfun, { inner: 800, outer: 20000 }));
  // Site döşemesi + kenar bordürü
  const pav = new THREE.Mesh(new THREE.BoxGeometry(SITE.x1 - SITE.x0, 0.3, SITE.z1 - SITE.z0), KB.slab);
  pav.position.set((SITE.x0 + SITE.x1) / 2, -0.17, (SITE.z0 + SITE.z1) / 2);
  pav.receiveShadow = true; pav.userData.noFit = true; pav.raycast = () => {};
  sim.scene.add(pav);
  // Çim tarhları (yükseltilmiş, taş bordürlü) ve ağaçlar
  const lawns = [[-48, -38, -30, 14], [30, -38, 48, 14], [-28, -38, 28, -24], [-48, 24, -30, 48], [30, 24, 48, 48]];
  const treePts = [];
  const rr = seeded(44);
  for (const [x0, z0, x1, z1] of lawns) {
    const w = x1 - x0, d = z1 - z0;
    const cb = new THREE.Mesh(new RoundedBoxGeometry(w, 0.16, d, 2, 0.06), G.curb);
    cb.position.set((x0 + x1) / 2, 0.06, (z0 + z1) / 2); cb.receiveShadow = cb.castShadow = true; cb.userData.noFit = true; cb.raycast = () => {};
    const lw = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.05, d - 0.4), G.lawn);
    lw.position.set((x0 + x1) / 2, 0.12, (z0 + z1) / 2); lw.receiveShadow = true; lw.userData.noFit = true; lw.raycast = () => {};
    sim.scene.add(cb, lw);
    const n = Math.round(w * d / 55);
    for (let k = 0; k < n; k++) treePts.push([x0 + 2 + rr() * (w - 4), z0 + 2 + rr() * (d - 4), rr() * 6, 1]);
  }
  const st = streetTrees(treePts, 4, { broad: 0.7, cypress: 0.3 });
  st.group.position.y = 0.14;
  sim.scene.add(st.group);
  // Banklar çim kenarında
  for (const [x, z, ry] of [[-29, -8, -Math.PI / 2], [-29, 2, -Math.PI / 2], [29, -8, Math.PI / 2], [29, 2, Math.PI / 2], [-10, -23, 0], [10, -23, 0], [-29, 32, -Math.PI / 2], [29, 32, Math.PI / 2]]) {
    const b = bench(); b.position.set(x, 0, z); b.rotation.y = ry; sim.scene.add(b);
  }
  // Toplanma alanı zemin boyası (plana göre buildPlan'da) ve kaçış güzergâhı okları
  arrows = routeArrows(160); sim.scene.add(arrows.mesh);
  signGroup = assemblySign(); sim.scene.add(signGroup);
  // Şehir adaları ve uzak bitki örtüsü ilk karelerden sonra kurulur (açılış hızlı, sahne önce görünür)
  let city = null, veg = null;
  sim.onRender(() => {
    st.update(sim.time, 0.5);
    if (city) city.update(sim.time, 0.5);
    if (veg) veg.update(sim.time, 0.5);
    if (!city && sim.frame >= 3) {
      // Motor kent kiti: girintili pencereli, balkonlu, dükkân katlı apartmanlar ve evler; bordürlü kaldırım, lamba, park etmiş araç
      city = makeCity({ xs: [-130, -56, 56, 130], zs: [-115, -46, 56, 125], road: 12, seed: 9, parked: LOW ? 12 : 20, camera: [27, 18.6, 37.5],
        tile: 90, near: LOW ? 170 : 260, noRaycast: true,
        plan: (i, j) => (i === 1 && j === 1 ? 'none' : (i + j) % 3 === 0 ? 'park' : 'city'),
        block: (inner) => ({ mix: { apartment: 0.8, house: 0.15, office: 0.05 }, gap: Math.abs(inner.cx) < 100 ? 0 : 2.5, shops: 0.7 }),
        floors: (x, z, r, type) => (type === 'apartment' ? 5 + Math.floor(r() * 4) : undefined) });
      city.group.position.y = -0.18;
      city.group.traverse((o) => { o.userData.noFit = true; if (o.isMesh) o.raycast = () => {}; });
      sim.scene.add(city.group);
    } else if (city && !veg && sim.frame >= 6) {
      veg = createVegetation((x, z) => (Math.max(Math.abs(x), Math.abs(z)) < 148 ? -100 : hfun(x, z)), {
        rect: [-700, -700, 700, 700], trees: LOW ? 450 : 900, rocks: 0, seed: 21, water: -60, kinds: { broad: 0.6, pine: 0.25, cypress: 0.15 } });
      veg.group.traverse((o) => { o.userData.noFit = true; });
      sim.scene.add(veg.group);
    }
  });
}

// ---------- Kalıcı meshler ----------
let floorMesh = null;
let wallExt = null, wallInt = null, wallTop = null, seatGroup = null, doorGroup = null;
const exitMesh = instanced(new THREE.BoxGeometry(CS, 0.02, CS), K.mat, 400);
exitMesh.count = 0; exitMesh.receiveShadow = true;
sim.scene.add(exitMesh);
const pillarMesh = instanced(new THREE.LatheGeometry([[0, 0], [1.15, 0], [1.15, 0.12], [1, 0.2], [1, 3.0], [1.15, 3.08], [1.15, 3.2], [0, 3.2]].map(([x, y]) => new THREE.Vector2(x, y)), 32), K.column, 12);
pillarMesh.count = 0; pillarMesh.castShadow = true;
sim.scene.add(pillarMesh);
// Ateş ve duman: yumuşak ışık alan parçacıklar (alev çekirdeği ısıyla parlar) + titreyen ateş ışığı
const flames = createSmoke(LOW ? 900 : 1600);
sim.scene.add(flames.mesh);
flames.wind.set(0.15, 0, 0.1);
const fireLight = new THREE.PointLight(0xff7a30, 0, 30, 2);
fireLight.position.y = 1.2;
sim.scene.add(fireLight);
const MAXP = 800;
// İnsanlar: motorun eklemli figürleri (@core crowd) — kıyafet/ten/saç çeşitliliği, yürüme ve kaçış koşusu; uzakta tek çizimli ayrıntı kademesi
const folk = crowd(MAXP, { seed: 17, camera: sim.camera, poses: ['walk'] });
sim.scene.add(folk.group);
const FOLK_OUTFITS = ['casual', 'casual', 'casual', 'casual', 'office', 'office', 'student', 'student', 'worker', 'medic'];
const mkP = (g, m) => { const im = instanced(g, m, MAXP); im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; sim.scene.add(im); return im; };
// Yoğunluk halkası (veri katmanı): kişinin ayağının altında renkli yumuşak disk
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
const people = mkP(new THREE.RingGeometry(0.2, 0.28, 20).rotateX(-Math.PI / 2).translate(0, 0.025, 0), ringMat);
people.castShadow = false; people.receiveShadow = false; people.userData.noAO = true;
// Kişi başı sabit görünüş: kıyafet, pantolon, ten
const yaw = new Float32Array(MAXP), bob = new Float32Array(MAXP), shown = new Uint8Array(MAXP), seen = new Uint8Array(MAXP);
// Dışarı çıkanlar: toplanma alanına yürüyüş (yalnızca görsel)
const oState = new Uint8Array(MAXP), oX = new Float32Array(MAXP), oZ = new Float32Array(MAXP), oWp = new Uint8Array(MAXP), oSide = new Uint8Array(MAXP), oSlot = new Int32Array(MAXP), oSp = new Float32Array(MAXP), oV = new Float32Array(MAXP);
let slotN = 0;
const tint = new THREE.Color();
function dressPeople() {
  const r = seeded(runSeed + 3);
  for (let i = 0; i < MAXP; i++) {
    folk.dress(i, { seed: runSeed * 1009 + i, outfit: FOLK_OUTFITS[Math.floor(r() * FOLK_OUTFITS.length)] }); folk.hide(i);
    yaw[i] = planKey === 'salon' ? Math.PI : planKey === 'stadyum' ? 0 : r() * 6.28;
    bob[i] = r() * 6.28;
    oSp[i] = 1.25 + r() * 0.3;
  }
  oState.fill(0); slotN = 0;
}
// Toplanma alanı yuvaları: binanın güneyinde, 0,8 m aralıklı ızgara (hafif dağınık)
const AS = { cols: 30, pitch: 0.8 };
function slotPos(n, out) {
  const r = ((n * 2654435761) >>> 0) / 4294967296, r2 = ((n * 1597334677) >>> 0) / 4294967296;
  const c = n % AS.cols, row = Math.floor(n / AS.cols);
  out[0] = (c - (AS.cols - 1) / 2) * AS.pitch + (r - 0.5) * 0.35;
  out[1] = F.H / 2 + 8 + row * AS.pitch + (r2 - 0.5) * 0.35;
  return out;
}
// Çıkıştan sonra yol noktaları: kapıdan dışarı 2,5 m → gerekirse bina köşesini dön → yuva
const SIDES = ['N', 'S', 'E', 'W'];
const wpTmp = [0, 0];
function waypoint(a, k, out) {
  const side = SIDES[oSide[a] & 3], sx = oSide[a] & 4 ? -1 : 1, cx = F.W / 2 + 4, cz = F.H / 2 + 3.5;
  const list = [];
  if (side === 'N') list.push([oX[a], -F.H / 2 - 3], [sx * cx, -cz], [sx * cx, cz]);
  else if (side === 'E') list.push([F.W / 2 + 3, oZ[a]], [cx, cz]);
  else if (side === 'W') list.push([-F.W / 2 - 3, oZ[a]], [-cx, cz]);
  else list.push([oX[a], F.H / 2 + 3]);
  if (k < list.length) { out[0] = list[k][0]; out[1] = list[k][1]; return false; }
  slotPos(oSlot[a], out); return true;
}
function stepOutside(dt) {
  for (let a = 0; a < C.n; a++) {
    if (!C.out[a]) continue;
    if (!oState[a]) {
      oState[a] = 1; oX[a] = C.px[a]; oZ[a] = C.pz[a]; oWp[a] = 0; oSlot[a] = slotN++; oV[a] = 0;
      const ax = Math.abs(C.px[a]) - F.W / 2, az = Math.abs(C.pz[a]) - F.H / 2;
      const side = az > ax ? (C.pz[a] < 0 ? 0 : 1) : (C.px[a] > 0 ? 2 : 3);
      oSide[a] = side | (C.px[a] < 0 ? 4 : 0);
    }
    if (oState[a] === 2) { oV[a] = 0; continue; }
    const last = waypoint(a, oWp[a], wpTmp);
    const dx = wpTmp[0] - oX[a], dz = wpTmp[1] - oZ[a], d = Math.hypot(dx, dz), step = oSp[a] * dt;
    if (d <= step) { oX[a] = wpTmp[0]; oZ[a] = wpTmp[1]; if (last) oState[a] = 2; else oWp[a]++; }
    else { oX[a] += dx / d * step; oZ[a] += dz / d * step; }
    oV[a] = oState[a] === 2 ? 0 : oSp[a];
    if (d > 1e-3) C_dir[a] = Math.atan2(dx, dz);
  }
}
const C_dir = new Float32Array(MAXP);
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
  const FLOOR_M = { salon: K.parquet, avm: K.terrazzo, stadyum: K.concrete, sutun: K.epoxy };
  floorMesh = new THREE.Mesh(new THREE.BoxGeometry(F.W + 1, 0.3, F.H + 1).translate(0, -0.145, 0), FLOOR_M[key] || K.epoxy);
  floorMesh.receiveShadow = true;
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
    m.position.y = y; m.userData.noAO = true; m.raycast = () => {};
    sim.scene.add(m);
    return [tex, m];
  };
  [heatTex, heatPlane] = mk(0.03, 0.85);
  [smokeTex, smokePlane] = mk(2.4, 0.8);
  heatPlane.visible = heatOn.value;
  dgrid = new Float32Array(F.N);
  const k = Math.max(F.W, F.H * 1.5);
  sim.moveCamera([0.9 * k, 0.62 * k, 1.25 * k], [0, 0, 0.2 * k]);
  // Toplanma alanı zemin boyası ve levhası
  const zA = F.H / 2 + 7.2, zB = zA + 9 * AS.pitch + 1.4, xA = (AS.cols / 2) * AS.pitch + 0.8;
  if (zoneMesh) { sim.scene.remove(zoneMesh); zoneMesh.geometry.dispose(); zoneMesh.material.map.dispose(); zoneMesh.material.dispose(); }
  zoneMesh = zoneDecal(2 * xA, zB - zA); zoneMesh.position.set(0, 0.006, (zA + zB) / 2); sim.scene.add(zoneMesh);
  signGroup.position.set(xA + 1.2, 0, zA + 0.5); signGroup.rotation.y = 0.4;
  rebuildStatic();
  restart(false);
}

// Kesit düzlemi: güneydoğu köşede 1,1 m, kuzeybatı köşede 4,5 m (arka duvarlar fon olur, ön duvarlar görüşü kapatmaz)
const DOOR_H = 2.3;
function cutH(x, z) {
  const s = THREE.MathUtils.clamp(((F.W / 2 - x) / F.W + (F.H / 2 - z) / F.H) / 2, 0, 1);
  return 1.1 + 3.4 * s;
}
const sconceGeo = new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1.6, 1, 0.6);
const sconceMat = mat.glow({ color: 0xffd9a0, intensity: 3 });
function rebuildStatic() {
  for (const o of [wallExt, wallInt, wallTop]) if (o) { sim.scene.remove(o); o.geometry.dispose(); }
  if (seatGroup) { sim.scene.remove(seatGroup); seatGroup.traverse((o) => { if (o.isInstancedMesh) o.dispose(); else if (o.isMesh) o.geometry.dispose(); }); }
  if (doorGroup) { sim.scene.remove(doorGroup); doorGroup.traverse((o) => o.isMesh && o.geometry.dispose()); }
  // Duvarlar: ardışık duvar hücreleri kutulara birleşir; eğik kesit düzlemi (GD köşede alçak, KB köşede yüksek)
  const rects = [];
  const isPil = (i, j) => F.pillars.some((p) => Math.hypot(F.cx(i) - p.x, F.cz(j) - p.z) < p.r + 0.2);
  for (let j = 0; j < F.NZ; j++) {
    let run = -1;
    for (let i = 0; i <= F.NX; i++) {
      const w = i < F.NX && F.type[F.idx(i, j)] === T.WALL && !isPil(i, j);
      if (w && run < 0) run = i;
      if (!w && run >= 0) { rects.push([F.cx(run) - CS / 2, F.cz(j) - CS / 2, F.cx(i - 1) + CS / 2, F.cz(j) + CS / 2]); run = -1; }
    }
  }
  const all = mergeRuns(rects);
  // Çıkış açıklıklarının üstüne lento (kesit kapı yüksekliğinin üstündeyse)
  for (const e of F.exits) {
    const L = e.side === 'N' || e.side === 'S' ? F.W : F.H, c = -L / 2 + e.t * L, hw = Math.max(0.8, F.width) / 2 + 0.05;
    const r = e.side === 'N' ? [c - hw, -F.H / 2 - CS, c + hw, -F.H / 2] : e.side === 'S' ? [c - hw, F.H / 2, c + hw, F.H / 2 + CS]
      : e.side === 'W' ? [-F.W / 2 - CS, c - hw, -F.W / 2, c + hw] : [F.W / 2, c - hw, F.W / 2 + CS, c + hw];
    all.push([...r, DOOR_H]);
  }
  const wg = cutawayWalls(all, cutH, (x, z) => Math.abs(x) > F.W / 2 + 0.01 || Math.abs(z) > F.H / 2 + 0.01);
  wallExt = new THREE.Mesh(wg.ext, KB.facade); wallInt = new THREE.Mesh(wg.int, KB.interior);
  wallTop = new THREE.Mesh(wg.top, KB.poche);
  for (const m of [wallExt, wallInt, wallTop]) { m.castShadow = m.receiveShadow = true; }
  wallTop.raycast = () => {};
  sim.scene.add(wallExt, wallInt, wallTop);
  // Koltuklar, sahne, havuz, pano (SEAT hücreleri)
  seatGroup = new THREE.Group();
  sim.scene.add(seatGroup);
  const seatCells = [];
  for (let k = 0; k < F.N; k++) if (F.type[k] === T.SEAT) seatCells.push(k);
  const inR = (k, x1, z1, x2, z2) => { const i = k % F.NX, j = (k - i) / F.NX, x = F.cx(i), z = F.cz(j); return x > x1 && x < x2 && z > z1 && z < z2; };
  const blockCells = planKey === 'salon' ? seatCells.filter((k) => inR(k, -8, -10, 8, -7)) : planKey === 'avm' ? seatCells.filter((k) => inR(k, -2, -1.5, 2, 1.5)) : planKey === 'stadyum' ? seatCells.filter((k) => inR(k, -22, 10, 22, 14)) : [];
  const bset = new Set(blockCells);
  const chairs = seatCells.filter((k) => !bset.has(k));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  const place = (list, geo, m, rot, colorFn) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, m, list.length);
    q.setFromAxisAngle(up, rot);
    list.forEach((k, n) => { const i = k % F.NX, j = (k - i) / F.NX; m4.compose(v.set(F.cx(i), 0, F.cz(j)), q, one); im.setMatrixAt(n, m4); if (colorFn) im.setColorAt(n, colorFn(i, j)); });
    im.castShadow = im.receiveShadow = true;
    seatGroup.add(im);
  };
  if (planKey === 'stadyum') {
    const sg = stadiumSeat();
    place(chairs, sg.shell, K.plasticSeat, 0, (i, j) => tint.setHex(((i >> 1) + j) % 9 === 0 ? 0xf2f2f0 : 0x1f5fb4));
    place(chairs, sg.leg, K.seatFrame, 0);
  } else if (chairs.length) {
    const tc = theatreChair();
    place(chairs, tc.fab, K.seatFabric, 0);
    place(chairs, tc.frame, K.seatFrame, 0);
  }
  if (blockCells.length) {
    let x1 = 1e9, z1 = 1e9, x2 = -1e9, z2 = -1e9;
    for (const k of blockCells) { const i = k % F.NX, j = (k - i) / F.NX; x1 = Math.min(x1, F.cx(i) - CS / 2); x2 = Math.max(x2, F.cx(i) + CS / 2); z1 = Math.min(z1, F.cz(j) - CS / 2); z2 = Math.max(z2, F.cz(j) + CS / 2); }
    const w = x2 - x1, d = z2 - z1, cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; seatGroup.add(o); return o; };
    if (planKey === 'salon') {
      seatGroup.add(stageSet(x1, z1, x2, z2, 0.9));
      // Orta koridor halısı ve yan koridor şeritleri
      const carpet = (xa, xb, za, zb) => { const c = new THREE.Mesh(new THREE.BoxGeometry(xb - xa, 0.012, zb - za), KB.carpet); c.position.set((xa + xb) / 2, 0.006, (za + zb) / 2); c.receiveShadow = true; c.raycast = () => {}; seatGroup.add(c); };
      carpet(-1.7, 1.7, z2 + 1.4, F.H / 2 - 0.2);
      carpet(-15, 15, z2 + 0.2, z2 + 1.4);
    } else if (planKey === 'avm') {
      add(new THREE.BoxGeometry(w, 0.5, d), K.stone, cx, 0.25, cz);
      const wt = add(new THREE.BoxGeometry(w - 0.6, 0.05, d - 0.6), K.water, cx, 0.46, cz); wt.castShadow = false;
      add(new THREE.CylinderGeometry(0.18, 0.28, 1.4, 16), K.stone, cx, 1.1, cz);
      add(new THREE.CylinderGeometry(0.7, 0.5, 0.18, 24), K.stone, cx, 1.8, cz);
    } else {
      add(new THREE.BoxGeometry(w, 0.02, d), K.turf, cx, 0.015, cz);
      add(new THREE.BoxGeometry(w, 0.95, 0.25), K.seatFrame, cx, 0.475, z1 + 0.3);
      const led = add(new THREE.BoxGeometry(w - 0.4, 0.75, 0.02), K.led, cx, 0.5, z1 + 0.44); led.castShadow = false;
    }
  }
  // Acil çıkış kapıları
  doorGroup = new THREE.Group();
  sim.scene.add(doorGroup);
  for (const e of F.exits) {
    const L = e.side === 'N' || e.side === 'S' ? F.W : F.H, c = -L / 2 + e.t * L;
    const dw = Math.max(0.8, F.width), d = exitDoor(dw, DOOR_H);
    if (e.side === 'N') { d.position.set(c, 0, -F.H / 2 - 0.25); }
    else if (e.side === 'S') { d.position.set(c, 0, F.H / 2 + 0.25); d.rotation.y = Math.PI; }
    else if (e.side === 'W') { d.position.set(-F.W / 2 - 0.25, 0, c); d.rotation.y = Math.PI / 2; }
    else { d.position.set(F.W / 2 + 0.25, 0, c); d.rotation.y = -Math.PI / 2; }
    // Kasa başlığı; duvar kapının üstüne çıkıyorsa levha duvarın iç yüzüne asılır
    const head = new THREE.Mesh(new RoundedBoxGeometry(dw + 0.16, 0.1, 0.56, 1, 0.02), K.door);
    head.position.set(0, DOOR_H + 0.05, 0); d.add(head);
    if (cutH(d.position.x, d.position.z) > DOOR_H + 0.7) d.children.forEach((o) => {
      if (o.material === K.sign || o.material === K.signWhite) { o.position.z = 0.3; o.position.y = DOOR_H + 0.35; }
      else if (o.geometry && o.geometry.type === 'CylinderGeometry') o.visible = false;
    });
    d.traverse((o) => { o.raycast = () => {}; });
    doorGroup.add(d);
  }
  // Kaçış güzergâhı okları: her çıkıştan bina köşesini dönüp toplanma alanına
  arrows.reset();
  let na = 0;
  const ecx = F.W / 2 + 4, ecz = F.H / 2 + 3.5, zAs = F.H / 2 + 7.2;
  for (const e of F.exits) {
    const L = e.side === 'N' || e.side === 'S' ? F.W : F.H, c = -L / 2 + e.t * L, sx = c < 0 ? -1 : 1;
    const pts = e.side === 'N' ? [[c, -F.H / 2 - 1.5], [c, -F.H / 2 - 3], [sx * ecx, -F.H / 2 - 3], [sx * ecx, ecz], [sx * 6, zAs - 0.5]]
      : e.side === 'E' ? [[F.W / 2 + 1.5, c], [ecx, c], [ecx, ecz], [6, zAs - 0.5]]
      : e.side === 'W' ? [[-F.W / 2 - 1.5, c], [-ecx, c], [-ecx, ecz], [-6, zAs - 0.5]]
      : [[c, F.H / 2 + 1.5], [c, zAs - 0.5]];
    let carry = 0;
    for (let k = 0; k + 1 < pts.length && na < 160; k++) {
      const [x0, z0] = pts[k], [x1, z1] = pts[k + 1], len = Math.hypot(x1 - x0, z1 - z0), dir = Math.atan2(x1 - x0, z1 - z0);
      let t = carry;
      for (; t < len && na < 160; t += 3.2) arrows.set(na++, x0 + (x1 - x0) * t / len, z0 + (z1 - z0) * t / len, dir);
      carry = t - len;
    }
  }
  arrows.commit();
  // Yangın dolapları (doğu/batı iç yüz) ve aplikler (yüksek kalan kuzey/batı duvarlarda)
  const nearExit = (side, pos) => F.exits.some((e) => { const L = e.side === 'N' || e.side === 'S' ? F.W : F.H; return e.side === side && Math.abs(-L / 2 + e.t * L - pos) < F.width / 2 + 1.5; });
  for (const [side, pos] of [['W', F.H * 0.15], ['E', -F.H * 0.2], ['W', -F.H * 0.3]]) {
    if (nearExit(side, pos)) continue;
    const fc = fireCabinet();
    fc.position.set(side === 'W' ? -F.W / 2 : F.W / 2, 0, pos); fc.rotation.y = side === 'W' ? Math.PI / 2 : -Math.PI / 2;
    doorGroup.add(fc);
  }
  for (let x = -F.W / 2 + 2; x < F.W / 2 - 1; x += 4) {
    if (cutH(x, -F.H / 2) < 3.2 || nearExit('N', x)) continue;
    const l = new THREE.Mesh(sconceGeo, sconceMat); l.position.set(x, 2.7, -F.H / 2 + 0.06); l.raycast = () => {}; doorGroup.add(l);
  }
  for (let z = -F.H / 2 + 2; z < F.H / 2 - 1; z += 4) {
    if (cutH(-F.W / 2, z) < 3.2 || nearExit('W', z)) continue;
    const l = new THREE.Mesh(sconceGeo, sconceMat); l.position.set(-F.W / 2 + 0.06, 2.7, z); l.rotation.y = Math.PI / 2; l.raycast = () => {}; doorGroup.add(l);
  }
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
  pillarMesh.computeBoundingSphere();
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
  dressPeople();
  flames.clear();
  done = false; evacT = 0; chartAcc = 0;
  chart.clear();
}

function clearFire() {
  F.fire.fill(0); F.fireList = []; F.fireCount = 0; F.smoke.fill(0);
  flames.clear();
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
const ringT = ui.toggle({ label: 'Kişi altında yoğunluk rengi (halka)', value: true });
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
sim.onClick(() => [floorMesh, wallExt, wallInt, exitMesh].filter(Boolean), (hit) => {
  const p = hit.point.clone();
  // Duvarın yan yüzüne tıklanınca nokta hücre sınırına düşer: duvarın içine doğru biraz kaydır
  if ((hit.object === wallExt || hit.object === wallInt) && hit.face) p.addScaledVector(hit.face.normal, -0.1);
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
  stepOutside(dt);
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
  // İnsanlar: yürüme yönüne dönük; bacaklar kalçadan, kollar omuzdan salınır. Dışarı çıkanlar toplanma alanına yürür.
  let m = 0, mr = 0;
  const showRing = ringT.value;
  for (let a = 0; a < C.n; a++) {
    const outside = C.out[a] && oState[a];
    if (C.out[a] && !oState[a]) continue;
    let px, pz, sp, dir;
    if (outside) { px = oX[a]; pz = oZ[a]; sp = sim.paused ? 0 : oV[a]; dir = oState[a] === 2 ? Math.PI : C_dir[a]; }
    else { px = C.px[a]; pz = C.pz[a]; const vx = C.vx[a], vz = C.vz[a]; sp = Math.hypot(vx, vz); dir = sp > 0.15 ? Math.atan2(vx, vz) : null; }
    if (dir != null) {
      let d = dir - yaw[a];
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yaw[a] += d * Math.min(1, real * 8);
    }
    // adım döngüsü gerçek yer değiştirmeden gelir (crowd.update); hızlı kaçışta koşu
    folk.set(a, px, 0, pz, yaw[a], sp > 1.9 ? 'run' : 'walk');
    seen[a] = 1; m++;
    const s = C.r[a] / 0.22;
    if (!outside && showRing) {
      dummy.position.set(px, 0, pz); dummy.rotation.set(0, 0, 0); dummy.scale.set(s, 1, s); dummy.updateMatrix();
      people.setMatrixAt(mr, dummy.matrix);
      if (C.t < C.delay[a] * 6 * (1 - 0.7 * panicS.value)) col.setHex(0x93c5fd);
      else col.setHSL(0.33 * Math.max(0, Math.min(1, 1 - (C.dens[a] - 1.5) / 4)), 0.85, 0.52);
      people.setColorAt(mr, col);
      mr++;
    }
  }
  dummy.scale.set(1, 1, 1);
  people.count = mr;
  for (let a = 0; a < MAXP; a++) { if (shown[a] && !seen[a]) folk.hide(a); shown[a] = seen[a]; seen[a] = 0; }
  folk.update(performance.now() / 1000);
  people.instanceMatrix.needsUpdate = true; if (people.instanceColor) people.instanceColor.needsUpdate = true;
  // Alevler ve duman parçacıkları (yanan hücrelerden rastgele seçilerek)
  const fl = F.fireList;
  if (fl.length && !sim.paused) {
    const nE = Math.min(40, Math.ceil(real * Math.min(900, 60 + fl.length * 6)));
    let cx = 0, cz = 0;
    for (let q = 0; q < nE; q++) {
      const k = fl[Math.floor(Math.random() * fl.length)], i = k % F.NX, j = (k - i) / F.NX;
      const x = F.cx(i) + rand(-0.25, 0.25), z = F.cz(j) + rand(-0.25, 0.25);
      if (Math.random() < 0.7) flames.emit(x, 0.1, z, rand(-0.2, 0.2), rand(1.2, 2.2), rand(-0.2, 0.2), { s0: 0.35, s1: 1.1, life: 0.9, a: 0.9, heat: 1.6, alb: 0.08, rise: 2.4, drag: 1.5 });
      else flames.emit(x, 1.2, z, rand(-0.2, 0.2), rand(0.8, 1.2), rand(-0.2, 0.2), { s0: 0.8, s1: 3.6, life: 7, a: 0.4, alb: 0.16, rise: 0.25, drag: 0.9 });
    }
    for (let q = 0; q < Math.min(fl.length, 60); q++) { const k = fl[(q * 7919) % fl.length], i = k % F.NX, j = (k - i) / F.NX; cx += F.cx(i); cz += F.cz(j); }
    const nn = Math.min(fl.length, 60);
    fireLight.position.set(cx / nn, 1.3, cz / nn);
    fireLight.intensity = (40 + 12 * Math.sqrt(fl.length)) * (0.75 + 0.25 * Math.sin(performance.now() / 70) * Math.sin(performance.now() / 113));
  } else if (!fl.length) fireLight.intensity = 0;
  if (!sim.paused) flames.update(real);
  flames.light(sim.sky, sim.camera);

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
