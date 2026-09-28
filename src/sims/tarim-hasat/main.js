// Tarım ve Hasat — dört tarla, günlük toprak suyu (kova) modeli, azot tepkisi, sıcaklık/dolu stresi ve hasat ekonomisi.
import { createSim, THREE, fmt, clamp, lerp, smoothstep, seeded, instanced, disposeObject, BufferGeometryUtils, mat, procedural, RoundedBoxGeometry, landscape, createTerrain, terrainSkirt, terrainMaterial, createVegetation } from '@core';
import { houseGeometries, plaster, roofTiles, treeGeometry, leafMat, barkMat } from './kit.js';

const DOY0 = 60, DOY1 = 304;            // sezon: 1 Mart – 31 Ekim
const SEASON = DOY1 - DOY0 + 1;
const SEC_PER_DAY = 0.25;
const NSOIL = 4;                        // topraktan gelen azot (kg/da)
const ROWS_N = 12, COLS_N = 14, PLANTS = ROWS_N * COLS_N;
const PLOT = 10, GAP = 3;
// Komşu buğday tarlası (dekor; modele girmez): [x0, z0, x1, z1] m
const WHEAT = [2, -30, 32, -17.2];
// Komşu sebze tarlası (dekor): lahana ve soğan sıraları
const VEG = [13.9, -10.8, 29, 11.2];
function inVeg(x, z, m = 0) { return x > VEG[0] - m && x < VEG[2] + m && z > VEG[1] - m && z < VEG[3] + m; }
function inWheat(x, z, m = 0) { return x > WHEAT[0] - m && x < WHEAT[2] + m && z > WHEAT[1] - m && z < WHEAT[3] + m; }
const PLOT_COL = ['#facc15', '#4ade80', '#f87171', '#c4b5fd'];
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
// Aylık yağış (mm) — Akdeniz/Güneydoğu iç kesim benzeri: kışın yağışlı, yazın kurak
const RAIN_M = [90, 75, 65, 45, 30, 10, 3, 3, 8, 35, 60, 90];

// Ürün parametreleri (FAO-56 Kc, AquaCrop tarzı su verimliliği; değerler yaklaşık)
const CROPS = {
  bugday: { name: 'Buğday', emoji: '🌾', base: 0, gdd: 1450, wp: 17, hi: 0.45, fresh: 1.13, ccx: 0.9, kc: [0.4, 1.15, 0.3],
    heatT: 31, nOpt: 14, nconc: 0.012, price: 13, fixed: 3800, h: 0.95, sow: 60, leaf: 0x5fa83a, ripe: 0xd9b44a, fruitC: 0xe3c565, col: '#facc15' },
  misir: { name: 'Mısır', emoji: '🌽', base: 10, gdd: 1600, wp: 36, hi: 0.48, fresh: 1.15, ccx: 0.92, kc: [0.35, 1.2, 0.5],
    heatT: 35, nOpt: 20, nconc: 0.011, price: 11, fixed: 7000, h: 2.2, sow: 105, leaf: 0x3f9b3a, ripe: 0xb59a52, fruitC: 0xf2c94c, col: '#4ade80' },
  domates: { name: 'Domates', emoji: '🍅', base: 10, gdd: 1400, wp: 20, hi: 0.5, fresh: 1 / 0.065, ccx: 0.85, kc: [0.6, 1.15, 0.8],
    heatT: 33, nOpt: 18, nconc: 0.02, price: 4.5, fixed: 20000, h: 0.8, sow: 121, leaf: 0x3b8f3f, ripe: 0x6b7f3a, fruitC: 0xe53935, col: '#f87171' },
  pamuk: { name: 'Pamuk', emoji: '☁️', base: 15.6, gdd: 1300, wp: 19, hi: 0.35, fresh: 1.08, ccx: 0.88, kc: [0.35, 1.18, 0.6],
    heatT: 38, nOpt: 15, nconc: 0.015, price: 28, fixed: 8000, h: 1.15, sow: 115, leaf: 0x4c9a45, ripe: 0x8a6f4d, fruitC: 0xf8fafc, col: '#e2e8f0' },
};

const sim = createSim({
  sky: { elevation: 42, azimuth: 215, clouds: 0.22, haze: 2.1, visibility: 9000, wind: [3, 1] },
  camera: { position: [19, 6.8, 25], target: [-3, 0.6, -6], fov: 42, near: 0.1, far: 90000 },
  controls: { maxDistance: 160, minDistance: 3, maxPolarAngle: Math.PI * 0.47 },
  shadows: true, shadowSize: 42,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Dört tarlada dört ayrı ürün bir sezon boyunca (1 Mart – 31 Ekim) gün gün büyür. Bitkilerin boyu ve yaprak örtüsü
    biyokütleyi, rengi suyun ve olgunluğun durumunu gösterir: sararan yapraklar <b>su stresi</b>, altın/kahverengi renk
    <b>olgunluk</b> demektir. Toprak rengi nemle koyulaşır.</p>
    <p><b>Model:</b> Toprak bir <b>kova</b> gibidir: yağmur + sulama girer, bitki terlemesi (ET = Ks·Kc·ET₀) çıkar, taşan su derine
    sızar ve yanında azotu yıkar. Su, kovanın “kolay alınabilir” kısmının altına inince bitki stomalarını kapatır (Ks &lt; 1)
    ve büyüme yavaşlar. Biyokütle ≈ su verimliliği × Σ(terleme/ET₀) (AquaCrop yaklaşımı), verim = biyokütle × hasat indeksi.
    Gelişim hızı <b>büyüme derece-günü</b> ile ilerler. Azota tepki azalan verimlidir (Mitscherlich eğrisi); aşırı gübre
    yatma ve tuzluluk ile verimi düşürür, fazlası yıkanır.</p>
    <h3>Dene</h3>
    <ul>
      <li>“Kuraklık” senaryosunda sulamayı salmadan damlaya çevir: aynı su ile verim ve su ayak izi nasıl değişiyor?</li>
      <li>Gübreyi 0'dan 40 kg/da'ya adım adım artır: verim önce hızla artar, sonra düzleşir, en sonunda düşer.</li>
      <li>Mısırı çok geç ek: çiçeklenme temmuz sıcağına denk gelir. “Sıcak hava dalgası”nda hangi ürün en çok zarar görüyor?</li>
      <li>Kuraklığa dayanıklı çeşit normal yılda biraz az, kurak yılda çok daha fazla verir mi?</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Salma (karık) sulamada suyun önemli bir kısmı buharlaşma, yüzey akışı ve derine sızmayla kaybolur; damla sulamada verim
    çok daha yüksektir. Fazla azot yeraltı suyunda nitrat kirliliğine yol açar. Buğday burada ilkbahar ekimiyle modellenmiştir
    (Türkiye'de çoğunlukla kışlık ekilir). Fiyat ve maliyetler örnektir; bölgeye ve yıla göre çok değişir.</p>`,
});

// --- Yardımcılar ---
const doyToDate = (doy) => {
  let m = 0, d = doy;
  while (m < 11 && d > MDAYS[m]) { d -= MDAYS[m]; m++; }
  return `${d} ${MONTHS[m]}`;
};
const monthOf = (doy) => { let m = 0, d = doy; while (m < 11 && d > MDAYS[m]) { d -= MDAYS[m]; m++; } return m; };
const hash = (i, k) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };

