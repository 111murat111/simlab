// Sinir Sinyali — Hodgkin–Huxley aksonda aksiyon potansiyeli, miyelin (sıçramalı iletim), refleks yayı ve tepki süresi testi.
import { createSim, THREE, clamp, lerp, rand, fmt, seeded, mat, procedural, RoundedBoxGeometry } from '@core';
import { darkMedium, loftTube, blobGeometry, sdfMesh, sEllipsoid, sCone , tissue } from './bio.js';
import { STAND, bodyItems, skinMaterial } from './human.js';
import { createAxon, SHIFT } from './hh.js';
import { buildNerveEnv, myelinMaterial } from './nerveEnv.js';

const sim = createSim({
  studio: { mood: 'lab', color: 0x7a8088, warmth: 0.2, key: { el: 45, az: 210, power: 1.2 }, radius: 70, height: 36 },
  camera: { position: [-0.5, 0.6, 23], target: [-0.5, 0.3, 0], fov: 45 },
  controls: { minDistance: 6, maxDistance: 45, maxPolarAngle: Math.PI * 0.85 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Bir motor nöron: <b>dendritler</b> ve <b>hücre gövdesi</b> (soma), uzun bir <b>akson</b> ve ucunda bir kas lifine
    bağlanan <b>sinaps</b>. Akson rengi zar gerilimini gösterir: mavi = dinlenme (≈ −70 mV), sarı-kırmızı = uyarılmış (≈ +30 mV).
    Aksonun her küçük bölmesi <b>Hodgkin–Huxley</b> denklemleriyle hesaplanır: Na⁺ kanalları açılınca (sarı halkalar) içeri
    Na⁺ girer ve gerilim hızla yükselir, ardından K⁺ çıkışı gerilimi geri indirir ve kısa bir süre dinlenmenin de altına
    iner (<b>hiperpolarizasyon</b>).</p>
    <h3>Dene</h3>
    <ul>
      <li>Uyarı şiddetini 8'e indir ("Eşik altı"): gerilim biraz kıpırdar ama aksiyon potansiyeli <b>oluşmaz</b>. Eşiği aşınca hep aynı
      büyüklükte bir sinyal çıkar: <b>ya hep ya hiç</b> kuralı. Şiddeti artırmak sinyali büyütmez.</li>
      <li><b>Miyelin</b>'i aç: sinyal yalnızca Ranvier boğumlarında yeniden üretilir ve boğumdan boğuma sıçrar; iletim birkaç kat hızlanır.</li>
      <li>"Refrakter dönem" hazır ayarında uyarılar çok sık gelir; bazıları yanıtsız kalır çünkü Na⁺ kanalları henüz toparlanmamıştır.</li>
      <li><b>Refleks yayı</b> kipinde el sıcak ocağa değer: el, sen acıyı hissetmeden çekilir. <b>Tepki süresi</b> kipinde kendi hızını ölç.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <ul>
      <li>Miyelinsiz ince lifler yaklaşık 0,5–2 m/s, kalın miyelinli lifler 70–120 m/s hızla iletir. Multipl skleroz (MS) gibi
      hastalıklarda miyelin hasar görür ve iletim yavaşlar ya da durur.</li>
      <li>Geri çekme refleksi omurilikte kurulur; beyin olayı ancak ardından fark eder.</li>
      <li>Alkol ve uykusuzluk tepki süresini uzatır; kafein yorgunluğu biraz maskeler ama <b>alkolün etkisini gidermez</b>.
      Alkollü ya da uykusuz araç kullanma.</li>
    </ul>
    <p><small>Akson modeli ölçeklenmiş bir kablo modelidir (sıcaklık katsayısı 2, bölme uzunlukları temsili). Refleks yayındaki
    uzunluk ve gecikmeler ile tepki süresindeki değiştirici etkiler yaklaşık/temsilidir; tıbbi ölçüm değildir.</small></p>`,
});
const LOWQ = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
const studioBg = sim.scene.background ? sim.scene.background.clone() : new THREE.Color(0x202428);

// --- Gerilim renk skalası ---
const STOPS = [[-85, 0x1e3a8a], [-70, 0x2f6fe0], [-55, 0x06b6d4], [-25, 0xfacc15], [5, 0xf97316], [35, 0xef4444]].map(([v, c]) => [v, new THREE.Color(c)]);
function vColor(v, out) {
  if (v <= STOPS[0][0]) return out.copy(STOPS[0][1]);
  for (let k = 1; k < STOPS.length; k++) {
    if (v <= STOPS[k][0]) return out.copy(STOPS[k - 1][1]).lerp(STOPS[k][1], (v - STOPS[k - 1][0]) / (STOPS[k][0] - STOPS[k - 1][0]));
  }
  return out.copy(STOPS[STOPS.length - 1][1]);
}
const disp = (v) => v + SHIFT; // model gerilimi → ekran (mV)
const tmpC = new THREE.Color(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), ZAX = new THREE.Vector3(0, 0, 1);

// ================= 1) NÖRON =================
// Mikroskobik görünüm: koyu hücre dışı sıvı, derinlik sisi, süzülen parçacıklar; zar gerilimi aksonun kendi ışımasıyla okunur.
const medium = darkMedium(sim, { top: 0x235a70, bottom: 0x06131c, glow: 0x4aa0b0, glowDir: [-0.4, 0.55, -0.7], tint: 0x5a3c80,
  fog: 0x0f2a38, density: 0.024, motes: LOWQ ? 420 : 800, box: [48, 24, 30], center: [0, 0, -4], moteColor: 0xa8e0ff, moteColor2: 0xffd9a0, moteSize: 0.13, moteOpacity: 0.4 });
const N = 81, NODE = 10, DT = 0.0016;
const ax = createAxon({ n: N, nodeEvery: NODE, phi: 2 });
const neuronG = new THREE.Group();
sim.scene.add(neuronG);

const curve = new THREE.CatmullRomCurve3([[-6.2, 2.3, 0], [-3.2, 2.7, 0.4], [0, 0.9, 0], [3.2, -1.3, -0.4], [6.4, -1.5, 0]].map((p) => new THREE.Vector3(...p)));
const segLen = curve.getLength() / (N - 1);
const P = [], T = [];
for (let i = 0; i < N; i++) { P.push(curve.getPointAt(i / (N - 1))); T.push(curve.getTangentAt(i / (N - 1))); }
void segLen;

// Zar malzemesi: ıslak, yarı saydam görünümlü lipit zar; köşe rengi = gerilim, aGlow = ışıma şiddeti
function membraneMat(key) {
  const m = procedural({
    key, physical: true, scale: 2.5, bump: 0.012,
    params: { color: 0xffffff, roughness: 0.3, sheen: 0.7, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xc8e4ff), clearcoat: 0.8, clearcoatRoughness: 0.18, side: THREE.DoubleSide },
    pattern: `
      float n = fbm3(p*1.3 + seed*5.0, 4), f = vn3(p*9.0);
      col *= 0.78 + 0.3*n;
      rough = clamp(rough + 0.1*(f - 0.5), 0.1, 0.8);
      h = n*0.7 + f*0.3;`,
  });
  return m;
}
const TS = (N - 1) * 4, RS = 18, AX_R = 0.17;
const axGeo = new THREE.BufferGeometry();
const axBase = [], axDir = [];
{
  const fr = curve.computeFrenetFrames(TS, false);
  const pos = [], nor = [], col = [], glow = [], idx = [];
  for (let j = 0; j <= TS; j++) {
    const c = curve.getPointAt(j / TS);
    for (let k = 0; k <= RS; k++) {
      const a = (k / RS) * Math.PI * 2;
      const d = fr.normals[j].clone().multiplyScalar(Math.cos(a)).addScaledVector(fr.binormals[j], Math.sin(a));
      axBase.push(c); axDir.push(d);
      pos.push(c.x + d.x * AX_R, c.y + d.y * AX_R, c.z + d.z * AX_R); nor.push(d.x, d.y, d.z);
      col.push(0.2, 0.4, 0.9); glow.push(0.2);
      if (j < TS && k < RS) { const q = j * (RS + 1) + k; idx.push(q, q + 1, q + RS + 1, q + 1, q + RS + 2, q + RS + 1); }
    }
  }
  axGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  axGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  axGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  axGeo.setAttribute('aGlow', new THREE.Float32BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage));
  axGeo.setIndex(idx);
}
const axMat = membraneMat('sinir-akson');
axMat.vertexColors = true;
{
  const b0 = axMat.onBeforeCompile;
  axMat.onBeforeCompile = (sh) => {
    b0(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * vGlow;');
  };
  axMat.customProgramCacheKey = () => 'sinir-akson-v';
}
const axonMesh = new THREE.Mesh(axGeo, axMat);
neuronG.add(axonMesh);
// Na⁺ kanal açılma halkaları (veri katmanı): parlayan ince halkalar
const ringMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(0.3, 0.03, 8, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 0.7), transparent: true, opacity: 0.8, depthWrite: false }), N);
ringMesh.userData.noCast = true;
neuronG.add(ringMesh);
const fogMicro = sim.scene.fog;
const ringQ = P.map((_, i) => new THREE.Quaternion().setFromUnitVectors(ZAX, T[i]));

// Miyelin kılıfları (boğumlar arası): uçları incelen (paranodal) krem lipit sargılar, yarı saydam
const myelinG = new THREE.Group();
const myelinMat = myelinMaterial('sinir-miyelin-ana', { transparent: true, opacity: 0.62, depthWrite: false });
for (let j = 0; j < (N - 1) / NODE; j++) {
  const a = j === 0 ? 3 : j * NODE + 1, b = j * NODE + NODE - 1;
  const pts = [];
  for (let k = 0; k <= 8; k++) pts.push(curve.getPointAt((lerp(a - 0.35, b + 0.35, k / 8)) / (N - 1)));
  const sheath = new THREE.Mesh(loftTube(new THREE.CatmullRomCurve3(pts), (t) => 0.38 * (0.55 + 0.45 * Math.pow(Math.sin(Math.PI * t), 0.25)) * (1 + 0.02 * Math.sin(t * 60)), { segs: 48, radial: 24 }), myelinMat);
  sheath.renderOrder = 3;
  myelinG.add(sheath);
  // Schwann hücresi çekirdeği: sargının ortasında hafif kabarıklık
  const um = (a + b) / 2 / (N - 1), cp = curve.getPointAt(um), ct = curve.getTangentAt(um);
  const nuc = new THREE.Mesh(blobGeometry(0.16, { detail: 5, amp: 0.1, stretch: [0.6, 1.8, 0.6], seed: j }), tissue({ color: 0x7a64a8, veins: 0.1, scale: 6 }));
  nuc.position.copy(cp).add(new THREE.Vector3(0, 0.34, 0.12)); nuc.quaternion.setFromUnitVectors(UP, ct);
  myelinG.add(nuc);
}
myelinG.visible = false;
neuronG.add(myelinG);

// Soma, akson tepeciği ve dendritler: gövde + tepecik + dendrit kökleri tek dikişsiz SDF yüzey, ince dallar konik tüpler
const cellMat = membraneMat('sinir-hucre');
cellMat.emissive = new THREE.Color(0x000000);
const somaPos = P[0].clone().addScaledVector(T[0], -1.25);
const dendr = [];
{
  const rnd = seeded(7);
  const branch = (from, dir, len, r, depth, lvl) => {
    const end = from.clone().addScaledVector(dir, len);
    const mid = from.clone().lerp(end, 0.5).add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(len * 0.35));
    dendr.push({ from, mid, end, r, lvl });
    if (depth > 0) {
      for (const s of [-1, 1]) {
        const d = dir.clone().applyAxisAngle(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, 1).normalize(), s * (0.45 + rnd() * 0.3));
        branch(end, d, len * 0.72, r * 0.62, depth - 1, lvl + 1);
      }
    }
  };
  for (let k = 0; k < 6; k++) {
    const ang = Math.PI * (0.55 + (k / 5) * 1.0) + (rnd() - 0.5) * 0.3;
    const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), (rnd() - 0.5) * 0.8).normalize();
    branch(somaPos.clone().addScaledVector(dir, 0.95), dir, 1.4 + rnd() * 0.6, 0.16, 2, 0);
  }
}
{
  const A = (v) => [v.x, v.y, v.z];
  const prims = [sEllipsoid(A(somaPos), [1.1, 0.98, 0.92]), sCone(A(P[0].clone().addScaledVector(T[0], -0.95)), A(P[0].clone().addScaledVector(T[0], 0.15)), 0.55, AX_R)];
  for (const d of dendr.filter((x) => x.lvl === 0)) {
    prims.push(sCone(A(somaPos.clone().lerp(d.from, 0.6)), A(d.from), 0.42, d.r * 1.25), sCone(A(d.from), A(d.mid), d.r * 1.25, d.r * 0.95), sCone(A(d.mid), A(d.end), d.r * 0.95, d.r * 0.7));
  }
  const somaGeo = sdfMesh([{ p: prims, k: 0.35 }], { cell: LOWQ ? 0.07 : 0.05, noiseAmp: 0.03, noiseFreq: 1.6 });
  neuronG.add(new THREE.Mesh(somaGeo, cellMat));
  for (const d of dendr.filter((x) => x.lvl > 0)) {
    const c = new THREE.QuadraticBezierCurve3(d.from, d.mid, d.end);
    neuronG.add(new THREE.Mesh(loftTube(c, (t) => d.r * lerp(1.12, 0.62, t) * (d.lvl === 2 ? lerp(1, 0.4, t * t) : 1), { segs: 20, radial: 10 }), cellMat));
  }
}
const nucleus = new THREE.Mesh(blobGeometry(0.42, { detail: 8, amp: 0.08 }), tissue({ color: 0x3a2a6a, veins: 0.3, scale: 6 }));
nucleus.position.copy(somaPos).add(new THREE.Vector3(-0.2, 0.15, 0.62));
neuronG.add(nucleus);

// Akson ucu, sinaps düğmecikleri ve kas lifi
const endP = P[N - 1], endT = T[N - 1];
const boutons = [];
const boutonMat = membraneMat('sinir-bouton');
boutonMat.emissive = new THREE.Color(0x000000);
const muscleCenter = endP.clone().add(new THREE.Vector3(1.9, -0.5, 0));
for (const off of [-0.8, 0, 0.8]) {
  const b = endP.clone().addScaledVector(endT, 0.9).add(new THREE.Vector3(0, off, off * 0.3));
  const c = new THREE.QuadraticBezierCurve3(endP, endP.clone().addScaledVector(endT, 0.5), b);
  neuronG.add(new THREE.Mesh(loftTube(c, (t) => lerp(0.13, 0.09, t), { segs: 16, radial: 10 }), boutonMat));
  const s = new THREE.Mesh(blobGeometry(0.26, { detail: 8, amp: 0.1, stretch: [1.15, 0.9, 1] }), boutonMat);
  s.position.copy(b);
  neuronG.add(s);
  boutons.push(b);
}
// Çizgili kas lifi: sarkomer bantları ve miyofibril dokusu
const muscleMat = procedural({
  key: 'sinir-kas', physical: true, scale: 1, bump: 0.02,
  params: { color: 0x9f3a3a, roughness: 0.4, sheen: 0.5, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xff9a8a), clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide },
  pattern: `
    float band = 0.5 + 0.5*sin(p.x*26.0 + 0.6*vn3(p*3.0));
    float fib = vn3(vec3(p.x*1.5, p.y*28.0, p.z*28.0));
    col *= (0.66 + 0.34*smoothstep(0.25, 0.75, band)) * (0.88 + 0.22*fib);
    rough = 0.35 + 0.15*band;
    h = band*0.6 + fib*0.4;`,
});
const muscle = new THREE.Mesh(loftTube(new THREE.CatmullRomCurve3([new THREE.Vector3(-2.05, 0, 0), new THREE.Vector3(0, 0.04, 0), new THREE.Vector3(2.05, 0, 0)]),
  (t) => 0.75 * Math.pow(Math.sin(Math.PI * clamp(t, 0.001, 0.999)), 0.3) * (1 + 0.03 * Math.sin(t * 17)), { segs: 64, radial: 28, noiseAmp: 0.03, noiseFreq: 2 }), muscleMat);
muscle.position.copy(muscleCenter).add(new THREE.Vector3(0.35, 0, 0));
muscle.rotation.z = -0.35;
neuronG.add(muscle);
const VES = 30;
const vesMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 2.4, 1.6) }), VES);
vesMesh.userData.noCast = true;
const vesFrom = [], vesTo = [];
for (let k = 0; k < VES; k++) {
  vesFrom.push(boutons[k % 3].clone().add(new THREE.Vector3(rand(-0.15, 0.15), rand(-0.15, 0.15), rand(-0.15, 0.15))));
  vesTo.push(vesFrom[k].clone().add(new THREE.Vector3(rand(0.35, 0.7), rand(-0.3, 0.3), rand(-0.3, 0.3))));
  vesMesh.setMatrixAt(k, tmpM.makeScale(0, 0, 0));
}
neuronG.add(vesMesh);
// Mikroskobik doku ortamı: miyelinli lif demeti, glia, kılcal damar, kolajen, uzak hücreler, ön plan bulanıklığı
const env = buildNerveEnv(neuronG, { LOWQ });
// Kas demetinin komşu lifleri
for (const [dy, dz, s] of [[1.35, -0.9, 0.85], [-1.3, -0.6, 0.9], [0.2, -1.9, 0.95]]) {
  const f = muscle.clone(); f.scale.setScalar(s); f.position.add(new THREE.Vector3(0.6, dy, dz)); f.material = muscleMat; neuronG.add(f);
}

// Elektrotlar: uyarı için metal iğne, ölçüm için cam mikropipet (uçta renkli tutucu)
function electrode(color, glass) {
  const g = new THREE.Group();
  const dir = new THREE.Vector3(0.25, 1, 0.45).normalize();
  const prof = [[0.0, 0], [0.012, 0.05], [0.03, 0.5], [0.06, 1.5], [0.075, 2.2], [0.075, 2.35], [0.0, 2.36]].map(([r, y]) => new THREE.Vector2(r, y));
  const needle = new THREE.Mesh(new THREE.LatheGeometry(prof, 20), glass ? mat.glass({ tint: 0xdff4ff, rough: 0.05, thickness: 0.05 }) : mat.brushedMetal({ color: 0xcfd6de, scale: 20 }));
  needle.position.copy(dir).multiplyScalar(0.2);
  needle.quaternion.setFromUnitVectors(UP, dir);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.4, 20), mat.plastic({ color, gloss: 0.8 }));
  cap.position.copy(dir).multiplyScalar(2.65);
  cap.quaternion.copy(needle.quaternion);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), mat.glow({ color, intensity: 3 }));
  led.position.copy(dir).multiplyScalar(2.9);
  g.add(needle, cap, led);
  neuronG.add(g);
  return g;
}
const stimEl = electrode(0xfacc15, false);
stimEl.position.copy(P[1]);
const probeEl = electrode(0x38bdf8, true);

const lbl = (t, pos) => sim.label(t, { parent: neuronG, position: pos, className: 'plain' });
lbl('Dendritler', [somaPos.x - 2.6, somaPos.y + 2.4, 0]);
lbl('Hücre gövdesi', [somaPos.x, somaPos.y - 1.6, 0]);
lbl('Akson', [P[32].x, P[32].y + 0.95, 0]);
lbl('Sinaps', [boutons[0].x + 0.3, boutons[0].y - 0.65, 0]);
lbl('Kas lifi', [muscle.position.x + 0.4, muscle.position.y - 1.6, 0]);
lbl('⚡ Uyarı', [P[1].x + 0.6, P[1].y + 2.95, 1.1]);
const probeLbl = sim.label('Ölçüm', { parent: probeEl, position: [0.6, 2.95, 1.1], className: 'plain' });
const myelinLbl = lbl('Miyelin kılıfı', [P[44].x, P[44].y - 0.9, 0]);
const nodeLbl = lbl('Ranvier boğumu', [P[50].x + 0.3, P[50].y + 1.0, 0]);
myelinLbl.visible = nodeLbl.visible = false;

// --- Nöron durumu ---
const nst = { budget: 0, stimT0: -1e9, autoNext: 0, sample: 0, arrive: [null, null], evalAt: -1, fired: false, relT: -1e9, actT: -1e9, endHigh: false, prevProbe: -70, conducting: false };
function stimulate() {
  if (mode !== 'noron') return;
  nst.stimT0 = ax.t;
  nst.fired = false;
  nst.conducting = true;
  nst.evalAt = ax.t + 6;
}
function neuronReset() {
  ax.reset();
  Object.assign(nst, { budget: 0, stimT0: -1e9, autoNext: 0, sample: 0, evalAt: -1, fired: false, relT: -1e9, actT: -1e9, endHigh: false, conducting: false });
  vChart.clear();
}

function neuronStep(dt) {
  nst.budget = Math.min(nst.budget + dt * msPerSec.value, 4);
  const steps = Math.min(Math.floor(nst.budget / DT), 2200);
  nst.budget -= steps * DT;
  const amp = stimAmp.value, probe = probeIdx();
  let pushes = 0;
  for (let s = 0; s < steps; s++) {
    if (autoStim.value && ax.t >= nst.autoNext) { stimulate(); nst.autoNext = ax.t + autoInt.value; }
    const on = ax.t >= nst.stimT0 && ax.t < nst.stimT0 + 1;
    ax.stim[0] = ax.stim[1] = ax.stim[2] = on ? amp : 0;
    ax.step(DT);
    const t = ax.t;
    // Sinyal yayılımı ve sinaps
    if (!nst.fired && ax.V[20] > -20) nst.fired = true;
    const hi = ax.V[N - 1] > -20;
    if (hi && !nst.endHigh) {
      nst.relT = t; nst.actT = t + 0.8;
      if (nst.conducting) {
        const tt = t - nst.stimT0;
        nst.arrive[ax.myelin ? 1 : 0] = tt;
        stTime.set(`${fmt(tt, 1)} ms`, 'good');
        nst.conducting = false;
      }
    }
    nst.endHigh = hi;
    if (nst.evalAt > 0 && t >= nst.evalAt) {
      nst.evalAt = -1;
      if (!nst.fired) { sim.toast('Eşik aşılmadı: aksiyon potansiyeli oluşmadı (ya hep ya hiç)', 'warn'); stAP.set('Yok (eşik altı)', 'warn'); nst.conducting = false; }
      else stAP.set('Oluştu ✓', 'good');
    }
    if (t >= nst.sample && pushes < 60) {
      nst.sample = t + 0.1;
      vChart.push([disp(ax.V[1]), disp(ax.V[probe])]);
      pushes++;
    }
  }
}

function neuronRender() {
  const V = ax.V;
  // Akson zarı: her halkada gerilim → renk, ışıma ve kabarma (uyarılmış bölge kabarır)
  const pA = axGeo.attributes.position, cA = axGeo.attributes.color, gA = axGeo.attributes.aGlow;
  for (let j = 0; j <= TS; j++) {
    const f = (j / TS) * (N - 1), k0 = Math.floor(f), k1 = Math.min(N - 1, k0 + 1), w = f - k0;
    const v = disp(V[k0] * (1 - w) + V[k1] * w);
    vColor(v, tmpC);
    const ex = clamp((v + 62) / 90, 0, 1), r = AX_R * (1 + ex * 0.9), gl = 0.2 + 2.6 * ex;
    for (let k = 0; k <= RS; k++) {
      const q = j * (RS + 1) + k, c = axBase[q], d = axDir[q];
      pA.setXYZ(q, c.x + d.x * r, c.y + d.y * r, c.z + d.z * r);
      cA.setXYZ(q, tmpC.r, tmpC.g, tmpC.b); gA.setX(q, gl);
    }
  }
  pA.needsUpdate = cA.needsUpdate = gA.needsUpdate = true;
  for (let i = 0; i < N; i++) {
    const s = clamp(-ax.ina[i] / 250, 0, 1.25);
    ringMesh.setMatrixAt(i, tmpM.compose(P[i], ringQ[i], tmpS.setScalar(s < 0.05 ? 0.0001 : 0.6 + s * 0.6)));
  }
  ringMesh.instanceMatrix.needsUpdate = true;
  for (const [m, v] of [[cellMat, disp(V[0])], [boutonMat, disp(V[N - 1])]]) {
    vColor(v, tmpC);
    m.color.setHex(0xcfdce6).lerp(tmpC, 0.5);
    m.emissive.copy(tmpC).multiplyScalar(0.06 + 1.6 * clamp((v + 62) / 90, 0, 1));
  }
  const t = ax.t;
  // Veziküller: sinaptik aralıkta nörotransmitter salınımı
  const rel = (t - nst.relT) / 0.9;
  for (let k = 0; k < VES; k++) {
    if (rel >= 0 && rel <= 1) {
      tmpV.copy(vesFrom[k]).lerp(vesTo[k], clamp(rel * 1.3 - (k % 5) * 0.06, 0, 1));
      vesMesh.setMatrixAt(k, tmpM.makeTranslation(tmpV.x, tmpV.y, tmpV.z));
    } else vesMesh.setMatrixAt(k, tmpM.makeScale(0, 0, 0));
  }
  vesMesh.instanceMatrix.needsUpdate = true;
  const act = t >= nst.actT ? Math.exp(-(t - nst.actT) / 6) : 0;
  muscleMat.color.setHex(0x9f3a3a).lerp(tmpC.setHex(0xff6b6b), act);
  muscle.scale.set(1 - act * 0.14, 1 + act * 0.18, 1 + act * 0.18);
  // Durum
  const pv = disp(V[probeIdx()]);
  stV.set(`${fmt(pv, 0)} mV`, pv > -55 ? 'bad' : pv < -72 ? 'warn' : '');
  const d = pv - nst.prevProbe;
  nst.prevProbe = pv;
  const ph = pv > -60 ? (d >= 0 ? 'Depolarizasyon (Na⁺ girer)' : 'Repolarizasyon (K⁺ çıkar)') : pv < -71.5 ? 'Hiperpolarizasyon (dinlenmenin altında)' : 'Dinlenme';
  if (ph !== nst.phase) { nst.phase = ph; stPhase.set(`<div>Ölçüm noktasında evre: <b>${ph}</b></div>`); }
  const [u, m] = nst.arrive;
  stCmp.set(u && m ? `${fmt(u / m, 1)}×` : '—');
}

// ================= 2) REFLEKS YAYI =================
// Birim: 1 birim = 1/14 m. Cam gövde büstü (omurga, omurilik, beyin görünür), gerçek deri kol, tezgâhta elektrikli ocak.
const RS_M = 14; // birim / metre
const FLOOR_R = 3.6 - 1.405 * RS_M; // omuz y = 3.6 birim ↔ 1,405 m
const reflexG = new THREE.Group();
reflexG.visible = false;
sim.scene.add(reflexG);
const skinMat = skinMaterial({ color: 0xc8906f, scale: 1 / RS_M });
skinMat.userData.uniforms.pBump.value = 0.0016 * RS_M;
const bustMap = (g) => { g.scale(RS_M, RS_M, RS_M); g.translate(-7, 3.6 - 1.405 * RS_M, 0.38); return g; };
// Cam gövde (kolsuz büst, belden kesik)
let torso = null;
function buildBust() {
  if (torso) return;
  const geo = bustMap(sdfMesh(bodyItems(STAND, { parts: { arms: false }, floorCut: 1.0 }), { cell: LOWQ ? 0.012 : 0.009 }));
  // hayalet cam kabuk: yansımalar biçimi verir, içindeki omurilik/yollar (saydam olanlar dahil) görünür kalır
  const gm = new THREE.MeshPhysicalMaterial({ color: 0xd8ecff, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6 });
  torso = new THREE.Mesh(geo, gm);
  torso.userData.noCast = true; torso.userData.noAO = true; torso.renderOrder = 10;
  reflexG.add(torso);
}
// Kaide (büstün altı, zemine kadar)
{
  const top = 3.6 - (1.405 - 1.0) * RS_M, h = top - FLOOR_R;
  const ped = new THREE.Mesh(new RoundedBoxGeometry(5.2, h, 3.6, 4, 0.15), mat.wood({ color: 0x5b3a22, varnish: true, scale: 0.3 }));
  ped.position.set(-7, FLOOR_R + h / 2 - 0.02, 0.2);
  reflexG.add(ped);
}
// Omurilik (krem, hafif parlak), omurlar (kemik), gri cevher (ara nöron bölgesi)
const cord = new THREE.Mesh(loftTube(new THREE.CatmullRomCurve3([new THREE.Vector3(-7, -0.8, -0.6), new THREE.Vector3(-7, 3.2, -0.62), new THREE.Vector3(-7, 7.2, -0.5)]), (t) => 0.3 * (1 + 0.15 * Math.sin(t * Math.PI)), { segs: 60, radial: 20 }),
  tissue({ color: 0xe6d6c2, veins: 0.25, scale: 1.5 }));
const spineMat = mat.ceramic({ color: 0xe2d5bb });
spineMat.roughness = 0.55; spineMat.clearcoat = 0.2;
{
  const vGeo = sdfMesh([
    { p: [sEllipsoid([0, 0, 1.35], [0.62, 0.3, 0.5]), sCone([-0.55, 0, 0.75], [-0.66, 0, 0.1], 0.15, 0.15), sCone([0.55, 0, 0.75], [0.66, 0, 0.1], 0.15, 0.15), sCone([-0.66, 0, 0.1], [-0.7, 0, -0.4], 0.17, 0.15),
      sCone([0.66, 0, 0.1], [0.7, 0, -0.4], 0.17, 0.15), sCone([-0.7, 0, -0.4], [0, -0.1, -0.85], 0.15, 0.14), sCone([0.7, 0, -0.4], [0, -0.1, -0.85], 0.15, 0.14),
      sCone([0, -0.1, -0.85], [0, -0.35, -1.05], 0.16, 0.1), sCone([-0.6, 0, -0.2], [-1.25, 0.05, -0.4], 0.12, 0.07), sCone([0.6, 0, -0.2], [1.25, 0.05, -0.4], 0.12, 0.07)], k: 0.12 },
    { p: [sEllipsoid([0, 0, -0.05], [0.56, 1.0, 0.52])], k: 0.06, op: 'sub' },
  ], { cell: 0.045, noiseAmp: 0.01, noiseFreq: 4 });
  const vert = new THREE.InstancedMesh(vGeo, spineMat, 9);
  for (let k = 0; k < 9; k++) vert.setMatrixAt(k, tmpM.compose(tmpV.set(-7, 0.18 + k * 0.9, -0.6), tmpQ.identity(), tmpS.setScalar(0.6)));
  reflexG.add(vert);
}
const grey = new THREE.Mesh(blobGeometry(0.2, { detail: 8, amp: 0.06, stretch: [1.3, 1.5, 1.1] }), tissue({ color: 0x8e8aa0, veins: 0.1, scale: 6 }));
grey.position.set(-7, 3.33, -0.45);
// Beyin: kıvrımlı (girus) yüzey, sagital olarak uzun
const brainGeo = blobGeometry(1, { detail: 22, amp: 0.05, freq: 7, oct: 2 });
{ // orta yarık (iki yarımküre)
  const p = brainGeo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); const f = 1 - 0.22 * Math.exp(-(x * x) / 0.004) * THREE.MathUtils.smoothstep(y, -0.2, 0.5); p.setXYZ(i, x * f + Math.sign(x) * 0.02, y * (0.94 + 0.06 * f), p.getZ(i)); }
  brainGeo.computeVertexNormals();
}
const brain = new THREE.Mesh(brainGeo, tissue({ color: 0xe6a0a8, veins: 0.5, scale: 2.5 }));
brain.material.clearcoat = 0.7;
brain.scale.set(0.98, 0.82, 1.2);
brain.position.set(-7, 7.55, 0.02);
reflexG.add(cord, grey, brain);
// Kol: üst kol sabit, ön kol dirsekte döner (SDF deri; pazı kası anatomik katman olarak üstte)
const shoulder = new THREE.Vector3(-4.6, 3.6, 0), elbow = new THREE.Vector3(-0.8, 3.1, 0);
const A3 = (v) => [v.x, v.y, v.z];
const upperArm = new THREE.Mesh(sdfMesh([{ p: [
  sCone(A3(shoulder.clone().add(new THREE.Vector3(-0.4, 0.05, 0))), A3(elbow), 0.66, 0.5),
  sEllipsoid(A3(shoulder.clone().add(new THREE.Vector3(0.3, 0.1, 0))), [0.95, 0.72, 0.72]),
  sEllipsoid(A3(elbow.clone().add(new THREE.Vector3(-0.1, 0, -0.05))), [0.52, 0.5, 0.52]),
] , k: 0.35 }], { cell: 0.06, noiseAmp: 0.01, noiseFreq: 2 }), skinMat);
const bicepsMat = tissue({ color: 0xb24a4a, veins: 0.35, scale: 3 });
bicepsMat.clearcoat = 0.8;
const biceps = new THREE.Mesh(blobGeometry(1, { detail: 12, amp: 0.04, stretch: [1, 1, 1] }), bicepsMat);
biceps.scale.set(1.6, 0.42, 0.45);
biceps.position.copy(shoulder).lerp(elbow, 0.52).add(new THREE.Vector3(0, 0.45, 0.2));
biceps.rotation.z = Math.atan2(elbow.y - shoulder.y, elbow.x - shoulder.x);
const elbowJ = new THREE.Group(); // (dirsek kıvrımı üst kol SDF'inde)
elbowJ.position.copy(elbow);
const foreG = new THREE.Group();
foreG.position.copy(elbow);
const FORE = 4.6;
const fore = new THREE.Mesh(sdfMesh([{ p: [
  sCone([-0.1, 0, 0], [FORE * 0.45, 0.02, 0], 0.5, 0.46), sCone([FORE * 0.45, 0.02, 0], [FORE - 0.05, -0.02, 0], 0.46, 0.3),
  sEllipsoid([FORE * 0.3, 0.05, 0], [1.3, 0.42, 0.44]),
  sEllipsoid([FORE + 0.5, -0.06, 0], [0.62, 0.17, 0.44]),                                  // avuç
  ...[-0.3, -0.1, 0.1, 0.3].map((z, i) => sCone([FORE + 0.95, -0.08, z * 1.05], [FORE + 1.75 - Math.abs(i - 1.5) * 0.12, -0.2, z * 1.12], 0.1, 0.075)), // parmaklar
  sCone([FORE + 0.3, -0.05, 0.4], [FORE + 0.95, -0.14, 0.72], 0.13, 0.085),                // başparmak
], k: 0.14 }], { cell: 0.045, noiseAmp: 0.008, noiseFreq: 3 }), skinMat);
const hand = new THREE.Group();
hand.position.set(FORE + 0.55, -0.05, 0);
foreG.add(fore, hand);
reflexG.add(upperArm, biceps, elbowJ, foreG);
const ANG_DOWN = -0.5, ANG_UP = 0.35;
// Ocak: paslanmaz gövde, siyah üst yüzey, spiral rezistans (ısınınca kızarır) — tezgâh üstünde
const handWorld = () => new THREE.Vector3(FORE + 0.55, 0, 0).applyAxisAngle(ZAX, ANG_DOWN).add(elbow);
const hw = handWorld();
const stove = new THREE.Mesh(new RoundedBoxGeometry(4, 1.4, 3, 4, 0.12), mat.brushedMetal({ color: 0xb9bec4, scale: 0.4 }));
stove.position.set(hw.x, hw.y - 0.85 - 0.7, 0);
const stoveTop = new THREE.Mesh(new RoundedBoxGeometry(3.9, 0.08, 2.9, 3, 0.03), mat.plastic({ color: 0x0e0f11, gloss: 1 }));
stoveTop.position.set(hw.x, stove.position.y + 0.72, 0);
const burnerMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.45, metalness: 0.6, emissive: 0x000000, emissiveIntensity: 3 });
const spiral = new THREE.CatmullRomCurve3(Array.from({ length: 200 }, (_, i) => { const t = i / 199, a = t * Math.PI * 2 * 4.5, r = 0.18 + t * 0.78; return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r); }));
const burner = new THREE.Mesh(loftTube(spiral, () => 0.05, { segs: 600, radial: 8 }), burnerMat);
burner.position.set(hw.x, stove.position.y + 0.8, 0);
{
  const counterTop = stove.position.y - 0.7;
  const cab = new THREE.Mesh(new RoundedBoxGeometry(7, counterTop - FLOOR_R - 0.4, 4.4, 3, 0.06), mat.paintedMetal({ color: 0xe9e6df, wear: 0.05, scale: 0.3 }));
  cab.position.set(hw.x + 0.6, FLOOR_R + (counterTop - FLOOR_R - 0.4) / 2, -0.4);
  const wt = new THREE.Mesh(new RoundedBoxGeometry(7.4, 0.4, 4.8, 3, 0.05), mat.rock({ color: 0x8a8580, scale: 0.4 }));
  wt.position.set(hw.x + 0.6, counterTop - 0.2, -0.4);
  reflexG.add(cab, wt);
}
reflexG.add(stove, stoveTop, burner);

// Sinir yolları: ışıyan tüp + atım (darbe) havuzu (cam gövde içinden de görünsün diye opak)
function nervePath(points, parent, color, radius = 0.07) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.4), emissive: color, emissiveIntensity: 0.9, roughness: 0.4 });
  parent.add(new THREE.Mesh(loftTube(c, () => radius, { segs: 60, radial: 8 }), m));
  const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.8, 1.8) }), 12);
  pulses.userData.noCast = true;
  for (let k = 0; k < 12; k++) pulses.setMatrixAt(k, tmpM.makeScale(0, 0, 0));
  parent.add(pulses);
  return { c, pulses };
}
const elbowLocalTop = [0, 0.45, 0.35];
const pSensA = nervePath([[FORE + 0.8, 0.2, 0.3], [FORE / 2, 0.5, 0.45], elbowLocalTop], foreG, 0xf59e0b); // el → dirsek (ön kolla döner)
const pSensB = nervePath([[elbow.x, elbow.y + 0.45, 0.35], [-3, 3.9, 0.5], [-5.6, 3.9, 0.3], [-6.7, 3.5, -0.3]], reflexG, 0xf59e0b); // dirsek → omurilik
const pInter = nervePath([[-6.75, 3.5, -0.3], [-7.1, 3.35, -0.2], [-6.8, 3.1, -0.2]], reflexG, 0xe879f9, 0.06);
const pMotor = nervePath([[-6.8, 3.1, -0.2], [-5.8, 2.8, 0.3], [-4.8, 3.2, 0.5], [biceps.position.x, biceps.position.y + 0.1, 0.55]], reflexG, 0x22c55e);
const pAsc = nervePath([[-6.75, 3.55, -0.3], [-6.7, 5.4, -0.2], [-6.95, 6.9, 0]], reflexG, 0x8b5cf6);
const rl = (t, pos) => sim.label(t, { parent: reflexG, position: pos, className: 'plain' });
rl('Beyin', [-7, 9.0, 0]);
rl('Omurilik', [-8.4, 0.3, 0]);
rl('Duyusal nöron', [-3.2, 4.5, 0.5]);
rl('Ara nöron', [-8.3, 3.4, 0]);
rl('Motor nöron', [-5.3, 2.0, 0.5]);
rl('Kas (pazı)', [biceps.position.x + 0.9, biceps.position.y - 1.25, 0.6]);
const stoveLbl = rl('Ocak', [hw.x, stove.position.y - 1.1, 1.2]);
const stoveTLbl = rl('', [hw.x + 2.5, stove.position.y + 1.1, 0]);

// Uzunluklar (m) ve gecikmeler (ms) — yaklaşık, temsili
const L_SENS = 0.9, L_MOT = 0.35, L_ASC = 0.45, SYN = 0.8, EC = 12, PERCEIVE = 60;
const rst = { t: 0, running: false, spikes: [], nextSpike: 0, reflexAt: null, painAt: null, angle: ANG_UP, touchAt: 0, sample: 0 };
function reflexTimes() {
  const k = demyel.value ? 0.25 : 1;
  const vs = vSens.value * k, vm = vMot.value * k;
  const ts = (L_SENS / vs) * 1000;
  const tm = (L_MOT / vm) * 1000;
  const ta = (L_ASC / vs) * 1000;
  return { ts, tm, ta, tSyn: 2 * SYN, reflex: ts + 2 * SYN + tm + EC, pain: ts + SYN + ta + PERCEIVE };
}
function startReflex() {
  if (mode !== 'refleks') return;
  Object.assign(rst, { t: 0, running: true, spikes: [], nextSpike: 0, reflexAt: null, painAt: null, angle: ANG_DOWN, sample: 0 });
  rChart.clear();
  sim.hud.hide();
  if (stoveT.value < 43) sim.toast(`${fmt(stoveT.value, 0)} °C ağrı eşiğinin altında: ısı ağrı reseptörleri (~43 °C) uyarılmaz, refleks yok.`, 'warn');
}
function reflexReset() {
  Object.assign(rst, { t: 0, running: false, spikes: [], reflexAt: null, painAt: null, angle: ANG_UP });
  rChart.clear();
  for (const p of [pSensA, pSensB, pInter, pMotor, pAsc]) { for (let k = 0; k < 12; k++) p.pulses.setMatrixAt(k, tmpM.makeScale(0, 0, 0)); p.pulses.instanceMatrix.needsUpdate = true; }
}
function placePulses(path, us) {
  for (let k = 0; k < 12; k++) {
    const u = us[k];
    if (u == null || u < 0 || u > 1) path.pulses.setMatrixAt(k, tmpM.makeScale(0, 0, 0));
    else { path.c.getPointAt(u, tmpV); path.pulses.setMatrixAt(k, tmpM.makeTranslation(tmpV.x, tmpV.y, tmpV.z)); }
  }
  path.pulses.instanceMatrix.needsUpdate = true;
}
function reflexStep(dt) {
  const T0 = reflexTimes();
  const hot = stoveT.value >= 43;
  // Sıcak ocak parıltısı
  const glow = clamp((stoveT.value - 40) / 200, 0, 1);
  burnerMat.emissive.setRGB(0, 0, 0).lerp(tmpC.setHex(0xff3b1f), glow);
  if (!rst.running) return;
  const dms = dt * 25; // ağır çekim: 1 sn = 25 ms
  const onStove = rst.angle < ANG_DOWN + 0.05;
  const t = (rst.t += dms);
  // Frekans kodlaması: sıcaklık arttıkça duyusal lif daha sık ateşler
  if (hot && onStove && t >= rst.nextSpike && rst.spikes.length < 12) {
    rst.spikes.push(t);
    const f = clamp((stoveT.value - 43) * 1.5 + 20, 20, 250);
    rst.nextSpike = t + 1000 / f;
  }
  const first = rst.spikes[0];
  if (first != null) {
    if (rst.reflexAt == null && t >= first + T0.reflex) { rst.reflexAt = T0.reflex; stReflex.set(`${fmt(T0.reflex, 0)} ms`, 'good'); }
    if (rst.painAt == null && t >= first + T0.pain) {
      rst.painAt = T0.pain; stPain.set(`${fmt(T0.pain, 0)} ms`, 'warn');
      sim.toast(`"Ah!" Acı ${fmt(T0.pain, 0)} ms'de hissedildi; el ${fmt(T0.reflex, 0)} ms'de çekilmeye başlamıştı.`, 'good');
    }
  }
  // Kasılma → dirsek bükülür
  const contracting = first != null && t >= first + T0.reflex;
  if (contracting) rst.angle = Math.min(ANG_UP, rst.angle + dms * 0.012);
  const act = contracting ? clamp(1 - (t - first - T0.reflex) / 400, 0.3, 1) : 0;
  bicepsMat.color.setHex(0xb45454).lerp(tmpC.setHex(0xff4040), act);
  biceps.scale.set(1.6 - act * 0.15, 0.42 + act * 0.2, 0.45 + act * 0.12);
  // Atımların konumları
  const us = (off, dur) => rst.spikes.map((s) => (t - s - off) / dur);
  const syn1 = T0.ts, syn2 = syn1 + SYN, mot0 = syn2 + SYN;
  const fa = FORE / (FORE + shoulder.distanceTo(elbow) + 2);
  placePulses(pSensA, us(0, T0.ts * fa));
  placePulses(pSensB, us(T0.ts * fa, T0.ts * (1 - fa)));
  placePulses(pInter, us(syn1, 2 * SYN));
  placePulses(pMotor, us(mot0, T0.tm));
  placePulses(pAsc, us(syn2, T0.ta));
  brain.material.color.setHex(0xf0a3b5).lerp(tmpC.setHex(0xffe066), first != null && t >= first + T0.pain ? clamp(1 - (t - first - T0.pain) / 300, 0, 1) : 0);
  if (t >= rst.sample) {
    rst.sample = t + 1;
    const on = (a, b) => rst.spikes.some((s) => t - s >= a && t - s <= b) ? 1 : 0;
    rChart.push([on(0, T0.ts) * 3, on(mot0, mot0 + T0.tm) * 2, on(syn2, syn2 + T0.ta) * 1, act * 4]);
  }
  if (t > (first ?? 0) + Math.max(T0.pain, T0.reflex) + 600 || (!hot && t > 800)) rst.running = false;
}
function reflexRender() {
  foreG.rotation.z = rst.angle;
  const T0 = reflexTimes();
  stoveTLbl.setText(`${fmt(stoveT.value, 0)} °C`);
  stSens.set(`${fmt(T0.ts, 0)} ms`);
  stMot.set(`${fmt(T0.tm, 0)} ms`);
}

// ================= 3) TEPKİ SÜRESİ TESTİ =================
// Birim: 1 birim = 10 cm. Masada sinyal lambası (cam kubbe altında LED), büyük basma düğmesi ve sonuç sütunları.
const FLOOR_T = -7.5;
const rtG = new THREE.Group();
rtG.visible = false;
sim.scene.add(rtG);
const desk = new THREE.Mesh(new RoundedBoxGeometry(12, 0.4, 5, 4, 0.06), mat.wood({ color: 0x8a6440, varnish: true, scale: 0.35 }));
desk.position.y = -0.2;
rtG.add(desk);
for (const [x, z] of [[-5.6, -2.1], [5.6, -2.1], [-5.6, 2.1], [5.6, 2.1]]) {
  const leg = new THREE.Mesh(new RoundedBoxGeometry(0.4, -0.4 - FLOOR_T, 0.4, 2, 0.05), mat.paintedMetal({ color: 0x23272d, wear: 0.1, scale: 0.4 }));
  leg.position.set(x, (FLOOR_T - 0.4) / 2, z);
  rtG.add(leg);
}
// Lamba durumu: mantık bu rengi değiştirir; her karede LED'in ışımasına aktarılır
const lampMat = { color: new THREE.Color(0x475569) };
const lampGlow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x475569, emissiveIntensity: 0.3, roughness: 0.3 });
const lamp = new THREE.Group();
lamp.position.set(-2.6, 2.2, 0);
{
  const led = new THREE.Mesh(new THREE.SphereGeometry(1.15, 40, 28), lampGlow);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.5, 48, 32), mat.glass({ tint: 0xf4f8ff, rough: 0.12, thickness: 0.2 }));
  dome.userData.noCast = true;
  lamp.add(led, dome);
}
const lampBase = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [1.1, 0], [1.12, 0.05], [1.0, 0.5], [0.92, 0.62], [0, 0.62]].map(([r, y]) => new THREE.Vector2(r, y)), 48), mat.brushedMetal({ color: 0x3a3f46, scale: 2 }));
lampBase.position.set(-2.6, 0, 0);
const btnMat = mat.plastic({ color: 0xdc2626, gloss: 0.9 });
const pushBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.84, 0.35, 48).translate(0, 0, 0), btnMat);
pushBtn.position.set(-2.6, 0.38, 1.8);
const btnCap = new THREE.Mesh(new THREE.SphereGeometry(0.8, 40, 16, 0, Math.PI * 2, 0, 0.5), btnMat);
btnCap.position.y = 0.04; pushBtn.add(btnCap);
const btnBase = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.35, 2.2, 3, 0.12), mat.plastic({ color: 0x1b1d22, gloss: 0.4 }));
btnBase.position.set(-2.6, 0.175, 1.8);
rtG.add(lamp, lampBase, btnBase, pushBtn);
const towers = [0x38bdf8, 0xf97316].map((c, k) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1, 1.3), mat.plastic({ color: c, gloss: 0.7 }));
  m.position.set(1.6 + k * 2.2, 0.5, 0);
  rtG.add(m);
  return m;
});
const refLine = new THREE.Mesh(new THREE.BoxGeometry(5, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0x94a3b8 }));
refLine.position.set(2.7, 2.5, 0.7); // 250 ms
rtG.add(refLine);
const rtl = (t, pos, cls = 'plain') => sim.label(t, { parent: rtG, position: pos, className: cls });
rtl('~250 ms: tipik görsel tepki', [2.7, 2.8, 0.7]);
const lampLbl = rtl('Hazır', [-2.6, 4.2, 0], 'big');
const towerLbl = [rtl('—', [1.6, 1.4, 0.7]), rtl('—', [3.8, 1.4, 0.7])];
rtl('Senin ölçümün', [1.6, -0.75, 1.2]);
rtl('Değiştiricilerle', [3.8, -0.75, 1.2]);

const rt = { state: 'idle', goAt: 0, t0: 0, trial: 0, list: [], preds: [], nextAt: 0 };
const ROUND = 5;
function rtFactor() {
  const caf = 1 - Math.exp(-caff.value / 150);
  const sleepBac = Math.max(0, awake.value - 15) * 0.11 * (1 - 0.4 * caf); // uykusuzluk ≈ alkol eşdeğeri
  const age = 1 + 0.004 * Math.max(0, ageS.value - 25) + 0.015 * Math.max(0, 16 - ageS.value);
  return { total: (1 + 0.2 * alc.value) * (1 + 0.2 * sleepBac) * (1 - 0.06 * caf) * age, sleepBac, caf, age };
}
function rtArm() {
  rt.state = 'wait';
  rt.goAt = performance.now() + rand(1500, 3800);
  lampMat.color.setHex(0xdc2626);
  lampLbl.setText('Bekle…');
}
function rtStart() {
  if (mode !== 'test') return;
  rt.trial = 0;
  rt.list.length = rt.preds.length = 0;
  rtChart.clear();
  sim.hud.hide();
  rtArm();
}
function rtReset() {
  rt.state = 'idle';
  rt.list.length = rt.preds.length = 0;
  rt.trial = 0;
  lampMat.color.setHex(0x475569);
  lampLbl.setText('Hazır');
  rtChart.clear();
  towers.forEach((m) => { m.scale.y = 0.01; m.position.y = 0.005; });
  towerLbl.forEach((l) => l.setText('—'));
  stBest.set('—'); stAvg.set('—'); stPred.set('—');
}
function rtPress() {
  if (mode !== 'test') return;
  const now = performance.now();
  if (rt.state === 'wait') {
    rt.state = 'pause'; rt.nextAt = now + 1200;
    lampMat.color.setHex(0xf59e0b); lampLbl.setText('Erken!');
    sim.toast('Işık yeşile dönmeden tıkladın. Bu deneme sayılmadı.', 'bad');
  } else if (rt.state === 'go') {
    const ms = now - rt.t0;
    rt.list.push(ms);
    const f = rtFactor().total;
    rt.preds.push(ms * f);
    rtChart.push([ms, ms * f]);
    rt.trial++;
    lampMat.color.setHex(0x475569);
    lampLbl.setText(`${fmt(ms, 0)} ms`);
    btnMat.color.setHex(0x7f1d1d);
    setTimeout(() => btnMat.color.setHex(0xdc2626), 150);
    updateRtStats();
    if (rt.trial >= ROUND) { rt.state = 'idle'; rtSummary(); }
    else { rt.state = 'pause'; rt.nextAt = now + 1100; }
  } else if (rt.state === 'idle') rtStart();
}
function updateRtStats() {
  if (!rt.list.length) return;
  const avg = rt.list.reduce((a, b) => a + b, 0) / rt.list.length;
  const f = rtFactor().total;
  stBest.set(`${fmt(Math.min(...rt.list), 0)} ms`, 'good');
  stAvg.set(`${fmt(avg, 0)} ms`);
  stPred.set(`${fmt(avg * f, 0)} ms`, f > 1.15 ? 'bad' : f > 1.03 ? 'warn' : 'good');
  [avg, avg * f].forEach((v, k) => {
    const h = clamp(v / 100, 0.05, 9);
    towers[k].scale.y = h; towers[k].position.y = h / 2;
    towerLbl[k].position.y = h + 0.5;
    towerLbl[k].setText(`${fmt(v, 0)} ms`);
  });
}
function rtSummary() {
  const avg = rt.list.reduce((a, b) => a + b, 0) / rt.list.length;
  const f = rtFactor().total;
  // 100 km/sa hızla giderken tepki süresinde alınan yol
  const d0 = (100 / 3.6) * avg / 1000, d1 = (100 / 3.6) * avg * f / 1000;
  sim.hud.show(`<h2>🏁 ${ROUND} deneme bitti</h2><p>Ortalama tepki süren <b>${fmt(avg, 0)} ms</b>. Seçtiğin değiştiricilerle tahmini
    <b>${fmt(avg * f, 0)} ms</b> (×${fmt(f, 2)}).</p><p>100 km/sa hızla giden bir sürücü, fren pedalına basmadan önce
    <b>${fmt(d0, 1)} m</b> yerine <b>${fmt(d1, 1)} m</b> yol alır.</p><button class="btn primary" data-again>Tekrar dene</button>`, { tone: f > 1.1 ? 'warn' : 'good' });
  sim.hud.el.querySelector('[data-again]')?.addEventListener('click', (e) => { e.stopPropagation(); rtStart(); });
}
function rtRender() {
  const now = performance.now();
  if (rt.state === 'wait' && now >= rt.goAt) {
    rt.state = 'go'; rt.t0 = now;
    lampMat.color.setHex(0x22c55e); lampLbl.setText('ŞİMDİ!');
  } else if (rt.state === 'go' && now - rt.t0 > 2500) {
    rt.state = 'pause'; rt.nextAt = now + 800;
    lampLbl.setText('Kaçırdın');
    lampMat.color.setHex(0x475569);
  } else if (rt.state === 'pause' && now >= rt.nextAt) rtArm();
  lampGlow.emissive.copy(lampMat.color);
  lampGlow.emissiveIntensity = lampMat.color.getHex() === 0x475569 ? 0.25 : 2.6;
  const f = rtFactor();
  factorText.set(`<div>Toplam etki: <b>×${fmt(f.total, 2)}</b><br><small>Alkol ×${fmt(1 + 0.2 * alc.value, 2)} · Uykusuzluk (≈ ${fmt(f.sleepBac, 2)} promil eşdeğeri) ×${fmt(1 + 0.2 * f.sleepBac, 2)} · Kafein ×${fmt(1 - 0.06 * f.caf, 2)} · Yaş ×${fmt(f.age, 2)}</small></div>`);
}
document.getElementById('stage')?.addEventListener('pointerdown', (e) => {
  if (mode !== 'test' || e.target.closest('button, input, select, .playbar, .toasts')) return;
  rtPress();
});
window.addEventListener('keydown', (e) => { if (mode === 'test' && e.key === 'Enter' && !e.target.closest('input, select, textarea, button')) rtPress(); });

// ================= Arayüz =================
const ui = sim.ui;
let mode = 'noron';
ui.section('Kip');
const modeSel = ui.segmented({
  options: [{ value: 'noron', label: '⚡ Nöron' }, { value: 'refleks', label: '🔥 Refleks yayı' }, { value: 'test', label: '⏱️ Tepki süresi' }],
  value: 'noron', onChange: (v) => setMode(v),
});

const secN = ui.section('Uyarı ve akson');
ui.button({ label: '⚡ Uyar', variant: 'primary', onClick: stimulate });
const stimAmp = ui.slider({ label: 'Uyarı şiddeti', min: 0, max: 40, step: 0.5, value: 25, format: (v) => `${fmt(v, 1)} µA/cm²` });
const myelin = ui.toggle({ label: 'Miyelin kılıfı (sıçramalı iletim)', value: false, onChange: (v) => { ax.myelin = v; myelinG.visible = myelinLbl.visible = nodeLbl.visible = v; stTime.set('—'); } });
const diam = ui.slider({ label: 'Akson kalınlığı', min: 0.5, max: 1.5, step: 0.05, value: 1, format: (v) => `${fmt(v, 2)}×`, onInput: (v) => (ax.gcScale = v), onChange: (v) => (ax.gcScale = v) });
const probeS = ui.slider({ label: 'Ölçüm noktası', min: 5, max: 100, step: 1, value: 50, unit: '%', onInput: placeProbe, onChange: placeProbe });
const autoStim = ui.toggle({ label: 'Tekrarlı uyarı', value: false, onChange: (v) => (nst.autoNext = ax.t) });
const autoInt = ui.slider({ label: 'Uyarı aralığı', min: 2, max: 30, step: 0.5, value: 15, unit: ' ms' });
const msPerSec = ui.slider({ label: 'Ağır çekim (1 sn gerçek =)', min: 0.5, max: 10, step: 0.5, value: 3, unit: ' ms' });
ui.buttons([
  { label: 'Eşik altı', onClick: () => preset(8, false, false) },
  { label: 'Eşik üstü', onClick: () => preset(25, false, false) },
]);
ui.buttons([
  { label: 'Miyelinli', onClick: () => preset(25, true, false) },
  { label: 'Refrakter dönem', onClick: () => preset(25, false, true) },
]);
function preset(a, my, refr) {
  stimAmp.set(a); myelin.set(my, true); autoStim.set(refr); autoInt.set(refr ? 4 : 15); diam.set(1, true);
  nst.autoNext = ax.t;
  if (!refr) stimulate();
}
function probeIdx() { return clamp(Math.round((probeS.value / 100) * (N - 1)), 0, N - 1); }
function placeProbe() { probeEl.position.copy(P[probeIdx()]); }
placeProbe();

const secNS = ui.section('Ölçüm');
const stV = ui.stat({ label: 'Ölçüm noktasında gerilim' });
const stPhase = ui.text('');
const stAP = ui.stat({ label: 'Aksiyon potansiyeli' });
const stTime = ui.stat({ label: 'İletim süresi (uca)' });
const stCmp = ui.stat({ label: 'Miyelinin hız kazancı (iki kipi de dene)' });
const vChart = ui.chart({ title: 'Zar gerilimi (mV), son 30 ms', series: [{ name: 'Uyarı noktası', color: '#facc15' }, { name: 'Ölçüm noktası', color: '#38bdf8' }], yMin: -90, yMax: 50, maxPoints: 300 });

const secR = ui.section('Refleks yayı');
ui.button({ label: '✋ Elini ocağa koy', variant: 'primary', onClick: startReflex });
const stoveT = ui.slider({ label: 'Ocak sıcaklığı', min: 20, max: 250, step: 1, value: 180, unit: ' °C' });
const vSens = ui.slider({ label: 'Duyusal lif hızı', min: 2, max: 60, step: 1, value: 20, unit: ' m/s' });
const vMot = ui.slider({ label: 'Motor lif hızı', min: 10, max: 120, step: 1, value: 60, unit: ' m/s' });
const demyel = ui.toggle({ label: 'Miyelin hasarı (ör. MS)', value: false });
const secRS = ui.section('Refleks ölçümleri');
const stReflex = ui.stat({ label: 'El çekilmeye başladı' });
const stPain = ui.stat({ label: 'Acı hissedildi' });
const stSens = ui.stat({ label: 'Duyusal iletim' });
const stMot = ui.stat({ label: 'Motor iletim' });
const rChart = ui.chart({ title: 'Sinyal zaman çizelgesi (1 nokta = 1 ms)', series: [{ name: 'Duyusal', color: '#f59e0b' }, { name: 'Motor', color: '#22c55e' }, { name: 'Beyne', color: '#8b5cf6' }, { name: 'Kas', color: '#ef4444', fill: true }], yMin: 0, yMax: 4.2, maxPoints: 300, format: () => '' });

const secT = ui.section('Tepki süresi testi');
ui.button({ label: '▶ Testi başlat (5 deneme)', variant: 'primary', onClick: rtStart });
ui.text('<div>Işık <b>yeşile</b> dönünce sahnenin herhangi bir yerine tıkla (ya da Enter). Erken tıklarsan deneme sayılmaz.</div>', 'card');
const caff = ui.slider({ label: 'Kafein', min: 0, max: 400, step: 10, value: 0, format: (v) => `${fmt(v, 0)} mg${v ? ` (≈ ${fmt(v / 90, 1)} fincan kahve)` : ''}` });
const alc = ui.slider({ label: 'Kanda alkol', min: 0, max: 1.5, step: 0.05, value: 0, format: (v) => `${fmt(v, 2)} promil` });
const awake = ui.slider({ label: 'Uyanık kalınan süre', min: 8, max: 30, step: 1, value: 12, unit: ' saat' });
const ageS = ui.slider({ label: 'Yaş', min: 10, max: 85, step: 1, value: 25 });
const factorText = ui.text('', 'card');
const secTS = ui.section('Test sonuçları');
const stBest = ui.stat({ label: 'En iyi' });
const stAvg = ui.stat({ label: 'Ortalama' });
const stPred = ui.stat({ label: 'Değiştiricilerle' });
const rtChart = ui.chart({ title: 'Deneme başına tepki süresi (ms)', series: [{ name: 'Senin ölçümün', color: '#38bdf8' }, { name: 'Değiştiricilerle', color: '#f97316' }], yMin: 0, maxPoints: 30 });
[caff, alc, awake, ageS].forEach((s) => { const el = s.input; el.addEventListener('input', updateRtStats); });

const SECS = { noron: [secN, secNS], refleks: [secR, secRS], test: [secT, secTS] };
const CAMS = { noron: [[-9.8, 3.4, 13.8], [0.6, 0.1, -0.8]], refleks: [[-1.2, 4.6, 19], [-1.2, 4.2, 0]], test: [[0.6, 5, 12.5], [0.6, 1.6, 0]] };
function setMode(v) {
  mode = v;
  neuronG.visible = v === 'noron';
  reflexG.visible = v === 'refleks';
  rtG.visible = v === 'test';
  // Ortam: nöron = koyu sıvı ortam (sis + parçacık), diğerleri = stüdyo (zemin sahnenin ölçeğine göre)
  const micro = v === 'noron';
  if (!micro && v === 'refleks') buildBust();
  medium.bg.visible = micro; if (medium.motes) medium.motes.visible = micro;
  sim.scene.fog = micro ? fogMicro : null;
  sim.scene.background = micro ? fogMicro.color : studioBg;
  if (sim.sky && sim.sky.mesh) { sim.sky.mesh.visible = !micro; sim.sky.mesh.position.y = v === 'refleks' ? FLOOR_R : FLOOR_T; }
  for (const [k, list] of Object.entries(SECS)) list.forEach((s) => (s.parentElement.style.display = k === v ? '' : 'none'));
  sim.hud.hide();
  fitCamera(true);
  if (v === 'test') { rtReset(); sim.hud.show('<h2>⏱️ Tepki süresi testi</h2><p>"Testi başlat"a bas. Işık kırmızıyken bekle, <b>yeşile</b> döndüğü an sahneye tıkla.</p>'); }
  if (v === 'refleks') reflexReset();
}
// Kadrajı en-boy oranına göre ayarla (dar ekranda geri çekil)
let lastAspect = 0;
function fitCamera(force) {
  const a = sim.camera.aspect || 1;
  if (!force && Math.abs(a - lastAspect) < 0.02) return;
  lastAspect = a;
  const [p, t] = CAMS[mode];
  const k = a < 1.15 ? Math.min(2.2, 1.15 / a) : 1;
  sim.moveCamera([t[0] + (p[0] - t[0]) * k, t[1] + (p[1] - t[1]) * k, t[2] + (p[2] - t[2]) * k], t);
}

sim.formatTime = () => (mode === 'noron' ? `${fmt(ax.t, 1)} ms` : mode === 'refleks' ? `${fmt(rst.t, 0)} ms` : `Deneme ${Math.min(rt.trial + 1, ROUND)}/${ROUND}`);
sim.onUpdate((dt) => {
  if (mode === 'noron') neuronStep(dt);
  else if (mode === 'refleks') reflexStep(dt);
});
sim.onRender((rdt) => {
  fitCamera(false);
  if (mode === 'noron') { neuronRender(); env.update(sim.paused ? 0 : rdt); }
  else if (mode === 'refleks') reflexRender();
  else rtRender();
});
sim.onReset(() => {
  if (mode === 'noron') { neuronReset(); stTime.set('—'); stAP.set('—'); }
  else if (mode === 'refleks') { reflexReset(); stReflex.set('—'); stPain.set('—'); }
  else rtReset();
});
// Mikroskobik görünümde pozlama biraz açılır (koyu sıvı ortam)
{
  const base = sim.sky.exposure.bind(sim.sky);
  sim.sky.exposure = () => base() * (mode === 'noron' ? 1.45 : 1);
}
setMode('noron');
stimulate();
