// Bağışıklık Sistemi Savaşı — mikrop çoğalması, doğuştan yanıt, B/T hücreleri, antikor, hafıza; aşı ve ikinci karşılaşma.
import { createSim, THREE, BufferGeometryUtils, fmt, clamp, instanced, seeded, TAU, mat } from '@core';
import { darkMedium, blobGeometry, loftTube, halfTube, rbcGeometry, fbm , tissue } from './bio.js';
import { createModel, KP, H, MMAX } from './model.js';

const DAYS_PER_SEC = 0.8;          // 1× hızda 1 sn = 0,8 gün
const SITE = new THREE.Vector3(2.5, 0.6, 2);   // mikrobun girdiği yer (yara)
const VESSEL_Z = -4.5, VESSEL_Y = 1.3, VESSEL_R = 1.6;

const sim = createSim({
  studio: { mood: 'lab', color: 0x4a2a32, warmth: 0.3, key: { el: 55, az: 200, power: 1.5 }, radius: 70, height: 30 },
  camera: { position: [0, 13, 16], target: [0, 0.5, 0], fov: 48 },
  controls: { maxDistance: 40, minDistance: 5 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Derideki küçük bir yaradan dokuya mikrop girdi. Arkada bir <b>kan damarı</b> var; savunma hücreleri oradan gelir.</p>
    <ul>
      <li><b style="color:#4ade80">Yeşil çubuklar</b>: bakteri · <b style="color:#c084fc">mor dikenli toplar</b>: virüs.</li>
      <li><b>Beyaz iri hücreler</b>: nötrofil ve makrofajlar (<i>doğuştan bağışıklık</i>). Hemen gelirler ama mikrobu tanımazlar;
        yalnız yavaşlatabilirler.</li>
      <li><b style="color:#60a5fa">Mavi</b>: B hücreleri, <b style="color:#2dd4bf">turkuaz</b>: T hücreleri (<i>uyarlanır bağışıklık</i>).
        Bu mikroba özel hücreler başta çok azdır; çoğalmaları zaman alır.</li>
      <li><b style="color:#fde68a">Sarı Y'ler</b>: antikorlar. B hücrelerinden üretilir, mikrobu işaretler ve etkisizleştirir.</li>
      <li><b style="color:#fbbf24">Parlak altın hücreler</b>: <b>hafıza hücreleri</b>. Enfeksiyon bitince de kalırlar.</li>
    </ul>
    <p>Ekrandaki parçacık sayıları gerçek sayılar değildir; mikrop sayısı, az sayıda mikrop da görünsün diye karekök ile ölçeklenir.</p>
    <h3>Dene</h3>
    <ul>
      <li>İlk karşılaşmayı izle, iyileşince <b>"Aynı mikropla yeniden karşılaş"</b> düğmesine bas: altın hafıza hücreleri sayesinde
        yanıt çok daha hızlı ve güçlüdür; grafikte ikinci tepe neredeyse görünmez.</li>
      <li><b>Aşılı</b> senaryosunu, aşısız ilk karşılaşma ile karşılaştır: aşı, hafıza hücrelerini mikropla hiç hasta olmadan kazandırır.</li>
      <li>Mikrobu <b>virüs</b> yap ve <b>antibiyotiği</b> aç: hiçbir şey değişmez! Antibiyotikler yalnız bakterilere etki eder.</li>
      <li>Bağışıklık zayıflığını %60 yap: mikrop daha çok çoğalır, iyileşme uzar.</li>
    </ul>
    <h3>Model</h3>
    <p>Basit bir diferansiyel denklem modeli (gün adımlı): mikrop lojistik olarak çoğalır; doğuştan hücreler, antikorlar ve T
    hücreleri onu öldürür. Uyarlanır hücreler mikrop varken katlanarak çoğalır; naif öncüller çok az olduğu için
    <b>birincil yanıt</b> gecikir (gerçekte antikorlar genellikle yaklaşık 1–2 haftada tepe yapar). Hafıza hücreleri çok daha
    fazla sayıda ve hazır olduğundan <b>ikincil yanıt</b> birkaç gün içinde yükselir. Antikorun yarı ömrü yaklaşık 3 hafta alınmıştır
    (IgG için yaklaşık değer). Antibiyotik yalnız bakteri öldürme hızına eklenir.</p>
    <p><small>Sınırlar: Tüm hızlar ve sayılar <b>temsilidir</b>, belirli bir hastalığı veya kişiyi modellemez; gün sayıları yaklaşıktır.
    Gerçek bağışıklık sistemi çok daha karmaşıktır (sitokinler, ateş, lenf düğümleri, farklı antikor türleri…).
    Hastalık ve ilaç kullanımı için her zaman doktora danışılmalıdır.</small></p>`,
});

const model = createModel();
const { s, p } = model;
sim.formatTime = () => `Gün ${fmt(s.t, 1)}`;

// --- Ortam: doku arası sıvı (koyu, kırmızımsı), derinlik sisi, süzülen parçacıklar ---
darkMedium(sim, { top: 0x3a1422, bottom: 0x0a0306, glow: 0x6a2032, glowDir: [-0.3, 0.7, -0.7], tint: 0x401a3a,
  fog: 0x14060b, density: 0.022, motes: 300, box: [50, 10, 36], center: [0, 3, 0], moteColor: 0xffc8d0, moteColor2: 0xfff0b0, moteSize: 0.12, moteOpacity: 0.25 });
const wet = (m, cc = 0.8, r = 0.2) => { m.clearcoat = cc; m.clearcoatRoughness = r; return m; };

// --- Doku ve damar ---
{
  const g = new THREE.PlaneGeometry(60, 40, 120, 80);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, Math.sin(x * 0.6) * 0.12 + Math.cos(z * 0.7) * 0.12 + fbm(x * 0.25, z * 0.25, 1.7, 3) * 0.5); }
  g.computeVertexNormals();
  sim.scene.add(new THREE.Mesh(g, wet(tissue({ color: 0x7a2a3e, veins: 0.6, scale: 0.35 }), 0.6)));
  // Doku hücreleri (epitel benzeri, bal peteği): her biri biraz farklı, ıslak yastıkçıklar
  const cellG = blobGeometry(0.8, { detail: 6, amp: 0.06, freq: 2, stretch: [1, 0.26, 1] });
  cellG.translate(0, 0.1, 0);
  const n = 220, cells = instanced(cellG, wet(tissue({ color: 0xeeb0b8, veins: 0.25, scale: 2 }), 0.9, 0.15), n);
  const nuc = instanced(blobGeometry(0.24, { detail: 4, amp: 0.1, stretch: [1, 0.55, 1] }).translate(0, 0.26, 0), wet(tissue({ color: 0x8b3a68, veins: 0.3, scale: 6 }), 0.5), n);
  cells.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  const r = seeded(2), o = new THREE.Object3D(), c = new THREE.Color();
  let k = 0;
  // Bal peteği dizilimi (epitel benzeri); yara ağzında hücre yok (doku yırtık)
  for (let row = 0; row < 9; row++) for (let col = 0; col < 22; col++) {
    if (k >= n) break;
    o.position.set(-15.5 + col * 1.44 + (row % 2) * 0.72, 0.12, -2.4 + row * 1.25);
    if (Math.hypot(o.position.x - SITE.x, o.position.z - SITE.z) < 1.25) continue;
    const sc = 0.88 + r() * 0.12;
    o.scale.set(sc, 0.8 + r() * 0.4, sc * (0.9 + r() * 0.15));
    o.rotation.y = Math.PI / 6 + r();
    o.updateMatrix();
    cells.setMatrixAt(k, o.matrix);
    cells.setColorAt(k, c.setHex(0xeeb0b8).offsetHSL((r() - 0.5) * 0.04, (r() - 0.5) * 0.1, (r() - 0.5) * 0.12));
    o.position.x += (r() - 0.5) * 0.3; o.position.z += (r() - 0.5) * 0.3;
    o.scale.setScalar(1);
    o.updateMatrix();
    nuc.setMatrixAt(k, o.matrix);
    k++;
  }
  cells.count = nuc.count = k;
  sim.scene.add(cells, nuc);
  // Kan damarı: önü kesik (içindeki alyuvarlar görünsün), et kalınlıklı, ıslak damar duvarı
  const vc = new THREE.CatmullRomCurve3([-30, -15, 0, 15, 30].map((x, i) => new THREE.Vector3(x, VESSEL_Y + [0, 0.15, 0, -0.1, 0][i], VESSEL_Z + [0, -0.3, 0, 0.25, 0][i])));
  const vessel = new THREE.Mesh(halfTube(vc, (t) => VESSEL_R * 1.12 * (1 + 0.04 * Math.sin(t * 40)), { segs: 200, radial: 32, thick: 0.14, view: [0, 0.62, 0.78], arc: 0.25 }),
    wet(tissue({ color: 0xb03a52, veins: 0.5, scale: 0.8 }), 0.9, 0.15));
  vessel.material.side = THREE.DoubleSide;
  sim.scene.add(vessel);
  // Plazma: damar içinde hafif ışıyan kırmızı pus (derinlik hissi)
  const plasma = new THREE.Mesh(loftTube(vc, () => VESSEL_R * 0.98, { segs: 120, radial: 24 }), new THREE.MeshBasicMaterial({ color: 0x5a0a18, transparent: true, opacity: 0.22, depthWrite: false }));
  plasma.userData.noCast = true; plasma.raycast = () => {};
  sim.scene.add(plasma);
}
const rbcG = rbcGeometry(0.3, 24);
const RBC = 160;
const rbc = instanced(rbcG, wet(tissue({ color: 0xc8202c, veins: 0.05, scale: 8 }), 0.7), RBC);
rbc.material.emissive = new THREE.Color(0x3a0508);
rbc.frustumCulled = false;
sim.scene.add(rbc);
const rbcData = [];
{ const r = seeded(6); for (let i = 0; i < RBC; i++) rbcData.push({ x: (r() - 0.5) * 60, a: r() * TAU, d: Math.sqrt(r()) * (VESSEL_R - 0.35), rx: r() * 6, ry: r() * 6, v: 3 + r() * 1.5 }); }

// Yara (giriş noktası): yırtık, kanamalı sığ çukur
const woundGeo = new THREE.CircleGeometry(1.25, 48, 0, TAU);
{
  const p = woundGeo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), rr = Math.hypot(x, y) / 1.25; const edge = 1 + 0.18 * fbm(Math.atan2(y, x) * 2, 0.5, 0, 2); p.setXY(i, x * edge, y * edge); p.setZ(i, -0.35 * (1 - rr * rr) + 0.05 * fbm(x * 3, y * 3, 2, 2)); }
  woundGeo.computeVertexNormals();
}
const wound = new THREE.Mesh(woundGeo, wet(tissue({ color: 0x5b0f1f, veins: 0.7, scale: 3 }), 1, 0.05));
wound.material.emissive = new THREE.Color(0x2a0208);
wound.rotation.x = -Math.PI / 2;
wound.position.set(SITE.x, 0.2, SITE.z);
sim.scene.add(wound);

// --- Parçacık sürüleri ---
const mtx = new THREE.Matrix4(), q4 = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), eul = new THREE.Euler();
function swarm(geo, mat, max, { spawn, speed = 1, jitter = 1, scale = 1, spin = 0, seed = 1 }) {
  const mesh = instanced(geo, mat, max);
  mesh.frustumCulled = false;
  mesh.count = 0;
  sim.scene.add(mesh);
  const r = seeded(seed);
  const P = Array.from({ length: max }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(r() * 6, r() * 6, r() * 6), ph: r() * TAU, sc: scale * (0.8 + r() * 0.4), alive: false }));
  const S = { mesh, P, n: 0, r };
  S.setCount = (n) => {
    n = Math.max(0, Math.min(max, Math.round(n)));
    for (let i = S.n; i < n; i++) { spawn(P[i].p, r, i); P[i].v.set(0, 0, 0); }
    S.n = n; mesh.count = n;
  };
  S.update = (dt, t, target) => {
    for (let i = 0; i < S.n; i++) {
      const q = P[i];
      const tg = target(q, i);
      if (tg) q.v.addScaledVector(pv.subVectors(tg, q.p), dt * speed);
      q.v.x += (r() - 0.5) * jitter * dt * 4; q.v.z += (r() - 0.5) * jitter * dt * 4; q.v.y += (r() - 0.5) * jitter * dt * 2;
      q.v.multiplyScalar(Math.max(0, 1 - dt * 2.2));
      q.p.addScaledVector(q.v, dt);
      q.p.y = clamp(q.p.y, 0.35, 3.2);
      if (spin) { q.rot.x += dt * spin; q.rot.y += dt * spin * 0.7; }
      q4.setFromEuler(q.rot);
      const pulse = 1 + Math.sin(t * 3 + q.ph) * 0.04;
      mtx.compose(q.p, q4, sv.setScalar(q.sc * pulse));
      mesh.setMatrixAt(i, mtx);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  return S;
}
const aroundSite = (v, r, spread = 1) => v.set(SITE.x + (r() - 0.5) * 2 * spread, 0.5 + r() * 0.8, SITE.z + (r() - 0.5) * 2 * spread);
const fromVessel = (v, r) => v.set((r() - 0.5) * 16, VESSEL_Y, VESSEL_Z + 0.4);
const glowy = (color, emi, k = 1) => { const m = wet(tissue({ color, veins: 0.15, scale: 12 }), 0.8); m.emissive = new THREE.Color(emi); m.emissiveIntensity = k; return m; };

// Bakteri: kamçılı çubuk (basil); virüs: dikenli kapsid
const bactG = BufferGeometryUtils.mergeGeometries([
  loftTube(new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.26, 0), new THREE.Vector3(0.015, 0, 0), new THREE.Vector3(0, 0.26, 0)]), (t) => 0.1 * Math.pow(Math.sin(Math.PI * clamp(t, 0.001, 0.999)), 0.35), { segs: 16, radial: 12, view: [1, 0, 0] }),
  loftTube(new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => new THREE.Vector3(Math.sin(i * 1.3) * 0.04, -0.24 - i * 0.05, Math.cos(i * 1.3) * 0.04))), () => 0.008, { segs: 24, radial: 4, view: [1, 0, 0] }),
]);
const virG = (() => {
  const parts = [blobGeometry(0.14, { detail: 3, amp: 0.05, freq: 3 }).toNonIndexed()];
  const ico = new THREE.IcosahedronGeometry(1, 0), pp = ico.attributes.position;
  for (let i = 0; i < pp.count; i += 3) {
    const d = new THREE.Vector3(pp.getX(i), pp.getY(i), pp.getZ(i)).normalize();
    const sp = new THREE.CylinderGeometry(0.012, 0.02, 0.1, 6); sp.translate(0, 0.18, 0);
    const tip = new THREE.SphereGeometry(0.03, 8, 6); tip.translate(0, 0.235, 0);
    for (const g of [sp, tip]) { g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)); g.deleteAttribute('uv'); parts.push(g.toNonIndexed()); }
  }
  return BufferGeometryUtils.mergeGeometries(parts);
})();
const MAXP = 400;
let spread = 1;
const bact = swarm(bactG, glowy(0x4ade80, 0x0f4a1c, 0.7), MAXP, { spawn: (v, r) => aroundSite(v, r, spread), jitter: 0.6, speed: 0.3, spin: 0.5, seed: 11 });
const virus = swarm(virG, glowy(0xc084fc, 0x4a1470, 0.8), MAXP, { spawn: (v, r) => aroundSite(v, r, spread), jitter: 0.8, speed: 0.3, spin: 1.2, seed: 12, scale: 1.3 });

// Nötrofil/makrofaj: fırfırlı zarlı, düzensiz iri hücre; lenfositler: mikrovillüslü küçük hücre
const innateG = blobGeometry(0.42, { detail: 8, amp: 0.14, freq: 3.2, oct: 4, stretch: [1, 0.8, 1] });
const innate = swarm(innateG, wet(tissue({ color: 0xf1f5f9, veins: 0.2, scale: 5 }), 0.7), 60, { spawn: fromVessel, speed: 1.6, jitter: 0.5, seed: 21 });
const lymG = blobGeometry(0.26, { detail: 7, amp: 0.1, freq: 9, oct: 2 });
const bcell = swarm(lymG, glowy(0x60a5fa, 0x10306a, 0.5), 50, { spawn: fromVessel, speed: 1.4, jitter: 0.6, seed: 31 });
const tcell = swarm(lymG, glowy(0x2dd4bf, 0x0d4a44, 0.5), 50, { spawn: fromVessel, speed: 1.6, jitter: 0.6, seed: 32 });
const abG = (() => { // antikor (Y): yuvarlatılmış kollar
  const arm = (a, b) => loftTube(new THREE.LineCurve3(new THREE.Vector3(...a), new THREE.Vector3(...b)), () => 0.022, { segs: 2, radial: 6, view: [0, 0, 1] });
  return BufferGeometryUtils.mergeGeometries([arm([0, -0.16, 0], [0, 0, 0]), arm([0, 0, 0], [0.085, 0.12, 0]), arm([0, 0, 0], [-0.085, 0.12, 0])]);
})();
const antibody = swarm(abG, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.7, 0.8) }), 400, {
  spawn: (v, r) => { const src = bcell.n ? bcell.P[Math.floor(r() * bcell.n)].p : null; return src ? v.copy(src) : aroundSite(v, r, 4); },
  speed: 0.25, jitter: 1.2, spin: 2, seed: 41, scale: 1.4,
});
const memory = swarm(blobGeometry(0.24, { detail: 6, amp: 0.08, freq: 7, oct: 2 }), glowy(0xfbbf24, 0xc07a00, 1.4), 24, {
  spawn: (v, r) => v.set(-6 + (r() - 0.5) * 6, 0.6 + r() * 0.6, 5 + (r() - 0.5) * 3), speed: 0.1, jitter: 0.3, seed: 51,
});
const memTarget = new THREE.Vector3(-6, 0.8, 5);

// Etiketler
const labels = [
  sim.label('🩸 Kan damarı', { position: [-9, VESSEL_Y + 2.2, VESSEL_Z], className: 'plain' }),
  sim.label('🩹 Yara', { position: [SITE.x, 1.9, SITE.z + 1.4], className: 'plain' }),
  sim.label('⭐ Hafıza hücreleri', { position: [-6, 2.2, 5], className: 'plain' }),
];

// Hedefler: hücreler mikroba (yaraya), antikorlar mikroplara, hafıza hücreleri kendi köşesine
const tgtV = new THREE.Vector3();
function pathogenTarget(q, i) { return tgtV.set(SITE.x + Math.sin(i * 1.7) * spread * 0.9, 0.6, SITE.z + Math.cos(i * 2.3) * spread * 0.9); }
function hunterTarget(q, i) {
  const pat = p.kind === 'bakteri' ? bact : virus;
  if (s.P > 0.01 && pat.n) return pat.P[i % pat.n].p;
  return tgtV.set(Math.sin(i * 2.1) * 8, 0.8, 1 + Math.cos(i * 1.3) * 3);   // devriye
}
function abTarget(q, i) {
  const pat = p.kind === 'bakteri' ? bact : virus;
  if (pat.n) return pat.P[i % pat.n].p;
  return null;
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Senaryo');
const preset = ui.segmented({
  options: [{ value: 'ilk', label: 'İlk karşılaşma' }, { value: 'asili', label: 'Aşılı' }, { value: 'zayif', label: 'Zayıf bağışıklık' }, { value: 'abx', label: 'Virüse antibiyotik?' }],
  value: 'ilk', onChange: () => { sim.reset(); sim.play(); },
});
ui.button({ label: '🦠 Aynı mikropla yeniden karşılaş', variant: 'primary', onClick: () => {
  model.expose();
  sim.toast(s.M > 0.02 ? '⭐ Hafıza hücreleri bu mikrobu tanıyor!' : '🦠 Yeni mikroplar girdi', s.M > 0.02 ? 'good' : 'warn');
} });

ui.section('🦠 Mikrop');
const kind = ui.segmented({ label: 'Mikrop türü', options: [{ value: 'bakteri', label: '🟢 Bakteri' }, { value: 'virus', label: '🟣 Virüs' }], value: 'bakteri',
  onChange: (v) => { p.kind = v; bact.setCount(0); virus.setCount(0); } });
const dose = ui.slider({ label: 'Mikrop miktarı (doz)', min: 0.05, max: 5, step: 0.05, value: 1, format: (v) => `${fmt(v, 2)} · ${v < 0.3 ? 'az' : v > 2.5 ? 'çok' : 'orta'}`, onChange: (v) => (p.dose = v) });
const growth = ui.slider({ label: 'Çoğalma hızı', min: 0.6, max: 3, step: 0.1, value: 1.6, format: (v) => `${fmt(v, 1)} /gün · ${v < 1.2 ? 'yavaş' : v > 2.2 ? 'hızlı' : 'orta'}`, onChange: (v) => (p.growth = v) });

ui.section('🛡️ Vücut ve tedavi');
const vacc = ui.toggle({ label: '💉 Aşılı (daha önce aşı olmuş)', value: false, onChange: (v) => { p.vaccinated = v; if (v) model.vaccinate(); } });
const weak = ui.slider({ label: 'Bağışıklık zayıflığı', min: 0, max: 80, step: 5, value: 0, unit: '%', onChange: (v) => (p.weak = v / 100) });
const abx = ui.toggle({ label: '💊 Antibiyotik', value: false, onChange: (v) => {
  p.antibiotic = v;
  if (v && p.kind === 'virus') sim.toast('⚠️ Antibiyotik virüslere etki etmez!', 'warn');
} });

ui.section('📊 Durum');
const stDay = ui.stat({ label: 'Enfeksiyon günü' });
const stP = ui.stat({ label: 'Mikrop yükü', unit: '%' });
const stAb = ui.stat({ label: 'Antikor (göreli)' });
const stMem = ui.stat({ label: 'Hafıza', unit: '%' });
const sickM = ui.meter({ label: 'Hastalık belirtileri (temsili)', color: '#f97316' });
const chart1 = ui.chart({ title: 'Mikrop yükü (%) ve antikor düzeyi (göreli)', series: [{ name: 'Mikrop', color: '#4ade80', fill: true }, { name: 'Antikor', color: '#fde68a' }], maxPoints: 300, yMin: 0, yMax: 100 });
const chart2 = ui.chart({ title: 'Savunma hücreleri (göreli)', series: [{ name: 'Nötrofil/makrofaj', color: '#f1f5f9' }, { name: 'B hücresi', color: '#60a5fa' }, { name: 'T hücresi', color: '#2dd4bf' }, { name: 'Hafıza', color: '#fbbf24' }], maxPoints: 300, yMin: 0, height: 100 });
const note = ui.text('', 'card');

ui.section('Görünüm', { open: false });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => labels.forEach((l) => (l.visible = v)) });
ui.buttons([
  { label: '🎥 Genel', onClick: () => sim.moveCamera([0, 13, 16], [0, 0.5, 0]) },
  { label: '🔍 Yara', onClick: () => sim.moveCamera([SITE.x + 3, 5, SITE.z + 6], [SITE.x, 0.6, SITE.z]) },
]);

// --- Hazır ayarlar ---
const PRESETS = {
  ilk: { kind: 'bakteri', vacc: false, weak: 0, abx: false, dose: 1, growth: 1.6 },
  asili: { kind: 'virus', vacc: true, weak: 0, abx: false, dose: 1, growth: 1.6 },
  zayif: { kind: 'bakteri', vacc: false, weak: 60, abx: false, dose: 1, growth: 1.6 },
  abx: { kind: 'virus', vacc: false, weak: 0, abx: true, dose: 1, growth: 1.6 },
};
let firstPeakDay = null, secondShown = false;
function load(name) {
  const P = PRESETS[name];
  kind.set(P.kind, true); vacc.set(P.vacc); p.vaccinated = P.vacc;
  weak.set(P.weak, true); abx.set(P.abx); p.antibiotic = P.abx;
  dose.set(P.dose, true); growth.set(P.growth, true);
  model.reset();
  model.expose();
  [bact, virus, innate, bcell, tcell, antibody, memory].forEach((S) => S.setCount(0));
  acc = 0; nextPush = 0; firstPeakDay = null; secondShown = false; clearedShown = false;
  chart1.clear(); chart2.clear();
  updateStats();
}

// --- Döngü ---
let acc = 0, nextPush = 0, clearedShown = false;
sim.onUpdate((dt) => {
  acc += dt * DAYS_PER_SEC;
  while (acc >= H) { model.step(); acc -= H; }
  if (s.t >= nextPush) {
    nextPush = s.t + 0.2;
    chart1.push([(s.P / KP) * 100, Math.min(100, s.Ab * 2)]);
    chart2.push([s.N, s.B, s.T, (s.M / MMAX) * 2]);
  }
  if (s.cleared && !clearedShown) {
    clearedShown = true;
    sim.toast(`✅ Mikroplar temizlendi (gün ${fmt(s.t, 1)}). Hafıza hücreleri kalıyor.`, 'good');
  }
  if (!s.cleared) clearedShown = false;
});

sim.onRender((rdt) => {
  const t = sim.time, dt = sim.paused ? 0 : Math.min(rdt * sim.speed, 0.1);
  // Görsel sayılar: mikrop karekök ölçekli (az mikrop da görünsün), diğerleri doğrusal
  const nP = s.P > 0 ? Math.max(2, Math.sqrt(s.P / KP) * MAXP) : 0;
  spread = 0.8 + (s.P / KP) * 4.5;
  (p.kind === 'bakteri' ? bact : virus).setCount(nP);
  (p.kind === 'bakteri' ? virus : bact).setCount(0);
  innate.setCount(Math.max(0, s.N - 0.3) * 18 + 4);
  bcell.setCount(s.B * 22);
  tcell.setCount(s.T * 22);
  antibody.setCount(Math.min(400, s.Ab * 8));
  memory.setCount((s.M / MMAX) * 24);
  const pat = p.kind === 'bakteri' ? bact : virus;
  pat.update(dt, t, pathogenTarget);
  innate.update(dt, t, hunterTarget);
  bcell.update(dt, t, (q, i) => (s.P > 0.01 ? hunterTarget(q, i + 3) : tgtV.set(-3 + Math.sin(i) * 5, 0.8, 3 + Math.cos(i) * 2)));
  tcell.update(dt, t, hunterTarget);
  antibody.update(dt, t, abTarget);
  memory.update(dt, t, (q, i) => (s.P > 0.01 && s.M > 0.02 ? hunterTarget(q, i) : memTarget));
  // Alyuvarlar damarda akar
  for (let i = 0; i < RBC; i++) {
    const d = rbcData[i];
    d.x += dt * d.v;
    if (d.x > 30) d.x -= 60;
    eul.set(d.rx + t * 0.5, d.ry, 0);
    q4.setFromEuler(eul);
    mtx.compose(pv.set(d.x, VESSEL_Y + Math.sin(d.a) * d.d, VESSEL_Z + Math.cos(d.a) * d.d), q4, sv.set(1, 1, 1));
    rbc.setMatrixAt(i, mtx);
  }
  rbc.instanceMatrix.needsUpdate = true;
  wound.material.color.setHex(s.P > 1 ? 0x7f1d1d : 0x5b0f1f);
  labels[2].el.style.opacity = s.M > 0.005 ? 1 : 0.35;   // hafıza hücresi yokken soluk
  if (sim.frame % 10 === 0) updateStats();
});

function updateStats() {
  const since = s.t - s.lastExpo;
  stDay.set(s.exposures ? `${fmt(since, 1)}. gün` : '—');
  const pct = (s.P / KP) * 100;
  stP.set(fmt(pct, pct < 10 && pct > 0 ? 1 : 0), pct > 30 ? 'bad' : pct > 5 ? 'warn' : pct > 0 ? '' : 'good');
  stAb.set(fmt(Math.min(100, s.Ab * 2), 0), s.Ab > 10 ? 'good' : '');
  stMem.set(fmt((s.M / MMAX) * 100, 0), s.M > 0.02 ? 'good' : '');
  sickM.set(s.sick, s.sick > 0.6 ? 'ağır' : s.sick > 0.3 ? 'orta' : s.sick > 0.08 ? 'hafif' : 'yok');
  sickM.color(s.sick > 0.6 ? '#ef4444' : s.sick > 0.3 ? '#f97316' : '#facc15');

  let msg;
  const bact_ = p.kind === 'bakteri';
  if (p.antibiotic && !bact_ && s.P > 0.01) msg = '⚠️ <b>Antibiyotik işe yaramıyor:</b> antibiyotikler bakterilerin duvarını ya da mekanizmalarını hedefler; virüslerde bu yapılar yoktur. Virüsü bağışıklık sistemi temizleyecek.';
  else if (s.cleared) msg = s.M > 0.02 ? '⭐ <b>İyileşti!</b> Mikroplar gitti ama <b>hafıza hücreleri</b> kaldı. "Aynı mikropla yeniden karşılaş" düğmesiyle ikinci karşılaşmayı dene.' : '✅ <b>İyileşti!</b> Mikroplar temizlendi. Uyarlanır yanıt pek devreye girmediği için az hafıza oluştu.';
  else if (p.antibiotic && bact_ && s.P > 0.01) msg = '💊 <b>Antibiyotik bakterileri öldürüyor.</b> Gerçek hayatta antibiyotik yalnız doktor önerisiyle ve tam süre kullanılmalı.';
  else if (s.exposures > 1 && s.M > 0.02) msg = '⚡ <b>İkincil yanıt:</b> hafıza hücreleri mikrobu hemen tanıdı; B ve T hücreleri birkaç günde çoğaldı. Mikrop çoğalamadan temizleniyor.';
  else if (p.vaccinated && since < 6) msg = '💉 <b>Aşılı vücut:</b> aşı sayesinde hafıza hücreleri hazır. Yanıt ilk karşılaşmadaki gibi 1–2 hafta değil, birkaç gün içinde yükseliyor.';
  else if (s.B + s.T > 0.4) msg = '🔵 <b>Uyarlanır bağışıklık devrede:</b> bu mikroba özel B ve T hücreleri çoğaldı. B hücreleri antikor üretiyor, T hücreleri enfekte hücreleri yok ediyor.';
  else if (since < 1.5) msg = '🦠 <b>Mikroplar girdi!</b> Dokudaki makrofajlar ilk savunmayı yapıyor; damardan nötrofiller çağrılıyor.';
  else msg = '⚪ <b>Doğuştan bağışıklık:</b> nötrofiller ve makrofajlar mikrobu yavaşlatıyor ama durduramıyor. Bu mikroba özel B/T hücreleri hâlâ çok az; çoğalmaları zaman alıyor.';
  note.set(msg);
}

// Hücreye tıkla → bilgi
const INFO = new Map([
  [bact.mesh, '🟢 <b>Bakteri</b>: kendi başına çoğalabilen tek hücreli canlı. Antibiyotik bakterileri öldürebilir.'],
  [virus.mesh, '🟣 <b>Virüs</b>: hücrelerimizin içine girip onları kullanarak çoğalır. Antibiyotik etki etmez.'],
  [innate.mesh, '⚪ <b>Nötrofil / makrofaj</b>: ilk gelen savunma hücreleri; mikropları yutar (fagositoz).'],
  [bcell.mesh, '🔵 <b>B hücresi</b>: bu mikroba özel antikor üretir.'],
  [tcell.mesh, '🟢 <b>T hücresi</b>: enfekte olmuş hücreleri tanıyıp yok eder, B hücrelerine yardım eder.'],
  [memory.mesh, '⭐ <b>Hafıza hücresi</b>: mikrobu yıllarca hatırlayabilir; ikinci karşılaşmada yanıtı hızlandırır.'],
]);
sim.onClick(() => { const l = [...INFO.keys()]; l.forEach((m) => m.computeBoundingSphere()); return l; }, (hit) => { const t = INFO.get(hit.object); if (t) sim.toast(t); });

sim.onReset(() => load(preset.value));
load('ilk');
