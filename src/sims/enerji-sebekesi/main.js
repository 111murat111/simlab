// Enerji Şebekesi — 24 saatlik talep eğrisi, güneş/rüzgâr değişkenliği ve öncelik sıralı dağıtım (ördek eğrisi).
import { createSim, THREE, fmt, clamp, lerp, rand, seeded, BufferGeometryUtils } from '@core';
import { SRC, STACK, step, newState, sunHeight, marginalCost } from './model.js';

const SEC_PER_HOUR = 2.5; // 1 gün = 60 s (1× hızda)
const START_H = 16;
const SUB = 1 / 12; // 5 dakikalık dağıtım adımı
const NDIST = 8;

const sim = createSim({
  background: 0x7fb2e5,
  camera: { position: [0, 40, 57], target: [0, 0, -4], fov: 50 },
  controls: { maxDistance: 110, minDistance: 15 },
  fog: [80, 170],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Bir şehri besleyen küçük bir elektrik şebekesi. Elektrik depolanamadığı için <b>üretim her an talebe eşit</b>
    olmalıdır. Talep sabah artar, akşam 19–21 arası zirve yapar. Güneş öğlen, rüzgâr ise hava nasıl isterse o zaman üretir.</p>
    <p>Dağıtım sırası: önce güneş ve rüzgâr (yakıtı bedava), sonra baraj, ardından termik santraller <b>marjinal maliyete</b>
    (yakıt + karbon bedeli) göre sıralanır. Kömür santrali yavaştır: saatte kapasitesinin belli bir yüzdesi kadar
    güç değiştirebilir ve %40'ın altına inemez. Batarya fazla üretimi depolar, akşam zirvesinde (17–23) boşaltır.</p>
    <p>Grafikte turuncu kesikli çizgi <b>net yük</b> = talep − güneş − rüzgâr. Güneş arttıkça öğlen çöker, akşam dikleşir:
    bu biçime <b>ördek eğrisi</b> denir (Kaliforniya şebeke işletmecisinin grafiğinden gelir).</p>
    <h3>Dene</h3>
    <ul>
      <li>Güneşi 1.500 MW'a çıkar: öğlen fazla üretim <b>kısıntıya</b> gider, akşam kömür rampası yetişemez.</li>
      <li>Aynı durumda bataryayı büyüt: öğlen şarj, akşam deşarj → kısıntı ve kesinti azalır.</li>
      <li>Karbon fiyatını 100 $/t üstüne çıkar: gaz kömürden ucuz hâle gelir, CO₂ düşer.</li>
      <li>"Karanlık durgunluk" (rüzgârsız, bulutlu kış günü) hazır ayarında yedek kapasitenin neden gerekli olduğunu gör.</li>
      <li>Santrallere tıkla: maliyet ve emisyon bilgisi.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p><small>Emisyon katsayıları yaklaşık değerlerdir (kömür ≈ 0,95 t/MWh, doğalgaz kombine çevrim ≈ 0,40 t/MWh).
    Maliyetler $/MWh cinsinden temsilîdir. İletim kayıpları, frekans, yedek ve piyasa kuralları modellenmez.</small></p>`,
});
sim.formatTime = (t) => {
  const h = START_H + t / SEC_PER_HOUR;
  const day = Math.floor(h / 24) + 1, hh = Math.floor(h % 24), mm = Math.floor((h % 1) * 60);
  return `Gün ${day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
const scene = sim.scene;
const sun = scene.userData.sun, hemi = scene.userData.hemi;
sun.position.set(20, 30, 10);

// ---------------- Arazi ----------------
const bumps = [
  [-22, -15, 3.2, 8], [-13, -19, 2.4, 6], [-30, -8, 2.2, 7], // rüzgâr sırtı
  [-9.5, -21, 6, 5], [9.5, -21, 6, 5], [0, -38, 5, 10], // baraj vadisi
  [30, -26, 4, 10], [-38, 20, 2, 8], [38, 18, 2, 8],
];
function heightAt(x, z) {
  let y = 0;
  for (const [bx, bz, a, r] of bumps) y += a * Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (r * r));
  if (z < -20.5 && z > -36 && Math.abs(x) < 6.5) y = Math.min(y, 0.2); // rezervuar tabanı
  return y;
}
{
  const g = new THREE.PlaneGeometry(240, 200, 150, 120);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), grass = new THREE.Color(0x5f8f3e), dry = new THREE.Color(0x8e8a55), rock = new THREE.Color(0x7c7466);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = heightAt(x, z);
    pos.setY(i, y);
    c.copy(grass).lerp(dry, clamp(y / 4, 0, 1) * 0.6).lerp(rock, clamp((y - 4) / 3, 0, 1));
    c.offsetHSL(0, 0, (Math.sin(x * 1.3) * Math.cos(z * 1.1)) * 0.02);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })));
}

// Tıklanabilir santral grupları
const plants = {};
function plantGroup(key, x, z, labelY) {
  const g = new THREE.Group();
  g.position.set(x, heightAt(x, z), z);
  scene.add(g);
  const lbl = sim.label('', { parent: g, position: [0, labelY, 0] });
  plants[key] = { g, lbl, x, z };
  return g;
}
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y + h / 2, z); return b; };

