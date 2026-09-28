// Roket Fırlatma — Tsiolkovsky kütle akışı, 1/r² yerçekimi, irtifayla azalan sürükleme; ölçekli gezegende yörüngeye çıkış.
import { createSim, THREE, fmt, fmtClock, clamp, lerp, mat, procedural, createTerrain, terrainSkirt, createVegetation, createOcean, depthTexture } from '@core';
import * as P from './physics.js';
import { makeHeight, buildSite, GL, PT, MOUNT, COAST } from './site.js';
import { buildRocket, disposeRocket, createFlame, createSmoke } from './rocket.js';

// Dünya metre cinsinden: rampa (0, MOUNT, 0), gezegen merkezi (0, −R, 0). Fizik düzlemi = dünya x–y düzlemi (doğu = +x, deniz).
const R = P.R;
const CENTER = new THREE.Vector3(0, -R, 0);
const CAM_PAD = { p: [27, 9, 33], t: [-3, 20, -5] };

const sim = createSim({
  sky: { elevation: 21, azimuth: 214, clouds: 0.32, haze: 1.25, visibility: 14000, wind: [4, 2] },
  camera: { position: CAM_PAD.p, target: CAM_PAD.t, fov: 45, near: 0.3, far: 90000 },
  controls: { maxPolarAngle: Math.PI * 0.495, minDistance: 8, maxDistance: R * 6 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Kıyıda bir fırlatma üssü ve gerçek boyutlu bir roket; roket, ölçekli bir gezegenin (yarıçapı Dünya'nın 1/10'u, yüzey
    yerçekimi aynı: 9,81 m/s²) yüzeyinden kalkar. Fizik 2B yörünge düzleminde hesaplanır, 3B çizilir: yerçekimi <b>g = GM/r²</b>
    ile azalır, hava yoğunluğu irtifayla üstel düşer (<b>ρ = ρ₀·e<sup>−h/H</sup></b>), sürükleme <b>½·ρ·v²·C<sub>d</sub>A</b>.
    Roket yükseldikçe gökyüzü koyulaşır; seyrek havada egzoz dumanı kaybolur ve alev genişler.</p>
    <p>Roketin hız kazanma kapasitesi <b>Tsiolkovsky</b> denklemiyle bulunur: <b>Δv = v<sub>e</sub> · ln(m<sub>dolu</sub> / m<sub>boş</sub>)</b>.
    Yakıt yandıkça roket hafifler ve giderek daha hızlı ivmelenir. İki kademede boş tank atılır; bu yüzden aynı yakıtla daha çok Δv elde edilir.
    Roketin boyu seçtiğin yakıt kütlesine göre değişir (tank hacmi = kütle / yoğunluk).</p>
    <h3>Neden 7,9 km/s?</h3>
    <p>Yörüngede kalmak, yere doğru düşerken yatayda o kadar hızlı gitmektir ki yer eğriliği "kaçar". Dairesel yörünge hızı
    <b>v = √(g·R)</b>. Gerçek Dünya için √(9,81 × 6.371.000 m) ≈ <b>7,9 km/s</b>. Bu küçük gezegende yarıçap 10 kat küçük
    olduğundan ≈ <b>2,5 km/s</b> yeterli. Kaçış hızı bunun √2 katıdır (Dünya'da 11,2 km/s).</p>
    <h3>Dene</h3>
    <ul>
      <li>Varsayılan ayarlarla fırlat: roket yerçekimi dönüşüyle yatar, apoapsis 120 km'ye ulaşınca motor durur, tepe noktasında yörüngeyi daireselleştirir.</li>
      <li>"Kamera roketi izlesin"i kapat: gezegenin tamamını, uçuş izini ve tahmini yörüngeyi uzaydan gör.</li>
      <li>Fırlatma açısını <b>sabit 0°</b> yap: roket dümdüz yükselir ve geri düşer — yükseklik yetmez, yatay hız gerekir.</li>
      <li>İtkiyi roketin ağırlığının altına indir (itki/ağırlık &lt; 1): roket rampadan kalkamaz.</li>
      <li>İki kademe + bol yakıt + otopilot kapalı: kaçış hızını aşıp gezegenden uzaklaşırsın.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Gerçek roketler de önce dikey kalkar, sonra yavaşça yatar (gravity turn); yoğun atmosferden çabuk çıkmak ve yatay hız kazanmak
    arasında denge kurar. Periapsis atmosferin içindeyse sürtünme yörüngeyi bozar ve araç geri düşer. Rampadaki alev kanalı
    egzozu yana çevirir; su püskürtme sesi ve ısıyı bastırır (bembeyaz bulutun çoğu su buharıdır).</p>
    <p><small>Sadeleştirmeler: gezegen dönmüyor, itki deniz seviyesi/vakum farkı yok, tank yoğunluğu temsilî (1.000 kg/m³). İlk saniyelerde
    zaman hızlandırma kalkışı görebilmen için kademeli artar; fizik aynıdır.</small></p>`,
});
const scene = sim.scene, camera = sim.camera;

// --- Kıyı arazisi (dünya eğriliği dahil), bitki örtüsü, okyanus ---
const hf = makeHeight(R);
const land = new THREE.Group(); scene.add(land);
const TR = 3200;
land.add(createTerrain(hf, { size: [2 * TR, 2 * TR], res: [384, 384], materialOptions: { water: 0, grass: 0x66713a, dry: 0xa39461, sand: 0xd8c9a2, forest: 0.55, forestCol: 0x34452a } }));
land.add(terrainSkirt(hf, { inner: TR, outer: 60000 }));
const coastAt = (z) => COAST + 70 * Math.sin(z / 760 + 0.4) + 28 * Math.sin(z / 210 + 1.7);
// Bitki yalnız doğal zeminde: rampa, yollar ve tesis alanı dışarıda (yükseklik "su altı" döner → reddedilir)
const vegH = (x, z) => {
  const r = Math.hypot(x, z);
  if (r < 150 || (Math.abs(z) < 14 && x < 0) || (x > -170 && x < 110 && z < 0 && z > -110) || Math.hypot(x + 150, z - 95) < 24 || Math.hypot(x + 175, z + 62) < 26) return -10;
  return hf(x, z);
};
const veg = createVegetation(vegH, {
  rect: [-2600, -2400, 900, 2400], trees: 2600, shrubs: 9000, rocks: 120, grass: 16000, grassAt: [-70, 80, 40], seed: 8,
  kinds: { broad: 0.45, pine: 0.4, cypress: 0.15 }, near: [-160, 60, 650], leafA: 0x3d5427, leafB: 0x77803e,
  forest: (x, z) => { const d = x - coastAt(z); if (d > -90) return 0.05; return 0.3 + 0.28 * Math.sin(x * 0.013 + 1.1) * Math.cos(z * 0.017) + 0.22 * Math.sin((x + 0.7 * z) * 0.041); },
});
land.add(veg.group);
const ocean = createOcean(sim.renderer, sim.sky, { wind: 7, windDir: 240, fetch: 400 });
const DR = [-400, -3000, 5600, 3000];
ocean.setDepth(depthTexture(hf, DR, 256), DR);
scene.add(ocean.mesh);

const { site, arms } = buildSite(hf);
scene.add(site);
sim.label('Fırlatma rampası', { parent: site, position: [26, PT + 2, 30], className: 'plain' });

// --- Gezegen (uzaktan): kıtalar, okyanus parıltısı, bulutlar. Rampa çevresinde yerel araziyle uyumlu kıyı ---
const globe = new THREE.Mesh(new THREE.SphereGeometry(R, 256, 128), procedural({
  key: 'roket-globe', scale: 1, bump: 0, params: { color: 0xffffff, roughness: 0.5 },
  uniforms: { uCoast: { value: COAST / R } },
  pattern: `
    vec3 q = normalize(p);
    float n = fbm3(q*2.4 + 3.1, 6);
    float land = smoothstep(0.515, 0.54, n);
    float nearPad = (1.0 - smoothstep(0.08, 0.3, length(q.xz)))*step(0.0, q.y);
    float padLand = 1.0 - smoothstep(-0.0003, 0.0003, q.x - uCoast - 0.0002*sin(q.z*R_INV));
    land = mix(land, padLand, nearPad);
    float m = fbm3(q*9.0 + 1.3, 5);
    vec3 lc = mix(vec3(0.16, 0.22, 0.09), vec3(0.47, 0.39, 0.25), smoothstep(0.4, 0.62, m));
    lc = mix(lc, vec3(0.86, 0.9, 0.95), smoothstep(0.9, 0.95, abs(q.z)));
    float shallow = smoothstep(0.47, 0.515, n)*(1.0 - nearPad);
    vec3 oc = mix(vec3(0.012, 0.045, 0.1), vec3(0.03, 0.12, 0.17), shallow);
    col = mix(oc, lc, land);
    rough = mix(0.16, 0.92, land);
    float cl = smoothstep(0.52, 0.72, fbm3(q*7.0 + vec3(0.0, 2.0, 5.0), 6))*(1.0 - 0.85*nearPad);
    col = mix(col, vec3(0.92), cl*0.92);
    rough = mix(rough, 0.95, cl);
    metal = 0.0; h = 0.0;`.replace('R_INV', '6.0e3'),
}));
globe.position.copy(CENTER);
globe.userData.noCast = true; globe.userData.noFit = true;
globe.visible = false;
scene.add(globe);

// Atmosfer ışıması (uzaydan ince mavi hale) + atmosfer sınırı çemberi (veri katmanı)
const limbMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false,
  uniforms: { uC: { value: CENTER }, uR: { value: R }, uH: { value: 9000 }, uSun: { value: new THREE.Vector3() }, uFade: { value: 0 } },
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
  fragmentShader: `uniform vec3 uC, uSun; uniform float uR, uH, uFade; varying vec3 vW;
    void main(){
      vec3 d = normalize(vW - cameraPosition), oc = uC - cameraPosition;
      float t = dot(oc, d); vec3 cp = cameraPosition + d*t; float b = length(cp - uC);
      float g = exp(-max(b - uR, 0.0)/uH)*step(uR, b);
      float lit = smoothstep(-0.25, 0.3, dot(normalize(cp - uC), uSun));
      vec3 c = vec3(0.25, 0.5, 1.0)*g*lit*1.6*uFade;
      gl_FragColor = vec4(c, 0.0);
    }`,
});
const limb = new THREE.Mesh(new THREE.SphereGeometry(R + P.ATM, 128, 64), limbMat);
limb.position.copy(CENTER); limb.frustumCulled = false; limb.userData.noShadow = true; limb.raycast = () => {};
scene.add(limb);
const atmRing = (() => {
  const pts = [];
  for (let i = 0; i <= 256; i++) { const a = i / 256 * Math.PI * 2; pts.push(Math.cos(a) * (R + P.ATM), Math.sin(a) * (R + P.ATM) - R, 0); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0x7dd3fc, dashSize: 12000, gapSize: 9000, transparent: true, opacity: 0.6 }));
  l.computeLineDistances(); l.frustumCulled = false; scene.add(l);
  return l;
})();
const atmLabel = sim.label(`Atmosfer sınırı (${P.ATM / 1000} km)`, { parent: atmRing, position: [-(R + P.ATM) * 0.72, (R + P.ATM) * 0.7 - R, 0], className: 'plain' });

// Uzay kubbesi: irtifa arttıkça gökyüzü kararır, yıldızlar çıkar
const domeMat = new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false, side: THREE.BackSide, fog: false,
  blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  uniforms: { uFade: { value: 0 } },
  vertexShader: 'varying vec3 vD; void main(){ vec4 w = modelMatrix*vec4(position, 1.0); vD = w.xyz - cameraPosition; gl_Position = projectionMatrix*viewMatrix*w; }',
  fragmentShader: `uniform float uFade; varying vec3 vD;
    float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
    void main(){
      vec3 d = normalize(vD);
      vec2 uv = vec2(atan(d.z, d.x)/6.2832 + 0.5, asin(clamp(d.y, -1.0, 1.0))/3.1416 + 0.5);
      vec2 g = uv*vec2(2400.0, 1200.0), gi = floor(g);
      float h = h21(gi);
      float s = step(0.996, h)*smoothstep(0.5, 0.0, length(fract(g) - 0.5))*(0.4 + 2.2*h21(gi + 7.0));
      float band = exp(-pow(dot(d, normalize(vec3(0.2, 0.5, 0.84)))*3.0, 2.0));
      vec3 c = vec3(0.85, 0.9, 1.0)*s*uFade + vec3(0.004, 0.005, 0.009)*band;
      gl_FragColor = vec4(c, uFade);
    }`,
});
const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), domeMat);
dome.renderOrder = -1e8; dome.frustumCulled = false; dome.userData.noShadow = true; dome.raycast = () => {};
scene.add(dome);

// --- Roket ---
const rocket = new THREE.Group();
scene.add(rocket);
let rk = null, stage1 = null, stage2 = null;
const flames1 = createFlame(4), flame2 = createFlame(1);
const smoke = createSmoke(LOW() ? 1100 : 2000);
scene.add(smoke.mesh);
function LOW() { return new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches; }
const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), mat.glow({ color: 0xffd27a, intensity: 6 }));
marker.userData.noShadow = true;
scene.add(marker);
const rocketLbl = sim.label('', { parent: rocket, position: [6, 12, 0], className: 'plain' });

function buildVehicle() {
  flames1.group.removeFromParent(); flame2.group.removeFromParent();
  if (dropped) { disposeRocket({ root: dropped.g }); dropped = null; }
  if (rk) disposeRocket(rk);
  rk = buildRocket(fuelSl.value * 1000, stageSel.value);
  stage1 = rk.s1; stage2 = rk.s2;
  rocket.add(rk.root);
  rk.root.traverse((o) => { if (o.isMesh) o.userData.noFit = true; });
  stage1.add(flames1.group);
  flames1.list.forEach((f, i) => f.position.copy(rk.engines1[i]));
  stage2.add(flame2.group);
  flame2.list[0].position.set(0, rk.nozzle2 ?? 0, 0);
  arms[0].position.y = MOUNT + 4;
  arms[1].position.y = Math.min(MOUNT + rk.height - 5.8, PT + 31);
  rocketLbl.position.set(5, rk.height + 3, 0);
}

// Ayrılan kademe
let dropped = null;

// Patlama
const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2, 0.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
boom.userData.noShadow = true;
scene.add(boom);
let boomT = -1;

// İz ve tahmini yörünge (veri katmanı)
const TRAIL = 5000;
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 3), 3));
trailGeo.setDrawRange(0, 0);
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.8 }));
trail.frustumCulled = false;
scene.add(trail);
let trailN = 0, trailClock = 0;
const ORB_N = 256;
const orbGeo = new THREE.BufferGeometry();
orbGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ORB_N * 3), 3));
const orbLine = new THREE.LineLoop(orbGeo, new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.6 }));
orbLine.frustumCulled = false;
orbLine.visible = false;
scene.add(orbLine);

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
ui.toggle({ label: 'Atmosfer katmanı', value: true, onChange: (v) => { atmRing.visible = v; limb.visible = v; } });
ui.toggle({ label: 'Uçuş izi', value: true, onChange: (v) => (trail.visible = v) });
ui.buttons([
  { label: '📷 Rampa', onClick: () => { followTg.set(true); sim.moveCamera(CAM_PAD.p, CAM_PAD.t); prevPos.copy(rocket.position); } },
  { label: '📷 Yakın', onClick: () => { followTg.set(true); closeUp(); } },
  { label: '🌍 Gezegen', onClick: () => { followTg.set(false); overview(); } },
]);

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
let s, flying = false, outcome = 'pad', lastOutcome = 'pad', armT = 0;
const LABELS = { pad: 'Rampada', ascent: 'Motor çalışıyor', sub: 'Alt yörünge', orbit: 'Yörüngede ✓', escape: 'Kaçış!', crash: 'Yere çakıldı' };

function redesign() {
  if (flying) { designTxt.set('<small>Değişiklikler bir sonraki fırlatmada geçerli (⟲).</small>'); return; }
  s = P.createState(P.design(fuelSl.value * 1000, thrustSl.value * 1000, stageSel.value));
  const m0 = P.mass(s), twr = (thrustSl.value * 1000) / (m0 * P.G0);
  buildVehicle();
  designTxt.set(`Kalkış kütlesi <b>${fmt(m0 / 1000, 1)} t</b> · itki/ağırlık <b>${fmt(twr, 2)}</b>${twr < 1 ? ' ⚠️ kalkamaz' : ''} ·
    toplam Δv <b>${fmt(P.deltaV(s) / 1000, 2)} km/s</b> · boy <b>${fmt(rk.height, 1)} m</b>`);
  placeRocket(true);
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
  boomT = -1; boom.material.opacity = 0; rocket.visible = true;
  trailN = 0; trailGeo.setDrawRange(0, 0); trailClock = 0;
  orbLine.visible = false;
  outcome = lastOutcome = 'pad';
  armT = 0;
  altChart.clear(); velChart.clear();
  sim.hud.hide();
  smoke.clear();
  redesign();
  if (followTg.value) focusRocket(); else overview();
}

// --- Görsel güncelleme ---
const Yv = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), prevPos = new THREE.Vector3(), qTmp = new THREE.Quaternion();
const toWorld = (x, y, out) => out.set(x, y - R + MOUNT, 0);
function placeRocket(snap = false) {
  toWorld(s.x, s.y, rocket.position);
  const r = Math.hypot(s.x, s.y), ux = s.x / r, uy = s.y / r;
  let dx = ux, dy = uy;
  const v = Math.hypot(s.vx, s.vy);
  if (s.engine && !s.landed) { const p = pitchNow; dx = Math.sin(p) * uy + Math.cos(p) * ux; dy = -Math.sin(p) * ux + Math.cos(p) * uy; }
  else if (v > 5 && !s.landed) { dx = s.vx / v; dy = s.vy / v; }
  tmpV.set(dx, dy, 0).normalize();
  rocket.quaternion.slerp(qTmp.setFromUnitVectors(Yv, tmpV), s.landed || snap ? 1 : 0.25);
}
let pitchNow = 0;

const autoActive = () => autoTg.value && s.phase !== 'done' && P.hasFuel(s);

function focusRocket() {
  if (!s || s.landed) sim.moveCamera(CAM_PAD.p, CAM_PAD.t);
  else closeUp();
  prevPos.copy(rocket.position);
}
function closeUp() {
  const p = rocket.position, h = rk ? rk.height : 17;
  const up = tmpV.set(0, 1, 0).applyQuaternion(rocket.quaternion);
  sim.moveCamera([p.x - h * 1.6, p.y + up.y * h * 0.5 - h * 0.2, p.z + h * 2.2], [p.x + up.x * h * 0.45, p.y + up.y * h * 0.45, p.z]);
  prevPos.copy(rocket.position);
}
function overview() { sim.moveCamera([R * 0.35, -R + R * 0.6, R * 2.9], [0, -R, 0]); }

function pushTrail() {
  const arr = trailGeo.attributes.position.array;
  if (trailN >= TRAIL) { arr.copyWithin(0, 3); trailN = TRAIL - 1; }
  toWorld(s.x, s.y, tmpV);
  arr.set([tmpV.x, tmpV.y, tmpV.z], trailN * 3);
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
    arr.set([Math.cos(ang) * r, Math.sin(ang) * r - R + MOUNT, 0], i * 3);
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

// --- Fizik döngüsü ---
let chartClock = 0, uiTick = 0;
function stepFlight(dt) {
  if (!flying) return;
  // Kalkışı görebilmek için ilk saniyelerde hızlandırma kademeli artar (fizik adımları aynı)
  const warp = Math.min(warpSl.value, 1 + s.t * 0.35);
  let remaining = Math.min(dt, 0.8) * warp;
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
      // Boş kademe dünyaya taşınır, yavaşça geride kalıp döner
      const g = new THREE.Group();
      rocket.updateMatrixWorld();
      g.position.copy(rocket.position); g.quaternion.copy(rocket.quaternion);
      scene.add(g); g.add(stage1);
      flames1.group.visible = false;
      dropped = { g, v: new THREE.Vector3(s.vx, s.vy, 0).multiplyScalar(0.985), t: 0 };
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
    if (c === 'crash') {
      finish('crash'); boomT = 0; boom.position.copy(rocket.position); rocket.visible = false; flying = false;
      for (let i = 0; i < 60; i++) smoke.emit(boom.position.x + (Math.random() - 0.5) * 20, boom.position.y + Math.random() * 10, (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 30, 8 + Math.random() * 14, (Math.random() - 0.5) * 30, { s0: 8, s1: 50, life: 16, a: 0.7, heat: 0.9, alb: 0.35, rise: 3 });
    } else if (c === 'orbit' && lastOutcome !== 'orbit') finish('orbit');
    else if (c === 'escape') finish('escape');
    else if (c === 'sub' && lastOutcome === 'ascent' && !autoActive()) sim.toast('Alt yörünge: periapsis atmosferin içinde, roket geri düşecek', 'warn');
    lastOutcome = c;
  }
  if (dropped) {
    dropped.t += dt;
    dropped.v.y -= 9.81 * dt * warp;
    dropped.g.position.addScaledVector(dropped.v, dt * warp);
    dropped.g.rotateZ(dt * 0.5);
    if (dropped.t > 8) dropped.g.visible = false;
  }
  chartClock += dt * warp;
  if (chartClock > 2) {
    chartClock = 0;
    const r = Math.hypot(s.x, s.y);
    altChart.push([(r - P.R) / 1000]);
    velChart.push([Math.hypot(s.vx, s.vy) / 1000, Math.sqrt(P.MU / r) / 1000]);
  }
}
sim.onUpdate((dt) => stepFlight(dt));

// --- Görsel döngü: alev, duman, kamera, gökyüzü/uzay geçişi ---
const nozW = new THREE.Vector3(), lastNoz = new THREE.Vector3(), dirW = new THREE.Vector3(), camC = new THREE.Vector3();
let hadNoz = false, simT = 0;
function stepVisual(rdt) {
  if (!s) return;
  const vdt = sim.paused ? 0 : rdt * Math.min(sim.speed, 2);
  simT += vdt;
  if (rocket.visible) placeRocket();
  // Kamera takibi: roketin yer değiştirmesi kadar kamerayı kaydır
  if (followTg.value && sim.controls) {
    tmpV.subVectors(rocket.position, prevPos);
    camera.position.add(tmpV); sim.controls.target.add(tmpV);
  }
  prevPos.copy(rocket.position);
  // Kollar kuleye döner
  if (flying) armT = Math.min(1, armT + vdt * 0.6);
  arms[0].rotation.y = THREE.MathUtils.smoothstep(armT, 0, 0.7) * 1.45;
  arms[1].rotation.y = THREE.MathUtils.smoothstep(armT, 0.15, 1) * 1.45;

  const r = Math.hypot(s.x, s.y), alt = r - P.R;
  const dens = P.density(alt) / P.RHO0;
  const on = s.engine && !s.crashed && P.hasFuel(s) && rocket.visible;
  flames1.group.visible = on && s.cur === 0;
  flame2.group.visible = on && s.cur === 1;
  if (on) {
    const vac = clamp(1 - dens, 0, 1);
    const fl = s.cur === 0 ? flames1.list : flame2.list;
    const eR = s.cur === 0 ? rk.eR : rk.bell2R;
    const len = eR * (s.cur === 0 ? 16 : 10) * (0.92 + Math.random() * 0.16) * (1 + vac * 1.2);
    for (const f of fl) {
      f.scale.set(eR * (1 + vac * 2.5), len, eR * (1 + vac * 2.5));
      f.material.uniforms.uTime.value = simT; f.material.uniforms.uSea.value = dens; f.material.uniforms.uPower.value = 1 - vac * 0.45;
    }
    // Egzoz çıkışı (dünya)
    rocket.updateMatrixWorld();
    nozW.set(0, s.cur === 0 ? 0 : rk.nozzle2, 0).applyMatrix4(rocket.matrixWorld);
    dirW.set(0, -1, 0).applyQuaternion(rocket.quaternion);
    if (!hadNoz) { lastNoz.copy(nozW); hadNoz = true; }
    const hAbove = rocket.position.y - MOUNT;
    // Rampa: alev kanalından doğuya taşan bulut + su püskürtme buharı
    if (hAbove < 180 && vdt > 0) {
      const k = Math.max(0, 1 - hAbove / 180), n = Math.round((LOW() ? 3 : 5) * k) + (Math.random() < 0.5 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        smoke.emit(44 + Math.random() * 6, GL + 1.5 + Math.random() * 2, (Math.random() - 0.5) * 7, 22 + Math.random() * 16, 2 + Math.random() * 5, (Math.random() - 0.5) * 14,
          { s0: 5, s1: 30, life: 14, a: 0.6, heat: hAbove < 30 ? 0.25 : 0, drag: 0.35, rise: 1.2, alb: 0.9 });
        const a = Math.random() * Math.PI * 2;
        smoke.emit(Math.cos(a) * 7, PT + 0.5, Math.sin(a) * 7, Math.cos(a) * 9, 2 + Math.random() * 3, Math.sin(a) * 9, { s0: 3, s1: 18, life: 10, a: 0.45, drag: 0.5, rise: 1.6, alb: 1.0 });
      }
    }
    // Egzoz izi: yoğun havada kalın duman, seyrekleştikçe kaybolur
    const dist = nozW.distanceTo(lastNoz), trailA = 0.55 * Math.min(1, dens * 2.5);
    if (trailA > 0.01 && vdt > 0) {
      const spacing = 1.6 + alt * 0.004, n = Math.min(LOW() ? 18 : 32, Math.floor(dist / spacing));
      for (let i = 0; i < n; i++) {
        const t = (i + Math.random()) / Math.max(n, 1);
        smoke.emit(lerp(lastNoz.x, nozW.x, t) + dirW.x * 3, lerp(lastNoz.y, nozW.y, t) + dirW.y * 3, (Math.random() - 0.5) * 1.5,
          dirW.x * 20 + (Math.random() - 0.5) * 4, dirW.y * 20 + (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4,
          { s0: 2.4, s1: 14 + 16 * (1 - dens), life: 9, a: trailA, heat: 0.9, drag: 0.9, rise: 0.5, alb: 0.88 });
      }
      if (n > 0) lastNoz.copy(nozW);
    } else lastNoz.copy(nozW);
  } else hadNoz = false;
  // Rampada: sıvı oksijen havalandırma buharı (soğuk, aşağı çöker)
  if (!flying && s.landed && rk && vdt > 0 && Math.random() < 0.6) {
    tmpV.copy(rk.vent).applyMatrix4(rocket.matrixWorld);
    smoke.emit(tmpV.x, tmpV.y, tmpV.z, 0.9 + Math.random() * 0.6, -0.4, 0.5 + (Math.random() - 0.5) * 0.6, { s0: 0.35, s1: 3.2, life: 5, a: 0.3, drag: 1.2, rise: -0.35, alb: 1.0 });
  }
  smoke.update(vdt);
  smoke.light(sim.sky, camera);
  veg.update(simT, 0.8);

  // Patlama
  if (boomT >= 0) {
    boomT += rdt;
    boom.scale.setScalar(4 + boomT * 60);
    boom.material.opacity = Math.max(0, 1 - boomT / 1.4);
    if (boomT > 1.5) boomT = -1;
  }

  // İrtifa geçişi: gök kararır, küre görünür, yakın katmanlar gizlenir; yakın/uzak düzlemler kameraya göre
  const camAlt = camera.position.distanceTo(CENTER) - R;
  const d = camera.position.distanceTo(sim.controls ? sim.controls.target : camC.set(...CAM_PAD.t));
  const fade = THREE.MathUtils.smoothstep(camAlt, 6000, 48000);
  domeMat.uniforms.uFade.value = fade;
  dome.visible = fade > 0.002;
  dome.position.copy(camera.position);
  const high = camAlt > 2500;
  globe.visible = high;
  ocean.mesh.visible = !high;
  land.visible = site.visible = camAlt < 26000;
  limbMat.uniforms.uFade.value = THREE.MathUtils.smoothstep(camAlt, 15000, 90000);
  limbMat.uniforms.uSun.value.copy(sim.sky.sunDir);
  if (sim.sky.fog) sim.sky.fog.density = 1 / (14000 + camAlt * 30);
  const near = clamp(d * 0.003, 0.15, 20000);
  const far = high ? Math.sqrt((R + camAlt) ** 2 - R * R) + d + R * 0.3 : 90000;
  if (Math.abs(near - camera.near) > near * 0.1 || Math.abs(far - camera.far) > far * 0.05) { camera.near = near; camera.far = far; camera.updateProjectionMatrix(); }
  dome.scale.setScalar(camera.far * 0.8);
  if (sim.controls) sim.controls.maxPolarAngle = camAlt > 20000 ? Math.PI : Math.PI * 0.495;
  // Uzaktan işaret: roket görünmeyecek kadar küçükse parlak nokta
  const rd = camera.position.distanceTo(rocket.position);
  marker.visible = rocket.visible && rd > 4000;
  marker.position.copy(rocket.position);
  marker.scale.setScalar(rd * 0.004);
}
sim.onRender(stepVisual);

sim.onRender(() => {
  if (!s) return;
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
  rocketLbl.setText(`${fmt(alt / 1000, 1)} km · ${fmt(v / 1000, 2)} km/s`);
  rocketLbl.visible = !s.landed && rocket.visible;
  atmLabel.visible = atmRing.visible && camera.position.distanceTo(CENTER) > R * 1.5;
  updateOrbitLine(el);
});

sim.formatTime = () => (s ? `T+${fmtClock(s.t)}` : 'T+00:00');
sim.onReset(() => resetFlight());
syncGuide();
resetFlight();
// Açılış karesi canlı olsun: havalandırma buharı birkaç saniye önceden
for (let i = 0; i < 50; i++) stepVisual(0.1);
// Test/gösterim: ?t=saniye → fırlatıp o ana kadar ilerlet
{
  const q = +new URLSearchParams(location.search).get('t');
  if (q > 0) { launch(); for (let i = 0; i < q * 10; i++) { stepFlight(0.1); stepVisual(0.1); } }
}
