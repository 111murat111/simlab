// Pil Nasıl Çalışır? — galvanik hücre: standart indirgenme potansiyelleri, Nernst denklemi, deşarj, seri/paralel bağlama.
import { createSim, THREE, RoundedBoxGeometry, fmt, clamp, rand, mat } from '@core';
import { labRoom, glassGeometry, liquidGeometry, glassMesh, liquidMesh, reagentBottle } from './labkit.js';

const F = 96485, R = 8.314;
const R_INT = 5;            // hücre iç direnci (Ω) — temsili
const M0 = 0.15;            // elektrot metali, batan kısım (mol) — temsili
// Standart indirgenme potansiyelleri (25 °C, SHE'ye göre, V)
const METALS = {
  Li: { name: 'Lityum', ion: 'Li⁺', n: 1, E: -3.04, color: 0xd9dde3, sol: null },
  Mg: { name: 'Magnezyum', ion: 'Mg²⁺', n: 2, E: -2.37, color: 0xcfd4da, sol: null },
  Al: { name: 'Alüminyum', ion: 'Al³⁺', n: 3, E: -1.66, color: 0xdfe3e8, sol: null },
  Zn: { name: 'Çinko', ion: 'Zn²⁺', n: 2, E: -0.76, color: 0x9aa4ae, sol: null },
  Fe: { name: 'Demir', ion: 'Fe²⁺', n: 2, E: -0.44, color: 0x5f646b, sol: 0x9fd88c },
  Ni: { name: 'Nikel', ion: 'Ni²⁺', n: 2, E: -0.26, color: 0xb9b29c, sol: 0x2fbf6a },
  Sn: { name: 'Kalay', ion: 'Sn²⁺', n: 2, E: -0.14, color: 0xc9ccd0, sol: null },
  Pb: { name: 'Kurşun', ion: 'Pb²⁺', n: 2, E: -0.13, color: 0x6f7886, sol: null },
  Cu: { name: 'Bakır', ion: 'Cu²⁺', n: 2, E: 0.34, color: 0xc8753f, sol: 0x1f6fe0 },
  Ag: { name: 'Gümüş', ion: 'Ag⁺', n: 1, E: 0.80, color: 0xe8eaec, sol: null },
  Au: { name: 'Altın', ion: 'Au³⁺', n: 3, E: 1.50, color: 0xe8b93a, sol: 0xf2cf4a },
};
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const lcm = (a, b) => (a * b) / gcd(a, b);

