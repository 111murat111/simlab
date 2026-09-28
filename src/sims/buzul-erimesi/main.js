// Buzul Erimesi ve Deniz Seviyesi — ısınma senaryosuna göre buzul geri çekilmesi ve temsili kıyı şehrinin su baskını.
import { createSim, THREE, fmt, clamp, smoothstep, seeded, lerp, mat, procedural, landscape, createTerrain, terrainMaterial, terrainSkirt, createVegetation, BufferGeometryUtils } from '@core';
import { simulate, band, GLACIER_SLE } from './model.js';
import { sweep } from './kit.js';

const Y0 = 2025, Y1 = 2300;
const SSP = [
  { id: 'ssp1', name: 'SSP1-2.6', T: 1.8, color: '#22c55e', desc: 'Hızlı emisyon azaltımı' },
  { id: 'ssp2', name: 'SSP2-4.5', T: 2.7, color: '#facc15', desc: 'Orta yol' },
  { id: 'ssp5', name: 'SSP5-8.5', T: 4.4, color: '#ef4444', desc: 'Yüksek emisyon' },
];
const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;

// Dünya ölçeği (m): kıyı ovası 1 birim = 120 m, dağlar 1 birim = 330 m yatay, 170 m düşey. Yükseklikler gerçek metre (abartı yok).
const S = 120, SM = 330, HM = 170;
const VIEWS = {
  wide: [[1500, 230, 4300], [-300, 420, -3000]],
  coast: [[1850, 38, 2050], [700, 4, 700]],
  glacier: [[-400, 2900, -1200], [-1900, 1900, -7700]],
};

