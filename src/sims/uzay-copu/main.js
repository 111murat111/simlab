// Uzay Çöpü ve Kessler Sendromu — alçak yörüngede irtifa bantlarına göre nesne nüfusu, çarpışma zinciri ve önlemler.
import { createSim, THREE, fmt, clamp, rand, pick, heatColor, TAU } from '@core';
import { createPlanet, createStar, starUniform } from './planets.js';
import * as M from './model.js';
import { createCraft } from './craft.js';

const R_VIS = 6.371;       // Dünya yarıçapı (1 birim = 1000 km)
const ALT_X = 3;           // irtifa görsel olarak 3× abartılı
const rOf = (h) => R_VIS + (h / 1000) * ALT_X;
const YEAR_SEC = 1.5;      // 1× hızda bir yıl kaç saniye
const MAXI = 9000;         // en çok nokta
const TIERS = [4, 10, 25, 100, 250, 1000, 2500, 10000];
const CATS = [
  { key: 'S', name: 'Aktif uydu', color: 0xb9e3c4 },
  { key: 'D', name: 'Ölü uydu / roket gövdesi', color: 0xe3cfa4 },
  { key: 'Z', name: 'Görev sonu inişte', color: 0xbfd3ee },
  { key: 'F', name: 'Parça', color: 0xd6d4d2 },
];

