// Sinir Sinyali — Hodgkin–Huxley aksonda aksiyon potansiyeli, miyelin (sıçramalı iletim), refleks yayı ve tepki süresi testi.
import { createSim, THREE, clamp, lerp, rand, fmt, seeded } from '@core';
import { createAxon, SHIFT } from './hh.js';

const sim = createSim({
  background: 0x070b16,
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
sim.scene.add(new THREE.AmbientLight(0x8899cc, 0.5));

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
const N = 81, NODE = 10, DT = 0.0016;
const ax = createAxon({ n: N, nodeEvery: NODE, phi: 2 });
const neuronG = new THREE.Group();
sim.scene.add(neuronG);

const curve = new THREE.CatmullRomCurve3([[-6.2, 2.3, 0], [-3.2, 2.7, 0.4], [0, 0.9, 0], [3.2, -1.3, -0.4], [6.4, -1.5, 0]].map((p) => new THREE.Vector3(...p)));
const segLen = curve.getLength() / (N - 1);
const P = [], T = [];
for (let i = 0; i < N; i++) { P.push(curve.getPointAt(i / (N - 1))); T.push(curve.getTangentAt(i / (N - 1))); }

const axonMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.17, segLen * 1.15, 10), new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
const ringMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(0.3, 0.045, 6, 18), new THREE.MeshBasicMaterial({ color: 0xfff176, transparent: true, opacity: 0.75 }), N);
for (let i = 0; i < N; i++) {
  tmpQ.setFromUnitVectors(UP, T[i]);
  axonMesh.setMatrixAt(i, tmpM.compose(P[i], tmpQ, tmpS.set(1, 1, 1)));
  axonMesh.setColorAt(i, vColor(-70, tmpC));
}
neuronG.add(axonMesh, ringMesh);
const ringQ = P.map((_, i) => new THREE.Quaternion().setFromUnitVectors(ZAX, T[i]));

// Miyelin kılıfları (boğumlar arası)
const myelinG = new THREE.Group();
const myelinMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.55, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
for (let j = 0; j < (N - 1) / NODE; j++) {
  const a = j === 0 ? 3 : j * NODE + 1, b = j * NODE + NODE - 1;
  const pts = [];
  for (let k = 0; k <= 8; k++) pts.push(curve.getPointAt((lerp(a - 0.35, b + 0.35, k / 8)) / (N - 1)));
  myelinG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.38, 14, false), myelinMat));
}
myelinG.visible = false;
neuronG.add(myelinG);

// Soma, akson tepeciği ve dendritler (renk somadaki gerilimi izler)
const cellMat = new THREE.MeshLambertMaterial({ color: 0x2f6fe0 });
const somaPos = P[0].clone().addScaledVector(T[0], -1.25);
const soma = new THREE.Mesh(new THREE.SphereGeometry(1.1, 32, 20), cellMat);
soma.position.copy(somaPos);
const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshLambertMaterial({ color: 0x1e1b4b }));
nucleus.position.copy(somaPos).add(new THREE.Vector3(-0.2, 0.15, 0.75));
const hillock = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.55, 0.7, 14), cellMat);
hillock.position.copy(P[0]).addScaledVector(T[0], -0.4);
hillock.quaternion.setFromUnitVectors(UP, T[0]);
neuronG.add(soma, nucleus, hillock);
{
  const rnd = seeded(7);
  const branch = (from, dir, len, r, depth) => {
    const end = from.clone().addScaledVector(dir, len);
    const mid = from.clone().lerp(end, 0.5).add(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(len * 0.35));
    const c = new THREE.QuadraticBezierCurve3(from, mid, end);
    neuronG.add(new THREE.Mesh(new THREE.TubeGeometry(c, 10, r, 7, false), cellMat));
    if (depth > 0) {
      for (const s of [-1, 1]) {
        const d = dir.clone().applyAxisAngle(new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, 1).normalize(), s * (0.45 + rnd() * 0.3));
        branch(end, d, len * 0.72, r * 0.62, depth - 1);
      }
    }
  };
  for (let k = 0; k < 6; k++) {
    const ang = Math.PI * (0.55 + (k / 5) * 1.0) + (rnd() - 0.5) * 0.3;
    const dir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), (rnd() - 0.5) * 0.8).normalize();
    branch(somaPos.clone().addScaledVector(dir, 0.95), dir, 1.4 + rnd() * 0.6, 0.16, 2);
  }
}