// ---------------- Şehir (8 mahalle) ----------------
function windowTextures() {
  const S = 256, mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; };
  const a = mk(), e = mk(), ga = a.getContext('2d'), ge = e.getContext('2d');
  const r = seeded(4);
  ga.fillStyle = '#c9c3b8'; ga.fillRect(0, 0, S, S);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  const T = S / 4;
  for (let ty = 0; ty < 4; ty++) for (let tx = 0; tx < 4; tx++) {
    for (const wx of [0.16, 0.58]) {
      const x = tx * T + wx * T, y = ty * T + 0.3 * T, w = 0.26 * T, h = 0.42 * T;
      ga.fillStyle = '#4a5a6e'; ga.fillRect(x, y, w, h);
      if (r() < 0.62) { ge.fillStyle = r() < 0.7 ? '#ffd48a' : '#fff1c9'; ge.fillRect(x, y, w, h); }
    }
  }
  // Çatılar için pencere olmayan köşe
  ga.fillStyle = '#6b6f76'; ga.fillRect(0, S - 6, 6, 6); ge.fillStyle = '#000'; ge.fillRect(0, S - 6, 6, 6);
  const t = [a, e].map((c) => { const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.colorSpace = THREE.SRGBColorSpace; return tx; });
  return t;
}
const [facadeTex, glowTex] = windowTextures();
const districts = [];
{
  const r = seeded(11);
  const town = new THREE.Group();
  town.position.set(0, 0, 8);
  scene.add(town);
  town.add(new THREE.Mesh(new THREE.PlaneGeometry(22, 14).rotateX(-Math.PI / 2).translate(0, 0.03, 0), mat(0x4b5059)));
  for (let d = 0; d < NDIST; d++) {
    const cx = -8.25 + (d % 4) * 5.5, cz = d < 4 ? -3.4 : 3.4;
    const geos = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const w = rand(1.1, 1.5), dd = rand(1.1, 1.6);
      const central = Math.abs(cx) < 4 ? 1.6 : 1;
      const h = (0.8 + r() * r() * 4.5) * central;
      const g = new THREE.BoxGeometry(w, h, dd);
      const uv = g.attributes.uv;
      // Yüzey başına UV ölçekle: 4×4 döşemeli doku, döşeme = 1 × 0,6 birim
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
        const idx = f * 4 + k;
        if (f === 2 || f === 3) { uv.setXY(idx, 0.005, 0.005); continue; }
        const fw = f < 2 ? dd : w;
        uv.setXY(idx, (uv.getX(idx) * fw) / 4 + (i * 0.25), (uv.getY(idx) * h) / 2.4);
      }
      g.translate(cx - 1.7 + i * 1.7, h / 2 + 0.03, cz - 0.9 + j * 1.8);
      geos.push(g);
    }
    const m = new THREE.MeshStandardMaterial({ map: facadeTex, emissiveMap: glowTex, emissive: 0xffc070, emissiveIntensity: 0, roughness: 0.85 });
    const mesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), m);
    town.add(mesh);
    districts.push({ mesh, m, on: true });
  }
  plants.sehir = { g: town, lbl: sim.label('', { parent: town, position: [0, 7.5, 0], className: 'big' }) };
}

// ---------------- Güneş tarlası ----------------
const solarPanels = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.06, 0.9), mat(0x1e3a8a, { roughness: 0.25, metalness: 0.6, emissive: 0x2244aa, emissiveIntensity: 0 }), 72);
{
  const g = plantGroup('gunes', -20, 8, 4);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.45, 0, 0)), s = new THREE.Vector3(1, 1, 1);
  let n = 0;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 8; j++) {
    m4.compose(new THREE.Vector3(-6.4 + i * 1.6, 0.7, -5.2 + j * 1.45), q, s);
    solarPanels.setMatrixAt(n++, m4);
  }
  g.add(solarPanels);
  g.add(box(3, 1, 1.5, mat(0xd1d5db), 7.5, 0, 0)); // inverter binası
}

// ---------------- Rüzgâr türbinleri ----------------
const rotors = [];
{
  const g = plantGroup('ruzgar', -20, -15, 13);
  g.position.y = 0;
  const white = mat(0xf1f5f9, { roughness: 0.5 });
  const spots = [[-22, -15], [-15, -19], [-28, -10], [-11, -14], [-30, -17], [-19, -9]];
  const bladeG = new THREE.BoxGeometry(0.28, 3.3, 0.08).translate(0, 1.75, 0);
  for (const [x, z] of spots) {
    const t = new THREE.Group();
    t.position.set(x + 20, heightAt(x, z), z + 15);
    t.add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.28, 7, 10).translate(0, 3.5, 0), white));
    t.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.1).translate(0, 7.1, -0.1), white));
    const rotor = new THREE.Group();
    rotor.position.set(0, 7.1, 0.5);
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(bladeG, white); b.rotation.z = (k * Math.PI * 2) / 3; rotor.add(b); }
    rotor.rotation.z = rand(0, 6);
    t.add(rotor);
    rotors.push(rotor);
    g.add(t);
  }
}

// ---------------- Kömür santrali ----------------
{
  const g = plantGroup('komur', 21, -11, 15);
  g.add(box(6, 3.2, 4, mat(0x7c6f64), 0, 0, 1));
  g.add(box(3, 5, 3, mat(0x6b5f55), -2.2, 0, 1));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.7, 12, 12).translate(1.5, 6, -0.5), mat(0x9ca3af)));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.8, 12).translate(1.5, 10.6, -0.5), mat(0xb91c1c)));
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(2.6 - 1.2 * Math.sin(t * Math.PI * 0.75) + t * 0.2, t * 7)); }
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 24).translate(-6, 0, -1), mat(0xd6d3d1, { side: THREE.DoubleSide })));
  g.add(new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.6, 10).translate(4, 0.8, 4), mat(0x1f1f1f)));
}

