// Güneş Sistemi Yapıcı — N-cisim kütleçekimi (hız-Verlet), yörünge izleri, çarpışma ve kaçış.
import { createSim, THREE, rand, fmt, disposeObject, clamp } from '@core';
import { createPlanet, createStar, starUniform, PLANET_LOOKS } from './planets.js';

const G = 1;
const SUBSTEPS = 8;
const TRAIL = 360;
const COLORS = [0x60a5fa, 0xf97316, 0x22c55e, 0xe879f9, 0xfacc15, 0x2dd4bf, 0xf87171, 0xa3e635, 0x93c5fd, 0xfda4af];

const sim = createSim({
  space: { star: [0, 0, 0], power: 1, milky: 0.9, nebula: 0.7, stars: 0.55, galaxyTilt: 55 },
  look: { bloomStrength: 0.4 },
  camera: { position: [0, 42, 46], fov: 45, near: 0.05, far: 5000 },
  controls: { maxDistance: 400, minDistance: 1.2, maxPolarAngle: Math.PI },
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

// Kutupsal ızgara (veri katmanı; varsayılan kapalı)
const grid = new THREE.PolarGridHelper(80, 8, 16, 96, 0x33415a, 0x243047);
grid.material.transparent = true;
grid.material.opacity = 0.25;
grid.material.depthWrite = false;
grid.visible = false;
sim.scene.add(grid);

// --- Cisimler ---
/** @type {{mesh:THREE.Object3D, m:number, r:number, p:THREE.Vector3, v:THREE.Vector3, a:THREE.Vector3, star:boolean, trail?:any, label?:any, name:string, color:number, vis?:any, light?:any}[]} */
let bodies = [];
let collisions = 0, escaped = 0, planetNo = 0;
const engineLight = sim.sky.light; // uzay ortamının noktasal yıldız ışığı (ilk yıldızı izler)

function makeStar(m, pos, vel, color = 0xfff0dc) {
  const r = 1.2 + Math.cbrt(m) * 0.12;
  const vis = createStar(r, { color, intensity: 2.6, corona: 0.8 });
  const group = vis.group;
  const nStars = bodies.filter((b) => b.star).length;
  let light = null;
  if (nStars === 0) { engineLight.color.set(color).lerp(new THREE.Color(0xffffff), 0.45); }
  else { light = new THREE.PointLight(new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45), Math.PI * 2.2, 0, 0); group.add(light); }
  return addBody({ mesh: group, vis, light, m, r, p: new THREE.Vector3(...pos), v: new THREE.Vector3(...vel), star: true, name: 'Yıldız', color });
}

// Gezegen görünümü: isimliler gerçek karşılığına, eklenenler kütleye göre (kayalık, Dünya benzeri, buz devi, gaz devi)
const NAME_LOOK = { 'Merkür': 'merkur', 'Venüs': 'venus', 'Dünya': 'dunya', 'Mars': 'mars', 'Jüpiter': 'jupiter', 'Satürn': 'saturn', 'Uranüs': 'uranus', 'Neptün': 'neptun' };
function lookFor(name, m) {
  if (NAME_LOOK[name]) return PLANET_LOOKS[NAME_LOOK[name]];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  if (m < 1.5) return { ...PLANET_LOOKS.merkur, c1: pick([0x6b6560, 0x7a6a5a, 0x5e5a58]), spin: rand(0.2, 1) };
  if (m < 7) return pick([PLANET_LOOKS.dunya, PLANET_LOOKS.mars, { ...PLANET_LOOKS.dunya, clouds: 0.62 }, PLANET_LOOKS.venus]);
  if (m < 25) return pick([PLANET_LOOKS.neptun, PLANET_LOOKS.uranus, { ...PLANET_LOOKS.neptun, c1: 0x5a8fb0, c2: 0x3f7394, c3: 0x8fc0d8, spot: 0 }]);
  const g = pick([PLANET_LOOKS.jupiter, PLANET_LOOKS.saturn, { ...PLANET_LOOKS.jupiter, c1: 0xd9b89a, c2: 0x7d4f3a, c3: 0xefe0cc, spot: 0 }]);
  return Math.random() < 0.35 && !g.ring ? { ...g, ring: { opacity: 0.6 } } : g;
}

function makePlanet(m, dist, speedMul, { angle = rand(0, Math.PI * 2), incl = 0, name } = {}) {
  const color = COLORS[planetNo % COLORS.length];
  planetNo++;
  const r = 0.35 + Math.cbrt(m) * 0.28;
  const vis = createPlanet(r, lookFor(name, m));
  vis.group.rotation.y = rand(0, Math.PI * 2);
  const mesh = vis.group;
  // Merkezdeki kütleye (tüm yıldızların toplamı ve kütle merkezi) göre dairesel hız
  const cm = centerOfMass(true);
  const p = new THREE.Vector3(Math.cos(angle) * dist, Math.sin(incl) * dist * 0.1, Math.sin(angle) * dist).add(cm.p);
  const rel = p.clone().sub(cm.p);
  const vCirc = Math.sqrt((G * cm.m) / rel.length());
  const v = new THREE.Vector3(-rel.z, 0, rel.x).normalize().multiplyScalar(vCirc * speedMul).add(cm.v);
  const b = addBody({ mesh, vis, m, r, p, v, star: false, name: name || `Gezegen ${planetNo}`, color });
  // İz: kuyruğa doğru sönen eklemeli çizgi
  const tp = new Float32Array(TRAIL * 3), tc = new Float32Array(TRAIL * 3);
  const c = new THREE.Color(color);
  for (let i = 0; i < TRAIL; i++) {
    tp.set([p.x, p.y, p.z], i * 3);
    const f = Math.pow(i / (TRAIL - 1), 1.6) * 0.75;
    tc.set([c.r * f, c.g * f, c.b * f], i * 3);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
  const line = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  line.frustumCulled = false;
  sim.scene.add(line);
  b.trail = line;
  b.label = sim.label(b.name, { parent: mesh, position: [0, r + 0.5, 0], className: 'plain' });
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
  if (follow === b) follow = null;
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

// --- Kamera: genel bakış ya da seçili gezegeni yakından izleme (yıldıza göre aynı açıyı korur) ---
let follow = null, followAng = 0, tween = null;
const followLast = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0), tmpO = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
const angAround = (p, c) => Math.atan2(p.z - c.z, p.x - c.x);
function closeView(b) {
  // Gezegenin gündüz–gece sınırı ve arkada yıldız: kamera gezegenin dışında, yıldız kadrajın kenarında
  const cm = centerOfMass(true).p;
  const s = tmpS.copy(cm).sub(b.p).setY(0).normalize();
  const side = tmpA.crossVectors(s, Y).normalize();
  const d = Math.max(b.r * 4.2, 2.2);
  const pos = b.p.clone().addScaledVector(s, -d * 0.35).addScaledVector(side, d * 0.95).addScaledVector(Y, d * 0.28);
  const tgt = b.p.clone().addScaledVector(s, d * 0.3);
  return [pos, tgt];
}
function overView() {
  const far = Math.max(28, ...bodies.filter((b) => !b.star).map((b) => b.p.length() * 1.15));
  return [new THREE.Vector3(0, far * 0.62, far * 0.95), new THREE.Vector3(0, 0, 0)];
}
function goTo(fn, dur = 1.4) {
  const c = sim.controls;
  if (dur <= 0) { const [p, t] = fn(); sim.moveCamera(p.toArray(), t.toArray()); tween = null; return; }
  tween = { fn, t: 0, dur, p0: sim.camera.position.clone(), t0: c.target.clone() };
}
function setFollow(b, dur = 1.4) {
  follow = b;
  if (b) { followAng = angAround(b.p, centerOfMass(true).p); followLast.copy(b.p); goTo(() => closeView(b), dur); }
  else goTo(overView, dur);
}

sim.onRender((dt) => {
  for (const b of bodies) {
    if (b.star) b.vis.update(dt * (sim.paused ? 0 : 1));
    else b.vis.spin(sim.paused ? 0 : dt);
  }
  const star = bodies.find((b) => b.star);
  if (star) { engineLight.position.copy(star.p); starUniform.value.copy(star.p); }
  const c = sim.controls;
  if (tween) {
    tween.t += dt;
    const k = clamp(tween.t / tween.dur, 0, 1), e = k * k * (3 - 2 * k);
    const [p1, t1] = tween.fn();
    sim.camera.position.lerpVectors(tween.p0, p1, e);
    c.target.lerpVectors(tween.t0, t1, e);
    if (follow) { followAng = angAround(follow.p, centerOfMass(true).p); followLast.copy(follow.p); }
    if (k >= 1) tween = null;
  } else if (follow) {
    // Gezegenle birlikte hareket et; yörünge açısı kadar döndür → aynı aydınlanma evresi
    const cm = centerOfMass(true).p;
    const ang = angAround(follow.p, cm);
    let da = ang - followAng; da = Math.atan2(Math.sin(da), Math.cos(da));
    followAng = ang;
    tmpO.copy(sim.camera.position).sub(c.target).applyAxisAngle(Y, -da);
    tmpB.copy(c.target).sub(followLast).applyAxisAngle(Y, -da);
    followLast.copy(follow.p);
    c.target.copy(follow.p).add(tmpB);
    sim.camera.position.copy(c.target).add(tmpO);
  }
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
  tween = null;
  if (camSel.value === 'yakin') setFollow(bodies.find((b) => b.name === 'Dünya') || bodies.find((b) => !b.star && b.m < 20) || bodies.find((b) => !b.star), first ? 0 : 1.4);
  else setFollow(null, first ? 0 : 1.4);
  first = false;
}
let first = true;

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
ui.toggle({ label: 'Kutupsal ızgara', value: false, onChange: (v) => (grid.visible = v) });

ui.section('Kamera');
const camSel = ui.segmented({
  options: [{ value: 'genel', label: 'Genel bakış' }, { value: 'yakin', label: 'Gezegeni izle' }],
  value: 'yakin', onChange: (v) => { if (v === 'genel') setFollow(null); else setFollow(bodies.find((b) => b.name === 'Dünya') || bodies.find((b) => !b.star) || null); },
});
ui.text('Bir gezegene tıkla: kamera onu yakından izler.', '');

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
sim.onClick(() => bodies.map((b) => b.vis.surface), (hit) => {
  let o = hit.object, b = null;
  while (o && !b) { b = bodies.find((x) => x.mesh === o); o = o.parent; }
  if (!b) return;
  if (!b.star) { setFollow(b); camSel.set('yakin'); }
  const cm = centerOfMass(true);
  const d = b.p.distanceTo(cm.p);
  const vc = Math.sqrt((G * cm.m) / d);
  sim.toast(`<b>${b.name}</b> · uzaklık ${fmt(d, 1)} · hız ${fmt(b.v.length(), 2)} (dairesel için ${fmt(vc, 2)})`);
});

sim.onReset(() => load(preset.value));
load('ic');