// Gerçek ölçek: 1 birim = 2,5 cm (U); 250 mL'lik beherler (Ø 7 cm), laboratuvar tezgâhında
const U = 0.025, BENCH = 0.9;
const sim = createSim({
  studio: { color: 0xb9b4aa, mood: 'lab', warmth: 0.12, key: { el: 52, az: 155 }, radius: 22 },
  look: { aoRadius: 0.02 },
  camera: { position: [0, BENCH + 6.6 * U, 14.5 * U], target: [0, BENCH + 3 * U, -1 * U], fov: 45, near: 0.005, far: 100 },
  controls: { minDistance: 5 * U, maxDistance: 34 * U },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>İki kaptan oluşan bir <b>galvanik hücre</b>. Soldaki metal (anot) elektron verir ve iyon olarak çözeltiye geçer
    (<b>yükseltgenme</b>); elektronlar telden geçip sağdaki metale (katot) gider, orada çözeltideki iyonlar elektronu alıp
    metal olarak kaplanır (<b>indirgenme</b>). Tuz köprüsündeki K⁺ ve NO₃⁻ iyonları kapların yük dengesini korur;
    köprü olmazsa akım hemen durur.</p>
    <p>Gerilim iki metalin elektron tutma isteğinin farkıdır: <b>E°hücre = E°katot − E°anot</b>.
    Derişim ve sıcaklık etkisi <b>Nernst denklemiyle</b> hesaplanır: <b>E = E° − (R·T / n·F)·ln Q</b>
    (Q = [anot iyonu]<sup>a</sup> / [katot iyonu]<sup>c</sup>). E° &gt; 0 ise ΔG° = −n·F·E° &lt; 0, tepkime <b>istemlidir</b>.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Daniell pili</b> (Zn | Cu): 1 M çözeltilerde voltmetre ≈ 1,10 V gösterir.</li>
      <li>"⇄ Yer değiştir" ile anot–katodu değiştir: E° negatif olur, bu yönde tepkime <b>istemsizdir</b>. Ampulü bağlarsan
      elektronlar ters yönde akar: roller kendiliğinden değişir.</li>
      <li>Ampulü bağla, zamanı hızlandır: katot iyonları azaldıkça gerilim düşer, sonunda <b>pil biter</b>.</li>
      <li><b>Derişim pili</b> hazır ayarı: iki taraf da bakır (E° = 0) ama derişim farkı yine küçük bir gerilim üretir.</li>
      <li>3 hücreyi <b>seri</b> bağla: gerilimler toplanır. <b>Paralelde</b> gerilim aynı kalır, akım paylaşılır, pil daha uzun dayanır.</li>
    </ul>
    <h3>Gerçek piller</h3>
    <p>Alkalin pil (Zn | MnO₂) ≈ <b>1,5 V</b>; Li-iyon hücre nominal ≈ <b>3,6–3,7 V</b>; kurşun-asit hücre ≈ 2 V (12 V akü = 6 hücre seri).
    Gerçek lityum pillerde su yerine organik elektrolit kullanılır; lityum su ile şiddetle tepkimeye girer.
    Mg ve Al sulu çözeltide oksit tabakası ve su ile tepkime yüzünden tablodaki gerilimi pratikte vermez.</p>
    <h3>Model ve sınırlar</h3>
    <p>E° değerleri standart tablolardan (CRC Handbook; Wikipedia "Standard electrode potential (data page)"), 25 °C:
    Li −3,04 · Mg −2,37 · Al −1,66 · Zn −0,76 · Fe −0,44 · Ni −0,26 · Sn −0,14 · Pb −0,13 · Cu +0,34 · Ag +0,80 · Au +1,50 V.
    Etkinlik yerine derişim kullanılır; E°'nin sıcaklıkla değişimi, aşırı gerilim ve polarizasyon ihmal edilir.
    İç direnç (5 Ω), elektrot miktarı ve zaman ölçeği <b>temsilidir</b>.</p>`,
});
sim.formatTime = (t) => `${fmt((t * timeScale.value), 1)} saat`;

// --- Durum ---
const st = { A: 'Zn', C: 'Cu', cA: 1, cC: 1, mA: M0, mC: M0, q: 0, dead: false, I: 0, E: 0, V: 0, Iload: 0 };
const nTot = () => lcm(METALS[st.A].n, METALS[st.C].n);
const E0 = () => METALS[st.C].E - METALS[st.A].E;
function nernst() {
  const a = METALS[st.A], c = METALS[st.C], n = nTot();
  const T = tempC.value + 273.15;
  const lnQ = (n / a.n) * Math.log(Math.max(st.cA, 1e-9)) - (n / c.n) * Math.log(Math.max(st.cC, 1e-9));
  return E0() - ((R * T) / (n * F)) * lnQ;
}

// --- Sahne: laboratuvar tezgâhı; içerik grubu U ölçekli (birimler 2,5 cm) ---
labRoom(sim.scene, { width: 3.2, depth: 0.75, benchH: BENCH, style: 'lab', wallZ: -0.36 });
const content = new THREE.Group();
content.position.set(0, BENCH, 0);
content.scale.setScalar(U);
sim.scene.add(content);
{
  const b1 = reagentBottle({ h: 0.16, r: 0.036, liquid: 0x2a6fd8, label: 'CuSO₄', stripe: '#27c' });
  b1.position.set(-0.3, BENCH, -0.2); b1.rotation.y = 0.4; sim.scene.add(b1);
  const b2 = reagentBottle({ h: 0.15, r: 0.034, liquid: 0xf2f4f6, label: 'ZnSO₄', stripe: '#777' });
  b2.position.set(-0.22, BENCH, -0.27); b2.rotation.y = -0.3; sim.scene.add(b2);
  const b3 = reagentBottle({ h: 0.13, r: 0.03, liquid: 0xf6f7f8, label: 'KNO₃', stripe: '#c63' });
  b3.position.set(0.27, BENCH, -0.24); b3.rotation.y = 0.2; sim.scene.add(b3);
}

const XL = -3.2, XR = 3.2, BR = 1.4, BH = 3.2, LIQ = 2.4, GT = 0.08;
const cell = new THREE.Group();
content.add(cell);

// Beher dereceleri: beyaz emaye baskı (şeffaf doku)
const gradTex = (() => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.92)'; g.strokeStyle = g.fillStyle; g.lineWidth = 3;
  g.font = '600 22px system-ui, sans-serif'; g.textBaseline = 'middle';
  for (let i = 1; i <= 5; i++) {
    const y = 256 - i * 40;
    g.beginPath(); g.moveTo(40, y); g.lineTo(i % 2 ? 90 : 110, y); g.stroke();
    if (i % 2 === 0 || i === 5) g.fillText(`${i * 50}`, 118, y);
  }
  g.font = '700 24px system-ui, sans-serif'; g.fillText('250 mL', 300, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
})();
const beakerGeo = glassGeometry([[0, 0], [BR - 0.12, 0], [BR, 0.1], [BR, BH]], GT, 72);
function beaker(x) {
  const g = new THREE.Group();
  g.position.x = x;
  const glass = glassMesh(beakerGeo, { thickness: 0.1 });
  glass.material.depthWrite = false;
  const grad = new THREE.Mesh(new THREE.CylinderGeometry(BR + 0.004, BR + 0.004, BH * 0.8, 48, 1, true, -0.7, 1.4),
    new THREE.MeshStandardMaterial({ map: gradTex, transparent: true, alphaTest: 0.3, roughness: 0.4 }));
  grad.position.y = BH * 0.42; grad.userData.noShadow = true;
  const liq = liquidMesh(liquidGeometry(() => BR - GT - 0.01, GT + 0.005, LIQ, { meniscus: 0.0015 / U, segs: 64, steps: 4 }), 0xffffff, 10);
  const liqMat = liq.material;
  liqMat.thickness = BR * 2; liqMat.depthWrite = false;
  g.add(liq, glass, grad);
  cell.add(g);
  return { g, liqMat };
}
const bL = beaker(XL), bR = beaker(XR);

// Elektrotlar: metal şeritler (renk metale göre), üstte timsah pens
function electrode(x, wireColor) {
  const m = mat.brushedMetal({ color: 0x999999, rough: 0.3, scale: U });
  const top = new THREE.Mesh(new RoundedBoxGeometry(0.7, 1.9, 0.08, 2, 0.02), m);
  top.position.set(x, LIQ + 0.03 + 0.95, 0);
  const low = new THREE.Mesh(new RoundedBoxGeometry(0.7, LIQ - 0.3, 0.08, 2, 0.02), m);
  low.position.set(x, 0.3 + (LIQ - 0.3) / 2, 0);
  // Timsah pens: çelik çeneler + renkli PVC kılıf
  const jawM = mat.brushedMetal({ color: 0xc9ccd0, scale: U });
  for (const s of [-1, 1]) {
    const jaw = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.9, 0.08, 2, 0.03), jawM);
    jaw.position.set(x, LIQ + 2.05, s * 0.1); jaw.rotation.x = -s * 0.12; cell.add(jaw);
  }
  const boot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.1, 20), mat.rubber({ color: wireColor, scale: U }));
  boot.position.set(x, LIQ + 2.95, 0); cell.add(boot);
  cell.add(top, low);
  return { mat: m, low, top };
}
const eL = electrode(XL, 0x1b1c1e), eR = electrode(XR, 0xb3261e);
const CLIP_Y = LIQ + 3.5;

// Tuz köprüsü: KNO₃ jeli dolu cam U-boru, uçlarda pamuk tıkaç
const bridgeCurve = new THREE.CatmullRomCurve3([
  [XL + 0.7, 0.9, -0.7], [XL + 0.7, 3.6, -0.7], [XL + 1.4, 4.4, -0.7], [XR - 1.4, 4.4, -0.7], [XR - 0.7, 3.6, -0.7], [XR - 0.7, 0.9, -0.7],
].map((p) => new THREE.Vector3(...p)));
const bridge = glassMesh(new THREE.TubeGeometry(bridgeCurve, 120, 0.3, 24), { thickness: 0.04 });
bridge.material.depthWrite = false;
const gel = liquidMesh(new THREE.TubeGeometry(bridgeCurve, 120, 0.24, 20), 0xf4f1e6, 0.03);
gel.material.thickness = 0.5; gel.material.depthWrite = false; gel.material.roughness = 0.25;
cell.add(gel, bridge);
{
  const cotton = procedural_cotton();
  for (const u of [0.0, 1.0]) {
    const pt = bridgeCurve.getPointAt(u);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.3, 16), cotton);
    c.position.copy(pt).add(new THREE.Vector3(0, -0.1, 0)); cell.add(c);
  }
}
function procedural_cotton() { return mat.fabric({ color: 0xf3f1ea, scale: U }); }

// Ampul devresi: kırmızı/siyah PVC kablo → ahşap taban üzerinde E10 duy + ampul (seri); elektron yolu = kablo
const wireCurve = new THREE.CatmullRomCurve3([
  [XL, CLIP_Y, 0], [XL, CLIP_Y + 0.9, 0.3], [XL + 0.4, CLIP_Y + 0.6, 1.4], [-2.0, 1.2, 2.4], [-0.9, 0.55, 2.2], [-0.25, 0.55, 2.2],
  [0.25, 0.55, 2.2], [0.9, 0.55, 2.2], [2.0, 1.2, 2.4], [XR - 0.4, CLIP_Y + 0.6, 1.4], [XR, CLIP_Y + 0.9, 0.3], [XR, CLIP_Y, 0],
].map((p) => new THREE.Vector3(...p)));
{
  const pts = wireCurve.getSpacedPoints(200);
  const half = (a, b, color) => {
    const c = new THREE.CatmullRomCurve3(pts.slice(a, b));
    content.add(new THREE.Mesh(new THREE.TubeGeometry(c, 100, 0.07, 10), mat.plastic({ color, gloss: 0.5, scale: U })));
  };
  half(0, 94, 0x1b1c1e); half(107, 201, 0xb3261e);
}
const holder = new THREE.Group();
holder.position.set(0, 0, 2.2);
content.add(holder);
{
  const base = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.4, 1.2, 3, 0.06), mat.wood({ color: 0xb58b5a, scale: U }));
  base.position.y = 0.2; holder.add(base);
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.55, 28), mat.plastic({ color: 0x17181a, gloss: 0.4, scale: U }));
  sock.position.y = 0.67; holder.add(sock);
  for (const x of [-0.9, 0.9]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 16), mat.brushedMetal({ color: 0xd8b56a, scale: U }));
    t.position.set(x, 0.51, 0); holder.add(t);
  }
}
const bulbGlass = glassMesh(new THREE.SphereGeometry(0.5, 32, 20), { thickness: 0.02 });
bulbGlass.position.set(0, 1.4, 2.2);
content.add(bulbGlass);
const bulbMat = mat.glow({ color: 0xffc46b, intensity: 0 });
const filament = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.018, 6, 20, Math.PI), bulbMat);
filament.position.set(0, 1.4, 2.2);
content.add(filament);
const bulbLight = new THREE.PointLight(0xffc98a, 0, 0.5, 2);
bulbLight.position.set(0, 1.45 * U + BENCH, 2.2 * U);
sim.scene.add(bulbLight);

// Dijital multimetre: sarı kauçuk kılıf, LCD ekran; ince probları elektrot penslerine
const meterG = new THREE.Group();
meterG.position.set(0, 0, -3.4);
meterG.rotation.x = -1.0;
content.add(meterG);
const lcdCanvas = document.createElement('canvas'); lcdCanvas.width = 256; lcdCanvas.height = 110;
const lcdTex = new THREE.CanvasTexture(lcdCanvas); lcdTex.colorSpace = THREE.SRGBColorSpace;
{
  const holster = new THREE.Mesh(new RoundedBoxGeometry(3.2, 6.2, 1.2, 4, 0.3), mat.rubber({ color: 0xe0b31e, scale: U }));
  holster.position.y = 3.1; meterG.add(holster);
  const face = new THREE.Mesh(new RoundedBoxGeometry(2.7, 5.6, 0.2, 3, 0.08), mat.plastic({ color: 0x24282d, gloss: 0.4, scale: U }));
  face.position.set(0, 3.1, 0.55); meterG.add(face);
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.95), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: lcdTex, emissiveIntensity: 1.1, roughness: 0.25 }));
  lcd.position.set(0, 4.9, 0.66); meterG.add(lcd);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.76, 0.24, 36), mat.plastic({ color: 0x3a3f45, gloss: 0.3, scale: U }));
  dial.rotation.x = Math.PI / 2; dial.position.set(0, 2.9, 0.72); meterG.add(dial);
  const knob = new THREE.Mesh(new RoundedBoxGeometry(0.22, 1.2, 0.2, 2, 0.06), mat.plastic({ color: 0x1a1c1f, gloss: 0.3, scale: U }));
  knob.position.set(0, 2.9, 0.88); knob.rotation.z = 0.5; meterG.add(knob);
  [[-0.8, 0x1b1c1e], [0.8, 0xb3261e]].forEach(([x, c]) => {
    const j = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 20), mat.plastic({ color: c, gloss: 0.5, scale: U }));
    j.rotation.x = Math.PI / 2; j.position.set(x, 1.0, 0.72); meterG.add(j);
  });
}
function drawLCD(v) {
  const g = lcdCanvas.getContext('2d');
  g.fillStyle = '#9fb49a'; g.fillRect(0, 0, 256, 110);
  g.fillStyle = '#18221a'; g.font = '700 64px ui-monospace, Menlo, monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillText(v, 214, 60);
  g.font = '700 26px system-ui, sans-serif'; g.fillText('V', 246, 72);
  g.font = '600 16px system-ui, sans-serif'; g.textAlign = 'left'; g.fillText('DC', 10, 18);
  lcdTex.needsUpdate = true;
}
// Multimetre probları: jaklardan pens üstlerine ince kablolar
{
  meterG.updateMatrix();
  const jack = (x) => new THREE.Vector3(x, 1.0, 0.8).applyMatrix4(meterG.matrix);
  [[-0.8, XL, 0x1b1c1e], [0.8, XR, 0xb3261e]].forEach(([jx, ex, c]) => {
    const a = jack(jx);
    const curve = new THREE.CatmullRomCurve3([a, a.clone().add(new THREE.Vector3(jx * 0.6, 0.4, 0.9)), new THREE.Vector3(ex * 0.7, CLIP_Y + 1.6, -1.2), new THREE.Vector3(ex, CLIP_Y + 0.4, -0.05)]);
    content.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.045, 8), mat.plastic({ color: c, gloss: 0.5, scale: U })));
  });
}

// Parçacıklar: yumuşak ışıklı nokta sprite'ları (elektron, köprü iyonları, çözelti iyonları)
const NE = 36, NB = 24, NS = 22;
const glowPts = (n, size) => {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: ptScale, uSize: { value: size * U } },
    vertexShader: `attribute vec3 aColor; uniform float uScale, uSize; varying vec3 vC;
      void main(){ vC = aColor; vec4 mv = modelViewMatrix*vec4(position, 1.0); gl_PointSize = uSize*uScale/max(-mv.z, 0.001); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5)*2.0; if (r > 1.0) discard;
      float core = smoothstep(0.55, 0.35, r), halo = exp(-r*r*4.0); gl_FragColor = vec4(vC*(core*1.4 + halo*0.6), max(core, halo*0.7)); }`,
    transparent: true, depthWrite: false,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false; p.renderOrder = 4;
  return { p, pos, col, g, setColor(i, hex, k = 1) { cTmp.setHex(hex); col[i * 3] = cTmp.r * k; col[i * 3 + 1] = cTmp.g * k; col[i * 3 + 2] = cTmp.b * k; g.attributes.aColor.needsUpdate = true; },
    set(i, v) { pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; } };
};
const ptScale = { value: 400 };
const cTmp = new THREE.Color();
const electrons = glowPts(NE, 0.32);
for (let i = 0; i < NE; i++) electrons.setColor(i, 0xffd84a, 3);
content.add(electrons.p);
const eU = Array.from({ length: NE }, (_, i) => i / NE);
const bridgeIons = glowPts(NB, 0.3);
const bU = Array.from({ length: NB }, () => rand(0.05, 0.95));
for (let i = 0; i < NB; i++) bridgeIons.setColor(i, i % 2 ? 0xa855f7 : 0xf87171, 1.6);
cell.add(bridgeIons.p);
function solIons(x) {
  const m = glowPts(NS, 0.26);
  cell.add(m.p);
  return { m, x, p: Array.from({ length: NS }, () => ({ r: rand(0.3, 1.2), a: rand(0, Math.PI * 2), y: rand(0.4, LIQ - 0.2) })) };
}
const sL = solIons(XL), sR = solIons(XR);

// Seri/paralel için ek hücre kopyaları (arka planda, küçültülmüş temsil)
const clones = [];
for (let k = 1; k <= 3; k++) {
  const c = cell.clone();
  c.scale.setScalar(0.42);
  c.position.set((k - 2) * 4.2, 0, -5.4);
  c.visible = false;
  content.add(c);
  clones.push(c);
}

// Etiketler
const lblA = sim.label('', { parent: content, position: [XL, -0.1, 1.9], className: 'plain' });
const lblC = sim.label('', { parent: content, position: [XR, -0.1, 1.9], className: 'plain' });
sim.label('Tuz köprüsü (KNO₃)', { parent: content, position: [0, 5.0, -0.7], className: 'plain' });
const lblMeter = sim.label('', { parent: content, position: [0, 6.2, -4.4], className: 'big' });
const lblE = sim.label('', { parent: content, position: [-2.3, 2.6, 2.6], className: 'plain' });
const lblPack = sim.label('', { parent: content, position: [0, 2.2, -5.4], className: 'plain' });

// --- Görsel güncelleme ---
function applyLook() {
  const a = METALS[st.A], c = METALS[st.C];
  eL.mat.color.setHex(a.color); eR.mat.color.setHex(c.color);
  // Renkli iyonlar (Cu²⁺ mavi, Ni²⁺ yeşil, Fe²⁺ açık yeşil, Au³⁺ sarı) derişimle artan soğurma; diğerleri renksiz
  const tint = (b, m, conc) => {
    if (m.sol) { b.liqMat.attenuationColor.setHex(m.sol); b.liqMat.attenuationDistance = 0.022 / Math.max(Math.sqrt(conc), 0.02); }
    else { b.liqMat.attenuationColor.setHex(0xf4f8ff); b.liqMat.attenuationDistance = 5; }
  };
  tint(bL, a, st.cA); tint(bR, c, st.cC);
  const s = (m) => Math.sqrt(clamp(m / M0, 0.02, 3));
  eL.low.scale.set(s(st.mA), 1, s(st.mA) * 1.6 - 0.6);
  eR.low.scale.set(s(st.mC), 1, s(st.mC) * 1.6 - 0.6);
  eL.low.visible = st.mA > M0 * 0.01; eR.low.visible = st.mC > M0 * 0.01;
  for (let i = 0; i < NS; i++) { sL.m.setColor(i, a.sol || 0xcbd5e1, 1.5); sR.m.setColor(i, c.sol || 0xcbd5e1, 1.5); }
}

function labels() {
  const a = METALS[st.A], c = METALS[st.C];
  const e = (m) => (m.n === 1 ? 'e⁻' : `${m.n}e⁻`);
  const ox = (s, m) => `${s} → ${m.ion} + ${e(m)}`;
  const red = (s, m) => `${m.ion} + ${e(m)} → ${s}`;
  // Sol elektrot anot mu? (akım ileri yönde ya da açık devrede E ≥ 0 ise)
  const leftAnode = st.I !== 0 ? st.I > 0 : nernst() >= 0;
  lblA.setText(`<b>${leftAnode ? 'Anot (−)' : 'Katot (+)'}</b> · ${a.name}<br>${leftAnode ? 'yükseltgenme: ' + ox(st.A, a) : 'indirgenme: ' + red(st.A, a)}<br>[${a.ion}] = ${fmtM(st.cA)} M`);
  lblC.setText(`<b>${leftAnode ? 'Katot (+)' : 'Anot (−)'}</b> · ${c.name}<br>${leftAnode ? 'indirgenme: ' + red(st.C, c) : 'yükseltgenme: ' + ox(st.C, c)}<br>[${c.ion}] = ${fmtM(st.cC)} M`);
}
const fmtM = (c) => (c >= 0.1 ? fmt(c, 2) : c >= 0.01 ? fmt(c, 3) : c >= 0.0001 ? fmt(c, 4) : fmt(c * 1e6, 1) + '·10⁻⁶');

// --- Deşarj ---
let deadToastShown = false;
function circuit() {
  const E = st.dead ? 0 : nernst();
  const N = nCells.value, ser = conn.value === 'seri';
  const Etot = ser ? N * E : E, rtot = ser ? N * R_INT : R_INT / N;
  const load = mode.value === 'ampul';
  const Iload = load ? Etot / (rtot + loadR.value) : 0;
  st.E = E; st.Iload = Iload; st.I = ser ? Iload : Iload / N;
  st.V = Etot - Iload * rtot;
  st.Etot = Etot;
}
function discharge(dtSec) {
  if (st.dead || mode.value !== 'ampul') return;
  const a = METALS[st.A], c = METALS[st.C], V = vol.value / 1000;
  let left = dtSec;
  for (let k = 0; k < 60 && left > 0; k++) {
    circuit();
    if (Math.abs(st.I) < 1e-9) break;
    let x = (st.I * left) / F; // elektron molü (işaretli)
    const cap = x > 0 ? Math.min(st.cC * V * c.n, st.mA * a.n) : Math.min(st.cA * V * a.n, st.mC * c.n);
    const used = Math.min(Math.abs(x), cap * 0.5);
    const frac = used / Math.abs(x);
    x = Math.sign(x) * used;
    st.cA = Math.max(st.cA + x / a.n / V, 1e-9);
    st.cC = Math.max(st.cC - x / c.n / V, 1e-9);
    st.mA = Math.max(st.mA - x / a.n, 0);
    st.mC = Math.max(st.mC + x / c.n, 0);
    st.q += Math.abs(x) * F;
    left -= left * frac;
    const rem = x > 0 ? Math.min(st.cC * V * c.n / (st.c0C * V * c.n), st.mA / M0) : Math.min(st.cA / st.c0A, st.mC / M0);
    if (rem < 2e-3) {
      st.dead = true;
      const why = x > 0 ? (st.cC * V * c.n < st.mA * a.n ? `${c.ion} iyonları tükendi` : `${a.name} elektrot tükendi`) : 'tepkime maddesi tükendi';
      st.why = why;
      if (!deadToastShown) { sim.toast(`🔋 Pil bitti: ${why}`, 'warn'); deadToastShown = true; }
      break;
    }
  }
  circuit();
}

// --- Arayüz ---
const ui = sim.ui;
const metalOpts = Object.entries(METALS).map(([k, m]) => ({ value: k, label: `${m.name} (${m.ion}/${k}) · E° = ${m.E > 0 ? '+' : ''}${fmt(m.E, 2)} V` }));
const PRESETS = {
  daniell: { A: 'Zn', C: 'Cu', cA: 1, cC: 1, label: 'Daniell pili (Zn | Cu)' },
  zag: { A: 'Zn', C: 'Ag', cA: 1, cC: 1, label: 'Çinko–gümüş (Zn | Ag)' },
  mgcu: { A: 'Mg', C: 'Cu', cA: 1, cC: 1, label: 'Magnezyum–bakır (Mg | Cu)' },
  licu: { A: 'Li', C: 'Cu', cA: 1, cC: 1, label: 'Lityum–bakır (temsili, suda olmaz!)' },
  ters: { A: 'Cu', C: 'Zn', cA: 1, cC: 1, label: 'Ters bağlı (Cu | Zn) — istemsiz' },
  derisim: { A: 'Cu', C: 'Cu', cA: 0.01, cC: 1, label: 'Derişim pili (Cu 0,01 M | Cu 1 M)' },
  seyrek: { A: 'Zn', C: 'Cu', cA: 1, cC: 0.001, label: 'Seyrek katot (Cu²⁺ 0,001 M)' },
};
ui.section('Hazır deneyler');
const preset = ui.select({ options: Object.entries(PRESETS).map(([k, p]) => ({ value: k, label: p.label })), value: 'daniell', onChange: (v) => loadPreset(v) });

ui.section('Hücre');
const selA = ui.select({ label: 'Anot (sol) metali', options: metalOpts, value: 'Zn', onChange: (v) => { st.A = v; restart(); } });
const selC = ui.select({ label: 'Katot (sağ) metali', options: metalOpts, value: 'Cu', onChange: (v) => { st.C = v; restart(); } });
ui.buttons([{ label: '⇄ Yer değiştir', onClick: () => {
  [st.A, st.C] = [st.C, st.A]; selA.set(st.A); selC.set(st.C);
  const a = concA.value; concA.set(concC.value); concC.set(a); restart();
} }]);
const concFmt = (v) => `${fmtM(10 ** v)} M`;
const concA = ui.slider({ label: 'Anot çözeltisi derişimi', min: -3, max: 0.3, step: 0.05, value: 0, format: concFmt, onChange: () => restart() });
const concC = ui.slider({ label: 'Katot çözeltisi derişimi', min: -3, max: 0.3, step: 0.05, value: 0, format: concFmt, onChange: () => restart() });
const tempC = ui.slider({ label: 'Sıcaklık', min: 0, max: 80, step: 1, value: 25, unit: '°C' });
const vol = ui.slider({ label: 'Her kaptaki çözelti', min: 20, max: 500, step: 10, value: 100, unit: 'mL', onChange: () => restart() });

ui.section('Devre');
const mode = ui.segmented({ options: [{ value: 'volt', label: '🔎 Voltmetre (açık devre)' }, { value: 'ampul', label: '💡 Ampul bağla' }], value: 'volt' });
const loadR = ui.slider({ label: 'Ampul (yük) direnci', min: 5, max: 1000, step: 5, value: 100, unit: 'Ω' });
const nCells = ui.slider({ label: 'Hücre sayısı', min: 1, max: 4, step: 1, value: 1, onChange: () => updatePack() });
const conn = ui.segmented({ label: 'Bağlantı', options: [{ value: 'seri', label: 'Seri' }, { value: 'paralel', label: 'Paralel' }], value: 'seri', onChange: () => updatePack() });
const timeScale = ui.slider({ label: 'Zaman hızı (1 sn = ? saat)', min: 1, max: 100, step: 1, value: 10, unit: 'saat' });

ui.section('Ölçümler');
const sE0 = ui.stat({ label: 'E°hücre', unit: 'V' });
const sE = ui.stat({ label: 'E (Nernst)', unit: 'V' });
const sV = ui.stat({ label: 'Ampuldeki gerilim', unit: 'V' });
const sI = ui.stat({ label: 'Akım', unit: 'mA' });
const sP = ui.stat({ label: 'Güç', unit: 'mW' });
const sQ = ui.stat({ label: 'Verilen yük', unit: 'mAh' });
const status = ui.text('', 'card');
const vChart = ui.chart({ title: 'Hücre gerilimi E (V) — zamanla', series: [{ name: 'E', color: '#facc15', fill: true }], maxPoints: 300, format: (v) => fmt(v, 2) });
const cChart = ui.chart({ title: 'Derişimler (M)', series: [{ name: 'anot iyonu', color: '#94a3b8' }, { name: 'katot iyonu', color: '#38bdf8' }], maxPoints: 300, format: (v) => fmt(v, 2) });

ui.section('Gerçek pillerle karşılaştır');
const compare = ui.text('', 'card');

function updatePack() {
  const N = nCells.value;
  clones.forEach((c, i) => (c.visible = i < N - 1));
  lblPack.visible = N > 1;
  lblPack.position.set(0, 2.2, -5.4);
  lblPack.setText(N > 1 ? `+${N - 1} ek hücre · ${conn.value === 'seri' ? 'seri: gerilimler toplanır' : 'paralel: gerilim aynı, akım paylaşılır'}` : '');
}

function loadPreset(k) {
  const p = PRESETS[k];
  st.A = p.A; st.C = p.C; selA.set(p.A); selC.set(p.C);
  concA.set(Math.log10(p.cA)); concC.set(Math.log10(p.cC));
  if (k === 'ters') mode.set('volt');
  restart();
}

function restart() {
  st.cA = st.c0A = 10 ** concA.value; st.cC = st.c0C = 10 ** concC.value;
  st.mA = st.mC = M0; st.q = 0; st.dead = false; st.why = ''; deadToastShown = false;
  sim.time = 0; chartT = 0;
  vChart.clear(); cChart.clear();
  circuit(); applyLook(); labels(); refreshPanel();
}

function refreshPanel() {
  const e0 = E0();
  sE0.set(`${e0 > 0 ? '+' : ''}${fmt(e0, 2)}`, e0 > 0 ? 'good' : e0 < 0 ? 'bad' : 'warn');
  sE.set(fmt(st.E, 3), st.E > 0 ? 'good' : st.E < 0 ? 'bad' : 'warn');
  const load = mode.value === 'ampul';
  sV.set(load ? fmt(st.V, 2) : '—');
  sI.set(load ? fmt(st.Iload * 1000, 1) : '0');
  sP.set(load ? fmt(Math.abs(st.V * st.Iload) * 1000, 1) : '0');
  sQ.set(fmt(st.q / 3.6, 0));
  const a = METALS[st.A], c = METALS[st.C];
  const dG = (-nTot() * F * st.E) / 1000;
  let html;
  if (st.dead) html = `<b>Pil bitti</b>: ${st.why}. Kimyasal enerji tükendi, artık elektron itecek "istek" kalmadı. ⟲ ile yeniden kur.`;
  else if (Math.abs(st.E) < 1e-4) html = `E = 0: iki taraf dengede, elektron akmaz (ΔG = 0).`;
  else if (st.E > 0) html = `<b>İstemli</b>: ΔG = −nFE = ${fmt(dG, 0)} kJ (n = ${nTot()}). ${a.name} elektron verir, ${c.ion} iyonları elektron alır.`;
  else html = `<b>İstemsiz</b> (bu yönde): E &lt; 0, ΔG = ${fmt(dG, 0)} kJ &gt; 0. ${a.name} değil <b>${c.name}</b> daha kolay elektron verir;
    ampulü bağlarsan akım <b>ters yönde</b> akar, sol elektrot katot olur.`;
  if (!st.dead && mode.value === 'volt') html += '<br><small>Voltmetre neredeyse akım çekmez: pil boşalmaz. Deşarjı görmek için ampulü bağla.</small>';
  status.set(html);
  const Et = Math.abs(st.Etot || 0);
  const need = (target) => (Math.abs(st.E) > 0.01 ? Math.ceil(target / Math.abs(st.E) - 1e-9) : '∞');
  compare.set(`Senin pakedin: <b>${fmt(Et, 2)} V</b><br>
    🔋 Alkalin AA: ≈ 1,5 V → bu hücreden <b>${need(1.5)}</b> tane seri gerekir<br>
    📱 Li-iyon hücre: ≈ 3,6–3,7 V → <b>${need(3.7)}</b> tane seri<br>
    🚗 Otomobil aküsü: 12 V (6 × 2 V kurşun-asit) → <b>${need(12)}</b> tane seri`);
}

// --- Döngü ---
let chartT = 0, uiT = 0;
const tmpV2 = new THREE.Vector2(), tmpV3 = new THREE.Vector3();
sim.onUpdate((dt) => {
  discharge(dt * timeScale.value * 3600);
  circuit();
  chartT += dt;
  if (chartT > 0.25) {
    chartT = 0;
    vChart.push([st.dead ? 0 : st.E]);
    cChart.push([st.cA, st.cC]);
  }
});

sim.onRender((rdt) => {
  const load = mode.value === 'ampul' && !st.dead;
  const Imag = load ? Math.abs(st.Iload) : 0;
  const dir = st.I >= 0 ? 1 : -1;
  const speed = load ? clamp(0.03 + Imag * 6, 0.03, 0.6) * dir : 0;
  const t = sim.paused ? 0 : rdt;
  // Elektronlar: tel boyunca anottan katoda
  const vp = sim.renderer.getDrawingBufferSize(tmpV2);
  ptScale.value = vp.y / (2 * Math.tan(THREE.MathUtils.degToRad(sim.camera.fov / 2)));
  electrons.p.visible = load;
  for (let i = 0; i < NE; i++) {
    eU[i] = (eU[i] + speed * t + 1) % 1;
    electrons.set(i, wireCurve.getPointAt(eU[i], tmpV3));
  }
  electrons.g.attributes.position.needsUpdate = true;
  // Tuz köprüsü: anyonlar anoda (sola), katyonlar katoda (sağa)
  for (let i = 0; i < NB; i++) {
    const s = i % 2 ? 1 : -1;
    bU[i] += s * speed * 0.35 * t;
    if (bU[i] > 0.97) bU[i] = 0.03; if (bU[i] < 0.03) bU[i] = 0.97;
    bridgeIons.set(i, bridgeCurve.getPointAt(bU[i], tmpV3));
  }
  bridgeIons.g.attributes.position.needsUpdate = true;
  // Çözeltideki iyonlar: anottan uzaklaşır, katoda yaklaşır
  const moveIons = (s, out) => {
    for (let i = 0; i < NS; i++) {
      const p = s.p[i];
      p.r += (out ? 1 : -1) * Math.abs(speed) * 2.2 * t;
      p.a += 0.2 * t;
      if (p.r > 1.25) { p.r = out ? 0.2 : 1.2; p.y = rand(0.4, LIQ - 0.2); }
      if (p.r < 0.18) { p.r = out ? 0.2 : 1.2; p.y = rand(0.4, LIQ - 0.2); }
      s.m.set(i, tmpV3.set(s.x + Math.cos(p.a) * p.r, p.y + Math.sin(p.a * 3) * 0.05, Math.sin(p.a) * p.r));
    }
    s.m.g.attributes.position.needsUpdate = true;
  };
  moveIons(sL, dir > 0); moveIons(sR, dir < 0);
  // Ampul
  const P = load ? Math.abs(st.V * st.Iload) : 0;
  const glow = clamp(Math.sqrt(P / 0.05), 0, 1.6);
  bulbMat.emissiveIntensity = glow * 9;
  bulbLight.intensity = glow * 0.25;
  uiT += rdt;
  if (uiT > 0.2) {
    uiT = 0;
    applyLook(); labels(); refreshPanel();
    const shown = mode.value === 'ampul' ? st.V : (st.Etot ?? st.E);
    lblMeter.setText(`<b style="color:#0b3d1a">${shown >= 0 ? '' : '−'}${fmt(Math.abs(shown), 2)} V</b>`);
    drawLCD(`${shown >= 0 ? '' : '-'}${Math.abs(shown).toFixed(Math.abs(shown) >= 10 ? 1 : 2)}`);
    lblE.setText(load ? `e⁻ ${dir > 0 ? '→' : '←'} ${fmt(Math.abs(st.Iload) * 1000, 1)} mA` : mode.value === 'volt' ? 'açık devre: akım yok' : '');
  }
});

// Elektrota tıkla → bilgi
sim.onClick([eL.low, eL.top, eR.low, eR.top], (hit) => {
  const left = hit.object === eL.low || hit.object === eL.top;
  const m = METALS[left ? st.A : st.C];
  const amt = left ? st.mA : st.mC;
  sim.toast(`<b>${m.name}</b> · E°(${m.ion}/${left ? st.A : st.C}) = ${fmt(m.E, 2)} V · elektrot: %${fmt((amt / M0) * 100, 0)}`);
});

sim.onReset(() => restart());
updatePack();
loadPreset('daniell');