const sim = createSim({
  sky: { elevation: 27, azimuth: 214, clouds: 0.3, haze: 1.0, visibility: 32000, wind: [5, -2] },
  ocean: { wind: 5, windDir: 200, fetch: 120 },
  camera: { position: VIEWS.wide[0], target: VIEWS.wide[1], fov: 46, near: 1, far: 120000 },
  controls: { maxDistance: 30000, minDistance: 20, maxPolarAngle: 1.53 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Arkada buzullu bir dağ sırası, önde alçak bir kıyıda kurulmuş temsili <b>Kıyıkent</b> (yaklaşık 850 bin kişi). Deniz seviyesi
    yükselince önce delta ve sahil mahalleleri su altında kalır; buzul ise yukarı doğru çekilir.</p>
    <p>Küresel ortalama deniz seviyesi artışı üç ana kaynaktan gelir: <b>ısıl genleşme</b> (ısınan su genleşir),
    <b>dağ buzullarının erimesi</b> ve <b>buz tabakaları</b> (Grönland, Antarktika). Isınma dursa bile okyanus ve buz tabakaları
    yavaş tepki verdiği için deniz yüzyıllarca yükselmeye devam eder.</p>
    <h3>Dene</h3>
    <ul>
      <li>SSP1-2.6 ile SSP5-8.5'i 2100 ve 2300 yıllarında karşılaştır: 2100'de fark onlarca cm, 2300'de metrelerce.</li>
      <li>"Fırtına kabarması"nı aç: bugün nadir görülen bir fırtına, deniz yükseldikçe çok daha fazla mahalleyi basar.</li>
      <li>Kıyı setini yükselt; set aşılana kadar şehir korunur, ama aşıldığında arkası hızla dolar.</li>
      <li>"Kıyıya yakın" görünümde iskele ucundaki ölçüm cetveline bak; bir binaya tıkla: yükseltisini ve durumunu gör.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>IPCC AR6'ya göre 2100'e kadar küresel deniz seviyesi (1995–2014'e göre) SSP1-2.6'da yaklaşık 0,3–0,6 m,
    SSP5-8.5'te 0,6–1,0 m yükselir; 2300'de bu değerler 0,3–3,1 m ile 1,7–6,8 m aralığına çıkar (düşük güven).
    Dünyada yüz milyonlarca insan deniz seviyesinden birkaç metre yüksekte yaşıyor.</p>
    <p><small>Model basitleştirilmiştir: bileşenler AR6 ortancalarına kabaca ayarlıdır, değerler 2025'e göre verilir ve
    <b>yaklaşıktır</b>. Aralık bandı "olası" aralığı temsil eder. Isınma 2100'de seçilen değere ulaşır; 2,2 °C üstünde sonra da artar.
    Şehir, yükseltiler ve nüfus hayalidir; yerel çökme, gelgit ve dalga etkileri yoktur. Sahne gerçek ölçektedir
    (kıyı ovası ≈ 1–20 m, zirveler ≈ 2,5 km); bu yüzden birkaç on santimlik yükselme uzaktan fark edilmez, kıyıya yaklaş.</small></p>`,
});
sim.formatTime = () => `Yıl ${Math.round(year.value)}`;
const scene = sim.scene;

// --- Arazi (modelin alçak kıyı fonksiyonları, birim cinsinden) ---
const coastZ = (x) => 10 + 1.4 * Math.sin(x * 0.16) + 0.6 * Math.sin(x * 0.41 + 1);
const riverX = (z) => -6 + 2.2 * Math.sin(z * 0.18);
const PEAKS = [[-6, -23, 15], [9, -25, 12.5], [-20, -21, 10], [21, -19, 9.5], [0, -28, 11]];
const lowN = landscape({ seed: 41, size: 70, height: 2.2, base: -1.1, octaves: 4, warp: 0.3 });
/** Alçak arazi yükseltisi (m); denizde negatif (model). */
function elevM(x, z) {
  const d = coastZ(x) - z;
  if (d < 0) return Math.max(-14, d * 2.2);
  let e = d * 0.85 + lowN(x * S, z * S) * 0.75;
  const dr = Math.abs(x - riverX(z));
  e -= 3.4 * Math.exp(-((dr / 4) ** 2)) * smoothstep(-8, 2, z);
  return Math.max(0.35 * smoothstep(0, 1.5, d), e);
}
function mountainW(x, z) { // birim (1 = HM metre)
  let m = 0;
  for (const [px, pz, h] of PEAKS) m = Math.max(m, h * Math.exp(-(((x - px) / 8) ** 2 + ((z - pz) / 6) ** 2)));
  const ridge = smoothstep(-6, -17, z) * 4.5;
  return Math.max(m, ridge) * smoothstep(-4, -12, z);
}
const crag = landscape({ seed: 5, size: 2600, height: 900, base: -330, warp: 0.6 });
const foot = landscape({ seed: 12, size: 900, height: 70, base: -10, warp: 0.4 });
const micro = landscape({ seed: 3, size: 140, height: 1.2, base: -0.6, octaves: 4 });
function mountainM(xw, zw) {
  const mask = smoothstep(-1300, -4200, zw);
  return mountainW(xw / SM, zw / SM) * HM + crag(xw, zw) * mask * mask + foot(xw, zw) * smoothstep(-500, -2200, zw);
}
/** Görsel zemin (m, bugünkü deniz seviyesi = 0). */
function ground(xw, zw) {
  const x = clamp(xw / S, -40, 40), z = zw / S;
  let e = elevM(x, z);
  const d = coastZ(x) - z;
  if (d > 0) { // nehir yatağı: denize bağlı su kanalı (görsel)
    const dr = Math.abs(x - riverX(z));
    e -= 1.9 * Math.exp(-((dr / 0.42) ** 2)) * smoothstep(-8, -1, z) * smoothstep(-0.5, 0.6, d);
    e += micro(xw, zw) * smoothstep(0.5, 2, d);
  }
  return e + mountainM(xw, zw);
}

// Kentsel zemin maskesi: blok doluluğu (41 × 13 blok ızgarası) → arazi malzemesinde kaldırım/asfalt ve sokak ızgarası
const BX0 = -26, BZ0 = -4, BP = 1.3, BNX = 41, BNZ = 13;
const blockData = new Uint8Array(BNX * BNZ * 4);
const blockTex = new THREE.DataTexture(blockData, BNX, BNZ, THREE.RGBAFormat);
blockTex.magFilter = blockTex.minFilter = THREE.LinearFilter;
function cityMaterial(opts) {
  const m = terrainMaterial(opts), orig = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    orig(sh, r);
    Object.assign(sh.uniforms, { uBlocks: { value: blockTex } });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uBlocks; float gUrb;')
      .replace('diffuseColor.rgb = c;', `diffuseColor.rgb = c;
        {
          vec2 bu = (vTW.xz/${S.toFixed(1)} - vec2(${BX0.toFixed(1)}, ${BZ0.toFixed(1)}))/${BP.toFixed(2)};
          vec2 buv = (bu + 0.5)/vec2(${BNX.toFixed(1)}, ${BNZ.toFixed(1)});
          float occ = (buv.x > 0.0 && buv.x < 1.0 && buv.y > 0.0 && buv.y < 1.0) ? texture2D(uBlocks, buv).r : 0.0;
          gUrb = smoothstep(0.3, 0.55, occ + 0.15*(fbm3(tP*0.02, 3) - 0.5));
          vec2 sd = abs(fract(bu) - 0.5)*${(BP * S).toFixed(1)};          // sokak eksenine uzaklık (m)
          float street = 1.0 - smoothstep(6.0, 8.0, min(sd.x, sd.y));
          float fine = vn3(tP*1.9), mid = fbm3(tP*0.15, 3);
          vec3 pave = vec3(0.47, 0.46, 0.44)*(0.8 + 0.3*mid)*(0.9 + 0.2*fine);
          vec3 asph = vec3(0.15, 0.155, 0.16)*(0.85 + 0.3*fine);
          float lane = step(abs(min(sd.x, sd.y)), 0.12)*step(0.5, fract(dot(vTW.xz, vec2(0.12))))*0.6;
          vec3 urb = mix(pave, asph, street) + lane*vec3(0.5);
          // bloklar arası yeşil (park, bahçe) lekeleri
          urb = mix(urb, c*0.9, smoothstep(0.62, 0.75, fbm3(tP*0.012 + 4.0, 3))*(1.0 - street));
          diffuseColor.rgb = mix(diffuseColor.rgb, urb, gUrb);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.88, gUrb);');
  };
  m.customProgramCacheKey = () => 'buzul-city-terrain';
  return m;
}

const TOPT = { water: 0, grass: 0x5c6d34, dry: 0x8f8a5a, forest: 0.55, forestCol: 0x2b3d22, rock: 0x6f6a66, snow: 2600, snowCol: 0xf4f7fa };
const cityMat = cityMaterial(TOPT), baseMat = terrainMaterial(TOPT);
const PATCH_C = { c: [0, 450], s: [10400, 3300] }, PATCH_M = { c: [0, -8200], s: [19200, 12000] };
const inRect = (P, x, z, m) => Math.min(smoothstep(P.s[0] / 2, P.s[0] / 2 - m, Math.abs(x - P.c[0])), smoothstep(P.s[1] / 2, P.s[1] / 2 - m, Math.abs(z - P.c[1])));
scene.add(createTerrain((x, z) => ground(x, z) - 3 * inRect(PATCH_C, x, z, 60) - 6 * inRect(PATCH_M, x, z, 150), { size: [44000, 40000], center: [0, -6000], res: LOW ? [220, 200] : [320, 290], material: baseMat }));
const cityTerr = createTerrain(ground, { size: PATCH_C.s, center: PATCH_C.c, res: LOW ? [300, 96] : [420, 132], material: cityMat });
scene.add(cityTerr);
const MRES = LOW ? [200, 125] : [256, 160];
const mtnTerr = createTerrain(ground, { size: PATCH_M.s, center: PATCH_M.c, res: MRES, material: baseMat });
scene.add(mtnTerr);
scene.add(terrainSkirt(ground, { inner: 20000, outer: 90000, center: [0, -6000], material: baseMat }));

// --- Buzul: denge çizgisinin (ELA) üstündeki buz; hacim azaldıkça ELA yükselir (model, birim cinsinden) ---
const glBase = [];
{
  const g = new THREE.PlaneGeometry(80, 30, 110, 45); g.rotateX(-Math.PI / 2); g.translate(0, 0, -25);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) glBase.push(elevM(p.getX(i), p.getZ(i)) * 0.3 + mountainW(p.getX(i), p.getZ(i)));
  g.dispose();
}
const iceT = (h, ela) => Math.min(1.6, Math.max(0, h - ela) * 0.3);
const iceVol = (ela) => glBase.reduce((s, h) => s + iceT(h, ela), 0);
const ELA0 = 9, VOL0 = iceVol(ELA0);
function elaFor(frac) {
  let lo = ELA0 - 3, hi = 17;
  for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (iceVol(m) / VOL0 > frac) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// Görsel buzul: dağ ağının aynısı (aynı üçgenleme), kalınlık = (h − ELA)·0,3 (en çok 1,6·HM ≈ 270 m)
const glGeo = mtnTerr.geometry.clone();
const glPos = glGeo.attributes.position, glY0 = Float32Array.from({ length: glPos.count }, (_, i) => glPos.getY(i));
const ICE_ELA = { value: ELA0 * HM };
const iceMat = procedural({
  key: 'buzul-ice',
  params: { color: 0xffffff, roughness: 0.45 },
  uniforms: { uEla: ICE_ELA },
  pattern: /* glsl */ `
    float above = smoothstep(uEla + 60.0, uEla + 260.0, p.y + 90.0*(fbm3(p*0.004, 3) - 0.5));
    // yarıklar: akış yönüne dik şeritler, gürültüyle bükülmüş
    float cr = abs(sin(p.z*0.045 + 6.0*fbm3(p*0.003, 3) + 2.0*vn3(p*0.02)));
    float crev = (1.0 - smoothstep(0.0, 0.08, cr))*smoothstep(0.45, 0.7, fbm3(p*0.006 + 3.0, 3))*(1.0 - above*0.8);
    vec3 ice = mix(vec3(0.55, 0.68, 0.78), vec3(0.78, 0.84, 0.88), fbm3(p*0.01, 4));
    float dirt = smoothstep(0.62, 0.8, fbm3(p*vec3(0.02, 0.0, 0.004) + 9.0, 4))*(1.0 - above);  // orta moren şeritleri
    ice = mix(ice, vec3(0.38, 0.36, 0.34), dirt*0.7);
    vec3 snow = vec3(0.95, 0.96, 0.98)*(0.93 + 0.07*vn3(p*0.05));
    col = mix(ice, snow, above);
    col = mix(col, vec3(0.12, 0.22, 0.32), crev*0.85);
    rough = mix(0.3, 0.75, above);
    h = -crev;`,
  bump: 0.4,
});
const glacier = new THREE.Mesh(glGeo, iceMat);
glacier.userData.noFit = true;
scene.add(glacier);
function setGlacier(frac) {
  const ela = elaFor(frac), em = ela * HM;
  ICE_ELA.value = em;
  for (let i = 0; i < glPos.count; i++) {
    const h = glY0[i], t = Math.min(1.6 * HM, Math.max(0, h - em) * 0.3);
    glPos.setY(i, t > 0 ? h + t + 2 : h - 4);
  }
  glPos.needsUpdate = true;
  glGeo.computeVertexNormals();
  baseMat.userData.terrain.tSnow.value = em + 420; // mevsimlik kar: buzuldan biraz yukarıda, dik olmayan yamaçlarda
  cityMat.userData.terrain.tSnow.value = em + 420;
  return ela;
}
const glLabel = sim.label('', { position: [-6 * SM, 2900, -23 * SM], className: 'plain' });

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
    const b = { x: bx, z: bz, d, e, w: 0.7 + rnd() * 0.35, flooded: false };
    b.dist = DISTRICTS.findIndex((D) => D.test(b));
    const tall = b.dist === 1 || b.dist === 3 ? 2.2 : 1;
    b.h = (0.35 + rnd() * 0.9) * tall;
    b.pop = b.w * b.w * b.h;
    blds.push(b);
    const bi = Math.round((x - BX0) / BP), bj = Math.round((z - BZ0) / BP);
    if (bi >= 0 && bj >= 0 && bi < BNX && bj < BNZ) blockData[(bj * BNX + bi) * 4] = 255;
  }
}
blockTex.needsUpdate = true;
const popScale = TOTAL_POP / blds.reduce((s, b) => s + b.pop, 0);
blds.forEach((b) => (b.pop *= popScale));