// Akson ucu, sinaps düğmecikleri ve kas lifi
const endP = P[N - 1], endT = T[N - 1];
const boutons = [];
const boutonMat = new THREE.MeshLambertMaterial({ color: 0x2f6fe0 });
const muscleCenter = endP.clone().add(new THREE.Vector3(1.9, -0.5, 0));
for (const off of [-0.8, 0, 0.8]) {
  const b = endP.clone().addScaledVector(endT, 0.9).add(new THREE.Vector3(0, off, off * 0.3));
  const c = new THREE.QuadraticBezierCurve3(endP, endP.clone().addScaledVector(endT, 0.5), b);
  neuronG.add(new THREE.Mesh(new THREE.TubeGeometry(c, 8, 0.09, 6, false), boutonMat));
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), boutonMat);
  s.position.copy(b);
  neuronG.add(s);
  boutons.push(b);
}
function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 16;
  const g = c.getContext('2d');
  for (let x = 0; x < 128; x += 8) { g.fillStyle = x % 16 ? '#f0b8b0' : '#ffffff'; g.fillRect(x, 0, 8, 16); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
  return t;
}
const muscleMat = new THREE.MeshLambertMaterial({ color: 0x9f3a3a, map: stripeTexture() });
const muscle = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 2.6, 6, 16), muscleMat);
muscle.position.copy(muscleCenter).add(new THREE.Vector3(0.35, 0, 0));
muscle.rotation.z = Math.PI / 2 - 0.35;
neuronG.add(muscle);
const VES = 30;
const vesMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xa7f3d0 }), VES);
const vesFrom = [], vesTo = [];
for (let k = 0; k < VES; k++) {
  vesFrom.push(boutons[k % 3].clone().add(new THREE.Vector3(rand(-0.15, 0.15), rand(-0.15, 0.15), rand(-0.15, 0.15))));
  vesTo.push(vesFrom[k].clone().add(new THREE.Vector3(rand(0.35, 0.7), rand(-0.3, 0.3), rand(-0.3, 0.3))));
  vesMesh.setMatrixAt(k, tmpM.makeScale(0, 0, 0));
}
neuronG.add(vesMesh);

