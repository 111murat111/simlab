// Periyodik Tablo Keşfi — 118 elementli 3B tablo, özelliğe göre yükseklik, elektron dizilimi ve Bohr modeli.
import { createSim, THREE, RoundedBoxGeometry, fmt, heatColor, textPlane, instanced, pick } from '@core';
import { ELEMENTS, CATS, NOTES, categoryOf, stateOf, isRadioactive } from './data.js';

const N = ELEMENTS.length;
const COUNT = N + 2; // + lantanit/aktinit yer tutucuları
const TILE = 0.9;
const MAXH = 4.2;
const BASEH = 0.22;

const sim = createSim({
  background: 0x080d1a,
  camera: { position: [0, 13.2, 12.4], target: [0, 0.4, 0.4], fov: 45 },
  controls: { minDistance: 5, maxDistance: 40 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Bilinen 118 elementin tamamı, atom numarasına göre sıralanmış standart düzende. Aynı <b>sütundaki (grup)</b> elementlerin
    son kabuklarındaki elektron sayısı benzer olduğu için kimyasal davranışları da benzer. Aynı <b>satırdaki (periyot)</b> elementlerin
    kabuk sayısı aynıdır. Lantanitler ve aktinitler tablo çok geniş olmasın diye altta ayrı satırlarda gösterilir.</p>
    <p>Bir elemente tıkladığında sağda bilgi kartı, tablonun üstünde ise <b>Bohr modeli</b> belirir: çekirdek ve kabuklarda dönen
    elektronlar. Elektron dizilimi Aufbau (yapılanma) ilkesiyle hesaplanır; Cr, Cu, Pd, Au gibi bilinen istisnalar düzeltilmiştir.</p>
    <h3>Dene</h3>
    <ul>
      <li>Yüksekliği <b>Elektronegatiflik</b> yap: sağ üstteki flor en yüksek, sol alttaki sezyum ve fransiyum en alçak.</li>
      <li>Rengi <b>Blok</b> yap: s, p, d ve f blokları elektronun en son hangi alt kabuğa girdiğini gösterir.</li>
      <li>Arama kutusuna <b>“demir”</b>, <b>“Au”</b> ya da <b>“79”</b> yaz. Klavyede ← → ile elementler arasında gez.</li>
      <li>🎯 <b>Element avı</b> oyunuyla elementlerin yerini öğren.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Telefonundaki lityum pil, diş macunundaki florür, kablolardaki bakır, kanındaki demir… Kartlarda yaklaşık 40 yaygın elementin
    günlük kullanımı ve tehlikeleri yazıyor.</p>
    <p><small>Bohr modeli basitleştirilmiş bir resimdir: gerçekte elektronlar dairesel yörüngelerde değil, orbital denen olasılık
    bulutlarında bulunur. Köşeli parantezli kütleler kararlı izotopu olmayan elementlerin en kararlı izotopunun kütle numarasıdır.
    104 ve sonrası elementlerin özellikleri çoğunlukla tahminidir.</small></p>`,
});

// --- Konum, dizilim ---
const STARTS = [1, 3, 11, 19, 37, 55, 87];
function layout(Z) {
  let period = 0;
  while (period < 7 && STARTS[period] <= Z) period++;
  if (Z >= 57 && Z <= 71) return { col: Z - 54, row: 8.5, period: 6, group: null, block: 'f' };
  if (Z >= 89 && Z <= 103) return { col: Z - 86, row: 9.5, period: 7, group: null, block: 'f' };
  const o = Z - STARTS[period - 1];
  let col;
  if (period === 1) col = Z === 1 ? 1 : 18;
  else if (period <= 3) col = o < 2 ? o + 1 : o + 11;
  else if (period <= 5) col = o + 1;
  else col = o < 2 ? o + 1 : o - 13;
  const block = Z === 2 || col <= 2 ? 's' : col <= 12 ? 'd' : 'p';
  return { col, row: period, period, group: col, block };
}

const ORDER = ['1s', '2s', '2p', '3s', '3p', '4s', '3d', '4p', '5s', '4d', '5p', '6s', '4f', '5d', '6p', '7s', '5f', '6d', '7p'];
const CAP = { s: 2, p: 6, d: 10, f: 14 };
const D1 = (a, b, n = 1) => ({ [a]: -n, [b]: n });
// Aufbau sırasından sapan (deneysel) temel hâl dizilimleri
const EXC = {
  24: D1('4s', '3d'), 29: D1('4s', '3d'), 41: D1('5s', '4d'), 42: D1('5s', '4d'), 44: D1('5s', '4d'), 45: D1('5s', '4d'),
  46: D1('5s', '4d', 2), 47: D1('5s', '4d'), 57: D1('4f', '5d'), 58: D1('4f', '5d'), 64: D1('4f', '5d'), 78: D1('6s', '5d'),
  79: D1('6s', '5d'), 89: D1('5f', '6d'), 90: D1('5f', '6d', 2), 91: D1('5f', '6d'), 92: D1('5f', '6d'), 93: D1('5f', '6d'),
  96: D1('5f', '6d'), 103: D1('6d', '7p'),
};
function fill(Z) {
  const o = {};
  let left = Z;
  for (const k of ORDER) {
    if (left <= 0) break;
    const n = Math.min(CAP[k[1]], left);
    o[k] = n; left -= n;
  }
  const ex = EXC[Z];
  if (ex) for (const k in ex) o[k] = (o[k] || 0) + ex[k];
  return o;
}
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n) => String(n).split('').map((d) => SUP[d]).join('');
const byNL = (a, b) => a[0] - b[0] || 'spdf'.indexOf(a[1]) - 'spdf'.indexOf(b[1]);
function configOf(Z) {
  const full = fill(Z);
  const core = [86, 54, 36, 18, 10, 2].find((c) => c < Z);
  const base = core ? fill(core) : {};
  const keys = Object.keys(full).sort(byNL);
  const short = keys.filter((k) => full[k] - (base[k] || 0) > 0).map((k) => k + sup(full[k] - (base[k] || 0)));
  const shells = [0, 0, 0, 0, 0, 0, 0];
  for (const k of keys) shells[+k[0] - 1] += full[k];
  while (shells.length && !shells[shells.length - 1]) shells.pop();
  return {
    short: (core ? `[${ELEMENTS[core - 1][0]}] ` : '') + short.join(' '),
    full: keys.filter((k) => full[k] > 0).map((k) => k + sup(full[k])).join(' '),
    shells,
  };
}

const E = ELEMENTS.map(([sym, name, mass, en], i) => {
  const Z = i + 1;
  return { Z, sym, name, mass, en, cat: categoryOf(Z), state: stateOf(Z), radio: isRadioactive(Z), note: NOTES[sym], ...layout(Z), ...configOf(Z) };
});
// Yer tutucular (tablonun 6. ve 7. periyodunda 3. sütun)
const HOLDERS = [
  { Z: 57, text: '57–71', cat: 'la', col: 3, row: 6 },
  { Z: 89, text: '89–103', cat: 'ac', col: 3, row: 7 },
];
const posX = (col) => (col - 9.5) * 1.0;
const posZ = (row) => (row - 5) * 1.0;
const X = new Float32Array(COUNT), Zp = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) {
  const t = i < N ? E[i] : HOLDERS[i - N];
  X[i] = posX(t.col); Zp[i] = posZ(t.row);
}

// --- Sahne ---
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0x0d1424, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  sim.scene.add(floor);
  const plate = new THREE.Mesh(new RoundedBoxGeometry(19.4, 0.1, 11.4, 2, 0.05), new THREE.MeshStandardMaterial({ color: 0x131c30, roughness: 0.8 }));
  plate.position.set(0, -0.05, 0.35);
  sim.scene.add(plate);
  // Grup ve periyot numaraları
  const top = { 1: 1, 2: 2, 13: 2, 14: 2, 15: 2, 16: 2, 17: 2, 18: 1 };
  for (let g = 1; g <= 18; g++) {
    const m = textPlane(String(g), 0.36, { color: '#7c8aa5', size: 44 });
    m.rotation.x = -Math.PI / 2;
    m.position.set(posX(g), 0.02, posZ(top[g] || 4) - 0.78);
    sim.scene.add(m);
  }
  for (let p = 1; p <= 7; p++) {
    const m = textPlane(String(p), 0.36, { color: '#7c8aa5', size: 44 });
    m.rotation.x = -Math.PI / 2;
    m.position.set(posX(1) - 0.8, 0.02, posZ(p));
    sim.scene.add(m);
  }
}

const tiles = instanced(new RoundedBoxGeometry(TILE, 1, TILE, 2, 0.05), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.05 }), COUNT);
tiles.frustumCulled = false;
sim.scene.add(tiles);

// Etiket atlası: her element için bir hücre (numara, sembol, alt satır)
const AC = 16, AR = 8, CELL = 128;
const atlas = document.createElement('canvas');
atlas.width = AC * CELL; atlas.height = AR * CELL;
const actx = atlas.getContext('2d');
const atlasTex = new THREE.CanvasTexture(atlas);
atlasTex.colorSpace = THREE.SRGBColorSpace;
atlasTex.anisotropy = 4;

function drawAtlas(mode) {
  actx.clearRect(0, 0, atlas.width, atlas.height);
  actx.lineJoin = 'round';
  const txt = (s, x, y, size, weight = 700) => {
    actx.font = `${weight} ${size}px system-ui, sans-serif`;
    actx.lineWidth = Math.max(3, size * 0.14);
    actx.strokeStyle = 'rgba(8,12,24,.85)';
    actx.strokeText(s, x, y);
    actx.fillStyle = '#fff';
    actx.fillText(s, x, y);
  };
  for (let i = 0; i < COUNT; i++) {
    const cx = (i % AC) * CELL, cy = Math.floor(i / AC) * CELL;
    actx.textBaseline = 'middle';
    if (i >= N) {
      actx.textAlign = 'center';
      txt(HOLDERS[i - N].text, cx + CELL / 2, cy + CELL / 2, 38, 800);
      continue;
    }
    const e = E[i];
    actx.textAlign = 'left';
    txt(String(e.Z), cx + 10, cy + 20, 22);
    actx.textAlign = 'center';
    txt(e.sym, cx + CELL / 2, cy + 64, 54, 800);
    let sub = e.name;
    if (mode === 'kutle') sub = fmt(e.mass, e.mass < 100 ? 2 : 1);
    else if (mode === 'en') sub = e.en == null ? '—' : fmt(e.en, 2);
    let fs = 19;
    actx.font = `600 ${fs}px system-ui, sans-serif`;
    while (fs > 11 && actx.measureText(sub).width > CELL - 12) { fs--; actx.font = `600 ${fs}px system-ui, sans-serif`; }
    txt(sub, cx + CELL / 2, cy + 106, fs, 600);
  }
  atlasTex.needsUpdate = true;
}

const labelGeo = new THREE.BufferGeometry();
const lpos = new Float32Array(COUNT * 4 * 3), luv = new Float32Array(COUNT * 4 * 2), lcol = new Float32Array(COUNT * 4 * 3).fill(1);
const lidx = [];
for (let i = 0; i < COUNT; i++) {
  const u0 = (i % AC) / AC, u1 = (i % AC + 1) / AC;
  const v1 = 1 - Math.floor(i / AC) / AR, v0 = 1 - (Math.floor(i / AC) + 1) / AR;
  luv.set([u0, v1, u1, v1, u1, v0, u0, v0], i * 8);
  const b = i * 4;
  lidx.push(b, b + 3, b + 2, b, b + 2, b + 1);
}
labelGeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3).setUsage(THREE.DynamicDrawUsage));
labelGeo.setAttribute('uv', new THREE.BufferAttribute(luv, 2));
labelGeo.setAttribute('color', new THREE.BufferAttribute(lcol, 3));
labelGeo.setIndex(lidx);
const labels = new THREE.Mesh(labelGeo, new THREE.MeshBasicMaterial({
  map: atlasTex, transparent: true, depthWrite: false, vertexColors: true, toneMapped: false, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
}));
labels.frustumCulled = false;
labels.renderOrder = 2;
sim.scene.add(labels);

// Seçim çerçevesi
const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(TILE + 0.08, 1, TILE + 0.08)),
  new THREE.LineBasicMaterial({ color: 0xffffff, toneMapped: false }));
sim.scene.add(outline);

// Üzerine gelinen element etiketi
const hoverLbl = sim.label('', { position: [0, 0, 0] });
hoverLbl.visible = false;

// --- Bohr modeli (tablonun üstündeki boş alanda) ---
const bohr = new THREE.Group();
bohr.position.set(posX(7.5), 2.7, posZ(2) - 0.4);
sim.scene.add(bohr);
const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 20), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4, emissive: 0x3a0a0a }));
bohr.add(nucleus);
const rings = [];
{
  const pts = [];
  for (let k = 0; k <= 96; k++) pts.push(new THREE.Vector3(Math.cos((k / 96) * Math.PI * 2), Math.sin((k / 96) * Math.PI * 2), 0));
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  for (let n = 1; n <= 7; n++) {
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.45, toneMapped: false }));
    bohr.add(l);
    rings.push(l);
  }
}
const electrons = instanced(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7dd3fc, toneMapped: false }), N);
electrons.frustumCulled = false;
bohr.add(electrons);
const bohrLbl = sim.label('', { parent: bohr, position: [0, -2.35, 0], className: 'big' });
const ringR = (n) => 0.42 + 0.3 * n;
let shellPhase = new Float32Array(7);
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);

function layoutElectrons() {
  const e = E[sel];
  let k = 0;
  e.shells.forEach((cnt, si) => {
    const r = ringR(si + 1);
    for (let j = 0; j < cnt; j++) {
      const a = shellPhase[si] + (j / cnt) * Math.PI * 2;
      _p.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      _m.compose(_p, _q, _s);
      electrons.setMatrixAt(k++, _m);
    }
  });
  electrons.count = k;
  electrons.instanceMatrix.needsUpdate = true;
}

function showBohr() {
  const e = E[sel];
  const ns = e.shells.length;
  rings.forEach((l, i) => { l.visible = i < ns; l.scale.setScalar(ringR(i + 1)); });
  bohr.scale.setScalar(Math.min(1.5, 2.05 / ringR(ns)));
  nucleus.scale.setScalar(0.8 + Math.cbrt(e.Z) * 0.12);
  bohrLbl.setText(`<b>${e.sym}</b> · ${e.name} &nbsp;<span style="color:#7dd3fc">${e.shells.join(' · ')}</span>`);
  bohrLbl.position.y = -ringR(ns) - 0.35;
  layoutElectrons();
}

sim.onUpdate((dt) => {
  const ns = E[sel].shells.length;
  for (let i = 0; i < ns; i++) shellPhase[i] = (shellPhase[i] + dt * (1.5 / Math.pow(i + 1, 1.1))) % (Math.PI * 2);
  layoutElectrons();
});

// --- Durum ---
let sel = 5;           // seçili element indeksi (Karbon)
let heightMode = 'duz';
let colorMode = 'kategori';
let catFilter = 'tumu';
let query = '';
let matches = null;    // Set | null
const cur = new Float32Array(COUNT).fill(BASEH), tgt = new Float32Array(COUNT).fill(BASEH);
let animating = true;

const PROP = {
  kutle: (e) => e.mass / 300,
  en: (e) => (e.en == null ? null : e.en / 4),
  z: (e) => e.Z / 118,
};
const BLOCK_C = { s: '#f87171', p: '#fcd34d', d: '#60a5fa', f: '#4ade80' };
const STATE_C = { katı: '#94a3b8', sıvı: '#38bdf8', gaz: '#fbbf24', bilinmiyor: '#475569' };
const _c = new THREE.Color();

function propVal(e) { return PROP[heightMode === 'duz' ? 'en' : heightMode](e); }

function refresh() {
  for (let i = 0; i < COUNT; i++) {
    let on, v = null, h = BASEH;
    if (i < N) {
      const e = E[i];
      on = (catFilter === 'tumu' || e.cat === catFilter) && (!matches || matches.has(i));
      if (heightMode !== 'duz') { v = PROP[heightMode](e); h = v == null ? 0.08 : BASEH + v * MAXH; }
      if (i === sel) h += 0.3;
      if (colorMode === 'kategori') _c.set(CATS[e.cat].color);
      else if (colorMode === 'blok') _c.set(BLOCK_C[e.block]);
      else if (colorMode === 'hal') _c.set(STATE_C[e.state]);
      else { const pv = propVal(e); if (pv == null) _c.set('#334155'); else heatColor(pv, _c); }
      if (heightMode !== 'duz' && v == null) _c.lerp(new THREE.Color('#334155'), 0.7);
    } else {
      const hd = HOLDERS[i - N];
      on = (catFilter === 'tumu' || catFilter === hd.cat) && !matches;
      h = 0.12;
      _c.set(colorMode === 'kategori' ? CATS[hd.cat].color : colorMode === 'blok' ? BLOCK_C.f : '#475569');
    }
    tgt[i] = h;
    if (!on) _c.multiplyScalar(0.22);
    tiles.setColorAt(i, _c);
    const d = on ? 1 : 0.28;
    for (let k = 0; k < 4; k++) lcol.set([d, d, d], (i * 4 + k) * 3);
  }
  tiles.instanceColor.needsUpdate = true;
  labelGeo.attributes.color.needsUpdate = true;
  animating = true;
  updateLegend();
}

function applyHeights() {
  for (let i = 0; i < COUNT; i++) {
    const h = cur[i];
    _p.set(X[i], h / 2, Zp[i]);
    _s.set(1, h, 1);
    _m.compose(_p, _q.identity(), _s);
    tiles.setMatrixAt(i, _m);
    const y = h + 0.004, a = TILE / 2 - 0.02, o = i * 12;
    lpos[o] = X[i] - a; lpos[o + 1] = y; lpos[o + 2] = Zp[i] - a;
    lpos[o + 3] = X[i] + a; lpos[o + 4] = y; lpos[o + 5] = Zp[i] - a;
    lpos[o + 6] = X[i] + a; lpos[o + 7] = y; lpos[o + 8] = Zp[i] + a;
    lpos[o + 9] = X[i] - a; lpos[o + 10] = y; lpos[o + 11] = Zp[i] + a;
  }
  _s.set(1, 1, 1);
  tiles.instanceMatrix.needsUpdate = true;
  tiles.computeBoundingSphere();
  labelGeo.attributes.position.needsUpdate = true;
  outline.position.set(X[sel], cur[sel] / 2, Zp[sel]);
  outline.scale.set(1, cur[sel] + 0.02, 1);
}

sim.onRender((dt) => {
  bohr.quaternion.copy(sim.camera.quaternion);
  if (animating) {
    const k = 1 - Math.exp(-dt * 7);
    let moving = false;
    for (let i = 0; i < COUNT; i++) {
      const d = tgt[i] - cur[i];
      if (Math.abs(d) > 0.002) { cur[i] += d * k; moving = true; } else cur[i] = tgt[i];
    }
    applyHeights();
    animating = moving;
  }
  if (hoverEv) { doHover(hoverEv); hoverEv = null; }
});

// --- Seçim ve bilgi kartı ---
const CAT_NOTE = {
  al: 'Çok tepkin, yumuşak metaller; suyla tepkimeye girip baz oluşturur. Son kabukta 1 elektron.',
  ta: 'Tepkin metaller; son kabukta 2 elektron. Kemik ve kayaçlarda bol.',
  ge: 'Sert, iletken metaller; d alt kabuğu dolmaktadır. Renkli bileşikler oluşturabilir.',
  zm: 'Geçiş metallerinden daha yumuşak, erime noktası daha düşük metaller.',
  ym: 'Hem metal hem ametal özelliği gösterir; yarı iletkenlerde önemlidir.',
  am: 'Isı ve elektriği iyi iletmez; canlıların yapısındaki elementlerin çoğu ametaldir.',
  ha: 'Çok tepkin ametaller; metallerle tuz oluşturur (“halojen” = tuz yapan). Son kabukta 7 elektron.',
  sg: 'Son kabukları dolu olduğu için neredeyse hiç tepkimeye girmez.',
  la: 'Nadir toprak elementleri: güçlü mıknatıslar, ekranlar ve lazerlerde kullanılır. 4f alt kabuğu dolmaktadır.',
  ac: 'Hepsi radyoaktiftir; 5f alt kabuğu dolmaktadır. Toryum ve uranyum dışındakiler doğada çok az bulunur ya da yapaydır.',
};
const STATE_TXT = { katı: '🧱 Katı', sıvı: '💧 Sıvı', gaz: '💨 Gaz', bilinmiyor: '❔ Bilinmiyor' };

function massText(e) {
  if (e.radio && ![90, 91, 92].includes(e.Z)) return `[${e.mass}]`;
  return fmt(e.mass, e.mass < 10 ? 3 : 2);
}

function cardHtml(e) {
  const c = CATS[e.cat].color;
  const tahmini = e.Z >= 104 ? ' <small>(tahmini)</small>' : '';
  const note = e.note
    ? `<div style="margin-top:8px"><b>🏠 Günlük hayatta:</b> ${e.note[0]}</div><div style="margin-top:6px;color:#fca5a5"><b style="color:#fca5a5">⚠️ Dikkat:</b> ${e.note[1]}</div>`
    : `<div style="margin-top:8px">${CAT_NOTE[e.cat]}</div>`;
  return `
  <div style="display:flex;gap:10px;align-items:center">
    <div style="width:64px;height:64px;border-radius:10px;background:${c};color:#0b1020;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none">
      <span style="font-size:11px;font-weight:700;line-height:1">${e.Z}</span><span style="font-size:28px;font-weight:800;line-height:1.05">${e.sym}</span></div>
    <div><div style="font-size:18px;font-weight:700;color:var(--text)">${e.name}</div>
    <div style="color:${c};font-weight:600">${CATS[e.cat].name}${e.radio ? ' · ☢️ radyoaktif' : ''}</div></div>
  </div>
  <div style="display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin-top:8px">
    <span>Atom numarası</span><b>${e.Z} (${e.Z} proton, ${e.Z} elektron)</b>
    <span>Atom kütlesi</span><b>${massText(e)} u</b>
    <span>Grup / periyot</span><b>${e.group ?? 'f bloku'} / ${e.period}</b>
    <span>Blok</span><b>${e.block}</b>
    <span>Elektronegatiflik</span><b>${e.en == null ? 'bilinmiyor' : fmt(e.en, 2)}</b>
    <span>Hâl (25 °C)</span><b>${STATE_TXT[e.state]}</b>
    <span>Kabuklar</span><b>${e.shells.join(' · ')}</b>
  </div>
  <div style="margin-top:6px">Elektron dizilimi${tahmini}:<br><b style="font-size:15px">${e.short}</b>
  ${e.Z > 2 && e.Z <= 54 ? `<br><small>${e.full}</small>` : ''}${EXC[e.Z] ? '<br><small>⚡ Aufbau sırasından sapan (istisna) dizilim</small>' : ''}</div>
  ${note}`;
}

function select(i, moveCam = false) {
  if (i < 0 || i >= N) return;
  sel = i;
  card.set(cardHtml(E[i]));
  showBohr();
  refresh();
  if (moveCam) { /* kamera sabit kalır */ }
}

// --- Etkileşim ---
function hitIndex(hit) {
  let i = hit.instanceId;
  if (i >= N) i = HOLDERS[i - N].Z - 1;
  return i;
}
sim.onClick([tiles], (hit) => {
  const i = hitIndex(hit);
  if (quiz) return quizAnswer(i);
  select(i);
});

let hoverEv = null;
sim.dom.addEventListener('pointermove', (ev) => { hoverEv = ev; });
sim.dom.addEventListener('pointerleave', () => { hoverLbl.visible = false; });
function doHover(ev) {
  const hits = sim.raycast(ev, [tiles], false);
  if (!hits.length || quiz) { hoverLbl.visible = false; sim.dom.style.cursor = ''; return; }
  const i = hitIndex(hits[0]);
  const id = hits[0].instanceId;
  const e = E[i];
  let extra = '';
  if (heightMode === 'kutle') extra = ` · ${massText(e)} u`;
  else if (heightMode === 'en') extra = ` · EN ${e.en == null ? '—' : fmt(e.en, 2)}`;
  else if (heightMode === 'z') extra = ` · Z = ${e.Z}`;
  hoverLbl.setText(id >= N ? `${HOLDERS[id - N].text} · ${CATS[HOLDERS[id - N].cat].name}` : `${e.sym} · ${e.name}${extra}`);
  hoverLbl.position.set(X[id], cur[id] + 0.45, Zp[id]);
  hoverLbl.visible = true;
  sim.dom.style.cursor = 'pointer';
}

window.addEventListener('keydown', (ev) => {
  if (ev.target.closest && ev.target.closest('input, select, textarea')) return;
  if (ev.key === 'ArrowRight') select(Math.min(N - 1, sel + 1));
  if (ev.key === 'ArrowLeft') select(Math.max(0, sel - 1));
});

// --- Element avı (mini oyun) ---
let quiz = null;
const ROUNDS = 6;
const POOL = Object.keys(NOTES).map((s) => E.findIndex((e) => e.sym === s));

function quizNext() {
  if (quiz.round >= ROUNDS) return quizEnd();
  let t;
  do { t = pick(POOL); } while (quiz.used.includes(t));
  quiz.used.push(t);
  quiz.target = t; quiz.tries = 0; quiz.round++;
  sim.hud.show(`🎯 <b>${quiz.round}/${ROUNDS}</b> · Tabloda bul: <b style="font-size:20px">${E[t].name}</b>
    <div style="font-size:13px;color:var(--muted)">Puan: ${quiz.score} · Karoya tıkla</div>
    <button class="btn" data-q="pas">Pas geç</button> <button class="btn" data-q="bitir">Bitir</button>`);
}
function quizAnswer(i) {
  const t = quiz.target;
  if (i === t) {
    const pts = quiz.tries === 0 ? 2 : 1;
    quiz.score += pts;
    sim.toast(`✅ Doğru! ${E[t].name} = <b>${E[t].sym}</b> (+${pts})`, 'good');
    select(t);
    quizNext();
  } else {
    quiz.tries++;
    const e = E[t];
    if (quiz.tries >= 2) {
      sim.toast(`❌ Bu ${E[i].name}. ${e.name} burada: ${e.group ? e.group + '. grup, ' : ''}${e.period}. periyot`, 'bad');
      select(t);
      quizNext();
    } else {
      sim.toast(`❌ Bu ${E[i].name} (${E[i].sym}). İpucu: ${e.period}. periyotta, ${CATS[e.cat].name.toLowerCase()}.`, 'warn');
    }
  }
}
function quizEnd() {
  const max = ROUNDS * 2, s = quiz.score;
  quiz = null;
  const msg = s >= max * 0.8 ? 'Harika! Tabloyu çok iyi tanıyorsun. 🏆' : s >= max * 0.5 ? 'Güzel! Biraz daha pratikle usta olursun.' : 'Bir daha dene; grupları ve periyotları hatırla.';
  sim.hud.show(`<h2>Oyun bitti</h2>Puan: <b>${s} / ${max}</b><br>${msg}<br>
    <button class="btn primary" data-q="tekrar">Tekrar oyna</button> <button class="btn" data-q="kapat">Kapat</button>`, { tone: s >= max * 0.5 ? 'good' : 'warn' });
}
function quizStart() {
  quiz = { round: 0, score: 0, used: [], target: -1, tries: 0 };
  hoverLbl.visible = false;
  quizNext();
}
sim.hud.el.addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-q]');
  if (!b) return;
  const q = b.dataset.q;
  if (q === 'pas' && quiz) { sim.toast(`${E[quiz.target].name} burada 👉 ${E[quiz.target].sym}`, 'warn'); select(quiz.target); quizNext(); }
  else if (q === 'bitir' && quiz) quizEnd();
  else if (q === 'tekrar') quizStart();
  else if (q === 'kapat') sim.hud.hide();
});

// --- Arayüz ---
const ui = sim.ui;
ui.section('Ara ve süz');
const search = document.createElement('input');
Object.assign(search, { type: 'search', placeholder: 'Ad, sembol ya da numara (ör. demir, Au, 79)' });
Object.assign(search.style, { width: '100%', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: '8px', padding: '8px 10px' });
ui.append(search);
const searchInfo = ui.text('');
const lower = (s) => s.toLocaleLowerCase('tr');
function runSearch() {
  query = search.value.trim();
  if (!query) { matches = null; searchInfo.set(''); refresh(); return; }
  const q = lower(query);
  matches = new Set();
  E.forEach((e, i) => {
    if (String(e.Z) === q || lower(e.sym) === q || lower(e.name).startsWith(q) || (q.length >= 3 && lower(e.name).includes(q))) matches.add(i);
  });
  const list = [...matches];
  searchInfo.set(list.length ? `${list.length} eşleşme: ${list.slice(0, 8).map((i) => E[i].sym).join(', ')}${list.length > 8 ? '…' : ''} <small>(Enter ile seç)</small>` : 'Eşleşme yok');
  if (list.length === 1) select(list[0]); else refresh();
}
search.addEventListener('input', runSearch);
search.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && matches && matches.size) select([...matches][0]); });

const catSel = ui.select({
  label: 'Kategori',
  options: [{ value: 'tumu', label: 'Tümü' }, ...Object.entries(CATS).map(([k, v]) => ({ value: k, label: v.name }))],
  value: 'tumu', onChange: (v) => { catFilter = v; refresh(); },
});
const legend = ui.text('', 'card');
function updateLegend() {
  let items;
  if (colorMode === 'kategori') items = Object.entries(CATS).map(([k, v]) => [k, v.color, v.name]);
  else if (colorMode === 'blok') items = Object.entries(BLOCK_C).map(([k, c]) => [null, c, `${k} bloku`]);
  else if (colorMode === 'hal') items = Object.entries(STATE_C).map(([k, c]) => [null, c, STATE_TXT[k]]);
  else {
    const nm = { duz: 'elektronegatiflik', en: 'elektronegatiflik', kutle: 'atom kütlesi', z: 'atom numarası' }[heightMode];
    legend.set(`<div style="height:10px;border-radius:5px;background:linear-gradient(90deg,#2563eb,#22c55e,#facc15,#f97316,#dc2626)"></div>
      <div style="display:flex;justify-content:space-between;font-size:12px"><span>düşük</span><span>${nm}</span><span>yüksek</span></div>`);
    return;
  }
  legend.set(`<div style="display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12px">${items.map(([k, c, n]) =>
    `<span ${k ? `data-cat="${k}" style="cursor:pointer;${catFilter === k ? 'color:var(--text);font-weight:700' : ''}"` : ''}><i style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${c};margin-right:4px;vertical-align:-1px"></i>${n}</span>`).join('')}</div>`);
}
legend.el.addEventListener('click', (ev) => {
  const s = ev.target.closest('[data-cat]');
  if (!s) return;
  catFilter = catFilter === s.dataset.cat ? 'tumu' : s.dataset.cat;
  catSel.set(catFilter);
  refresh();
});

ui.section('Görünüm');
const hSeg = ui.segmented({
  label: 'Karo yüksekliği',
  options: [{ value: 'duz', label: 'Düz' }, { value: 'kutle', label: 'Atom kütlesi' }, { value: 'en', label: 'Elektronegatiflik' }, { value: 'z', label: 'Atom no.' }],
  value: 'duz', onChange: (v) => { heightMode = v; drawAtlas(v); refresh(); userMoved = false; fitCamera(); },
});
const cSeg = ui.segmented({
  label: 'Renk',
  options: [{ value: 'kategori', label: 'Kategori' }, { value: 'blok', label: 'Blok' }, { value: 'hal', label: 'Hâl' }, { value: 'isi', label: 'Isı haritası' }],
  value: 'kategori', onChange: (v) => { colorMode = v; refresh(); },
});
ui.toggle({ label: 'Bohr modeli', value: true, onChange: (v) => (bohr.visible = v) });

ui.section('Seçili element');
const card = ui.text('', 'card');
ui.buttons([
  { label: '◀ Önceki', onClick: () => select(Math.max(0, sel - 1)) },
  { label: 'Sonraki ▶', onClick: () => select(Math.min(N - 1, sel + 1)) },
]);

ui.section('Oyun');
ui.text('Elementin adı verilir, sen tabloda yerini bulursun. İlk denemede doğru: 2 puan, ikincide: 1 puan.');
ui.button({ label: '🎯 Element avı', variant: 'primary', onClick: quizStart });

sim.onReset(() => {
  quiz = null;
  sim.hud.hide();
  search.value = ''; query = ''; matches = null; searchInfo.set('');
  catFilter = 'tumu'; catSel.set('tumu');
  heightMode = 'duz'; hSeg.set('duz'); drawAtlas('duz');
  colorMode = 'kategori'; cSeg.set('kategori');
  shellPhase.fill(0);
  userMoved = false;
  fitCamera();
  select(5);
});

// Kamerayı tablo ekrana sığacak uzaklığa getir (ekran oranına göre)
let userMoved = false, lastAspect = 0;
sim.controls.addEventListener('start', () => { userMoved = true; });
function fitCamera() {
  const cam = sim.camera, flat = heightMode === 'duz';
  const dir = flat ? [0, 13.2, 12] : [0, 11.5, 14.5];
  const len = Math.hypot(...dir);
  const tanH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
  const d = Math.max(flat ? 17 : 19, (10.4 * 1.08) / tanH);
  const ty = flat ? 0.6 : 1.4;
  sim.moveCamera([0, ty + (dir[1] / len) * d, 0.4 + (dir[2] / len) * d], [0, ty, 0.4]);
  lastAspect = cam.aspect;
}
sim.onRender(() => { if (!userMoved && Math.abs(sim.camera.aspect - lastAspect) > 0.01) fitCamera(); });

drawAtlas('duz');
fitCamera();
applyHeights();
select(5);
