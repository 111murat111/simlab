// Dil Evrimi — köyler arasında düzenli ses değişimleri, ödünçleme ve dalga yayılımı; UPGMA soy ağacı.
import { createSim, THREE, ImprovedNoise, clamp, smoothstep, fmt, pick } from '@core';
import { VOCAB, RULES, metathesis, similarity, upgma, cutTree } from './lang.js';

const GEN_PER_SEC = 1.25;
const MAX_GEN = 200;

const sim = createSim({
  background: 0x8fbfe0,
  camera: { position: [1, 25, 23], target: [-1, 0, -0.5], fov: 50 },
  controls: { minDistance: 8, maxDistance: 70 },
  fog: [55, 110],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Altı köy aynı <b>ata dili</b> konuşarak başlar (14 temel sözcük: su, göz, taş, ev, yol, ekmek…). Her nesilde (~25 yıl)
    bir köyde bir <b>ses değişimi</b> başlayabilir. Değişim <b>düzenlidir</b>: o sesi içeren bütün sözcüklere birden uygulanır
    (ör. <i>ş → s</i>: taş → tas, baş → bas, kuş → kus). Türk dillerinde gerçekten görülen değişimler kullanıldı:
    başta ötümlüleşme (taş → daş, Azerice/Türkmence gibi), <i>y → c</i> (yol → col, Kırgızca gibi), ünsüz yumuşaması,
    ğ düşmesi (dağ → daa), ünlü uyumu değişimleri, ses göçüşmesi (yıldız → yıdlız).</p>
    <p>Yollar <b>temas</b> demektir: komşular birbirinden sözcük <b>ödünç alır</b> ve bir ses değişimi komşuya yayılabilir
    (dalga modeli). Dağlar ve deniz teması zayıflatır; kopan köyler hızla ayrışır.</p>
    <p>Benzerlik = 1 − Levenshtein uzaklığı / sözcük uzunluğu (14 sözcüğün ortalaması). Soy ağacı <b>UPGMA</b> yöntemiyle
    bu uzaklıklardan kurulur. Benzerlik %70'in altına inince köyleri "ayrı dil" sayıyoruz (temsili eşik).</p>
    <h3>Dene</h3>
    <ul>
      <li>Adaköy'ün deniz yolunu kes (<b>İzolasyon</b>): birkaç yüz yıl sonra ağaçta en uzak dal olur.</li>
      <li>Tüm yolları güçlü yap: köyler birlikte değişir, tek bir dil gibi kalır ama ata dilden yine uzaklaşır.</li>
      <li>İki uzak köyü <b>Göç</b> ile karıştır: ağaçta aniden yakınlaşırlar.</li>
      <li>Bir köye tıkla: sözcük listesini ata dille karşılaştır. Düzenli değişimler sayesinde dilbilimciler bu eşleşmelerden
      ata dili geri kurabilir (karşılaştırmalı yöntem).</li>
    </ul>
    <p><small>Gerçek diller çok daha karmaşıktır (anlam kayması, dilbilgisi, prestij, yazı). Sayılar temsili; model
    kavramları göstermek içindir.</small></p>`,
});

// --- Arazi ---
const noise = new ImprovedNoise();
function ridge(x, z, x0, z0, z1, h, w, passZ) {
  const fade = smoothstep(z0 - 1, z0 + 2, z) * smoothstep(z1 + 1, z1 - 2, z);
  const pass = 1 - 0.62 * Math.exp(-((z - passZ) ** 2) / 1.6);
  return h * Math.exp(-((x - x0 + Math.sin(z * 0.5) * 0.6) ** 2) / (w * w)) * fade * pass * (1 + 0.3 * noise.noise(x * 0.4, 3, z * 0.4));
}
function height(x, z) {
  let h = 0.7 + noise.noise(x * 0.12, 0.5, z * 0.12) * 0.7;
  const coast = -8.5 + Math.sin(z * 0.3) * 1.2;
  h -= smoothstep(coast, coast - 5, x) * 2.8;
  h += 2.4 * Math.exp(-((x + 16) ** 2 + (z + 3) ** 2) / 7);
  h += ridge(x, z, 4.8, -0.5, 14, 4.6, 1.5, 3.8);
  h += ridge(x, z, 9.6, -15, -1.5, 4.2, 1.4, -6.4);
  h += 1.1 * Math.exp(-((x - 9.5) ** 2 + (z - 6) ** 2) / 12);
  return h;
}
{
  const g = new THREE.PlaneGeometry(48, 36, 140, 105);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = height(x, z);
    p.setY(i, y);
    if (y < 0.25) c.setHex(0xd9c690); else if (y < 1.6) c.setHex(0x6aa84f).lerp(new THREE.Color(0x8cbf5f), noise.noise(x, 1, z) * 0.5 + 0.5);
    else if (y < 3.2) c.setHex(0x8a7a64); else c.setHex(0xf1f5f9);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  sim.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), new THREE.MeshStandardMaterial({ color: 0x2f7fc1, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.88 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0.08;
  sim.scene.add(sea);
}
sim.label('⛰️ Dağlar', { position: [4.8, 5.2, 10], className: 'plain' });
sim.label('🌊 Deniz', { position: [-13, 0.6, 8], className: 'plain' });

// --- Köyler ---
const VILLAGES = [
  { name: 'Kıyıköy', x: -6.2, z: 4, color: '#f97316' },
  { name: 'Ovacık', x: 0, z: 1, color: '#22c55e' },
  { name: 'Dereköy', x: 2, z: -6, color: '#38bdf8' },
  { name: 'Yaylabaşı', x: 9.5, z: 6, color: '#e879f9' },
  { name: 'Uzakyurt', x: 14, z: -7, color: '#facc15' },
  { name: 'Adaköy', x: -16, z: -3, color: '#f87171' },
];
const ROADS = [
  { a: 0, b: 1, name: 'Kıyıköy – Ovacık', s: 0.8 },
  { a: 1, b: 2, name: 'Ovacık – Dereköy', s: 0.7 },
  { a: 1, b: 3, name: 'Ovacık – Yaylabaşı (dağ geçidi)', s: 0.3 },
  { a: 2, b: 4, name: 'Dereköy – Uzakyurt (dağ geçidi)', s: 0.25 },
  { a: 0, b: 5, name: 'Kıyıköy – Adaköy (deniz yolu)', s: 0.2, sea: true },
];
const houseG = new THREE.BoxGeometry(0.5, 0.4, 0.5); houseG.translate(0, 0.2, 0);
const roofG = new THREE.ConeGeometry(0.42, 0.35, 4); roofG.rotateY(Math.PI / 4); roofG.translate(0, 0.57, 0);
const houses = new THREE.InstancedMesh(houseG, new THREE.MeshStandardMaterial({ color: 0xf5f0e6 }), 60);
const roofs = new THREE.InstancedMesh(roofG, new THREE.MeshStandardMaterial({ color: 0xb4532a }), 60);
sim.scene.add(houses, roofs);
const markers = [];
{
  const d = new THREE.Object3D();
  let k = 0;
  VILLAGES.forEach((v, vi) => {
    v.y = Math.max(0.1, height(v.x, v.z));
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4 + vi, r = 0.5 + (i % 3) * 0.55;
      const x = v.x + Math.cos(a) * r, z = v.z + Math.sin(a) * r;
      d.position.set(x, Math.max(0.1, height(x, z)) - 0.05, z);
      d.rotation.y = a;
      d.scale.setScalar(0.8 + (i % 2) * 0.35);
      d.updateMatrix();
      houses.setMatrixAt(k, d.matrix); roofs.setMatrixAt(k, d.matrix); k++;
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.12, 8, 40), new THREE.MeshBasicMaterial({ color: v.color }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(v.x, v.y + 0.1, v.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x57534e }));
    pole.position.set(v.x, v.y + 0.8, v.z);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), new THREE.MeshStandardMaterial({ color: v.color, side: THREE.DoubleSide }));
    flag.position.set(v.x + 0.36, v.y + 1.35, v.z);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 2, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(v.x, v.y + 0.8, v.z);
    hit.userData.vi = vi;
    sim.scene.add(ring, pole, flag, hit);
    markers.push(hit);
    v.ring = ring; v.flag = flag;
    v.label = sim.label('', { position: [v.x, v.y + 2.2, v.z], className: 'clickable' });
    v.label.el.addEventListener('click', () => selectVillage(vi));
  });
  houses.count = roofs.count = k;
}

// Yollar: tüp + üzerinde gezgin noktalar
const travelerG = new THREE.SphereGeometry(0.13, 8, 6);
ROADS.forEach((r) => {
  const A = VILLAGES[r.a], B = VILLAGES[r.b];
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t + Math.sin(t * Math.PI) * (r.sea ? 1.5 : 0.8);
    pts.push(new THREE.Vector3(x, r.sea ? 0.2 : Math.max(0.15, height(x, z)) + 0.12, z));
  }
  r.curve = new THREE.CatmullRomCurve3(pts);
  r.mat = new THREE.MeshStandardMaterial({ color: r.sea ? 0xe0f2fe : 0xa16207, transparent: true });
  r.mesh = new THREE.Mesh(new THREE.TubeGeometry(r.curve, 80, 0.11, 6), r.mat);
  sim.scene.add(r.mesh);
  r.trav = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(travelerG, new THREE.MeshBasicMaterial({ color: r.sea ? 0xffffff : 0xfef08a }));
    m.userData.ph = i / 3;
    sim.scene.add(m);
    return m;
  });
});

// --- Dil durumu ---
let lex, gen, logs, pending, selected = 1, history, finished;
const P = { drift: 0.35, contact: 0.5, showWord: '3' };

function reset() {
  lex = VILLAGES.map(() => VOCAB.slice());
  gen = 0; logs = []; pending = []; history = []; finished = false;
  chart.clear();
  sim.hud.hide();
  refresh();
}
function applyRule(vi, rule, how) {
  const before = lex[vi];
  const after = before.map(rule.f);
  const ex = [];
  after.forEach((w, k) => { if (w !== before[k] && ex.length < 3) ex.push(`${before[k]} → <b>${w}</b>`); });
  if (!ex.length) return false;
  lex[vi] = after;
  log(vi, `${rule.name} (${rule.short})${how ? ' · ' + how : ''}: ${ex.join(', ')}`);
  // Dalga modeli: değişim komşulara yayılabilir
  for (const r of ROADS) {
    const j = r.a === vi ? r.b : r.b === vi ? r.a : -1;
    if (j >= 0 && Math.random() < r.s * P.contact * 0.6) pending.push({ vi: j, rule, from: vi });
  }
  return true;
}
function log(vi, html) {
  logs.unshift(`<b style="color:${VILLAGES[vi].color}">${gen}. nesil · ${VILLAGES[vi].name}</b>: ${html}`);
  if (logs.length > 7) logs.pop();
}
function step() {
  gen++;
  // Önceki nesilden yayılan değişimler
  const pend = pending; pending = [];
  for (const p of pend) applyRule(p.vi, p.rule, `${VILLAGES[p.from].name}'dan yayıldı`);
  VILLAGES.forEach((v, vi) => {
    if (Math.random() < P.drift * 0.35) {
      for (let tries = 0; tries < 6; tries++) if (applyRule(vi, pick(RULES))) break;
    }
    if (Math.random() < P.drift * 0.12) {
      const k = Math.floor(Math.random() * VOCAB.length);
      const w = metathesis(lex[vi][k]);
      if (w !== lex[vi][k]) { log(vi, `Ses göçüşmesi (tek sözcük): ${lex[vi][k]} → <b>${w}</b>`); lex[vi][k] = w; }
    }
  });
  // Ödünçleme
  for (const r of ROADS) {
    if (Math.random() < r.s * P.contact * 0.5) {
      const [from, to] = Math.random() < 0.5 ? [r.a, r.b] : [r.b, r.a];
      const k = Math.floor(Math.random() * VOCAB.length);
      if (lex[from][k] !== lex[to][k]) {
        log(to, `Ödünçleme: <b>${lex[from][k]}</b> sözcüğünü ${VILLAGES[from].name}'dan aldı (önceki: ${lex[to][k]})`);
        lex[to][k] = lex[from][k];
      }
    }
  }
  const s = stats();
  chart.push([s.proto * 100, s.avg * 100, s.min * 100]);
  if (gen === MAX_GEN && !finished) {
    finished = true;
    sim.pause();
    sim.hud.show(`<h2>⏳ ${fmt(gen * 25)} yıl geçti</h2>${s.langs} ayrı dil oluştu · ata dile benzerlik %${fmt(s.proto * 100)}<br>
      <button class="btn primary" data-a="go">▶ Devam et</button><button class="btn" data-a="new">⟲ Baştan</button>`, { tone: 'good' });
    sim.hud.el.querySelector('[data-a=go]').onclick = () => { sim.hud.hide(); sim.play(); };
    sim.hud.el.querySelector('[data-a=new]').onclick = () => { reset(); sim.play(); };
  }
}
function stats() {
  const n = VILLAGES.length;
  const S = [];
  let sum = 0, cnt = 0, mn = 1, proto = 0;
  for (let i = 0; i < n; i++) { S[i] = []; proto += similarity(lex[i], VOCAB) / n; }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) { S[i][j] = 1; continue; }
    if (j < i) { S[i][j] = S[j][i]; continue; }
    S[i][j] = similarity(lex[i], lex[j]);
    sum += S[i][j]; cnt++; mn = Math.min(mn, S[i][j]);
  }
  const D = S.map((r) => r.map((v) => 1 - v));
  const tree = upgma(D);
  const cut = cutTree(tree, 0.15, n);
  return { S, avg: sum / cnt, min: mn, proto, tree, langs: cut.count, labels: cut.labels };
}

