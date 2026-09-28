// Fay Hattı Haritası — temsili bölgenin gerçek ölçekli arazisinde P/S dalga cepheleri, şiddet (MMI) azalımı, zemin etkisi ve erken uyarı süresi.
import { createSim, THREE, ImprovedNoise, clamp, smoothstep, fmt, seeded, mat, procedural, landscape, createTerrain, terrainMaterial, terrainSkirt, depthTexture, BufferGeometryUtils } from '@core';
import { buildSite } from './site.js';

const VP = 6, VS = 3.5;          // km/sn
const KM = 10;                   // 1 model birimi = 10 km
const U = 10000;                 // 1 model birimi = 10.000 m (dünya metre)
const MAP_W = 40, MAP_D = 25;    // birim (400 × 250 km)
const VEX = 2;                   // yükseklik abartısı (bölge ölçeğinde okunabilirlik için)
const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
const VR = 2.8;                  // km/sn — kırılmanın fay boyunca ilerleme hızı (≈0,8 × S hızı)

const sim = createSim({
  sky: { elevation: 18, azimuth: 297, clouds: 0.22, haze: 1.2, visibility: 420000, wind: [4, 1] },
  ocean: { wind: 6, windDir: 40, fetch: 150, radius: 700000, fogDist: 300000 },
  camera: { position: [30000, 150000, 285000], target: [0, 0, 15000], fov: 45, near: 1, far: 3000000 },
  controls: { minDistance: 6, maxDistance: 700000, maxPolarAngle: 1.47 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Kuzey Anadolu Fayı'na benzeyen bir fayın geçtiği <b>temsili</b> bir bölge (400 km × 250 km; şehir adları hayalîdir), yüksekten
    bakılan gerçek bir arazi olarak. Fay üzerine tıklayınca deprem o noktada başlar. Mavi halka <b>P dalgası</b> (≈6 km/sn),
    turuncu halka <b>S dalgası</b> (≈3,5 km/sn). Hasarın çoğunu daha yavaş gelen S ve yüzey dalgaları yapar. S dalgası geçtikçe
    arazinin üzerinde tahmini <b>şiddet (MMI)</b> renkleri belirir.</p>
    <h3>Büyüklük mü, şiddet mi?</h3>
    <p><b>Büyüklük (Mw)</b> depremin kaynağında açığa çıkan enerjiyi anlatır; her deprem için tek bir sayıdır.
    <b>Şiddet (MMI, I–XII)</b> ise bir yerde sarsıntının nasıl hissedildiğini ve yaptığı etkiyi anlatır; yerden yere değişir:
    uzaklık arttıkça azalır, yumuşak zeminde (alüvyon) artar. Mw logaritmiktir: <b>+1 Mw ≈ 32 kat</b>, +2 Mw ≈ 1.000 kat enerji.</p>
    <h3>Dene</h3>
    <ul>
      <li>Aynı noktada Mw 6 ve Mw 7 depremleri karşılaştır; şiddet haritasının ne kadar büyüdüğüne bak.</li>
      <li>Derinliği 5 km'den 35 km'ye çıkar: merkez üssündeki şiddet azalır ama sarsıntı daha geniş alanda benzer hissedilir.</li>
      <li>Zemin büyütmesini sıfırla ve tekrar aç: kıyıdaki alüvyon şehirlerin şiddeti nasıl değişiyor?</li>
      <li>Erken uyarı: Merkeze çok yakın şehirlerde uyarı S dalgasından sonra gelir ("kör bölge"); uzak şehirler birkaç
      saniyeden onlarca saniyeye kadar önceden uyarılabilir.</li>
    </ul>
    <h3>Fay izi sahası (yakın görünüm)</h3>
    <p>Açılışta fayın doğudaki ovayı kestiği yere, <b>Çayırköy</b>'ün yanına bakıyorsun. Bu fay <b>sağ yanal doğrultu atımlı</b>:
    fayın karşı tarafına bakan biri, karşı bloğun sağa kaydığını görür (kuzey blok doğuya). Arazide bunun izleri okunur:
    fay boyunca uzanan alçak çizgi, ovayı keskin bir çizgi hâlinde kesen ≈2–3 m'lik <b>fay basamağı</b> (küçük düşey bileşenin binlerce depremde birikmesi; temsilî), fay izinde kaynak suyuyla beslenen yeşil bitki şeridi, fayı geçerken aniden yana kıvrılan <b>ötelenmiş dere</b>,
    fay üzerinde oturan <b>çöküntü gölü</b>, fayı dik kesen ve önceki bir depremde ≈4,5 m ötelenmiş <b>eski kuru taş duvar</b> (temsilî). Dere ve sırtlardaki ≈140 m'lik kayma binlerce yıl boyunca tekrarlanan depremlerin
    birikimidir (temsilî değer).</p>
    <p>Kırılan fay parçası sahadan geçerse, kırılma cephesi fay boyunca yaklaşık <b>2,8 km/sn</b> ile ilerleyip sahaya
    ulaştığında yüzey birkaç saniyede kayar: fayı dik kesen yol, çit, taş duvar, kavak sırası, meyve bahçesi sıraları ve tarla sınırları
    yana ötelenir, fay izinde taze toprak ve çatlaklar açılır. Fay izine birkaç on metre yakın çiftlik evleri hem yüzey kırığından hem en şiddetli sarsıntıdan etkilenir: eğilir, çöker, çatıları dökülür (görsel temsil). Ortalama yüzey atımı Wells ve Coppersmith (1994) doğrultu atımlı
    faylar için verilen ilişkiden alınır: <b>log(atım, m) = −6,32 + 0,90·Mw</b> (Mw 7 ≈ 1 m, Mw 7,8 ≈ 5 m). Gerçekte atım
    fay boyunca değişir; en büyük değer ortalamanın birkaç katı olabilir. 1999 İzmit depreminde yol, duvar ve ağaç sıraları
    birkaç metre ötelenmişti.</p>
    <h3>Model ve sınırları</h3>
    <p>Şiddet, Atkinson ve Wald (2007) biçimindeki bir şiddet tahmin denklemiyle (MMI = f(Mw, uzaklık)) hesaplanır;
    uzaklık olarak kırılan fay parçasına olan en kısa mesafe ve derinlik kullanılır. Kırılma uzunluğu Wells ve Coppersmith (1994)
    ilişkisinden yaklaşık alınır. Katsayılar başka bir bölgenin verisinden türetildiği için sonuçlar <b>eğitim amaçlı
    yaklaşık</b> değerlerdir; gerçek şiddet bina türü, zemin ve yönlenme etkilerine göre ±1 birim ya da daha fazla değişebilir.
    Yatay ölçek gerçektir; yükseklikler okunabilirlik için <b>2 kat abartılıdır</b>.</p>
    <h3>Gerçek hayatta</h3>
    <p>Türkiye'nin resmî deprem bilgisi AFAD ve Kandilli Rasathanesi'nden yayınlanır. Deprem anında nerede olursan ol:
    <b>Çök – Kapan – Tutun</b>. Birkaç saniyelik uyarı bile masanın altına geçmeye yeter.</p>`,
});
sim.setSpeed(2);
const scene = sim.scene;

// --- Arazi (model: birim cinsinden yükseklik alanı; zemin sınıfı buna göre) ---
const noise = new ImprovedNoise();
const fbm = (x, z, oct = 4) => { let a = 0, f = 0.09, amp = 1; for (let i = 0; i < oct; i++) { a += amp * noise.noise(x * f, z * f, 3.7); f *= 2.1; amp *= 0.5; } return a; };
function seaField(x, z) {
  const e1 = 1 - ((x + 3) / 11.5) ** 2 - ((z - 0.3) / 3.3) ** 2;
  const zc = 0.6 + 0.07 * (x - 7);
  const e2 = x > 5 && x < 16 ? 1 - ((z - zc) / 0.85) ** 2 - Math.max(0, (x - 14) / 1.8) ** 2 : -1;
  return Math.max(e1, e2 * 0.8) + 0.18 * fbm(x * 2.2, z * 2.2, 2);
}
function height(x, z) {
  const s = seaField(x, z);
  if (s > 0) return -Math.min(1.2, s * 1.6) - 0.05;
  const coast = smoothstep(0, 0.9, -s);
  const mtn = 1.3 * Math.exp(-(((z - 7.5) / 2.4) ** 2)) * (0.6 + 0.5 * fbm(x, z + 20, 3)) + 0.9 * Math.exp(-(((z + 8.8) / 2.2) ** 2)) * (0.6 + 0.5 * fbm(x + 30, z, 3));
  const plain = 1 - 0.85 * Math.exp(-(((x - 16.5) / 2.6) ** 2 + ((z - 3.6) / 1.8) ** 2)); // doğudaki ova
  return 0.03 + coast * plain * (0.2 + Math.max(0, mtn) + 0.35 * Math.max(0, fbm(x, z)));
}
const soilOf = (h) => (h < 0.3 ? 2 : h < 0.75 ? 1 : 0); // 0 kaya, 1 sıkı, 2 yumuşak (alüvyon)
const SOIL = [
  { name: 'Kaya', icon: '🪨', d: 0, color: 0x94a3b8 },
  { name: 'Sıkı zemin', icon: '🟫', d: 0.35, color: 0xd6a35c },
  { name: 'Yumuşak zemin (alüvyon)', icon: '🟨', d: 0.9, color: 0xfde047 },
];

// --- Fay hattı ---
const FAULT_CTRL = [[-20, 1.9], [-15, 1.2], [-10, 0.7], [-5, 0.1], [0, -0.2], [4, 0.1], [8, 0.8], [11, 1.0], [14, 1.4], [17, 2.2], [20, 2.6]];
const fault = []; // yoğun örnek noktaları {x, z, s(km)} (birim)
{
  const curve = new THREE.CatmullRomCurve3(FAULT_CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const pts = curve.getSpacedPoints(400);
  let s = 0;
  pts.forEach((p, i) => { if (i) s += p.distanceTo(pts[i - 1]) * KM; fault.push({ x: p.x, z: p.z, s }); });
}
const FAULT_LEN = fault[fault.length - 1].s;
function faultDist(x, z) { // birim; kaba arama + yerel
  let best = Infinity;
  for (let k = 0; k < fault.length; k += 4) { const d = (fault[k].x - x) ** 2 + (fault[k].z - z) ** 2; if (d < best) best = d; }
  return Math.sqrt(best);
}

// Görsel yükseklik (m): model yüksekliği × 1400 m × abartı + dağlarda aşınmış ayrıntı + fay boyunca doğrusal vadi (fay izi)
const crag = landscape({ seed: 17, size: 14000, height: 900, base: -330, warp: 0.6 });
const hills = landscape({ seed: 4, size: 3500, height: 120, base: -50, octaves: 6, warp: 0.5 });
function hW(xw, zw, flat = 0) {
  const x = xw / U, z = zw / U, h = height(x, z);
  if (h < 0) return -(-h - 0.05) * 1000 * VEX - 4;
  const land = smoothstep(0.03, 0.25, h), ck = smoothstep(0.3, 1.1, h);
  const fd = faultDist(x, z) * U;
  const valley = 260 * Math.exp(-((fd / 2200) ** 2)) * smoothstep(0.15, 0.5, h);
  return ((h - 0.03) * 1400 + (ck > 0 ? crag(xw, zw) * land * ck : 0) + hills(xw, zw) * land * (1 - flat) - valley) * VEX + 3;
}

// --- Fay izi sahası (yakın ölçek, metre): fayın doğudaki ovayı kestiği yer ---
// Yerel eksenler: u fay boyunca (doğuya), v fayın kuzeyine. Kuzey blok sağ yanal atımla +u yönüne kayar.
const SITE_I = 380;
const SO = { x: fault[SITE_I].x * U, z: fault[SITE_I].z * U };
const ST = (() => { const a = fault[SITE_I - 4], b = fault[SITE_I + 4], L = Math.hypot(b.x - a.x, b.z - a.z); return { x: (b.x - a.x) / L, z: (b.z - a.z) / L }; })();
const SN = { x: ST.z, z: -ST.x };
const toUV = (X, Z) => { const dx = X - SO.x, dz = Z - SO.z; return [dx * ST.x + dz * ST.z, dx * SN.x + dz * SN.z]; };
const fromUV = (u, v) => [SO.x + u * ST.x + v * SN.x, SO.z + u * ST.z + v * SN.z];
const DC = 140;                       // birikimli sağ yanal ötelenme (m, temsilî): dere ve sırtlar
const ROAD_U = 260, ROAD_V = -330, FENCE_U = 212, WALL_U = 246, WALL_OFF = 4.5, TRACK_U = 203.5, TRACK_V = -30, POPLAR_U = -240, ORCH = [-560, -360, -200, 180];
const VIL = { u: -120, v: -440, ru: 820, rv: 250 };
const POND = { u: -1020, v: 8, a: 120, b: 40, W: 0 };
const lrel = landscape({ seed: 41, size: 420, height: 10, octaves: 5, warp: 0.45 });
const ridges = landscape({ seed: 9, size: 1900, height: 230, octaves: 7, warp: 0.5 });
const shutter = landscape({ seed: 13, size: 260, height: 1, octaves: 2, warp: 0 });
const qBox = (X, Z) => Math.max(Math.abs(X - SO.x), Math.abs(Z - SO.z));
// Dere ekseni (kuzey kolu): tepelerdeki vadisinden inip fay izinde DC kadar ötelenir
const SU_0 = -770, mea = (v) => 24 * Math.sin(v * 0.0061) + 10 * Math.sin(v * 0.019 + 1.3);
const uN = (v) => SU_0 + DC / 2 + mea(v);
function hSite0(X, Z) {
  const q = qBox(X, Z);
  let h = hW(X, Z, 0.75 * (1 - smoothstep(2500, 6500, q)));   // ova tabanı: tepeler yumuşatılır
  if (q > 9000) return h;
  const [u, v] = toUV(X, Z);
  // fay vadisinin yamaçları: ~2,5 km genişliğinde düz taban, iki yanda sırtlı ve dereli tepeler
  const wall = smoothstep(1450, 4600, Math.abs(v - 100 + 260 * Math.sin(u * 0.0011 + 0.7))) * (1 - smoothstep(6000, 9000, q));
  // kuzey blok: fay izinin hemen gerisinden yükselen çizgisel dağ önü; sırtlar ve dere vadileri izde kesilir
  let hN = 0;
  if (v > 0) {
    const f = smoothstep(60, 1150, v + 60 * Math.sin(u * 0.0031 + 0.4)) * (1 - smoothstep(6000, 9000, q));
    if (f > 0) {
      const spur = 0.5 + 0.5 * Math.cos(u * 0.0165 + 1.3 * Math.sin(v * 0.0035) + 0.8);
      const vall = smoothstep(16, 300, Math.abs(u - uN(v)));
      hN = f * Math.max(40, 170 + 0.7 * ridges(u + 5000 - DC, v)) * (0.62 + 0.38 * spur) * (0.05 + 0.95 * vall);
    }
  }
  const hWall = wall > 0 ? wall * (150 + ridges(u + 5000, v)) : 0;
  h += Math.max(hWall, hN);
  const w = 1 - smoothstep(1250, 1700, q);
  if (w <= 0) return h;
  const sN = smoothstep(-4.5, 4.5, v);
  // kuzey bloğun alçak sırtları DC kadar kaymış (kesik sırtlar), 3 m'lik basamak, fay izinde çizgisel çukur,
  // kuzey kenarda kesik kesik uzanan dar sırt (fay boyu sırtı)
  const lr = 3.2 * Math.exp(-(((v - 30) / 11) ** 2)) * smoothstep(-0.1, 0.25, shutter(u, 0));
  const sc = smoothstep(1.5, 14, v) * (2 + 0.5 * Math.sin(u * 0.0037 + 0.6));   // birikimli fay basamağı (kuzey blok ≈2 m yukarıda; keskin yüzü ayrı ağ)
  h += w * (lrel(u - DC * sN, v) + sc - 1.3 * Math.exp(-((v / 5) ** 2)) + lr);
  const e = ((u - POND.u) / POND.a) ** 2 + ((v - POND.v) / POND.b) ** 2;
  if (e < 1) h -= 4.2 * smoothstep(1, 0.3, e);                 // çöküntü (sag) gölü
  return h;
}
// Dere: kuzeydeki tepelerden güneye akar; fay izine gelince izi DC kadar batıya izleyip güneyde devam eder
const STREAM = []; // [u, v, su seviyesi (m)]
{
  const u0 = SU_0;
  const pts = [];
  for (let v = 1500; v > 14; v -= 12) pts.push([u0 + DC / 2 + mea(v), v]);
  const uA = u0 + DC / 2 + mea(14), uB = u0 - DC / 2 + mea(-14);
  pts.push([uA - 5, 6]);
  for (let u = uA - 16; u > uB + 16; u -= 12) pts.push([u, 2]);
  pts.push([uB + 5, -5]);
  for (let v = -14; v > -1500; v -= 12) pts.push([u0 - DC / 2 + mea(v) - 0.32 * Math.max(0, -v - 900), v]);
  let W = Infinity;
  for (const [u, v] of pts) { const [x, z] = fromUV(u, v); W = Math.min(W - 0.02, hSite0(x, z) - 0.9); STREAM.push([u, v, W]); }
}
const SU0 = Math.min(...STREAM.map((p) => p[0])) - 60, SU1 = Math.max(...STREAM.map((p) => p[0])) + 60;
function streamNear(u, v) { // → [dereye uzaklık (m), su seviyesi]
  if (u < SU0 || u > SU1 || v > 1560 || v < -1560) return [1e9, 0];
  let best = 1e18, W = 0;
  for (let i = 0; i < STREAM.length - 1; i++) {
    const a = STREAM[i], b = STREAM[i + 1];
    if (Math.abs(a[1]) > 20 && Math.abs(a[1] - v) > 60) continue;
    const du = b[0] - a[0], dv = b[1] - a[1], L2 = du * du + dv * dv;
    const t = clamp(((u - a[0]) * du + (v - a[1]) * dv) / L2, 0, 1);
    const d2 = (u - a[0] - t * du) ** 2 + (v - a[1] - t * dv) ** 2;
    if (d2 < best) { best = d2; W = a[2] + (b[2] - a[2]) * t; }
  }
  return [Math.sqrt(best), W];
}
const streamDist = (u, v) => streamNear(u, v)[0];
function hS(X, Z) { // saha dahil görsel yükseklik (m)
  const h = hSite0(X, Z);
  if (qBox(X, Z) > 1700) return h;
  const [u, v] = toUV(X, Z);
  const [d, W] = streamNear(u, v);
  if (d > 40) return h;
  return Math.min(h, W - 1.0 + Math.max(0, d - 4) * 0.42);
}
{ // gölcük su seviyesi: kıyı halkasının en alçak noktasının biraz altı
  let m = Infinity;
  for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2; const [x, z] = fromUV(POND.u + Math.cos(a) * POND.a, POND.v + Math.sin(a) * POND.b); m = Math.min(m, hS(x, z)); }
  POND.W = m - 0.35;
}
const vilAt = (u, v) => 1 - Math.hypot((u - VIL.u) / VIL.ru, (v - VIL.v) / VIL.rv);
const farmAt = (u, v) => {
  const e = 1300 + 250 * Math.sin(u * 0.0021 + 1.0) + 160 * Math.sin(u * 0.0057 + 2.0);
  return (1 - smoothstep(e - 90, e + 90, Math.abs(v - 150))) * (1 - smoothstep(260, 520, v)) * (1 - smoothstep(8000, 14000, Math.abs(u))) * smoothstep(0.8, 1.0, 1 - vilAt(u, v));
};
const hAt = (x, z) => Math.max(hS(x * U, z * U), 0); // birim giriş → metre

// Kaplama dokusu (şiddet / zemin) — arazi malzemesine gömülü: köşe başına RGBA, model ızgarası 201 × 126
const SEG_X = 200, SEG_Z = 125, NXV = SEG_X + 1, NZV = SEG_Z + 1, NV = NXV * NZV;
const gX = new Float32Array(NV), gZ = new Float32Array(NV), vH = new Float32Array(NV), vSoil = new Uint8Array(NV);
for (let j = 0; j < NZV; j++) for (let i = 0; i < NXV; i++) {
  const k = j * NXV + i, x = -MAP_W / 2 + (i / SEG_X) * MAP_W, z = -MAP_D / 2 + (j / SEG_Z) * MAP_D, h = height(x, z);
  gX[k] = x; gZ[k] = z; vH[k] = h; vSoil[k] = soilOf(h);
}
const ovData = new Uint8Array(NV * 4);
const ovTex = new THREE.DataTexture(ovData, NXV, NZV, THREE.RGBAFormat);
ovTex.colorSpace = THREE.SRGBColorSpace; ovTex.magFilter = ovTex.minFilter = THREE.LinearFilter;
const CITIES = [
  { name: 'Körfezkent', x: 12.4, z: 2.0, r: 7000 }, { name: 'Yalıova', x: 7.5, z: 2.7, r: 4500 }, { name: 'Deniztepe', x: -2.5, z: -3.55, r: 5000 },
  { name: 'Kuzeyliman', x: -10.5, z: -2.3, r: 5500 }, { name: 'Güneykıyı', x: -6, z: 3.95, r: 4500 }, { name: 'Dağbaşı', x: 3.5, z: 7.6, r: 3000 },
  { name: 'Ovacık', x: 16.8, z: 3.9, r: 4000 }, { name: 'Batıköy', x: -16.5, z: 4.2, r: 3000 }, { name: 'Kuzeytepe', x: 6.5, z: -8.4, r: 3000 },
  (() => { const [x, z] = fromUV(VIL.u, VIL.v + 150); return { name: 'Çayırköy', x: x / U, z: z / U, r: 650, village: true }; })(),
];
const TOWNS = CITIES.filter((c) => !c.village);
const TS = 40; // arazi dokusu ölçeği: bölge görünümünde tarla/orman lekeleri km boyutunda
// Bölge ve saha arazisi aynı kaplamayı paylaşır: şehir dokusu, saha tarlaları + fay izi, şiddet/zemin kaplaması
const LANDU = {
  uOv: { value: ovTex }, uCity: { value: TOWNS.map((c) => new THREE.Vector3(c.x * U, c.z * U, c.r)) },
  uSO: { value: new THREE.Vector2(SO.x, SO.z) }, uST: { value: new THREE.Vector2(ST.x, ST.z) }, uSlip: { value: 0 }, uRupt: { value: 0 }, uOvK: { value: 1 }, uRegK: { value: 1 },
  uVil: { value: new THREE.Vector4(VIL.u, VIL.v, VIL.ru, VIL.rv) }, uOrch: { value: new THREE.Vector4(...ORCH) }, uPond: { value: new THREE.Vector4(POND.u, POND.v, POND.a, POND.b) },
};
// Bölge ölçeği (yalnız bölge arazisi, yüksekten bakış): yükseklik kuşakları kabartmayı okutur. Ovalarda km'lik tarla/bahçe
// mozaiği, dağ yamaçlarında koyu orman kuşağı (fayın geçtiği Kuzey Anadolu dağları ormanlıdır), doruklarda çıplak kaya.
// Yükseklikler görseldir (2 kat abartılı): orman ≈600 m, kaya ≈1.800 m gerçek yükseklikten başlar. Sahada (uRegK = 0) etkisizdir.
const REGION_GLSL = `if (tScale > 10.0 && uRegK > 0.001) {
  vec3 cc = diffuseColor.rgb;
  float y = vTW.y;
  vec2 pc = floor(vTW.xz/vec2(2300.0, 1700.0) + vec2(h13(vec3(floor(vTW.z/1700.0), 1.0, 2.0))*0.7, 0.0));
  float pr = h13(vec3(pc, 2.3));
  vec3 fieldC = pr < 0.3 ? vec3(0.27, 0.34, 0.13) : pr < 0.55 ? vec3(0.46, 0.42, 0.25) : pr < 0.8 ? vec3(0.35, 0.39, 0.18) : vec3(0.52, 0.45, 0.3);
  fieldC *= 0.85 + 0.3*mid;
  float lowl = (1.0 - smoothstep(300.0, 1000.0, y + 400.0*(big - 0.5)))*(1.0 - smoothstep(0.08, 0.2, tSlope))*smoothstep(4.0, 30.0, y);
  cc = mix(cc, fieldC, lowl*0.8);
  float fo = smoothstep(1000.0, 1800.0, y + 600.0*(mid - 0.5));
  cc = mix(cc, vec3(0.1, 0.15, 0.065)*(0.75 + 0.5*mid)*(0.85 + 0.3*big), fo*0.88);
  float alp = smoothstep(3400.0, 3900.0, y + 500.0*(mid - 0.5));
  cc = mix(cc, vec3(0.44, 0.41, 0.36)*(0.8 + 0.4*mid), alp);
  #if NUM_DIR_LIGHTS > 0
  { // gölgeli kabartma (haritacılıktaki tepe gölgelemesi): km'lik yamaçlar yüksekten bakınca ortam ışığında düzleşir
    vec3 gn = normalize((viewMatrix*vec4(normalize(vTN), 0.0)).xyz), up = normalize((viewMatrix*vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    vec3 L = directionalLights[0].direction;
    float rel = max(dot(gn, L), 0.0)/max(dot(up, L), 0.15);
    cc *= clamp(mix(1.0, rel, 0.85), 0.3, 1.7);
  }
  #endif
  diffuseColor.rgb = mix(diffuseColor.rgb, cc, uRegK);
}`;
const CITY_GLSL = `{
  // Şehir dokusu: gri-bej yapı adaları, ana yollar
  float urb = 0.0;
  for (int i = 0; i < ${TOWNS.length}; i++) {
    float d = length(vTW.xz - uCity[i].xy)/uCity[i].z;
    urb = max(urb, 1.0 - smoothstep(0.35, 1.0, d + 0.45*(fbm3(vTW*0.0009 + float(i)*7.0, 3) - 0.5)));
  }
  vec2 bl = abs(fract(vTW.xz/180.0) - 0.5);
  float fw = fwidth(vTW.x/180.0);
  float blocks = mix(step(0.08, min(bl.x, bl.y)), 0.75, smoothstep(0.1, 0.4, fw));
  vec3 cityC = mix(vec3(0.24, 0.24, 0.25), vec3(0.62, 0.58, 0.52)*(0.8 + 0.4*vn3(vTW*0.02)), blocks);
  diffuseColor.rgb = mix(diffuseColor.rgb, cityC, urb*0.92);
}`;
const SITE_GLSL = `{
  // Saha: tarla parselleri (kuzey blokta atımla kayar), bahçe/köy/göl kıyısı, fay izi ve taze kırık
  vec2 dd = vTW.xz - uSO;
  float fu = dot(dd, uST), fv = dot(dd, vec2(uST.y, -uST.x));
  float su = fu - uSlip*smoothstep(-0.5, 0.5, fv);
  float fe = 1300.0 + 250.0*sin(fu*0.0021 + 1.0) + 160.0*sin(fu*0.0057 + 2.0);
  float farm = (1.0 - smoothstep(fe - 90.0, fe + 90.0, abs(fv - 150.0)))*(1.0 - smoothstep(260.0, 520.0, fv))*(1.0 - smoothstep(8000.0, 14000.0, abs(fu)));
  float vil = 1.0 - smoothstep(0.8, 1.0, length(vec2((fu - uVil.x)/uVil.z, (fv - uVil.y)/uVil.w)));
  vec2 oc = abs(vec2(fu - (uOrch.x + uOrch.y)*0.5, fv - (uOrch.z + uOrch.w)*0.5)) - vec2(uOrch.y - uOrch.x, uOrch.w - uOrch.z)*0.5;
  float orch = 1.0 - smoothstep(0.0, 6.0, max(oc.x, oc.y));
  float wetl = 1.0 - smoothstep(1.0, 1.5, length(vec2((fu - uPond.x)/uPond.z, (fv - uPond.y)/uPond.w)));
  float fm = farm*(1.0 - orch)*(1.0 - wetl)*(1.0 - smoothstep(0.1, 0.2, tSlope))*(1.0 - tRockW);
  if (fm > 0.001) {
    vec2 psz = vil > 0.3 ? vec2(26.0, 38.0) : vec2(92.0, 235.0);   // köyde bostan/bahçe parselleri
    vec2 fq = vec2(su, fv)/psz;
    fq.x += h13(vec3(0.0, floor(fq.y), 4.1))*0.9;
    vec2 ci = floor(fq), cf = fract(fq);
    float cr = h13(vec3(ci, 3.7));
    vec3 crop = diffuseColor.rgb;
    float plough = 0.0;
    if (cr < 0.16) crop = vec3(0.55, 0.46, 0.25);
    else if (cr < 0.44) crop = vec3(0.26, 0.36, 0.12);
    else if (cr < 0.56) { crop = vec3(0.3, 0.23, 0.16); plough = 1.0; }
    else if (cr < 0.66) { crop = vec3(0.47, 0.42, 0.26); plough = 0.5; }
    else if (cr < 0.86) crop = vec3(0.18, 0.28, 0.09);
    else crop = vec3(0.36, 0.4, 0.2);
    float sfw = fwidth(su);
    float furrow = mix(0.5 + 0.5*sin(su*6.2832/1.6), 0.5, smoothstep(0.25, 0.8, sfw));
    crop *= 0.86 + 0.26*fbm3(vec3(su*0.02, 0.0, fv*0.02) + cr*9.0, 3);
    crop *= 1.0 + (furrow - 0.5)*(0.35*plough + 0.12);
    crop *= 0.92 + 0.16*fine;
    float em = min(min(cf.x, 1.0 - cf.x)*psz.x, min(cf.y, 1.0 - cf.y)*psz.y);
    float hedge = (1.0 - smoothstep(0.8, 2.4, em))*(1.0 - smoothstep(0.3, 1.0, sfw*0.3));
    crop = mix(crop, vec3(0.25, 0.3, 0.14)*(0.8 + 0.4*mid), hedge*0.85);
    diffuseColor.rgb = mix(diffuseColor.rgb, crop, fm);
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.4, 0.18)*(0.8 + 0.35*mid), max(orch*0.8, wetl*0.7)*(1.0 - tRockW));
  // tarla yolu: iki tekerlek izi (toprak), ortası ve kenarları çimli; güney blokta, bahçe kenarından köy yoluna
  {
    float d1 = abs(fv - ${TRACK_V.toFixed(1)} - 1.2*sin(fu*0.031)) + 1e3*(1.0 - step(${(TRACK_U - 1).toFixed(1)}, fu)*step(fu, ${(ROAD_U - 3).toFixed(1)}));
    float d2 = abs(fu - ${TRACK_U.toFixed(1)} - 1.0*sin(fv*0.027)) + 1e3*(1.0 - step(fv, ${(TRACK_V + 1).toFixed(1)})*step(-420.0, fv));
    float td = min(d1, d2), tfw = fwidth(td);
    float rut = 1.0 - smoothstep(0.16, 0.3 + tfw, abs(td - 0.82));
    float lane = 1.0 - smoothstep(1.3, 1.9 + tfw, td);
    vec3 dirt = vec3(0.47, 0.4, 0.31)*(0.78 + 0.4*fine)*(0.85 + 0.3*mid);
    vec3 turf = vec3(0.3, 0.34, 0.16)*(0.8 + 0.35*mid)*(0.85 + 0.3*fine);
    vec3 tc = mix(turf, dirt, max(rut, 0.25*(1.0 - smoothstep(0.0, 0.5, td))));
    diffuseColor.rgb = mix(diffuseColor.rgb, tc, lane*(1.0 - tRockW)*(1.0 - smoothstep(0.6, 2.0, tfw)));
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.36, 0.16)*(0.75 + 0.45*mid)*(0.9 + 0.2*fine), vil*0.22*(1.0 - tRockW));
  float av = abs(fv), tz = 1.0 - smoothstep(4500.0, 6000.0, abs(fu));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.27, 0.09)*(0.8 + 0.4*mid), exp(-av*av/90.0)*0.75*tz);
  float fz = 1.0 - smoothstep(1250.0, 1650.0, abs(fu));
  // basamağın çıplak toprak yüzü ve dibindeki ezik, koyu fay kili şeridi
  float scarp = smoothstep(-1.4, -0.4, fv)*(1.0 - smoothstep(2.2, 3.6, fv))*fz;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5, 0.4, 0.29)*(0.72 + 0.4*mid)*(0.85 + 0.3*fine), scarp*0.9);
  float gouge = (1.0 - smoothstep(-6.5, -1.2, -fv))*(1.0 - smoothstep(-0.2, 0.6, fv))*fz;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.2, 0.15)*(0.75 + 0.45*fine)*(0.85 + 0.3*mid), gouge*0.55);
  float mt = (1.0 - smoothstep(3.0, 6.5, av))*uRupt*tz;
  if (mt > 0.001) {
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.47, 0.39, 0.3)*(0.78 + 0.4*fine), mt*0.9);
    float ech = abs(fract((fu*0.55 + fv*1.2)/2.4) - 0.5);
    float crack = 1.0 - smoothstep(0.03, 0.07 + fwidth(fu)*0.15, ech);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.06, 0.05), mt*crack*0.8*(1.0 - smoothstep(3.0, 5.5, av)));
  }
}`;
const OV_GLSL = `{
  vec2 ouv = ((vTW.xz/${U.toFixed(1)} + vec2(${(MAP_W / 2).toFixed(1)}, ${(MAP_D / 2).toFixed(1)}))/vec2(${MAP_W.toFixed(1)}, ${MAP_D.toFixed(1)})*vec2(${SEG_X.toFixed(1)}, ${SEG_Z.toFixed(1)}) + 0.5)/vec2(${NXV.toFixed(1)}, ${NZV.toFixed(1)});
  gOv = (ouv.x > 0.0 && ouv.x < 1.0 && ouv.y > 0.0 && ouv.y < 1.0) ? texture2D(uOv, ouv) : vec4(0.0);
  gOv.a *= uOvK;
  diffuseColor.rgb = mix(diffuseColor.rgb, gOv.rgb*0.8, gOv.a);
}`;
function landMaterial(scale, forest) {
  const m = terrainMaterial({ scale, water: 0, grass: 0x6b7536, dry: 0x9a9258, soil: 0x7d6446, forest, forestCol: 0x34472a, rock: 0x7b736a, sand: 0xc8b88e, snow: 4800 / scale, snowCol: 0xeef1f4 });
  const orig = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    orig(sh, r);
    Object.assign(sh.uniforms, LANDU);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D uOv; uniform vec3 uCity[${TOWNS.length}]; uniform vec2 uSO, uST; uniform float uSlip, uRupt, uOvK, uRegK; uniform vec4 uVil, uOrch, uPond; vec4 gOv;`)
      .replace('diffuseColor.rgb = c;', `diffuseColor.rgb = c;\n${REGION_GLSL}\n${CITY_GLSL}\n${SITE_GLSL}\n${OV_GLSL}`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += gOv.rgb*gOv.a*0.25;');
  };
  m.customProgramCacheKey = () => 'fay-hatti-land';
  return m;
}
const regionMat = landMaterial(TS, 0.8), siteMat = landMaterial(3, 0.3);
// İç içe arazi: bölge (≈1 km hücre) saha çevresinde alçaltılır; üstünde 40 km ara parça (≈100 m) ve 3,6 km yakın parça (≈7,5 m)
const hReg = (X, Z) => hS(X, Z) - 150 * (1 - smoothstep(17000, 19700, qBox(X, Z)));
const hMid = (X, Z) => hS(X, Z) - 7 * (1 - smoothstep(1650, 1780, qBox(X, Z)));
const terrain = createTerrain(hReg, { size: [MAP_W * U * 1.35, MAP_D * U * 1.5], res: LOW ? [360, 240] : [540, 360], material: regionMat });
scene.add(terrain);
scene.add(terrainSkirt(hW, { inner: MAP_D * U * 0.74, outer: 2000000, material: regionMat }));
const midT = createTerrain(hMid, { size: [40000, 40000], res: LOW ? [220, 220] : [400, 400], center: [SO.x, SO.z], material: siteMat });
const nearT = createTerrain(hS, { size: [3600, 3600], res: LOW ? [300, 300] : [480, 480], center: [SO.x, SO.z], material: siteMat });
scene.add(midT, nearT);
{
  const R = [-MAP_W * U * 0.68, -MAP_D * U * 0.75, MAP_W * U * 0.68, MAP_D * U * 0.75];
  sim.ocean.setDepth(depthTexture(hW, R, 512), R);
}
// Tıklama düzlemi (deniz yüzeyi): görünmez ama ışın testine girer
const clickPlane = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W * U * 1.35, MAP_D * U * 1.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
clickPlane.userData.noShadow = true;
scene.add(clickPlane);

