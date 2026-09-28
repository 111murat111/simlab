// Salgın Haritası — mini kasabada 1200 kişilik birey tabanlı SIR + aşı modeli: ev, okul, iş, çarşı ve hastane temasları.
import { createSim, THREE, fmt, lerp, clamp, smoothstep, instanced, mat, landscape, createTerrain, terrainSkirt, terrainMaterial, createVegetation, BufferGeometryUtils, populateCity, carFleet, streetLamps, crowd } from '@core';
import { createModel, S, I, R, V, TICKS } from './model.js';
import { treeGeometry, leafMat, barkMat } from './kit.js';

const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
const DAY_SEC = 3;          // 1× hızda bir gün = 3 saniye
const COLS = 10, ROWS_Z = [-19, -15, -11, 11, 15, 19];
const PER_B = 20;
const COL = { S: 0xfacc15, I: 0xef4444, R: 0x9ca3af, V: 0x3b82f6, Q: 0x7f1d1d };
const U = 8;                // yerleşim birimi = 8 m (apartman aralığı 32 m, kasaba ≈ 370 m)
// açılış kamerası: çarşı meydanına ≈ 30 m yükseklikten, hafif eğik bakış (figürler ve durum renkleri okunur)
const CAM0 = [[-14, 30, 84], [2, 1.5, 12]];
// park yolu: mekânlar arası çim şeritlerde (merkez sx = ±30, ±90, ±150 m) kıvrılan çakıl yol (zemin gölgelendiricisiyle aynı formül)
const pathX = (sx, z) => sx + 2.2 * Math.sin(z * 0.07 + sx * 0.1);