// ---------------- Doğalgaz santrali ----------------
{
  const g = plantGroup('gaz', 21, 9, 9);
  g.add(box(5, 2.4, 3, mat(0xcbd5e1), 0, 0, 0));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 5, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 2.4, 0), mat(0x94a3b8)));
  for (const x of [-1.5, 1.5]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 6.5, 10).translate(x, 3.25, -2.2), mat(0xe2e8f0)));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.6, 12).translate(-3.8, 0.8, 1), mat(0xfafafa)));
}

// ---------------- Baraj ----------------
let water, riverMat;
{
  const g = plantGroup('hidro', 0, -20, 8);
  g.position.y = 0;
  const concrete = mat(0xd6d0c4);
  const dam = box(14, 5.2, 1.4, concrete, 0, 0, 0);
  dam.rotation.x = -0.12;
  g.add(dam);
  g.add(box(14.4, 0.3, 1.8, mat(0x9ca3af), 0, 5.1, -0.3));
  g.add(box(3, 1.4, 1.5, mat(0x9ca3af), 0, 0, 1.6));
  water = new THREE.Mesh(new THREE.PlaneGeometry(13, 15).rotateX(-Math.PI / 2), mat(0x2f6fb5, { roughness: 0.15, metalness: 0.3 }));
  water.position.set(0, 3, -8);
  g.add(water);
  // Nehir: barajdan şehrin yanına
  const curve = new THREE.CatmullRomCurve3([[0, 0.05, 2.5], [-3, 0.05, 7], [-10, 0.05, 11], [-20, 0.05, 16], [-45, 0.05, 18]].map((p) => new THREE.Vector3(...p)));
  riverMat = mat(0x3b82c4, { roughness: 0.2, transparent: true, opacity: 0.9 });
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.7, 6), riverMat);
  tube.scale.y = 0.08;
  g.add(tube);
}

// ---------------- Batarya ----------------
const battLeds = [];
{
  const g = plantGroup('batarya', 11, -3, 4);
  for (let i = 0; i < 6; i++) {
    g.add(box(1.1, 1.2, 2.4, mat(0xf8fafc, { roughness: 0.6 }), -3 + i * 1.25, 0, 0));
    const led = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
    led.position.set(-3 + i * 1.25, 0.9, 1.21);
    g.add(led);
    battLeds.push(led);
  }
}

// ---------------- Trafo merkezi ve iletim hatları ----------------
const HUB = new THREE.Vector3(0, 0, -4);
{
  const g = new THREE.Group();
  g.position.copy(HUB);
  scene.add(g);
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(6, 4).rotateX(-Math.PI / 2).translate(0, 0.04, 0), mat(0x9ca3af)));
  for (let i = 0; i < 3; i++) g.add(box(1, 1.3, 1, mat(0x64748b), -2 + i * 2, 0, 0));
  sim.label('Trafo merkezi', { parent: g, position: [0, 2.6, 0], className: 'plain' });
}
const pylonGeo = BufferGeometryUtils.mergeGeometries([
  new THREE.CylinderGeometry(0.06, 0.3, 4, 4).translate(0, 2, 0),
  new THREE.BoxGeometry(1.6, 0.08, 0.08).translate(0, 3.7, 0),
]);
const pylonMat = mat(0x6b7280, { metalness: 0.5 });
const lines = [];
const LINE_SRC = { gunes: [-12, 7], ruzgar: [-14, -12], komur: [18, -8], gaz: [18, 8], hidro: [0, -17], batarya: [8, -3], sehir: [0, 2] };
const DOTS = 14;
const dotMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), Object.keys(LINE_SRC).length * DOTS);
dotMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(dotMesh);
for (const [key, [x, z]] of Object.entries(LINE_SRC)) {
  const a = new THREE.Vector3(x, 0, z), b = HUB.clone();
  const n = Math.max(2, Math.round(a.distanceTo(b) / 7));
  const tops = [];
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    p.y = heightAt(p.x, p.z);
    const py = new THREE.Mesh(pylonGeo, pylonMat);
    py.position.copy(p);
    py.lookAt(b.x, p.y, b.z);
    scene.add(py);
    tops.push(p.clone().setY(p.y + 3.7));
  }
  const pts = [];
  for (let i = 0; i < tops.length - 1; i++) for (let k = 0; k < 8; k++) {
    const t = k / 8, p = tops[i].clone().lerp(tops[i + 1], t);
    p.y -= Math.sin(t * Math.PI) * 0.6; // sarkma
    pts.push(p);
  }
  pts.push(tops[tops.length - 1]);
  const curve = new THREE.CatmullRomCurve3(pts);
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(80)), new THREE.LineBasicMaterial({ color: 0x334155 }));
  scene.add(cable);
  lines.push({ key, curve, phase: rand(0, 1), flow: 0, color: new THREE.Color(key === 'sehir' ? '#ffffff' : SRC[key].color) });
}

// ---------------- Duman / buhar parçacıkları ----------------
const PN = 140;
const smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshStandardMaterial({ roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }), PN);
smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(smoke);
const parts = Array.from({ length: PN }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));
const EMIT = {
  komur: { at: [22.5, 11.2, -11.5], color: 0x6b6b6b, grow: 1.4, key: 'komur' },
  sogutma: { at: [15, 7.2, -12], color: 0xf5f5f5, grow: 1.8, key: 'komur' },
  gaz: { at: [21, 6.8, 6.8], color: 0xd4d4d8, grow: 0.8, key: 'gaz' },
};
const emitAcc = { komur: 0, sogutma: 0, gaz: 0 };
let pIdx = 0;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
function emit(name) {
  const e = EMIT[name], p = parts[pIdx];
  pIdx = (pIdx + 1) % PN;
  p.life = 0; p.max = rand(3, 5); p.grow = e.grow;
  p.p.set(e.at[0] + rand(-0.2, 0.2), e.at[1], e.at[2] + rand(-0.2, 0.2));
  p.v.set(rand(-0.1, 0.1) + 0.35, rand(0.9, 1.3), rand(-0.1, 0.1));
  smoke.setColorAt(pIdx === 0 ? PN - 1 : pIdx - 1, _c.setHex(e.color));
}

