// Molekül Lego — merkez atoma atom tak; VSEPR geometrisi, bağ açıları, ortaklanmamış çiftler ve dipol anında güncellenir.
import { createSim, THREE, fmt, clamp, pick, mat as M, RoundedBoxGeometry } from '@core';
import { ATOMS, CENTRALS, LIGANDS, PRESETS, PRESET_BY_KEY, GEOMETRIES, analyze, canAdd, formula, keyOf, sub, bondType } from './chem.js';

const UNIT = 1.45;          // 1 Å → sahne birimi
const LP_W = 0.8;           // ortaklanmamış çiftin dipole katkısı (göreli)
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

const sim = createSim({
  studio: { mood: 'day', color: 0xa8a39b, warmth: 0.2, key: { el: 55, az: 30, power: 1.2 }, radius: 9, height: 5 },
  look: { aoRadius: 0.02 },
  camera: { position: [0, 0.198, 0.345], target: [0, 0.132, 0], fov: 45, near: 0.01, far: 40 },
  controls: { minDistance: 0.15, maxDistance: 0.72, maxPolarAngle: Math.PI },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Ortadaki <b>merkez atoma</b> taktığın her atom bir bağ, bağlanmamış elektron çiftleri ise mor
    <b>ortaklanmamış çift</b> bulutlarıdır. <b>VSEPR</b> kuralına göre bu elektron bölgeleri birbirini iter ve
    birbirinden olabildiğince uzaklaşır. Molekülün şekli yalnızca atomların konumuyla adlandırılır; ortaklanmamış
    çiftler görünmez ama yer kaplar — bağları biraz sıkıştırır (su: 109,5° yerine 104,5°).</p>
    <p>Pembe ok <b>dipol momentidir</b>: elektronlar daha elektronegatif atoma doğru çekilir; ok negatif (δ−) uca bakar,
    kuyruğundaki çizgi pozitif (δ+) ucu gösterir. Bağ dipolleri simetriyle birbirini sıfırlarsa molekül <b>apolar</b>dır.</p>
    <h3>Dene</h3>
    <ul>
      <li>C seç ve 4 kez <b>+H</b> ekle: metan. Sonra bir H’yi Cl ile değiştir (son atomu çıkar, +Cl) — polarlık değişir mi?</li>
      <li>CO₂ ile SO₂’yi karşılaştır: ikisinde de iki O var; neden biri doğrusal, öteki kırık?</li>
      <li>Xe’ye 2, 4 F ekle: ortaklanmamış çiftler karşılıklı durarak doğrusal ve kare düzlem şekiller oluşturur.</li>
      <li>NH₃ ile NF₃’ün dipol oklarını karşılaştır.</li>
      <li>🎯 Görev bölümünden rastgele bir şekil hedefi al ve o şekli kendin kur.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Molekülün şekli özelliklerini belirler: suyun kırık ve polar olması tuzları çözmesini, yüksek kaynama noktasını ve
    buzun suda yüzmesini açıklar. Doğrusal CO₂ apolardır ama sera gazıdır. İlaç moleküllerinin vücuttaki hedeflere
    “anahtar–kilit” gibi oturması da 3B şekillerine bağlıdır.</p>
    <p><small>Model: Lewis elektron sayımı + VSEPR (AXₙEₘ). Bilinen moleküllerde açı ölçülmüş değere ayarlanır, diğerlerinde
    tahmindir. Dipol, Pauling elektronegatiflik farklarının vektör toplamıyla hesaplanan <b>göreli</b> bir değerdir (Debye değil);
    ölçülmüş değer biliniyorsa ayrıca yazılır. İyonlar, rezonans ve geçiş metalleri kapsam dışıdır; CO’daki üçlü bağ gibi
    özel durumlar çift bağla gösterilir.</small></p>`,
});

// --- Sahne: masada molekül modeli seti (1 birim = 3 cm; kök grup metreye ölçekler) ---
const LOWQ = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
const K = 0.03, FLOOR_U = -4.4;
const root = new THREE.Group();
root.scale.setScalar(K);
root.position.y = -FLOOR_U * K;
sim.scene.add(root);
sim.sky.mesh.position.y = -0.75;
const rnd = (a, b) => a + Math.random() * (b - a);
{
  // Masa: vernikli meşe tabla ve ayaklar (metre)
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.035, 0.9, 3, 0.008), M.wood({ color: 0xa47a4e, varnish: true, scale: 1.2 }));
  top.position.set(0, -0.0175, -0.12);
  sim.scene.add(top);
  for (const [x, z] of [[-0.74, -0.52], [0.74, -0.52], [-0.74, 0.28], [0.74, 0.28]]) {
    const l = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.715, 0.05, 2, 0.008), M.wood({ color: 0x8a6440, varnish: true }));
    l.position.set(x, -0.3925, z);
    sim.scene.add(l);
  }
  // Döner sergi altlığı (molekülün altında), keçe kaplı
  const lathe = (pts, seg = 64) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const base = new THREE.Mesh(lathe([[0, 0], [3.4, 0], [3.5, 0.08], [3.5, 0.32], [3.35, 0.4], [0, 0.4]]), M.wood({ color: 0x3b2a1d, varnish: true, scale: K * 1.5 }));
  base.position.y = FLOOR_U;
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.03, 64), M.fabric({ color: 0x1f3a5a, scale: K * 3 }));
  felt.position.y = FLOOR_U + 0.415;
  root.add(base, felt);
  // Yedek parça kutusu: bölmeli plastik tepsi, içinde renkli atomlar ve bağ çubukları
  const tray = new THREE.Group();
  tray.position.set(-9.5, FLOOR_U, -6);
  tray.rotation.y = 0.35;
  root.add(tray);
  const trayMat = M.plastic({ color: 0xe8ecef, gloss: 0.6 });
  const floorT = new THREE.Mesh(new RoundedBoxGeometry(9, 0.2, 5.4, 3, 0.08), trayMat);
  floorT.position.y = 0.1;
  tray.add(floorT);
  for (const [w, d, x, z] of [[9, 0.14, 0, -2.63], [9, 0.14, 0, 2.63], [0.14, 5.4, -4.43, 0], [0.14, 5.4, 4.43, 0], [0.1, 5.2, -1.5, 0], [0.1, 5.2, 1.5, 0]]) {
    const wall = new THREE.Mesh(new RoundedBoxGeometry(w, 1.1, d, 2, 0.04), trayMat);
    wall.position.set(x, 0.65, z);
    tray.add(wall);
  }
  const bin = [[0xef2b2b, 0.33, -3], [0xf1f5f9, 0.25, 0], [0x3b3f45, 0.36, 3]];
  const sph = new THREE.SphereGeometry(1, 28, 20);
  for (const [c, r, bx] of bin) {
    const n = LOWQ ? 10 : 16;
    const im = new THREE.InstancedMesh(sph, M.plastic({ color: c, gloss: 0.95 }), n);
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const p = new THREE.Vector3(bx + rnd(-1.0, 1.0), 0.2 + r + (i > 9 ? 2 * r * 0.8 : 0), rnd(-2.1, 2.1));
      im.setMatrixAt(i, mt.compose(p, q.setFromEuler(new THREE.Euler(rnd(0, 6), rnd(0, 6), 0)), new THREE.Vector3(r, r, r)));
    }
    tray.add(im);
  }
  // Masada dağınık birkaç bağ çubuğu ve iki atom
  const rodGeo = new THREE.LatheGeometry([[0, -0.5], [0.8, -0.5], [1, -0.44], [1, 0.44], [0.8, 0.5], [0, 0.5]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  const rodMat = M.plastic({ color: 0xd9dde2, gloss: 0.8 });
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(rodGeo, rodMat);
    r.scale.set(0.09, 1.3, 0.09);
    r.rotation.set(Math.PI / 2, 0, rnd(0, 3.14));
    r.position.set(rnd(-6, -3), FLOOR_U + 0.09, rnd(1, 4));
    root.add(r);
  }
  for (const [c, x, z, r] of [[0xef2b2b, 5.5, 3.2, 0.33], [0x3b63f8, 6.4, 1.9, 0.34]]) {
    const a = new THREE.Mesh(sph, M.plastic({ color: c, gloss: 0.95 }));
    a.scale.setScalar(r); a.position.set(x, FLOOR_U + r, z);
    root.add(a);
  }
}

const mol = new THREE.Group();
root.add(mol);

// --- Paylaşılan geometri ve malzemeler ---
const SPHERE = new THREE.SphereGeometry(1, 48, 32);
// Bağ çubuğu: uçları pahlı, y ekseninde 1 birim (ölçek: r, uzunluk, r)
const CYL = new THREE.LatheGeometry([[0, -0.5], [0.78, -0.5], [0.95, -0.485], [1, -0.46], [1, 0.46], [0.95, 0.485], [0.78, 0.5], [0, 0.5]]
  .map(([r, y]) => new THREE.Vector2(r, y)), 24);
const matCache = {};
function mat(el) {
  if (!matCache[el]) {
    const c = ATOMS[el].color;
    const m = M.plastic({ color: c, gloss: 0.95 });
    m.clearcoat = 1; m.clearcoatRoughness = 0.06;
    m.emissive = new THREE.Color(c); m.emissiveIntensity = el === 'C' ? 0.06 : 0.02;
    matCache[el] = m;
  }
  return matCache[el];
}
const lpMat = new THREE.MeshPhysicalMaterial({ color: 0xc4b5fd, transparent: true, opacity: 0.4, roughness: 0.15, clearcoat: 1, depthWrite: false, emissive: 0x6d28d9, emissiveIntensity: 0.45 });
const eMat = M.glow({ color: 0xf5f3ff, intensity: 2.5 });
const arcMat = new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false, transparent: true });
const dipMat = new THREE.MeshBasicMaterial({ color: 0xf472b6, depthTest: false, transparent: true, opacity: 0.95 });

const Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion();

// Merkez atom
const centerMesh = new THREE.Mesh(SPHERE, mat('C'));
mol.add(centerMesh);
const centerLabel = sim.label('C', { parent: centerMesh, className: 'plain big' });

/** Görünüm modu: top-çubuk ya da uzay dolgu */
let spaceFill = false;
const ballR = (el) => (spaceFill ? ATOMS[el].rv * UNIT * 0.7 : 0.2 + 0.3 * ATOMS[el].rc);

// --- Durum ---
let central = 'O';
/** @type {{el:string, order:number, g:THREE.Group, ball:THREE.Mesh, bonds:THREE.Mesh[], label:any, cur:THREE.Vector3, tgt:THREE.Vector3, grow:number, len:number}[]} */
let ligs = [];
/** @type {{g:THREE.Group, lobe:THREE.Mesh, dots:THREE.Mesh[], cur:THREE.Vector3, tgt:THREE.Vector3, grow:number, single:boolean}[]} */
const lps = [];
let A = analyze(central, []);

function makeLigand(el, order) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(SPHERE, mat(el));
  g.add(ball);
  const bonds = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(CYL, mat(i % 2 ? el : central));
    g.add(b);
    bonds.push(b);
  }
  const label = sim.label(el, { parent: ball, className: 'plain' });
  mol.add(g);
  return { el, order, g, ball, bonds, label, cur: new THREE.Vector3(1, 0, 0), tgt: new THREE.Vector3(1, 0, 0), grow: 0, len: 1 };
}
function dropLigand(l) {
  l.label.element.remove();
  l.g.removeFromParent();
}

function makeLP() {
  const g = new THREE.Group();
  const lobe = new THREE.Mesh(SPHERE, lpMat);
  lobe.scale.set(0.3, 0.5, 0.3);
  lobe.renderOrder = 2;
  g.add(lobe);
  const dots = [0, 1].map((i) => {
    const d = new THREE.Mesh(SPHERE, eMat);
    d.scale.setScalar(0.055);
    d.position.x = i ? 0.09 : -0.09;
    g.add(d);
    return d;
  });
  mol.add(g);
  return { g, lobe, dots, cur: new THREE.Vector3(0, 1, 0), tgt: new THREE.Vector3(0, 1, 0), grow: 0, single: false };
}

// Açı yayları (en fazla 2)
const ARC_N = 32;
const arcs = [0, 1].map(() => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((ARC_N + 1) * 3), 3));
  const line = new THREE.Line(geo, arcMat);
  line.renderOrder = 5;
  line.frustumCulled = false;
  mol.add(line);
  const label = sim.label('', { parent: line });
  label.el.style.color = '#fde047';
  return { line, label, i: -1, j: -1 };
});

// Dipol oku
const dip = new THREE.Group();
const dipShaft = new THREE.Mesh(CYL, dipMat);
const dipHead = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.4, 20), dipMat);
const dipCross = new THREE.Mesh(CYL, dipMat);
dipCross.rotation.z = Math.PI / 2;
dipCross.scale.set(0.045, 0.5, 0.045);
dipShaft.renderOrder = dipHead.renderOrder = dipCross.renderOrder = 6;
dip.add(dipShaft, dipHead, dipCross);
const dipLabel = sim.label('μ', { parent: dipHead, position: [0, 0.45, 0] });
dipLabel.el.style.color = '#f9a8d4';
mol.add(dip);

// --- VSEPR konumları ---
const T = Math.acos(-1 / 3); // 109,47°
const tet = (a) => [Math.sin(T) * Math.sin(a), Math.cos(T), Math.sin(T) * Math.cos(a)];
const SLOTS = {
  1: [[1, 0, 0]],
  2: [[1, 0, 0], [-1, 0, 0]],
  3: [[0, 1, 0], [0.866, -0.5, 0], [-0.866, -0.5, 0]],
  4: [[0, 1, 0], tet(0), tet((2 * Math.PI) / 3), tet((4 * Math.PI) / 3)],
  // İki bağ + iki çift: bağlar ekran düzleminde, çiftler ön-arka
  '4b': [[0, 0.5774, 0.8165], [0, 0.5774, -0.8165], [0.8165, -0.5774, 0], [-0.8165, -0.5774, 0]],
  // İlk üçü ekvator (ortaklanmamış çiftler önce buraya), son ikisi eksen
  5: [[-0.5, 0, -0.866], [-0.5, 0, 0.866], [1, 0, 0], [0, 1, 0], [0, -1, 0]],
  6: [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]],
};

/** Hedef yönleri hesapla; ortaklanmamış çiftler/çift bağlar diğer bağları biraz iter. */
function layout() {
  const m = A.nLP + A.unpaired, n = ligs.length, SN = n + m;
  arcs.forEach((a) => (a.i = a.j = -1));
  if (!n) return;
  const slots = (SN === 4 && m === 2 ? SLOTS['4b'] : SLOTS[SN]).map((s) => new THREE.Vector3(...s).normalize());
  lps.forEach((lp, i) => lp.tgt.copy(slots[i]));
  const order = ligs.map((l, i) => i).sort((a, b) => ligs[b].order - ligs[a].order || a - b);
  const base = [];
  order.forEach((li, k) => { base[li] = slots[m + k]; });
  const weights = [...lps.map((lp) => (lp.single ? 0.5 : 1)), ...ligs.map((l) => (l.order === 2 ? 0.35 : 0))];
  const dirs = [...lps.map((lp) => lp.tgt), ...base];
  const apply = (k, out) => {
    for (let i = 0; i < n; i++) {
      const o = out[i].copy(base[i]);
      for (let j = 0; j < dirs.length; j++) if (j !== m + i && weights[j]) o.addScaledVector(dirs[j], -k * weights[j]);
      o.normalize();
    }
    return out;
  };
  const out = base.map(() => new THREE.Vector3());
  const minAng = (arr) => {
    let mn = 180;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) mn = Math.min(mn, arr[i].angleTo(arr[j]) * 57.2958);
    return mn;
  };
  const preset = PRESET_BY_KEY[keyOf(central, ligs)];
  let k = 0.05;
  if (preset?.angle && n >= 2) {
    let lo = -0.6, hi = 1.5;
    for (let it = 0; it < 40; it++) {
      k = (lo + hi) / 2;
      if (minAng(apply(k, out)) > preset.angle) lo = k; else hi = k;
    }
  }
  apply(k, out);
  ligs.forEach((l, i) => l.tgt.copy(out[i]));
  // Gösterilecek açılar: en küçük açı ve ondan belirgin farklı en büyük (<180°) açı
  if (n >= 2) {
    let best = [0, 1, 999], wide = [-1, -1, 0];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const ang = out[i].angleTo(out[j]) * 57.2958;
      if (ang < best[2] - 0.01) best = [i, j, ang];
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const ang = out[i].angleTo(out[j]) * 57.2958;
      if (ang < 179 && ang > best[2] + 4 && ang > wide[2]) wide = [i, j, ang];
    }
    [arcs[0].i, arcs[0].j] = best;
    if (wide[0] >= 0) [arcs[1].i, arcs[1].j] = wide;
  }
}

// --- Molekülü yeniden kur ---
function rebuild() {
  A = analyze(central, ligs);
  const c = ATOMS[central];
  centerMesh.material = mat(central);
  centerMesh.scale.setScalar(ballR(central));
  const m = ligs.length ? A.nLP + A.unpaired : 0;
  while (lps.length < m) lps.push(makeLP());
  while (lps.length > m) lps.pop().g.removeFromParent();
  lps.forEach((lp, i) => {
    lp.single = i >= A.nLP;
    lp.dots[1].visible = !lp.single;
    lp.dots[0].position.x = lp.single ? 0 : -0.09;
    const r = ballR(central);
    lp.lobe.position.y = r + 0.3;
    lp.lobe.scale.set(lp.single ? 0.22 : 0.3, lp.single ? 0.36 : 0.5, lp.single ? 0.22 : 0.3);
    lp.dots.forEach((d) => (d.position.y = r + 0.5));
  });
  ligs.forEach((l) => {
    l.len = (c.rc + ATOMS[l.el].rc) * UNIT * (l.order === 2 ? 0.88 : 1);
    l.ball.scale.setScalar(ballR(l.el));
    l.bonds.forEach((b, i) => { b.material = mat(i % 2 ? l.el : central); b.visible = !spaceFill && (i < 2 || l.order === 2); });
  });
  layout();
  // Molekül ekrana sığsın: kapsayan yarıçapa göre ölçek
  let R = ballR(central) + (lps.length && ligs.length ? ballR(central) + 0.6 : 0);
  for (const l of ligs) R = Math.max(R, l.len + ballR(l.el));
  fitScale = clamp(2.9 / R, 0.75, 1.7);
  // Yeni eklenenler hedef yönde doğar
  for (const o of [...ligs, ...lps]) if (o.grow === 0) o.cur.copy(o.tgt);
  updateLabels();
  updatePanel();
  checkTask();
}

function addLigand(el, order, quiet = false) {
  const err = canAdd(central, ligs, { el, order });
  if (err) { if (!quiet) sim.toast(err, 'bad'); return false; }
  ligs.push(makeLigand(el, order));
  rebuild();
  return true;
}
function removeLast() {
  const l = ligs.pop();
  if (!l) return;
  dropLigand(l);
  rebuild();
}
function clearAll() {
  ligs.forEach(dropLigand);
  ligs = [];
  rebuild();
}
function setCentral(el, keep = true) {
  const old = ligs.map((l) => [l.el, l.order]);
  clearAll();
  central = el;
  centerLabel.setText(el);
  let dropped = 0;
  if (keep) for (const [e, o] of old) if (!addLigand(e, o, true)) dropped++;
  rebuild();
  if (dropped) sim.toast(`${ATOMS[el].name} ${dropped} atomu taşıyamadı; çıkarıldı.`, 'warn');
}
function loadPreset(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  clearAll();
  central = p.c;
  centerLabel.setText(p.c);
  centerSeg.set(p.c);
  for (const l of p.l) ligs.push(makeLigand(l.el, l.order));
  rebuild();
}

// --- Dipol ---
const mu = new THREE.Vector3();
function dipole(out, final = false) {
  out.set(0, 0, 0);
  const en = ATOMS[central].en;
  for (const l of ligs) out.addScaledVector(final ? l.tgt : l.cur, (ATOMS[l.el].en - en) * (final ? 1 : Math.min(l.grow * 2, 1)));
  if (ligs.length >= 2) for (const lp of lps) out.addScaledVector(final ? lp.tgt : lp.cur, LP_W * (lp.single ? 0.5 : 1));
  return out;
}

function updateLabels() {
  const en = ATOMS[central].en;
  let s = 0;
  ligs.forEach((l) => {
    const d = ATOMS[l.el].en - en;
    s += d;
    const ch = !showCharges.value || Math.abs(d) < 0.05 ? '' : `<sup style="color:${d > 0 ? '#f9a8d4' : '#7dd3fc'}"> δ${d > 0 ? '−' : '+'}</sup>`;
    l.label.setText(l.el + ch);
  });
  const ch = !showCharges.value || Math.abs(s) < 0.05 || !ligs.length ? '' : `<sup style="color:${s < 0 ? '#f9a8d4' : '#7dd3fc'}"> δ${s < 0 ? '−' : '+'}</sup>`;
  centerLabel.setText(central + ch);
}

// --- Animasyon ---
function placeBond(mesh, dir, a, b, off, r) {
  mesh.position.copy(dir).multiplyScalar((a + b) / 2).add(off);
  mesh.quaternion.setFromUnitVectors(Y, dir);
  mesh.scale.set(r, Math.max(b - a, 0.001), r);
}
const _off = new THREE.Vector3(), _zero = new THREE.Vector3();
function setArc(arc, a, b, radius) {
  const arr = arc.line.geometry.attributes.position.array;
  const th = a.angleTo(b);
  if (th > 3.12) { _p.crossVectors(a, Math.abs(a.y) < 0.9 ? Y : _off.set(1, 0, 0)).normalize(); }
  for (let s = 0; s <= ARC_N; s++) {
    const t = s / ARC_N;
    if (th > 3.12) _v.copy(a).multiplyScalar(Math.cos(t * Math.PI)).addScaledVector(_p, Math.sin(t * Math.PI));
    else _v.copy(a).multiplyScalar(Math.sin((1 - t) * th)).addScaledVector(b, Math.sin(t * th)).divideScalar(Math.sin(th) || 1);
    _v.multiplyScalar(radius);
    arr[s * 3] = _v.x; arr[s * 3 + 1] = _v.y; arr[s * 3 + 2] = _v.z;
  }
  arc.line.geometry.attributes.position.needsUpdate = true;
  const mid = ARC_N / 2;
  arc.label.position.set(arr[mid * 3] * 1.3, arr[mid * 3 + 1] * 1.3, arr[mid * 3 + 2] * 1.3);
  arc.label.setText(`${fmt(th * 57.2958, 1)}°`);
}

let fitScale = 1;
sim.onUpdate((dt) => { if (autoRot.value) mol.rotation.y += dt * 0.35; });

sim.onRender((dt) => {
  const f = 1 - Math.exp(-dt * 6);
  const rc = ballR(central);
  mol.scale.setScalar(mol.scale.x + (fitScale - mol.scale.x) * f);
  for (const o of lps) {
    o.cur.lerp(o.tgt, f);
    if (o.cur.lengthSq() < 1e-6) o.cur.set(0.01, 1, 0.01);
    o.cur.normalize();
    o.grow = Math.min(1, o.grow + dt * 2.5);
    o.g.quaternion.setFromUnitVectors(Y, o.cur);
    o.g.scale.setScalar(o.grow);
    o.g.visible = showLP.value;
  }
  for (const l of ligs) {
    l.cur.lerp(l.tgt, f);
    if (l.cur.lengthSq() < 1e-6) l.cur.set(0.01, 1, 0.01);
    l.cur.normalize();
    l.grow = Math.min(1, l.grow + dt * 2.2);
    const e = 1 - Math.pow(1 - l.grow, 3);
    const d = l.len * (1 + (1 - e) * 1.4);
    l.ball.position.copy(l.cur).multiplyScalar(d);
    l.ball.scale.setScalar(ballR(l.el) * (0.3 + 0.7 * e));
    if (spaceFill) continue;
    const half = (rc * 0.5 + d) / 2;
    if (l.order === 2) {
      _off.crossVectors(l.cur, Math.abs(l.cur.z) < 0.9 ? _w.set(0, 0, 1) : _w.set(1, 0, 0)).normalize().multiplyScalar(0.1);
      placeBond(l.bonds[0], l.cur, 0, half, _off, 0.055);
      placeBond(l.bonds[1], l.cur, half, d, _off, 0.055);
      _off.negate();
      placeBond(l.bonds[2], l.cur, 0, half, _off, 0.055);
      placeBond(l.bonds[3], l.cur, half, d, _off, 0.055);
    } else {
      placeBond(l.bonds[0], l.cur, 0, half, _zero, 0.085);
      placeBond(l.bonds[1], l.cur, half, d, _zero, 0.085);
    }
  }
  // Açı yayları
  for (const a of arcs) {
    const on = a.i >= 0 && a.j < ligs.length && showAngles.value;
    a.line.visible = on;
    a.label.visible = on;
    if (on) setArc(a, ligs[a.i].cur, ligs[a.j].cur, Math.min(ligs[a.i].len, ligs[a.j].len) * 0.55);
  }
  // Dipol oku (negatif uca doğru)
  dipole(mu);
  const mag = mu.length();
  dip.visible = showDipole.value && ligs.length > 0 && mag > 0.08;
  if (dip.visible) {
    const L = clamp(1.4 + mag * 1.1, 1.6, 4.2);
    _v.copy(mu).divideScalar(mag);
    dip.quaternion.setFromUnitVectors(Y, _v);
    dipShaft.scale.set(0.055, L - 0.4, 0.055);
    dipShaft.position.y = -0.2;
    dipHead.position.y = L / 2 - 0.2;
    dipCross.position.y = -L / 2 + 0.3;
  }
});

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır moleküller');
const presetSel = ui.select({
  options: [{ value: '', label: '— bir molekül seç —' }, ...PRESETS.map((p) => ({ value: p.id, label: `${formulaOf(p)} · ${p.name}` }))],
  value: '', onChange: (v) => loadPreset(v),
});
function formulaOf(p) { return formula(p.c, p.l); }

ui.section('1 · Merkez atom');
const centerSeg = ui.segmented({ options: CENTRALS, value: central, onChange: (v) => { presetSel.value = ''; setCentral(v); } });
ui.text('Merkez atom değişince takılı atomlar mümkünse korunur.', '');

ui.section('2 · Atom tak');
const ligBtns = ui.buttons(LIGANDS.map((L) => ({
  label: L.order === 2 ? '+ =O' : `+ ${L.el}`,
  title: L.order === 2 ? 'Oksijen (çift bağ)' : ATOMS[L.el].name,
  onClick: () => { presetSel.value = ''; addLigand(L.el, L.order); },
})));
ligBtns.forEach((b, i) => { b.style.borderBottom = `3px solid ${hex(ATOMS[LIGANDS[i].el].color)}`; b.style.minWidth = '64px'; });
ui.buttons([
  { label: '↩ Son atomu çıkar', onClick: () => { presetSel.value = ''; removeLast(); } },
  { label: '🗑 Hepsini sök', variant: 'danger', onClick: () => { presetSel.value = ''; clearAll(); } },
]);

ui.section('Sonuç');
const card = ui.text('', 'card');
const stBonds = ui.stat({ label: 'Bağlı atom' });
const stLP = ui.stat({ label: 'Ortaklanmamış çift' });
const stAngle = ui.stat({ label: 'Bağ açısı (model)' });
const stMu = ui.stat({ label: 'Dipol (göreli)' });
const status = ui.text('', 'card');
const fact = ui.text('', '');

ui.section('Görünüm');
ui.segmented({ options: [{ value: 'ball', label: 'Top-çubuk' }, { value: 'fill', label: 'Uzay dolgu' }], value: 'ball',
  onChange: (v) => { spaceFill = v === 'fill'; rebuild(); } });
const showLP = ui.toggle({ label: 'Ortaklanmamış çiftler', value: true });
const showAngles = ui.toggle({ label: 'Bağ açıları', value: true });
const showDipole = ui.toggle({ label: 'Dipol oku', value: true });
const showCharges = ui.toggle({ label: 'Kısmi yükler (δ+ / δ−)', value: false, onChange: () => updateLabels() });
const autoRot = ui.toggle({ label: 'Kendiliğinden dön', value: true });

ui.section('🎯 Görev');
const TASKS = [
  ...GEOMETRIES.map((g) => ({ text: `<b>${g}</b> bir molekül kur.`, test: (a) => a.geo === g })),
  { text: '<b>Polar bağları olan ama apolar</b> bir molekül kur.', test: (a, m) => m < 0.08 && ligs.some((l) => Math.abs(ATOMS[l.el].en - ATOMS[central].en) >= 0.4) },
  { text: '<b>Ortaklanmamış çifti olan ama apolar</b> bir molekül kur.', test: (a, m) => m < 0.08 && a.nLP > 0 && a.n >= 2 },
  { text: '<b>Genişlemiş oktetli</b> (merkezde 8’den fazla elektron) bir molekül kur.', test: (a) => a.around > 8 },
];
let task = null, score = 0;
const taskText = ui.text('Rastgele bir hedef al; kararlı bir molekülle o hedefi sağla.', 'card');
ui.button({ label: '🎲 Yeni görev', variant: 'primary', onClick: () => {
  let t;
  do t = pick(TASKS); while (t === task && TASKS.length > 1);
  task = t;
  taskText.set(`${task.text}<br><small>Puan: ${score}</small>`);
  checkTask(true);
} });
function checkTask(fresh = false) {
  if (!task || !A.stable) return;
  if (task.test(A, dipole(_w, true).length())) {
    if (fresh) { taskText.set(`${task.text}<br><small>Bu zaten sağlanıyor — başka bir molekül kurmayı dene! Puan: ${score}</small>`); return; }
    score++;
    sim.toast(`🎉 Görev tamam! ${formula(central, ligs)} · ${A.geo}`, 'good');
    taskText.set(`✓ ${task.text}<br><small>Puan: ${score} · yeni görev al</small>`);
    task = null;
  }
}

function updatePanel() {
  const c = ATOMS[central];
  const f = formula(central, ligs);
  const p = PRESET_BY_KEY[keyOf(central, ligs)];
  const n = ligs.length, m = A.nLP + A.unpaired;
  const axe = n ? `AX${sub(n)}${m ? 'E' + sub(m) : ''}` : '—';
  const m0 = dipole(_w, true).length();
  const polar = n === 0 ? '' : m0 < 0.08 ? '<b style="color:#4ade80">APOLAR</b>' : '<b style="color:#f472b6">POLAR</b>';
  // Bağ türleri
  const kinds = [...new Set(ligs.map((l) => l.el + '|' + l.order))].map((k) => {
    const [el, o] = k.split('|');
    const d = ATOMS[el].en - c.en;
    return `${central}${o === '2' ? '=' : '–'}${el}: ΔEN ${fmt(Math.abs(d), 2)} → ${bondType(d)}`;
  });
  card.set(`
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
      <span style="font-size:26px;font-weight:800;color:var(--text)">${n ? f : central}</span>
      <span>${p ? `<b>${p.name}</b>` : n ? 'özel molekül' : ''}</span></div>
    <div>VSEPR: <b>${axe}</b> · elektron düzeni: <b>${n ? A.egeo : '—'}</b></div>
    <div style="font-size:16px;margin:4px 0">Şekil: <b style="color:var(--accent)">${n ? A.geo : '—'}</b></div>
    <div>İdeal açı: <b>${n > 1 ? A.ideal : '—'}</b>${p?.realText ? `<br>${p.realText}` : ''}</div>
    <div>Değerlik e⁻: <b>${c.v}</b> · bağlarda: <b>${A.BO}</b> · ortaklanmamış: <b>${A.nLP}</b> çift</div>
    ${n ? `<div style="margin-top:4px">Polarlık: ${polar}${p && p.mu != null ? ` <small>(ölçülen μ = ${fmt(p.mu, 2)} D)</small>` : ''}</div>` : ''}
    ${kinds.length ? `<div style="margin-top:4px;font-size:12px">${kinds.join('<br>')}</div>` : ''}`);
  stBonds.set(n);
  stLP.set(A.nLP, A.nLP ? 'warn' : '');
  let ang = '—';
  if (arcs[0].i >= 0) ang = fmt(ligs[arcs[0].i].tgt.angleTo(ligs[arcs[0].j].tgt) * 57.2958, 1) + '°';
  stAngle.set(ang);
  stMu.set(n ? fmt(m0, 2) : '—', n ? (m0 < 0.08 ? 'good' : 'bad') : '');
  status.set(A.status);
  status.el.className = 'ctl-text card ' + (A.stable ? 'good' : n ? 'warn' : '');
  fact.set(p ? `<b>Gerçek hayatta:</b> ${p.fact}` : '');
}

// Atoma tıkla → bilgi
sim.onClick(() => [centerMesh, ...ligs.map((l) => l.ball)], (hit) => {
  const c = ATOMS[central];
  if (hit.object === centerMesh) {
    sim.toast(`<b>${c.name} (${c.sym})</b> · ${c.p}. periyot · değerlik e⁻ ${c.v} · EN ${fmt(c.en, 2)}`);
    return;
  }
  const l = ligs.find((x) => x.ball === hit.object);
  if (!l) return;
  const a = ATOMS[l.el], d = a.en - c.en;
  sim.toast(`<b>${a.name} (${a.sym})</b> · EN ${fmt(a.en, 2)} · ${central}${l.order === 2 ? '=' : '–'}${l.el} bağı: ΔEN ${fmt(Math.abs(d), 2)} → ${bondType(d)}${Math.abs(d) >= 0.05 ? `; elektronlar ${d > 0 ? a.name : c.name} tarafına çekilir` : ''}`);
});

sim.onReset(() => {
  presetSel.value = 'H2O';
  loadPreset('H2O');
  mol.rotation.set(0, 0, 0);
  task = null;
  taskText.set(`Rastgele bir hedef al; kararlı bir molekülle o hedefi sağla.<br><small>Puan: ${score}</small>`);
});
presetSel.value = 'H2O';
loadPreset('H2O');

// Ölçekli gruplar: prosedürel kabartma gücü görünüm (dünya) birimindedir → nesnenin dünya ölçeğine uyarlanır (benekli görünüm olmasın)
{
  const done = new WeakSet(), ws = new THREE.Vector3();
  const fixBump = () => sim.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      const u = m.userData?.uniforms?.pBump;
      if (!u || done.has(m)) continue;
      done.add(m);
      o.getWorldScale(ws);
      u.value *= Math.max(ws.x, 1e-4) < 0.999 ? ws.x : 1;
    }
  });
  let nb = 0;
  sim.onRender(() => { if (nb++ % 30 === 0) fixBump(); });
}