// Her model bloğu = gerçek boyutta bir kent adası: 2×2 parselde kat sayısı bloğun yüksekliğine göre değişen binalar
const DCOL = [0xd9c2a4, 0xc4c8cc, 0xe6dccb, 0xd3aa92, 0xece6da];
const facade = procedural({
  key: 'buzul-facade',
  params: { vertexColors: true, roughness: 0.85 },
  pattern: /* glsl */ `
    vec3 an = abs(pn);
    if (an.y > 0.6) {
      float g = fbm3(p*0.6, 3);
      col = vec3(0.36, 0.355, 0.35)*(0.8 + 0.4*g)*(0.7 + 0.3*col.r); rough = 0.92; h = g*0.3;
    } else {
      float u = an.x > 0.5 ? p.z : p.x;
      float cu = u/3.4, cv = p.y/3.1;
      vec2 fw = fwidth(vec2(cu, cv));
      float wx = fract(cu), wy = fract(cv);
      float win = smoothstep(0.16, 0.2, wx)*smoothstep(0.84, 0.8, wx)*smoothstep(0.26, 0.3, wy)*smoothstep(0.88, 0.84, wy);
      win = mix(win, 0.38, smoothstep(0.12, 0.45, max(fw.x, fw.y)));          // uzakta ortalama (titreşim yok)
      float lit = h13(floor(vec3(cu, cv, u*0.013 + p.y*0.0)));
      vec3 wall = col*(0.82 + 0.3*fbm3(p*0.25, 3));
      wall *= 1.0 - 0.18*smoothstep(0.7, 0.9, fbm3(p*vec3(0.05, 0.4, 0.05), 3));   // yağmur izi
      vec3 glass = vec3(0.07, 0.085, 0.1) + vec3(0.09, 0.1, 0.1)*lit;
      col = mix(wall, glass, win);
      rough = mix(0.85, 0.08, win); metal = 0.0;
      h = -0.4*win;
    }`,
  bump: 0.25,
});
const cityGeos = [], blockOf = [], vRange = [];
{
  const r2 = seeded(19), box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  let tri = 0, vtx = 0;
  blds.forEach((b, bi) => {
    const cx = b.x * S, cz = b.z * S, W = b.w * S, lot = W / 2;
    const v0 = vtx;
    for (let q = 0; q < 4; q++) {
      if (r2() < 0.1) continue;
      const lx = cx + (q % 2 - 0.5) * lot, lz = cz + ((q >> 1) - 0.5) * lot;
      const fw = lot - 12 - r2() * 8, fd = lot - 12 - r2() * 10;
      const floors = Math.max(2, Math.round(b.h * 6 * (0.7 + r2() * 0.6)));
      const H = floors * 3.1 + 1.2;
      const gy = Math.min(ground(lx - fw / 2, lz - fd / 2), ground(lx + fw / 2, lz - fd / 2), ground(lx - fw / 2, lz + fd / 2), ground(lx + fw / 2, lz + fd / 2)) - 0.6;
      const parts = [[fw, H, fd, 0]];
      if (floors > 5 && r2() < 0.7) parts.push([fw * 0.35, 3.5, fd * 0.3, H]); // çatı makine dairesi
      for (const [w, h, d, y] of parts) {
        const g = box.clone().scale(w, h, d).translate(lx, gy + y, lz);
        const c = new THREE.Color(DCOL[b.dist]).multiplyScalar(0.85 + r2() * 0.25);
        const cols = new Float32Array(g.attributes.position.count * 3);
        for (let k = 0; k < cols.length; k += 3) cols.set([c.r, c.g, c.b], k);
        g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
        cityGeos.push(g);
        for (let t = 0; t < 12; t++) blockOf[tri + t] = bi;
        tri += 12; vtx += g.attributes.position.count;
      }
    }
    vRange[bi] = [v0, vtx];
  });
}
const cityGeo = BufferGeometryUtils.mergeGeometries(cityGeos);
const baseCols = Float32Array.from(cityGeo.attributes.color.array);
const city = new THREE.Mesh(cityGeo, facade);
scene.add(city);
cityGeos.forEach((g) => g.dispose());