// Kaplama bantları (arazinin üstünde)
function ribbon(points, width, color, lift = 700, opacity = 1) {
  const n = points.length, pos = new Float32Array(n * 2 * 3), idx = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const p = points[i], y = hAt(p.x, p.z) + lift;
    pos.set([(p.x - dz * width) * U, y, (p.z + dx * width) * U, (p.x + dz * width) * U, y, (p.z - dx * width) * U], i * 6);
    if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: false }));
  m.renderOrder = 3;
  return m;
}
const faultLine = ribbon(fault, 0.05, 0xdc2626, 700, 0.85);
scene.add(faultLine);
let ruptureMesh = null;
const regionMarks = [
  sim.label('Fay hattı (temsili)', { position: [-17 * U, 9000, 1.6 * U], className: 'plain' }),
  sim.label('🗺️ Temsili bölge · yükseklikler 2 kat abartılı', { position: [6 * U, 2000, 13.2 * U], className: 'plain' }),
];
// Saha ölçeğinde fay izi çizgisi (yere serili ince şerit); sahadan kırılma geçince sarıya döner
const traceLine = (() => {
  const pos = [], idx = [];
  let i = 0;
  for (let u = -1690; u <= 1690; u += 6, i++) {
    const [xa, za] = fromUV(u, -7), [xc, zc] = fromUV(u, -1), y = Math.max(hS(xa, za), hS(xc, zc)) + 0.4;
    for (const v of [-6.5, -1.2]) { const [x, z] = fromUV(u, v); pos.push(x, y, z); }
    if (u > -1690) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.renderOrder = 3; m.userData.noShadow = true;
  scene.add(m);
  // uzaktan da okunur ince çizgi (ekranda 1 piksel)
  const lp = [];
  for (let k = 0; k < pos.length; k += 6) lp.push((pos[k] + pos[k + 3]) / 2, pos[k + 1] + 0.4, (pos[k + 2] + pos[k + 5]) / 2);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.75, depthWrite: false }));
  line.renderOrder = 3;
  m.add(line);
  m.userData.line = line;
  return m;
})();
// Fay basamağı: araziden keskin (≈2–3 m) yüz — arazi ızgarası (≈8–12 m) bu kadar dik bir basamağı çizemez.
// Aynı arazi malzemesi kullanılır; yol, dere ve gölcük geçişlerinde kesilir.
const SCARP_V = [-0.9, 1.6, 2.4, 14];
const scarpSkip = (u) => u < -1640 || u > 1640 || Math.abs(u - ROAD_U) < 7 || Math.abs(u - FENCE_U) < 2 || streamDist(u, 0) < 12 || (u > POND.u - POND.a - 20 && u < POND.u + POND.a + 20);
function scarpProfile(u) {
  const H = SCARP_V.map((v) => { const [x, z] = fromUV(u, v); return hS(x, z); });
  const top = Math.max(H[3], H[1] + 1.2) + 0.12;
  return [H[0] - 0.7, top + 0.05, top, H[3] + 0.08];
}
function scarpY(u, v) { // basamak ağının yüksekliği (yoksa −∞): ağaçlar ve direkler bunun üstüne oturur
  if (v <= SCARP_V[0] || v >= SCARP_V[3] || scarpSkip(u)) return -Infinity;
  const ys = scarpProfile(u);
  for (let k = 0; k < 3; k++) if (v <= SCARP_V[k + 1]) return ys[k] + (ys[k + 1] - ys[k]) * (v - SCARP_V[k]) / (SCARP_V[k + 1] - SCARP_V[k]);
  return -Infinity;
}
const scarpMesh = (() => {
  const pos = [], idx = [], VS = SCARP_V;
  let seg = -1;
  for (let u = -1640; u <= 1640; u += LOW ? 6 : 3) {
    if (scarpSkip(u)) { seg = -1; continue; }
    const ys = scarpProfile(u);
    const base = pos.length / 3;
    VS.forEach((v, k) => { const [x, z] = fromUV(u, v); pos.push(x, ys[k], z); });
    if (seg >= 0) for (let k = 0; k < 3; k++) idx.push(seg + k, seg + k + 1, base + k, base + k, seg + k + 1, base + k + 1);
    seg = base;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, siteMat);
  m.receiveShadow = true; m.castShadow = true;
  scene.add(m);
  return m;
})();
{
  // 50 km ölçek çubuğu (beyaz/siyah 10 km dilimli)
  const g = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(10000, 400, 1600), new THREE.MeshBasicMaterial({ color: k % 2 ? 0x111111 : 0xffffff }));
    seg.position.set(-17 * U + k * 10000 + 5000, 0, 0);
    g.add(seg);
  }
  g.position.set(0, hAt(-15, 11.8) + 1500, 11.8 * U);
  scene.add(g);
  regionMarks.push(g, sim.label('50 km', { position: [-15 * U, hAt(-15, 11.8) + 5500, 11.8 * U], className: 'plain' }));
}

