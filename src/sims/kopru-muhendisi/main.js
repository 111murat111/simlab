// Köprü Mühendisi — kafes köprü; doğrudan rijitlik yöntemiyle eleman kuvvetleri, kopma/burkulma ve çöküş.
import { createSim, THREE, fmt, clamp, mat, procedural, landscape, createTerrain, terrainSkirt, createVegetation, createOcean, depthTexture, RoundedBoxGeometry } from '@core';
import { truck as kitTruck } from './kit.js';
import { HALF, G, MATS, CABLE, gorgeY, buildPreset, applyDesign, buildLoads, solveTruss, totals } from './truss.js';

const ZW = 3.2;            // kafes düzlemleri z = ±ZW
const TRUCK_MIN = -HALF - 7, TRUCK_MAX = HALF + 7;
const DRIVE_V = 5;         // m/s
const TYPES = [
  { value: 'warren', label: 'Warren' }, { value: 'pratt', label: 'Pratt' }, { value: 'howe', label: 'Howe' },
  { value: 'kemer', label: 'Kemer' }, { value: 'asma', label: 'Asma' },
];

const sim = createSim({
  sky: { elevation: 33, azimuth: 158, clouds: 0.38, haze: 1.1, visibility: 5200, wind: [5, 2] },
  camera: { position: [11.5, 2.4, 31], target: [-1.2, -4.2, 0], fov: 48, near: 0.2, far: 80000 },
  controls: { maxDistance: 160, minDistance: 8, maxPolarAngle: Math.PI * 0.56 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>32 m'lik bir kanyonu geçen bir kafes köprü. Elemanlar düğümlerde mafsallıdır; yalnızca eksenleri boyunca
    <b style="color:#60a5fa">çekme</b> (mavi) ya da <b style="color:#f87171">basınç</b> (kırmızı) taşırlar. Renk ne kadar koyuysa eleman
    kapasitesine o kadar yakındır. Kuvvetler <b>doğrudan rijitlik yöntemiyle</b> (K·u = F) her karede yeniden hesaplanır;
    yük olarak kamyon, tabliye ve elemanların kendi ağırlığı kullanılır.</p>
    <ul>
      <li>Çekme kapasitesi: <b>σ·A</b> (malzeme dayanımı × kesit alanı).</li>
      <li>Basınçta ise ince uzun elemanlar ezilmeden önce <b>burkulur</b>: Euler yükü <b>P = π²·E·I / L²</b>. Uzun basınç çubukları bu yüzden zayıftır.</li>
      <li><b>Güvenlik katsayısı</b> = kapasite / etkiyen kuvvet (en zayıf eleman için). Mühendisler genellikle 1,5–2'nin üstünü hedefler.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li>Aynı kalınlıkta Pratt ile Howe'u karşılaştır: Pratt'ta uzun çaprazlar çekmede, Howe'da basınçta çalışır — hangisi daha çok yük taşıyor?</li>
      <li>Örgü kalınlığını azalt ve kamyonu geçir: önce hangi eleman burkuluyor?</li>
      <li>"Tıklayınca eleman sök" ile tek bir alt başlığı çıkar: kafes mekanizmaya dönüşür ve çöker. Kemer ve asma köprüler daha fazla yedekliğe sahiptir.</li>
      <li><b>Görev:</b> seçtiğin kamyon yükünü köprüden en düşük maliyetle geçir.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Warren, Pratt ve Howe kafesleri demiryolu ve karayolu köprülerinde yüzyılı aşkın süredir kullanılıyor. Kemer köprüler yükü
    basınçla yamaçlara aktarır; asma köprülerde ise çekmeye çalışan kablolar yükü kulelere ve ankrajlara taşır
    (ör. 15 Temmuz Şehitler ve 1915 Çanakkale köprüleri).</p>
    <p><small>Model 2B, doğrusal-elastik ve mafsallı kafestir; çökme animasyonu konum tabanlı dinamikle yaklaşık çizilir.
    Sehimler görünür olsun diye büyütülür. Fiyatlar temsilidir.</small></p>`,
});

// --- Arazi: V biçimli kanyon (köprü kesitinde gorgeY ile birebir), kıvrılan vadi, nehir, yollar, orman ---
const scene = sim.scene;
const hills = landscape({ seed: 23, size: 700, height: 120, base: -10, warp: 0.5 });
const rockN = landscape({ seed: 4, size: 18, height: 6, base: 0, warp: 0.3, octaves: 5 });
const SS = THREE.MathUtils.smoothstep;
const gorgeC = (z) => SS(Math.abs(z), 14, 70) * (11 * Math.sin(z / 43) + 5 * Math.sin(z / 17 + 1.3));
const gorgeW = (z) => HALF * (1 + 0.25 * SS(Math.abs(z), 14, 90) * Math.sin(z / 61 + 0.7));
const RIVER = -23.2;
function hf(x, z) {
  const c = gorgeC(z), w = gorgeW(z), e = w - Math.abs(x - c);
  const away = SS(Math.abs(z), 5, 22);
  let y = e <= 0 ? 0 : -Math.min(26.5, e * 3.2);   // taban su altında ≈ 3 m derin (köprü kesitinde gorgeY ile aynı yamaç)
  if (e > -3 && y > -23.5) y += (rockN(x, z) - 3) * 0.9 * away * (e > 0 ? 1 : 0.3);
  if (e < 0) {
    const d = -e;
    y += Math.max(0, hills(x, z)) * SS(d, 30, 420) * SS(Math.abs(z), 8, 40) + 1.2 * SS(d, 4, 60) * (rockN(z, x) / 6) * SS(Math.abs(z), 7, 20);
  }
  return y;
}
const land = new THREE.Group(); scene.add(land);
// Kanyon içi: ana arazi 0,5 m aşağıda; üstünü kayalık yamaç ağı örter (3B prosedürel kaya dokusu, düşey yüzde gerilmez)
const inG = (x, z) => THREE.MathUtils.smoothstep(gorgeW(z) - Math.abs(x - gorgeC(z)), -2.5, -0.5);
// Kaba arazi ağı (≈6,7 m göz) dik duvarı köşeden keser ve ince kaya ağının önüne geçer: kanyon içinde onu derine it
// (kaya ağı kenardan 9 m dışarıya kadar gerçek yükseklikte örter, yarık oluşmaz)
const dropG = (x, z) => 60 * SS(gorgeW(z) - Math.abs(x - gorgeC(z)), -1, 1.5) * SS(Math.abs(z), 345, 325);
land.add(createTerrain((x, z) => hf(x, z) - 0.5 * inG(x, z) - dropG(x, z), { size: [3000, 3000], res: [448, 448], materialOptions: { water: RIVER, grass: 0x5d6b2c, dry: 0x958a55, soil: 0x6a5238, rock: 0x857c70, forest: 0.7 } }));
// Tabakalanma: kalınlığı değişen (≈1,5–10 m), hafif eğimli (≈4°) ve kanyon boyunca dalgalanan katmanlar.
// Aynı fonksiyon hem duvar geometrisinde (sert katman çıkıntısı) hem dokuda (katman rengi) kullanılır.
const STRATA_GLSL = `float yy = p.y + 0.035*p.x + 0.07*p.z + 0.9*sin(p.z*0.023 + 0.5) + 0.4*sin(p.z*0.071 + 2.0);
      float su = yy + 1.2*sin(yy*0.31 + 0.4) + 0.35*sin(yy*1.1 + 1.7);`;
const strataU = (x, y, z) => {
  const yy = y + 0.035 * x + 0.07 * z + 0.9 * Math.sin(z * 0.023 + 0.5) + 0.4 * Math.sin(z * 0.071 + 2.0);
  return yy + 1.2 * Math.sin(yy * 0.31 + 0.4) + 0.35 * Math.sin(yy * 1.1 + 1.7);
};
const LAYER = 3.6;   // ana katman ortalama kalınlığı (su biriminde)
const hash1 = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
// Döküntü (talus) yamaçları: duvar dibinde ≈38°'lik moloz konileri; yükseklikleri kanyon boyunca değişir
function screeY(x, z) {
  const c = gorgeC(z), w = gorgeW(z), e = w - Math.abs(x - c);
  if (e <= 0) return -1e9;
  const hs = 1.6 + 5.2 * SS(0.5 + 0.5 * Math.sin(z * 0.08 + 1.3 * Math.sin(z * 0.027)) + 0.25 * Math.sin(z * 0.23), 0.25, 0.95);
  const eTop = -(RIVER + hs) / 3.2, toe = Math.min(eTop + hs / 0.78, w - 3.2);
  return RIVER + hs - (e - eTop) * hs / Math.max(0.5, toe - eTop);
}
const hfS = (x, z) => Math.max(hf(x, z), screeY(x, z));
{
  // düşey duvarda köşe örneklemesi: x yönünde 0,25 m göz (duvarda ≈0,8 m düşey), z yönünde 2 m
  // z yönünde köprü çevresinde sık (≈0,5 m: eklem/blok kırıkları okunur), uzakta seyrek (≈3 m) örnekleme
  const g = new THREE.PlaneGeometry(110, 2, 440, 560).rotateX(-Math.PI / 2), p = g.attributes.position;
  const ZK = 2.6, zmap = (u) => 350 * Math.sinh(ZK * u) / Math.sinh(ZK);
  for (let i = 0; i < p.count; i++) p.setZ(i, zmap(p.getZ(i)));
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), e = gorgeW(z) - Math.abs(x - gorgeC(z));
    const yw = hf(x, z), ys = screeY(x, z);
    let y = Math.max(yw, ys);
    if (e > 0 && yw > RIVER - 0.3) {
      // Sert katmanlar (kireçtaşı/kumtaşı) çıkıntı yapar, yumuşak katmanlar (marn/şeyl) geride kalır; çıkıntılar kanyon
      // boyunca kesik kesik (bloklar), katman sınırları yumuşak: ağ örneklemesinden ince sivri yama oluşmaz
      const u = strataU(x, yw, z) / LAYER, k = Math.floor(u), f = u - k, hard = hash1(k);
      const shelf = SS(f, 0.0, 0.22) * (1 - SS(f, 0.7, 1.0));
      const blocks = 0.35 + 0.65 * SS(Math.sin(z * 0.19 + k * 2.3) + 0.6 * Math.sin(z * 0.53 + k), -0.4, 0.5);
      const ledge = SS(hard, 0.35, 0.85) * shelf * blocks;
      // düşey eklemler (≈2–3 m aralık, her katmanda kaydırılmış): kaya bloklara ayrılır, her blok farklı çıkıntı yapar
      const jz = z * (0.36 + 0.14 * hash1(k + 0.5)) + hash1(k + 0.25) * 10 + 0.3 * Math.sin(z * 0.9 + k * 1.7), jb = Math.floor(jz), jf = jz - jb;
      const joint = 1 - SS(Math.abs(jf - 0.5), 0.36, 0.48);
      const blockOut = (hash1(k * 17.3 + jb * 3.1) - 0.3) * 0.45 * (0.4 + 0.6 * hard);
      const sx = Math.sign(x - gorgeC(z));
      const flute = 0.3 * Math.sin(z * 0.75 + 2 * Math.sin(yw * 0.3));
      // yalnız içe (kanyona doğru) it: dışa itilen yüz, arkadaki kaba arazi ağının iri üçgenlerini açığa çıkarıyordu
      let disp = 0.2 + 1.05 * ledge + Math.max(0, blockOut) * joint + 0.12 * (0.5 + 0.5 * Math.sin(z * 0.37 + yw * 0.7)) + 0.35 * (flute + 0.3) * (1 - 0.6 * ledge);
      disp = Math.max(0.05, disp - 0.25 * (1 - joint));
      disp *= 1 - SS(ys - yw, 0.0, 0.8);   // moloz yamacının altında kalan duvar itilmez
      p.setX(i, x - sx * disp * THREE.MathUtils.smoothstep(e, 0.3, 2));
    }
    p.setY(i, e > -1.5 ? y : e > -9 ? y + 0.04 : y - 3);   // kenar şeridi araziyi biraz aşar (z-savaşı yok), dışı araziye gömülür
  }
  g.computeVertexNormals();
  // Tabakalı kaya dokusu: her ana katmanın kendi rengi/sertliği (krem ve gri kireçtaşı, okra kumtaşı, kızıl, koyu şeyl),
  // içlerinde ince laminalar, katman dokanaklarında koyu çizgi; yağmur izi (çöl verniği), ıslak taban, moloz yamacı,
  // çıkıntı üstlerinde yosun/çalı ve kenar üstünde toprak-çim
  const cliffMat = procedural({
    key: 'kopru-cliff3', bump: 0.1, params: { color: 0xa39682, roughness: 0.92 },
    pattern: `
      float n = fbm3(p*0.35, 5), f = fbm3(p*2.2, 4), c = cells3(p*1.7), gr = vn3(p*14.0);
      ${STRATA_GLSL}
      su += (n - 0.5)*0.5;
      float uu = su/${LAYER.toFixed(2)}, k = floor(uu), fr = uu - k;
      float hard = fract(sin(k*127.1 + 311.7)*43758.5453), hue = fract(sin(k*71.7 + 19.3)*15731.743);
      vec3 cream = vec3(0.76, 0.70, 0.59), grey = vec3(0.60, 0.59, 0.56), ochre = vec3(0.74, 0.56, 0.37),
           red = vec3(0.63, 0.43, 0.33), shale = vec3(0.38, 0.36, 0.34), buff = vec3(0.68, 0.61, 0.49);
      vec3 hardC = hue < 0.4 ? cream : hue < 0.65 ? grey : hue < 0.85 ? ochre : buff;
      vec3 softC = hue < 0.45 ? shale : hue < 0.75 ? red : mix(shale, grey, 0.5);
      col = mix(softC, hardC, smoothstep(0.35, 0.7, hard));
      // yanal fasiyes değişimi: katman rengi kanyon boyunca yavaşça değişir
      col *= 0.9 + 0.2*fbm3(vec3(p.x*0.02, k*3.1, p.z*0.03), 3);
      // ince laminalar (yumuşak katmanlarda belirgin) ve dokanak çizgileri
      float lam = sin(su*(5.0 + 3.0*hue) + 3.0*f)*0.5 + 0.5;
      col *= 1.0 - (0.06 + 0.14*(1.0 - hard))*lam;
      float contact = 1.0 - smoothstep(0.0, 0.05, fr)*smoothstep(1.0, 0.96, fr);
      col *= 1.0 - 0.35*contact;
      // düşey eklemler ve bloklar (geometriyle aynı düzen): blok başına ton farkı, eklem çizgisi koyu
      float jz = p.z*(0.36 + 0.14*fract(sin((k + 0.5)*127.1 + 311.7)*43758.5453)) + fract(sin((k + 0.25)*127.1 + 311.7)*43758.5453)*10.0 + 0.3*sin(p.z*0.9 + k*1.7) + 0.08*(f - 0.5);
      float jb = floor(jz), jf = jz - jb;
      float jline = 1.0 - smoothstep(0.02, 0.07, min(jf, 1.0 - jf));
      col *= 0.88 + 0.22*fract(sin((k*17.3 + jb*3.1)*127.1 + 311.7)*43758.5453);
      // eklemlerin bir kısmı belirgin açık çatlak, bir kısmı kapalı kıl çatlağı; yumuşak katmanlarda daha az
      jline *= mix(0.25, 1.0, step(0.4, fract(sin((jb*7.1 + k*3.3)*127.1 + 311.7)*43758.5453)))*(0.4 + 0.6*hard);
      col *= 1.0 - 0.5*jline;
      // kırık yüzeyler: köşeli çatlak ağı
      float crk = pow(1.0 - abs(vn3(p*vec3(0.7, 1.3, 0.7))*2.0 - 1.0), 14.0);
      col *= 1.0 - 0.25*crk;
      col *= (0.78 + 0.3*f)*(0.88 + 0.16*c)*(0.9 + 0.18*gr);
      // düşey aşınma olukları ve yağmur izi (çöl verniği)
      float run = smoothstep(0.62, 0.85, vn3(vec3(p.x*5.0, p.y*0.25, p.z*5.0)));
      float streak = smoothstep(0.55, 0.8, fbm3(vec3(p.x*1.4, p.y*0.12, p.z*1.4), 3));
      col = mix(col, col*vec3(0.5, 0.46, 0.44), max(streak*0.55, run*0.4));
      // moloz yamacı: dibe yakın, orta eğimli yüzeyler; üstten düşmüş karışık renkli çakıl ve iri taş
      float scree = smoothstep(0.5, 0.75, pn.y)*(1.0 - smoothstep(${(RIVER + 5.5).toFixed(2)}, ${(RIVER + 8.5).toFixed(2)}, p.y));
      float peb = cells3(p*6.0), peb2 = cells3(p*2.3 + 7.0);
      vec3 grav = mix(vec3(0.36, 0.34, 0.31), vec3(0.52, 0.47, 0.40), vn3(p*3.1))*(0.55 + 0.6*peb)*(0.8 + 0.3*peb2);
      grav = mix(grav, grav*vec3(1.08, 0.86, 0.7), smoothstep(0.6, 0.85, vn3(p*1.3 + 5.0))*0.6);
      col = mix(col, grav, scree);
      // su çizgisine yakın ıslak, koyu kaya (yosunlu)
      float wet = 1.0 - smoothstep(${(RIVER + 0.4).toFixed(2)}, ${(RIVER + 2.8).toFixed(2)}, p.y + 0.6*f);
      col = mix(col, col*vec3(0.42, 0.45, 0.4), wet*0.85);
      // çıkıntı üstlerinde tutunan yosun/çalı
      float ledge = smoothstep(0.55, 0.85, pn.y)*smoothstep(0.35, 0.6, fbm3(p*0.9 + 3.0, 3))*(1.0 - scree);
      col = mix(col, vec3(0.22, 0.29, 0.13)*(0.8 + 0.4*gr), ledge*0.75);
      // kenar üstü: düz yüzeyde toprak ve çim, arada kaya yüzlekleri
      float top = smoothstep(0.86, 0.96, pn.y)*smoothstep(-4.0, -1.5, p.y)*smoothstep(0.3, 0.55, fbm3(p*0.25 + 11.0, 4));
      vec3 turf = mix(vec3(0.30, 0.34, 0.16), vec3(0.52, 0.48, 0.29), vn3(p*0.6))*(0.75 + 0.4*gr);
      col = mix(col, turf, top);
      h = hard*0.2 + lam*0.12 + f*0.35 + c*0.15 + gr*0.2 - run*0.3 - contact*0.25 - jline*0.4 - crk*0.3 + scree*(peb*0.6 + peb2*0.4);
      rough = mix(0.84 + 0.12*f, 0.35, wet*0.8);`,
  });
  const cliff = new THREE.Mesh(g, cliffMat);
  cliff.receiveShadow = true; cliff.castShadow = true; cliff.userData.noFit = true;
  land.add(cliff);
}
land.add(terrainSkirt(hf, { inner: 1500, outer: 60000 }));
// Nehir: sakin su (FFT dalga, düşük rüzgâr), kıyı köpüğü için derinlik haritası
const river = createOcean(sim.renderer, sim.sky, { wind: 3, windDir: 180, fetch: 8, chop: 0.5, foam: 0.08, deep: 0x0b2a2c, sss: 0x1d5448, sand: 0x4a4636 });
river.mesh.position.y = RIVER;
const RR = [-400, -800, 400, 800];
river.setDepth(depthTexture(hfS, RR, 256, RIVER), RR);
scene.add(river.mesh);
sim.onRender((dt) => { river.update(dt, sim.camera); veg.update(sim.time, 0.7); });
// Orman ve çalılar (yolda ve kanyonda yok)
const vegH = (x, z) => (Math.abs(z) < 11 && Math.abs(x) < 900) || Math.abs(x - gorgeC(z)) < gorgeW(z) + 1.2 ? -60 : hf(x, z);
const veg = createVegetation(vegH, {
  rect: [-1300, -1300, 1300, 1300], trees: 4200, shrubs: 6000, rocks: 250, grass: 14000, grassAt: [26, 30, 26], seed: 5,
  water: -1, kinds: { pine: 0.55, broad: 0.35, cypress: 0.1 }, near: [0, 0, 260],
  forest: (x, z) => 0.55 + 0.25 * Math.sin(x * 0.012 + 0.5) * Math.cos(z * 0.015) + 0.2 * Math.sin((x - z) * 0.04),
});
land.add(veg.group);
// Kanyon tabanında ve yamaçlarında kayalar
const gorgeRocks = createVegetation((x, z) => { const h = hfS(x, z); return Math.abs(x - gorgeC(z)) < gorgeW(z) + 1 && Math.abs(z) > 6 && h < RIVER + 5 ? h : -100; }, {
  rect: [-60, -300, 60, 300], trees: 0, shrubs: 0, rocks: 1100, water: -27, snow: 40, seed: 9,
});
land.add(gorgeRocks.group);

// Yaklaşım yolları: asfalt, şerit çizgileri, bankette korkuluk
const roadM = mat.asphalt({ color: 0x3c3d40, scale: 1.2 }), paintM = mat.concrete({ color: 0xe9e5d8, stains: 0 }), yellowM = mat.concrete({ color: 0xe0b12a, stains: 0 });
const railM = mat.brushedMetal({ color: 0xb9bec4, rough: 0.35 });
const concrete = mat.concrete({ color: 0xaaa49a });
for (const s of [-1, 1]) {
  const x0 = s * (HALF + 0.2), x1 = s * 900, L = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
  const road = new THREE.Mesh(new RoundedBoxGeometry(L, 0.3, ZW * 2 + 1.6, 1, 0.1), roadM); road.position.set(cx, -0.13, 0); scene.add(road);
  for (const z of [-ZW + 0.35, ZW - 0.35]) { const l = new THREE.Mesh(new THREE.BoxGeometry(L, 0.02, 0.14), paintM); l.position.set(cx, 0.03, z); scene.add(l); }
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 0.02, 0.14), yellowM, Math.floor(L / 9));
  for (let i = 0; i < dashes.count; i++) dashes.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x0 + s * (i * 9 + 4), 0.03, 0));
  scene.add(dashes);
  // Korkuluk: direk + çift dalgalı bant
  const n = Math.floor(Math.min(L, 160) / 2);
  const posts = new THREE.InstancedMesh(new RoundedBoxGeometry(0.12, 0.9, 0.1, 1, 0.02), railM, n * 2);
  let k = 0;
  for (let i = 0; i < n; i++) for (const z of [-ZW - 0.55, ZW + 0.55]) posts.setMatrixAt(k++, new THREE.Matrix4().makeTranslation(x0 + s * (i * 2 + 1), 0.45, z));
  scene.add(posts);
  for (const z of [-ZW - 0.45, ZW + 0.45]) { const b = new THREE.Mesh(new RoundedBoxGeometry(Math.min(L, 160), 0.32, 0.06, 2, 0.02), railM); b.position.set(x0 + s * Math.min(L, 160) / 2, 0.68, z); scene.add(b); }
  // Kenar ayağı (abutment): kanat duvarlı beton
  const ab = new THREE.Mesh(new RoundedBoxGeometry(3.4, 5.5, ZW * 2 + 2.6, 3, 0.15), concrete); ab.position.set(s * (HALF + 1.3), -2.6, 0); scene.add(ab);
  for (const z of [-1, 1]) { const wing = new THREE.Mesh(new RoundedBoxGeometry(7, 4.2, 0.6, 2, 0.1), concrete); wing.position.set(s * (HALF + 4.5), -1.9, z * (ZW + 1.0)); scene.add(wing); }
}

// --- Köprü görselleri ---
const MAX_MEM = 64, MAX_NODE = 48, MAX_CROSS = 24;
// Kare kutu profil (yuvarlatılmış köşe), birim boy +y ekseninde
const tubeGeo = (() => {
  const s = new THREE.Shape(), a = 0.5, r = 0.12;
  s.moveTo(-a + r, -a); s.lineTo(a - r, -a); s.quadraticCurveTo(a, -a, a, -a + r); s.lineTo(a, a - r); s.quadraticCurveTo(a, a, a - r, a);
  s.lineTo(-a + r, a); s.quadraticCurveTo(-a, a, -a, a - r); s.lineTo(-a, -a + r); s.quadraticCurveTo(-a, -a, -a + r, -a);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 3 });
  g.translate(0, 0, -0.5); g.rotateX(-Math.PI / 2); g.scale(2, 1, 2);
  return g;
})();
const steelM = mat.paintedMetal({ color: 0xffffff, wear: 0.18 }), woodM = mat.wood({ color: 0xffffff, ring: 10 });
const memMesh = new THREE.InstancedMesh(tubeGeo, steelM, MAX_MEM * 2 + MAX_CROSS);
const jointMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 0.14, 2, 0.05), mat.paintedMetal({ color: 0x3d4247, wear: 0.35 }), MAX_NODE * 2);
// Tabliye: beton plak + asfalt + bordür + çizgiler + korkuluk (her segment birim boy, x'te ölçeklenir)
const deckParts = [
  { geo: new RoundedBoxGeometry(1, 0.34, ZW * 2 + 0.5, 1, 0.06), m: concrete, y: 0, z: 0 },
  { geo: new THREE.BoxGeometry(1, 0.06, ZW * 2 - 0.9), m: roadM, y: 0.19, z: 0 },
  { geo: new RoundedBoxGeometry(1, 0.22, 0.34, 1, 0.05), m: concrete, y: 0.26, z: -ZW + 0.2 },
  { geo: new RoundedBoxGeometry(1, 0.22, 0.34, 1, 0.05), m: concrete, y: 0.26, z: ZW - 0.2 },
  { geo: new THREE.BoxGeometry(1, 0.012, 0.12), m: paintM, y: 0.226, z: -ZW + 0.7 },
  { geo: new THREE.BoxGeometry(1, 0.012, 0.12), m: paintM, y: 0.226, z: ZW - 0.7 },
  { geo: new THREE.BoxGeometry(0.45, 0.012, 0.13), m: yellowM, y: 0.226, z: 0 },
  { geo: new RoundedBoxGeometry(1, 0.3, 0.05, 1, 0.02), m: railM, y: 0.85, z: -ZW + 0.3 },
  { geo: new RoundedBoxGeometry(1, 0.3, 0.05, 1, 0.02), m: railM, y: 0.85, z: ZW - 0.3 },
].map((p) => ({ ...p, mesh: new THREE.InstancedMesh(p.geo, p.m, 16) }));
const deckMesh = deckParts[0].mesh;
for (const m of [memMesh, jointMesh, ...deckParts.map((p) => p.mesh)]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }
const extras = new THREE.Group();
scene.add(extras);

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _l = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
function setCyl(mesh, i, ax, ay, az, bx, by, bz, r) {
  _d.set(bx - ax, by - ay, bz - az);
  const L = _d.length();
  if (L < 1e-6) { mesh.setMatrixAt(i, ZERO); return; }
  _q.setFromUnitVectors(UP, _d.divideScalar(L));
  _m.compose(_p.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _s.set(r, L, r));
  mesh.setMatrixAt(i, _m);
}

// Kopma kıvılcımları: yumuşak yuvarlak parlak parçacıklar
const DEBRIS = 60;
const debrisGeo = new THREE.BufferGeometry();
debrisGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DEBRIS * 3), 3));
const dot = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
})();
const debris = new THREE.Points(debrisGeo, new THREE.PointsMaterial({ color: new THREE.Color(6, 4, 1.6), map: dot, size: 0.35, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
debris.frustumCulled = false;
scene.add(debris);
const debV = new Float32Array(DEBRIS * 3);
let debLife = 0;
function burst(x, y, z) {
  const a = debrisGeo.attributes.position.array;
  for (let i = 0; i < DEBRIS; i++) {
    a.set([x, y, z], i * 3);
    debV.set([(Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8], i * 3);
  }
  debLife = 1.2;
}

// Kamyon (gerçek ölçek, 7 m)
const truck = kitTruck({ color: 0xd9731b, box: 0xe8eaea });
scene.add(truck);
const truckLabel = sim.label('', { parent: truck, position: [0, 4.6, 0] });
const maxLabel = sim.label('', { className: 'plain' });


// --- Durum ---
let model = null, U = null, F = null;
let state = 'stand';            // 'stand' | 'collapse'
let disp = [];                  // görüntülenen düğüm konumları [{x,y}]
let pbd = null;                 // çöküş dinamiği
let truckX = -10, drive = null, cooldown = 0, broken = 0, peakUtil = 0, maxDisp = 0, dirty = true;
const bests = {};

function design() {
  return { mat: matSel.value, dChord: chordD.value / 100, dWeb: webD.value / 100, dCable: cableD.value / 100 };
}

function build(type) {
  model = buildPreset(type);
  applyDesign(model, design());
  F = new Float64Array(model.nodes.length * 2);
  disp = model.nodes.map((n) => ({ x: n.x, y: n.y }));
  state = 'stand'; pbd = null; broken = 0; cooldown = 0; peakUtil = 0;
  // Mesnet blokları
  extras.children.slice().forEach((c) => { c.geometry.dispose(); c.removeFromParent(); });
  const block = (x, y, w, h) => { const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, ZW * 2 + 1.6, 2, 0.12), concrete); b.position.set(x, y, 0); extras.add(b); };
  block(-HALF - 1.1, -1.2, 2.6, 2.2); block(HALF + 1.1, -1.2, 2.6, 2.2);
  for (const n of model.nodes) {
    if (!n.fx || n.y === 0 && Math.abs(Math.abs(n.x) - HALF) < 0.01) continue;
    block(n.x + Math.sign(n.x) * 0.8, n.y - 0.9, 2.4, 2.2);
  }
  sim.hud.hide();
  dirty = true;
  analyze();
  refreshVisuals();
}

function analyze() {
  buildLoads(model, F, { truckX, truckT: load.value });
  const r = solveTruss(model, F);
  if (!r.ok) return startCollapse('Bir eleman kaybedilince kafes <b>mekanizmaya</b> dönüştü: düğümler artık yerinde tutulamıyor.');
  U = r.U; maxDisp = r.maxDisp;
  if (maxDisp > 1.2) return startCollapse('Sehim çok büyüdü (' + fmt(maxDisp, 1) + ' m); köprü yükü taşıyamıyor.');
  let worst = 0;
  for (const m of model.members) if (m.alive) worst = Math.max(worst, m.util);
  if (drive) drive.peak = Math.max(drive.peak, worst);
  peakUtil = worst;
  dirty = false;
}

function breakWorst() {
  let w = null;
  for (const m of model.members) if (m.alive && m.util > 1 && (!w || m.util > w.util)) w = m;
  if (!w) return false;
  w.alive = false;
  broken++;
  const a = disp[w.a], b = disp[w.b];
  burst((a.x + b.x) / 2, (a.y + b.y) / 2, ZW);
  const verb = w.mode === 'burkulma' ? 'burkuldu' : w.mode === 'ezilme' ? 'ezildi' : 'koptu';
  sim.toast(`💥 ${w.label} ${verb}!`, 'bad');
  return true;
}

function startCollapse(reason) {
  if (state === 'collapse') return;
  state = 'collapse';
  const P = disp.map((d) => ({ x: d.x, y: d.y, px: d.x, py: d.y }));
  const cons = model.members.filter((m) => m.alive).map((m) => ({ a: m.a, b: m.b, L: Math.hypot(P[m.b].x - P[m.a].x, P[m.b].y - P[m.a].y) }));
  pbd = { P, cons };
  let msg = `<h2>💥 Köprü çöktü!</h2><p>${reason}</p>`;
  if (drive?.challenge) msg += `<p>Görev başarısız. Kesitleri kalınlaştır ya da başka bir kafes tipi dene.</p>`;
  sim.hud.show(msg + `<button class="btn primary" data-a="fix">🔧 Köprüyü yeniden kur</button>`, { tone: 'bad' });
  sim.hud.el.querySelector('[data-a=fix]').onclick = () => build(typeSel.value);
  drive = null;
}

function stepCollapse(dt) {
  const n = Math.min(40, Math.ceil(dt / 0.008)), h = dt / n;
  const { P, cons } = pbd, nodes = model.nodes;
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < P.length; i++) {
      if (nodes[i].fx || nodes[i].fy) continue;
      const p = P[i], vx = (p.x - p.px) * 0.998, vy = (p.y - p.py) * 0.998;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy - G * h * h;
    }
    for (let it = 0; it < 8; it++) {
      for (const c of cons) {
        const A = P[c.a], B = P[c.b];
        const wa = nodes[c.a].fx || nodes[c.a].fy ? 0 : 1, wb = nodes[c.b].fx || nodes[c.b].fy ? 0 : 1;
        if (!wa && !wb) continue;
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1e-6;
        const f = (d - c.L) / d / (wa + wb);
        A.x += dx * f * wa; A.y += dy * f * wa; B.x -= dx * f * wb; B.y -= dy * f * wb;
      }
      for (const p of P) {
        const gy = gorgeY(p.x) + 0.25;
        if (p.y < gy) { p.y = gy; p.px = p.x - (p.x - p.px) * 0.3; }
      }
    }
  }
  for (let i = 0; i < P.length; i++) { disp[i].x = P[i].x; disp[i].y = P[i].y; }
}

// --- Görsel güncelleme ---
const cNeut = new THREE.Color(), cT = new THREE.Color(0x1d4ed8), cC = new THREE.Color(0xdc2626), cTmp = new THREE.Color();
const cCable = new THREE.Color(CABLE.color), cBroken = new THREE.Color(0x111827);
function refreshVisuals() {
  const nodes = model.nodes, ex = exag.value, mat = MATS[matSel.value];
  if (state === 'stand' && U) {
    for (let i = 0; i < nodes.length; i++) { disp[i].x = nodes[i].x + U[2 * i] * ex; disp[i].y = nodes[i].y + U[2 * i + 1] * ex; }
  }
  cNeut.setHex(mat.color);
  memMesh.material = matSel.value === 'ahsap' ? woodM : steelM;
  let k = 0, worst = null;
  for (const m of model.members) {
    const a = disp[m.a], b = disp[m.b];
    const r = Math.max(0.07, (m.p.cable ? m.p.d * 0.9 : m.p.d * 0.75));
    for (const z of [-ZW, ZW]) {
      if (!m.alive) { memMesh.setMatrixAt(k, ZERO); memMesh.setColorAt(k++, cBroken); continue; }
      setCyl(memMesh, k, a.x, a.y, z, b.x, b.y, z, r);
      const base = m.p.cable ? cCable : cNeut;
      if (colorMode.value && state === 'stand') {
        const t = Math.pow(clamp(m.util, 0, 1), 0.6);
        cTmp.copy(base).lerp(m.slack ? base : m.F >= 0 ? cT : cC, t);
        if (m.util > 0.9 && Math.sin(performance.now() / 90) > 0) cTmp.setHex(0xfacc15);
      } else cTmp.copy(base);
      memMesh.setColorAt(k++, cTmp);
    }
    if (m.alive && (!worst || m.util > worst.util)) worst = m;
  }
  // Enine bağlantılar
  for (const i of model.cross) {
    setCyl(memMesh, k, disp[i].x, disp[i].y, -ZW, disp[i].x, disp[i].y, ZW, 0.1);
    memMesh.setColorAt(k++, cNeut);
  }
  memMesh.count = k;
  memMesh.instanceMatrix.needsUpdate = true;
  if (memMesh.instanceColor) memMesh.instanceColor.needsUpdate = true;
  // Düğümler
  let j = 0;
  for (let i = 0; i < nodes.length; i++) {
    const r = 0.22 + chordD.value / 100 * 0.6;
    for (const z of [-ZW, ZW]) { _m.makeScale(r * 2.3, r * 2.3, 1).setPosition(disp[i].x, disp[i].y, z); jointMesh.setMatrixAt(j++, _m); }
  }
  jointMesh.count = j;
  jointMesh.instanceMatrix.needsUpdate = true;
  // Tabliye
  const dk = model.deck;
  for (let i = 0; i < dk.length - 1; i++) {
    const a = disp[dk[i]], b = disp[dk[i + 1]];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    _q.setFromAxisAngle(_d.set(0, 0, 1), Math.atan2(b.y - a.y, b.x - a.x));
    _m.compose(_p.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.05, 0), _q, _s.set(L, 1, 1));
    for (const part of deckParts) part.mesh.setMatrixAt(i, _l.makeTranslation(0, part.y, part.z).premultiply(_m));
  }
  for (const part of deckParts) { part.mesh.count = dk.length - 1; part.mesh.instanceMatrix.needsUpdate = true; }
  // En zorlanan eleman etiketi
  if (worst && state === 'stand' && worst.util > 0.05) {
    const a = disp[worst.a], b = disp[worst.b];
    maxLabel.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 0.8, ZW);
    maxLabel.setText(`<span style="color:${worst.util > 0.9 ? '#fca5a5' : '#fff'}">⚠ %${fmt(worst.util * 100)}</span>`);
    maxLabel.visible = true;
  } else maxLabel.visible = false;
  placeTruck();
}

function deckHeight(x) {
  const dk = model.deck;
  for (let i = 0; i < dk.length - 1; i++) {
    const a = disp[dk[i]], b = disp[dk[i + 1]];
    const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
    if (x >= lo && x <= hi && hi - lo > 1e-6) return a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x) + 0.23;
  }
  const a = model.nodes[dk[0]], b = model.nodes[dk[dk.length - 1]];
  if (x < a.x || x > b.x) return 0.12;
  // köprü çökmüşse en yakın tabliye düğümü
  let best = disp[dk[0]], bd = Infinity;
  for (const i of dk) { const d = Math.abs(disp[i].x - x); if (d < bd) { bd = d; best = disp[i]; } }
  return best.y + 0.23;
}

function placeTruck() {
  const yr = deckHeight(truckX - 2.0), yf = deckHeight(truckX + 2.4);
  truck.position.set(truckX, (yr + yf) / 2 + (yf - yr) * 0.2 / 4.4, 0);
  truck.rotation.z = Math.atan2(yf - yr, 4.4);
  truck.visible = load.value > 0;
  for (const w of truck.userData.wheels) w.rotation.z = -truckX / 0.52;
  truckLabel.setText(`🚚 ${fmt(load.value)} t`);
}

// --- Döngü ---
sim.onUpdate((dt) => {
  if (state === 'stand') {
    const steps = drive ? Math.max(1, Math.ceil((DRIVE_V * dt) / 0.4)) : 1;
    for (let s = 0; s < steps && state === 'stand'; s++) {
      if (drive) {
        truckX = Math.min(TRUCK_MAX, truckX + (DRIVE_V * dt) / steps);
        posSl.set(truckX);
      }
      analyze();
      if (state !== 'stand') break;
      cooldown -= dt / steps;
      if (cooldown <= 0 && breakWorst()) { cooldown = 0.25; analyze(); }
      if (drive && truckX >= TRUCK_MAX) finishDrive();
    }
  } else stepCollapse(dt);
  if (debLife > 0) {
    debLife -= dt;
    const a = debrisGeo.attributes.position.array;
    for (let i = 0; i < DEBRIS * 3; i += 3) {
      debV[i + 1] -= G * dt;
      a[i] += debV[i] * dt; a[i + 1] += debV[i + 1] * dt; a[i + 2] += debV[i + 2] * dt;
    }
    debrisGeo.attributes.position.needsUpdate = true;
    debris.material.opacity = clamp(debLife, 0, 1);
  }
  debris.visible = debLife > 0;
});
sim.onRender(() => {
  if (dirty && state === 'stand') analyze();
  refreshVisuals();
});

function finishDrive() {
  const d = drive;
  drive = null;
  if (!d.challenge) return;
  const t = totals(model), cost = t.cost / 1000, key = load.value;
  const prev = bests[key];
  const better = !prev || cost < prev.cost;
  if (better) bests[key] = { cost, type: TYPES.find((x) => x.value === typeSel.value).label, mat: MATS[matSel.value].name, c: chordD.value, w: webD.value };
  sim.hud.show(`<h2>✅ Kamyon karşıya geçti!</h2>
    <p>${fmt(load.value)} tonluk yük · maliyet <b>${fmt(cost)} bin ₺</b> · en yüksek gerilme %${fmt(d.peak * 100)}
    · güvenlik katsayısı <b>${fmt(1 / Math.max(d.peak, 1e-3), 2)}</b></p>
    <p>${better ? '🏆 Bu yük için yeni en ucuz tasarım!' : `En ucuz tasarımın hâlâ ${fmt(prev.cost)} bin ₺.`}
    ${d.peak < 0.5 ? ' İpucu: köprü çok güçlü — kesitleri inceltip maliyeti düşürebilirsin.' : ''}</p>
    <button class="btn" data-a="ok">Tamam</button>`, { tone: 'good' });
  sim.hud.el.querySelector('[data-a=ok]').onclick = () => sim.hud.hide();
  showBests();
}

function showBests() {
  const keys = Object.keys(bests).map(Number).sort((a, b) => a - b);
  bestTxt.set(keys.length ? keys.map((k) => { const b = bests[k]; return `<b>${fmt(k)} t</b>: ${fmt(b.cost)} bin ₺ · ${b.type}, ${b.mat}, ${b.c}/${b.w} cm`; }).join('<br>')
    : 'Henüz başarılı görev yok. Yükü seç, <b>🏁 Görevi dene</b>ye bas.');
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Köprü tipi');
const typeSel = ui.segmented({ options: TYPES, value: 'warren', onChange: (v) => build(v) });

ui.section('Malzeme ve kesit');
const matSel = ui.segmented({ options: [{ value: 'celik', label: '🔩 Çelik' }, { value: 'ahsap', label: '🪵 Ahşap' }], value: 'celik', onChange: () => redesign() });
const chordD = ui.slider({ label: 'Başlık / kemer / kule kalınlığı', min: 4, max: 40, step: 1, value: 12, unit: 'cm', onChange: () => redesign() });
const webD = ui.slider({ label: 'Örgü (dikme, çapraz) kalınlığı', min: 4, max: 40, step: 1, value: 10, unit: 'cm', onChange: () => redesign() });
const cableD = ui.slider({ label: 'Kablo çapı (asma köprü)', min: 2, max: 16, step: 0.5, value: 5, unit: 'cm', onChange: () => redesign() });
ui.text('<small>Çelik: kare kutu profil. Ahşap: dolu kare kesit (tutkallı lamine).</small>');

ui.section('Yük');
const load = ui.slider({ label: 'Kamyon yükü', min: 0, max: 120, step: 1, value: 30, unit: 't', onChange: () => (dirty = true) });
const posSl = ui.slider({ label: 'Kamyonun konumu', min: TRUCK_MIN, max: TRUCK_MAX, step: 0.1, value: truckX, format: (v) => `${fmt(v + HALF, 1)} m`, onInput: (v) => { truckX = v; dirty = true; } });
ui.buttons([
  { label: '🚚 Kamyonu geçir', variant: 'primary', onClick: () => startDrive(false) },
  { label: '🏁 Görevi dene', variant: 'good', onClick: () => startDrive(true) },
]);
const removeMode = ui.toggle({ label: 'Tıklayınca eleman sök', value: false });

ui.section('Görünüm');
ui.buttons([
  { label: 'Yakın bakış', onClick: () => sim.moveCamera([8.5, 1.4, 21], [-1, -1.6, 0]) },
  { label: 'Köprü', onClick: () => sim.moveCamera([11.5, 2.4, 31], [-1.2, -4.2, 0]) },
  { label: 'Kanyon', onClick: () => sim.moveCamera([46, 16, 105], [0, -9, 0]) },
]);
const exag = ui.slider({ label: 'Sehim büyütme', min: 1, max: 100, step: 1, value: 30, unit: '×' });
const colorMode = ui.toggle({ label: 'Gerilme renkleri (mavi çekme, kırmızı basınç)', value: true });

ui.section('Durum');
const stUtil = ui.stat({ label: 'Maks. gerilme', unit: '%' });
const stSF = ui.stat({ label: 'Güvenlik katsayısı' });
const stCost = ui.stat({ label: 'Malzeme maliyeti', unit: 'bin ₺' });
const stMass = ui.stat({ label: 'Malzeme kütlesi', unit: 't' });
const stDefl = ui.stat({ label: 'Gerçek maks. sehim', unit: 'cm' });
const stBroken = ui.stat({ label: 'Kırılan eleman' });
const meter = ui.meter({ label: 'En zorlanan eleman' });
const worstTxt = ui.text('', 'card');
ui.button({ label: '🔧 Köprüyü yeniden kur', onClick: () => build(typeSel.value) });

ui.section('🏆 Görev: en ucuz köprü');
ui.text('Seçtiğin kamyon yükünü köprüden <b>en düşük malzeme maliyetiyle</b> geçir. Kamyon baştan sona gider; hiçbir eleman kırılmamalı.');
const bestTxt = ui.text('', 'card');
showBests();

function redesign() {
  const wasCollapsed = state === 'collapse';
  applyDesign(model, design());
  if (wasCollapsed) build(typeSel.value);
  dirty = true;
}

function startDrive(challenge) {
  if (challenge || state === 'collapse') build(typeSel.value);
  truckX = challenge || truckX >= TRUCK_MAX - 1 ? TRUCK_MIN : truckX;
  posSl.set(truckX);
  drive = { challenge, peak: 0 };
  sim.hud.hide();
  if (challenge) sim.toast(`🏁 Görev başladı: ${fmt(load.value)} t`, 'warn');
  if (sim.paused) sim.play();
}

let statTick = 0;
sim.onRender(() => {
  if (statTick++ % 6) return;
  const t = totals(model);
  stCost.set(fmt(t.cost / 1000), '');
  stMass.set(fmt(t.mass / 1000, 1));
  stBroken.set(broken, broken ? 'bad' : '');
  if (state === 'collapse') {
    stUtil.set('—', 'bad'); stSF.set('0', 'bad'); stDefl.set('—', 'bad');
    meter.set(1, 'çöktü'); meter.color('var(--bad)');
    worstTxt.set('Köprü çöktü. <b>🔧 Yeniden kur</b> ya da kesitleri değiştir.');
    return;
  }
  const u = peakUtil, tone = u > 0.9 ? 'bad' : u > 0.6 ? 'warn' : 'good';
  stUtil.set(fmt(u * 100), tone);
  stSF.set(u > 1e-3 ? fmt(1 / u, 2) : '∞', 1 / u < 1.5 ? 'bad' : 1 / u < 2 ? 'warn' : 'good');
  stDefl.set(fmt(maxDisp * 100, 1));
  meter.set(u, `%${fmt(u * 100)}`);
  meter.color(u > 0.9 ? 'var(--bad)' : u > 0.6 ? 'var(--warn)' : 'var(--good)');
  let w = null;
  for (const m of model.members) if (m.alive && (!w || m.util > w.util)) w = m;
  if (w) {
    const kind = w.F >= 0 ? '<span style="color:#60a5fa">çekme</span>' : '<span style="color:#f87171">basınç</span>';
    worstTxt.set(`<b>${w.label}</b>: ${fmt(Math.abs(w.F) / 1000)} kN ${kind}<br>
      Kapasite: çekme ${fmt(w.capT / 1000)} kN${w.p.cable ? '' : ` · basınç ${fmt(w.capC / 1000)} kN (${w.capB < w.capY ? 'burkulma belirler' : 'ezilme belirler'})`}`);
  }
});

// Eleman tıklama: bilgi ya da sökme
sim.onClick(() => [memMesh], (hit) => {
  if (hit.instanceId == null || state !== 'stand') return;
  const idx = Math.floor(hit.instanceId / 2);
  const m = model.members[idx];
  if (!m || !m.alive) return;
  if (removeMode.value) {
    m.alive = false; broken++;
    const a = disp[m.a], b = disp[m.b];
    burst((a.x + b.x) / 2, (a.y + b.y) / 2, ZW);
    sim.toast(`🔧 ${m.label} söküldü`, 'warn');
    dirty = true;
    return;
  }
  const kind = m.slack ? 'gevşek (kablo basınç taşımaz)' : m.F >= 0 ? 'çekme' : 'basınç';
  sim.toast(`<b>${m.label}</b> · ${fmt(Math.abs(m.F) / 1000)} kN ${kind} · kapasitenin %${fmt(m.util * 100)}'i · boy ${fmt(m.L, 1)} m`);
});

// Kamyonu sürükle
let dragging = false;
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
sim.dom.addEventListener('pointerdown', (e) => {
  if (!truck.visible || !sim.raycast(e, [truck]).length) return;
  dragging = true; drive = null;
  if (sim.controls) sim.controls.enabled = false;
});
sim.dom.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const p = sim.pointOnPlane(e, dragPlane);
  if (p) { truckX = clamp(p.x, TRUCK_MIN, TRUCK_MAX); posSl.set(truckX); dirty = true; }
});
window.addEventListener('pointerup', () => { if (dragging) { dragging = false; if (sim.controls) sim.controls.enabled = true; } });

sim.onReset(() => { drive = null; truckX = -10; posSl.set(truckX); build(typeSel.value); });
build('warren');
