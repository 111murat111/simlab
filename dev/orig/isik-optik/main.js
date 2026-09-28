// Işık ve Optik — ince mercek (1/f = 1/do + 1/di), prizmada Snell + Cauchy dağılımı, yağmur damlasında gökkuşağı ve göz kusurları.
import { createSim, THREE, fmt, clamp } from '@core';

const sim = createSim({
  background: 0x04060c,
  camera: { position: [0, 1.5, 30], target: [0, 0.5, 0], fov: 45 },
  controls: { minDistance: 6, maxDistance: 90, maxPolarAngle: Math.PI * 0.85 },
  lights: false,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Dört optik düzenek: <b>Mercek</b> (ince mercek denklemi <b>1/f = 1/d<sub>o</sub> + 1/d<sub>i</sub></b>,
    büyütme <b>m = −d<sub>i</sub>/d<sub>o</sub></b>), <b>Prizma</b> (Snell yasası <b>n₁·sin θ₁ = n₂·sin θ₂</b>; kırılma indisi
    dalga boyuna bağlı: Cauchy <b>n(λ) = A + B/λ²</b>), <b>Gökkuşağı</b> (su damlasında kırılma + iç yansıma + kırılma) ve
    <b>Göz</b> (miyopi, hipermetropi ve düzeltici gözlük camı).</p>
    <p>Mercek modunda üç temel ışın çizilir: <span style="color:#fde047">eksene paralel</span> gelen ışın odaktan geçer,
    <span style="color:#67e8f9">merkezden</span> geçen ışın sapmaz, <span style="color:#f472b6">odaktan</span> gelen ışın eksene paralel çıkar.
    Kesikli çizgiler sanal uzantılardır. Turuncu oku fareyle sürükleyebilirsin.</p>
    <h3>Dene</h3>
    <ul>
      <li>Cismi odak noktasının içine getir (d<sub>o</sub> &lt; f): görüntü <b>sanal, düz ve büyük</b> olur — büyüteç.</li>
      <li>Cismi 2F'ye koy: görüntü aynı boyda ve ters. d<sub>o</sub> = f olunca ışınlar paralel çıkar, görüntü sonsuzdadır.</li>
      <li>Prizmada malzemeyi <b>elmas</b> yap: renkler çok daha fazla ayrılır; küçük açılarda ışık içeride <b>tam yansır</b>.</li>
      <li>Gökkuşağında "Işın demeti"ni aç: ışınlar ~42°'de yığılır; o yüzden gökkuşağı Güneş'in tam tersinden 42°'lik bir yaydır.</li>
      <li>Göz modunda miyopiyi −3 D yap, sonra gözlük camını −3 D'ye getir: odak yeniden retinaya oturur.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Fotoğraf makinesi ve göz küçük, ters, gerçek görüntü oluşturur; projeksiyon cihazı büyük ve ters; büyüteç sanal ve düz.
    Miyopide göz fazla kırıcıdır (ya da uzundur), <b>ıraksak (−)</b> camla; hipermetropide <b>yakınsak (+)</b> camla düzeltilir.
    Yaşla gözün uyum gücü azalır (presbiyopi), bu yüzden okumak için + cam gerekir.</p>
    <p><small>Paraksiyal (ince mercek) yaklaşımı kullanılır; göz modunda ışın eğimleri görünürlük için abartılmıştır.
    Göz modeli eğitim amaçlıdır, tıbbi tavsiye değildir.</small></p>`,
});

// --- Parlayan ışın çizici (InstancedMesh silindirler: çekirdek + hale) ---
const Y_AXIS = new THREE.Vector3(0, 1, 0);
class Rays {
  constructor(max, r = 0.045) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    const mk = (opacity) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({
        transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color());
      m.frustumCulled = false;
      m.count = 0;
      return m;
    };
    this.core = mk(1); this.halo = mk(0.3);
    this.max = max; this.r = r; this.n = 0;
    this.group = new THREE.Group();
    this.group.add(this.halo, this.core);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(); this._d = new THREE.Vector3(); this._c = new THREE.Color();
  }
  begin() { this.n = 0; }
  seg(a, b, color, { dash = false, alpha = 1, w = 1 } = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    if (!(len > 1e-4) || !isFinite(len)) return;
    if (dash) {
      const on = 0.28, step = 0.5;
      for (let s = 0; s < len && this.n < this.max; s += step) {
        const e = Math.min(s + on, len);
        this._put(a[0] + (dx * s) / len, a[1] + (dy * s) / len, a[0] + (dx * e) / len, a[1] + (dy * e) / len, color, alpha * 0.55, w * 0.8);
      }
    } else this._put(a[0], a[1], b[0], b[1], color, alpha, w);
  }
  _put(x0, y0, x1, y1, color, alpha, w) {
    if (this.n >= this.max) return;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
    this._d.set(dx / len, dy / len, 0);
    this._q.setFromUnitVectors(Y_AXIS, this._d);
    this._p.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    const r = this.r * w;
    this._c.copy(color).multiplyScalar(alpha);
    this._s.set(r, len, r);
    this._m.compose(this._p, this._q, this._s);
    this.core.setMatrixAt(this.n, this._m); this.core.setColorAt(this.n, this._c);
    this._s.set(r * 3.2, len, r * 3.2);
    this._m.compose(this._p, this._q, this._s);
    this.halo.setMatrixAt(this.n, this._m); this.halo.setColorAt(this.n, this._c);
    this.n++;
  }
  end() {
    for (const m of [this.core, this.halo]) {
      m.count = this.n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

function waveColor(nm) {
  let r = 0, g = 0, b = 0;
  if (nm < 440) { r = (440 - nm) / 60; b = 1; } else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
  else if (nm < 510) { g = 1; b = (510 - nm) / 20; } else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
  else if (nm < 645) { r = 1; g = (645 - nm) / 65; } else r = 1;
  const f = nm < 420 ? 0.35 + (0.65 * (nm - 380)) / 40 : nm > 700 ? 0.35 + (0.65 * (780 - nm)) / 80 : 1;
  return new THREE.Color().setRGB(r * f, g * f, b * f, THREE.SRGBColorSpace);
}
const WHITE = new THREE.Color(1, 1, 1);
const C1 = new THREE.Color().setRGB(0.99, 0.88, 0.28, THREE.SRGBColorSpace);
const C2 = new THREE.Color().setRGB(0.4, 0.91, 0.98, THREE.SRGBColorSpace);
const C3 = new THREE.Color().setRGB(0.96, 0.45, 0.71, THREE.SRGBColorSpace);
const CFAN = new THREE.Color().setRGB(0.7, 0.75, 0.9, THREE.SRGBColorSpace);

// Cauchy katsayıları (λ µm cinsinden), C ve F çizgilerindeki ölçülen indislerden
const MATS = {
  cam: { name: 'Cam (BK7)', A: 1.5044, B: 0.00424 },
  su: { name: 'Su', A: 1.3236, B: 0.00318 },
  elmas: { name: 'Elmas', A: 2.379, B: 0.0133 },
};
const nOf = (mat, nm) => mat.A + mat.B / ((nm / 1000) ** 2);
const WAVES = [405, 430, 455, 475, 495, 515, 540, 565, 585, 605, 630, 660, 690];
const WCOL = WAVES.map(waveColor);

// 2B vektör yardımcıları
function refract(d, n, eta) {
  const cosi = -(d[0] * n[0] + d[1] * n[1]);
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) return null;
  const c = eta * cosi - Math.sqrt(k);
  return [eta * d[0] + c * n[0], eta * d[1] + c * n[1]];
}
const reflect = (d, n) => { const k = 2 * (d[0] * n[0] + d[1] * n[1]); return [d[0] - k * n[0], d[1] - k * n[1]]; };
const add = (p, d, t) => [p[0] + d[0] * t, p[1] + d[1] * t];
const deg = (r) => (r * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;

sim.scene.add(new THREE.HemisphereLight(0xc8d6ff, 0x1a1f2b, 1.3));
const dir = new THREE.DirectionalLight(0xffffff, 1.6);
dir.position.set(5, 10, 12);
sim.scene.add(dir);

// Yıldızsı toz arka plan
{
  const n = 900, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 220, (Math.random() - 0.5) * 140, -40 - Math.random() * 60], i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sim.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x51607f, size: 1.5, sizeAttenuation: false })));
}

const rays = new Rays(1400, 0.06);
sim.scene.add(rays.group);

const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.1,
  depthWrite: false, side: THREE.DoubleSide, emissive: 0x0b2a44 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.7 });

function lensGeometry(R, converging, thick) {
  const pts = [], N = 18, t0 = 0.08;
  const t = (r) => (converging ? t0 + thick * (1 - (r / R) ** 2) : t0 + thick * (r / R) ** 2);
  for (let i = 0; i <= N; i++) { const r = (R * i) / N; pts.push(new THREE.Vector2(Math.max(r, 1e-3), -t(r))); }
  for (let i = N; i >= 0; i--) { const r = (R * i) / N; pts.push(new THREE.Vector2(Math.max(r, 1e-3), t(r))); }
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateZ(-Math.PI / 2);
  return g;
}

function makeArrow(color, opacity = 1) {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, transparent: opacity < 1, opacity, side: THREE.DoubleSide });
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 12), mat);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1, 16), mat);
  g.add(shaft, head);
  g.userData = { shaft, head };
  return g;
}
function setArrow(a, h) {
  const s = Math.sign(h) || 1, L = Math.max(Math.abs(h), 0.05), head = Math.min(0.7, L * 0.45);
  const { shaft, head: cone } = a.userData;
  shaft.scale.y = L - head;
  shaft.position.y = (s * (L - head)) / 2;
  cone.scale.y = (head / 1) * s;
  cone.position.y = s * (L - head / 2);
}

// ================= MERCEK =================
const SC = 0.32; // dünya birimi / cm
const LENS_R = 4.4;
const XEND = 17;
const gLens = new THREE.Group();
sim.scene.add(gLens);
{
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2 * XEND, 0.35, 1.4), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.4 }));
  rail.position.y = -6.3;
  gLens.add(rail);
  for (let x = -16; x <= 16; x += 2) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.9), new THREE.MeshBasicMaterial({ color: x % 10 === 0 ? 0x94a3b8 : 0x475569 }));
    tick.position.set(x, -6.11, 0);
    gLens.add(tick);
  }
  const axisGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-XEND, 0, 0), new THREE.Vector3(XEND, 0, 0)]);
  gLens.add(new THREE.Line(axisGeo, new THREE.LineDashedMaterial({ color: 0x64748b, dashSize: 0.4, gapSize: 0.3 })).computeLineDistances());
}
const lensMesh = new THREE.Mesh(lensGeometry(LENS_R, true, 0.5), glassMat);
gLens.add(lensMesh);
const lensPost = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.8, 10), new THREE.MeshStandardMaterial({ color: 0x64748b }));
lensPost.position.y = -5.3;
gLens.add(lensPost);
const objArrow = makeArrow(0xfb923c);
const imgArrow = makeArrow(0x4ade80);
gLens.add(objArrow, imgArrow);
const objPost = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6.2, 8), new THREE.MeshStandardMaterial({ color: 0x475569 }));
objPost.position.y = -3.1;
objArrow.add(objPost);
const focalDots = [0, 1, 2, 3].map(() => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
  gLens.add(m);
  return m;
});
const focalLbls = ['F', "F'", '2F', "2F'"].map((t, i) => sim.label(t, { parent: focalDots[i], position: [0, -0.6, 0], className: 'plain' }));
const objLbl = sim.label('Cisim', { parent: objArrow, position: [0, 3, 0], className: 'plain' });
const imgLbl = sim.label('Görüntü', { parent: imgArrow, position: [0, 0.6, 0], className: 'plain' });
objLbl.el.style.color = '#fdba74';

// ================= PRİZMA =================
const gPrism = new THREE.Group();
sim.scene.add(gPrism);
let prismMesh = null, prismEdges = null, prismTri = [];
const screenBox = new THREE.Mesh(new THREE.BoxGeometry(0.3, 14, 4), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 }));
screenBox.position.set(12.2, 0, 0);
gPrism.add(screenBox);
sim.label('Ekran', { parent: screenBox, position: [0, 7.6, 0], className: 'plain' });
const lampBox = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5, roughness: 0.4 }));
gPrism.add(lampBox);
const prismLbl = sim.label('', { parent: gPrism, position: [0, -4.5, 0], className: 'plain' });

function buildPrism(A) {
  if (prismMesh) { prismMesh.geometry.dispose(); prismEdges.geometry.dispose(); gPrism.remove(prismMesh, prismEdges); }
  const H = Math.min(7.5, 3.8 / Math.tan(rad(A) / 2));
  const S = 2 * H * Math.tan(rad(A) / 2);
  prismTri = [[-S / 2, -H / 3], [0, (2 * H) / 3], [S / 2, -H / 3]];
  const shape = new THREE.Shape(prismTri.map((p) => new THREE.Vector2(p[0], p[1])));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false });
  geo.translate(0, 0, -2);
  prismMesh = new THREE.Mesh(geo, glassMat);
  prismEdges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
  gPrism.add(prismMesh, prismEdges);
  prismLbl.position.set(0, -H / 3 - 0.8, 2);
}

// ================= GÖKKUŞAĞI =================
const DROP_R = 3.2;
const gRain = new THREE.Group();
sim.scene.add(gRain);
{
  const drop = new THREE.Mesh(new THREE.SphereGeometry(DROP_R, 48, 32), new THREE.MeshStandardMaterial({
    color: 0x7cc4ff, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false, emissive: 0x08223a }));
  gRain.add(drop);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(DROP_R, 0.03, 6, 96), new THREE.MeshBasicMaterial({ color: 0x9fdcff }));
  gRain.add(ring);
  sim.label('Su damlası', { parent: gRain, position: [0, DROP_R + 0.6, 0], className: 'plain' });
  // Arkadaki süs gökkuşağı
  const cols = [700, 620, 580, 540, 490, 450, 410];
  cols.forEach((nm, i) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(34 - i * 0.9, 0.45, 6, 80, Math.PI),
      new THREE.MeshBasicMaterial({ color: waveColor(nm), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    t.position.set(0, -14, -45);
    gRain.add(t);
  });
}
const sunLbl = sim.label('☀️ Güneş ışığı', { parent: gRain, position: [-10, 5.5, 0], className: 'plain' });
const rainLbl = sim.label('', { parent: gRain, position: [0, 0, 0], className: 'plain' });

// ================= GÖZ =================
const gEye = new THREE.Group();
sim.scene.add(gEye);
const EYE_C = 2.9, EYE_R = 3.1, RET_X = EYE_C + EYE_R - 0.05, GLASS_X = -3.6;
{
  const ball = new THREE.Mesh(new THREE.SphereGeometry(EYE_R, 48, 32), new THREE.MeshStandardMaterial({
    color: 0xf1f5f9, transparent: true, opacity: 0.16, depthWrite: false, roughness: 0.4 }));
  ball.position.x = EYE_C;
  gEye.add(ball);
  const retina = new THREE.Mesh(new THREE.SphereGeometry(EYE_R - 0.04, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.3),
    new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0x3b0a0a, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false }));
  retina.rotation.z = -Math.PI / 2;
  retina.position.x = EYE_C;
  gEye.add(retina);
  const cornea = new THREE.Mesh(new THREE.SphereGeometry(1.35, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.32),
    new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
  cornea.rotation.z = Math.PI / 2;
  cornea.position.x = 0.95;
  gEye.add(cornea);
  const iris = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.55, 40), new THREE.MeshStandardMaterial({ color: 0x3b82f6, side: THREE.DoubleSide, emissive: 0x0b1e44 }));
  iris.rotation.y = Math.PI / 2;
  iris.position.x = -0.15;
  gEye.add(iris);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.MeshStandardMaterial({ color: 0xfef3c7, transparent: true, opacity: 0.45, depthWrite: false }));
  lens.scale.set(0.42, 1.05, 1.05);
  lens.position.x = 0.1;
  gEye.add(lens);
  gEye.userData.lens = lens;
  const nerve = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 2.4, 16), new THREE.MeshStandardMaterial({ color: 0xfca5a5, roughness: 0.8 }));
  nerve.rotation.z = Math.PI / 2;
  nerve.position.set(EYE_C + EYE_R + 0.9, -0.4, 0);
  gEye.add(nerve);
  sim.label('Retina', { parent: gEye, position: [RET_X + 0.3, 2.6, 0], className: 'plain' });
  sim.label('Göz merceği', { parent: gEye, position: [0.1, -1.9, 0], className: 'plain' });
}
const spectacle = new THREE.Mesh(lensGeometry(1.9, true, 0.3), glassMat);
spectacle.position.x = GLASS_X;
const frame = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.08, 8, 48), new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.6, roughness: 0.3 }));
frame.rotation.y = Math.PI / 2;
frame.position.x = GLASS_X;
gEye.add(spectacle, frame);
const glassLbl = sim.label('Gözlük camı', { parent: frame, position: [0, 2.5, 0], className: 'plain' });
const blurSpot = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0xfff7cc, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
blurSpot.rotation.y = -Math.PI / 2;
blurSpot.position.x = RET_X - 0.02;
gEye.add(blurSpot);
let accom = 0;

// ================= Arayüz =================
const ui = sim.ui;
const secs = {};
let mode = 'mercek';
let dirty = true;
const mark = () => { dirty = true; };

ui.section('Düzenek');
const modeSel = ui.segmented({
  options: [{ value: 'mercek', label: '🔍 Mercek' }, { value: 'prizma', label: '🔺 Prizma' }, { value: 'gokkusagi', label: '🌈 Gökkuşağı' }, { value: 'goz', label: '👁 Göz' }],
  value: 'mercek', onChange: (v) => setMode(v),
});

// Mercek
secs.mercek = [ui.section('Mercek')];
const lensType = ui.segmented({ label: 'Mercek türü', options: [{ value: 'yak', label: 'Yakınsak (ince kenarlı)' }, { value: 'irak', label: 'Iraksak (kalın kenarlı)' }], value: 'yak', onChange: () => { rebuildLens(); mark(); } });
const fSl = ui.slider({ label: 'Odak uzaklığı f', min: 5, max: 25, step: 0.5, value: 10, unit: 'cm', onInput: () => { rebuildLens(); mark(); } });
const doSl = ui.slider({ label: 'Cisim uzaklığı dₒ', min: 3, max: 50, step: 0.5, value: 30, unit: 'cm', onInput: mark });
const hSl = ui.slider({ label: 'Cisim boyu', min: 2, max: 15, step: 0.5, value: 8, unit: 'cm', onInput: mark });
const fanTg = ui.toggle({ label: 'Ek ışın demeti', value: false, onChange: mark });
const sweepTg = ui.toggle({ label: 'Cismi kendiliğinden gezdir', value: false });
ui.buttons([
  { label: '🔎 Büyüteç', onClick: () => lensPreset('yak', 15, 9, 5) },
  { label: '📽 Projektör', onClick: () => lensPreset('yak', 10, 14, 4) },
  { label: '📷 Fotoğraf', onClick: () => lensPreset('yak', 8, 45, 14) },
  { label: '↔ Iraksak', onClick: () => lensPreset('irak', 12, 25, 10) },
]);
secs.mercek.push(ui.section('Görüntü'));
const stDi = ui.stat({ label: 'Görüntü uzaklığı dᵢ', unit: 'cm' });
const stM = ui.stat({ label: 'Büyütme m' });
const stKind = ui.stat({ label: 'Tür' });
const stOrient = ui.stat({ label: 'Yön / boy' });
const lensChart = ui.chart({ title: 'dᵢ (cm) — yatay eksen: dₒ = 3 → 50 cm', series: [{ name: 'dᵢ', color: '#4ade80' }, { name: 'büyütme ×10', color: '#fbbf24' }], maxPoints: 95, yMin: -100, yMax: 100 });

// Prizma
secs.prizma = [ui.section('Prizma')];
const matSel = ui.select({ label: 'Malzeme', options: Object.entries(MATS).map(([value, m]) => ({ value, label: m.name })), value: 'cam', onChange: () => { mark(); prismChart(); } });
const incSl = ui.slider({ label: 'Geliş açısı θ₁', min: 0, max: 85, step: 0.5, value: 50, unit: '°', onInput: mark });
const apexSl = ui.slider({ label: 'Tepe açısı A', min: 30, max: 75, step: 1, value: 60, unit: '°', onInput: () => { buildPrism(apexSl.value); mark(); } });
const laserTg = ui.toggle({ label: 'Tek renk (sarı lazer, 589 nm)', value: false, onChange: mark });
const exagTg = ui.toggle({ label: 'Renk ayrışmasını 5× abart (yalnız çizim)', value: true, onChange: mark });
ui.buttons([
  { label: 'En küçük sapma', onClick: () => { const m = MATS[matSel.value], A = rad(apexSl.value); const s = nOf(m, 589) * Math.sin(A / 2); if (s < 1) incSl.set(Math.round(deg(Math.asin(s)) * 2) / 2); mark(); } },
  { label: 'Tam iç yansıma', onClick: () => { incSl.set(matSel.value === 'su' ? 0 : 8); mark(); } },
]);
secs.prizma.push(ui.section('Ölçümler'));
const stN = ui.stat({ label: 'n (589 nm)' });
const stDevR = ui.stat({ label: 'Sapma: kırmızı', unit: '°' });
const stDevV = ui.stat({ label: 'Sapma: mor', unit: '°' });
const stSpread = ui.stat({ label: 'Renk yayılması', unit: '°' });
const stDmin = ui.stat({ label: 'En küçük sapma δₘ', unit: '°' });
const stTir = ui.stat({ label: 'Tam iç yansıma' });
const nChart = ui.chart({ title: 'Kırılma indisi n(λ) — 400 → 700 nm', series: [{ name: 'n', color: '#a78bfa' }], maxPoints: 31, format: (v) => fmt(v, 3) });

// Gökkuşağı
secs.gokkusagi = [ui.section('Damla')];
const bSl = ui.slider({ label: 'Çarpma yüksekliği b/R', min: 0, max: 0.99, step: 0.01, value: 0.86, onInput: mark });
const orderSel = ui.segmented({ label: 'Yay', options: [{ value: 1, label: 'Birincil (1 yansıma)' }, { value: 2, label: 'İkincil (2 yansıma)' }], value: 1, onChange: () => { mark(); rainChart(); } });
const bundleTg = ui.toggle({ label: 'Işın demeti (tüm b değerleri)', value: false, onChange: mark });
ui.buttons([{ label: 'Descartes ışını', onClick: () => { bSl.set(orderSel.value === 1 ? 0.86 : 0.95); mark(); } }]);
secs.gokkusagi.push(ui.section('Açılar'));
const stRainR = ui.stat({ label: 'Bu ışın: kırmızı', unit: '°' });
const stRainV = ui.stat({ label: 'Bu ışın: mor', unit: '°' });
const stBowR = ui.stat({ label: 'Yay açısı: kırmızı', unit: '°' });
const stBowV = ui.stat({ label: 'Yay açısı: mor', unit: '°' });
const rainChartUi = ui.chart({ title: 'Çıkış açısı (°) — yatay eksen: b/R = 0 → 1', series: [{ name: 'kırmızı', color: '#ef4444' }, { name: 'mor', color: '#8b5cf6' }], maxPoints: 100 });

// Göz
secs.goz = [ui.section('Göz')];
const errSl = ui.slider({ label: 'Göz kusuru', min: -8, max: 5, step: 0.25, value: -3, format: (v) => `${v > 0 ? '+' : ''}${fmt(v, 2)} D · ${v < -0.1 ? 'miyopi' : v > 0.1 ? 'hipermetropi' : 'normal'}`, onInput: mark });
const corrSl = ui.slider({ label: 'Gözlük camı', min: -8, max: 5, step: 0.25, value: 0, format: (v) => `${v > 0 ? '+' : ''}${fmt(v, 2)} D · ${v < -0.1 ? 'ıraksak' : v > 0.1 ? 'yakınsak' : 'yok'}`, onInput: () => { rebuildSpectacle(); mark(); } });
const ampSl = ui.slider({ label: 'Uyum gücü (yaşla azalır)', min: 0, max: 10, step: 0.5, value: 4, unit: 'D', onInput: mark });
const distSel = ui.segmented({ label: 'Bakılan nesne', options: [{ value: 'uzak', label: 'Uzak (∞)' }, { value: 'yakin', label: 'Okuma (40 cm)' }], value: 'uzak', onChange: mark });
ui.buttons([
  { label: 'Miyop', onClick: () => eyePreset(-3, 0, 6, 'uzak') },
  { label: 'Hipermetrop', onClick: () => eyePreset(3, 0, 1.5, 'uzak') },
  { label: 'Presbiyop', onClick: () => eyePreset(0, 0, 0.5, 'yakin') },
  { label: '✔ Düzelt', variant: 'good', onClick: autoCorrect },
]);
secs.goz.push(ui.section('Retina'));
const focusMeter = ui.meter({ label: 'Retinada netlik', color: '#4ade80' });
const stFocus = ui.stat({ label: 'Odak noktası' });
const stAccom = ui.stat({ label: 'Kullanılan uyum', unit: 'D' });
const eyeChart = ui.text('', 'card');
const clarityChart = ui.chart({ title: 'Netlik (%) — yatay eksen: gözlük camı −8 → +5 D', series: [{ name: 'netlik', color: '#4ade80', fill: true }], maxPoints: 53, yMin: 0, yMax: 100 });
ui.text('<small>⚕️ Eğitim amaçlıdır, tıbbi tavsiye değildir. Gözlük numarası göz doktoru muayenesiyle belirlenir.</small>');

// ================= Hesaplar ve çizim =================
function lensF() { return (lensType.value === 'yak' ? 1 : -1) * fSl.value; }
function imageOf(dO, f) {
  const inv = 1 / f - 1 / dO;
  const di = Math.abs(inv) < 1e-6 ? Infinity : 1 / inv;
  return { di, m: isFinite(di) ? -di / dO : Infinity };
}
function rebuildLens() {
  lensMesh.geometry.dispose();
  lensMesh.geometry = lensGeometry(LENS_R, lensType.value === 'yak', clamp(6 / fSl.value, 0.18, 1.1));
  lensChartUpdate();
}
function lensPreset(t, f, dO, h) {
  lensType.set(t); fSl.set(f); doSl.set(dO); hSl.set(h);
  sweepTg.set(false);
  rebuildLens(); mark();
}
function lensChartUpdate() {
  lensChart.clear();
  const f = lensF();
  for (let i = 0; i < 95; i++) {
    const dO = 3 + i * 0.5, { di, m } = imageOf(dO, f);
    lensChart.push([clamp(isFinite(di) ? di : 100, -100, 100), clamp(isFinite(m) ? m * 10 : 100, -100, 100)]);
  }
}

// Işın segmentini sahne sınırına kadar uzat
function extend(p, d, xMax = XEND, yMax = 11) {
  let t = 60;
  if (d[0] > 1e-9) t = Math.min(t, (xMax - p[0]) / d[0]);
  if (d[0] < -1e-9) t = Math.min(t, (-xMax - p[0]) / d[0]);
  if (d[1] > 1e-9) t = Math.min(t, (yMax - p[1]) / d[1]);
  if (d[1] < -1e-9) t = Math.min(t, (-yMax - p[1]) / d[1]);
  return add(p, d, Math.max(t, 0));
}

function drawLens() {
  const f = lensF(), F = f * SC, dO = doSl.value, D = dO * SC, Hh = hSl.value * SC;
  const { di, m } = imageOf(dO, f);
  const tip = [-D, Hh];
  objArrow.position.set(-D, 0, 0); setArrow(objArrow, Hh); objLbl.position.y = Hh + 0.7;
  focalDots[0].position.set(-Math.abs(F), 0, 0); focalDots[1].position.set(Math.abs(F), 0, 0);
  focalDots[2].position.set(-2 * Math.abs(F), 0, 0); focalDots[3].position.set(2 * Math.abs(F), 0, 0);
  if (f < 0) { focalLbls[0].setText("F'"); focalLbls[1].setText('F'); focalLbls[2].setText("2F'"); focalLbls[3].setText('2F'); }
  else { focalLbls[0].setText('F'); focalLbls[1].setText("F'"); focalLbls[2].setText('2F'); focalLbls[3].setText("2F'"); }

  const virtual = isFinite(di) && di < 0;
  const trace = (u, col, alpha = 1, w = 1) => {
    const y = Hh + u * D;
    if (Math.abs(y) > LENS_R) { rays.seg(tip, extend(tip, norm([1, u])), col, { alpha: alpha * 0.4, w }); return; }
    rays.seg(tip, [0, y], col, { alpha, w });
    const u2 = u - y / F;
    rays.seg([0, y], extend([0, y], norm([1, u2])), col, { alpha, w });
    if (virtual) rays.seg([0, y], [di * SC, y + u2 * di * SC], col, { dash: true, alpha, w });
    return y;
  };
  trace(0, C1);
  trace(-Hh / D, C2);
  if (Math.abs(D - F) > 0.05) {
    const y3 = trace(-Hh / (D - F), C3);
    if (f < 0 && y3 != null) rays.seg([0, y3], [-F, 0], C3, { dash: true, alpha: 0.6 });
  }
  if (fanTg.value) for (let k = -3; k <= 3; k++) trace((k * LENS_R * 0.28 - Hh) / D, CFAN, 0.45, 0.6);

  // Görüntü oku
  const ix = di * SC, ih = m * Hh;
  const show = isFinite(di) && Math.abs(ix) < XEND;
  imgArrow.visible = show;
  if (show) {
    imgArrow.position.set(ix, 0, 0);
    setArrow(imgArrow, clamp(ih, -10.5, 10.5));
    imgArrow.userData.shaft.material.opacity = virtual ? 0.45 : 1;
    imgArrow.userData.shaft.material.transparent = virtual;
    imgArrow.userData.shaft.material.color.set(virtual ? 0xc084fc : 0x4ade80);
    imgArrow.userData.shaft.material.emissive.set(virtual ? 0xc084fc : 0x4ade80);
    imgLbl.setText(virtual ? 'Sanal görüntü' : 'Gerçek görüntü');
    imgLbl.position.y = clamp(ih, -10.5, 10.5) + (ih >= 0 ? 0.7 : -0.7);
  }
  stDi.set(isFinite(di) ? fmt(di, 1) : '∞');
  stM.set(isFinite(m) ? `${fmt(m, 2)}×` : '∞');
  if (!isFinite(di)) { stKind.set('Sonsuzda', 'warn'); stOrient.set('ışınlar paralel', 'warn'); }
  else {
    stKind.set(virtual ? 'Sanal' : 'Gerçek', virtual ? 'warn' : 'good');
    stOrient.set(`${m > 0 ? 'Düz' : 'Ters'} · ${Math.abs(m) > 1.02 ? 'büyük' : Math.abs(m) < 0.98 ? 'küçük' : 'aynı boy'}`);
  }
}
const norm = (d) => { const l = Math.hypot(d[0], d[1]); return [d[0] / l, d[1] / l]; };

// Prizma: ışını üçgen içinde izle
function edgesOf() {
  return [0, 1, 2].map((i) => {
    const a = prismTri[i], b = prismTri[(i + 1) % 3];
    const ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey);
    return { a, b, n: [-ey / L, ex / L] }; // saat yönünde köşe sırası → dış normal
  });
}
function hitEdge(p, d, edges, skip) {
  let best = null;
  edges.forEach((e, i) => {
    if (i === skip) return;
    const ex = e.b[0] - e.a[0], ey = e.b[1] - e.a[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-9) return;
    const t = ((e.a[0] - p[0]) * ey - (e.a[1] - p[1]) * ex) / den;
    const s = ((e.a[0] - p[0]) * d[1] - (e.a[1] - p[1]) * d[0]) / den;
    if (t > 1e-6 && s >= 0 && s <= 1 && (!best || t < best.t)) best = { t, i };
  });
  return best;
}
function tracePrism(nGlass, color, draw) {
  const edges = edgesOf(), L = edges[0];
  const P = [(L.a[0] + L.b[0]) / 2, (L.a[1] + L.b[1]) / 2];
  const nin = [-L.n[0], -L.n[1]];
  const ang = Math.atan2(nin[1], nin[0]) + rad(incSl.value);
  const d0 = [Math.cos(ang), Math.sin(ang)];
  let d = refract(d0, L.n, 1 / nGlass);
  if (!d) return null;
  let p = P, edge = 0, tir = false;
  for (let k = 0; k < 5; k++) {
    const h = hitEdge(p, d, edges, edge);
    if (!h) return null;
    const q = add(p, d, h.t);
    if (draw) rays.seg(p, q, color, { alpha: 0.8, w: 0.7 });
    const e = edges[h.i];
    const out = refract(d, [-e.n[0], -e.n[1]], nGlass);
    if (out) {
      let t = 30;
      if (out[0] > 1e-6) t = Math.min(t, (12 - q[0]) / out[0]);
      const end = add(q, out, Math.max(t, 0));
      if (draw) rays.seg(q, end, color, { w: 1.1 });
      return { d0, out, tir, start: add(P, d0, -14), P, end };
    }
    tir = true;
    d = reflect(d, e.n);
    p = q; edge = h.i;
  }
  return { d0, out: null, tir: true, start: add(P, d0, -14), P };
}
function drawPrism() {
  const mat = MATS[matSel.value];
  const list = laserTg.value ? [589] : WAVES;
  let first = null, dev = {}, anyTir = false;
  list.forEach((nm) => {
    const n = nOf(mat, nm), n0 = nOf(mat, 589);
    const col = laserTg.value ? waveColor(589) : WCOL[WAVES.indexOf(nm)];
    const shown = tracePrism(exagTg.value ? n0 + (n - n0) * 5 : n, col, true);
    const r = exagTg.value ? tracePrism(n, col, false) : shown;
    if (!r || !shown) return;
    first = first || r;
    anyTir = anyTir || r.tir;
    if (r.out) dev[nm] = deg(Math.acos(clamp(r.d0[0] * r.out[0] + r.d0[1] * r.out[1], -1, 1)));
  });
  if (first) {
    rays.seg(first.start, first.P, laserTg.value ? waveColor(589) : WHITE, { w: 1.4 });
    lampBox.position.set(first.start[0], first.start[1], 0);
    lampBox.rotation.z = Math.atan2(first.d0[1], first.d0[0]);
  }
  const n589 = nOf(mat, 589), A = rad(apexSl.value);
  const s = n589 * Math.sin(A / 2);
  stN.set(fmt(n589, 3));
  const r = dev[690] ?? dev[589], v = dev[405] ?? dev[589];
  stDevR.set(r != null ? fmt(r, 1) : '—');
  stDevV.set(v != null ? fmt(v, 1) : '—');
  stSpread.set(r != null && v != null && !laserTg.value ? fmt(Math.abs(v - r), 2) : '—');
  stDmin.set(s < 1 ? fmt(deg(2 * Math.asin(s) - A), 1) : 'yok');
  stTir.set(anyTir ? 'Var!' : 'Yok', anyTir ? 'warn' : '');
  prismLbl.setText(`${mat.name} · n ≈ ${fmt(n589, 3)}`);
}
function prismChart() {
  nChart.clear();
  const mat = MATS[matSel.value];
  for (let i = 0; i <= 30; i++) nChart.push([nOf(mat, 400 + i * 10)]);
}

// Gökkuşağı: damlada izleme
function traceDrop(nW, b, order, color, draw, alpha = 1, w = 1) {
  const y = b * DROP_R, x = -Math.sqrt(DROP_R * DROP_R - y * y);
  let p = [x, y];
  const start = [-16, y];
  if (draw && color) rays.seg(start, p, WHITE, { alpha: alpha * 0.9, w });
  let d = refract([1, 0], [p[0] / DROP_R, p[1] / DROP_R], 1 / nW);
  for (let k = 0; k < order; k++) {
    const t = -2 * (p[0] * d[0] + p[1] * d[1]);
    const q = add(p, d, t);
    if (draw) rays.seg(p, q, color, { alpha: alpha * 0.8, w: w * 0.7 });
    d = reflect(d, [q[0] / DROP_R, q[1] / DROP_R]);
    p = q;
  }
  const t = -2 * (p[0] * d[0] + p[1] * d[1]);
  const q = add(p, d, t);
  if (draw) rays.seg(p, q, color, { alpha: alpha * 0.8, w: w * 0.7 });
  const out = refract(d, [-q[0] / DROP_R, -q[1] / DROP_R], nW) || d;
  if (draw) rays.seg(q, add(q, out, 13), color, { alpha, w });
  return { angle: deg(Math.acos(clamp(-out[0], -1, 1))), q, out };
}
let bowCache = {};
function bowAngle(nm, order) {
  const key = nm + '_' + order;
  if (bowCache[key] != null) return bowCache[key];
  const n = nOf(MATS.su, nm);
  let best = order === 1 ? -1 : 999;
  for (let i = 1; i < 600; i++) {
    const a = traceDrop(n, i / 600, order, null, false).angle;
    best = order === 1 ? Math.max(best, a) : Math.min(best, a);
  }
  return (bowCache[key] = best);
}
function drawRain() {
  const order = orderSel.value, b = bSl.value;
  if (bundleTg.value) {
    for (let i = 1; i <= 24; i++) traceDrop(nOf(MATS.su, 660), i / 25, order, WCOL[11], true, 0.35, 0.55);
  }
  let red, vio;
  [0, 2, 4, 6, 8, 10, 12].forEach((k) => {
    const r = traceDrop(nOf(MATS.su, WAVES[k]), b, order, WCOL[k], true);
    if (k === 12) red = r;
    if (k === 0) vio = r;
  });
  rainLbl.position.set(red.q[0] + red.out[0] * 11, red.q[1] + red.out[1] * 11, 0);
  rainLbl.setText(`${fmt(red.angle, 1)}°`);
  sunLbl.position.set(-10, b * DROP_R + 0.8, 0);
  stRainR.set(fmt(red.angle, 1)); stRainV.set(fmt(vio.angle, 1));
  stBowR.set(fmt(bowAngle(690, order), 1)); stBowV.set(fmt(bowAngle(405, order), 1));
}
function rainChart() {
  rainChartUi.clear();
  const order = orderSel.value;
  for (let i = 0; i < 100; i++) {
    const b = i / 100;
    rainChartUi.push([traceDrop(nOf(MATS.su, 690), b, order, null, false).angle, traceDrop(nOf(MATS.su, 405), b, order, null, false).angle]);
  }
}

// Göz: indirgenmiş göz, 60 D; retina sabit, kusur = fazla/eksik kırıcılık
const K = 0.035; // görsel eğim abartısı
function eyeState(corr) {
  const Vo = distSel.value === 'yakin' ? -2.5 : 0;
  const need = -(Vo + corr - errSl.value);
  const a = clamp(need, 0, ampSl.value);
  return { Vo, a, delta: Vo + corr - errSl.value + a };
}
const clarityOf = (delta) => 100 / (1 + (1.6 * delta) ** 2);
function rebuildSpectacle() {
  const P = corrSl.value;
  spectacle.visible = frame.visible = glassLbl.visible = Math.abs(P) > 0.01;
  spectacle.geometry.dispose();
  spectacle.geometry = lensGeometry(1.9, P > 0, clamp(Math.abs(P) * 0.05, 0.04, 0.4));
}
function eyePreset(err, corr, amp, dist) {
  errSl.set(err); corrSl.set(corr); ampSl.set(amp); distSel.set(dist);
  rebuildSpectacle(); mark();
}
function autoCorrect() {
  // Uzak için kusur kadar; yakında uyum yetmezse okuma eki
  let c = errSl.value;
  if (distSel.value === 'yakin') c = Math.max(errSl.value, errSl.value + 2.5 - ampSl.value);
  corrSl.set(Math.round(c * 4) / 4);
  rebuildSpectacle(); mark();
}
function drawEye() {
  const { Vo, delta } = eyeState(corrSl.value);
  const P = corrSl.value;
  const L = RET_X; // göz merceğinden retinaya
  const xf = (L * 60) / (60 + delta * 3); // odak kayması görünürlük için 3× abartılı
  let maxBlur = 0;
  for (let k = -3; k <= 3; k++) {
    const y0 = k * 0.42;
    const u0 = -y0 * Vo * K;
    const xs = -11;
    const ys = y0 - u0 * (GLASS_X - xs);
    const u1 = u0 - y0 * P * K;
    const ye = y0 + u1 * (0 - GLASS_X);
    rays.seg([xs, ys], [GLASS_X, y0], WHITE, { alpha: 0.85, w: 0.9 });
    rays.seg([GLASS_X, y0], [0, ye], WHITE, { alpha: 0.85, w: 0.9 });
    const slope = -ye / xf;
    const yr = ye + slope * L;
    maxBlur = Math.max(maxBlur, Math.abs(yr));
    const col = Math.abs(delta) < 0.3 ? C1 : C3;
    rays.seg([0, ye], [L, yr], col, { alpha: 0.9, w: 0.9 });
    if (xf < L) rays.seg([0, ye], [xf, 0], col, { alpha: 0.25, w: 0.4 });
  }
  blurSpot.scale.setScalar(Math.max(0.1, maxBlur));
  blurSpot.material.opacity = clamp(0.9 / (0.3 + maxBlur * 1.5), 0.15, 0.95);
  const cl = clarityOf(delta);
  focusMeter.set(cl / 100, `%${fmt(cl, 0)}`);
  focusMeter.color(cl > 80 ? '#4ade80' : cl > 40 ? '#fbbf24' : '#f87171');
  const mm = 22.27 * (60 / (60 + delta)) - 22.27;
  stFocus.set(Math.abs(mm) < 0.05 ? 'retinada' : `${fmt(Math.abs(mm), 2)} mm ${mm < 0 ? 'önünde' : 'arkasında'}`, Math.abs(delta) < 0.3 ? 'good' : 'warn');
  stAccom.set(fmt(accom, 1));
  const blurPx = Math.min(8, Math.abs(delta) * 1.3);
  eyeChart.set(`<div style="font:700 20px/1.25 monospace;text-align:center;letter-spacing:4px;filter:blur(${fmt(blurPx, 1).replace(',', '.')}px)">E&nbsp;F&nbsp;P<br>T&nbsp;O&nbsp;Z<br><span style="font-size:13px">L P E D</span></div>
    <div style="text-align:center;font-size:11px;opacity:.7">Göz bu harfleri böyle görür</div>`);
  // Göz merceği uyumla kalınlaşır
  gEye.userData.lens.scale.x = 0.42 + accom * 0.03;
}
function clarityChartUpdate() {
  clarityChart.clear();
  for (let i = 0; i <= 52; i++) clarityChart.push([clarityOf(eyeState(-8 + i * 0.25).delta)]);
}

// ================= Mod geçişi =================
const CAMS = {
  mercek: [[0, 1.5, 30], [0, 0.5, 0]], prizma: [[0, 1.5, 30], [1.5, 0, 0]], gokkusagi: [[0, 1, 30], [0, 0, 0]], goz: [[0.5, 1.2, 19], [0.5, 0, 0]],
};
function setMode(v) {
  mode = v;
  gLens.visible = v === 'mercek'; gPrism.visible = v === 'prizma'; gRain.visible = v === 'gokkusagi'; gEye.visible = v === 'goz';
  for (const [k, list] of Object.entries(secs)) list.forEach((s) => (s.parentElement.style.display = k === v ? '' : 'none'));
  sim.moveCamera(...CAMS[v]);
  if (v === 'goz') clarityChartUpdate();
  mark();
}

let sweepPhase = 0, chartTick = 0;
sim.onUpdate((dt) => {
  if (mode === 'mercek' && sweepTg.value) {
    sweepPhase += Math.min(dt, 0.5) * 0.3;
    doSl.set(Math.round((26.5 + 23 * Math.sin(sweepPhase)) * 2) / 2);
    mark();
  }
  if (mode === 'goz') {
    const { a } = eyeState(corrSl.value);
    const na = accom + (a - accom) * Math.min(1, dt * 3);
    if (Math.abs(na - accom) > 1e-3) { accom = na; mark(); } else accom = a;
    if (++chartTick % 20 === 0) clarityChartUpdate();
  }
});
sim.onRender(() => {
  if (!dirty) return;
  dirty = false;
  rays.begin();
  if (mode === 'mercek') drawLens();
  else if (mode === 'prizma') drawPrism();
  else if (mode === 'gokkusagi') drawRain();
  else drawEye();
  rays.end();
});

// Cisim okunu sürükle
let dragging = false;
const zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
sim.dom.addEventListener('pointerdown', (e) => {
  if (mode !== 'mercek' || !sim.raycast(e, [objArrow]).length) return;
  dragging = true;
  sim.controls.enabled = false;
});
sim.dom.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const p = sim.pointOnPlane(e, zPlane);
  if (p) { doSl.set(clamp(Math.round((-p.x / SC) * 2) / 2, 3, 50)); mark(); }
});
window.addEventListener('pointerup', () => { if (dragging) { dragging = false; sim.controls.enabled = true; } });

sim.onReset(() => {
  lensPreset('yak', 10, 30, 8);
  matSel.set('cam');
  incSl.set(50); apexSl.set(60); buildPrism(60); prismChart();
  bSl.set(0.86);
  eyePreset(-3, 0, 4, 'uzak');
  accom = 0; sweepPhase = 0;
  mark();
});

buildPrism(60);
rebuildLens();
rebuildSpectacle();
prismChart();
rainChart();
setMode('mercek');
