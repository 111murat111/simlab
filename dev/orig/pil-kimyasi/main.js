// Pil Nasıl Çalışır? — galvanik hücre: standart indirgenme potansiyelleri, Nernst denklemi, deşarj, seri/paralel bağlama.
import { createSim, THREE, RoundedBoxGeometry, fmt, clamp, rand, instanced } from '@core';

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

const sim = createSim({
  background: 0x121826,
  camera: { position: [0, 6.6, 14.5], target: [0, 3, -1], fov: 45 },
  controls: { minDistance: 5, maxDistance: 34 },
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

// --- Sahne ---
const bench = new THREE.Mesh(new RoundedBoxGeometry(16, 0.4, 9, 3, 0.08), new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.5 }));
bench.position.set(0, -0.2, -2);
sim.scene.add(bench);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: 0x1b2230, roughness: 0.9 }));
wall.position.set(0, 10, -16);
sim.scene.add(wall);
const fillLight = new THREE.PointLight(0xfff1dd, 16, 30, 1.6);
fillLight.position.set(-5, 9, 6);
sim.scene.add(fillLight);

const glassMat = new THREE.MeshPhongMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.22, shininess: 120, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });
const XL = -3.2, XR = 3.2, BR = 1.4, BH = 3.2, LIQ = 2.4;
const cell = new THREE.Group();
sim.scene.add(cell);

function beaker(x) {
  const g = new THREE.Group();
  g.position.x = x;
  const wallM = new THREE.Mesh(new THREE.CylinderGeometry(BR, BR, BH, 40, 1, true), glassMat);
  wallM.position.y = BH / 2;
  wallM.renderOrder = 3;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(BR, 0.04, 8, 48), glassMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = BH;
  const liqMat = new THREE.MeshPhongMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.3, shininess: 60, depthWrite: false });
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(BR - 0.05, BR - 0.05, LIQ, 40), liqMat);
  liq.position.y = LIQ / 2 + 0.03;
  liq.renderOrder = 1;
  g.add(wallM, rim, liq);
  cell.add(g);
  return { g, liqMat };
}
const bL = beaker(XL), bR = beaker(XR);

function electrode(x) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.75, roughness: 0.35 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.9, 0.14), mat);
  top.position.set(x, LIQ + 0.03 + 0.95, 0);
  const low = new THREE.Mesh(new THREE.BoxGeometry(0.7, LIQ - 0.3, 0.14), mat);
  low.position.set(x, 0.3 + (LIQ - 0.3) / 2, 0);
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.3), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  clip.position.set(x, LIQ + 1.9, 0);
  cell.add(top, low, clip);
  return { mat, low, top };
}
const eL = electrode(XL), eR = electrode(XR);

// Tuz köprüsü
const bridgeCurve = new THREE.CatmullRomCurve3([
  [XL + 0.7, 0.9, -0.7], [XL + 0.7, 3.6, -0.7], [XL + 1.4, 4.4, -0.7], [XR - 1.4, 4.4, -0.7], [XR - 0.7, 3.6, -0.7], [XR - 0.7, 0.9, -0.7],
].map((p) => new THREE.Vector3(...p)));
const bridge = new THREE.Mesh(new THREE.TubeGeometry(bridgeCurve, 80, 0.3, 14), new THREE.MeshPhongMaterial({ color: 0xf1f5f9, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
bridge.renderOrder = 2;
cell.add(bridge);

// Tel, voltmetre ve ampul
const wireCurve = new THREE.CatmullRomCurve3([
  [XL, LIQ + 1.9, 0], [XL, 5.6, 0.2], [XL + 1.2, 6.5, 0.35], [-1.0, 6.6, 0.35], [1.0, 6.6, 0.35], [XR - 1.2, 6.5, 0.35], [XR, 5.6, 0.2], [XR, LIQ + 1.9, 0],
].map((p) => new THREE.Vector3(...p)));
sim.scene.add(new THREE.Mesh(new THREE.TubeGeometry(wireCurve, 120, 0.05, 8), new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.6, roughness: 0.4 })));
const meter = new THREE.Mesh(new RoundedBoxGeometry(2.0, 1.2, 0.6, 3, 0.1), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 }));
meter.position.set(0, 6.6, 0.4);
sim.scene.add(meter);
const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.7), new THREE.MeshBasicMaterial({ color: 0x9fe8b0 }));
screen.position.set(0, 6.62, 0.71);
sim.scene.add(screen);
const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff7d6, emissive: 0xffc94d, emissiveIntensity: 0, transparent: true, opacity: 0.85 });
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), bulbMat);
bulb.position.set(0, 7.75, 0.4);
const bulbBase = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.35, 16), new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.7, roughness: 0.3 }));
bulbBase.position.set(0, 7.3, 0.4);
const bulbLight = new THREE.PointLight(0xffd27a, 0, 12, 1.5);
bulbLight.position.copy(bulb.position);
sim.scene.add(bulb, bulbBase, bulbLight);

// Parçacıklar
const NE = 36, NB = 24, NS = 22;
const dummy = new THREE.Object3D();
const electrons = instanced(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfde047 }), NE);
sim.scene.add(electrons);
const eU = Array.from({ length: NE }, (_, i) => i / NE);
const bridgeIons = instanced(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), NB);
const bU = Array.from({ length: NB }, () => rand(0.05, 0.95));
const bCol = new THREE.Color();
for (let i = 0; i < NB; i++) bridgeIons.setColorAt(i, bCol.setHex(i % 2 ? 0xa855f7 : 0xf87171));
cell.add(bridgeIons);
function solIons(x) {
  const m = instanced(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), NS);
  cell.add(m);
  return { m, x, p: Array.from({ length: NS }, () => ({ r: rand(0.3, 1.2), a: rand(0, Math.PI * 2), y: rand(0.4, LIQ - 0.2) })) };
}
const sL = solIons(XL), sR = solIons(XR);

