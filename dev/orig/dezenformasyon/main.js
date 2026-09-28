// Yalan Haber Yayılımı — 3B sosyal ağda birbiriyle yarışan iki bulaşma süreci: söylenti ve düzeltme (SIR benzeri durumlar).
import { createSim, THREE, fmt, clamp, instanced } from '@core';
import { buildNetwork } from './network.js';

const N = 260;
const TICK_SEC = 0.35;     // 1× hızda bir saat
const S = 0, B = 1, P = 2, K = 3, D = 4; // habersiz, inanan, paylaşan, şüpheci, doğrulanmış
const COL = [0x64748b, 0xf97316, 0xef4444, 0xa78bfa, 0x22c55e];
const NAMES = ['Habersiz', 'İnanan', 'Paylaşan', 'Şüpheci', 'Doğrulanmış'];

const sim = createSim({
  background: 0x0a0f1d,
  camera: { position: [0, 6, 22], target: [0, 0, 0], fov: 46 },
  controls: { maxDistance: 60, minDistance: 6, maxPolarAngle: Math.PI },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>${N} kişilik bir sosyal ağ. Her küre bir kullanıcı (büyüklüğü arkadaş sayısıyla artar), çizgiler takip/arkadaşlık bağlarıdır;
    <b>küpler</b> bot hesaplardır. Bir <b>söylenti</b> paylaşıldığında takipçiler onu görür; bazıları inanır, bazıları inanıp paylaşır,
    bazıları şüpheyle yaklaşır. Bir süre sonra bir <b>doğrulama (düzeltme)</b> yayımlanır ve o da ağda yayılır.
    Renkler: <b style="color:#94a3b8">gri</b> habersiz, <b style="color:#fb923c">turuncu</b> inanan, <b style="color:#f87171">kırmızı</b> paylaşan,
    <b style="color:#c4b5fd">mor</b> şüpheci, <b style="color:#4ade80">yeşil</b> doğrulanmış. Hareket eden kırmızı ışıklar söylentiyi,
    yeşil ışıklar düzeltmeyi taşır. Mavi halkalı kişiler <b>önceden uyarılmış</b> (prebunking) kullanıcılardır.</p>
    <p><b>Bir kişiye tıkla:</b> söylenti oradan başlar. Çok bağlantılı bir "fenomen"den ve kenardaki birinden başlatmayı karşılaştır.</p>
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

const group = new THREE.Group();
sim.scene.add(group);
sim.scene.add(new THREE.AmbientLight(0x8090b0, 0.6));

const nodeGeo = new THREE.SphereGeometry(0.17, 14, 10);
const botGeo = new THREE.BoxGeometry(0.34, 0.34, 0.34);
const nodeMesh = instanced(nodeGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
const botMesh = instanced(botGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N);
const haloMesh = instanced(new THREE.TorusGeometry(0.26, 0.025, 6, 20), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }), N);
[nodeMesh, botMesh, haloMesh].forEach((m) => { m.frustumCulled = false; group.add(m); });
let edgeLines = null;
const PULSES = 260;
const pulseMesh = instanced(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), PULSES);
pulseMesh.frustumCulled = false;
group.add(pulseMesh);
const pulses = Array.from({ length: PULSES }, () => ({ a: 0, b: 0, t: -1, corr: false }));
let pulseIdx = 0;
const PR = new THREE.Color(0xff5a5a), PC = new THREE.Color(0x4ade80);
const seedLbl = sim.label('', { parent: group, position: [0, 0, 0] });
const dummy = new THREE.Object3D(), _c = new THREE.Color();
let meshIndex = []; // düğüm → [mesh, instanceId]
let nodeScale = [];

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
  // Kenarlar
  if (edgeLines) { edgeLines.geometry.dispose(); group.remove(edgeLines); }
  const pos = new Float32Array(G.edges.length * 6);
  G.edges.forEach(([a, b], k) => {
    pos.set([G.pos[a * 3], G.pos[a * 3 + 1], G.pos[a * 3 + 2], G.pos[b * 3], G.pos[b * 3 + 1], G.pos[b * 3 + 2]], k * 6);
  });
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  edgeLines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x5b6b8a, transparent: true, opacity: 0.28, depthWrite: false }));
  group.add(edgeLines);
  // Düğüm yerleşimi
  meshIndex = []; nodeScale = [];
  let hn = 0, bn = 0, pn = 0;
  for (let i = 0; i < N; i++) {
    const s = 0.7 + Math.sqrt(deg[i]) * 0.26;
    nodeScale.push(s);
    dummy.position.set(G.pos[i * 3], G.pos[i * 3 + 1], G.pos[i * 3 + 2]);
    dummy.scale.setScalar(s);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    if (isBot[i]) { botMesh.setMatrixAt(bn, dummy.matrix); meshIndex.push([botMesh, bn++]); }
    else { nodeMesh.setMatrixAt(hn, dummy.matrix); meshIndex.push([nodeMesh, hn++]); }
    if (prebunked[i]) {
      dummy.scale.setScalar(s);
      dummy.lookAt(0, 0, 100);
      dummy.updateMatrix();
      haloMesh.setMatrixAt(pn++, dummy.matrix);
    }
  }
  nodeMesh.count = hn; botMesh.count = bn; haloMesh.count = pn;
  [nodeMesh, botMesh, haloMesh].forEach((m) => { m.instanceMatrix.needsUpdate = true; });
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
  seedLbl.position.set(G.pos[node * 3], G.pos[node * 3 + 1] + 0.9, G.pos[node * 3 + 2]);
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
  for (let i = 0; i < N; i++) {
    const [m, id] = meshIndex[i];
    _c.setHex(COL[state[i]]);
    if (sharing[i] === 2) _c.lerp(PC, 0.5).multiplyScalar(1.25);
    m.setColorAt(id, _c);
  }
  [nodeMesh, botMesh].forEach((m) => { if (m.instanceColor) m.instanceColor.needsUpdate = true; });
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

sim.onRender((dt) => {
  if (cfg.spin) group.rotation.y += dt * 0.06;
  pulses.forEach((p, j) => {
    if (p.t >= 0 && p.a !== p.b) {
      const t = p.t;
      dummy.position.set(
        G.pos[p.a * 3] + (G.pos[p.b * 3] - G.pos[p.a * 3]) * t,
        G.pos[p.a * 3 + 1] + (G.pos[p.b * 3 + 1] - G.pos[p.a * 3 + 1]) * t,
        G.pos[p.a * 3 + 2] + (G.pos[p.b * 3 + 2] - G.pos[p.a * 3 + 2]) * t);
      dummy.scale.setScalar(1);
    } else dummy.scale.setScalar(0);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    pulseMesh.setMatrixAt(j, dummy.matrix);
    pulseMesh.setColorAt(j, p.corr ? PC : PR);
  });
  pulseMesh.instanceMatrix.needsUpdate = true;
  if (pulseMesh.instanceColor) pulseMesh.instanceColor.needsUpdate = true;
});

// Kişiye tıkla → söylenti oradan başlasın
sim.onClick(() => [nodeMesh, botMesh], (hit) => {
  if (hit.instanceId == null) return;
  const i = meshIndex.findIndex(([m, id]) => m === hit.object && id === hit.instanceId);
  if (i < 0) return;
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
ui.toggle({ label: 'Ağı yavaşça döndür', value: cfg.spin, onChange: (v) => (cfg.spin = v) });
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

sim.onReset(() => restart(seedNode));
buildAll();
restart(hubNode());
