// Evrim Akvaryumu — kalıtsal genli av balıkları, görerek avlanan avcılar: kamuflajın doğal seçilimle evrimi.
import { createSim, THREE, BufferGeometryUtils, fmt, instanced, rand } from '@core';
import { createWorld, MAXP, MAXF, MAXH, BOX, hueDiff } from './model.js';

const TIME = 2; // model saniyesi / gerçek saniye (1× hızda)
const INITIAL = 150;

const sim = createSim({
  background: 0x061425,
  camera: { position: [0, 8, 32.5], target: [0, 3.6, 0], fov: 45 },
  controls: { minDistance: 8, maxDistance: 60 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Küçük balıkların her birinin üç <b>geni</b> var: <b>renk tonu</b>, <b>hız</b> ve <b>boyut</b>. Yem yiyip yeterli
    enerji toplayan balık yavru yapar; yavru genleri ebeveynden alır ama küçük rastgele değişiklikler
    (<b>mutasyon</b>) olur. Koyu gri büyük balıklar <b>avcı</b>dır: gözleriyle avlanır. Zeminin rengine benzeyen
    balığı fark etmeleri zordur, zıt renkli balık ise hemen göze batar.</p>
    <p>Kimse balıklara "renk değiştirin" demez. Göze batanlar daha sık yenir, kamufle olanlar daha çok yavru bırakır;
    nesiller geçtikçe popülasyonun ortalama rengi zemine yaklaşır. Buna <b>doğal seçilim</b> denir.</p>
    <h3>Dene</h3>
    <ul>
      <li>8× hızda birkaç dakika bekle: renk histogramı zeminin rengi etrafında toplanır, "renk farkı" grafiği düşer.</li>
      <li>Sonra <b>zemin rengini</b> değiştir (ör. Sarı kum → Mavi taş). Önce çok balık avlanır, sonra popülasyon yeni
      renge doğru evrilir.</li>
      <li><b>Avcı sayısını 0</b> yap: seçilim kalkar, renkler rastgele dağılır (yalnızca mutasyon ve şans).</li>
      <li>Avcıları artır: hızlı ve küçük balıklar avantaj kazanır. Hız ve büyüklüğün bedeli daha fazla enerji harcamaktır.</li>
      <li>Mutasyon oranını 0 yap: yeni varyasyon oluşmaz, evrim yavaşlar; çok yükseltirsen uyum bozulur.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p>Bireye dayalı bir modeldir: her balığın enerjisi, yaşı ve genleri ayrı ayrı izlenir. Avcının bir balığı fark etme
    olasılığı, balığın zeminle renk tonu farkı ve boyutuyla artar. Gerçekte parlaklık, desen, hareket ve ışık da önemlidir;
    burada yalnızca renk tonu (renk çemberindeki konum) kullanılır. Sayılar ölçeklenmiştir.</p>
    <h3>Gerçek hayatta</h3>
    <p>İngiltere'de sanayi devriminde kurumla kararan ağaç gövdelerinde koyu renkli <b>biberli güveler</b> çoğaldı, hava
    temizlenince açık renkliler geri döndü. Kum renkli kertenkeleler, deniz dibindeki pisi balıkları ve karda beyaz tüy
    değiştiren hayvanlar da kamuflajın örnekleridir.</p>`,
});

const w = createWorld();
const tmpColor = new THREE.Color();
const floorColor = new THREE.Color();
const _sum = {};

// --- Akvaryum ---
const TW = BOX.x * 2 + 0.6, TD = BOX.z * 2 + 0.6, TH = BOX.y1 + 0.9;
const tank = new THREE.Group();
sim.scene.add(tank);
sim.scene.add(new THREE.AmbientLight(0x6fa8dc, 0.6));

function noiseTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, 256, 128);
  for (let k = 0; k < 2600; k++) {
    const v = 150 + Math.floor(Math.random() * 105);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 256, Math.random() * 128, 1 + Math.random() * 2.5, 1 + Math.random() * 2.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}
const sandTex = noiseTexture();
const floorMat = new THREE.MeshLambertMaterial({ map: sandTex });
const floor = new THREE.Mesh(new THREE.BoxGeometry(TW, 0.3, TD), floorMat);
floor.position.y = 0;
tank.add(floor);
const backMat = new THREE.MeshLambertMaterial({ map: sandTex });
const back = new THREE.Mesh(new THREE.PlaneGeometry(TW, TH), backMat);
back.position.set(0, TH / 2, -TD / 2);
tank.add(back);
// Cam ve su yüzeyi
const glass = new THREE.Mesh(new THREE.BoxGeometry(TW, TH, TD),
  new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.07, side: THREE.BackSide, depthWrite: false }));
glass.position.y = TH / 2;
tank.add(glass);
const edges = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry),
  new THREE.LineBasicMaterial({ color: 0x9bd8ff, transparent: true, opacity: 0.5 }));
edges.position.y = TH / 2;
tank.add(edges);
const water = new THREE.Mesh(new THREE.PlaneGeometry(TW, TD),
  new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
water.rotation.x = -Math.PI / 2;
water.position.y = BOX.y1 + 0.35;
tank.add(water);
// Alt dolap
const stand = new THREE.Mesh(new THREE.BoxGeometry(TW + 0.8, 1.2, TD + 0.8), new THREE.MeshLambertMaterial({ color: 0x1e293b }));
stand.position.y = -0.75;
tank.add(stand);

// Kayalar
{
  const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x6b7280 }), 9);
  const d = new THREE.Object3D();
  for (let k = 0; k < 9; k++) {
    d.position.set(rand(-BOX.x + 1, BOX.x - 1), 0.2, rand(-BOX.z + 0.5, -BOX.z * 0.2));
    d.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    d.scale.set(rand(0.6, 1.6), rand(0.4, 0.9), rand(0.6, 1.4));
    d.updateMatrix();
    rocks.setMatrixAt(k, d.matrix);
  }
  tank.add(rocks);
}

// Su yosunları (zemin tonunda, salınır)
const WEEDS = 26;
const weedGeo = new THREE.ConeGeometry(0.16, 1, 5);
weedGeo.translate(0, 0.5, 0);
const weedMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const weeds = instanced(weedGeo, weedMat, WEEDS);
const weedData = [];
for (let k = 0; k < WEEDS; k++) {
  const side = k % 3;
  const x = side === 2 ? rand(-BOX.x + 0.4, BOX.x - 0.4) : (side ? 1 : -1) * rand(BOX.x - 2, BOX.x - 0.3);
  const z = side === 2 ? rand(-BOX.z + 0.2, -BOX.z + 1.5) : rand(-BOX.z + 0.3, BOX.z - 0.3);
  weedData.push({ x, z, h: rand(1.8, 4.2), ph: rand(0, 6.28), l: rand(0.26, 0.4) });
  weeds.setColorAt(k, tmpColor.setRGB(1, 1, 1));
}
tank.add(weeds);

// --- Balık geometrisi (+X yönüne bakar) ---
function fishGeometry(fin = false) {
  const body = new THREE.SphereGeometry(1, 12, 8);
  body.scale(1, 0.5, 0.26);
  const tail = new THREE.ConeGeometry(0.5, 0.7, 4);
  tail.rotateZ(Math.PI / 2);
  tail.scale(1, 1, 0.2);
  tail.translate(-1.15, 0, 0);
  const parts = [body, tail];
  if (fin) {
    const dorsal = new THREE.ConeGeometry(0.3, 0.6, 4);
    dorsal.scale(1.2, 1, 0.15);
    dorsal.translate(-0.1, 0.62, 0);
    parts.push(dorsal);
  }
  const g = BufferGeometryUtils.mergeGeometries(parts.map((p) => p.toNonIndexed()));
  g.computeVertexNormals();
  return g;
}

const preyMesh = instanced(fishGeometry(false), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXP);
preyMesh.count = 0;
preyMesh.frustumCulled = false;
for (let i = 0; i < MAXP; i++) preyMesh.setColorAt(i, tmpColor.setRGB(1, 1, 1));
tank.add(preyMesh);

const predMesh = instanced(fishGeometry(true), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXH);
predMesh.frustumCulled = false;
for (let i = 0; i < MAXH; i++) predMesh.setColorAt(i, tmpColor.setHex(0x3f4a5a));
tank.add(predMesh);
const predLabels = [];
const predAnchors = [];
for (let i = 0; i < MAXH; i++) {
  const a = new THREE.Object3D();
  tank.add(a);
  predAnchors.push(a);
  const l = sim.label('avcı', { parent: a, position: [0, 0.9, 0], className: 'plain' });
  l.el.style.fontSize = '11px';
  l.el.style.color = '#fca5a5';
  predLabels.push(l);
}

const foodMesh = instanced(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshLambertMaterial({ color: 0xf59e0b, emissive: 0x7c2d12 }), MAXF);
foodMesh.count = 0;
foodMesh.frustumCulled = false;
tank.add(foodMesh);

// Kabarcıklar
const BUB = 70;
const bubPos = new Float32Array(BUB * 3);
for (let k = 0; k < BUB; k++) bubPos.set([BOX.x - 1.2 + rand(-0.3, 0.3), rand(0.2, BOX.y1), -BOX.z + 1 + rand(-0.3, 0.3)], k * 3);
const bubGeo = new THREE.BufferGeometry();
bubGeo.setAttribute('position', new THREE.BufferAttribute(bubPos, 3));
const bubbles = new THREE.Points(bubGeo, new THREE.PointsMaterial({ color: 0xcfefff, size: 0.12, transparent: true, opacity: 0.7 }));
bubbles.frustumCulled = false;
tank.add(bubbles);

// --- Renkler ---
const hueToColor = (h, out) => out.setHSL(h, 0.72, 0.52);
function applyFloor() {
  const h = w.params.floorHue;
  floorColor.setHSL(h, 0.55, 0.5);
  floorMat.color.copy(floorColor);
  backMat.color.setHSL(h, 0.45, 0.33);
  for (let k = 0; k < WEEDS; k++) weeds.setColorAt(k, tmpColor.setHSL((h + 0.02 * (k % 3)) % 1, 0.5, weedData[k].l));
  weeds.instanceColor.needsUpdate = true;
  floorChip.style.background = '#' + floorColor.getHexString();
}

// --- Çizim ---
const dummy = new THREE.Object3D();
dummy.rotation.order = 'YZX';
let wiggle = 0;
function syncMeshes() {
  const P = w.P;
  const n = P.n;
  preyMesh.count = n;
  for (let i = 0; i < n; i++) {
    const vx = P.vx[i], vy = P.vy[i], vz = P.vz[i];
    const hs = Math.hypot(vx, vz) + 1e-5;
    dummy.position.set(P.px[i], P.py[i], P.pz[i]);
    dummy.rotation.set(0, Math.atan2(-vz, vx) + Math.sin(wiggle * 9 + i) * 0.12, Math.atan2(vy, hs) * 0.8);
    const s = 0.3 * P.size[i] * Math.min(1, 0.55 + P.age[i] / 14);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    preyMesh.setMatrixAt(i, dummy.matrix);
    preyMesh.setColorAt(i, hueToColor(P.hue[i], tmpColor));
  }
  preyMesh.instanceMatrix.needsUpdate = true;
  if (preyMesh.instanceColor) preyMesh.instanceColor.needsUpdate = true;

  const H = w.H;
  for (let k = 0; k < MAXH; k++) {
    const q = H[k];
    if (!q.active) {
      dummy.scale.set(0, 0, 0);
      predLabels[k].visible = false;
    } else {
      dummy.position.set(q.x, q.y, q.z);
      dummy.rotation.set(0, Math.atan2(-q.vz, q.vx) + Math.sin(wiggle * 6 + k) * 0.08, Math.atan2(q.vy, Math.hypot(q.vx, q.vz) + 1e-5) * 0.7);
      dummy.scale.set(0.7, 0.7, 0.7);
      predAnchors[k].position.set(q.x, q.y, q.z);
      predLabels[k].visible = showLabels.value;
      predMesh.setColorAt(k, tmpColor.setHex(q.state === 1 ? 0x7f1d1d : 0x3f4a5a));
    }
    dummy.updateMatrix();
    predMesh.setMatrixAt(k, dummy.matrix);
  }
  predMesh.instanceMatrix.needsUpdate = true;
  predMesh.instanceColor.needsUpdate = true;

  const F = w.F;
  foodMesh.count = F.n;
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);
  for (let i = 0; i < F.n; i++) {
    dummy.position.set(F.x[i], F.y[i], F.z[i]);
    dummy.updateMatrix();
    foodMesh.setMatrixAt(i, dummy.matrix);
  }
  foodMesh.instanceMatrix.needsUpdate = true;
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Akvaryum');
const predators = ui.slider({ label: 'Avcı sayısı', min: 0, max: 10, step: 1, value: 5,
  onChange: (v) => { w.params.predators = v; w.syncPredators(); } });
const mutation = ui.slider({ label: 'Mutasyon oranı', min: 0, max: 0.15, step: 0.01, value: 0.05,
  format: (v) => (v === 0 ? 'yok' : `${fmt(v * 100, 0)} · ${v < 0.03 ? 'düşük' : v < 0.08 ? 'orta' : 'yüksek'}`),
  onChange: (v) => { w.params.mutation = v; } });
const food = ui.slider({ label: 'Yem miktarı', min: 2, max: 30, step: 1, value: 12, unit: 'tane/sn',
  onChange: (v) => { w.params.food = v; } });

const HUE_NAMES = [[0.04, 'kırmızı'], [0.1, 'turuncu'], [0.18, 'sarı'], [0.26, 'fıstık yeşili'], [0.45, 'yeşil'],
  [0.54, 'turkuaz'], [0.7, 'mavi'], [0.8, 'mor'], [0.93, 'pembe'], [1.01, 'kırmızı']];
const hueName = (h) => HUE_NAMES.find(([lim]) => h < lim)[1];
let floorToastTimer = 0;
const floorHue = ui.slider({ label: 'Zemin rengi', min: 0, max: 0.99, step: 0.01, value: 0.13,
  format: (v) => `${fmt(v * 360, 0)}° · ${hueName(v)}`,
  onInput: (v) => { w.params.floorHue = v; applyFloor(); floorPreset.set(null); },
  onChange: () => {
    clearTimeout(floorToastTimer);
    floorToastTimer = setTimeout(() => sim.toast('Zemin değişti: şimdi hangi balıklar göze batıyor?', 'warn'), 250);
  } });
const floorChip = ui.text('<span></span>').el;
floorChip.style.cssText = 'height:10px;border-radius:5px;margin:-4px 0 8px;';
const floorPreset = ui.segmented({
  options: [{ value: 0.13, label: 'Sarı kum' }, { value: 0.33, label: 'Yeşil yosun' }, { value: 0.6, label: 'Mavi taş' }, { value: 0.97, label: 'Mercan' }],
  value: 0.13,
  onChange: (v) => { floorHue.set(v, true); floorPreset.set(v); sim.toast('Zemin değişti: şimdi hangi balıklar göze batıyor?', 'warn'); },
});
ui.buttons([
  { label: '🍤 Yem serp', onClick: () => w.sprinkle(40) },
  { label: '🐟 Göçmen balıklar', title: 'Rastgele renkli 20 yeni balık ekler', onClick: () => immigrants(20) },
]);

ui.section('Durum');
const stGen = ui.stat({ label: 'Ortalama nesil' });
const stPop = ui.stat({ label: 'Av balığı' });
const stMatch = ui.stat({ label: 'Zeminle renk uyumu' });
const stEaten = ui.stat({ label: 'Avlanan / açlık' });
const stSpeed = ui.stat({ label: 'Ortalama hız' });
const stSize = ui.stat({ label: 'Ortalama boyut' });

// Renk histogramı
const histWrap = ui.text('<div class="chart-title">Renk tonu dağılımı (▼ zemin rengi)</div>');
const hist = document.createElement('canvas');
hist.style.cssText = 'width:100%;height:64px;display:block;border-radius:6px;background:rgba(148,163,184,.08)';
histWrap.el.append(hist);
const hctx = hist.getContext('2d');
const BINS = 36;
const bins = new Float32Array(BINS);
function drawHist() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = hist.clientWidth || 280, Hh = 64;
  if (hist.width !== Math.round(W * dpr)) { hist.width = Math.round(W * dpr); hist.height = Hh * dpr; }
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hctx.clearRect(0, 0, W, Hh);
  bins.fill(0);
  const P = w.P;
  for (let i = 0; i < P.n; i++) bins[Math.min(BINS - 1, Math.floor(P.hue[i] * BINS))]++;
  let mx = 1;
  for (let b = 0; b < BINS; b++) mx = Math.max(mx, bins[b]);
  const bw = W / BINS;
  for (let b = 0; b < BINS; b++) {
    const hgt = (bins[b] / mx) * (Hh - 16);
    hctx.fillStyle = `hsl(${((b + 0.5) / BINS) * 360},72%,52%)`;
    hctx.fillRect(b * bw + 0.5, Hh - 6 - hgt, bw - 1, hgt);
    hctx.fillRect(b * bw + 0.5, Hh - 4, bw - 1, 4);
  }
  const fx = w.params.floorHue * W;
  hctx.fillStyle = '#fff';
  hctx.beginPath(); hctx.moveTo(fx - 5, 0); hctx.lineTo(fx + 5, 0); hctx.lineTo(fx, 8); hctx.closePath(); hctx.fill();
}

const colorChart = ui.chart({ title: 'Zeminle renk farkı (nesiller boyunca, °)', yMin: 0, yMax: 180, maxPoints: 160,
  series: [{ name: 'Ortalama renk farkı', color: '#f472b6', fill: true }, { name: 'Renk çeşitliliği', color: '#a78bfa' }] });
const geneChart = ui.chart({ title: 'Ortalama hız ve boyut', yMin: 0, maxPoints: 160,
  series: [{ name: 'Av hızı', color: '#38bdf8' }, { name: 'Boyut', color: '#facc15' }, { name: 'Avcı hızı', color: '#94a3b8' }] });
const popChart = ui.chart({ title: 'Popülasyon', yMin: 0, maxPoints: 160,
  series: [{ name: 'Av balığı', color: '#22c55e' }, { name: 'Avcı × 10', color: '#ef4444' }] });

ui.section('Görünüm', { open: false });
const showLabels = ui.toggle({ label: 'Avcı etiketleri', value: true });
ui.toggle({ label: 'Kabarcıklar', value: true, onChange: (v) => (bubbles.visible = v) });
ui.text('İpucu: bir balığa tıkla, genlerini gör.', 'card');

function immigrants(n) {
  for (let k = 0; k < n; k++) {
    if (w.P.n >= MAXP) break;
    const P = w.P, i = P.n++;
    // model.addPrey dışarı açık değil; aynı alanları doldur
    P.px[i] = rand(-BOX.x, BOX.x); P.py[i] = rand(BOX.y0, 5); P.pz[i] = rand(-BOX.z, BOX.z);
    P.vx[i] = rand(-0.5, 0.5); P.vy[i] = 0; P.vz[i] = rand(-0.5, 0.5);
    P.hue[i] = Math.random(); P.spd[i] = rand(1.6, 2.8); P.size[i] = rand(0.85, 1.15);
    P.energy[i] = 2; P.age[i] = 8; P.maxAge[i] = rand(80, 110);
    let g = 0; for (let j = 0; j < i; j++) g += P.gen[j];
    P.gen[i] = i ? Math.round(g / i) : 1; P.id[i] = w.nextId++; P.flee[i] = 0;
    P.tFood[i] = -1; P.tFoodId[i] = -1; P.retarget[i] = 0;
  }
  sim.toast(`🐟 ${n} göçmen balık geldi: renkleri rastgele`, 'good');
}

// --- Döngü ---
let lastHalfGen = -1, extinctShown = false;
function pushCharts(s) {
  colorChart.push([s.diffDeg, s.hueSpread * 180]);
  geneChart.push([s.speed, s.size, s.predSpeed]);
  popChart.push([s.n, s.preds * 10]);
}

sim.onUpdate((dt) => {
  w.step(Math.min(dt * TIME, 1.6));
  wiggle += dt;
  w.summary(_sum);
  const hg = Math.floor(_sum.gen * 2);
  if (_sum.n && hg !== lastHalfGen) { lastHalfGen = hg; pushCharts(_sum); }
  if (!w.P.n && !extinctShown) {
    extinctShown = true;
    sim.hud.show(`<h2>Av balıkları tükendi</h2><p>Avcılar tüm balıkları yedi ya da yem yetmedi. Daha az avcı ya da daha çok yemle dene.</p>
      <button class="btn primary" data-act="restart">⟲ Yeniden başlat</button>`, { tone: 'bad' });
    sim.hud.el.querySelector('[data-act=restart]').onclick = () => sim.reset();
  }
});

let statAcc = 1;
sim.onRender((rdt) => {
  syncMeshes();
  // yosun salınımı ve kabarcıklar (gerçek zamanla)
  const t = performance.now() / 1000;
  for (let k = 0; k < WEEDS; k++) {
    const d = weedData[k];
    dummy.position.set(d.x, 0.1, d.z);
    dummy.rotation.set(Math.sin(t * 0.9 + d.ph) * 0.12, 0, Math.sin(t * 0.7 + d.ph) * 0.1);
    dummy.scale.set(1, d.h, 1);
    dummy.updateMatrix();
    weeds.setMatrixAt(k, dummy.matrix);
  }
  weeds.instanceMatrix.needsUpdate = true;
  if (bubbles.visible) {
    for (let k = 0; k < BUB; k++) {
      let y = bubPos[k * 3 + 1] + rdt * (1.2 + (k % 5) * 0.2);
      if (y > BOX.y1 + 0.3) y = 0.2;
      bubPos[k * 3 + 1] = y;
    }
    bubGeo.attributes.position.needsUpdate = true;
  }
  statAcc += rdt;
  if (statAcc < 0.5) return;
  statAcc = 0;
  const s = w.summary(_sum);
  stGen.set(s.n ? fmt(s.gen, 1) : '—');
  stPop.set(s.n, s.n < 30 ? 'bad' : s.n < 70 ? 'warn' : '');
  const match = s.n ? Math.round(100 - s.diffDeg / 1.8) : 0;
  stMatch.set(s.n ? `%${match}` : '—', match > 80 ? 'good' : match < 55 ? 'bad' : 'warn');
  stEaten.set(`${fmt(w.stats.eaten)} / ${fmt(w.stats.starved)}`);
  stSpeed.set(s.n ? fmt(s.speed, 2) : '—');
  stSize.set(s.n ? fmt(s.size, 2) : '—');
  drawHist();
});

sim.formatTime = () => `${Math.max(1, Math.round(_sum.gen || 1))}. nesil`;

// Balığa tıkla → genleri
sim.onClick(() => { preyMesh.computeBoundingSphere(); return [preyMesh]; }, (hit) => {
  const i = hit.instanceId;
  const P = w.P;
  if (i == null || i >= P.n) return;
  const c = hueDiff(P.hue[i], w.params.floorHue);
  sim.toast(`🐟 <b>${P.gen[i]}. nesil</b> · renk ${fmt(P.hue[i] * 360, 0)}° (${hueName(P.hue[i])}) · hız ${fmt(P.spd[i], 2)} · boyut ${fmt(P.size[i], 2)}<br>` +
    `Zeminle renk farkı: ${fmt(c * 180, 0)}° → ${c < 0.15 ? 'iyi kamufle' : c < 0.4 ? 'biraz göze batıyor' : 'çok göze batıyor'}`);
});

sim.onReset(() => {
  w.reset(INITIAL);
  colorChart.clear(); geneChart.clear(); popChart.clear();
  lastHalfGen = -1; extinctShown = false;
  sim.hud.hide();
  w.summary(_sum);
});

applyFloor();
w.params.predators = predators.value;
w.params.mutation = mutation.value;
w.params.food = food.value;
sim.reset();
