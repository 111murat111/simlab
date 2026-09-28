// Mükemmel Çay Demleme — çaydanlık + demlik, sıcaklığa bağlı (Arrhenius) birinci derece özütleme, difüzyon, ince belli bardakta renk.
import { createSim, THREE, RoundedBoxGeometry, fmt, clamp, rand, gauss, instanced, mat, procedural } from '@core';
import { labRoom, glassGeometry, liquidGeometry, glassMesh, liquidMesh } from './labkit.js';

const RG = 8.314, TREF = 368.15;       // 95 °C referans
// Temsili hız sabitleri (1/dk, 95 °C'de) ve aktivasyon enerjileri (J/mol)
const K = {
  renk: { k: 0.12, Ea: 50000 },
  kaf: { k: 0.3, Ea: 35000 },
  tanH: { k: 0.15, Ea: 55000 },   // hızlı çıkan tanen kısmı
  tanY: { k: 0.012, Ea: 65000 },  // yavaş, uzun demde artmaya devam eden kısım
};
const DEM_L = 0.5, GLASS_L = 0.1;
const kAt = (c, T) => c.k * Math.exp((-c.Ea / RG) * (1 / (T + 273.15) - 1 / TREF));
const viscosity = (T) => 2.414e-5 * 10 ** (247.8 / (T + 273.15 - 140)); // suyun viskozitesi (Pa·s), Vogel tipi yaklaşım

