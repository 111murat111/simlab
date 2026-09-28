// Restoran Yönetimi — dakika adımlı kuyruk simülasyonu: Poisson gelişler, masa/aşçı/garson darboğazları, stok ve fire, 14 günlük işletme oyunu.
import { createSim, THREE, fmt, clamp, lerp, instanced, disposeObject } from '@core';

const SLOTS = 20, COLS = 5;
const MIN_PER_SEC = 10;          // 1× hızda 1 sn = 10 dk
const P0 = 350;                  // referans menü fiyatı (₺)
const ELASTIC = 1.2;             // talebin fiyat esnekliği
const UNIT_COST = 140;           // normal porsiyon malzeme maliyeti (₺)
const SHELF = 2;                 // taze malzeme raf ömrü (gün)
const GAME_DAYS = 14;
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const DAY_MUL = [0.9, 0.9, 0.95, 1, 1.15, 1.35, 1.3];
const PORTION = { kucuk: { name: 'Küçük', use: 0.75, sat: -0.5, cook: -1 }, normal: { name: 'Normal', use: 1, sat: 0, cook: 0 }, buyuk: { name: 'Büyük', use: 1.3, sat: 0.3, cook: 1 } };
const SHIRTS = [0x60a5fa, 0xf472b6, 0x34d399, 0xfbbf24, 0xa78bfa, 0xf87171, 0x22d3ee, 0xfb923c, 0xe2e8f0, 0x84cc16];