const sim = createSim({
  sky: { elevation: 42, azimuth: 205, clouds: 0.3, haze: 2.0, visibility: 2200, wind: [3, 1] },
  camera: { position: CAM0[0], target: CAM0[1], fov: 42, near: 0.5, far: 60000 },
  controls: { maxDistance: 1600, minDistance: 12, maxPolarAngle: 1.45 },
  shadows: true,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>1.200 kişilik bir kasaba (≈ 370 × 370 m). Her renkli işaret bir kişi: <b style="color:#facc15">sarı</b> hassas, <b style="color:#f87171">kırmızı</b>
    enfekte (<b style="color:#b91c1c">koyu kırmızı</b>: evde izole), <b style="color:#cbd5e1">gri</b> iyileşmiş (bağışık), <b style="color:#60a5fa">mavi</b> aşılı.
    İşaretlerin altında gerçek boyda insanlar yürür; yakında işaretler söner ve aynı durum rengini figürlerin üst giysisi taşır. İnsanlar gece evdedir; sabah çocuklar okula, yetişkinler ofis, fabrika,
    çarşı ve hastaneye gider, akşam bir kısmı alışverişe çıkar. Hastalık aynı yerde bulunan kişiler arasındaki temaslarla bulaşır.
    Çatıların kırmızılaşması o apartmandaki vaka yoğunluğunu gösterir.</p>
    <p>Bu, klasik <b>SIR</b> (Hassas → Enfekte → İyileşmiş) modelinin birey tabanlı hâlidir. <b>Efektif R</b>, bir enfektenin şu anki
    koşullarda ortalama kaç kişiye bulaştırdığıdır: R &gt; 1 iken vakalar artar, R &lt; 1 olunca azalır. Bağışık (aşılı + iyileşmiş) oranı
    yeterince yükselince salgın söner; buna <b>sürü bağışıklığı</b> denir.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Önlemsiz</b> senaryoda sivri zirveyi ve hastane kapasitesinin aşıldığı günleri gör.</li>
      <li><b>Maske + mesafe</b> ile “eğriyi düzleştir”: zirve düşer, salgın uzar, hastane taşmaz.</li>
      <li><b>%70 aşı</b>: birkaç vaka olur ama salgın büyüyemez. Aşı oranını salgın sırasında artırmayı da dene.</li>
      <li><b>Okullar kapalı</b> ve <b>karantina</b>yı tek tek aç: hangisi daha etkili?</li>
      <li>Bir apartmana tıkla: oraya yeni bir vaka gelir. Bir kişiye tıkla: durumunu ve kaç kişiye bulaştırdığını gör.</li>
      <li>“Görünüm” bölümünden gece–gündüz ışığını aç ya da sokak seviyesine in.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>COVID-19 döneminde “eğriyi düzleştir” çağrısının amacı, aynı anda hastalanan kişi sayısını hastanelerin kaldırabileceği
    düzeyde tutmaktı. Kızamık gibi çok bulaşıcı hastalıklarda sürü bağışıklığı için çok yüksek aşılama oranı gerekir; bu yüzden
    aşı oranındaki küçük düşüşler bile salgınlara yol açabilir.</p>
    <h3>Model ve sınırları</h3>
    <p><small>Varsayımlar: evde 2 saatte ortalama 0,4 hane içi temas; dışarıda günlük temas sayısı kaydırıcıyla ayarlanır ve
    temas aynı mekândaki rastgele biriyledir. Maske (yalnız ev dışında) takan hastadan bulaşmayı %50, takan sağlıklıya bulaşmayı
    %30 azaltır. Aşı enfeksiyon riskini “aşı etkinliği” kadar azaltır. Enfektelerin yaklaşık üçte ikisi belirti gösterir; karantina açıkken
    bunlar belirtiden sonra evde kalır. Ağır seyir olasılığı yaşla artar; yatak yoksa hasta evde kalır. Ölümler, yeniden enfeksiyon ve
    kuluçka dönemi modellenmemiştir. Sayılar belirli bir hastalığa ait değildir; kavramları göstermek içindir. Kasaba gerçek ölçekte
    çizilmiştir; 60 apartmanın her birinde 20 kişi (5 hane) yaşar, bu yüzden yapılar gerçek bir kasabaya göre seyrek nüfusludur.</small></p>`,
});
const scene = sim.scene;

const model = createModel({ buildings: COLS * ROWS_Z.length, perBuilding: PER_B, hhSize: 4 });
const N = model.N;
sim.formatTime = () => `${model.day + 1}. gün · ${String(model.hour * 2).padStart(2, '0')}:00`;

// --- Kasaba yerleşimi (model birimleri; sahnede × U metre) ---
const bPos = [];            // apartman merkezleri
ROWS_Z.forEach((z) => { for (let c = 0; c < COLS; c++) bPos.push([-18 + c * 4, z]); });
const PLACES = [
  { name: '🏫 Okul', cx: -15, h: 11.4 },
  { name: '🏢 Ofisler', cx: -7.5, h: 40 },
  { name: '🛒 Çarşı', cx: 0, h: 11 },
  { name: '🏭 Fabrika', cx: 7.5, h: 12.5 },
  { name: '🏥 Hastane', cx: 15, h: 24.4 },
];
const PLAZA = { z0: -2.6, z1: 5.4, hw: 2.8 };
const WARD = { x0: 12.4, x1: 17.6, z0: 3.6, z1: 5.4 };
const BZ = -4.6 * U, BW = 5.6 * U, BD = 2.6 * U;   // mekân binaları: merkez z, genişlik, derinlik (m)

const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();
const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), eul = new THREE.Euler();

// --- Arazi: kasaba düz bir ova tabanında, çevrede tepeler ---
const hills = landscape({ seed: 17, size: 1700, height: 190, octaves: 6, warp: 0.4 });
const roll = landscape({ seed: 4, size: 420, height: 5, octaves: 3, warp: 0.2 });
const TOWN = 232;           // düz alan yarı genişliği (m)
function hW(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  const k = smoothstep(TOWN, TOWN + 90, d);
  return k * (roll(x, z) + 2) + smoothstep(TOWN + 150, 1500, Math.hypot(x, z)) * (hills(x, z) + 70);
}

// Kasaba dışı tarla yamaları (buğday, yeşil ekin, sürülmüş toprak, nadas), sürüm izleri, tarla kenarı otları; uzakta söner
const FIELDS_GLSL = /* glsl */ `
vec3 fieldsAt(vec3 base, vec2 w, float mid){
  vec2 fs = vec2(46.0, 34.0), fc = floor((w + vec2(13.0, 7.0))/fs), fl = fract((w + vec2(13.0, 7.0))/fs);
  float fr = fract(sin(dot(fc, vec2(12.9898, 78.233)))*43758.5453);
  float fdir = step(0.5, fract(fr*7.0));
  float furrow = 0.5 + 0.5*sin(mix(w.x, w.y, fdir)*2.4);
  vec3 crop = fr < 0.28 ? vec3(0.34, 0.27, 0.11) : fr < 0.5 ? vec3(0.1, 0.17, 0.045) : fr < 0.68 ? vec3(0.16, 0.1, 0.06) : base*vec3(1.05, 0.98, 0.9);
  crop *= (0.86 + 0.18*furrow*step(fr, 0.68))*(0.92 + 0.16*mid);
  float marg = 1.0 - smoothstep(0.0, 0.035, min(min(fl.x, 1.0 - fl.x), min(fl.y, 1.0 - fl.y)));
  crop = mix(crop, base*0.85, marg);
  float r = max(abs(w.x), abs(w.y));
  float ring = smoothstep(193.0, 200.0, r)*(1.0 - smoothstep(1100.0, 1500.0, length(w)));
  return mix(base, crop, ring);
}`;
function withFields(m, key) {
  const orig = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    orig(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FIELDS_GLSL)
      .replace('diffuseColor.rgb = c;', 'diffuseColor.rgb = c;\n diffuseColor.rgb = fieldsAt(diffuseColor.rgb, vTW.xz, fbm3(vec3(vTW.xz*0.04, 7.0), 3));');
  };
  m.customProgramCacheKey = () => key;
  return m;
}

function townGround() {
  const m = terrainMaterial({ water: -200, forest: 0, grass: 0x5f7534, dry: 0x958c5a, soil: 0x6d5a40, forestCol: 0x2f4424, wet: 0, grassAmount: 0.9 });
  const orig = m.onBeforeCompile;
  const f = (v) => v.toFixed(2);
  m.onBeforeCompile = (sh, r) => {
    orig(sh, r);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FIELDS_GLSL + '\nfloat gPave;\nfloat sdBox2(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }')
      .replace('diffuseColor.rgb = c;', /* glsl */ `diffuseColor.rgb = c;
        gPave = 0.0;
        {
          vec2 w = vTW.xz, q = w/${f(U)};
          float fine = vn3(vec3(w*1.7, 3.0)), mid = fbm3(vec3(w*0.04, 7.0), 3);
          vec3 lawn = diffuseColor.rgb*vec3(0.92, 1.05, 0.88)*(0.9 + 0.2*mid)*(0.95 + 0.07*step(0.5, fract(w.x/5.0 + 0.15*sin(w.y*0.05))));
          vec3 asph = vec3(0.115, 0.12, 0.125)*(0.85 + 0.3*fine)*(0.92 + 0.16*mid);
          vec2 tj = fract(w*vec2(1.0, 2.0));
          float joint = 1.0 - step(0.06, tj.x)*step(0.1, tj.y);
          vec3 walk = vec3(0.56, 0.54, 0.5)*(0.86 + 0.22*fine)*(1.0 - 0.18*joint);
          vec2 pj = fract(w*0.5);
          vec3 pave = mix(vec3(0.62, 0.58, 0.52), vec3(0.5, 0.47, 0.44), step(0.5, fract(dot(floor(w*0.5), vec2(0.5)))))*(0.9 + 0.15*fine);
          pave *= 1.0 - 0.2*(1.0 - step(0.04, pj.x)*step(0.04, pj.y));
          vec3 u = lawn; float pv = 0.0;
          float ax = abs(q.y), axx = abs(q.x);
          // apartman avluları (bina çevresinde kişilerin durduğu halka)
          if (ax > 9.3 && ax < 20.7 && axx < 20.7) {
            vec2 cc = vec2(-18.0 + 4.0*clamp(floor((q.x + 20.0)/4.0), 0.0, 9.0), sign(q.y)*(11.0 + 4.0*clamp(floor((ax - 9.0)/4.0), 0.0, 2.0)));
            vec2 d = abs(q - cc);
            float yard = step(max(d.x, d.y), 1.62);
            u = mix(u, walk, yard); pv = max(pv, yard);
          }
          // mekân meydanları ve binaların önü
          float kx = floor(q.x/7.5 + 0.5);
          if (abs(kx) < 2.5) {
            float dx = abs(q.x - 7.5*kx);
            float plaza = step(dx, 3.0)*step(-6.4, q.y)*step(q.y, 5.6);
            vec3 pl = pave;
            // taş döşeme: 8 m'de bir açık renk bordür çizgisi, hafif aşınma lekeleri, kenarda koyu granit şerit
            float acc = 1.0 - step(0.16, min(abs(fract(w.x/8.0) - 0.5), abs(fract(w.y/8.0) - 0.5))*8.0);
            pl = mix(pl, pl*1.16 + 0.02, acc*0.7);
            pl *= 0.9 + 0.14*smoothstep(0.3, 0.7, fbm3(vec3(w*0.18, 2.0), 2));
            float edge = min(24.0 - dx*8.0, min(q.y*8.0 + 51.2, 44.8 - q.y*8.0));
            pl = mix(pl, vec3(0.34, 0.33, 0.32)*(0.85 + 0.25*fine), step(edge, 1.3));
            if (kx < -1.5) {           // okul bahçesi: basketbol sahası çizgileri
              vec2 cp = w - vec2(-120.0, 12.0);
              float line = 1.0 - smoothstep(0.03, 0.09, abs(sdBox2(cp, vec2(14.0, 7.5))));
              line = max(line, (1.0 - smoothstep(0.03, 0.09, abs(cp.x)))*step(abs(cp.y), 7.5));
              line = max(line, 1.0 - smoothstep(0.03, 0.09, abs(length(cp) - 1.8)));
              pl = mix(mix(vec3(0.3, 0.42, 0.52), vec3(0.62, 0.36, 0.28), step(abs(cp.x), 14.0)*step(abs(cp.y), 7.5)), pl, 0.25) ;
              pl = mix(pl, vec3(0.9), line);
            }
            if (kx > 1.5) {            // hastane koğuş alanı: kırmızı çerçeveli zemin
              vec2 wc = w - vec2(${f((WARD.x0 + WARD.x1) / 2 * U)}, ${f((WARD.z0 + WARD.z1) / 2 * U)});
              float sd = sdBox2(wc, vec2(${f((WARD.x1 - WARD.x0) / 2 * U + 1.2)}, ${f((WARD.z1 - WARD.z0) / 2 * U + 1.2)}));
              pl = mix(pl, vec3(0.7, 0.68, 0.64), step(sd, 0.0));
              pl = mix(pl, vec3(0.62, 0.1, 0.08), 1.0 - smoothstep(0.35, 0.5, abs(sd + 0.4)));
            }
            u = mix(u, pl, plaza); pv = max(pv, plaza);
          }
          // park yolları: çim şeritlerde kıvrımlı çakıl yol; meydanların önünde taş gezinti yolu ve meydana giriş
          if (w.y > -52.0 && w.y < 60.8 && axx < 23.0) {
            float sx = (floor(w.x/60.0) + 0.5)*60.0;
            float gx = abs(w.x - (sx + 2.2*sin(w.y*0.07 + sx*0.1)));
            float gp = (1.0 - smoothstep(1.0, 1.25, gx))*step(abs(sx), 151.0)*step(w.y, 51.0);
            vec3 grav = vec3(0.6, 0.55, 0.46)*(0.8 + 0.3*vn3(vec3(w*6.0, 1.0)))*(0.94 + 0.1*fine);
            grav = mix(grav, lawn*0.8, smoothstep(0.7, 1.2, gx)*0.5);
            float prom = step(abs(w.y - 52.0), 1.6)*step(abs(w.x), 184.0);
            float conn = step(abs(w.x - 60.0*floor(w.x/60.0 + 0.5)), 2.5)*step(44.8, w.y)*step(abs(w.x), 123.0);
            vec3 pc = walk*vec3(1.06, 1.0, 0.92);
            pc = mix(pc, vec3(0.36, 0.35, 0.33)*(0.85 + 0.25*fine), prom*step(1.3, abs(w.y - 52.0)));
            float pp = max(prom, conn)*(1.0 - pv);
            u = mix(u, grav, gp*(1.0 - pv)*(1.0 - pp));
            u = mix(u, pc, pp);
            pv = max(pv, max(pp, gp*(1.0 - pv)));
          }
          // yollar: bulvarlar, sokaklar, ara yollar ve kaldırımlar
          float dA = abs(ax - 8.6), dS = min(abs(ax - 13.0), abs(ax - 17.0));
          float dV = abs(fract(q.x/4.0 + 0.5) - 0.5)*4.0;
          float inA = step(axx, 23.0), inS = step(axx, 21.0), inV = step(axx, 20.4)*step(10.0, ax)*step(ax, 20.0);
          float road = max(max(inA*step(dA, 0.7), inS*step(dS, 0.35)), inV*step(dV, 0.35));
          float side = max(max(inA*step(dA, 1.0), inS*step(dS, 0.62)), inV*step(dV, 0.62));
          u = mix(u, walk*vec3(1.02, 1.0, 0.97), side*(1.0 - road));
          vec3 rc = asph;
          float cl = inA*step(dA*${f(U)}, 0.08)*step(0.5, fract(w.x/6.0));                   // orta şerit kesikli çizgi
          float el = inA*(1.0 - smoothstep(0.06, 0.12, abs(dA*${f(U)} - 5.0)));              // kenar çizgisi
          rc = mix(rc, vec3(0.78, 0.76, 0.7), max(cl, el)*step(dA, 0.7));
          u = mix(u, rc, road);
          pv = max(pv, side);
          float town = step(axx, 23.6)*step(ax, 23.6);
          diffuseColor.rgb = fieldsAt(diffuseColor.rgb, w, mid);
          diffuseColor.rgb = mix(diffuseColor.rgb, u, town);
          gPave = pv*town;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, gPave);');
  };
  m.customProgramCacheKey = () => 'salgin-ground';
  return m;
}
const outerMat = withFields(terrainMaterial({ water: -200, forest: 0.55, grass: 0x5f7534, dry: 0x958c5a, soil: 0x6d5a40, forestCol: 0x2f4424, grassAmount: 0.9 }), 'salgin-outer');
scene.add(createTerrain(hW, { size: [620, 620], res: LOW ? [124, 124] : [186, 186], material: townGround() }));
{
  const far = createTerrain((x, z) => hW(x, z) - 0.8 * Math.min(smoothstep(310, 295, Math.abs(x)), smoothstep(310, 295, Math.abs(z))), { size: [24000, 24000], res: LOW ? [170, 170] : [240, 240], material: outerMat });
  const skirt = terrainSkirt(hW, { inner: 11500, outer: 80000, material: outerMat });
  far.userData.noFit = skirt.userData.noFit = true;
  scene.add(far, skirt);
  const veg = createVegetation(hW, {
    rect: [-6000, -6000, 6000, 6000], trees: LOW ? 2200 : 5000, shrubs: LOW ? 700 : 1600, rocks: 60, seed: 9,
    kinds: { broad: 0.55, cypress: 0.2, pine: 0.25 }, leafA: 0x3a5326, leafB: 0x67703a,
    forest: (x, z) => { const d = Math.max(Math.abs(x), Math.abs(z)); if (d < 300) return 0; return 0.15 + 0.45 * smoothstep(420, 1400, d); },
  });
  veg.group.userData.noFit = true;
  scene.add(veg.group);
}