// ---------------- Gökyüzü ----------------
const sunBall = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe28a, fog: false }));
const moon = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 12), new THREE.MeshBasicMaterial({ color: 0xdfe7f5, fog: false }));
scene.add(sunBall, moon);
const stars = (() => {
  const n = 600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection();
    v.y = Math.abs(v.y) * 0.8 + 0.1;
    v.normalize().multiplyScalar(130);
    pos.set([v.x, v.y, v.z - 40], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, transparent: true, fog: false }));
  scene.add(p);
  return p;
})();
const clouds = [];
{
  const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 9; i++) {
    const geos = [];
    for (let k = 0; k < 5; k++) geos.push(new THREE.SphereGeometry(rand(1.6, 2.8), 10, 8).translate(k * 2 - 4 + rand(-0.5, 0.5), rand(0, 0.8), rand(-1, 1)));
    const c = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), cm);
    c.scale.y = 0.55;
    c.position.set(rand(-60, 60), rand(24, 30), rand(-70, -25));
    scene.add(c);
    clouds.push(c);
  }
  clouds.mat = cm;
}
const DAY = new THREE.Color(0x87b8e8), DUSK = new THREE.Color(0xf29e6b), NIGHT = new THREE.Color(0x070b1a);

// ---------------- Arayüz ----------------
const ui = sim.ui;
const P = { cap: {} };
ui.section('Hazır senaryolar');
const presetSel = ui.select({
  options: [
    { value: 'dengeli', label: 'Dengeli karışım' },
    { value: 'komur', label: 'Kömür ağırlıklı' },
    { value: 'ordek', label: 'Bol güneş, bataryasız (ördek)' },
    { value: 'yesil', label: 'Yeşil şebeke + büyük batarya' },
    { value: 'durgun', label: 'Karanlık durgunluk (kış)' },
  ],
  value: 'dengeli', onChange: (v) => applyPreset(v),
});

ui.section('Kurulu güç');
const mw = (v) => `${fmt(v)} MW`;
const sl = {};
sl.gunes = ui.slider({ label: '☀️ Güneş', min: 0, max: 1500, step: 50, value: 500, format: mw, onChange: sync });
sl.ruzgar = ui.slider({ label: '🌬️ Rüzgâr', min: 0, max: 1000, step: 50, value: 300, format: mw, onChange: sync });
sl.hidro = ui.slider({ label: '💧 Hidroelektrik', min: 0, max: 500, step: 25, value: 150, format: mw, onChange: sync });
sl.komur = ui.slider({ label: '🏭 Kömür', min: 0, max: 1200, step: 50, value: 500, format: mw, onChange: sync });
sl.gaz = ui.slider({ label: '🔥 Doğalgaz', min: 0, max: 1000, step: 50, value: 400, format: mw, onChange: sync });
sl.battP = ui.slider({ label: '🔋 Batarya gücü', min: 0, max: 600, step: 25, value: 100, format: mw, onChange: sync });
sl.battH = ui.slider({ label: '🔋 Batarya süresi', min: 1, max: 8, step: 1, value: 4, format: (v) => `${v} saat · ${fmt(v * sl.battP.value)} MWh`, onChange: sync });

ui.section('Hava ve talep');
sl.cloud = ui.slider({ label: 'Bulutluluk', min: 0, max: 100, step: 5, value: 20, unit: '%', onChange: sync });
sl.wind = ui.slider({ label: 'Ortalama rüzgâr hızı', min: 0, max: 16, step: 0.5, value: 7, unit: 'm/s', onChange: sync });
const windMode = ui.segmented({ label: 'Rüzgâr', options: [{ value: 'var', label: 'Değişken' }, { value: 'sabit', label: 'Sabit' }], value: 'var', onChange: sync });
sl.peak = ui.slider({ label: 'Akşam tepe talebi', min: 600, max: 1600, step: 50, value: 1000, format: mw, onChange: sync });

ui.section('Dağıtım kuralları');
const orderSel = ui.segmented({ label: 'Öncelik sırası', options: [{ value: 'maliyet', label: 'En ucuz önce' }, { value: 'karbon', label: 'En temiz önce' }], value: 'maliyet', onChange: sync });
sl.carbon = ui.slider({ label: 'Karbon fiyatı', min: 0, max: 150, step: 5, value: 20, unit: '$/t', onChange: sync });
sl.ramp = ui.slider({ label: 'Kömür rampa hızı', min: 5, max: 60, step: 5, value: 25, format: (v) => `saatte %${v}`, onChange: sync });
const shave = ui.toggle({ label: 'Batarya akşam zirvesinde (17–23) boşalsın', value: true, onChange: sync });
const costText = ui.text('', 'card');

ui.section('Şu an');
const stDemand = ui.stat({ label: 'Talep', unit: 'MW' });
const stSupply = ui.stat({ label: 'Karşılanan', unit: 'MW' });
const stMarg = ui.stat({ label: 'Fiyatı belirleyen' });
const stWind = ui.stat({ label: 'Rüzgâr hızı', unit: 'm/s' });
const socMeter = ui.meter({ label: '🔋 Batarya doluluğu', color: SRC.batarya.color });
const damMeter = ui.meter({ label: '💧 Baraj doluluğu', color: SRC.hidro.color });
const statusText = ui.text('', 'card');