const dLabels = DISTRICTS.map((D, k) => {
  const list = blds.filter((b) => b.dist === k);
  D.count = list.length;
  D.pop = list.reduce((s, b) => s + b.pop, 0);
  const cx = list.reduce((s, b) => s + b.x, 0) / (list.length || 1), cz = list.reduce((s, b) => s + b.z, 0) / (list.length || 1);
  return sim.label(D.name, { position: [cx * S, ground(cx * S, cz * S) + 90, cz * S] });
});

// --- Kıyı seti (beton duvar; yükseklik kaydırıcıyla) ---
const wallPath = [];
for (let x = -4800; x <= 4800; x += 40) wallPath.push(new THREE.Vector3(x, 0, (coastZ(x / S) - 0.9) * S));
const wallMat = mat.concrete({ color: 0xa9a59c });
const walls = new THREE.Mesh(sweep([[-0.55, 0], [-0.55, 0.93], [-0.4, 1], [0.45, 1], [0.45, 0]], wallPath), wallMat);
walls.position.y = -1.5;
scene.add(walls);

// --- Liman iskelesi ve deniz seviyesi ölçüm cetveli (mareograf) ---
const GX = 12 * S, GZ0 = coastZ(12) * S - 30, GZ = (coastZ(12) + 1.2) * S;
const pier = new THREE.Group();
{
  const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.35, GZ - GZ0 + 6), mat.wood({ color: 0x8a6b4c }));
  deck.position.set(GX, 2.4, (GZ + GZ0) / 2);
  pier.add(deck);
  const piles = [];
  for (let z = GZ0 + 4; z <= GZ + 2; z += 7) for (const s of [-1, 1]) piles.push([GX + s * 2.1, z]);
  const pileGeo = new THREE.CylinderGeometry(0.22, 0.25, 18, 10).translate(0, -6.8, 0);
  const pm = new THREE.InstancedMesh(pileGeo, mat.wood({ color: 0x4d3b2b }), piles.length);
  piles.forEach(([x, z], i) => pm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 2.2, z)));
  pier.add(pm);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1, GZ - GZ0 + 6), mat.paintedMetal({ color: 0xdadfe3, wear: 0.3 }));
  rail.position.set(GX + 2.4, 3.1, (GZ + GZ0) / 2); pier.add(rail);
  const rail2 = rail.clone(); rail2.position.x = GX - 2.4; pier.add(rail2);
  // Cetvel: her metrede kırmızı/beyaz şerit, 10 cm çentikler (0 = 2025 ortalama deniz seviyesi)
  const staff = new THREE.Mesh(new THREE.BoxGeometry(0.5, 16, 0.08).translate(0, 4, 0), procedural({
    key: 'buzul-staff', params: { roughness: 0.5 },
    pattern: /* glsl */ `
      float m = floor(p.y), f = fract(p.y);
      col = mod(m, 2.0) < 0.5 ? vec3(0.8, 0.06, 0.05) : vec3(0.92);
      float tick = step(fract(p.y*10.0), 0.18)*step(0.05, p.x + 0.25)*step(p.x + 0.25, 0.2);
      col = mix(col, vec3(0.03), max(tick, step(f, 0.03)));`,
  }));
  staff.position.set(GX + 2.9, 0, GZ + 1);
  pier.add(staff);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 18, 12).translate(0, 2.5, 0), mat.paintedMetal({ color: 0x2f3a44, wear: 0.4 }));
  post.position.set(GX + 3.3, 0, GZ + 1.3); pier.add(post);
  const hut = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 3).translate(0, 1.3, 0), mat.paintedMetal({ color: 0xe9ecef, wear: 0.2 }));
  hut.position.set(GX, 2.55, GZ - 1); pier.add(hut);
}
scene.add(pier);
const gaugeLabel = sim.label('', { position: [GX + 3, 16, GZ + 1] });