// Gece ışığı (0–1): kent motoru pencereleri ve sokak lambaları buna göre yanar
const NIGHT = { value: 0 };
function colored(g, hex) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  const c = new THREE.Color(hex), a = new Float32Array(n.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  n.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return n;
}
const merge = (a) => BufferGeometryUtils.mergeGeometries(a);
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const gearMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });

// --- Binalar: kent motorunun gerçek binaları (cephe derinliği, pencere doğramaları, balkonlar, çatı ekipmanı) ---
// Apartmanlar: 60 bina, 3–7 kat, düz teraslı çatı (vaka yoğunluğu çatıda kırmızı katman olarak okunur), ön cephe sokağa bakar.
const nB = bPos.length;
const AW = 1.8 * U;               // 14,4 m azami taban
const bH = bPos.map((_, b) => (3 + ((b * 7) % 5)) * 3 + 0.5);   // 3–7 kat
const WALLS = [0xead6b0, 0xd9a86c, 0xc98a62, 0xaebf94, 0x9fb3c6, 0xeee8dc, 0xd4b98f, 0xbfcbb8, 0xe7c29c, 0xc7b8d0];
const aptLots = bPos.map(([x, z], b) => {
  const hr = Math.abs((Math.sin(b * 12.9898 + 4.1) * 43758.5453) % 1), hr2 = Math.abs((Math.sin(b * 78.233 + 1.7) * 12543.13) % 1);
  return {
    x: x * U, z: z * U, rot: z < 0 ? 0 : Math.PI, type: 'apartment', floors: Math.round((bH[b] - 0.5) / 3),
    width: AW * (0.8 + 0.2 * hr), depth: AW * (0.8 + 0.2 * hr2), roof: 'flat', shop: Math.abs(z) === 11,
    colors: { wall: WALLS[(b * 5 + (b >> 2)) % WALLS.length] }, seed: 100 + b * 7.3,
  };
});
// Mekânlar: okul (kamu binası, kırma çatı), ofis kulesi, kapalı çarşı (metal kırma çatı), tuğla fabrika (testere dişi çatı), hastane (beyaz cam cephe)
const placeLots = [
  { type: 'public', width: BW, depth: BD, floors: 2, roof: 'hip', colors: { wall: 0xe2c08c, trim: 0xf1ebe0, roof: 0x8a5b44 }, seed: 11 },
  { type: 'office', width: BW * 0.72, depth: BD, floors: 10, colors: { wall: 0x93a0ab, trim: 0xc9cdd0, frame: 0xa4aaae }, seed: 23 },
  { type: 'public', width: BW, depth: BD, floors: 1, roof: 'hip', colors: { wall: 0xd8c3a3, trim: 0xece3d2, roof: 0x5c6b66 }, seed: 31 },
  { type: 'industrial', width: BW, depth: BD, height: 9, roof: 'saw', material: 'brick', seed: 41 },
  { type: 'office', width: BW, depth: BD, floors: 6, colors: { wall: 0xeeeeea, trim: 0xd9d9d4, frame: 0x9aa0a4 }, roofGear: false, seed: 53 },
].map((L, k) => ({ ...L, x: PLACES[k].cx * U, z: BZ, rot: 0 }));
const NEAR = LOW ? 170 : 260;
const city = populateCity({ lots: [...aptLots, ...placeLots], seed: 7, tile: 96, near: NEAR, noRaycast: true });
scene.add(city.group);
// Yakın karoların ayrıntısı ilk kareden sonra tek seferde üretilir (sayfa açılışı bekletilmez; sonrası karo LOD'u ile)
{ let done = false; sim.onRender(() => { if (done || !(sim.frame >= 1)) return; done = true; const p = sim.camera.position; for (const t of city.tiles) if (t.distTo(p) < NEAR) { t.buildHigh(); t.low.visible = false; } }); }
const aSpec = city.specs.slice(0, nB), pSpec = city.specs.slice(nB);
{
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); scene.add(o); return o; };
  // Okul: bahçede bayrak direği
  {
    const P = PLACES[0], x = P.cx * U;
    add(new THREE.CylinderGeometry(0.06, 0.08, 12, 8).translate(0, 6, 0), mat.brushedMetal({ color: 0xd8dadd }), x - 17, 0, -18);
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 64;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#e30a17'; cx.fillRect(0, 0, 96, 64);
    cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(34, 32, 16, 0, 7); cx.fill();
    cx.fillStyle = '#e30a17'; cx.beginPath(); cx.arc(38, 32, 12.8, 0, 7); cx.fill();
    cx.fillStyle = '#fff'; cx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.4 : 6; cx.lineTo(55 + r * Math.cos(a), 32 + r * Math.sin(a)); }
    cx.fill();
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const fg = new THREE.PlaneGeometry(2.4, 1.6, 12, 1).translate(1.2, 0, 0);
    const fp = fg.attributes.position;
    for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 2.2) * 0.12 * fp.getX(i) / 2.4);
    fg.computeVertexNormals();
    add(fg, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }), x - 16.94, 11, -18);
  }
  // Çarşı: önünde çizgili tenteli pazar tezgâhları
  {
    const P = PLACES[2], x = P.cx * U;
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 8;
    const c2 = cv.getContext('2d');
    for (let i = 0; i < 8; i++) { c2.fillStyle = i % 2 ? '#f3efe6' : '#b8322a'; c2.fillRect(i * 8, 0, 8, 8); }
    const st = new THREE.CanvasTexture(cv); st.colorSpace = THREE.SRGBColorSpace; st.anisotropy = 4;
    const awn = new THREE.MeshStandardMaterial({ map: st, roughness: 0.9, side: THREE.DoubleSide });
    const aw = new THREE.PlaneGeometry(5.6, 3.4).rotateX(-Math.PI / 2 + 0.16);
    const posts = mat.brushedMetal({ color: 0x8a8d90 });
    const post = new THREE.CylinderGeometry(0.05, 0.05, 2.7, 6).translate(0, 1.35, 0);
    const z0 = BZ + BD / 2 + 7;
    for (let k = 0; k < 6; k++) {
      const ax = x - BW / 2 + 3.9 + k * 7.4;
      add(aw.clone(), awn, ax, 2.75, z0);
      for (const dx of [-2.6, 2.6]) for (const dz of [-1.5, 1.5]) add(post, posts, ax + dx, 0, z0 + dz);
      add(colored(box(4.6, 0.9, 1.1, 0, 0.45, 0), [0xa36b3c, 0x7d9a45, 0xc8a24a, 0x8a4d3a, 0x6f8f3e, 0xb9793a][k]), gearMat, ax, 0, z0 + 0.6);
    }
  }
  // Fabrika: iki yüksek tuğla baca
  {
    const P = PLACES[3], x = P.cx * U;
    const brick = mat.concrete({ color: 0x8c5a48, stains: 0.7 });
    for (const dx of [-1.6, 1.6]) {
      add(new THREE.CylinderGeometry(0.9, 1.5, 34, 16).translate(0, 17, 0), brick, x + dx * U, 0, BZ - 3);
      add(new THREE.CylinderGeometry(0.95, 0.95, 1.2, 16).translate(0, 33, 0), mat.paintedMetal({ color: 0xc9322a }), x + dx * U, 0, BZ - 3);
      add(new THREE.CylinderGeometry(0.97, 0.97, 1.0, 16).translate(0, 30.8, 0), mat.paintedMetal({ color: 0xeeeeea }), x + dx * U, 0, BZ - 3);
    }
  }
  // Hastane: cephede kırmızı haç, çatıda helikopter pisti
  {
    const P = PLACES[4], x = P.cx * U, S = pSpec[4];
    add(merge([box(5.2, 1.6, 0.25), box(1.6, 5.2, 0.25)]), mat.paintedMetal({ color: 0xd11f1f }), x, S.top - 3, BZ + BD / 2 + 0.45);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#3d4247'; c.fillRect(0, 0, 128, 128);
    c.strokeStyle = '#f1f1ea'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 52, 0, 7); c.stroke();
    c.fillStyle = '#f1f1ea'; c.font = 'bold 72px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 64, 68);
    const ht = new THREE.CanvasTexture(cv); ht.colorSpace = THREE.SRGBColorSpace;
    add(new THREE.CylinderGeometry(8.3, 8.3, 0.5, 40).translate(0, 0.25, 0), mat.concrete({ color: 0xa9a7a1 }), x + 8, S.H, BZ);
    add(new THREE.CircleGeometry(8, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: ht, roughness: 0.85 }), x + 8, S.H + 0.52, BZ);
  }
  PLACES.forEach((P, k) => { P.h = pSpec[k].height; P.top = k === 3 ? 37 : pSpec[k].height + 4; });
  for (const P of PLACES) P.label = sim.label(P.name, { position: [P.cx * U, P.top + 3, BZ] });
}