ui.section('Bugün (00:00’dan beri)');
const stRen = ui.stat({ label: 'Yenilenebilir payı', unit: '%' });
const stCO2 = ui.stat({ label: 'CO₂', unit: 't' });
const stCost = ui.stat({ label: 'Maliyet', unit: 'bin $' });
const stAvg = ui.stat({ label: 'Ort. maliyet', unit: '$/MWh' });
const stDef = ui.stat({ label: 'Kesinti', unit: 'MWh' });
const stCurt = ui.stat({ label: 'Kısıntı', unit: 'MWh' });

// Yığılmış alan grafiği (24 saat, 5 dk çözünürlük)
const N = 288;
const buf = { D: new Float32Array(N), net: new Float32Array(N), ch: new Float32Array(N) };
for (const k of STACK) buf[k] = new Float32Array(N);
const chartWrap = document.createElement('div');
chartWrap.className = 'chart';
chartWrap.innerHTML = `<div class="chart-title">Üretim kaynakları ve talep (24 saat) — ördek eğrisi</div>`;
const cv = document.createElement('canvas');
cv.style.height = '170px';
chartWrap.append(cv);
const legend = document.createElement('div');
legend.className = 'legend';
legend.innerHTML = STACK.map((k) => `<span><i style="background:${SRC[k].color}"></i>${SRC[k].name}</span>`).join('') +
  `<span><i style="background:#fff"></i>Talep</span><span><i style="background:#fb7185"></i>Net yük</span>`;
chartWrap.append(legend);
ui.append(chartWrap);
let cursor = 0;

function drawChart() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth || 270, H = 170;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = H * dpr; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  let hi = 100, lo = 0;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (const k of STACK) s += buf[k][i];
    hi = Math.max(hi, s, buf.D[i]);
    lo = Math.min(lo, -buf.ch[i], buf.net[i]);
  }
  hi *= 1.06; lo = lo < 0 ? lo * 1.1 : 0;
  const pl = 36, pr = 6, pt = 6, pb = 16, iw = W - pl - pr, ih = H - pt - pb;
  const X = (i) => pl + (iw * i) / (N - 1), Y = (v) => pt + ih * (1 - (v - lo) / (hi - lo));
  ctx.font = '10px system-ui';
  ctx.fillStyle = 'rgba(148,163,184,.85)';
  ctx.strokeStyle = 'rgba(148,163,184,.18)';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let k = 0; k <= 3; k++) {
    const v = lo + ((hi - lo) * k) / 3, y = Y(v);
    ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(W - pr, y); ctx.stroke();
    ctx.fillText(fmt(v), pl - 4, y);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const hh of [0, 6, 12, 18, 24]) ctx.fillText(String(hh).padStart(2, '0'), X((hh / 24) * (N - 1)), H - pb + 3);
  const drawAll = (alpha) => {
    ctx.globalAlpha = alpha;
    const base = new Float32Array(N);
    for (const k of STACK) {
      ctx.fillStyle = SRC[k].color;
      ctx.beginPath();
      for (let i = 0; i < N; i++) ctx.lineTo(X(i), Y(base[i] + buf[k][i]));
      for (let i = N - 1; i >= 0; i--) ctx.lineTo(X(i), Y(base[i]));
      ctx.fill();
      for (let i = 0; i < N; i++) base[i] += buf[k][i];
    }
    ctx.fillStyle = SRC.batarya.color;
    ctx.globalAlpha = alpha * 0.5;
    ctx.beginPath();
    for (let i = 0; i < N; i++) ctx.lineTo(X(i), Y(-buf.ch[i]));
    for (let i = N - 1; i >= 0; i--) ctx.lineTo(X(i), Y(0));
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); for (let i = 0; i < N; i++) ctx.lineTo(X(i), Y(buf.D[i])); ctx.stroke();
    ctx.setLineDash([4, 3]); ctx.strokeStyle = '#fb7185';
    ctx.beginPath(); for (let i = 0; i < N; i++) ctx.lineTo(X(i), Y(buf.net[i])); ctx.stroke();
    ctx.setLineDash([]);
  };
  drawAll(0.3); // dünün verisi (imlecin sağı)
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, X(cursor), H); ctx.clip();
  drawAll(1);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(X(cursor), pt); ctx.lineTo(X(cursor), H - pb); ctx.stroke();
}

function sync() {
  for (const k of ['gunes', 'ruzgar', 'hidro', 'komur', 'gaz']) P.cap[k] = sl[k].value;
  P.battP = sl.battP.value;
  P.battE = sl.battP.value * sl.battH.value;
  sl.battH.set(sl.battH.value);
  P.cloud = sl.cloud.value / 100;
  P.windMean = sl.wind.value;
  P.windVar = windMode.value === 'var';
  P.peak = sl.peak.value;
  P.order = orderSel.value;
  P.carbon = sl.carbon.value;
  P.coalRamp = sl.ramp.value / 100;
  P.peakShave = shave.value;
  if (state) {
    state.komur = clamp(state.komur, P.cap.komur * SRC.komur.min, P.cap.komur);
    state.gaz = Math.min(state.gaz, P.cap.gaz);
    state.battSoc = Math.min(state.battSoc, P.battE);
    state.hydroStore = Math.min(state.hydroStore, P.cap.hidro * 12);
  }
  const cc = marginalCost('komur', P.carbon), cg = marginalCost('gaz', P.carbon);
  costText.set(`Marjinal maliyet: kömür <b>${fmt(cc)}</b> $/MWh · gaz <b>${fmt(cg)}</b> $/MWh<br>` +
    (P.order === 'karbon' ? 'Temiz sıralama: gaz kömürden önce çalışır.' : cc <= cg ? 'Kömür daha ucuz → önce kömür çalışır.' : '<b>Gaz daha ucuz</b> → karbon fiyatı sıralamayı değiştirdi.'));
}

