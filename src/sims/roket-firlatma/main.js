// Roket Fırlatma — Tsiolkovsky kütle akışı, 1/r² yerçekimi, irtifayla azalan sürükleme; ölçekli gezegende yörüngeye çıkış.
import { createSim, THREE, fmt, fmtClock, clamp, lerp, ImprovedNoise } from '@core';
import * as P from './physics.js';

const W = 1e-4; // dünya birimi / metre (1 birim = 10 km)
const RW = P.R * W;

const sim = createSim({
  background: 0x02030a,
  camera: { position: [4, RW + 3, 13], target: [0, RW + 1.2, 0], fov: 50, near: 0.05, far: 5000 },
  controls: { maxPolarAngle: Math.PI, minDistance: 2, maxDistance: 900 },
  lights: false,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Ölçekli bir gezegen (yarıçapı Dünya'nın 1/10'u, yüzey yerçekimi aynı: 9,81 m/s²) ve üzerinde bir roket.
    Fizik 2B yörünge düzleminde hesaplanır, 3B çizilir: yerçekimi <b>g = GM/r²</b> ile azalır, hava yoğunluğu
    irtifayla üstel düşer (<b>ρ = ρ₀·e<sup>−h/H</sup></b>), sürükleme <b>½·ρ·v²·C<sub>d</sub>A</b>.</p>
    <p>Roketin hız kazanma kapasitesi <b>Tsiolkovsky</b> denklemiyle bulunur: <b>Δv = v<sub>e</sub> · ln(m<sub>dolu</sub> / m<sub>boş</sub>)</b>.
    Yakıt yandıkça roket hafifler ve giderek daha hızlı ivmelenir. İki kademede boş tank atılır; bu yüzden aynı yakıtla daha çok Δv elde edilir.</p>
    <h3>Neden 7,9 km/s?</h3>
    <p>Yörüngede kalmak, yere doğru düşerken yatayda o kadar hızlı gitmektir ki yer eğriliği "kaçar". Dairesel yörünge hızı
    <b>v = √(g·R)</b>. Gerçek Dünya için √(9,81 × 6.371.000 m) ≈ <b>7,9 km/s</b>. Bu küçük gezegende yarıçap 10 kat küçük
    olduğundan ≈ <b>2,5 km/s</b> yeterli. Kaçış hızı bunun √2 katıdır (Dünya'da 11,2 km/s).</p>
    <h3>Dene</h3>
    <ul>
      <li>Varsayılan ayarlarla fırlat: roket yerçekimi dönüşüyle yatar, apoapsis 120 km'ye ulaşınca motor durur, tepe noktasında yörüngeyi daireselleştirir.</li>
      <li>Fırlatma açısını <b>sabit 0°</b> yap: roket dümdüz yükselir ve geri düşer — yükseklik yetmez, yatay hız gerekir.</li>
      <li>İtkiyi roketin ağırlığının altına indir (itki/ağırlık &lt; 1): roket rampadan kalkamaz.</li>
      <li>İki kademe + bol yakıt + otopilot kapalı: kaçış hızını aşıp gezegenden uzaklaşırsın.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Gerçek roketler de önce dikey kalkar, sonra yavaşça yatar (gravity turn); yoğun atmosferden çabuk çıkmak ve yatay hız kazanmak
    arasında denge kurar. Periapsis atmosferin içindeyse sürtünme yörüngeyi bozar ve araç geri düşer.</p>
    <p><small>Sadeleştirmeler: gezegen dönmüyor, itki deniz seviyesi/vakum farkı yok, roket ve rampa görünürlük için çok büyük çizildi.</small></p>`,
});

// --- Yıldızlar ---
{
  const n = 2500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(2500 + Math.random() * 1500);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sim.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcbd5ff, size: 1.6, sizeAttenuation: false })));
}
const sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
sunLight.position.set(300, 400, 500);
sim.scene.add(sunLight, new THREE.AmbientLight(0x4b5578, 0.9));

// --- Gezegen (yordamsal doku) ---
function planetTexture() {
  const w = 512, h = 256, c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(w, h), noise = new ImprovedNoise();
  for (let j = 0; j < h; j++) {
    const lat = (j / h - 0.5) * Math.PI;
    for (let i = 0; i < w; i++) {
      const lon = (i / w) * Math.PI * 2;
      const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
      let v = 0, a = 1, f = 1.6;
      for (let o = 0; o < 4; o++) { v += a * noise.noise(x * f + 5, y * f, z * f); a *= 0.5; f *= 2.1; }
      const ice = Math.abs(y) > 0.86;
      let r, g, b;
      if (ice) { r = 235; g = 242; b = 250; }
      else if (v > 0.06) { const t = clamp((v - 0.06) * 3, 0, 1); r = lerp(64, 150, t); g = lerp(128, 120, t); b = lerp(60, 80, t); }
      else { const t = clamp(-v * 2, 0, 1); r = lerp(40, 12, t); g = lerp(110, 50, t); b = lerp(170, 120, t); }
      const k = (j * w + i) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const planet = new THREE.Mesh(new THREE.SphereGeometry(RW, 160, 110), new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 0.9 }));
planet.rotation.z = Math.PI / 2; // rampa ekvatorda, yörünge kutuplardan geçer
sim.scene.add(planet);
const atmoMat = new THREE.MeshBasicMaterial({ color: 0x5fa8ff, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending });
const atmo = new THREE.Group();
[1, 0.5, 0.25].forEach((k, i) => {
  const m = atmoMat.clone();
  m.opacity = 0.1 + i * 0.03;
  atmo.add(new THREE.Mesh(new THREE.SphereGeometry(RW + P.ATM * W * k, 96, 64), m));
});
sim.scene.add(atmo);

// --- Rampa ---
const pad = new THREE.Group();
{
  const metal = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.6, roughness: 0.4 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.25, 24), new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.9 }));
  base.position.y = 0.05;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), metal);
  tower.position.set(0.75, 1.4, 0);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.08), metal);
  arm.position.set(0.5, 2.2, 0);
  pad.add(base, tower, arm);
  pad.position.set(0, RW, 0);
  sim.scene.add(pad);
  sim.label('Fırlatma rampası', { parent: pad, position: [1.9, 0.3, 0], className: 'plain' });
}

// --- Roket ---
const rocket = new THREE.Group();
const stage1 = new THREE.Group(), stage2 = new THREE.Group();
{
  const white = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
  const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.3, 20), white);
  b1.position.y = 0.75;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.12, 20), dark);
  band.position.y = 1.2;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.18, 16), dark);
  nozzle.position.y = 0.05;
  stage1.add(b1, band, nozzle);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.35, 0.25), red);
    const a = (i / 3) * Math.PI * 2;
    fin.position.set(Math.cos(a) * 0.3, 0.3, Math.sin(a) * 0.3);
    fin.rotation.y = -a + Math.PI / 2;
    stage1.add(fin);
  }
  const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.55, 20), white);
  b2.position.y = 1.68;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 20), red);
  nose.position.y = 2.2;
  const n2 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.1, 12), dark);
  n2.position.y = 1.37;
  stage2.add(b2, nose, n2);
  rocket.add(stage1, stage2);
}
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa640, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1, 16, 1, true), flameMat);
flame.rotation.x = Math.PI;
const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1c1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
flameCore.rotation.x = Math.PI;
const flameGroup = new THREE.Group();
flameGroup.add(flame, flameCore);
rocket.add(flameGroup);
sim.scene.add(rocket);
const rocketLbl = sim.label('', { parent: rocket, position: [0.9, 1.6, 0], className: 'plain' });

// Ayrılan kademe
let dropped = null;

// Patlama
const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
sim.scene.add(boom);
let boomT = -1;

// İz ve tahmini yörünge
const TRAIL = 5000;
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
trailGeo.setDrawRange(0, 0);
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9 }));
trail.frustumCulled = false;
sim.scene.add(trail);
let trailN = 0, trailClock = 0;
const ORB_N = 256;
const orbGeo = new THREE.BufferGeometry();
orbGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ORB_N * 3), 3));
const orbLine = new THREE.LineLoop(orbGeo, new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.55 }));
orbLine.frustumCulled = false;
orbLine.visible = false;
sim.scene.add(orbLine);

// --- Arayüz ---
const ui = sim.ui;
ui.section('Uçuş');
ui.buttons([
  { label: '🚀 Fırlat', variant: 'primary', onClick: launch },
  { label: '⏹ Motoru kes', onClick: () => manualEngine(false) },
  { label: '🔥 Ateşle', onClick: () => manualEngine(true) },
]);
const autoTg = ui.toggle({ label: 'Otopilot (apoapsis 120 km → daireselleştir)', value: true });
const warpSl = ui.slider({ label: 'Zaman hızlandırma', min: 1, max: 60, step: 1, value: 12, unit: '×' });

ui.section('Roket tasarımı');
const fuelSl = ui.slider({ label: 'Yakıt kütlesi', min: 4, max: 60, step: 1, value: 20, unit: 't', onInput: redesign });
const thrustSl = ui.slider({ label: 'İtki (1. kademe)', min: 100, max: 1200, step: 10, value: 400, unit: 'kN', onInput: redesign });
const stageSel = ui.segmented({ label: 'Kademe sayısı', options: [{ value: 1, label: '1 kademe' }, { value: 2, label: '2 kademe' }], value: 1, onChange: redesign });
const guideSel = ui.segmented({ label: 'Yönlendirme', options: [{ value: 'turn', label: 'Yerçekimi dönüşü' }, { value: 'fixed', label: 'Sabit açı' }], value: 'turn', onChange: syncGuide });
const turnSl = ui.slider({ label: 'Yataya ulaşma irtifası', min: 10, max: 90, step: 1, value: 45, unit: 'km' });
const angleSl = ui.slider({ label: 'Fırlatma açısı (dikeyden)', min: 0, max: 80, step: 1, value: 30, unit: '°' });
const designTxt = ui.text('', 'card');

ui.section('Hazır görevler');
ui.buttons([
  { label: '🛰 Yörünge', onClick: () => preset(20, 400, 1, 'turn', 45, true) },
  { label: '⛽ Az yakıt', onClick: () => preset(9, 300, 1, 'turn', 45, true) },
  { label: '⬆ Dik atış', onClick: () => preset(20, 400, 1, 'fixed', 45, false, 0) },
]);
ui.buttons([
  { label: '🧩 2 kademe', onClick: () => preset(12, 400, 2, 'turn', 45, true) },
  { label: '🌌 Kaçış', onClick: () => preset(30, 800, 2, 'turn', 45, false) },
  { label: '🪨 Zayıf motor', onClick: () => preset(30, 250, 1, 'turn', 45, true) },
]);

ui.section('Görünüm');
const followTg = ui.toggle({ label: 'Kamera roketi izlesin', value: true, onChange: (v) => { if (v) focusRocket(); else overview(); } });
const orbitTg = ui.toggle({ label: 'Tahmini yörünge', value: true });
ui.toggle({ label: 'Atmosfer katmanı', value: true, onChange: (v) => (atmo.visible = v) });
ui.toggle({ label: 'Uçuş izi', value: true, onChange: (v) => (trail.visible = v) });

ui.section('Telemetri');
const stStatus = ui.stat({ label: 'Durum' });
const stAlt = ui.stat({ label: 'İrtifa', unit: 'km' });
const stVel = ui.stat({ label: 'Hız', unit: 'km/s' });
const stApo = ui.stat({ label: 'Apoapsis', unit: 'km' });
const stPeri = ui.stat({ label: 'Periapsis', unit: 'km' });
const stDv = ui.stat({ label: 'Kalan Δv', unit: 'km/s' });
const stTwr = ui.stat({ label: 'İtki / ağırlık' });
const stMass = ui.stat({ label: 'Kütle', unit: 't' });
const fuelMeter = ui.meter({ label: 'Yakıt', color: '#f59e0b' });
const orbMeter = ui.meter({ label: 'Yatay hız / yörünge hızı', color: '#22d3ee' });
const altChart = ui.chart({ title: 'İrtifa (km)', series: [{ name: 'irtifa', color: '#fbbf24', fill: true }], maxPoints: 240, height: 90 });
const velChart = ui.chart({ title: 'Hız (km/s)', series: [{ name: 'hız', color: '#22d3ee' }, { name: 'yerel yörünge hızı', color: '#64748b' }], maxPoints: 240, height: 90, format: (v) => fmt(v, 1) });
ui.text(`<small>Gerçek Dünya'da alçak yörünge hızı <b>≈ 7,9 km/s</b> = √(g·R). Bu gezegende ≈ <b>${fmt(P.V_ORBIT_LOW / 1000, 2)} km/s</b> (80 km'de).</small>`);

// --- Durum ---
let s, flying = false, outcome = 'pad', lastOutcome = 'pad';
const LABELS = { pad: 'Rampada', ascent: 'Motor çalışıyor', sub: 'Alt yörünge', orbit: 'Yörüngede ✓', escape: 'Kaçış!', crash: 'Yere çakıldı' };

function redesign() {
  if (flying) { designTxt.set('<small>Değişiklikler bir sonraki fırlatmada geçerli (⟲).</small>'); return; }
  s = P.createState(P.design(fuelSl.value * 1000, thrustSl.value * 1000, stageSel.value));
  const m0 = P.mass(s), twr = (thrustSl.value * 1000) / (m0 * P.G0);
  designTxt.set(`Kalkış kütlesi <b>${fmt(m0 / 1000, 1)} t</b> · itki/ağırlık <b>${fmt(twr, 2)}</b>${twr < 1 ? ' ⚠️ kalkamaz' : ''} ·
    toplam Δv <b>${fmt(P.deltaV(s) / 1000, 2)} km/s</b>`);
  stage1.visible = true;
  stage2.scale.setScalar(1);
  placeRocket();
}
function syncGuide() {
  const turn = guideSel.value === 'turn';
  turnSl.disable(!turn); angleSl.disable(turn);
}
function preset(fuel, thrust, st, guide, turn, auto, angle = 30) {
  fuelSl.set(fuel); thrustSl.set(thrust); stageSel.set(st); guideSel.set(guide); turnSl.set(turn); angleSl.set(angle);
  autoTg.set(auto); syncGuide();
  resetFlight();
  launch();
}
function launch() {
  if (flying) return;
  if (!s || s.t > 0) { resetFlight(); }
  flying = true;
  s.engine = true;
  sim.hud.hide();
  if ((thrustSl.value * 1000) / (P.mass(s) * P.G0) < 1) sim.toast('İtki roketin ağırlığından küçük — roket kalkamıyor!', 'bad');
  else sim.toast('🚀 Ateşleme! Kalkış.', 'good');
}
function manualEngine(on) {
  if (!flying || s.crashed) return;
  s.phase = 'done'; // otopilot devre dışı
  s.engine = on && P.hasFuel(s);
  if (on && !s.engine) sim.toast('Yakıt bitti', 'warn');
}
function resetFlight() {
  flying = false;
  if (dropped) { stage1.position.set(0, 0, 0); stage1.rotation.set(0, 0, 0); rocket.add(stage1); dropped = null; }
  boomT = -1; boom.material.opacity = 0; rocket.visible = true;
  trailN = 0; trailGeo.setDrawRange(0, 0); trailClock = 0;
  orbLine.visible = false;
  outcome = lastOutcome = 'pad';
  altChart.clear(); velChart.clear();
  sim.hud.hide();
  redesign();
  if (followTg.value) focusRocket(); else overview();
}

// --- Görsel güncelleme ---
const Yv = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), prevPos = new THREE.Vector3();
function placeRocket() {
  rocket.position.set(s.x * W, s.y * W, 0);
  const r = Math.hypot(s.x, s.y), ux = s.x / r, uy = s.y / r;
  let dx = ux, dy = uy;
  const v = Math.hypot(s.vx, s.vy);
  if (s.engine && !s.landed) { const p = currentPitch(); dx = Math.sin(p) * uy + Math.cos(p) * ux; dy = -Math.sin(p) * ux + Math.cos(p) * uy; }
  else if (v > 5 && !s.landed) { dx = s.vx / v; dy = s.vy / v; }
  tmpV.set(dx, dy, 0).normalize();
  rocket.quaternion.slerp(new THREE.Quaternion().setFromUnitVectors(Yv, tmpV), s.landed ? 1 : 0.25);
}
let pitchNow = 0;
const currentPitch = () => pitchNow;

const autoActive = () => autoTg.value && s.phase !== 'done' && P.hasFuel(s);

function focusRocket() {
  const p = rocket.position, r = p.clone().normalize();
  const side = new THREE.Vector3(-r.y, r.x, 0);
  sim.moveCamera([p.x + r.x * 3 + side.x * 4, p.y + r.y * 3 + side.y * 4, 13], [p.x + r.x * 1.2, p.y + r.y * 1.2, 0]);
  prevPos.copy(rocket.position);
}
function overview() { sim.moveCamera([0, 25, 185], [0, 0, 0]); }

function pushTrail() {
  const arr = trailGeo.attributes.position.array;
  if (trailN >= TRAIL) { arr.copyWithin(0, 3); trailN = TRAIL - 1; }
  arr.set([s.x * W, s.y * W, 0], trailN * 3);
  trailN++;
  trailGeo.setDrawRange(0, trailN);
  trailGeo.attributes.position.needsUpdate = true;
}
function updateOrbitLine(el) {
  if (!orbitTg.value || el.escape || !(el.a > 0) || s.landed) { orbLine.visible = false; return; }
  const arr = orbGeo.attributes.position.array;
  const e = Math.min(el.e, 0.999), p = el.a * (1 - e * e), dirSign = Math.sign(el.hz) || 1;
  for (let i = 0; i < ORB_N; i++) {
    const nu = (i / ORB_N) * Math.PI * 2;
    const r = p / (1 + e * Math.cos(nu));
    const ang = el.w + dirSign * nu;
    arr.set([Math.cos(ang) * r * W, Math.sin(ang) * r * W, 0], i * 3);
  }
  orbGeo.attributes.position.needsUpdate = true;
  orbLine.visible = true;
}

function finish(kind) {
  const alt = fmt(s.maxAlt / 1000, 0);
  const msg = {
    crash: [`💥 <b>Yere çakıldı.</b> En yüksek irtifa ${alt} km. Yatay hız yetmedi: yörünge için bu gezegende ~${fmt(P.V_ORBIT_LOW / 1000, 1)} km/s yatay hız gerekir.`, 'bad'],
    orbit: [`🛰 <b>Yörüngedesin!</b> Periapsis atmosferin (${P.ATM / 1000} km) üstünde; roket artık düşmeden gezegenin etrafında dolanır.`, 'good'],
    escape: [`🌌 <b>Kaçış hızına ulaştın!</b> Toplam enerji pozitif: roket gezegenin çekiminden kurtulup uzaklaşıyor.`, 'warn'],
  }[kind];
  sim.hud.show(`${msg[0]}<br><button class="btn" data-a="again">Tekrar dene</button>`, { tone: msg[1], timeout: kind === 'crash' ? 0 : 8000 });
  sim.hud.el.querySelector('[data-a="again"]').onclick = () => { sim.hud.hide(); resetFlight(); };
}

// --- Döngü ---
let chartClock = 0, uiTick = 0;
sim.onUpdate((dt) => {
  if (!flying) return;
  let remaining = Math.min(dt, 0.8) * warpSl.value;
  let steps = 0;
  while (remaining > 1e-6 && steps < 6000 && !s.crashed) {
    const alt = Math.hypot(s.x, s.y) - P.R;
    const fine = s.engine || alt < P.ATM * 1.5 || alt < 20000;
    const h = Math.min(remaining, fine ? 0.05 : 0.5);
    const base = P.pitchFor(s, guideSel.value, angleSl.value, turnSl.value * 1000);
    pitchNow = autoTg.value && s.phase !== 'done' ? P.autopilot(s, base) : base;
    const ev = P.step(s, h, pitchNow);
    remaining -= h; steps++;
    if (ev === 'stage') {
      sim.toast('🧩 1. kademe ayrıldı, 2. kademe ateşlendi', 'warn');
      dropped = { v: new THREE.Vector3(s.vx * W, s.vy * W, 0).multiplyScalar(0.6), t: 0 };
      stage1.getWorldPosition(tmpV);
      const q = rocket.quaternion.clone();
      sim.scene.add(stage1);
      stage1.position.copy(tmpV); stage1.quaternion.copy(q);
    }
    if (ev === 'burnout') sim.toast('Yakıt bitti — motor sustu', 'warn');
    if (ev === 'crash') break;
    trailClock += h;
    if (trailClock > (s.engine ? 1 : 4)) { trailClock = 0; pushTrail(); }
  }
  // Sonuç
  const c = s.crashed ? 'crash' : s.landed ? 'pad' : s.engine ? 'ascent' : P.classify(s);
  outcome = c;
  if (c !== lastOutcome) {
    if (c === 'crash') { finish('crash'); boomT = 0; boom.position.copy(rocket.position); rocket.visible = false; flying = false; }
    else if (c === 'orbit' && lastOutcome !== 'orbit') finish('orbit');
    else if (c === 'escape') finish('escape');
    else if (c === 'sub' && lastOutcome === 'ascent' && !autoActive()) sim.toast('Alt yörünge: periapsis atmosferin içinde, roket geri düşecek', 'warn');
    lastOutcome = c;
  }
  if (dropped) {
    dropped.t += dt;
    stage1.position.addScaledVector(dropped.v, dt * 0.3);
    stage1.rotateZ(dt * 0.8);
    if (dropped.t > 6) stage1.visible = false;
  }
  chartClock += dt * warpSl.value;
  if (chartClock > 2) {
    chartClock = 0;
    const r = Math.hypot(s.x, s.y);
    altChart.push([(r - P.R) / 1000]);
    velChart.push([Math.hypot(s.vx, s.vy) / 1000, Math.sqrt(P.MU / r) / 1000]);
  }
});

sim.onRender((rdt) => {
  if (!s) return;
  if (rocket.visible) placeRocket();
  // Kamera takibi: roketin yer değiştirmesi kadar kamerayı kaydır
  if (followTg.value && sim.controls) {
    tmpV.subVectors(rocket.position, prevPos);
    sim.camera.position.add(tmpV); sim.controls.target.add(tmpV);
  }
  prevPos.copy(rocket.position);
  // Alev
  const on = s.engine && !s.crashed && P.hasFuel(s);
  flameGroup.visible = on;
  if (on) {
    // Seyrek havada egzoz dumanı genişler
    const k = s.cur === 1 ? 0.7 : 1, vac = clamp(1 - P.density(Math.hypot(s.x, s.y) - P.R) / P.RHO0, 0, 1);
    const len = (0.9 + Math.random() * 0.35) * k * (1 + vac * 0.8);
    flame.scale.set(k * (1 + vac), len, k * (1 + vac));
    flame.position.y = (s.cur === 1 ? 1.32 : 0) - len / 2;
    flameCore.scale.set(k, len * 0.8, k);
    flameCore.position.y = (s.cur === 1 ? 1.32 : 0) - len * 0.3;
  }
  // Gökyüzü rengi: kameranın irtifasına göre maviden siyaha
  const camAlt = (sim.camera.position.length() - RW) / W;
  const t = clamp(Math.exp(-Math.max(camAlt, 0) / 9000), 0, 1);
  sim.scene.background.setRGB(lerp(0.004, 0.2, t), lerp(0.006, 0.42, t), lerp(0.02, 0.75, t));
  // Patlama
  if (boomT >= 0) {
    boomT += rdt;
    boom.scale.setScalar(0.3 + boomT * 3);
    boom.material.opacity = Math.max(0, 1 - boomT / 1.4);
    if (boomT > 1.5) boomT = -1;
  }
  // Etiket ve telemetri
  if (++uiTick % 6) return;
  const r = Math.hypot(s.x, s.y), alt = r - P.R, v = Math.hypot(s.vx, s.vy);
  const el = P.elements(s);
  const m = P.mass(s);
  const stg = s.stages[s.cur];
  const twr = stg && stg.left > 0 ? stg.thrust / (m * (P.MU / (r * r))) : 0;
  stStatus.set(outcome === 'sub' && autoActive() && s.phase === 'coast' ? 'Süzülüyor' : LABELS[outcome] || '—', outcome === 'orbit' ? 'good' : outcome === 'crash' ? 'bad' : outcome === 'escape' || outcome === 'sub' ? 'warn' : '');
  stAlt.set(fmt(alt / 1000, 1));
  stVel.set(fmt(v / 1000, 2));
  stApo.set(s.landed ? '—' : el.escape ? '∞' : fmt(el.apo / 1000, 0));
  stPeri.set(s.landed ? '—' : fmt(el.peri / 1000, 0), !s.landed && el.peri > P.ATM ? 'good' : '');
  stDv.set(fmt(P.deltaV(s) / 1000, 2));
  stTwr.set(fmt(twr, 2), twr > 0 && twr < 1 && s.landed ? 'bad' : '');
  stMass.set(fmt(m / 1000, 1));
  const total = s.stages.reduce((a, x) => a + x.fuel, 0), left = s.stages.reduce((a, x) => a + x.left, 0);
  fuelMeter.set(left / total, `${fmt((left / total) * 100, 0)}% · ${fmt(left / 1000, 1)} t`);
  const vh = Math.abs(s.x * s.vy - s.y * s.vx) / r, vc = Math.sqrt(P.MU / r);
  orbMeter.set(vh / vc, `${fmt(vh / 1000, 2)} / ${fmt(vc / 1000, 2)} km/s`);
  rocketLbl.setText(`${fmt(alt / 1000, 0)} km · ${fmt(v / 1000, 2)} km/s`);
  rocketLbl.visible = !s.landed && rocket.visible;
  updateOrbitLine(el);
});

sim.formatTime = () => (s ? `T+${fmtClock(s.t)}` : 'T+00:00');
sim.onReset(() => resetFlight());
syncGuide();
resetFlight();