// --- Ağaçlar: bulvar kenarları, mekânlar arası parklar, kasaba kuşağı ---
{
  const kinds = ['oak', 'poplar', 'fruit'];
  const T = kinds.map((k, i) => {
    const g = treeGeometry(k, 3 + i * 4);
    const crown = instanced(g.crown, leafMat([0x3f5c28, 0x4d6a2c, 0x56722f][i]), 500), trunk = instanced(g.trunk, barkMat(0x4a3b2c), 500);
    crown.count = trunk.count = 0;
    scene.add(crown, trunk);
    return { crown, trunk };
  });
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const put = (t, x, z, s) => {
    const B = T[t], i = B.crown.count++;
    B.trunk.count = B.crown.count;
    m4.compose(v3.set(x, 0, z), q0.setFromEuler(eul.set(0, rnd() * 6.28, 0)), s3.setScalar(s));
    B.crown.setMatrixAt(i, m4); B.trunk.setMatrixAt(i, m4);
    const tone = rnd();
    B.crown.setColorAt(i, tmpC.setRGB(0.85 + 0.3 * tone, 0.9 + 0.2 * tone, 0.85 + 0.2 * (1 - tone)));
  };
  // bulvar ağaçları (kaldırımda, 12 m aralık)
  for (const z of [-8.6, 8.6]) for (const sd of [-1, 1]) for (let x = -176; x <= 176; x += 12) put(0, x + (rnd() - 0.5), z * U + sd * 7.3, 0.75 + rnd() * 0.25);
  // sokak ağaçları: apartman sıraları arasındaki sokakların kaldırımında, lambaların karşı tarafında
  for (const z of [-13, -17, 13, 17]) for (let k = 0; k < 10; k++) for (const dx of [-8, 8]) {
    const sd = k % 2 ? -1 : 1;
    if (rnd() < 0.85) put(2, -144 + 32 * k + dx + (rnd() - 0.5) * 1.5, z * U + 4.1 * sd, 0.55 + rnd() * 0.2);
  }
  // mekânlar arası parklar
  // (yolun iki yanında sırayla; banklar ve park lambaları ağaçların karşısında)
  for (const px of [-11.25, -3.75, 3.75, 11.25]) for (let k = 0; k < 7; k++) {
    const z = (-5 + k * 1.55) * U, sd = k % 2 ? -1 : 1;
    put(k % 3 === 2 ? 2 : 0, pathX(px * U, z) + sd * (2.7 + rnd() * 1.1), z + (rnd() - 0.5) * 4, 0.8 + rnd() * 0.35);
  }
  // meydanın önünde, gezinti yolu banklarının arasında gölge ağaçları
  for (let c = -2; c <= 2; c++) for (const d of [-21.5, -12.5, 12.5, 21.5]) put(rnd() < 0.3 ? 2 : 0, c * 60 + d + (rnd() - 0.5), 47 + (rnd() - 0.5) * 0.6, 0.7 + rnd() * 0.2);
  // kasaba çevresi: düzensiz ağaç kümeleri ve tarla sınırlarında seyrek kavak dizileri (duvar gibi kuşak yok)
  for (let c = 0; c < 26; c++) {
    const a = rnd() * 6.2832, d = 205 + rnd() * 95, cx = Math.cos(a) * d * 1.1, cz = Math.sin(a) * d * 1.1;
    const n = 3 + Math.floor(rnd() * 7);
    for (let k = 0; k < n; k++) put(rnd() < 0.7 ? 0 : 2, cx + (rnd() - 0.5) * 22, cz + (rnd() - 0.5) * 22, 0.8 + rnd() * 0.5);
  }
  for (const [x0, z0, dx, dz, n] of [[-300, -212, 9, 0, 22], [206, -150, 0, 10, 16], [-236, 120, 0, 9, 14], [40, 214, 10, 0, 18]]) {
    for (let k = 0; k < n; k++) if (rnd() < 0.8) put(1, x0 + dx * k + (rnd() - 0.5) * 2, z0 + dz * k + (rnd() - 0.5) * 2, 0.85 + rnd() * 0.35);
  }
}