// Elektrotlar
function electrode(color) {
  const g = new THREE.Group();
  const dir = new THREE.Vector3(0.25, 1, 0.45).normalize();
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.07, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.6, roughness: 0.3 }));
  needle.position.copy(dir).multiplyScalar(1.1 + 0.2);
  needle.quaternion.setFromUnitVectors(UP, dir);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color }));
  cap.position.copy(dir).multiplyScalar(2.5);
  g.add(needle, cap);
  neuronG.add(g);
  return g;
}
const stimEl = electrode(0xfacc15);
stimEl.position.copy(P[1]);
const probeEl = electrode(0x38bdf8);

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
  for (let i = 0; i < N; i++) {
    const v = disp(V[i]);
    axonMesh.setColorAt(i, vColor(v, tmpC));
    const r = 1 + clamp((v + 62) / 90, 0, 1) * 0.9; // uyarılmış bölge kabarır
    tmpQ.setFromUnitVectors(UP, T[i]);
    axonMesh.setMatrixAt(i, tmpM.compose(P[i], tmpQ, tmpS.set(r, 1, r)));
    const s = clamp(-ax.ina[i] / 250, 0, 1.25);
    ringMesh.setMatrixAt(i, tmpM.compose(P[i], ringQ[i], tmpS.setScalar(s < 0.05 ? 0.0001 : 0.6 + s * 0.6)));
  }
  axonMesh.instanceColor.needsUpdate = true;
  axonMesh.instanceMatrix.needsUpdate = true;
  ringMesh.instanceMatrix.needsUpdate = true;
  vColor(disp(V[0]), cellMat.color);
  vColor(disp(V[N - 1]), boutonMat.color);
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
  muscle.scale.set(1 + act * 0.18, 1 - act * 0.14, 1 + act * 0.18);
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
const reflexG = new THREE.Group();
reflexG.visible = false;
sim.scene.add(reflexG);
const skinMat = new THREE.MeshLambertMaterial({ color: 0xd6a283 });
const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 8, 20), new THREE.MeshLambertMaterial({ color: 0xe2e8f0 }));
cord.position.set(-7, 3.2, -0.6);
const spineMat = new THREE.MeshLambertMaterial({ color: 0xa8a29e, transparent: true, opacity: 0.35, depthWrite: false });
for (let k = 0; k < 9; k++) {
  const v = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.6, 16, 1, true), spineMat);
  v.position.set(-7, -0.4 + k * 0.9, -0.6);
  reflexG.add(v);
}
const grey = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), new THREE.MeshLambertMaterial({ color: 0x9ca3af }));
grey.scale.set(1.2, 1.6, 1.2);
grey.position.set(-7, 3.4, -0.3);
const brain = new THREE.Mesh(new THREE.SphereGeometry(1.6, 28, 20), new THREE.MeshLambertMaterial({ color: 0xf0a3b5 }));
brain.scale.set(1.35, 1, 1.1);
brain.position.set(-7, 8.9, -0.6);
reflexG.add(cord, grey, brain);
const torso = new THREE.Mesh(new THREE.CapsuleGeometry(1.7, 5.2, 6, 20), new THREE.MeshLambertMaterial({ color: 0xd6a283, transparent: true, opacity: 0.13, depthWrite: false }));
torso.position.set(-7, 2.4, -0.6);
reflexG.add(torso);
// Kol: üst kol sabit, ön kol dirsekte döner
const shoulder = new THREE.Vector3(-5.2, 3.6, 0), elbow = new THREE.Vector3(-0.8, 3.1, 0);
const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, shoulder.distanceTo(elbow), 16), skinMat);
upperArm.position.copy(shoulder).lerp(elbow, 0.5);
upperArm.quaternion.setFromUnitVectors(UP, tmpV.subVectors(elbow, shoulder).normalize());
const bicepsMat = new THREE.MeshLambertMaterial({ color: 0xb45454 });
const biceps = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), bicepsMat);
biceps.scale.set(1.6, 0.42, 0.45);
biceps.position.copy(shoulder).lerp(elbow, 0.52).add(new THREE.Vector3(0, 0.45, 0.2));
biceps.rotation.z = Math.atan2(elbow.y - shoulder.y, elbow.x - shoulder.x);
const elbowJ = new THREE.Mesh(new THREE.SphereGeometry(0.58, 16, 12), skinMat);
elbowJ.position.copy(elbow);
const foreG = new THREE.Group();
foreG.position.copy(elbow);
const FORE = 4.6;
const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, FORE, 14), skinMat);
fore.rotation.z = Math.PI / 2;
fore.position.x = FORE / 2;
const hand = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 0.9), skinMat);
hand.position.set(FORE + 0.55, -0.05, 0);
foreG.add(fore, hand);
reflexG.add(upperArm, biceps, elbowJ, foreG);
const ANG_DOWN = -0.5, ANG_UP = 0.35;
// Ocak
const stove = new THREE.Mesh(new THREE.BoxGeometry(4, 1.4, 3), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 }));
const handWorld = () => new THREE.Vector3(FORE + 0.55, 0, 0).applyAxisAngle(ZAX, ANG_DOWN).add(elbow);
const hw = handWorld();
stove.position.set(hw.x, hw.y - 0.85 - 0.7, 0);
const burnerMat = new THREE.MeshBasicMaterial({ color: 0x3f3f46 });
const burner = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 28), burnerMat);
burner.position.set(hw.x, stove.position.y + 0.76, 0);
reflexG.add(stove, burner);