const sim = createSim({
  space: { star: [360, 70, 150], power: 1.05, milky: 0.9, nebula: 0.6, stars: 0.5, galaxyTilt: 70 },
  look: { bloomStrength: 0.4 },
  camera: { position: [-9, 7.5, 24], target: [1.5, 0.5, 0], fov: 45, near: 0.05, far: 3000 },
  controls: { maxDistance: 120, minDistance: 9, maxPolarAngle: Math.PI, enablePan: false },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Dünya ve alçak yörüngedeki (LEO, 200–2.000 km) ≥ 10 cm nesneler: <b style="color:#6fae80">aktif uydular</b>,
    <b style="color:#b8955a">ölü uydular ve roket gövdeleri</b>, görev sonu kuralına uyup <b style="color:#7d9cc4">alçalmakta olan uydular</b>, <b style="color:#8f8a86">çarpışma ve patlama parçaları</b>.
    Her nokta birkaç nesneyi temsil eder; irtifa görünürlük için 3 kat abartılmıştır. Ön plandaki istasyon, küp uydular ve boş roket kademesi
    ölçeksiz örnek modellerdir (gerçekte bu ölçekte bir pikselden çok küçüktürler). Ekvator düzlemindeki halkalar
    irtifa bantlarıdır: renkleri o banttaki parça nüfusunun <b>çarpışma üretimi − atmosfer temizliği</b> ile net büyüme hızını gösterir
    (mavi: atmosfer temizliyor, sarı: denge, kırmızı: çarpışmalarla kendi kendini besliyor).</p>
    <h3>Model</h3>
    <ul>
      <li><b>Çarpışma hızı ∝ yoğunluk²:</b> Bir banttaki çarpışma sayısı nesne sayısının karesiyle artar, bant hacmine bölünür.
      Aktif uydular manevrayla kaçınabilir ("kaçınma başarısı").</li>
      <li><b>Parçalanma:</b> İki bütün nesne çarpışırsa NASA Standart Parçalanma Modeline göre
      N(≥L<sub>c</sub>) = 0,1·M<sup>0,75</sup>·L<sub>c</sub><sup>−1,71</sup> → M ≈ 1.000 kg için ≈ 900 adet ≥ 10 cm parça.
      Parçanın uyduya çarpması daha az parça üretir (temsili 50).</li>
      <li><b>Atmosfer sürüklemesi:</b> Nesneler yavaşça alçalır ve yanar. Ömür irtifayla üstel artar: ≈ 400 km'de 1–2 yıl,
      600 km'de onlarca yıl, 800 km'de yüzyıllar, 1.000 km üstünde binlerce yıl (temsili; Güneş etkinliğine bağlı).</li>
      <li><b>Görev sonu kuralı:</b> Uyumlu uydular görev bitince 25 yıl (IADC yönergesi) ya da 5 yıl (ABD FCC, 2022) içinde yörüngeden çıkar;
      uymayanlar ölü nesne olarak kalır. <b>Aktif enkaz kaldırma</b> en riskli bantlardan büyük ölü nesneleri toplar.</li>
      <li><b>Kessler sendromu:</b> Bir bantta çarpışmaların ürettiği parça, sürüklemenin temizlediğinden fazlaysa nüfus fırlatma olmadan da büyür
      (Kessler & Cour-Palais, 1978).</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li><b>Fırlatma durursa</b>: 400 km altı birkaç yılda temizlenir ama 800–1.000 km'deki parçalar yüzyıllarca kalır ve çarpışmalar
      parça sayısını yavaşça artırır. NASA'nın LEGEND simülasyonları da benzer sonuç verir (Liou & Johnson, 2006).</li>
      <li><b>Kontrolsüz büyüme</b>: çarpışmalar zincirleme artar, grafik üstel koşar.</li>
      <li><b>ASAT testi</b> düğmesine bas: 865 km'ye binlerce parça eklenir; o bandın halkası kırmızıya döner ve uzun süre öyle kalır.</li>
      <li>"Bugünkü eğilim"de 5 yıl kuralını ve yılda 20 nesne kaldırmayı aç: büyüme ne kadar yavaşlıyor?</li>
    </ul>
    <h3>Gerçek veriler</h3>
    <ul>
      <li>ESA Uzay Çevresi Raporu 2025: ≈ 40.000 nesne izleniyor, bunların ≈ 11.000'i aktif uydu; tahminen 10 cm'den büyük
      50.000'den fazla, 1 cm'den büyük 1,2 milyondan fazla enkaz var.</li>
      <li>10 Şubat 2009: aktif Iridium 33 ile kullanılmayan Kosmos 2251, 789 km'de ≈ 11,7 km/s hızla çarpıştı; 2.000'den fazla parça kataloglandı.</li>
      <li>Ocak 2007: Çin, ≈ 865 km'deki Fengyun-1C uydusunu füzeyle vurdu (ASAT testi); 3.000'den fazla izlenebilir parça oluştu.</li>
    </ul>
    <p><small>Başlangıçtaki bant dağılımı, fırlatma dağılımı, sürükleme ömürleri ve çarpışma katsayısı temsilidir (başlangıçta yılda ≈ 0,1
    büyük çarpışma). Model istatistikseldir: tek tek yörüngeler hesaplanmaz, eğim ve yörünge düzlemleri gösterim içindir.
    Kaynaklar: ESA Space Environment Report 2025; NASA Orbital Debris Program Office (SBM; ODQN); Kessler & Cour-Palais (1978).</small></p>`,
});

// --- Güneş ve Dünya (yerel gezegen shader'ı: okyanus, kıtalar, bulutlar, gece ışıkları, atmosfer) ---
const SUN_POS = new THREE.Vector3(360, 70, 150);
starUniform.value.copy(SUN_POS);
const sunVis = createStar(3.4, { color: 0xfff1de, intensity: 4.5 });
sunVis.group.position.copy(SUN_POS);
sim.scene.add(sunVis.group);
const earthVis = createPlanet(R_VIS, 'dunya', 0.31);
const earth = earthVis.group;
sim.scene.add(earth);

// --- İrtifa bantları (ekvator halkaları) ---
const rings = [];
const ringGroup = new THREE.Group();
const neutralCol = new THREE.Color(0xb8c2cc);
sim.scene.add(ringGroup);
// Her bant: çok ince, yarı saydam yörünge kabuğu (dış kenarda ince çizgi + neredeyse görünmez dolgu; tıklama için)
for (let i = 0; i < M.NB; i++) {
  const r0 = rOf(M.EDGES[i]), r1 = rOf(M.EDGES[i + 1]);
  const m = new THREE.Mesh(
    new THREE.RingGeometry(r0 + 0.01, r1 - 0.01, 160, 1),
    new THREE.MeshBasicMaterial({ color: 0x9fb4cc, transparent: true, opacity: 0.01, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  m.rotation.x = -Math.PI / 2;
  m.userData.band = i;
  const edge = new THREE.Mesh(new THREE.TorusGeometry((r0 + r1) / 2, 0.006, 6, 256),
    new THREE.MeshBasicMaterial({ color: 0x9fb4cc, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }));
  edge.raycast = () => {};
  m.add(edge);
  m.userData.edge = edge;
  ringGroup.add(m);
  rings.push(m);
}
for (const [h, a] of [[400, 0.6], [1000, Math.PI - 0.6], [2000, 0.6]]) {
  const r = rOf(h) + 0.15;
  sim.label(`${fmt(h, 0)} km`, { parent: ringGroup, position: [r * Math.cos(a), 0.3, r * Math.sin(a)], className: 'plain' });
}

// --- Nesne noktaları: yumuşak yuvarlak parçacıklar (Dünya arkasındakiler gizlenir) ---
const dotTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const dPos = new Float32Array(MAXI * 3), dCol = new Float32Array(MAXI * 3);
const dGeo = new THREE.BufferGeometry();
dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
dGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
// Nokta gölgelendiricisi: uzaklıkla küçülen yumuşak disk; Dünya'nın gölgesindeki (gece tarafı arkasındaki) nesneler
// güneş almadığı için sönük; metal yüzeyler ara sıra güneşi yansıtıp kısa süre parlar (gerçek uydu parıltısı gibi)
const dotU = { uTex: { value: dotTex }, uSun: { value: new THREE.Vector3(360, 70, 150).normalize() }, uR: { value: R_VIS }, uTime: { value: 0 }, uPix: { value: 600 }, uSize: { value: 0.095 } };
const dots = new THREE.Points(dGeo, new THREE.ShaderMaterial({
  uniforms: dotU, transparent: true, depthWrite: false,
  vertexShader: `
    uniform vec3 uSun; uniform float uR, uTime, uPix, uSize; attribute vec3 color; varying vec3 vCol; varying float vA;
    float hh(float n){ return fract(sin(n*12.9898)*43758.5453); }
    void main(){
      vec4 mv = modelViewMatrix*vec4(position, 1.0);
      gl_Position = projectionMatrix*mv;
      float id = float(gl_VertexID), s1 = hh(id), s2 = hh(id + 71.3);
      float along = dot(position, uSun), perp = length(position - along*uSun);
      float lit = along > 0.0 ? 1.0 : smoothstep(uR*0.97, uR*1.04, perp);
      float glint = pow(max(0.0, sin(uTime*(0.4 + s1) + s2*60.0)), 80.0)*step(0.94, s2)*lit;
      vCol = color*(0.18 + 0.82*lit)*(0.75 + 0.5*s1) + vec3(3.2, 3.0, 2.8)*glint;
      vA = 0.55 + 0.4*lit;
      gl_PointSize = clamp(uSize*uPix/max(-mv.z, 0.1)*(0.8 + 0.5*s1)*(1.0 + glint), 1.2, 7.0);
    }`,
  fragmentShader: `
    uniform sampler2D uTex; varying vec3 vCol; varying float vA;
    void main(){ float a = texture2D(uTex, gl_PointCoord).a*vA; if (a < 0.01) discard; gl_FragColor = vec4(vCol, a); }`,
}));
dots.frustumCulled = false;
sim.scene.add(dots);

// --- Yakındaki örnek nesneler (ölçeksiz): gerçek irtifalarında, kameraya bakan gündüz tarafında ---
const craft = (() => {
  const cam = new THREE.Vector3(-9, 7.5, 24), c = cam.clone().normalize();
  const fw = new THREE.Vector3(1.5, 0.5, 0).sub(cam).normalize();
  const right = new THREE.Vector3().crossVectors(fw, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fw).normalize();
  const d = (a, b, e) => c.clone().multiplyScalar(a).addScaledVector(right, b).addScaledVector(up, e);
  return createCraft(sim.scene, { spots: [
    { dir: d(0.5, 0.88, 0.22), r: rOf(420) },          // ISS benzeri istasyon, ≈ 420 km
    { dir: d(0.62, 0.62, -0.58), r: rOf(550) },        // küp uydu, 550 km
    { dir: d(0.45, -0.05, 0.95), r: rOf(530) },        // küp uydu
    { dir: d(0.55, 0.8, -0.3), r: rOf(820) },          // boş roket kademesi, ≈ 820 km
  ] });
})();

// Her (bant, tür) için sabit yörünge parametreleri: e1(3), e2(3), r, θ0, ω
const INCL = { S: [53, 53, 97.6, 70, 43, 87.9], Z: [53, 53, 97.6, 70, 87.9], D: [97.6, 82, 74, 71, 65, 99], F: [98.6, 86.4, 74, 82, 65, 97] };
const params = [];
for (let b = 0; b < M.NB; b++) params.push(CATS.map(() => ({ n: 0, a: new Float32Array(0) })));
function ensure(b, ci, n) {
  const P = params[b][ci];
  if (P.n >= n) return P.a;
  const a = new Float32Array(Math.max(n, P.n * 2, 64) * 9);
  a.set(P.a);
  const key = CATS[ci].key;
  for (let k = P.n; k < a.length / 9; k++) {
    const h = rand(M.EDGES[b], M.EDGES[b + 1]);
    const r = rOf(h);
    const inc = ((pick(INCL[key]) + rand(-3, 3)) * Math.PI) / 180;
    const O = rand(0, TAU);
    const o = k * 9;
    a[o] = Math.cos(O); a[o + 1] = 0; a[o + 2] = Math.sin(O);
    a[o + 3] = -Math.sin(O) * Math.cos(inc); a[o + 4] = Math.sin(inc); a[o + 5] = Math.cos(O) * Math.cos(inc);
    a[o + 6] = r; a[o + 7] = rand(0, TAU); a[o + 8] = 0.35 * (R_VIS / r) ** 1.5 * (rand() < 0.5 ? 1 : 0.97);
  }
  P.a = a;
  P.n = a.length / 9;
  return a;
}

let tier = 4;
const counts = [];   // [bant][tür] → nokta sayısı
function layout() {
  const tot = totalObjects();
  tier = TIERS.find((t) => tot / t <= MAXI) || TIERS.at(-1);
  let idx = 0;
  const col = new THREE.Color();
  for (let b = 0; b < M.NB; b++) {
    counts[b] = [];
    for (let ci = 0; ci < CATS.length; ci++) {
      const k = CATS[ci].key;
      const v = S[k][b];
      let n = Math.round(v / tier);
      n = Math.min(n, MAXI - idx);
      counts[b][ci] = n;
      ensure(b, ci, n);
      col.setHex(CATS[ci].color).multiplyScalar(0.95);
      for (let j = 0; j < n; j++) col.toArray(dCol, (idx + j) * 3);
      idx += n;
    }
  }
  dGeo.setDrawRange(0, idx);
  dGeo.attributes.color.needsUpdate = true;
}

let visT = 0;
function moveDots(dt) {
  visT += dt;
  const arr = dPos;
  let idx = 0;
  for (let b = 0; b < M.NB; b++) {
    for (let ci = 0; ci < CATS.length; ci++) {
      const n = counts[b]?.[ci] || 0;
      const a = params[b][ci].a;
      for (let j = 0; j < n; j++) {
        const o = j * 9, th = a[o + 7] + a[o + 8] * visT, c = Math.cos(th) * a[o + 6], s = Math.sin(th) * a[o + 6];
        const m = (idx + j) * 3;
        arr[m] = c * a[o] + s * a[o + 3];
        arr[m + 1] = c * a[o + 1] + s * a[o + 4];
        arr[m + 2] = c * a[o + 2] + s * a[o + 5];
      }
      idx += n;
    }
  }
  dGeo.attributes.position.needsUpdate = true;
}

// --- Çarpışma parlamaları ---
const flashTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,190,90,.8)');
  gr.addColorStop(1, 'rgba(255,80,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const flashes = Array.from({ length: 10 }, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: new THREE.Color(3, 2.6, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.visible = false;
  s.userData.life = 0;
  sim.scene.add(s);
  return s;
});
function flashAt(band, big) {
  const f = flashes.find((x) => !x.visible) || flashes[0];
  const r = rOf(rand(M.EDGES[band], M.EDGES[band + 1]));
  f.position.copy(new THREE.Vector3().randomDirection().multiplyScalar(r));
  f.userData = { life: 1, big };
  f.visible = true;
}

// --- Durum ve parametreler ---
let S = M.initState();
const P = { launch: 2500, pmd: 0.9, rule: 25, adr: 0, avoid: 0.9, sun: 1 };
let rng = Math.random;
let lastToast = 0;

function totalObjects() { let t = 0; for (let i = 0; i < M.NB; i++) t += M.total(S, i); return t; }

function event(kind) {
  if (kind === 'asat') {
    M.addFragments(S, 5, 3000);
    flashAt(5, true); flashAt(5, true);
    sim.toast(`💥 ${Math.floor(S.year)}: ASAT testi 865 km'de — 3.000 izlenebilir parça (Fengyun-1C, 2007 benzeri)`, 'bad');
  } else if (kind === 'iridium') {
    S.S[4] = Math.max(0, S.S[4] - 1); S.D[4] = Math.max(0, S.D[4] - 1);
    M.addFragments(S, 4, 2000);
    flashAt(4, true);
    sim.toast(`💥 ${Math.floor(S.year)}: 789 km'de uydu–uydu çarpışması — 2.000 parça (Iridium 33 – Kosmos 2251, 2009 benzeri)`, 'bad');
  } else if (kind === 'mega') {
    S.S[2] += 5000;
    sim.toast('🚀 550 km bandına 5.000 uydu eklendi', 'warn');
  }
  layout();
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır senaryolar');
const PRESETS = {
  bugun: { launch: 2500, pmd: 0.9, rule: 25, adr: 0, avoid: 0.9, sun: 1 },
  sorumlu: { launch: 2500, pmd: 0.95, rule: 5, adr: 20, avoid: 0.95, sun: 1 },
  kontrolsuz: { launch: 5000, pmd: 0.5, rule: 0, adr: 0, avoid: 0.7, sun: 1 },
  durur: { launch: 0, pmd: 0.9, rule: 25, adr: 0, avoid: 0.9, sun: 1 },
};
ui.buttons([
  { label: '📈 Bugünkü eğilim', variant: 'primary', onClick: () => applyPreset('bugun') },
  { label: '🌱 Sorumlu kullanım', onClick: () => applyPreset('sorumlu') },
]);
ui.buttons([
  { label: '🔥 Kontrolsüz büyüme', onClick: () => applyPreset('kontrolsuz') },
  { label: '⛔ Fırlatma durursa', onClick: () => applyPreset('durur') },
]);

ui.section('Politika ve koşullar');
const ctl = {};
ctl.launch = ui.slider({ label: 'Yılda fırlatılan uydu', min: 0, max: 8000, step: 100, value: P.launch, format: (v) => `${fmt(v, 0)} / yıl`, onInput: (v) => (P.launch = v) });
ctl.rule = ui.segmented({ label: 'Görev sonu yörüngeden çıkma kuralı', options: [{ value: 0, label: 'Kural yok' }, { value: 25, label: '25 yıl' }, { value: 5, label: '5 yıl' }], value: P.rule, onChange: (v) => (P.rule = v) });
ctl.pmd = ui.slider({ label: 'Kurala uyum oranı', min: 0, max: 1, step: 0.01, value: P.pmd, format: (v) => `%${fmt(v * 100, 0)}`, onInput: (v) => (P.pmd = v) });
ctl.adr = ui.slider({ label: 'Aktif enkaz kaldırma', min: 0, max: 200, step: 1, value: P.adr, format: (v) => `${fmt(v, 0)} nesne / yıl`, onInput: (v) => (P.adr = v) });
ctl.avoid = ui.slider({ label: 'Aktif uyduların çarpışmadan kaçınma başarısı', min: 0, max: 0.99, step: 0.01, value: P.avoid, format: (v) => `%${fmt(v * 100, 0)}`, onInput: (v) => (P.avoid = v) });
ctl.sun = ui.segmented({ label: 'Güneş etkinliği (atmosfer yoğunluğu)', options: [{ value: 0.6, label: 'Düşük' }, { value: 1, label: 'Orta' }, { value: 1.6, label: 'Yüksek' }], value: P.sun, onChange: (v) => (P.sun = v) });

ui.section('Olaylar');
ui.buttons([
  { label: '💥 ASAT testi (865 km)', variant: 'danger', onClick: () => event('asat') },
  { label: '🛰 Uydu çarpışması (789 km)', variant: 'danger', onClick: () => event('iridium') },
]);
ui.button({ label: '🚀 Mega takımyıldız: +5.000 uydu (550 km)', onClick: () => event('mega') });
ui.toggle({ label: 'İrtifa bandı halkaları', value: true, onChange: (v) => (ringGroup.visible = v) });
ui.section('Görünüm', { open: false });
ui.buttons([
  { label: '🌍 Genel', onClick: () => sim.moveCamera([-9, 7.5, 24], [1.5, 0.5, 0]) },
  { label: '🛰 Yakın (ufuk)', onClick: () => sim.moveCamera([-3.2, 2.4, 10.6], [3.5, -0.8, 0]) },
  { label: '⬇ Kutuptan', onClick: () => sim.moveCamera([0.5, 27, 1.5], [0, 0, 0]) },
]);

ui.section('Durum');
const st = {
  year: ui.stat({ label: 'Yıl' }),
  tot: ui.stat({ label: 'LEO nesne (≥10 cm)' }),
  act: ui.stat({ label: 'Aktif uydu' }),
  frag: ui.stat({ label: 'Parça' }),
  col: ui.stat({ label: 'Büyük çarpışma' }),
  rate: ui.stat({ label: 'Çarpışma / yıl' }),
};
const kessTxt = ui.text('', 'card');
const legendTxt = ui.text('');
const compact = (v) => (v >= 1e6 ? `${fmt(v / 1e6, 1)} mn` : v >= 1e4 ? `${fmt(v / 1e3, 0)} bin` : fmt(v, 0));
const axis = (v) => (v >= 1e6 ? `${fmt(v / 1e6, 1)}mn` : v >= 1e4 ? `${fmt(v / 1e3, 0)}b` : fmt(v, 0));
const GROUPS = [[0, 2, '200–500 km', '#38bdf8'], [2, 4, '500–700 km', '#4ade80'], [4, 6, '700–900 km', '#fbbf24'], [6, 9, '900–2.000 km', '#f472b6']];
const bandChart = ui.chart({ title: 'Nesne sayısı, irtifa bandına göre (son 200 yıl; b = bin, mn = milyon)', series: GROUPS.map(([, , n, c]) => ({ name: n, color: c })), maxPoints: 400, height: 120, format: axis });
const typeChart = ui.chart({ title: 'Türüne göre', series: CATS.map((c) => ({ name: c.name, color: '#' + c.color.toString(16).padStart(6, '0') })), maxPoints: 400, height: 100, format: axis });
const rateChart = ui.chart({ title: 'Beklenen çarpışma sayısı / yıl', series: [{ name: 'büyük (bütün–bütün)', color: '#ef4444', fill: true }, { name: 'hasar (parça–uydu)', color: '#fb923c' }], maxPoints: 400, height: 90, format: (v) => fmt(v, v < 10 ? 1 : 0) });

function applyPreset(name) {
  Object.assign(P, PRESETS[name]);
  for (const k in PRESETS[name]) ctl[k].set(PRESETS[name][k]);
  restart();
}
function restart() {
  S = M.initState();
  bandChart.clear(); typeChart.clear(); rateChart.clear();
  layout();
  updatePanel(M.rates(S, P));
}

const ringCol = new THREE.Color();
function updatePanel(r) {
  const tot = totalObjects();
  st.year.set(String(Math.floor(S.year)));
  st.tot.set(compact(tot), tot > 100000 ? 'bad' : tot > 50000 ? 'warn' : '');
  st.act.set(compact(M.sum(S.S)));
  st.frag.set(compact(M.sum(S.F)));
  st.col.set(fmt(S.catastrophic, 0), S.catastrophic > 20 ? 'bad' : S.catastrophic > 3 ? 'warn' : '');
  const cr = M.sum(r.map((x) => x.II));
  st.rate.set(fmt(cr, cr < 10 ? 2 : 0), cr > 1 ? 'bad' : cr > 0.3 ? 'warn' : 'good');
  // Kendi kendini besleyen bant: çarpışma parçası üretimi, sürüklemenin temizlediğinden fazla ve nüfusu anlamlı büyütüyor
  const hot = r.map((x, i) => [i, x.growth, x.ratio]).filter(([, g, q]) => q > 1 && g > 0.002).sort((a, b) => b[1] - a[1]);
  kessTxt.set(hot.length
    ? `⚠️ <b>Kendi kendini besleyen bantlar</b> (çarpışma parçası > atmosferin temizlediği):<br>${hot.slice(0, 4).map(([i, g]) => `${M.BAND_NAMES[i]} km <b>+%${fmt(g * 100, 1)}/yıl</b>`).join(' · ')}
       <br><small>Bu bantlarda fırlatma dursa bile parça sayısı çarpışmalarla artar.</small>`
    : '✅ Hiçbir bantta çarpışmalar parça nüfusunu atmosferin temizleyebileceğinden hızlı büyütmüyor.');
  legendTxt.set(`<small><b style="color:#b9e3c4">●</b> aktif · <b style="color:#e3cfa4">●</b> ölü uydu / roket gövdesi · <b style="color:#bfd3ee">●</b> görev sonu inişte · <b style="color:#d6d4d2">●</b> parça · 1 nokta ≈ ${fmt(tier, 0)} nesne · irtifa 3× abartılı</small>`);
  // Halka rengi: çarpışmaların net parça büyüme hızı (%/yıl) — mavi: temizleniyor, sarı: denge, kırmızı: büyüyor
  r.forEach((x, i) => {
    const t = clamp(0.5 + x.growth * 25, 0, 1);
    heatColor(t, ringCol);
    ringCol.lerp(neutralCol, 0.45);
    rings[i].material.color.copy(ringCol);
    rings[i].material.opacity = 0.004 + Math.abs(t - 0.5) * 0.04;
    rings[i].userData.edge.material.color.copy(ringCol);
    rings[i].userData.edge.material.opacity = 0.06 + Math.abs(t - 0.5) * 0.5;
  });
}

// --- Döngü ---
sim.formatTime = () => `Yıl ${Math.floor(S.year)}`;
let chartAcc = 0, panelAcc = 0, layoutAcc = 0;
sim.onUpdate((dt) => {
  let dy = dt / YEAR_SEC;
  while (dy > 1e-9) {
    const h = Math.min(dy, 0.05);
    const ev = M.step(S, P, h, rng);
    dy -= h;
    for (const e of ev) {
      flashAt(e.band, e.big);
      if (e.big && performance.now() - lastToast > 2500) {
        lastToast = performance.now();
        sim.toast(`💥 ${Math.floor(S.year)}: ${M.BAND_NAMES[e.band]} km bandında çarpışma — ≈ ${fmt(M.FRAG_CAT, 0)} yeni parça`, 'bad');
      }
    }
    chartAcc += h;
    if (chartAcc >= 0.5) {
      chartAcc = 0;
      bandChart.push(GROUPS.map(([a, b]) => { let t = 0; for (let i = a; i < b; i++) t += M.total(S, i); return t; }));
      typeChart.push([M.sum(S.S), M.sum(S.D), M.sum(S.Z), M.sum(S.F)]);
      const r = M.rates(S, P);
      rateChart.push([M.sum(r.map((x) => x.II)), M.sum(r.map((x) => x.IF))]);
    }
  }
  layoutAcc += dt;
  if (layoutAcc > 0.3) { layoutAcc = 0; layout(); }
});

const _dsz = new THREE.Vector2();
sim.onRender((dt) => {
  dotU.uTime.value += dt;
  sim.renderer.getDrawingBufferSize(_dsz);
  dotU.uPix.value = _dsz.y / (2 * Math.tan(THREE.MathUtils.degToRad(sim.camera.fov) / 2));
  earthVis.spin(sim.paused ? 0 : dt * 0.06);
  sunVis.update(dt);
  moveDots(dt);
  craft.update(dt, dotU.uSun.value);
  for (const f of flashes) {
    if (!f.visible) continue;
    f.userData.life -= dt * 0.8;
    if (f.userData.life <= 0) { f.visible = false; continue; }
    const l = f.userData.life;
    f.scale.setScalar((f.userData.big ? 3 : 1.2) * (1.2 - l));
    f.material.opacity = l;
  }
  panelAcc += dt;
  if (panelAcc > 0.3) { panelAcc = 0; updatePanel(M.rates(S, P)); }
});

// Halkaya tıkla → bant bilgisi
sim.onClick(() => (ringGroup.visible ? rings : []), (hit) => {
  const i = hit.object.userData.band;
  const r = M.rates(S, P)[i];
  const life = M.dragLife((M.EDGES[i] + M.EDGES[i + 1]) / 2, P.sun);
  sim.toast(`<b>${M.BAND_NAMES[i]} km</b> · aktif ${fmt(S.S[i], 0)} · ölü ${fmt(S.D[i], 0)} · inişte ${fmt(S.Z[i], 0)} · parça ${fmt(S.F[i], 0)}<br>
    sürükleme ömrü ≈ ${life < 1 ? 'aylar' : life > 5000 ? 'binlerce yıl' : fmt(life, 0) + ' yıl'} · büyük çarpışma ${fmt(r.II, 3)}/yıl · parça net büyüme %${fmt(r.growth * 100, 2)}/yıl`);
});

sim.onReset(() => restart());
restart();
