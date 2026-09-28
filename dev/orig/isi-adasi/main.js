// Şehir Isı Adası — hücre tabanlı yüzey enerji dengesi, termal kamera, gün/gece döngüsü ve tıklayarak yeşillendirme.
import { createSim, THREE, fmt, clamp, lerp, seeded, instanced, heatColor } from '@core';
import { solve, sunElev, ASPHALT } from './model.js';

const G = 17, CS = 2, HALF = (G * CS) / 2;
const T_LO = 18, T_HI = 62; // termal kamera renk ölçeği (°C)

const sim = createSim({
  background: 0x9cc9f0,
  camera: { position: [4, 32, 40], target: [0, 0, 1], fov: 45 },
  controls: { maxDistance: 120, minDistance: 10 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Temsili bir kent dokusu (yollar, bina adaları, parklar) ve çevresindeki kırsal alan. Her hücre için basit bir
    <b>yüzey enerji dengesi</b> çözülür: emilen güneş ışınımı (1 − albedo), uzun dalga ışınım kaybı, havaya verilen duyulur ısı,
    bitkilerin terlemesiyle <b>buharlaşma serinlemesi</b>, zemine/binaya depolanan ısı ve trafik–klima kaynaklı <b>atık ısı</b>.</p>
    <p>Koyu asfalt ve çatılar gündüz güneşi emip depolar; dar sokak kanyonları geceleyin gökyüzüne ısı yayamaz.
    Bu yüzden kent–kır hava sıcaklığı farkı çoğunlukla <b>gece</b> en büyüktür (tipik 2–5 °C).</p>
    <h3>Dene</h3>
    <ul>
      <li>"Termal kamera"yı aç, saat 14:00 civarında asfalt ile parkı karşılaştır.</li>
      <li>Beyaz çatı oranını %80 yap: gündüz çatı sıcaklığı kaç derece düştü?</li>
      <li>Bina yüksekliğini artır: gündüz sokaklar gölgelenir ama gece ısı adası büyür.</li>
      <li>Haritada hücrelere tıklayarak ağaç dik veya çatıları boya.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Açık renkli "serin çatılar" güneşin çoğunu geri yansıtır; ağaçlar hem gölge yapar hem de terleyerek havayı serinletir.
    Birçok şehir ağaçlandırma, yeşil çatı ve açık renkli kaplamayla ısı dalgalarında sağlık riskini ve klima yükünü azaltmaya çalışıyor.</p>
    <p><small>Model: açık ve rüzgârsız bir temmuz günü, 41° K enlemi; kırsal hava 21–32 °C. Albedo, ısı kapasitesi ve buharlaşma
    değerleri tipik literatür aralıklarından seçilmiş yaklaşık değerlerdir. Kent havası tek bir "kutu" olarak alınır (gündüz karışım
    güçlü, gece zayıf). Klima tahmini: 100 m² daire, 24 °C üzeri her derece-saat için ≈0,05 kWh elektrik (COP ≈ 3).</small></p>`,
});

// --- Hücreler ---
const rnd = seeded(11);
const cells = [];
for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
  const road = i % 4 === 0 || j % 4 === 0;
  cells.push({ i, j, x: -HALF + CS * (i + 0.5), z: -HALF + CS * (j + 0.5), road, r: rnd(), q: rnd(), hv: 0.7 + rnd() * 0.6, ov: null, type: 'road', tree: 0 });
}

function assign() {
  const park = parkS.value / 100, white = whiteS.value / 100, green = greenS.value / 100;
  for (const c of cells) {
    if (c.road) {
      c.type = 'road';
      c.tree = c.ov === 'tree' ? 1 : c.ov === 'none' ? 0 : c.r < park * 0.8 ? 0.8 : 0;
      continue;
    }
    let t = c.r < park * 0.6 ? (c.q < 0.5 ? 'tree' : 'park') : 'roof';
    if (t === 'roof') t = c.q < white ? 'white' : c.q < white + green ? 'green' : 'roof';
    if (c.ov) t = c.ov === 'none' ? 'roof' : c.ov;
    c.type = t;
    c.tree = 0;
  }
}

// --- Sahne nesneleri ---
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7f9a4f, roughness: 1 }));
ground.position.y = -0.06;
sim.scene.add(ground);
const fields = instanced(new THREE.BoxGeometry(1, 0.04, 1), new THREE.MeshStandardMaterial({ roughness: 1 }), 60);
{
  const m = new THREE.Matrix4(), c = new THREE.Color();
  for (let k = 0; k < 60; k++) {
    let x, z;
    do { x = (rnd() - 0.5) * 110; z = (rnd() - 0.5) * 110; } while (Math.abs(x) < HALF + 5 && Math.abs(z) < HALF + 5);
    m.compose(new THREE.Vector3(x, -0.04, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 0.3), new THREE.Vector3(6 + rnd() * 8, 1, 5 + rnd() * 7));
    fields.setMatrixAt(k, m);
    fields.setColorAt(k, c.setHex([0xb6a55a, 0x8fae55, 0x6f8f42, 0xc9b56b][k % 4]));
  }
}
sim.scene.add(fields);

const tiles = instanced(new THREE.BoxGeometry(CS, 0.1, CS), new THREE.MeshStandardMaterial({ roughness: 0.9 }), cells.length);
cells.forEach((c, k) => tiles.setMatrixAt(k, new THREE.Matrix4().makeTranslation(c.x, -0.05, c.z)));
const bodies = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.85 }), cells.length);
const roofs = instanced(new THREE.BoxGeometry(1, 0.12, 1), new THREE.MeshStandardMaterial({ roughness: 0.7 }), cells.length);
const TREE_MAX = cells.length * 2;
const trees = instanced(new THREE.IcosahedronGeometry(0.62, 0), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), TREE_MAX);
sim.scene.add(tiles, bodies, roofs, trees);
const bodyCell = [], treeCell = [];

// Kır istasyonu ve etiketler
const station = new THREE.Group();
station.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.2).translate(0, 1.1, 0), new THREE.MeshStandardMaterial({ color: 0xe5e7eb })));
station.add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.8).translate(0, 2.3, 0), new THREE.MeshStandardMaterial({ color: 0xf8fafc })));
station.position.set(-HALF - 3, 0, -HALF + 3);
sim.scene.add(station);
const ruralLbl = sim.label('', { parent: station, position: [0, 3.6, 0] });
const cityLbl = sim.label('', { position: [0, 9, 0], className: 'big' });

// Güneş
const sunL = sim.scene.userData.sun, hemi = sim.scene.userData.hemi;
const sunBall = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 12), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
sim.scene.add(sunBall);
const skyDay = new THREE.Color(0x9cc9f0), skyNight = new THREE.Color(0x0a1224), skyDusk = new THREE.Color(0xf0a36b);

const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), q0 = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
const COL = { road: 0x3a3d42, park: 0x5f9a45, tree: 0x4c7f36, roof: 0x5a4a44, white: 0xf3f4f6, green: 0x4fa34a };

function buildGeometry() {
  let nb = 0, nt = 0;
  bodyCell.length = treeCell.length = 0;
  const hBase = hwS.value * CS;
  for (const [k, c] of cells.entries()) {
    if (c.type === 'roof' || c.type === 'white' || c.type === 'green') {
      const h = Math.max(0.6, hBase * c.hv);
      bodies.setMatrixAt(nb, tmpM.compose(v1.set(c.x, 0, c.z), q0, v2.set(CS * 0.9, h, CS * 0.9)));
      roofs.setMatrixAt(nb, tmpM.compose(v1.set(c.x, h + 0.06, c.z), q0, v2.set(CS * 0.92, 1, CS * 0.92)));
      bodyCell[nb++] = k;
    }
    const nTree = c.type === 'tree' ? 2 : c.type === 'park' ? 1 : c.tree > 0 ? 2 : 0;
    for (let t = 0; t < nTree && nt < TREE_MAX; t++) {
      const off = c.road ? (t ? 0.55 : -0.55) : (t ? 0.4 : -0.4);
      const s = c.type === 'tree' ? 1.2 : c.road ? 0.75 : 0.9;
      trees.setMatrixAt(nt, tmpM.compose(v1.set(c.x + off, 0.9 * s, c.z - off * (c.road ? -1 : 0.6)), q0, v2.set(s, s * 1.15, s)));
      treeCell[nt++] = k;
    }
  }
  bodies.count = roofs.count = nb;
  trees.count = nt;
  for (const m of [bodies, roofs, trees]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
  colorize();
}

// --- Çözüm ve güncel değerler ---
let sol = null, dirty = true, lastSolve = 0;
const curT = new Float32Array(cells.length);
let cur = { city: 0, rural: 0, surf: 0, rsurf: 0 };
const markDirty = () => { dirty = true; };
function doSolve() {
  assign();
  sol = solve(cells, { hw: hwS.value, qf: qfS.value, asphalt: asphaltS.value });
  buildGeometry();
  // 24 saatlik grafik ve günlük özetler
  chart.clear();
  let maxNight = -99, maxDay = -99, cdhC = 0, cdhR = 0, hot = -99;
  for (let k = 0; k <= 48; k++) {
    const a = sol.air[k % 48];
    chart.push([a.city, a.rural, sol.surfMean[k % 48], sol.ruralSurf[k % 48]]);
    if (k === 48) break;
    const d = a.city - a.rural, h = k / 2;
    if (h < 6 || h >= 21) maxNight = Math.max(maxNight, d); else if (h >= 10 && h <= 17) maxDay = Math.max(maxDay, d);
    cdhC += Math.max(0, a.city - 24) * 0.5; cdhR += Math.max(0, a.rural - 24) * 0.5;
    for (let i = 0; i < cells.length; i++) hot = Math.max(hot, sol.ts[k * cells.length + i]);
  }
  const kwh = (cdh) => (0.15 * cdh) / 3;
  stNight.set(`+${fmt(maxNight, 1)} °C`, maxNight > 4 ? 'bad' : maxNight > 2 ? 'warn' : 'good');
  stDay.set(`${maxDay >= 0 ? '+' : ''}${fmt(maxDay, 1)} °C`);
  stAC.set(`${fmt(kwh(cdhC), 1)} kWh/gün`, cdhC > cdhR * 1.3 ? 'bad' : cdhC > cdhR * 1.1 ? 'warn' : 'good');
  acNote.set(`Kırsal evde aynı daire: <b>${fmt(kwh(cdhR), 1)} kWh/gün</b> · kentte fazladan <b>%${fmt(cdhR ? (cdhC / cdhR - 1) * 100 : 0)}</b>. Günün en sıcak yüzeyi: <b>${fmt(hot, 0)} °C</b>.`);
}

function sample(hour) {
  const f = (((hour % 24) + 24) % 24) * 2, k0 = Math.floor(f) % 48, k1 = (k0 + 1) % 48, u = f - Math.floor(f), n = cells.length;
  let m = 0;
  for (let i = 0; i < n; i++) { curT[i] = lerp(sol.ts[k0 * n + i], sol.ts[k1 * n + i], u); m += curT[i]; }
  cur = {
    city: lerp(sol.air[k0].city, sol.air[k1].city, u), rural: lerp(sol.air[k0].rural, sol.air[k1].rural, u),
    surf: m / n, rsurf: lerp(sol.ruralSurf[k0], sol.ruralSurf[k1], u),
  };
}

const heat = (t) => heatColor((t - T_LO) / (T_HI - T_LO), tmpC);
function colorize() {
  if (!sol) return;
  const th = thermal.value;
  cells.forEach((c, k) => tiles.setColorAt(k, th ? heat(curT[k]) : tmpC.setHex(c.road ? COL.road : c.type === 'park' || c.type === 'tree' ? COL.park : 0x8b8f94)));
  for (let n = 0; n < bodies.count; n++) {
    const c = cells[bodyCell[n]], t = curT[bodyCell[n]];
    bodies.setColorAt(n, th ? heat(lerp(cur.city, t, 0.55)).multiplyScalar(0.8) : tmpC.setHex(0xd9cbb4).multiplyScalar(0.85 + 0.3 * (c.q % 0.5)));
    roofs.setColorAt(n, th ? heat(t) : tmpC.setHex(COL[c.type]));
  }
  for (let n = 0; n < trees.count; n++) trees.setColorAt(n, th ? heat(curT[treeCell[n]] - 2) : tmpC.setHex(COL.tree));
  ground.material.color.copy(th ? heat(cur.rsurf) : tmpC.setHex(0x7f9a4f));
  fields.visible = !th;
  for (const m of [tiles, bodies, roofs, trees]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
}

let hour = 14;
function updateSky() {
  const el = sunElev(hour), az = ((hour - 12.5) / 12) * Math.PI;
  const dir = v1.set(-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el) * 0.6 + 0.3);
  sunBall.position.copy(dir).multiplyScalar(70);
  sunBall.visible = el > -0.03;
  sunL.position.copy(dir).multiplyScalar(40);
  const day = clamp(Math.sin(el) * 5 + 0.05, 0, 1);
  sunL.intensity = 2.6 * day;
  hemi.intensity = 0.6 + 0.8 * day;
  bodies.material.emissive.setHex(0xffb347).multiplyScalar((1 - day) * 0.22);
  const dusk = clamp(1 - Math.abs(Math.sin(el)) * 5, 0, 1) * (el > -0.15 ? 1 : 0);
  sim.scene.background.copy(skyNight).lerp(skyDay, day).lerp(skyDusk, dusk * 0.45);
}

function refresh() {
  if (!sol) return;
  sample(hour);
  colorize();
  updateSky();
  const d = cur.city - cur.rural;
  stSurf.set(`${fmt(cur.surf, 1)} °C`, cur.surf > 45 ? 'bad' : cur.surf > 35 ? 'warn' : '');
  stRSurf.set(`${fmt(cur.rsurf, 1)} °C`);
  stAir.set(`${fmt(cur.city, 1)} / ${fmt(cur.rural, 1)} °C`);
  stDiff.set(`${d >= 0 ? '+' : ''}${fmt(d, 1)} °C`, d > 3 ? 'bad' : d > 1.5 ? 'warn' : 'good');
  cityLbl.setText(`🏙️ Kent havası ${fmt(cur.city, 1)} °C`);
  ruralLbl.setText(`🌾 Kır ${fmt(cur.rural, 1)} °C`);
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır şehirler');
const PRESETS = {
  bugun: { park: 10, white: 5, green: 0, asphalt: 'koyu', hw: 1.2, qf: 40 },
  serin: { park: 40, white: 50, green: 25, asphalt: 'serin', hw: 1, qf: 25 },
  beton: { park: 0, white: 0, green: 0, asphalt: 'koyu', hw: 2.8, qf: 100 },
  kasaba: { park: 30, white: 10, green: 0, asphalt: 'eski', hw: 0.4, qf: 8 },
};
const presetSeg = ui.segmented({
  options: [{ value: 'bugun', label: 'Bugünkü şehir' }, { value: 'serin', label: 'Serin şehir' }, { value: 'beton', label: 'Beton orman' }, { value: 'kasaba', label: 'Kasaba' }],
  value: 'bugun', onChange: (v) => loadPreset(v),
});
function loadPreset(v) {
  const p = PRESETS[v];
  parkS.set(p.park); whiteS.set(p.white); greenS.set(p.green); asphaltS.set(p.asphalt); hwS.set(p.hw); qfS.set(p.qf);
  cells.forEach((c) => (c.ov = null));
  markDirty();
}

ui.section('Kent tasarımı');
const parkS = ui.slider({ label: 'Ağaç / park örtüsü', min: 0, max: 60, step: 5, value: 10, unit: '%', onInput: markDirty });
const whiteS = ui.slider({ label: 'Beyaz (serin) çatı', min: 0, max: 100, step: 5, value: 5, unit: '%', onInput: (v) => { if (v + greenS.value > 100) greenS.set(100 - v); markDirty(); } });
const greenS = ui.slider({ label: 'Yeşil çatı', min: 0, max: 100, step: 5, value: 0, unit: '%', onInput: (v) => { if (v + whiteS.value > 100) whiteS.set(100 - v); markDirty(); } });
const asphaltS = ui.select({ label: 'Yol kaplaması', options: Object.entries(ASPHALT).map(([value, a]) => ({ value, label: `${a.name} (albedo ${fmt(a.a, 2)})` })), value: 'koyu', onChange: markDirty });
const hwS = ui.slider({ label: 'Bina yüksekliği / sokak genişliği (H/W)', min: 0.3, max: 3, step: 0.1, value: 1.2, format: (v) => `${fmt(v, 1)} · ≈${fmt(v * 12 / 3)} kat`, onInput: markDirty });
const qfS = ui.slider({ label: 'Atık ısı (trafik + klima)', min: 0, max: 120, step: 5, value: 40, unit: 'W/m²', onInput: markDirty });

ui.section('Zaman ve görünüm');
const hourS = ui.slider({ label: 'Gün saati', min: 0, max: 23.75, step: 0.25, value: 14, format: (v) => clock(v), onInput: (v) => { hour = v; refresh(); } });
const runDay = ui.toggle({ label: 'Gün aksın', value: true });
const thermal = ui.toggle({ label: '🌡️ Termal kamera', value: true, onChange: () => { legend.el.style.display = thermal.value ? '' : 'none'; colorize(); } });
const legend = ui.text(`<div style="height:10px;border-radius:5px;background:linear-gradient(90deg,#2563eb,#22c55e 35%,#facc15 60%,#f97316 80%,#dc2626)"></div>
  <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:3px"><span>${T_LO} °C</span><span>yüzey sıcaklığı</span><span>${T_HI} °C</span></div>`, 'card');
const tool = ui.segmented({
  label: 'Haritaya tıklayınca',
  options: [{ value: 'tree', label: '🌳 Ağaç' }, { value: 'white', label: '⬜ Beyaz çatı' }, { value: 'green', label: '🌿 Yeşil çatı' }, { value: 'none', label: '⬛ Koyu/sil' }],
  value: 'tree',
});

ui.section('Durum');
const stSurf = ui.stat({ label: 'Ort. kent yüzeyi' });
const stRSurf = ui.stat({ label: 'Kır yüzeyi' });
const stAir = ui.stat({ label: 'Hava: kent / kır' });
const stDiff = ui.stat({ label: 'Kent − kır (hava)' });
const stNight = ui.stat({ label: 'Gece en büyük fark' });
const stDay = ui.stat({ label: 'Gündüz en büyük fark' });
const stAC = ui.stat({ label: 'Klima enerjisi (100 m²)' });
const acNote = ui.text('', 'card');
const chart = ui.chart({
  title: '24 saat: sıcaklık (°C), 00:00 → 24:00',
  series: [{ name: 'Kent havası', color: '#f97316' }, { name: 'Kır havası', color: '#22c55e' }, { name: 'Kent yüzeyi', color: '#ef4444' }, { name: 'Kır yüzeyi', color: '#60a5fa' }],
  maxPoints: 49, height: 140,
});

function clock(h) { const m = Math.round(h * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
sim.formatTime = () => clock(hour);

// Tıklayarak düzenleme
sim.onClick(() => [tiles, bodies, roofs, trees], (hit) => {
  const id = hit.instanceId;
  const k = hit.object === tiles ? id : hit.object === trees ? treeCell[id] : bodyCell[id];
  const c = cells[k];
  if (!c) return;
  const t = tool.value;
  if (c.road) {
    if (t === 'tree' || t === 'none') { c.ov = t; sim.toast(t === 'tree' ? '🌳 Sokağa ağaç dikildi' : 'Sokak ağaçları kaldırıldı'); }
    else sim.toast('Burası yol — çatı yok', 'warn');
  } else {
    c.ov = t;
    sim.toast({ tree: '🌳 Küçük park yapıldı', white: '⬜ Çatı beyaza boyandı', green: '🌿 Yeşil çatı yapıldı', none: '⬛ Koyu çatılı bina' }[t]);
  }
  sim.hud.show(`Hücre sıcaklığı şimdi: <b>${fmt(curT[k], 1)} °C</b> — yeniden hesaplanıyor…`, { timeout: 1800 });
  presetSeg.set('');
  markDirty();
});

sim.onUpdate((dt) => {
  if (!runDay.value) return;
  hour = (hour + dt * 0.5) % 24;
  hourS.set(Math.floor(hour * 4) / 4);
});
let tick = 0;
sim.onRender(() => {
  const now = performance.now();
  if (dirty && now - lastSolve > 150) { dirty = false; lastSolve = now; doSolve(); refresh(); return; }
  if (++tick % 3 === 0) refresh();
});

sim.onReset(() => { hour = 14; hourS.set(14); runDay.set(true); presetSeg.set('bugun'); loadPreset('bugun'); });
assign();
doSolve();
refresh();
dirty = false;