// --- Güncelleme ---
let acc = 0;
sim.onUpdate((dt) => {
  if (finished && gen >= MAX_GEN && sim.paused) return;
  acc += dt * GEN_PER_SEC;
  let n = Math.min(Math.floor(acc), 10);
  acc -= Math.floor(acc);
  if (n > 0) { while (n--) step(); refresh(); }
});
let travT = 0;
sim.onRender((real) => {
  if (!sim.paused) travT += real * Math.min(sim.speed, 3) * 0.25;
  for (const r of ROADS) {
    r.mat.opacity = 0.25 + 0.75 * r.s;
    r.mat.color.setHex(r.s <= 0.001 ? 0xdc2626 : r.sea ? 0xe0f2fe : 0xa16207);
    r.trav.forEach((m, i) => {
      m.visible = r.s > i * 0.3 + 0.01;
      const t = (travT * (0.6 + r.s) + m.userData.ph) % 1;
      m.position.copy(r.curve.getPointAt(i % 2 ? 1 - t : t));
      m.position.y += 0.12;
    });
  }
  VILLAGES.forEach((v, i) => { v.flag.rotation.y = Math.sin(travT * 8 + i) * 0.3; });
});

// --- Panel ---
const ui = sim.ui;
ui.section('Evrim');
const sDrift = ui.slider({ label: 'Ses değişimi hızı', min: 0, max: 1, step: 0.05, value: P.drift, format: (v) => `${fmt(v * 100)}%`, onChange: (v) => { P.drift = v; } });
const sContact = ui.slider({ label: 'Temasın etkisi (ödünçleme)', min: 0, max: 1, step: 0.05, value: P.contact, format: (v) => `${fmt(v * 100)}%`, onChange: (v) => { P.contact = v; } });
ui.buttons([
  { label: '⏭ 1 nesil', onClick: () => { step(); refresh(); } },
  { label: '⏩ 10 nesil', onClick: () => { for (let i = 0; i < 10; i++) step(); refresh(); } },
]);
ui.section('Yollar (temas gücü)');
const roadSliders = ROADS.map((r) => ui.slider({ label: r.name, min: 0, max: 1, step: 0.05, value: r.s, format: (v) => (v <= 0.001 ? '⛔ kapalı' : `${fmt(v * 100)}%`), onChange: (v) => { r.s = v; } }));
ui.section('Olaylar');
const roadSel = ui.select({ label: 'Yol', options: ROADS.map((r, i) => ({ value: i, label: r.name })), value: 4 });
ui.button({ label: '⛔ İzolasyon: yolu kes', variant: 'danger', onClick: () => {
  const i = +roadSel.value; ROADS[i].s = 0; roadSliders[i].set(0);
  sim.toast(`⛔ ${ROADS[i].name} yolu kesildi`, 'bad');
} });
const vOpts = VILLAGES.map((v, i) => ({ value: i, label: v.name }));
const migFrom = ui.select({ label: 'Göç eden köy', options: vOpts, value: 5 });
const migTo = ui.select({ label: 'Göç edilen köy', options: vOpts, value: 4 });
ui.button({ label: '🚶 Göç: nüfusları karıştır', variant: 'primary', onClick: () => {
  const a = +migFrom.value, b = +migTo.value;
  if (a === b) { sim.toast('Farklı iki köy seç', 'warn'); return; }
  let changed = 0;
  lex[b] = lex[b].map((w, k) => (Math.random() < 0.5 && w !== lex[a][k] ? (changed++, lex[a][k]) : w));
  log(b, `🚶 ${VILLAGES[a].name}'dan göç: ${changed} sözcük yeni gelenlerin biçimine geçti`);
  sim.toast(`🚶 ${VILLAGES[a].name} halkı ${VILLAGES[b].name}'e göçtü`, 'good');
  refresh();
} });
ui.section('Görünüm');
ui.select({ label: 'Etiketlerde gösterilen', options: [{ value: '3', label: '3 sözcük (taş · yol · ekmek)' }, ...VOCAB.map((w, i) => ({ value: 'w' + i, label: `"${w}" sözcüğü` }))], value: '3', onChange: (v) => { P.showWord = v; refresh(); } });

