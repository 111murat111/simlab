// Mars Kolonisi — sol döngüsü, toz fırtınası ve O₂ / su / besin / enerji için kütle-enerji dengesi.
import { createSim, THREE, fmt, clamp, lerp, smoothstep, rand, seeded, ImprovedNoise, instanced, TAU, mat, procedural, landscape,
  createTerrain, terrainSkirt, terrainMaterial, RoundedBoxGeometry, BufferGeometryUtils } from '@core';
import { marsSky } from './marssky.js';

const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;

// --- Model sabitleri ---
const SOL_H = 24 + 39 / 60 + 35 / 3600; // bir sol ≈ 24 sa 39 dk 35 sn
const S_MARS = 590;     // W/m², Mars yörüngesinde ortalama güneş ışınımı (Dünya'nın ≈ %43'ü)
const ETA = 0.2;        // panel verimi (toz, sıcaklık kayıpları dahil, temsili)
const O2_PP = 0.84;     // kg O₂ / kişi / sol (NASA BVAD nominal)
const DRINK = 2.5;      // kg içme suyu / kişi / sol
const W_USE = 6;        // kg toplam su kullanımı / kişi / sol (içme + yemek + hijyen, temsili)
const AREA_PP = 45;     // m² sera ≈ bir kişinin tüm besini ve O₂'si (40–50 m²)
const KWH_O2 = 10;      // kWh / kg O₂ (CO₂ elektrolizi; kuramsal alt sınır ≈ 5, temsili)
const KWH_ICE = 0.5;    // kWh / kg buz kazı + eritme (temsili)
const GH_KW = 0.1;      // kW / m² sera LED aydınlatması (ortalama, temsili)
const BASE_KW = 1.5, CREW_KW = 1.0; // ısıtma, hava, su arıtma, iletişim (temsili)
const TAU_CLEAR = 0.5;  // açık havada tipik toz optik derinliği
const SEC_PER_SOL = 12; // 1× hızda bir sol kaç saniye sürer
const CAP = { o2: 3000, water: 30000, food: 5000 };
const M_PANEL = 40;     // her panel modeli 40 m²'yi temsil eder