const PRESETS = {
  dengeli: { gunes: 500, ruzgar: 300, hidro: 150, komur: 500, gaz: 400, battP: 100, battH: 4, cloud: 20, wind: 7, carbon: 20 },
  komur: { gunes: 100, ruzgar: 100, hidro: 100, komur: 1000, gaz: 200, battP: 0, battH: 4, cloud: 20, wind: 7, carbon: 10 },
  ordek: { gunes: 1500, ruzgar: 200, hidro: 100, komur: 700, gaz: 250, battP: 0, battH: 4, cloud: 0, wind: 5, carbon: 20 },
  yesil: { gunes: 1300, ruzgar: 800, hidro: 250, komur: 0, gaz: 400, battP: 450, battH: 6, cloud: 10, wind: 8, carbon: 80 },
  durgun: { gunes: 800, ruzgar: 600, hidro: 150, komur: 200, gaz: 300, battP: 100, battH: 4, cloud: 90, wind: 2, carbon: 20 },
};
function applyPreset(name) {
  const p = PRESETS[name];
  for (const [k, v] of Object.entries(p)) sl[k].set(v);
  windMode.set(name === 'durgun' ? 'sabit' : 'var');
  sync();
  sim.toast(`Senaryo: <b>${presetSel.select.selectedOptions[0].textContent}</b>`);
}

// ---------------- Simülasyon durumu ----------------
let state = null, hAbs = START_H, today = null, lastOut = null, blackoutWas = false, curtailWas = false, dayNo = 0;
const zeroDay = () => ({ E: 0, ren: 0, co2: 0, cost: 0, def: 0, curt: 0 });

function record(o, h) {
  const i = Math.floor((((h % 24) + 24) % 24) * 12) % N;
  buf.komur[i] = o.komur; buf.hidro[i] = o.hidro; buf.gaz[i] = o.gaz; buf.ruzgar[i] = o.W; buf.gunes[i] = o.S;
  buf.batarya[i] = o.batarya; buf.ch[i] = o.charge; buf.D[i] = o.D; buf.net[i] = o.D - o.S0 - o.W0;
  cursor = i;
}
function accumulate(o, dtH) {
  today.E += o.served * dtH;
  today.ren += Math.min(o.served, o.S + o.W + o.hidro) * dtH;
  today.co2 += o.co2; today.cost += o.cost;
  today.def += o.deficit * dtH; today.curt += o.curtail * dtH;
}
function advance(toH, quiet = false) {
  while (hAbs + 1e-9 < toH) {
    const dtH = Math.min(SUB, toH - hAbs);
    const prevDay = Math.floor(hAbs / 24);
    hAbs += dtH;
    const o = step(state, P, hAbs, dtH);
    if (Math.floor(hAbs / 24) !== prevDay) {
      if (!quiet) {
        dayNo++;
        sim.toast(`🌙 Gün ${dayNo} bitti · CO₂ ${fmt(today.co2)} t · yenilenebilir %${fmt((100 * today.ren) / Math.max(1, today.E))} · kesinti ${fmt(today.def)} MWh`, today.def > 1 ? 'bad' : 'good');
      }
      today = zeroDay();
    }
    accumulate(o, dtH);
    record(o, hAbs);
    lastOut = o;
  }
}

function resetAll() {
  state = newState(P);
  today = zeroDay();
  for (const k in buf) buf[k].fill(0);
  // Dünden bu yana ısınma: grafiği ve depoları doldur
  hAbs = START_H - 40;
  advance(START_H, true);
  dayNo = 0;
  blackoutWas = curtailWas = false;
  refreshStats();
  drawChart();
}

// ---------------- Döngü ----------------
sim.onUpdate((dt) => {
  advance(START_H + sim.time / SEC_PER_HOUR);
});