ui.section('Sonuç');
const stGen = ui.stat({ label: 'Nesil (~25 yıl)' });
const stProto = ui.stat({ label: 'Ata dile benzerlik', unit: '%' });
const stLangs = ui.stat({ label: 'Ayrı dil (<%70)' });
const chart = ui.chart({ title: 'Benzerlik (%)', series: [{ name: 'Ata dile', color: '#f59e0b' }, { name: 'Köyler ort.', color: '#38bdf8', fill: true }, { name: 'En farklı çift', color: '#f472b6' }], maxPoints: 200, yMin: 0, yMax: 100 });
const treeWrap = document.createElement('div');
treeWrap.className = 'chart';
treeWrap.innerHTML = '<div class="chart-title">Soy ağacı (UPGMA) · kesikli çizgi: dil sınırı</div>';
const treeC = document.createElement('canvas');
treeC.style.height = '150px';
treeWrap.append(treeC);
ui.append(treeWrap);
const lexCard = ui.text('', 'card');
ui.text('<b>Son değişimler</b>');
const logCard = ui.text('', 'card');

function selectVillage(i) {
  selected = i;
  refresh();
  sim.toast(`🔍 ${VILLAGES[i].name} sözlüğü panelde`, '');
}
sim.onClick(markers, (hit) => selectVillage(hit.object.userData.vi));