const sim = createSim({
  sky: { elevation: 40, azimuth: 120, clouds: 0, haze: 1, visibility: 22000 },
  camera: { position: [34, 7.5, 44], target: [3, 1.2, -8], fov: 50, near: 0.3, far: 80000 },
  controls: { maxDistance: 900, minDistance: 3, maxPolarAngle: Math.PI * 0.485 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Ekvatordaki bir Mars üssü: yaşam modülleri, sera tüneli, CO₂'den oksijen üreten <b>MOXIE benzeri</b> ünite, buz madeni,
    batarya ve güneş paneli tarlası. Güneş bir <b>sol</b> (≈ 24 sa 39 dk) içinde doğup batar; toz fırtınası gökyüzünü karartır.
    Panelde üssün <b>oksijen, su, besin ve enerji</b> stokları ve "kaç sol yeter?" rezervi izlenir.</p>
    <h3>Model</h3>
    <ul>
      <li><b>Güneş:</b> Mars'ta atmosfer üstünde ortalama ≈ 590 W/m² (Dünya'nın ≈ %43'ü, Güneş'e 1,52 AU uzaklık).
      Yüzeye ulaşan ışık, toz optik derinliği τ ile Beer–Lambert (e<sup>−τ·m</sup>, m = hava kütlesi) + yaklaşık saçılmış ışık payıyla hesaplanır.
      Paneller yatay ve sabittir, verim %20 (temsili).</li>
      <li><b>Tüketim (kişi başı / sol):</b> O₂ ≈ 0,84 kg (NASA BVAD nominal), içme suyu ≈ 2,5 kg; toplam su kullanımı 6 kg (temsili),
      bunun geri kazanılamayan kısmı kaybolur.</li>
      <li><b>Sera:</b> Kişi başına ≈ 40–50 m² yoğun ışıklı ekim alanı hem tüm besini hem O₂'yi karşılayabilir; burada 45 m² = 1 kişi.
      LED'ler sürekli ≈ 0,1 kW/m² çeker (temsili).</li>
      <li><b>O₂ ünitesi:</b> Katı oksit elektroliziyle CO₂ → CO + O₂. Kuramsal enerji ≈ 5 kWh/kg; ısıtma kayıplarıyla 10 kWh/kg alındı (temsili).</li>
      <li><b>Enerji önceliği:</b> Güç yetmezse sırayla temel yaşam desteği → O₂ ünitesi → sera → buz madeni beslenir; önce maden ve sera kapanır.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li><b>Toz fırtınası</b> senaryosu: güneş gücü %80'den fazla düşer, batarya boşalır, sera karanlıkta kalır. O₂ rezervi kaç sol dayanıyor?</li>
      <li>Fırtına sırasında batarya kapasitesini artır ya da panel alanını iki katına çıkar: hangisi daha çok işe yarıyor?</li>
      <li><b>Kalabalık ekip</b>: 12 kişiye aynı altyapı yetmez. Sera alanını kişi başı 45 m² olacak şekilde büyütmeyi dene.</li>
      <li><b>Su geri kazanımı</b>nı %98'den %60'a düşür: buz madeni ne kadar hızlı çalışmak zorunda kalıyor?</li>
      <li>Sahnedeki yapılara tıkla: anlık üretim/tüketim değerlerini gösterir.</li>
    </ul>
    <h3>Sınırlar</h3>
    <p><small>Enerji yükleri, panel verimi, sera verimi ve su kullanımı temsili değerlerdir; gerçek bir üs tasarımı çok daha ayrıntılıdır
    (ısıl kontrol, CO₂ temizleme, yedek sistemler, ikmal). Üs ekvatorda ve ekinoks koşulunda varsayılır; mevsimler yoktur.
    ISS'te su geri kazanımı 2023'te %98'e ulaştı.</small></p>
    <p><small>Kaynaklar: NASA Life Support Baseline Values and Assumptions Document (BVAD, NASA/TP-2015-218570);
    Appelbaum & Flood, "Solar Radiation on Mars" (NASA TM-102299); NASA JPL MOXIE (Perseverance, 2021–2023: saatte 6–12 g O₂, toplam 122 g);
    NASA 2018 küresel toz fırtınası (Opportunity üzerinde τ ≈ 11).</small></p>`,
});

// --- Parametreler ve durum ---
const P = { crew: 4, panel: 1200, batt: 500, gh: 100, o2: 3.5, rec: 90, ice: 5, start: 60, stormTau: 5, stormDur: 35 };
const S = {};
let storm = null;
let scenario = 'dengeli';

function resetState() {
  Object.assign(S, {
    sol: 9.5 / 24, batt: P.batt * 0.8,
    o2: P.start * P.crew * O2_PP, water: P.start * P.crew * DRINK, food: P.start * P.crew,
    tau: TAU_CLEAR, gen: 0, irr: 0, dem: [0, 0, 0, 0], served: [1, 1, 1, 1],
    rate: null, lastSol: 0, warned: {},
  });
  storm = scenario === 'firtina' ? { t: -0.4, peak: P.stormTau, dur: P.stormDur } : null;
  resChart?.clear(); enChart?.clear();
}

function tauNow() {
  if (!storm || storm.t < 0) return TAU_CLEAR;
  const t = storm.t;
  const env = t < 4 ? smoothstep(0, 4, t) : t < storm.dur ? 1 : Math.exp(-(t - storm.dur) / 6);
  return TAU_CLEAR + (storm.peak - TAU_CLEAR) * env;
}

// Yüzeye ulaşan ışık oranı: doğrudan (Beer–Lambert) + saçılan ışık payı (yaklaşık)
function trans(tau, sinh) {
  const m = 1 / Math.max(sinh, 0.05);
  const e = Math.exp(-tau * m);
  return e + (1 - e) * 0.7 * Math.exp(-0.25 * tau);
}
const sunSin = (sol) => Math.max(0, Math.cos(((sol % 1) - 0.5) * TAU));

function step(ds) {
  const hours = ds * SOL_H;
  S.sol += ds;
  if (storm) { storm.t += ds; if (storm.t > storm.dur + 25) storm = null; }
  S.tau = tauNow();
  const sinh = sunSin(S.sol);
  S.irr = sinh > 0 ? S_MARS * sinh * trans(S.tau, sinh) : 0;
  S.gen = (S.irr * P.panel * ETA) / 1000;
  const dem = [BASE_KW + CREW_KW * P.crew, (P.o2 * KWH_O2) / SOL_H, P.gh * GH_KW, (P.ice * KWH_ICE) / SOL_H];
  let avail = S.gen * hours + S.batt;
  const f = dem.map((d) => {
    const need = d * hours;
    if (need <= 0) return 1;
    const got = Math.min(need, avail);
    avail -= got;
    return got / need;
  });
  S.batt = Math.min(P.batt, avail);
  S.dem = dem;
  for (let i = 0; i < 4; i++) S.served[i] = lerp(S.served[i], f[i], Math.min(1, ds * 8));
  // Kütle dengesi (sol başına hız)
  const plantShare = (f[2] * P.gh) / AREA_PP;
  const r = {
    o2: f[1] * P.o2 + plantShare * O2_PP - P.crew * O2_PP,
    water: f[3] * P.ice - P.crew * W_USE * (1 - (P.rec / 100) * f[0]),
    food: plantShare - P.crew,
  };
  for (const k of ['o2', 'water', 'food']) {
    S[k] = clamp(S[k] + r[k] * ds, 0, CAP[k]);
    if (S[k] >= CAP[k] && r[k] > 0) r[k] = 0;
  }
  if (!S.rate) S.rate = { ...r };
  const a = Math.min(1, ds / 1.2);
  for (const k in r) S.rate[k] = lerp(S.rate[k], r[k], a);
}

const need = () => ({ o2: P.crew * O2_PP, water: P.crew * DRINK, food: P.crew });
function reserve(k) {
  const rt = S.rate?.[k] ?? 0;
  return rt < -1e-6 ? S[k] / -rt : Infinity;
}

// --- Sahne ---
// Dünya metre cinsinden. Üs merkezi (5, −2) çevresinde düzleştirilmiş bir alan; çevrede aşınmış tepeler, çarpma kraterleri,
// kuzeyde eski büyük bir kraterin yükselen duvarı. Gökyüzü ve ışık marssky.js'ten (τ ile).
const scene = sim.scene;
const mars = marsSky(sim);
const SS = THREE.MathUtils.smoothstep;

const hl = landscape({ seed: 23, size: 1500, height: 240, base: 0, warp: 0.6 });
const H00 = hl(5, -2);
// Kraterler [x, z, R]: basit çanak profili, kenar sırtı (≈ 0,08·R) ve dışa sönen ejekta
const CRATERS = [
  [-1500, -2700, 780], [2300, -1500, 420], [-3000, 300, 560], [900, -900, 160], [-650, -520, 95], [1250, 700, 240],
  [-420, 280, 60], [320, -380, 48], [-190, -210, 26], [150, 170, 20], [-120, -60, 12], [80, -125, 9], [-85, 70, 8],
  [230, -40, 16], [-280, -60, 30], [-40, -150, 7], [120, -260, 14], [-330, -330, 22], [480, -160, 34], [-560, 60, 40],
];
function crater(x, z) {
  let s = 0;
  for (const [cx, cz, R] of CRATERS) {
    const dx = x - cx, dz = z - cz, d2 = (dx * dx + dz * dz) / (R * R);
    if (d2 > 9) continue;
    const d = Math.sqrt(d2), k = R < 80 ? 0.3 : 0.3 * Math.sqrt(80 / R), rim = 0.27 * k * R;
    s += d < 1 ? -k * R + (k * R + rim) * Math.pow(d, 2.4) : rim * ((3 - d) / 2) ** 3;
  }
  return s;
}
function hf(x, z) {
  const r = Math.hypot(x - 5, z + 2);
  let h = (hl(x, z) - H00) * (0.12 + 0.88 * SS(r, 120, 1800)) + crater(x, z);
  h += 430 * SS(-z, 2500, 4700) * (0.75 + 0.25 * Math.sin(x * 0.0011 + 1.7)); // kuzeyde eski krater duvarı
  return lerp(0.05 * Math.sin(x * 0.11) * Math.cos(z * 0.09), h, SS(r, 38, 110));
}
const height = hf;

// Arazi malzemesi: pas rengi regolit, koyu bazalt kumu lekeleri, açık toz örtüsü, dik yamaçta katmanlı kaya
const tmat = terrainMaterial({ water: -1e5, grassAmount: 0, forest: 0, sand: 0xa0603a, soil: 0xa25b36, dry: 0xc48454, rock: 0x6a4535, grass: 0xa25b36 });
{
  const ob = tmat.onBeforeCompile;
  tmat.onBeforeCompile = (sh, r) => {
    ob(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb = c;', `
      {
        float dk = smoothstep(0.44, 0.64, fbm3(tP*0.0035 + 11.0, 4) + 0.15*(mid - 0.5));
        c = mix(c, c*vec3(0.52, 0.47, 0.46), dk*(1.0 - tRockW)*0.75);
        float br = smoothstep(0.5, 0.78, fbm3(tP*0.018 + 4.0, 4));
        c = mix(c, c*vec3(1.2, 1.1, 1.0), br*0.55*(1.0 - dk));
        float rip = sin(dot(tP.xz, vec2(0.83, 0.55))*2.1 + 3.0*fbm3(tP*0.2, 2));
        c *= 1.0 - 0.07*smoothstep(0.6, 1.0, rip)*(1.0 - smoothstep(20.0, 90.0, length(vViewPosition)));
      }
      diffuseColor.rgb = c;`);
  };
  tmat.customProgramCacheKey = () => 'mars-terrain';
}
// Yakın alan (2,5 m çözünürlük) + geniş alan (25 m) + ufka uzanan etek. Geniş ağ yakın alanın altında 2 m gömülü.
const NEAR = { c: [10, -160], s: 900 };
const inNear = (x, z) => {
  const ex = NEAR.s / 2 - Math.abs(x - NEAR.c[0]), ez = NEAR.s / 2 - Math.abs(z - NEAR.c[1]);
  return SS(Math.min(ex, ez), 0, 30);
};
scene.add(createTerrain(hf, { size: [NEAR.s, NEAR.s], center: NEAR.c, res: [LOW ? 240 : 360, LOW ? 240 : 360], material: tmat }));
const bigT = createTerrain((x, z) => hf(x, z) - 2.5 * inNear(x, z), { size: [7000, 7000], res: [256, 256], material: tmat });
scene.add(bigT);
scene.add(terrainSkirt(hf, { inner: 3500, outer: 60000, material: tmat }));

// Kayalar: gürültüyle bozulmuş çok yüzlüler; bazalt gri-kahve, üst yüzeyler pas tozuyla örtülü, gaz boşlukları (vezikül)
const rockMat = procedural({
  key: 'mars-rock', scale: 1, bump: 0.05, params: { color: 0x4a3a34, roughness: 0.88, flatShading: true },
  uniforms: { uDust: { value: new THREE.Color(0xa8603a) } },
  pattern: `
    float n = fbm3(p*1.6 + seed*9.0, 5), c = cells3(p*4.0 + seed*3.0);
    col *= (0.55 + 0.6*n)*mix(vec3(1.0), vec3(1.12, 0.96, 0.86), seed);
    float up = smoothstep(0.05, 0.75, pn.y + 0.4*(n - 0.5));
    col = mix(col, uDust*(0.75 + 0.35*n), up*0.45);
    float ves = smoothstep(0.16, 0.06, c);
    col *= 1.0 - 0.4*ves*(1.0 - up*0.6);
    rough = 0.82 + 0.12*n;
    h = n*0.7 + c*0.4 - ves*0.4;`,
});
const rn = new ImprovedNoise();
function rockGeo(seed, detail) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = BufferGeometryUtils.mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  const sq = 0.45 + 0.35 * ((seed * 0.37) % 1);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + 0.45 * rn.noise(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4) + 0.18 * rn.noise(v.x * 3.3, v.y * 3.3 + seed, v.z * 3.3);
    v.multiplyScalar(k);
    v.y *= sq; if (v.y < -0.15) v.y = -0.15 + (v.y + 0.15) * 0.3;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const BASE_BOX = (x, z) => x > -38 && x < 62 && z > -34 && z < 20; // üs alanı: kaya yok
{
  const rr = seeded(71);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const put = (im, n, rmin, rmax, smin, spow, smax) => {
    let k = 0;
    for (let t = 0; t < n * 4 && k < n; t++) {
      const a = rr() * TAU, d = rmin + (rmax - rmin) * Math.pow(rr(), 1.6);
      const x = 5 + Math.cos(a) * d, z = -2 + Math.sin(a) * d;
      if (BASE_BOX(x, z)) continue;
      const sc = smin + (smax - smin) * Math.pow(rr(), spow);
      p.set(x, hf(x, z) - sc * 0.12, z);
      q.setFromEuler(e.set((rr() - 0.5) * 0.5, rr() * TAU, (rr() - 0.5) * 0.5));
      s.set(sc * (0.8 + rr() * 0.5), sc * (0.7 + rr() * 0.6), sc * (0.8 + rr() * 0.5));
      im.setMatrixAt(k++, m4.compose(p, q, s));
    }
    im.count = k;
    im.castShadow = im.receiveShadow = true;
    im.userData.noFit = true;
    im.frustumCulled = false;
    scene.add(im);
  };
  const f = LOW ? 0.4 : 1;
  for (let v = 0; v < 3; v++) {
    put(new THREE.InstancedMesh(rockGeo(v * 3.1 + 1, 2), rockMat, Math.round(260 * f)), Math.round(260 * f), 25, 900, 0.25, 3, 1.7);
    put(new THREE.InstancedMesh(rockGeo(v * 5.7 + 9, 1), rockMat, Math.round(900 * f)), Math.round(900 * f), 12, 160, 0.06, 2, 0.35);
  }
  put(new THREE.InstancedMesh(rockGeo(17, 2), rockMat, 60), 60, 300, 2600, 2, 2, 7);
}

// --- Üs yapıları ---
const clickables = [];
const labels = {};
function tag(obj, key) { obj.traverse((o) => { o.userData.key = key; }); clickables.push(obj); }
const M = {
  hull: mat.paintedMetal({ color: 0xebe7de, wear: 0.05 }),
  hull2: mat.paintedMetal({ color: 0xd3cdc1, wear: 0.12 }),
  steel: mat.brushedMetal({ color: 0xb9bdc2 }),
  dark: mat.paintedMetal({ color: 0x3a3f47, wear: 0.25 }),
  gold: mat.brushedMetal({ color: 0xd9a748, rough: 0.26 }),
  mli: mat.fabric({ color: 0xe4ddcf }),
  bags: mat.fabric({ color: 0x9a5b3a }),
  rubber: mat.rubber({ color: 0x26241f }),
  orange: mat.paintedMetal({ color: 0xd8641f, wear: 0.2 }),
  soil: mat.concrete({ color: 0x3a291e, stains: 0.2 }),
  regolith: mat.concrete({ color: 0x9e5b37, stains: 0.6, scale: 0.5 }),
  dish: mat.paintedMetal({ color: 0xeeeae3, wear: 0.05 }),
};
M.dish.side = THREE.DoubleSide;
let airlockLamp = null;
const winMat = new THREE.MeshStandardMaterial({ color: 0x11161d, roughness: 0.05, metalness: 0.5, emissive: 0xffc27a, emissiveIntensity: 0 });
const RB = (w, h, d, r = 0.08, s = 3) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
const mesh = (g, m, x = 0, y = 0, z = 0, parent) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); if (parent) parent.add(o); return o; };
const bagM4 = [];

// Dikey silindirik yaşam modülü: ayaklı taban halkası, kaynaklı gövde (lathe), kubbe çatı, pencere kuşağı, kapak, anten
function habitat(R, Hw, x, z, rotY = 0) {
  const g = new THREE.Group();
  const top = 0.9 + Hw, domeH = R * 0.42, pts = [new THREE.Vector2(R - 0.12, 0.8), new THREE.Vector2(R, 0.92), new THREE.Vector2(R, top)];
  for (let i = 1; i <= 14; i++) { const a = (i / 14) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(R * Math.cos(a), 0.001), top + domeH * Math.sin(a))); }
  mesh(new THREE.LatheGeometry(pts, 72), M.hull, 0, 0, 0, g);
  mesh(new THREE.CylinderGeometry(R + 0.12, R + 0.22, 0.5, 72), M.dark, 0, 0.62, 0, g);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.45, 12), M.steel, Math.cos(a) * (R - 0.3), 0.22, Math.sin(a) * (R - 0.3), g);
    mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.06, 20), M.steel, Math.cos(a) * (R - 0.3), 0.03, Math.sin(a) * (R - 0.3), g);
  }
  for (const f of [0.15, 0.45, 0.82]) {
    const ring = mesh(new THREE.TorusGeometry(R + 0.02, 0.05, 8, 96), M.steel, 0, 0.9 + Hw * f, 0, g);
    ring.rotation.x = Math.PI / 2;
  }
  const crown = mesh(new THREE.TorusGeometry(R * 0.55, 0.06, 8, 64), M.steel, 0, top + domeH * 0.84, 0, g);
  crown.rotation.x = Math.PI / 2;
  // Pencereler
  const nw = Math.round(R * 2.2);
  for (let i = 0; i < nw; i++) {
    const a = ((i + 0.5) / nw) * TAU, w = new THREE.Group();
    mesh(RB(0.9, 0.62, 0.1, 0.06), M.steel, 0, 0, 0, w);
    mesh(RB(0.74, 0.48, 0.12, 0.05), winMat, 0, 0, 0.01, w);
    w.position.set(Math.sin(a) * (R + 0.02), 0.9 + Hw * 0.62, Math.cos(a) * (R + 0.02));
    w.rotation.y = a;
    g.add(w);
  }
  // Çatı: anten direği ve çanak, tutamaklar
  mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 8), M.steel, R * 0.3, top + domeH + 0.5, 0, g);
  const dish = mesh(new THREE.LatheGeometry(Array.from({ length: 9 }, (_, i) => new THREE.Vector2(0.001 + (i / 8) * 0.55, ((i / 8) ** 2) * 0.22)), 32), M.dish, R * 0.3, top + domeH + 1.3, 0, g);
  dish.rotation.z = -0.7;
  for (let i = 0; i < 3; i++) {
    const hr = mesh(new THREE.TorusGeometry(0.35, 0.025, 6, 16, Math.PI), M.orange, 0, 0, 0, g);
    const a = rotY + 2 + i * 0.3;
    hr.position.set(Math.sin(a) * R * 0.86, top + domeH * 0.52, Math.cos(a) * R * 0.86);
    hr.rotation.set(0, a, 0.9);
  }
  // Regolit torbası seti (radyasyon ve ısı kalkanı olarak taban çevresinde)
  const nb = Math.round((TAU * (R + 0.7)) / 0.74);
  for (let l = 0; l < 2; l++) for (let i = 0; i < nb; i++) {
    const a = ((i + l * 0.5) / nb) * TAU;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a + Math.PI / 2 + (Math.random() - 0.5) * 0.12, 0));
    bagM4.push(new THREE.Matrix4().compose(new THREE.Vector3(x + Math.cos(a) * (R + 0.75 + l * 0.05), 0.15 + l * 0.27, z + Math.sin(a) * (R + 0.75 + l * 0.05)), q, new THREE.Vector3(1, 1 - l * 0.08, 1)));
  }
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  return g;
}
const hab = new THREE.Group();
scene.add(hab);
hab.add(habitat(4, 3.6, 0, 0, 0.3), habitat(3, 2.8, 11.5, -4, 1.2));
{
  // Basınçlı tünel: iki modül arasında oluklu bağlantı
  const a = new THREE.Vector3(3.6, 1.9, -1.2), b = new THREE.Vector3(8.8, 1.9, -3.1), L = a.distanceTo(b);
  const t = new THREE.Group();
  mesh(new THREE.CylinderGeometry(1.05, 1.05, L, 40, 1, true), M.mli, 0, 0, 0, t);
  for (let i = 0; i <= Math.floor(L / 0.5); i++) mesh(new THREE.TorusGeometry(1.08, 0.05, 6, 40), M.hull2, 0, -L / 2 + i * 0.5, 0, t).rotation.x = Math.PI / 2;
  t.position.copy(a).add(b).multiplyScalar(0.5);
  t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  hab.add(t);
  for (const p of [a, b]) mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.4, 10), M.steel, p.x, 0.7, p.z, hab);
  // Hava kilidi: kameraya bakan yüzde, dış kapı, basamak ve dış ışık
  const al = new THREE.Group();
  mesh(RB(2.8, 2.5, 2.8, 0.35, 4), M.hull, 0, 1.95, 0, al);
  mesh(RB(1.3, 2.0, 0.16, 0.12), M.hull2, 0, 1.75, 1.45, al);
  mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 24), winMat, 0, 2.35, 1.54, al).rotation.x = Math.PI / 2;
  mesh(RB(1.8, 0.18, 1.4, 0.05), M.dark, 0, 0.62, 2.0, al);
  mesh(RB(1.6, 0.16, 0.5, 0.05), M.dark, 0, 0.3, 2.9, al);
  for (const sx of [-1, 1]) mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), M.orange, sx * 0.85, 1.12, 2.4, al);
  airlockLamp = mesh(RB(0.36, 0.14, 0.2, 0.04), mat.glow({ color: 0xffd9a0, intensity: 0.2 }), 0, 3.05, 1.46, al);
  al.position.set(0, 0, 5.1);
  hab.add(al);
}
{
  const bags = new THREE.InstancedMesh(RB(0.72, 0.28, 0.46, 0.12, 2), M.bags, bagM4.length);
  bagM4.forEach((m, i) => bags.setMatrixAt(i, m));
  hab.add(bags);
}
tag(hab, 'hab');
labels.hab = sim.label('Yaşam modülü', { position: [0, 8.2, 0], className: 'plain' });

// Sera tüneli: şeffaf polikarbonat kemerler, çelik kaburgalar, ekim yatakları, LED barlar
const ghGroup = new THREE.Group();
scene.add(ghGroup);
const ghMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f8fb, transparent: true, opacity: 0.2, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
const plantMat = mat.foliage({ color: 0x4f8f30 });
plantMat.emissive = new THREE.Color(0xc04dff); plantMat.emissiveIntensity = 0;
const ledMat = mat.glow({ color: 0xd06bff, intensity: 0 });
const MAX_GH_SEG = 30;
const plantGeo = (() => {
  const parts = [], r = seeded(5);
  for (let i = 0; i < 9; i++) {
    const g = new THREE.IcosahedronGeometry(0.16 + r() * 0.1, 1);
    g.scale(1, 0.75, 1); g.translate((i % 3 - 1) * 0.32 + (r() - 0.5) * 0.1, 0.1 + r() * 0.12, (Math.floor(i / 3) - 1) * 0.18);
    parts.push(g);
  }
  return BufferGeometryUtils.mergeGeometries(parts);
})();
const gh = {
  shell: instanced(new THREE.CylinderGeometry(1.7, 1.7, 1.2, 28, 1, true, 0, Math.PI), ghMat, MAX_GH_SEG),
  rib: instanced(new THREE.TorusGeometry(1.72, 0.05, 6, 28, Math.PI), M.steel, MAX_GH_SEG),
  curb: instanced(RB(1.2, 0.36, 0.22, 0.05), M.hull2, MAX_GH_SEG * 2),
  bed: instanced(RB(1.1, 0.34, 0.66, 0.05), M.soil, MAX_GH_SEG * 2),
  plant: instanced(plantGeo, plantMat, MAX_GH_SEG * 2),
  led: instanced(RB(1.1, 0.05, 0.12, 0.02), ledMat, MAX_GH_SEG * 2),
};
gh.shell.userData.noAO = true;
Object.values(gh).forEach((o) => ghGroup.add(o));
const ghEnds = [0, 1].map(() => {
  const e = new THREE.Group();
  mesh(RB(1.4, 2.3, 3.7, 0.3, 4), M.hull, 0, 1.15, 0, e);
  mesh(RB(0.12, 1.7, 1.0, 0.05), M.hull2, -0.72, 1.0, 0, e);
  ghGroup.add(e);
  return e;
});
tag(ghGroup, 'gh');
labels.gh = sim.label('Sera', { parent: ghGroup, position: [-5, 3, 0], className: 'plain' });
// Yavaş cihazda nokta ışıkları yok (her pikselde ışık döngüsü pahalı); ışık yalnız ışıyan yüzeylerle verilir
const ghLight = LOW ? new THREE.Object3D() : new THREE.PointLight(0xd070ff, 0, 16, 2);
ghGroup.add(ghLight);

function layoutGreenhouse() {
  const n = clamp(Math.ceil(P.gh / 20), 0, MAX_GH_SEG);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  const x0 = -6.2, Z = [1.2, 5.6];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 15), xx = x0 - (i - row * 15) * 1.2 - 0.6, zz = Z[row];
    gh.shell.setMatrixAt(i, m.compose(v.set(xx, 0.2, zz), q.setFromEuler(e.set(0, 0, Math.PI / 2)), one));
    gh.rib.setMatrixAt(i, m.compose(v.set(xx - 0.6, 0.2, zz), q.setFromEuler(e.set(0, Math.PI / 2, 0)), one));
    q.identity();
    for (const s of [0, 1]) {
      const sz = s ? 1 : -1;
      gh.curb.setMatrixAt(i * 2 + s, m.compose(v.set(xx, 0.18, zz + sz * 1.62), q, one));
      gh.bed.setMatrixAt(i * 2 + s, m.compose(v.set(xx, 0.36, zz + sz * 0.78), q, one));
      gh.plant.setMatrixAt(i * 2 + s, m.compose(v.set(xx, 0.5, zz + sz * 0.78), q.setFromEuler(e.set(0, (i * 7 + s * 3) % 5, 0)), one));
      q.identity();
      gh.led.setMatrixAt(i * 2 + s, m.compose(v.set(xx, 1.5, zz + sz * 0.62), q, one));
    }
  }
  gh.shell.count = gh.rib.count = n;
  gh.curb.count = gh.bed.count = gh.plant.count = gh.led.count = n * 2;
  Object.values(gh).forEach((o) => { o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere(); });
  ghEnds.forEach((en, r) => {
    const k = clamp(n - r * 15, 0, 15);
    en.visible = k > 0;
    en.position.set(x0 + 0.5, 0, Z[r]);
  });
  const len = Math.min(n, 15) * 1.2;
  labels.gh.position.set(x0 - len / 2, 3.2, n > 15 ? 3.4 : 1.2);
  labels.gh.visible = n > 0 && showLabels;
  ghLight.position.set(x0 - len / 2, 1.6, n > 15 ? 3.4 : 1.2);
}

// O₂ ünitesi (MOXIE benzeri katı oksit elektroliz): altın folyo kaplı kutu, radyatör kanatçıkları, emiş borusu, baca
const moxie = new THREE.Group();
{
  mesh(RB(2.4, 0.2, 1.8, 0.05), M.dark, 0, 0.1, 0, moxie);
  mesh(RB(1.7, 1.15, 1.25, 0.1), M.gold, 0, 0.8, 0, moxie);
  for (let i = 0; i < 6; i++) mesh(RB(0.05, 0.9, 1.1, 0.02), M.steel, -1.0 - i * 0.09, 0.75, 0, moxie);
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.6, 1.2, 0), new THREE.Vector3(0.9, 1.8, 0), new THREE.Vector3(1.4, 1.8, -0.2), new THREE.Vector3(1.6, 0.4, -0.4)]), 24, 0.07, 10), M.steel);
  moxie.add(pipe);
  mesh(new THREE.LatheGeometry([new THREE.Vector2(0.24, 0), new THREE.Vector2(0.2, 0.7), new THREE.Vector2(0.26, 0.78), new THREE.Vector2(0.001, 0.82)], 24), M.steel, 0.35, 1.35, 0.25, moxie);
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.6, 0.4, -0.6), new THREE.Vector3(-1.8, 0.15, -1.6), new THREE.Vector3(-3.2, 0.25, -2.4)]), 24, 0.06, 8), M.rubber);
  moxie.add(hose);
}
const moxieGlow = mesh(RB(0.3, 0.12, 0.04, 0.02), mat.glow({ color: 0x46e0ff, intensity: 5 }), 0.45, 1.1, 0.64, moxie);
moxie.position.set(6.6, 0, 6.2);
moxie.rotation.y = -0.25;
scene.add(moxie);
tag(moxie, 'o2');
labels.o2 = sim.label('O₂ ünitesi', { parent: moxie, position: [0, 2.6, 0], className: 'plain' });

// Batarya: dört dolap, önde doluluk göstergesi (ışıklı şerit)
const battGroup = new THREE.Group();
const battCells = [];
for (let i = 0; i < 4; i++) {
  mesh(RB(1.05, 1.55, 1.8, 0.07), mat.paintedMetal({ color: 0xc9ccce, wear: 0.15 }), i * 1.3, 0.85, 0, battGroup);
  mesh(RB(0.9, 0.08, 1.6, 0.03), M.dark, i * 1.3, 1.66, 0, battGroup);
  for (let k = 0; k < 5; k++) mesh(RB(0.8, 0.03, 0.02, 0.01), M.dark, i * 1.3, 0.5 + k * 0.12, -0.91, battGroup);
  const lm = mat.glow({ color: 0x22c55e, intensity: 2.5 });
  const lvl = mesh(RB(0.14, 1.0, 0.04, 0.02), lm, i * 1.3 + 0.3, 0.65, 0.91, battGroup);
  battCells.push(lvl);
}
mesh(RB(5.2, 0.12, 2.4, 0.04), M.dark, 1.95, 0.06, 0, battGroup);
battGroup.position.set(13, 0, 5);
battGroup.rotation.y = -0.1;
scene.add(battGroup);
tag(battGroup, 'batt');
labels.batt = sim.label('Batarya', { parent: battGroup, position: [2, 2.4, 0.8], className: 'plain' });

// Güneş panelleri (her model 40 m²'yi temsil eder): hücre ızgaralı PBR yüzey, tork borusu, ayaklar
const panelMat = procedural({
  key: 'mars-pv', scale: 1, bump: 0.004, params: { color: 0x182640, roughness: 0.22, metalness: 0.3 },
  pattern: `
    vec2 g = p.xz/vec2(0.165, 0.165); vec2 f = abs(fract(g) - 0.5);
    float gap = smoothstep(0.44, 0.48, max(f.x, f.y));
    float top = step(0.5, pn.y);
    vec3 cell = col*(0.85 + 0.3*vn3(vec3(floor(g), 1.0)*0.7)) + vec3(0.012, 0.01, 0.0)*vn3(p*12.0);
    vec3 frame = vec3(0.62, 0.64, 0.66);
    float edge = step(1.44, abs(p.x)) + step(0.84, abs(p.z));
    col = mix(mix(cell, vec3(0.55, 0.58, 0.62), gap*0.55), frame, clamp(edge + (1.0 - top), 0.0, 1.0));
    float dust = fbm3(p*1.7 + seed*5.0, 3);
    col = mix(col, vec3(0.62, 0.38, 0.24), smoothstep(0.5, 0.85, dust)*0.35*top);
    metal = mix(0.25, 0.85, clamp(edge + (1.0 - top), 0.0, 1.0));
    rough = mix(0.16, 0.4, clamp(edge + (1.0 - top), 0.0, 1.0)) + 0.2*smoothstep(0.5, 0.85, dust)*top;
    h = 1.0 - gap;`,
});
const MAX_PANELS = 80;
const panelMesh = instanced(RB(3.0, 0.06, 1.8, 0.02, 2), panelMat, MAX_PANELS);
const tubeMesh = instanced(new THREE.CylinderGeometry(0.06, 0.06, 3.1, 10).rotateZ(Math.PI / 2), M.steel, MAX_PANELS);
const postMesh = instanced(new THREE.CylinderGeometry(0.05, 0.07, 1.0, 8), M.steel, MAX_PANELS * 2);
const panelGroup = new THREE.Group();
panelGroup.add(panelMesh, tubeMesh, postMesh);
scene.add(panelGroup);
tag(panelGroup, 'panel');
labels.panel = sim.label('Güneş panelleri', { position: [30, 2.4, -1], className: 'plain' });
function layoutPanels() {
  const n = clamp(Math.round(P.panel / M_PANEL), 1, MAX_PANELS);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  const cols = 10;
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols);
    const x = 22 + c * 3.4, z = -17 + r * 2.4;
    panelMesh.setMatrixAt(i, m.compose(v.set(x, 1.05, z), q, one));
    tubeMesh.setMatrixAt(i, m.compose(v.set(x, 0.97, z), q, one));
    postMesh.setMatrixAt(i * 2, m.compose(v.set(x - 1.0, 0.48, z), q, one));
    postMesh.setMatrixAt(i * 2 + 1, m.compose(v.set(x + 1.0, 0.48, z), q, one));
  }
  panelMesh.count = tubeMesh.count = n;
  postMesh.count = n * 2;
  [panelMesh, tubeMesh, postMesh].forEach((o) => { o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere(); });
  const rows = Math.ceil(n / cols);
  labels.panel.position.set(22 + (Math.min(n, cols) - 1) * 1.7, 2.6, -17 + (rows - 1) * 1.2);
}

// Buz madeni: kazı çukuru (regolit seti), açığa çıkan buz, kafes kule, kol ve matkap, hafriyat yığını
const MINE = new THREE.Vector3(-22, 0, -20);
MINE.y = height(MINE.x, MINE.z);
const mine = new THREE.Group();
{
  const rim = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; rim.push(new THREE.Vector2(2.2 + t * 2.4, Math.sin(t * Math.PI) ** 1.5 * 0.7 * (1 - t * 0.3) - 0.05)); }
  mesh(new THREE.LatheGeometry(rim.reverse(), 48), M.regolith, 0, 0, 0, mine);
  mesh(new THREE.CircleGeometry(2.3, 40).rotateX(-Math.PI / 2), M.soil, 0, 0.04, 0, mine);
  const iceG = new THREE.CircleGeometry(1.5, 40).rotateX(-Math.PI / 2);
  { const p = iceG.attributes.position; for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 + 0.25 * Math.sin(a * 3 + 1) + 0.1 * Math.sin(a * 7); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); } }
  mesh(iceG, mat.ceramic({ color: 0xdcecf4 }), 0.2, 0.08, 0, mine);
  // Kafes kule (4 ayak + çapraz bağlar)
  const tw = new THREE.Group(), Ht = 5.2;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const leg = mesh(new THREE.CylinderGeometry(0.06, 0.08, Ht, 8), M.orange, sx * 0.45, Ht / 2, sz * 0.45, tw);
    leg.rotation.set(-sz * 0.05, 0, sx * 0.05);
  }
  for (let k = 0; k < 5; k++) {
    const y = 0.6 + k * 1.0, w = 0.9 - k * 0.05;
    for (const r of [0, 1]) { const b = mesh(new THREE.CylinderGeometry(0.03, 0.03, w, 6), M.orange, 0, y, 0, tw); b.rotation.set(r ? Math.PI / 2 : 0, 0, r ? 0 : Math.PI / 2); b.position[r ? 'x' : 'z'] = 0.44 - k * 0.025; }
  }
  tw.position.set(3.0, 0, 0);
  mine.add(tw);
  mesh(RB(3.4, 0.25, 0.25, 0.05), M.orange, 1.5, 5.3, 0, mine);
  mesh(RB(0.9, 0.6, 0.7, 0.08), M.hull2, 3.0, 5.6, 0, mine);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), M.steel, 0, 4.1, 0, mine);
  mesh(RB(2.2, 0.4, 1.8, 0.1), M.dark, 3.2, 0.2, 0, mine);
  // Hafriyat yığını
  mesh(new THREE.LatheGeometry(Array.from({ length: 10 }, (_, i) => new THREE.Vector2(0.001 + 2.6 * (i / 9), 1.4 * (1 - (i / 9) ** 1.6))).reverse(), 32), M.regolith, -4.5, 0, 2.5, mine);
}
const drill = new THREE.Group();
mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.2, 16), M.steel, 0, 0.6, 0, drill);
const bit = mesh(new THREE.ConeGeometry(0.28, 0.9, 16), M.orange, 0, -0.45, 0, drill);
bit.rotation.x = Math.PI;
drill.position.set(0, 2.5, 0);
mine.add(drill);
mine.position.copy(MINE);
scene.add(mine);
tag(mine, 'ice');
labels.ice = sim.label('Buz madeni', { parent: mine, position: [0, 6.8, 0], className: 'plain' });

// Basınçlı gezgin: şasi, 6 tekerlek (lastik + jant), kabin camı, güneş paneli sırtı, kamera direği, kargo kutusu
const rover = new THREE.Group();
const roverWheels = [];
{
  mesh(RB(5.0, 0.3, 2.1, 0.08), M.dark, 0, 0.8, 0, rover);
  mesh(RB(4.2, 1.5, 2.3, 0.45, 4), M.hull, -0.2, 1.7, 0, rover);
  mesh(RB(0.5, 0.9, 2.0, 0.2), winMat, 1.85, 1.95, 0, rover);
  mesh(RB(2.6, 0.06, 2.0, 0.02), panelMat, -0.6, 2.5, 0, rover);
  mesh(RB(1.1, 0.6, 1.6, 0.08), M.orange, -2.4, 1.3, 0, rover);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), M.steel, 1.2, 2.9, 0.7, rover);
  mesh(RB(0.3, 0.18, 0.2, 0.04), M.dark, 1.2, 3.4, 0.7, rover);
  for (const x of [-1.7, 0, 1.7]) for (const z of [-1.2, 1.2]) {
    const w = new THREE.Group();
    const tire = mesh(new THREE.TorusGeometry(0.42, 0.16, 12, 28), M.rubber, 0, 0, 0, w);
    mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.26, 20).rotateX(Math.PI / 2), M.steel, 0, 0, 0, w);
    tire.scale.z = 1.3;
    w.position.set(x, 0.56, z);
    rover.add(w); roverWheels.push(w);
  }
}
scene.add(rover);
const ROVER_HOME = new THREE.Vector3(-4, 0, -9);

// Ekip (EVA'daki astronotlar): basınçlı giysi, kask ve altın vizör, yaşam destek sırt çantası — gerçek boy 1,85 m
const crew = [];
{
  const suit = mat.fabric({ color: 0xeeeae2 }), visor = mat.brushedMetal({ color: 0xd9a748, rough: 0.08 }), helm = mat.plastic({ color: 0xf4f2ee, gloss: 0.8 });
  const proto = new THREE.Group();
  const add = (g, m, x, y, z, rx = 0, rz = 0) => { const o = mesh(g, m, x, y, z, proto); o.rotation.set(rx, 0, rz); return o; };
  add(new THREE.CapsuleGeometry(0.22, 0.45, 6, 16), suit, 0, 1.2, 0);
  add(new THREE.CapsuleGeometry(0.1, 0.7, 4, 12), suit, -0.12, 0.5, 0);
  add(new THREE.CapsuleGeometry(0.1, 0.7, 4, 12), suit, 0.12, 0.5, 0);
  add(new THREE.CapsuleGeometry(0.075, 0.5, 4, 12), suit, -0.3, 1.15, 0, 0, 0.18);
  add(new THREE.CapsuleGeometry(0.075, 0.5, 4, 12), suit, 0.3, 1.15, 0, 0, -0.18);
  add(new THREE.SphereGeometry(0.19, 24, 16), helm, 0, 1.68, 0);
  add(new THREE.SphereGeometry(0.16, 24, 12, -1.1, 2.2, 0.9, 1.1), visor, 0, 1.68, 0.045);
  add(RB(0.42, 0.55, 0.22, 0.06), M.hull2, 0, 1.25, -0.28);
  for (let i = 0; i < 12; i++) { const c = proto.clone(); c.visible = false; scene.add(c); crew.push(c); }
}

// İniş aracı (paslanmaz çelik, arka planda) ve iletişim kulesi: ölçek ve kompozisyon
{
  const L = new THREE.Group(), steelL = mat.brushedMetal({ color: 0xc6c9cd, rough: 0.28 });
  mesh(new THREE.CylinderGeometry(4.5, 4.5, 30, 64), steelL, 0, 17, 0, L);
  const nose = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; nose.push(new THREE.Vector2(Math.max(4.5 * Math.sqrt(1 - t * t * 0.98) * (1 - t * 0.15), 0.001), 32 + t * 17)); }
  mesh(new THREE.LatheGeometry(nose, 64), steelL, 0, 0, 0, L);
  const tiles = mesh(new THREE.CylinderGeometry(4.53, 4.53, 29, 48, 1, true, -Math.PI / 2, Math.PI), mat.paintedMetal({ color: 0x1c1d20, wear: 0.05 }), 0, 17, 0, L);
  tiles.userData.noAO = true;
  mesh(new THREE.CylinderGeometry(4.2, 3.6, 2, 48), M.dark, 0, 1.6, 0, L);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU, leg = mesh(new THREE.CylinderGeometry(0.35, 0.45, 5.5, 12), steelL, Math.cos(a) * 4.6, 2.3, Math.sin(a) * 4.6, L);
    leg.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.25, 20), steelL, Math.cos(a) * 5.4, 0.12, Math.sin(a) * 5.4, L);
  }
  for (const s of [-1, 1]) { const fin = mesh(RB(0.4, 6, 3.2, 0.15), steelL, s * 5.2, 42, 0, L); fin.rotation.z = s * 0.15; }
  for (const s of [-1, 1]) mesh(RB(0.4, 9, 3.6, 0.15), steelL, s * 5.2, 6.5, 0, L);
  L.position.set(-118, hf(-118, -82) - 0.3, -82);
  L.rotation.y = -2.26; // ısı kalkanı kameradan uzak yanda
  scene.add(L);
  // İletişim kulesi: kafes direk + büyük çanak
  const C = new THREE.Group();
  for (const [sx, sz] of [[-1, -1], [1, -1], [0, 1]]) mesh(new THREE.CylinderGeometry(0.05, 0.08, 9, 8), M.steel, sx * 0.4, 4.5, sz * 0.4, C);
  for (let k = 0; k < 8; k++) mesh(new THREE.TorusGeometry(0.42, 0.025, 4, 3), M.steel, 0, 0.8 + k * 1.05, 0, C).rotation.x = Math.PI / 2;
  const d = mesh(new THREE.LatheGeometry(Array.from({ length: 11 }, (_, i) => new THREE.Vector2(0.001 + (i / 10) * 1.6, ((i / 10) ** 2) * 0.55)), 48), M.dish, 0, 9.4, 0, C);
  d.rotation.set(0.9, 0.6, 0);
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), M.steel, 0, 9.9, 0.3, C);
  C.position.set(-16, 0, 11);
  scene.add(C);
}
// Aydınlatma direkleri (gece yanar)
const floods = [];
for (const [x, z] of [[4, 11], [16, 1], [-12, -6]]) {
  const f = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.06, 0.09, 5, 10), M.steel, 0, 2.5, 0, f);
  const head = mesh(RB(0.7, 0.2, 0.35, 0.05), M.dark, 0, 5.05, 0, f);
  const lens = mesh(RB(0.6, 0.04, 0.28, 0.02), mat.glow({ color: 0xfff1d6, intensity: 0 }), 0, 4.93, 0, f);
  head.rotation.x = lens.rotation.x = 0.25;
  const L = LOW ? new THREE.Object3D() : new THREE.PointLight(0xffe2b8, 0, 45, 2);
  L.position.set(0, 4.7, 0.6); f.add(L);
  f.position.set(x, 0, z); f.lookAt(3, 0, 0);
  scene.add(f);
  floods.push({ lens, L });
}

// Toz parçacıkları (yumuşak yuvarlak sprite)
const DUST_N = LOW ? 900 : 1600;
const dustPos = new Float32Array(DUST_N * 3);
for (let i = 0; i < DUST_N; i++) dustPos.set([rand(-70, 70), rand(0, 16), rand(-55, 45)], i * 3);
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dustTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const dustMat = new THREE.PointsMaterial({ color: 0xd7925f, size: 0.35, map: dustTex, transparent: true, opacity: 0.1, depthWrite: false });
const dust = new THREE.Points(dustGeo, dustMat);
dust.frustumCulled = false;
scene.add(dust);

// --- Görsel güncelleme ---
const sunDir = new THREE.Vector3();
let showLabels = true;

function updateVisuals(realDt) {
  const H = ((S.sol % 1) - 0.5) * TAU;
  const sinh = Math.cos(H);
  sunDir.set(-Math.sin(H), sinh, 0.3).normalize();
  const day = smoothstep(-0.05, 0.25, sinh);
  const stormF = clamp((S.tau - TAU_CLEAR) / 5, 0, 1);
  mars.set({ sunDir, tau: S.tau });
  const night = 1 - day;
  const dim = Math.max(night, stormF * 0.8);
  winMat.emissiveIntensity = 0.15 + dim * 2.2;
  for (const f of floods) { if (f.L.isLight) f.L.intensity = dim * 250; f.lens.material.emissiveIntensity = dim * 8; }
  airlockLamp.material.emissiveIntensity = 0.3 + dim * 6;
  // Sera LED'leri: gücü verildikçe mor ışık
  const ghOn = S.served[2];
  plantMat.emissiveIntensity = ghOn * 0.25;
  ledMat.emissiveIntensity = ghOn * 7;
  if (ghLight.isLight) ghLight.intensity = ghOn * 50 * (0.3 + dim);
  moxieGlow.material.emissive.setHex(S.served[1] > 0.5 && P.o2 > 0 ? 0x46e0ff : 0x334155);
  // Batarya doluluk
  const bf = P.batt ? S.batt / P.batt : 0;
  battCells.forEach((c, i) => {
    const lvl = clamp(bf * 4 - i, 0, 1);
    c.scale.y = Math.max(lvl, 0.03);
    c.position.y = 0.15 + lvl * 0.5 + 0.02;
    c.material.emissive.setHex(bf < 0.15 ? 0xef4444 : bf < 0.4 ? 0xf59e0b : 0x22c55e);
  });
  // Maden matkabı ve gezgin
  const mineOn = S.served[3] * (P.ice > 0 ? 1 : 0);
  drill.rotation.y += realDt * 8 * mineOn;
  drill.position.y = 2.3 + Math.sin(S.sol * 60) * 0.5 * mineOn;
  const trips = P.ice / 8;
  const u = trips > 0 ? (S.sol * trips) % 1 : 0;
  const k = u < 0.5 ? smoothstep(0, 0.5, u) : 1 - smoothstep(0.5, 1, u);
  const rp = new THREE.Vector3().lerpVectors(ROVER_HOME, MINE.clone().add(new THREE.Vector3(6, 0, 4)), k);
  rp.y = height(rp.x, rp.z);
  const moved = rover.position.distanceTo(rp);
  rover.position.copy(rp);
  rover.rotation.y = Math.atan2(-(MINE.z - ROVER_HOME.z), MINE.x - ROVER_HOME.x) + (u < 0.5 ? 0 : Math.PI);
  roverWheels.forEach((w) => { w.rotation.z -= moved / 0.56; });
  // Ekip: gündüz dışarıda EVA, gece ve fırtınada içeride
  const outside = day > 0.5 && stormF < 0.3 ? Math.min(P.crew, 12) : 0;
  crew.forEach((c, i) => {
    c.visible = i < outside;
    if (!c.visible) return;
    const a = S.sol * TAU * 0.5 * (i % 2 ? 1 : -1) + (i * TAU) / Math.max(outside, 1);
    const rx = 6 + (i % 3) * 1.6, rz = 2.2 + (i % 2);
    const x = 3 + Math.cos(a) * rx, z = 10.5 + Math.sin(a) * rz;
    c.position.set(x, 0, z);
    const sg = i % 2 ? 1 : -1;
    c.rotation.y = Math.atan2(-Math.sin(a) * rx * sg, Math.cos(a) * rz * sg);
  });
  // Toz
  dustMat.opacity = 0.08 + stormF * 0.55;
  dustMat.size = 0.3 + stormF * 0.5;
  const wind = (2 + stormF * 25) * realDt * Math.max(sim.speed, 1);
  for (let i = 0; i < DUST_N; i++) {
    let x = dustPos[i * 3] + wind * (0.6 + (i % 7) * 0.1);
    if (x > 70) x -= 140;
    dustPos[i * 3] = x;
    dustPos[i * 3 + 1] += Math.sin(x * 0.3 + i) * 0.01;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır senaryolar');
const PRESETS = {
  dengeli: { crew: 4, panel: 1200, batt: 500, gh: 100, o2: 3.5, rec: 90, ice: 5, start: 60 },
  firtina: { crew: 4, panel: 1200, batt: 500, gh: 100, o2: 3.5, rec: 90, ice: 5, start: 60, stormTau: 6, stormDur: 40 },
  kalabalik: { crew: 12, panel: 1200, batt: 500, gh: 100, o2: 3.5, rec: 90, ice: 5, start: 60 },
  su: { crew: 4, panel: 1200, batt: 500, gh: 100, o2: 3.5, rec: 60, ice: 5, start: 60 },
};
ui.buttons([
  { label: '⚖️ Dengeli üs', variant: 'primary', onClick: () => applyPreset('dengeli') },
  { label: '🌪 Toz fırtınası', onClick: () => applyPreset('firtina') },
]);
ui.buttons([
  { label: '👥 Kalabalık ekip', onClick: () => applyPreset('kalabalik') },
  { label: '💧 Su geri kazanımı düşük', onClick: () => applyPreset('su') },
]);

ui.section('Ekip ve altyapı');
const ctl = {};
ctl.crew = ui.slider({ label: 'Ekip', min: 1, max: 12, step: 1, value: P.crew, unit: 'kişi', onInput: (v) => { P.crew = v; } });
ctl.panel = ui.slider({ label: 'Güneş paneli alanı', min: 100, max: 3000, step: 50, value: P.panel, unit: 'm²', onInput: (v) => { P.panel = v; layoutPanels(); } });
ctl.batt = ui.slider({ label: 'Batarya kapasitesi', min: 50, max: 2000, step: 50, value: P.batt, unit: 'kWh', onInput: (v) => { P.batt = v; S.batt = Math.min(S.batt, v); } });
ctl.gh = ui.slider({ label: 'Sera alanı', min: 0, max: 600, step: 10, value: P.gh, unit: 'm²', onInput: (v) => { P.gh = v; layoutGreenhouse(); } });
ctl.o2 = ui.slider({ label: 'O₂ ünitesi üretimi', min: 0, max: 12, step: 0.1, value: P.o2, unit: 'kg/sol', onInput: (v) => { P.o2 = v; } });
ctl.rec = ui.slider({ label: 'Su geri kazanım verimi', min: 0, max: 98, step: 1, value: P.rec, unit: '%', onInput: (v) => { P.rec = v; } });
ctl.ice = ui.slider({ label: 'Buz madeni', min: 0, max: 40, step: 1, value: P.ice, unit: 'kg su/sol', onInput: (v) => { P.ice = v; } });
ctl.start = ui.slider({ label: 'Başlangıç stoku (sıfırlamada)', min: 10, max: 300, step: 10, value: P.start, unit: 'sol', onInput: (v) => { P.start = v; } });
const needTxt = ui.text('', 'card');

ui.section('Toz fırtınası ve zaman');
ctl.stormTau = ui.slider({ label: 'Fırtına şiddeti (optik derinlik τ)', min: 1, max: 10, step: 0.5, value: P.stormTau, format: (v) => `τ = ${fmt(v, 1)}`, onInput: (v) => { P.stormTau = v; if (storm) storm.peak = v; } });
ctl.stormDur = ui.slider({ label: 'Fırtına süresi', min: 5, max: 90, step: 1, value: P.stormDur, unit: 'sol', onInput: (v) => { P.stormDur = v; if (storm) storm.dur = v; } });
ui.buttons([
  { label: '🌪 Fırtına başlat', variant: 'danger', onClick: () => { storm = { t: 0, peak: P.stormTau, dur: P.stormDur }; sim.toast('🌪 Toz fırtınası yaklaşıyor: gökyüzü kararıyor', 'warn'); } },
  { label: '☀️ Fırtınayı bitir', onClick: () => { if (storm && storm.t < storm.dur) storm.dur = Math.max(storm.t, 0); } },
]);
const timeSl = ui.slider({ label: 'Zaman akışı', min: 0.25, max: 8, step: 0.25, value: 1, format: (v) => `${fmt(v, 2)}× · 1 sol ≈ ${fmt(SEC_PER_SOL / v / Math.max(sim.speed, 0.25), 1)} sn` });

ui.section('Görünüm');
const VIEWS = {
  genel: [[34, 7.5, 44], [3, 1.2, -8]],
  us: [[10, 3.2, 17], [1, 2.6, 0]],
  sera: [[-12, 3.6, 13], [-14, 1.0, 2]],
  panel: [[26, 6, 12], [36, 0.5, -10]],
  maden: [[-6, 5, -6], [-22, 1.5, -20]],
  uzak: [[190, 110, 260], [0, 0, -30]],
};
ui.buttons([
  { label: '🎥 Genel', onClick: () => sim.moveCamera(...VIEWS.genel) },
  { label: '🏠 Üs yakın', onClick: () => sim.moveCamera(...VIEWS.us) },
  { label: '🌱 Sera', onClick: () => sim.moveCamera(...VIEWS.sera) },
]);
ui.buttons([
  { label: '🔆 Paneller', onClick: () => sim.moveCamera(...VIEWS.panel) },
  { label: '⛏️ Maden', onClick: () => sim.moveCamera(...VIEWS.maden) },
  { label: '🛰️ Uzaktan', onClick: () => sim.moveCamera(...VIEWS.uzak) },
]);
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => { showLabels = v; Object.values(labels).forEach((l) => { l.visible = v; }); layoutGreenhouse(); } });
ui.toggle({ label: 'Uçuşan toz parçacıkları', value: true, onChange: (v) => { dust.visible = v; } });

ui.section('Durum');
const st = {
  sol: ui.stat({ label: 'Sol' }),
  sun: ui.stat({ label: 'Güneş gücü', unit: 'kW' }),
  tau: ui.stat({ label: 'Toz (τ)' }),
  batt: ui.stat({ label: 'Batarya', unit: '%' }),
  o2: ui.stat({ label: 'O₂ rezervi', unit: 'sol' }),
  water: ui.stat({ label: 'Su rezervi', unit: 'sol' }),
  food: ui.stat({ label: 'Besin rezervi', unit: 'sol' }),
  load: ui.stat({ label: 'Yük', unit: 'kW' }),
};
const mO2 = ui.meter({ label: 'O₂ stoku', color: '#38bdf8' });
const mW = ui.meter({ label: 'Su stoku', color: '#60a5fa' });
const mF = ui.meter({ label: 'Besin stoku', color: '#4ade80' });
const statusTxt = ui.text('', 'card');
const resChart = ui.chart({
  title: 'Rezerv: mevcut gidişle kaç sol yeter? (son 200 sol; 400 = sınırsız)',
  series: [{ name: 'O₂', color: '#38bdf8' }, { name: 'Su', color: '#818cf8' }, { name: 'Besin', color: '#4ade80' }],
  maxPoints: 400, yMin: 0, yMax: 400, height: 110,
});
const enChart = ui.chart({
  title: 'Enerji, son 40 sol: batarya, güneş gücü (açık gök tepesine göre) ve beslenen yük (%)',
  series: [{ name: 'Batarya', color: '#facc15', fill: true }, { name: 'Güneş', color: '#fb923c' }, { name: 'Güç verilen yük', color: '#f87171' }],
  maxPoints: 400, yMin: 0, yMax: 100, height: 100, format: (v) => fmt(v, 0),
});

function applyPreset(name) {
  scenario = name;
  const p = { stormTau: 5, stormDur: 35, ...PRESETS[name] };
  for (const k in p) { P[k] = p[k]; ctl[k].set(p[k]); }
  layoutPanels();
  layoutGreenhouse();
  resetState();
}

const fmtRes = (v) => (v === Infinity ? '∞' : v > 999 ? '999+' : fmt(v, 0));
const tone = (v) => (v === Infinity || v > 120 ? 'good' : v > 30 ? 'warn' : 'bad');

function updatePanel() {
  const r = { o2: reserve('o2'), water: reserve('water'), food: reserve('food') };
  st.sol.set(Math.floor(S.sol) + 1);
  st.sun.set(fmt(S.gen, 0));
  st.tau.set(fmt(S.tau, 1), S.tau > 3 ? 'bad' : S.tau > 1.5 ? 'warn' : 'good');
  const bf = P.batt ? S.batt / P.batt : 0;
  st.batt.set(fmt(bf * 100, 0), bf < 0.1 ? 'bad' : bf < 0.35 ? 'warn' : 'good');
  st.o2.set(fmtRes(r.o2), tone(r.o2));
  st.water.set(fmtRes(r.water), tone(r.water));
  st.food.set(fmtRes(r.food), tone(r.food));
  const totalDem = S.dem.reduce((a, b) => a + b, 0);
  st.load.set(fmt(totalDem, 1));
  const n = need();
  mO2.set(Math.min(1, S.o2 / (n.o2 * 120)), `${fmt(S.o2, 0)} kg · ${S.rate ? (S.rate.o2 >= 0 ? '+' : '') + fmt(S.rate.o2, 1) : '—'} kg/sol`);
  mW.set(Math.min(1, S.water / (n.water * 120)), `${fmt(S.water, 0)} kg · ${S.rate ? (S.rate.water >= 0 ? '+' : '') + fmt(S.rate.water, 1) : '—'} kg/sol`);
  mF.set(Math.min(1, S.food / (n.food * 120)), `${fmt(S.food, 0)} kişi-sol · ${S.rate ? (S.rate.food >= 0 ? '+' : '') + fmt(S.rate.food, 1) : '—'}/sol`);
  // Günlük enerji dengesi (açık gök, ortalama)
  const clearDay = (S_MARS * P.panel * ETA / 1000) * (SOL_H / Math.PI) * 0.85;
  needTxt.set(`<small>Günlük ihtiyaç (${P.crew} kişi): O₂ <b>${fmt(n.o2, 1)} kg</b> · içme suyu <b>${fmt(n.water, 1)} kg</b> ·
    su kaybı <b>${fmt(P.crew * W_USE * (1 - P.rec / 100), 1)} kg</b> · besin için sera <b>${fmt(P.crew * AREA_PP, 0)} m²</b><br>
    Enerji: açık gökte panel ≈ <b>${fmt(clearDay, 0)} kWh/sol</b>, yük <b>${fmt(totalDem * SOL_H, 0)} kWh/sol</b>.</small>`);
  const warn = [];
  const names = ['temel yaşam desteği', 'O₂ ünitesi', 'sera ışıkları', 'buz madeni'];
  S.served.forEach((f, i) => { if (f < 0.97 && S.dem[i] > 0) warn.push(`${names[i]} %${fmt(f * 100, 0)} güçle`); });
  let html = '';
  if (S.o2 <= 0) html += '🔴 <b>Oksijen stoku bitti!</b> Ekip acil tahliye ya da ikmal gerektirir.<br>';
  if (S.water <= 0) html += '🔴 <b>Su bitti!</b><br>';
  if (S.food <= 0) html += '🔴 <b>Besin bitti!</b><br>';
  if (warn.length) html += `⚡ Enerji yetersiz: ${warn.join(', ')} çalışıyor.<br>`;
  if (storm && storm.t >= 0) html += `🌪 Toz fırtınası: ${fmt(Math.max(0, storm.t), 0)}. sol, yüzeye ulaşan ışık açık günün ≈ %${fmt(100 * trans(S.tau, 1) / trans(TAU_CLEAR, 1), 0)}’i.<br>`;
  if (!html) html = [r.o2, r.water, r.food].every((v) => v === Infinity) ? '✅ Üs kendi kendine yetiyor: tüm stoklar artıyor.' : '✅ Sistemler çalışıyor; azalan stokların rezervini izle.';
  statusTxt.set(html);
  // Eşik uyarıları (bir kez)
  for (const [k, nm] of [['o2', 'O₂'], ['water', 'Su'], ['food', 'Besin']]) {
    if (r[k] < 15 && !S.warned[k]) { S.warned[k] = true; sim.toast(`⚠️ ${nm} rezervi 15 solün altına düştü`, 'bad'); }
    if (r[k] > 30) S.warned[k] = false;
  }
  labels.panel.setText(`Paneller · ${fmt(S.gen, 0)} kW`);
  labels.batt.setText(`Batarya %${fmt(bf * 100, 0)}`);
}

// --- Döngü ---
let chartAcc = 0, resAcc = 0, panelAcc = 0;
sim.formatTime = () => {
  const f = S.sol % 1, h = Math.floor(f * 24), m = Math.floor((f * 24 - h) * 60);
  return `Sol ${Math.floor(S.sol) + 1} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

sim.onUpdate((dt) => {
  let dsol = (dt * timeSl.value) / SEC_PER_SOL;
  while (dsol > 1e-9) {
    const h = Math.min(dsol, 0.01);
    step(h);
    dsol -= h;
    chartAcc += h;
    resAcc += h;
    if (resAcc >= 0.5) {
      resAcc = 0;
      resChart.push(['o2', 'water', 'food'].map((k) => Math.min(400, reserve(k))));
    }
    if (chartAcc >= 0.1) {
      chartAcc = 0;
      const clearPeak = (S_MARS * trans(TAU_CLEAR, 1) * P.panel * ETA) / 1000;
      const served = S.dem.reduce((a, d, i) => a + d * S.served[i], 0) / (S.dem.reduce((a, b) => a + b, 0) || 1);
      enChart.push([P.batt ? (100 * S.batt) / P.batt : 0, (100 * S.gen) / clearPeak, served * 100]);
    }
  }
});

sim.onRender((dt) => {
  updateVisuals(dt);
  panelAcc += dt;
  if (panelAcc > 0.25) { panelAcc = 0; updatePanel(); }
});

// Yapıya tıkla → anlık akış
sim.onClick(clickables, (hit) => {
  const key = hit.object.userData.key;
  const f = (i) => `%${fmt(S.served[i] * 100, 0)}`;
  const msg = {
    hab: `<b>Yaşam modülü</b> · ${P.crew} kişi · ${fmt(S.dem[0], 1)} kW (ısıtma, hava, su arıtma) · güç ${f(0)}`,
    gh: `<b>Sera</b> · ${fmt(P.gh, 0)} m² ≈ ${fmt(P.gh / AREA_PP, 1)} kişinin besini ve O₂'si · LED ${fmt(S.dem[2], 1)} kW · güç ${f(2)}`,
    o2: `<b>O₂ ünitesi</b> · CO₂ → CO + O₂ · ${fmt(P.o2 * S.served[1], 1)} kg/sol · ${fmt(S.dem[1], 1)} kW`,
    batt: `<b>Batarya</b> · ${fmt(S.batt, 0)} / ${fmt(P.batt, 0)} kWh`,
    panel: `<b>Güneş panelleri</b> · ${fmt(P.panel, 0)} m² · yüzeyde ${fmt(S.irr, 0)} W/m² · ${fmt(S.gen, 1)} kW`,
    ice: `<b>Buz madeni</b> · ${fmt(P.ice * S.served[3], 1)} kg su/sol · ${fmt(S.dem[3], 2)} kW`,
  }[key];
  if (msg) sim.toast(msg);
});

sim.onReset(() => resetState());
layoutPanels();
layoutGreenhouse();
resetState();
updatePanel();
