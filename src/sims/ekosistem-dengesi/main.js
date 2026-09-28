// Ekosistem Dengesi — ot, geyik ve kurttan oluşan ajan tabanlı besin zinciri; trofik çağlayan ve Yellowstone hikâyesi.
import { createSim, THREE, BufferGeometryUtils, fmt, instanced, rand, seeded, lerp, smoothstep, landscape, createTerrain, terrainSkirt, terrainMaterial, depthTexture, createVegetation, procedural } from '@core';
import { treeGeometry, leafMat, barkMat } from './kit.js';
import { createModel, W, HALF, MAXD, MAXW, riverX } from './model.js';

const sim = createSim({
  sky: { elevation: 21, azimuth: 128, clouds: 0.35, haze: 1.3, visibility: 14000, wind: [3, -2] },
  ocean: { wind: 2, windDir: 180, fetch: 1, chop: 0.3, foam: 0, radius: 9000, deep: 0x0b2a2c, sss: 0x1d5448, sand: 0x4a4636 }, // nehir/göl: koyu, yeşilimsi tatlı su
  camera: { position: [44, 4.2, 97], target: [-6, 1.6, 34], fov: 46, near: 0.5, far: 90000 },
  controls: { maxDistance: 900, minDistance: 6, maxPolarAngle: 1.5 },
  shadows: true,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>200 m × 200 m'lik vadi tabanında <b>ot</b> büyür (yeşil ve uzun = gür, kısa ve kahverengi = yenmiş). <b>Geyikler</b>
    (wapiti, kahverengi) otu yer, enerji toplar ve yavrular. <b>Kurtlar</b> (gri) geyik avlar. Nehir kıyısındaki <b>söğüt fidanları</b> geyikler yoğunken kemirilip kısalır.
    Her hayvan kendi başına basit kurallarla hareket eder; nüfus dalgaları bu kurallardan kendiliğinden doğar.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Kurtları çıkar</b>: geyikler çoğalır, otlar ve söğütler yenip biter. Sonra <b>geri getir</b> ve toparlanmayı izle.</li>
      <li>"Yellowstone hikâyesi" senaryosunu başlat, grafikte üç dönemi karşılaştır.</li>
      <li><b>Kuraklık</b> başlat: önce otlar, sonra geyikler, en son kurtlar azalır — etki zincir boyunca gecikmeli yayılır.</li>
      <li>Kurtsuz vadide <b>avcılığı</b> aç: avcılar kurtların işini kısmen üstlenebilir mi?</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>ABD'deki Yellowstone Ulusal Parkı'nda kurtlar 1920'lerde avlanarak yok edildi. Sonraki on yıllarda geyik (wapiti)
    sayısı arttı; nehir kıyısındaki söğüt ve kavak fidanları aşırı otlatmadan zarar gördü. 1995–1996'da Kanada'dan getirilen
    kurtlar parka bırakıldı; ardından geyik sayısı azaldı ve bazı bölgelerde söğütler yeniden boy attı. Bir yırtıcının
    bitkilere kadar uzanan bu zincirleme etkisine <b>trofik çağlayan</b> denir. Bilim insanları etkinin büyüklüğünü hâlâ
    tartışıyor: iklim, ayılar, pumalar ve insan avcılığı da rol oynadı.</p>
    <h3>Model</h3>
    <p>Ajan tabanlı Lotka–Volterra benzeri model: av–avcı döngüleri, otun sınırlı olması ve kurtların bölge savunması
    (kalabalıkta daha az yavru) sayesinde sönümlenmeden sürer. Zayıf, çok genç ya da yaşlı geyikler daha kolay yakalanır.
    Kurt azken geyiklerin nehir kıyısında daha rahat otlaması "korku manzarası" fikrini basitçe temsil eder.
    Zaman sıkıştırılmıştır; sayılar gerçek Yellowstone verisi değildir. Hayvanlar ve bitkiler gerçek boyda çizilir; hayvan
    yoğunluğu ise modelin küçük alanı yüzünden gerçekteki bir vadiden çok daha yüksektir.</p>`,
});
sim.formatTime = (t) => `${Math.floor(t / 52) + 1}. yıl · ${Math.floor(t % 52) + 1}. hafta`;

const model = createModel();
const { D, Wf, wil, grass, water } = model;

const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
const S = 5;                    // 1 model birimi (karo) = 5 m → vadi tabanı 200 m × 200 m
const scene = sim.scene;

// --- Arazi: kuzey-güney uzanan vadi, ortasında menderesli nehir; iki yanda ormanlı yamaçlar, kuzeyde dağlar ---
const hills = landscape({ seed: 17, size: 900, height: 150, octaves: 7, warp: 0.5 });
const mtn = landscape({ seed: 4, size: 5200, height: 1500, octaves: 6, warp: 0.35 });
const rxM = (z) => riverX(z / S) * S;                                   // nehir ekseni (m)
const halfW = (z) => lerp(5.5, 14, smoothstep(450, 1000, Math.abs(z))); // nehir yarı genişliği (m)
// vadi tabanı: hafif dalgalı çayır (geniş kabarıklar + birkaç metrelik tümsekler)
function floorH(x, z) {
  return 1.0 + 0.22 * Math.sin(x * 0.05 + 1) * Math.cos(z * 0.043) + 0.12 * Math.sin(x * 0.13 + z * 0.09) + 0.14 * Math.sin(x * 0.41 + z * 0.23) * Math.sin(z * 0.37 - x * 0.19)
    + 0.28 * Math.sin(x * 0.21 + z * 0.06 + 2.0) * Math.cos(z * 0.17 - x * 0.08) + 0.1 * Math.sin(x * 0.57 - z * 0.33) * Math.cos(x * 0.31 + z * 0.49); // 10–30 m'lik hafif kabarık ve çukurlar
}
const LAKE = [14, -250, 78, 58];                                       // göl merkezi ve yarıçapları (m)
const lakeQ = (x, z) => ((x - LAKE[0]) / LAKE[2]) ** 2 + ((z - LAKE[1]) / LAKE[3]) ** 2 + 0.12 * Math.sin(x * 0.05 + 1.3) * Math.cos(z * 0.06);
function hW(x, z) {
  let h = floorH(x, z);
  const d = Math.abs(x - rxM(z)), hw = halfW(z);
  h = lerp(-1.7, h, smoothstep(hw - 1.5, hw + 3.5, d));
  // Vadinin kuzeyinde nehrin genişleyip oluşturduğu göl (modelin 200 m × 200 m alanının dışında; yalnız görsel)
  const lq = lakeQ(x, z);
  if (lq < 1.3) h = lerp(-3.2, h, smoothstep(0.72, 1.05, lq));
  const e = Math.max(0, Math.abs(x) - 140);
  if (e > 0) h += 130 * Math.pow(smoothstep(0, 700, e), 1.3) + (hills(x, z) + 55) * 0.8 * smoothstep(0, 260, e);
  const wm = smoothstep(2600, 8000, Math.hypot(x, z * 0.8));
  if (wm > 0) h += Math.max(0, mtn(x, z) + 350) * wm;
  return h;
}
const onFloor = (x, z) => floorH(x, z);

// Karo durumu dokusu: R ot miktarı (0–1), G su
const gData = new Uint8Array(W * W * 4);
const gTex = new THREE.DataTexture(gData, W, W, THREE.RGBAFormat);
gTex.magFilter = gTex.minFilter = THREE.LinearFilter;
const GU = { uG: { value: gTex }, uDry: { value: 0 } };
function valleyMaterial() {
  const m = terrainMaterial({ water: -1.2, forest: 0.85, grass: 0x6b7a38, dry: 0xa39562, soil: 0x6d5a40, forestCol: 0x243a1e, rock: 0x77716a, snow: 2300 });
  const orig = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    orig(sh, r);
    Object.assign(sh.uniforms, GU);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uG; uniform float uDry;')
      .replace('diffuseColor.rgb = c;', /* glsl */ `diffuseColor.rgb = c;
        {
          vec2 gu = vTW.xz/${S.toFixed(1)} + ${HALF.toFixed(1)};
          vec2 guv = gu/${W.toFixed(1)};
          // model alanının kenarı 2 karo boyunca yumuşak geçer (keskin kare sınır görünmesin)
          vec2 eg = min(guv, 1.0 - guv)*${W.toFixed(1)};
          float inA = smoothstep(-0.5, 2.0, min(eg.x, eg.y));
          float g = mix(0.75, texture2D(uG, clamp(guv, 0.0, 1.0)).r, inA);
          float valley = 1.0 - smoothstep(150.0, 230.0, abs(vTW.x));
          // Taban: motorun arazi çimi (c — yamaçlarla aynı malzeme). Üstüne çayırın orta ve yakın ölçek yapısı biner.
          float md = fbm3(tP*0.07, 3), fn = vn3(tP*1.6);
          float patchy = fbm3(tP*0.045 + 11.0, 3);          // 10–30 m: nemli koyu yeşil ↔ açık sarımsı tür lekeleri
          float blot = vn3(tP*0.33 + 4.0);                  // ~3 m sararmış öbekler
          float nearC = 1.0 - smoothstep(18.0, 110.0, length(vViewPosition));
          float clump = 0.6;
          if (nearC > 0.001) clump = tCrown(tP.xz*1.7);     // ~0,6 m ot kümeleri (kök arası gölge), yalnız yakında
          vec3 m = c*mix(vec3(0.66, 0.78, 0.56), vec3(1.14, 1.08, 0.92), smoothstep(0.28, 0.72, patchy));
          m = mix(m, m*vec3(1.3, 1.12, 0.7), smoothstep(0.6, 0.85, blot)*0.55);
          // model durumu: kemirilmiş karolar kısa ve zeytin-kahve (yer yer çıplak toprak), kuraklıkta saman
          vec3 grazed = mix(vec3(0.27, 0.25, 0.11), vec3(0.24, 0.18, 0.11), smoothstep(0.55, 0.8, fn))*(0.85 + 0.3*md);
          vec3 dryc = vec3(0.55, 0.46, 0.25)*(0.85 + 0.3*md);
          vec3 v = mix(grazed, m, smoothstep(0.1, 0.85, g + 0.25*(blot - 0.5)));
          v = mix(v, dryc, uDry*smoothstep(0.1, 0.6, g));
          v *= mix(1.0, 0.6 + 0.6*clump, nearC);
          v = mix(v, vec3(0.55, 0.52, 0.32), step(0.94, vn3(tP*29.0))*0.3*g*nearC);  // yonca/çiçek benekleri
          // kıyı: ıslak çamur ve çakıl
          float bank = 1.0 - smoothstep(-0.1, 0.4, tH);
          v = mix(v, mix(vec3(0.3, 0.26, 0.2), vec3(0.5, 0.47, 0.42), step(0.6, fn)), bank);
          diffuseColor.rgb = mix(c, v, valley);
        }`);
  };
  m.customProgramCacheKey = () => 'eko-valley';
  return m;
}
const valMat = valleyMaterial();
const PA = { c: [0, 0], s: [340, 1700] }, PB = { c: [0, 0], s: [1500, 7200] };
const inRect = (P, x, z, m) => Math.min(smoothstep(P.s[0] / 2, P.s[0] / 2 - m, Math.abs(x - P.c[0])), smoothstep(P.s[1] / 2, P.s[1] / 2 - m, Math.abs(z - P.c[1])));
scene.add(createTerrain(hW, { size: PA.s, center: PA.c, res: LOW ? [110, 400] : [226, 850], material: valMat }));
scene.add(createTerrain((x, z) => hW(x, z) - 1.5 * inRect(PA, x, z, 20), { size: PB.s, center: PB.c, res: LOW ? [80, 320] : [150, 720], material: valMat }));
scene.add(createTerrain((x, z) => hW(x, z) - 3 * inRect(PB, x, z, 60), { size: [36000, 36000], res: LOW ? [140, 140] : [300, 300], material: valMat }));
scene.add(terrainSkirt(hW, { inner: 17000, outer: 90000, material: valMat }));
sim.ocean.setDepth(depthTexture(hW, [-750, -3600, 750, 3600], 384), [-750, -3600, 750, 3600]);
const veg = createVegetation(hW, {
  rect: LOW ? [-1000, -1900, 1000, 1300] : [-2600, -4200, 2600, 3200], trees: LOW ? 3500 : 14000, shrubs: LOW ? 900 : 4000, rocks: 250, seed: 12,
  kinds: { pine: 0.75, broad: 0.15, cypress: 0.1 }, leafA: 0x22391c, leafB: 0x445a26,
  forest: (x, z) => (Math.abs(x) < 190 ? 0 : 0.35 + 0.5 * smoothstep(190, 500, Math.abs(x)) * (0.6 + 0.4 * Math.sin(x * 0.004 + z * 0.003))),
});
scene.add(veg.group);
// Ön plan: kameranın önündeki çayırda kaya blokları ve çalı öbekleri (yalnız görsel; modeli değiştirmez)
const vegNear = createVegetation(hW, {
  rect: [-20, 40, 100, 120], near: [40, 80, 30], trees: LOW ? 14 : 30, shrubs: LOW ? 45 : 90, rocks: LOW ? 60 : 110, seed: 31, water: -1.75,
  kinds: { broad: 1 }, leafA: 0x3b5626, leafB: 0x7d8a3c, forest: () => 0.6,       // kıyıda birkaç kavak, çalı ve kaya
});
scene.add(vegNear.group);
// Kameranın önündeki sık çayır otu (nehir yatağı hariç)
const meadow = createVegetation((x, z) => { const h = hW(x, z); return h < floorH(x, z) - 0.2 ? -100 : h; }, {
  rect: [-20, 40, 100, 120], trees: 0, shrubs: 0, rocks: 0, water: -50, seed: 33,
  grass: LOW ? 36000 : 70000, grassAt: [36, 82, 40], grassFar: 75, grassA: 0x3d4c1a, grassB: 0x9c9650,
});
scene.add(meadow.group);
// Çayır otu yamaçlardaki kısa çimden uzun (0,5–1,1 m): yakın planda tek tek saplar okunur
meadow.group.traverse((o) => {
  if (o.name !== 'gfx:grass') return;
  const m = new THREE.Matrix4(), sc = new THREE.Matrix4().makeScale(1.25, 1.6, 1.25);
  for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); o.setMatrixAt(i, m.multiply(sc)); }
  o.instanceMatrix.needsUpdate = true;
});

// --- Ot öbekleri: her karoda birkaç öbek; boyu karonun ot miktarına göre ---
const NT = W * W, PER = LOW ? 5 : 10;
const tuftGeo = (() => {
  const gs = [];
  for (let b = 0; b < 7; b++) {
    const g = new THREE.PlaneGeometry(0.05, 0.6, 1, 3), p = g.attributes.position;
    const col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 0.3, t = y / 0.6;
      p.setXYZ(i, p.getX(i) * (1 - t * 0.9), y, 0.12 * t * t);
      const c = 0.45 + 0.6 * t; col.set([c, c, c], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.rotateX(-0.15 - Math.random() * 0.25); g.rotateY(b * 0.9 + Math.random() * 0.5);
    g.translate((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.12);
    gs.push(g);
  }
  return BufferGeometryUtils.mergeGeometries(gs);
})();
const tuftMat = procedural({
  key: 'eko-tuft', params: { color: 0xffffff, roughness: 0.85, vertexColors: true, side: THREE.DoubleSide },
  pattern: 'col *= 0.8 + 0.4*vn3(p*3.0 + seed*9.0);',
});
const tufts = instanced(tuftGeo, tuftMat, NT * PER);
tufts.frustumCulled = false;
tufts.userData.noCast = true;
scene.add(tufts);
// Göl kıyısı sazlığı (kamış/saz öbekleri, 1,2–2 m)
{
  const RN = LOW ? 1400 : 3200, reeds = instanced(tuftGeo, procedural({
    key: 'eko-reed', params: { color: 0x7d8a44, roughness: 0.8, vertexColors: true, side: THREE.DoubleSide },
    pattern: 'col *= 0.75 + 0.45*vn3(p*2.0 + seed*9.0); col = mix(col, col*vec3(1.25, 1.1, 0.7), smoothstep(1.0, 1.8, p.y + 0.3*vn3(p*4.0)));',
  }), RN);
  const r = seeded(61), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), Yv = new THREE.Vector3(0, 1, 0);
  let k = 0;
  for (let i = 0; i < RN * 4 && k < RN; i++) {
    const a = r() * 6.283, rr = 0.86 + r() * 0.2, x = LAKE[0] + Math.cos(a) * LAKE[2] * Math.sqrt(rr), z = LAKE[1] + Math.sin(a) * LAKE[3] * Math.sqrt(rr);
    const h = hW(x, z);
    if (h < -0.6 || h > 1.6) continue;
    const sc = 2.2 + r() * 1.4;
    m4.compose(v.set(x, Math.max(h, -0.2) - 0.05, z), q.setFromAxisAngle(Yv, r() * 6.28), s.set(sc * 0.8, sc, sc * 0.8));
    reeds.setMatrixAt(k++, m4);
  }
  reeds.count = k; reeds.userData.noCast = true; reeds.receiveShadow = true;
  scene.add(reeds);
}
const tuftPos = new Float32Array(NT * PER * 4);
{
  const r = seeded(21);
  for (let i = 0; i < NT; i++) for (let k = 0; k < PER; k++) {
    const x = (i % W - HALF + r()) * S, z = (((i / W) | 0) - HALF + r()) * S, o = (i * PER + k) * 4;
    tuftPos[o] = x; tuftPos[o + 1] = onFloor(x, z); tuftPos[o + 2] = z; tuftPos[o + 3] = r() * 6.28;
  }
}
const cLush = new THREE.Color(0x5e7a2c), cGrazed = new THREE.Color(0x8a7a52), cDry = new THREE.Color(0xb7a060);
const tc = new THREE.Color(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function drawTiles() {
  const dry = model.drought > 0 ? 0.55 : 0;
  GU.uDry.value += (dry - GU.uDry.value) * 0.2;
  for (let i = 0; i < NT; i++) {
    gData[i * 4] = water[i] ? 0 : Math.round(grass[i] * 255);
    gData[i * 4 + 1] = water[i] ? 255 : 0;
    const g = water[i] ? 0 : grass[i];
    tc.copy(cGrazed).lerp(cLush, Math.min(1, g * 1.15));
    if (dry) tc.lerp(cDry, dry * g);
    for (let k = 0; k < PER; k++) {
      const j = i * PER + k, o = j * 4;
      // Su karolarındaki öbekler gizlenir. Ölçek asla 0 olmaz: sıfır y-ölçeği örnek normal matrisinde 0'a bölme yapar,
      // NaN normal → NaN piksel → bloom tüm kareyi karartır (eski siyah ekranın nedeni). Bunun yerine küçültülüp zemine gömülür.
      const sc = water[i] ? 0.01 : 0.12 + g * (0.75 + 0.35 * ((k * 7) % 5) / 5);
      _m.compose(_v.set(tuftPos[o], tuftPos[o + 1] - (water[i] ? 3 : 0.03), tuftPos[o + 2]), _q.setFromEuler(_e.set(0, tuftPos[o + 3], 0)), water[i] ? _s.setScalar(0.01) : _s.set(1.8, sc * 1.2, 1.8));
      tufts.setMatrixAt(j, _m);
      tufts.setColorAt(j, tc);
    }
  }
  gTex.needsUpdate = true;
  tufts.instanceMatrix.needsUpdate = true;
  tufts.instanceColor.needsUpdate = true;
}

// Söğüt fidanları (nehir kıyısı): çok gövdeli çalı; boy 0,5–4 m, kemirilince yaprağı azalır
const wg = treeGeometry('shrub', 4);
const willowCrown = instanced(wg.crown, leafMat(0xffffff), wil.x.length);
const willowTrunk = instanced(wg.trunk, barkMat(0x6b4a2e), wil.x.length);
willowTrunk.frustumCulled = willowCrown.frustumCulled = false;
scene.add(willowTrunk, willowCrown);
const cBare = new THREE.Color(0x7a5c3e), cLeaf = new THREE.Color(0x8fb35a);
function drawWillows() {
  for (let k = 0; k < wil.n; k++) {
    const hh = wil.h[k], s = 0.4 + hh * 2.6;
    const x = wil.x[k] * S, z = wil.z[k] * S;
    _m.compose(_v.set(x, onFloor(x, z) - 0.05, z), _q.setFromEuler(_e.set(0, k * 2.3, 0)), _s.set(s * (0.5 + hh * 0.6), s, s * (0.5 + hh * 0.6)));
    willowTrunk.setMatrixAt(k, _m);
    willowCrown.setMatrixAt(k, _m);
    tc.copy(cBare).lerp(cLeaf, Math.min(1, hh * 1.3));
    willowCrown.setColorAt(k, tc);
  }
  willowTrunk.count = willowCrown.count = wil.n;
  willowTrunk.instanceMatrix.needsUpdate = willowCrown.instanceMatrix.needsUpdate = true;
  willowCrown.instanceColor.needsUpdate = true;
}

// --- Hayvan modelleri (gerçek boy, +x yönüne bakar): wapiti (≈2,4 m, omuz ≈1,45 m) ve kurt (≈1,5 m + kuyruk, omuz ≈0,8 m) ---
// Gövde, boyun ve baş tek parça "loft": omurga boyunca eliptik kesitler (Catmull-Rom ile yumuşatılır); bacaklar eklemli
// (dirsek/diz, bilek, topuk, toynak/pati) konik loftlar. Renkler köşe rengiyle: wapitide koyu boyun ve yele, açık sağrı lekesi.
const RING = LOW ? 10 : 14;
function loft(ctrl, { sub = 4, col, ring = RING, cap = true } = {}) {
  // ctrl: [[x, y, z, ry, rz], …]
  const P = ctrl.map((c) => new THREE.Vector3(c[0], c[1], c[2]));
  const curve = new THREE.CatmullRomCurve3(P, false, 'centripetal');
  const n = (ctrl.length - 1) * sub, pos = [], cols = [], idx = [];
  const rr = (u) => { const f = u * (ctrl.length - 1), i = Math.min(ctrl.length - 2, Math.floor(f)), t = f - i, s = t * t * (3 - 2 * t); return [ctrl[i][3] + (ctrl[i + 1][3] - ctrl[i][3]) * s, ctrl[i][4] + (ctrl[i + 1][4] - ctrl[i][4]) * s]; };
  const T = new THREE.Vector3(), N = new THREE.Vector3(), c3 = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPoint(u);
    curve.getTangent(u, T);
    N.set(-T.y, T.x, 0); if (N.lengthSq() < 1e-6) N.set(0, 1, 0); N.normalize();
    const [ry, rz] = rr(u);
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      const x = p.x + N.x * ca * ry, y = p.y + N.y * ca * ry, z = p.z + sa * rz;
      pos.push(x, y, z);
      col(x, y, z, ca, c3); cols.push(c3.r, c3.g, c3.b);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < ring; j++) {
    const a = i * ring + j, b = i * ring + (j + 1) % ring, c = a + ring, d = b + ring;
    idx.push(a, b, c, b, d, c);
  }
  if (cap) for (const [i0, flip] of [[0, true], [n, false]]) {
    const ctr = curve.getPoint(i0 / n), k = pos.length / 3;
    pos.push(ctr.x, ctr.y, ctr.z); col(ctr.x, ctr.y, ctr.z, 0, c3); cols.push(c3.r, c3.g, c3.b);
    for (let j = 0; j < ring; j++) { const a = i0 * ring + j, b = i0 * ring + (j + 1) % ring; if (flip) idx.push(k, b, a); else idx.push(k, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g.toNonIndexed();
}
const hexC = (h) => new THREE.Color(h);
function paint(g, col) {
  const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  if (g.index) { const ng = g.toNonIndexed(); g.dispose(); g = ng; }
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
function ear(x, y, z, len, w, tilt, col) {
  const g = new THREE.ConeGeometry(w, len, 6, 1).scale(1, 1, 0.35).rotateZ(tilt).translate(x, y, z);
  return paint(g, col);
}
function deerGeometry() {
  const body = hexC(0xa27a4e), dark = hexC(0x4a3322), rump = hexC(0xe0cfa6), belly = hexC(0x5e4430), leg = hexC(0x3a2a1e);
  const bodyCol = (x, y, z, ca, out) => {
    out.copy(body);
    out.lerp(dark, smoothstep(0.45, 0.75, x));                                 // koyu boyun ve yele
    out.lerp(belly, smoothstep(-0.2, -0.75, ca) * smoothstep(0.7, -0.2, x) * 0.7); // koyu karın
    out.lerp(rump, smoothstep(-0.68, -0.9, x) * smoothstep(-0.6, 0.3, ca));    // açık sağrı lekesi
    out.multiplyScalar(0.92 + 0.08 * Math.sin(x * 23 + y * 17));
  };
  const parts = [loft([
    [-1.02, 1.3, 0, 0.05, 0.05], [-0.92, 1.3, 0, 0.28, 0.22], [-0.66, 1.27, 0, 0.4, 0.3], [-0.25, 1.22, 0, 0.41, 0.31],
    [0.2, 1.26, 0, 0.44, 0.3], [0.52, 1.36, 0, 0.4, 0.25], [0.78, 1.62, 0, 0.25, 0.17], [0.96, 1.86, 0, 0.18, 0.13],
    [1.12, 1.98, 0, 0.15, 0.11], [1.3, 1.94, 0, 0.12, 0.095], [1.47, 1.84, 0, 0.08, 0.07], [1.56, 1.8, 0, 0.03, 0.03],
  ], { col: bodyCol, sub: 5 })];
  const legCol = (c0) => (x, y, z, ca, out) => { out.copy(c0).lerp(leg, smoothstep(0.9, 0.5, y)); if (y < 0.07) out.set(0.08, 0.07, 0.06); };
  for (const s of [1, -1]) {
    const z = s * 0.17;
    parts.push(loft([[0.48, 1.3, z, 0.15, 0.1], [0.5, 0.98, z * 1.05, 0.1, 0.075], [0.47, 0.52, z, 0.05, 0.045], [0.5, 0.14, z, 0.04, 0.035], [0.54, 0.02, z, 0.05, 0.04]], { col: legCol(body), sub: 4 }));
    parts.push(loft([[-0.62, 1.22, z, 0.24, 0.12], [-0.46, 0.84, z * 1.05, 0.12, 0.08], [-0.7, 0.52, z, 0.055, 0.045], [-0.64, 0.14, z, 0.04, 0.035], [-0.6, 0.02, z, 0.05, 0.04]], { col: legCol(body), sub: 4 }));
    parts.push(ear(1.08, 2.13, s * 0.1, 0.2, 0.06, -s * 0.25 + 0.45, 0x5a4230));
    parts.push(paint(new THREE.SphereGeometry(0.022, 6, 5).translate(1.24, 2.0, s * 0.085), 0x050505));
  }
  parts.push(paint(new THREE.ConeGeometry(0.05, 0.14, 6).rotateZ(Math.PI * 0.62).translate(-1.02, 1.26, 0), 0x6a5238));
  return BufferGeometryUtils.mergeGeometries(parts);
}
function wolfGeometry() {
  const grey = hexC(0x857c70), dark = hexC(0x3e3934), pale = hexC(0xcfc5b2), tawny = hexC(0x9a8566);
  const bodyCol = (x, y, z, ca, out) => {
    out.copy(grey);
    out.lerp(dark, smoothstep(0.55, 0.95, ca) * smoothstep(-0.6, 0.1, x) * 0.7);   // koyu sırt eyeri
    out.lerp(pale, smoothstep(-0.2, -0.8, ca));                                  // açık karın ve boğaz
    out.lerp(tawny, smoothstep(0.55, 0.8, x) * smoothstep(0.3, -0.3, ca) * 0.5); // yanaklar
    if (x > 0.92) out.lerp(dark, 0.7);                                           // burun
    out.multiplyScalar(0.9 + 0.1 * Math.sin(x * 31 + z * 19));
  };
  const parts = [loft([
    [-0.6, 0.66, 0, 0.12, 0.1], [-0.4, 0.65, 0, 0.17, 0.14], [-0.1, 0.63, 0, 0.18, 0.14], [0.2, 0.68, 0, 0.22, 0.15],
    [0.4, 0.76, 0, 0.19, 0.13], [0.55, 0.86, 0, 0.14, 0.11], [0.68, 0.92, 0, 0.12, 0.1], [0.8, 0.9, 0, 0.08, 0.075],
    [0.92, 0.86, 0, 0.05, 0.045], [0.99, 0.85, 0, 0.018, 0.018],
  ], { col: bodyCol, sub: 5 })];
  // gür kuyruk
  parts.push(loft([[-0.56, 0.68, 0, 0.05, 0.05], [-0.72, 0.6, 0, 0.08, 0.075], [-0.9, 0.45, 0, 0.075, 0.07], [-1.02, 0.34, 0, 0.02, 0.02]],
    { col: (x, y, z, ca, out) => { out.copy(grey).lerp(dark, smoothstep(-0.85, -1.0, x)); }, sub: 4 }));
  const legCol = (x, y, z, ca, out) => { out.copy(grey).lerp(pale, smoothstep(0.55, 0.25, y)); if (y < 0.05) out.lerp(dark, 0.6); };
  for (const s of [1, -1]) {
    const z = s * 0.085;
    parts.push(loft([[0.36, 0.7, z, 0.09, 0.06], [0.37, 0.42, z, 0.045, 0.04], [0.35, 0.12, z, 0.03, 0.03], [0.39, 0.025, z, 0.04, 0.035]], { col: legCol, sub: 4 }));
    parts.push(loft([[-0.42, 0.66, z, 0.13, 0.07], [-0.32, 0.42, z, 0.06, 0.045], [-0.48, 0.22, z, 0.035, 0.03], [-0.45, 0.025, z, 0.04, 0.035]], { col: legCol, sub: 4 }));
    parts.push(ear(0.66, 1.04, s * 0.06, 0.12, 0.045, -s * 0.12, 0x3e3934));
    parts.push(paint(new THREE.SphereGeometry(0.014, 6, 5).translate(0.8, 0.95, s * 0.058), 0xd8a030));
  }
  return BufferGeometryUtils.mergeGeometries(parts);
}
const furMat = (key) => procedural({
  key, bump: 0.03, params: { color: 0xffffff, roughness: 0.92, vertexColors: true },
  pattern: 'float f = fbm3(p*vec3(9.0, 22.0, 9.0) + seed*7.0, 3), s = vn3(vec3(p.x*40.0, p.y*160.0, p.z*40.0)); col *= 0.82 + 0.25*f + 0.08*(s - 0.5); col *= 0.92 + 0.16*seed; h = s*0.6 + f*0.4;',
});
const deerMesh = instanced(deerGeometry(), furMat('eko-fur-d'), MAXD);
// Boynuz (erkek wapiti; sürünün yaklaşık üçte biri): iki ana kol geriye kıvrılır, öne bakan 4 çatal
function antlerGeometry() {
  const parts = [], Yv = new THREE.Vector3(0, 1, 0);
  const seg = (a, b, r0, r1, col) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
    const g = new THREE.CylinderGeometry(r1, r0, L, 6, 1).translate(0, L / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Yv, d.normalize())); g.translate(A.x, A.y, A.z);
    parts.push(paint(g, col));
  };
  const base = 0x7d6a4e, tip = 0xd6cbb2;
  for (const s of [1, -1]) {
    const P = [[1.2, 2.0, 0.07 * s], [1.08, 2.32, 0.2 * s], [0.86, 2.58, 0.32 * s], [0.58, 2.76, 0.38 * s], [0.34, 2.84, 0.33 * s]];
    for (let i = 0; i < P.length - 1; i++) seg(P[i], P[i + 1], 0.038 - i * 0.006, 0.032 - i * 0.006, i < 3 ? base : tip);
    seg(P[1], [1.4, 2.34, 0.24 * s], 0.024, 0.01, tip);
    seg(P[1], [1.3, 2.52, 0.26 * s], 0.022, 0.01, tip);
    seg(P[2], [1.06, 2.9, 0.36 * s], 0.02, 0.009, tip);
    seg(P[3], [0.76, 3.02, 0.42 * s], 0.018, 0.008, tip);
  }
  return BufferGeometryUtils.mergeGeometries(parts);
}
const antlerMesh = instanced(antlerGeometry(), furMat('eko-antler'), MAXD);
antlerMesh.frustumCulled = false;
scene.add(antlerMesh);
function drawAntlers() {
  const src = deerMesh.instanceMatrix.array, dst = antlerMesh.instanceMatrix.array;
  let j = 0;
  for (let i = 0; i < D.n; i++) if (i % 3 === 0 && D.age[i] > 12) { dst.set(src.subarray(i * 16, i * 16 + 16), j * 16); j++; }
  antlerMesh.count = j;
  antlerMesh.instanceMatrix.needsUpdate = true;
}
const wolfMesh = instanced(wolfGeometry(), furMat('eko-fur-w'), MAXW);
deerMesh.frustumCulled = wolfMesh.frustumCulled = false;
scene.add(deerMesh, wolfMesh);

const camP = sim.camera.position;
function drawAnimals(S_, mesh, base) {
  const m = mesh.instanceMatrix.array;
  for (let i = 0; i < S_.n; i++) {
    const c = Math.cos(S_.a[i]), s = Math.sin(S_.a[i]);
    // boy: yaşla büyür; üç boy grubu (erkekler — boynuzlular, i % 3 = 0 — en iri)
    const k = base * (0.55 + 0.45 * Math.min(1, S_.age[i] / 10)) * (i % 3 === 0 ? 1.08 : i % 3 === 1 ? 0.93 : 1), o = i * 16;
    const x = S_.x[i] * S, z = S_.z[i] * S;
    // kameraya 10 m'den yakın hayvan gizlenir (ekranı kaplayan yarım gövde görünmesin); ölçek sıfırlanmaz, yer altına alınır
    const near = Math.hypot(x - camP.x, z - camP.z) < 10;
    m[o] = c * k; m[o + 1] = 0; m[o + 2] = s * k; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = k; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = -s * k; m[o + 9] = 0; m[o + 10] = c * k; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = near ? -60 : Math.max(hW(x, z), -0.9) - 0.04; m[o + 14] = z; m[o + 15] = 1;
  }
  mesh.count = S_.n;
  mesh.instanceMatrix.needsUpdate = true;
}

// Etiketler
const labels = [
  sim.label('🌊 Nehir', { position: [rxM(-(HALF - 3) * S), 6, -(HALF - 3) * S], className: 'plain' }),
  sim.label('🌿 Söğüt fidanları', { position: [rxM(8 * S) + 15, 9, 8 * S] }),
];

// --- Olaylar ---
let story = null; // Yellowstone senaryosu adımları
function setWolves(on, announce = true) {
  model.p.wolvesOn = on;
  if (!on) {
    model.removeWolves();
    if (announce) sim.toast('🐺 Kurtlar vadiden çıkarıldı', 'bad');
  } else {
    for (let i = 0; i < 14; i++) model.addWolf(rand(-6, 6), rand(-HALF + 2, -HALF + 6), 1.2, rand(10, 30));
    if (announce) sim.toast('🐺 Kurtlar vadiye geri döndü', 'good');
  }
  wolfBtn.innerHTML = on ? '🐺 Kurtları çıkar' : '🐺 Kurtları geri getir';
  wolfBtn.className = 'btn ' + (on ? 'danger' : 'good');
}
function drought() {
  model.drought = 26;
  sim.hud.show('<h2>☀️ Kuraklık!</h2>Yarım yıl boyunca yağmur yok: otlar çok yavaş büyüyor.', { timeout: 3500, tone: 'warn' });
}

const PRESETS = {
  denge: () => { model.reset(260, 22); setWolves(true, false); },
  kurtsuz: () => { model.reset(320, 0); setWolves(false, false); },
  yellowstone: () => {
    model.reset(260, 22); setWolves(true, false);
    story = [
      { t: 45, run: () => { setWolves(false, false); sim.hud.show('<h2>1920\'ler: Son kurtlar avlandı</h2>Yırtıcısı kalmayan geyikler çoğalmaya başlıyor…', { timeout: 5000, tone: 'bad' }); } },
      { t: 150, run: () => sim.hud.show('<h2>Onlarca yıl sonra…</h2>Geyikler nehir kıyısını rahatça otluyor; söğüt fidanları büyüyemiyor.', { timeout: 5000, tone: 'warn' }) },
      { t: 210, run: () => { setWolves(true, false); sim.hud.show('<h2>1995: Kurtlar geri döndü</h2>Kanada\'dan getirilen kurtlar parka bırakıldı. Bakalım ne olacak?', { timeout: 5000, tone: 'good' }); } },
      { t: 330, run: () => sim.hud.show('<h2>Trofik çağlayan</h2>Kurt → daha az geyik → daha çok ot ve söğüt. Grafiklerde üç dönemi karşılaştır!', { timeout: 6000, tone: 'good' }) },
    ];
  },
};

function load(name) {
  story = null;
  sim.hud.hide();
  model.p.hunting = hunting.value;
  PRESETS[name]();
  popChart.clear(); plantChart.clear();
  nextPush = 0; peakDeer = 0;
  drawTiles(); drawWillows(); drawAnimals(D, deerMesh, 1); drawAnimals(Wf, wolfMesh, 1);
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Senaryo');
const preset = ui.segmented({
  options: [{ value: 'denge', label: 'Dengeli vadi' }, { value: 'kurtsuz', label: 'Kurtsuz vadi' }, { value: 'yellowstone', label: 'Yellowstone hikâyesi' }],
  value: 'denge', onChange: () => { sim.reset(); sim.play(); },
});

ui.section('Olaylar');
const wolfBtn = ui.button({ label: '🐺 Kurtları çıkar', variant: 'danger', onClick: () => { story = null; setWolves(!model.p.wolvesOn); } });
ui.buttons([
  { label: '☀️ Kuraklık', variant: 'primary', onClick: drought },
  { label: '🦌 +30 geyik', onClick: () => { for (let i = 0; i < 30; i++) model.addDeer(rand(-HALF + 2, HALF - 2), rand(-HALF + 2, HALF - 2), 0.8, 15); } },
]);
const hunting = ui.toggle({ label: '🎯 Avcılık (geyik avı izni)', value: false, onChange: (v) => { model.p.hunting = v; sim.toast(v ? '🎯 Geyik avı başladı' : 'Av yasaklandı', v ? 'warn' : ''); } });

ui.section('Doğa ayarları');
ui.slider({ label: 'Geyik üreme hızı', min: 0.02, max: 0.15, step: 0.005, value: model.p.deerBirth, format: (v) => `${fmt(v * 100, 1)} % / hafta`, onChange: (v) => (model.p.deerBirth = v) });
ui.slider({ label: 'Kurt üreme hızı', min: 0.02, max: 0.16, step: 0.005, value: model.p.wolfBirth, format: (v) => `${fmt(v * 100, 1)} % / hafta`, onChange: (v) => (model.p.wolfBirth = v) });
ui.slider({ label: 'Otun yeniden büyüme hızı', min: 0.03, max: 0.3, step: 0.01, value: model.p.regrow, format: (v) => `${fmt(v / 0.14, 1)}×`, onChange: (v) => (model.p.regrow = v) });

ui.section('Durum');
const stDeer = ui.stat({ label: '🦌 Geyik' });
const stWolf = ui.stat({ label: '🐺 Kurt' });
const stGrass = ui.stat({ label: '🌱 Ot örtüsü', unit: '%' });
const stWillow = ui.stat({ label: '🌿 Söğüt boyu', unit: '%' });
const popChart = ui.chart({ title: 'Hayvan sayıları', series: [{ name: 'Geyik', color: '#d09a5c' }, { name: 'Kurt', color: '#cbd5e1' }], maxPoints: 300, yMin: 0 });
const plantChart = ui.chart({ title: 'Bitkiler (%)', series: [{ name: 'Ot', color: '#4ade80', fill: true }, { name: 'Söğüt', color: '#2dd4bf' }], maxPoints: 300, yMin: 0, yMax: 100, height: 90 });
const story_ = ui.text('', 'card');

ui.section('Görünüm', { open: false });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => labels.forEach((l) => (l.visible = v)) });
ui.buttons([
  { label: '🎥 Genel', onClick: () => sim.moveCamera([52, 9, 128], [4, 3, 6]) },
  { label: '🗺️ Tüm alan', onClick: () => sim.moveCamera([60, 48, 225], [5, 2, -10]) },
  { label: '🏞️ Göl', onClick: () => sim.moveCamera([70, 12, -150], [10, 2, -250]) },
  { label: '🔍 Nehir kıyısı', onClick: () => sim.moveCamera([rxM(20) + 38, 7, 70], [rxM(20), 1, 18]) },
  { label: '⛰️ Vadi', onClick: () => sim.moveCamera([-30, 260, 520], [0, 0, -300]) },
]);

// --- Döngü ---
let nextPush = 0, peakDeer = 0, drawTick = 0;
sim.onUpdate((dt, t) => {
  let rem = dt;
  while (rem > 1e-6) { const h = Math.min(0.1, rem); model.step(h); rem -= h; }
  if (story && story.length && t >= story[0].t) story.shift().run();
  if (t >= nextPush) {
    nextPush = Math.floor(t) + 1;
    popChart.push([D.n, Wf.n]);
    plantChart.push([model.grassCover * 100, model.willowMean * 100]);
  }
  peakDeer = Math.max(peakDeer, D.n);
});

sim.onRender(() => {
  const tt = performance.now() / 1000;
  veg.update(tt, 0.7); vegNear.update(tt, 0.7); meadow.update(tt, 0.9);
  drawAnimals(D, deerMesh, 1);
  drawAntlers();
  drawAnimals(Wf, wolfMesh, 1);
  if (drawTick++ % 3 === 0) { drawTiles(); drawWillows(); }
  if (drawTick % 10 === 1) updateStats();
});

function updateStats() {
  const g = model.grassCover * 100, wl = model.willowMean * 100;
  stDeer.set(D.n, D.n > 450 ? 'bad' : D.n < 60 ? 'warn' : '');
  stWolf.set(Wf.n, Wf.n === 0 ? 'bad' : '');
  stGrass.set(fmt(g, 0), g < 25 ? 'bad' : g > 55 ? 'good' : '');
  stWillow.set(fmt(wl, 0), wl < 25 ? 'bad' : wl > 55 ? 'good' : '');
  let msg;
  if (model.drought > 0) msg = '☀️ <b>Kuraklık:</b> ot çok yavaş büyüyor. Aç kalan geyikler zayıflıyor, kurtlar zayıf geyikleri daha kolay yakalıyor.';
  else if (!Wf.n && D.n > 300) msg = '🦌 <b>Kurt yok:</b> geyikler hızla çoğaldı; otlar ve nehir kıyısındaki söğütler yenip bitiyor. Bir yırtıcının yokluğunun bitkilere kadar yansımasına <b>trofik çağlayan</b> denir.';
  else if (!Wf.n) msg = '🦌 <b>Kurt yok:</b> geyikleri durduracak bir yırtıcı kalmadı. Sayıları artık yalnızca otun miktarına bağlı.';
  else if (Wf.n > 35 && D.n < 150) msg = '🐺 <b>Çok kurt, az geyik:</b> kurtlar yakında aç kalacak ve azalacak. Bu arada otlar yeniden gürleşiyor.';
  else if (D.n > 400) msg = '🦌 <b>Geyik patlaması:</b> otlar hızla azalıyor. Bol yiyecek bulan kurtlar da çoğalmaya başlayacak.';
  else msg = '⚖️ <b>Döngü:</b> geyik çoğalınca kurt çoğalır → geyik azalır → kurt aç kalıp azalır → ot gürleşir, geyik yeniden çoğalır…';
  story_.set(msg);
}

// Hayvana tıkla → bilgi
sim.onClick(() => { deerMesh.computeBoundingSphere(); wolfMesh.computeBoundingSphere(); return [deerMesh, wolfMesh]; }, (hit) => {
  const i = hit.instanceId;
  if (i == null) return;
  const isDeer = hit.object === deerMesh, S = isDeer ? D : Wf;
  if (i >= S.n) return;
  const e = S.e[i], age = S.age[i];
  const state = e < 0.3 ? 'aç ve zayıf' : e > 1 ? 'tok ve güçlü' : 'idare ediyor';
  sim.toast(`${isDeer ? '🦌 <b>Geyik</b>' : '🐺 <b>Kurt</b>'} · ${fmt(age, 0)} haftalık · ${state} (enerji %${fmt(Math.min(1, e / 1.4) * 100, 0)})`);
});

sim.onReset(() => load(preset.value));
load('denge');