const sim = createSim({
  background: 0x0d1424,
  camera: { position: [0, 19, 21], target: [0, 0, 1.5], fov: 45 },
  controls: { maxDistance: 60, minDistance: 8, maxPolarAngle: Math.PI * 0.45 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Restoranın bir günü dakika dakika işler. Müşteri grupları kapıya <b>Poisson süreci</b> ile gelir; geliş hızı öğle
    (12–14) ve akşam (19–21) saatlerinde zirve yapar, hafta sonu artar. Boş masa yoksa kuyruğa girerler; çok beklerlerse
    <b>vazgeçip giderler</b>. Masadaki grup için garson siparişi alır, aşçılar tabakları pişirir, garson servis eder,
    yemekten sonra hesap gelir. Masanın üstündeki top: <span style="color:#fb923c">turuncu</span> garson bekliyor,
    <span style="color:#facc15">sarı</span> yemek pişiyor, <span style="color:#4ade80">yeşil</span> yiyor,
    <span style="color:#60a5fa">mavi</span> hesap bekliyor.</p>
    <p><b>Talep:</b> fiyat arttıkça müşteri azalır (esneklik ≈ ${fmt(ELASTIC, 1)}: fiyat %10 artınca talep ~%11 düşer).
    Memnuniyet (★) bekleme süresi, porsiyon, fiyat ve stok yokluğuna bağlıdır ve itibar yoluyla gelecek günlerin talebini etkiler.
    <b>Stok:</b> her sabah sipariş ettiğin porsiyonluk malzeme gelir; ${SHELF} gün içinde kullanılmayan taze malzeme <b>fire</b> olur.</p>
    <h3>Dene</h3>
    <ul>
      <li>Öğle zirvesinde kuyruk uzuyorsa darboğaz nerede? Masa mı, aşçı mı, garson mu? Birini artırıp gözle.</li>
      <li>Fiyatı düşür: müşteri artar ama kâr artar mı? Mutfak yetişemezse memnuniyet düşer.</li>
      <li>Stok siparişini çok artır: fire maliyeti; çok azalt: “stok bitti”, kızgın müşteri. En iyi nokta nerede?</li>
      <li>“Tedarik zammı” sonrası fiyatı ya da porsiyonu nasıl ayarlarsın?</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Restoranlarda malzeme maliyeti genellikle cironun üçte biri civarında hedeflenir; personel ve kira en büyük sabit
    giderlerdir. Kuyruk teorisi (Little yasası: ortalama kuyruk = geliş hızı × ortalama bekleme) kapasite planlamasında kullanılır.
    Fiyatlara %10 KDV dahil kabul edilmiştir; diğer tutarlar örnektir.</p>`,
});

// --- Sahne ---
const slotPos = (j) => [-8 + (j % COLS) * 4, -2.6 + Math.floor(j / COLS) * 2.75];
{
  const floor = new THREE.Mesh(new THREE.BoxGeometry(22, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.8 }));
  floor.position.set(0, -0.1, 0);
  sim.scene.add(floor);
  const tiles = new THREE.Mesh(new THREE.PlaneGeometry(22, 4), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.6 }));
  tiles.rotation.x = -Math.PI / 2; tiles.position.set(0, 0.005, -6);
  sim.scene.add(tiles);
  const street = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 1 }));
  street.rotation.x = -Math.PI / 2; street.position.set(0, -0.2, 10);
  sim.scene.add(street);
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 1 }));
  walk.rotation.x = -Math.PI / 2; walk.position.set(0, -0.19, 11);
  sim.scene.add(walk);
  // Duvarlar (arka ve yanlar alçak; ön duvarda kapı)
  const wm = new THREE.MeshStandardMaterial({ color: 0xe7dcc8, roughness: 0.9 });
  const wall = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wm); m.position.set(x, y, z); sim.scene.add(m); };
  wall(22, 2.2, 0.3, 0, 1.1, -8);
  wall(0.3, 1.2, 16, -11, 0.6, 0);
  wall(0.3, 1.2, 16, 11, 0.6, 0);
  wall(9.5, 0.7, 0.3, -6.25, 0.35, 8);
  wall(9.5, 0.7, 0.3, 6.25, 0.35, 8);
  // Mutfak tezgâhı (servis bankosu) ve ocaklar
  const counter = new THREE.Mesh(new THREE.BoxGeometry(16, 1, 0.8), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.4, roughness: 0.4 }));
  counter.position.set(-1, 0.5, -4.3);
  sim.scene.add(counter);
  const stoves = instanced(new THREE.BoxGeometry(1.4, 0.95, 1), new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5, roughness: 0.4 }), 6);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 6; i++) stoves.setMatrixAt(i, m.makeTranslation(-7.5 + i * 2.2, 0.47, -7.2));
  sim.scene.add(stoves);
  // Tabela
  const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 0.15), new THREE.MeshStandardMaterial({ color: 0x7c2d12 }));
  sign.position.set(0, 2.2, 8.1);
  sim.scene.add(sign);
  sim.label('🍽️ Lokanta', { parent: sign, position: [0, 0, 0.2], className: 'big' });
}
// Soğuk oda / stok rafı
const fridge = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.4, 1.2), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.3, roughness: 0.4 }));
fridge.position.set(9.4, 1.2, -6.9);
sim.scene.add(fridge);
const STOCK_BOX = 60;
const stockBoxes = instanced(new THREE.BoxGeometry(0.42, 0.3, 0.42), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), STOCK_BOX);
{
  const m = new THREE.Matrix4();
  for (let i = 0; i < STOCK_BOX; i++) {
    const layer = Math.floor(i / 12), k = i % 12;
    stockBoxes.setMatrixAt(i, m.makeTranslation(7.3 + (k % 4) * 0.5 - 0.75, 0.16 + layer * 0.32, -5.9 + Math.floor(k / 4) * 0.5));
    stockBoxes.setColorAt(i, new THREE.Color(0xd6a45c));
  }
  sim.scene.add(stockBoxes);
}
const stockLbl = sim.label('', { position: [8.3, 2.9, -6.4] });
const queueLbl = sim.label('', { position: [2.6, 1.9, 9.2] });

// Masalar ve sandalyeler
const tableMeshes = [];
const chairs = instanced(new THREE.BoxGeometry(0.45, 0.5, 0.45), new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 }), SLOTS * 4);
const SEAT = [[-0.85, 0], [0.85, 0], [0, -0.85], [0, 0.85]];
{
  const topGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.08, 20), legGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.7, 6);
  const topMat = new THREE.MeshStandardMaterial({ color: 0xd6b48a, roughness: 0.6 }), legMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46 });
  for (let j = 0; j < SLOTS; j++) {
    const [x, z] = slotPos(j);
    const g = new THREE.Group();
    const top = new THREE.Mesh(topGeo, topMat); top.position.y = 0.74;
    const leg = new THREE.Mesh(legGeo, legMat); leg.position.y = 0.35;
    g.add(top, leg);
    g.position.set(x, 0, z);
    g.userData.slot = j;
    top.userData.slot = j;
    sim.scene.add(g);
    tableMeshes.push(g);
  }
}
const indicators = instanced(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), SLOTS);
const plates = instanced(new THREE.CylinderGeometry(0.17, 0.14, 0.05, 12), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }), SLOTS * 4);
indicators.frustumCulled = plates.frustumCulled = chairs.frustumCulled = false;
for (let i = 0; i < SLOTS; i++) indicators.setColorAt(i, new THREE.Color(1, 1, 1));
sim.scene.add(chairs, indicators, plates);

// İnsan figürleri (gövde + baş)
const MAXP = 220;
const bodies = instanced(new THREE.CylinderGeometry(0.2, 0.26, 0.85, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), MAXP);
const heads = instanced(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf1c7a1, roughness: 0.7 }), MAXP);
bodies.frustumCulled = heads.frustumCulled = false;
for (let i = 0; i < MAXP; i++) bodies.setColorAt(i, new THREE.Color(1, 1, 1));
sim.scene.add(bodies, heads);

// Personel
function staffFigure(color, hat) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.95, 8), new THREE.MeshStandardMaterial({ color }));
  b.position.y = 0.48;
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe8b98f }));
  h.position.y = 1.1;
  g.add(b, h);
  if (hat) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0xffffff })); t.position.y = 1.35; g.add(t); }
  else { const t = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff })); t.position.set(0, 0.6, 0.2); g.add(t); }
  sim.scene.add(g);
  return g;
}
const chefMeshes = Array.from({ length: 6 }, () => staffFigure(0xf8fafc, true));
const waiterMeshes = Array.from({ length: 6 }, () => staffFigure(0x111827, false));
chefMeshes.forEach((c, i) => c.position.set(-7.5 + i * 2.2, 0, -6.3));
waiterMeshes.forEach((w, i) => w.position.set(-6 + i * 2, 0, -3.4));

// --- Durum ---
let S; // gün içi ve toplam durum
let groups = [];
let gid = 0;
function freshState() {
  return {
    day: 0, minute: 0, rep: 4.0, zam: false, surge: 1,
    batches: [],                 // [{qty, age}]
    totals: { revenue: 0, cost: 0, profit: 0, customers: 0, lost: 0, waste: 0 },
    over: false,
  };
}
function dayState() {
  return { customers: 0, groups: 0, lost: 0, balked: 0, plates: 0, revenue: 0, ratings: [], stockout: 0, waste: 0, waitSum: 0, waitN: 0, maxQueue: 0, stockoutToast: false };
}
let D = dayState();
let tasks = [], kitchenQ = [];
let waiters = [], chefs = [];

const openMin = () => openH.value * 60, closeMin = () => closeH.value * 60;
const activeTables = () => tables.value;
let tableOcc = new Array(SLOTS).fill(null);

function stockQty() { return S.batches.reduce((a, b) => a + b.qty, 0); }
function takeStock(q) {
  let need = q;
  for (const b of S.batches) { const t = Math.min(b.qty, need); b.qty -= t; need -= t; if (need <= 1e-9) break; }
  S.batches = S.batches.filter((b) => b.qty > 1e-6);
  return q - need;
}

// Poisson sayısı (Knuth)
function poisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }
const bump = (h, mu, s) => Math.exp(-((h - mu) ** 2) / (2 * s * s));
function arrivalRate(minute) {
  const h = minute / 60;
  const base = 1.5 + 3 * bump(h, 9, 1) + 14 * bump(h, 13, 1) + 12 * bump(h, 20, 1.3);
  const price = Math.pow(price_.value / P0, -ELASTIC);
  const rep = clamp(1 + 0.3 * (S.rep - 4), 0.45, 1.4);
  return base * price * rep * DAY_MUL[S.day % 7] * (campaign.value ? 1.3 : 1) * S.surge; // grup / saat
}

function startDay() {
  D = dayState();
  S.minute = openMin();
  S.surge = S.surge > 1 ? S.surge : 1;
  const q = stockOrder.value;
  if (q > 0) S.batches.push({ qty: q, age: 0 });
  D.orderCost = q * UNIT_COST * (S.zam ? 1.35 : 1);
  groups = []; tasks = []; kitchenQ = [];
  tableOcc = new Array(SLOTS).fill(null);
  syncStaff();
  chartDay.clear();
}
function syncStaff() {
  while (waiters.length < waitersN.value) waiters.push({ busy: 0, task: null });
  while (chefs.length < chefsN.value) chefs.push({ busy: 0, g: null });
}

function newGroup() {
  const r = Math.random();
  const size = r < 0.25 ? 1 : r < 0.65 ? 2 : r < 0.85 ? 3 : 4;
  const [dx, dz] = [(Math.random() - 0.5) * 6, 16];
  return {
    id: gid++, size, state: 'queue', t: 0, table: -1, arrive: S.minute, patience: 8 + Math.random() * 20,
    waitQ: 0, seatedAt: 0, servedAt: 0, plates: 0, missing: 0, rating: 0,
    members: Array.from({ length: size }, (_, i) => ({ pos: new THREE.Vector3(dx + i * 0.5, 0, dz), color: SHIRTS[(Math.random() * SHIRTS.length) | 0] })),
  };
}

function rate(g, ok = true) {
  const pf = PORTION[portion.value];
  const wait = g.waitQ + (g.servedAt - g.seatedAt);
  let s = 4.6 - Math.max(0, wait - 20) * 0.045 + pf.sat - (price_.value / P0 - 1) * 1.2 - (g.plates ? g.missing / (g.plates + g.missing) : 1) * 2.5;
  if (!ok) s = 1.5;
  g.rating = clamp(s, 1, 5);
  D.ratings.push(g.rating);
  D.waitSum += wait; D.waitN++;
}

// Bir dakikalık adım
function stepMinute() {
  const m = S.minute, open = m < closeMin();
  // Gelişler
  if (open) {
    const n = poisson(arrivalRate(m) / 60);
    for (let i = 0; i < n; i++) {
      const qLen = groups.filter((g) => g.state === 'queue').length;
      if (qLen >= 12 || (qLen >= 7 && Math.random() < 0.5)) { D.balked++; continue; }
      const g = newGroup();
      groups.push(g); D.groups++;
    }
  }
  // Kuyruk: sabır ve oturma
  for (const g of groups) {
    if (g.state !== 'queue') continue;
    g.waitQ++;
    if (g.waitQ > g.patience || !open) { g.state = 'leave'; g.t = 3; D.lost += g.size; if (open) { D.ratings.push(2.5); } continue; }
    const j = tableOcc.findIndex((o, k) => o === null && k < activeTables());
    if (j >= 0) { tableOcc[j] = g; g.table = j; g.state = 'order'; g.seatedAt = m; tasks.push({ g, type: 'order' }); }
  }
  // Garsonlar
  for (let w = 0; w < waiters.length; w++) {
    const W = waiters[w];
    if (W.busy > 0 && --W.busy === 0 && W.task) finishTask(W.task);
    if (W.busy === 0) {
      W.task = null;
      if (w < waitersN.value && tasks.length) { W.task = tasks.shift(); W.busy = W.task.type === 'serve' ? 2 : 3; }
    }
  }
  waiters = waiters.filter((W, w) => w < waitersN.value || W.busy > 0);
  // Mutfak
  for (let c = 0; c < chefs.length; c++) {
    const C = chefs[c];
    if (C.busy > 0 && --C.busy === 0 && C.g) { const g = C.g; g.state = 'serve'; tasks.push({ g, type: 'serve' }); }
    if (C.busy === 0) {
      C.g = null;
      // Bir aşçı bir masanın siparişini (fişini) bütün olarak hazırlar
      if (c < chefsN.value && kitchenQ.length) { C.g = kitchenQ.shift(); C.busy = Math.max(4, Math.round(6 + 1.5 * C.g.plates + Math.random() * 4 + PORTION[portion.value].cook)); }
    }
  }
  chefs = chefs.filter((C, c) => c < chefsN.value || C.busy > 0);
  // Yemek ve ayrılma
  for (const g of groups) {
    if (g.state === 'eat' && --g.t <= 0) { g.state = 'bill'; tasks.push({ g, type: 'bill' }); }
    else if (g.state === 'leave') g.t -= 1;
  }
  groups = groups.filter((g) => !(g.state === 'leave' && g.t <= 0));
  D.maxQueue = Math.max(D.maxQueue, groups.filter((g) => g.state === 'queue').length);
  S.minute++;
  if (S.minute % 10 === 0) {
    const q = groups.filter((g) => g.state === 'queue').length;
    const occ = tableOcc.filter((o, k) => o && k < activeTables()).length / Math.max(1, activeTables());
    chartDay.push([q, occ * 100]);
  }
  if (!open && !groups.length) endDay();
}

function finishTask(task) {
  const g = task.g;
  if (task.type === 'order') {
    const use = PORTION[portion.value].use;
    const got = Math.floor(takeStock(g.size * use) / use + 1e-6);
    g.plates = got; g.missing = g.size - got;
    if (got < g.size) {
      D.stockout += g.size - got;
      if (!D.stockoutToast) { D.stockoutToast = true; sim.toast('📦 Stok bitti! Bazı yemekler verilemiyor.', 'bad'); }
    }
    if (got === 0) { rate(g, false); leaveTable(g); D.lost += g.size; return; }
    g.state = 'cook';
    kitchenQ.push(g);
  } else if (task.type === 'serve') {
    g.state = 'eat'; g.servedAt = S.minute; g.t = 25 + Math.random() * 15;
  } else if (task.type === 'bill') {
    const rev = (g.plates * price_.value) / 1.1; // KDV hariç
    D.revenue += rev; D.plates += g.plates; D.customers += g.size;
    rate(g, true);
    leaveTable(g);
  }
}
function leaveTable(g) {
  if (g.table >= 0) tableOcc[g.table] = null;
  g.state = 'leave'; g.t = 3;
}

function endDay() {
  // Fire: raf ömrü dolan malzeme
  for (const b of S.batches) b.age++;
  const spoiled = S.batches.filter((b) => b.age >= SHELF).reduce((a, b) => a + b.qty, 0);
  S.batches = S.batches.filter((b) => b.age < SHELF);
  const unit = UNIT_COST * (S.zam ? 1.35 : 1);
  D.waste = spoiled;
  const hours = (closeMin() - openMin()) / 60;
  const staff = (chefsN.value * 3000 + waitersN.value * 2000) * (hours / 12);
  const rent = 6000, util = 250 * hours, ad = campaign.value ? 1500 : 0;
  const cost = D.orderCost + staff + rent + util + ad;
  const profit = D.revenue - cost;
  const avg = D.ratings.length ? D.ratings.reduce((a, b) => a + b, 0) / D.ratings.length : S.rep;
  S.rep = lerp(S.rep, avg, 0.35);
  const T = S.totals;
  T.revenue += D.revenue; T.cost += cost; T.profit += profit; T.customers += D.customers; T.lost += D.lost; T.waste += spoiled * unit;
  lastDay = { ...D, cost, profit, staff, rent, util, ad, avg, wasteCost: spoiled * unit, dayName: DAYS[S.day % 7] };
  chartDays.push([D.revenue / 1000, cost / 1000, profit / 1000]);
  S.day++;
  S.surge = 1;
  if (S.day >= GAME_DAYS) { gameOver(); return; }
  sim.hud.show(`<b>${lastDay.dayName} bitti</b> · ${fmt(D.customers)} müşteri · ciro ${fmt(D.revenue)} ₺ ·
    <span style="color:${profit >= 0 ? '#86efac' : '#fca5a5'}">kâr ${fmt(profit)} ₺</span> · ★ ${fmt(avg, 1)}
    ${D.lost ? ` · ${D.lost} kişi vazgeçti` : ''}${spoiled > 0.5 ? ` · fire ${fmt(spoiled)} porsiyon` : ''}`, { timeout: 3500, tone: profit >= 0 ? 'good' : 'bad' });
  startDay();
}
let lastDay = null;

function gameOver() {
  S.over = true;
  sim.pause();
  const T = S.totals;
  const grade = T.profit > 100000 && S.rep >= 4 ? '🏆 Usta işletmeci' : T.profit > 0 ? '👍 Kârdasın' : '📉 Zarardasın';
  sim.hud.show(`<h2>${GAME_DAYS} gün tamamlandı · ${grade}</h2>
    Toplam ciro <b>${fmt(T.revenue)} ₺</b> · gider <b>${fmt(T.cost)} ₺</b> ·
    kâr <b style="color:${T.profit >= 0 ? '#86efac' : '#fca5a5'}">${fmt(T.profit)} ₺</b><br>
    ${fmt(T.customers)} müşteri ağırladın, ${fmt(T.lost)} kişi vazgeçti · fire ${fmt(T.waste)} ₺ · itibar ★ ${fmt(S.rep, 1)}<br>
    <button class="btn primary" data-a="again">Tekrar oyna</button>`, { tone: T.profit >= 0 ? 'good' : 'bad' });
  sim.hud.el.querySelector('[data-a=again]').onclick = () => { newGame(); sim.play(); };
}

function newGame() {
  S = freshState();
  gid = 0; waiters = []; chefs = [];
  chartDays.clear();
  sim.hud.hide();
  startDay();
  updatePanel();
}

let acc = 0;
sim.onUpdate((dt) => {
  if (S.over) return;
  acc += dt * MIN_PER_SEC;
  let n = 0;
  while (acc >= 1 && n < 200 && !S.over) { acc -= 1; stepMinute(); n++; }
  if (n && sim.frame % 3 === 0) updatePanel();
});

// --- Görsel ---
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _q = new THREE.Quaternion(), _c = new THREE.Color();
const IND = { order: 0xfb923c, cook: 0xfacc15, serve: 0xfacc15, eat: 0x4ade80, bill: 0x60a5fa };
const DOOR = new THREE.Vector3(0, 0, 8);
function targetFor(g, i, out) {
  if (g.state === 'queue') {
    const qi = queueIndex.get(g.id) ?? 0;
    const row = Math.min(qi, 14);
    return out.set(-1.2 + i * 0.55 + (row % 2) * 0.2, 0, 9.3 + row * 0.95);
  }
  if (g.state === 'leave') return g.table >= 0 && g.t > 2 ? out.copy(DOOR) : out.set(5 + g.id % 4, 0, 14);
  const [x, z] = slotPos(g.table);
  return out.set(x + SEAT[i][0], 0, z + SEAT[i][1]);
}
const queueIndex = new Map();
sim.onRender((rdt) => {
  queueIndex.clear();
  let qi = 0;
  for (const g of groups) if (g.state === 'queue') queueIndex.set(g.id, qi++);
  const k = Math.min(1, rdt * 5);
  let p = 0;
  for (const g of groups) {
    g.members.forEach((mb, i) => {
      if (p >= MAXP) return;
      targetFor(g, i, _v);
      mb.pos.lerp(_v, k);
      const seated = g.state !== 'queue' && g.state !== 'leave' && mb.pos.distanceToSquared(_v) < 0.05;
      const y = seated ? -0.22 : 0;
      _m.compose(_s.set(mb.pos.x, 0.43 + y, mb.pos.z), _q, _v.set(1, 1, 1));
      bodies.setMatrixAt(p, _m);
      _m.compose(_s.set(mb.pos.x, 1.05 + y, mb.pos.z), _q, _v.set(1, 1, 1));
      heads.setMatrixAt(p, _m);
      _c.setHex(mb.color);
      if (g.state === 'queue' && g.waitQ > g.patience * 0.7) _c.lerp(_v2c.setHex(0xef4444), 0.6);
      bodies.setColorAt(p, _c);
      p++;
    });
  }
  bodies.count = heads.count = p;
  bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
  bodies.instanceColor.needsUpdate = true;
  // Masalar, göstergeler, tabaklar
  let ii = 0, pl = 0, ch = 0;
  for (let j = 0; j < SLOTS; j++) {
    const g = tableOcc[j];
    const vis = j < activeTables() || !!g;
    tableMeshes[j].visible = vis;
    if (!vis) continue;
    const [x, z] = slotPos(j);
    for (const [sx, sz] of SEAT) { chairs.setMatrixAt(ch++, _m.makeTranslation(x + sx * 1.05, 0.25, z + sz * 1.05)); }
    if (g && IND[g.state]) {
      const bob = 1.7 + Math.sin(performance.now() / 300 + j) * 0.08;
      indicators.setMatrixAt(ii, _m.makeTranslation(x, bob, z));
      indicators.setColorAt(ii++, _c.setHex(IND[g.state]));
    }
    if (g && (g.state === 'eat' || g.state === 'bill')) {
      for (let i = 0; i < g.plates; i++) plates.setMatrixAt(pl++, _m.makeTranslation(x + SEAT[i][0] * 0.45, 0.81, z + SEAT[i][1] * 0.45));
    }
  }
  chairs.count = ch; indicators.count = ii; plates.count = pl;
  chairs.instanceMatrix.needsUpdate = indicators.instanceMatrix.needsUpdate = plates.instanceMatrix.needsUpdate = true;
  if (indicators.instanceColor) indicators.instanceColor.needsUpdate = true;
  // Personel
  const t = performance.now() / 1000;
  chefMeshes.forEach((c, i) => {
    c.visible = i < chefsN.value;
    const busy = chefs[i] && chefs[i].busy > 0;
    c.position.y = busy ? Math.abs(Math.sin(t * 8 + i)) * 0.12 : 0;
    c.rotation.y = busy ? Math.sin(t * 5 + i) * 0.4 : 0;
  });
  waiterMeshes.forEach((w, i) => {
    w.visible = i < waitersN.value;
    const W = waiters[i];
    if (W && W.task && W.busy > 0 && W.task.g.table >= 0) {
      const [x, z] = slotPos(W.task.g.table);
      _v.set(x + 1.1, 0, z - 0.3);
    } else _v.set(-6 + i * 2, 0, -3.4);
    w.position.lerp(_v, Math.min(1, k * 1.2));
  });
  // Stok rafı
  const q = stockQty();
  const nb = Math.min(STOCK_BOX, Math.ceil(q / 10));
  stockBoxes.count = nb;
  stockLbl.setText(`📦 Stok: ${fmt(q)} porsiyon`);
  const ql = qi;
  queueLbl.setText(ql ? `⏳ Kuyruk: ${ql} grup` : '🚪 Kuyruk yok');
  queueLbl.el.style.color = ql > 6 ? '#fca5a5' : '';
});
const _v2c = new THREE.Color();

// --- Arayüz ---
const ui = sim.ui;
ui.section('Kapasite');
const tables = ui.slider({ label: 'Masa sayısı (4 kişilik)', min: 4, max: 20, step: 1, value: 14 });
const chefsN = ui.slider({ label: 'Aşçı', min: 1, max: 6, step: 1, value: 3, onChange: () => { syncStaff(); updatePanel(); } });
const waitersN = ui.slider({ label: 'Garson', min: 1, max: 6, step: 1, value: 3, onChange: () => { syncStaff(); updatePanel(); } });
const openH = ui.slider({ label: 'Açılış saati', min: 7, max: 12, step: 1, value: 10, format: (v) => `${String(v).padStart(2, '0')}:00 (yarından)` });
const closeH = ui.slider({ label: 'Kapanış saati', min: 18, max: 24, step: 1, value: 23, format: (v) => (v === 24 ? '00:00' : `${v}:00`) + ' (yeni gelişler durur)' });

ui.section('Menü ve stok');
const price_ = ui.slider({ label: 'Menü fiyatı (kişi başı, KDV dahil)', min: 150, max: 800, step: 10, value: 350, format: (v) => `${fmt(v)} ₺`, onChange: () => updatePanel() });
const portion = ui.segmented({ label: 'Porsiyon', options: [{ value: 'kucuk', label: 'Küçük' }, { value: 'normal', label: 'Normal' }, { value: 'buyuk', label: 'Büyük' }], value: 'normal', onChange: () => updatePanel() });
const stockOrder = ui.slider({ label: 'Günlük stok siparişi (sabah gelir)', min: 0, max: 600, step: 10, value: 240, format: (v) => `${fmt(v)} porsiyon` });
const campaign = ui.toggle({ label: '📣 Reklam kampanyası (+%30 talep, 1.500 ₺/gün)', value: false });
const unitTxt = ui.text('', '');

ui.section('Senaryolar');
ui.buttons([
  { label: '🎉 Hafta sonu yoğunluğu', onClick: () => { S.surge = 1.8; sim.toast('Bugün kalabalık: talep ×1,8', 'warn'); } },
  { label: '📈 Tedarik zammı', onClick: () => { S.zam = !S.zam; sim.toast(S.zam ? 'Malzeme maliyeti %35 arttı (yarınki siparişten itibaren)' : 'Zam geri alındı', S.zam ? 'bad' : 'good'); updatePanel(); } },
]);
ui.button({ label: '⏩ Günü hemen bitir', variant: 'primary', onClick: () => { let g = 0; const d = S.day; while (S.day === d && !S.over && g++ < 3000) stepMinute(); updatePanel(); } });

ui.section('Bugün');
const stDay = ui.stat({ label: 'Gün' });
const stQueue = ui.stat({ label: 'Kuyruk (grup)' });
const stOcc = ui.stat({ label: 'Dolu masa' });
const stCust = ui.stat({ label: 'Müşteri / vazgeçen' });
const stRev = ui.stat({ label: 'Bugünkü ciro', unit: '₺' });
const stWait = ui.stat({ label: 'Ort. bekleme', unit: 'dk' });
const stKitchen = ui.stat({ label: 'Mutfakta bekleyen fiş' });
const stStars = ui.stat({ label: 'İtibar' });
const chartDay = ui.chart({ title: 'Gün içi: kuyruk (grup) ve doluluk (%)', maxPoints: 100, series: [{ name: 'Kuyruk ×10', color: '#f87171' }, { name: 'Doluluk %', color: '#38bdf8', fill: true }] });

ui.section('İşletme sonuçları');
const lastTxt = ui.text('', 'card');
const stTotal = ui.stat({ label: 'Toplam kâr', unit: '₺' });
const stDays = ui.stat({ label: 'Kalan gün' });
const chartDays = ui.chart({ title: 'Günlük (bin ₺)', maxPoints: GAME_DAYS, series: [{ name: 'Ciro', color: '#38bdf8' }, { name: 'Gider', color: '#f97316' }, { name: 'Kâr', color: '#4ade80', fill: true }] });

// Grafik kuyruğu 10 ile ölçeklensin (doluluk yüzdesiyle aynı eksende okunabilsin)
const _push = chartDay.push;
chartDay.push = (v) => _push([v[0] * 10, v[1]]);

function updatePanel() {
  stDay.set(`${S.day + 1}. ${DAYS[S.day % 7].slice(0, 3)}`);
  const q = groups.filter((g) => g.state === 'queue').length;
  stQueue.set(q, q > 6 ? 'bad' : q > 2 ? 'warn' : '');
  const occ = tableOcc.filter((o) => o).length;
  stOcc.set(`${occ}/${activeTables()}`);
  stCust.set(`${D.customers} / ${D.lost}`, D.lost > D.customers * 0.15 ? 'bad' : '');
  stRev.set(fmt(D.revenue));
  stWait.set(D.waitN ? fmt(D.waitSum / D.waitN) : '—', D.waitN && D.waitSum / D.waitN > 35 ? 'bad' : '');
  stKitchen.set(kitchenQ.length, kitchenQ.length > 5 ? 'bad' : '');
  stStars.set(`★ ${fmt(S.rep, 1)}`, S.rep >= 4 ? 'good' : S.rep < 3 ? 'bad' : 'warn');
  stTotal.set(fmt(S.totals.profit), S.totals.profit >= 0 ? 'good' : 'bad');
  stDays.set(GAME_DAYS - S.day);
  const unit = UNIT_COST * (S.zam ? 1.35 : 1) * PORTION[portion.value].use;
  const net = price_.value / 1.1;
  unitTxt.set(`<small>Porsiyon malzeme maliyeti ≈ ${fmt(unit)} ₺ · KDV hariç satış ${fmt(net)} ₺ → malzeme oranı <b>%${fmt((unit / net) * 100)}</b>.
    Talep çarpanı (fiyat): ×${fmt(Math.pow(price_.value / P0, -ELASTIC), 2)}</small>`);
  if (lastDay) {
    lastTxt.set(`<b>Dün (${lastDay.dayName})</b>: ciro ${fmt(lastDay.revenue)} ₺<br>
      Gider: malzeme ${fmt(lastDay.orderCost)} · personel ${fmt(lastDay.staff)} · kira ${fmt(lastDay.rent)} · enerji ${fmt(lastDay.util)}${lastDay.ad ? ` · reklam ${fmt(lastDay.ad)}` : ''} ₺<br>
      Fire: ${fmt(lastDay.waste)} porsiyon (${fmt(lastDay.wasteCost)} ₺) · stok yokluğu: ${lastDay.stockout} tabak<br>
      <b style="color:${lastDay.profit >= 0 ? '#86efac' : '#fca5a5'}">Kâr: ${fmt(lastDay.profit)} ₺</b> · memnuniyet ★ ${fmt(lastDay.avg, 1)}`);
  } else lastTxt.set(`Gün sonunda gelir-gider özeti burada görünür. ${GAME_DAYS} günde en yüksek kârı ve itibarı hedefle!`);
}

sim.formatTime = () => {
  if (!S) return '';
  const h = Math.floor(S.minute / 60) % 24, m = S.minute % 60;
  return `${S.day + 1}. gün ${DAYS[S.day % 7].slice(0, 3)} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Masaya tıkla → durum
sim.onClick(() => tableMeshes, (hit) => {
  let o = hit.object;
  while (o && o.userData.slot == null) o = o.parent;
  if (!o) return;
  const g = tableOcc[o.userData.slot];
  const names = { order: 'garson bekliyor', cook: `${g?.plates} tabak pişiyor`, serve: 'servis bekliyor', eat: 'yemek yiyor', bill: 'hesap bekliyor' };
  if (!g) return sim.toast(`Masa ${o.userData.slot + 1}: boş`);
  sim.toast(`Masa ${o.userData.slot + 1}: ${g.size} kişi · ${names[g.state] || g.state} · oturalı ${S.minute - g.seatedAt} dk (kuyrukta ${g.waitQ} dk)`);
});

sim.onReset(() => { newGame(); sim.play(); });
newGame();
