// Güneş Sistemi Yapıcı — N-cisim kütleçekimi (hız-Verlet), yörünge izleri, çarpışma ve kaçış.
import { createSim, THREE, rand, fmt, disposeObject } from '@core';

const G = 1;
const SUBSTEPS = 8;
const TRAIL = 360;
const COLORS = [0x60a5fa, 0xf97316, 0x22c55e, 0xe879f9, 0xfacc15, 0x2dd4bf, 0xf87171, 0xa3e635, 0x93c5fd, 0xfda4af];

const sim = createSim({
  background: 0x03050c,
  camera: { position: [0, 42, 46], fov: 50, far: 5000 },
  controls: { maxDistance: 400, minDistance: 6, maxPolarAngle: Math.PI },
  lights: false,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Her cisim diğer tüm cisimleri Newton'un kütleçekim yasasıyla çeker: <b>F = G·m₁·m₂ / r²</b>.
    Bir gezegenin dairesel yörüngede kalması için hızı tam olarak <b>v = √(G·M / r)</b> olmalıdır.</p>
    <h3>Dene</h3>
    <ul>
      <li>Hız çarpanını <b>1,0</b> yap: dairesel yörünge. 1,0–1,41 arası: elips. <b>√2 ≈ 1,41</b> üstü: kaçış hızı, gezegen sistemden çıkar.</li>
      <li>Çok ağır bir gezegen ekle (Jüpiter'in 10 katı), komşularının yörüngelerini nasıl bozduğunu izle.</li>
      <li>"İkili yıldız" hazır ayarında gezegenlerin kaotik davranışını gör.</li>
    </ul>
    <p><small>Birimler ölçeklenmiştir; mesafeler ve kütleler gerçek oranlarda değildir.</small></p>`,
});
sim.formatTime = (t) => `${fmt(t / (2 * Math.PI), 1)} yıl`;

// --- Arka plan yıldızları ---
{
  const n = 2500, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(rand(900, 1500));
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sim.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xbfd4ff, size: 1.6, sizeAttenuation: false })));
}
sim.scene.add(new THREE.AmbientLight(0x5a6688, 1.4));

const grid = new THREE.PolarGridHelper(80, 8, 16, 96, 0x1e293b, 0x172033);
grid.material.transparent = true;
grid.material.opacity = 0.35;
sim.scene.add(grid);

// --- Cisimler ---
/** @type {{mesh:THREE.Object3D, m:number, r:number, p:THREE.Vector3, v:THREE.Vector3, a:THREE.Vector3, star:boolean, trail?:any, label?:any, name:string, color:number}[]} */
let bodies = [];
let collisions = 0, escaped = 0, planetNo = 0;

function makeStar(m, pos, vel, color = 0xffd27a) {
  const r = 1.2 + Math.cbrt(m) * 0.12;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshBasicMaterial({ color })));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(r * 7);
  group.add(glow);
  const light = new THREE.PointLight(color, 3, 0, 0);
  group.add(light);
  return addBody({ mesh: group, m, r, p: new THREE.Vector3(...pos), v: new THREE.Vector3(...vel), star: true, name: 'Yıldız', color });
}

function makePlanet(m, dist, speedMul, { angle = rand(0, Math.PI * 2), incl = 0, name } = {}) {
  const color = COLORS[planetNo % COLORS.length];
  planetNo++;
  const r = 0.35 + Math.cbrt(m) * 0.28;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 }));
  // Merkezdeki kütleye (tüm yıldızların toplamı ve kütle merkezi) göre dairesel hız
  const cm = centerOfMass(true);
  const p = new THREE.Vector3(Math.cos(angle) * dist, Math.sin(incl) * dist * 0.1, Math.sin(angle) * dist).add(cm.p);
  const rel = p.clone().sub(cm.p);
  const vCirc = Math.sqrt((G * cm.m) / rel.length());
  const v = new THREE.Vector3(-rel.z, 0, rel.x).normalize().multiplyScalar(vCirc * speedMul).add(cm.v);
  const b = addBody({ mesh, m, r, p, v, star: false, name: name || `Gezegen ${planetNo}`, color });
  // İz
  const tp = new Float32Array(TRAIL * 3);
  for (let i = 0; i < TRAIL; i++) tp.set([p.x, p.y, p.z], i * 3);
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  const line = new THREE.Line(tg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }));
  line.frustumCulled = false;
  sim.scene.add(line);
  b.trail = line;
  b.label = sim.label(b.name, { parent: mesh, position: [0, r + 0.9, 0], className: 'plain' });
  b.label.visible = showLabels.value;
  line.visible = showTrails.value;
  return b;
}

function addBody(b) {
  b.a = new THREE.Vector3();
  sim.scene.add(b.mesh);
  b.mesh.position.copy(b.p);
  bodies.push(b);
  return b;
}

function removeBody(b) {
  disposeObject(b.mesh);
  if (b.trail) disposeObject(b.trail);
  bodies = bodies.filter((x) => x !== b);
}

function centerOfMass(starsOnly = false) {
  const p = new THREE.Vector3(), v = new THREE.Vector3();
  let m = 0;
  for (const b of bodies) {
    if (starsOnly && !b.star) continue;
    p.addScaledVector(b.p, b.m); v.addScaledVector(b.v, b.m); m += b.m;
  }
  if (m > 0) { p.divideScalar(m); v.divideScalar(m); }
  return { p, v, m };
}

let _glow;
function glowTexture() {
  if (_glow) return _glow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,230,160,.55)');
  gr.addColorStop(1, 'rgba(255,200,100,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

// --- Fizik ---
const tmp = new THREE.Vector3();
function accelerations() {
  for (const b of bodies) b.a.set(0, 0, 0);
  for (let i = 0; i < bodies.length; i++) {
    const A = bodies[i];
    for (let j = i + 1; j < bodies.length; j++) {
      const B = bodies[j];
      tmp.subVectors(B.p, A.p);
      const d2 = tmp.lengthSq() + 0.05; // yumuşatma
      const inv = G / (d2 * Math.sqrt(d2));
      A.a.addScaledVector(tmp, B.m * inv);
      B.a.addScaledVector(tmp, -A.m * inv);
    }
  }
}

function step(h) {
  for (const b of bodies) { b.v.addScaledVector(b.a, h / 2); b.p.addScaledVector(b.v, h); }
  accelerations();
  for (const b of bodies) b.v.addScaledVector(b.a, h / 2);
}

function handleCollisions() {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      if (A.p.distanceTo(B.p) < (A.r + B.r) * 0.85) {
        // Küçük olan büyüğe katılır (momentum korunur)
        const [big, small] = A.m >= B.m ? [A, B] : [B, A];
        big.v.multiplyScalar(big.m).addScaledVector(small.v, small.m).divideScalar(big.m + small.m);
        big.m += small.m;
        removeBody(small);
        collisions++;
        sim.toast(`💥 ${small.name}, ${big.name} ile çarpıştı`, 'bad');
        return handleCollisions();
      }
    }
  }
}

function checkEscapes() {
  const cm = centerOfMass(true);
  for (const b of [...bodies]) {
    if (!b.star && b.p.distanceTo(cm.p) > 260) {
      removeBody(b);
      escaped++;
      sim.toast(`🚀 ${b.name} sistemden kaçtı`, 'warn');
    }
  }
}

let trailTick = 0;
sim.onUpdate((dt) => {
  const h = Math.min(dt, 0.05) / SUBSTEPS * timeScale.value;
  for (let k = 0; k < SUBSTEPS; k++) step(h);
  handleCollisions();
  checkEscapes();
  for (const b of bodies) b.mesh.position.copy(b.p);
  if (++trailTick % 2 === 0) {
    for (const b of bodies) {
      if (!b.trail) continue;
      const arr = b.trail.geometry.attributes.position.array;
      arr.copyWithin(0, 3);
      arr.set([b.p.x, b.p.y, b.p.z], (TRAIL - 1) * 3);
      b.trail.geometry.attributes.position.needsUpdate = true;
    }
  }
});

sim.onRender((dt) => {
  for (const b of bodies) if (!b.star) b.mesh.rotation.y += dt * 0.8;
});

// --- Hazır ayarlar ---
const PRESETS = {
  ic: () => {
    makeStar(sunMass.value, [0, 0, 0], [0, 0, 0]);
    makePlanet(1, 7, 1, { name: 'Merkür' });
    makePlanet(3, 11, 1, { name: 'Venüs' });
    makePlanet(3.2, 15, 1, { name: 'Dünya' });
    makePlanet(1.5, 20, 1, { name: 'Mars' });
  },
  tam: () => {
    makeStar(sunMass.value, [0, 0, 0], [0, 0, 0]);
    [['Merkür', 0.6, 6], ['Venüs', 2.5, 9], ['Dünya', 3, 12.5], ['Mars', 1.2, 16], ['Jüpiter', 40, 25],
      ['Satürn', 18, 34], ['Uranüs', 8, 42], ['Neptün', 9, 50]].forEach(([name, m, d]) => makePlanet(m, d, 1, { name }));
  },
  ikili: () => {
    const m = sunMass.value / 2, d = 4;
    const v = Math.sqrt((G * m) / (4 * d));
    makeStar(m, [-d, 0, 0], [0, 0, -v], 0xffd27a);
    makeStar(m, [d, 0, 0], [0, 0, v], 0x9ecbff);
    makePlanet(2, 22, 1, { name: 'Uzak' });
    makePlanet(1, 13, 1, { name: 'Yakın' });
  },
  kaos: () => {
    makeStar(sunMass.value, [0, 0, 0], [0, 0, 0]);
    for (let i = 0; i < 7; i++) makePlanet(rand(5, 60), rand(8, 30), rand(0.8, 1.2));
  },
};

function load(name) {
  for (const b of [...bodies]) removeBody(b);
  collisions = escaped = planetNo = 0;
  distChart.clear();
  PRESETS[name]();
  accelerations();
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır sistemler');
const preset = ui.segmented({
  options: [{ value: 'ic', label: 'İç gezegenler' }, { value: 'tam', label: 'Tam sistem' }, { value: 'ikili', label: 'İkili yıldız' }, { value: 'kaos', label: 'Kaos' }],
  value: 'ic', onChange: (v) => load(v),
});
const sunMass = ui.slider({ label: 'Yıldız kütlesi', min: 200, max: 3000, step: 50, value: 1000, format: (v) => `${fmt(v / 1000, 2)} M☉`,
  onChange: (v) => { const stars = bodies.filter((b) => b.star); stars.forEach((s) => (s.m = v / stars.length)); } });
const timeScale = ui.slider({ label: 'Zaman akışı', min: 0.2, max: 5, step: 0.1, value: 1.5, unit: '×' });

ui.section('Yeni gezegen ekle');
const newDist = ui.slider({ label: 'Yıldıza uzaklık', min: 5, max: 60, step: 0.5, value: 18, unit: 'br' });
const newMass = ui.slider({ label: 'Kütle', min: 0.5, max: 200, step: 0.5, value: 3, format: (v) => `${fmt(v / 3, 1)} × Dünya` });
const newSpeed = ui.slider({ label: 'Hız çarpanı (1 = dairesel)', min: 0.3, max: 1.6, step: 0.01, value: 1,
  format: (v) => `${fmt(v, 2)} · ${v < 0.98 ? 'içe düşer' : v <= 1.02 ? 'dairesel' : v < 1.414 ? 'elips' : 'kaçış!'}` });
ui.buttons([
  { label: '➕ Gezegen ekle', variant: 'primary', onClick: () => { makePlanet(newMass.value, newDist.value, newSpeed.value); accelerations(); } },
  { label: '🗑 Son eklenen', onClick: () => { const p = bodies.filter((b) => !b.star).pop(); if (p) removeBody(p); } },
]);

ui.section('Görünüm');
const showTrails = ui.toggle({ label: 'Yörünge izleri', value: true, onChange: (v) => bodies.forEach((b) => b.trail && (b.trail.visible = v)) });
const showLabels = ui.toggle({ label: 'İsim etiketleri', value: true, onChange: (v) => bodies.forEach((b) => b.label && (b.label.visible = v)) });
ui.toggle({ label: 'Kutupsal ızgara', value: true, onChange: (v) => (grid.visible = v) });

ui.section('Durum');
const stPlanets = ui.stat({ label: 'Gezegen' });
const stCollide = ui.stat({ label: 'Çarpışma' });
const stEscape = ui.stat({ label: 'Kaçan' });
const stEnergy = ui.stat({ label: 'Toplam enerji' });
const distChart = ui.chart({ title: 'Yıldıza uzaklık (ilk 5 gezegen)', series: [0, 1, 2, 3, 4].map((i) => ({ name: `${i + 1}`, color: '#' + COLORS[i].toString(16).padStart(6, '0') })), maxPoints: 240 });

function energy() {
  let e = 0;
  for (let i = 0; i < bodies.length; i++) {
    const A = bodies[i];
    e += 0.5 * A.m * A.v.lengthSq();
    for (let j = i + 1; j < bodies.length; j++) e -= (G * A.m * bodies[j].m) / A.p.distanceTo(bodies[j].p);
  }
  return e;
}

let statTick = 0;
sim.onUpdate(() => {
  if (++statTick % 12) return;
  const planets = bodies.filter((b) => !b.star);
  stPlanets.set(planets.length);
  stCollide.set(collisions, collisions ? 'bad' : '');
  stEscape.set(escaped, escaped ? 'warn' : '');
  stEnergy.set(fmt(energy(), 0));
  const cm = centerOfMass(true);
  distChart.push([0, 1, 2, 3, 4].map((i) => (planets[i] ? planets[i].p.distanceTo(cm.p) : 0)));
  // Grafik serilerini gezegen renkleriyle eşle
  distChart.el.querySelectorAll('.legend i').forEach((el, i) => { if (planets[i]) el.style.background = '#' + planets[i].color.toString(16).padStart(6, '0'); });
});

// Gezegene tıkla → bilgi
sim.onClick(() => bodies.map((b) => b.mesh), (hit) => {
  const b = bodies.find((x) => x.mesh === hit.object || x.mesh === hit.object.parent);
  if (!b) return;
  const cm = centerOfMass(true);
  const d = b.p.distanceTo(cm.p);
  const vc = Math.sqrt((G * cm.m) / d);
  sim.toast(`<b>${b.name}</b> · uzaklık ${fmt(d, 1)} · hız ${fmt(b.v.length(), 2)} (dairesel için ${fmt(vc, 2)})`);
});

sim.onReset(() => load(preset.value));
load('ic');