// --- Park etmiş arabalar (kent motoru araç filosu) ---
{
  const spots = [];
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const z of [-8.6, 8.6]) for (const sd of [-1, 1]) for (let x = -170; x <= 170; x += 6.2) if (rnd() < 0.42) spots.push([x, z * U + sd * 4.4]);
  for (const z of [-13, -17, 13, 17]) for (const sd of [-1, 1]) for (let x = -164; x <= 164; x += 6) if (rnd() < 0.18 && Math.abs(((x % 32) + 48) % 32 - 16) > 5) spots.push([x, z * U + sd * 1.9]);
  const fleet = carFleet(spots.length, { seed: 5 });
  spots.forEach(([x, z], i) => fleet.set(i, x, 0.02, z, rnd() < 0.5 ? 0 : Math.PI));
  fleet.commit();
  scene.add(fleet.group);
}

// --- Sokak lambaları: bulvarlarda ve sokaklarda; gece yanar ---
const lamps = (() => {
  const pts = [];
  for (const z of [-8.6, 8.6]) for (const sd of [-1, 1]) for (let x = -170; x <= 170; x += 24) pts.push([x, z * U + sd * 6.1, sd > 0 ? Math.PI : 0]);
  for (const z of [-13, -17, 13, 17]) for (let k = 0; k < 10; k++) { const sd = k % 2 ? 1 : -1; pts.push([-144 + 32 * k, z * U + 3.6 * sd, sd > 0 ? Math.PI : 0]); }
  // park yolları (ağaçların karşı kenarında, kol yola doğru) ve meydan önü gezinti yolu
  for (const sx of [-150, -90, -30, 30, 90, 150]) for (const k of [1, 3, 5]) { const z = (-5 + k * 1.55) * U; pts.push([pathX(sx, z) + 1.9, z, -Math.PI / 2]); }
  for (let c = -2; c <= 2; c++) for (const d of [-13, 13]) pts.push([c * 60 + d, 54.2, Math.PI]);
  const L = streetLamps(pts, { y: 0.02 });
  scene.add(L.group);
  return L;
})();

// --- Sokak donatısı: bulvar kaldırımlarında ahşap banklar ve çöp kutuları (lambaların arasında) ---
{
  const bench = merge([
    ...[0, 1, 2].map((k) => box(1.8, 0.04, 0.11, 0, 0.45, -0.17 + k * 0.14)),
    ...[0, 1].map((k) => box(1.8, 0.1, 0.035, 0, 0.62 + k * 0.14, -0.27).rotateX(-0.12)),
  ]);
  const legs = merge([-0.75, 0.75].flatMap((x) => [box(0.06, 0.45, 0.5, x, 0.225, 0), box(0.05, 0.38, 0.05, x, 0.62, -0.26)]));
  const bin = new THREE.CylinderGeometry(0.26, 0.23, 0.85, 12, 1, false).translate(0, 0.43, 0);
  const pts = [];
  for (const z of [-8.6, 8.6]) for (const sd of [-1, 1]) for (let x = -158; x <= 160; x += 24) pts.push([x, z * U + sd * 6.3, sd > 0 ? Math.PI : 0, 2.1, 0]);
  // park yolu kenarı (yola dönük) ve gezinti yolunun meydan tarafı (yola dönük)
  for (const sx of [-150, -90, -30, 30, 90, 150]) for (const k of [0, 2, 4, 6]) { const z = (-5 + k * 1.55) * U; pts.push([pathX(sx, z) - 1.8, z, Math.PI / 2, 0, 1.6]); }
  for (let c = -2; c <= 2; c++) for (const d of [-17, -8, 8, 17]) pts.push([c * 60 + d, 49.8, 0, d > 0 ? 1.8 : -1.8, 0]);
  const B = instanced(bench, mat.wood({ color: 0x8a5a36 }), pts.length), L = instanced(legs, mat.paintedMetal({ color: 0x2f3437 }), pts.length);
  const K = instanced(bin, mat.paintedMetal({ color: 0x3f5a46 }), pts.length);
  pts.forEach(([x, z, r, bx, bz], i) => {
    m4.compose(v3.set(x, 0.02, z), q0.setFromEuler(eul.set(0, r, 0)), s3.set(1, 1, 1)); B.setMatrixAt(i, m4); L.setMatrixAt(i, m4);
    m4.compose(v3.set(x + bx, 0.02, z + bz), q0.identity(), s3.set(1, 1, 1)); K.setMatrixAt(i, m4);
  });
  scene.add(B, L, K);
}

// --- Vaka yoğunluğu katmanı: teras çatının üstünde kırmızı örtü + bina çevresinde zeminde kırmızı hale (toplamalı; vakasız = görünmez) ---
const roofHot = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), nB);
roofHot.userData.noCast = true; roofHot.userData.noAO = true; roofHot.userData.noShadow = true; roofHot.renderOrder = 2;
aSpec.forEach((S, b) => {
  m4.compose(v3.set(S.x, S.y0 + S.H + 0.06, S.z), q0.setFromEuler(eul.set(0, S.rot, 0)), s3.set(S.w + 0.3, 1, S.d + 0.3));
  roofHot.setMatrixAt(b, m4); roofHot.setColorAt(b, tmpC.setRGB(0, 0, 0));
});
function roofsDirty() { for (const m of [roofHot, haloMesh]) m.instanceColor.needsUpdate = true; }
const haloTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) {
    const d = Math.max(Math.abs(i - 63.5), Math.abs(j - 63.5)) / 64;
    const a = Math.exp(-Math.pow((d - 0.78) / 0.13, 2));
    const k = (j * 128 + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255 * a; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const haloMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: haloTex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }), nB);
