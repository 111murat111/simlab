// Lojistik Rota — ızgara şehirde depo + teslimat noktaları; rastgele, en yakın komşu, 2-opt, süpürme ve Clarke–Wright rotaları, trafik etkisi.
import { createSim, THREE, fmt, clamp, seeded, disposeObject } from '@core';
import { buildWorld } from './world.js';

const GN = 10, SP = 500, HALF = ((GN - 1) * SP) / 2;
const KM_EDGE = 0.5;                 // bir blok = 500 m
const MIN_PER_SEC = 4;               // 1× hızda 1 sn = 4 dk
const SERVICE = 4, RELOAD = 10;      // teslim ve depoda yükleme süresi (dk)
const DEPOT = 4 * GN + 4;
const VAN_COL = [0x38bdf8, 0xf472b6, 0xa3e635, 0xfb923c];
const ALGOS = [
  { id: 'rastgele', name: 'Rastgele sıra' },
  { id: 'ek', name: 'En yakın komşu' },
  { id: 'ek2', name: 'En yakın komşu + 2-opt' },
  { id: 'supurme', name: 'Süpürme (açısal) + 2-opt' },
  { id: 'cw', name: 'Clarke–Wright tasarruf' },
];

const sim = createSim({
  sky: { elevation: 30, azimuth: 128, clouds: 0.42, haze: 0.7, visibility: 26000 },
  // Depo ve depodan çıkan rotalar yakın planda (alçak, eğik bakış: ufuk ve gökyüzü kadrajda)
  camera: { position: [-470, 430, 300], target: [-170, 0, -340], fov: 45, near: 2, far: 90000 },
  controls: { maxDistance: 9000, minDistance: 40, maxPolarAngle: Math.PI * 0.47 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Izgara bir şehir: her blok 500 m. Ortadaki depodan çıkan kamyonetler numaralı noktalara paket götürür. Sokakların rengi
    trafik yoğunluğudur (yeşil akıcı → kırmızı tıkalı). Noktalar zamanında teslim edilince yeşil, geç kalınca kırmızı olur.</p>
    <p>Bu, <b>araç rotalama problemi</b>dir (gezgin satıcı probleminin kapasiteli hali): nokta sayısı arttıkça olası sıra sayısı
    faktöriyel büyür (15 nokta ≈ 1,3 trilyon sıra), bu yüzden gerçek hayatta <b>sezgisel</b> yöntemler kullanılır:</p>
    <ul>
      <li><b>En yakın komşu:</b> hep en yakın ziyaret edilmemiş noktaya git. Hızlı ama sonda uzun dönüşler bırakır.</li>
      <li><b>2-opt:</b> rotadaki iki kenarı kesip ters bağlayarak çaprazlamaları açar; iyileşme kalmayınca durur.</li>
      <li><b>Süpürme:</b> noktaları depo etrafında açıya göre sıralar, kapasite dolunca yeni araç başlatır.</li>
      <li><b>Clarke–Wright:</b> “i ve j'yi ayrı ayrı gitmek yerine tek turda birleştirirsem ne kazanırım?” tasarruflarını büyükten küçüğe uygular.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li>Haritaya tıklayarak nokta ekle/kaldır; algoritmaların karşılaştırma tablosunu izle.</li>
      <li>“Yoğun saat”i aç: rotalar yalnız mesafeye göre planlanırsa geç teslimler artar; “Trafiği hesaba kat” ile planla.</li>
      <li>Araç sayısını 1'e indir: tek araç birkaç sefer yapmak zorunda kalır, bitiş saati uzar.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Kargo şirketleri zaman pencereleri, trafik tahmini ve sürücü mesaisini de hesaba katan optimizasyon yazılımları kullanır.
    Yakıt tüketimi dur-kalk trafikte artar; dizel yakıtın her litresi yaklaşık 2,68 kg CO₂ açığa çıkarır.</p>`,
});

// --- Şehir grafı ---
const nodePos = (id) => [-HALF + (id % GN) * SP, -HALF + Math.floor(id / GN) * SP];
const edges = [];            // {a, b, art, base, c}
const adj = Array.from({ length: GN * GN }, () => []);
{
  const r = seeded(42);
  const art = (i) => i === 2 || i === 6;
  for (let row = 0; row < GN; row++) for (let col = 0; col < GN; col++) {
    const id = row * GN + col;
    if (col < GN - 1) edges.push({ a: id, b: id + 1, art: art(row), base: 0.05 + r() * 0.45 });
    if (row < GN - 1) edges.push({ a: id, b: id + GN, art: art(col), base: 0.05 + r() * 0.45 });
  }
  edges.forEach((e, i) => { adj[e.a].push([e.b, i]); adj[e.b].push([e.a, i]); });
}

function updateTraffic() {
  const I = traffic.value / 100, rush = rushT.value;
  for (const e of edges) {
    const [ax, az] = nodePos(e.a), [bx, bz] = nodePos(e.b);
    const center = 1 - Math.min(1, Math.hypot((ax + bx) / 2, (az + bz) / 2) / (HALF * 1.2));
    let c = I * (e.base + (e.art ? 0.2 : 0));
    if (rush) c += (e.art ? 0.45 : 0.15) + 0.3 * center;
    e.c = clamp(c, 0, 0.92);
    e.vFree = e.art ? 50 : 30;               // km/sa
    e.v = e.vFree * (1 - 0.82 * e.c);
    e.t = (KM_EDGE / e.v) * 60;              // dk
    e.fuel = KM_EDGE * 0.1 * (1 + 0.8 * e.c); // L (dur-kalkta artar)
  }
}

// Dijkstra: kaynak düğümden tüm düğümlere (planlama ölçütü: süre ya da mesafe)
function dijkstra(src, byTime) {
  const n = GN * GN, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), pe = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  dist[src] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (const [v, ei] of adj[u]) {
      const w = byTime ? edges[ei].t : KM_EDGE + edges[ei].t * 1e-4; // mesafe eşitliğinde hafif bozulma
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; pe[v] = ei; }
    }
  }
  return { dist, prev, pe };
}

// --- Teslimatlar ---
let deliveries = []; // {node, demand, deadline}
function randomDeliveries(n) {
  const r = seeded(pointSeed);
  deliveries = [];
  const used = new Set([DEPOT]);
  while (deliveries.length < n) {
    const node = Math.floor(r() * GN * GN);
    if (used.has(node)) continue;
    used.add(node);
    deliveries.push({ node, demand: 1 + Math.floor(r() * 3), deadline: 60 + 30 * Math.floor(r() * 6) });
  }
}
let pointSeed = 3;

// --- Planlama ---
let P = null; // { pois, cost, km, tmin, fuel, paths }
function buildMatrix() {
  const pois = [DEPOT, ...deliveries.map((d) => d.node)];
  const n = pois.length, byTime = trafficAware.value;
  const cost = [], km = [], tmin = [], fuel = [], paths = [];
  for (let i = 0; i < n; i++) {
    const D = dijkstra(pois[i], byTime);
    cost.push([]); km.push([]); tmin.push([]); fuel.push([]); paths.push([]);
    for (let j = 0; j < n; j++) {
      // yolu geri izle
      const nodes = [], es = [];
      let v = pois[j];
      while (v !== pois[i] && v >= 0) { nodes.push(v); es.push(D.pe[v]); v = D.prev[v]; }
      nodes.push(pois[i]);
      nodes.reverse(); es.reverse();
      let k = 0, t = 0, f = 0;
      for (const ei of es) { k += KM_EDGE; t += edges[ei].t; f += edges[ei].fuel; }
      cost[i].push(byTime ? t : k); km[i].push(k); tmin[i].push(t); fuel[i].push(f); paths[i].push(nodes);
    }
  }
  P = { pois, cost, km, tmin, fuel, paths };
}

const demand = (i) => deliveries[i - 1].demand;
function splitByCapacity(order) {
  const Q = capacity.value, routes = [];
  let cur = [], load = 0;
  for (const i of order) {
    if (load + demand(i) > Q) { routes.push(cur); cur = []; load = 0; }
    cur.push(i); load += demand(i);
  }
  if (cur.length) routes.push(cur);
  return routes;
}
function nearestNeighbour(set) {
  const C = P.cost, Q = capacity.value, left = new Set(set), routes = [];
  while (left.size) {
    let cur = 0, load = 0;
    const route = [];
    for (;;) {
      let best = -1, bd = Infinity;
      for (const j of left) if (load + demand(j) <= Q && C[cur][j] < bd) { bd = C[cur][j]; best = j; }
      if (best < 0) break;
      route.push(best); left.delete(best); load += demand(best); cur = best;
    }
    if (!route.length) break;
    routes.push(route);
  }
  return routes;
}
function twoOpt(route) {
  const C = P.cost, r = [0, ...route, 0];
  let improved = true, guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 1; i < r.length - 2; i++) {
      for (let k = i + 1; k < r.length - 1; k++) {
        const d = C[r[i - 1]][r[k]] + C[r[i]][r[k + 1]] - C[r[i - 1]][r[i]] - C[r[k]][r[k + 1]];
        if (d < -1e-9) {
          for (let a = i, b = k; a < b; a++, b--) [r[a], r[b]] = [r[b], r[a]];
          improved = true;
        }
      }
    }
  }
  return r.slice(1, -1);
}
function sweep() {
  const [dx, dz] = nodePos(DEPOT);
  const ids = deliveries.map((_, k) => k + 1).sort((a, b) => {
    const [ax, az] = nodePos(P.pois[a]), [bx, bz] = nodePos(P.pois[b]);
    return Math.atan2(az - dz, ax - dx) - Math.atan2(bz - dz, bx - dx);
  });
  return splitByCapacity(ids).map((r) => twoOpt(r));
}
function clarkeWright() {
  const C = P.cost, Q = capacity.value, n = deliveries.length;
  let routes = Array.from({ length: n }, (_, k) => [k + 1]);
  const where = new Map(routes.map((r, k) => [r[0], r]));
  const load = new Map(routes.map((r) => [r, demand(r[0])]));
  const sv = [];
  for (let i = 1; i <= n; i++) for (let j = i + 1; j <= n; j++) sv.push([C[0][i] + C[0][j] - C[i][j], i, j]);
  sv.sort((a, b) => b[0] - a[0]);
  for (const [s, i, j] of sv) {
    if (s <= 0) break;
    let ri = where.get(i), rj = where.get(j);
    if (ri === rj || load.get(ri) + load.get(rj) > Q) continue;
    // i ve j rota uçlarında olmalı; gerekirse ters çevir
    if (ri[ri.length - 1] !== i) { if (ri[0] === i) ri.reverse(); else continue; }
    if (rj[0] !== j) { if (rj[rj.length - 1] === j) rj.reverse(); else continue; }
    const merged = ri.concat(rj);
    load.set(merged, load.get(ri) + load.get(rj));
    load.delete(ri); load.delete(rj);
    for (const v of merged) where.set(v, merged);
    routes = routes.filter((r) => r !== ri && r !== rj);
    routes.push(merged);
  }
  return routes.map((r) => twoOpt(r));
}
function plan(algo) {
  const ids = deliveries.map((_, k) => k + 1);
  if (!ids.length) return [];
  if (algo === 'rastgele') {
    const r = seeded(pointSeed * 7 + 1);
    const o = ids.slice();
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    return splitByCapacity(o);
  }
  if (algo === 'ek') return nearestNeighbour(ids);
  if (algo === 'ek2') return nearestNeighbour(ids).map((r) => twoOpt(r));
  if (algo === 'supurme') return sweep();
  return clarkeWright();
}

// Rotaları araçlara dağıt ve gerçek (trafikli) sürelerle değerlendir
function evaluate(routes) {
  const K = vans.value;
  const dur = (r) => { let t = 0, prev = 0; for (const i of r) { t += P.tmin[prev][i] + SERVICE; prev = i; } return t + P.tmin[prev][0]; };
  const order = routes.map((r, k) => [dur(r), k]).sort((a, b) => b[0] - a[0]);
  const vanT = new Array(K).fill(0), vanRoutes = Array.from({ length: K }, () => []);
  for (const [d, k] of order) {
    let v = 0;
    for (let q = 1; q < K; q++) if (vanT[q] < vanT[v]) v = q;
    vanRoutes[v].push(routes[k]);
    vanT[v] += d + RELOAD;
  }
  let km = 0, fuel = 0, drive = 0, onTime = 0, work = 0, makespan = 0;
  const arrivals = new Array(deliveries.length + 1).fill(0);
  const timelines = vanRoutes.map((rs) => {
    let t = 0;
    const keys = [];
    rs.forEach((r, ri) => {
      if (ri > 0) t += RELOAD;
      let prev = 0;
      for (const i of [...r, 0]) {
        const nodes = P.paths[prev][i];
        keys.push({ t, node: nodes[0] });
        for (let s = 1; s < nodes.length; s++) {
          const e = edgeBetween(nodes[s - 1], nodes[s]);
          t += e.t; keys.push({ t, node: nodes[s] });
        }
        km += P.km[prev][i]; fuel += P.fuel[prev][i]; drive += P.tmin[prev][i];
        if (i) { arrivals[i] = t; if (t <= deliveries[i - 1].deadline) onTime++; t += SERVICE; keys.push({ t, node: nodes[nodes.length - 1], stop: i }); }
        prev = i;
      }
    });
    work += t; makespan = Math.max(makespan, t);
    return keys;
  });
  const n = deliveries.length;
  const cost = fuel * fuelPrice.value + (work / 60) * wage.value;
  return { routes, vanRoutes, timelines, arrivals, km, fuel, co2: fuel * 2.68, drive, work, makespan, onTime: n ? onTime / n : 1, cost, nRoutes: routes.length };
}
const edgeMap = new Map();
edges.forEach((e) => { edgeMap.set(e.a * 1000 + e.b, e); edgeMap.set(e.b * 1000 + e.a, e); });
const edgeBetween = (a, b) => edgeMap.get(a * 1000 + b);

// --- Sahne (metre ölçeğinde: bir blok 500 m) ---
const W = buildWorld(sim, { GN, SP, HALF, DEPOT, nodePos, edges });
const ground = W.ground, roads = W.roads;
sim.label('🏭 Depo', { parent: W.depot, position: [0, 60, 0] });

// Teslimat işaretçileri
let markers = [];
function buildMarkers() {
  markers.forEach(disposeObjectKeepGeo);
  markers = deliveries.map((d, k) => {
    const [x, z] = nodePos(d.node);
    const m = W.makeMarker(0xfbbf24);
    m.position.set(x, 0, z);
    m.traverse((c) => { c.userData.k = k; });
    m.visible = showRoutes.value;
    m.add(sim.label(`${k + 1}`, { position: [0, 138, 0], className: 'plain' }));
    sim.scene.add(m);
    return m;
  });
}
function disposeObjectKeepGeo(o) {
  o.traverse((c) => { if (c.material) c.material.dispose(); if (c.isCSS2DObject) c.element.remove(); });
  o.removeFromParent();
}

// Kamyonetler (5,9 m panel van; renk şeridi ve altındaki hale aracın rota rengi)
function makeVan(color, v) {
  const g = W.makeVan(color);
  g.add(sim.label(`<span style="color:#${color.toString(16)}">■</span> ${v + 1}`, { position: [0, 16, 0], className: 'plain' }));
  sim.scene.add(g);
  return g;
}
const vanMeshes = VAN_COL.map((c, v) => makeVan(c, v));
let routeLines = [];

// --- Durum ---
let result = null, results = {}, clock = 0, finished = false;
const vanPtr = [0, 0, 0, 0];

function recompute() {
  updateTraffic();
  buildMatrix();
  results = {};
  for (const a of ALGOS) results[a.id] = evaluate(plan(a.id));
  result = results[algoSel.value];
  paintRoads();
  W.assignTraffic();
  buildMarkers();
  drawRoutes();
  restart();
  updatePanel();
}
function restart() {
  clock = 0; finished = false;
  vanPtr.fill(0);
  markers.forEach((m) => m.material.color.setHex(0xfbbf24));
  placeVans();
}

const TRAF = [new THREE.Color(0x22c55e), new THREE.Color(0xfacc15), new THREE.Color(0xef4444)];
function paintRoads() {
  const c = new THREE.Color();
  edges.forEach((e, i) => {
    if (!showTraffic.value) c.setHex(0x475569);
    else if (e.c < 0.4) c.copy(TRAF[0]).lerp(TRAF[1], e.c / 0.4);
    else c.copy(TRAF[1]).lerp(TRAF[2], Math.min(1, (e.c - 0.4) / 0.4));
    roads.setColorAt(i, c);
  });
  roads.instanceColor.needsUpdate = true;
  roads.visible = showTraffic.value;
}

function drawRoutes() {
  routeLines.forEach(disposeObject);
  routeLines = [];
  result.vanRoutes.forEach((rs, v) => {
    const off = (v - 1.5) * 5.5;
    for (const r of rs) {
      const pts = [];
      let prev = 0;
      for (const i of [...r, 0]) {
        for (const node of P.paths[prev][i]) { const [x, z] = nodePos(node); pts.push(new THREE.Vector3(x + off, 0.5, z + off)); }
        prev = i;
      }
      const line = W.routeMesh(pts, VAN_COL[v]);
      line.visible = showRoutes.value;
      sim.scene.add(line);
      routeLines.push(line);
    }
  });
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function placeVans() {
  const [dx, dz] = nodePos(DEPOT);
  vanMeshes.forEach((m, v) => {
    const keys = result && result.timelines[v];
    m.visible = v < vans.value;
    if (!keys || keys.length < 2) { m.position.set(dx + 60 + 9 * v, 0.3, dz + 150); m.rotation.y = -Math.PI / 2; return; }
    let p = vanPtr[v];
    while (p < keys.length - 2 && keys[p + 1].t <= clock) {
      p++;
      const st = keys[p].stop;
      if (st) markers[st - 1]?.material.color.setHex(result.arrivals[st] <= deliveries[st - 1].deadline ? 0x22c55e : 0xef4444);
    }
    if (p === keys.length - 2 && keys[p + 1].t <= clock) {
      const st = keys[p + 1].stop;
      if (st) markers[st - 1]?.material.color.setHex(result.arrivals[st] <= deliveries[st - 1].deadline ? 0x22c55e : 0xef4444);
    }
    vanPtr[v] = p;
    const k0 = keys[p], k1 = keys[p + 1];
    const f = k1.t > k0.t ? clamp((clock - k0.t) / (k1.t - k0.t), 0, 1) : 1;
    const [x0, z0] = nodePos(k0.node), [x1, z1] = nodePos(k1.node);
    // Sağ şerit: gidiş yönünün sağına 1,9 m
    const ux = Math.sign(x1 - x0), uz = Math.sign(z1 - z0);
    _a.set(x0, 0, z0); _b.set(x1, 0, z1);
    m.position.lerpVectors(_a, _b, f).add(_a.set(-uz * 1.9, 0, ux * 1.9));
    if (x1 !== x0 || z1 !== z0) m.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
  });
}

sim.onUpdate((dt) => {
  if (!result || finished) return;
  clock += dt * MIN_PER_SEC;
  if (clock >= result.makespan) {
    clock = result.makespan;
    finished = true;
    placeVans();
    if (deliveries.length) sim.toast(`✅ Tüm teslimatlar bitti · ${fmtClock(result.makespan)} · zamanında %${fmt(result.onTime * 100)}`, result.onTime >= 0.9 ? 'good' : 'warn');
    return;
  }
  placeVans();
});

const fmtClock = (min) => { const t = 9 * 60 + Math.round(min); return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
sim.formatTime = () => fmtClock(clock);

// --- Arayüz ---
const ui = sim.ui;
ui.section('Teslimatlar');
const nPoints = ui.slider({ label: 'Teslimat noktası', min: 3, max: 30, step: 1, value: 16, onChange: (v) => { randomDeliveries(v); recompute(); } });
ui.buttons([
  { label: '🎲 Yeni noktalar', onClick: () => { pointSeed = (Math.random() * 1e6) | 0; randomDeliveries(nPoints.value); recompute(); } },
  { label: '🗑 Hepsini sil', onClick: () => { deliveries = []; recompute(); } },
]);
ui.text('<small>🖱️ Haritada bir kavşağa tıkla: nokta ekle; bir noktaya tıkla: kaldır. Her paket 1–3 koli, son teslim saati 10:00–14:30 arası.</small>');

ui.section('Filo ve algoritma');
const algoSel = ui.select({ label: 'Rota algoritması', options: ALGOS.map((a) => ({ value: a.id, label: a.name })), value: 'ek2',
  onChange: (v) => { result = results[v]; drawRoutes(); restart(); updatePanel(); } });
const vans = ui.slider({ label: 'Araç sayısı', min: 1, max: 4, step: 1, value: 2, onChange: () => recompute() });
const capacity = ui.slider({ label: 'Araç kapasitesi', min: 4, max: 40, step: 1, value: 14, unit: 'koli', onChange: () => recompute() });
const trafficAware = ui.toggle({ label: 'Trafiği hesaba kat (süreye göre planla)', value: true, onChange: () => recompute() });

ui.section('Trafik');
const traffic = ui.slider({ label: 'Trafik yoğunluğu', min: 0, max: 100, step: 5, value: 40, format: (v) => `%${fmt(v)}`, onChange: () => recompute() });
const rushT = ui.toggle({ label: '🚦 Yoğun saat (ana caddeler ve merkez tıkalı)', value: false, onChange: () => recompute() });
const showTraffic = ui.toggle({ label: 'Trafik renklerini göster', value: true, onChange: () => paintRoads() });
const showRoutes = ui.toggle({ label: 'Rotaları ve teslimat işaretlerini göster', value: true, onChange: (v) => {
  routeLines.forEach((l) => { l.visible = v; });
  markers.forEach((m) => { m.visible = v; });
  vanMeshes.forEach((m) => { m.userData.halo.visible = v; });
} });

ui.section('Maliyet');
const fuelPrice = ui.slider({ label: 'Motorin fiyatı', min: 20, max: 100, step: 0.5, value: 50, format: (v) => `${fmt(v, 1)} ₺/L`, onChange: () => recompute() });
const wage = ui.slider({ label: 'Sürücü maliyeti', min: 100, max: 800, step: 10, value: 300, format: (v) => `${fmt(v)} ₺/saat`, onChange: () => recompute() });

ui.section('Sonuç (seçili algoritma)');
const stKm = ui.stat({ label: 'Toplam mesafe', unit: 'km' });
const stEnd = ui.stat({ label: 'Son araç dönüşü' });
const stFuel = ui.stat({ label: 'Yakıt', unit: 'L' });
const stCO2 = ui.stat({ label: 'CO₂', unit: 'kg' });
const stCost = ui.stat({ label: 'Maliyet', unit: '₺' });
const stOn = ui.stat({ label: 'Zamanında teslim' });
const routeInfo = ui.text('', 'card');

ui.section('Algoritmaları karşılaştır');
const cmp = ui.text('', 'card');

function updatePanel() {
  const R = result;
  stKm.set(fmt(R.km, 1));
  stEnd.set(fmtClock(R.makespan));
  stFuel.set(fmt(R.fuel, 1));
  stCO2.set(fmt(R.co2, 1));
  stCost.set(fmt(R.cost));
  stOn.set(`%${fmt(R.onTime * 100)}`, R.onTime >= 0.95 ? 'good' : R.onTime >= 0.75 ? 'warn' : 'bad');
  const totalDemand = deliveries.reduce((a, d) => a + d.demand, 0);
  const avgC = edges.reduce((a, e) => a + e.c, 0) / edges.length;
  routeInfo.set(`${deliveries.length} nokta · ${totalDemand} koli · <b>${R.nRoutes}</b> sefer, ${vans.value} araç.
    ${R.vanRoutes.map((rs, v) => rs.length ? `<br><span style="color:#${VAN_COL[v].toString(16)}">■</span> Araç ${v + 1}: ${rs.map((r) => r.join('→')).join(' | ')}` : '').join('')}
    <br><small>Ortalama trafik: %${fmt(avgC * 100)} · planlama ölçütü: ${trafficAware.value ? 'süre' : 'yalnız mesafe'}</small>`);
  const all = ALGOS.map((a) => ({ a, r: results[a.id] }));
  const maxKm = Math.max(...all.map((x) => x.r.km), 0.01), maxT = Math.max(...all.map((x) => x.r.makespan), 1);
  const bestKm = Math.min(...all.map((x) => x.r.km));
  const bar = (v, max, col) => `<div style="height:5px;border-radius:3px;background:${col};width:${(100 * v) / max}%"></div>`;
  cmp.set(`<table style="width:100%;font-size:12px;border-collapse:collapse">
    <tr style="color:#94a3b8;text-align:right"><th style="text-align:left">Algoritma</th><th>km</th><th>bitiş</th><th>₺</th><th>zmn.</th></tr>
    ${all.map(({ a, r }) => `<tr style="text-align:right;${a.id === algoSel.value ? 'color:#38bdf8;font-weight:700' : ''}">
      <td style="text-align:left;padding-top:4px">${a.name.replace(' + 2-opt', '+2opt').replace(' (açısal)', '').replace(' tasarruf', '')}${r.km === bestKm ? ' 🏆' : ''}</td>
      <td>${fmt(r.km, 1)}</td><td>${fmtClock(r.makespan)}</td><td>${fmt(r.cost)}</td><td>%${fmt(r.onTime * 100)}</td></tr>
      <tr><td colspan="5">${bar(r.km, maxKm, '#38bdf8')}${bar(r.makespan, maxT, '#f59e0b')}</td></tr>`).join('')}
  </table><small><span style="color:#38bdf8">■</span> mesafe <span style="color:#f59e0b">■</span> bitiş süresi (kısa = iyi)</small>`);
}

// Haritaya tıkla: nokta ekle / kaldır
sim.onClick(() => [ground, ...markers], (hit) => {
  if (hit.object.userData.k != null) {
    const k = hit.object.userData.k;
    deliveries.splice(k, 1);
    sim.toast(`Nokta ${k + 1} kaldırıldı`);
  } else {
    const p = hit.point;
    const c = Math.round((p.x + HALF) / SP), r = Math.round((p.z + HALF) / SP);
    if (c < 0 || c >= GN || r < 0 || r >= GN) return;
    const node = r * GN + c;
    if (node === DEPOT) return sim.toast('Burası depo', 'warn');
    const ex = deliveries.findIndex((d) => d.node === node);
    if (ex >= 0) { deliveries.splice(ex, 1); sim.toast('Nokta kaldırıldı'); }
    else {
      if (deliveries.length >= 40) return sim.toast('En fazla 40 nokta', 'warn');
      deliveries.push({ node, demand: 1 + Math.floor(Math.random() * 3), deadline: 60 + 30 * Math.floor(Math.random() * 6) });
      sim.toast(`Nokta ${deliveries.length} eklendi`, 'good');
    }
  }
  recompute();
});

// Görsel: trafik akışı (gerçek zamanlı), ağaç rüzgârı, güneşin saate göre konumu (09:00 → öğleden sonra)
let skyH = -1;
sim.onUpdate((dt, t) => {
  W.placeCars(dt / Math.max(sim.speed, 0.01));
  W.update(t);
  const h = 9 + clock / 60;
  if (Math.abs(h - skyH) > 0.04) {
    skyH = h;
    sim.sky?.set({ elevation: Math.max(4, 50 * Math.sin((Math.PI * (h - 6.3)) / 12.6)), azimuth: 180 + (h - 12.4) * 15 });
  }
});

sim.onReset(() => restart());
randomDeliveries(nPoints.value);
recompute();