// Kıyı ötesi ormanlar, çalılar (şehir dışında, ağaç sınırının altında)
const veg = createVegetation(ground, {
  rect: [-7000, -5200, 7000, 1700], trees: LOW ? 3500 : 7000, shrubs: LOW ? 1500 : 3000, rocks: 400, seed: 9, water: 1,
  kinds: { pine: 0.55, broad: 0.35, cypress: 0.1 },
  forest: (x, z) => {
    const u = x / S, v = z / S;
    const urban = u > -28 && u < 28 && v > -5.5 && v < coastZ(u) ? 1 : 0;
    const h = ground(x, z);
    return urban ? 0 : (0.35 + 0.35 * Math.sin(x * 0.0021 + 1) * Math.cos(z * 0.0017)) * (1 - smoothstep(700, 1100, h));
  },
});
scene.add(veg.group);

// --- Deniz: okyanus yüzeyi deniz seviyesiyle yükselir; derinlik dokusu = su − zemin (set korurken içerisi kuru) ---
const DR = [-4800, -1600, 4800, 3000], DNX = 320, DNZ = 160;
const dData = new Float32Array(DNX * DNZ * 4), dGround = new Float32Array(DNX * DNZ), dInside = new Uint8Array(DNX * DNZ);
for (let j = 0; j < DNZ; j++) for (let i = 0; i < DNX; i++) {
  const x = DR[0] + (i + 0.5) / DNX * (DR[2] - DR[0]), z = DR[1] + (j + 0.5) / DNZ * (DR[3] - DR[1]);
  dGround[j * DNX + i] = ground(x, z);
  dInside[j * DNX + i] = z < (coastZ(x / S) - 0.9) * S ? 1 : 0;
}
const depthTex = new THREE.DataTexture(dData, DNX, DNZ, THREE.RGBAFormat, THREE.FloatType);
depthTex.minFilter = depthTex.magFilter = THREE.LinearFilter;
sim.ocean.setDepth(depthTex, DR);
function setWater(water, protectedCity, wallH) {
  sim.ocean.mesh.position.y = water;
  for (let k = 0; k < dGround.length; k++) dData[k * 4] = protectedCity && dInside[k] && dGround[k] > -0.5 ? Math.min(-2, dGround[k] - wallH - 1) : water - dGround[k];
  depthTex.needsUpdate = true;
}

