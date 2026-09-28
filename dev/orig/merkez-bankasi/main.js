// Merkez Bankası: Faiz ve Enflasyon — IS + Phillips + Taylor kuralı, beklentiler, politika gecikmesi ve Okun yasası; 3B kent metaforu.
import { createSim, THREE, fmt, clamp, lerp, heatColor, instanced, textTexture } from '@core';
import { createEconomy } from './model.js';

const Q_SEC = 1.2; // 1× hızda bir çeyrek kaç saniye

const sim = createSim({
  background: 0x0c1526,
  camera: { position: [-0.6, 15, 27], target: [-0.6, 2.4, -0.5], fov: 47 },
  controls: { maxDistance: 60, minDistance: 8 },
  fog: [45, 90],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Küçük bir ekonomi. Soldaki <b>merkez bankası</b>nın kadranı politika faizini gösterir. Ortadaki <b>termometre</b> yıllık
    enflasyondur (beyaz halka: hedef, mor koni: beklenen enflasyon). Sağdaki <b>fabrikalar</b> üretimi temsil eder: çıktı açığı
    pozitifken bacalar yoğun tüter ve pencereler parlar. Öndeki <b>kuyruk</b> iş arayanlardır (işsizlik oranı).
    Bankadan fabrikalara giden borudaki ışıklar faiz kararının <b>parasal aktarımı</b>dır: mavi = sıkı (reel faiz nötrün üstünde),
    turuncu = gevşek. Bir kararın ekonomiye ulaşması birkaç çeyrek sürer.</p>
    <h3>Model</h3>
    <ul>
      <li><b>Fisher:</b> reel faiz r = i − πᵉ (nominal politika faizi − beklenen enflasyon). Talebi belirleyen nominal değil reel faizdir.</li>
      <li><b>IS eğrisi:</b> yₜ = ρ·yₜ₋₁ − a·(rₜ₋ₗ − r*) + talep şoku. Reel faiz nötr faizin (r*) üstündeyse çıktı açığı küçülür; L çeyrek gecikmeyle.</li>
      <li><b>Phillips eğrisi:</b> πₜ = πᵉₜ + κ·yₜ + arz şoku. Ekonomi ısınırsa enflasyon beklentinin üstüne çıkar.</li>
      <li><b>Beklentiler:</b> πᵉ = c·π* + (1 − c)·πₜ₋₁. c = güvenilirlik: 1'e yakınsa beklentiler hedefe çıpalıdır, 0'a yakınsa geçmiş enflasyonu izler.</li>
      <li><b>Taylor kuralı</b> (Taylor, 1993): i = r* + π + φπ·(π − π*) + φy·y. Taylor'ın özgün önerisi φπ = φy = 0,5 ve r* = π* = %2'dir.
      Enflasyon 1 puan artınca nominal faiz 1'den fazla (1 + φπ) artmalıdır ki reel faiz yükselsin (<i>Taylor ilkesi</i>).</li>
      <li><b>Okun yasası:</b> işsizlik u = u* − y / β (burada β = 2: çıktı açığındaki 2 puanlık düşüş işsizliği yaklaşık 1 puan artırır).</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li><b>Enerji şoku</b> ver, önce güvenilirliği 0,9 sonra 0,1 yap: çıpalı beklentilerde enflasyon kısa sürede geri döner; çıpasız beklentilerde kalıcılaşır ve daha pahalı bir durgunluk gerekir.</li>
      <li><b>Faizi sabit tutan banka</b> senaryosu: talep patlarken faiz sabit kalırsa enflasyon yükselir, reel faiz düşer ve ekonomi daha da ısınır.</li>
      <li>Taylor kuralında φπ'yi negatife çek (faiz enflasyondan az artsın) ve güvenilirliği düşür: enflasyon kontrolden çıkar.</li>
      <li><b>Yüksek enflasyondan dönüş</b>: gecikme ve güvenilirlik değiştikçe dezenflasyonun maliyeti (işsizlik) nasıl değişiyor?</li>
      <li>Manuel modda faizi aniden artır; enflasyonun hemen değil birkaç çeyrek sonra düştüğünü izle.</li>
    </ul>
    <h3>Sınırlar</h3>
    <p><small>Tüm katsayılar (a, κ, ρ, gecikme, geçişkenlik, u*, r*) <b>temsilîdir</b>; belirli bir ülkeye göre kalibre edilmemiştir.
    Gerçek ekonomilerde beklentiler ileriye dönük de oluşur, maliye politikası, kredi kanalları, dış ticaret, finansal istikrar ve
    belirsizlik de rol oynar. Model tahmin aracı değil, sezgi kazandırmak için bir öğretim modelidir.</small></p>`,
});

// --- Model ---
const P = {
  target: 2, rStar: 2, uStar: 5, okun: 2, phiPi: 0.5, phiY: 0.5, smooth: 0.5, rule: true, manual: 4,
  cred: 0.6, lag: 2, rhoY: 0.8, a: 0.25, kappa: 0.2, passThru: 0.3, shockSize: 1,
};
const eco = createEconomy(P);
sim.formatTime = () => `${Math.floor(eco.q / 4) + 1}. yıl · ${(eco.q % 4) + 1}. çeyrek`;

// --- Zemin ve yollar ---
const dummy = new THREE.Object3D();
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ color: 0x17222f }));
  ground.rotation.x = -Math.PI / 2;
  sim.scene.add(ground);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(32, 0.3, 17), new THREE.MeshLambertMaterial({ color: 0x223246 }));
  plate.position.set(0.5, -0.15, -0.5);
  sim.scene.add(plate);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(32, 1.6).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x323c4c }));
  road.position.set(0.5, 0.02, 2.6);
  sim.scene.add(road);
  // uzak silüet
  const n = 40, city = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x131c2a }), n);
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    dummy.position.set(-40 + r() * 80, 0, -24 - r() * 12);
    dummy.scale.set(1.5 + r() * 2.5, 2 + r() * 9, 1.5 + r() * 2);
    dummy.updateMatrix();
    city.setMatrixAt(i, dummy.matrix);
  }
  sim.scene.add(city);
}

// --- Merkez bankası binası ve faiz kadranı ---
const BANK = new THREE.Vector3(-10.5, 0, -2.2);
const DIAL_MAX = 50;
const dialAngle = (i) => -Math.PI * 0.75 + Math.PI * 1.5 * Math.sqrt(clamp(i, 0, DIAL_MAX) / DIAL_MAX);
let needle;
{
  const stone = new THREE.MeshLambertMaterial({ color: 0xd6d3c9 });
  const g = new THREE.Group();
  g.position.copy(BANK);
  const steps = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.5, 4.4), stone);
  steps.position.y = 0.25;
  const body = new THREE.Mesh(new THREE.BoxGeometry(5.2, 3, 3), new THREE.MeshLambertMaterial({ color: 0xbdb8aa }));
  body.position.set(0, 2, -0.5);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 3.9), stone);
  slab.position.set(0, 3.7, 0);
  const tri = new THREE.Shape([new THREE.Vector2(-3, 0), new THREE.Vector2(3, 0), new THREE.Vector2(0, 1)]);
  const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 3.9, bevelEnabled: false }).translate(0, 0, -1.95), stone);
  ped.position.set(0, 3.87, 0);
  g.add(steps, body, slab, ped);
  const colGeo = new THREE.CylinderGeometry(0.18, 0.2, 3, 12);
  for (let k = 0; k < 6; k++) {
    const c = new THREE.Mesh(colGeo, stone);
    c.position.set(-2.5 + k, 2, 1.55);
    g.add(c);
  }
  // Kadran (arka kulede)
  const tower = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3, 0.6), new THREE.MeshLambertMaterial({ color: 0x9c9788 }));
  tower.position.set(0, 6.6, -1.2);
  g.add(tower);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  x.fillStyle = '#f8fafc'; x.beginPath(); x.arc(128, 128, 124, 0, Math.PI * 2); x.fill();
  x.lineWidth = 10; x.strokeStyle = '#1e293b'; x.stroke();
  x.fillStyle = '#0f172a'; x.font = 'bold 26px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const v of [0, 2, 5, 10, 20, 35, 50]) {
    const a = dialAngle(v) - Math.PI / 2;
    x.save(); x.translate(128, 128); x.rotate(a + Math.PI / 2);
    x.fillRect(-3, -118, 6, 18); x.restore();
    x.fillText(String(v), 128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80);
  }
  x.font = 'bold 22px system-ui'; x.fillText('% FAİZ', 128, 190);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(1.15, 48), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.set(0, 6.9, -0.88);
  g.add(face);
  needle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.04).translate(0, 0.42, 0), new THREE.MeshBasicMaterial({ color: 0xdc2626 }));
  needle.position.set(0, 6.9, -0.84);
  g.add(needle);
  sim.scene.add(g);
}
const bankLbl = sim.label('', { position: [BANK.x, 9.1, BANK.z - 1] });

// --- Enflasyon termometresi ---
const TH = new THREE.Vector3(-3.2, 0, -3.2);
const TUBE_H = 8.5;
const piToH = (pi) => TUBE_H * Math.sqrt(clamp(pi + 4, 0, 64) / 64);
let liquid, targetRing, expCone;
{
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.6, 24), new THREE.MeshLambertMaterial({ color: 0x475569 }));
  base.position.set(TH.x, 0.3, TH.z);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, TUBE_H, 24, 1, true),
    new THREE.MeshLambertMaterial({ color: 0xbfdbfe, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  glass.position.set(TH.x, 0.6 + TUBE_H / 2, TH.z);
  liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 1, 20).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0xef4444, emissive: 0x330000 }));
  liquid.position.set(TH.x, 0.6, TH.z);
  targetRing = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  targetRing.position.set(TH.x, 0.6 + piToH(2), TH.z);
  expCone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.5, 12).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc084fc }));
  sim.scene.add(base, glass, liquid, targetRing, expCone);
  // ölçek çizgileri
  for (const v of [0, 5, 10, 20, 40]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x94a3b8 }));
    t.position.set(TH.x - 0.8, 0.6 + piToH(v), TH.z);
    sim.scene.add(t);
    sim.label(`%${v}`, { position: [TH.x - 1.45, 0.6 + piToH(v), TH.z], className: 'plain' });
  }
}
const piLbl = sim.label('', { position: [TH.x + 0.6, TUBE_H + 2.4, TH.z] });

// --- Fabrikalar ve duman ---
const FACT = [[3.5, -4.2], [7.2, -4.6], [10.9, -4.2], [8.8, -0.9]];
const CHIMNEYS = [];
const windowMats = [];
{
  const wall = new THREE.MeshLambertMaterial({ color: 0x8b7d6b });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5b6472 });
  const chim = new THREE.MeshLambertMaterial({ color: 0x7c2d12 });
  FACT.forEach(([fx, fz], k) => {
    const g = new THREE.Group();
    g.position.set(fx, 0, fz);
    const b = new THREE.Mesh(new THREE.BoxGeometry(3, 1.8, 2.2).translate(0, 0.9, 0), wall);
    g.add(b);
    for (let j = 0; j < 3; j++) {
      const saw = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 2.2, 3).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), roofMat);
      saw.position.set(-1 + j, 2.05, 0);
      saw.scale.set(1, 0.9, 1);
      g.add(saw);
    }
    const wm = new THREE.MeshBasicMaterial({ color: 0x334155 });
    windowMats.push(wm);
    for (let j = 0; j < 4; j++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.4), wm);
      w.position.set(-1.1 + j * 0.73, 1, 1.11);
      g.add(w);
    }
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 3, 10).translate(0, 1.5, 0), chim);
    c.position.set(1.1, 0, -0.6);
    g.add(c);
    CHIMNEYS.push(new THREE.Vector3(fx + 1.1, 3.1, fz - 0.6));
    sim.scene.add(g);
  });
}
const outLbl = sim.label('', { position: [9.4, 6.2, -4.4] });
const SMOKE = 90;
const smoke = instanced(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshLambertMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.55, depthWrite: false }), SMOKE);
smoke.frustumCulled = false;
sim.scene.add(smoke);
const puffs = Array.from({ length: SMOKE }, () => ({ life: -1, x: 0, y: 0, z: 0, age: 0, c: 0 }));
let smokeAcc = 0;

// --- İşsizlik kuyruğu ---
const Q_MAX = 60;
const queue = instanced(new THREE.CapsuleGeometry(0.16, 0.42, 3, 8).translate(0, 0.38, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), Q_MAX);
queue.frustumCulled = false;
sim.scene.add(queue);
const qPos = [];
for (let k = 0; k < Q_MAX; k++) {
  const row = Math.floor(k / 20), col = k % 20;
  qPos.push([-9.3 + col * 0.72 + (row % 2) * 0.35, 4.6 + row * 0.7]);
}
{
  const tmpC = new THREE.Color();
  const PAL = [0xfca5a5, 0x93c5fd, 0xfde68a, 0x86efac, 0xc4b5fd, 0xfdba74];
  for (let k = 0; k < Q_MAX; k++) queue.setColorAt(k, tmpC.setHex(PAL[(k * 7) % PAL.length]));
  const office = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 1.6).translate(0, 0.8, 0), new THREE.MeshLambertMaterial({ color: 0x64748b }));
  office.position.set(-10.9, 0, 5.2);
  sim.scene.add(office);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.5), new THREE.MeshBasicMaterial({ map: textTexture('İŞ ARAYANLAR', { size: 40, bg: '#1e3a8a' }) }));
  sign.position.set(-10.9, 1.35, 6.01);
  sim.scene.add(sign);
}
const uLbl = sim.label('', { position: [-2.2, 1.9, 5.2] });
let qShown = 0;

// --- Parasal aktarım borusu ---
const pipeCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-7.6, 1.4, -1.6), new THREE.Vector3(-4, 3.2, 0.2), new THREE.Vector3(0.5, 2.6, 0.6),
  new THREE.Vector3(4.5, 2.2, -0.6), new THREE.Vector3(7.2, 1.6, -2.4),
]);
{
  const tube = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve, 64, 0.22, 10, false),
    new THREE.MeshLambertMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.22, depthWrite: false }));
  sim.scene.add(tube);
}
const pipeLbl = sim.label('', { position: [2.2, 3.4, 0.4], className: 'plain' });
const PULSES = 16;
const pulseMesh = instanced(new THREE.SphereGeometry(0.26, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), PULSES);
pulseMesh.frustumCulled = false;
sim.scene.add(pulseMesh);
const pulses = Array.from({ length: PULSES }, () => ({ on: false, born: 0, col: new THREE.Color() }));
let pulseIdx = 0;
const TIGHT = new THREE.Color(0x3b82f6), LOOSE = new THREE.Color(0xf97316), NEUTRAL = new THREE.Color(0xe5e7eb);

// --- Zaman adımı ---
let acc = 0, qTime = 0;
function stepQuarter() {
  eco.step();
  const gap = eco.r - P.rStar;
  const p = pulses[pulseIdx++ % PULSES];
  p.on = true; p.born = eco.q;
  p.col.copy(NEUTRAL).lerp(gap > 0 ? TIGHT : LOOSE, clamp(Math.abs(gap) / 4, 0, 1));
  pushCharts();
  updateStats();
}

sim.onUpdate((dt) => {
  acc += dt;
  while (acc >= Q_SEC) { acc -= Q_SEC; stepQuarter(); }
  qTime = acc / Q_SEC;
});

const _c = new THREE.Color(), _v = new THREE.Vector3();
let disp = { i: eco.i, pi: eco.pi, pie: eco.pie, y: 0 };
sim.onRender((dt) => {
  const k = 1 - Math.exp(-dt * 4);
  disp.i = lerp(disp.i, eco.i, k); disp.pi = lerp(disp.pi, eco.pi, k); disp.pie = lerp(disp.pie, eco.pie, k); disp.y = lerp(disp.y, eco.y, k);
  needle.rotation.z = -dialAngle(disp.i);
  // termometre
  const h = Math.max(0.05, piToH(disp.pi));
  liquid.scale.y = h;
  liquid.material.color.copy(heatColor(clamp(0.35 + (disp.pi - P.target) / 16, 0, 1), _c));
  targetRing.position.y = 0.6 + piToH(P.target);
  expCone.position.set(TH.x + 0.95, 0.6 + piToH(disp.pie), TH.z);
  // fabrikalar
  const util = clamp(0.5 + disp.y / 10, 0.05, 1);
  windowMats.forEach((m, j) => m.color.setHex(util > (j + 0.5) / FACT.length * 0.9 ? 0xfde047 : 0x334155));
  smokeAcc += dt * util * 22;
  while (smokeAcc > 1) {
    smokeAcc -= 1;
    const p = puffs.find((q) => q.life < 0);
    if (!p) break;
    const c = CHIMNEYS[Math.floor(Math.random() * CHIMNEYS.length)];
    Object.assign(p, { life: 1, age: 0, x: c.x, y: c.y, z: c.z });
  }
  puffs.forEach((p, j) => {
    if (p.life >= 0) {
      p.age += dt;
      p.y += dt * 1.1; p.x += dt * 0.35; p.life = 1 - p.age / 3.2;
    }
    const s = p.life >= 0 ? 0.5 + p.age * 0.6 : 0;
    dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(s); dummy.updateMatrix();
    smoke.setMatrixAt(j, dummy.matrix);
  });
  smoke.instanceMatrix.needsUpdate = true;
  // kuyruk
  const want = clamp(Math.round(eco.u * 3), 0, Q_MAX);
  if (want !== qShown) {
    qShown = want;
    for (let j = 0; j < Q_MAX; j++) {
      const [x, z] = qPos[j];
      dummy.position.set(x, 0, z); dummy.scale.setScalar(j < want ? 1 : 0); dummy.updateMatrix();
      queue.setMatrixAt(j, dummy.matrix);
    }
    queue.instanceMatrix.needsUpdate = true;
  }
  // aktarım darbeleri: L çeyrekte bankadan fabrikalara ulaşır
  pulses.forEach((p, j) => {
    let s = 0;
    if (p.on) {
      const t = (eco.q - p.born + qTime) / Math.max(1, P.lag);
      if (t > 1.05) p.on = false;
      else { pipeCurve.getPointAt(clamp(t, 0, 1), _v); s = 1; }
    }
    dummy.position.copy(_v); dummy.scale.setScalar(s); dummy.updateMatrix();
    pulseMesh.setMatrixAt(j, dummy.matrix);
    pulseMesh.setColorAt(j, p.col);
  });
  pulseMesh.instanceMatrix.needsUpdate = true;
  if (pulseMesh.instanceColor) pulseMesh.instanceColor.needsUpdate = true;
});

// --- Arayüz ---
const ui = sim.ui;
const pct = (v, d = 1) => `%${fmt(v, d)}`;

ui.section('Hazır senaryolar');
const PRESETS = {
  sakin: { label: '🌤 Sakin denge', set: {}, run: () => {} },
  petrol: { label: '⛽ Enerji şoku', set: {}, run: () => shock('enerji') },
  talep: { label: '🛍 Talep patlaması', set: {}, run: () => shock('talep') },
  sabit: { label: '📌 Faizi sabit tutan banka', set: { rule: false, manual: 4, cred: 0.25 }, run: () => shock('talep') },
  yuksek: { label: '🔥 Yüksek enflasyondan dönüş', set: { target: 5, cred: 0.2, smooth: 0.6 }, init: { pi: 45, pie: 45, i: 48 }, run: () => {} },
  kur: { label: '💱 Kur şoku', set: { cred: 0.4 }, run: () => shock('kur') },
};
const DEFAULTS = { target: 2, rStar: 2, uStar: 5, phiPi: 0.5, phiY: 0.5, smooth: 0.5, rule: true, manual: 4, cred: 0.6, lag: 2, a: 0.25, kappa: 0.2, passThru: 0.3, shockSize: 1 };
const presetBtns = Object.entries(PRESETS).map(([k, v]) => ({ label: v.label, onClick: () => loadPreset(k) }));
for (let j = 0; j < presetBtns.length; j += 2) ui.buttons(presetBtns.slice(j, j + 2));

ui.section('Şok ver (şimdi)');
ui.buttons([
  { label: '⛽ Enerji / petrol', onClick: () => shock('enerji') },
  { label: '🛍 Talep patlaması', onClick: () => shock('talep') },
]);
ui.buttons([
  { label: '💱 Kur değer kaybı', onClick: () => shock('kur') },
  { label: '📉 Güven kaybı', onClick: () => shock('guven') },
]);
const sizeS = ui.slider({ label: 'Şok büyüklüğü', min: 0.5, max: 3, step: 0.5, value: 1, format: (v) => `${fmt(v, 1)}×`, onChange: (v) => (P.shockSize = v) });

ui.section('Para politikası');
const modeSeg = ui.segmented({
  options: [{ value: 'taylor', label: '📐 Taylor kuralı' }, { value: 'manuel', label: '✋ Manuel faiz' }],
  value: 'taylor', onChange: (v) => { P.rule = v === 'taylor'; if (!P.rule) manualS.set(fmt0(eco.i)); P.manual = manualS.value; syncMode(); },
});
const fmt0 = (v) => Math.round(v * 4) / 4;
const manualS = ui.slider({ label: 'Politika faizi (manuel)', min: 0, max: 60, step: 0.25, value: 4, format: (v) => pct(v, 2), onInput: (v) => (P.manual = v) });
const targetS = ui.slider({ label: 'Enflasyon hedefi π*', min: 0, max: 10, step: 0.5, value: 2, format: (v) => pct(v), onInput: (v) => (P.target = v) });
const rStarS = ui.slider({ label: 'Nötr reel faiz r* (temsili)', min: 0, max: 5, step: 0.25, value: 2, format: (v) => pct(v, 2), onInput: (v) => (P.rStar = v) });
const phiPiS = ui.slider({ label: 'Taylor φπ (enflasyon tepkisi)', min: -0.5, max: 2, step: 0.1, value: 0.5, format: (v) => fmt(v, 1), onInput: (v) => (P.phiPi = v) });
const phiYS = ui.slider({ label: 'Taylor φy (çıktı açığı tepkisi)', min: 0, max: 1.5, step: 0.1, value: 0.5, format: (v) => fmt(v, 1), onInput: (v) => (P.phiY = v) });
const smoothS = ui.slider({ label: 'Faiz yumuşatma (kademeli adım)', min: 0, max: 0.9, step: 0.1, value: 0.5, format: (v) => fmt(v, 1), onInput: (v) => (P.smooth = v) });
const ruleText = ui.text('', 'card');

ui.section('Ekonomi (temsilî parametreler)');
const credS = ui.slider({ label: 'Güvenilirlik c (beklenti çıpası)', min: 0, max: 1, step: 0.05, value: 0.6, format: (v) => fmt(v, 2), onInput: (v) => (P.cred = v) });
const lagS = ui.slider({ label: 'Politika gecikmesi', min: 1, max: 6, step: 1, value: 2, unit: 'çeyrek', onInput: (v) => (P.lag = v) });
const aS = ui.slider({ label: 'Talebin reel faize duyarlılığı a', min: 0.05, max: 0.6, step: 0.05, value: 0.25, format: (v) => fmt(v, 2), onInput: (v) => (P.a = v) });
const kS = ui.slider({ label: 'Phillips eğimi κ', min: 0.05, max: 0.5, step: 0.05, value: 0.2, format: (v) => fmt(v, 2), onInput: (v) => (P.kappa = v) });
const ptS = ui.slider({ label: 'Kur geçişkenliği', min: 0, max: 0.6, step: 0.05, value: 0.3, format: (v) => pct(v * 100, 0), onInput: (v) => (P.passThru = v) });
const uStarS = ui.slider({ label: 'Doğal işsizlik u*', min: 2, max: 12, step: 0.5, value: 5, format: (v) => pct(v), onInput: (v) => (P.uStar = v) });

ui.section('Durum');
const stPi = ui.stat({ label: 'Enflasyon (yıllık)' });
const stPie = ui.stat({ label: 'Beklenen enflasyon' });
const stI = ui.stat({ label: 'Politika faizi' });
const stR = ui.stat({ label: 'Reel faiz (i − πᵉ)' });
const stY = ui.stat({ label: 'Çıktı açığı' });
const stU = ui.stat({ label: 'İşsizlik' });
const fisher = ui.text('', 'card');
const chPi = ui.chart({ title: 'Enflasyon, beklenti ve hedef (%)', maxPoints: 80,
  series: [{ name: 'Enflasyon', color: '#ef4444' }, { name: 'Beklenti', color: '#c084fc' }, { name: 'Hedef', color: '#e5e7eb' }] });
const chI = ui.chart({ title: 'Politika faizi ve reel faiz (%)', maxPoints: 80,
  series: [{ name: 'Politika faizi', color: '#38bdf8' }, { name: 'Reel faiz', color: '#22c55e' }, { name: 'Nötr r*', color: '#64748b' }] });
const chY = ui.chart({ title: 'Çıktı açığı ve işsizlik (%)', maxPoints: 80,
  series: [{ name: 'Çıktı açığı', color: '#facc15', fill: true }, { name: 'İşsizlik', color: '#fb923c' }] });
ui.text('<small>Her adım bir çeyrektir (3 ay). Tüm katsayılar temsilîdir; gerçek bir ekonomiye kalibre edilmemiştir.</small>');

function syncMode() {
  manualS.disable(P.rule);
  [phiPiS, phiYS, smoothS].forEach((s) => s.disable(!P.rule));
}

function shock(kind) {
  const m = P.shockSize;
  if (kind === 'enerji') { eco.s += 4 * m; sim.toast(`⛽ Enerji fiyatları sıçradı: maliyet (arz) şoku`, 'warn'); }
  if (kind === 'talep') { eco.d += 2.5 * m; sim.toast('🛍 Talep patlaması: harcamalar hızla artıyor', 'warn'); }
  if (kind === 'kur') {
    const dep = 20 * m; // % değer kaybı
    eco.s += dep * P.passThru * 4 * 0.35; // fiyat düzeyine toplam etki ≈ değer kaybı × geçişkenlik
    eco.d += 0.4 * m;
    sim.toast(`💱 Ulusal para %${fmt(dep)} değer kaybetti; geçişkenlik %${fmt(P.passThru * 100)} → fiyatlara yansıyor`, 'warn');
  }
  if (kind === 'guven') { eco.credHit += 0.4 * m; eco.bias += 2 * m; sim.toast('📉 Güven kaybı: beklentiler hedeften kopuyor', 'bad'); }
}

function applyParams(o) {
  const v = { ...DEFAULTS, ...o };
  Object.assign(P, v);
  manualS.set(v.manual); targetS.set(v.target); rStarS.set(v.rStar); phiPiS.set(v.phiPi); phiYS.set(v.phiY); smoothS.set(v.smooth);
  credS.set(v.cred); lagS.set(v.lag); aS.set(v.a); kS.set(v.kappa); ptS.set(v.passThru); uStarS.set(v.uStar); sizeS.set(v.shockSize);
  modeSeg.set(v.rule ? 'taylor' : 'manuel');
  syncMode();
}

let current = 'sakin';
function loadPreset(k) {
  current = k;
  const pr = PRESETS[k];
  applyParams(pr.set);
  restart(pr.init);
  pr.run();
}

function restart(init) {
  eco.reset(init || {});
  acc = 0; qTime = 0;
  sim.time = 0;
  pulses.forEach((p) => (p.on = false));
  disp = { i: eco.i, pi: eco.pi, pie: eco.pie, y: eco.y };
  [chPi, chI, chY].forEach((c) => c.clear());
  pushCharts();
  updateStats();
}

function pushCharts() {
  chPi.push([eco.pi, eco.pie, P.target]);
  chI.push([eco.i, eco.r, P.rStar]);
  chY.push([eco.y, eco.u]);
}

function updateStats() {
  const dPi = eco.pi - P.target;
  stPi.set(pct(eco.pi), Math.abs(dPi) < 1 ? 'good' : Math.abs(dPi) < 4 ? 'warn' : 'bad');
  stPie.set(pct(eco.pie), Math.abs(eco.pie - P.target) < 1 ? 'good' : 'warn');
  stI.set(pct(eco.i, 2));
  const gap = eco.r - P.rStar;
  stR.set(pct(eco.r), gap > 0.5 ? 'good' : gap < -0.5 ? 'warn' : '');
  stY.set(`${eco.y >= 0 ? '+' : ''}${fmt(eco.y, 1)}`, Math.abs(eco.y) < 1 ? 'good' : Math.abs(eco.y) < 3 ? 'warn' : 'bad');
  stU.set(pct(eco.u), eco.u - P.uStar > 2 ? 'bad' : eco.u - P.uStar > 0.5 ? 'warn' : '');
  const stance = gap > 0.5 ? '<b style="color:#60a5fa">sıkı</b> (talebi yavaşlatır)' : gap < -0.5 ? '<b style="color:#fb923c">gevşek</b> (talebi canlandırır)' : '<b>nötr</b>';
  fisher.set(`<b>Fisher:</b> reel faiz = ${pct(eco.i, 2)} − ${pct(eco.pie)} = <b>${pct(eco.r)}</b><br>Nötr faiz r* = ${pct(P.rStar, 2)} → duruş ${stance}.
    <br><small>Etkisi ${P.lag} çeyrek sonra üretime ulaşır.</small>`);
  const tay = eco.taylor();
  ruleText.set(P.rule
    ? `Taylor önerisi: ${pct(P.rStar, 2)} + ${pct(eco.pi)} + ${fmt(P.phiPi, 1)}·(${fmt(dPi, 1)}) + ${fmt(P.phiY, 1)}·(${fmt(eco.y, 1)}) = <b>${pct(Math.max(0, tay), 2)}</b>`
    : `Manuel mod: faiz <b>${pct(P.manual, 2)}</b>. Taylor kuralı şu an <b>${pct(Math.max(0, tay), 2)}</b> önerirdi.`);
  bankLbl.setText(`🏦 Politika faizi <b>${pct(eco.i, 2)}</b>`);
  piLbl.setText(`🌡 Enflasyon <b>${pct(eco.pi)}</b><br><small style="color:#d8b4fe">beklenti ${pct(eco.pie)}</small> · <small>hedef ${pct(P.target)}</small>`);
  outLbl.setText(`🏭 Çıktı açığı <b>${eco.y >= 0 ? '+' : ''}${fmt(eco.y, 1)}</b>`);
  uLbl.setText(`🧍 İşsizlik <b>${pct(eco.u)}</b>`);
  pipeLbl.setText(`<span style="color:#cbd5e1">parasal aktarım · ${P.lag} çeyrek gecikme</span>`);
}

sim.onReset(() => loadPreset(current));
applyParams({});
restart();