// --- Hava üretimi ---
let weatherSeed = 7;
let weather = [];
let hailDay = -1, heatStart = -1;
function makeWeather() {
  const r = seeded(weatherSeed);
  const g = () => { const u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const sc = scenario.value;
  const rainMul = sc === 'kurak' ? 0.3 : 1, tAdd = sc === 'kurak' ? 1.5 : 0;
  heatStart = sc === 'sicak' ? 168 + Math.floor(r() * 10) : -1;
  hailDay = sc === 'dolu' ? 150 + Math.floor(r() * 40) : -1;
  weather = [];
  let e = 0;
  for (let doy = DOY0; doy <= DOY1; doy++) {
    e = 0.7 * e + g() * 1.8;
    const m = monthOf(doy);
    const pWet = Math.min(0.55, RAIN_M[m] / 70 + 0.02);
    const mean = RAIN_M[m] / Math.max(1, pWet * MDAYS[m]);
    let rain = r() < pWet ? -Math.log(1 - r()) * mean * rainMul : 0;
    if (rain < 0.5) rain = 0;
    let T = 16 + 12 * Math.sin((2 * Math.PI * (doy - 110)) / 365) + e + tAdd;
    const heat = heatStart > 0 && doy >= heatStart && doy < heatStart + 12;
    if (heat) T += 8;
    if (rain > 0) T -= 2;
    const dtr = 12 + 3 * Math.sin((2 * Math.PI * (doy - 110)) / 365) - (rain > 0 ? 4 : 0);
    const tmax = T + dtr / 2;
    const Ra = 29 + 12 * Math.sin((2 * Math.PI * (doy - 80)) / 365); // tepe radyasyonu (MJ/m²/gün), ~37°K
    const et0 = Math.max(0.3, 0.0023 * (T + 17.8) * Math.sqrt(Math.max(1, dtr)) * Ra * 0.408);
    weather.push({ doy, T, tmax, rain, et0, heat, hail: doy === hailDay });
  }
}

// --- Sahne: ova, çevre tarlalar, çiftlik ---
const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
const scene = sim.scene;
const hillsF = landscape({ seed: 41, size: 2600, height: 240, octaves: 6, warp: 0.4 });
const roll = landscape({ seed: 8, size: 700, height: 6, octaves: 4, warp: 0.2 });
const hillsN = landscape({ seed: 27, size: 1400, height: 90, octaves: 5, warp: 0.35 });
function hW(x, z) {
  const r = Math.hypot(x, z);
  let h = 0;
  const a = smoothstep(60, 350, r);
  if (a > 0) h += (roll(x, z) + 1.5) * a;
  const c = smoothstep(260, 1600, r);                       // yakın çevrede yumuşak tepeler (40–90 m)
  if (c > 0) h += Math.max(0, hillsN(x, z) + 45) * c;
  const b = smoothstep(1800, 7000, r);
  if (b > 0) h += Math.max(0, hillsF(x, z) + 80) * b;
  return h - 0.02;
}
function farmlandMaterial() {
  const m = terrainMaterial({ water: -50, forest: 0.25, grass: 0x8a8448, dry: 0xb9a56a, soil: 0x86684a, forestCol: 0x3a4a26, grassAmount: 0.85 });
  const orig = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    orig(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb = c;', /* glsl */ `diffuseColor.rgb = c;
      {
        // Çevre tarlalar: yamalı parseller (anız, sürülmüş, yeşil ürün, nadas), sıra izleri; araları çayır sınır ve toprak yol
        vec2 q = mat2(0.985, 0.174, -0.174, 0.985)*vTW.xz;
        vec2 cs = vec2(95.0, 150.0);
        vec2 id = floor(q/cs), f = fract(q/cs)*cs;
        float t = h13(vec3(id, 3.0)), t2 = h13(vec3(id, 8.0));
        float edge = min(min(f.x, cs.x - f.x), min(f.y, cs.y - f.y));
        float dirH = step(0.5, h13(vec3(id, 5.0)));
        float rowC = mix(q.x, q.y, dirH);
        float fw = fwidth(rowC)*1.5;
        float rows = 1.0 - smoothstep(0.0, 0.5, abs(fract(rowC/0.75) - 0.5)*2.0);
        rows = mix(rows, 0.5, smoothstep(0.08, 0.4, fw));
        float mid = fbm3(tP*0.03, 3), fine = vn3(tP*2.0);
        vec3 fc;
        if (t < 0.3) fc = mix(vec3(0.7, 0.58, 0.34), vec3(0.6, 0.48, 0.27), rows)*(0.9 + 0.2*mid);            // buğday anızı
        else if (t < 0.5) fc = mix(vec3(0.42, 0.3, 0.2), vec3(0.3, 0.21, 0.14), rows)*(0.85 + 0.3*fine);     // sürülmüş
        else if (t < 0.75) fc = mix(vec3(0.2, 0.3, 0.1), vec3(0.36, 0.3, 0.2), rows*0.7)*(0.85 + 0.3*mid);  // yeşil ürün sıraları
        else fc = mix(vec3(0.6, 0.55, 0.36), vec3(0.5, 0.47, 0.3), fine)*(0.9 + 0.2*mid);                     // nadas / kuru ot
        fc *= 0.92 + 0.16*t2;
        float fieldW = smoothstep(1.5, 3.0, edge);
        float farm = smoothstep(30.0, 45.0, max(abs(vTW.x + 3.0), abs(vTW.z + 2.0)));
        float far = 1.0 - smoothstep(1500.0, 3500.0, length(vTW.xz));
        diffuseColor.rgb = mix(diffuseColor.rgb, fc, fieldW*farm*far);
        // yol (tarla araları, 2,2 m) ve çiftlik avlusu
        float road = max(step(abs(vTW.x), 1.1)*step(abs(vTW.z), 16.0), step(abs(vTW.z), 1.1)*step(abs(vTW.x), 16.0));
        road = max(road, step(abs(vTW.x + 17.0), 1.6)*step(vTW.z, -2.0)*step(-40.0, vTW.z));
        road = max(road, step(abs(vTW.z + 16.0), 1.6)*step(-17.0, vTW.x)*step(vTW.x, 0.0));
        // toprak yol: iki teker izi, ortada ot şeridi, kenarda seyrek ot
        float rx = step(abs(vTW.x), 1.1)*step(abs(vTW.z), 16.0), rz = step(abs(vTW.z), 1.1)*step(abs(vTW.x), 16.0);
        float ruts = rx*smoothstep(0.24, 0.08, abs(abs(vTW.x) - 0.7)) + rz*smoothstep(0.24, 0.08, abs(abs(vTW.z) - 0.7));
        float med = rx*(1.0 - rz)*smoothstep(0.36, 0.14, abs(vTW.x)) + rz*(1.0 - rx)*smoothstep(0.36, 0.14, abs(vTW.z));
        vec3 dirt = mix(vec3(0.5, 0.41, 0.3), vec3(0.4, 0.33, 0.24), fine)*(0.85 + 0.25*mid);
        dirt = mix(dirt, dirt*vec3(0.7, 0.68, 0.66), clamp(ruts, 0.0, 1.0));
        dirt = mix(dirt, vec3(0.3, 0.35, 0.15)*(0.75 + 0.5*fine), med*smoothstep(0.3, 0.6, fine + 0.3)*0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, dirt, road);
      }`);
  };
  m.customProgramCacheKey = () => 'tarim-farmland';
  return m;
}
const landMat = farmlandMaterial();
scene.add(createTerrain(hW, { size: [700, 700], res: LOW ? [160, 160] : [240, 240], material: landMat }));
scene.add(createTerrain((x, z) => hW(x, z) - 1.2 * Math.min(smoothstep(350, 330, Math.abs(x)), smoothstep(350, 330, Math.abs(z))), { size: [24000, 24000], res: LOW ? [180, 180] : [260, 260], material: landMat }));
scene.add(terrainSkirt(hW, { inner: 11500, outer: 80000, material: landMat }));
scene.add(createVegetation(hW, {
  rect: [-6000, -6000, 6000, 6000], trees: LOW ? 2500 : 6000, shrubs: LOW ? 800 : 2000, rocks: 80, seed: 5,
  kinds: { broad: 0.6, cypress: 0.25, pine: 0.15 }, leafA: 0x3c5426, leafB: 0x6a6f34,
  forest: (x, z) => { const r = Math.hypot(x, z); if (r < 120) return 0; const q = x * 0.985 + z * 0.174, w = -x * 0.174 + z * 0.985; const e = Math.min(Math.abs(((q % 95) + 95) % 95), Math.abs(((w % 150) + 150) % 150)); return (e < 4 ? 0.5 : 0) + 0.25 * smoothstep(1500, 4000, r); },
}).group);

// Çiftlik evi, ahır, su deposu, ağaçlar
{
  const HG = houseGeometries({ w: 9, d: 7, floors: 1, roof: 'gable' });
  const house = new THREE.Group();
  house.add(new THREE.Mesh(HG.walls, plaster(0xe9dfca)), new THREE.Mesh(HG.roof, roofTiles(0xa4492c)), new THREE.Mesh(HG.glass, mat.plastic({ color: 0x1d2630, gloss: 1 })), new THREE.Mesh(HG.trim, mat.wood({ color: 0x6b4a2e })));
  house.position.set(-19, 0, -11);
  house.rotation.y = Math.PI / 2;
  {
    // Sundurma (ahşap dikmeler, sac saçak), baca, kapı, saksılar
    const beam = mat.wood({ color: 0x6b4a2e, ring: 6 });
    const pg = [new THREE.BoxGeometry(7.4, 0.12, 2.1).translate(0, 0.06, 4.55)];
    for (const x of [-3.5, -1.2, 1.2, 3.5]) pg.push(new THREE.CylinderGeometry(0.07, 0.08, 2.5, 10).translate(x, 1.3, 5.45));
    pg.push(new THREE.BoxGeometry(7.4, 0.14, 0.14).translate(0, 2.52, 5.45));
    house.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(pg.map((g) => g.toNonIndexed())), beam));
    const eave = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.05, 2.5).rotateX(0.16).translate(0, 2.78, 4.8), procedural({
      key: 'tarim-eave', params: { color: 0x9a4a30, roughness: 0.55 }, bump: 0.02,
      pattern: 'float w = 0.5 + 0.5*sin(p.x*28.0); col *= 0.82 + 0.2*w - 0.12*fbm3(p*1.5, 3); h = w;',
    }));
    const chim = new THREE.Mesh(new RoundedBoxGeometry(0.6, 1.9, 0.6, 1, 0.03).translate(2.4, 4.45, -1.2), mat.brick({ color: 0x9a5b42 }));
    const chimCap = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.8).translate(2.4, 5.43, -1.2), mat.concrete({ color: 0x8c8a86 }));
    const door = new THREE.Mesh(new RoundedBoxGeometry(1.0, 2.1, 0.08, 1, 0.02).translate(0, 1.05, 3.62), mat.wood({ color: 0x5b3a22, ring: 3, varnish: true }));
    const pots = [];
    for (const x of [-2.6, -2.0, 2.0, 2.6]) pots.push(new THREE.CylinderGeometry(0.2, 0.14, 0.32, 14).translate(x, 0.28, 3.85));
    const potM = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(pots.map((g) => g.toNonIndexed())), mat.ceramic({ color: 0xa8583a }));
    const bush = [];
    for (const x of [-2.6, -2.0, 2.0, 2.6]) bush.push(new THREE.IcosahedronGeometry(0.26, 2).scale(1, 0.8, 1).translate(x, 0.6, 3.85));
    const bushM = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(bush.map((g) => g.toNonIndexed())), mat.foliage({ color: 0x4f7a2e }));
    house.add(eave, chim, chimCap, door, potM, bushM);
  }
  scene.add(house);
  // Ahır: ahşap kaplama, oluklu sac çatı
  const barn = new THREE.Group();
  const bw = new THREE.Mesh(new RoundedBoxGeometry(12, 4.2, 8, 2, 0.1).translate(0, 2.1, 0), mat.wood({ color: 0x7a5236, ring: 4 }));
  const s = new THREE.Shape(); s.moveTo(-6.6, 0); s.lineTo(6.6, 0); s.lineTo(0, 2.4); s.closePath();
  const br = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 8.8, bevelEnabled: false }).translate(0, 4.2, -4.4), procedural({
    key: 'tarim-sheet', params: { color: 0x8e9396, roughness: 0.45, metalness: 0.7 },
    pattern: 'float cor = 0.5 + 0.5*sin(p.x*20.0); col *= 0.85 + 0.15*cor; col = mix(col, vec3(0.45, 0.28, 0.16), smoothstep(0.6, 0.85, fbm3(p*0.8, 4))*0.6); h = cor;',
    bump: 0.03,
  }));
  const bd = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 0.12).translate(0, 1.6, 4.02), mat.wood({ color: 0x5a3b26, ring: 3 }));
  barn.add(bw, br, bd);
  barn.position.set(-26, 0, 6);
  barn.rotation.y = Math.PI / 2;
  scene.add(barn);
  // Su deposu: çelik ayaklar üstünde galvaniz tank
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.2, 32), mat.brushedMetal({ color: 0xb9bfc4, rough: 0.35 }));
  tank.position.set(-21, 4.2, -3.5);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.4, 32), mat.brushedMetal({ color: 0xaeb4b8 }));
  cap.position.set(-21, 5.5, -3.5);
  const steel = mat.paintedMetal({ color: 0x5a6068, wear: 0.4 });
  const legsG = [];
  for (const [a, b] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) legsG.push(new THREE.CylinderGeometry(0.06, 0.06, 3.1, 8).translate(a, 1.55, b));
  for (const y of [1.0, 2.2]) for (const [a, b, rot] of [[0, -0.75, 0], [0, 0.75, 0], [-0.75, 0, 1], [0.75, 0, 1]]) legsG.push(new THREE.BoxGeometry(rot ? 0.06 : 1.5, 0.06, rot ? 1.5 : 0.06).translate(a, y, b));
  const legs = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(legsG.map((g) => g.toNonIndexed())), steel);
  legs.position.set(-21, 0, -3.5);
  scene.add(tank, cap, legs);
  // Ağaçlar (dut, ceviz, kavak) — gerçek boy
  const kinds = [treeGeometry('oak', 3, { dens: 1 }), treeGeometry('poplar', 5, { dens: 0.8 }), treeGeometry('fruit', 7, { dens: 1 })];
  const leaf = [leafMat(0x4a6a2a), leafMat(0x557a2e), leafMat(0x5c7a32)], bark = barkMat(0x5a4632);
  const pos = [[], [], []];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2, R = 22 + hash(i, 3) * 5;
    const x = Math.cos(a) * R * 1.15, z = Math.sin(a) * R * 0.8 - 4;
    if (z > 8 || inWheat(x, z, 3) || inVeg(x, z, 3)) continue;
    pos[i % 3 === 0 ? 1 : i % 3 === 1 ? 0 : 2].push([x, z, 0.8 + hash(i, 7) * 0.5, hash(i, 2) * 6.28]);
  }
  for (let k = -3; k < 14; k++) pos[1].push([-40 + k * 7, -34 + hash(k, 1) * 1.5, 0.85 + hash(k, 3) * 0.3, hash(k, 9) * 6]);   // yol boyu kavaklar
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  kinds.forEach((G, j) => {
    const cr = instanced(G.crown, leaf[j], pos[j].length), tr = instanced(G.trunk, bark, pos[j].length);
    pos[j].forEach(([x, z, s, r], i) => { m4.compose(new THREE.Vector3(x, hW(x, z) - 0.2, z), q.setFromEuler(e.set(0, r, 0)), new THREE.Vector3(s, s, s)); cr.setMatrixAt(i, m4); tr.setMatrixAt(i, m4); });
    scene.add(cr, tr);
  });
}
// Meteoroloji istasyonu: direk, beyaz panjurlu sıcaklık kulübesi, yağmur ölçer, rüzgâr kepçeleri
const station = new THREE.Group();
{
  const white = mat.paintedMetal({ color: 0xf2f2ee, wear: 0.08 }), pole = mat.brushedMetal({ color: 0xc0c5ca });
  station.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 12).translate(0, 1.6, 0), pole));
  const scr = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.5, 0.45, 2, 0.02).translate(0.35, 1.55, 0), procedural({
    key: 'tarim-louvre', params: { color: 0xf4f4f0, roughness: 0.6 },
    pattern: 'float l = step(0.5, fract(p.y*28.0)); col *= 0.82 + 0.18*l; h = l;', bump: 0.004,
  }));
  station.add(scr);
  station.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.35, 20).translate(-0.5, 1.0, 0.3), white));
  station.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 8).translate(-0.5, 0.5, 0.3), pole));
  const cups = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094, arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6).rotateZ(Math.PI / 2).translate(0.1, 0, 0), pole);
    arm.rotation.y = a;
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8, 0, Math.PI), white);
    cup.position.set(Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2); cup.rotation.y = a + Math.PI / 2;
    cups.add(arm, cup);
  }
  cups.position.y = 3.25;
  station.add(cups);
  station.userData.cups = cups;
  station.position.set(13.6, 0, 13.6);
  scene.add(station);
}
const wxLbl = sim.label('', { parent: station, position: [0, 3.9, 0], className: 'big' });

// Yağmur / dolu parçacıkları (tarlaların üstünde, gerçek boy damla izleri)
const RAIN_N = LOW ? 900 : 1800;
const rainPos = new Float32Array(RAIN_N * 6);
for (let i = 0; i < RAIN_N; i++) {
  const x = (Math.random() - 0.5) * 50, y = Math.random() * 18, z = (Math.random() - 0.5) * 44;
  rainPos.set([x, y, z, x, y + 0.5, z], i * 6);
}
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainMat = new THREE.LineBasicMaterial({ color: 0xc9d6e2, transparent: true, opacity: 0, depthWrite: false });
const rainPts = new THREE.LineSegments(rainGeo, rainMat);
rainPts.frustumCulled = false;
rainPts.userData.noShadow = true;
scene.add(rainPts);
let rainVis = 0, hailVis = 0;

// --- Bitki geometrileri (yükseklik 1'e normalize; x-z örnek ölçeğiyle, y bitki boyuyla ölçeklenir) ---
const rng = seeded(99);
function tint(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = fn(p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = v[0]; c[i * 3 + 1] = v[1]; c[i * 3 + 2] = v[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
const shade = (y) => { const k = 0.45 + 0.6 * Math.min(1, y); return [k, k, k]; };
const merge = (list) => BufferGeometryUtils.mergeGeometries(list.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); if (!n.attributes.color) tint(n, (x, y) => shade(y)); return n; }));
// Yaprak: sivri uçlu şerit, kavisli; (x0,y0) kökten yöne doğru
function blade(len, w, x0, y0, z0, yaw, pitch, droop, seg = 4) {
  const g = new THREE.PlaneGeometry(w, len, 1, seg), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + len / 2) / len;
    p.setX(i, p.getX(i) * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)));
    p.setY(i, t * len); p.setZ(i, droop * t * t * len);
  }
  g.rotateX(-pitch); g.rotateY(yaw); g.translate(x0, y0, z0);
  return tint(g, (x, y) => shade(y));
}
function leafCloud(n, r, y0, y1, lw, ll) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rng() * 6.28, rr = r * Math.sqrt(rng()), y = y0 + (y1 - y0) * rng();
    out.push(blade(ll * (0.7 + rng() * 0.5), lw, Math.cos(a) * rr, y, Math.sin(a) * rr, a + Math.PI / 2 + (rng() - 0.5), 0.6 + rng() * 0.9, 0.25));
  }
  return out;
}
function balls(n, r, y0, y1, rad, sy = 1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.4 + rng(), rr = r * (0.5 + 0.5 * rng()), g = new THREE.IcosahedronGeometry(rad, 1);
    g.scale(1, sy, 1); g.translate(Math.cos(a) * rr, y0 + (y1 - y0) * rng(), Math.sin(a) * rr);
    out.push(tint(g, () => [1, 1, 1]));
  }
  return out;
}
const GEOS = {
  bugday: {
    plant: merge(Array.from({ length: 26 }, (_, i) => blade(0.95 + rng() * 0.08, 0.018, (rng() - 0.5) * 0.5, 0, (rng() - 0.5) * 0.5, rng() * 6.28, 0.1 + rng() * 0.2, 0.08))),
    fruit: merge(Array.from({ length: 16 }, () => { const x = (rng() - 0.5) * 0.5, z = (rng() - 0.5) * 0.5, g = new THREE.CapsuleGeometry(0.014, 0.07, 2, 6); g.rotateZ((rng() - 0.5) * 0.4); g.translate(x + 0.05, 0.97, z); return tint(g, () => [1, 1, 1]); })),
  },
  misir: {
    plant: merge([
      tint(new THREE.CylinderGeometry(0.012, 0.018, 1, 7).translate(0, 0.5, 0), (x, y) => shade(y)),
      ...Array.from({ length: 11 }, (_, i) => blade(0.55 + 0.15 * Math.sin(i), 0.05, 0, 0.15 + i * 0.07, 0, i * 2.6, 0.9, 0.6)),
      ...Array.from({ length: 6 }, (_, i) => blade(0.14, 0.008, 0, 0.93, 0, i * 1.05, 0.35, 0.3, 2)),
    ]),
    fruit: merge([tint(new THREE.CylinderGeometry(0.03, 0.022, 0.13, 10).rotateZ(-0.35).translate(0.035, 0.52, 0), () => [1, 1, 1])]),
  },
  domates: {
    plant: merge([tint(new THREE.CylinderGeometry(0.01, 0.015, 0.8, 5).translate(0, 0.4, 0), (x, y) => shade(y)), ...leafCloud(60, 0.36, 0.12, 0.95, 0.07, 0.14)]),
    fruit: merge(balls(6, 0.3, 0.25, 0.6, 0.045, 0.85)),
  },
  pamuk: {
    plant: merge([tint(new THREE.CylinderGeometry(0.01, 0.016, 0.9, 5).translate(0, 0.45, 0), (x, y) => shade(y)), ...leafCloud(48, 0.3, 0.2, 1.0, 0.1, 0.12)]),
    fruit: merge(balls(7, 0.26, 0.55, 0.95, 0.035, 1.15)),
  },
};
const plantMat = procedural({
  key: 'tarim-plant', params: { color: 0xffffff, roughness: 0.75, vertexColors: true, side: THREE.DoubleSide },
  pattern: 'col *= 0.82 + 0.3*vn3(p*25.0 + seed*9.0);',
});
const fruitMat = procedural({
  key: 'tarim-fruit', params: { color: 0xffffff, roughness: 0.45, vertexColors: true },
  pattern: 'col *= 0.9 + 0.15*vn3(p*60.0); rough = mix(0.35, 0.9, step(0.8, (col.r + col.g + col.b)/3.0));',
});
const dripMat = mat.rubber({ color: 0x17181a });

// ---------------------------------------------------------------------------
// Çiftlik çevresi (yalnız görsel): kenar otları, komşu buğday tarlası, traktör, çitler, sulama kanalı, pompa/filtre, balyalar
// ---------------------------------------------------------------------------
const mergeNI = (list) => BufferGeometryUtils.mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
// Kenar otları: tarlalar, yollar, yapılar ve kanal dışı; kuru Akdeniz çayırı
const farmFree = (x, z) => {
  const ax = Math.abs(x), az = Math.abs(z);
  if (ax > 1.25 && ax < 11.75 && az > 1.25 && az < 11.75) return false;           // deneme tarlaları (seddeler dahil)
  if (ax < 1.12 && az < 16.2) return false;                                       // ara yollar
  if (az < 1.12 && ax < 16.2) return false;
  if (inVeg(x, z, 0.4)) return false;
  if (Math.abs(x + 17) < 2.0 && z > -41 && z < -1.5) return false;                 // çiftlik yolu
  if (Math.abs(z + 16) < 2.0 && x > -17.5 && x < 0.5) return false;
  if (x > -23.5 && x < -12.8 && z > -16.2 && z < -5.8) return false;               // ev + sundurma
  if (x > -31 && x < -21 && z > -1 && z < 13) return false;                        // ahır
  if (Math.hypot(x + 21, z + 3.5) < 1.6 || Math.hypot(x - 13.6, z - 13.6) < 1.2) return false;
  if (z > -13.9 && z < -11.9 && x > -12.5 && x < 17.5) return false;               // kanal + pompa
  if (inWheat(x, z, 0.6)) return false;
  if (x > -21.2 && x < -16.5 && z > 9.5 && z < 16.5) return false;                 // balyalar
  if (x > -11 && x < -2 && Math.abs(z + 16) < 2.8) return false;                   // traktör
  return true;
};
const verge = createVegetation((x, z) => (farmFree(x, z) ? hW(x, z) : -100), {
  rect: [-60, -60, 60, 60], trees: 0, shrubs: 0, rocks: 0, water: -50, seed: 17,
  grass: LOW ? 22000 : 52000, grassAt: [9, 9, 32], grassFar: 70, grassA: 0x5c6a2c, grassB: 0xb0a15e,
});
verge.group.scale.y = 0.6;
scene.add(verge.group);

// Komşu tarla: kışlık buğday. Takvim gününe göre boy/renk (Mart kardeşlenme → Nisan başaklanma → Haziran hasat → anız).
const wheatField = new THREE.Group();
{
  const [x0, z0, x1, z1] = WHEAT, W = x1 - x0, D = z1 - z0;
  const soilG = new THREE.PlaneGeometry(W + 0.6, D + 0.6).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
  const soil = new THREE.Mesh(soilG, procedural({
    key: 'tarim-soil2', params: { color: 0x7a5a3c, roughness: 0.97 }, bump: 0.02,
    pattern: 'float r = 0.5 + 0.5*sin(p.z*21.0); col *= 0.75 + 0.2*r + 0.2*vn3(p*8.0) + 0.1*fbm3(p*0.8, 3); h = r*0.6 + vn3(p*8.0)*0.4;',
  }));
  soil.receiveShadow = true;
  soil.userData.noFit = true;
  wheatField.add(soil);
  const r2 = seeded(313);
  const stems = [], leaves = [], ears = [];
  for (let i = 0; i < 11; i++) {
    const x = (r2() - 0.5) * 0.3, z = (r2() - 0.5) * 0.26, yaw = r2() * 6.28, pit = 0.03 + r2() * 0.12, L = 0.88 + r2() * 0.14;
    stems.push(blade(L, 0.012, x, 0, z, yaw, pit, 0.0, 2));
    const e = new THREE.CylinderGeometry(0.0095, 0.006, 0.085, 5, 1, true).translate(0, 0.0425, 0).rotateX(-pit).rotateY(yaw);
    const tz = -L * Math.sin(pit);
    e.translate(x + tz * Math.sin(yaw), L * Math.cos(pit) - 0.02, z + tz * Math.cos(yaw));
    ears.push(tint(e, () => [1, 1, 1]));
  }
  for (let i = 0; i < 12; i++) leaves.push(blade(0.42 + r2() * 0.2, 0.03, (r2() - 0.5) * 0.28, 0.05 + r2() * 0.3, (r2() - 0.5) * 0.24, r2() * 6.28, 0.5 + r2() * 0.5, 0.35, 3));
  const clumpG = merge([...stems, ...leaves]), earG = merge(ears);
  const fieldMat = procedural({
    key: 'tarim-wheatfield', params: { color: 0x5f8f3a, roughness: 0.8, vertexColors: true, side: THREE.DoubleSide },
    pattern: 'col *= 0.8 + 0.35*vn3(p*3.0) + 0.1*fbm3(p*0.4, 3);',
  });
  const earMat = procedural({
    key: 'tarim-wheatear', params: { color: 0x7fa048, roughness: 0.7, vertexColors: true, side: THREE.DoubleSide },
    pattern: 'col *= 0.85 + 0.3*vn3(p*5.0);',
  });
  const SP = LOW ? 0.34 : 0.28, nx = Math.floor(W / SP), nz = Math.floor(D / SP);
  const clumps = instanced(clumpG, fieldMat, nx * nz), earsM = instanced(earG, earMat, nx * nz);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  let k = 0;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = x0 + (i + 0.5) * SP + (hash(i, j) - 0.5) * SP * 0.5, z = z0 + (j + 0.5) * SP + (hash(j, i + 7) - 0.5) * SP * 0.3;
    const s = 0.85 + hash(i + 3, j) * 0.3;
    m4.compose(v.set(x, 0.02, z), q.setFromEuler(e.set((hash(i, j + 5) - 0.5) * 0.12, hash(i + 9, j) * 6.28, (hash(i + 1, j + 2) - 0.5) * 0.12)), sc.set(s, 0.9 + hash(j, i) * 0.2, s));
    clumps.setMatrixAt(k, m4); earsM.setMatrixAt(k, m4); k++;
  }
  clumps.userData.noCast = earsM.userData.noCast = true;
  clumps.castShadow = earsM.castShadow = false;
  clumps.receiveShadow = earsM.receiveShadow = true;
  clumps.userData.noFit = earsM.userData.noFit = true;
  wheatField.add(clumps, earsM);
  wheatField.userData = { clumps, earsM, fieldMat, earMat, soil };
}
scene.add(wheatField);

// Komşu sebze tarlası: güney yarıda lahana (Mart dikimi, Mayıs sonu hasat), kuzey yarıda soğan (sonbahar ekimi, Haziran hasat)
const vegField = new THREE.Group();
{
  const [x0, z0, x1, z1] = VEG;
  const soil = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 0.4, z1 - z0 + 0.4, 1, 1).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.025, (z0 + z1) / 2), wheatField.userData.soil.material);
  soil.receiveShadow = true; soil.userData.noFit = true;
  vegField.add(soil);
  const r3 = seeded(515);
  // Lahana: 11 dış yaprak rozeti + sıkı baş
  const cab = [];
  for (let i = 0; i < 11; i++) cab.push(blade(0.2 + r3() * 0.06, 0.13, 0, 0.02, 0, (i / 11) * 6.28 + r3() * 0.3, 1.05 + r3() * 0.3, -0.25, 3));
  cab.push(tint(new THREE.IcosahedronGeometry(0.1, 2).scale(1, 0.85, 1).translate(0, 0.1, 0), () => [1.25, 1.3, 1.1]));
  const cabG = merge(cab);
  // Soğan: 4 bitkilik öbek, her biri 5 ince boru yaprak
  const oni = [];
  for (let k = 0; k < 4; k++) { const ox = (k - 1.5) * 0.11; for (let i = 0; i < 5; i++) oni.push(blade(0.34 + r3() * 0.12, 0.012, ox, 0, (r3() - 0.5) * 0.03, r3() * 6.28, 0.12 + r3() * 0.3, 0.2, 3)); }
  const oniG = merge(oni);
  const vegMat = procedural({ key: 'tarim-vegleaf', params: { color: 0x6f9a52, roughness: 0.55, vertexColors: true, side: THREE.DoubleSide },
    pattern: 'col *= 0.82 + 0.3*vn3(p*14.0 + seed*7.0); rough = 0.45 + 0.3*vn3(p*30.0);' });
  const oniMat = procedural({ key: 'tarim-onion', params: { color: 0x5f8f48, roughness: 0.6, vertexColors: true, side: THREE.DoubleSide },
    pattern: 'col *= 0.85 + 0.25*vn3(p*9.0);' });
  const cabs = [], onis = [];
  for (let z = z0 + 0.45; z < z1; z += 0.75) for (let x = x0 + 0.3; x < x1 - 0.2; x += z < (z0 + z1) / 2 + 3 ? 0.5 : 0.5) {
    (z > (z0 + z1) / 2 - 1 ? cabs : onis).push([x + (r3() - 0.5) * 0.08, z + (r3() - 0.5) * 0.06, r3() * 6.28, 0.8 + r3() * 0.4]);
  }
  const mk = (G, M, list) => {
    const im = instanced(G, M, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), Yv = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
    list.forEach(([x, z, a, k], i) => im.setMatrixAt(i, m4.compose(v.set(x, 0.03, z), q.setFromAxisAngle(Yv, a), s.set(k, k, k))));
    im.castShadow = true; im.receiveShadow = true; im.userData.noFit = true;
    vegField.add(im);
    return im;
  };
  vegField.userData = { cab: mk(cabG, vegMat, cabs), oni: mk(oniG, oniMat, onis), cabs };
}
scene.add(vegField);
function updateVegField(doy) {
  const U = vegField.userData;
  const cg = 0.6 + 0.7 * smoothstep(62, 140, doy);                       // lahana: fide → baş; hasattan sonra tarla boş
  U.cab.visible = doy < 150;
  if (U.cab.visible && Math.abs((U.cg || 0) - cg) > 0.01) {                 // örnek başına ölçek (ağ ölçeklenirse konumlar da kayar)
    U.cg = cg;
    U.cabs.forEach(([x, z, a, k], i) => U.cab.setMatrixAt(i, _vm.compose(_vv.set(x, 0.03, z), _vq.setFromAxisAngle(_vy, a), _vs.setScalar(k * cg))));
    U.cab.instanceMatrix.needsUpdate = true;
  }
  const og = doy < 172 ? 0.8 + 0.5 * smoothstep(60, 130, doy) : 0.001;      // soğan: boylanır, Haziran'da sökülür
  U.oni.scale.set(1, og, 1); U.oni.visible = doy < 172;
  U.oni.material.color.setHex(0x5f8f48).lerp(_vc.setHex(0x9a9a55), smoothstep(145, 170, doy));
}
const _vc = new THREE.Color(), _vm = new THREE.Matrix4(), _vv = new THREE.Vector3(), _vq = new THREE.Quaternion(), _vy = new THREE.Vector3(0, 1, 0), _vs = new THREE.Vector3();
// Yakın çevre ağaç sıraları (tarla sınırlarında rüzgâr kıran), orta mesafede
{
  const tl = createVegetation(hW, {
    rect: [-420, -420, 420, 420], trees: LOW ? 700 : 1400, shrubs: LOW ? 250 : 600, rocks: 0, seed: 23, water: -50,
    kinds: { broad: 0.55, poplar: 0.3, cypress: 0.15 }, leafA: 0x3c5426, leafB: 0x6a6f34,
    forest: (x, z) => {
      const r = Math.hypot(x, z); if (r < 58) return 0;
      const q = x * 0.985 + z * 0.174, w = -x * 0.174 + z * 0.985;
      const e = Math.min(Math.abs(((q % 95) + 95) % 95), Math.abs(((w % 150) + 150) % 150));
      return e < 3.5 ? 0.9 : 0;
    },
  });
  scene.add(tl.group);
}
// Rulo saman balyaları: yuvarlatılmış kenarlı silindir, lifli saman dokusu
const strawMat = procedural({
  key: 'tarim-straw', params: { color: 0xc6a55e, roughness: 0.95 }, bump: 0.02,
  pattern: `float s = vn3(vec3(p.x*6.0, p.y*55.0, p.z*55.0))*0.6 + vn3(p*140.0)*0.4;
    float sp = 0.5 + 0.5*sin(length(p.yz - floor(p.yz/1.6)*1.6 - 0.8)*55.0);
    col *= 0.7 + 0.45*s + 0.08*sp - 0.15*fbm3(p*0.9, 3); h = s;`,
});
const baleG = new THREE.LatheGeometry([[0, -0.6], [0.66, -0.6], [0.73, -0.56], [0.76, -0.45], [0.76, 0.45], [0.73, 0.56], [0.66, 0.6], [0, 0.6]].map(([a, b]) => new THREE.Vector2(a, b)), 28).rotateZ(Math.PI / 2);
{
  const pts = [[-19.8, 11, 0.1], [-18.3, 11.2, 0.05], [-19.1, 12.6, -0.1], [-18.9, 14.3, 0.2], [-19.7, 15.6, 1.6]];
  const b = instanced(baleG, strawMat, pts.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  pts.forEach(([x, z, r], i) => b.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.74, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r), new THREE.Vector3(1, 1, 1))));
  scene.add(b);
}
const fieldBales = instanced(baleG, strawMat, 7);
{
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for (let i = 0; i < 7; i++) {
    const x = WHEAT[0] + 3 + (i % 4) * 7 + hash(i, 1) * 2, z = WHEAT[1] + 4 + Math.floor(i / 4) * 9 + hash(i, 2) * 3;
    fieldBales.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.76, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash(i, 3) * 3), new THREE.Vector3(1, 1, 1)));
  }
  fieldBales.visible = false;
  scene.add(fieldBales);
}
function updateWheatField(doy) {
  const U = wheatField.userData;
  const harvested = doy >= 168 && doy < 285, plowed = doy >= 285;
  const hgt = harvested ? 0.16 : plowed ? 0 : 0.3 + 0.7 * smoothstep(68, 128, doy);
  U.clumps.visible = !plowed;
  U.clumps.scale.set(1, Math.max(hgt, 0.001), 1);
  U.earsM.scale.set(1, Math.max(hgt, 0.001), 1);
  U.earsM.visible = !harvested && !plowed && doy >= 104;
  const ripe = smoothstep(135, 163, doy);
  U.fieldMat.color.setHex(0x5f8f3a).lerp(new THREE.Color(0xc9a85c), harvested ? 1 : ripe);
  if (harvested) U.fieldMat.color.setHex(0xbfa36a);
  U.earMat.color.setHex(0x86a44a).lerp(new THREE.Color(0xd9b563), smoothstep(125, 158, doy));
  fieldBales.visible = doy >= 170 && doy < 262;
}

// Traktör (~90 BG, 4 m boy): arka lastik Ø1,6 m, ön Ø0,95 m, kabin, kaput, egzoz, çamurluk, 3 nokta askı
function makeTractor() {
  const g = new THREE.Group();
  const red = mat.paintedMetal({ color: 0xa8231b, wear: 0.12 }), dark = mat.paintedMetal({ color: 0x26282c, wear: 0.25 });
  const rimM = mat.paintedMetal({ color: 0xcfc7b4, wear: 0.2 }), tyreM = mat.rubber({ color: 0x1b1c1e });
  const chrome = mat.brushedMetal({ color: 0x9a9ea3, rough: 0.3 });
  function tyre(R, Wd, n) {
    const r0 = R * 0.66, h = Wd / 2;
    const prof = [[r0, -h], [R - 0.07, -h], [R - 0.02, -h + 0.05], [R - 0.02, h - 0.05], [R - 0.07, h], [r0, h]].map(([a, b]) => new THREE.Vector2(a, b));
    const parts = [new THREE.LatheGeometry(prof, 40)];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      for (const sd of [-1, 1]) {
        const lug = new THREE.BoxGeometry(0.06, h * 0.95, 0.07).rotateX(sd * 0.55).translate(R - 0.005, sd * h * 0.48, sd * 0.04);
        lug.applyMatrix4(new THREE.Matrix4().makeRotationY(-a));
        parts.push(lug);
      }
    }
    // lastik ekseni y → dönüşten sonra z (lateral)
    return mergeNI(parts.map((p) => { p.deleteAttribute?.('uv'); return p; })).rotateX(Math.PI / 2);
  }
  const rearT = tyre(0.8, 0.44, 26), frontT = tyre(0.475, 0.3, 18);
  const rimG = (R, Wd) => mergeNI([new THREE.CylinderGeometry(R * 0.66, R * 0.66, Wd * 0.85, 28, 1, true), new THREE.CylinderGeometry(R * 0.4, R * 0.4, Wd * 0.3, 20).translate(0, Wd * 0.1, 0), new THREE.CylinderGeometry(R * 0.12, R * 0.14, Wd * 0.6, 12).translate(0, Wd * 0.2, 0)].map((p) => { p.deleteAttribute('uv'); return p; })).rotateX(Math.PI / 2);
  for (const [x, z, R, Wd, T] of [[0, 0.8, 0.8, 0.44, rearT], [0, -0.8, 0.8, 0.44, rearT], [2.3, 0.72, 0.475, 0.3, frontT], [2.3, -0.72, 0.475, 0.3, frontT]]) {
    const t = new THREE.Mesh(T, tyreM); t.position.set(x, R, z);
    const rim = new THREE.Mesh(rimG(R, Wd), rimM); rim.position.set(x, R, z); if (z < 0) rim.rotation.y = Math.PI;
    g.add(t, rim);
  }
  // Şasi, motor, kaput, ızgara, ön ağırlık
  g.add(new THREE.Mesh(new RoundedBoxGeometry(2.9, 0.55, 0.72, 2, 0.05).translate(1.3, 0.72, 0), dark));
  g.add(new THREE.Mesh(new RoundedBoxGeometry(2.25, 0.72, 0.86, 3, 0.12).translate(2.05, 1.38, 0), red));
  g.add(new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.62, 0.74, 1, 0.03).translate(3.2, 1.34, 0), procedural({
    key: 'tarim-grille', params: { color: 0x1c1d20, roughness: 0.5, metalness: 0.6 },
    pattern: 'float l = step(0.5, fract(p.y*22.0)); col *= 0.5 + 0.7*l; h = l;', bump: 0.01,
  })));
  g.add(new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.42, 0.9, 2, 0.05).translate(3.45, 0.72, 0), dark));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 1.5).translate(2.3, 0.47, 0), dark));
  for (const z of [-0.3, 0.3]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 16).rotateZ(Math.PI / 2).translate(3.26, 1.55, z), mat.ceramic({ color: 0xf4f1e6 })));
  // Egzoz ve hava filtresi
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 12).translate(1.35, 2.3, 0.33), chrome));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.35, 14).translate(1.35, 1.9, 0.33), dark));
  // Kabin: taban, dikmeler, tavan, camlar, koltuk, direksiyon
  const cab = new THREE.Group();
  cab.add(new THREE.Mesh(new RoundedBoxGeometry(1.55, 0.14, 1.5, 1, 0.04).translate(0.15, 1.3, 0), dark));
  const posts = [];
  for (const [x, z] of [[-0.6, -0.72], [-0.6, 0.72], [0.9, -0.72], [0.9, 0.72]]) posts.push(new THREE.BoxGeometry(0.07, 1.42, 0.07).translate(x, 2.05, z));
  cab.add(new THREE.Mesh(mergeNI(posts), dark));
  cab.add(new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.14, 1.72, 2, 0.05).translate(0.15, 2.8, 0), red));
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0x2b3a40, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, depthWrite: false });
  const panes = [new THREE.PlaneGeometry(1.45, 1.35).translate(0.15, 2.05, 0.72), new THREE.PlaneGeometry(1.45, 1.35).translate(0.15, 2.05, -0.72),
    new THREE.PlaneGeometry(1.4, 1.35).rotateY(Math.PI / 2).translate(0.9, 2.05, 0), new THREE.PlaneGeometry(1.4, 1.35).rotateY(Math.PI / 2).translate(-0.6, 2.05, 0)];
  const gl = new THREE.Mesh(mergeNI(panes), glassM); gl.material.side = THREE.DoubleSide; gl.userData.noCast = true; gl.castShadow = false;
  cab.add(gl);
  cab.add(new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.5, 0.5, 2, 0.08).translate(-0.25, 1.62, 0), mat.fabric({ color: 0x2c2c2c })));
  cab.add(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 24).rotateY(Math.PI / 2).rotateZ(0.6).translate(0.45, 1.95, 0), dark));
  g.add(cab);
  // Arka çamurluklar
  for (const z of [-0.8, 0.8]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.52, 28, 1, true, Math.PI * 0.6, Math.PI * 0.75).rotateX(Math.PI / 2).translate(0, 0.8, z), red);
    f.material.side = THREE.DoubleSide;
    g.add(f);
  }
  // 3 nokta askı + çeki demiri
  const hitch = [new THREE.BoxGeometry(0.9, 0.08, 0.08).rotateZ(0.25).translate(-0.7, 0.55, 0.35), new THREE.BoxGeometry(0.9, 0.08, 0.08).rotateZ(0.25).translate(-0.7, 0.55, -0.35),
    new THREE.BoxGeometry(0.7, 0.07, 0.07).rotateZ(-0.2).translate(-0.6, 1.05, 0), new THREE.BoxGeometry(0.5, 0.06, 0.2).translate(-0.55, 0.42, 0)];
  g.add(new THREE.Mesh(mergeNI(hitch), dark));
  g.add(new THREE.Mesh(new RoundedBoxGeometry(0.34, 0.34, 1.8, 2, 0.06).translate(0.0, 0.8, 0), dark));
  // Basamak
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.22).translate(0.55, 0.62, 0.95), dark));
  g.traverse((o) => { if (o.isMesh && !o.userData.noCast) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
const tractor = makeTractor();
tractor.position.set(-6.5, hW(-6.5, -16), -16.3);
tractor.rotation.y = 0.12;
scene.add(tractor);

// Çitler: kestane kazık + iki kat ahşap kuşak
{
  const lines = [[[-34, 17], [-13, 17]], [[-34, 17], [-34, -22]], [[-34, -22], [-18.8, -22]], [[WHEAT[0], WHEAT[3] + 1.2], [WHEAT[2], WHEAT[3] + 1.2]], [[WHEAT[2] + 1, WHEAT[3] + 1.2], [WHEAT[2] + 1, WHEAT[1] - 1]]];
  const parts = [];
  for (const [[ax, az], [bx, bz]] of lines) {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.5)), ang = Math.atan2(bz - az, bx - ax);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      parts.push(new THREE.CylinderGeometry(0.055, 0.07, 1.25, 7).rotateZ((hash(i, n) - 0.5) * 0.06).translate(x, 0.6, z));
    }
    for (const y of [0.55, 1.0]) parts.push(new THREE.BoxGeometry(L, 0.09, 0.035).rotateY(-ang).translate((ax + bx) / 2, y, (az + bz) / 2));
  }
  const fence = new THREE.Mesh(mergeNI(parts.map((p) => { p.deleteAttribute('uv'); return p; })), mat.wood({ color: 0x7c6a54, ring: 5 }));
  fence.castShadow = fence.receiveShadow = true;
  scene.add(fence);
}

// Sulama: beton kanalet (açık U kanal), tarla ağzı kapakları, kuyu + pompa + damla filtre ünitesi
{
  const CZ = -12.9, X0 = -11.9, X1 = 14.2, L = X1 - X0, XC = (X0 + X1) / 2;
  const conc = mat.concrete({ color: 0xb0aca2, stains: 0.6 });
  const u = [new THREE.BoxGeometry(L, 0.1, 0.8).translate(XC, 0.05, CZ), new THREE.BoxGeometry(L, 0.52, 0.1).translate(XC, 0.26, CZ - 0.35), new THREE.BoxGeometry(L, 0.52, 0.1).translate(XC, 0.26, CZ + 0.35)];
  // ara yoldaki geçiş plakası
  u.push(new THREE.BoxGeometry(2.4, 0.12, 1.1).translate(0, 0.58, CZ));
  const canal = new THREE.Mesh(mergeNI(u.map((p) => { p.deleteAttribute('uv'); return p; })), conc);
  canal.castShadow = canal.receiveShadow = true;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.02, 0.6).rotateX(-Math.PI / 2).translate(XC, 0.38, CZ), new THREE.MeshPhysicalMaterial({ color: 0x3f4d3e, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }));
  water.userData.noCast = true;
  scene.add(canal, water);
  // Kapaklar (T1 ve T2 ağızları): çelik çerçeve, kapak levhası, vidalı mil ve el çarkı
  const steelM = mat.paintedMetal({ color: 0x3f6f8f, wear: 0.45 }), wheelM = mat.paintedMetal({ color: 0xc9302c, wear: 0.3 });
  const gp = [], wp = [];
  for (const x of [-6.5, 6.5]) {
    gp.push(new THREE.BoxGeometry(0.08, 1.1, 0.08).translate(x - 0.34, 0.55, CZ + 0.3), new THREE.BoxGeometry(0.08, 1.1, 0.08).translate(x + 0.34, 0.55, CZ + 0.3),
      new THREE.BoxGeometry(0.76, 0.08, 0.1).translate(x, 1.1, CZ + 0.3), new THREE.BoxGeometry(0.62, 0.45, 0.03).translate(x, 0.45, CZ + 0.3),
      new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8).translate(x, 1.35, CZ + 0.3));
    wp.push(new THREE.TorusGeometry(0.14, 0.018, 8, 20).rotateX(Math.PI / 2).translate(x, 1.55, CZ + 0.3));
  }
  scene.add(new THREE.Mesh(mergeNI(gp.map((p) => { p.deleteAttribute('uv'); return p; })), steelM), new THREE.Mesh(mergeNI(wp.map((p) => { p.deleteAttribute('uv'); return p; })), wheelM));
  // Kuyu başı, pompa, iki kum filtresi (mavi tank), boru hattı
  const well = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.7, 28).translate(15.6, 0.35, CZ - 0.2), conc);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.05, 28).translate(15.6, 0.72, CZ - 0.2), mat.paintedMetal({ color: 0x5a6068, wear: 0.6 }));
  const pumpM = mat.paintedMetal({ color: 0x2f7a4a, wear: 0.2 });
  const pump = new THREE.Mesh(mergeNI([new THREE.CylinderGeometry(0.2, 0.2, 0.6, 18).rotateZ(Math.PI / 2).translate(15.6, 0.97, CZ - 0.2), new THREE.CylinderGeometry(0.16, 0.18, 0.3, 16).translate(15.2, 0.9, CZ - 0.2)].map((p) => { p.deleteAttribute('uv'); return p; })), pumpM);
  const blue = mat.plastic({ color: 0x2a5ea8, gloss: 0.4 }), pipeM = mat.plastic({ color: 0x1a1a1c, gloss: 0.2 });
  const tanks = [];
  for (const dz of [-0.9, 0.9]) tanks.push(new THREE.CapsuleGeometry(0.28, 0.6, 6, 18).translate(17.2, 0.62, CZ + dz));
  const tankM = new THREE.Mesh(mergeNI(tanks.map((p) => { p.deleteAttribute('uv'); return p; })), blue);
  const pipes = [new THREE.CylinderGeometry(0.055, 0.055, 1.6, 12).rotateZ(Math.PI / 2).translate(16.4, 1.0, CZ - 0.2), new THREE.CylinderGeometry(0.055, 0.055, 1.9, 12).rotateX(Math.PI / 2).translate(17.2, 1.05, CZ),
    new THREE.CylinderGeometry(0.06, 0.06, 1.8, 12).rotateZ(Math.PI / 2).translate(14.95, 0.34, CZ)];
  const pipe = new THREE.Mesh(mergeNI(pipes.map((p) => { p.deleteAttribute('uv'); return p; })), pipeM);
  for (const o of [well, lid, pump, tankM, pipe]) { o.castShadow = o.receiveShadow = true; scene.add(o); }
}

// --- Tarlalar ---
const CENTERS = [[-(PLOT + GAP) / 2, -(PLOT + GAP) / 2], [(PLOT + GAP) / 2, -(PLOT + GAP) / 2], [-(PLOT + GAP) / 2, (PLOT + GAP) / 2], [(PLOT + GAP) / 2, (PLOT + GAP) / 2]];
const DEFAULTS = [
  { crop: 'bugday', variety: 'standart', irr: 0, method: 'salma', N: 14 },
  { crop: 'misir', variety: 'standart', irr: 65, method: 'salma', N: 20 },
  { crop: 'domates', variety: 'standart', irr: 45, method: 'damla', N: 18 },
  { crop: 'pamuk', variety: 'standart', irr: 75, method: 'salma', N: 15 },
];
const DRY = new THREE.Color(0xb39574), WET = new THREE.Color(0x4a3526);
const SOIL_Y = 0.12, RIDGE = 0.1, PLANT_Y = SOIL_Y + RIDGE - 0.01;
const plots = CENTERS.map(([cx, cz], i) => {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  sim.scene.add(g);
  // Toprak: sırtlı (karıklı) yüzey; karık dipleri sıra aralarında. Rengi ve pürüzü nemle değişir.
  const sg = new THREE.PlaneGeometry(PLOT, PLOT, 10, ROWS_N * 8).rotateX(-Math.PI / 2), sp = sg.attributes.position, dz = PLOT / ROWS_N;
  for (let k = 0; k < sp.count; k++) { const z = sp.getZ(k), t = (z + PLOT / 2) / dz - 0.5; sp.setY(k, SOIL_Y + RIDGE * Math.cos(2 * Math.PI * t)); }
  sg.computeVertexNormals();
  { // karık dipleri koyu (nem, gölge), sırt tepeleri açık
    const cc = new Float32Array(sp.count * 3);
    for (let k = 0; k < sp.count; k++) { const u = (sp.getY(k) - (SOIL_Y - RIDGE)) / (2 * RIDGE), v = 0.62 + 0.42 * u; cc[k * 3] = v; cc[k * 3 + 1] = v * 0.98; cc[k * 3 + 2] = v * 0.95; }
    sg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  }
  const soil = new THREE.Mesh(sg, procedural({
    key: 'tarim-soil', params: { color: 0x8b6b4a, roughness: 0.95, vertexColors: true }, bump: 0.035,
    pattern: `float cl = vn3(p*9.0), cr = fbm3(p*2.5, 4), st = smoothstep(0.72, 0.8, vn3(p*23.0 + 3.0));
      float clod = smoothstep(0.35, 0.05, cells3(p*11.0)), crumb = vn3(p*38.0);
      col *= 0.62 + 0.42*cl + 0.18*cr + 0.12*crumb; col = mix(col, col*1.35 + 0.05, st*0.5); col *= 1.0 - 0.18*clod;
      h = cl*0.45 + st*0.2 + (1.0 - clod)*0.5 + crumb*0.2;`,
  }));
  soil.receiveShadow = true;
  soil.userData.plot = i;
  g.add(soil);
  // Tarla seddesi (toprak bent)
  const bund = mat.concrete({ color: 0x7d6246, stains: 0 });
  const bm = procedural({ key: 'tarim-bund', params: { color: 0x7a5e42, roughness: 1 }, pattern: 'col *= 0.8 + 0.3*vn3(p*7.0) + 0.1*fbm3(p*2.0, 3); h = vn3(p*7.0);', bump: 0.03 });
  for (const [w, d, x, z] of [[PLOT + 0.5, 0.35, 0, -PLOT / 2 - 0.1], [PLOT + 0.5, 0.35, 0, PLOT / 2 + 0.1], [0.35, PLOT, -PLOT / 2 - 0.1, 0], [0.35, PLOT, PLOT / 2 + 0.1, 0]]) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(w, 0.3, d, 2, 0.12), bm);
    b.position.set(x, 0.06, z);
    g.add(b);
  }
  void bund;
  // Salma suyu (karık diplerinde) ve damla hatları (sıra üstünde)
  const water = instanced(new THREE.BoxGeometry(PLOT - 0.3, 0.02, 0.2), new THREE.MeshPhysicalMaterial({ color: 0x5a4a30, roughness: 0.05, transparent: true, opacity: 0, ior: 1.33 }), ROWS_N);
  const drip = instanced(new THREE.CylinderGeometry(0.008, 0.008, PLOT - 0.4, 8), dripMat, ROWS_N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));
  for (let r = 0; r < ROWS_N; r++) {
    const z = -PLOT / 2 + (r + 0.5) * dz;
    water.setMatrixAt(r, m.makeTranslation(0, SOIL_Y - RIDGE + 0.03, z + dz / 2));
    drip.setMatrixAt(r, m.compose(new THREE.Vector3(0, SOIL_Y + RIDGE + 0.008, z + 0.08), q, new THREE.Vector3(1, 1, 1)));
  }
  water.userData.noCast = true;
  g.add(water, drip);
  // Seçim çerçevesi
  const sel = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(PLOT + 0.5, 0.3, PLOT + 0.5)), new THREE.LineBasicMaterial({ color: 0xfacc15 }));
  sel.position.y = 0.1;
  sel.visible = false;
  g.add(sel);
  const lbl = sim.label('', { parent: g, position: [0, 3.2, PLOT / 2 - 1.2] });
  // Bitki taban yerleşimi
  const base = [];
  for (let r = 0; r < ROWS_N; r++) for (let c = 0; c < COLS_N; c++) {
    const k = r * COLS_N + c;
    base.push({
      x: -PLOT / 2 + (c + 0.5) * (PLOT / COLS_N) + (hash(k, i) - 0.5) * 0.15,
      z: -PLOT / 2 + (r + 0.5) * (PLOT / ROWS_N) + (hash(i, k) - 0.5) * 0.1,
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler((hash(k, 9) - 0.5) * 0.1, hash(k, 5) * 6.28, (hash(k, 4) - 0.5) * 0.1)),
      s: 0.85 + hash(k, 11) * 0.3, h: hash(k, i + 20),
    });
  }
  return { i, g, soil, water, drip, sel, lbl, base, plant: null, fruit: null, ...structuredClone(DEFAULTS[i]), sow: CROPS[DEFAULTS[i].crop].sow };
});

function buildPlants(p) {
  for (const k of ['plant', 'fruit']) if (p[k]) { p[k].removeFromParent(); p[k].dispose(); }
  const G = GEOS[p.crop];
  p.plant = instanced(G.plant, plantMat, PLANTS);
  p.fruit = instanced(G.fruit, fruitMat, PLANTS);
  const w = new THREE.Color(1, 1, 1);
  for (let k = 0; k < PLANTS; k++) { p.plant.setColorAt(k, w); p.fruit.setColorAt(k, w); }
  p.plant.frustumCulled = p.fruit.frustumCulled = false;
  p.g.add(p.plant, p.fruit);
}

function resetPlotState(p) {
  Object.assign(p, {
    W: (scenario.value === 'kurak' ? 0.45 : 0.9) * taw(p), sown: false, done: false, gdd: 0, f: 0, B: 0, CC: 0, ccDmg: 0, ksAvg: 1, ks: 1,
    hiHeat: 1, hiWater: 1, hiHail: 1, leached: 0, uptake: 0, et: 0, irrApplied: 0, drainSum: 0, wet: 0,
    harvestDoy: 0, yield: 0, immature: false, heatDays: 0, stressDays: 0,
  });
}
const taw = (p) => (p.variety === 'dayanikli' ? 175 : 145);
const depl = (p) => (p.variety === 'dayanikli' ? 0.62 : 0.5);

// Azot faktörü (Mitscherlich) ve aşırı gübre cezası
function nFactor(p) {
  const c = CROPS[p.crop];
  const supply = Math.max(0, NSOIL + p.N - p.leached);
  return 1 - Math.exp(-supply / (c.nOpt / 3));
}
const overN = (p) => clamp(1 - 0.015 * Math.max(0, p.N - 1.4 * CROPS[p.crop].nOpt), 0.5, 1);

function canopyPot(c, f) {
  return c.ccx * Math.max(0.03, smoothstep(0.0, 0.32, f)) * (1 - 0.5 * smoothstep(0.85, 1, f));
}
function kcAt(c, f) {
  const [ini, mid, end] = c.kc;
  if (f < 0.15) return ini;
  if (f < 0.45) return lerp(ini, mid, (f - 0.15) / 0.3);
  if (f < 0.8) return mid;
  return lerp(mid, end, (f - 0.8) / 0.2);
}

function stepPlot(p, w) {
  const c = CROPS[p.crop], doy = w.doy;
  if (!p.sown && !p.done && doy >= p.sow) p.sown = true;
  const growing = p.sown && !p.done;
  const TAW = taw(p), pDep = depl(p);
  // Sulama
  let irr = 0;
  if (growing && p.irr > 0) {
    if (p.method === 'damla') irr = p.irr / 7;
    else if ((doy - p.sow) % 7 === 0) irr = p.irr;
  }
  const eff = p.method === 'damla' ? 0.9 : 0.6;
  p.irrApplied += irr;
  if (irr > 0 && p.method === 'salma') p.wet = 1;
  let drain = p.method === 'salma' ? irr * 0.2 : 0;  // salmada kaybın bir kısmı derine sızar
  p.W += w.rain * (w.rain > 25 ? 0.85 : 1) + irr * eff;
  if (p.W > TAW) { drain += p.W - TAW; p.W = TAW; }
  p.drainSum += drain;
  // Azot yıkanması
  const pool = Math.max(0, NSOIL + p.N - p.leached - p.uptake);
  if (drain > 0) p.leached += pool * (drain / (drain + 300)) * 0.5;
  // Su stresi ve evapotranspirasyon
  const ks = p.W >= (1 - pDep) * TAW ? 1 : Math.max(0, p.W / ((1 - pDep) * TAW));
  p.ks = ks;
  let et;
  if (growing) et = ks * Math.max(0.25, kcAt(c, p.f) * (0.3 + 0.7 * Math.min(1, p.CC / c.ccx + 0.2))) * w.et0;
  else et = 0.2 * (p.W / TAW) * w.et0;
  et = Math.min(et, p.W);
  p.W -= et;
  if (!growing) return;
  p.et += et;
  // Gelişim ve büyüme
  p.gdd += Math.max(0, Math.min(w.T, 32) - c.base);
  p.f = Math.min(1, p.gdd / c.gdd);
  const nf = nFactor(p);
  p.ksAvg = lerp(p.ksAvg, ks, 0.08);
  p.CC = canopyPot(c, p.f) * Math.sqrt(nf) * (0.35 + 0.65 * p.ksAvg) * (1 - p.ccDmg);
  const tf = clamp((w.T - c.base) / 4, 0, 1) * (w.tmax > c.heatT + 6 ? 0.7 : 1);
  const dB = c.wp * ks * p.CC * 1.1 * tf * nf;
  p.B += dB;
  p.uptake += dB * c.nconc;
  p.ccDmg *= 0.97;
  if (ks < 0.5) p.stressDays++;
  if (p.f > 0.45 && p.f < 0.72) {
    if (w.tmax > c.heatT) { p.hiHeat = Math.max(0.3, p.hiHeat - (w.tmax - c.heatT) * 0.006); p.heatDays++; }
    if (ks < 0.6) p.hiWater = Math.max(0.4, p.hiWater - (0.6 - ks) * 0.03);
  }
  if (w.hail) {
    p.B *= 0.72; p.ccDmg = 0.55;
    if (p.f > 0.4) p.hiHail *= 0.75;
  }
  if (p.f >= 1) harvest(p, doy, false);
}

function yieldEst(p) {
  const c = CROPS[p.crop];
  const immat = p.f >= 1 ? 1 : smoothstep(0.55, 1, p.f);
  return p.B * c.hi * p.hiHeat * p.hiWater * p.hiHail * overN(p) * (p.variety === 'dayanikli' ? 0.92 : 1) * immat * c.fresh;
}
function harvest(p, doy, forced) {
  p.done = true;
  p.harvestDoy = doy;
  p.immature = forced && p.f < 1;
  p.yield = yieldEst(p);
  if (!forced) sim.toast(`${CROPS[p.crop].emoji} T${p.i + 1} hasat edildi: <b>${fmt(p.yield)} kg/da</b>`, 'good');
}

function economics(p) {
  const c = CROPS[p.crop];
  const y = p.done ? p.yield : yieldEst(p);
  const revenue = y * prices[p.crop];
  const water = p.irrApplied * waterCost.value; // 1 mm = 1 m³/da
  const cost = c.fixed + (p.variety === 'dayanikli' ? 400 : 0) + p.N * nPrice.value + water + (p.method === 'damla' && p.irr > 0 ? 1500 : 0);
  const wf = y > 1 ? (p.et * 1000) / y : Infinity;
  return { y, revenue, cost, profit: revenue - cost, wf };
}

// --- Sezon akışı ---
let day = 0, acc = 0, ended = false;
function newSeason(reroll) {
  if (reroll) weatherSeed = (Math.random() * 1e9) | 0;
  makeWeather();
  day = 0; acc = 0; ended = false;
  plots.forEach((p) => { resetPlotState(p); if (!p.plant || p.plant.userData.crop !== p.crop) { buildPlants(p); p.plant.userData.crop = p.crop; } });
  rainTotal = 0;
  sim.hud.hide();
  chartW.clear(); chartB.clear();
  refreshLegend();
  updateVisuals();
  updatePanel();
}
let rainTotal = 0;

function stepDay() {
  if (ended) return;
  const w = weather[day];
  rainTotal += w.rain;
  for (const p of plots) stepPlot(p, w);
  if (w.rain > 0) rainVis = Math.max(rainVis, clamp(w.rain / 15, 0.35, 1));
  if (w.hail) { hailVis = 1; sim.toast('🧊 Dolu yağdı! Yapraklar ve meyveler zarar gördü.', 'bad'); }
  if (w.heat && weather[day - 1] && !weather[day - 1].heat) sim.toast('🔥 Sıcak hava dalgası başladı (+8 °C)', 'warn');
  const sp = plots[selIdx];
  chartW.push([100 * sp.W / taw(sp), 100 * sp.ks, Math.min(100, w.rain * 3)]);
  chartB.push(plots.map((p) => p.B));
  day++;
  const allDone = plots.every((p) => p.done);
  if (day >= SEASON || allDone) {
    for (const p of plots) if (!p.done) harvest(p, DOY0 + day - 1, true);
    ended = true;
    showSummary();
  }
}

sim.onUpdate((dt) => {
  if (ended) return;
  acc += dt;
  let n = 0;
  while (acc >= SEC_PER_DAY && !ended && n < 40) { acc -= SEC_PER_DAY; stepDay(); n++; }
  if (n) { updateVisuals(); if (sim.frame % 2 === 0 || ended) updatePanel(); }
});

sim.onRender((rdt) => {
  // Yağmur/dolu parçacıkları
  rainVis = Math.max(0, rainVis - rdt * 0.9);
  hailVis = Math.max(0, hailVis - rdt * 0.35);
  const vis = Math.max(rainVis, hailVis);
  rainPts.visible = vis > 0.01;
  if (rainPts.visible) {
    const hail = hailVis > rainVis;
    rainMat.opacity = 0.7 * vis;
    rainMat.color.setHex(hail ? 0xffffff : 0xbfd8ff);
    const a = rainGeo.attributes.position.array, len = hail ? 0.15 : 0.5, sp = rdt * (hail ? 9 : 16);
    for (let i = 0; i < RAIN_N; i++) {
      let y = a[i * 6 + 1] - sp;
      if (y < 0) y += 16;
      a[i * 6 + 1] = y; a[i * 6 + 4] = y + len;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }
  // Salma suyu zamanla çekilir
  for (const p of plots) {
    p.wet = Math.max(0, p.wet - rdt * 0.5 * sim.speed);
    p.water.material.opacity = 0.75 * p.wet;
    p.water.visible = p.wet > 0.01;
  }
  // Gökyüzü: yağışta bulut ve pus, sıcak dalgada kuru pus (adımlı güncelleme)
  const w = weather[Math.min(day, SEASON - 1)];
  const cl = Math.round(Math.max(rainVis, hailVis) * 8) / 8, hz = w && w.heat ? 1 : 0;
  const key = cl * 10 + hz;
  if (key !== skyKey) {
    skyKey = key;
    sim.sky.set({ clouds: lerp(0.22, 0.92, cl), haze: lerp(hz ? 2.8 : 2.1, 2.4, cl), visibility: lerp(hz ? 6000 : 9000, 4000, cl) });
  }
  station.userData.cups.rotation.y += rdt * (3 + 6 * cl);
  vergeT += rdt;
  verge.update(vergeT, 0.8 + 2.5 * cl);
});
let skyKey = -1, vergeT = 0;

// --- Görsel güncelleme ---
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const STRESS = new THREE.Color(0xc9b458), STUB = new THREE.Color(0xa88a5c);
function updateVisuals() {
  updateWheatField(DOY0 + Math.min(day, SEASON - 1));
  updateVegField(DOY0 + Math.min(day, SEASON - 1));
  for (const p of plots) {
    const c = CROPS[p.crop];
    const wf = clamp(p.W / taw(p), 0, 1);
    p.soil.material.color.copy(DRY).lerp(WET, wf);
    p.soil.material.roughness = lerp(0.97, 0.7, wf);
    p.drip.visible = p.method === 'damla';
    const growing = p.sown && !p.done;
    const hFrac = p.sown ? (0.16 + 0.84 * smoothstep(0, 0.62, p.f)) * (0.55 + 0.45 * Math.min(1, p.B / (c.wp * 45))) : 0;
    const wFrac = 0.45 + 0.55 * Math.min(1, p.CC / c.ccx + 0.15);
    const ripe = smoothstep(0.78, 1, p.f);
    const fruitVis = p.sown ? smoothstep(0.45, 0.6, p.f) : 0;
    const keep = p.hiHeat * p.hiWater * p.hiHail * Math.min(1, p.B / (c.wp * 40) + 0.3);
    for (let k = 0; k < PLANTS; k++) {
      const b = p.base[k];
      let hs, ws;
      if (!p.sown) { hs = 0; ws = 0; }
      else if (p.done) { hs = 0.07; ws = 0.6; }
      else { hs = c.h * hFrac * b.s; ws = wFrac * b.s * (c.h > 1.5 ? 1 : 1.1); }
      _m.compose(_v.set(b.x, PLANT_Y, b.z), b.q, _s.set(ws, Math.max(hs, 0.0001), ws));
      p.plant.setMatrixAt(k, _m);
      if (p.done) _c.copy(STUB);
      else {
        _c.setHex(c.leaf).lerp(STRESS, (1 - p.ks) * 0.8).lerp(_c2.setHex(c.ripe), ripe);
        _c.multiplyScalar(0.9 + b.h * 0.2);
      }
      p.plant.setColorAt(k, _c);
      const showF = growing && fruitVis > 0 && b.h < keep;
      _m.compose(_v.set(b.x, PLANT_Y, b.z), b.q, _s.set(showF ? ws : 0, showF ? Math.max(hs, 0.0001) : 0, showF ? ws : 0));
      p.fruit.setMatrixAt(k, _m);
      if (showF) {
        const ripeF = smoothstep(0.62, 0.95, p.f);
        p.fruit.setColorAt(k, _c.setHex(p.crop === 'domates' || p.crop === 'pamuk' ? 0x5a9e3c : 0x8fb04a).lerp(_c2.setHex(c.fruitC), ripeF));
      }
    }
    p.plant.instanceMatrix.needsUpdate = p.fruit.instanceMatrix.needsUpdate = true;
    p.plant.instanceColor.needsUpdate = p.fruit.instanceColor.needsUpdate = true;
    // Etiket
    let status;
    if (!p.sown) status = `ekim: ${doyToDate(p.sow)}`;
    else if (p.done) status = `<b style="color:#86efac">${fmt(p.yield)} kg/da</b>${p.immature ? ' (olgunlaşmadan)' : ''}`;
    else status = `%${fmt(p.f * 100)} gelişim${p.ks < 0.6 ? ' · <span style="color:#fca5a5">susuz!</span>' : ''}`;
    p.lbl.setText(`T${p.i + 1} ${c.emoji} ${c.name} · ${status}`);
    p.sel.visible = p.i === selIdx;
  }
  const w = weather[Math.min(day, SEASON - 1)];
  if (w) {
    const icon = w.hail ? '🧊' : w.rain > 0 ? '🌧️' : w.heat ? '🔥' : w.tmax > 32 ? '☀️' : '🌤️';
    wxLbl.setText(`${icon} ${fmt(w.tmax)} °C${w.rain > 0 ? ` · ${fmt(w.rain)} mm` : ''}`);
  }
}

// --- Arayüz ---
let selIdx = 0;
const prices = Object.fromEntries(Object.entries(CROPS).map(([k, c]) => [k, c.price]));
const ui = sim.ui;
ui.section('Görünüm');
const VIEWS = { tarla: [[19, 6.8, 25], [-3, 0.6, -6]], ciftlik: [[-1, 4.2, 20], [-21, 2.2, -2]], yakin: [[9, 2.2, 10], [3, 0.4, 3]], hava: [[30, 38, 44], [2, 0, -4]] };
ui.segmented({ options: [{ value: 'tarla', label: 'Tarlalar' }, { value: 'yakin', label: 'Yakın' }, { value: 'ciftlik', label: 'Çiftlik' }, { value: 'hava', label: 'Havadan' }], value: 'tarla',
  onChange: (v) => sim.moveCamera(VIEWS[v][0], VIEWS[v][1]) });

ui.section('Tarla seç');
const plotSeg = ui.segmented({ options: plots.map((p) => ({ value: p.i, label: `T${p.i + 1}` })), value: 0, onChange: (v) => selectPlot(v) });
ui.text('<small>Sahnede bir tarlaya tıklayarak da seçebilirsin. Ürün, çeşit ve ekim tarihi değişince sezon baştan başlar; sulama ve gübre anında etkiler.</small>');

ui.section('Seçili tarlanın yönetimi');
const cropSel = ui.select({ label: 'Ürün', options: Object.entries(CROPS).map(([k, c]) => ({ value: k, label: `${c.emoji} ${c.name}` })), value: plots[0].crop,
  onChange: (v) => { const p = plots[selIdx]; p.crop = v; p.sow = CROPS[v].sow; sowS.set(p.sow); priceS.set(prices[v]); newSeason(false); } });
const varSeg = ui.segmented({ label: 'Tohum çeşidi', options: [{ value: 'standart', label: 'Standart' }, { value: 'dayanikli', label: 'Kuraklığa dayanıklı' }], value: 'standart',
  onChange: (v) => { plots[selIdx].variety = v; newSeason(false); } });
const sowS = ui.slider({ label: 'Ekim tarihi', min: 60, max: 180, step: 1, value: plots[0].sow, format: doyToDate,
  onChange: (v) => { plots[selIdx].sow = v; newSeason(false); } });
const irrS = ui.slider({ label: 'Sulama', min: 0, max: 120, step: 1, value: plots[0].irr, unit: 'mm/hafta', onChange: (v) => { plots[selIdx].irr = v; updatePanel(); } });
const methSeg = ui.segmented({ label: 'Sulama yöntemi', options: [{ value: 'damla', label: '💧 Damla (%90 verim)' }, { value: 'salma', label: '🌊 Salma (%60 verim)' }], value: plots[0].method,
  onChange: (v) => { plots[selIdx].method = v; updateVisuals(); updatePanel(); } });
const nS = ui.slider({ label: 'Azotlu gübre (N)', min: 0, max: 40, step: 1, value: plots[0].N, unit: 'kg/da', onChange: (v) => { plots[selIdx].N = v; updatePanel(); } });
ui.button({ label: 'Bu sulama/gübre ayarını tüm tarlalara uygula', onClick: () => {
  const s = plots[selIdx];
  plots.forEach((p) => { p.irr = s.irr; p.method = s.method; p.N = s.N; });
  updateVisuals(); updatePanel(); sim.toast('Ayarlar dört tarlaya uygulandı');
} });

ui.section('Hava ve senaryo');
const scenario = ui.segmented({ options: [{ value: 'normal', label: 'Normal' }, { value: 'kurak', label: '🏜️ Kuraklık' }, { value: 'sicak', label: '🔥 Sıcak dalga' }, { value: 'dolu', label: '🧊 Dolu' }],
  value: 'normal', onChange: () => newSeason(false) });
ui.buttons([
  { label: '🎲 Yeni hava', onClick: () => newSeason(true) },
  { label: '⏩ Sezonu bitir', variant: 'primary', onClick: () => { while (!ended) stepDay(); updateVisuals(); updatePanel(); } },
]);
const stDate = ui.stat({ label: 'Tarih' });
const stT = ui.stat({ label: 'En yüksek sıcaklık', unit: '°C' });
const stRain = ui.stat({ label: 'Toplam yağış', unit: 'mm' });
const stET0 = ui.stat({ label: 'ET₀ (bugün)', unit: 'mm' });

ui.section('Seçili tarla');
const mW = ui.meter({ label: 'Toprak suyu (kullanılabilir)', color: '#3b82f6' });
const mF = ui.meter({ label: 'Gelişim (derece-gün)', color: '#22c55e' });
const stB = ui.stat({ label: 'Biyokütle', unit: 'kg/da' });
const stY = ui.stat({ label: 'Verim (tahmini)', unit: 'kg/da' });
const stProfit = ui.stat({ label: 'Kâr', unit: '₺/da' });
const stRev = ui.stat({ label: 'Gelir / maliyet', unit: '₺/da' });
const stIrr = ui.stat({ label: 'Sulama suyu', unit: 'm³/da' });
const stWF = ui.stat({ label: 'Su ayak izi', unit: 'L/kg' });
const stLeach = ui.stat({ label: 'Yıkanan azot', unit: 'kg/da' });
const stNf = ui.stat({ label: 'Azot yeterliliği' });
const note = ui.text('', 'card');
const chartW = ui.chart({ title: 'Seçili tarla: toprak suyu ve stres (%)', yMin: 0, yMax: 100, maxPoints: SEASON,
  series: [{ name: 'Toprak suyu', color: '#3b82f6', fill: true }, { name: 'Su stresi yok (Ks)', color: '#22c55e' }, { name: 'Yağış', color: '#94a3b8' }] });
const chartB = ui.chart({ title: 'Biyokütle (kg/da)', maxPoints: SEASON, series: PLOT_COL.map((color) => ({ name: 'T', color })) });

ui.section('Fiyatlar (örnek)', { open: false });
const priceS = ui.slider({ label: 'Seçili ürünün fiyatı', min: 1, max: 60, step: 0.5, value: prices[plots[0].crop], format: (v) => `${fmt(v, 1)} ₺/kg`,
  onChange: (v) => { prices[plots[selIdx].crop] = v; updatePanel(); } });
const nPrice = ui.slider({ label: 'Azot fiyatı', min: 10, max: 100, step: 1, value: 40, format: (v) => `${fmt(v)} ₺/kg N`, onChange: () => updatePanel() });
const waterCost = ui.slider({ label: 'Sulama suyu + pompa enerjisi', min: 0, max: 10, step: 0.25, value: 2.5, format: (v) => `${fmt(v, 2)} ₺/m³`, onChange: () => updatePanel() });
ui.text('<small>Sabit maliyet (tohum, toprak işleme, ilaç, hasat) ürüne göre eklenir; damla sistemi +1.500 ₺/da, dayanıklı tohum +400 ₺/da.</small>');

function refreshLegend() {
  chartB.el.querySelectorAll('.legend span').forEach((s, i) => {
    const c = CROPS[plots[i].crop];
    s.lastChild.textContent = `T${i + 1} ${c.name}`;
  });
}

function selectPlot(i) {
  selIdx = i;
  plotSeg.set(i);
  const p = plots[i];
  cropSel.set(p.crop); varSeg.set(p.variety); sowS.set(p.sow); irrS.set(p.irr); methSeg.set(p.method); nS.set(p.N);
  priceS.set(prices[p.crop]);
  chartW.clear();
  updateVisuals();
  updatePanel();
}

function updatePanel() {
  const w = weather[Math.min(day, SEASON - 1)];
  stDate.set(doyToDate(w.doy));
  stT.set(fmt(w.tmax), w.tmax > 35 ? 'bad' : w.tmax > 30 ? 'warn' : '');
  stRain.set(fmt(rainTotal));
  stET0.set(fmt(w.et0, 1));
  const p = plots[selIdx], c = CROPS[p.crop];
  const wr = p.W / taw(p);
  mW.set(wr, `%${fmt(wr * 100)}`);
  mW.color(wr < 1 - depl(p) ? '#f97316' : '#3b82f6');
  mF.set(p.f, p.done ? 'hasat edildi' : p.sown ? `%${fmt(p.f * 100)}` : 'ekilmedi');
  const e = economics(p);
  stB.set(fmt(p.B));
  stY.set(fmt(e.y), p.done ? 'good' : '');
  stY.el.querySelector('.stat-l').textContent = p.done ? 'Verim (hasat)' : 'Verim (tahmini)';
  stProfit.set(fmt(e.profit), e.profit >= 0 ? 'good' : 'bad');
  stRev.set(`${fmt(e.revenue / 1000, 1)} / ${fmt(e.cost / 1000, 1)} bin`);
  stIrr.set(fmt(p.irrApplied));
  stWF.set(isFinite(e.wf) ? fmt(e.wf) : '—');
  stLeach.set(fmt(p.leached, 1), p.leached > 3 ? 'bad' : p.leached > 1 ? 'warn' : '');
  const nf = nFactor(p);
  stNf.set(`%${fmt(nf * 100)}`, p.N > 1.4 * c.nOpt ? 'bad' : nf < 0.8 ? 'warn' : 'good');
  const tips = [];
  if (p.N > 1.4 * c.nOpt) tips.push(`⚠️ Aşırı gübre: ${c.name} için ~${c.nOpt} kg/da yeterli; fazlası yatma/tuzluluk yapar ve yıkanır.`);
  else if (nf < 0.75) tips.push('Azot yetersiz: yaprak örtüsü zayıf kalıyor.');
  if (p.stressDays > 10) tips.push(`💧 ${p.stressDays} gün şiddetli su stresi yaşandı.`);
  if (p.heatDays > 0) tips.push(`🔥 Çiçeklenmede ${p.heatDays} gün aşırı sıcak (> ${c.heatT} °C): tane/meyve tutumu azaldı.`);
  if (p.drainSum > 80) tips.push(`Derine sızan su: ${fmt(p.drainSum)} mm (sulama fazla ya da salma).`);
  if (p.immature) tips.push('Sezon bitti ama ürün olgunlaşmadı: ekim çok geçti.');
  note.set(tips.length ? tips.join('<br>') : `${c.emoji} ${c.name}: ${p.done ? 'hasat tamam.' : p.sown ? 'gelişiyor, sorun yok.' : `${doyToDate(p.sow)} tarihinde ekilecek.`}`);
}

function showSummary() {
  const rows = plots.map((p) => {
    const c = CROPS[p.crop], e = economics(p);
    return `<tr><td>T${p.i + 1} ${c.emoji} ${c.name}</td><td>${fmt(e.y)}</td><td style="color:${e.profit >= 0 ? '#86efac' : '#fca5a5'}">${fmt(e.profit)}</td><td>${isFinite(e.wf) ? fmt(e.wf) : '—'}</td></tr>`;
  }).join('');
  const sc = { normal: 'Normal yıl', kurak: 'Kuraklık', sicak: 'Sıcak hava dalgası', dolu: 'Dolu' }[scenario.value];
  sim.hud.show(`<h2>🚜 Hasat raporu · ${sc}</h2>
    <table style="margin:0 auto;font-size:13px;border-spacing:10px 3px;text-align:right">
      <tr style="color:#94a3b8"><th style="text-align:left">Tarla</th><th>Verim kg/da</th><th>Kâr ₺/da</th><th>Su izi L/kg</th></tr>${rows}</table>
    <small>Toplam yağış ${fmt(rainTotal)} mm</small><br>
    <button class="btn primary" data-a="same">Aynı havayla tekrar</button><button class="btn" data-a="new">🎲 Yeni sezon</button>`, { tone: 'good' });
  sim.hud.el.querySelector('[data-a=same]').onclick = () => newSeason(false);
  sim.hud.el.querySelector('[data-a=new]').onclick = () => newSeason(true);
}

sim.onClick(() => plots.map((p) => p.soil), (hit) => selectPlot(hit.object.userData.plot));
sim.formatTime = () => (weather.length ? doyToDate(weather[Math.min(day, SEASON - 1)].doy) : '');
sim.onReset(() => newSeason(false));
newSeason(false);
selectPlot(0);
