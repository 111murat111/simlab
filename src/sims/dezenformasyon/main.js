// Yalan Haber Yayılımı — 3B sosyal ağda birbiriyle yarışan iki bulaşma süreci: söylenti ve düzeltme (SIR benzeri durumlar).
import { createSim, THREE, fmt, clamp, instanced, mat, landscape, createTerrain, terrainSkirt, createVegetation, crowd, seeded } from '@core';
import { buildNetwork } from './network.js';
import { buildTown, townMaterial, streets, lampSpots, softSprite, lots, LOT, HALF, PITCH, NB, STREET } from './town.js';

const N = 260;
const TICK_SEC = 0.35;     // 1× hızda bir saat
const S = 0, B = 1, P = 2, K = 3, D = 4; // habersiz, inanan, paylaşan, şüpheci, doğrulanmış
const COL = [0x64748b, 0xf97316, 0xef4444, 0xa78bfa, 0x22c55e];
const NAMES = ['Habersiz', 'İnanan', 'Paylaşan', 'Şüpheci', 'Doğrulanmış'];

const sim = createSim({
  sky: { elevation: 2.2, azimuth: 318, clouds: 0.35, haze: 1.2, visibility: 4500, wind: [4, 1] },
  camera: { position: [150, 135, 330], target: [0, 4, 10], fov: 44, near: 0.5, far: 60000 },
  controls: { maxDistance: 900, minDistance: 25 },
  look: { aoRadius: 0.8 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Akşam karanlığında ${N} haneli bir kasaba. Her bina bir kullanıcıdır; çok bağlantılı "fenomenler" yüksek apartmanlarda,
    az bağlantılılar müstakil evlerde oturur. Binaların üstündeki ince ışık kavisleri takip/arkadaşlık bağlarıdır;
    kırmızı ışıklı <b>telsiz direkleri</b> bot hesaplardır. Bir <b>söylenti</b> paylaşıldığında takipçiler onu görür; bazıları inanır, bazıları inanıp paylaşır,
    bazıları şüpheyle yaklaşır. Bir süre sonra bir <b>doğrulama (düzeltme)</b> yayımlanır ve o da ağda yayılır.
    <b>Pencere ışığının rengi</b> kişinin durumunu gösterir: <b style="color:#fde2a8">sönük sarı</b> habersiz, <b style="color:#fb923c">turuncu</b> inanan,
    <b style="color:#f87171">kırmızı</b> paylaşan, <b style="color:#c4b5fd">mor</b> şüpheci, <b style="color:#4ade80">yeşil</b> doğrulanmış.
    Kavisler üzerinde giden kırmızı ışıklar söylentiyi, yeşil ışıklar düzeltmeyi taşır. Önünde <b>mavi ışık halkası</b> olan binalarda
    <b>önceden uyarılmış</b> (prebunking) kullanıcılar oturur. Kasaba düzeni yalnızca bir görselleştirmedir: bağlantılar gerçek komşuluğu değil, çevrim içi takip ilişkisini gösterir.</p>
    <p><b>Bir binaya tıkla:</b> söylenti oradan başlar. Çok bağlantılı bir "fenomen"den ve kenardaki birinden başlatmayı karşılaştır.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Hub'dan</b> ve <b>kenardan</b> başlat: aynı söylenti, farklı erişim.</li>
      <li>Doğrulama gecikmesini 3 saatten 48 saate çıkar: zirvedeki inanan sayısı ne kadar değişiyor?</li>
      <li>Önceden uyarılanların payını %0'dan %50'ye çıkar: salgın gibi, "sürü bağışıklığı"na benzer bir eşik var mı?</li>
      <li>"Paylaşmadan önce oku" sürtünmesini aç; bot oranını artır. Hangisi daha çok fark yaratıyor?</li>
      <li>Haberin çekiciliğini düşür: sıkıcı bir söylenti kendi kendine söner mi?</li>
    </ul>
    <h3>Araştırmalar ne diyor?</h3>
    <ul>
      <li><b>Vosoughi, Roy ve Aral (2018, <i>Science</i> 359:1146–1151)</b> Twitter'da 2006–2017 arasında yayılan, altı bağımsız doğrulama
      kuruluşunca doğru/yanlış diye sınıflanmış yaklaşık 126 bin haber zincirini (≈3 milyon kişi, 4,5 milyondan fazla paylaşım) inceledi.
      Yanlış haberler tüm kategorilerde doğrulardan <b>daha uzağa, daha hızlı, daha derine ve daha geniş</b> yayıldı; yanlış haberin
      yeniden paylaşılma olasılığı %70 daha yüksekti. Yanlış haberler daha "yeni" (özgün) bulundu ve yanıtlarda daha çok şaşkınlık,
      korku ve tiksinti uyandırdı. Botlar doğru ve yanlış haberi <b>aynı oranda</b> hızlandırdı; yani farkı yaratan insanlardı.</li>
      <li><b>Roozenbeek ve van der Linden (2019, <i>Palgrave Communications</i>)</b>: oyuncuların sahte haber üretim tekniklerini
      (duygu sömürüsü, kutuplaştırma, komplo, sahte hesap…) oynayarak öğrendiği <i>Bad News</i> oyunundan sonra katılımcılar sahte
      başlıkları daha az güvenilir buldu. Bu "aşılama / önceden çürütme" (inoculation, prebunking) fikridir. Etkinin büyüklüğü
      çalışmadan çalışmaya değişir; bazı tekrar çalışmaları (ör. Hindistan'da) belirgin bir iyileşme bulamamıştır.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p><small>Her adım 1 saattir. Paylaşan biri her saat takipçilerine görünür; gören habersiz kişi, çekiciliğe bağlı bir olasılıkla inanır
    (önceden uyarılmışsa bu olasılık yarıya iner), inananların bir kısmı paylaşır (sürtünme açıksa paylaşma %40 azalır). Paylaşanlar
    ortalama 8 saat sonra ilgiyi kaybeder. Botlar söylenti başlar başlamaz sürekli paylaşır ve ikna olmaz. Düzeltme, gecikme dolunca
    kullanıcıların seçilen bir kısmına doğrudan ulaşır ve daha düşük bir olasılıkla paylaşılarak yayılır (daha az "yeni" olduğu varsayımı).
    <b>Bütün olasılıklar temsilîdir</b>; gerçek bir platformu ya da olayı ölçmez, kavramları göstermek içindir. Gerçekte kişiler
    kaynağa, konuya ve gruba göre çok farklı davranır.</small></p>`,
});

// --- Durum ---
const cfg = {
  net: 'olceksiz', appeal: 0.7, share: 0.6, delay: 12, reach: 0.25, prebunk: 0.1, friction: false, bots: 0.02, labels: true, spin: true,
};
let G, state, sharing, prebunked, isBot, deg, everBelieved, hour = 0, seed = 3, seedNode = -1, peakBel = 0, stopped = false;
sim.formatTime = () => `${fmt(hour)}. saat`;

const scene = sim.scene;
const group = new THREE.Group();
scene.add(group);

// --- Arazi: kasaba düzlüğü, çevrede tepeler; sokaklar, kaldırımlar, sokak lambaları ---
const hf = (() => {
  const base = landscape({ seed: 29, size: 1300, height: 360, base: -30 });
  return (x, z) => {
    const r = Math.max(Math.abs(x), Math.abs(z));
    return -0.05 + THREE.MathUtils.smoothstep(r, HALF + 60, 1500) * (base(x, z) + 150);
  };
})();
scene.add(createTerrain(hf, { size: [9000, 9000], res: [200, 200], materialOptions: { water: -500, grass: 0x4f5c2c, dry: 0x8a8156, forest: 0.8 } }));
scene.add(terrainSkirt(hf, { inner: 4500, outer: 60000 }));
scene.add(...streets(mat.asphalt({ color: 0x3a3b3f }), mat.concrete({ color: 0xa39d92, stains: 0.4 })));
{
  const spots = lampSpots();
  const pole = new THREE.LatheGeometry([[0.12, 0], [0.1, 0.4], [0.07, 0.5], [0.06, 6.8], [0.05, 7.0], [0, 7.05]].map(([x, y]) => new THREE.Vector2(x, y)), 8);
  const arm = new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6).rotateZ(Math.PI / 2).translate(0.62, 6.9, 0);
  const poles = instanced(pole, mat.paintedMetal({ color: 0x2d3033, wear: 0.3 }), spots.length);
  const arms = instanced(arm, mat.paintedMetal({ color: 0x2d3033, wear: 0.3 }), spots.length);
  const heads = instanced(new THREE.SphereGeometry(0.24, 10, 6).scale(1.3, 0.55, 1.3).translate(1.25, 6.8, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.2, 1.2) }), spots.length);
  const d = new THREE.Object3D();
  spots.forEach(([x, z, dir], i) => {
    d.position.set(x, 0, z); d.rotation.set(0, dir < 0 ? Math.PI : -Math.PI / 2, 0); d.updateMatrix();
    poles.setMatrixAt(i, d.matrix); arms.setMatrixAt(i, d.matrix); heads.setMatrixAt(i, d.matrix);
  });
  [poles, arms, heads].forEach((m) => { m.userData.noFit = true; m.frustumCulled = false; scene.add(m); });
  heads.userData.noCast = true;
}

// Akşam sokakları: kaldırımda yürüyenler ve kapı önünde sohbet eden ikililer (motor figürleri, @core crowd).
// Yalnız dekor: yayılma modeline katılmazlar. Lambasız kaldırım kenarını kullanırlar (direklerin içinden geçmesinler).
const LOW = /[?&]low\b/.test(location.search);
const folk = (() => {
  const r = seeded(47), W = [], T = [], lines = [];
  for (let s = 0; s <= NB; s++) { const c = (s - NB / 2) * PITCH; lines.push([0, c - STREET / 2 + 0.75], [1, c + STREET / 2 - 0.75]); }   // [eksen, kaldırım] — 0: x sabit
  lines.forEach(([ax, o], k) => { for (let j = 0, n = LOW ? 2 : 6; j < n; j++) W.push({ ax, o: o + (r() - 0.5) * 0.5, s: r() * 2, v: 1.0 + r() * 0.5, yaw: 0 }); });
  for (let k = 0, n = LOW ? 4 : 12; k < n; k++) {
    const [ax, o] = lines[Math.floor(r() * lines.length)], t = (Math.floor(r() * NB) - NB / 2 + 0.5) * PITCH + (r() - 0.5) * 30;
    const p = ax ? [t, o] : [o, t], d = ax ? [1, 0] : [0, 1];
    T.push([p[0] - d[0] * 0.55, p[1] - d[1] * 0.55, Math.atan2(d[0], d[1])], [p[0] + d[0] * 0.55, p[1] + d[1] * 0.55, Math.atan2(-d[0], -d[1])]);
  }
  const c = crowd(W.length + T.length, { seed: 31, camera: sim.camera, outfits: { casual: 6, office: 2, student: 3 } });
  c.group.position.y = 0.16;   // kaldırım üstü
  scene.add(c.group);
  T.forEach(([x, z, y], i) => c.set(W.length + i, x, 0, z, y + (r() - 0.5) * 0.5, 'stand'));
  const L = NB * PITCH;
  let last = performance.now();
  return (moving) => {
    const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
    W.forEach((w, i) => {
      if (moving) w.s += (w.v * dt) / L;
      const u = w.s % 2, fw = u < 1, t = -L / 2 + (fw ? u : 2 - u) * L;
      const x = w.ax ? t : w.o, z = w.ax ? w.o : t, dx = w.ax ? (fw ? 1 : -1) : 0, dz = w.ax ? 0 : (fw ? 1 : -1);
      let d = Math.atan2(dx, dz) - w.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      w.yaw += d * Math.min(1, dt * 6);
      c.set(i, x, 0, z, w.yaw, 'walk');
    });
    c.update(now / 1000);
  };
})();

const townMat = townMaterial();
let town = null, townMesh = null, veg = null;
const haloMesh = instanced(new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 3.2), transparent: true, opacity: 0.85, depthWrite: false }), N);
haloMesh.frustumCulled = false; haloMesh.userData.noFit = true; haloMesh.userData.noCast = true;
group.add(haloMesh);
let edgeLines = null;
const linkMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0.55, 0.8, 1.4), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
const overlay = { links: true };

// Işık darbeleri: kavis boyunca giden yumuşak, yuvarlak ışık lekeleri
const PULSES = 260;
const pulseGeo = new THREE.BufferGeometry();
const pulsePos = new Float32Array(PULSES * 3), pulseCol = new Float32Array(PULSES * 3);
pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3));
pulseGeo.setAttribute('color', new THREE.BufferAttribute(pulseCol, 3));
const pulsePts = new THREE.Points(pulseGeo, new THREE.PointsMaterial({ size: 9, map: softSprite(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
pulsePts.frustumCulled = false; pulsePts.userData.noFit = true;
group.add(pulsePts);
const pulses = Array.from({ length: PULSES }, () => ({ a: 0, b: 0, t: -1, corr: false }));
let pulseIdx = 0;
const PR = new THREE.Color(4.0, 0.7, 0.45), PC = new THREE.Color(0.6, 3.6, 1.0);
const seedLbl = sim.label('', { parent: group, position: [0, 0, 0] });
const dummy = new THREE.Object3D(), _c = new THREE.Color();

// Pencere ışığı (HDR, çiçeklenir): habersiz sönük sıcak ışık; durum renkleri belirgin
const GLOW = [new THREE.Color(1.0, 0.72, 0.42).multiplyScalar(0.45), new THREE.Color(0xf97316).multiplyScalar(2.2),
  new THREE.Color(0xef4444).multiplyScalar(3.0), new THREE.Color(0xa78bfa).multiplyScalar(1.7), new THREE.Color(0x22c55e).multiplyScalar(2.0)];

/** Kavis: a'dan b'ye, çatılar üstünde yükselen parabol. */
const arcP = new THREE.Vector3();
function arcAt(a, b, t, out = arcP) {
  const A = town.anchor;
  const ax = A[a * 3], ay = A[a * 3 + 1], az = A[a * 3 + 2], bx = A[b * 3], by = A[b * 3 + 1], bz = A[b * 3 + 2];
  const dist = Math.hypot(bx - ax, bz - az);
  return out.set(ax + (bx - ax) * t, ay + (by - ay) * t + 4 * t * (1 - t) * (6 + dist * 0.22), az + (bz - az) * t);
}

function buildAll() {
  G = buildNetwork(cfg.net, N, seed);
  deg = G.nbr.map((l) => l.length);
  const rnd = mulberry(seed * 97 + 11);
  // Botlar ve önceden uyarılanlar
  isBot = new Uint8Array(N);
  prebunked = new Uint8Array(N);
  const order = [...Array(N).keys()].sort(() => rnd() - 0.5);
  const nb = Math.round(N * cfg.bots);
  order.slice(0, nb).forEach((i) => (isBot[i] = 1));
  const humans = order.slice(nb);
  humans.slice(0, Math.round(humans.length * cfg.prebunk)).forEach((i) => (prebunked[i] = 1));
  // Kasaba (binalar)
  if (townMesh) { townMesh.geometry.dispose(); group.remove(townMesh); }
  town = buildTown(N, G.pos, deg, isBot, seed);
  townMesh = new THREE.Mesh(town.geometry, townMat);
  townMesh.castShadow = townMesh.receiveShadow = true;
  group.add(townMesh);
  // Ağaçlar: boş parsellerde ve kasabanın çevresinde
  if (veg) { group.remove(veg.group); veg.group.traverse((o) => { if (o.isInstancedMesh) o.dispose(); }); }
  const L = town.lots, emptyAt = (x, z) => {
    for (const l of town.empty) if (Math.abs(L[l][0] - x) < LOT / 2 - 1.5 && Math.abs(L[l][1] - z) < LOT / 2 - 1.5) return true;
    return false;
  };
  veg = createVegetation(hf, {
    rect: [-700, -700, 700, 700], trees: 1700, shrubs: 0, rocks: 0, grass: 0, seed: 7 + seed, water: -10,
    kinds: { broad: 0.6, pine: 0.25, cypress: 0.15 },
    forest: (x, z) => {
      const r = Math.max(Math.abs(x), Math.abs(z));
      if (r < HALF + 8) return emptyAt(x, z) ? 0.95 : 0;
      return 0.35 + 0.35 * Math.sin(x * 0.013 + 1.1) * Math.cos(z * 0.017) + 0.25 * THREE.MathUtils.smoothstep(r, HALF + 10, HALF + 80);
    },
  });
  group.add(veg.group);
  // Bağlantı kavisleri
  if (edgeLines) { edgeLines.geometry.dispose(); group.remove(edgeLines); }
  const SEG = 14, pos = new Float32Array(G.edges.length * SEG * 6), q = new THREE.Vector3();
  G.edges.forEach(([a, b], k) => {
    for (let s = 0; s < SEG; s++) {
      arcAt(a, b, s / SEG, q); pos.set([q.x, q.y, q.z], (k * SEG + s) * 6);
      arcAt(a, b, (s + 1) / SEG, q); pos.set([q.x, q.y, q.z], (k * SEG + s) * 6 + 3);
    }
  });
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  edgeLines = new THREE.LineSegments(eg, linkMat);
  edgeLines.userData.noFit = true; edgeLines.userData.noCast = true; edgeLines.frustumCulled = false;
  edgeLines.visible = overlay.links;
  group.add(edgeLines);
  // Önceden uyarılanların halkaları
  let pn = 0;
  for (let i = 0; i < N; i++) if (prebunked[i]) {
    const L2 = town.lots[town.lotOf[i]];
    dummy.position.set(L2[0], 0.2, L2[1]); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(town.foot[i]); dummy.updateMatrix();
    haloMesh.setMatrixAt(pn++, dummy.matrix);
  }
  haloMesh.count = pn; haloMesh.instanceMatrix.needsUpdate = true;
  restart(-1);
}

function mulberry(a) {
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function hubNode() { let best = 0; for (let i = 0; i < N; i++) if (!isBot[i] && deg[i] > deg[best]) best = i; return best; }
function edgeNode() {
  const c = [];
  for (let i = 0; i < N; i++) if (!isBot[i] && deg[i] <= Math.max(2, Math.min(...deg))) c.push(i);
  return c[Math.floor(Math.random() * c.length)] ?? 0;
}

/** Söylentiyi node düğümünden başlatır (-1: rastgele sıradan kullanıcı). */
function restart(node) {
  state = new Uint8Array(N);
  sharing = new Uint8Array(N);   // 1: söylenti paylaşıyor, 2: düzeltme paylaşıyor
  everBelieved = new Uint8Array(N);
  hour = 0; peakBel = 0; stopped = false; tickAcc = 0; sim.time = 0;
  if (node < 0 || isBot[node]) { do node = Math.floor(Math.random() * N); while (isBot[node]); }
  seedNode = node;
  state[node] = P; sharing[node] = 1; everBelieved[node] = 1;
  for (let i = 0; i < N; i++) if (isBot[i]) { state[i] = P; sharing[i] = 1; }
  pulses.forEach((p) => (p.t = -1));
  seedLbl.position.set(town.anchor[node * 3], town.anchor[node * 3 + 1] + 5, town.anchor[node * 3 + 2]);
  seedLbl.setText(`📣 Söylenti burada başladı (${deg[node]} bağlantı)`);
  seedLbl.visible = cfg.labels;
  chart.clear();
  colorNodes();
  record();
}

function spawnPulse(a, b, corr) {
  const p = pulses[pulseIdx++ % PULSES];
  p.a = a; p.b = b; p.t = 0; p.corr = corr;
}

// --- Bir saatlik adım ---
function tick() {
  hour++;
  const appeal = cfg.appeal;
  const pBelieve = 0.12 + 0.6 * appeal;
  const pShare = clamp(cfg.share * (0.4 + 0.8 * appeal) * (cfg.friction ? 0.6 : 1), 0, 1);
  const SEE = 0.3;                 // takipçinin bir saatte gönderiyi görme olasılığı
  const corrShare = cfg.share * 0.35; // düzeltme daha az "yeni" → daha seyrek paylaşılır
  const corrOn = hour >= cfg.delay;
  const next = state.slice(), nextSh = sharing.slice();
  const expose = (v, u, corr) => {
    if (isBot[v]) return;
    const st = next[v];
    if (!corr) {
      if (st === S) {
        const pb = pBelieve * (prebunked[v] ? 0.5 : 1);
        if (Math.random() < pb) {
          everBelieved[v] = 1;
          if (Math.random() < pShare) { next[v] = P; nextSh[v] = 1; } else next[v] = B;
        } else next[v] = K;
        spawnPulse(u, v, false);
      } else if (st === B && Math.random() < pShare * 0.25) { next[v] = P; nextSh[v] = 1; spawnPulse(u, v, false); }
    } else {
      let ok = 0;
      if (st === S || st === K) ok = 0.9;
      else if (st === B) ok = prebunked[v] ? 0.85 : 0.6;
      else if (st === P) ok = prebunked[v] ? 0.6 : 0.35;
      if (ok && Math.random() < ok) {
        next[v] = D;
        nextSh[v] = Math.random() < corrShare ? 2 : 0;
        spawnPulse(u, v, true);
      }
    }
  };
  for (let u = 0; u < N; u++) {
    if (!sharing[u]) continue;
    const corr = sharing[u] === 2;
    const see = SEE * (isBot[u] ? 1.6 : 1);
    for (const v of G.nbr[u]) if (Math.random() < see) expose(v, u, corr);
    // İlgi kaybı
    if (!isBot[u] && Math.random() < 1 / 8) { nextSh[u] = 0; if (next[u] === P) next[u] = B; }
  }
  // Düzeltmenin doğrudan erişimi (resmî hesap, platform uyarısı, haber) — gecikmeden sonraki 6 saate yayılır
  if (corrOn && hour < cfg.delay + 6) {
    const q = cfg.reach / 6;
    for (let v = 0; v < N; v++) if (!isBot[v] && next[v] !== D && Math.random() < q) expose(v, v, true);
  }
  state = next; sharing = nextSh;
  colorNodes();
  record();
  const active = sharing.some((s, i) => s && !isBot[i]);
  if (!active && corrOn && hour > cfg.delay + 6 && !stopped) {
    stopped = true;
    sim.toast('Yayılım durdu: artık paylaşan gerçek kullanıcı yok.');
  }
}

function colorNodes() {
  const arr = townMesh.geometry.attributes.aGlow;
  for (let i = 0; i < N; i++) {
    _c.copy(GLOW[state[i]]);
    if (sharing[i] === 2) _c.copy(GLOW[D]).multiplyScalar(1.6);
    if (isBot[i]) _c.copy(GLOW[P]).multiplyScalar(1.4);
    const [st, cnt] = town.ranges[i];
    for (let v = st; v < st + cnt; v++) arr.setXYZ(v, _c.r, _c.g, _c.b);
  }
  arr.needsUpdate = true;
}

function counts() {
  const c = [0, 0, 0, 0, 0];
  let humans = 0, ever = 0;
  for (let i = 0; i < N; i++) { if (isBot[i]) continue; humans++; c[state[i]]++; ever += everBelieved[i]; }
  return { c, humans, ever };
}

function record() {
  const { c, humans, ever } = counts();
  const pct = (x) => (100 * x) / humans;
  const bel = c[B] + c[P];
  peakBel = Math.max(peakBel, pct(bel));
  chart.push([pct(bel), pct(c[P]), pct(c[D]), pct(c[K])]);
  stHeard.set(`%${fmt(pct(humans - c[S]))}`);
  stBel.set(`%${fmt(pct(bel))}`, pct(bel) > 30 ? 'bad' : pct(bel) > 10 ? 'warn' : '');
  stShare.set(fmt(c[P]), c[P] ? 'warn' : '');
  stCorr.set(`%${fmt(pct(c[D]))}`, 'good');
  stPeak.set(`%${fmt(peakBel)}`, peakBel > 30 ? 'bad' : peakBel > 10 ? 'warn' : 'good');
  stEver.set(`%${fmt(pct(ever))}`);
  const corrTxt = hour < cfg.delay ? `Doğrulama <b>${fmt(cfg.delay - hour)} saat</b> sonra yayımlanacak.` : `Doğrulama yayımlandı (${fmt(cfg.delay)}. saatte).`;
  statusTxt.set(`${corrTxt}<br>Şu an ${fmt(c[P])} kişi paylaşıyor, ${fmt(bel)} kişi (%${fmt(pct(bel))}) söylentiye inanıyor.`);
}

// --- Döngü ---
let tickAcc = 0;
sim.onUpdate((dt) => {
  tickAcc += dt / TICK_SEC;
  let n = 0;
  while (tickAcc >= 1 && n < 6) { tickAcc -= 1; tick(); n++; }
  if (n === 6) tickAcc = 0;
  for (const p of pulses) if (p.t >= 0) { p.t += dt / TICK_SEC; if (p.t > 1) p.t = -1; }
});

sim.onRender(() => {
  pulses.forEach((p, j) => {
    if (p.t >= 0 && p.a !== p.b && overlay.links) {
      arcAt(p.a, p.b, p.t);
      pulsePos[j * 3] = arcP.x; pulsePos[j * 3 + 1] = arcP.y; pulsePos[j * 3 + 2] = arcP.z;
      const c = p.corr ? PC : PR;
      pulseCol[j * 3] = c.r; pulseCol[j * 3 + 1] = c.g; pulseCol[j * 3 + 2] = c.b;
    } else {
      pulsePos[j * 3 + 1] = -1000;
    }
  });
  pulseGeo.attributes.position.needsUpdate = true;
  pulseGeo.attributes.color.needsUpdate = true;
  if (veg) veg.update(performance.now() / 1000, 0.4);
  folk(!sim.paused);
});

// Binaya tıkla → söylenti oradan başlasın
sim.onClick(() => [townMesh], (hit) => {
  if (!hit.face) return;
  const i = townMesh.geometry.attributes.aNode.getX(hit.face.a);
  if (isBot[i]) { sim.toast('🤖 Bu bir bot hesabı; söylenti gerçek bir kullanıcıdan başlatılır.', 'warn'); return; }
  restart(i);
  sim.toast(`📣 Söylenti ${deg[i]} bağlantılı bir kullanıcıdan başladı`);
});

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır senaryolar');
const PRESETS = [
  ['🌟 Fenomenden başlasın', { net: 'olceksiz' }, 'hub'],
  ['🌱 Kenardan başlasın', { net: 'olceksiz' }, 'edge'],
  ['⚡ Hızlı doğrulama', { delay: 3, reach: 0.4 }, 'hub'],
  ['🐢 Geç doğrulama', { delay: 48, reach: 0.25 }, 'hub'],
  ['🛡️ %50 önceden uyarı', { prebunk: 0.5 }, 'hub'],
  ['🤖 Botlar, sürtünme yok', { bots: 0.06, friction: false }, 'edge'],
  ['✋ "Önce oku" sürtünmesi', { friction: true }, 'hub'],
  ['😴 Sıkıcı söylenti', { appeal: 0.2 }, 'hub'],
];
const BASE = { net: 'olceksiz', appeal: 0.7, share: 0.6, delay: 12, reach: 0.25, prebunk: 0.1, friction: false, bots: 0.02 };
for (let i = 0; i < PRESETS.length; i += 2) {
  ui.buttons(PRESETS.slice(i, i + 2).map(([label, o, where]) => ({ label, onClick: () => applyPreset(label, o, where) })));
}

ui.section('Söylenti');
const appealS = ui.slider({ label: 'Yenilik / duygusal çekicilik', min: 0, max: 1, step: 0.05, value: cfg.appeal, format: (v) => `%${fmt(v * 100)}`, onInput: (v) => (cfg.appeal = v) });
const shareS = ui.slider({ label: 'Paylaşma eğilimi', min: 0.05, max: 1, step: 0.05, value: cfg.share, format: (v) => `%${fmt(v * 100)}`, onInput: (v) => (cfg.share = v) });
const frictionT = ui.toggle({ label: '"Paylaşmadan önce oku" uyarısı (sürtünme)', value: cfg.friction, onChange: (v) => (cfg.friction = v) });
ui.buttons([
  { label: '🌟 Hub\'dan başlat', onClick: () => restart(hubNode()) },
  { label: '🌱 Kenardan başlat', onClick: () => restart(edgeNode()) },
]);

ui.section('Doğrulama ve önlemler');
const delayS = ui.slider({ label: 'Doğrulama gecikmesi', min: 0, max: 72, step: 1, value: cfg.delay, unit: 'saat', onInput: (v) => (cfg.delay = v) });
const reachS = ui.slider({ label: 'Düzeltmenin doğrudan erişimi', min: 0, max: 0.8, step: 0.05, value: cfg.reach, format: (v) => `kullanıcıların %${fmt(v * 100)}'i`, onInput: (v) => (cfg.reach = v) });
const prebunkS = ui.slider({ label: 'Önceden uyarılmış kullanıcılar', min: 0, max: 0.8, step: 0.05, value: cfg.prebunk, format: (v) => `%${fmt(v * 100)}`, onChange: (v) => { cfg.prebunk = v; buildAll(); } });

ui.section('Ağ');
const netSeg = ui.segmented({
  options: [{ value: 'olceksiz', label: 'Ölçeksiz (fenomenli)' }, { value: 'kucukdunya', label: 'Küçük dünya' }, { value: 'rastgele', label: 'Rastgele' }],
  value: cfg.net, onChange: (v) => { cfg.net = v; buildAll(); },
});
const botS = ui.slider({ label: 'Bot hesapları', min: 0, max: 0.1, step: 0.01, value: cfg.bots, format: (v) => `%${fmt(v * 100)}`, onChange: (v) => { cfg.bots = v; buildAll(); } });
ui.button({ label: '🎲 Yeni ağ üret', onClick: () => { seed++; buildAll(); } });
ui.toggle({ label: 'Kamerayı yavaşça döndür', value: cfg.spin, onChange: (v) => { cfg.spin = v; if (sim.controls) sim.controls.autoRotate = v; } });
ui.toggle({ label: 'Bağlantı kavisleri ve ışıklar', value: overlay.links, onChange: (v) => { overlay.links = v; edgeLines.visible = v; haloMesh.visible = v; } });
ui.toggle({ label: 'Başlangıç etiketi', value: cfg.labels, onChange: (v) => { cfg.labels = v; seedLbl.visible = v; } });

ui.section('Sonuçlar');
const stHeard = ui.stat({ label: 'Söylentiyi duyan' });
const stBel = ui.stat({ label: 'Şu an inanan' });
const stShare = ui.stat({ label: 'Şu an paylaşan' });
const stCorr = ui.stat({ label: 'Doğrulanmış' });
const stPeak = ui.stat({ label: 'Zirvede inanan' });
const stEver = ui.stat({ label: 'Bir ara inanmış' });
const statusTxt = ui.text('', 'card');
const chart = ui.chart({ title: 'Kullanıcıların yüzdesi (saat saat)', maxPoints: 120, yMin: 0, yMax: 100,
  series: [{ name: 'İnanan', color: '#f97316', fill: true }, { name: 'Paylaşan', color: '#ef4444' }, { name: 'Doğrulanmış', color: '#22c55e' }, { name: 'Şüpheci', color: '#a78bfa' }],
  format: (v) => fmt(v, 0) });
ui.text('<small>Yüzdeler bot olmayan kullanıcılar içindir. Tüm olasılıklar temsilîdir; gerçek bir platformu ölçmez.</small>');

function applyPreset(label, o, where) {
  const v = { ...BASE, ...o };
  const rebuild = v.net !== cfg.net || v.bots !== cfg.bots || v.prebunk !== cfg.prebunk;
  Object.assign(cfg, v);
  appealS.set(v.appeal); shareS.set(v.share); frictionT.set(v.friction); delayS.set(v.delay); reachS.set(v.reach);
  prebunkS.set(v.prebunk); netSeg.set(v.net); botS.set(v.bots);
  if (rebuild) buildAll();
  restart(where === 'hub' ? hubNode() : edgeNode());
  sim.play();
  sim.toast(label);
}

ui.section('Görünüm');
ui.buttons([
  { label: '🏘️ Kasabaya bak', onClick: () => sim.moveCamera([150, 135, 330], [0, 4, 10]) },
  { label: '🌟 Fenomenin çevresi', onClick: () => { const h = hubNode(), A = town.anchor; sim.moveCamera([A[h * 3] + 70, 55, A[h * 3 + 2] + 90], [A[h * 3], 12, A[h * 3 + 2]]); } },
]);

sim.onReset(() => restart(seedNode));
if (sim.controls) { sim.controls.autoRotate = cfg.spin; sim.controls.autoRotateSpeed = 0.25; }
buildAll();
restart(hubNode());
