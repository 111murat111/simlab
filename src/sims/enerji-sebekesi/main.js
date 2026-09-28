// Enerji Şebekesi — 24 saatlik talep eğrisi, güneş/rüzgâr değişkenliği ve öncelik sıralı dağıtım (ördek eğrisi).
import { createSim, THREE, fmt, clamp, lerp, rand, seeded, BufferGeometryUtils, RoundedBoxGeometry, mat, landscape, createTerrain, terrainSkirt, createVegetation,
  makeBlock, populateCity, makeBuilding, streetMaterials as groundMats, streetTrees, streetLamps, carFleet } from '@core';
import { createSmoke } from './smoke.js';
import { mats, latticeTower, windTurbine, coalPlant, gasPlant, dam, substation, batteryYard, solarField } from './grid.js';
import { SRC, STACK, step, newState, sunHeight, marginalCost } from './model.js';

const SEC_PER_HOUR = 2.5; // 1 gün = 60 s (1× hızda)
const START_H = 16;
const SUB = 1 / 12; // 5 dakikalık dağıtım adımı
const NDIST = 8;

const sim = createSim({
  sky: { elevation: 45, azimuth: 250, clouds: 0.25, haze: 1.0, visibility: 12000 },
  // Açılış karesi: güneydoğu ovasından, tarlalar ve ağaç sıraları üzerinden gaz ve kömür santraline, baraja ve rüzgâr sırtına
  camera: { position: [600, 44, 600], target: [263, 10, -234], fov: 50, near: 1, far: 60000 },
  controls: { maxDistance: 3600, minDistance: 90, maxPolarAngle: Math.PI * 0.48 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Bir şehri besleyen küçük bir elektrik şebekesi. Elektrik depolanamadığı için <b>üretim her an talebe eşit</b>
    olmalıdır. Talep sabah artar, akşam 19–21 arası zirve yapar. Güneş öğlen, rüzgâr ise hava nasıl isterse o zaman üretir.</p>
    <p>Dağıtım sırası: önce güneş ve rüzgâr (yakıtı bedava), sonra baraj, ardından termik santraller <b>marjinal maliyete</b>
    (yakıt + karbon bedeli) göre sıralanır. Kömür santrali yavaştır: saatte kapasitesinin belli bir yüzdesi kadar
    güç değiştirebilir ve %40'ın altına inemez. Batarya fazla üretimi depolar, akşam zirvesinde (17–23) boşaltır.</p>
    <p>Grafikte turuncu kesikli çizgi <b>net yük</b> = talep − güneş − rüzgâr. Güneş arttıkça öğlen çöker, akşam dikleşir:
    bu biçime <b>ördek eğrisi</b> denir (Kaliforniya şebeke işletmecisinin grafiğinden gelir).</p>
    <h3>Dene</h3>
    <ul>
      <li>Güneşi 1.500 MW'a çıkar: öğlen fazla üretim <b>kısıntıya</b> gider, akşam kömür rampası yetişemez.</li>
      <li>Aynı durumda bataryayı büyüt: öğlen şarj, akşam deşarj → kısıntı ve kesinti azalır.</li>
      <li>Karbon fiyatını 100 $/t üstüne çıkar: gaz kömürden ucuz hâle gelir, CO₂ düşer.</li>
      <li>"Karanlık durgunluk" (rüzgârsız, bulutlu kış günü) hazır ayarında yedek kapasitenin neden gerekli olduğunu gör.</li>
      <li>Santrallere tıkla: maliyet ve emisyon bilgisi.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p><small>Emisyon katsayıları yaklaşık değerlerdir (kömür ≈ 0,95 t/MWh, doğalgaz kombine çevrim ≈ 0,40 t/MWh).
    Maliyetler $/MWh cinsinden temsilîdir. İletim kayıpları, frekans, yedek ve piyasa kuralları modellenmez.</small></p>`,
});
sim.formatTime = (t) => {
  const h = START_H + t / SEC_PER_HOUR;
  const day = Math.floor(h / 24) + 1, hh = Math.floor(h % 24), mm = Math.floor((h % 1) * 60);
  return `Gün ${day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};
const scene = sim.scene;
const LOW = /[?&]low\b/.test(location.search);
const ss = THREE.MathUtils.smoothstep;
const G = groundMats(), K = mats();

// ---------------- Arazi (metre): tesislerin bulunduğu ova, kuzeyde baraj vadisi, kuzeybatı sırtında rüzgâr çiftliği ----------------
const hills = landscape({ seed: 23, size: 1500, height: 300, octaves: 6, warp: 0.35 });
const RIVER = [[-10, -470], [-50, -405], [-170, -338], [-380, -312], [-640, -352], [-950, -322], [-1350, -372], [-2700, -300]];
function segD(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
const polyD = (x, z, pts) => { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segD(x, z, pts[i], pts[i + 1])); return d; };
const riverDist = (x, z) => polyD(x, z, RIVER);
// Düzleştirilmiş tesis alanları [x0, z0, x1, z1]
const PADS = [[-300, 55, 300, 405], [-300, 405, 390, 650], [-760, 80, -360, 390], [-100, -190, 100, -45], [170, -120, 310, -35], [370, -400, 770, -60], [420, 130, 700, 345], [482, 394, 556, 438]];
function padMask(x, z) {
  let m = 0;
  for (const [x0, z0, x1, z1] of PADS) m = Math.max(m, 1 - ss(Math.max(x0 - x, x - x1, z0 - z, z - z1), 0, 60));
  return m;
}
// Baraj vadisi: barajda dar boğaz, membaya doğru kıvrılan, tabanı yükselen (nehir eğimi) doğal vadi
const LVL0 = 15, LVL1 = 87; // baraj su kotu (m): boş → dolu
const valleyW = (z) => 110 + Math.max(0, -z - 560) * 0.22;
const valleyC = (z) => (z < -560 ? 160 * Math.sin((-560 - z) / 520) * ss(-560 - z, 0, 400) : 0);
const valleyFloor = (z) => 1 + Math.max(0, -z - 560) * 0.055;
const hills2 = landscape({ seed: 71, size: 420, height: 60, octaves: 5, warp: 0.4 });
function heightAt(x, z) {
  const n = hills(x, z), pm = padMask(x, z);
  // Ova çevresi: alçak, dalgalı tepeler; kuzeyde (baraj arkası) ve uzakta dağlar
  const rolling = Math.max(ss(-200 - z, 0, 450), ss(z - 560, 0, 900), ss(x - 950, 0, 800), ss(-1500 - x, 0, 800));
  const mtn = ss(-300 - z, 0, 380);
  let h = 0.012 * n * (1 - pm);
  h += (1 - pm) * rolling * (18 + 0.25 * n + hills2(x, z));
  h = lerp(h, 170 + 0.75 * n + hills2(x, z), mtn * (1 - pm));
  if (z < -330) {
    const d = Math.abs(x - valleyC(z)) / valleyW(z);
    h = Math.min(h, valleyFloor(z) + 180 * Math.pow(ss(d, 0.1, 1.0), 1.3) + 0.25 * hills2(x, z) * ss(d, 0.2, 0.8));
  }
  const rd = riverDist(x, z);
  if (rd < 45) h = lerp(-3.2, h, ss(rd, 12, 45));
  return h;
}
const terrain = createTerrain(heightAt, { size: [5200, 5200], res: LOW ? [190, 190] : [300, 300],
  materialOptions: { water: -60, grassAmount: 0.75, forest: 0.4, grass: 0x66733a, dry: 0x9e8e5c, soil: 0x7b6548 } });
terrain.userData.noFit = true;
scene.add(terrain, terrainSkirt(heightAt, { inner: 2600, outer: 26000 }));

// ---------------- Tarlalar: ova tabanında parsel parsel şerit tarlalar (arazi malzemesine sim tarafında eklenir) ----------------
// Hücre (150 × 120 m) → 1–4 şerit, her şeridin ekini (anız, olgun buğday, sürülmüş toprak, yonca, nadas, ayçiçeği) tamsayı karmasıyla
// seçilir. Hücre kenarları: çit/ağaç sırası şeridi, toprak yol (iki tekerlek izi) ya da ince sınır çimi. CPU aynı karmayla
// ağaç sıralarını dizer (aşağıda) → çitler tarla kenarına tam oturur.
const FIELD = { ox: 37, oz: 21, cx: 150, cz: 120, hedge: 0.42, track: 0.62 };
const fieldHash = (a, b) => ((((a * 37 + b * 101 + a * b * 7 + 34000) % 17) + 17) % 17) / 17;
const padDist = (x, z) => { let d = 1e9; for (const [x0, z0, x1, z1] of PADS) d = Math.min(d, Math.max(x0 - x, x - x1, z0 - z, z - z1)); return d; };
{
  const CROPS = [0xcdb57c, 0xb3934f, 0x5a4332, 0x557030, 0xa39062, 0x3c5223, 0x84664a];
  const EU = {
    ePads: { value: PADS.map(([a, b, c, d]) => new THREE.Vector4(a, b, c, d)) },
    eCrop: { value: CROPS.map((h) => new THREE.Color(h)) },
    eTrack: { value: new THREE.Color(0x8e7a5b) }, eHedge: { value: new THREE.Color(0x3f4a24) },
  };
  const tm = terrain.material, base = tm.onBeforeCompile;
  tm.onBeforeCompile = (sh, r) => {
    base(sh, r);
    Object.assign(sh.uniforms, EU);
    sh.fragmentShader = sh.fragmentShader
      .replace('float tSlope, tH, tRockW, tForestW; vec3 tP;', `float tSlope, tH, tRockW, tForestW; vec3 tP;
        uniform vec4 ePads[${PADS.length}]; uniform vec3 eCrop[7]; uniform vec3 eTrack, eHedge;
        float eh(vec2 k){ return mod(k.x*37.0 + k.y*101.0 + k.x*k.y*7.0 + 34000.0, 17.0)/17.0; }
        float eBand(float d, float w){ float a = max(fwidth(d), 0.02); return 1.0 - smoothstep(w - a, w + a, d); }`)
      .replace('diffuseColor.rgb = c;', `{
          float pd = 1e9;
          for (int i = 0; i < ${PADS.length}; i++) { vec4 R = ePads[i]; pd = min(pd, max(max(R.x - tP.x, tP.x - R.z), max(R.y - tP.z, tP.z - R.w))); }
          float fm = smoothstep(6.0, 22.0, pd)*(1.0 - smoothstep(18.0, 30.0, tH))*(1.0 - smoothstep(0.035, 0.09, tSlope))*smoothstep(-2.4, -1.2, tH);
          if (fm > 0.001) {
            vec2 cs = vec2(${FIELD.cx.toFixed(1)}, ${FIELD.cz.toFixed(1)}), w = tP.xz - vec2(${FIELD.ox.toFixed(1)}, ${FIELD.oz.toFixed(1)});
            vec2 ci = floor(w/cs), f = w - ci*cs;
            float hL = eh(vec2(ci.x*3.0 + 1.0, ci.y)), hR = eh(vec2(ci.x*3.0 + 4.0, ci.y));
            float hB = eh(vec2(ci.x, ci.y*3.0 + 2.0)), hT = eh(vec2(ci.x, ci.y*3.0 + 5.0));
            float along = eh(ci + vec2(0.0, 11.0)) < 0.5 ? 1.0 : 0.0;           // 1: şeritler x boyunca
            float n = 1.0 + floor(eh(ci + vec2(7.0, 3.0))*3.99);
            float k = floor((along > 0.5 ? f.y/cs.y : f.x/cs.x)*n);
            int crop = int(floor(eh(vec2(ci.x*5.0 + k, ci.y*3.0 + k + 1.0))*6.99));
            vec3 fc = eCrop[0];
            for (int i = 1; i < 7; i++) if (i == crop) fc = eCrop[i];
            float u = along > 0.5 ? tP.z : tP.x;                                  // sürüm izleri şeride dik yönde tekrarlar
            float fw = fwidth(u);
            float fur = (0.5 + 0.5*sin(u*6.9813))*(1.0 - smoothstep(0.12, 0.45, fw));
            float tram = (1.0 - smoothstep(0.35, 0.6, abs(mod(u, 18.0) - 9.0)))*(1.0 - smoothstep(0.8, 3.0, fw));
            float soil = crop == 2 || crop == 6 ? 1.0 : 0.0;
            fc *= 1.0 - (0.1 + 0.22*soil)*fur;
            fc *= 1.0 - 0.18*tram*(1.0 - soil);
            fc *= (0.84 + 0.26*mid)*(0.93 + 0.14*fine);
            float nearF = 1.0 - smoothstep(20.0, 120.0, length(vViewPosition));
            fc *= 1.0 - nearF*0.2*(vn3(tP*3.1) - 0.5);
            // Parsel kenarları
            float band = 0.0; vec3 bc = c;
            float dE[4]; dE[0] = f.x; dE[1] = cs.x - f.x; dE[2] = f.y; dE[3] = cs.y - f.y;
            float hE[4]; hE[0] = hL; hE[1] = hR; hE[2] = hB; hE[3] = hT;
            for (int i = 0; i < 4; i++) {
              float hh = hE[i], d = dE[i];
              if (hh < ${FIELD.hedge}) { float b = eBand(d, 3.2); vec3 hc = eHedge*(0.7 + 0.5*fine)*(0.85 + 0.3*mid); if (b > band) { band = b; bc = hc; } }
              else if (hh < ${FIELD.track}) {
                float b = eBand(d, 2.4);
                float rut = max(eBand(abs(d - 0.75), 0.28), eBand(abs(d - 2.35), 0.28));
                vec3 tc = eTrack*(0.85 + 0.25*fine)*(1.0 - 0.25*rut);
                tc = mix(tc, c, eBand(abs(d - 1.55), 0.3)*0.7);            // iz ortasında ot
                if (b > band) { band = b; bc = tc; }
              } else { float b = eBand(d, 0.9); if (b > band) { band = b; bc = c*0.92; } }
            }
            fc = mix(fc, bc, band);
            c = mix(c, fc, fm);
            tForestW *= 1.0 - fm;
          }
        }
        diffuseColor.rgb = c;`);
  };
  tm.customProgramCacheKey = () => 'es-terrain-fields';
}

// ---------------- Yollar ----------------
const ROADS = [];
const roadGeo = [], walkGeo = [], dashGeo = [];
function ribbon(pts, off, w, dy, out, step = 12) {
  const P = [], I = [];
  let cnt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
    const ux = (bx - ax) / L, uz = (bz - az) / L, rx = -uz, rz = ux;
    for (let k = i ? 1 : 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      for (const o of [off - w / 2, off + w / 2]) { const px = x + rx * o, pz = z + rz * o; P.push(px, heightAt(px, pz) + dy, pz); }
      cnt++;
    }
  }
  for (let k = 0; k < cnt - 1; k++) { const a = k * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I); g.computeVertexNormals();
  out.push(g.toNonIndexed());
}
function road(pts, w = 10, walk = 0) {
  ROADS.push(pts);
  ribbon(pts, 0, w, 0.14, roadGeo);
  if (walk) for (const s of [-1, 1]) ribbon(pts, s * (w / 2 + walk / 2), walk, 0.3, walkGeo);
  // Orta kesikli çizgi
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let d = 8; d < L - 8; d += 12) {
      const x = ax + ux * d, z = az + uz * d;
      dashGeo.push(new THREE.PlaneGeometry(0.15, 4.5).rotateX(-Math.PI / 2).rotateY(Math.atan2(ux, uz)).translate(x, heightAt(x, z) + 0.17, z));
    }
  }
}
const CX = [-272, -136, 0, 136, 272], CZ = [72, 230, 388];
for (const x of CX) road([[x, 72], [x, 388]], 14, 4);
for (const z of CZ.slice(1)) road([[-272, z], [272, z]], 14, 4);
road([[-780, 72], [1100, 72]], 14, 4);
road([[0, 64], [0, -45]], 10);
road([[240, 64], [240, -38]], 8);
road([[560, -62], [560, 150]], 10);
road([[0, -172], [40, -300], [92, -420], [110, -478]], 8);
road([[-560, 64], [-560, 88]], 8);
// Güney banliyösü (bahçeli 1–2 katlı evler): şehir sokakları güneye uzar, üç yerel cadde
const SUB_Z = [452, 532, 612], SUB_X = [-136, 0, 136, 272];
for (const x of SUB_X) road([[x, 395], [x, 640]], 8, 2);
for (const z of SUB_Z) road([[-292, z], [382, z]], 8, 2);
// Doğuya köy yolu (banliyöden ovaya)
const RURAL = [[382, 452], [470, 462], [560, 470], [700, 458], [900, 430], [1250, 410], [1700, 400]];
road(RURAL, 7);
const roadNear = (x, z, m = 12) => ROADS.some((pts) => polyD(x, z, pts) < m);
{
  const add = (list, m) => { const o = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(list), m); o.receiveShadow = true; o.userData.noFit = true; scene.add(o); };
  add(roadGeo, G.asphalt); add(walkGeo, G.paver); add(dashGeo.map((g) => g.toNonIndexed()), G.paint);
}