function refresh() {
  const s = stats();
  stGen.set(gen);
  stProto.set(Math.round(s.proto * 100), s.proto > 0.8 ? 'good' : s.proto > 0.6 ? 'warn' : 'bad');
  stLangs.set(s.langs, s.langs <= 1 ? 'good' : s.langs <= 3 ? 'warn' : 'bad');
  // Köy etiketleri
  const CL = ['#fde68a', '#bae6fd', '#fbcfe8', '#bbf7d0', '#ddd6fe', '#fecaca'];
  VILLAGES.forEach((v, i) => {
    const ks = P.showWord === '3' ? [2, 4, 5] : [+P.showWord.slice(1)];
    const words = ks.map((k) => (lex[i][k] === VOCAB[k] ? lex[i][k] : `<span style="color:#fbbf24">${lex[i][k]}</span>`)).join(' · ');
    const sim100 = Math.round(similarity(lex[i], VOCAB) * 100);
    v.label.setText(`<b style="color:${v.color}">${v.name}</b> <small style="color:${CL[s.labels[i] % CL.length]}">● dil ${s.labels[i] + 1}</small><br><span style="font-size:14px">${words}</span><br><small>ata dile %${sim100}</small>`);
    v.label.el.style.outline = i === selected ? `2px solid ${v.color}` : '';
    v.ring.scale.setScalar(i === selected ? 1.25 : 1);
  });
  // Seçili köy sözlüğü
  const L = lex[selected];
  lexCard.set(`<b style="color:${VILLAGES[selected].color}">${VILLAGES[selected].name}</b> sözlüğü (ata dil → bugün):<br>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;margin-top:6px;font-size:12.5px">
    ${VOCAB.map((w, k) => `<span>${w} → ${L[k] === w ? `<span style="color:#94a3b8">${w}</span>` : `<b style="color:#fbbf24">${L[k]}</b>`}</span>`).join('')}</div>
    <small>Diğer köylere benzerlik: ${VILLAGES.map((v, j) => (j === selected ? '' : `${v.name} %${Math.round(s.S[selected][j] * 100)}`)).filter(Boolean).join(' · ')}</small>`);
  logCard.set(logs.length ? logs.join('<br>') : 'Henüz değişim yok. ▶ ile zamanı akıt.');
  drawTree(s.tree);
}

