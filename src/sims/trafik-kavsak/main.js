// Trafik ve Kavşak — sinyalize kavşakta IDM araçlar ve halka yolda hayalet sıkışıklık (Sugiyama deneyi).
import { createSim, THREE, fmt, rand, makeGround, instanced, BufferGeometryUtils } from '@core';
import { createRing, ringStats, RING_DT, CAR_LEN } from './ring.js';

const sim = createSim({
  background: 0x0f1a2b,
  camera: { position: [0, 100, 62], target: [0, 0, 4], fov: 45 },
  controls: { maxDistance: 260, minDistance: 12 },
  fog: [200, 420],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p><b>Kavşak modu:</b> Dört koldan gelen araçlar <b>IDM</b> (Akıllı Sürücü Modeli) ile sürer: her sürücü önündeki
    araca olan boşluğa, hız farkına ve güvenli takip süresine göre hızlanır ya da fren yapar. Kırmızıda durma
    çizgisinde bekler, sarıda durabiliyorsa durur. Sola dönen araç karşıdan gelen trafiğe yol vermek zorundadır ve
    tek şeritli yolda arkasındakileri de bekletir.</p>
    <p><b>Halka yol modu:</b> 2008'deki Sugiyama deneyinde sürücüler dairesel bir pistte sabit hızla gitmeye çalışmış;
    ne kaza ne darboğaz varken kendiliğinden <b>dur-kalk dalgası</b> oluşmuştur. Nedeni tepki gecikmesi ve aşırı
    tepkidir: küçük bir fren arkadakilere büyüyerek aktarılır. Dalga, araçlar ileri giderken <b>geriye doğru</b> ilerler.</p>
    <h3>Dene</h3>
    <ul>
      <li>K-G gelişini artır, yeşil süresini değiştirme: kuyruk büyür. Sonra <b>Uyarlanır sinyal</b>i aç.</li>
      <li>Sola dönüş oranını %40 yap: tek sola dönen araç bütün şeridi tıkar, araç/saat düşer.</li>
      <li>Halka yolda <b>Bir sürücü fren yapsın</b>: uzay–zaman diyagramında geriye yatık kırmızı bant oluşur.</li>
      <li><b>Otonom (ACC) araçlar</b>ı aç: boşluk bırakıp sabit hızda giden birkaç araç dalgayı söndürür; dur-kalk bitince ortalama hız da artar (Stern ve ark., 2018).</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Trafik mühendisleri sinyal sürelerini döngü, yeşil oranı ve talebe göre ayarlar; akıllı (uyarlanır) sinyaller
    döngü dedektörleri ya da kameralarla kuyruğa tepki verir. Otoyolda "yığılma dalgaları" çoğu zaman kaza olmadan
    oluşur; takip mesafesini korumak ve ani fren yapmamak dalgayı küçültür.</p>
    <p><small>Model basitleştirilmiştir: tek şerit, şerit değiştirme yok, yayalar gösterilmez.</small></p>`,
});
sim.scene.add(makeGround(520, 0x1c2e24, { grid: false }));

// ---------- Ortak araç görünümü ----------
const PALETTE = [0xe2e8f0, 0x60a5fa, 0xf87171, 0xfacc15, 0x34d399, 0xa78bfa, 0xf97316, 0x94a3b8, 0x38bdf8];
function carGeometry() {
  const body = new THREE.BoxGeometry(1.8, 0.8, CAR_LEN * 0.94).translate(0, 0.6, -CAR_LEN / 2);
  const cab = new THREE.BoxGeometry(1.55, 0.6, 2.1).translate(0, 1.3, -CAR_LEN / 2 - 0.2);
  const paint = (g, c) => {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set(c, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  };
  return BufferGeometryUtils.mergeGeometries([paint(body, [1, 1, 1]), paint(cab, [0.22, 0.27, 0.35])]);
}
const CAR_GEO = carGeometry();
const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 });
function carMesh(max) {
  const m = instanced(CAR_GEO, carMat, max);
  const white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < max; i++) m.setColorAt(i, white);
  m.count = 0;
  m.frustumCulled = false;
  return m;
}
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();
const speedColor = (v, vmax) => tmpC.setHSL(0.33 * Math.max(0, Math.min(1, v / vmax)), 0.85, 0.5);

// =====================================================================
// A) KAVŞAK
// =====================================================================
const R = 60, STOP = 7.5, LANE = 1.75, LIN = R - STOP, LOUT = R - STOP;
const V0 = 13.9, A_MAX = 1.5, B_CMF = 2.5, S0 = 2, TH = 1.2, V_TURN = 7;
const H = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // yaklaşma yönleri: Kuzeyden, Doğudan, Güneyden, Batıdan
const DNAME = ['Kuzey', 'Doğu', 'Güney', 'Batı'];
const rightOf = (h) => [-h[1], h[0]];
const axisOf = (d) => d % 2; // 0: K-G, 1: D-B

const PATHS = H.map((h) => [0, 1, 2].map((turn) => {
  const r = rightOf(h);
  const e = turn === 0 ? h : turn === 1 ? r : [-r[0], -r[1]];
  const re = rightOf(e);
  const A = [-h[0] * STOP + r[0] * LANE, -h[1] * STOP + r[1] * LANE];
  const B = [e[0] * STOP + re[0] * LANE, e[1] * STOP + re[1] * LANE];
  const k = turn === 0 ? (2 * STOP) / 3 : 0.5523 * (turn === 1 ? STOP - LANE : STOP + LANE);
  const P1 = [A[0] + h[0] * k, A[1] + h[1] * k], P2 = [B[0] - e[0] * k, B[1] - e[1] * k];
  const N = 24, pts = [], cum = [0];
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    pts.push([w[0] * A[0] + w[1] * P1[0] + w[2] * P2[0] + w[3] * B[0], w[0] * A[1] + w[1] * P1[1] + w[2] * P2[1] + w[3] * B[1]]);
    if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  return { h, r, e, re, ek: H.findIndex((q) => q[0] === e[0] && q[1] === e[1]), pts, cum, len: cum[N] };
}));

// --- Sahne: yollar, kaldırımlar, binalar, ışıklar ---
const xGroup = new THREE.Group();
sim.scene.add(xGroup);
const xLabels = [];
{
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x2a2f37, roughness: 0.95 });
  const walk = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.9 });
  const white = new THREE.MeshBasicMaterial({ color: 0xe5e7eb });
  const yellow = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
  const road = new THREE.PlaneGeometry(7, 2 * R + 30).rotateX(-Math.PI / 2);
  const r1 = new THREE.Mesh(road, asphalt); r1.position.y = 0.02;
  const r2 = new THREE.Mesh(road, asphalt); r2.rotation.y = Math.PI / 2; r2.position.y = 0.021;
  xGroup.add(r1, r2);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(R + 10, 0.25, R + 10), walk);
    w.position.set(sx * (3.5 + (R + 10) / 2), 0.12, sz * (3.5 + (R + 10) / 2));
    xGroup.add(w);
  }
  // Orta çizgi (kesikli sarı), durma çizgileri, yaya geçitleri
  const dash = new THREE.PlaneGeometry(0.18, 2.4).rotateX(-Math.PI / 2);
  const dashes = [];
  for (let d = STOP + 2; d < R + 14; d += 5) for (const s of [1, -1]) { dashes.push([0, s * d, 0]); dashes.push([s * d, 0, Math.PI / 2]); }
  const dm = new THREE.InstancedMesh(dash, yellow, dashes.length);
  dashes.forEach(([x, z, ry], i) => { dummy.position.set(x, 0.04, z); dummy.rotation.set(0, ry, 0); dummy.updateMatrix(); dm.setMatrixAt(i, dummy.matrix); });
  xGroup.add(dm);
  const stripe = new THREE.PlaneGeometry(0.55, 2.2).rotateX(-Math.PI / 2);
  const stripes = [];
  for (const h of H) {
    const r = rightOf(h);
    for (let k = -3; k <= 3; k += 0.9) stripes.push([-h[0] * 5.2 + r[0] * k, -h[1] * 5.2 + r[1] * k, Math.atan2(h[0], h[1])]);
  }
  const sm = new THREE.InstancedMesh(stripe, white, stripes.length);
  stripes.forEach(([x, z, ry], i) => { dummy.position.set(x, 0.045, z); dummy.rotation.set(0, ry, 0); dummy.updateMatrix(); sm.setMatrixAt(i, dummy.matrix); });
  xGroup.add(sm);
  for (const h of H) {
    const r = rightOf(h);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.35).rotateX(-Math.PI / 2), white);
    line.position.set(-h[0] * STOP + r[0] * LANE, 0.05, -h[1] * STOP + r[1] * LANE);
    line.rotation.y = Math.atan2(h[0], h[1]);
    xGroup.add(line);
  }
  // Binalar
  const bgeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  const blds = [];
  const cols = [0x64748b, 0x94a3b8, 0x7c6f64, 0x6b7280, 0x8b7d6b, 0x475569];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    for (let i = 0; i < 7; i++) {
      const w = rand(7, 12), d = rand(7, 12), hgt = rand(3, 9);
      const px = sx * (13 + (i % 3) * 15 + rand(0, 2)), pz = sz * (13 + Math.floor(i / 3) * 15 + rand(0, 2));
      blds.push([px + sx * w / 2, pz + sz * d / 2, w, hgt, d]);
    }
  }
  const bm = new THREE.InstancedMesh(bgeo, bmat, blds.length);
  blds.forEach(([x, z, w, hgt, d], i) => {
    dummy.position.set(x, 0.25, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(w, hgt, d); dummy.updateMatrix();
    bm.setMatrixAt(i, dummy.matrix); bm.setColorAt(i, tmpC.setHex(cols[i % cols.length]));
  });
  dummy.scale.set(1, 1, 1);
  xGroup.add(bm);
}
// Trafik lambaları (her kolun sağında, gelen araçlara dönük)
const heads = H.map((h, d) => {
  const r = rightOf(h);
  const g = new THREE.Group();
  g.position.set(-h[0] * (STOP + 1.2) + r[0] * 4.6, 0, -h[1] * (STOP + 1.2) + r[1] * 4.6);
  g.rotation.y = Math.atan2(-h[0], -h[1]);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.2), new THREE.MeshStandardMaterial({ color: 0x374151 }));
  pole.position.y = 2.1;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 0.6), new THREE.MeshStandardMaterial({ color: 0x111827 }));
  box.position.y = 5.1;
  g.add(pole, box);
  const bulbs = [0, 1, 2].map((k) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    m.position.set(0, 5.8 - k * 0.7, 0.32);
    g.add(m);
    return m;
  });
  xGroup.add(g);
  const qLabel = sim.label('', { parent: xGroup, position: [-h[0] * 34 + r[0] * 6, 3, -h[1] * 34 + r[1] * 6] });
  xLabels.push(qLabel);
  return { bulbs, qLabel, d };
});
const sigLabel = sim.label('', { parent: xGroup, position: [0, 10, 0], className: 'big' });
xLabels.push(sigLabel);
const LIGHT_ON = [0xff3b3b, 0xffc21a, 0x2cff6a], LIGHT_OFF = [0x3a1414, 0x3a300e, 0x0f3a1c];

const xCars = carMesh(260);
xGroup.add(xCars);

// --- Kavşak durumu ---
let X;
function resetX() {
  X = {
    t: 0, queues: [[], [], [], []], exits: [[], [], [], []], backlog: [0, 0, 0, 0], nextArr: [0, 0, 0, 0].map(() => rand(0, 4)),
    phase: 0, phaseT: 0, waits: [], passes: [], nextId: 0, chartT: 0,
  };
  // Isınma: kavşak boş başlamasın
  for (let i = 0; i < 600; i++) stepX(0.1);
  X.t = 0; X.passes = []; X.waits = [];
  xChart?.clear();
}
// Faz: [K-G durumu, D-B durumu]; G yeşil, Y sarı, R kırmızı
const PHASES = [['G', 'R'], ['Y', 'R'], ['R', 'R'], ['R', 'G'], ['R', 'Y'], ['R', 'R']];
const axisState = (a) => PHASES[X.phase][a];

function phaseDur(p) {
  if (p === 1 || p === 4) return 3;
  if (p === 2 || p === 5) return 2;
  return p === 0 ? gNS.value : gEW.value;
}
function axisDemand(a, range) {
  let n = 0;
  for (const d of [a, a + 2]) for (const c of X.queues[d]) if (c.s < LIN && c.s > LIN - range) n++;
  return n;
}
function axisQueue(a) {
  let n = X.backlog[a] + X.backlog[a + 2];
  for (const d of [a, a + 2]) for (const c of X.queues[d]) if (c.s < LIN && c.v < 2) n++;
  return n;
}
function stepSignal(h) {
  X.phaseT += h;
  const p = X.phase;
  let done = X.phaseT >= phaseDur(p);
  if (adaptive.value && (p === 0 || p === 3)) {
    // Uyarlanır: en az 7 s, en çok 50 s yeşil; yeşil yön boşalınca ya da karşı kuyruk çok birikince geçiş
    const a = p === 0 ? 0 : 1, o = 1 - a;
    const gDem = axisDemand(a, 35), oQ = axisQueue(o);
    done = X.phaseT >= 7 && ((gDem === 0 && oQ > 0) || X.phaseT >= 50 || (X.phaseT >= 15 && oQ > 3 * gDem + 6));
  }
  if (done) { X.phase = (p + 1) % 6; X.phaseT = 0; }
}

function idmA(v, gap, dv, v0) {
  const s = S0 + Math.max(0, v * TH + (v * dv) / (2 * Math.sqrt(A_MAX * B_CMF)));
  return A_MAX * (1 - Math.pow(v / v0, 4) - Math.pow(s / Math.max(gap, 0.1), 2));
}

function spawn(h) {
  const lam = [nsRate.value, ewRate.value, nsRate.value, ewRate.value];
  for (let d = 0; d < 4; d++) {
    X.nextArr[d] -= h;
    while (X.nextArr[d] <= 0) { X.backlog[d]++; X.nextArr[d] += -Math.log(1 - Math.random()) * 3600 / lam[d]; }
    const q = X.queues[d], last = q[q.length - 1];
    if (X.backlog[d] > 0 && (!last || last.s > CAR_LEN + 5)) {
      X.backlog[d]--;
      const u = Math.random(), pl = leftPct.value / 100;
      const turn = u < pl ? 2 : u < pl + 0.15 ? 1 : 0;
      const v = last ? Math.min(V0 * 0.9, last.v + 1) : V0 * 0.9;
      q.push({ d, turn, s: 0, v, acc: 0, wait: 0, id: X.nextId++, color: PALETTE[X.nextId % PALETTE.length], passed: false });
    }
  }
}

// Karşı yönden gelen (sola dönmeyen) araçlarla çakışma var mı?
function opposingConflict(d) {
  const o = (d + 2) % 4, a = axisOf(d);
  for (const oc of X.queues[o]) {
    if (oc.turn === 2) continue;
    const len = PATHS[o][oc.turn].len;
    if (oc.s > LIN + len - 3) continue;
    if (oc.s >= LIN - 1) return true;
    const dist = LIN - oc.s;
    if (axisState(a) !== 'G' && dist > (oc.v * oc.v) / 8 + 1) continue; // duracak
    if (oc.v > 1 && dist / oc.v < 3.5) return true;
    if (oc.v <= 1 && dist < 3 && axisState(a) === 'G') return true;
  }
  return false;
}
// Kavşak içinde ilerlemiş (kararlı) karşı sola dönen var mı?
function opposingLeftInBox(d) {
  for (const oc of X.queues[(d + 2) % 4]) if (oc.turn === 2 && oc.s > LIN + 2.6 && oc.s < LIN + PATHS[oc.d][2].len - 3) return true;
  return false;
}
function crossBoxBusy(a) {
  for (const d of [1 - a, 3 - a]) for (const c of X.queues[d]) if (c.s > LIN - 0.5 && c.s < LIN + PATHS[d][c.turn].len - 1.5) return true;
  return false;
}

function stepX(h) {
  X.t += h;
  stepSignal(h);
  spawn(h);
  const busy = [crossBoxBusy(0), crossBoxBusy(1)];
  for (let d = 0; d < 4; d++) {
    const q = X.queues[d], a = axisOf(d), st = axisState(a);
    for (let i = 0; i < q.length; i++) {
      const c = q[i], P = PATHS[d][c.turn];
      const v0 = c.turn && c.s > LIN - 30 ? V_TURN : V0;
      let acc = A_MAX * (1 - Math.pow(c.v / v0, 4));
      if (i > 0) acc = Math.min(acc, idmA(c.v, q[i - 1].s - c.s - CAR_LEN, c.v - q[i - 1].v, v0));
      const ex = X.exits[P.ek], tail = ex[ex.length - 1];
      if (tail) acc = Math.min(acc, idmA(c.v, LIN + P.len - c.s + tail.u - CAR_LEN, c.v - tail.v, v0));
      if (c.s < LIN) {
        const dist = LIN - c.s, canStop = dist > (c.v * c.v) / 8 + 0.5;
        let stop = st === 'R' || (st === 'Y' && canStop);
        if (!stop && canStop && (busy[a] || (c.turn !== 2 && opposingLeftInBox(d)))) stop = true;
        if (stop) acc = Math.min(acc, idmA(c.v, dist + S0 - 0.6, c.v, v0));
      }
      if (c.turn === 2 && c.s < LIN + 2.5 && opposingConflict(d)) acc = Math.min(acc, idmA(c.v, LIN + 2.5 - c.s + S0 - 0.3, c.v, v0));
      c.acc = Math.max(-8, Math.min(A_MAX, acc));
    }
  }
  for (let k = 0; k < 4; k++) {
    const ex = X.exits[k];
    for (let i = 0; i < ex.length; i++) {
      const c = ex[i];
      let acc = A_MAX * (1 - Math.pow(c.v / V0, 4));
      if (i > 0) acc = Math.min(acc, idmA(c.v, ex[i - 1].u - c.u - CAR_LEN, c.v - ex[i - 1].v, V0));
      c.acc = Math.max(-8, Math.min(A_MAX, acc));
    }
  }
  // Konum güncelle
  for (let d = 0; d < 4; d++) {
    const q = X.queues[d];
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      const v1 = Math.max(0, c.v + c.acc * h);
      c.s += (c.v + v1) * 0.5 * h;
      c.v = v1;
      if (i > 0 && q[i - 1].s - c.s < CAR_LEN + 0.3) { c.s = q[i - 1].s - CAR_LEN - 0.3; c.v = Math.min(c.v, q[i - 1].v); }
      if (c.v < 1.5) c.wait += h;
      if (!c.passed && c.s >= LIN) { c.passed = true; X.passes.push(X.t); }
    }
    while (q.length && q[0].s >= LIN + PATHS[d][q[0].turn].len) {
      const c = q.shift(), P = PATHS[d][c.turn];
      c.u = c.s - LIN - P.len;
      c.ek = P.ek;
      X.exits[P.ek].push(c);
      X.waits.push(c.wait);
      if (X.waits.length > 80) X.waits.shift();
    }
  }
  for (let k = 0; k < 4; k++) {
    const ex = X.exits[k];
    for (const c of ex) {
      const v1 = Math.max(0, c.v + c.acc * h);
      c.u += (c.v + v1) * 0.5 * h;
      c.v = v1;
    }
    ex.sort((p, q) => q.u - p.u);
    while (ex.length && ex[0].u > LOUT) ex.shift();
  }
  while (X.passes.length && X.passes[0] < X.t - 300) X.passes.shift();
}

function poseX(c, exit) {
  if (exit) {
    const e = H[c.ek], re = rightOf(e), dl = STOP + c.u;
    return [e[0] * dl + re[0] * LANE, e[1] * dl + re[1] * LANE, Math.atan2(e[0], e[1])];
  }
  const P = PATHS[c.d][c.turn];
  if (c.s < LIN) {
    const dl = R - c.s;
    return [-P.h[0] * dl + P.r[0] * LANE, -P.h[1] * dl + P.r[1] * LANE, Math.atan2(P.h[0], P.h[1])];
  }
  const u = Math.min(c.s - LIN, P.len - 1e-6);
  let i = 1;
  while (i < P.cum.length - 1 && P.cum[i] < u) i++;
  const a = P.pts[i - 1], b = P.pts[i], f = (u - P.cum[i - 1]) / (P.cum[i] - P.cum[i - 1] || 1);
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[0] - a[0], b[1] - a[1])];
}

function renderX() {
  let n = 0;
  const put = (c, exit) => {
    if (n >= 260) return;
    const [x, z, yaw] = poseX(c, exit);
    dummy.position.set(x, 0.05, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.updateMatrix();
    xCars.setMatrixAt(n, dummy.matrix);
    xCars.setColorAt(n, colorBySpeed.value ? speedColor(c.v, V0) : tmpC.setHex(c.color));
    n++;
  };
  for (const q of X.queues) for (const c of q) put(c, false);
  for (const ex of X.exits) for (const c of ex) put(c, true);
  xCars.count = n;
  xCars.instanceMatrix.needsUpdate = true;
  if (xCars.instanceColor) xCars.instanceColor.needsUpdate = true;
  // Işıklar
  for (const hd of heads) {
    const st = axisState(axisOf(hd.d));
    const on = st === 'R' ? 0 : st === 'Y' ? 1 : 2;
    hd.bulbs.forEach((b, k) => b.material.color.setHex(k === on ? LIGHT_ON[k] : LIGHT_OFF[k]));
    const qn = X.backlog[hd.d] + X.queues[hd.d].filter((c) => c.s < LIN && c.v < 2).length;
    hd.qLabel.setText(`${DNAME[hd.d]} · kuyruk ${qn}`);
  }
  const p = X.phase, left = Math.max(0, phaseDur(p) - X.phaseT);
  const txt = p === 0 ? '🟢 K-G yeşil' : p === 3 ? '🟢 D-B yeşil' : p === 1 ? '🟡 K-G sarı' : p === 4 ? '🟡 D-B sarı' : '🔴 Tüm yönler kırmızı';
  sigLabel.setText(adaptive.value && (p === 0 || p === 3) ? `${txt} · ${fmt(X.phaseT, 0)} s (uyarlanır)` : `${txt} · ${fmt(Math.ceil(left), 0)} s`);
}

// =====================================================================
// B) HALKA YOL
// =====================================================================
const ring = createRing({ L: 230, n: 22 });
const RR = ring.L / (2 * Math.PI);
const rGroup = new THREE.Group();
sim.scene.add(rGroup);
const rLabels = [];
{
  const road = new THREE.Mesh(new THREE.RingGeometry(RR - 3.2, RR + 3.2, 160).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a2f37, roughness: 0.95 }));
  road.position.y = 0.03;
  const inner = new THREE.Mesh(new THREE.CircleGeometry(RR - 3.2, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 1 }));
  inner.position.y = 0.025;
  rGroup.add(road, inner);
  const n = 70, dm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 1.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe5e7eb }), n * 2);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    for (const [k, rr] of [[0, RR - 3.0], [1, RR + 3.0]]) {
      dummy.position.set(Math.cos(th) * rr, 0.05, Math.sin(th) * rr);
      dummy.rotation.set(0, Math.atan2(-Math.sin(th), Math.cos(th)), 0);
      dummy.scale.set(1, 1, k ? 2.2 : 2.2);
      dummy.updateMatrix();
      dm.setMatrixAt(i * 2 + k, dummy.matrix);
    }
  }
  dummy.scale.set(1, 1, 1);
  rGroup.add(dm);
  // Ortada tribün / ağaçlar
  const tree = new THREE.InstancedMesh(new THREE.ConeGeometry(1.4, 4, 8).translate(0, 2.4, 0), new THREE.MeshStandardMaterial({ color: 0x2f7d4f }), 26);
  for (let i = 0; i < 26; i++) {
    const th = rand(0, Math.PI * 2), rr = rand(4, RR - 8);
    dummy.position.set(Math.cos(th) * rr, 0, Math.sin(th) * rr); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(rand(0.7, 1.3));
    dummy.updateMatrix(); tree.setMatrixAt(i, dummy.matrix);
  }
  dummy.scale.set(1, 1, 1);
  rGroup.add(tree);
  rLabels.push(sim.label(`Halka yol · çevre ${fmt(ring.L)} m`, { parent: rGroup, position: [0, 2, 0] }));
}
const rCars = carMesh(40);
const avMark = instanced(new THREE.BoxGeometry(1.2, 0.35, 1.2), new THREE.MeshBasicMaterial({ color: 0x22d3ee }), 40);
avMark.count = 0;
avMark.frustumCulled = false;
rGroup.add(rCars, avMark);
const brakeLabel = sim.label('🛑 Fren!', { parent: rGroup, position: [0, 3, 0] });
rLabels.push(brakeLabel);
let ringAcc = 0, ringSteps = 0;

function renderRing() {
  const n = ring.cars.length;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const c = ring.cars[i], th = (c.x / ring.L) * Math.PI * 2;
    dummy.position.set(Math.cos(th) * RR, 0.05, Math.sin(th) * RR);
    // Araç yerel +z yönüne bakar; kutu arka tampondan öne uzanır
    dummy.rotation.set(0, Math.atan2(-Math.sin(th), Math.cos(th)), 0);
    dummy.updateMatrix();
    rCars.setMatrixAt(i, dummy.matrix);
    rCars.setColorAt(i, c.av ? tmpC.setHex(0xe0f2fe) : speedColor(c.v, ring.v0 * 0.85));
    if (c.av) {
      dummy.position.y = 1.75; dummy.updateMatrix();
      avMark.setMatrixAt(m++, dummy.matrix);
    }
  }
  rCars.count = n; avMark.count = m;
  rCars.instanceMatrix.needsUpdate = avMark.instanceMatrix.needsUpdate = true;
  if (rCars.instanceColor) rCars.instanceColor.needsUpdate = true;
  const bc = ring.cars[ring.brakeCar];
  brakeLabel.visible = mode.value === 'ring' && ring.brakeT > 0 && !!bc;
  if (bc) { const th = (bc.x / ring.L) * Math.PI * 2; brakeLabel.position.set(Math.cos(th) * RR, 3.2, Math.sin(th) * RR); }
}

// Uzay–zaman diyagramı (konum ↑, zaman →; kırmızı = yavaş)
const stWrap = document.createElement('div');
stWrap.className = 'chart';
stWrap.innerHTML = '<div class="chart-title">Uzay–zaman diyagramı (dikey: halkadaki konum, yatay: zaman)</div>';
const stCv = document.createElement('canvas');
stCv.width = 300; stCv.height = 130;
stCv.style.cssText = 'width:100%;height:130px;display:block;border-radius:6px;background:#0b1220';
stWrap.append(stCv);
const stLegend = document.createElement('div');
stLegend.className = 'legend';
stLegend.innerHTML = '<span><i style="background:#ef4444"></i>duran</span><span><i style="background:#eab308"></i>yavaş</span><span><i style="background:#22c55e"></i>akıcı</span><span><i style="background:#e0f2fe"></i>otonom</span>';
stWrap.append(stLegend);
const stCtx = stCv.getContext('2d');
function stColumn() {
  const W = stCv.width, Hh = stCv.height;
  stCtx.drawImage(stCv, -1, 0);
  stCtx.fillStyle = '#0b1220';
  stCtx.fillRect(W - 1, 0, 1, Hh);
  for (const c of ring.cars) {
    const y = Hh - 1 - (c.x / ring.L) * (Hh - 2);
    stCtx.fillStyle = c.av ? '#e0f2fe' : '#' + speedColor(c.v, ring.v0 * 0.85).getHexString();
    stCtx.fillRect(W - 1, y - 1, 1, 2);
  }
}
function resetRing() {
  ring.reset();
  ring.setAV(avOn.value ? avCount.value : 0);
  ringAcc = 0; ringSteps = 0;
  stCtx.fillStyle = '#0b1220';
  stCtx.fillRect(0, 0, stCv.width, stCv.height);
  rChart?.clear();
}

// =====================================================================
// Arayüz
// =====================================================================
const ui = sim.ui;
const secs = { x: [], ring: [] };
const sec = (title, m) => { const inner = ui.section(title); secs[m].push(inner.parentElement); return inner; };

ui.section('Mod');
const mode = ui.segmented({
  options: [{ value: 'x', label: '🚦 Kavşak' }, { value: 'ring', label: '⭕ Halka yol (hayalet sıkışıklık)' }],
  value: 'x', onChange: (v) => setMode(v),
});

sec('Kavşak · hazır senaryolar', 'x');
const XPRESETS = {
  denge: { ns: 450, ew: 300, gns: 25, gew: 20, left: 15, ad: false },
  ana: { ns: 750, ew: 150, gns: 20, gew: 20, left: 10, ad: false },
  zirve: { ns: 700, ew: 600, gns: 30, gew: 30, left: 25, ad: false },
  gece: { ns: 120, ew: 80, gns: 30, gew: 30, left: 15, ad: false },
};
const xPreset = ui.segmented({
  options: [{ value: 'denge', label: 'Dengeli' }, { value: 'ana', label: 'Ana cadde' }, { value: 'zirve', label: 'Akşam zirvesi' }, { value: 'gece', label: 'Gece' }],
  value: 'denge', onChange: (v) => applyX(v),
});
sec('Kavşak · sinyal', 'x');
const gNS = ui.slider({ label: 'K-G yeşil süresi', min: 5, max: 60, step: 1, value: 25, unit: 's' });
const gEW = ui.slider({ label: 'D-B yeşil süresi', min: 5, max: 60, step: 1, value: 20, unit: 's' });
const adaptive = ui.toggle({ label: 'Uyarlanır (akıllı) sinyal', value: false });
const cycleText = ui.text('', 'card');
sec('Kavşak · trafik talebi', 'x');
const nsRate = ui.slider({ label: 'K-G geliş (her yönden)', min: 50, max: 900, step: 10, value: 450, unit: 'araç/sa' });
const ewRate = ui.slider({ label: 'D-B geliş (her yönden)', min: 50, max: 900, step: 10, value: 300, unit: 'araç/sa' });
const leftPct = ui.slider({ label: 'Sola dönen oranı', min: 0, max: 40, step: 1, value: 15, unit: '%' });
const colorBySpeed = ui.toggle({ label: 'Araçları hıza göre renklendir', value: false });
sec('Kavşak · durum', 'x');
const stWait = ui.stat({ label: 'Ort. bekleme', unit: 's' });
const stQns = ui.stat({ label: 'Kuyruk K-G', unit: 'araç' });
const stQew = ui.stat({ label: 'Kuyruk D-B', unit: 'araç' });
const stFlow = ui.stat({ label: 'Geçen', unit: 'araç/sa' });
const xChart = ui.chart({ title: 'Kuyruk uzunluğu (araç)', series: [{ name: 'K-G', color: '#60a5fa' }, { name: 'D-B', color: '#f97316' }, { name: 'Ort. bekleme (s)', color: '#e879f9' }], maxPoints: 240, yMin: 0 });

sec('Halka yol · sürücüler', 'ring');
const RPRESETS = {
  sugi: { n: 22, T: 1.0, tau: 0.6, av: false },
  dikkat: { n: 22, T: 1.8, tau: 0.3, av: false },
  otonom: { n: 22, T: 1.0, tau: 0.6, av: true, k: 3 },
  yogun: { n: 32, T: 1.0, tau: 0.7, av: false },
};
const rPreset = ui.segmented({
  options: [{ value: 'sugi', label: 'Sugiyama' }, { value: 'dikkat', label: 'Dikkatli' }, { value: 'otonom', label: 'Otonom karışım' }, { value: 'yogun', label: 'Yoğun' }],
  value: 'sugi', onChange: (v) => applyRing(v),
});
const nCars = ui.slider({ label: 'Araç sayısı', min: 10, max: 36, step: 1, value: 22, onChange: (v) => { ring.setCount(v); ring.setAV(avOn.value ? avCount.value : 0); } });
const followT = ui.slider({ label: 'Takip mesafesi (zaman aralığı)', min: 0.6, max: 2.4, step: 0.1, value: 1.0, unit: 's', onChange: (v) => (ring.T = v) });
const tauS = ui.slider({ label: 'Tepki süresi', min: 0.2, max: 1.2, step: 0.05, value: 0.6, unit: 's', onChange: (v) => (ring.tau = v) });
ui.button({ label: '🛑 Bir sürücü fren yapsın', variant: 'danger', onClick: () => { ring.brake(Math.floor(Math.random() * ring.cars.length)); sim.toast('Bir sürücü sertçe fren yaptı — dalgayı izle', 'warn'); } });
const avOn = ui.toggle({ label: 'Otonom (ACC) araçlar', value: false, onChange: () => ring.setAV(avOn.value ? avCount.value : 0) });
const avCount = ui.slider({ label: 'Otonom araç sayısı', min: 1, max: 6, step: 1, value: 3, onChange: (v) => avOn.value && ring.setAV(v) });
sec('Halka yol · durum', 'ring');
const rMean = ui.stat({ label: 'Ortalama hız', unit: 'km/sa' });
const rStop = ui.stat({ label: 'Duran araç' });
const rSd = ui.stat({ label: 'Hız dalgalanması', unit: 'km/sa' });
const rFlow = ui.stat({ label: 'Akış', unit: 'araç/sa' });
const rChart = ui.chart({ title: 'Hız (km/sa)', series: [{ name: 'Ortalama', color: '#22c55e' }, { name: 'En yavaş araç', color: '#ef4444' }], maxPoints: 240, yMin: 0 });
ui.append(stWrap);

function applyX(name) {
  const p = XPRESETS[name];
  nsRate.set(p.ns); ewRate.set(p.ew); gNS.set(p.gns); gEW.set(p.gew); leftPct.set(p.left); adaptive.set(p.ad);
  resetX();
}
function applyRing(name) {
  const p = RPRESETS[name];
  ring.n = p.n; nCars.set(p.n); followT.set(p.T); tauS.set(p.tau); ring.T = p.T; ring.tau = p.tau;
  avOn.set(p.av); if (p.k) avCount.set(p.k);
  resetRing();
}

function setMode(m) {
  xGroup.visible = m === 'x';
  rGroup.visible = m === 'ring';
  xLabels.forEach((l) => (l.visible = m === 'x'));
  rLabels.forEach((l) => (l.visible = m === 'ring'));
  secs.x.forEach((e) => (e.style.display = m === 'x' ? '' : 'none'));
  secs.ring.forEach((e) => (e.style.display = m === 'ring' ? '' : 'none'));
  if (m === 'x') sim.moveCamera([0, 100, 62], [0, 0, 4]);
  else sim.moveCamera([0, 66, 74], [0, 0, 2]);
}

// ---------- Döngü ----------
let statT = 0;
sim.onUpdate((dt) => {
  if (mode.value === 'x') {
    const n = Math.ceil(dt / 0.1);
    for (let i = 0; i < n; i++) stepX(dt / n);
    X.chartT += dt;
    if (X.chartT >= 1) {
      X.chartT = 0;
      const w = X.waits.length ? X.waits.reduce((a, b) => a + b, 0) / X.waits.length : 0;
      xChart.push([axisQueue(0), axisQueue(1), w]);
    }
  } else {
    ringAcc += Math.min(dt, 1);
    while (ringAcc >= RING_DT) {
      ring.step(RING_DT);
      ringAcc -= RING_DT;
      if (++ringSteps % 10 === 0) stColumn();
      if (ringSteps % 10 === 0) {
        const s = ringStats(ring);
        rChart.push([s.mean * 3.6, s.min * 3.6]);
      }
    }
  }
});

sim.onRender((real) => {
  if (mode.value === 'x') renderX(); else renderRing();
  statT += real;
  if (statT < 0.4) return;
  statT = 0;
  if (mode.value === 'x') {
    const w = X.waits.length ? X.waits.reduce((a, b) => a + b, 0) / X.waits.length : 0;
    stWait.set(fmt(w, 1), w > 40 ? 'bad' : w > 20 ? 'warn' : 'good');
    const qa = axisQueue(0), qb = axisQueue(1);
    stQns.set(qa, qa > 15 ? 'bad' : qa > 8 ? 'warn' : '');
    stQew.set(qb, qb > 15 ? 'bad' : qb > 8 ? 'warn' : '');
    const span = Math.min(300, X.t);
    stFlow.set(span > 20 ? fmt((X.passes.length / span) * 3600, 0) : '—');
    if (adaptive.value) cycleText.set('Uyarlanır mod: yeşil en az 7, en çok 50 s. Yeşil yöndeki akış kesilince ya da karşı kuyruk çok büyüyünce ışık değişir.');
    else {
      const C = gNS.value + gEW.value + 10;
      cycleText.set(`Döngü süresi <b>${C} s</b> (yeşiller + 2×3 s sarı + 2×2 s tüm kırmızı) · K-G payı <b>%${fmt((gNS.value / C) * 100, 0)}</b>, D-B payı <b>%${fmt((gEW.value / C) * 100, 0)}</b>`);
    }
  } else {
    const s = ringStats(ring);
    rMean.set(fmt(s.mean * 3.6, 1));
    rStop.set(s.stopped, s.stopped > 2 ? 'bad' : s.stopped ? 'warn' : 'good');
    rSd.set(fmt(s.sd * 3.6, 1), s.sd > 3 ? 'bad' : s.sd > 1.5 ? 'warn' : 'good');
    rFlow.set(fmt(s.flow, 0));
  }
});

sim.onReset(() => { if (mode.value === 'x') resetX(); else resetRing(); });
resetX();
resetRing();
setMode('x');