// --- Şehirler: yapı adaları (gerçek boyutlu binalar) + durum halkası ---
const cityGroup = new THREE.Group();
scene.add(cityGroup);
{
  const facade = procedural({
    key: 'fay-facade', params: { vertexColors: true, roughness: 0.85 },
    pattern: /* glsl */ `
      vec3 an = abs(pn);
      if (an.y > 0.6) { col = vec3(0.38, 0.37, 0.36)*(0.8 + 0.4*fbm3(p*0.5, 3)); rough = 0.9; }
      else {
        float u = an.x > 0.5 ? p.z : p.x;
        vec2 cw = vec2(u/3.4, p.y/3.1), fw = fwidth(cw);
        vec2 f = fract(cw);
        float win = smoothstep(0.16, 0.2, f.x)*smoothstep(0.84, 0.8, f.x)*smoothstep(0.26, 0.3, f.y)*smoothstep(0.88, 0.84, f.y);
        win = mix(win, 0.38, smoothstep(0.12, 0.45, max(fw.x, fw.y)));
        col = mix(col*(0.85 + 0.3*fbm3(p*0.2, 3)), vec3(0.08, 0.1, 0.12), win); rough = mix(0.85, 0.1, win);
      }`,
  });
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), geos = [], rnd = seeded(33);
  const PAL = [0xe8dcc8, 0xd9c7ae, 0xc9ccd0, 0xefe9df, 0xd7b79a];
  TOWNS.forEach((c) => {
    const cx = c.x * U, cz = c.z * U, n = Math.round((LOW ? 130 : 260) * (c.r / 5000));
    for (let q = 0; q < n; q++) {
      const a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * c.r * 0.55;
      const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (height(x / U, z / U) < 0.02) continue;
      const w = 18 + rnd() * 30, d = 14 + rnd() * 24, floors = Math.round(3 + rnd() * rnd() * 14 * (1 - rr / c.r));
      const g = box.clone().scale(w, floors * 3.1 + 1, d).rotateY(Math.round(rnd() * 3) * 0.1).translate(x, hW(x, z) - 1, z);
      const col = new THREE.Color(PAL[(rnd() * PAL.length) | 0]), arr = new Float32Array(g.attributes.position.count * 3);
      for (let k = 0; k < arr.length; k += 3) arr.set([col.r, col.g, col.b], k);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      geos.push(g);
    }
  });
  const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), facade);
  m.userData.noFit = true;
  cityGroup.add(m);
  geos.forEach((g) => g.dispose());
  CITIES.forEach((c) => {
    c.h = hAt(c.x, c.z);
    c.soil = soilOf(height(c.x, c.z));
    const g = new THREE.Group();
    g.position.set(c.x * U, c.h + 400, c.z * U);
    c.grp = g;
    const ring = new THREE.Mesh(new THREE.RingGeometry(c.r * 0.95, c.r * 0.95 + (c.village ? 260 : 1100), 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 4;
    g.add(ring);
    c.ring = ring;
    cityGroup.add(g);
    c.label = sim.label(c.name, { parent: g, position: [0, c.village ? 1200 : 5000, 0] });
  });
}
const STATIONS = [[-14, -5], [-7, 6], [-1, -6.5], [3, 4.5], [9, -4], [11, 6.5], [17, -1], [-18, -1]].map(([x, z]) => ({ x, z }));
const stationGroup = new THREE.Group();
scene.add(stationGroup);
{
  const g = new THREE.ConeGeometry(1600, 3400, 3).rotateX(Math.PI).translate(0, 1700, 0);
  const m = new THREE.MeshBasicMaterial({ color: 0xa78bfa });
  STATIONS.forEach((s) => {
    const c = new THREE.Mesh(g, m);
    c.position.set(s.x * U, hAt(s.x, s.z) + 300, s.z * U);
    stationGroup.add(c);
    s.mesh = c;
  });
}

// --- Dalga cephesi halkaları (araziyi izleyen bant) ---
const RING_N = 240;
function makeBand(color, opacity = 0.85) {
  const pos = new Float32Array(RING_N * 2 * 3), idx = [];
  for (let i = 0; i < RING_N; i++) {
    const j = (i + 1) % RING_N;
    idx.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  m.frustumCulled = false;
  m.renderOrder = 4;
  scene.add(m);
  return m;
}
const pBand = makeBand(0x38bdf8), sBand = makeBand(0xf97316), blindBand = makeBand(0xffffff, 0.6);
const EXT_W = MAP_W * 0.66, EXT_D = MAP_D * 0.72; // bantlar arazi parçasının sınırında kesilir
let bandLift = 900;                                 // yakın görünümde bantlar yere iner
function setBand(band, cx, cz, r, w) {
  const a = band.geometry.attributes.position.array;
  band.visible = r > 0.05;
  if (!band.visible) return;
  for (let i = 0; i < RING_N; i++) {
    const t = (i / RING_N) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    for (let k = 0; k < 2; k++) {
      const rr = Math.max(0, r - k * w);
      let x = cx + c * rr, z = cz + s * rr;
      const out = Math.abs(x) > EXT_W || Math.abs(z) > EXT_D;
      if (out) { x = clamp(x, -EXT_W, EXT_W); z = clamp(z, -EXT_D, EXT_D); }
      a.set([x * U, out ? -5e5 : hAt(x, z) + bandLift, z * U], (i * 2 + k) * 3);
    }
  }
  for (let i = 0; i < RING_N * 2; i++) if (a[i * 3 + 1] < -4e5) { const j = i ^ 1; a[i * 3] = a[j * 3]; a[i * 3 + 2] = a[j * 3 + 2]; a[i * 3 + 1] = a[j * 3 + 1]; }
  band.geometry.attributes.position.needsUpdate = true;
}

// Merkez üssü işareti (yıldız + direk)
const epiMark = new THREE.Group();
{
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(2600), mat.glow({ color: 0xfacc15, intensity: 1.6 }));
  star.position.y = 9000;
  epiMark.add(star);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(220, 220, 9000, 8).translate(0, 4500, 0), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
  epiMark.add(stem);
  epiMark.userData.star = star;
  scene.add(epiMark);
}
const epiLabel = sim.label('', { parent: epiMark, position: [0, 15000, 0], className: 'big' });

// --- Saha nesneleri (köy, yollar, ağaçlar, çit, su) ---
const site = buildSite({ hS, scarpY, fromUV, ST, SN, SO, STREAM, POND, LOW, farmAt, vilAt, streamDist, ROAD_U, ROAD_V, ORCH, POPLAR_U, FENCE_U, WALL_U, WALL_OFF, TRACK_U, TRACK_V });
scene.add(site.root);
const siteLabels = [];
{
  const L = (text, u, v, dy) => { const [x, z] = fromUV(u, v); const l = sim.label(text, { position: [x, hS(x, z) + dy, z], className: 'plain' }); siteLabels.push(l); return l; };
  L('Fay izi (sağ yanal)', 520, 0, 14);
  L('Eski taş duvar: önceki depremde ≈4,5 m ötelenmiş', WALL_U + 2, 6, 7);
  L('Ötelenmiş dere (≈140 m birikimli)', -700, 60, 26);
  L('Çöküntü gölü', POND.u, POND.v, 16);
  L('Kuzey blok → doğuya', 40, 260, 30);
  L('← Güney blok batıya', -60, -180, 30);
}
const slipLabel = (() => { const [x, z] = fromUV(ROAD_U + 26, 8); return sim.label('', { position: [x, hS(x, z) + 18, z] }); })();
slipLabel.visible = false;
siteLabels.push(slipLabel);
let siteSlip = 0;

// --- Şiddet modeli ---
// Atkinson–Wald (2007) biçimi: MMI = c1 + c2(M−6) + c3(M−6)² + c4·logR + c5·R + c6·B + c7·M·logR,  B = max(0, log(R/30))
const C = [12.27, 2.27, 0.1304, -1.3, -0.000707, 1.95, -0.577];
function ipe(M, R) {
  R = Math.max(R, 5);
  const lr = Math.log10(R), B = Math.max(0, Math.log10(R / 30));
  return C[0] + C[1] * (M - 6) + C[2] * (M - 6) ** 2 + C[3] * lr + C[4] * R + C[5] * B + C[6] * M * lr;
}
const ROMAN = ['I', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const MMI_COL = [0xffffff, 0xffffff, 0xbfccff, 0xa0e6ff, 0x80ffff, 0x7aff93, 0xffff00, 0xffc800, 0xff9100, 0xff0000, 0xc80000, 0x800000, 0x800000];
const MMI_TXT = ['', 'Hissedilmez', 'Zayıf', 'Zayıf', 'Hafif', 'Orta', 'Kuvvetli', 'Çok kuvvetli', 'Şiddetli', 'Çok şiddetli', 'Aşırı', 'Aşırı', 'Aşırı'];
const MMI_DMG = ['', 'yok', 'yok', 'yok', 'yok', 'çok hafif', 'hafif', 'orta', 'orta–ağır', 'ağır', 'çok ağır', 'çok ağır', 'çok ağır'];
const mmiInt = (v) => clamp(Math.round(v), 1, 12);
const mmiColor = (v, out) => {
  const f = clamp(v, 1, 11.99), i = Math.floor(f);
  return out.setHex(MMI_COL[i]).lerp(new THREE.Color(MMI_COL[Math.min(12, i + 1)]), f - i);
};
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
// Kırılma uzunluğu (doğrultu atımlı, Wells & Coppersmith 1994, yeraltı kırılma uzunluğu): log L = −2,57 + 0,62·Mw
const ruptureKm = (M) => 10 ** (-2.57 + 0.62 * M);
// Ortalama yüzey atımı (doğrultu atımlı, Wells & Coppersmith 1994): log AD = −6,32 + 0,90·Mw  (m)
const slipAD = (M) => 10 ** (-6.32 + 0.9 * M);
const RISE = 2;  // sn — bir noktadaki kaymanın tamamlanma süresi (birkaç saniye; yaklaşık)

// --- Olay durumu ---
const ev = { i: 200, x: 0, z: 0, t0: 0, M: 7, depth: 12, rs: 0, re: 0, alertT: 0, maxMmi: 0, done: false };
const vHyp = new Float32Array(NV), vMmi = new Float32Array(NV);
let lastReveal = -1;

function distToRupture(x, z) {
  let best = Infinity;
  for (let k = ev.rs; k < ev.re; k++) {
    const a = fault[k], b = fault[k + 1];
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9;
    const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / L2, 0, 1);
    const d = (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2;
    if (d < best) best = d;
  }
  if (ev.rs === ev.re) best = (x - ev.x) ** 2 + (z - ev.z) ** 2;
  return Math.sqrt(best) * KM;
}
const siteTerm = (soil) => SOIL[soil].d * amp.value;
const hypoKm = (x, z) => Math.hypot(Math.hypot(x - ev.x, z - ev.z) * KM, ev.depth);
const mmiAt = (x, z, soil) => ipe(ev.M, Math.hypot(distToRupture(x, z), ev.depth)) + siteTerm(soil);

function startEvent(i = ev.i) {
  ev.i = clamp(i, 0, fault.length - 1);
  const f = fault[ev.i];
  Object.assign(ev, { x: f.x, z: f.z, t0: sim.time, M: magS.value, depth: depthS.value, done: false, alerted: false });
  const L = Math.min(ruptureKm(ev.M), FAULT_LEN);
  let s0 = f.s - L / 2, s1 = f.s + L / 2;
  if (s0 < 0) { s1 -= s0; s0 = 0; }
  if (s1 > FAULT_LEN) { s0 -= s1 - FAULT_LEN; s1 = FAULT_LEN; }
  ev.rs = fault.findIndex((p) => p.s >= s0);
  ev.re = Math.max(ev.rs, fault.findIndex((p) => p.s >= s1 - 1e-6));
  ev.L = L;
  if (ruptureMesh) { ruptureMesh.geometry.dispose(); ruptureMesh.removeFromParent(); ruptureMesh = null; }
  if (ev.re > ev.rs) { ruptureMesh = ribbon(fault.slice(ev.rs, ev.re + 1), 0.13, 0xfacc15, 800, 0.9); scene.add(ruptureMesh); }
  epiMark.position.set(ev.x * U, hAt(ev.x, ev.z), ev.z * U);
  // Sahada yüzey kırığı: saha kırılan parçanın içindeyse ve Mw ≥ 6 ise
  ev.siteHit = ev.re > ev.rs && SITE_I >= ev.rs && SITE_I <= ev.re && ev.M >= 6;
  ev.slipD = ev.siteHit ? slipAD(ev.M) : 0;
  ev.slipT = Math.abs(fault[SITE_I].s - f.s) / VR;
  ev.slipOn = false;
  siteSlip = 0; site.setSlip(0); site.setDamage(0); LANDU.uSlip.value = 0; LANDU.uRupt.value = 0;
  slipLabel.visible = false;
  traceLine.material.color.setHex(ev.siteHit ? 0xfacc15 : 0xdc2626); traceLine.userData.line.material.color.setHex(ev.siteHit ? 0xfacc15 : 0xdc2626);
  epiLabel.setText(`Mw ${fmt(ev.M, 1)} · ${fmt(ev.depth)} km derinlik`);
  // Köşe başına şiddet ve S varışı (bir kez)
  ev.maxMmi = 0;
  for (let k = 0; k < NV; k++) {
    const x = gX[k], z = gZ[k];
    vHyp[k] = hypoKm(x, z);
    vMmi[k] = vH[k] >= 0 ? mmiAt(x, z, vSoil[k]) : 0;
    if (vMmi[k] > ev.maxMmi) ev.maxMmi = vMmi[k];
  }
  // Erken uyarı: P dalgasını algılayan 3. istasyon + işleme süresi
  const tp = STATIONS.map((s) => hypoKm(s.x, s.z) / VP).sort((a, b) => a - b);
  ev.alertT = tp[2] + procS.value;
  ev.blindKm = Math.sqrt(Math.max(0, (ev.alertT * VS) ** 2 - ev.depth ** 2));
  for (const c of CITIES) {
    c.R = hypoKm(c.x, c.z);
    c.tP = c.R / VP; c.tS = c.R / VS;
    c.mmi = mmiAt(c.x, c.z, c.soil);
    c.warn = c.tS - ev.alertT;
  }
  lastReveal = -1;
  paintOverlay(0);
  updatePanel(0, true);
}

const _c = new THREE.Color();
function paintOverlay(t) {
  const soilMode = view.value === 'zemin';
  const sR = t * VS;
  for (let k = 0; k < NV; k++) {
    let a = 0;
    if (soilMode) {
      if (vH[k] >= 0) { _c.setHex(SOIL[vSoil[k]].color); a = 0.55; }
    } else if (view.value === 'siddet' && vH[k] >= 0 && vHyp[k] <= sR && vMmi[k] >= 2.5) {
      mmiColor(vMmi[k], _c);
      a = clamp((vMmi[k] - 2.5) * 0.35, 0, 0.72);
    }
    ovData[k * 4] = _c.r * 255; ovData[k * 4 + 1] = _c.g * 255; ovData[k * 4 + 2] = _c.b * 255; ovData[k * 4 + 3] = a * 255;
  }
  ovTex.needsUpdate = true;
}

// --- Döngü ---
let tick = 0;
sim.onUpdate((dt) => {
  const t = sim.time - ev.t0;
  const rP = Math.sqrt(Math.max(0, (t * VP) ** 2 - ev.depth ** 2)) / KM;
  const rS = Math.sqrt(Math.max(0, (t * VS) ** 2 - ev.depth ** 2)) / KM;
  const far = Math.hypot(MAP_W, MAP_D);
  setBand(pBand, ev.x, ev.z, rP < far ? rP : 0, 0.28);
  setBand(sBand, ev.x, ev.z, rS < far ? rS : 0, 0.4);
  pBand.visible &&= showWaves.value; sBand.visible &&= showWaves.value;
  if (!ev.alerted && t >= ev.alertT) {
    ev.alerted = true;
    sim.toast(`📢 Erken uyarı yayınlandı (t = ${fmt(ev.alertT, 1)} sn)`, 'warn');
  }
  setBand(blindBand, ev.x, ev.z, ev.alerted && showWaves.value ? ev.blindKm / KM : 0, 0.08);
  // S dalgası ilerledikçe şiddet haritasını aç (her birkaç karede)
  const reveal = Math.floor(rS * 2);
  if (view.value !== 'yok' && reveal !== lastReveal && rS < far + 1) { lastReveal = reveal; paintOverlay(t); }
  if (!ev.done && rS > far) { ev.done = true; paintOverlay(t); }
  // Sahada yüzey kayması: kırılma cephesi sahaya ulaşınca RISE saniyede tamamlanır
  const ts = t - ev.slipT;
  const slip = ev.slipD > 0 ? ev.slipD * smoothstep(0, RISE, ts) : 0;
  if (Math.abs(slip - siteSlip) > 1e-4) {
    siteSlip = slip; site.setSlip(slip); LANDU.uSlip.value = slip;
    site.setDamage(ev.slipD > 0 ? clamp(slip / ev.slipD, 0, 1) * clamp(ev.slipD / 1.5, 0.35, 1) : 0);
    slipLabel.setText(`Yüzey kırığı · sağ yanal atım ≈ ${fmt(slip, slip < 1 ? 2 : 1)} m`);
  }
  if (ev.slipD > 0 && ts > 0 && !ev.slipOn) { ev.slipOn = true; LANDU.uRupt.value = 1; site.burst(); slipLabel.visible = showLabels.value; }
  site.update(dt, sim.time, true);
  if (++tick % 6 === 0) updatePanel(t);
});

// Görünüm ölçeği: yakında (saha) bölge işaretleri gizlenir/yere iner, hava perspektifi ve kamera yakın düzlemi uyarlanır
const cam = sim.camera;
let nearMode = null;
function applyMode(near) {
  nearMode = near;
  bandLift = near ? 25 : 900;
  for (const c of CITIES) {
    c.grp.position.y = c.h + (near ? 30 : 400);
    c.label.position.y = near ? (c.village ? 70 : 600) : c.village ? 1200 : 5000;
  }
  regionMarks.forEach((m) => { m.visible = !near; });
  for (const c of CITIES) c.ring.visible = showLabels.value && !near;   // yakında şehir/köy halkaları (yatay, km ölçekli) ufku kesen beyaz şerit gibi görünür
  epiMark.visible = !near;
  pBand.material.opacity = near ? 0.35 : 0.85; sBand.material.opacity = near ? 0.35 : 0.85; blindBand.material.opacity = near ? 0.25 : 0.6;
}
sim.onRender(() => {
  const s = epiMark.userData.star;
  s.rotation.y += 0.03;
  const alt = Math.max(1, cam.position.y - Math.max(0, hS(cam.position.x, cam.position.z)));
  const dSite = Math.hypot(cam.position.x - SO.x, cam.position.z - SO.z);
  const near = alt < 7000 && dSite < 30000;
  if (near !== nearMode) applyMode(near);
  // Dalga/kör bölge bantları km ölçekli: yerden (saha bakışı) kiriş gibi tepeleri keser, gökyüzünü bölen bir duvar gibi görünür → gizlenir
  if (alt < 400) pBand.visible = sBand.visible = blindBand.visible = false;
  const nearCam = clamp(alt * 0.012, 0.3, 60);
  if (Math.abs(cam.near - nearCam) > nearCam * 0.2) { cam.near = nearCam; cam.updateProjectionMatrix(); }
  // Hava perspektifi: sahada 32 km görüş; bölge bakışında (100+ km yükseklik, 300 km bakış yolu) pus haritayı tek düze boğmasın
  if (sim.sky.fog) sim.sky.fog.density = 1 / clamp(32000 + alt * 30, 32000, 3000000);
  LANDU.uOvK.value = smoothstep(3000, 15000, alt);
  LANDU.uRegK.value = smoothstep(1500, 6000, alt);
  site.root.visible = alt < 40000 && dSite < 60000;
  epiMark.scale.setScalar(clamp(cam.position.distanceTo(epiMark.position) / 300000, 0.004, 1));
  traceLine.visible = showFault.value && alt < 20000;
  traceLine.material.opacity = clamp(alt / 60, 0.28, 0.7);   // yere yakın bakışta basamak ve gölgesi şeridin altından okunur
  siteLabels.forEach((l) => { l.visible = showLabels.value && near && (l !== slipLabel || ev.slipOn); });
  const t = sim.time - ev.t0;
  for (const c of CITIES) {
    const shaking = t > c.tS && t < c.tS + 6 + ev.M;
    c.ring.scale.setScalar(shaking ? 1 + 0.15 * Math.sin(sim.time * 25) : 1);
  }
  for (const st of STATIONS) st.mesh.visible = showStations.value && !nearMode;
  faultLine.visible = showFault.value && !nearMode;
  if (ruptureMesh) ruptureMesh.visible = showFault.value && !nearMode;
});

function cityText(c, t) {
  if (t < c.tP) return `<b>${c.name}</b>`;
  if (t < c.tS) return `<b>${c.name}</b> · ⚠️ S'ye ${fmt(c.tS - t, 0)} sn`;
  const m = mmiInt(c.mmi);
  return `<b>${c.name}</b> <span style="background:${hex(MMI_COL[m])};color:#111;padding:0 5px;border-radius:5px">${ROMAN[m]}</span>`;
}

function updatePanel(t, full = false) {
  for (const c of CITIES) {
    c.label.setText(cityText(c, t));
    c.label.visible = showLabels.value;
    c.ring.visible = showLabels.value && !nearMode;
    const m = mmiInt(c.mmi);
    c.ring.material.color.setHex(t >= c.tS ? MMI_COL[m] : t >= c.tP ? 0x38bdf8 : 0xffffff);
  }
  if (!full && tick % 12) return;
  const rows = [...CITIES].sort((a, b) => a.R - b.R).map((c) => {
    const m = mmiInt(c.mmi), felt = t >= c.tS;
    const warn = c.warn <= 0 ? '<span style="color:#f87171">kör bölge</span>' : `${fmt(c.warn, 1)}`;
    return `<tr><td>${c.name}<br><small style="color:#94a3b8">${SOIL[c.soil].icon} ${SOIL[c.soil].name.split(' ')[0]} · ${fmt(c.R, 0)} km</small></td>
      <td style="text-align:right">${fmt(c.tP, 1)}</td><td style="text-align:right">${fmt(c.tS, 1)}</td><td style="text-align:right">${warn}</td>
      <td style="text-align:center"><span style="background:${hex(MMI_COL[m])};color:#111;padding:0 5px;border-radius:5px;opacity:${felt ? 1 : 0.45}">${ROMAN[m]}</span></td></tr>`;
  }).join('');
  table.set(`<table style="width:100%;font-size:12px;border-collapse:collapse;line-height:1.25">
    <tr style="color:#94a3b8;font-size:11px"><td>Şehir</td><td style="text-align:right">P sn</td><td style="text-align:right">S sn</td><td style="text-align:right">Uyarı sn</td><td style="text-align:center">MMI</td></tr>${rows}</table>
    <small style="color:#94a3b8">Soluk MMI: S dalgası henüz ulaşmadı (tahmin).</small>`);
  const E = (M) => 10 ** (1.5 * M + 4.8);
  stEnergy.set(`${fmt(E(ev.M) / E(6), E(ev.M) / E(6) < 10 ? 1 : 0)}×`);
  stTnt.set(fmtBig(E(ev.M) / 4.184e9));
  stRupt.set(fmt(ev.L, 0));
  stSlip.set(ev.siteHit ? fmt(ev.slipD, ev.slipD < 1 ? 2 : 1) : ev.M < 6 ? 'yüzeye ulaşmaz' : 'kırılma burada değil');
  const mx = mmiInt(ev.maxMmi);
  stMax.set(`${ROMAN[mx]}`, mx >= 8 ? 'bad' : mx >= 6 ? 'warn' : 'good');
  stAlert.set(fmt(ev.alertT, 1));
  stBlind.set(fmt(ev.blindKm, 0));
  mmiCard.set(`<b>En yüksek tahmini şiddet: ${ROMAN[mx]} (${MMI_TXT[mx]})</b><br>Beklenen hasar: ${MMI_DMG[mx]}.`);
}
const fmtBig = (v) => (v >= 1e6 ? `${fmt(v / 1e6, v >= 1e7 ? 0 : 1)} milyon` : v >= 1e3 ? `${fmt(v / 1e3, v >= 1e4 ? 0 : 1)} bin` : fmt(v, 0));

// Araziye tıkla → fay üzerindeki en yakın noktada deprem
sim.onClick([nearT, midT, terrain, clickPlane], (hit) => {
  const p = { x: hit.point.x / U, z: hit.point.z / U };
  let best = 0, bd = Infinity;
  fault.forEach((f, k) => { const d = (f.x - p.x) ** 2 + (f.z - p.z) ** 2; if (d < bd) { bd = d; best = k; } });
  const dk = Math.sqrt(bd) * KM;
  if (dk > 40) sim.toast(`Fay hattına ${fmt(dk, 0)} km uzağa tıkladın; deprem fay üzerindeki en yakın noktada başlatıldı.`, 'warn');
  startEvent(best);
});

// --- Panel ---
const ui = sim.ui;
ui.section('Deprem');
ui.text('Arazide <b>fay hattına tıkla</b>: deprem orada başlar.', 'card');
const magS = ui.slider({ label: 'Büyüklük (Mw)', min: 4, max: 8, step: 0.1, value: 7.6, format: (v) => `Mw ${fmt(v, 1)}`, onChange: () => startEvent() });
const depthS = ui.slider({ label: 'Odak derinliği', min: 5, max: 40, step: 1, value: 12, unit: 'km', onChange: () => startEvent() });
const amp = ui.slider({ label: 'Zemin büyütmesi', min: 0, max: 2, step: 0.1, value: 1, format: (v) => (v === 0 ? 'kapalı' : `×${fmt(v, 1)}`), onChange: () => startEvent() });
ui.buttons([
  { label: '▶ Yeniden başlat', variant: 'primary', onClick: () => startEvent() },
  { label: '🎲 Rastgele yer', onClick: () => startEvent(Math.floor(Math.random() * fault.length)) },
]);
ui.buttons([
  { label: 'Mw 6,0', onClick: () => { magS.set(6); startEvent(); } },
  { label: 'Mw 7,0', onClick: () => { magS.set(7); startEvent(); } },
  { label: 'Mw 7,8', onClick: () => { magS.set(7.8); startEvent(); } },
]);
const stEnergy = ui.stat({ label: 'Enerji (Mw 6\'ya göre)' });
const stTnt = ui.stat({ label: 'TNT eşdeğeri', unit: 'ton' });
const stRupt = ui.stat({ label: 'Kırılma uzunluğu', unit: 'km' });
const stSlip = ui.stat({ label: 'Çayırköy fay izinde ortalama atım', unit: 'm' });
const stMax = ui.stat({ label: 'En yüksek şiddet (MMI)' });
const mmiCard = ui.text('', 'card');

ui.section('Erken uyarı');
const procS = ui.slider({ label: 'Algılama + işleme süresi', min: 1, max: 10, step: 0.5, value: 4, unit: 'sn', onChange: () => startEvent() });
const stAlert = ui.stat({ label: 'Uyarı yayını', unit: 'sn' });
const stBlind = ui.stat({ label: 'Kör bölge yarıçapı', unit: 'km' });
ui.text('Uyarı süresi = S dalgasının şehre varışı − (3 istasyonun P dalgasını algılaması + işleme). Beyaz halka kör bölgeyi gösterir: içinde kalan yerlere S dalgası uyarıdan önce ulaşır.', 'card');

ui.section('Şehirler');
const table = ui.text('');

ui.section('Görünüm');
const view = ui.segmented({ label: 'Kaplama', options: [{ value: 'siddet', label: 'Şiddet' }, { value: 'zemin', label: 'Zemin sınıfı' }, { value: 'yok', label: 'Yok' }], value: 'siddet',
  onChange: () => { lastReveal = -1; paintOverlay(sim.time - ev.t0); } });
const showWaves = ui.toggle({ label: 'Dalga cepheleri (P mavi, S turuncu)', value: true });
const showFault = ui.toggle({ label: 'Fay hattı ve kırılan parça', value: true });
const showLabels = ui.toggle({ label: 'Şehir etiketleri ve halkaları', value: true, onChange: () => updatePanel(sim.time - ev.t0, true) });
const showStations = ui.toggle({ label: 'Sismometre istasyonları (mor)', value: true });
const at = (u, v, dy) => { const [x, z] = fromUV(u, v); return [x, hS(x, z) + dy, z]; };
const VIEWS = {
  fay: () => sim.moveCamera(at(240, -92, 5), at(254, 4, 0.8)),
  koy: () => sim.moveCamera(at(180, -560, 38), at(-260, -250, 4)),
  iz: () => sim.moveCamera(at(300, -34, 7), at(214, 26, 1)),
  dere: () => sim.moveCamera(at(-560, -300, 80), at(-800, 30, 0)),
  bahce: () => sim.moveCamera(at(-330, -60, 14), at(-470, 40, 2)),
};
ui.buttons([
  { label: '⛰ Fay vadisi', onClick: VIEWS.fay },
  { label: '🏡 Çayırköy', onClick: VIEWS.koy },
  { label: '🔍 Fay izi (yol, çit)', onClick: VIEWS.iz },
]);
ui.buttons([
  { label: '🌊 Ötelenmiş dere', onClick: VIEWS.dere },
  { label: '🌳 Bahçe sıraları', onClick: VIEWS.bahce },
]);
ui.buttons([
  { label: '🔭 Bölge', onClick: () => sim.moveCamera([20 * U, 5000, -0.5 * U], [18.5 * U, 0, 2.2 * U]) }, // kuzeydoğudan alçak (≈4 km) eğik bakış: yandan vuran güneşte ova, fayın doğu kolu, Ovacık ve Körfezkent, arkada güney dağları (maxPolarAngle 84° sınırında kalır)
  { label: '🛰 Tepeden', onClick: () => sim.moveCamera([0, 330000, 60000], [0, 0, 0]) },
  { label: '🏙 Körfezkent', onClick: () => sim.moveCamera([12.4 * U - 9000, 9000, 2.0 * U + 22000], [12.4 * U, 200, 2.0 * U]) },
]);
ui.text(`<div style="display:flex;flex-wrap:wrap;gap:3px;font-size:11px">${[3, 4, 5, 6, 7, 8, 9, 10].map((m) => `<span style="background:${hex(MMI_COL[m])};color:#111;padding:1px 5px;border-radius:4px">${ROMAN[m]} ${MMI_TXT[m]}</span>`).join('')}</div>`);

sim.formatTime = (t) => `t = ${fmt(Math.max(0, t - ev.t0), 1)} sn`;
sim.onReset(() => { ev.t0 = 0; startEvent(); });
startEvent(SITE_I);
VIEWS.fay();