const _v = new THREE.Vector3();
function updateScene(realDt) {
  const o = lastOut;
  if (!o) return;
  const h = ((hAbs % 24) + 24) % 24;
  const s = sunHeight(h);
  const day = clamp(s * 3 + 0.35, 0, 1);
  const cloud = P.cloud;
  // Gökyüzü rengi ve ışık
  const sky = scene.background;
  sky.copy(NIGHT).lerp(DUSK, clamp((s + 0.15) * 4, 0, 1)).lerp(DAY, clamp(s * 3, 0, 1));
  sky.lerp(_c.setHex(0x9aa6b2), cloud * 0.5 * day);
  scene.fog.color.copy(sky);
  const ang = (Math.PI * (h - 6.5)) / 13;
  sunBall.position.set(Math.cos(ang) * 90, Math.sin(ang) * 55, -70);
  sunBall.visible = s > -0.05;
  moon.position.set(-Math.cos(ang) * 80, -Math.sin(ang) * 45 + 10, -70);
  moon.visible = s < 0.05;
  sun.position.copy(s > 0 ? sunBall.position : moon.position).multiplyScalar(0.3);
  sun.intensity = s > 0 ? 2.2 * clamp(s * 2.5, 0, 1) * (1 - cloud * 0.6) + 0.05 : 0.35;
  sun.color.setHex(s > 0 ? (s < 0.25 ? 0xffc38a : 0xffffff) : 0x9fb4ff);
  hemi.intensity = 0.45 + 1.0 * day;
  stars.material.opacity = clamp(1 - day * 1.5, 0, 1);
  clouds.mat.opacity = 0.25 + cloud * 0.7;
  clouds.forEach((c, i) => {
    c.visible = cloud > 0.04 || i < 2;
    c.position.x += realDt * (0.4 + P.windMean * 0.12);
    if (c.position.x > 60) c.position.x = -60;
    c.material.color = c.material.color.setScalar(lerp(0.35, 1, day) * (1 - cloud * 0.25));
  });

  // Mahalle ışıkları ve karartma
  const dark = o.deficit > 1 ? Math.min(NDIST, Math.ceil((o.deficit / o.D) * NDIST)) : 0;
  const night = clamp(1 - day * 1.4, 0, 1);
  districts.forEach((d, i) => {
    d.on = i < NDIST - dark;
    d.m.emissiveIntensity = d.on ? night * 1.8 : 0;
    d.m.color.setScalar(d.on ? 1 : 0.55);
  });

  solarPanels.material.emissiveIntensity = (o.S / Math.max(1, P.cap.gunes)) * 0.5;
  const w = o.wind;
  const rpm = w < 3 || w > 25 ? 0 : Math.min(w, 12) / 12;
  rotors.forEach((r) => (r.rotation.z -= realDt * rpm * 2.2 * Math.min(sim.speed, 2) * (sim.paused ? 0 : 1)));

  water.position.y = 0.6 + 2.9 * o.hydroFrac;
  riverMat.opacity = 0.35 + 0.6 * (o.hidro / Math.max(1, P.cap.hidro));

  const socC = o.batarya > 1 ? 0xf59e0b : o.charge > 1 ? 0x22d3ee : 0x22c55e;
  const blink = 0.6 + 0.4 * Math.sin(performance.now() / 180);
  battLeds.forEach((l, i) => {
    l.visible = P.battP > 0;
    const lit = (i + 0.5) / battLeds.length <= o.soc + 0.02;
    l.material.color.setHex(lit ? socC : 0x1f2937).multiplyScalar(o.batarya > 1 || o.charge > 1 ? blink : 1);
  });

  // Hat akışları
  const flows = { gunes: o.S, ruzgar: o.W, komur: o.komur, gaz: o.gaz, hidro: o.hidro, batarya: o.batarya - o.charge, sehir: o.served };
  let n = 0;
  for (const L of lines) {
    const f = flows[L.key];
    const dir = L.key === 'sehir' ? -1 : 1; // şehir hattında akış merkezden şehre
    L.phase = (L.phase + realDt * (sim.paused ? 0 : 1) * Math.sign(f) * dir * (0.1 + Math.min(Math.abs(f), 1500) / 2500)) % 1;
    const sc = Math.abs(f) > 2 ? 0.6 + Math.sqrt(Math.abs(f)) / 22 : 0;
    for (let k = 0; k < DOTS; k++) {
      const u = (((L.phase + k / DOTS) % 1) + 1) % 1;
      L.curve.getPointAt(u, _v);
      _m.compose(_v, _q.identity(), _s.setScalar(sc));
      dotMesh.setMatrixAt(n, _m);
      dotMesh.setColorAt(n, f < -1 ? _c.setHex(0x22d3ee) : L.color);
      n++;
    }
  }
  dotMesh.instanceMatrix.needsUpdate = true;
  if (dotMesh.instanceColor) dotMesh.instanceColor.needsUpdate = true;

  // Duman
  if (!sim.paused) {
    const k = realDt * Math.min(sim.speed, 3);
    emitAcc.komur += k * 5 * (o.komur / 600);
    emitAcc.sogutma += k * 3 * (o.komur / 600);
    emitAcc.gaz += k * 3 * (o.gaz / 500);
    for (const e in emitAcc) while (emitAcc[e] >= 1) { emit(e); emitAcc[e] -= 1; }
    for (const p of parts) if (p.life < p.max) { p.life += k; p.p.addScaledVector(p.v, k); p.v.x += k * 0.05 * P.windMean * 0.1; }
  }
  for (let i = 0; i < PN; i++) {
    const p = parts[i];
    const a = p.life < p.max ? p.life / p.max : 1;
    _m.compose(p.p, _q.identity(), _s.setScalar(a >= 1 ? 0 : (0.4 + a * p.grow * 2) * (1 - a * a * 0.6)));
    smoke.setMatrixAt(i, _m);
  }
  smoke.instanceMatrix.needsUpdate = true;
  if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;

  // Etiketler
  const lab = (key, icon, v) => {
    const cap = key === 'batarya' ? P.battP : P.cap[key];
    plants[key].lbl.visible = cap > 0;
    plants[key].lbl.setText(`${icon} ${SRC[key].name} <span style="color:${SRC[key].color}">${fmt(v)} MW</span>`);
  };
  lab('gunes', '☀️', o.S);
  lab('ruzgar', '🌬️', o.W);
  lab('komur', '🏭', o.komur);
  lab('gaz', '🔥', o.gaz);
  lab('hidro', '💧', o.hidro);
  plants.batarya.lbl.visible = P.battP > 0;
  plants.batarya.lbl.setText(`🔋 %${fmt(o.soc * 100)} ${o.batarya > 1 ? `<span style="color:#f59e0b">▼ ${fmt(o.batarya)} MW</span>` : o.charge > 1 ? `<span style="color:#22d3ee">▲ ${fmt(o.charge)} MW</span>` : ''}`);
  plants.sehir.lbl.setText(dark ? `🏙️ <span style="color:#f87171">⚠️ ${dark} mahalle karanlıkta</span>` : `🏙️ Şehir talebi ${fmt(o.D)} MW`);
  for (const k of ['gunes', 'ruzgar', 'komur', 'gaz', 'hidro']) plants[k].g.visible = P.cap[k] > 0;
  plants.batarya.g.visible = P.battP > 0;
}
sim.onRender(updateScene);