haloMesh.userData.noCast = true; haloMesh.userData.noAO = true; haloMesh.renderOrder = 2;
bPos.forEach(([x, z], b) => { m4.compose(v3.set(x * U, 0.12, z * U), q0.identity(), s3.set(1.62 * U * 2, 1, 1.62 * U * 2)); haloMesh.setMatrixAt(b, m4); haloMesh.setColorAt(b, tmpC.setRGB(0, 0, 0)); });
// tıklama için görünmez bina hacimleri (motor binaları ışın testine girmez)
const bldPick = new THREE.InstancedMesh(box(1, 1, 1, 0, 0.5, 0), new THREE.MeshBasicMaterial(), nB);
bldPick.visible = false;
aSpec.forEach((S, b) => { m4.compose(v3.set(S.x, S.y0, S.z), q0.setFromEuler(eul.set(0, S.rot, 0)), s3.set(S.w + 1.5, S.height, S.d + 2)); bldPick.setMatrixAt(b, m4); });
bldPick.computeBoundingSphere();
scene.add(roofHot, haloMesh, bldPick);
const bInf = new Int32Array(nB);

// --- İnsanlar: gerçek boyda figürler + üstten okunabilir durum işaretleri ---
// Figürler: motorun eklemli insanları (@core crowd) — yaş/işe göre boy ve kıyafet; yürüme yönüne dönük, hıza göre yürü/koş.
// ?low: her iki kişiden biri çizilir (durum işaretleri yine herkes için), yakın ayrıntı mesafesi kısalır.
const FIG = LOW ? 2 : 1;
const folk = crowd(N, { seed: 31, camera: sim.camera, poses: ['stand'] });
scene.add(folk.group);
const fYaw = new Float32Array(N).map(() => Math.random() * Math.PI * 2), fPrev = new Float32Array(N * 2).fill(NaN), fV = new Float32Array(N);
// tıklama için görünmez, kişiden büyük seçim küreleri
const pickMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.4, 0).translate(0, 1.2, 0), new THREE.MeshBasicMaterial(), N);
pickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
pickMesh.visible = false;
pickMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
scene.add(pickMesh);
// durum işaretleri (katman): koyu kenarlı yuvarlak noktalar
const mkPos = new Float32Array(N * 3), mkCol = new Float32Array(N * 3);
const mkGeo = new THREE.BufferGeometry();
mkGeo.setAttribute('position', new THREE.BufferAttribute(mkPos, 3).setUsage(THREE.DynamicDrawUsage));
mkGeo.setAttribute('color', new THREE.BufferAttribute(mkCol, 3).setUsage(THREE.DynamicDrawUsage));
mkGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400);
const dotTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgb(70,70,70)'; c.beginPath(); c.arc(32, 32, 30, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(32, 32, 22, 0, 7); c.fill();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const mkMat = new THREE.PointsMaterial({ size: 4.2, map: dotTex, vertexColors: true, transparent: true, alphaTest: 0.4, depthWrite: false, toneMapped: false, fog: false });
// yakında (≈ 60 m altı) işaret küçülüp kaybolur: orada durum rengini figürün üst giysisi taşır; uzakta nokta okunur
mkMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <logdepthbuf_vertex>', 'gl_PointSize *= smoothstep(60.0, 150.0, -mvPosition.z);\n#include <logdepthbuf_vertex>'); };
mkMat.customProgramCacheKey = () => 'salgin-markers';
const markers = new THREE.Points(mkGeo, mkMat);
markers.frustumCulled = false;
markers.userData.noShadow = markers.userData.noFit = true;
markers.renderOrder = 2;
scene.add(markers);

const px = new Float32Array(N), pz = new Float32Array(N), ux = new Float32Array(N), uz = new Float32Array(N), sc = new Float32Array(N);
const mArr = pickMesh.instanceMatrix.array;
const LIN = {};
for (const k in COL) LIN[k] = new THREE.Color(COL[k]);

function target(i, out) {
  const l = model.loc[i];
  if (l < model.P0) {
    // apartman çevresindeki avlu: 20 kişi kare bir halka üzerinde
    const [bx, bz] = bPos[model.bld[i]];
    const s = (((i % PER_B) + 0.5) / PER_B) * 4, side = Math.floor(s), t = (s - side) * 2.5 - 1.25;
    const e = 1.3 + (ux[i] - 0.5) * 0.3;
    out[0] = bx + (side === 0 ? t : side === 1 ? e : side === 2 ? -t : -e);
    out[1] = bz + (side === 0 ? -e : side === 1 ? t : side === 2 ? e : -t);
  } else if (l === model.WARD) {
    out[0] = lerp(WARD.x0, WARD.x1, ux[i]); out[1] = lerp(WARD.z0, WARD.z1, uz[i]);
  } else {
    const p = PLACES[l - model.P0];
    const z1 = l - model.P0 === 4 ? WARD.z0 - 0.3 : PLAZA.z1;
    out[0] = p.cx + (ux[i] * 2 - 1) * PLAZA.hw; out[1] = lerp(PLAZA.z0, z1, uz[i]);
  }
}
const tgt = [0, 0];

function writeMatrix(i) {
  const o = i * 16, x = px[i] * U, z = pz[i] * U;
  mArr[o] = sc[i]; mArr[o + 5] = sc[i]; mArr[o + 10] = sc[i]; mArr[o + 15] = 1;
  mArr[o + 12] = x; mArr[o + 14] = z;
  mkPos[i * 3] = x; mkPos[i * 3 + 1] = 2.6 * sc[i]; mkPos[i * 3 + 2] = z;
}

function paint() {
  const st = model.state;
  for (let i = 0; i < N; i++) {
    const s = st[i];
    const c = s === I ? (model.isolating(i) ? LIN.Q : LIN.I)
      : s === R ? LIN.R : s === V ? LIN.V : LIN.S;
    // figür: üst giysi durum rengine çalar (hassas sarı, enfekte kırmızı, izole koyu kırmızı, iyileşmiş gri, aşılı mavi)
    folk.tint(i, s === I ? (c === LIN.Q ? COL.Q : COL.I) : s === R ? COL.R : s === V ? COL.V : COL.S, s === I ? 0.8 : 0.6);
    mkCol[i * 3] = c.r; mkCol[i * 3 + 1] = c.g; mkCol[i * 3 + 2] = c.b;
  }
  mkGeo.attributes.color.needsUpdate = true;
  if (showHeat.value) {
    model.buildingInfected(bInf);
    for (let b = 0; b < nB; b++) { const k = Math.min(1, bInf[b] / 4), a = bInf[b] ? 0.35 + 0.65 * k : 0; roofHot.setColorAt(b, tmpC.setRGB(0.9, 0.06, 0.03).multiplyScalar(a)); haloMesh.setColorAt(b, tmpC.setRGB(1.0, 0.12, 0.08).multiplyScalar(a)); }
    roofsDirty();
  }
}

function snapAll() {
  fPrev.fill(NaN);
  for (let i = 0; i < N; i++) {
    target(i, tgt); px[i] = tgt[0]; pz[i] = tgt[1];
    writeMatrix(i);
  }
  pickMesh.instanceMatrix.needsUpdate = true;
  mkGeo.attributes.position.needsUpdate = true;
}