// --- Model durumu ---
let cur = [], scen = {};
const lvlAt = (arr, y) => {
  const i = clamp(y - 2005, 0, arr.length - 1), a = arr[Math.floor(i)], b = arr[Math.ceil(i)], f = i - Math.floor(i);
  const o = {};
  for (const k of ['T', 'th', 'gl', 'gr', 'an', 'lw', 'total']) o[k] = lerp(a[k], b[k], f);
  return o;
};
SSP.forEach((s) => (scen[s.id] = simulate(s.T)));

const floodTint = new THREE.Color(0x4f86b8);
let wasProtected = false;
function update() {
  const y = year.value;
  const base = lvlAt(cur, Y0), now = lvlAt(cur, y);
  const slr = Math.max(0, now.total - base.total); // 2025'e göre (m)
  const [lo, hi] = band(y);
  const water = slr * (upper.value ? hi : 1) + (surge.value ? 1.5 : 0);
  const wallH = wall.value;
  const protectedCity = wallH > 0 && water < wallH;
  setWater(water, protectedCity, wallH);
  walls.visible = wallH > 0;
  walls.scale.y = wallH + 1.5;
  wallMat.color.setHex(wallH > 0 && !protectedCity ? 0x8a6a4e : 0xa9a59c);

  // Binalar
  let pop = 0, nFlood = 0;
  const dF = DISTRICTS.map(() => 0);
  const colA = cityGeo.attributes.color, arr = colA.array;
  blds.forEach((b, i) => {
    const was = b.flooded;
    b.flooded = !protectedCity && b.e < water;
    if (b.flooded) { pop += b.pop; nFlood++; dF[b.dist]++; }
    if (was !== b.flooded || !update.done) {
      const [v0, v1] = vRange[i], on = b.flooded && showFlood.value;
      for (let v = v0 * 3; v < v1 * 3; v += 3) {
        arr[v] = on ? baseCols[v] * 0.35 + floodTint.r * 0.65 : baseCols[v];
        arr[v + 1] = on ? baseCols[v + 1] * 0.35 + floodTint.g * 0.65 : baseCols[v + 1];
        arr[v + 2] = on ? baseCols[v + 2] * 0.35 + floodTint.b * 0.65 : baseCols[v + 2];
      }
      colA.needsUpdate = true;
    }
  });
  update.done = true;
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

ui.section('Görünüm');
const showFlood = ui.toggle({ label: 'Su basan blokları mavi işaretle', value: true, onChange: () => { update.done = false; update(); } });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => document.querySelectorAll('.label-layer .lbl').forEach((e) => (e.style.display = v ? '' : 'none')) });
ui.buttons([
  { label: '🔭 Genel', onClick: () => sim.moveCamera(...VIEWS.wide) },
  { label: '🌊 Kıyıya yakın', onClick: () => sim.moveCamera(...VIEWS.coast) },
  { label: '🧊 Buzul', onClick: () => sim.moveCamera(...VIEWS.glacier) },
]);

sim.onUpdate((dt) => {
  if (!playing) return;
  const y = (yearF = Math.min(Y1, yearF + dt * 12));
  year.set(Math.round(y));
  update();
  if (y >= Y1) { playing = false; sim.toast('2300 yılına ulaşıldı'); }
});
let tW = 0;
sim.onRender((real) => { tW += real; veg.update(tW, 0.6); });

// Binaya tıkla → bilgi
sim.onClick([city], (hit) => {
  const b = blds[blockOf[hit.faceIndex]];
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