// Seri/paralel için ek hücre kopyaları (arka planda)
const clones = [];
for (let k = 1; k <= 3; k++) {
  const c = cell.clone();
  c.scale.setScalar(0.42);
  c.position.set((k - 2) * 4.2, 0, -5.4);
  c.visible = false;
  sim.scene.add(c);
  clones.push(c);
}

// Etiketler
const lblA = sim.label('', { position: [XL, -0.1, 1.9], className: 'plain' });
const lblC = sim.label('', { position: [XR, -0.1, 1.9], className: 'plain' });
sim.label('Tuz köprüsü (KNO₃)', { position: [0, 5.0, -0.7], className: 'plain' });
const lblMeter = sim.label('', { position: [0, 6.62, 0.75], className: 'big' });
const lblE = sim.label('', { position: [-2.3, 7.2, 0.4], className: 'plain' });
const lblPack = sim.label('', { position: [0, 2.2, -5.4], className: 'plain' });

// --- Görsel güncelleme ---
const cTmp = new THREE.Color();
function applyLook() {
  const a = METALS[st.A], c = METALS[st.C];
  eL.mat.color.setHex(a.color); eR.mat.color.setHex(c.color);
  const tint = (b, m, conc) => {
    if (m.sol) { b.liqMat.color.setHex(0xdbeafe).lerp(cTmp.setHex(m.sol), clamp(0.25 + 0.55 * Math.sqrt(conc), 0, 0.95)); b.liqMat.opacity = 0.3 + 0.3 * clamp(Math.sqrt(conc), 0, 1); }
    else { b.liqMat.color.setHex(0xdbeafe); b.liqMat.opacity = 0.28; }
  };
  tint(bL, a, st.cA); tint(bR, c, st.cC);
  const s = (m) => Math.sqrt(clamp(m / M0, 0.02, 3));
  eL.low.scale.set(s(st.mA), 1, s(st.mA) * 1.6 - 0.6);
  eR.low.scale.set(s(st.mC), 1, s(st.mC) * 1.6 - 0.6);
  eL.low.visible = st.mA > M0 * 0.01; eR.low.visible = st.mC > M0 * 0.01;
  for (let i = 0; i < NS; i++) { sL.m.setColorAt(i, cTmp.setHex(a.sol || 0xcbd5e1)); sR.m.setColorAt(i, cTmp.setHex(c.sol || 0xcbd5e1)); }
  sL.m.instanceColor.needsUpdate = sR.m.instanceColor.needsUpdate = true;
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
  for (let i = 0; i < NE; i++) {
    eU[i] = (eU[i] + speed * t + 1) % 1;
    dummy.position.copy(wireCurve.getPointAt(eU[i]));
    dummy.scale.setScalar(load ? 1 : 0.001);
    dummy.updateMatrix();
    electrons.setMatrixAt(i, dummy.matrix);
  }
  electrons.instanceMatrix.needsUpdate = true;
  // Tuz köprüsü: anyonlar anoda (sola), katyonlar katoda (sağa)
  for (let i = 0; i < NB; i++) {
    const s = i % 2 ? 1 : -1;
    bU[i] += s * speed * 0.35 * t;
    if (bU[i] > 0.97) bU[i] = 0.03; if (bU[i] < 0.03) bU[i] = 0.97;
    dummy.position.copy(bridgeCurve.getPointAt(bU[i]));
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    bridgeIons.setMatrixAt(i, dummy.matrix);
  }
  bridgeIons.instanceMatrix.needsUpdate = true;
  // Çözeltideki iyonlar: anottan uzaklaşır, katoda yaklaşır
  const moveIons = (s, out) => {
    for (let i = 0; i < NS; i++) {
      const p = s.p[i];
      p.r += (out ? 1 : -1) * Math.abs(speed) * 2.2 * t;
      p.a += 0.2 * t;
      if (p.r > 1.25) { p.r = out ? 0.2 : 1.2; p.y = rand(0.4, LIQ - 0.2); }
      if (p.r < 0.18) { p.r = out ? 0.2 : 1.2; p.y = rand(0.4, LIQ - 0.2); }
      dummy.position.set(s.x + Math.cos(p.a) * p.r, p.y + Math.sin(p.a * 3) * 0.05, Math.sin(p.a) * p.r);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      s.m.setMatrixAt(i, dummy.matrix);
    }
    s.m.instanceMatrix.needsUpdate = true;
  };
  moveIons(sL, dir > 0); moveIons(sR, dir < 0);
  // Ampul
  const P = load ? Math.abs(st.V * st.Iload) : 0;
  const glow = clamp(Math.sqrt(P / 0.05), 0, 1.6);
  bulbMat.emissiveIntensity = glow * 2.2;
  bulbLight.intensity = glow * 14;
  uiT += rdt;
  if (uiT > 0.2) {
    uiT = 0;
    applyLook(); labels(); refreshPanel();
    const shown = mode.value === 'ampul' ? st.V : (st.Etot ?? st.E);
    lblMeter.setText(`<b style="color:#0b3d1a">${shown >= 0 ? '' : '−'}${fmt(Math.abs(shown), 2)} V</b>`);
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