// --- Arayüz ---
const ui = sim.ui;
// not: ui.text(…, 'card') ana sayfanın .card (flex sütun) kuralını da alıyor; içerik tek <div> içine sarılır
const card = (h) => `<div>${h}</div>`;
ui.text(card(`<span style="color:#facc15">●</span> Hassas &nbsp;<span style="color:#ef4444">●</span> Enfekte &nbsp;<span style="color:#9ca3af">●</span> İyileşmiş &nbsp;<span style="color:#3b82f6">●</span> Aşılı`), 'card');
ui.section('Hazır senaryolar');
const PRESETS = {
  onlemsiz: { vacc: 0, mask: 0, mobility: 100, contacts: 8, quarantine: false, schools: false },
  maske: { vacc: 0, mask: 80, mobility: 100, contacts: 5, quarantine: false, schools: false },
  asi: { vacc: 70, mask: 0, mobility: 100, contacts: 8, quarantine: false, schools: false },
  kapanma: { vacc: 0, mask: 30, mobility: 50, contacts: 8, quarantine: true, schools: true },
};
const presetText = ui.text('', 'card');
const PRESET_DESC = {
  onlemsiz: '<b>Önlemsiz:</b> herkes her gün dışarı çıkıyor, maske ve aşı yok.',
  maske: '<b>Maske + mesafe:</b> %80 maske, günlük temas 8 yerine 5.',
  asi: '<b>%70 aşı:</b> nüfusun %70\'i aşılı, başka önlem yok.',
  kapanma: '<b>Kapanma:</b> okullar kapalı, belirtili hastalar evde, yetişkinlerin yarısı evden çalışıyor.',
};
function applyPreset(k) {
  const s = PRESETS[k];
  vacc.set(s.vacc); mask.set(s.mask); mobility.set(s.mobility); contacts.set(s.contacts);
  quarantine.set(s.quarantine); schools.set(s.schools);
  presetText.set(card(PRESET_DESC[k]));
  syncParams();
  restart();
}
ui.buttons([
  { label: '🚫 Önlemsiz', onClick: () => applyPreset('onlemsiz') },
  { label: '😷 Maske + mesafe', onClick: () => applyPreset('maske') },
  { label: '💉 %70 aşı', onClick: () => applyPreset('asi') },
  { label: '🏠 Kapanma', onClick: () => applyPreset('kapanma') },
]);

ui.section('Önlemler');
const vacc = ui.slider({ label: 'Aşı oranı', min: 0, max: 95, step: 5, value: 0, unit: '%', onChange: () => { syncParams(); model.applyVaccination(); paint(); updateStats(); } });
const ve = ui.slider({ label: 'Aşı etkinliği (enfeksiyona karşı)', min: 0, max: 100, step: 5, value: 80, unit: '%', onChange: () => syncParams() });
const mask = ui.slider({ label: 'Maske kullanımı', min: 0, max: 100, step: 5, value: 0, unit: '%', onChange: () => syncParams() });
const mobility = ui.slider({ label: 'Hareketlilik (dışarı çıkan yetişkin)', min: 10, max: 100, step: 5, value: 100, unit: '%', onChange: () => syncParams() });
const quarantine = ui.toggle({ label: 'Karantina (belirtili hastalar evde)', value: false, onChange: () => { syncParams(); paint(); } });
const schools = ui.toggle({ label: 'Okullar kapalı', value: false, onChange: () => syncParams() });

ui.section('Hastalık');
const contacts = ui.slider({ label: 'Günlük temas (ev dışında)', min: 1, max: 20, step: 1, value: 8, unit: 'kişi', onChange: () => syncParams() });
const beta = ui.slider({ label: 'Bulaşma olasılığı (temas başına)', min: 1, max: 15, step: 0.5, value: 4, unit: '%', onChange: () => syncParams() });
const duration = ui.slider({ label: 'Hastalık süresi', min: 3, max: 21, step: 1, value: 8, unit: 'gün', onChange: () => syncParams() });
const capacity = ui.slider({ label: 'Hastane kapasitesi', min: 2, max: 40, step: 1, value: 8, unit: 'yatak', onChange: () => { syncParams(); updateStats(); } });
ui.buttons([
  { label: '🦠 +5 vaka', variant: 'danger', onClick: () => { model.seed(5); resumeAfterEnd(); paint(); } },
  { label: '⟲ Yeniden başlat', variant: 'primary', onClick: () => restart() },
]);
ui.text('İpucu: bir apartmana tıkla → orada yeni vaka başlar.');

ui.section('Durum');
const stDay = ui.stat({ label: 'Gün' });
const stI = ui.stat({ label: 'Anlık vaka' });
const stPeak = ui.stat({ label: 'Zirve (gün)' });
const stR = ui.stat({ label: 'Efektif R' });
const stTot = ui.stat({ label: 'Toplam enfekte', unit: '%' });
const stHosp = ui.stat({ label: 'Hastane (dolu / yatak)' });
const chart = ui.chart({
  title: 'Kişi sayısı — günlük', maxPoints: 200, yMin: 0, yMax: N,
  series: [{ name: 'Hassas', color: '#facc15' }, { name: 'Enfekte', color: '#ef4444', fill: true }, { name: 'İyileşmiş', color: '#9ca3af' }, { name: 'Aşılı', color: '#3b82f6' }],
});
const hChart = ui.chart({
  title: 'Hastane: ağır hasta ve kapasite', maxPoints: 200, yMin: 0, height: 90,
  series: [{ name: 'Yatan', color: '#f97316', fill: true }, { name: 'Yatak bulamayan', color: '#ef4444' }, { name: 'Kapasite', color: '#e5e7eb' }],
});
const note = ui.text('', 'card');

ui.section('Görünüm', { open: false });
const showHeat = ui.toggle({ label: 'Çatılarda vaka yoğunluğu', value: true, onChange: (v) => {
  if (!v) { for (let b = 0; b < nB; b++) { roofHot.setColorAt(b, tmpC.setRGB(0, 0, 0)); haloMesh.setColorAt(b, tmpC.setRGB(0, 0, 0)); } roofsDirty(); }
  paint();
} });
ui.toggle({ label: 'Kişi işaretleri (durum renkleri)', value: true, onChange: (v) => (markers.visible = v) });
ui.toggle({ label: 'Mekân etiketleri', value: true, onChange: (v) => PLACES.forEach((p) => (p.label.visible = v)) });
const dayNight = ui.toggle({ label: 'Gece–gündüz ışığı (saate göre güneş)', value: false, onChange: () => (skyKey = '') });
ui.buttons([
  { label: 'Çarşı meydanı', onClick: () => sim.moveCamera(CAM0[0], CAM0[1]) },
  { label: 'Kuşbakışı', onClick: () => sim.moveCamera([-66, 74, 196], [-6, 4, 52]) },
  { label: 'Tepeden', onClick: () => sim.moveCamera([0, 560, 2], [0, 0, 0]) },
  { label: 'Meydanlar', onClick: () => sim.moveCamera([30, 48, 95], [10, 0, 0]) },
  { label: 'Sokak', onClick: () => sim.moveCamera([-58, 9, 118], [-110, 2, 96]) },
]);

function syncParams() {
  Object.assign(model.p, {
    vacc: vacc.value / 100, ve: ve.value / 100, mask: mask.value / 100, mobility: mobility.value / 100,
    contacts: contacts.value, beta: beta.value / 100, duration: duration.value, capacity: capacity.value,
    quarantine: quarantine.value, schoolsClosed: schools.value,
  });
  PLACES[0].label.setText(schools.value ? '🏫 Okul (kapalı)' : '🏫 Okul');
}

function pushCharts() {
  const c = model.counts;
  chart.push([c[S], c[I], c[R], c[V]]);
  hChart.push([model.hospCount, model.unmet, model.p.capacity]);
}

function updateStats() {
  const c = model.counts;
  stDay.set(model.day + 1);
  stI.set(c[I], c[I] > N * 0.15 ? 'bad' : c[I] ? 'warn' : 'good');
  stPeak.set(`${fmt(model.peak)} (${model.peakDay + 1})`);
  stR.set(isFinite(model.rt) ? fmt(model.rt, 2) : '—', !isFinite(model.rt) ? '' : model.rt > 1 ? 'bad' : 'good');
  stTot.set(fmt((model.totalInf / N) * 100, 1));
  stHosp.set(`${model.hospCount}/${model.p.capacity}`, model.unmet ? 'bad' : model.hospCount >= model.p.capacity * 0.75 ? 'warn' : 'good');
  PLACES[4].label.setText(`🏥 Hastane · ${model.hospCount}/${model.p.capacity} yatak`);
  const immune = (c[R] + c[V]) / N;
  note.set(card(model.unmet
    ? `<b style="color:var(--bad)">⚠ Hastane dolu!</b> ${model.unmet} ağır hasta yatak bulamıyor. Toplam ${model.overDays} gün kapasite aşıldı.`
    : `Bağışık oranı (iyileşmiş + aşılı): <b>${fmt(immune * 100, 0)}%</b>. ${model.overDays ? `Kapasite ${model.overDays} gün aşıldı.` : 'Hastane şimdiye kadar taşmadı.'}`));
}