// ---------------- Bitki örtüsü ----------------
const vegOut = (x, z) => padMask(x, z) > 0.02 || riverDist(x, z) < 32 || roadNear(x, z, 14) ||
  (z < -540 && Math.abs(x - valleyC(z)) < valleyW(z) * 1.1 && heightAt(x, z) < LVL1 + 6) || (x > -1350 && x < -250 && z < -560 && z > -760 && Math.abs(((x + 1250) % 190 + 190) % 190 - 0) < 40);
// Geniş alan ağaçları yamaçlara ve vadilere: ova tabanı (tarlalar) ve tesis alanları dışarıda — tarla içine tek tük ağaç serpilmez.
// Uzakta çapraz kart düzeyine indikleri için sayı artırılabildi (yamaçlar çıplak çayır gibi görünmesin).
const veg = createVegetation((x, z) => {
  if (vegOut(x, z)) return -100;
  const h = heightAt(x, z);
  return h < 16 && padDist(x, z) > 12 ? -100 : h;
}, {
  rect: [-2500, -2500, 2500, 2500], trees: LOW ? 3000 : 7000, rocks: 0, seed: 5, water: -60, maxSlope: 0.7,
  kinds: { broad: 0.5, pine: 0.35, cypress: 0.15 },
  forest: (x, z) => 0.32 + 0.3 * Math.sin(x * 0.004 + 1) * Math.cos(z * 0.005 - 0.7) + (z < -420 ? 0.28 : 0),
});
scene.add(veg.group);
// Yakın çevre: ovada yalnız korular (tarla içine rastgele ağaç serpilmez); ağaçların çoğu tarla kenarı ve yol boyu sıralarda
const fieldAt = (x, z) => {
  const h = heightAt(x, z);
  if (h > 22 || h < -1.5 || padDist(x, z) < 12) return false;
  const e = 2, sl = Math.hypot(heightAt(x + e, z) - heightAt(x - e, z), heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return sl < 0.28;
};
const vegNear = createVegetation((x, z) => (vegOut(x, z) ? -100 : heightAt(x, z)), {
  rect: [-1100, -250, 1500, 1500], trees: LOW ? 800 : 1700, shrubs: LOW ? 500 : 1100, rocks: 0, seed: 19, water: -60, maxSlope: 0.7,
  kinds: { broad: 0.55, oak: 0.25, cypress: 0.2 }, leafA: 0x2f4a22, leafB: 0x5d6a30,
  forest: (x, z) => {
    const grove = Math.sin(x * 0.011 + 0.7) * Math.cos(z * 0.013 - 0.4) + 0.5 * Math.sin(x * 0.027 - z * 0.019);
    return ss(grove, 0.55, 0.95) * 0.95;
  },
});
scene.add(vegNear.group);
// Tarla kenarı çitleri ve ağaç sıraları: terrain gölgelendiricisindeki aynı parsel karması → çit şeridine oturur.
// Rüzgâr kıran kavak sıraları, karışık çit (meşe/geniş yapraklı + çalı), köy yolu boyunca kavaklar.
const hedge = { mixed: [], poplar: [], shrub: [] };
{
  const R = seeded(31), { ox, oz, cx, cz } = FIELD;
  const HR = [-1500, -400, 1700, 1300];
  const put = (x, z, list, big = 1) => list.push([x, z, 0, big, heightAt(x, z) - 0.25]);
  const edge = (ax, az, bx, bz, h) => {
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, pop = h < 0.12;
    for (let d = 3 + R() * 4; d < L - 3; d += pop ? 6 + R() * 2 : 8 + R() * 5) {
      const j = (R() - 0.5) * 1.6, x = ax + ux * d - uz * j, z = az + uz * d + ux * j;
      if (!fieldAt(x, z) || roadNear(x, z, 9) || riverDist(x, z) < 30) continue;
      if (!pop && R() < 0.22) continue;                       // çitte boşluk
      if (pop) put(x, z, hedge.poplar, 1); else if (R() < 0.62) put(x, z, hedge.mixed, R() < 0.4 ? 1 : 0); else put(x, z, hedge.shrub, 1);
      if (!pop && R() < 0.7) { const e = d + 3 + R() * 2; put(ax + ux * e + uz * j * 0.5, az + uz * e - ux * j * 0.5, hedge.shrub, 1); }
    }
  };
  for (let i = Math.floor((HR[0] - ox) / cx); i <= Math.ceil((HR[2] - ox) / cx); i++) {
    for (let j = Math.floor((HR[1] - oz) / cz); j <= Math.ceil((HR[3] - oz) / cz); j++) {
      const x0 = ox + i * cx, z0 = oz + j * cz;
      const hv = fieldHash(i * 3 + 1, j), hh = fieldHash(i, j * 3 + 2);
      if (hv < FIELD.hedge) edge(x0, z0, x0, z0 + cz, hv);
      if (hh < FIELD.hedge) edge(x0, z0, x0 + cx, z0, hh);
    }
  }
  // Köy yolu: kuzey kenarında kavak dizisi
  for (let i = 0; i < RURAL.length - 1; i++) {
    const [ax, az] = RURAL[i], [bx, bz] = RURAL[i + 1], L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let d = 4; d < L; d += 9 + R() * 3) {
      const x = ax + ux * d + uz * 8.5, z = az + uz * d - ux * 8.5;
      if (padDist(x, z) > 8 && R() > 0.12) put(x, z, hedge.poplar, 1);
    }
  }
}
const hedgeTrees = [streetTrees(hedge.mixed, 41, { broad: 0.5, oak: 0.5 }), streetTrees(hedge.poplar, 43, { poplar: 1 }), streetTrees(hedge.shrub, 47, { shrub: 1 })];
// Ön planda çiftlik: iki katlı kırma çatılı ev, depo/ahır, küçük meyve bahçesi
{
  const house = makeBuilding({ type: 'house', floors: 2, width: 11, depth: 9, seed: 5, roof: 'hip' });
  house.position.set(500, heightAt(500, 426) - 0.1, 426);
  const barn = makeBuilding({ type: 'industrial', floors: 1, width: 22, depth: 12, seed: 9 });
  barn.position.set(537, heightAt(537, 414) - 0.1, 414);
  barn.rotation.y = -Math.PI / 2;
  scene.add(house, barn);
  const orch = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) orch.push([488 + i * 7 + (j % 2) * 2, 399 + j * 6.5, 0, 0, heightAt(488 + i * 7, 399 + j * 6.5) - 0.2]);
  hedgeTrees.push(streetTrees(orch, 53, { fruit: 1 }));
}
for (const h of hedgeTrees) scene.add(h.group);

