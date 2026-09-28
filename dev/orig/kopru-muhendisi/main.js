// Köprü Mühendisi — kafes köprü; doğrudan rijitlik yöntemiyle eleman kuvvetleri, kopma/burkulma ve çöküş.
import { createSim, THREE, fmt, clamp, ImprovedNoise, seeded } from '@core';
import { HALF, G, MATS, CABLE, gorgeY, buildPreset, applyDesign, buildLoads, solveTruss, totals } from './truss.js';

const ZW = 3.2;            // kafes düzlemleri z = ±ZW
const TRUCK_MIN = -HALF - 7, TRUCK_MAX = HALF + 7;
const DRIVE_V = 5;         // m/s
const TYPES = [
  { value: 'warren', label: 'Warren' }, { value: 'pratt', label: 'Pratt' }, { value: 'howe', label: 'Howe' },
  { value: 'kemer', label: 'Kemer' }, { value: 'asma', label: 'Asma' },
];

const sim = createSim({
  background: 0x9cc3e4,
  camera: { position: [9, 3, 44], target: [0, -5, 0], fov: 48, far: 900 },
  controls: { maxDistance: 160, minDistance: 8, maxPolarAngle: Math.PI * 0.56 },
  fog: [110, 320],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>32 m'lik bir kanyonu geçen bir kafes köprü. Elemanlar düğümlerde mafsallıdır; yalnızca eksenleri boyunca
    <b style="color:#60a5fa">çekme</b> (mavi) ya da <b style="color:#f87171">basınç</b> (kırmızı) taşırlar. Renk ne kadar koyuysa eleman
    kapasitesine o kadar yakındır. Kuvvetler <b>doğrudan rijitlik yöntemiyle</b> (K·u = F) her karede yeniden hesaplanır;
    yük olarak kamyon, tabliye ve elemanların kendi ağırlığı kullanılır.</p>
    <ul>
      <li>Çekme kapasitesi: <b>σ·A</b> (malzeme dayanımı × kesit alanı).</li>
      <li>Basınçta ise ince uzun elemanlar ezilmeden önce <b>burkulur</b>: Euler yükü <b>P = π²·E·I / L²</b>. Uzun basınç çubukları bu yüzden zayıftır.</li>
      <li><b>Güvenlik katsayısı</b> = kapasite / etkiyen kuvvet (en zayıf eleman için). Mühendisler genellikle 1,5–2'nin üstünü hedefler.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li>Aynı kalınlıkta Pratt ile Howe'u karşılaştır: Pratt'ta uzun çaprazlar çekmede, Howe'da basınçta çalışır — hangisi daha çok yük taşıyor?</li>
      <li>Örgü kalınlığını azalt ve kamyonu geçir: önce hangi eleman burkuluyor?</li>
      <li>"Tıklayınca eleman sök" ile tek bir alt başlığı çıkar: kafes mekanizmaya dönüşür ve çöker. Kemer ve asma köprüler daha fazla yedekliğe sahiptir.</li>
      <li><b>Görev:</b> seçtiğin kamyon yükünü köprüden en düşük maliyetle geçir.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Warren, Pratt ve Howe kafesleri demiryolu ve karayolu köprülerinde yüzyılı aşkın süredir kullanılıyor. Kemer köprüler yükü
    basınçla yamaçlara aktarır; asma köprülerde ise çekmeye çalışan kablolar yükü kulelere ve ankrajlara taşır
    (ör. 15 Temmuz Şehitler ve 1915 Çanakkale köprüleri).</p>
    <p><small>Model 2B, doğrusal-elastik ve mafsallı kafestir; çökme animasyonu konum tabanlı dinamikle yaklaşık çizilir.
    Sehimler görünür olsun diye büyütülür. Fiyatlar temsilidir.</small></p>`,
});

// --- Arazi: V biçimli kanyon, nehir, yol, ağaçlar ---
const noise = new ImprovedNoise();
{
  const geo = new THREE.PlaneGeometry(180, 110, 180, 110);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const grass = new THREE.Color(0x5f8f3e), rock = new THREE.Color(0x8b7b6b), dark = new THREE.Color(0x5d5249), bed = new THREE.Color(0x6f6a5c);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let y = gorgeY(x);
    const near = Math.abs(z) < 7 ? 0.2 : 1;
    if (y < -0.01) y += noise.noise(x * 0.18, z * 0.12, 0.5) * 1.8 * near;
    else if (Math.abs(x) > 34) y += Math.max(0, noise.noise(x * 0.03, z * 0.03, 2.5)) * (Math.abs(x) - 34) * 0.5;
    pos.setY(i, y);
    if (y > -0.4) c.copy(grass).offsetHSL(0, 0, noise.noise(x * 0.2, z * 0.2, 7) * 0.05);
    else if (y > -22.5) c.copy(rock).lerp(dark, clamp(-y / 24, 0, 1) * 0.6 + noise.noise(x * 0.4, z * 0.3, 9) * 0.2);
    else c.copy(bed);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  sim.scene.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })));
}
const river = new THREE.Mesh(new THREE.PlaneGeometry(20, 110, 1, 1), new THREE.MeshStandardMaterial({ color: 0x2f6fae, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.9 }));
river.rotation.x = -Math.PI / 2;
river.position.y = -23.2;
sim.scene.add(river);

const asphaltTex = (() => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3f46'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#e5e7eb'; g.fillRect(0, 8, 256, 5); g.fillRect(0, 115, 256, 5);
  g.fillStyle = '#facc15'; g.fillRect(40, 61, 176, 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
for (const s of [-1, 1]) {
  const road = new THREE.Mesh(new THREE.BoxGeometry(40, 0.2, ZW * 2), new THREE.MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.9 }));
  road.position.set(s * (HALF + 20.5), 0.02, 0);
  sim.scene.add(road);
}
{
  const rnd = seeded(7), trees = [];
  for (let i = 0; i < 400 && trees.length < 90; i++) {
    const x = (rnd() - 0.5) * 170, z = (rnd() - 0.5) * 100;
    if (Math.abs(x) < HALF + 2 || (Math.abs(z) < 7 && Math.abs(x) < 64) || Math.abs(x) > 34 || z > 16) continue;
    trees.push([x, z, 0.8 + rnd() * 0.8]);
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x6b4a2b }), trees.length);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1.1, 3, 7), new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 0.9 }), trees.length);
  const m = new THREE.Matrix4();
  trees.forEach(([x, z, s], i) => {
    m.makeScale(s, s, s).setPosition(x, 0.6 * s, z); trunk.setMatrixAt(i, m);
    m.makeScale(s, s, s).setPosition(x, 2.4 * s, z); crown.setMatrixAt(i, m);
  });
  sim.scene.add(trunk, crown);
}

// --- Köprü görselleri ---
const MAX_MEM = 64, MAX_NODE = 48, MAX_CROSS = 24;
const memMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.25 }), MAX_MEM * 2 + MAX_CROSS);
const jointMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.5, metalness: 0.4 }), MAX_NODE * 2);
const side = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.8 });
const deckMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), [side, side, new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.9 }), side, side, side], 16);
for (const m of [memMesh, jointMesh, deckMesh]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; sim.scene.add(m); }
const extras = new THREE.Group();
sim.scene.add(extras);
const concrete = new THREE.MeshStandardMaterial({ color: 0xa8a29e, roughness: 0.9 });

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function setCyl(mesh, i, ax, ay, az, bx, by, bz, r) {
  _d.set(bx - ax, by - ay, bz - az);
  const L = _d.length();
  if (L < 1e-6) { mesh.setMatrixAt(i, ZERO); return; }
  _q.setFromUnitVectors(UP, _d.divideScalar(L));
  _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(r, L, r));
  mesh.setMatrixAt(i, _m);
}

// Kopma tozu / kıvılcımları
const DEBRIS = 60;
const debrisGeo = new THREE.BufferGeometry();
debrisGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DEBRIS * 3), 3));
const debris = new THREE.Points(debrisGeo, new THREE.PointsMaterial({ color: 0xfde68a, size: 0.35, transparent: true, opacity: 0.9 }));
debris.frustumCulled = false;
sim.scene.add(debris);
const debV = new Float32Array(DEBRIS * 3);
let debLife = 0;
function burst(x, y, z) {
  const a = debrisGeo.attributes.position.array;
  for (let i = 0; i < DEBRIS; i++) {
    a.set([x, y, z], i * 3);
    debV.set([(Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8], i * 3);
  }
  debLife = 1.2;
}

// Kamyon
const truck = new THREE.Group();
{
  const body = new THREE.Group();
  const add = (geo, color, x, y, z = 0) => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 })); m.position.set(x, y, z); body.add(m); return m; };
  add(new THREE.BoxGeometry(7, 0.35, 2.1), 0x374151, 0, 0.85);
  add(new THREE.BoxGeometry(1.8, 2.3, 2.4), 0xf59e0b, 2.6, 2.1);
  add(new THREE.BoxGeometry(0.1, 0.9, 2.0), 0x93c5fd, 3.52, 2.6);
  add(new THREE.BoxGeometry(4.8, 2.5, 2.5), 0xe5e7eb, -0.9, 2.3);
  const wg = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 14);
  wg.rotateX(Math.PI / 2);
  for (const x of [-2.6, -1.4, 2.4]) for (const z of [-1.05, 1.05]) add(wg, 0x111827, x, 0.5, z);
  truck.add(body);
}
sim.scene.add(truck);
const truckLabel = sim.label('', { parent: truck, position: [0, 4.4, 0] });
const maxLabel = sim.label('', { className: 'plain' });

// --- Durum ---
let model = null, U = null, F = null;
let state = 'stand';            // 'stand' | 'collapse'
let disp = [];                  // görüntülenen düğüm konumları [{x,y}]
let pbd = null;                 // çöküş dinamiği
let truckX = -10, drive = null, cooldown = 0, broken = 0, peakUtil = 0, maxDisp = 0, dirty = true;
const bests = {};

function design() {
  return { mat: matSel.value, dChord: chordD.value / 100, dWeb: webD.value / 100, dCable: cableD.value / 100 };
}

function build(type) {
  model = buildPreset(type);
  applyDesign(model, design());
  F = new Float64Array(model.nodes.length * 2);
  disp = model.nodes.map((n) => ({ x: n.x, y: n.y }));
  state = 'stand'; pbd = null; broken = 0; cooldown = 0; peakUtil = 0;
  // Mesnet blokları
  extras.children.slice().forEach((c) => { c.geometry.dispose(); c.removeFromParent(); });
  const block = (x, y, w, h) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, ZW * 2 + 1.6), concrete); b.position.set(x, y, 0); extras.add(b); };
  block(-HALF - 1.1, -1.2, 2.6, 2.2); block(HALF + 1.1, -1.2, 2.6, 2.2);
  for (const n of model.nodes) {
    if (!n.fx || n.y === 0 && Math.abs(Math.abs(n.x) - HALF) < 0.01) continue;
    block(n.x + Math.sign(n.x) * 0.8, n.y - 0.9, 2.4, 2.2);
  }
  sim.hud.hide();
  dirty = true;
  analyze();
  refreshVisuals();
}

function analyze() {
  buildLoads(model, F, { truckX, truckT: load.value });
  const r = solveTruss(model, F);
  if (!r.ok) return startCollapse('Bir eleman kaybedilince kafes <b>mekanizmaya</b> dönüştü: düğümler artık yerinde tutulamıyor.');
  U = r.U; maxDisp = r.maxDisp;
  if (maxDisp > 1.2) return startCollapse('Sehim çok büyüdü (' + fmt(maxDisp, 1) + ' m); köprü yükü taşıyamıyor.');
  let worst = 0;
  for (const m of model.members) if (m.alive) worst = Math.max(worst, m.util);
  if (drive) drive.peak = Math.max(drive.peak, worst);
  peakUtil = worst;
  dirty = false;
}

function breakWorst() {
  let w = null;
  for (const m of model.members) if (m.alive && m.util > 1 && (!w || m.util > w.util)) w = m;
  if (!w) return false;
  w.alive = false;
  broken++;
  const a = disp[w.a], b = disp[w.b];
  burst((a.x + b.x) / 2, (a.y + b.y) / 2, ZW);
  const verb = w.mode === 'burkulma' ? 'burkuldu' : w.mode === 'ezilme' ? 'ezildi' : 'koptu';
  sim.toast(`💥 ${w.label} ${verb}!`, 'bad');
  return true;
}

function startCollapse(reason) {
  if (state === 'collapse') return;
  state = 'collapse';
  const P = disp.map((d) => ({ x: d.x, y: d.y, px: d.x, py: d.y }));
  const cons = model.members.filter((m) => m.alive).map((m) => ({ a: m.a, b: m.b, L: Math.hypot(P[m.b].x - P[m.a].x, P[m.b].y - P[m.a].y) }));
  pbd = { P, cons };
  let msg = `<h2>💥 Köprü çöktü!</h2><p>${reason}</p>`;
  if (drive?.challenge) msg += `<p>Görev başarısız. Kesitleri kalınlaştır ya da başka bir kafes tipi dene.</p>`;
  sim.hud.show(msg + `<button class="btn primary" data-a="fix">🔧 Köprüyü yeniden kur</button>`, { tone: 'bad' });
  sim.hud.el.querySelector('[data-a=fix]').onclick = () => build(typeSel.value);
  drive = null;
}

function stepCollapse(dt) {
  const n = Math.min(40, Math.ceil(dt / 0.008)), h = dt / n;
  const { P, cons } = pbd, nodes = model.nodes;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < P.length; i++) {
      if (nodes[i].fx || nodes[i].fy) continue;
      const p = P[i], vx = (p.x - p.px) * 0.998, vy = (p.y - p.py) * 0.998;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy - G * h * h;
    }
    for (let it = 0; it < 8; it++) {
      for (const c of cons) {
        const A = P[c.a], B = P[c.b];
        const wa = nodes[c.a].fx || nodes[c.a].fy ? 0 : 1, wb = nodes[c.b].fx || nodes[c.b].fy ? 0 : 1;
        if (!wa && !wb) continue;
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1e-6;
        const f = (d - c.L) / d / (wa + wb);
        A.x += dx * f * wa; A.y += dy * f * wa; B.x -= dx * f * wb; B.y -= dy * f * wb;
      }
      for (const p of P) {
        const gy = gorgeY(p.x) + 0.25;
        if (p.y < gy) { p.y = gy; p.px = p.x - (p.x - p.px) * 0.3; }
      }
    }
  }
  for (let i = 0; i < P.length; i++) { disp[i].x = P[i].x; disp[i].y = P[i].y; }
}

// --- Görsel güncelleme ---
const cNeut = new THREE.Color(), cT = new THREE.Color(0x1d4ed8), cC = new THREE.Color(0xdc2626), cTmp = new THREE.Color();
const cCable = new THREE.Color(CABLE.color), cBroken = new THREE.Color(0x111827);
function refreshVisuals() {
  const nodes = model.nodes, ex = exag.value, mat = MATS[matSel.value];
  if (state === 'stand' && U) {
    for (let i = 0; i < nodes.length; i++) { disp[i].x = nodes[i].x + U[2 * i] * ex; disp[i].y = nodes[i].y + U[2 * i + 1] * ex; }
  }
  cNeut.setHex(mat.color);
  let k = 0, worst = null;
  for (const m of model.members) {
    const a = disp[m.a], b = disp[m.b];
    const r = Math.max(0.07, (m.p.cable ? m.p.d * 0.9 : m.p.d * 0.75));
    for (const z of [-ZW, ZW]) {
      if (!m.alive) { memMesh.setMatrixAt(k, ZERO); memMesh.setColorAt(k++, cBroken); continue; }
      setCyl(memMesh, k, a.x, a.y, z, b.x, b.y, z, r);
      const base = m.p.cable ? cCable : cNeut;
      if (colorMode.value && state === 'stand') {
        const t = Math.pow(clamp(m.util, 0, 1), 0.6);
        cTmp.copy(base).lerp(m.slack ? base : m.F >= 0 ? cT : cC, t);
        if (m.util > 0.9 && Math.sin(performance.now() / 90) > 0) cTmp.setHex(0xfacc15);
      } else cTmp.copy(base);
      memMesh.setColorAt(k++, cTmp);
    }
    if (m.alive && (!worst || m.util > worst.util)) worst = m;
  }
  // Enine bağlantılar
  for (const i of model.cross) {
    setCyl(memMesh, k, disp[i].x, disp[i].y, -ZW, disp[i].x, disp[i].y, ZW, 0.1);
    memMesh.setColorAt(k++, cNeut);
  }
  memMesh.count = k;
  memMesh.instanceMatrix.needsUpdate = true;
  if (memMesh.instanceColor) memMesh.instanceColor.needsUpdate = true;
  // Düğümler
  let j = 0;
  for (let i = 0; i < nodes.length; i++) {
    const r = 0.22 + chordD.value / 100 * 0.6;
    for (const z of [-ZW, ZW]) { _m.makeScale(r, r, r).setPosition(disp[i].x, disp[i].y, z); jointMesh.setMatrixAt(j++, _m); }
  }
  jointMesh.count = j;
  jointMesh.instanceMatrix.needsUpdate = true;
  // Tabliye
  const dk = model.deck;
  for (let i = 0; i < dk.length - 1; i++) {
    const a = disp[dk[i]], b = disp[dk[i + 1]];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    _q.setFromAxisAngle(_d.set(0, 0, 1), Math.atan2(b.y - a.y, b.x - a.x));
    _m.compose(_p.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.05, 0), _q, _s.set(L, 0.35, ZW * 2 + 0.3));
    deckMesh.setMatrixAt(i, _m);
  }
  deckMesh.count = dk.length - 1;
  deckMesh.instanceMatrix.needsUpdate = true;
  // En zorlanan eleman etiketi
  if (worst && state === 'stand' && worst.util > 0.05) {
    const a = disp[worst.a], b = disp[worst.b];
    maxLabel.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.8, ZW);
    maxLabel.setText(`<span style="color:${worst.util > 0.9 ? '#fca5a5' : '#fff'}">⚠ %${fmt(worst.util * 100)}</span>`);
    maxLabel.visible = true;
  } else maxLabel.visible = false;
  placeTruck();
}

function deckHeight(x) {
  const dk = model.deck;
  for (let i = 0; i < dk.length - 1; i++) {
    const a = disp[dk[i]], b = disp[dk[i + 1]];
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    if (x >= lo && x <= hi && hi - lo > 1e-6) return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x) + 0.23;
  }
  const a = model.nodes[dk[0]], b = model.nodes[dk[dk.length - 1]];
  if (x < a.x || x > b.x) return 0.12;
  // köprü çökmüşse en yakın tabliye düğümü
  let best = disp[dk[0]], bd = Infinity;
  for (const i of dk) { const d = Math.abs(disp[i].x - x); if (d < bd) { bd = d; best = disp[i]; } }
  return best.y + 0.23;
}

function placeTruck() {
  const yr = deckHeight(truckX - 2.0), yf = deckHeight(truckX + 2.4);
  truck.position.set(truckX, (yr + yf) / 2 + (yf - yr) * 0.2 / 4.4, 0);
  truck.rotation.z = Math.atan2(yf - yr, 4.4);
  truck.visible = load.value > 0;
  truckLabel.setText(`🚚 ${fmt(load.value)} t`);
}

// --- Döngü ---
sim.onUpdate((dt) => {
  if (state === 'stand') {
    const steps = drive ? Math.max(1, Math.ceil((DRIVE_V * dt) / 0.4)) : 1;
    for (let s = 0; s < steps && state === 'stand'; s++) {
      if (drive) {
        truckX = Math.min(TRUCK_MAX, truckX + (DRIVE_V * dt) / steps);
        posSl.set(truckX);
      }
      analyze();
      if (state !== 'stand') break;
      cooldown -= dt / steps;
      if (cooldown <= 0 && breakWorst()) { cooldown = 0.25; analyze(); }
      if (drive && truckX >= TRUCK_MAX) finishDrive();
    }
  } else stepCollapse(dt);
  if (debLife > 0) {
    debLife -= dt;
    const a = debrisGeo.attributes.position.array;
    for (let i = 0; i < DEBRIS * 3; i += 3) {
      debV[i + 1] -= G * dt;
      a[i] += debV[i] * dt; a[i + 1] += debV[i + 1] * dt; a[i + 2] += debV[i + 2] * dt;
    }
    debrisGeo.attributes.position.needsUpdate = true;
    debris.material.opacity = clamp(debLife, 0, 1);
  }
  debris.visible = debLife > 0;
});
sim.onRender(() => {
  if (dirty && state === 'stand') analyze();
  refreshVisuals();
});

function finishDrive() {
  const d = drive;
  drive = null;
  if (!d.challenge) return;
  const t = totals(model), cost = t.cost / 1000, key = load.value;
  const prev = bests[key];
  const better = !prev || cost < prev.cost;
  if (better) bests[key] = { cost, type: TYPES.find((x) => x.value === typeSel.value).label, mat: MATS[matSel.value].name, c: chordD.value, w: webD.value };
  sim.hud.show(`<h2>✅ Kamyon karşıya geçti!</h2>
    <p>${fmt(load.value)} tonluk yük · maliyet <b>${fmt(cost)} bin ₺</b> · en yüksek gerilme %${fmt(d.peak * 100)}
    · güvenlik katsayısı <b>${fmt(1 / Math.max(d.peak, 1e-3), 2)}</b></p>
    <p>${better ? '🏆 Bu yük için yeni en ucuz tasarım!' : `En ucuz tasarımın hâlâ ${fmt(prev.cost)} bin ₺.`}
    ${d.peak < 0.5 ? ' İpucu: köprü çok güçlü — kesitleri inceltip maliyeti düşürebilirsin.' : ''}</p>
    <button class="btn" data-a="ok">Tamam</button>`, { tone: 'good' });
  sim.hud.el.querySelector('[data-a=ok]').onclick = () => sim.hud.hide();
  showBests();
}

function showBests() {
  const keys = Object.keys(bests).map(Number).sort((a, b) => a - b);
  bestTxt.set(keys.length ? keys.map((k) => { const b = bests[k]; return `<b>${fmt(k)} t</b>: ${fmt(b.cost)} bin ₺ · ${b.type}, ${b.mat}, ${b.c}/${b.w} cm`; }).join('<br>')
    : 'Henüz başarılı görev yok. Yükü seç, <b>🏁 Görevi dene</b>ye bas.');
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Köprü tipi');
const typeSel = ui.segmented({ options: TYPES, value: 'warren', onChange: (v) => build(v) });

ui.section('Malzeme ve kesit');
const matSel = ui.segmented({ options: [{ value: 'celik', label: '🔩 Çelik' }, { value: 'ahsap', label: '🪵 Ahşap' }], value: 'celik', onChange: () => redesign() });
const chordD = ui.slider({ label: 'Başlık / kemer / kule kalınlığı', min: 4, max: 40, step: 1, value: 12, unit: 'cm', onChange: () => redesign() });
const webD = ui.slider({ label: 'Örgü (dikme, çapraz) kalınlığı', min: 4, max: 40, step: 1, value: 10, unit: 'cm', onChange: () => redesign() });
const cableD = ui.slider({ label: 'Kablo çapı (asma köprü)', min: 2, max: 16, step: 0.5, value: 5, unit: 'cm', onChange: () => redesign() });
ui.text('<small>Çelik: kare kutu profil. Ahşap: dolu kare kesit (tutkallı lamine).</small>');

ui.section('Yük');
const load = ui.slider({ label: 'Kamyon yükü', min: 0, max: 120, step: 1, value: 30, unit: 't', onChange: () => (dirty = true) });
const posSl = ui.slider({ label: 'Kamyonun konumu', min: TRUCK_MIN, max: TRUCK_MAX, step: 0.1, value: truckX, format: (v) => `${fmt(v + HALF, 1)} m`, onInput: (v) => { truckX = v; dirty = true; } });
ui.buttons([
  { label: '🚚 Kamyonu geçir', variant: 'primary', onClick: () => startDrive(false) },
  { label: '🏁 Görevi dene', variant: 'good', onClick: () => startDrive(true) },
]);
const removeMode = ui.toggle({ label: 'Tıklayınca eleman sök', value: false });

ui.section('Görünüm');
const exag = ui.slider({ label: 'Sehim büyütme', min: 1, max: 100, step: 1, value: 30, unit: '×' });
const colorMode = ui.toggle({ label: 'Gerilme renkleri (mavi çekme, kırmızı basınç)', value: true });

ui.section('Durum');
const stUtil = ui.stat({ label: 'Maks. gerilme', unit: '%' });
const stSF = ui.stat({ label: 'Güvenlik katsayısı' });
const stCost = ui.stat({ label: 'Malzeme maliyeti', unit: 'bin ₺' });
const stMass = ui.stat({ label: 'Malzeme kütlesi', unit: 't' });
const stDefl = ui.stat({ label: 'Gerçek maks. sehim', unit: 'cm' });
const stBroken = ui.stat({ label: 'Kırılan eleman' });
const meter = ui.meter({ label: 'En zorlanan eleman' });
const worstTxt = ui.text('', 'card');
ui.button({ label: '🔧 Köprüyü yeniden kur', onClick: () => build(typeSel.value) });

ui.section('🏆 Görev: en ucuz köprü');
ui.text('Seçtiğin kamyon yükünü köprüden <b>en düşük malzeme maliyetiyle</b> geçir. Kamyon baştan sona gider; hiçbir eleman kırılmamalı.');
const bestTxt = ui.text('', 'card');
showBests();

function redesign() {
  const wasCollapsed = state === 'collapse';
  applyDesign(model, design());
  if (wasCollapsed) build(typeSel.value);
  dirty = true;
}

function startDrive(challenge) {
  if (challenge || state === 'collapse') build(typeSel.value);
  truckX = challenge || truckX >= TRUCK_MAX - 1 ? TRUCK_MIN : truckX;
  posSl.set(truckX);
  drive = { challenge, peak: 0 };
  sim.hud.hide();
  if (challenge) sim.toast(`🏁 Görev başladı: ${fmt(load.value)} t`, 'warn');
  if (sim.paused) sim.play();
}

let statTick = 0;
sim.onRender(() => {
  if (statTick++ % 6) return;
  const t = totals(model);
  stCost.set(fmt(t.cost / 1000), '');
  stMass.set(fmt(t.mass / 1000, 1));
  stBroken.set(broken, broken ? 'bad' : '');
  if (state === 'collapse') {
    stUtil.set('—', 'bad'); stSF.set('0', 'bad'); stDefl.set('—', 'bad');
    meter.set(1, 'çöktü'); meter.color('var(--bad)');
    worstTxt.set('Köprü çöktü. <b>🔧 Yeniden kur</b> ya da kesitleri değiştir.');
    return;
  }
  const u = peakUtil, tone = u > 0.9 ? 'bad' : u > 0.6 ? 'warn' : 'good';
  stUtil.set(fmt(u * 100), tone);
  stSF.set(u > 1e-3 ? fmt(1 / u, 2) : '∞', 1 / u < 1.5 ? 'bad' : 1 / u < 2 ? 'warn' : 'good');
  stDefl.set(fmt(maxDisp * 100, 1));
  meter.set(u, `%${fmt(u * 100)}`);
  meter.color(u > 0.9 ? 'var(--bad)' : u > 0.6 ? 'var(--warn)' : 'var(--good)');
  let w = null;
  for (const m of model.members) if (m.alive && (!w || m.util > w.util)) w = m;
  if (w) {
    const kind = w.F >= 0 ? '<span style="color:#60a5fa">çekme</span>' : '<span style="color:#f87171">basınç</span>';
    worstTxt.set(`<b>${w.label}</b>: ${fmt(Math.abs(w.F) / 1000)} kN ${kind}<br>
      Kapasite: çekme ${fmt(w.capT / 1000)} kN${w.p.cable ? '' : ` · basınç ${fmt(w.capC / 1000)} kN (${w.capB < w.capY ? 'burkulma belirler' : 'ezilme belirler'})`}`);
  }
});

// Eleman tıklama: bilgi ya da sökme
sim.onClick(() => [memMesh], (hit) => {
  if (hit.instanceId == null || state !== 'stand') return;
  const idx = Math.floor(hit.instanceId / 2);
  const m = model.members[idx];
  if (!m || !m.alive) return;
  if (removeMode.value) {
    m.alive = false; broken++;
    const a = disp[m.a], b = disp[m.b];
    burst((a.x + b.x) / 2, (a.y + b.y) / 2, ZW);
    sim.toast(`🔧 ${m.label} söküldü`, 'warn');
    dirty = true;
    return;
  }
  const kind = m.slack ? 'gevşek (kablo basınç taşımaz)' : m.F >= 0 ? 'çekme' : 'basınç';
  sim.toast(`<b>${m.label}</b> · ${fmt(Math.abs(m.F) / 1000)} kN ${kind} · kapasitenin %${fmt(m.util * 100)}'i · boy ${fmt(m.L, 1)} m`);
});

// Kamyonu sürükle
let dragging = false;
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
sim.dom.addEventListener('pointerdown', (e) => {
  if (!truck.visible || !sim.raycast(e, [truck]).length) return;
  dragging = true; drive = null;
  if (sim.controls) sim.controls.enabled = false;
});
sim.dom.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const p = sim.pointOnPlane(e, dragPlane);
  if (p) { truckX = clamp(p.x, TRUCK_MIN, TRUCK_MAX); posSl.set(truckX); dirty = true; }
});
window.addEventListener('pointerup', () => { if (dragging) { dragging = false; if (sim.controls) sim.controls.enabled = true; } });

sim.onReset(() => { drive = null; truckX = -10; posSl.set(truckX); build(typeSel.value); });
build('warren');