const sim = createSim({
  studio: { color: 0xc9c0b2, mood: 'day', warmth: 0.3, key: { el: 48, az: 210 }, radius: 22 },
  look: { aoRadius: 0.02 },
  camera: { position: [0.16, 1.25, 0.66], target: [0.044, 1.075, 0], fov: 45 },
  controls: { minDistance: 0.25, maxDistance: 1.8 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Altta su kaynayan <b>çaydanlık</b>, üstte buharla sıcak tutulan <b>demlik</b>. Demliği cam yaptık ki içini görebilelim:
    yapraklardan çıkan renkli minik noktalar <b>difüzyonla</b> suya yayılıyor. Sağdaki <b>ince belli bardakta</b> dem ile
    sıcak su karışıyor; rengi "açık"tan "tavşan kanı"na, oradan "koyu"ya gidiyor.</p>
    <h3>Difüzyon nedir? (çocuklar için)</h3>
    <p>Su molekülleri durmadan titreşir ve çarpışır. Yapraktan çıkan renk ve tat molekülleri bu çarpışmalarla rastgele
    itilir ve zamanla <b>kalabalık yerden tenha yere</b> yayılır. Su ne kadar sıcaksa moleküller o kadar hızlı hareket eder,
    su da daha "akışkan" olur: bu yüzden çay sıcak suda çabuk, soğuk suda çok yavaş demlenir. Karıştırmak yayılmayı hızlandırır.</p>
    <h3>Model</h3>
    <ul>
      <li>Her madde için birinci derece özütleme: <b>dC/dt = k·(C<sub>max</sub> − C)</b>. C<sub>max</sub> yaprak miktarıyla orantılı.</li>
      <li>Hız sabiti sıcaklıkla Arrhenius'a benzer artar: <b>k(T) = k₉₅·e<sup>−Ea/R·(1/T − 1/T₉₅)</sup></b>.</li>
      <li><b>Kafein</b> hızlı çıkar (birkaç dakikada çoğu suya geçer). <b>Renk</b> (teaflavin/tearubigin) biraz daha yavaş.
      <b>Tanenlerin</b> bir kısmı hızlı çıkar, bir kısmı uzun demlemede artmaya devam eder: çay uzun bekleyince burukluk
      (ağızda kuruluk) ve acılık artar, "demi kaçar".</li>
      <li>Bardak rengi Beer–Lambert yaklaşımıyla: çay mavi ışığı en çok, kırmızıyı en az soğurur; o yüzden kırmızı-amber görünür.</li>
      <li>Parçacıkların rastgele adımı D ∝ T/η (Stokes–Einstein): sıcak suyun viskozitesi (η) düşük olduğu için yayılma hızlanır.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li>"Klasik" ayarla 15 dakika demle, bardağın rengini izle; sonra dem oranını değiştir.</li>
      <li>Aynı süreyi 70 °C'de dene: renk ve tat ne kadar geride kalıyor?</li>
      <li>"Demi kaçmış" hazır ayarında 45+ dakika: kafein neredeyse sabit, burukluk artmaya devam ediyor.</li>
      <li>Karıştır düğmesine bas: yayılma ve özütleme bir süre hızlanır.</li>
    </ul>
    <p><small>Hız sabitleri, aktivasyon enerjileri ve renk/burukluk ölçekleri <b>temsilidir</b> (niteliksel eğilimleri gösterir,
    laboratuvar ölçümü değildir). Kafein tahmini, siyah çay yaprağında kuru ağırlıkça ~%3 kafein (tipik aralık %2–4) ve
    ~%85 özütleme varsayar; bardak ≈ 100 mL alınmıştır. Tanenin oksitlenmesi, suyun sertliği ve çay türü farkları yok.</small></p>`,
});
sim.formatTime = () => {
  const m = Math.floor(minutes), s = Math.floor((minutes * 60) % 60);
  return `Demleme ${m} dk ${String(s).padStart(2, '0')} sn`;
};

// --- Durum ---
let minutes = 0, stirT = 0;
const ex = { renk: 0, kaf: 0, tanH: 0, tanY: 0 };

// --- Sahne (metre ölçeği) ---
// Mutfak tezgâhı: sahne içeriği "birim" cinsinden kurulur, content grubu U ile metreye ölçeklenir (1 birim = 6,25 cm:
// ince belli bardak ≈ 10 cm, çaydanlık ≈ 18 cm çap).
const U = 0.0625, BENCH = 0.9;
const room = labRoom(sim.scene, { width: 2.4, depth: 0.62, benchH: BENCH, style: 'kitchen', wallZ: -0.3, shelf: true, window: true });
const content = new THREE.Group();
content.position.set(0, BENCH, 0.0);
content.scale.setScalar(U);
sim.scene.add(content);
const W = (p) => [p[0] * U, BENCH + p[1] * U, p[2] * U];
const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); content.add(m); return m; };

// Tezgâh üstü tek gözlü gaz ocağı: emaye gövde, pirinç brülör, döküm ızgara, düğme
const KX = -1.2;
const HOB_H = 0.8, KY = 1.25;               // gövde yüksekliği, çaydanlık tabanı (ızgara üstü)
const enamel = mat.paintedMetal({ color: 0x1c1d20, wear: 0.06, scale: U });
add(new THREE.Mesh(new RoundedBoxGeometry(3.4, HOB_H, 3.2, 3, 0.09), enamel), KX, HOB_H / 2, 0);
const brass = mat.brushedMetal({ color: 0xc9a25a, rough: 0.35, scale: U });
add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.12, 40), brass), KX, HOB_H + 0.06, 0);
add(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.07, 40), mat.paintedMetal({ color: 0x141414, wear: 0.4, scale: U })), KX, HOB_H + 0.155, 0);
const iron = mat.paintedMetal({ color: 0x17181a, wear: 0.45, scale: U });
for (let i = 0; i < 4; i++) {
  const a = Math.PI / 4 + (i * Math.PI) / 2;
  const arm = add(new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.12, 0.13, 2, 0.03), iron), KX + Math.cos(a) * 1.13, KY - 0.06, Math.sin(a) * 1.13);
  arm.rotation.y = -a;
  add(new THREE.Mesh(new RoundedBoxGeometry(0.14, KY - HOB_H, 0.14, 2, 0.03), iron), KX + Math.cos(a) * 1.52, HOB_H + (KY - HOB_H) / 2, Math.sin(a) * 1.52);
}
const knob = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.26, 32), mat.plastic({ color: 0x1a1a1a, gloss: 0.4, scale: U })), KX + 1.05, HOB_H * 0.5, 1.72);
knob.rotation.x = Math.PI / 2;
add(new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.32, 0.06, 1, 0.02), mat.plastic({ color: 0x1a1a1a, gloss: 0.4, scale: U })), KX + 1.05, HOB_H * 0.5, 1.86).rotation.z = 0.6;
// Alevler: halka brülörden dışa-yukarı eğik mavi koniler (HDR emisyon, toplamalı)
const flameMat = mat.glow({ color: 0x2f6dff, intensity: 3.2 });
flameMat.transparent = true; flameMat.opacity = 0.75; flameMat.blending = THREE.AdditiveBlending; flameMat.depthWrite = false;
const flameGeo = new THREE.ConeGeometry(0.06, 0.26, 8, 1, true).translate(0, 0.13, 0);
const flames = new THREE.Group();
for (let i = 0; i < 18; i++) {
  const a = (i / 18) * Math.PI * 2;
  const f = new THREE.Mesh(flameGeo, flameMat);
  f.position.set(KX + Math.cos(a) * 0.63, HOB_H + 0.08, Math.sin(a) * 0.63);
  f.rotation.set(0, -a, 0, 'YXZ'); f.rotateZ(-0.75);
  f.userData.noCast = true; f.userData.noShadow = true; f.userData.noAO = true;
  flames.add(f);
}
content.add(flames);
const flameLight = new THREE.PointLight(0x6d9bff, 0.35, 0.3, 2);
flameLight.position.set(...W([KX, HOB_H + 0.2, 0]));
sim.scene.add(flameLight);

// Çaydanlık (alt, parlak paslanmaz çelik)
const steel = mat.brushedMetal({ color: 0xe2e5e9, rough: 0.14, scale: U });
const kettle = add(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [1.25, 0], [1.4, 0.2], [1.45, 1.4], [1.3, 1.9], [0.95, 2.1], [0.9, 2.2]].map(([x, y]) => new THREE.Vector2(x, y)), 64), steel), KX, KY, 0);
const krim = add(new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.035, 10, 64), steel), KX, KY + 2.2, 0);
krim.rotation.x = Math.PI / 2;
const spoutCurve = new THREE.CatmullRomCurve3([[KX + 1.3, 0.6, 0], [KX + 1.9, 1.2, 0], [KX + 2.25, 1.9, 0]].map(([x, y, z]) => new THREE.Vector3(x, y + KY, z)));
content.add(new THREE.Mesh(new THREE.TubeGeometry(spoutCurve, 24, 0.12, 14), steel));
const handle = add(new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.085, 12, 32, Math.PI), mat.plastic({ color: 0x151515, gloss: 0.35, scale: U })), KX - 1.4, KY + 1.2, 0);
handle.rotation.z = Math.PI / 2;

// profil yardımcıları
const rAt = (prof, y) => {
  for (let i = 1; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    if (y <= y1 || i === prof.length - 2) return r0 + (r1 - r0) * clamp((y - y0) / Math.max(y1 - y0, 1e-6), 0, 1);
  }
  return prof[1][0];
};
const glassOf = (geo, o = {}) => {
  const m = glassMesh(geo, { thickness: 0.05, rough: 0.015, ...o });
  m.material.depthWrite = false;
  return m;
};

// Demlik (üst, ısıya dayanıklı cam)
const DY = KY + 2.2, DR = 0.95, DH = 1.7, DT = 0.05;
const demProf = [[0, 0], [0.8, 0], [DR, 0.25], [DR + 0.05, 1.1], [0.8, DH], [0.7, DH + 0.1]];
const demlik = add(glassOf(glassGeometry(demProf, DT, 72)), KX, DY, 0);
demlik.renderOrder = 4;
const lid = add(new THREE.Mesh(new THREE.SphereGeometry(0.74, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2), steel), KX, DY + DH + 0.1, 0);
lid.scale.y = 0.35;
const lidKnob = add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 12), mat.plastic({ color: 0x151515, gloss: 0.4, scale: U })), KX, DY + DH + 0.38, 0);
lidKnob.scale.y = 0.8;
const dSpout = new THREE.CatmullRomCurve3([[KX + 0.9, DY + 0.5, 0], [KX + 1.35, DY + 0.9, 0], [KX + 1.55, DY + 1.4, 0]].map((p) => new THREE.Vector3(...p)));
content.add(glassOf(new THREE.TubeGeometry(dSpout, 20, 0.08, 12), { thickness: 0.03 }));
const dHandle = add(glassOf(new THREE.TorusGeometry(0.42, 0.075, 12, 32, Math.PI), { thickness: 0.15 }), KX - DR + 0.02, DY + 0.75, 0);
dHandle.rotation.z = Math.PI / 2;
const LIQ_H = 1.25;
const demLiq = add(liquidMesh(liquidGeometry((y) => rAt(demProf, y) - DT - 0.004, DT + 0.004, LIQ_H, { meniscus: 0.04, segs: 64 }), 0xfff8ec, 0.1), KX, DY, 0);
const demLiqMat = demLiq.material;
demLiqMat.depthWrite = false; demLiqMat.thickness = 1.6;
demLiq.renderOrder = 2;

// Yapraklar: kıvrık, koyu kahverengi-yeşil demlenmiş çay yaprağı parçaları
const NL = 70;
const leafMat = procedural({
  key: 'cay-leaf', scale: U, bump: 0.01,
  params: { color: 0x3a2412, roughness: 0.55 },
  pattern: `
    float n = fbm3(p*420.0 + seed*9.0, 3), v = vn3(p*1600.0);
    col *= mix(vec3(0.75, 0.8, 0.55), vec3(1.2, 1.0, 0.85), n)*(0.75 + 0.5*seed);
    rough = 0.45 + 0.2*v;
    h = n*0.6 + v*0.4;`,
});
const leafGeo = new THREE.SphereGeometry(0.075, 10, 6).scale(1, 0.22, 0.5);
const leaves = instanced(leafGeo, leafMat, NL);
const lf = Array.from({ length: NL }, () => ({ r: Math.sqrt(Math.random()) * 0.72, a: rand(0, Math.PI * 2), y: rand(0.08, 0.2), rot: rand(0, Math.PI), lift: 0 }));
leaves.userData.noCast = true;
content.add(leaves);

// Yumuşak nokta sprite'ları (difüzyon molekülleri ve buhar): boyut içerik biriminde, ekran ölçeği onRender'da
const ptScale = { value: 400 };
const cTmp = new THREE.Color();
function sprites(n, size, frag, blending = THREE.NormalBlending) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3).fill(1), al = new Float32Array(n), sz = new Float32Array(n).fill(1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aA', new THREE.BufferAttribute(al, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aS', new THREE.BufferAttribute(sz, 1).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: ptScale, uSize: { value: size * U } },
    vertexShader: `attribute vec3 aColor; attribute float aA, aS; uniform float uScale, uSize; varying vec3 vC; varying float vA;
      void main(){ vC = aColor; vA = aA; vec4 mv = modelViewMatrix*vec4(position, 1.0);
        gl_PointSize = aA > 0.0 ? uSize*aS*uScale/max(-mv.z, 0.001) : 0.0; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r = length(gl_PointCoord - 0.5)*2.0; if (r > 1.0) discard; ${frag} }`,
    transparent: true, depthWrite: false, blending,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false; p.renderOrder = 5;
  content.add(p);
  return { p, pos, col, al, sz, g,
    color(i, hex) { cTmp.setHex(hex); col[i * 3] = cTmp.r; col[i * 3 + 1] = cTmp.g; col[i * 3 + 2] = cTmp.b; g.attributes.aColor.needsUpdate = true; },
    flush() { g.attributes.position.needsUpdate = true; g.attributes.aA.needsUpdate = true; g.attributes.aS.needsUpdate = true; } };
}

// Difüzyon parçacıkları
const NP = 320;
const dots = sprites(NP, 0.075, `float core = smoothstep(0.75, 0.45, r), halo = exp(-r*r*5.0); gl_FragColor = vec4(vC*(core*1.05 + halo*0.35), vA*max(core, halo*0.6));`);
const COLS = { renk: 0xe8591a, kaf: 0xf8fafc, tan: 0x8fbf3a };
const dp = Array.from({ length: NP }, () => ({ on: false, x: 0, y: 0, z: 0 }));
let dpNext = 0;
function emit(kind) {
  const p = dp[dpNext];
  const l = lf[Math.floor(Math.random() * NL)];
  p.on = true;
  p.x = Math.cos(l.a) * l.r; p.z = Math.sin(l.a) * l.r; p.y = l.y + l.lift + 0.03;
  dots.color(dpNext, COLS[kind]);
  dpNext = (dpNext + 1) % NP;
}

// Buhar: çaydanlığın ağzından yükselen yumuşak bulutçuklar
const NS = 40;
const steam = sprites(NS, 0.55, `gl_FragColor = vec4(vec3(0.93, 0.94, 0.95), vA*exp(-r*r*3.2)*smoothstep(1.0, 0.7, r));`);
const sp = Array.from({ length: NS }, () => ({ t: Math.random() }));

// İnce belli bardak + porselen tabak (yaldızlı kenar) + çay kaşığı
const GX = 2.9, GZ = 0.9;
const saucerProf = [[0, 0], [0.55, 0], [0.6, 0.02], [0.63, 0.05], [0.95, 0.11], [1.0, 0.145], [0.98, 0.16], [0.62, 0.095], [0.42, 0.08], [0, 0.08]];
const saucer = add(new THREE.Mesh(new THREE.LatheGeometry(saucerProf.map(([x, y]) => new THREE.Vector2(x, y)), 64), mat.ceramic({ color: 0xf6f3ee, scale: U })), GX, 0, GZ);
saucer.geometry.computeVertexNormals();
const gilt = mat.brushedMetal({ color: 0xd8b25a, rough: 0.2, scale: U });
const rim = add(new THREE.Mesh(new THREE.TorusGeometry(0.99, 0.013, 8, 80), gilt), GX, 0.153, GZ);
rim.rotation.x = Math.PI / 2;
const spoon = new THREE.Group();
spoon.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 10).scale(1, 0.22, 0.62), steel));
const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.2, 10), steel);
stem.rotation.z = Math.PI / 2; stem.position.x = 0.72;
spoon.add(stem);
spoon.position.set(GX + 0.1, 0.13, GZ + 0.72); spoon.rotation.set(0, -0.35, -0.06);
content.add(spoon);
const GT = 0.028;
const gprof = [[0, 0], [0.42, 0], [0.44, 0.08], [0.36, 0.45], [0.31, 0.7], [0.36, 1.0], [0.5, 1.55], [0.52, 1.6]];
const tglass = add(glassOf(glassGeometry(gprof, GT, 72), { thickness: 0.04 }), GX, 0.08, GZ);
tglass.renderOrder = 4;
const cupLiq = add(liquidMesh(liquidGeometry((y) => rAt(gprof, y) - GT - 0.003, 0.05, 1.42, { meniscus: 0.03, segs: 64 }), 0xb04a1a, 0.04), GX, 0.08, GZ);
const cupLiqMat = cupLiq.material;
cupLiqMat.depthWrite = false; cupLiqMat.thickness = 0.7;
cupLiq.renderOrder = 2;

// Çay kutusu (arkada): boyalı teneke, pirinç kapak
add(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 2.4, 48), mat.paintedMetal({ color: 0x9b2226, wear: 0.08, scale: U })), -4.7, 1.2, -1.6);
add(new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.35, 48), gilt), -4.7, 2.55, -1.6);
add(new THREE.Mesh(new THREE.CylinderGeometry(0.87, 0.87, 0.12, 48), gilt), -4.7, 0.5, -1.6);

const glassLbl = sim.label('', { parent: content, position: [GX, 2.15, GZ], className: 'plain' });
const demLbl = sim.label('', { parent: content, position: [KX, DY + DH + 0.9, 0], className: 'plain' });
const tempLbl = sim.label('', { parent: content, position: [KX + 0.2, 0.1, 2.3], className: 'plain' });

// --- Arayüz ---
const ui = sim.ui;
const PRESETS = {
  klasik: { label: 'Klasik Türk çayı (95 °C, 15 dk)', leaf: 15, T: 95, dem: 50 },
  aceleci: { label: 'Aceleci (3 dk sonra koy)', leaf: 15, T: 95, dem: 60 },
  kacmis: { label: 'Demi kaçmış (45+ dk)', leaf: 15, T: 95, dem: 50 },
  ilik: { label: 'Ilık su (70 °C)', leaf: 15, T: 70, dem: 50 },
  cok: { label: 'Bol yaprak, açık bardak', leaf: 28, T: 95, dem: 30 },
};
ui.section('Hazır ayarlar');
ui.select({ options: Object.entries(PRESETS).map(([k, p]) => ({ value: k, label: p.label })), value: 'klasik', onChange: (v) => {
  const p = PRESETS[v];
  leafSl.set(p.leaf); tempSl.set(p.T); demSl.set(p.dem);
  restart();
  if (v === 'kacmis') { advance(45); sim.toast('45 dakika ileri alındı', 'warn'); }
} });

ui.section('Demleme');
const leafSl = ui.slider({ label: 'Kuru çay (demliğe, 0,5 L su)', min: 4, max: 30, step: 1, value: 15, unit: 'g' });
const tempSl = ui.slider({ label: 'Demlikteki su sıcaklığı', min: 60, max: 100, step: 1, value: 95, unit: '°C' });
const speedSl = ui.slider({ label: 'Zaman hızı (1 sn = ? dk)', min: 0.25, max: 5, step: 0.25, value: 1, unit: 'dk' });
ui.buttons([
  { label: '🥄 Karıştır', variant: 'primary', onClick: () => { stirT = 1.5; } },
  { label: '🔄 Yeniden demle', onClick: () => restart() },
]);
ui.toggle({ label: 'Molekülleri göster (difüzyon)', value: true, onChange: (v) => { dots.p.visible = v; } });

ui.section('Bardak');
const demSl = ui.slider({ label: 'Dem oranı (koyu ↔ açık)', min: 10, max: 100, step: 5, value: 50, unit: '%', format: (v) => `%${v} dem · %${100 - v} su` });

ui.section('Sonuç');
const sTime = ui.stat({ label: 'Demleme süresi', unit: 'dk' });
const sCol = ui.stat({ label: 'Bardak rengi' });
const sKaf = ui.stat({ label: 'Kafein / bardak (≈)', unit: 'mg' });
const sBit = ui.stat({ label: 'Burukluk', unit: '/100' });
const mCol = ui.meter({ label: 'Renk özütlemesi', color: '#c2410c' });
const mKaf = ui.meter({ label: 'Kafein özütlemesi', color: '#e2e8f0' });
const mTan = ui.meter({ label: 'Tanen (burukluk) özütlemesi', color: '#65a30d' });
const verdict = ui.text('', 'card');
const chart = ui.chart({ title: 'Demlikte özütlenen oran (%) — zaman', series: [{ name: 'renk', color: '#ea580c' }, { name: 'kafein', color: '#e2e8f0' }, { name: 'tanen', color: '#84cc16' }], maxPoints: 360, yMin: 0, yMax: 100, format: (v) => fmt(v, 0) });

const tannin = () => 0.4 * ex.tanH + 0.6 * ex.tanY;
function advance(mins) {
  let m = mins;
  const T = tempSl.value;
  while (m > 1e-9) {
    const h = Math.min(m, 0.05);
    const boost = stirT > 0 ? 1.6 : 1;
    for (const key of Object.keys(ex)) {
      const old = ex[key];
      ex[key] = 1 - (1 - old) * Math.exp(-kAt(K[key], T) * boost * h);
      // Görsel: özütlenen miktar kadar parçacık salınır
      emitAcc[key] += (ex[key] - old) * (key === 'tanY' ? 900 : 260);
    }
    minutes += h; m -= h;
    chartAcc += h;
    if (chartAcc >= 0.25) { chartAcc = 0; chart.push([ex.renk * 100, ex.kaf * 100, tannin() * 100]); }
  }
}
const emitAcc = { renk: 0, kaf: 0, tanH: 0, tanY: 0 };
let chartAcc = 0;

function restart() {
  minutes = 0; stirT = 0; chartAcc = 0; sim.time = 0;
  for (const k of Object.keys(ex)) { ex[k] = 0; emitAcc[k] = 0; }
  dp.forEach((p) => (p.on = false));
  chart.clear();
}

// Beer–Lambert: mavi en çok soğurulur
const ABS = [0.25, 1.0, 2.2];
function teaColor(A, out) {
  return out.setRGB(Math.exp(-A * ABS[0]) * 0.98, Math.exp(-A * ABS[1]) * 0.95, Math.exp(-A * ABS[2]) * 0.9, THREE.SRGBColorSpace);
}
const colName = (A) => (A < 0.12 ? 'su gibi' : A < 0.5 ? 'çok açık' : A < 0.9 ? 'açık' : A < 1.6 ? 'tavşan kanı' : A < 2.4 ? 'koyu' : 'çok koyu');

sim.onUpdate((dt) => {
  const m = dt * speedSl.value;
  advance(m);
  stirT = Math.max(0, stirT - m);
  for (const [key, kind] of [['renk', 'renk'], ['kaf', 'kaf'], ['tanH', 'tan'], ['tanY', 'tan']]) {
    while (emitAcc[key] >= 1) { emit(kind); emitAcc[key] -= 1; }
  }
});

const dummy = new THREE.Object3D();
const tmpV2 = new THREE.Vector2();
let uiT = 0;
sim.onRender((rdt) => {
  const T = tempSl.value;
  const t = sim.paused ? 0 : rdt;
  const stirring = stirT > 0;
  // Yapraklar: karıştırınca döner ve kalkar
  for (let i = 0; i < NL; i++) {
    const l = lf[i];
    if (stirring) { l.a += t * (2.5 - l.r); l.lift = Math.min(l.lift + t * 0.5, 0.6 * (1 - l.r)); }
    else l.lift = Math.max(0, l.lift - t * 0.25);
    dummy.position.set(KX + Math.cos(l.a) * l.r, DY + l.y + l.lift, Math.sin(l.a) * l.r);
    dummy.rotation.set(0, l.rot + l.a, 0.2);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  }
  leaves.instanceMatrix.needsUpdate = true;
  // Difüzyon: rastgele yürüyüş, adım ∝ √(D), D ∝ T/η
  const D = ((T + 273.15) / viscosity(T)) / (293.15 / viscosity(20));
  const sig = Math.sqrt(t * speedSl.value) * 0.09 * Math.sqrt(D);
  for (let i = 0; i < NP; i++) {
    const p = dp[i];
    if (p.on) {
      p.x += gauss(0, sig); p.y += gauss(0, sig) + t * 0.02; p.z += gauss(0, sig);
      if (stirring) { const a = Math.atan2(p.z, p.x) + t * 2, r = Math.hypot(p.x, p.z); p.x = Math.cos(a) * r; p.z = Math.sin(a) * r; }
      const r = Math.hypot(p.x, p.z), rmax = DR - 0.08;
      if (r > rmax) { p.x *= rmax / r; p.z *= rmax / r; }
      p.y = clamp(p.y, 0.06, LIQ_H - 0.05);
    }
    dots.pos[i * 3] = KX + p.x; dots.pos[i * 3 + 1] = DY + p.y; dots.pos[i * 3 + 2] = p.z;
    dots.al[i] = p.on ? 0.9 : 0;
  }
  dots.flush();
  // Buhar
  for (let i = 0; i < NS; i++) {
    const s = sp[i];
    s.t = (s.t + rdt * 0.35) % 1;
    steam.pos[i * 3] = KX + 2.3 + Math.sin(i * 3.1 + s.t * 4) * 0.25 * s.t;
    steam.pos[i * 3 + 1] = KY + 2.0 + s.t * 2.6;
    steam.pos[i * 3 + 2] = Math.cos(i * 1.7) * 0.25 * s.t;
    steam.sz[i] = 0.5 + s.t * 2.2;
    steam.al[i] = 0.22 * Math.sin(Math.PI * s.t) * (0.4 + 0.6 * clamp(tempSl.value - 70, 0, 30) / 30);
  }
  steam.flush();
  const vp = sim.renderer.getDrawingBufferSize(tmpV2);
  ptScale.value = vp.y / (2 * Math.tan(THREE.MathUtils.degToRad(sim.camera.fov / 2)));
  flames.children.forEach((f, i) => (f.scale.y = 0.8 + 0.3 * Math.sin(sim.time * 20 + i)));
  // Renkler (Beer–Lambert)
  const leafF = leafSl.value / 15, demF = demSl.value / 100;
  const Adem = 2.2 * leafF * ex.renk;        // demlikteki dem (daha uzun ışık yolu)
  teaColor(Adem, demLiqMat.attenuationColor);
  demLiqMat.attenuationDistance = 2 * DR * U;   // demlik çapı boyunca ışık yolu
  const Ag = 2.4 * leafF * ex.renk * demF;   // bardak
  teaColor(Ag, cupLiqMat.attenuationColor);
  cupLiqMat.attenuationDistance = 0.8 * U;      // bardak çapı boyunca ışık yolu
  uiT += rdt;
  if (uiT < 0.2) return;
  uiT = 0;
  const kaf = leafSl.value * 1000 * 0.03 * 0.85 * ex.kaf / DEM_L * GLASS_L * demF;
  const bit = 100 * clamp(tannin() * leafF * (demF / 0.5) * 0.8, 0, 1);
  sTime.set(fmt(minutes, 1));
  sCol.set(colName(Ag), Ag >= 0.9 && Ag < 1.6 ? 'good' : Ag >= 2.4 ? 'warn' : '');
  sKaf.set(fmt(kaf, 0));
  sBit.set(fmt(bit, 0), bit < 55 ? 'good' : bit < 70 ? 'warn' : 'bad');
  mCol.set(ex.renk, `%${fmt(ex.renk * 100, 0)}`);
  mKaf.set(ex.kaf, `%${fmt(ex.kaf * 100, 0)}`);
  mTan.set(tannin(), `%${fmt(tannin() * 100, 0)}`);
  const taste = bit < 30 ? 'yumuşak, hafif' : bit < 55 ? 'dengeli' : bit < 70 ? 'buruk' : 'çok buruk, acımsı (demi kaçmış)';
  let tip = '';
  if (minutes < 5) tip = 'Henüz erken: renk ve tat tam çıkmadı; kafeinin çoğu ise çoktan suya geçiyor.';
  else if (minutes > 35) tip = 'Uzun bekledi: kafein artık artmıyor, ama tanenler çıkmaya devam ediyor.';
  else if (T < 80) tip = 'Su soğuk: moleküller yavaş hareket ediyor, özütleme ve difüzyon yavaş.';
  else tip = 'Güzel bir dem aralığı. Dem oranıyla bardağın rengini ayarla.';
  verdict.set(`Tat: <b>${taste}</b> · Renk: <b>${colName(Ag)}</b><br>${tip}`);
  glassLbl.setText(`${colName(Ag)} · %${demSl.value} dem`);
  demLbl.setText(`dem: ${fmt(minutes, 0)} dk`);
  tempLbl.setText(`${fmt(T, 0)} °C · difüzyon ×${fmt(D, 1)} (20 °C'ye göre)`);
});

sim.onClick([tglass, cupLiq, demlik, demLiq], (hit) => {
  if (hit.object === tglass || hit.object === cupLiq) sim.toast('İnce belli bardak: dem + sıcak su. "Tavşan kanı" rengi çoğu kişinin sevdiği ölçüdür.');
  else sim.toast('Demlik: yapraklardan çıkan moleküller difüzyonla suya yayılıyor.');
});

sim.onReset(() => restart());
restart();