// Sinir yolları: eğri + tüp + atım (darbe) havuzu
function nervePath(points, parent, color, radius = 0.07) {
  const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  parent.add(new THREE.Mesh(new THREE.TubeGeometry(c, 40, radius, 6, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55 })));
  const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff7c2 }), 12);
  for (let k = 0; k < 12; k++) pulses.setMatrixAt(k, tmpM.makeScale(0, 0, 0));
  parent.add(pulses);
  return { c, pulses };
}
const elbowLocalTop = [0, 0.45, 0.35];
const pSensA = nervePath([[FORE + 0.8, 0.2, 0.3], [FORE / 2, 0.5, 0.45], elbowLocalTop], foreG, 0xf59e0b); // el → dirsek (ön kolla döner)
const pSensB = nervePath([[elbow.x, elbow.y + 0.45, 0.35], [-3, 3.9, 0.5], [-5.6, 3.9, 0.3], [-6.7, 3.5, -0.3]], reflexG, 0xf59e0b); // dirsek → omurilik
const pInter = nervePath([[-6.75, 3.5, -0.3], [-7.1, 3.35, -0.2], [-6.8, 3.1, -0.2]], reflexG, 0xe879f9, 0.06);
const pMotor = nervePath([[-6.8, 3.1, -0.2], [-5.8, 2.8, 0.3], [-4.8, 3.2, 0.5], [biceps.position.x, biceps.position.y + 0.1, 0.55]], reflexG, 0x22c55e);
const pAsc = nervePath([[-6.75, 3.55, -0.3], [-6.6, 6, 0], [-6.9, 8.1, 0]], reflexG, 0x8b5cf6);
const rl = (t, pos) => sim.label(t, { parent: reflexG, position: pos, className: 'plain' });
rl('Beyin', [-7, 10.9, 0]);
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
  burnerMat.color.setHex(0x3f3f46).lerp(tmpC.setHex(0xff3b1f), glow);
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
const rtG = new THREE.Group();
rtG.visible = false;
sim.scene.add(rtG);
const desk = new THREE.Mesh(new THREE.BoxGeometry(12, 0.4, 5), new THREE.MeshStandardMaterial({ color: 0x7c5a3c, roughness: 0.8 }));
desk.position.y = -0.2;
const lampMat = new THREE.MeshBasicMaterial({ color: 0x475569 });
const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.5, 32, 20), lampMat);
lamp.position.set(-2.6, 2.2, 0);
const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.6, 24), new THREE.MeshStandardMaterial({ color: 0x1f2937 }));
lampBase.position.set(-2.6, 0.3, 0);
const btnMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
const pushBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.35, 28), btnMat);
pushBtn.position.set(-2.6, 0.18, 1.8);
const btnBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 2.2), new THREE.MeshStandardMaterial({ color: 0x111827 }));
btnBase.position.set(-2.6, 0.1, 1.8);
rtG.add(desk, lamp, lampBase, btnBase, pushBtn);
const towers = [0x38bdf8, 0xf97316].map((c, k) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1, 1.3), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
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
const CAMS = { noron: [[-0.4, 0.6, 27.5], [-0.4, 0.4, 0]], refleks: [[-1.2, 4.6, 19], [-1.2, 4.2, 0]], test: [[0.6, 5, 12.5], [0.6, 1.6, 0]] };
function setMode(v) {
  mode = v;
  neuronG.visible = v === 'noron';
  reflexG.visible = v === 'refleks';
  rtG.visible = v === 'test';
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
sim.onRender(() => {
  fitCamera(false);
  if (mode === 'noron') neuronRender();
  else if (mode === 'refleks') reflexRender();
  else rtRender();
});
sim.onReset(() => {
  if (mode === 'noron') { neuronReset(); stTime.set('—'); stAP.set('—'); }
  else if (mode === 'refleks') { reflexReset(); stReflex.set('—'); stPain.set('—'); }
  else rtReset();
});
setMode('noron');
stimulate();