// Bitki örtüsü performansı: motor her tür için tek InstancedMesh üretir (frustumCulled=false) → ~11 milyon üçgen her
// karede çizilir (yazılımsal WebGL'de ~55 sn/kare; smoke testi kilitleniyordu). Örnekler karolara bölünür (karo başına
// sınır küresi → görüş/gölge kesiti ayıklaması) ve kameraya uzaklığa göre üç ayrıntı düzeyi kullanılır:
//  0: özgün ağaç · 1: taç çekirdeği sadeleşmiş (ikosahedron 80 → 20 üçgen, yaprak kartları aynen) · 2: ayrıca kartların üçte biri (1,5 kat büyük).
// Uzak karolarda örnek sayısı da kademeli azalır; örnekler rastgele yerleştiği için ilk k örnek rastgele bir alt kümedir.
const OPAQUE_UV = 0.05; // motorda taç çekirdeği ve gövde uv'si 0,03 (opak köşe); kartlar ≥ 0,12
const lodCache = new Map();
const CARD_KEEP = [1, 1, 3, 8], CARD_GROW = [1, 1, 1.5, 2.3]; // düzey başına: her kaçıncı kart kalır, kalan kart büyütmesi
function treeLod(src, level) {
  const key = src.uuid + ':' + level;
  if (lodCache.has(key)) return lodCache.get(key);
  const A = src.attributes, pos = A.position, uv = A.uv, leaf = A.leaf;
  let out = src;
  if (!src.index && pos && uv && leaf) {
    const P = pos.array, n = pos.count / 3, keep = [], grow = [], nrm = [];
    const isCore = (t) => leaf.getX(t * 3) > 0.5 && uv.getX(t * 3) < OPAQUE_UV;
    const isCard = (t) => leaf.getX(t * 3) > 0.5 && uv.getX(t * 3) >= OPAQUE_UV;
    const same = (i, j) => P[i * 3] === P[j * 3] && P[i * 3 + 1] === P[j * 3 + 1] && P[i * 3 + 2] === P[j * 3 + 2];
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), nn = new THREE.Vector3(), sum = new THREE.Vector3();
    const tn = (a, b, c, o) => {
      e1.set(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]);
      e2.set(P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]);
      return o.crossVectors(e1, e2);
    };
    let card = 0;
    for (let t = 0; t < n;) {
      if (isCore(t)) {
        let e = t;
        while (e < n && isCore(e)) e++;
        // 3. düzey: çekirdek (12 köşe) → ±x/±y/±z uç köşelerinden sekizyüzlü (8 üçgen), normaller merkezden dışa
        if (level >= 3 && e - t >= 20) {
          const vs = [];
          for (let v = t * 3; v < e * 3; v++) vs.push(v);
          const c = [0, 0, 0];
          for (const v of vs) for (let k = 0; k < 3; k++) c[k] += P[v * 3 + k] / vs.length;
          const ext = [];
          for (let k = 0; k < 3; k++) for (const sg of [1, -1]) {
            let best = vs[0];
            for (const v of vs) if (sg * P[v * 3 + k] > sg * P[best * 3 + k]) best = v;
            ext.push(best);
          }
          const [px, nx, py, ny, pz, nz] = ext;
          for (const [a, b, d] of [[px, py, pz], [pz, py, nx], [nx, py, nz], [nz, py, px], [px, pz, ny], [pz, nx, ny], [nx, nz, ny], [nz, px, ny]]) {
            const tri = tn(a, b, d, nn).dot(e1.set(P[a * 3] - c[0], P[a * 3 + 1] - c[1], P[a * 3 + 2] - c[2])) >= 0 ? [a, b, d] : [a, d, b];
            for (const v of tri) { nrm.push([keep.length, P[v * 3] - c[0], P[v * 3 + 1] - c[1], P[v * 3 + 2] - c[2]]); keep.push(v); }
          }
          t = e;
          continue;
        }
        // Çekirdek: 1. düzey alt bölümlü ikosahedron; her özgün yüz ardışık 4 üçgen → köşeleri (1 kez geçen noktalar) tek üçgen
        for (let g = t; g < e; g += 4) {
          const vs = [];
          for (let v = g * 3; v < Math.min(e, g + 4) * 3; v++) vs.push(v);
          const corners = e - g >= 4 ? vs.filter((v) => vs.filter((w) => same(v, w)).length === 1) : [];
          if (corners.length !== 3) { keep.push(...vs); continue; }
          sum.set(0, 0, 0);
          for (let k = 0; k < vs.length; k += 3) sum.add(tn(vs[k], vs[k + 1], vs[k + 2], nn));
          const [c0, c1, c2] = corners;
          keep.push(...(tn(c0, c1, c2, nn).dot(sum) >= 0 ? [c0, c1, c2] : [c0, c2, c1]));
        }
        t = e;
      } else if (isCard(t)) {
        if (level < 2 || card % CARD_KEEP[level] === 0) {
          if (level >= 2) grow.push(keep.length);
          keep.push(t * 3, t * 3 + 1, t * 3 + 2, t * 3 + 3, t * 3 + 4, t * 3 + 5);
        }
        card++;
        t += 2; // kart = ardışık 2 üçgen
      } else { keep.push(t * 3, t * 3 + 1, t * 3 + 2); t++; }
    }
    out = new THREE.BufferGeometry();
    for (const [name, at] of Object.entries(A)) {
      const k = at.itemSize, arr = new Float32Array(keep.length * k);
      keep.forEach((v, i) => { for (let c = 0; c < k; c++) arr[i * k + c] = at.array[v * k + c]; });
      out.setAttribute(name, new THREE.BufferAttribute(arr, k));
    }
    // 2.–3. düzey: kalan kartlar büyür → taç örtüsü korunur (kart köşeleri 0 ve 2 karşılıklı)
    const q = out.attributes.position.array;
    for (const o of grow) for (let c = 0; c < 3; c++) {
      const m = (q[o * 3 + c] + q[(o + 2) * 3 + c]) / 2;
      for (let v = 0; v < 6; v++) q[(o + v) * 3 + c] = m + (q[(o + v) * 3 + c] - m) * CARD_GROW[level];
    }
    const on = out.attributes.normal;
    if (on) for (const [i, x, y, z] of nrm) { const l = Math.hypot(x, y, z) || 1; on.setXYZ(i, x / l, y / l, z / l); }
    out.computeBoundingSphere();
  }
  lodCache.set(key, out);
  return out;
}
// 4. düzey (uzak): çapraz üç dikey kart + gövde kartı. Taç kartları motorun yaprak dokusundaki yaprak kümesini (alfa kesimli)
// kullanır; aynı malzeme, aynı çizim → ağaç başına ~8 üçgen. Normaller taç merkezinden dışa (kart yönünden bağımsız ışık).
function treeImpostor(src) {
  const A = src.attributes, P = A.position, Lf = A.leaf;
  if (!P || !Lf || !A.uv) return null;
  const cb = new THREE.Box3(), tb = new THREE.Box3(), v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); (Lf.getX(i) > 0.5 ? cb : tb).expandByPoint(v); }
  if (cb.isEmpty()) return null;
  const c = cb.getCenter(new THREE.Vector3()), s = cb.getSize(new THREE.Vector3());
  const W = Math.max(s.x, s.z) * 1.12, H = s.y * 1.1;
  const pos = [], nor = [], uv = [], col = [], leaf = [];
  const quad = (pts, uvs, ns, cs, lf) => { for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...pts[k]); uv.push(...uvs[k]); nor.push(...ns[k]); col.push(cs[k], cs[k], cs[k]); leaf.push(lf); } };
  const U0 = 0.15, U1 = 0.92, V0 = 0.09, V1 = 0.87; // yaprak kümesinin doku içindeki kutusu (opak köşelere değmez)
  for (let q = 0; q < 3; q++) {
    const a = (q * Math.PI) / 3 + 0.3, dx = (Math.cos(a) * W) / 2, dz = (Math.sin(a) * W) / 2;
    const pts = [[c.x - dx, c.y - H / 2, c.z - dz], [c.x + dx, c.y - H / 2, c.z + dz], [c.x + dx, c.y + H / 2, c.z + dz], [c.x - dx, c.y + H / 2, c.z - dz]];
    const ns = pts.map(([x, y, z]) => { v.set(x - c.x, (y - c.y) * 0.8 + H * 0.3, z - c.z).normalize(); return [v.x, v.y, v.z]; });
    quad(pts, [[U0, V0], [U1, V0], [U1, V1], [U0, V1]], ns, [0.42, 0.42, 0.8, 0.8], 1);
  }
  if (!tb.isEmpty()) {
    const tc = tb.getCenter(new THREE.Vector3()), tw = Math.min(1.1, Math.max(0.25, W * 0.07)), y0 = tb.min.y, y1 = Math.max(y0 + 0.5, c.y - H * 0.15);
    for (let q = 0; q < 2; q++) {
      const a = (q * Math.PI) / 2 + 0.3, dx = (Math.cos(a) * tw) / 2, dz = (Math.sin(a) * tw) / 2, nx = -Math.sin(a), nz = Math.cos(a);
      quad([[tc.x - dx, y0, tc.z - dz], [tc.x + dx, y0, tc.z + dz], [tc.x + dx, y1, tc.z + dz], [tc.x - dx, y1, tc.z - dz]],
        [[0.03, 0.03], [0.03, 0.03], [0.03, 0.03], [0.03, 0.03]], [[nx, 0, nz], [nx, 0, nz], [nx, 0, nz], [nx, 0, nz]], [0.55, 0.55, 0.55, 0.55], 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('leaf', new THREE.Float32BufferAttribute(leaf, 1));
  for (const name of Object.keys(A)) if (!g.attributes[name]) { const k = A[name].itemSize; g.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * k), k)); }
  g.computeBoundingSphere();
  return g;
}
const vegTiles = [];
function tileVegetation(group, tile, thin) {
  const m4 = new THREE.Matrix4();
  for (const im of [...group.children]) {
    if (!im.isInstancedMesh) continue;
    const key = im.geometry.uuid + ':imp';
    if (!lodCache.has(key)) lodCache.set(key, treeImpostor(im.geometry) || treeLod(im.geometry, 3));
    const geos = [im.geometry, treeLod(im.geometry, 1), treeLod(im.geometry, 2), treeLod(im.geometry, 3), lodCache.get(key)];
    const buckets = new Map();
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, m4);
      const e = m4.elements, key = `${Math.floor(e[12] / tile)},${Math.floor(e[14] / tile)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = []));
      b.push(m4.clone());
    }
    group.remove(im);
    im.dispose();
    for (const list of buckets.values()) {
      const c = new THREE.InstancedMesh(im.geometry, im.material, list.length);
      let sx = 0, sy = 0, sz = 0;
      list.forEach((m, i) => { c.setMatrixAt(i, m); sx += m.elements[12]; sy += m.elements[13]; sz += m.elements[14]; });
      c.name = im.name; c.userData = { ...im.userData };
      c.castShadow = im.castShadow; c.receiveShadow = im.receiveShadow;
      c.computeBoundingSphere();
      c.frustumCulled = true;
      group.add(c);
      vegTiles.push({ mesh: c, full: list.length, geos, thin, half: tile * 0.5, c: new THREE.Vector3(sx / list.length, sy / list.length, sz / list.length) });
    }
  }
}
tileVegetation(veg.group, 500, 1);
tileVegetation(vegNear.group, 250, 1);
for (const h of hedgeTrees) tileVegetation(h.group, 200, 0);
// Uzaklık (m): < L1 özgün · < L2 sade çekirdek · < L3 + üçte bir kart (1,5×) · < IMP sekizyüzlü çekirdek + sekizde bir kart (2,3×)
// · ≥ IMP çapraz kart (impostor). L3 ve ötesi gölge atmaz. Seyreltme IMP'den FAR'a doğru MIN'e iner.
const VL = LOW ? { L1: 90, L2: 170, L3: 250, IMP: 330, FAR: 2200, MIN: 0.3 } : { L1: 130, L2: 230, L3: 320, IMP: 420, FAR: 2800, MIN: 0.35 };
let vegLodPos = null;
function vegLod() {
  const cp = sim.camera.position;
  if (vegLodPos && vegLodPos.distanceToSquared(cp) < 100) return;
  (vegLodPos ||= new THREE.Vector3()).copy(cp);
  for (const t of vegTiles) {
    const d = Math.max(0, t.c.distanceTo(cp) - t.half * 0.6);
    const lvl = d < VL.L1 ? 0 : d < VL.L2 ? 1 : d < VL.L3 ? 2 : d < VL.IMP ? 3 : 4;
    if (t.mesh.geometry !== t.geos[lvl]) t.mesh.geometry = t.geos[lvl];
    t.mesh.userData.noCast = lvl >= 3; // look.scan() castShadow'u bu bayrağa göre yeniden kurar
    t.mesh.castShadow = lvl < 3;
    const f = !t.thin || d <= VL.IMP ? 1 : Math.max(VL.MIN, 1 - ((1 - VL.MIN) * (d - VL.IMP)) / (VL.FAR - VL.IMP));
    t.mesh.count = Math.max(1, Math.round(t.full * f));
  }
}
sim.onRender(vegLod);
// Ölçüm (yalnız ?vegstat): bitki örtüsünün o anki çizilen üçgen / örnek sayısı
if (/[?&]vegstat\b/.test(location.search)) window.__vegStat = () => {
  let tris = 0, inst = 0; const lv = [0, 0, 0, 0, 0];
  for (const t of vegTiles) { const g = t.mesh.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += n * t.mesh.count; inst += t.mesh.count; lv[t.geos.indexOf(g)] += t.mesh.count; }
  return { tris: Math.round(tris), inst, levels: lv };
};

// Tıklanabilir santral grupları
const plants = {};
function plantGroup(key, x, z, labelY, y = heightAt(x, z)) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  scene.add(g);
  const lbl = sim.label('', { parent: g, position: [0, labelY, 0] });
  plants[key] = { g, lbl, x, z };
  return g;
}

// ---------------- Şehir (8 mahalle; her mahallenin kendi pencere ışığı + sokak lambası = kademeli kesinti) ----------------
const districts = [];
const PLASTER = [0xe3d9c6, 0xd8cbb3, 0xece6da, 0xcfc4b0, 0xe6d2b5, 0xd5d9d6, 0xc9b8a0, 0xf0e9dc];
let fleet;
const cityTrees = [];
{
  const r = seeded(11);
  const town = new THREE.Group();
  scene.add(town);
  // Motor kent kiti: her mahalle bir ada (yola bakan bitişik/ayrık apartmanlar, merkezde yüksek ofis ve apartmanlar);
  // her mahallenin kendi pencere/tabela ışığı (ownLights) ve sokak lambası vardır → kademeli kesintide mahalle mahalle söner.
  const distLots = Array.from({ length: NDIST }, () => []), distLamps = [];
  for (let d = 0; d < NDIST; d++) {
    const x0 = CX[d % 4] + 7 + 4, x1 = CX[(d % 4) + 1] - 7 - 4, z0 = (d < 4 ? CZ[0] : CZ[1]) + 11, z1 = (d < 4 ? CZ[1] : CZ[2]) - 11;
    const central = d % 4 === 1 || d % 4 === 2;
    const park = !central && r() < 0.6;
    const lots = makeBlock({ x0, x1, z0, z1 }, {
      seed: 40 + d * 13, gap: central ? 0 : 3, shops: central ? 0.85 : 0.4, depth: central ? [14, 22] : [11, 15],
      mix: central ? { apartment: 0.72, office: 0.28 } : { apartment: 0.85, house: 0.15 }, roofs: central ? undefined : { hip: 0.45 },
      floors: (x, z, rr, type) => (type === 'office' ? 10 + Math.floor(rr() * rr() * 16) : type === 'apartment' ? (central ? 7 + Math.floor(rr() * 7) : 3 + Math.floor(rr() * 4)) : undefined),
    });
    // İç avlu: merkezde bir iki kule/blok, diğerlerinde park ya da otopark bahçesi
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (central) lots.push({ type: 'office', x: cx, z: cz, width: 24 + r() * 6, depth: 20 + r() * 6, floors: 14 + Math.floor(r() * 10), rot: 0, seed: d * 7 + 1 });
    else if (park) for (let k = 0; k < 14; k++) cityTrees.push([cx + (r() - 0.5) * (x1 - x0 - 36), cz + (r() - 0.5) * (z1 - z0 - 36), 0, 1]);
    else lots.push({ type: 'apartment', x: cx, z: cz, width: 18, depth: 12, floors: 5 + Math.floor(r() * 3), rot: r() < 0.5 ? 0 : Math.PI, shop: false, seed: d * 7 + 2 });
    const OFC = [0x8d9aa5, 0x9ba7a0, 0xa7a29a, 0x7f8f9c, 0xb2b6b4];
    for (const L of lots) { L.y0 = heightAt(L.x, L.z) - 0.1; if (L.type === 'office') L.colors = { wall: OFC[Math.floor(r() * OFC.length)], trim: 0xc9cdd0, frame: 0xa4aaae }; }
    distLots[d].push(...lots);
    const lampPts = [];
    for (let x = x0 + 8; x < x1; x += 26) { lampPts.push([x, z0 - 2.5, Math.PI], [x, z1 + 2.5, 0]); cityTrees.push([x + 13, z0 - 2.5, 0, 0], [x + 13, z1 + 2.5, 0, 0]); }
    for (let z = z0 + 8; z < z1; z += 26) { lampPts.push([x0 - 2.5, z, -Math.PI / 2], [x1 + 2.5, z, Math.PI / 2]); cityTrees.push([x0 - 2.5, z + 13, 0, 0], [x1 + 2.5, z + 13, 0, 0]); }
    const lamps = streetLamps(lampPts);
    town.add(lamps.group);
    distLamps.push(lamps);
  }
  // Banliyö evleri (bahçeli 1–2 katlı, kırma kiremit çatı): en yakın kuzey mahallesinin elektriğine bağlı
  for (const zs of SUB_Z) for (const side of [-1, 1]) {
    for (let x = -284; x < 376; x += 15 + r() * 6) {
      if (SUB_X.some((c) => Math.abs(x - c) < 13)) continue;
      if (r() < 0.08) continue;
      const w = 9 + r() * 4, d = 8 + r() * 2.5, zc = zs + side * (4 + 2 + 3.5 + d / 2), fl = r() < 0.55 ? 2 : 1;
      const dk = Math.max(0, Math.min(3, Math.floor((x + 272) / 136)));
      distLots[4 + dk].push({ type: 'house', x, z: zc, width: w, depth: d, floors: fl, rot: side > 0 ? Math.PI : 0, y0: heightAt(x, zc) - 0.1, roof: r() < 0.7 ? 'hip' : 'gable', seed: r() * 1000 });
      if (r() < 0.55) cityTrees.push([x + (r() - 0.5) * 8, zc + side * (d / 2 + 5 + r() * 6), 0, 1]);
    }
  }
  for (let d = 0; d < NDIST; d++) {
    const city = populateCity({ lots: distLots[d], seed: 60 + d, tile: 140, near: LOW ? 170 : 280, ownLights: true, noRaycast: true });
    town.add(city.group);
    districts.push({ city, lamps: distLamps[d], on: true });
  }
  const st = streetTrees(cityTrees, 7, { broad: 0.8, cypress: 0.2 });
  tileVegetation(st.group, 160, 0);
  town.add(st.group);
  town.userData.trees = st;
  // Park etmiş araçlar (kaldırım kenarı)
  const spots = [];
  for (const x of CX) for (let z = 84; z < 380; z += 7 + r() * 9) if (Math.min(...CZ.map((c) => Math.abs(z - c))) > 14 && r() < 0.55) spots.push([x + (r() < 0.5 ? -5.2 : 5.2), z, r() < 0.5 ? Math.PI / 2 : -Math.PI / 2]);
  for (const z of CZ) for (let x = -262; x < 268; x += 7 + r() * 9) if (Math.min(...CX.map((c) => Math.abs(x - c))) > 14 && r() < 0.55) spots.push([x, z + (r() < 0.5 ? -5.2 : 5.2), r() < 0.5 ? 0 : Math.PI]);
  const nCar = Math.min(spots.length, LOW ? 60 : 140);
  fleet = carFleet(nCar, { seed: 9 });
  for (let i = 0; i < nCar; i++) { const [x, z, yaw] = spots[Math.floor((i * spots.length) / nCar)]; fleet.set(i, x, heightAt(x, z) + 0.14, z, yaw); }
  fleet.commit();
  town.add(fleet.group);
  // Uzakta (kentin en yakın noktasına > 350 m) araçların küçük parçaları (trim, plaka, lastik, jant) bir pikselin altında
  // kalır: gizlenir. Gövde, cam ve farlar her uzaklıkta çizilir.
  const carSmall = fleet.group.children.filter((c, i) => [2, 3, 6, 7].includes(i % 8));
  // Sokak lambası direkleri (0,15 m kalınlık) de uzakta piksel altı kalır; ışık veren camlar (gece kent ışığı) her zaman çizilir
  for (const L of distLamps) if (L.group.children[0]?.isInstancedMesh) carSmall.push(L.group.children[0]);
  let carFar = null;
  sim.onRender(() => {
    const p = sim.camera.position;
    const dx = Math.max(-280 - p.x, 0, p.x - 385), dz = Math.max(60 - p.z, 0, p.z - 650);
    const far = Math.hypot(dx, dz, Math.max(0, p.y - 20)) > 350;
    if (far !== carFar) { carFar = far; for (const c of carSmall) c.visible = !far; }
  });
  plants.sehir = { g: town, lbl: sim.label('', { parent: town, position: [0, 110, 230], className: 'big' }) };
}

// ---------------- Güneş tarlası (tek eksenli izleyiciler) ----------------
let solar;
{
  const g = plantGroup('gunes', -560, 230, 45);
  const xs = []; for (let x = -175; x <= 175; x += 7) xs.push(x);
  solar = solarField(xs, [-95, 0, 95], 80);
  g.add(solar.group);
  for (const z of [-47.5, 47.5]) { const o = new THREE.Mesh(new THREE.BoxGeometry(362, 0.2, 8).translate(0, 0.1, z), K.gravel); o.receiveShadow = true; g.add(o); }
  for (const x of [-120, 0, 120]) for (const z of [-47.5, 47.5]) {
    const inv = new THREE.Mesh(new RoundedBoxGeometry(6, 2.6, 2.4, 2, 0.06).translate(x, 1.5, z + 1), K.container);
    inv.castShadow = inv.receiveShadow = true; g.add(inv);
  }
}
const solarPanels = solar.panels;

// ---------------- Rüzgâr türbinleri (82 m göbek, 84 m rotor) ----------------
const rotors = [], beacons = [];
{
  const g = plantGroup('ruzgar', -780, -660, 300, 0);
  const spots = [[-1250, -620], [-1060, -690], [-870, -620], [-680, -690], [-490, -620], [-310, -700]];
  for (const [x, z] of spots) {
    const t = windTurbine();
    t.group.position.set(x + 780, heightAt(x, z), z + 660);
    t.group.rotation.y = -0.25;
    t.rotor.rotation.z = rand(0, 6);
    g.add(t.group);
    rotors.push(t.rotor);
    beacons.push(t.beaconM);
  }
  plants.ruzgar.lbl.position.set(0, heightAt(-780, -660) + 260, 0);
}

// ---------------- Kömür santrali ----------------
const coal = coalPlant();
{
  const g = plantGroup('komur', 560, -230, 230);
  g.add(coal.group);
}
// ---------------- Doğalgaz santrali (kombine çevrim) ----------------
const gas = gasPlant();
{
  const g = plantGroup('gaz', 560, 240, 110);
  g.add(gas.group);
}

// ---------------- Baraj ve rezervuar ----------------
let water, riverMat;
{
  const g = plantGroup('hidro', 0, -560, 150, 0);
  g.add(dam(300, 97).group);
  // Vadiye oturan su yüzeyi (yerel y=0; position.y = su kotu)
  const P = [], I = [], nx = 24;
  let rows = 0;
  for (let z = -566; z >= -1900; z -= 20) {
    const W = valleyW(z) * 1.02, c = valleyC(z);
    for (let i = 0; i <= nx; i++) P.push(c - W + (2 * W * i) / nx, 0, z + 560);
    rows++;
  }
  for (let j = 0; j < rows - 1; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + nx + 1; I.push(a, a + 1, b, a + 1, b + 1, b); }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  wg.setIndex(I); wg.computeVertexNormals();
  water = new THREE.Mesh(wg, K.water);
  water.receiveShadow = true; water.userData.noFit = true;
  g.add(water);
  // Nehir: santral binasının kuyruk suyundan batıya
  const pts = RIVER.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const cp = curve.getSpacedPoints(260), RP = [], RI = [];
  cp.forEach((p, i) => {
    const t = curve.getTangentAt(i / (cp.length - 1)), rx = -t.z, rz = t.x;
    const w = 13 + 4 * Math.min(1, i / 20);
    for (const s of [-1, 1]) RP.push(p.x + rx * w * s, -1.1, p.z + rz * w * s + 560);
    if (i) { const a = (i - 1) * 2; RI.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  });
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(RP, 3));
  rg.setIndex(RI); rg.computeVertexNormals();
  if (rg.attributes.normal.getY(0) < 0) { RI.reverse(); rg.setIndex(RI); rg.computeVertexNormals(); }
  riverMat = K.water.clone();
  riverMat.onBeforeCompile = K.water.onBeforeCompile; riverMat.customProgramCacheKey = K.water.customProgramCacheKey; riverMat.userData = K.water.userData;
  riverMat.transparent = true; riverMat.opacity = 0.9; riverMat.depthWrite = false;
  const river = new THREE.Mesh(rg, riverMat);
  river.userData.noFit = true; river.userData.noAO = true;
  g.add(river);
}

// ---------------- Batarya ----------------
let battLeds;
{
  const g = plantGroup('batarya', 240, -80, 30);
  const b = batteryYard();
  g.add(b.group);
  battLeds = b.leds;
}

// ---------------- Trafo merkezi ve iletim hatları ----------------
const HUB = new THREE.Vector3(0, 0, -120);
{
  const g = substation();
  g.position.copy(HUB);
  scene.add(g);
  sim.label('Trafo merkezi', { parent: g, position: [0, 45, 0], className: 'plain' });
}
const TW = latticeTower();
const LINE_SRC = { gunes: [-360, 175], ruzgar: [-520, -440], komur: [668, -128], gaz: [440, 150], hidro: [-40, -455], batarya: [175, -80], sehir: [30, 58] };
const DOTS = 14;
const towerM = [], lines = [];
const wirePts = [];
const _tv = new THREE.Vector3(), _tq = new THREE.Quaternion(), _ty = new THREE.Vector3(0, 1, 0), _one = new THREE.Vector3(1, 1, 1);
for (const [key, [x, z]] of Object.entries(LINE_SRC)) {
  const a = new THREE.Vector3(x, 0, z), dir = HUB.clone().sub(a).setY(0), D = dir.length();
  dir.normalize();
  const b = HUB.clone().addScaledVector(dir, -62);
  const n = Math.max(1, Math.ceil(a.distanceTo(b) / 260));
  const yaw = Math.atan2(dir.x, dir.z), cs = Math.cos(yaw), sn = Math.sin(yaw);
  const tw = [];
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    for (let k = 0; k < 4 && riverDist(p.x, p.z) < 40; k++) p.addScaledVector(dir, 30);
    p.y = heightAt(p.x, p.z);
    tw.push(p);
    towerM.push(new THREE.Matrix4().compose(p, _tq.setFromAxisAngle(_ty, yaw), _one));
  }
  // Tel noktaları (yerel kol ucu → dünya)
  const att = [...TW.att, TW.top].map(([ax, ay]) => [ax * cs, ay, -ax * sn]);
  const conductors = att.map(() => []);
  for (let i = 0; i < tw.length - 1; i++) {
    const p0 = tw[i], p1 = tw[i + 1], span = p0.distanceTo(p1), sag = span * 0.025;
    att.forEach(([ox, oy, oz], c) => {
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        const y = lerp(p0.y, p1.y, t) + oy - 4 * sag * t * (1 - t);
        const pt = new THREE.Vector3(lerp(p0.x, p1.x, t) + ox, y, lerp(p0.z, p1.z, t) + oz);
        if (k || !i) conductors[c].push(pt);
      }
    });
  }
  for (const c of conductors) for (let k = 0; k < c.length - 1; k++) wirePts.push(c[k], c[k + 1]);
  const curve = new THREE.CatmullRomCurve3(conductors[2].map((p) => p.clone().setY(p.y + 1.2)));
  lines.push({ key, curve, phase: rand(0, 1), flow: 0, color: new THREE.Color(key === 'sehir' ? '#ffffff' : SRC[key].color) });
}
{
  const ts = new THREE.InstancedMesh(TW.steel, K.galv, towerM.length), ti = new THREE.InstancedMesh(TW.ins, K.insG, towerM.length); // kırılmasız cam: ek sahne geçişi yok
  towerM.forEach((m, i) => { ts.setMatrixAt(i, m); ti.setMatrixAt(i, m); });
  ts.castShadow = true; ts.frustumCulled = false; ti.frustumCulled = false;
  scene.add(ts, ti);
}
const wireMat = new THREE.LineBasicMaterial({ color: 0x6d7378, transparent: true, opacity: 0.45, depthWrite: false }); // uzakta ince tel: soluk, kalın bant gibi görünmesin
{
  const w = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wirePts), wireMat);
  w.userData.noAO = true; w.frustumCulled = false; w.raycast = () => {};
  scene.add(w);
}
// Güç akışı: hat boyunca yumuşak ışıklı noktalar (veri katmanı; açılıp kapatılabilir)
const NDOT = lines.length * DOTS;
const dotGeo = new THREE.BufferGeometry();
dotGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NDOT * 3), 3).setUsage(THREE.DynamicDrawUsage));
dotGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NDOT * 3), 3).setUsage(THREE.DynamicDrawUsage));
dotGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(NDOT), 1).setUsage(THREE.DynamicDrawUsage));
const dotMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 500 } },
  vertexShader: `attribute float size; attribute vec3 color; uniform float uScale; varying vec3 vC;
    void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position, 1.0); gl_PointSize = max(2.0, size*uScale/max(1.0, -mv.z)); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `varying vec3 vC;
    void main(){ vec2 c = gl_PointCoord*2.0 - 1.0; float r = dot(c, c); if (r > 1.0) discard; float a = exp(-r*3.2)*(1.0 - r);
      gl_FragColor = vec4(vC*(0.6 + 2.4*exp(-r*9.0))*a, a); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const dotMesh = new THREE.Points(dotGeo, dotMat);
dotMesh.frustumCulled = false; dotMesh.renderOrder = 6; dotMesh.userData.noAO = true; dotMesh.raycast = () => {};
scene.add(dotMesh);

// ---------------- Duman ve buhar (yumuşak ışık alan parçacıklar) ----------------
const smoke = createSmoke(LOW ? 800 : 1500);
scene.add(smoke.mesh);
const emitAcc = { komur: 0, sogutma: 0, gaz: 0 };
const _e = new THREE.Vector3();
function emit(name) {
  if (name === 'komur') {
    _e.copy(coal.chimneyTop).add(plants.komur.g.position);
    smoke.emit(_e.x + rand(-2, 2), _e.y, _e.z + rand(-2, 2), rand(-1, 1), rand(8, 11), rand(-1, 1), { s0: 9, s1: 70, life: 34, a: 0.3, alb: 0.6, rise: 4, drag: 0.35 });
  } else if (name === 'sogutma') {
    _e.copy(coal.towerTop).add(plants.komur.g.position);
    const a = rand(0, 6.28), rr = Math.sqrt(Math.random()) * coal.towerR * 0.75;
    smoke.emit(_e.x + Math.cos(a) * rr, _e.y, _e.z + Math.sin(a) * rr, rand(-1, 1), rand(5, 8), rand(-1, 1), { s0: 34, s1: 120, life: 24, a: 0.5, alb: 1.02, rise: 6, drag: 0.3 });
  } else {
    const s = gas.stacks[Math.random() < 0.5 ? 0 : 1];
    _e.copy(s).add(plants.gaz.g.position);
    smoke.emit(_e.x + rand(-1, 1), _e.y, _e.z + rand(-1, 1), rand(-0.5, 0.5), rand(7, 9), rand(-0.5, 0.5), { s0: 6, s1: 34, life: 12, a: 0.16, alb: 0.95, rise: 5, drag: 0.4 });
  }
}

// ---------------- Gökyüzü: güneş konumu modelin gündüz eğrisinden (06:30 doğuş, 19:30 batış) ----------------
let skyEl = 999, skyAz = 999, skyCl = -1;
function setSky(h, cloud) {
  const el = sunHeight(h) * 62, az = (((180 + (h - 13) * (120 / 6.5)) % 360) + 360) % 360, cl = 0.08 + 0.85 * cloud;
  if (Math.abs(el - skyEl) < 0.08 && Math.abs(az - skyAz) < 0.08 && Math.abs(cl - skyCl) < 0.01) return;
  skyEl = el; skyAz = az; skyCl = cl;
  sim.sky.set({ elevation: el, azimuth: az, clouds: cl });
}
sim.onRender(() => {
  const w = 0.5 + P.windMean * 0.08;
  veg.update(sim.time, w); vegNear.update(sim.time, w); plants.sehir.g.userData.trees.update(sim.time, w);
  for (const h of hedgeTrees) h.update(sim.time, w);
});

// ---------------- Arayüz ----------------
const ui = sim.ui;
const P = { cap: {} };
ui.section('Hazır senaryolar');
const presetSel = ui.select({
  options: [
    { value: 'dengeli', label: 'Dengeli karışım' },
    { value: 'komur', label: 'Kömür ağırlıklı' },
    { value: 'ordek', label: 'Bol güneş, bataryasız (ördek)' },
    { value: 'yesil', label: 'Yeşil şebeke + büyük batarya' },
    { value: 'durgun', label: 'Karanlık durgunluk (kış)' },
  ],
  value: 'dengeli', onChange: (v) => applyPreset(v),
});

ui.section('Kurulu güç');
const mw = (v) => `${fmt(v)} MW`;
const sl = {};
sl.gunes = ui.slider({ label: '☀️ Güneş', min: 0, max: 1500, step: 50, value: 500, format: mw, onChange: sync });
sl.ruzgar = ui.slider({ label: '🌬️ Rüzgâr', min: 0, max: 1000, step: 50, value: 300, format: mw, onChange: sync });
sl.hidro = ui.slider({ label: '💧 Hidroelektrik', min: 0, max: 500, step: 25, value: 150, format: mw, onChange: sync });
sl.komur = ui.slider({ label: '🏭 Kömür', min: 0, max: 1200, step: 50, value: 500, format: mw, onChange: sync });
sl.gaz = ui.slider({ label: '🔥 Doğalgaz', min: 0, max: 1000, step: 50, value: 400, format: mw, onChange: sync });
sl.battP = ui.slider({ label: '🔋 Batarya gücü', min: 0, max: 600, step: 25, value: 100, format: mw, onChange: sync });
sl.battH = ui.slider({ label: '🔋 Batarya süresi', min: 1, max: 8, step: 1, value: 4, format: (v) => `${v} saat · ${fmt(v * sl.battP.value)} MWh`, onChange: sync });

ui.section('Hava ve talep');
sl.cloud = ui.slider({ label: 'Bulutluluk', min: 0, max: 100, step: 5, value: 20, unit: '%', onChange: sync });
sl.wind = ui.slider({ label: 'Ortalama rüzgâr hızı', min: 0, max: 16, step: 0.5, value: 7, unit: 'm/s', onChange: sync });
const windMode = ui.segmented({ label: 'Rüzgâr', options: [{ value: 'var', label: 'Değişken' }, { value: 'sabit', label: 'Sabit' }], value: 'var', onChange: sync });
sl.peak = ui.slider({ label: 'Akşam tepe talebi', min: 600, max: 1600, step: 50, value: 1000, format: mw, onChange: sync });

ui.section('Dağıtım kuralları');
const orderSel = ui.segmented({ label: 'Öncelik sırası', options: [{ value: 'maliyet', label: 'En ucuz önce' }, { value: 'karbon', label: 'En temiz önce' }], value: 'maliyet', onChange: sync });
sl.carbon = ui.slider({ label: 'Karbon fiyatı', min: 0, max: 150, step: 5, value: 20, unit: '$/t', onChange: sync });
sl.ramp = ui.slider({ label: 'Kömür rampa hızı', min: 5, max: 60, step: 5, value: 25, format: (v) => `saatte %${v}`, onChange: sync });
const shave = ui.toggle({ label: 'Batarya akşam zirvesinde (17–23) boşalsın', value: true, onChange: sync });
const costText = ui.text('', 'card');

ui.section('Görünüm');
const flowT = ui.toggle({ label: '⚡ Hatlarda güç akışı (ışıklı noktalar)', value: true });

ui.section('Şu an');
const stDemand = ui.stat({ label: 'Talep', unit: 'MW' });
const stSupply = ui.stat({ label: 'Karşılanan', unit: 'MW' });
const stMarg = ui.stat({ label: 'Fiyatı belirleyen' });
const stWind = ui.stat({ label: 'Rüzgâr hızı', unit: 'm/s' });
const socMeter = ui.meter({ label: '🔋 Batarya doluluğu', color: SRC.batarya.color });
const damMeter = ui.meter({ label: '💧 Baraj doluluğu', color: SRC.hidro.color });
const statusText = ui.text('', 'card');

ui.section('Bugün (00:00’dan beri)');
const stRen = ui.stat({ label: 'Yenilenebilir payı', unit: '%' });
const stCO2 = ui.stat({ label: 'CO₂', unit: 't' });
const stCost = ui.stat({ label: 'Maliyet', unit: 'bin $' });
const stAvg = ui.stat({ label: 'Ort. maliyet', unit: '$/MWh' });
const stDef = ui.stat({ label: 'Kesinti', unit: 'MWh' });
const stCurt = ui.stat({ label: 'Kısıntı', unit: 'MWh' });

// Yığılmış alan grafiği (24 saat, 5 dk çözünürlük)
const N = 288;
const buf = { D: new Float32Array(N), net: new Float32Array(N), ch: new Float32Array(N) };
for (const k of STACK) buf[k] = new Float32Array(N);
const chartWrap = document.createElement('div');
chartWrap.className = 'chart';
chartWrap.innerHTML = `<div class="chart-title">Üretim kaynakları ve talep (24 saat) — ördek eğrisi</div>`;
const cv = document.createElement('canvas');
cv.style.height = '170px';
chartWrap.append(cv);
const legend = document.createElement('div');
legend.className = 'legend';
legend.innerHTML = STACK.map((k) => `<span><i style="background:${SRC[k].color}"></i>${SRC[k].name}</span>`).join('') +
  `<span><i style="background:#fff"></i>Talep</span><span><i style="background:#fb7185"></i>Net yük</span>`;
chartWrap.append(legend);
ui.append(chartWrap);
let cursor = 0;

function drawChart() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth || 270, H = 170;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = H * dpr; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  let hi = 100, lo = 0;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (const k of STACK) s += buf[k][i];
    hi = Math.max(hi, s, buf.D[i]);
    lo = Math.min(lo, -buf.ch[i], buf.net[i]);
  }
  hi *= 1.06; lo = lo < 0 ? lo * 1.1 : 0;
  const pl = 36, pr = 6, pt = 6, pb = 16, iw = W - pl - pr, ih = H - pt - pb;
  const X = (i) => pl + (iw * i) / (N - 1), Y = (v) => pt + ih * (1 - (v - lo) / (hi - lo));
  ctx.font = '10px system-ui';
  ctx.fillStyle = 'rgba(148,163,184,.85)';
  ctx.strokeStyle = 'rgba(148,163,184,.18)';
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (let k = 0; k <= 3; k++) {
    const v = lo + ((hi - lo) * k) / 3, y = Y(v);
    ctx.beginPath(); ctx.moveTo(pl, y); ctx.lineTo(W - pr, y); ctx.stroke();
    ctx.fillText(fmt(v), pl - 4, y);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const hh of [0, 6, 12, 18, 24]) ctx.fillText(String(hh).padStart(2, '0'), X((hh / 24) * (N - 1)), H - pb + 3);
  const drawAll = (alpha) => {
    ctx.globalAlpha = alpha;
    const base = new Float32Array(N);
    for (const k of STACK) {
      ctx.fillStyle = SRC[k].color;
      ctx.beginPath();
      for (let i = 0; i < N; i++) ctx.lineTo(X(i), Y(base[i] + buf[k][i]));
      for (let i = N - 1; i >= 0; i--) ctx.lineTo(X(i), Y(base[i]));
      ctx.fill();
      for (let i = 0; i < N; i++) base[i] += buf[k][i];
    }
    ctx.fillStyle = SRC.batarya.color;
    ctx.globalAlpha = alpha * 0.5;
    ctx.beginPath();
    for (let i = 0; i < N; i++) ctx.lineTo(X(i), Y(-buf.ch[i]));
    for (let i = N - 1; i >= 0; i--) ctx.lineTo(X(i), Y(0));
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); for (let i = 0; i < N; i++) ctx.lineTo(X(i), Y(buf.D[i])); ctx.stroke();
    ctx.setLineDash([4, 3]); ctx.strokeStyle = '#fb7185';
    ctx.beginPath(); for (let i = 0; i < N; i++) ctx.lineTo(X(i), Y(buf.net[i])); ctx.stroke();
    ctx.setLineDash([]);
  };
  drawAll(0.3); // dünün verisi (imlecin sağı)
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, X(cursor), H); ctx.clip();
  drawAll(1);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(X(cursor), pt); ctx.lineTo(X(cursor), H - pb); ctx.stroke();
}

function sync() {
  for (const k of ['gunes', 'ruzgar', 'hidro', 'komur', 'gaz']) P.cap[k] = sl[k].value;
  P.battP = sl.battP.value;
  P.battE = sl.battP.value * sl.battH.value;
  sl.battH.set(sl.battH.value);
  P.cloud = sl.cloud.value / 100;
  P.windMean = sl.wind.value;
  P.windVar = windMode.value === 'var';
  P.peak = sl.peak.value;
  P.order = orderSel.value;
  P.carbon = sl.carbon.value;
  P.coalRamp = sl.ramp.value / 100;
  P.peakShave = shave.value;
  if (state) {
    state.komur = clamp(state.komur, P.cap.komur * SRC.komur.min, P.cap.komur);
    state.gaz = Math.min(state.gaz, P.cap.gaz);
    state.battSoc = Math.min(state.battSoc, P.battE);
    state.hydroStore = Math.min(state.hydroStore, P.cap.hidro * 12);
  }
  const cc = marginalCost('komur', P.carbon), cg = marginalCost('gaz', P.carbon);
  costText.set(`Marjinal maliyet: kömür <b>${fmt(cc)}</b> $/MWh · gaz <b>${fmt(cg)}</b> $/MWh<br>` +
    (P.order === 'karbon' ? 'Temiz sıralama: gaz kömürden önce çalışır.' : cc <= cg ? 'Kömür daha ucuz → önce kömür çalışır.' : '<b>Gaz daha ucuz</b> → karbon fiyatı sıralamayı değiştirdi.'));
}

const PRESETS = {
  dengeli: { gunes: 500, ruzgar: 300, hidro: 150, komur: 500, gaz: 400, battP: 100, battH: 4, cloud: 20, wind: 7, carbon: 20 },
  komur: { gunes: 100, ruzgar: 100, hidro: 100, komur: 1000, gaz: 200, battP: 0, battH: 4, cloud: 20, wind: 7, carbon: 10 },
  ordek: { gunes: 1500, ruzgar: 200, hidro: 100, komur: 700, gaz: 250, battP: 0, battH: 4, cloud: 0, wind: 5, carbon: 20 },
  yesil: { gunes: 1300, ruzgar: 800, hidro: 250, komur: 0, gaz: 400, battP: 450, battH: 6, cloud: 10, wind: 8, carbon: 80 },
  durgun: { gunes: 800, ruzgar: 600, hidro: 150, komur: 200, gaz: 300, battP: 100, battH: 4, cloud: 90, wind: 2, carbon: 20 },
};
function applyPreset(name) {
  const p = PRESETS[name];
  for (const [k, v] of Object.entries(p)) sl[k].set(v);
  windMode.set(name === 'durgun' ? 'sabit' : 'var');
  sync();
  sim.toast(`Senaryo: <b>${presetSel.select.selectedOptions[0].textContent}</b>`);
}

// ---------------- Simülasyon durumu ----------------
let state = null, hAbs = START_H, today = null, lastOut = null, blackoutWas = false, curtailWas = false, dayNo = 0;
const zeroDay = () => ({ E: 0, ren: 0, co2: 0, cost: 0, def: 0, curt: 0 });

function record(o, h) {
  const i = Math.floor((((h % 24) + 24) % 24) * 12) % N;
  buf.komur[i] = o.komur; buf.hidro[i] = o.hidro; buf.gaz[i] = o.gaz; buf.ruzgar[i] = o.W; buf.gunes[i] = o.S;
  buf.batarya[i] = o.batarya; buf.ch[i] = o.charge; buf.D[i] = o.D; buf.net[i] = o.D - o.S0 - o.W0;
  cursor = i;
}
function accumulate(o, dtH) {
  today.E += o.served * dtH;
  today.ren += Math.min(o.served, o.S + o.W + o.hidro) * dtH;
  today.co2 += o.co2; today.cost += o.cost;
  today.def += o.deficit * dtH; today.curt += o.curtail * dtH;
}
function advance(toH, quiet = false) {
  while (hAbs + 1e-9 < toH) {
    const dtH = Math.min(SUB, toH - hAbs);
    const prevDay = Math.floor(hAbs / 24);
    hAbs += dtH;
    const o = step(state, P, hAbs, dtH);
    if (Math.floor(hAbs / 24) !== prevDay) {
      if (!quiet) {
        dayNo++;
        sim.toast(`🌙 Gün ${dayNo} bitti · CO₂ ${fmt(today.co2)} t · yenilenebilir %${fmt((100 * today.ren) / Math.max(1, today.E))} · kesinti ${fmt(today.def)} MWh`, today.def > 1 ? 'bad' : 'good');
      }
      today = zeroDay();
    }
    accumulate(o, dtH);
    record(o, hAbs);
    lastOut = o;
  }
}

function resetAll() {
  state = newState(P);
  today = zeroDay();
  for (const k in buf) buf[k].fill(0);
  // Dünden bu yana ısınma: grafiği ve depoları doldur
  hAbs = START_H - 40;
  advance(START_H, true);
  dayNo = 0;
  blackoutWas = curtailWas = false;
  refreshStats();
  drawChart();
}

// ---------------- Döngü ----------------
sim.onUpdate((dt) => {
  advance(START_H + sim.time / SEC_PER_HOUR);
});

const _v = new THREE.Vector3(), _c = new THREE.Color(), _db = new THREE.Vector2();
function updateScene(realDt) {
  const o = lastOut;
  if (!o) return;
  const h = ((hAbs % 24) + 24) % 24;
  const s = sunHeight(h);
  const day = clamp(s * 3 + 0.35, 0, 1);
  const cloud = P.cloud;
  // Gökyüzü: güneş yüksekliği modelle aynı eğriden; bulutluluk kaydırıcısı gökyüzüne yansır
  setSky(h, cloud);
  const night = 1 - ss(skyEl, -5, 6);
  const blinkOn = Math.sin(performance.now() / 500) > 0.3 ? 1 : 0;
  for (const m of beacons) m.emissiveIntensity = night * blinkOn * 14;
  coal.lights.emissiveIntensity = night * blinkOn * 14;
  wireMat.color.copy(sim.sky.ambient).multiplyScalar(0.3);
  fleet.lights(night);
  coal.lamps.setLit(night); gas.lamps.setLit(night);
  smoke.wind.set(0.6 + P.windMean * 0.9, 0, 0.3 + P.windMean * 0.35);

  // Mahalle ışıkları ve karartma
  const dark = o.deficit > 1 ? Math.min(NDIST, Math.ceil((o.deficit / o.D) * NDIST)) : 0;
  districts.forEach((d, i) => {
    d.on = i < NDIST - dark;
    d.city.setLit(d.on ? night * 1.05 : 0);
    d.lamps.setLit(d.on ? night : 0);
  });

  // İzleyiciler güneşi doğudan batıya izler, gece yatay konuma geçer
  solar.setTilt(s > 0 ? clamp(((h - 13) / 6.5) * 0.95, -0.95, 0.95) : 0);
  const w = o.wind;
  const rpm = w < 3 || w > 25 ? 0 : Math.min(w, 12) / 12;
  rotors.forEach((r) => (r.rotation.z -= realDt * rpm * 2.2 * Math.min(sim.speed, 2) * (sim.paused ? 0 : 1)));

  water.position.y = LVL0 + (LVL1 - LVL0) * o.hydroFrac;
  riverMat.opacity = 0.35 + 0.6 * (o.hidro / Math.max(1, P.cap.hidro));

  const socC = o.batarya > 1 ? 0xf59e0b : o.charge > 1 ? 0x22d3ee : 0x22c55e;
  const blink = 0.6 + 0.4 * Math.sin(performance.now() / 180);
  battLeds.forEach((l, i) => {
    l.visible = P.battP > 0;
    const lit = (i + 0.5) / battLeds.length <= o.soc + 0.02;
    l.material.color.setHex(lit ? socC : 0x1f2937).multiplyScalar(o.batarya > 1 || o.charge > 1 ? blink : 1);
  });

  // Hat akışları (ışıklı noktalar)
  dotMesh.visible = flowT.value;
  const flows = { gunes: o.S, ruzgar: o.W, komur: o.komur, gaz: o.gaz, hidro: o.hidro, batarya: o.batarya - o.charge, sehir: o.served };
  const dp = dotGeo.attributes.position.array, dc = dotGeo.attributes.color.array, ds = dotGeo.attributes.size.array;
  let n = 0;
  for (const L of lines) {
    const f = flows[L.key];
    const dir = L.key === 'sehir' ? -1 : 1; // şehir hattında akış merkezden şehre
    L.phase = (L.phase + realDt * (sim.paused ? 0 : 1) * Math.sign(f) * dir * (0.1 + Math.min(Math.abs(f), 1500) / 2500)) % 1;
    const sc = Math.abs(f) > 2 ? 0.6 + Math.sqrt(Math.abs(f)) / 22 : 0;
    const c = f < -1 ? _c.setHex(0x22d3ee) : L.color;
    for (let k = 0; k < DOTS; k++) {
      const u = (((L.phase + k / DOTS) % 1) + 1) % 1;
      L.curve.getPointAt(u, _v);
      dp[n * 3] = _v.x; dp[n * 3 + 1] = _v.y; dp[n * 3 + 2] = _v.z;
      dc[n * 3] = c.r; dc[n * 3 + 1] = c.g; dc[n * 3 + 2] = c.b;
      ds[n] = 9 * sc;
      n++;
    }
  }
  dotGeo.attributes.position.needsUpdate = dotGeo.attributes.color.needsUpdate = dotGeo.attributes.size.needsUpdate = true;
  dotMat.uniforms.uScale.value = sim.renderer.getDrawingBufferSize(_db).y / (2 * Math.tan((sim.camera.fov * Math.PI) / 360));

  // Duman ve buhar: yayım hızı santral çıkışıyla orantılı
  if (!sim.paused) {
    const k = realDt * Math.min(sim.speed, 3);
    emitAcc.komur += k * 6 * (o.komur / 600);
    emitAcc.sogutma += k * 5 * (o.komur / 600);
    emitAcc.gaz += k * 3 * (o.gaz / 500);
    for (const e in emitAcc) while (emitAcc[e] >= 1) { emit(e); emitAcc[e] -= 1; }
    smoke.update(realDt);
  }
  smoke.light(sim.sky, sim.camera);

  // Etiketler
  const lab = (key, icon, v) => {
    const cap = key === 'batarya' ? P.battP : P.cap[key];
    plants[key].lbl.visible = cap > 0;
    plants[key].lbl.setText(`${icon} ${SRC[key].name} <span style="color:${SRC[key].color}">${fmt(v)} MW</span>`);
  };
  lab('gunes', '☀️', o.S);
  lab('ruzgar', '🌬️', o.W);
  lab('komur', '🏭', o.komur);
  lab('gaz', '🔥', o.gaz);
  lab('hidro', '💧', o.hidro);
  plants.batarya.lbl.visible = P.battP > 0;
  plants.batarya.lbl.setText(`🔋 %${fmt(o.soc * 100)} ${o.batarya > 1 ? `<span style="color:#f59e0b">▼ ${fmt(o.batarya)} MW</span>` : o.charge > 1 ? `<span style="color:#22d3ee">▲ ${fmt(o.charge)} MW</span>` : ''}`);
  plants.sehir.lbl.setText(dark ? `🏙️ <span style="color:#f87171">⚠️ ${dark} mahalle karanlıkta</span>` : `🏙️ Şehir talebi ${fmt(o.D)} MW`);
  for (const k of ['gunes', 'ruzgar', 'komur', 'gaz', 'hidro']) plants[k].g.visible = P.cap[k] > 0;
  plants.batarya.g.visible = P.battP > 0;
}
sim.onRender(updateScene);

function refreshStats() {
  const o = lastOut;
  if (!o) return;
  stDemand.set(fmt(o.D));
  stSupply.set(fmt(o.served), o.deficit > 1 ? 'bad' : 'good');
  const mk = o.marginal;
  stMarg.set(mk === 'kesinti' ? 'Kesinti!' : SRC[mk].name, mk === 'kesinti' ? 'bad' : mk === 'komur' || mk === 'gaz' ? 'warn' : 'good');
  stWind.set(fmt(o.wind, 1));
  socMeter.set(o.soc, P.battE > 0 ? `%${fmt(o.soc * 100)} · ${fmt(o.soc * P.battE)} MWh` : 'yok');
  damMeter.set(o.hydroFrac, P.cap.hidro > 0 ? `%${fmt(o.hydroFrac * 100)}` : 'yok');
  const ren = (100 * today.ren) / Math.max(1, today.E);
  stRen.set(fmt(ren), ren > 60 ? 'good' : ren < 25 ? 'bad' : 'warn');
  stCO2.set(fmt(today.co2));
  stCost.set(fmt(today.cost / 1000));
  stAvg.set(fmt(today.cost / Math.max(1, today.E), 1));
  stDef.set(fmt(today.def), today.def > 0.5 ? 'bad' : 'good');
  stCurt.set(fmt(today.curt), today.curt > 0.5 ? 'warn' : '');

  const h = ((hAbs % 24) + 24) % 24;
  const msg = [];
  if (o.deficit > 1) msg.push(`<b style="color:var(--bad)">⚠️ Arz yetersiz:</b> ${fmt(o.deficit)} MW eksik. Kademeli kesinti uygulanıyor.` +
    (P.cap.komur > 0 && state.komur < P.cap.komur - 1 && o.komur >= state.komur - 1 ? ' Kömür santrali rampa sınırı yüzünden yetişemiyor.' : ''));
  if (o.curtail > 1) msg.push(`<b style="color:var(--warn)">✂️ Kısıntı:</b> ${fmt(o.curtail)} MW yenilenebilir üretim şebekeye alınamıyor (talep + batarya dolu).`);
  if (o.coalForced) msg.push('Kömür minimum kararlı yükün altına zorlandı (gerçekte santral durdurulmalı).');
  if (o.charge > 1) msg.push(`🔋 Fazla üretim bataryada depolanıyor (${fmt(o.charge)} MW).`);
  if (o.batarya > 1) msg.push(`🔋 Batarya zirveyi tıraşlıyor (${fmt(o.batarya)} MW).`);
  if (!msg.length) {
    if (h >= 17 && h < 22) msg.push('Akşam zirvesi: güneş batarken talep en yüksek noktada.');
    else if (o.S > o.D * 0.4) msg.push('Öğle: güneş talebin büyük kısmını karşılıyor; termik santraller geri çekildi.');
    else msg.push('Şebeke dengede: üretim = talep.');
  }
  statusText.set(msg.join('<br>'));

  if (o.deficit > 1 && !blackoutWas) sim.toast('⚠️ Kesinti başladı: bazı mahalleler karanlıkta', 'bad');
  if (o.curtail > 20 && !curtailWas) sim.toast('✂️ Fazla yenilenebilir üretim kısılıyor', 'warn');
  blackoutWas = o.deficit > 1;
  curtailWas = o.curtail > 20;
}
let statT = 0;
sim.onRender((dt) => {
  statT += dt;
  if (statT > 0.25) { statT = 0; refreshStats(); drawChart(); }
});

// Santrallere tıkla → bilgi
const INFO = {
  gunes: 'Güneş: yakıt yok, CO₂ yok. Üretim güneşin yüksekliğine ve bulutlara bağlı; geceleri sıfır.',
  ruzgar: 'Rüzgâr: 3 m/s altında durur, 12 m/s’de anma gücüne ulaşır, 25 m/s üstünde güvenlik için kapanır. Güç ≈ hızın küpü.',
  hidro: 'Baraj: çok hızlı devreye girer ama suyu sınırlıdır. Günlük akış + depo kadar üretebilir.',
  batarya: 'Batarya: fazlayı depolar, zirvede verir. Gidiş-dönüş verimi ≈ %90. Enerji üretmez, zamanı kaydırır.',
  komur: () => `Kömür: ≈ 0,95 t CO₂/MWh · marjinal maliyet ${fmt(marginalCost('komur', P.carbon))} $/MWh. Yavaş: saatte %${sl.ramp.value} güç değiştirebilir, %40 altına inemez.`,
  gaz: () => `Doğalgaz: ≈ 0,40 t CO₂/MWh · marjinal maliyet ${fmt(marginalCost('gaz', P.carbon))} $/MWh. Hızlı: yarım saatte tam güce çıkabilir.`,
};
sim.onClick(() => ['gunes', 'ruzgar', 'hidro', 'batarya', 'komur', 'gaz'].map((k) => plants[k].g), (hit) => {
  let o = hit.object;
  const key = Object.keys(INFO).find((k) => { let p = o; while (p) { if (p === plants[k].g) return true; p = p.parent; } return false; });
  if (!key) return;
  const t = INFO[key];
  sim.toast(typeof t === 'function' ? t() : t);
});

sim.onReset(resetAll);
sync();
resetAll();
// Açılış karesinde baca dumanı ve soğutma kulesi buharı hazır olsun: ~30 sn'lik yayılımı önceden işlet
{
  const o = lastOut, acc = { komur: 0, sogutma: 0, gaz: 0 }, h = 0.25;
  smoke.wind.set(0.6 + P.windMean * 0.9, 0, 0.3 + P.windMean * 0.35);
  for (let t = 0; t < 30; t += h) {
    acc.komur += h * 6 * (o.komur / 600); acc.sogutma += h * 5 * (o.komur / 600); acc.gaz += h * 3 * (o.gaz / 500);
    for (const e in acc) while (acc[e] >= 1) { emit(e); acc[e] -= 1; }
    smoke.update(h);
  }
}
vegLodPos = null;
vegLod(); // ilk kare de ayrıntı düzeyleriyle çizilsin