let acc = 0;
function restart() {
  syncParams();
  model.reset(4);
  acc = 0;
  chart.clear(); hChart.clear();
  pushCharts();
  sim.hud.hide();
  setScales();
  paint();
  snapAll();
  updateStats();
}

function resumeAfterEnd() { if (!model.ended) sim.hud.hide(); updateStats(); }

function showEnd() {
  const tot = model.totalInf / N;
  sim.hud.show(`<h2>Salgın ${model.day + 1}. günde sona erdi</h2>
    Nüfusun <b>%${fmt(tot * 100, 0)}</b>'i enfekte oldu · zirvede aynı anda <b>${fmt(model.peak)}</b> vaka (${model.peakDay + 1}. gün)<br>
    ${model.overDays ? `Hastane kapasitesi <b>${model.overDays} gün</b> aşıldı.` : 'Hastane kapasitesi hiç aşılmadı. 👏'}
    <br><button class="btn primary" data-act="again">⟲ Yeniden başlat</button>`, { tone: tot > 0.5 || model.overDays ? 'bad' : 'good' });
  sim.hud.el.querySelector('[data-act="again"]').onclick = () => restart();
}

// --- Döngü ---
sim.onUpdate((dt) => {
  if (model.ended) return;
  acc += (dt / DAY_SEC) * TICKS;
  let guard = 0;
  while (acc >= 1 && guard++ < 12) {
    acc -= 1;
    const dayEnd = model.tick();
    if (dayEnd) { pushCharts(); if (model.ended) { showEnd(); break; } }
  }
  if (guard > 0) { paint(); updateStats(); }
  // yürüyüş: hedef konuma üstel yaklaşım
  const a = 1 - Math.exp(-dt * 7);
  for (let i = 0; i < N; i++) {
    target(i, tgt);
    px[i] += (tgt[0] - px[i]) * a; pz[i] += (tgt[1] - pz[i]) * a;
    writeMatrix(i);
  }
  pickMesh.instanceMatrix.needsUpdate = true;
  mkGeo.attributes.position.needsUpdate = true;
});

// Güneş: gece–gündüz açıkken modelin saatine göre (2 saatlik adımlarla), kapalıyken sabit öğleden sonra ışığı
let skyKey = '';
sim.onRender((real) => {
  let el = 42, az = 205;
  if (dayNight.value) {
    const h = model.hour * 2;
    el = h >= 6 && h <= 18 ? Math.max(2, 62 * Math.sin((Math.PI * (h - 6)) / 12)) : -12;
    az = h >= 6 && h <= 18 ? 90 + ((h - 6) / 12) * 180 : 0;
  }
  // figürler: gerçek yer değiştirmeden hız → yürü/koş, yön yumuşakça harekete döner
  const rdt = Math.min(0.1, Math.max(1e-3, real || 1 / 60));
  for (let i = 0; i < N; i += FIG) {
    const x = px[i] * U, z = pz[i] * U;
    let d = 0, dx = 0, dz = 0;
    if (!Number.isNaN(fPrev[i * 2])) { dx = x - fPrev[i * 2]; dz = z - fPrev[i * 2 + 1]; d = Math.hypot(dx, dz); }
    fPrev[i * 2] = x; fPrev[i * 2 + 1] = z;
    if (d > 60) d = 0;
    fV[i] += (d / rdt - fV[i]) * Math.min(1, rdt * 5);
    if (d > 0.004) { const da = Math.atan2(dx, dz) - fYaw[i]; fYaw[i] += Math.atan2(Math.sin(da), Math.cos(da)) * Math.min(1, rdt * 8); }
    folk.set(i, x, 0, z, fYaw[i], fV[i] > 3.2 ? 'run' : fV[i] > 0.25 ? 'walk' : 'stand');
  }
  folk.update(performance.now() / 1000);
  const k = el + ':' + az;
  if (k !== skyKey) { skyKey = k; sim.sky.set({ elevation: el, azimuth: az }); }
  NIGHT.value = sim.sky.night ?? 0;
  city.setLit(NIGHT.value); lamps.setLit(NIGHT.value);
});

// Tıklama: kişi → bilgi; apartman → yeni vaka
const AGE = ['Çocuk', 'Yetişkin', 'Yaşlı'];
const STN = ['Hassas', 'Enfekte', 'İyileşmiş', 'Aşılı'];
sim.onClick([pickMesh, bldPick], (hit) => {
  const id = hit.instanceId;
  if (id == null) return;
  if (hit.object === pickMesh) {
    const s = model.state[id];
    let msg = `<b>${AGE[model.age[id]]}</b> · ${STN[s] || ''}`;
    if (s === I) msg += model.hosp[id] ? ' · 🏥 hastanede' : model.isolating(id) ? ' · 🏠 evde izole' : model.symp[id] ? ' · belirtili' : ' · belirtisiz';
    if (s === I || s === R) msg += ` · ${model.sec[id]} kişiye bulaştırdı`;
    sim.toast(msg, s === I ? 'bad' : s === V ? 'good' : '');
    return;
  }
  const n = model.seed(1, id);
  if (n) { resumeAfterEnd(); paint(); sim.toast(`🏠 ${id + 1}. apartmanda yeni vaka`, 'warn'); }
  else sim.toast('Bu apartmanda enfekte edilebilecek kimse kalmadı', 'good');
});

// başlangıç
for (let i = 0; i < N; i++) {
  ux[i] = Math.random(); uz[i] = Math.random();
  mArr.fill(0, i * 16, i * 16 + 16);
}
// yaş ve işe göre görünüm: çocuk → öğrenci (sırt çantası, kısa boy), yetişkin → iş yerine göre (ofis, fabrika işçisi, sağlıkçı), yaşlı → gri saç
const WORK_OUTFIT = ['office', 'office', 'casual', 'worker', 'medic'];   // okul (öğretmen), ofis, çarşı, fabrika, hastane
function setScales() {
  for (let i = 0; i < N; i++) {
    const a = model.age[i];
    sc[i] = a === 0 ? 0.72 : a === 2 ? 0.95 : 1;
    if (i % FIG) continue;
    const r = Math.random(), f = r < 0.5;
    if (a === 0) folk.dress(i, { seed: i * 13 + 5, outfit: 'student', height: 1.18 + 0.3 * Math.random() });
    else if (a === 2) folk.dress(i, { seed: i * 13 + 5, outfit: Math.random() < 0.2 ? 'office' : 'casual', sex: f ? 'f' : 'm', height: (f ? 1.54 : 1.64) + 0.12 * Math.random(), build: 1 + 0.2 * Math.random(), hair: { style: f ? 'bun' : Math.random() < 0.5 ? 'bald' : 'short', color: [0x8a857e, 0xb5b0a8, 0xd0ccc4][i % 3] } });
    else folk.dress(i, { seed: i * 13 + 5, outfit: WORK_OUTFIT[model.work[i]] || 'casual' });
  }
}
sim.onReset(() => restart());
presetText.set(card(PRESET_DESC.onlemsiz));
restart();
sim.toast('Bir apartmana tıkla: oraya yeni bir vaka gelir', '');