function refreshStats() {
  const o = lastOut;
  if (!o) return;
  stDemand.set(fmt(o.D));
  stSupply.set(fmt(o.served), o.deficit > 1 ? 'bad' : 'good');
  const mk = o.marginal;
  stMarg.set(mk === 'kesinti' ? 'Kesinti!' : SRC[mk].name, mk === 'kesinti' ? 'bad' : mk === 'komur' || mk === 'gaz' ? 'warn' : 'good');
  stWind.set(fmt(o.wind, 1));
  socMeter.set(o.soc, P.battE > 0 ? `%${fmt(o.soc * 100)} · ${fmt(o.soc * P.battE)} MWh` : 'yok');
  damMeter.set(o.hydroFrac, P.cap.hidro > 0 ? `%${fmt(o.hydroFrac * 100)}` : 'yok');
  const ren = (100 * today.ren) / Math.max(1, today.E);
  stRen.set(fmt(ren), ren > 60 ? 'good' : ren < 25 ? 'bad' : 'warn');
  stCO2.set(fmt(today.co2));
  stCost.set(fmt(today.cost / 1000));
  stAvg.set(fmt(today.cost / Math.max(1, today.E), 1));
  stDef.set(fmt(today.def), today.def > 0.5 ? 'bad' : 'good');
  stCurt.set(fmt(today.curt), today.curt > 0.5 ? 'warn' : '');

  const h = ((hAbs % 24) + 24) % 24;
  const msg = [];
  if (o.deficit > 1) msg.push(`<b style="color:var(--bad)">⚠️ Arz yetersiz:</b> ${fmt(o.deficit)} MW eksik. Kademeli kesinti uygulanıyor.` +
    (P.cap.komur > 0 && state.komur < P.cap.komur - 1 && o.komur >= state.komur - 1 ? ' Kömür santrali rampa sınırı yüzünden yetişemiyor.' : ''));
  if (o.curtail > 1) msg.push(`<b style="color:var(--warn)">✂️ Kısıntı:</b> ${fmt(o.curtail)} MW yenilenebilir üretim şebekeye alınamıyor (talep + batarya dolu).`);
  if (o.coalForced) msg.push('Kömür minimum kararlı yükün altına zorlandı (gerçekte santral durdurulmalı).');
  if (o.charge > 1) msg.push(`🔋 Fazla üretim bataryada depolanıyor (${fmt(o.charge)} MW).`);
  if (o.batarya > 1) msg.push(`🔋 Batarya zirveyi tıraşlıyor (${fmt(o.batarya)} MW).`);
  if (!msg.length) {
    if (h >= 17 && h < 22) msg.push('Akşam zirvesi: güneş batarken talep en yüksek noktada.');
    else if (o.S > o.D * 0.4) msg.push('Öğle: güneş talebin büyük kısmını karşılıyor; termik santraller geri çekildi.');
    else msg.push('Şebeke dengede: üretim = talep.');
  }
  statusText.set(msg.join('<br>'));

  if (o.deficit > 1 && !blackoutWas) sim.toast('⚠️ Kesinti başladı: bazı mahalleler karanlıkta', 'bad');
  if (o.curtail > 20 && !curtailWas) sim.toast('✂️ Fazla yenilenebilir üretim kısılıyor', 'warn');
  blackoutWas = o.deficit > 1;
  curtailWas = o.curtail > 20;
}
let statT = 0;
sim.onRender((dt) => {
  statT += dt;
  if (statT > 0.25) { statT = 0; refreshStats(); drawChart(); }
});

// Santrallere tıkla → bilgi
const INFO = {
  gunes: 'Güneş: yakıt yok, CO₂ yok. Üretim güneşin yüksekliğine ve bulutlara bağlı; geceleri sıfır.',
  ruzgar: 'Rüzgâr: 3 m/s altında durur, 12 m/s’de anma gücüne ulaşır, 25 m/s üstünde güvenlik için kapanır. Güç ≈ hızın küpü.',
  hidro: 'Baraj: çok hızlı devreye girer ama suyu sınırlıdır. Günlük akış + depo kadar üretebilir.',
  batarya: 'Batarya: fazlayı depolar, zirvede verir. Gidiş-dönüş verimi ≈ %90. Enerji üretmez, zamanı kaydırır.',
  komur: () => `Kömür: ≈ 0,95 t CO₂/MWh · marjinal maliyet ${fmt(marginalCost('komur', P.carbon))} $/MWh. Yavaş: saatte %${sl.ramp.value} güç değiştirebilir, %40 altına inemez.`,
  gaz: () => `Doğalgaz: ≈ 0,40 t CO₂/MWh · marjinal maliyet ${fmt(marginalCost('gaz', P.carbon))} $/MWh. Hızlı: yarım saatte tam güce çıkabilir.`,
};
sim.onClick(() => ['gunes', 'ruzgar', 'hidro', 'batarya', 'komur', 'gaz'].map((k) => plants[k].g), (hit) => {
  let o = hit.object;
  const key = Object.keys(INFO).find((k) => { let p = o; while (p) { if (p === plants[k].g) return true; p = p.parent; } return false; });
  if (!key) return;
  const t = INFO[key];
  sim.toast(typeof t === 'function' ? t() : t);
});

sim.onReset(resetAll);
sync();
resetAll();
