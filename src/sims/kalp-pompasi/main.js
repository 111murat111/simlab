// Kalp Pompası — 4 odacıklı kesit kalp: zamanla değişen elastans modeli, kapaklar, kan akışı, EKG, basınç ve P-V döngüsü.
import { createSim, THREE, clamp, lerp, fmt } from '@core';
import { createHeartModel } from './model.js';

const sim = createSim({
  background: 0x0b0f1c,
  camera: { position: [0.35, 0.25, 8.6], target: [0.35, 0.25, 0], fov: 45 },
  controls: { minDistance: 3.5, maxDistance: 18, maxPolarAngle: Math.PI * 0.85, minPolarAngle: Math.PI * 0.15 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Kalbin önden kesit görünümü. Ekranın <b>solu hastanın sağıdır</b>: sağ kulakçık ve sağ karıncık solda, sol kalp sağda.
    <b style="color:#60a5fa">Mavi</b> parçacıklar oksijeni azalmış kanı (vena kava → sağ kulakçık → sağ karıncık → pulmoner arter → akciğer),
    <b style="color:#f87171">kırmızı</b> parçacıklar oksijenli kanı (pulmoner venler → sol kulakçık → sol karıncık → aort → vücut) gösterir.</p>
    <p>Her atım üç evreden geçer: <b>atriyal sistol</b> (kulakçıklar kasılıp karıncıkları doldurur, EKG'de P dalgası),
    <b>ventriküler sistol</b> (karıncıklar kasılır; AV kapaklar kapanır, aort ve pulmoner kapaklar açılır, QRS'den T'ye) ve
    <b>diyastol</b> (karıncıklar gevşer ve dolar).</p>
    <h3>Dene</h3>
    <ul>
      <li>Nabzı 40'tan 180'e çıkar: dolum süresi kısalır, atım hacmi düşer ama debi bir süre artar.</li>
      <li>"Egzersiz" hazır ayarında debinin nasıl 2 katına çıktığını izle.</li>
      <li>Aort darlığını artır: sol karıncık basıncı aorttan çok daha yükseğe çıkar (basınç farkı), P-V döngüsü uzar.</li>
      <li>Mitral yetmezliğinde sistolde kırmızı kanın sol kulakçığa geri kaçtığını ve "ileri" atım hacminin düştüğünü gör.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p>Sol karıncık "zamanla değişen elastans" (P = E(t)·(V − V₀)) ile, atardamarlar Windkessel modeliyle, kapak akışları
    Bernoulli bağıntısıyla (ΔP ≈ 4v²) hesaplanır. Sağ kalp aynı zamanlamayla basitleştirilmiş olarak gösterilir.
    Sayılar eğitim amaçlı yaklaşık değerlerdir; <b>tıbbi tanı veya tedavi için kullanılamaz</b>.</p>`,
});
sim.formatTime = (t) => `${fmt(t, 1)} s`;

const model = createHeartModel();
const M = model.s, P = model.p;

// --- Işık ---
sim.scene.add(new THREE.AmbientLight(0x404a66, 1.2));
const rim = new THREE.DirectionalLight(0xffc8c8, 1.2);
rim.position.set(-6, 4, 3);
sim.scene.add(rim);

// --- Odacıklar ---
const H = new THREE.Group();
sim.scene.add(H);
const MUSCLE = 0xb3343d, CUT = 0x8e2733;
const CH = {
  RA: { name: 'Sağ kulakçık', pivot: [-0.8, 0.2], rot: 0.35, rx: 0.72, ry: 0.78, dir: 1, wall: 0.9, side: 'R', z: 0.0,
    info: 'Vücuttan dönen oksijeni azalmış kanı üst ve alt ana toplardamardan (vena kava) toplar. Ortalama basınç yaklaşık 2–8 mmHg. Kalbin doğal pili olan SA düğümü buradadır.' },
  RV: { name: 'Sağ karıncık', pivot: [-0.8, 0.2], rot: -0.12, rx: 0.8, ry: 1.2, dir: -1, wall: 0.87, side: 'R', z: 0.01,
    info: 'Kanı pulmoner artere, yani akciğerlere pompalar. Sistolik basıncı yalnızca ~15–30 mmHg olduğu için duvarı incedir.' },
  LA: { name: 'Sol kulakçık', pivot: [0.78, 0.38], rot: -0.3, rx: 0.68, ry: 0.58, dir: 1, wall: 0.9, side: 'L', z: 0.0,
    info: 'Akciğerden pulmoner venlerle gelen oksijenli kanı toplar. Ortalama basınç ~4–12 mmHg. Yükselirse akciğerde sıvı birikebilir.' },
  LV: { name: 'Sol karıncık', pivot: [0.78, 0.38], rot: 0.18, rx: 0.82, ry: 1.35, dir: -1, wall: 0.72, side: 'L', z: 0.02,
    info: 'Kanı aort yoluyla tüm vücuda pompalar. Sistolik basıncı ~100–140 mmHg; bu yüzden duvarı en kalın odacıktır.' },
};
const clickables = [];
for (const [key, c] of Object.entries(CH)) {
  c.g = new THREE.Group();
  c.g.position.set(c.pivot[0], c.pivot[1], 0);
  c.g.rotation.z = c.rot;
  H.add(c.g);
  c.inner = new THREE.Group();
  c.g.add(c.inner);
  const cy = c.dir * c.ry, rz = Math.min(c.rx, c.ry) * 0.8;
  c.mat = new THREE.MeshStandardMaterial({ color: MUSCLE, roughness: 0.7, side: THREE.DoubleSide });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24, Math.PI, Math.PI), c.mat);
  shell.scale.set(c.rx, c.ry, rz);
  shell.position.set(0, cy, 0);
  const ring = new THREE.Mesh(new THREE.RingGeometry(c.wall, 1, 64), new THREE.MeshStandardMaterial({ color: CUT, roughness: 0.8, side: THREE.DoubleSide }));
  ring.scale.set(c.rx, c.ry, 1);
  ring.position.set(0, cy, c.z);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(c.wall, 48), new THREE.MeshBasicMaterial({ color: c.side === 'R' ? 0x2b3d86 : 0x8e1a26, transparent: true, opacity: 0.55, depthWrite: false }));
  pool.scale.set(c.rx, c.ry, 1);
  pool.position.set(0, cy, -rz * 0.55);
  c.inner.add(shell, ring, pool);
  for (const m of [shell, ring, pool]) { m.userData.info = { name: c.name, info: c.info }; clickables.push(m); }
  c.center = new THREE.Vector3(0, cy, 0);
}
// Karıncıklar arası bölme (septum) ve dış yüzey
{
  const sept = new THREE.Mesh(new THREE.BoxGeometry(0.34, 2.0, 0.55), new THREE.MeshStandardMaterial({ color: CUT, roughness: 0.8 }));
  sept.position.set(0.04, -0.85, -0.25);
  sept.rotation.z = 0.04;
  sept.userData.info = { name: 'Karıncıklar arası bölme (septum)', info: 'Sağ ve sol karıncığı ayıran kas duvarıdır; oksijenli ve oksijensiz kanın karışmasını önler. Uyarıyı ileten His demeti ve dalları buradan geçer.' };
  clickables.push(sept);
  H.add(sept);
  const back = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5c1a22, roughness: 0.85, side: THREE.DoubleSide }));
  back.scale.set(2.05, 2.25, 0.9);
  back.position.set(0.05, -0.35, -0.55);
  back.rotation.z = 0.3;
  H.add(back);
}

// --- Damarlar (yarı saydam; içinden akan kan görünsün) ---
const V3 = (a) => new THREE.Vector3(...a);
function vessel(pts, r, color, name, info) {
  const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V3)), 48, r, 16),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }));
  m.userData.info = { name, info };
  clickables.push(m);
  H.add(m);
  return m;
}
const BLUEV = 0x3b63c9, REDV = 0xd23b3b;
vessel([[-1.55, 3.2, 0], [-1.5, 2.3, 0.02], [-1.3, 1.6, 0.05]], 0.24, BLUEV, 'Üst ana toplardamar (vena kava superior)', 'Baş, boyun ve kollardan dönen kanı sağ kulakçığa getirir.');
vessel([[-1.8, -2.4, -0.75], [-1.65, -0.8, -0.55], [-1.35, 0.4, -0.15]], 0.26, BLUEV, 'Alt ana toplardamar (vena kava inferior)', 'Gövde ve bacaklardan dönen kanı sağ kulakçığa getirir.');
vessel([[-0.25, 0.5, 0.25], [-0.12, 1.5, 0.35], [0.25, 2.25, 0.3], [0.9, 2.55, 0.15], [1.7, 2.6, 0.0]], 0.2, 0x4a6fd6, 'Pulmoner arter (akciğer atardamarı)', 'Sağ karıncıktaki oksijeni azalmış kanı akciğerlere taşır. Atardamar olduğu hâlde oksijensiz kan taşıyan tek büyük damardır.');
vessel([[0.2, 2.2, 0.3], [-0.5, 2.45, -0.2], [-1.5, 2.5, -0.4]], 0.15, 0x4a6fd6, 'Pulmoner arter (sağ dal)', 'Sağ akciğere giden daldır.');
const aortaPts = [[0.35, 0.45, -0.1], [0.25, 1.5, -0.1], [0.05, 2.55, -0.2], [0.75, 3.1, -0.5], [1.45, 2.4, -0.8], [1.6, 0.6, -1.0], [1.6, -2.4, -1.0]];
vessel(aortaPts, 0.27, REDV, 'Aort (ana atardamar)', 'Sol karıncıktan çıkan oksijenli kanı tüm vücuda dağıtan en büyük atardamardır. Sistolde gerilir, diyastolde geri yaylanarak kan akışını sürdürür (Windkessel etkisi).');
vessel([[3.0, 1.35, -0.1], [2.3, 1.2, -0.05], [1.6, 1.05, 0]], 0.13, REDV, 'Pulmoner venler (akciğer toplardamarları)', 'Akciğerde oksijenlenen kanı sol kulakçığa getirir.');
vessel([[3.0, 0.7, -0.25], [2.3, 0.8, -0.15], [1.5, 0.85, -0.05]], 0.12, REDV, 'Pulmoner venler (akciğer toplardamarları)', 'Akciğerde oksijenlenen kanı sol kulakçığa getirir.');

// --- Kapaklar ---
const VALVES = {
  TV: { name: 'Triküspit kapak', pos: [-0.8, 0.2, 0.05], dir: null, from: 'RA', to: 'RV', w: 0.62, info: 'Sağ kulakçık ile sağ karıncık arasındaki üç yaprakçıklı kapaktır. Sistolde kapanarak kanın geri kaçmasını önler.' },
  MV: { name: 'Mitral kapak', pos: [0.78, 0.38, 0.05], dir: null, from: 'LA', to: 'LV', w: 0.6, info: 'Sol kulakçık ile sol karıncık arasındaki iki yaprakçıklı kapaktır. Yetmezliğinde sistolde kan sol kulakçığa geri kaçar.' },
  PV: { name: 'Pulmoner kapak', pos: [-0.25, 0.5, 0.25], dir: [0.12, 1, 0.1], w: 0.4, info: 'Sağ karıncık ile pulmoner arter arasındaki yarım ay kapaktır.' },
  AV: { name: 'Aort kapağı', pos: [0.35, 0.45, -0.1], dir: [-0.1, 1, 0], w: 0.5, info: 'Sol karıncık ile aort arasındaki yarım ay kapaktır. Darlığında (aort stenozu) karıncık kanı dar bir delikten itmek için çok yüksek basınç üretmek zorunda kalır.' },
};
const leafGeo = new THREE.BoxGeometry(1, 0.035, 0.26).translate(0.5, 0, 0);
for (const v of Object.values(VALVES)) {
  v.g = new THREE.Group();
  v.g.position.fromArray(v.pos);
  H.add(v.g);
  v.mat = new THREE.MeshStandardMaterial({ color: 0xf3e3c8, roughness: 0.5, emissive: 0x221100 });
  v.l = new THREE.Group(); v.r = new THREE.Group();
  v.l.position.x = -v.w / 2; v.r.position.x = v.w / 2;
  v.lm = new THREE.Mesh(leafGeo, v.mat); v.rm = new THREE.Mesh(leafGeo, v.mat);
  v.lm.scale.x = v.w / 2; v.rm.scale.x = -v.w / 2;
  v.l.add(v.lm); v.r.add(v.rm);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(v.w / 2, 0.035, 8, 24), new THREE.MeshStandardMaterial({ color: 0xe8d5b0, roughness: 0.6 }));
  ring.rotation.x = Math.PI / 2;
  v.g.add(v.l, v.r, ring);
  v.open = 0;
  for (const m of [v.lm, v.rm, ring]) { m.userData.info = { name: v.name, info: v.info }; clickables.push(m); }
}

// Uyarı iletim sistemi: SA ve AV düğümü
const glowMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 });
const saNode = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), glowMat(0xfff27a));
saNode.position.set(-1.28, 1.52, 0.18);
const avNode = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), glowMat(0xfff27a));
avNode.position.set(-0.28, 0.12, 0.18);
H.add(saNode, avNode);
saNode.userData.info = { name: 'SA düğümü (sinüs düğümü)', info: 'Kalbin doğal pilidir. Her atımı başlatan elektrik uyarısını üretir (EKG\'de P dalgası). Dinlenmede dakikada 60–100 uyarı çıkarır.' };
avNode.userData.info = { name: 'AV düğümü', info: 'Uyarıyı kısa bir süre (~0,1 s) geciktirerek kulakçıkların karıncıklardan önce kasılmasını sağlar (EKG\'de PR aralığı).' };
clickables.push(saNode, avNode);

// --- Etiketler ---
const labels = [];
const L = (t, pos, cls = 'plain') => { const l = sim.label(t, { parent: H, position: pos, className: cls }); labels.push(l); return l; };
L('Sağ kulakçık', [-1.35, 1.05, 0.4]); L('Sağ karıncık', [-0.95, -1.1, 0.4]);
L('Sol kulakçık', [1.2, 1.05, 0.4]); L('Sol karıncık', [1.05, -1.1, 0.4]);
L('Aort', [0.55, 3.35, -0.5]); L('Pulmoner arter', [1.25, 2.9, 0.1]); L('Vena kava', [-1.95, 3.1, 0]);
L('Pulmoner venler', [2.8, 1.65, 0]);
const vlabels = [L('Triküspit', [-1.2, 0.1, 0.35]), L('Mitral', [1.22, 0.3, 0.35]), L('Pulmoner k.', [-0.75, 0.62, 0.35]), L('Aort k.', [0.52, 0.72, 0.1])];
vlabels.forEach((l) => (l.el.style.fontSize = '10.5px', l.el.style.color = '#fde68a'));
const phaseLbl = sim.label('', { parent: H, position: [0.3, -2.95, 0], className: 'big' });

// --- Kan parçacıkları ---
// Düğüm: {w:[x,y,z]} dünya ya da {c:'LV', a, b} odacık içi (birim elips koordinatı); sp = yanal saçılma.
const RIGHT_PRE = [
  [{ w: [-1.55, 3.1, 0], sp: 0.1 }, { w: [-1.45, 2.1, 0.02], sp: 0.12 }],
  [{ w: [-1.8, -2.3, -0.7], sp: 0.12 }, { w: [-1.6, -0.6, -0.5], sp: 0.14 }],
];
const RIGHT_MAIN = [{ c: 'RA', a: -0.1, b: 0.25, sp: 0.42 }, { c: 'RA', a: 0.05, b: -0.5, sp: 0.3 }, { w: VALVES.TV.pos, sp: 0.06, gate: 'AV' },
  { c: 'RV', a: 0, b: 0.45, sp: 0.36 }, { c: 'RV', a: 0.05, b: -0.45, sp: 0.4 }, { c: 'RV', a: 0.55, b: 0.3, sp: 0.2 }, { w: VALVES.PV.pos, sp: 0.05, gate: 'SL' },
  { w: [-0.12, 1.5, 0.35], sp: 0.1 }, { w: [0.25, 2.2, 0.3], sp: 0.1 }];
const RIGHT_POST = [[{ w: [0.9, 2.53, 0.15], sp: 0.08 }, { w: [1.65, 2.6, 0.0], sp: 0.08 }], [{ w: [-0.5, 2.43, -0.2], sp: 0.07 }, { w: [-1.45, 2.5, -0.4], sp: 0.07 }]];
const LEFT_PRE = [[{ w: [2.95, 1.35, -0.1], sp: 0.06 }, { w: [2.0, 1.12, -0.03], sp: 0.07 }], [{ w: [2.95, 0.7, -0.25], sp: 0.06 }, { w: [2.0, 0.8, -0.1], sp: 0.07 }]];
const LEFT_MAIN = [{ c: 'LA', a: 0.1, b: 0.15, sp: 0.38 }, { c: 'LA', a: -0.05, b: -0.5, sp: 0.25 }, { w: VALVES.MV.pos, sp: 0.06, gate: 'AV' },
  { c: 'LV', a: 0.1, b: 0.45, sp: 0.32 }, { c: 'LV', a: 0.05, b: -0.5, sp: 0.36 }, { c: 'LV', a: -0.45, b: 0.1, sp: 0.25 }, { c: 'LV', a: -0.62, b: 0.7, sp: 0.12 },
  { w: VALVES.AV.pos, sp: 0.06, gate: 'SL' }, { w: [0.25, 1.5, -0.1], sp: 0.15 }, { w: [0.05, 2.55, -0.2], sp: 0.15 }, { w: [0.75, 3.1, -0.5], sp: 0.15 },
  { w: [1.45, 2.4, -0.8], sp: 0.15 }, { w: [1.6, 0.9, -1.0], sp: 0.15 }];
function makePaths(pres, main, posts) {
  const out = [];
  for (const a of pres) for (const b of posts) out.push([...a, ...main, ...b]);
  return out;
}
const SIDES = {
  R: { paths: makePaths(RIGHT_PRE, RIGHT_MAIN, RIGHT_POST), color: 0x5b8cff, n: 150 },
  L: { paths: makePaths(LEFT_PRE, LEFT_MAIN, [[]]), color: 0xff4a4a, n: 170 },
};
const tmpV = new THREE.Vector3();
for (const S of Object.values(SIDES)) {
  S.gAV = S.paths[0].findIndex((n) => n.gate === 'AV');
  S.gSL = S.paths[0].findIndex((n) => n.gate === 'SL');
  S.world = S.paths.map((p) => p.map(() => new THREE.Vector3()));
  S.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: S.color }), S.n);
  S.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  S.mesh.frustumCulled = false;
  H.add(S.mesh);
  S.parts = Array.from({ length: S.n }, () => spawn(S, {}, Math.random() * (S.paths[0].length - 1)));
}
function spawn(S, p, u = Math.random() * 0.8) {
  p.u = u; p.path = Math.floor(Math.random() * S.paths.length); p.j = Math.random(); p.k = Math.random();
  const v = tmpV.randomDirection().multiplyScalar(Math.cbrt(Math.random()));
  p.o = [v.x, v.y, v.z * 0.5];
  return p;
}
function updateNodes() {
  H.updateMatrixWorld(true);
  for (const S of Object.values(SIDES)) {
    S.paths.forEach((path, pi) => path.forEach((n, i) => {
      const w = S.world[pi][i];
      if (n.w) w.fromArray(n.w);
      else {
        const c = CH[n.c];
        w.set(n.a * c.rx * c.wall, c.dir * c.ry + n.b * c.ry * c.wall, 0.05);
        c.inner.localToWorld(w);
      }
    }));
  }
}
const K = 0.042; // düğüm / mL
/** vol: {in, av, back, sl, run} bu karede geçen hacimler (mL) */
function moveParticles(S, vol) {
  const last = S.paths[0].length - 1;
  const avOpen = vol.av > 0.05, slOpen = vol.sl > 0.05;
  const backFrac = vol.back > 0 ? vol.back / (vol.back + vol.sl + 1e-6) : 0;
  for (const p of S.parts) {
    let u = p.u;
    if (u < S.gAV - 1) {
      u += vol.in * K * 1.1;
      if (!avOpen) u = Math.min(u, S.gAV - 1 - 0.05 - p.j * 0.9);
    } else if (u < S.gAV) {
      u += vol.av * K;
      if (!avOpen) u = Math.min(u, S.gAV - 0.08 - p.j * 0.5);
    } else if (u < S.gSL) {
      if (vol.back > 0 && p.k < backFrac * 1.3 && u < S.gSL - 1) {
        u -= vol.back * K * 1.5; // mitral yetmezliği: geri kaçış
        u = Math.max(u, S.gAV - 1.2 - p.j * 0.6);
      } else {
        u += (vol.av * 0.9 + vol.sl) * K;
        if (!slOpen) u = Math.min(u, S.gSL - 0.1 - p.j * 1.6);
      }
    } else {
      u += (vol.sl + vol.run * 0.9) * K * 1.3;
    }
    if (u >= last) spawn(S, p);
    else p.u = u;
  }
}
const dummy = new THREE.Object3D(), A = new THREE.Vector3(), B = new THREE.Vector3();
function placeParticles(S) {
  S.parts.forEach((p, i) => {
    const path = S.paths[p.path], W = S.world[p.path];
    const i0 = Math.min(Math.floor(p.u), path.length - 2), f = p.u - i0;
    A.copy(W[i0]).lerp(W[i0 + 1], f);
    const sp = lerp(path[i0].sp, path[i0 + 1].sp, f);
    dummy.position.set(A.x + p.o[0] * sp, A.y + p.o[1] * sp, A.z + p.o[2] * sp);
    dummy.updateMatrix();
    S.mesh.setMatrixAt(i, dummy.matrix);
  });
  S.mesh.instanceMatrix.needsUpdate = true;
}

// --- EKG ---
function ecg(t) {
  const { PR, Ts } = model.timing();
  const g = (mu, w, a) => a * Math.exp(-(((t - mu) / w) ** 2));
  return g(0.05, 0.025, 0.15) + g(PR - 0.005, 0.008, -0.1) + g(PR + 0.02, 0.01, 1.2) + g(PR + 0.045, 0.01, -0.28) + g(PR + Ts * 0.82, 0.055, 0.3);
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır durumlar');
const PRESETS = {
  dinlenme: { hr: 70, contract: 1, rs: 1, av: 0, mr: 0, venTone: 1 },
  egzersiz: { hr: 150, contract: 1.5, rs: 0.48, av: 0, mr: 0, venTone: 1.35 },
  yetmezlik: { hr: 92, contract: 0.45, rs: 1.15, av: 0, mr: 0.15, venTone: 1.1 },
  as: { hr: 72, contract: 1.05, rs: 1, av: 0.9, mr: 0, venTone: 1 },
  mr: { hr: 80, contract: 1, rs: 1, av: 0, mr: 0.5, venTone: 1 },
};
const presetSeg = ui.segmented({
  options: [{ value: 'dinlenme', label: 'Dinlenme' }, { value: 'egzersiz', label: '🏃 Egzersiz' }, { value: 'yetmezlik', label: 'Kalp yetm.' }, { value: 'as', label: 'Aort darlığı' }, { value: 'mr', label: 'Mitral yetm.' }],
  value: 'dinlenme', onChange: (v) => applyPreset(v),
});
ui.section('Kalp');
const hrSl = ui.slider({ label: 'Nabız', min: 40, max: 180, step: 1, value: 70, unit: 'atım/dk', onChange: (v) => (P.hr = v) });
const ctSl = ui.slider({ label: 'Kasılma gücü (kontraktilite)', min: 0.3, max: 1.6, step: 0.05, value: 1, format: (v) => `%${Math.round(v * 100)}`, onChange: (v) => (P.contract = v) });
const rsSl = ui.slider({ label: 'Damar direnci (periferik)', min: 0.4, max: 2, step: 0.05, value: 1, format: (v) => `%${Math.round(v * 100)}`, onChange: (v) => (P.rs = 1.05 * v) });
ui.section('Kapak hastalıkları');
const avArea = (s) => 3.5 - 2.9 * s;
const asSl = ui.slider({ label: 'Aort darlığı', min: 0, max: 1, step: 0.01, value: 0,
  format: (v) => { const a = avArea(v); return v < 0.01 ? 'yok' : `${fmt(a, 1)} cm² · ${a >= 1.5 ? 'hafif' : a >= 1.0 ? 'orta' : 'ciddi'}`; },
  onChange: (v) => (P.avArea = avArea(v)) });
const mrSl = ui.slider({ label: 'Mitral yetmezliği (sızıntı alanı)', min: 0, max: 0.6, step: 0.01, value: 0,
  format: (v) => (v < 0.005 ? 'yok' : `${fmt(v, 2)} cm² · ${v < 0.2 ? 'hafif' : v < 0.4 ? 'orta' : 'ciddi'}`), onChange: (v) => (P.mrArea = v) });
ui.text('<small>Kapak alanı: normal aort kapağı ~3–4 cm²; &lt;1 cm² ciddi darlık. Mitral sızıntı alanı ≥0,4 cm² ciddi yetmezlik sayılır.</small>');

ui.section('Ölçümler');
const stHR = ui.stat({ label: 'Nabız', unit: '/dk' });
const stSV = ui.stat({ label: 'Atım hacmi (ileri)', unit: 'mL' });
const stCO = ui.stat({ label: 'Kalp debisi', unit: 'L/dk' });
const stBP = ui.stat({ label: 'Tansiyon', unit: 'mmHg' });
const stEF = ui.stat({ label: 'Ejeksiyon fraksiyonu', unit: '%' });
const stLA = ui.stat({ label: 'Sol kulakçık bas.', unit: 'mmHg' });
const stGrad = ui.stat({ label: 'Aort kapak farkı', unit: 'mmHg' });
const stRF = ui.stat({ label: 'Geri kaçan kan', unit: '%' });
const note = ui.text('', 'card');
ui.text('<small>Kalp debisi = nabız × atım hacmi. EF = (diyastol sonu − sistol sonu hacim) / diyastol sonu hacim.</small>');

ui.section('Grafikler');
const ecgChart = ui.chart({ title: 'EKG (mV)', series: [{ name: 'EKG', color: '#4ade80' }], maxPoints: 300, yMin: -0.5, yMax: 1.4, height: 80 });
const pChart = ui.chart({ title: 'Basınçlar (mmHg) — son 3 saniye', series: [{ name: 'Sol karıncık', color: '#f87171' }, { name: 'Aort', color: '#fbbf24' }, { name: 'Sol kulakçık', color: '#60a5fa' }], maxPoints: 300, yMin: 0 });
// P-V döngüsü (özel tuval)
const pvWrap = document.createElement('div');
pvWrap.className = 'chart';
pvWrap.innerHTML = '<div class="chart-title">Sol karıncık basınç–hacim döngüsü</div>';
const pvCv = document.createElement('canvas');
pvCv.style.width = '100%';
pvWrap.append(pvCv);
pvWrap.insertAdjacentHTML('beforeend', '<div class="legend"><span><i style="background:#f87171"></i>şimdiki</span><span><i style="background:#64748b"></i>normal</span><span><i style="background:#a78bfa"></i>kasılma gücü (ESPVR)</span></div>');
ui.append(pvWrap);

ui.section('Görünüm');
ui.toggle({ label: 'Kan parçacıkları', value: true, onChange: (v) => Object.values(SIDES).forEach((S) => (S.mesh.visible = v)) });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => labels.forEach((l) => (l.visible = v)) });
ui.section('Seçilen yapı');
const card = ui.text('<small>Bir odacığa, kapağa ya da damara tıkla.</small>', 'card');

function applyPreset(name) {
  const p = PRESETS[name];
  hrSl.set(p.hr, true); ctSl.set(p.contract, true); rsSl.set(p.rs, true); asSl.set(p.av, true); mrSl.set(p.mr, true);
  P.venTone = p.venTone;
}

sim.onClick(clickables, (hit) => {
  const d = hit.object.userData.info;
  if (!d) return;
  card.set(`<b>${d.name}</b><br>${d.info}`);
  sim.toast(`📍 ${d.name}`);
});

// Normal P-V döngüsü (referans)
const refLoop = (() => {
  const m = createHeartModel();
  for (let i = 0; i < 24000; i++) m.step(0.0005);
  const out = [];
  const T = 60 / m.p.hr;
  for (let t = 0; t < T; t += 0.0005) { m.step(0.0005); if (Math.round(t / 0.0005) % 8 === 0) out.push([m.s.vlv, m.s.plv]); }
  return out;
})();
const pvPts = [];
function drawPV() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = pvCv.clientWidth || 260, Hh = 150;
  if (pvCv.width !== W * dpr) { pvCv.width = W * dpr; pvCv.height = Hh * dpr; pvCv.style.height = Hh + 'px'; }
  const c = pvCv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, Hh);
  const pmax = Math.max(160, ...pvPts.map((p) => p[1] * 1.08));
  const pl = 34, pb = 16, pt = 6, pr = 6;
  const X = (v) => pl + ((W - pl - pr) * v) / 220, Y = (p) => pt + (Hh - pt - pb) * (1 - p / pmax);
  c.strokeStyle = 'rgba(148,163,184,.18)'; c.fillStyle = 'rgba(148,163,184,.8)'; c.font = '10px system-ui'; c.lineWidth = 1;
  c.textAlign = 'right'; c.textBaseline = 'middle';
  for (let i = 0; i <= 3; i++) { const p = (pmax * i) / 3; c.beginPath(); c.moveTo(pl, Y(p)); c.lineTo(W - pr, Y(p)); c.stroke(); c.fillText(fmt(p), pl - 4, Y(p)); }
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  for (const v of [0, 50, 100, 150, 200]) c.fillText(v === 200 ? '200 mL' : String(v), X(v), Hh - 3);
  // ESPVR
  c.strokeStyle = '#a78bfa'; c.setLineDash([4, 3]); c.beginPath();
  const em = 2.3 * P.contract;
  c.moveTo(X(10), Y(0)); const ve = Math.min(220, 10 + pmax / em); c.lineTo(X(ve), Y(em * (ve - 10))); c.stroke();
  c.strokeStyle = '#64748b'; c.beginPath();
  refLoop.forEach(([v, p], i) => (i ? c.lineTo(X(v), Y(p)) : c.moveTo(X(v), Y(p)))); c.closePath(); c.stroke();
  c.setLineDash([]);
  c.strokeStyle = '#f87171'; c.lineWidth = 2; c.beginPath();
  pvPts.forEach(([v, p], i) => (i ? c.lineTo(X(v), Y(p)) : c.moveTo(X(v), Y(p)))); c.stroke();
  const lp = pvPts[pvPts.length - 1];
  if (lp) { c.fillStyle = '#fff'; c.beginPath(); c.arc(X(lp[0]), Y(lp[1]), 3, 0, Math.PI * 2); c.fill(); }
}

// --- Döngü ---
const DT = 0.0005;
let chartAcc = 0, pvAcc = 0, lastBeat = -1;
const vol = { R: { in: 0, av: 0, back: 0, sl: 0, run: 0 }, L: { in: 0, av: 0, back: 0, sl: 0, run: 0 } };
sim.onUpdate((dt) => {
  const n = Math.min(1600, Math.ceil(dt / DT));
  const h = dt / n;
  for (const k of ['R', 'L']) Object.keys(vol[k]).forEach((x) => (vol[k][x] = 0));
  for (let i = 0; i < n; i++) {
    model.step(h);
    const fwd = Math.max(0, M.qmv), back = Math.max(0, -M.qmv), run = (M.pao - M.pv) / P.rs;
    vol.L.in += M.qpv * h; vol.L.av += fwd * h; vol.L.back += back * h; vol.L.sl += M.qav * h; vol.L.run += run * h;
    vol.R.in += M.qr * h; vol.R.av += fwd * h; vol.R.sl += M.qav * h; vol.R.run += M.qr * h;
    chartAcc += h; pvAcc += h;
    if (chartAcc >= 0.01) {
      chartAcc -= 0.01;
      ecgChart.push([ecg(M.t)]);
      pChart.push([M.plv, M.pao, M.pla]);
    }
    if (pvAcc >= 0.006) {
      pvAcc -= 0.006;
      pvPts.push([M.vlv, M.plv]);
      const keep = Math.round((60 / P.hr) * 1.15 / 0.006);
      if (pvPts.length > keep) pvPts.splice(0, pvPts.length - keep);
    }
  }
  vol.L.in = Math.max(0, vol.L.in);
  // Odacık boyutları hacme göre
  const kV = 1 + 0.9 * (Math.cbrt(Math.max(M.vlv, 5) / 130) - 1);
  const kA = 1 + 0.8 * (Math.cbrt(Math.max(M.vla, 5) / 60) - 1);
  CH.LV.inner.scale.setScalar(kV); CH.RV.inner.scale.setScalar(lerp(1, kV, 0.9));
  CH.LA.inner.scale.setScalar(kA); CH.RA.inner.scale.setScalar(kA);
  // Kas "kasılma" parlaması
  const act = M.ev;
  CH.LV.mat.emissive.setRGB(0.35 * act, 0.05 * act, 0.05 * act); CH.RV.mat.emissive.copy(CH.LV.mat.emissive);
  CH.LA.mat.emissive.setRGB(0.35 * M.ea, 0.05 * M.ea, 0.05 * M.ea); CH.RA.mat.emissive.copy(CH.LA.mat.emissive);
  // Kapaklar
  const avMax = 1.35 * Math.sqrt(P.avArea / 3.5);
  setValve(VALVES.MV, M.qmv > 1 ? 1.25 : M.qmv < -1 ? -0.25 - 0.4 * P.mrArea : 0, P.mrArea);
  setValve(VALVES.TV, M.qmv > 1 ? 1.25 : 0, 0);
  setValve(VALVES.AV, M.qav > 1 ? avMax : 0, 0, 1 - P.avArea / 3.5);
  setValve(VALVES.PV, M.qav > 1 ? 1.3 : 0, 0);
  // Uyarı iletimi
  const { PR, Ts } = model.timing();
  saNode.material.opacity = 0.25 + 0.75 * Math.exp(-(((M.t - 0.03) / 0.04) ** 2));
  avNode.material.opacity = 0.25 + 0.75 * Math.exp(-(((M.t - PR + 0.03) / 0.04) ** 2));
  // Evre
  const tv = M.t - PR;
  let ph;
  if (M.ea > 0.05) ph = ['Atriyal sistol', 'kulakçıklar kasılıyor · P dalgası', '#60a5fa'];
  else if (tv >= 0 && tv < Ts && M.qav > 1) ph = ['Ventriküler sistol', 'ejeksiyon: aort ve pulmoner kapak açık', '#f87171'];
  else if (tv >= 0 && tv < Ts * 0.62) ph = ['Ventriküler sistol', 'izovolümetrik kasılma · QRS, AV kapaklar kapandı', '#f87171'];
  else if (M.qmv > 1) ph = ['Diyastol', 'karıncıklar doluyor', '#4ade80'];
  else ph = ['Diyastol', 'izovolümetrik gevşeme · T dalgası', '#4ade80'];
  phaseLbl.setText(`<span style="color:${ph[2]}">● ${ph[0]}</span> <span style="font-weight:400;font-size:12px;color:#cbd5e1">${ph[1]}</span>`);
  // Parçacıklar
  moveParticles(SIDES.R, vol.R);
  moveParticles(SIDES.L, vol.L);
  if (model.beat.count !== lastBeat) { lastBeat = model.beat.count; updateStats(); }
});
function setValve(v, target, leak, calc = 0) {
  v.open = target;
  v.l.rotation.z = target;
  v.r.rotation.z = -target;
  const short = 1 - 0.55 * leak;
  v.lm.scale.x = (v.w / 2) * short; v.rm.scale.x = (-v.w / 2) * short;
  v.mat.color.setHex(0xf3e3c8).lerp(new THREE.Color(0xc9a64a), clamp(calc, 0, 1));
  v.lm.scale.y = v.rm.scale.y = 1 + 2.5 * calc;
}
// Kapak yönleri (odacık merkezlerinden)
function orientValves() {
  H.updateMatrixWorld(true);
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const v of Object.values(VALVES)) {
    let d;
    if (v.dir) d = V3(v.dir).normalize();
    else {
      A.copy(CH[v.from].center); CH[v.from].inner.localToWorld(A);
      B.copy(CH[v.to].center); CH[v.to].inner.localToWorld(B);
      d = B.sub(A).normalize();
    }
    v.g.quaternion.copy(q.setFromUnitVectors(up, d));
  }
}
orientValves();

sim.onRender(() => {
  updateNodes();
  placeParticles(SIDES.R);
  placeParticles(SIDES.L);
  if (sim.frame % 3 === 0) drawPV();
});

function updateStats() {
  const b = model.beat;
  if (b.count < 2) return;
  stHR.set(Math.round(P.hr), P.hr > 100 ? 'warn' : P.hr < 50 ? 'warn' : '');
  stSV.set(Math.round(b.fsv), b.fsv < 50 ? 'bad' : '');
  stCO.set(fmt(b.co, 1), b.co < 4 ? 'bad' : b.co > 8 ? 'good' : '');
  stBP.set(`${Math.round(b.sys)}/${Math.round(b.dia)}`, b.sys >= 140 || b.dia >= 90 ? 'warn' : b.sys < 90 ? 'bad' : '');
  stEF.set(Math.round(b.ef * 100), b.ef < 0.4 ? 'bad' : b.ef < 0.5 ? 'warn' : '');
  stLA.set(Math.round(b.laMean), b.laMean > 18 ? 'bad' : b.laMean > 13 ? 'warn' : '');
  stGrad.set(Math.round(b.grad), b.grad > 40 ? 'bad' : b.grad > 20 ? 'warn' : '');
  const rf = b.rv / (b.rv + b.fsv + 1e-6);
  stRF.set(Math.round(rf * 100), rf >= 0.5 ? 'bad' : rf >= 0.3 ? 'warn' : '');
  const msg = [];
  if (b.co < 4) msg.push('⚠️ <b>Düşük debi:</b> dokulara yeterli kan gitmeyebilir (halsizlik, baş dönmesi).');
  if (b.laMean > 18) msg.push('⚠️ <b>Sol kulakçık basıncı yüksek:</b> akciğerlerde sıvı birikimi (ödem) ve nefes darlığı riski.');
  if (b.grad > 40) msg.push('⚠️ <b>Büyük kapak basınç farkı:</b> sol karıncık darlığı aşmak için aşırı basınç üretiyor; zamanla duvarı kalınlaşır.');
  if (rf >= 0.3) msg.push(`↩️ Her atımda kanın <b>%${Math.round(rf * 100)}</b>'i sol kulakçığa geri kaçıyor; EF yüksek görünse de ileri akış azalıyor.`);
  if (b.ef < 0.4 && rf < 0.3) msg.push('⚠️ <b>Düşük EF:</b> karıncık her atımda kanın ancak küçük bir kısmını atabiliyor (kalp yetmezliği tablosu).');
  if (P.hr > 150) msg.push('⏱ Çok hızlı nabızda diyastol kısalır; karıncık dolamadığı için atım hacmi düşer.');
  if (!msg.length) msg.push('✅ Değerler normal aralıkta: debi ~4–8 L/dk, EF %50–70, tansiyon &lt;140/90.');
  note.set(msg.join('<br>') + '<div style="margin-top:4px;color:var(--muted);font-size:11px">Eğitim amaçlıdır; tıbbi tavsiye değildir. Göğüs ağrısı, bayılma ya da ani nefes darlığında 112\'yi ara.</div>');
}

sim.onReset(() => {
  model.reset();
  presetSeg.set('dinlenme');
  applyPreset('dinlenme');
  pvPts.length = 0;
  ecgChart.clear(); pChart.clear();
  for (const S of Object.values(SIDES)) S.parts.forEach((p) => spawn(S, p, Math.random() * (S.paths[0].length - 1)));
});
note.set('<small>Ölçümler ilk atımlardan sonra görünür…</small>');
