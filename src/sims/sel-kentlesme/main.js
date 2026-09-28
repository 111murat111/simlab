// Sel ve Kentleşme — betonlaşma yüzey akışını artırır: SCS-CN + Nash hidrografı, Manning ile dere seviyesi ve taşkın.
import { createSim, THREE, fmt, clamp, lerp, seeded, instanced, smoothstep, procedural, mat, terrainMaterial, createTerrain, terrainSkirt, landscape, createVegetation, BufferGeometryUtils,
  RoundedBoxGeometry, makeBlock, populateCity, carFleet, treeParts } from '@core';
import { simulate, rational, stageOf, bankfullQ, CH, T_END, BANKFULL_D, AREA_KM2 } from './hydro.js';
import { treeGeometry, leafMat, barkMat } from './kit.js';

const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;

const sim = createSim({
  sky: { elevation: 38, azimuth: 150, clouds: 0.3, haze: 1.05, visibility: 20000, wind: [4, 1] },
  camera: { position: [1040, 85, 380], target: [820, 4, 202], fov: 45, near: 1, far: 80000 },
  controls: { minDistance: 20, maxDistance: 9000, maxPolarAngle: 1.47 },
  shadows: true,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>4,8 × 3,6 km'lik (≈17 km²) küçük bir havza: tepelerden inen yağmur suyu, kasabanın içinden kıvrılarak geçen dereye
    toplanır. Dere çakıllı bir yatakta akar; kıyılarında kavak ve söğüt sıraları, iki yanında evler, apartmanlar, caddeler
    ve otoparklar vardır. <b>Kentleşme</b> arttıkça orman ve çayır hücreleri gerçekten bina, asfalt ve otoparka dönüşür.
    Bu yüzeyler suyu emmez: yağmurun çok daha büyük kısmı <b>yüzey akışına</b> geçer ve oluk-boru-kanal sistemiyle
    dereye çok daha <b>hızlı</b> ulaşır. Sonuç: daha yüksek ve daha erken bir <b>pik debi</b>. Dere kıyı dolu seviyesini
    (2 m) aşınca su taşkın düzlüğüne yayılır ve dere kenarındaki parseller su altında kalır.</p>
    <h3>Dene</h3>
    <ul>
      <li>"Sağanak" hazır ayarını kentleşme %5 ve %70 ile karşılaştır; grafikte pikin nasıl büyüyüp öne kaydığına bak.</li>
      <li>Kentleşme %60'ta önlemleri tek tek aç: yeşil çatı, geçirgen kaldırım, yağmur bahçesi, bekletme havuzu.</li>
      <li>"Dere yatağına yapılaşma"yı aç: binalar kıyıya dayanır, yatak daralır; aynı debi daha yüksek su seviyesi demektir.</li>
      <li>Toprak önceden ıslakken (art arda yağışlar) aynı yağmurun etkisini gör.</li>
      <li>"Görünüm" bölümündeki "Dere kenarı" ve "Limnimetre" bakışlarıyla suyun yükselişini yakından izle.</li>
    </ul>
    <h3>Model</h3>
    <p>Yağış fazlası <b>SCS eğri numarası (CN)</b> yöntemiyle hesaplanır: Q = (P − 0,2S)² / (P + 0,8S), S = 25400/CN − 254 (mm).
    CN değerleri TR-55 tablolarından (B grubu toprak): orman ≈ 60, çayır ≈ 69, geçirimsiz yüzey 98. Kent alanının %35'i çatı,
    %20'si kaldırım/otopark, %20'si yol, %25'i bahçedir; sahnedeki kent hücreleri de bu paylarla konut adası, cadde, otopark
    ve park olarak çizilir. Akış, gecikme süresi SCS formülüyle bulunan (kentleşmeyle kısalan) bir <b>Nash doğrusal hazne
    kaskadı</b> ile dereye ötelenir; su derinliği dikdörtgen kanal + taşkın düzlüğü için <b>Manning</b> denkleminden çözülür.
    Karşılaştırma için <b>rasyonel yöntem</b> (Q = C·i·A / 3,6) de gösterilir.</p>
    <h3>Gerçek hayatta</h3>
    <p>Türkiye'deki pek çok kentsel sel, dere yataklarının daraltılması, üstünün kapatılması ya da içine yapı yapılmasıyla
    ağırlaşmıştır. "Sünger kent" yaklaşımı (yeşil altyapı, geçirimli yüzey, bekletme alanları) yağmuru kaynağında tutmayı hedefler.</p>
    <p><small>Sahne gerçek ölçektedir (düşey abartı yok): dere yatağı 12 m genişliğinde ve 2 m derinliğinde, taşkın düzlüğü
    200 m'de 1,5 m yükselir; kent 100 m × 100 m'lik adalara bölünür. Sayılar küçük bir örnek havza için gerçekçi
    mertebededir, belirli bir yeri temsil etmez.</small></p>`,
});
const { scene } = sim;
sim.formatTime = () => `${Math.floor(tMin / 60)} sa ${String(Math.floor(tMin % 60)).padStart(2, '0')} dk`;

// --- Ölçek: model hücreleri eski 200 m'lik birim ızgarasında; görüntü gerçek metre ---
const U = 200;
const W = 24, D = 18;                                      // havza (birim) = 4,8 × 3,6 km
// Derenin menderes çizgisi (metre): büyük kıvrım + kasaba içinde daha sık küçük kıvrımlar
const czM = (x) => 240 * Math.sin(x / 800 + 0.5) + 34 * Math.sin(x / 190 + 1.1) + 26 * Math.sin(x / 85 + 0.3);
const czD2 = (x) => -240 / 640000 * Math.sin(x / 800 + 0.5) - 34 / 36100 * Math.sin(x / 190 + 1.1) - 26 / 7225 * Math.sin(x / 85 + 0.3);   // eğrilik (≈ z'')
const CZ_GLSL = 'float czG(float x){ return 240.0*sin(x/800.0 + 0.5) + 34.0*sin(x/190.0 + 1.1) + 26.0*sin(x/85.0 + 0.3); }\n' +
  'float czD2G(float x){ return -240.0/640000.0*sin(x/800.0 + 0.5) - 34.0/36100.0*sin(x/190.0 + 1.1) - 26.0/7225.0*sin(x/85.0 + 0.3); }';
const cz = (x) => czM(x * U) / U;                          // birim
let CW = 0.34;                                             // hücre sınıflaması için kanal yarı genişliği (birim)
const FPW = 3.2;                                           // taşkın düzlüğü yarı genişliği (birim) = 640 m
const FPW_M = FPW * U, FP_S = 0.0075, BANKW = 3;          // 200 m'de 1,5 m yükselme; kıyı şevi 3 m
let cwM = CH.dogal.b / 2;                                  // gerçek kanal yarı genişliği (m)
const bedM = (x) => 0.0014 * (2400 - x);                   // dere tabanı boyuna eğimi (‰1,4)
const hills = landscape({ seed: 23, size: 1500, height: 110, octaves: 7, warp: 0.45 });
const far = landscape({ seed: 5, size: 6000, height: 420, octaves: 5, warp: 0.3 });
function profM(x, z) {                                     // tabandan yükseklik (m)
  const n = z - czM(x), ad = Math.abs(n);
  // Yatak içi: dış kıyıya kaymış talveg (düşük akım oluğu) + iç kıyıda çakıl adası
  const tO = clamp(-czD2(x) * 420, -0.45, 0.45) * cwM;
  const bedIn = 0.55 * Math.min(1, ((clamp(n, -cwM, cwM) - tO) / cwM) ** 2);
  if (ad < cwM) return bedIn;
  if (ad < cwM + BANKW) return Math.max(bedIn, ((ad - cwM) / BANKW) * BANKFULL_D);
  const fp = BANKFULL_D + (Math.min(ad, FPW_M) - cwM - BANKW) * FP_S;
  if (ad < FPW_M) return fp;
  const e = ad - FPW_M;
  return fp + 95 * Math.pow(smoothstep(0, 1500, e), 1.4) + (hills(x, z) + 45) * 0.7 * smoothstep(0, 450, e)
    + Math.max(0, far(x, z) + 120) * smoothstep(2200, 7000, ad);
}
const hW = (x, z) => bedM(x) + profM(x, z);

// --- Arazi kullanım hücreleri (100 m = bir kent adası) ---
const CS = 0.5, NX = W / CS, NZ = D / CS, CELL = CS * U;
const rnd = seeded(7);
const noise3 = landscape({ seed: 71, size: 800, height: 1, octaves: 3, warp: 0 });
const TOWN = [700, czM(700)];
const cells = [];
for (let j = 0; j < NZ; j++) {
  for (let i = 0; i < NX; i++) {
    const x = -W / 2 + (i + 0.5) * CS, z = -D / 2 + (j + 0.5) * CS;
    const ad = Math.abs(z - cz(x));
    const r = rnd();
    const sub = r < 0.35 ? 'roof' : r < 0.55 ? 'pave' : r < 0.75 ? 'road' : 'garden';
    // Kentleşme sırası: kasaba merkezine yakın, vadi tabanı önce
    const score = Math.hypot(x - 3.5, (z - cz(x)) * 1.3) + Math.max(0, ad - FPW) * 0.6 + rnd() * 1.6;
    cells.push({ idx: j * NX + i, i, j, x, z, xm: x * U, zm: z * U, ad, sub, score, forestKey: noise3(x * U, z * U) * 2 + (ad > FPW ? 0.4 : -0.3) + rnd() * 0.3, h: 0.35 + rnd() * 0.5, state: 'meadow' });
  }
}
const cellAt = (x, z) => cells[clamp(Math.floor((z + D / 2) / CS), 0, NZ - 1) * NX + clamp(Math.floor((x + W / 2) / CS), 0, NX - 1)];
const cellAtM = (x, z) => cellAt(x / U, z / U);
// Kanal koridoru: hücre merkezi eksene 78 m'den yakınsa yapılaşmaz (kıyı ağaçları ve çayır); binalar ayrıca kıyıdan geri çekilir
const landCells = () => cells.filter((c) => c.ad >= CW + 0.05);

// Hücre dokusu: R orman, G kent, B alt tür (çatı/yol/otopark/bahçe), A kıyı yapılaşması
const luData = new Uint8Array(NX * NZ * 4);
const luTex = new THREE.DataTexture(luData, NX, NZ, THREE.RGBAFormat);
luTex.magFilter = luTex.minFilter = THREE.LinearFilter;
const SUBK = { roof: 0, road: 1, pave: 2, garden: 3 };
const LU = { uLU: { value: luTex }, uPerm: { value: 0 }, uRG: { value: 0 }, uCW: { value: cwM }, uGap: { value: cwM + BANKW + 8 }, uStage: { value: 0.1 } };
const BRIDGES = [500, 800, 1100];                               // köprüler (cadde hizasında)

function landMaterial() {
  const m = terrainMaterial({ water: -200, forest: 0, grass: 0x4b6828, dry: 0x6c7140, soil: 0x6a5238, forestCol: 0x2d4222, wet: 0 });
  const orig = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    orig(sh, r);
    Object.assign(sh.uniforms, LU);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uLU; uniform float uPerm, uRG, uCW, uGap, uStage; float gPave; float gWetBed;\n${CZ_GLSL}`)
      .replace('diffuseColor.rgb = c;', /* glsl */ `diffuseColor.rgb = c;
        gPave = 0.0; gWetBed = 0.0;
        {
          vec2 cu = (vTW.xz - vec2(-2400.0, -1800.0))/${CELL.toFixed(1)};
          vec2 luv = cu/vec2(${NX.toFixed(1)}, ${NZ.toFixed(1)});
          float inC = step(0.0, luv.x)*step(luv.x, 1.0)*step(0.0, luv.y)*step(luv.y, 1.0);
          vec4 lu = texture2D(uLU, luv)*inC;
          vec4 lc = texture2D(uLU, (floor(cu) + 0.5)/vec2(${NX.toFixed(1)}, ${NZ.toFixed(1)}))*inC;
          float mid = fbm3(tP*0.05, 3), fine = vn3(tP*1.3);
          float dist = length(vViewPosition), nearG = 1.0 - smoothstep(50.0, 320.0, dist);
          float nS = vTW.z - czG(vTW.x), ad = abs(nS);
          float hb = vTW.y - 0.0014*(2400.0 - vTW.x);                     // dere tabanına göre yükseklik
          // Orman tabanı ve taç gölgesi (ağaçlar ayrıca var)
          float fo = smoothstep(0.3, 0.7, lu.r + 0.25*(mid - 0.5));
          vec3 floorC = tForestC*(0.55 + 0.35*fbm3(tP*0.3, 3))*(0.8 + 0.3*tCrown(tP.xz*0.14));
          diffuseColor.rgb = mix(diffuseColor.rgb, floorC, fo);
          // Çayır/tarla parselleri (kent ve orman dışı): ekin, nadas, sürülmüş toprak; parsel sınırında çalı çiti
          {
            vec2 pq = cu*vec2(1.0, 2.0);
            float hh = h13(vec3(floor(pq), 2.3));
            vec3 crop = hh < 0.3 ? diffuseColor.rgb*vec3(1.05, 1.12, 0.85) : hh < 0.48 ? vec3(0.45, 0.42, 0.22) : hh < 0.62 ? vec3(0.34, 0.27, 0.19) : hh < 0.8 ? vec3(0.2, 0.3, 0.1) : diffuseColor.rgb*vec3(0.85, 0.95, 0.8);
            crop *= 0.85 + 0.3*fbm3(tP*0.08 + hh*7.0, 3);
            crop *= 1.0 + 0.1*(sin(dot(vTW.xz, hh < 0.5 ? vec2(1.0, 0.0) : vec2(0.0, 1.0))*3.1416/1.4) );
            vec2 pe = min(fract(pq), 1.0 - fract(pq))*vec2(${CELL.toFixed(1)}, ${(CELL / 2).toFixed(1)});
            float hedge = 1.0 - smoothstep(1.2, 2.6, min(pe.x, pe.y));
            crop = mix(crop, vec3(0.16, 0.24, 0.1)*(0.8 + 0.4*mid), hedge*0.9);
            // taşkın düzlüğü: dere boyunca düz, nemli çayır; kıyı koridoru: uzun otlu, sazlı çayır
            float fpl = 1.0 - smoothstep(560.0, 700.0, ad);
            crop = mix(crop, vec3(0.2, 0.33, 0.11)*(0.8 + 0.35*mid)*(0.9 + 0.2*fine), fpl*0.45);
            float rip = 1.0 - smoothstep(40.0, 85.0, ad + 25.0*(mid - 0.5));
            vec3 ripC = mix(vec3(0.17, 0.27, 0.09), vec3(0.33, 0.36, 0.16), smoothstep(0.4, 0.75, fbm3(tP*0.35, 3)))*(0.8 + 0.4*vn3(tP*2.0));
            crop = mix(crop, ripC, rip);
            diffuseColor.rgb = mix(diffuseColor.rgb, crop, (1.0 - fo)*0.85*(1.0 - smoothstep(0.15, 0.4, lu.g)));
          }
          // Kent dokusu: her kent hücresi yollarla çevrili bir ada
          float urb = smoothstep(0.35, 0.62, lu.g + 0.15*(mid - 0.5));
          urb *= smoothstep(uGap - 2.0, uGap + 4.0, ad);                    // kıyı şeridi yeşil kalır
          float sub = floor(lc.b*3.0 + 0.5);
          vec2 fc = fract(cu);
          vec2 sd = abs(fc - 0.5)*${CELL.toFixed(1)};
          float db = ${(CELL / 2).toFixed(1)} - max(sd.x, sd.y);                // hücre kenarındaki sokağa uzaklık
          float along = sd.x > sd.y ? vTW.z : vTW.x;
          vec3 asph = vec3(0.115, 0.118, 0.122)*(0.8 + 0.35*fine)*(0.88 + 0.24*mid);
          asph *= 1.0 - 0.25*smoothstep(0.62, 0.8, fbm3(tP*0.25 + 5.0, 3));   // yama ve lastik izleri
          vec2 pv0 = fract(vTW.xz*vec2(3.3, 6.6) + vec2(0.5*step(0.5, fract(vTW.z*3.3)), 0.0));
          float pj = (1.0 - step(0.1, pv0.x)*step(0.1, pv0.y))*nearG;
          vec3 walk = vec3(0.56, 0.54, 0.5)*(0.85 + 0.25*fine)*(1.0 - 0.35*pj);
          vec3 lawn = vec3(0.25, 0.35, 0.13)*(0.8 + 0.35*mid)*(0.85 + 0.3*vn3(tP*0.6));
          vec3 u = lawn;
          float pave = 0.0;
          if (sub < 0.5) {            // konut adası: arka bahçeler, çitler, bahçe yolları
            float hed = (1.0 - smoothstep(0.3, 0.8, abs(fract(along/16.0) - 0.5)*16.0))*step(db, 30.0)*step(18.0, db);
            u = mix(lawn*(0.9 + 0.2*vn3(tP*0.4)), vec3(0.14, 0.22, 0.08), hed*0.8);
            float yard = step(db, 20.0)*(1.0 - smoothstep(6.5, 7.0, db));
            u = mix(u, walk*0.92, yard);
            pave = yard*0.6;
          } else if (sub < 1.5) {     // ana cadde (hücre ortasından) + dükkân önü kaldırımı
            float ax = abs(fc.y - 0.5)*${CELL.toFixed(1)};
            float lane = (1.0 - smoothstep(0.08, 0.16, abs(ax - 3.9)))*step(0.5, fract(vTW.x/6.0));
            float med = 1.0 - smoothstep(0.7, 0.8, ax);
            u = ax < 8.0 ? asph + lane*vec3(0.55) : ax < 11.0 ? walk : lawn*0.95;
            u = mix(u, vec3(0.6, 0.58, 0.54), med);                          // orta refüj
            pave = ax < 11.0 ? 1.0 : 0.3;
          } else if (sub < 2.5) {     // otopark: asfalt + park çizgileri; geçirgen: çim derzli parke
            float row = mod(sd.y, 13.0);
            float stall = step(abs(fract(vTW.x/2.6) - 0.5), 0.03)*step(4.0, row)*step(row, 9.0)*step(0.36, fc.y);
            vec3 lot = asph*1.2 + stall*vec3(0.6);
            vec2 pv = fract(vTW.xz*vec2(2.5, 5.0));
            float joint = 1.0 - step(0.12, pv.x)*step(0.12, pv.y);
            vec3 perm = mix(vec3(0.44, 0.4, 0.34)*(0.85 + 0.3*h13(floor(vec3(vTW.xz*vec2(2.5, 5.0), 1.0)))), lawn*0.8, joint);
            u = mix(lot, perm, uPerm);
            pave = 1.0 - 0.6*uPerm;
          } else {                    // park; yağmur bahçesi: çukur, sık bitki, ıslak toprak
            float path = 1.0 - smoothstep(1.1, 1.5, abs(length(fc - 0.5)*${CELL.toFixed(1)} - 26.0));
            u = mix(lawn*(0.9 + 0.2*mid), walk*0.95, path);
            float rg = smoothstep(0.55, 0.65, 1.0 - length(fc - 0.5)*2.0 + 0.2*mid);
            vec3 rain = mix(vec3(0.16, 0.24, 0.1)*(0.7 + 0.6*vn3(tP*0.8)), vec3(0.2, 0.17, 0.13), smoothstep(0.6, 0.75, vn3(tP*0.25)));
            u = mix(u, rain, rg*uRG);
          }
          float street = 1.0 - smoothstep(4.0, 4.3, db), side = 1.0 - smoothstep(6.3, 6.5, db);
          float curb = (1.0 - smoothstep(0.0, 0.18, abs(db - 4.15)))*nearG;
          float dash = (1.0 - smoothstep(0.07, 0.13, db))*step(0.45, fract(along/7.0))*nearG;
          u = mix(u, walk, side*(1.0 - street));
          u = mix(u, asph + dash*vec3(0.5), street);
          u = mix(u, vec3(0.62, 0.61, 0.58), curb);
          diffuseColor.rgb = mix(diffuseColor.rgb, u, urb);
          gPave = urb*max(pave, side);
          // Köprü yaklaşım yolları (kıyı koridorunu geçen caddeler)
          ${BRIDGES.map((bx) => `{
            float bw = 1.0 - smoothstep(3.8, 4.1, abs(vTW.x - ${bx.toFixed(1)}));
            float bk = step(uCW + ${BANKW}.0 - 0.5, ad)*(1.0 - smoothstep(uGap + 2.0, uGap + 6.0, ad))*(1.0 - urb);
            float bs = (1.0 - smoothstep(5.8, 6.1, abs(vTW.x - ${bx.toFixed(1)})))*bk;
            diffuseColor.rgb = mix(diffuseColor.rgb, walk, bs);
            diffuseColor.rgb = mix(diffuseColor.rgb, asph, bw*bk);
            gPave = max(gPave, bs);
          }`).join('\n')}
          // Dere yatağı: iri ve ince çakıl (yuvarlak taşlar, aralarında koyu kum), şevde çakıl → çamur → otlu kıyı
          float pb1 = tCrown(tP.xz*2.2), pb2 = tCrown(tP.xz*6.3 + 3.1);
          float pv1 = vn3(tP*2.2), pv2 = vn3(tP*6.3 + 7.0);
          vec3 gravel = mix(vec3(0.46, 0.42, 0.35), vec3(0.68, 0.62, 0.52), pv1);
          gravel = mix(gravel, vec3(0.55, 0.47, 0.38), smoothstep(0.55, 0.8, pv2)*0.5);
          gravel = mix(gravel, vec3(0.3, 0.29, 0.27), step(0.78, vn3(tP*3.1 + 2.0))*0.7);
          gravel *= mix(0.9 + 0.2*mid, 0.5 + 0.65*mix(pb2, pb1, 0.55), nearG);
          float bankTop = uCW + ${BANKW}.0;
          float onBank = 1.0 - smoothstep(bankTop - 0.4, bankTop + 1.2, ad);
          float grv = 1.0 - smoothstep(0.9, 1.6, hb + 0.5*(mid - 0.5));      // çakıl şeridi (≈1 m'ye kadar)
          vec3 mud = vec3(0.3, 0.26, 0.2)*(0.75 + 0.45*fine);
          vec3 bankC = mix(mix(diffuseColor.rgb*0.85, mud, 0.45 + 0.3*fine), gravel, grv);
          diffuseColor.rgb = mix(diffuseColor.rgb, bankC, onBank);
          {
            float tOg = clamp(-czD2G(vTW.x)*420.0, -0.45, 0.45);          // talveg kayması (+: dış kıyı +z yönünde)
            float outer = tOg*sign(nS) > 0.0 ? 1.0 : 0.0;
            // iç kıvrım: kuru, açık renkli kum-çakıl adası (su çizgisinin üstünde)
            float bar = (1.0 - outer)*smoothstep(0.08, 0.3, abs(tOg))*(1.0 - smoothstep(uCW - 0.6, uCW + 0.8, ad))*smoothstep(uStage + 0.02, uStage + 0.12, hb);
            vec3 sand = mix(vec3(0.74, 0.68, 0.56), vec3(0.62, 0.57, 0.47), pv2)*(0.9 + 0.15*fine);
            sand = mix(sand, gravel*1.12, 0.35 + 0.3*pb1*nearG);
            diffuseColor.rgb = mix(diffuseColor.rgb, sand, bar);
            // kıyı kenarı: aşınmış şev, çıplak koyu toprak şeridi (dış kıvrımda geniş), üstünde ot saçağı
            float edge = 1.0 - smoothstep(0.0, 0.6 + 1.2*outer, abs(ad - (bankTop - 0.6 - 0.6*outer)) - 0.25*(mid - 0.5));
            vec3 soil = mix(vec3(0.2, 0.15, 0.1), vec3(0.3, 0.23, 0.15), fine);
            diffuseColor.rgb = mix(diffuseColor.rgb, soil, edge*(0.65 + 0.3*outer));
          }
          // su izi: suyun ulaştığı kotun hemen üstü ıslak ve koyu
          float wetL = 1.0 - smoothstep(uStage + 0.05, uStage + 0.5, hb);
          diffuseColor.rgb *= 1.0 - 0.38*wetL*(0.6 + 0.4*onBank);
          gWetBed = max(onBank*grv*0.4, wetL);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.8, gPave); roughnessFactor = mix(roughnessFactor, 0.3, gWetBed);');
  };
  m.customProgramCacheKey = () => 'sel-land2';
  return m;
}
const landMat = landMaterial();
const outerMat = terrainMaterial({ water: -200, forest: 0.7, grass: 0x4b6828, dry: 0x6c7140, soil: 0x6a5238, forestCol: 0x2d4222 });

// İç arazi: dere eksenine göre eğrisel ızgara (kanalın yakınında 0,75 m çözünürlük)
const NMAX = 2100, XMAX = 4200;
function steps(list) { const a = [0]; let v = 0; for (const [lim, st] of list) while (v < lim - 1e-6) { v = Math.min(lim, v + st); a.push(v); } return a; }
const nPos = steps([[12, 0.75], [40, 2], [700, LOW ? 12 : 8], [NMAX, LOW ? 60 : 40]]);
const NS = [...nPos.slice(1).reverse().map((v) => -v), ...nPos];
const xPos = steps([[2600, LOW ? 12 : 6], [XMAX, LOW ? 40 : 25]]);
const XS = [...xPos.slice(1).reverse().map((v) => -v), ...xPos];
const terrGeo = new THREE.BufferGeometry();
{
  const nx = XS.length, nn = NS.length, idx = [];
  terrGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nx * nn * 3), 3));
  for (let i = 0; i < nx - 1; i++) for (let k = 0; k < nn - 1; k++) {
    const a = i * nn + k, b = a + nn;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  terrGeo.setIndex(idx);
}
const terrain = new THREE.Mesh(terrGeo, landMat);
terrain.receiveShadow = true;
terrain.userData.noCast = true; terrain.userData.noFit = true;
scene.add(terrain);
function shapeTerrain() {
  const p = terrGeo.attributes.position, nn = NS.length;
  XS.forEach((x, i) => { const c = czM(x); NS.forEach((n, k) => { const z = c + n; p.setXYZ(i * nn + k, x, hW(x, z), z); }); });
  p.needsUpdate = true;
  terrGeo.computeVertexNormals();
  terrGeo.computeBoundingSphere();
}
// Çevre: aynı yükseklik fonksiyonu, iç arazinin altında 3 m alçak; ufka kadar etek
const inner = (x, z) => Math.min(smoothstep(XMAX, XMAX - 60, Math.abs(x)), smoothstep(NMAX, NMAX - 60, Math.abs(z - czM(x))));
scene.add(createTerrain((x, z) => hW(x, z) - 3 * inner(x, z), { size: [20000, 18000], res: LOW ? [200, 180] : [320, 288], material: outerMat }));
scene.add(terrainSkirt(hW, { inner: 9000, outer: 70000, material: outerMat }));
const outerVeg = createVegetation(hW, {
  rect: [-8000, -7500, 8000, 7500], trees: LOW ? 1800 : 12000, shrubs: LOW ? 400 : 4000, rocks: 150, seed: 9,
  kinds: { pine: 0.35, broad: 0.55, cypress: 0.1 }, leafA: 0x2c4a20, leafB: 0x5a6a2c,
  forest: (x, z) => (inner(x, z) > 0.01 ? 0 : 0.45 + 0.4 * Math.sin(x * 0.0021 + 0.7) * Math.cos(z * 0.0017)),
});
scene.add(outerVeg.group);

// --- Ağaçlar: orman hücrelerinde gerçek boyda, kıyıda kavak ve salkım söğüt sırası, bahçe ve cadde ağaçları ---
// Salkım söğüt: kısa kalın gövde, geniş kubbe ve kubbenin kenarından yere doğru sarkan uzun yaprak perdeleri
function willowGeometry(seed) {
  const r = seeded(seed);
  const base = treeParts('broad', seed, { dens: 0.5 });
  const trunk = base.trunk.clone().scale(1.3, 1.25, 1.3);
  const parts = [base.crown.clone().scale(1.35, 1.2, 1.35)];
  const hang = [0, 1, 2].map((k) => treeParts('shrub', seed * 3 + k, { dens: 0.6 }).crown);
  const n = 13;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.35, d = 3.4 + r() * 1.3;
    parts.push(hang[i % 3].clone().scale(1.25, 3.2 + r() * 0.8, 1.25).translate(Math.cos(a) * d, 1.4 + r() * 0.7, Math.sin(a) * d));
  }
  return { trunk, crown: BufferGeometryUtils.mergeGeometries(parts) };
}
function reedGeometry(seed) {
  const parts = [0, 1, 2].map((k) => treeParts('shrub', seed + k * 7, { dens: 0.8 }).crown.clone().scale(0.45, 1.5, 0.45).translate((k - 1) * 0.8, 0, (k % 2) * 0.6 - 0.3));
  return { trunk: treeParts('shrub', seed, { dens: 0.8 }).trunk.clone().scale(0.3, 0.3, 0.3), crown: BufferGeometryUtils.mergeGeometries(parts) };
}
const TK = ['oak', 'pine', 'poplar', 'fruit', 'willow', 'street', 'reed', 'shrub'].map((k, i) => {
  const g = k === 'reed' ? reedGeometry(17) : k === 'shrub' ? treeParts('shrub', 23, { dens: 0.7 }) : k === 'willow' ? willowGeometry(41) : treeGeometry(k === 'street' ? 'oak' : k, i * 5 + 2, { dens: k === 'street' || k === 'willow' ? 0.7 : 0.45 });
  const max = { oak: LOW ? 3600 : 16000, pine: LOW ? 1800 : 9000, poplar: LOW ? 1400 : 2600, fruit: LOW ? 1500 : 6000, willow: LOW ? 500 : 1100, street: LOW ? 1800 : 5000, reed: LOW ? 1500 : 2400, shrub: LOW ? 600 : 1300 }[k];
  const crown = instanced(g.crown, leafMat([0x40602a, 0x2c4a22, 0x4f6a2a, 0x557230, 0x74923c, 0x48662a, 0x8a8f45, 0x3f5a26][i]), max), trunk = instanced(g.trunk, barkMat(0x4a3b2c), max);
  crown.count = trunk.count = 0;
  crown.frustumCulled = trunk.frustumCulled = false;
  crown.castShadow = trunk.castShadow = true;
  scene.add(crown, trunk);
  return { k, crown, trunk, max, n: 0 };
});
const [OAK, PINE, POPLAR, FRUIT, WILLOW, STREET, REED, SHRUB] = TK;
const PER_FOREST = LOW ? 4 : 13;

const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), eul = new THREE.Euler(), cTmp = new THREE.Color();

function addTree(T, x, z, s, rot, tone) {
  if (T.n >= T.max) return;
  const y = hW(x, z) - 0.25;
  m4.compose(v3.set(x, y, z), q0.setFromEuler(eul.set(0, rot, 0)), s3.setScalar(s));
  T.crown.setMatrixAt(T.n, m4); T.trunk.setMatrixAt(T.n, m4);
  T.crown.setColorAt(T.n, cTmp.setRGB(0.8 + 0.4 * tone, 0.85 + 0.3 * tone, 0.8 + 0.3 * (1 - tone)));
  T.n++;
}

// Kıyı ağaçları: kavak sıraları (kıyı üstünde, düzenli aralıklı) ve suya eğilen söğütler (şev dibinde); sabit liste
const riparian = [];
{
  const r = seeded(31);
  for (const s of [-1, 1]) {
    let x = -XMAX + 40;
    while (x < XMAX - 40) {
      // kesimler: kavak sırası / söğüt topluluğu / açık çakıl kıyı
      const kind = r(), len = 60 + r() * 140;
      const end = Math.min(XMAX - 40, x + len);
      if (kind < 0.42) { for (; x < end; x += 6.5 + r() * 2.5) riparian.push([x, s, 5.5 + r() * 2.5, 0.85 + r() * 0.35, r() * 6.28, r(), 2]); }
      else if (kind < 0.8) { for (; x < end; x += 9 + r() * 9) riparian.push([x, s, 0.8 + r() * 3.5, 0.85 + r() * 0.4, r() * 6.28, r(), 4]); }
      else x = end;
      x += 10 + r() * 30;
    }
  }
  // saz kümeleri (su kenarı: yatak içinde, kıyıya yakın) ve şevde çalılar
  for (const s of [-1, 1]) for (let x = -2600; x < 2600; x += 3 + r() * 9) {
    if (r() < 0.25) { x += 20 + r() * 40; continue; }
    riparian.push([x, s, -(3.6 + r() * 2.4), 0.8 + r() * 0.5, r() * 6.28, r(), 6]);
    if (r() < 0.3) riparian.push([x + 1.5, s, -(0.5 + r() * 2.0), 0.9 + r() * 0.5, r() * 6.28, r(), 7]);
  }
}

// --- Kent: her kent hücresi (100 m ada) motorun kent kitiyle gerçek binalara dönüşür ---
// Konut adası: yola bakan apartman/ev sırası (merkezde bitişik nizam, dükkânlı); cadde hücresi: ortadan geçen bulvar ve iki
// yanında dükkânlı apartmanlar; otopark hücresi: market/depo + park çizgili asfalt ve park etmiş araçlar; bahçe hücresi: park.
const cellCity = new Map();                                // anahtar → { group, city, flood: [...] }
let variant = '';
let buildQ = [];
const E = 6.5;                                             // sokak ekseninden bina cephesine (4 m yol + 2,5 m kaldırım)
const variantKey = () => (P.greenRoof ? 'g' : '') + (P.encroach ? 'e' : '');
function lotsFor(c) {
  const x0 = c.xm - CELL / 2, x1 = c.xm + CELL / 2, z0 = c.zm - CELL / 2, z1 = c.zm + CELL / 2;
  const dc = Math.hypot(c.xm - TOWN[0], (c.zm - TOWN[1]) * 1.3);
  const core = dc < 420, midT = dc < 950;
  const seed = c.i * 131 + c.j * 17 + 5;
  const r = seeded(seed);
  let lots = [];
  if (c.sub === 'roof') {
    lots = makeBlock({ x0: x0 + E, x1: x1 - E, z0: z0 + E, z1: z1 - E }, {
      seed, gap: core ? (r() < 0.5 ? 0 : 2.5) : midT ? 3 + r() * 2 : 7, shops: core ? 0.65 : 0.15,
      mix: core ? { apartment: 0.85, house: 0.15 } : midT ? { apartment: 0.5, house: 0.5 } : { house: 0.85, apartment: 0.15 },
      width: midT ? [11, 19] : [10, 15], roofs: { hip: 0.55 },
      floors: (x, z, rr, t) => (t === 'apartment' ? (core ? 5 + Math.floor(rr() * 3) : 3 + Math.floor(rr() * 3)) : undefined),
    });
  } else if (c.sub === 'road') {
    for (const [a, b] of [[z0 + E, c.zm - 11], [c.zm + 11, z1 - E]]) {
      lots.push(...makeBlock({ x0: x0 + E, x1: x1 - E, z0: a, z1: b }, {
        seed: seed + a, gap: 0, shops: 0.95, mix: { apartment: 0.9, office: 0.1 }, depth: [11, 14],
        floors: (x, z, rr, t) => (t === 'apartment' ? (core ? 5 : 4) + Math.floor(rr() * 3) : 5 + Math.floor(rr() * 4)),
      }));
    }
  } else if (c.sub === 'pave') {
    const pub = r() < 0.55;
    lots.push({ type: pub ? 'public' : 'industrial', x: c.xm + (r() - 0.5) * 12, z: z0 + E + 15, width: 44 + r() * 14, depth: 26, rot: 0, floors: 1, roof: pub ? 'flat' : undefined, seed: seed + 0.3 });
  }
  const lim = P.encroach && c.bank ? cwM + BANKW + 1.5 : cwM + BANKW + 13;
  lots = lots.filter((L) => Math.abs(L.z - czM(L.x)) - Math.max(L.width ?? 14, L.depth ?? 12) / 2 > lim);
  for (const L of lots) {
    const R = Math.hypot(L.width ?? 14, L.depth ?? 12) / 2;
    L.y0 = Math.min(hW(L.x - R, L.z - R), hW(L.x + R, L.z - R), hW(L.x - R, L.z + R), hW(L.x + R, L.z + R), hW(L.x, L.z)) - 0.08;
    if (P.greenRoof) { L.roof = 'flat'; L.colors = { ...(L.colors || {}), roof: 0x5f7f35 }; }
  }
  return lots;
}
function buildCell(c) {
  const lots = lotsFor(c);
  const e = { group: null, city: null, flood: [] };
  if (lots.length) {
    e.city = populateCity({ lots, seed: c.idx, tile: CELL, near: LOW ? 170 : 260, budget: 6, camera: sim.camera, noRaycast: true });
    e.group = e.city.group;
    scene.add(e.group);
    for (const S of e.city.specs) {
      const elev = S.y0 + 0.08 - bedM(S.x);
      if (elev < 7) e.flood.push({ x: S.x, z: S.z, top: S.y0 + S.height, elev });
    }
  }
  cellCity.set(c.idx, e);
  return e;
}
function dropCity() {
  for (const e of cellCity.values()) if (e.group) { scene.remove(e.group); e.city.dispose(); }
  cellCity.clear();
}
// Hücreleri kameraya yakınlık sırasıyla üret (kare başına bütçe). Bellek sınırı: yalnız kameranın RMAX çevresindeki
// kentsel hücrelerde bina üretilir; uzaklaşan hücreler bırakılır (uzakta zemin dokusu adaları/sokakları gösterir).
const RMAX = LOW ? 700 : 1300;
const qCam = new THREE.Vector3(1e9, 0, 0);
let urbanNow = [];
function requeue() {
  const cam = sim.camera.position;
  qCam.copy(cam);
  const d = (c) => Math.hypot(c.xm - cam.x, c.zm - cam.z);
  for (const c of urbanNow) if (cellCity.has(c.idx) && d(c) > RMAX * 1.3) {
    const e = cellCity.get(c.idx);
    if (e.group) { scene.remove(e.group); e.city.dispose(); }
    cellCity.delete(c.idx); floodedPrev = -2;
  }
  buildQ = urbanNow.filter((c) => !cellCity.has(c.idx) && d(c) < RMAX).sort((a, b) => d(a) - d(b));
}
function pumpCity(ms) {
  const cam = sim.camera.position;
  if (Math.hypot(cam.x - qCam.x, cam.z - qCam.z) > 180) requeue();
  if (!buildQ.length) return;
  const t0 = performance.now();
  while (buildQ.length && performance.now() - t0 < ms) {
    const c = buildQ.shift();
    if (c.state !== 'urban' || cellCity.has(c.idx)) continue;
    buildCell(c);
    floodedPrev = -2;
  }
}

// Park etmiş araçlar: otoparklarda ve bulvar kenarında (kasabaya yakın hücreler)
const NCAR = LOW ? 160 : 420;
const fleet = carFleet(NCAR, { seed: 12 });
scene.add(fleet.group);
function placeCars(urbanCells) {
  let k = 0;
  const r = seeded(77);
  const near = [...urbanCells].sort((a, b) => Math.hypot(a.xm - TOWN[0], a.zm - TOWN[1]) - Math.hypot(b.xm - TOWN[0], b.zm - TOWN[1]));
  for (const c of near) {
    if (k >= NCAR) break;
    if (Math.abs(c.zm - czM(c.xm)) < cwM + BANKW + 40) continue;
    const x0 = c.xm - CELL / 2, z0 = c.zm - CELL / 2;
    if (c.sub === 'pave') {
      // park yerleri: 2,6 m aralık, sıralar hücre ortasından 13 m arayla (dik park)
      for (const zr of [-45.5, -32.5, -19.5, -6.5, 6.5, 19.5, 32.5, 45.5].map((d) => c.zm + d)) {
        if (zr < z0 + 38 || zr > z0 + CELL - 8) continue;
        for (let x = Math.ceil((x0 + 9) / 2.6) * 2.6 + 1.3; x < x0 + CELL - 9 && k < NCAR; x += 2.6) {
          if (r() < 0.4) continue;
          const yaw = (r() < 0.5 ? 1 : -1) * Math.PI / 2 + (r() - 0.5) * 0.05;
          fleet.set(k++, x, hW(x, zr) + 0.02, zr - Math.sin(-yaw) * 2.2, yaw);
        }
      }
    } else if (c.sub === 'road') {
      for (const s of [-1, 1]) for (let x = x0 + 10; x < x0 + CELL - 10 && k < NCAR; x += 5.6 + r() * 3) {
        if (r() < 0.4) continue;
        const zz = c.zm + s * 6.9;
        fleet.set(k++, x, hW(x, zz) + 0.02, zz, s > 0 ? 0 : Math.PI);
      }
    }
  }
  for (let i = k; i < NCAR; i++) fleet.hide(i);
  fleet.commit();
}

// Su basan bina işaretleri: çatının üstünde parlayan mavi damla
const DROP_MAX = LOW ? 600 : 1500;
const drops3 = instanced(new THREE.LatheGeometry([[0.001, 0], [0.5, 0.9], [1.05, 2.1], [1.2, 2.9], [1.05, 3.5], [0.6, 3.9], [0.001, 4.05]].map(([a, b]) => new THREE.Vector2(a, b)), 20),
  mat.glow({ color: 0x3b82f6, intensity: 2.2 }), DROP_MAX);
drops3.count = 0; drops3.frustumCulled = false; drops3.userData.noShadow = true;
scene.add(drops3);

const P = { urban: 0.3, greenRoof: false, permeable: false, rainGarden: false, pond: false, encroach: false, amc: 'normal', forestShare: 0.6 };
let floodList = [];

function applyLandUse() {
  const land = landCells();
  cells.forEach((c) => { c.state = 'meadow'; c.bank = false; if (c.ad < CW + 0.05) c.state = 'channel'; });
  const nUrban = Math.round(P.urban * land.length);
  const byScore = [...land].sort((a, b) => a.score - b.score);
  byScore.slice(0, nUrban).forEach((c) => (c.state = 'urban'));
  // Dere yatağına yapılaşma: kıyıdaki şerit binalarla dolar
  if (P.encroach) cells.forEach((c) => { if (c.ad < CW + 0.8 && Math.abs(c.x - 3.5) < 7 && Math.abs(c.zm - czM(c.xm)) > 10) { c.state = 'urban'; c.sub = c.sub === 'garden' ? 'roof' : c.sub; c.bank = true; } });
  const nat = land.filter((c) => c.state !== 'urban').sort((a, b) => b.forestKey - a.forestKey);
  nat.slice(0, Math.round(nat.length * 0.6)).forEach((c) => (c.state = 'forest'));

  // Hücre dokusu
  for (const c of cells) {
    const o = (c.j * NX + c.i) * 4;
    luData[o] = c.state === 'forest' ? 255 : 0;
    luData[o + 1] = c.state === 'urban' ? 255 : 0;
    luData[o + 2] = Math.round(SUBK[c.sub] / 3 * 255);
    luData[o + 3] = c.bank ? 255 : 0;
  }
  luTex.needsUpdate = true;
  LU.uPerm.value = P.permeable ? 1 : 0;
  LU.uRG.value = P.rainGarden ? 1 : 0;
  LU.uGap.value = P.encroach ? cwM + BANKW + 0.8 : cwM + BANKW + 8;

  // Binalar: değişen seçenekte (yeşil çatı, yatağa yapılaşma) hepsi yeniden; yoksa önbellekten aç/kapa
  const vk = variantKey();
  if (vk !== variant) { dropCity(); variant = vk; }
  const urban = cells.filter((c) => c.state === 'urban');
  for (const e of cellCity.values()) if (e.group) e.group.visible = false;
  urbanNow = urban;
  requeue();
  for (const c of urban) { const e = cellCity.get(c.idx); if (e?.group) e.group.visible = true; }
  placeCars(urban);

  // Ağaçlar
  TK.forEach((T) => (T.n = 0));
  const r = seeded(11);
  for (const c of cells) {
    const x0 = c.xm - CELL / 2, z0 = c.zm - CELL / 2;
    const dcam = Math.hypot(c.xm - TOWN[0], c.zm - TOWN[1]);
    if (c.state === 'urban' && (c.sub === 'roof' || c.sub === 'road')) {
      // cadde ağaçları (kaldırımda, 11–14 m arayla) ve arka bahçelerde meyve ağaçları
      if (dcam < (LOW ? 700 : 1300)) for (let s = 8; s < CELL - 8; s += 11 + r() * 3) {
        for (const [x, z] of [[x0 + s, z0 + 5.2], [x0 + s, z0 + CELL - 5.2], [x0 + 5.2, z0 + s], [x0 + CELL - 5.2, z0 + s]]) {
          if (r() < 0.35 || Math.abs(z - czM(x)) < LU.uGap.value + 6) continue;
          addTree(STREET, x, z, 0.62 + r() * 0.2, r() * 6.28, r());
        }
      }
      if (c.sub === 'roof') for (let k = 0; k < (LOW ? 2 : 5); k++) {
        const x = c.xm + (r() - 0.5) * 36, z = c.zm + (r() - 0.5) * 36;
        if (Math.abs(z - czM(x)) > LU.uGap.value + 10) addTree(r() < 0.6 ? FRUIT : OAK, x, z, 0.8 + r() * 0.4, r() * 6.28, r());
      }
    } else if (c.state === 'urban' && c.sub === 'pave') {
      for (let k = 0; k < 6; k++) addTree(STREET, x0 + 12 + k * 15, z0 + CELL - 7.5, 0.6 + r() * 0.2, r() * 6.28, r());
    } else if (c.state === 'meadow' && c.ad >= CW + 0.05) {
      // parsel sınırında tek tük ağaç (çit ağaçları)
      for (let k = 0; k < (LOW ? 1 : 4); k++) {
        const e = r(), x = r() < 0.5 ? x0 + 2 + r() * (CELL - 4) : x0 + (e < 0.5 ? 1.5 : CELL - 1.5), z = z0 + (r() < 0.5 ? 1.5 : CELL / 2 + 1.5) + (r() < 0.3 ? r() * (CELL / 2 - 3) : 0);
        if (Math.abs(z - czM(x)) < cwM + BANKW + 20) continue;
        addTree(r() < 0.7 ? OAK : POPLAR, x, z, 0.8 + r() * 0.5, r() * 6.28, r());
      }
    } else if (c.state === 'urban' && c.sub === 'garden') {
      for (let k = 0; k < (LOW ? 5 : 12); k++) {
        const x = x0 + 12 + r() * (CELL - 24), z = z0 + 12 + r() * (CELL - 24);
        if (Math.abs(z - czM(x)) > LU.uGap.value + 6) addTree(r() < 0.6 ? OAK : r() < 0.5 ? POPLAR : FRUIT, x, z, 0.8 + r() * 0.5, r() * 6.28, r());
      }
    } else if (c.state === 'forest') {
      for (let k = 0; k < PER_FOREST; k++) {
        const x = x0 + 4 + r() * (CELL - 8), z = z0 + 4 + r() * (CELL - 8);
        if (Math.abs(z - czM(x)) < cwM + BANKW + 16) continue;
        const T = c.ad > FPW + 1.5 && r() < 0.55 ? PINE : OAK;
        addTree(T, x, z, 0.75 + r() * 0.55, r() * 6.28, r());
      }
    }
  }
  for (const [x, s, off, sc, rot, tone, kind] of riparian) {
    const z = czM(x) + s * (cwM + BANKW + off - (kind === 4 ? 2.2 : 0));
    const c = cellAtM(x, z);
    if (P.encroach && c.bank && kind === 2) continue;
    if (BRIDGES.some((bx) => Math.abs(x - bx) < 12)) continue;
    addTree(TK[kind], x, z, sc, rot, tone);
  }
  TK.forEach((T) => { T.crown.count = T.trunk.count = T.n; });
  for (const m of TK.flatMap((T) => [T.crown, T.trunk])) {
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
  floodedPrev = -2;
}
// --- Su yüzeyi (dere + taşkın): dere ekseni boyunca şerit, genişliği su seviyesine göre ---
const WX = steps([[XMAX, LOW ? 10 : 5]]);
const WXS = [...WX.slice(1).reverse().map((v) => -v), ...WX];
const WN = 17;
const waterGeo = new THREE.BufferGeometry();
{
  const idx = [];
  waterGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WXS.length * WN * 3), 3));
  for (let i = 0; i < WXS.length - 1; i++) for (let k = 0; k < WN - 1; k++) { const a = i * WN + k, b = a + WN; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  waterGeo.setIndex(idx);
}
const waterMat = procedural({
  key: 'sel-water', physical: true, bump: 0.035,
  params: { color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.9, ior: 1.33, specularIntensity: 1 },
  uniforms: { uT: { value: 0 }, uMud: { value: 0 }, uWS: { value: 0.1 }, uWC: { value: cwM } },
  pattern: /* glsl */ `
    vec2 q = p.xz;
    float r1 = vn3(vec3(q.x*0.3 - uT*1.2, q.y*0.8, uT*0.25)), r2 = vn3(vec3(q.x*1.6 - uT*2.4, q.y*1.9, uT*0.6));
    h = r1*0.6 + r2*0.4;
    float wz = 240.0*sin(p.x/800.0 + 0.5) + 34.0*sin(p.x/190.0 + 1.1) + 26.0*sin(p.x/85.0 + 0.3);
    float wn = abs(p.z - wz)/max(uWC, 1.0);
    float bedH = wn < 1.0 ? 0.55*wn*wn : ${BANKFULL_D.toFixed(1)}*min(1.0, (wn - 1.0)*uWC/${BANKW}.0) + max(0.0, (wn - 1.0)*uWC - ${BANKW}.0)*${FP_S};
    float dd = clamp((uWS - bedH)/max(min(uWS, 0.6), 0.05), 0.0, 1.0);   // göreli derinlik: talvegde 1, kıyı çizgisinde 0
    col = mix(vec3(0.3, 0.33, 0.25), vec3(0.035, 0.075, 0.07), smoothstep(0.0, 0.7, dd));
    float foam = smoothstep(0.72, 0.9, vn3(vec3(q.x*0.9 - uT*2.0, q.y*2.2, uT*0.4)))*(0.25 + 0.75*uMud);
    col = mix(col, vec3(0.4, 0.31, 0.21), uMud);
    col *= 0.88 + 0.2*fbm3(vec3(q*0.02, uT*0.03), 3);
    col = mix(col, vec3(0.72, 0.68, 0.6), foam*0.35);
    rough = mix(0.05, 0.16, uMud) + foam*0.2;`,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.userData.noCast = true;
water.renderOrder = 1;
scene.add(water);
let waterKey = '';
function shapeWater(stage) {
  // taşkın genişliği: kanal içinde şev boyunca, kıyıyı aşınca düzlükte 1,5 m / 200 m
  const ext = stage <= BANKFULL_D ? cwM + BANKW * stage / BANKFULL_D : Math.min(FPW_M + 40, cwM + BANKW + (stage - BANKFULL_D) / FP_S);
  const e = ext + 3;
  const key = e.toFixed(1) + ':' + stage.toFixed(3);
  if (key === waterKey) return;
  waterKey = key;
  const p = waterGeo.attributes.position;
  WXS.forEach((x, i) => { const c = czM(x), y = bedM(x) + stage + 0.02; for (let k = 0; k < WN; k++) p.setXYZ(i * WN + k, x, y, c + (k / (WN - 1) * 2 - 1) * e); });
  p.needsUpdate = true;
  waterGeo.computeVertexNormals();
  waterGeo.computeBoundingSphere();
}

// Bekletme havuzu (150.000 m³): 290 × 170 m, 3 m derin, beton sedde
const pond = new THREE.Group();
const PW = 290, PD = 170, PDEP = 3;
{
  const px = -240, pz = czM(-240) + 420;
  const rr = (w, d, r) => { const s = new THREE.Shape(); s.moveTo(-w / 2 + r, -d / 2); s.lineTo(w / 2 - r, -d / 2); s.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r); s.lineTo(w / 2, d / 2 - r); s.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); s.lineTo(-w / 2 + r, d / 2); s.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); s.lineTo(-w / 2, -d / 2 + r); s.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2); return s; };
  const outer = rr(PW + 14, PD + 14, 24), hole = rr(PW, PD, 18);
  outer.holes.push(hole);
  const y0 = Math.min(hW(px - PW / 2, pz - PD / 2), hW(px + PW / 2, pz - PD / 2), hW(px - PW / 2, pz + PD / 2), hW(px + PW / 2, pz + PD / 2));
  const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: PDEP + 1.5, bevelEnabled: true, bevelThickness: 0.4, bevelSize: 0.6, bevelSegments: 2, curveSegments: 8 }).rotateX(-Math.PI / 2), mat.concrete({ color: 0xa6a298, stains: 0.7 }));
  rim.position.y = y0 - 1.2;
  const pw = new THREE.Mesh(new THREE.ShapeGeometry(hole, 8).rotateX(-Math.PI / 2), waterMat);
  pw.userData.noCast = true;
  pw.position.y = y0;
  pond.add(rim, pw);
  pond.userData = { water: pw, y0 };
  pond.position.set(px, 0, pz);
  pond.rotation.y = -0.1;
  scene.add(pond);
  sim.label('Bekletme havuzu', { parent: pond, position: [0, y0 + 30, 0], className: 'plain' });
}

// Köprüler: caddeler dereyi betondan tabliyeli köprülerle geçer (kenar kirişi, korkuluk, ayaklar, kenar bordürü)
{
  const deckM = mat.concrete({ color: 0xb8b3a8, stains: 0.55 }), railM = mat.paintedMetal({ color: 0x5b6269, wear: 0.3 });
  const abutM = mat.concrete({ color: 0xa8a398, stains: 0.9 }), asphM = mat.asphalt();
  for (const bx of BRIDGES) {
    const bc = czM(bx), L = 2 * (cwM + BANKW) + 16;
    const y = Math.max(hW(bx, bc - L / 2), hW(bx, bc + L / 2)) + 0.25;
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new RoundedBoxGeometry(11, 0.9, L, 2, 0.12), deckM);
    deck.position.y = y - 0.45;
    const top = new THREE.Mesh(new RoundedBoxGeometry(7.6, 0.08, L, 1, 0.02), asphM);
    top.position.y = y + 0.02;
    g.add(deck, top);
    for (const s of [-1, 1]) {
      const kerb = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.25, L, 1, 0.05), deckM);
      kerb.position.set(s * 4.6, y + 0.12, 0);
      const post = new THREE.InstancedMesh(new RoundedBoxGeometry(0.08, 1.05, 0.08, 1, 0.02), railM, Math.floor(L / 1.6));
      for (let k = 0; k < post.count; k++) post.setMatrixAt(k, m4.makeTranslation(s * 5.25, y + 0.77, -L / 2 + 0.8 + k * 1.6));
      const rail = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.1, L, 1, 0.03), railM);
      rail.position.set(s * 5.25, y + 1.3, 0);
      const rail2 = rail.clone(); rail2.position.y = y + 0.8;
      g.add(kerb, post, rail, rail2);
      // kıyı ayakları (kanat duvarlı)
      const abut = new THREE.Mesh(new RoundedBoxGeometry(12, 4.5, 3.2, 2, 0.15), abutM);
      abut.position.set(0, y - 2.9, s * (cwM + BANKW + 0.5));
      g.add(abut);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(bx, 0, bc);
    scene.add(g);
  }
}

// Limnimetre (su seviyesi ölçer) — kasabada, kıyıda; her metrede kırmızı/beyaz, 10 cm çentik
const GX = 900;
const gauge = new THREE.Group();
{
  const staff = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5, 0.05).translate(0, 2.5, 0), procedural({
    key: 'sel-staff', params: { roughness: 0.45 },
    pattern: /* glsl */ `
      float m = floor(p.y), f = fract(p.y);
      col = mod(m, 2.0) < 0.5 ? vec3(0.8, 0.06, 0.05) : vec3(0.92);
      float tick = step(fract(p.y*10.0), 0.18)*step(0.0, p.x)*step(p.x, 0.08);
      col = mix(col, vec3(0.03), max(tick, step(f, 0.03)));`,
  }));
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 6.5, 12).translate(0, 2.75, -0.1), mat.brushedMetal({ color: 0x9aa0a6 }));
  const bf = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.08, 0.2, 1, 0.02), mat.paintedMetal({ color: 0xd11f1f, wear: 0.1 }));
  bf.position.y = BANKFULL_D;
  gauge.add(post, staff, bf);
  scene.add(gauge);
}
const gaugeLbl = sim.label('', { parent: gauge, position: [0, 7.5, 0] });
function placeGauge() { gauge.position.set(GX, bedM(GX), czM(GX) - (cwM + 0.6)); }

sim.label('Kasaba', { position: [700, hW(700, czM(700) - 420) + 60, czM(700) - 420], className: 'plain' });
sim.label('Dere →', { position: [-1800, bedM(-1800) + 40, czM(-1800)], className: 'plain' });
sim.label('Yukarı havza (tepeler)', { position: [-1600, hW(-1600, -1500) + 90, -1500], className: 'plain' });

// --- Yağmur: kameranın çevresinde gerçek boyda damla izleri (hava aynı zamanda puslanır) ---
const RN = LOW ? 1600 : 3200, RBOX = 90;
const rainPos = new Float32Array(RN * 6);
const rainGeo = new THREE.BufferGeometry();
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainSeed = seeded(3);
const drops = Array.from({ length: RN }, () => [rainSeed() * 2 - 1, rainSeed() * 2 - 1, rainSeed() * 2 - 1, 0.7 + rainSeed() * 0.6]);
const rainMat = new THREE.LineBasicMaterial({ color: 0xc8d4de, transparent: true, opacity: 0.12, depthWrite: false });
const rainLines = new THREE.LineSegments(rainGeo, rainMat);
rainLines.frustumCulled = false;
rainLines.userData.noShadow = true;
scene.add(rainLines);

// --- Parametreler ve hesap ---
const R = { i: 60, dur: 1 };
let run, ref, tMin = 0, chartIdx = 0, floodedPrev = -1, ended = false;
const STEP = 3;   // grafik noktası / dk

const ch = () => (P.encroach ? CH.dar : CH.dogal);
function recompute(restart = false) {
  run = simulate(P, R.i, R.dur);
  ref = simulate({ ...P, urban: 0.05, greenRoof: false, permeable: false, rainGarden: false, pond: false, encroach: false }, R.i, R.dur);
  if (restart) { tMin = 0; ended = false; }
  chart.clear(); stageChart.clear();
  chartIdx = 0;
  pushCharts();
  updateStats();
}
function pushCharts() {
  const bq = bankfullQ(ch());
  while (chartIdx * STEP <= Math.min(tMin, T_END)) {
    const k = chartIdx * STEP;
    chart.push([ref.Q[k], run.Q[k], bq]);
    stageChart.push([stageOf(run.Q[k], ch()), BANKFULL_D]);
    chartIdx++;
  }
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('🏙️ Havza');
ui.slider({ label: 'Kentleşme', min: 0, max: 90, step: 1, value: P.urban * 100, unit: '%',
  onInput: (v) => { P.urban = v / 100; applyLandUse(); recompute(); } });
ui.select({ label: 'Toprak nemi (önceki günler)', value: 'normal', options: [{ value: 'kuru', label: 'Kuru (uzun süre yağışsız)' }, { value: 'normal', label: 'Normal' }, { value: 'islak', label: 'Islak (art arda yağış)' }],
  onChange: (v) => { P.amc = v; recompute(); } });

ui.section('🌧️ Yağış');
const iS = ui.slider({ label: 'Yağış şiddeti', min: 5, max: 100, step: 1, value: R.i, unit: 'mm/sa', onChange: (v) => { R.i = v; recompute(true); } });
const dS = ui.slider({ label: 'Süre', min: 0.5, max: 6, step: 0.5, value: R.dur, unit: 'sa', onChange: (v) => { R.dur = v; recompute(true); } });
const preset = (i, d) => { R.i = i; R.dur = d; iS.set(i); dS.set(d); recompute(true); };
ui.buttons([
  { label: '🌦 Hafif', onClick: () => preset(8, 3) },
  { label: '⛈ Sağanak', variant: 'primary', onClick: () => preset(60, 1) },
  { label: '🌧 Uzun', onClick: () => preset(15, 6) },
]);
ui.button({ label: '▶ Olayı baştan oynat', onClick: () => { recompute(true); sim.play(); } });

ui.section('🌱 Önlemler (ve bir hata)');
const tog = (label, key, relayout = true) => ui.toggle({ label, value: P[key], onChange: (v) => { P[key] = v; if (relayout) applyLandUse(); recompute(); } });
tog('Yeşil çatılar', 'greenRoof');
tog('Geçirgen kaldırım / otopark', 'permeable');
tog('Yağmur bahçeleri', 'rainGarden');
ui.toggle({ label: 'Bekletme havuzu (150.000 m³)', value: false, onChange: (v) => { P.pond = v; pond.visible = v; recompute(); } });
ui.toggle({ label: '⚠️ Dere yatağına yapılaşma', value: false, onChange: (v) => {
  P.encroach = v; CW = v ? 0.2 : 0.34; cwM = (v ? CH.dar : CH.dogal).b / 2; LU.uCW.value = cwM; waterKey = '';
  shapeTerrain(); applyLandUse(); placeGauge(); recompute();
} });

ui.section('📊 Sonuçlar');
const stPeak = ui.stat({ label: 'Pik debi', unit: 'm³/s' });
const stRef = ui.stat({ label: 'Doğal durumda pik', unit: 'm³/s' });
const stTp = ui.stat({ label: 'Pike varış (yağış başından)', unit: 'dk' });
const stC = ui.stat({ label: 'Akış katsayısı (hacim)' });
const stNow = ui.stat({ label: 'Şu anki debi', unit: 'm³/s' });
const stStage = ui.stat({ label: 'Su seviyesi', unit: 'm' });
const stFlood = ui.stat({ label: 'Su basan bina' });
const stCN = ui.stat({ label: 'Havza CN' });
const chart = ui.chart({ title: 'Hidrograf: debi (m³/s) — zaman', series: [{ name: 'Doğal (%5 kent)', color: '#22c55e' }, { name: 'Senaryo', color: '#38bdf8', fill: true }, { name: 'Kıyı dolu debi', color: '#ef4444' }], maxPoints: Math.floor(T_END / STEP) + 1, yMin: 0 });
const stageChart = ui.chart({ title: 'Dere su seviyesi (m)', series: [{ name: 'Seviye', color: '#60a5fa', fill: true }, { name: 'Kıyı (taşma sınırı)', color: '#ef4444' }], maxPoints: Math.floor(T_END / STEP) + 1, yMin: 0, height: 80 });
const ratCard = ui.text('', 'card');

function updateStats() {
  stPeak.set(run.peak, run.peak > bankfullQ(ch()) ? 'bad' : run.peak > 0.7 * bankfullQ(ch()) ? 'warn' : 'good');
  stRef.set(ref.peak);
  stTp.set(run.tPeak);
  stC.set(fmt(run.C, 2), run.C > 0.4 ? 'bad' : run.C > 0.25 ? 'warn' : 'good');
  stCN.set(fmt(run.cn, 0));
  const rat = rational(P, R.i, R.dur);
  ratCard.set(`Toplam yağış <b>${fmt(R.i * R.dur, 0)} mm</b> → yüzey akışı <b>${fmt(run.runVol / 1e3, 0)} bin m³</b>` +
    ` (doğal durumda ${fmt(ref.runVol / 1e3, 0)} bin m³).<br>Gecikme süresi <b>${fmt(run.lag * 60, 0)} dk</b> (doğal: ${fmt(ref.lag * 60, 0)} dk).` +
    `<br>Rasyonel yöntem: Q = C·i·A/3,6 = ${fmt(rat.C, 2)} × ${fmt(R.i, 0)} × ${fmt(AREA_KM2, 1)} / 3,6 ≈ <b>${fmt(rat.Q, 0)} m³/s</b>` +
    ` <small>(tepe değer için üst sınır; havza tutmasını ve ötelemeyi yok sayar)</small>` +
    `<br>Kıyı dolu kapasite: <b>${fmt(bankfullQ(ch()), 0)} m³/s</b>${P.encroach ? ' <span style="color:var(--bad)">(daralmış yatak)</span>' : ''}.`);
}

// --- Zaman döngüsü ---
const MIN_PER_SEC = 8;
let stageNow = 0, rainNow = 0, rainSky = -1, wetNow = 0;
sim.onUpdate((dt) => {
  if (ended) return;
  tMin = Math.min(T_END, tMin + dt * MIN_PER_SEC);
  pushCharts();
  if (tMin >= T_END) { ended = true; sim.toast('Olay bitti. Ayarları değiştir ya da "Olayı baştan oynat".'); }
});

const _cam = new THREE.Vector3(), _fw = new THREE.Vector3();
const wrapS = (v) => v - 2 * RBOX * Math.round(v / (2 * RBOX));   // kutu içinde dünyaya sabit konum
let statTick = 0;
sim.onRender((dt) => {
  const k = Math.min(T_END, Math.floor(tMin));
  const Q = run.Q[k];
  const target = stageOf(Q, ch());
  stageNow += (target - stageNow) * Math.min(1, dt * 4);
  shapeWater(stageNow);
  LU.uStage.value = Math.max(LU.uStage.value - dt * 0.02, stageNow);   // ıslak iz yavaş kurur
  waterMat.opacity = lerp(0.9, 0.96, clamp(stageNow / 1.5, 0, 1));
  waterMat.userData.uniforms.uWS.value = stageNow; waterMat.userData.uniforms.uWC.value = cwM;
  pumpCity(LOW ? 6 : 10);
  const bq = bankfullQ(ch());
  waterMat.userData.uniforms.uMud.value = clamp(Q / bq - 0.3, 0, 1) * 0.8;
  waterMat.userData.uniforms.uT.value = sim.time;
  rainNow = run.rain[k];
  // Gökyüzü: yağış şiddetiyle bulut, pus ve görüş mesafesi (adımlı güncelleme; ortam ışığı ≤ 1/sn yenilenir)
  const rs = Math.round(clamp(rainNow / 40, 0, 1) * 12) / 12;
  if (rs !== rainSky) {
    rainSky = rs;
    // Sağanakta görüş gerçekte 1–3 km'ye iner; burada vadi okunur kalsın diye pus sınırlı tutulur (yağmur izleri ayrıca çizilir)
    // Pozlama sönmesin: bulut ve pus ölçülü artar (yağmurun kendisi damla izleri ve ıslak yüzeylerle okunur)
    sim.sky.set({ clouds: lerp(0.3, 0.72, rs), haze: lerp(1.05, 1.22, rs), visibility: lerp(20000, 12000, rs) });
  }
  wetNow += ((rainNow > 1 ? 1 : 0) - wetNow) * Math.min(1, dt * (rainNow > 1 ? 0.8 : 0.05));
  landMat.userData.terrain.tWet.value = wetNow * 0.85;
  outerMat.userData.terrain.tWet.value = wetNow * 0.7;
  if (pond.visible) pond.userData.water.position.y = pond.userData.y0 - 0.9 + run.pond[k] * PDEP;

  // Yağmur izleri: kameranın önündeki kutuda, dünyaya göre sabit düşüş
  const n = rainOn.value ? Math.round(clamp(rainNow / 80, 0, 1) * RN) : 0;
  rainGeo.setDrawRange(0, n * 2);
  if (n) {
    sim.camera.getWorldPosition(_cam);
    sim.camera.getWorldDirection(_fw);
    const cx = _cam.x + _fw.x * RBOX * 0.8, cy = _cam.y + _fw.y * RBOX * 0.8, czz = _cam.z + _fw.z * RBOX * 0.8;
    const fall = 9 * dt / RBOX, len = 1.4;
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      d[1] -= fall * d[3];
      if (d[1] < -1) d[1] += 2;
      const xx = cx + wrapS(d[0] * RBOX - cx), y = cy + d[1] * RBOX, zz = czz + wrapS(d[2] * RBOX - czz);
      rainPos[i * 6] = xx; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = zz;
      rainPos[i * 6 + 3] = xx - 0.15; rainPos[i * 6 + 4] = y + len * d[3]; rainPos[i * 6 + 5] = zz;
    }
    rainGeo.attributes.position.needsUpdate = true;
  }

  // Taşkın: su kotu zemin kotunu aşan binalar (görünür kent hücrelerinde)
  let flooded = 0;
  if (floodedPrev === -2) {
    floodList = [];
    for (const c of cells) if (c.state === 'urban') { const e = cellCity.get(c.idx); if (e) floodList.push(...e.flood); }
  }
  for (const h of floodList) if (stageNow > h.elev + 0.05) flooded++;
  if (flooded !== floodedPrev) {
    let m = 0;
    if (markOn.value) for (const h of floodList) if (stageNow > h.elev + 0.05 && m < DROP_MAX) drops3.setMatrixAt(m++, m4.makeTranslation(h.x, h.top + 3, h.z));
    drops3.count = m; drops3.instanceMatrix.needsUpdate = true;
    if (flooded > floodedPrev && floodedPrev >= 0 && flooded > 0) sim.toast(`🌊 ${flooded} bina sular altında!`, 'bad');
    floodedPrev = flooded;
  }
  if (++statTick % 8 === 0) {
    stNow.set(Q);
    stStage.set(fmt(stageNow, 2), stageNow > BANKFULL_D ? 'bad' : stageNow > 0.75 * BANKFULL_D ? 'warn' : 'good');
    stFlood.set(flooded, flooded ? 'bad' : 'good');
    gaugeLbl.setText(`Su: ${fmt(stageNow, 2)} m ${stageNow > BANKFULL_D ? '⚠️ TAŞTI' : ''}`);
    gaugeLbl.el.style.color = stageNow > BANKFULL_D ? '#fca5a5' : '#e5ecf6';
  }
});

ui.section('👁️ Görünüm', { open: false });
const VIEWS = {
  dere: [[1040, 85, 380], [820, 4, 202]],
  genel: [[1500, 150, czM(1500) + 520], [650, 0, czM(650) - 60]],
  havza: [[2750, 620, 2150], [250, 20, -80]],
  olcer: [[GX + 40, bedM(GX) + 12, czM(GX) + 45], [GX, bedM(GX) + 2, czM(GX) - 4]],
};
ui.buttons([
  { label: 'Dere kenarı', onClick: () => sim.moveCamera(...VIEWS.dere) },
  { label: 'Kasaba ve vadi', onClick: () => sim.moveCamera(...VIEWS.genel) },
  { label: 'Havza', onClick: () => sim.moveCamera(...VIEWS.havza) },
  { label: 'Limnimetre', onClick: () => sim.moveCamera(...VIEWS.olcer) },
]);
const rainOn = ui.toggle({ label: 'Yağmur damlaları', value: true });
ui.toggle({ label: 'Ağaçlar', value: true, onChange: (v) => TK.forEach((T) => { T.crown.visible = T.trunk.visible = v; }) });
const markOn = ui.toggle({ label: 'Su basan binaları mavi işaretle', value: true, onChange: () => (floodedPrev = -2) });

sim.onReset(() => { recompute(true); stageNow = 0; });

pond.visible = false;
shapeTerrain();
placeGauge();
applyLandUse();
pumpCity(1e9);
recompute(true);
sim.moveCamera(...VIEWS.dere);
