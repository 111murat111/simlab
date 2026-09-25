// Buzul Erimesi ve Deniz Seviyesi — ısınma senaryosuna göre buzul geri çekilmesi ve temsili kıyı şehrinin su baskını.
import { createSim, THREE, ImprovedNoise, fmt, clamp, smoothstep, seeded, instanced, lerp } from '@core';
import { simulate, band, GLACIER_SLE } from './model.js';

const VS = 0.3; // 1 m yükselti = 0,3 dünya birimi (dikey ölçek abartılı)
const Y0 = 2025, Y1 = 2300;
const SSP = [
  { id: 'ssp1', name: 'SSP1-2.6', T: 1.8, color: '#22c55e', desc: 'Hızlı emisyon azaltımı' },
  { id: 'ssp2', name: 'SSP2-4.5', T: 2.7, color: '#facc15', desc: 'Orta yol' },
  { id: 'ssp5', name: 'SSP5-8.5', T: 4.4, color: '#ef4444', desc: 'Yüksek emisyon' },
];

const sim = createSim({
  background: 0x9cc3e6,
  camera: { position: [6, 32, 52], target: [0, 1, -4], fov: 48 },
  controls: { maxDistance: 110, minDistance: 8 },
  fog: [70, 150],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Arkada buzullu bir dağ, önde alçak bir kıyıda kurulmuş temsili <b>Kıyıkent</b> (yaklaşık 850 bin kişi). Deniz seviyesi
    yükselince önce delta ve sahil mahalleleri su altında kalır; buzul ise yukarı doğru çekilir.</p>
    <p>Küresel ortalama deniz seviyesi artışı üç ana kaynaktan gelir: <b>ısıl genleşme</b> (ısınan su genleşir),
    <b>dağ buzullarının erimesi</b> ve <b>buz tabakaları</b> (Grönland, Antarktika). Isınma dursa bile okyanus ve buz tabakaları
    yavaş tepki verdiği için deniz yüzyıllarca yükselmeye devam eder.</p>
    <h3>Dene</h3>
    <ul>
      <li>SSP1-2.6 ile SSP5-8.5'i 2100 ve 2300 yıllarında karşılaştır: 2100'de fark onlarca cm, 2300'de metrelerce.</li>
      <li>"Fırtına kabarması"nı aç: bugün nadir görülen bir fırtına, deniz yükseldikçe çok daha fazla mahalleyi basar.</li>
      <li>Kıyı setini yükselt; set aşılana kadar şehir korunur, ama aşıldığında arkası hızla dolar.</li>
      <li>Haritada bir binaya tıkla: yükseltisini ve durumunu gör.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>IPCC AR6'ya göre 2100'e kadar küresel deniz seviyesi (1995–2014'e göre) SSP1-2.6'da yaklaşık 0,3–0,6 m,
    SSP5-8.5'te 0,6–1,0 m yükselir; 2300'de bu değerler 0,3–3,1 m ile 1,7–6,8 m aralığına çıkar (düşük güven).
    Dünyada yüz milyonlarca insan deniz seviyesinden birkaç metre yüksekte yaşıyor.</p>
    <p><small>Model basitleştirilmiştir: bileşenler AR6 ortancalarına kabaca ayarlıdır, değerler 2025'e göre verilir ve
    <b>yaklaşıktır</b>. Aralık bandı "olası" aralığı temsil eder. Isınma 2100'de seçilen değere ulaşır; 2,2 °C üstünde sonra da artar.
    Şehir, yükseltiler ve nüfus hayalidir; yerel çökme, gelgit ve dalga etkileri yoktur. Dikey ölçek abartılıdır.</small></p>`,
});
sim.formatTime = () => `Yıl ${Math.round(year.value)}`;
const sunL = sim.scene.userData.sun;
sunL.position.set(-20, 30, 18);

// --- Arazi ---
const noise = new ImprovedNoise();
const coastZ = (x) => 10 + 1.4 * Math.sin(x * 0.16) + 0.6 * Math.sin(x * 0.41 + 1);
const riverX = (z) => -6 + 2.2 * Math.sin(z * 0.18);
const PEAKS = [[-6, -23, 15], [9, -25, 12.5], [-20, -21, 10], [21, -19, 9.5], [0, -28, 11]];

/** Alçak arazi yükseltisi (m); denizde negatif. */
function elevM(x, z) {
  const d = coastZ(x) - z;
  if (d < 0) return Math.max(-14, d * 2.2);
  let e = d * 0.85 + noise.noise(x * 0.12, 0.3, z * 0.12) * 1.6;
  const dr = Math.abs(x - riverX(z));
  e -= 3.4 * Math.exp(-((dr / 4) ** 2)) * smoothstep(-8, 2, z);
  return Math.max(0.35 * smoothstep(0, 1.5, d), e);
}
function mountainW(x, z) {
  let m = 0;
  for (const [px, pz, h] of PEAKS) m = Math.max(m, h * Math.exp(-(((x - px) / 8) ** 2 + ((z - pz) / 6) ** 2)));
  const ridge = smoothstep(-6, -17, z) * 4.5;
  return (Math.max(m, ridge) + noise.noise(x * 0.25, 5, z * 0.25) * 1.3 * smoothstep(-5, -14, z)) * smoothstep(-4, -12, z);
}
const heightW = (x, z) => elevM(x, z) * VS + mountainW(x, z);

const SIZE = 80, SEG = 130;
const terrainGeo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
terrainGeo.rotateX(-Math.PI / 2);
{
  const p = terrainGeo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = heightW(x, z), e = elevM(x, z), mnt = mountainW(x, z);
    p.setY(i, y);
    const dr = Math.abs(x - riverX(z));
    if (e < 0 && mnt < 0.3) c.setHex(0xc9b98a).lerp(new THREE.Color(0x3b6e8f), clamp(-e / 6, 0, 1));
    else if (dr < 0.7 && z > -12 && z < coastZ(x)) c.setHex(0x4f8fb8);
    else if (e < 1.2 && mnt < 0.3) c.setHex(0xd8c99a);
    else if (mnt > 6) c.setHex(0x8a8580);
    else if (mnt > 2.5) c.setHex(0x6f7d5a);
    else c.setHex(0x7fa35a).lerp(new THREE.Color(0x9fb86e), clamp(e / 14, 0, 1));
    col.set([c.r, c.g, c.b], i * 3);
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  terrainGeo.computeVertexNormals();
}
const terrain = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
sim.scene.add(terrain);

// --- Buzul: denge çizgisinin (ELA) üstündeki buz; hacim azaldıkça ELA yükselir ---
const glGeo = new THREE.PlaneGeometry(SIZE, 30, 110, 45);
glGeo.rotateX(-Math.PI / 2);
glGeo.translate(0, 0, -25);
const glBase = [], glPos = glGeo.attributes.position;
for (let i = 0; i < glPos.count; i++) glBase.push(heightW(glPos.getX(i), glPos.getZ(i)));
const iceT = (h, ela) => Math.min(1.6, Math.max(0, h - ela) * 0.3);
const glacier = new THREE.Mesh(glGeo, new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.35, metalness: 0.05, flatShading: true, emissive: 0x1a3550, emissiveIntensity: 0.25 }));
sim.scene.add(glacier);
const iceVol = (ela) => glBase.reduce((s, h) => s + iceT(h, ela), 0);
const ELA0 = 9, VOL0 = iceVol(ELA0);
function setGlacier(frac) {
  // Hacim oranına karşılık gelen ELA'yı ikiye bölme ile bul
  let lo = ELA0 - 3, hi = 17;
  for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (iceVol(m) / VOL0 > frac) lo = m; else hi = m; }
  const ela = (lo + hi) / 2;
  for (let i = 0; i < glPos.count; i++) { const t = iceT(glBase[i], ela); glPos.setY(i, t > 0 ? glBase[i] + t + 0.05 : glBase[i] - 0.4); }
  glPos.needsUpdate = true;
  glGeo.computeVertexNormals();
  return ela;
}
const glLabel = sim.label('', { position: [-6, 18, -23], className: 'plain' });

// --- Su yüzeyleri: açık deniz ve (set aşılırsa) iç kesim ---
const waterMat = new THREE.MeshStandardMaterial({ color: 0x1f6fa8, transparent: true, opacity: 0.78, roughness: 0.2, metalness: 0.1 });
const sea = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, 30).rotateX(-Math.PI / 2).translate(0, 0, 25), waterMat);
const inland = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, 50).rotateX(-Math.PI / 2).translate(0, 0, -15), waterMat);
sim.scene.add(sea, inland);

// Kıyı seti
const wallMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.8 });
const walls = new THREE.Group();
for (let x = -39; x < 39; x += 1) {
  const z0 = coastZ(x) - 0.9, z1 = coastZ(x + 1) - 0.9;
  const seg = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1, 0.3), wallMat);
  seg.position.set(x + 0.5, 0, (z0 + z1) / 2);
  seg.rotation.y = -Math.atan2(z1 - z0, 1);
  walls.add(seg);
}
sim.scene.add(walls);

// Gelgit ölçer (liman)
const gauge = new THREE.Group();
gauge.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9 * VS * 1.1 + 1).translate(0, (9 * VS * 1.1 + 1) / 2 - 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xf8fafc })));
for (let m = 0; m <= 8; m++) {
  const tick = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: m % 2 ? 0x111827 : 0xdc2626 }));
  tick.position.y = m * VS;
  gauge.add(tick);
}
gauge.position.set(12, 0, coastZ(12) + 1.2);
sim.scene.add(gauge);
const gaugeLabel = sim.label('', { parent: gauge, position: [0, 9 * VS + 1.2, 0] });

// --- Şehir ---
const DISTRICTS = [
  { name: 'Delta', test: (b) => Math.abs(b.x - riverX(b.z)) < 6.5 },
  { name: 'Liman', test: (b) => b.x > 5 && b.d < 6 },
  { name: 'Sahil', test: (b) => b.d < 6 },
  { name: 'Çarşı', test: (b) => b.d < 11 },
  { name: 'Yamaç', test: () => true },
];
const TOTAL_POP = 850000;
const rnd = seeded(7);
const blds = [];
for (let x = -26; x <= 26; x += 1.3) {
  for (let z = -4; z < 12; z += 1.3) {
    const bx = x + (rnd() - 0.5) * 0.3, bz = z + (rnd() - 0.5) * 0.3, d = coastZ(bx) - bz;
    if (d < 1.6 || Math.abs(bx - riverX(bz)) < 1.4 || rnd() < 0.14 || mountainW(bx, bz) > 0.4) continue;
    const e = elevM(bx, bz);
    const b = { x: bx, z: bz, d, e, y: heightW(bx, bz), w: 0.7 + rnd() * 0.35, flooded: false };
    b.dist = DISTRICTS.findIndex((D) => D.test(b));
    const tall = b.dist === 1 || b.dist === 3 ? 2.2 : 1;
    b.h = (0.35 + rnd() * 0.9) * tall;
    b.pop = b.w * b.w * b.h;
    blds.push(b);
  }
}
const popScale = TOTAL_POP / blds.reduce((s, b) => s + b.pop, 0);
blds.forEach((b) => (b.pop *= popScale));
const DCOL = [0xe8c39e, 0xcbd5e1, 0xf1e3c8, 0xe7b8a0, 0xf5f0e6];
const bMesh = instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), blds.length);
{
  const m = new THREE.Matrix4();
  blds.forEach((b, i) => {
    m.compose(new THREE.Vector3(b.x, b.y - 0.05, b.z), new THREE.Quaternion(), new THREE.Vector3(b.w, b.h, b.w));
    bMesh.setMatrixAt(i, m);
  });
}
sim.scene.add(bMesh);
const dLabels = DISTRICTS.map((D, k) => {
  const list = blds.filter((b) => b.dist === k);
  D.count = list.length;
  D.pop = list.reduce((s, b) => s + b.pop, 0);
  const cx = list.reduce((s, b) => s + b.x, 0) / (list.length || 1), cz = list.reduce((s, b) => s + b.z, 0) / (list.length || 1);
  return sim.label(D.name, { position: [cx, heightW(cx, cz) + 3, cz] });
});

// --- Model durumu ---
let cur = [], scen = {};
const lvlAt = (arr, y) => {
  const i = clamp(y - 2005, 0, arr.length - 1), a = arr[Math.floor(i)], b = arr[Math.ceil(i)], f = i - Math.floor(i);
  const o = {};
  for (const k of ['T', 'th', 'gl', 'gr', 'an', 'lw', 'total']) o[k] = lerp(a[k], b[k], f);
  return o;
};
SSP.forEach((s) => (scen[s.id] = simulate(s.T)));

const flooded = new THREE.Color(0x2c4a66), tmpC = new THREE.Color();
let wasProtected = false;
function update() {
  const y = year.value;
  const base = lvlAt(cur, Y0), now = lvlAt(cur, y);
  const slr = Math.max(0, now.total - base.total); // 2025'e göre (m)
  const [lo, hi] = band(y);
  const water = slr * (upper.value ? hi : 1) + (surge.value ? 1.5 : 0);
  const wallH = wall.value;
  const protectedCity = wallH > 0 && water < wallH;
  sea.position.y = water * VS;
  inland.position.y = water * VS;
  inland.visible = !protectedCity && water > 0.02;
  walls.visible = wallH > 0;
  walls.children.forEach((s) => { s.scale.y = Math.max(0.01, wallH * VS + 0.3); s.position.y = s.scale.y / 2 - 0.2; });
  wallMat.color.setHex(wallH > 0 && !protectedCity ? 0xb45309 : 0x9ca3af);

  // Binalar
  let pop = 0, nFlood = 0;
  const dF = DISTRICTS.map(() => 0);
  blds.forEach((b, i) => {
    b.flooded = !protectedCity && b.e < water;
    if (b.flooded) { pop += b.pop; nFlood++; dF[b.dist]++; }
    bMesh.setColorAt(i, b.flooded ? flooded : tmpC.setHex(DCOL[b.dist]));
  });
  bMesh.instanceColor.needsUpdate = true;
  DISTRICTS.forEach((D, k) => {
    const f = D.count ? dF[k] / D.count : 0;
    dLabels[k].setText(f > 0.5 ? `🌊 ${D.name} — sular altında` : f > 0 ? `${D.name} · %${fmt(f * 100)} su baskını` : D.name);
    dLabels[k].el.style.borderColor = f > 0.5 ? '#ef4444' : f > 0 ? '#f59e0b' : '';
  });

  // Buzul
  const glFrac = clamp((GLACIER_SLE - now.gl) / (GLACIER_SLE - base.gl), 0, 1.15);
  setGlacier(Math.min(1, glFrac));
  glLabel.setText(`🧊 Buzul: %${fmt(glFrac * 100)}`);
  gaugeLabel.setText(`+${fmt(water * 100)} cm`);

  // İstatistikler
  stSea.set(`${fmt(slr * 100)} cm`, slr > 1 ? 'bad' : slr > 0.4 ? 'warn' : '');
  stRange.set(`${fmt(slr * lo * 100)}–${fmt(slr * hi * 100)} cm`);
  stPop.set(fmt(pop), pop > 100000 ? 'bad' : pop > 0 ? 'warn' : 'good');
  stBld.set(`${fmt(nFlood)} / ${fmt(blds.length)}`);
  stT.set(`+${fmt(now.T, 1)} °C`, now.T > 3 ? 'bad' : now.T > 2 ? 'warn' : 'good');
  glMeter.set(Math.min(1, glFrac), `%${fmt(glFrac * 100)}`);
  const c = (k) => fmt((now[k] - base[k]) * 100);
  parts.set(`<b>${Math.round(y)}</b> için katkılar (2025'e göre): ısıl genleşme <b>${c('th')} cm</b> · dağ buzulları <b>${c('gl')} cm</b> ·
    Grönland <b>${c('gr')} cm</b> · Antarktika <b>${c('an')} cm</b> · kara suyu <b>${c('lw')} cm</b>` +
    (protectedCity ? `<br>🛡️ Kıyı seti (${fmt(wallH, 1)} m) şimdilik şehri koruyor.` : wallH > 0 && water >= wallH ? '<br>⚠️ Su kıyı setini aştı!' : ''));

  if (wallH > 0 && wasProtected && !protectedCity) sim.toast('⚠️ Kıyı seti aşıldı!', 'bad');
  wasProtected = protectedCity;
}

function recompute() {
  cur = simulate(warm.value);
  // Grafik: 3 senaryo + seçili senaryo ve olası aralığı (5 yılda bir)
  chart.clear();
  for (let y = Y0; y <= Y1; y += 5) {
    const b0 = (arr) => (lvlAt(arr, y).total - lvlAt(arr, Y0).total) * 100;
    const v = b0(cur), [lo, hi] = band(y);
    chart.push([b0(scen.ssp1), b0(scen.ssp2), b0(scen.ssp5), v, v * lo, v * hi]);
  }
  update();
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Senaryo (IPCC)');
const preset = ui.segmented({
  options: SSP.map((s) => ({ value: s.id, label: s.name })).concat([{ value: 'ozel', label: 'Özel' }]),
  value: 'ssp2',
  onChange: (v) => { const s = SSP.find((q) => q.id === v); if (s) { warm.set(s.T); recompute(); sim.toast(`${s.name}: ${s.desc}, 2100'de ≈ +${fmt(s.T, 1)} °C`); } },
});
const warm = ui.slider({ label: 'Küresel ısınma (2100, sanayi öncesine göre)', min: 0, max: 5, step: 0.1, value: 2.7,
  format: (v) => `+${fmt(v, 1)} °C`, onInput: () => { preset.set('ozel'); recompute(); } });
const year = ui.slider({ label: 'Yıl', min: Y0, max: Y1, step: 1, value: 2100, format: (v) => String(Math.round(v)), onInput: () => update() });
let playing = false, yearF = 2100;
ui.buttons([
  { label: '▶ Yılları ilerlet', variant: 'primary', onClick: () => { yearF = year.value >= Y1 - 1 ? Y0 : year.value; playing = true; sim.play(); } },
  { label: '⏹ Durdur', onClick: () => (playing = false) },
]);

ui.section('Kıyı');
const surge = ui.toggle({ label: 'Fırtına kabarması (+1,5 m, örnek)', value: false, onChange: () => update() });
const upper = ui.toggle({ label: 'Olası aralığın üst ucunu göster', value: false, onChange: () => update() });
const wall = ui.slider({ label: 'Kıyı seti yüksekliği', min: 0, max: 4, step: 0.25, value: 0, format: (v) => (v ? `${fmt(v, 2)} m` : 'yok'), onInput: () => update() });

ui.section('Durum');
const stSea = ui.stat({ label: 'Deniz seviyesi artışı' });
const stRange = ui.stat({ label: 'Olası aralık' });
const stPop = ui.stat({ label: 'Etkilenen nüfus' });
const stBld = ui.stat({ label: 'Su altındaki bina' });
const stT = ui.stat({ label: 'Küresel ısınma' });
const glMeter = ui.meter({ label: "Dağ buzulu hacmi (2025'e göre)", color: '#7dd3fc' });
const parts = ui.text('', 'card');
const chart = ui.chart({
  title: "Deniz seviyesi artışı, cm (2025–2300, 2025'e göre, yaklaşık)",
  series: [
    ...SSP.map((s) => ({ name: s.name, color: s.color })),
    { name: 'Seçili', color: '#ffffff' },
    { name: 'Aralık alt', color: 'rgba(148,163,184,.6)' },
    { name: 'Aralık üst', color: 'rgba(148,163,184,.6)' },
  ],
  maxPoints: (Y1 - Y0) / 5 + 1, height: 140,
});

sim.onUpdate((dt) => {
  if (!playing) return;
  const y = (yearF = Math.min(Y1, yearF + dt * 12));
  year.set(Math.round(y));
  update();
  if (y >= Y1) { playing = false; sim.toast('2300 yılına ulaşıldı'); }
});
sim.onRender(() => { waterMat.opacity = 0.76 + 0.04 * Math.sin(performance.now() / 700); });

// Binaya tıkla → bilgi
sim.onClick([bMesh], (hit) => {
  const b = blds[hit.instanceId];
  if (!b) return;
  sim.toast(`${DISTRICTS[b.dist].name} · yükselti ${fmt(b.e, 1)} m · ${b.flooded ? '🌊 sular altında' : 'kuru'} · ≈${fmt(b.pop)} kişi`, b.flooded ? 'bad' : 'good');
});

sim.onReset(() => {
  playing = false;
  preset.set('ssp2');
  warm.set(2.7);
  year.set(2100);
  surge.set(false); upper.set(false); wall.set(0);
  recompute();
});
recompute();