function drawTree(root) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = treeC.clientWidth || 260, H = 150;
  if (treeC.width !== W * dpr) { treeC.width = W * dpr; treeC.height = H * dpr; }
  const g = treeC.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const pl = 74, pr = 10, pt = 10, pb = 18;
  const maxH = Math.max(0.25, root.h * 1.1);
  const X = (h) => pl + (h / maxH) * (W - pl - pr);
  const order = [];
  (function walk(n) { if (n.leaf != null) order.push(n.leaf); else { walk(n.left); walk(n.right); } })(root);
  const ly = {};
  order.forEach((l, i) => (ly[l] = pt + ((H - pt - pb) * (i + 0.5)) / order.length));
  g.lineWidth = 1.8;
  function draw(n) {
    if (n.leaf != null) return ly[n.leaf];
    const y1 = draw(n.left), y2 = draw(n.right);
    const x = X(n.h);
    g.strokeStyle = '#cbd5e1';
    g.beginPath();
    g.moveTo(X(n.left.h), y1); g.lineTo(x, y1); g.lineTo(x, y2); g.lineTo(X(n.right.h), y2);
    g.stroke();
    return (y1 + y2) / 2;
  }
  draw(root);
  g.font = '11px system-ui'; g.textAlign = 'right'; g.textBaseline = 'middle';
  order.forEach((l) => { g.fillStyle = VILLAGES[l].color; g.fillText(VILLAGES[l].name, pl - 6, ly[l]); });
  // Dil sınırı (benzerlik %70 → yükseklik 0,15)
  g.setLineDash([4, 3]); g.strokeStyle = '#f87171'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(X(0.15), pt - 4); g.lineTo(X(0.15), H - pb + 2); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(148,163,184,.9)'; g.font = '10px system-ui'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  for (const v of [0, 0.1, 0.2, 0.3, 0.4, 0.5].filter((v) => v <= maxH)) g.fillText(`%${fmt(v * 200)}`, X(v), H);
}

sim.formatTime = () => `${gen}. nesil · ~${fmt(gen * 25)} yıl`;
sim.onReset(() => {
  ROADS.forEach((r, i) => { r.s = [0.8, 0.7, 0.3, 0.25, 0.2][i]; roadSliders[i].set(r.s); });
  P.drift = 0.35; P.contact = 0.5; sDrift.set(0.35); sContact.set(0.5);
  reset();
  if (sim.paused) sim.play();
});
new ResizeObserver(() => refresh()).observe(sim.ui.body);
reset();
