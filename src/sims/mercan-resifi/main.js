// Mercan Resifi ve Okyanus Isınması — Derece Isınma Haftası (DHW), ağarma/toparlanma/ölüm, asitlenme, kirlilik ve koruma alanı.
// Görsel: ~8 m derinlikte resif, gerçek ölçek (metre). Su altı görünümü yerel: mavi-yeşil üstel sis, suyun süzdüğü güneş ışığı
// (kırmızı önce söner), su altı ortam haritası, tabanda hareketli ışık ağı (kostik), asılı parçacıklar, ışık hüzmeleri, alttan su yüzeyi.
import { createSim, THREE, BufferGeometryUtils, ImprovedNoise, fmt, clamp, instanced, seeded, heatColor, TAU, procedural, mat, smoothstep } from '@core';
import { createModel, STEP, START_WEEK, omega, calcFactor } from './model.js';
import { softDot } from './kit.js';

const WEEKS_PER_SEC = 1.5;   // 1× hızda 1 sn = 1,5 hafta
const N = 150;               // mercan kolonisi
const MAXF = 280;            // ekranda en çok balık
const REEF_R = 13;
const SURF = 8;              // su yüzeyi (taban ≈ 0 m, yani ≈ 8 m derinlik)
const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;

const sim = createSim({
  sky: { elevation: 64, azimuth: 150, clouds: 0.12, haze: 1, visibility: 0 },
  shadows: true, shadowSize: 34,
  camera: { position: [4.6, 2.5, 11.8], target: [-0.5, 1.2, -2], fov: 48, near: 0.05, far: 600 },
  controls: { maxDistance: 45, minDistance: 2.5 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Yaklaşık 8 metre derinlikte, sığ, tropikal bir mercan resifi. Mercanlar aslında küçük hayvanlardır; dokularında yaşayan minik
    <b>algler (zooksantel)</b> onlara hem besin hem de renk verir. Su çok uzun süre fazla ısınırsa mercan bu algleri dışarı atar:
    renksizleşir ve beyaz iskeleti görünür. Buna <b>ağarma</b> denir. Ağarmış mercan henüz ölmemiştir; su zamanında serinlerse
    algler geri döner ve renk yavaş yavaş geri gelir. Ağarma çok uzun sürerse mercan aç kalır, ölür ve üzerini
    <b>yosun</b> kaplar (yeşil-kahverengi). Balıklar yuva ve besin için canlı mercana bağlıdır.</p>
    <p>Su, kırmızı ışığı ilk birkaç metrede soğurur; bu yüzden derinde her şey mavi-yeşil görünür. Kıyıdan gelen kirlilik suyu
    bulandırır ve yeşile çevirir. Soldaki <b>termometre</b> suyun, normal yaz en yüksek sıcaklığından ne kadar sıcak olduğunu gösterir.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Deniz ısı dalgası</b>: önce hassas dallı ve masa mercanları ağarır, ardından iri beyin mercanları. Isı dalgası
        bitince kaç tanesi toparlandı, kaç tanesi yosunla kaplandı?</li>
      <li>Isı dalgası süresini kısalt (4 hafta) ya da uzat (16 hafta): <b>süre</b> de sıcaklık kadar önemli.</li>
      <li>Aynı ısı dalgasını <b>Koruma alanı</b> açıkken ve kapalıyken karşılaştır: koruma ağarmayı durduramaz ama
        toparlanmayı hızlandırır (daha çok otçul balık yosunu yer, yeni mercan yavruları tutunabilir).</li>
      <li>pH'yı <b>7,7</b>'ye indir: mercanlar ağarmasa bile çok yavaş büyür (aragonit doygunluğu Ω azalır).</li>
      <li>Bir mercana tıkla: türünü ve durumunu gör.</li>
    </ul>
    <h3>Model</h3>
    <p><b>Derece Isınma Haftası (DHW)</b>, NOAA Coral Reef Watch'ın kullandığı ısı stresi ölçüsüdür: suyun, o bölgenin normal
    en sıcak ay ortalamasını (MMM) <b>en az 1 °C</b> aştığı günlerdeki aşım miktarları son <b>12 hafta</b> boyunca toplanır
    (birimi °C-hafta). NOAA'ya göre <b>DHW ≈ 4</b>'te resif genelinde, özellikle hassas türlerde ağarma beklenir;
    <b>DHW ≥ 8</b>'de yaygın ağarma ve ısıya hassas mercanlarda ölüm olasıdır. Bu simülasyon DHW'yi aynı kuralla hesaplar;
    her mercanın tür ve bireye göre biraz farklı bir toleransı vardır.</p>
    <p>Asitlenme: CO₂ suda çözününce pH ve karbonat iyonu azalır; iskelet yapımı <b>aragonit doygunluğu Ω</b> ile yavaşlar
    (burada büyüme ∝ Ω − 1). Kıyıdan gelen besin/kirlilik yosunu besler, suyu bulandırır ve ısı toleransını düşürür.
    Kaynaklar: NOAA Coral Reef Watch (DHW ürün açıklaması); pH değerleri IPCC'nin yaklaşık değerleridir
    (sanayi öncesi ≈ 8,2, bugün ≈ 8,05; yüksek emisyonda 2100 ≈ 7,7).</p>
    <p><small>Sınırlar: Mevsim eğrisi, tolerans, ölüm ve toparlanma hızları, balık sayısı <b>temsilidir</b>; gerçek bir resifin
    verisi değildir. "2100 yüksek emisyon" hazır ayarı bir tahmin değil, olası bir durumu gösteren temsili bir senaryodur.
    Gerçekte toparlanma yıllar–on yıllar sürer; burada zaman sıkıştırılmıştır.</small></p>`,
});

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
sim.formatTime = () => { const w = model.week(); return `${Math.floor(w / 52) + 1}. yıl · ${MONTHS[Math.floor(((w % 52) / 52) * 12)]}`; };

const rnd = seeded(11);
const model = createModel(N, rnd);
const { c } = model;
const scene = sim.scene;

// --- Su altı ortamı ---
// Güneş ışığı su içinde yol alırken renk renk söner (açık tropikal su, yaklaşık soğurma katsayıları 1/m: turuncu-kırmızı ~600 nm 0,22 · Y 0,06 · M 0,035)
{
  const el = 64 * Math.PI / 180, thW = Math.asin(Math.cos(el) / 1.33);          // kırılan ışının düşeyle açısı
  const L = (SURF - 1.2) / Math.cos(thW);
  sim.sky.sunColor.multiply(new THREE.Color(Math.exp(-0.22 * L), Math.exp(-0.06 * L), Math.exp(-0.035 * L)));
}
const baseExposure = sim.sky.exposure.bind(sim.sky);
sim.sky.exposure = () => baseExposure() * 1.2;
const WATER = new THREE.Color(0x0a4862);
const uwFog = new THREE.FogExp2(WATER.getHex(), 0.03);
// Su altı ortam haritası: yukarıda parlak Snell penceresi, yanlarda turkuaz, aşağıda koyu mavi
const uwEnv = (() => {
  const es = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; void main(){
      float y = vD.y;
      vec3 deep = vec3(0.004, 0.03, 0.05), side = vec3(0.02, 0.16, 0.22), top = vec3(0.35, 0.75, 0.85);
      vec3 c = y < 0.0 ? mix(side, deep, smoothstep(0.0, -0.6, y)) : mix(side, side*1.6, smoothstep(0.0, 0.62, y));
      c = mix(c, top*1.8, smoothstep(0.62, 0.75, y));
      gl_FragColor = vec4(c, 1.0); }`,
  });
  es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m));
  const pm = new THREE.PMREMGenerator(sim.renderer);
  const t = pm.fromScene(es, 0.02).texture;
  pm.dispose();
  return t;
})();
scene.background = WATER.clone();
sim.sky.mesh.visible = false;
function applyUnderwater() {
  // gökyüzü ortamı ilk karede kendi haritasını pişirir; her karede su altı ayarlarını geri koy
  if (scene.environment !== uwEnv) scene.environment = uwEnv;
  if (scene.fog !== uwFog) scene.fog = uwFog;
  sim.sky.mesh.visible = false;
}
applyUnderwater();
const TIME = { value: 0 };
// Kostik: dalgalı yüzeyin odakladığı ışık ağı (iki kayan sırtlı gürültü katmanı); yalnız yukarı bakan yüzlerde
const CAUSTIC = /* glsl */ `
  float causAt(vec2 q){
    float r1 = 1.0 - abs(vn3(vec3(q*1.7, uT*0.55))*2.0 - 1.0);
    float r2 = 1.0 - abs(vn3(vec3(q*2.5 + 7.0, uT*0.45 + 4.0))*2.0 - 1.0);
    float k = 1.0 - smoothstep(0.25, 0.7, length(fwidth(q))*2.5);    // uzakta ortalamaya sön (titreşmesin)
    return (pow(r1, 9.0)*0.7 + pow(r2, 12.0)*0.6)*k + 0.1*(1.0 - k);
  }`;

// --- Deniz tabanı: kum dalgacıkları, moloz lekeleri, kostik ---
function hashN(x, z) { return Math.sin(x * 12.9898 + z * 78.233) * 43758.5453 % 1; }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t), u = s(xf), v = s(zf);
  const a = hashN(xi, zi), b = hashN(xi + 1, zi), c2 = hashN(xi, zi + 1), d = hashN(xi + 1, zi + 1);
  return (a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d) * u * v);
}
// Arka planda resif duvarı (z ≈ −12 … −16 m'de ≈3–5 m yükselen, mahmuz-oluk girintili yamaç); önde alçak resif tepesi
const wallH = (x, z) => (3.0 + 1.4 * vnoise(x * 0.13 + 20, 3.3) + 0.7 * Math.sin(x * 0.42 + 1.1) * Math.sin(x * 0.17))
  * smoothstep(-11.5, -15.5, z + 1.6 * vnoise(x * 0.21, 7.7));
const reefH = (x, z) => 1.3 * Math.exp(-(x * x + z * z) / 110) + vnoise(x * 0.12 + 50, z * 0.12 + 50) * 1.0 - 0.5 + vnoise(x * 0.5, z * 0.5) * 0.14 + wallH(x, z);
const sandMat = procedural({
  key: 'mercan-sand', bump: 0.012, params: { color: 0xcbbc98, roughness: 0.95 }, uniforms: { uT: TIME },
  pattern: /* glsl */ `
    float wv = sin(p.x*7.0 + p.z*2.2 + 3.0*fbm3(p*0.4, 3));
    float rip = smoothstep(-0.2, 1.0, wv);
    float grain = vn3(p*60.0), pch = fbm3(p*0.18, 4), rub = smoothstep(0.58, 0.72, fbm3(p*0.9 + 4.0, 4));
    col *= 0.86 + 0.12*rip + 0.08*grain;
    // ince çapraz dalgacıklar ve kum taneleri: açık renkli kabuk kırıntısı, koyu mineral tane
    float rip2 = sin(p.x*17.0 - p.z*6.0 + 2.5*fbm3(p*1.1, 3));
    col *= 0.95 + 0.06*rip2;
    float shell = 1.0 - smoothstep(0.07, 0.16, cells3(p*26.0)), darkG = 1.0 - smoothstep(0.05, 0.12, cells3(p*31.0 + 7.3));
    col = mix(col, vec3(0.93, 0.9, 0.82), shell*0.45);
    col *= 1.0 - 0.3*darkG;
    col = mix(col, col*vec3(0.62, 0.6, 0.55), smoothstep(0.55, 0.75, pch)*0.6);
    col = mix(col, vec3(0.42, 0.4, 0.34), rub*0.55);                                  // mercan molozu
    float peb = cells3(p*9.0);
    h = rip*0.6 + rip2*0.15 + grain*0.2 + rub*(0.4 + 0.6*peb) + shell*0.3;
    col *= 1.0 - rub*0.25*(1.0 - peb);
    // arka plandaki resif duvarı: kireçli alg kabuklu, çim alg lekeli, oyuklu resif kayası
    float wallF = 1.0 - smoothstep(-13.2, -10.8, p.z + 1.4*fbm3(p*0.3, 3));
    vec3 rk = vec3(0.5, 0.47, 0.4)*(0.6 + 0.6*fbm3(p*1.3, 4));
    rk = mix(rk, vec3(0.64, 0.36, 0.44), smoothstep(0.55, 0.7, fbm3(p*2.0 + 3.0, 3))*0.7);
    rk = mix(rk, vec3(0.3, 0.34, 0.16), smoothstep(0.5, 0.75, vn3(p*0.8 + 9.0))*0.6);
    float pit = cells3(p*2.6);
    rk *= 0.6 + 0.5*pit;
    col = mix(col, rk, wallF);
    h = mix(h, pit*0.8 + fbm3(p*4.0, 3)*0.4, wallF);
    col *= 1.0 + 1.7*causAt(p.xz)*max(pn.y, 0.0);`,
});
{
  const inject = (m) => { const ob = m.onBeforeCompile; m.onBeforeCompile = (sh, r) => { ob(sh, r); sh.fragmentShader = sh.fragmentShader.replace('void pattern(', CAUSTIC + '\nvoid pattern('); }; };
  inject(sandMat);
  sandMat.userData.inject = inject;
  const g = new THREE.PlaneGeometry(260, 260, LOW ? 150 : 220, LOW ? 150 : 220);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z);
    pos.setY(i, reefH(x, z) - Math.max(0, r - 40) * 0.12);   // uzakta resif eteği derine iner
  }
  g.computeVertexNormals();
  const floor = new THREE.Mesh(g, sandMat);
  floor.userData.noCast = true; floor.userData.noFit = true;
  scene.add(floor);
}
const injectCaustic = sandMat.userData.inject;
// Kayalar: kireçtaşı / ölü mercan blokları, pembe kabuklu kireçli alg ve çim alg lekeleri
{
  // indeksli (birleşik köşe) → yumuşak normaller; çok katlı gürültüyle oyuklu, çıkıntılı kaya
  let rg = new THREE.IcosahedronGeometry(1, LOW ? 3 : 4);
  rg.deleteAttribute('normal'); rg.deleteAttribute('uv');
  rg = BufferGeometryUtils.mergeVertices(rg);
  const rn = new ImprovedNoise(), p = rg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.2 * Math.sin(x * 3.1 + z * 1.7) * Math.cos(y * 2.3 + x) + 0.16 * rn.noise(x * 2.2, y * 2.2, z * 2.2)
      + 0.07 * rn.noise(x * 5.5 + 3, y * 5.5, z * 5.5) - 0.06 * Math.abs(rn.noise(x * 9, y * 9 + 5, z * 9));
    p.setXYZ(i, x * k, y * k, z * k);
  }
  rg.computeVertexNormals();
  const rockMat = procedural({
    key: 'mercan-rock', bump: 0.03, params: { color: 0x8a8272, roughness: 0.95 }, uniforms: { uT: TIME },
    pattern: /* glsl */ `
      float n = fbm3(p*1.6 + seed*7.0, 4), f = vn3(p*14.0), pit = cells3(p*6.0);
      col *= 0.7 + 0.35*n + 0.1*f;
      col = mix(col, vec3(0.62, 0.36, 0.42), smoothstep(0.55, 0.7, fbm3(p*2.2 + 3.0, 3))*0.8);   // kabuklu kireçli alg
      col = mix(col, vec3(0.3, 0.33, 0.16), smoothstep(0.5, 0.75, n)*smoothstep(0.2, 0.8, pn.y)*0.7); // çim alg
      h = n*0.6 + pit*0.5; rough = 0.9;
      col *= 1.0 + 2.0*causAt(p.xz*1.3)*max(pn.y, 0.0);`,
  });
  injectCaustic(rockMat);
  const WR = LOW ? 22 : 40;   // resif duvarındaki iri bloklar
  const rocks = instanced(rg, rockMat, 30 + WR);
  rocks.name = 'reef-rocks'; rocks.castShadow = rocks.receiveShadow = true;
  const o = new THREE.Object3D(), r = seeded(5);
  for (let i = 0; i < 30 + WR; i++) {
    const wall = i >= 30, a = r() * TAU, d = 3.5 + r() * 17;
    const x = wall ? (r() - 0.5) * 40 : Math.cos(a) * d, z = wall ? -12 - r() * 6 : Math.sin(a) * d;
    o.position.set(x, reefH(x, z) - 0.25, z);
    if (wall) o.scale.set(1.2 + r() * 2.2, 0.8 + r() * 1.4, 1.0 + r() * 1.6);
    else o.scale.set(0.6 + r() * 1.5, 0.35 + r() * 0.7, 0.6 + r() * 1.2);
    o.rotation.set(r() * 0.3, r() * 6, r() * 0.3);
    o.updateMatrix();
    rocks.setMatrixAt(i, o.matrix);
  }
  scene.add(rocks);
}

// --- Mercan geometrileri (yükseklik ≈ 1 birim; boy örnek ölçeğiyle) ---
// Gerçek büyüme biçimleri: dallı Acropora (rastgele dallanan, uçları açık renkli borular), beyin mercanı (kıvrımlı oluklu
// yarım küre, oluklar geometride), masa mercanı (düzensiz loblu tabla + üstünde dikine dalcıklar), tüp mercan (eğri, ağzı
// genişleyen borular). Her türün 2–3 biçim çeşidi var; renk çarpanı köşe rengi olarak (uç/oluk/alt yüz).
const Y = new THREE.Vector3(0, 1, 0);
function withColor(g, f) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const p = g.attributes.position, a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = f(p.getX(i), p.getY(i), p.getZ(i), i); a[i * 3] = a[i * 3 + 1] = a[i * 3 + 2] = k; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// Eğri eksenli, yarıçapı boyunca değişen boru (ağzı açık). rad(t), shade(t) ; t = 0 (dip) … 1 (uç)
function pathTube(pts, rad, shade, tubular = 6, radial = 7, bumps = 0) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, tubular, 1, radial, false), p = g.attributes.position;
  const ctr = [];
  for (let i = 0; i <= tubular; i++) ctr.push(curve.getPointAt(i / tubular));
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) for (let j = 0; j <= radial; j++) {
    const k = i * (radial + 1) + j, t = i / tubular;
    v.fromBufferAttribute(p, k).sub(ctr[i]);
    const b = bumps ? 1 + bumps * Math.sin(j * 2.1 + i * 1.7) * Math.sin(i * 0.9 + j) : 1;
    v.multiplyScalar(rad(t) * b).add(ctr[i]);
    p.setXYZ(k, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return withColor(g, (x, y, z, k) => shade(Math.floor(k / (radial + 1)) / tubular));
}
const bend = (a, dir, len, r, amt = 0.25) => {   // a noktasından dir yönünde hafif kıvrık 3 noktalı eksen
  const side = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).cross(dir).normalize().multiplyScalar(len * amt * (r() - 0.3));
  const m = a.clone().addScaledVector(dir, len * 0.5).add(side);
  return [a.clone(), m, a.clone().addScaledVector(dir, len).add(side.multiplyScalar(0.4))];
};
function branchingGeo(seed, style) {   // Acropora: 'geyik' (staghorn, açık dallı) | 'calı' (corymbose, sık ve basık)
  const parts = [], r = seeded(seed);
  const bushy = style === 'cali';
  const br = (p, dir, len, rad, depth, t0) => {
    const pts = bend(p, dir, len, r, bushy ? 0.12 : 0.28);
    const tip = depth === 0;
    const t1 = t0 + (1 - t0) * (bushy ? 0.3 : 0.34);
    parts.push(pathTube(pts, (t) => rad * (1 - 0.3 * t) * (tip && t > 0.8 ? 1 - (t - 0.8) * 1.6 : 1),
      (t) => (tip ? 0.8 + 0.9 * smoothstep(0.35, 1, t) : 0.62 + 0.3 * lerpT(t0, t1, t)), 3, 5));
    const end = pts[2], nd0 = end.clone().sub(pts[1]).normalize();
    if (tip) { parts.push(withColor(new THREE.SphereGeometry(rad * 0.5, 5, 3).translate(end.x, end.y, end.z), () => 1.75)); return; }
    const k = bushy ? 2 + (r() < 0.6 ? 1 : 0) : 2 + (r() < 0.3 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const axis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).cross(nd0).normalize();
      const nd = nd0.clone().applyAxisAngle(axis, (bushy ? 0.3 : 0.4) + r() * 0.45).lerp(Y, bushy ? 0.45 : 0.2).normalize();
      const at = i === 0 ? end : pts[1].clone().lerp(end, 0.5 + r() * 0.5);   // yan dallar gövdenin ortasından da çıkar
      br(at, nd, len * (0.66 + r() * 0.22), rad * 0.74, depth - 1, t1);
    }
  };
  const nMain = bushy ? 9 : 7, DEP = LOW ? 2 : 3;
  for (let k = 0; k < nMain; k++) {
    const a = (k / nMain) * TAU + r() * 0.5, tilt = bushy ? 0.35 + r() * 0.7 : 0.2 + r() * 0.6;
    const d = new THREE.Vector3(Math.sin(tilt) * Math.cos(a), Math.cos(tilt), Math.sin(tilt) * Math.sin(a));
    br(new THREE.Vector3(Math.cos(a) * 0.05, 0.0, Math.sin(a) * 0.05), d, bushy ? 0.2 + r() * 0.06 : 0.3 + r() * 0.12, bushy ? 0.045 : 0.06, DEP, 0);
  }
  parts.push(withColor(new THREE.SphereGeometry(0.16, 10, 6).scale(1, 0.45, 1), () => 0.55));
  const g = BufferGeometryUtils.mergeGeometries(parts);
  g.computeBoundingBox();
  const s = 1 / g.boundingBox.max.y;   // yükseklik ≈ 1
  return g.scale(s * (bushy ? 1.3 : 1), s * (bushy ? 0.72 : 1), s * (bushy ? 1.3 : 1));
}
function lerpT(a, b, t) { return a + (b - a) * t; }
const brainNoise = new ImprovedNoise();
function brainGeo(seed, flat) {   // beyin mercanı: yarım küre + menderes oluklar (gürültü eş-yükselti çizgileri → gerçek oyuk)
  let g = new THREE.SphereGeometry(0.7, LOW ? 96 : 150, LOW ? 56 : 84, 0, TAU, 0, Math.PI * 0.6);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = BufferGeometryUtils.mergeVertices(g);   // dikiş ve kutup köşeleri birleşir: oluklarda dikiş izi yok
  const p = g.attributes.position;
  const shade = new Float32Array(p.count), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const lump = 1 + 0.07 * brainNoise.noise(n.x * 1.6 + seed, n.y * 1.6, n.z * 1.6) + 0.03 * brainNoise.noise(n.x * 4 + seed, n.y * 4, n.z * 4);
    // menderes: iki katlı gürültünün eş-yükselti çizgileri (sırt), aralarında oluk (vadi)
    const q = brainNoise.noise(n.x * 2.4 + seed * 3, n.y * 2.4 + 7, n.z * 2.4) + 0.35 * brainNoise.noise(n.x * 5.1, n.y * 5.1 + seed, n.z * 5.1);
    const f = Math.abs(((q * 7.5) % 1 + 1) % 1 - 0.5) * 2;              // 0 sırt ortası … 1 oluk
    const ridge = 1 - smoothstep(0.4, 0.8, f);
    const k = lump * (1 + 0.05 * ridge - 0.018);
    p.setXYZ(i, v.x * k, (v.y * k) * (flat ? 0.62 : 0.8), v.z * k);
    shade[i] = 0.3 + 0.8 * ridge + 0.12 * smoothstep(0.1, 0.5, v.y);
  }
  g.computeVertexNormals();
  g.translate(0, -0.1, 0);
  const ca = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) ca[i * 3] = ca[i * 3 + 1] = ca[i * 3 + 2] = shade[i];
  g.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  return g;   // tek parça: indeksli kalır (yüksek çözünürlüklü oluklar ucuz)
}
function tableGeo(seed, tiers) {   // masa mercanı (Acropora hyacinthus): eğik gövde, düzensiz loblu tabla, üstte dikine dalcıklar
  const r = seeded(seed), parts = [];
  const plate = (cx, cy, cz, R, tilt) => {
    const NR = 14, NA = 72, pos = [], idx = [], sh = [];
    const lob = [r() * TAU, r() * TAU, r() * TAU];
    const edge = (a) => R * (1 + 0.11 * Math.sin(a * 3 + lob[0]) + 0.07 * Math.sin(a * 7 + lob[1]) + 0.05 * Math.sin(a * 13 + lob[2]));
    for (const side of [1, -1]) {       // üst yüz ve alt yüz (alt yüz koyu)
      const base = pos.length / 3;
      for (let i = 0; i <= NR; i++) for (let j = 0; j <= NA; j++) {
        const a = (j / NA) * TAU, t = i / NR, rr = edge(a) * t;
        const y = 0.07 * t * t * R + 0.035 * smoothstep(0.8, 1, t) * R + tilt * Math.cos(a) * rr + 0.006 * Math.sin(a * 9 + t * 7) - (side < 0 ? 0.03 * (1 - 0.85 * t) : 0);
        pos.push(cx + Math.cos(a) * rr, cy + y, cz + Math.sin(a) * rr);
        sh.push(side > 0 ? 0.8 + 0.45 * smoothstep(0.55, 1, t) : 0.42 + 0.15 * t);
      }
      for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
        const a0 = base + i * (NA + 1) + j, b = a0 + 1, c0 = a0 + NA + 1, d = c0 + 1;
        if (side > 0) idx.push(a0, b, c0, b, d, c0); else idx.push(a0, c0, b, b, c0, d);
      }
    }
    // kenar şeridi (kalınlık)
    const top0 = NR * (NA + 1), bot0 = (NR + 1) * (NA + 1) + NR * (NA + 1);
    for (let j = 0; j < NA; j++) idx.push(top0 + j, top0 + j + 1, bot0 + j, top0 + j + 1, bot0 + j + 1, bot0 + j);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const shArr = sh;
    parts.push(withColor(g, (x, y, z, i) => shArr[g.index.array[i]]));
    // üst yüzde dikine dalcıklar (uçları açık)
    const nub = LOW ? 90 : 220;
    for (let k = 0; k < nub; k++) {
      const a = r() * TAU, t = Math.sqrt(0.04 + r() * 0.96), rr = edge(a) * t * 0.97;
      const y = 0.07 * t * t * R + 0.035 * smoothstep(0.8, 1, t) * R + tilt * Math.cos(a) * rr;
      const L = (0.03 + r() * 0.04) * (1 + 0.8 * smoothstep(0.8, 1, t));
      const cg = new THREE.CylinderGeometry(0.006, 0.013, L, 5, 1, true).translate(0, L / 2, 0)
        .rotateZ((r() - 0.5) * 0.5 - 0.35 * t * Math.cos(a)).rotateX((r() - 0.5) * 0.5 + 0.35 * t * Math.sin(a))
        .translate(cx + Math.cos(a) * rr, cy + y, cz + Math.sin(a) * rr);
      parts.push(withColor(cg, (x, yy) => 0.85 + 0.8 * smoothstep(cy + y + L * 0.3, cy + y + L, yy)));
    }
  };
  const top = 0.34 + r() * 0.14, ox = (r() - 0.5) * 0.18, oz = (r() - 0.5) * 0.18;
  // gövde: dipte kök yayılımı, yukarı doğru hafif eğik
  parts.push(pathTube([new THREE.Vector3(0, -0.02, 0), new THREE.Vector3(ox * 0.3, top * 0.45, oz * 0.3), new THREE.Vector3(ox, top, oz)],
    (t) => 0.1 - 0.045 * t + 0.07 * Math.max(0, 1 - t * 4), () => 0.55, 6, 10, 0.08));
  for (let k = 0; k < 3; k++) {
    const a = r() * TAU;
    parts.push(pathTube([new THREE.Vector3(Math.cos(a) * 0.25, -0.02, Math.sin(a) * 0.25), new THREE.Vector3(Math.cos(a) * 0.12, 0.12, Math.sin(a) * 0.12), new THREE.Vector3(ox * 0.3, 0.3, oz * 0.3)],
      (t) => 0.05 - 0.02 * t, () => 0.5, 4, 6));
  }
  plate(ox, top, oz, 0.95, 0.04 * (r() - 0.5));
  if (tiers) plate(ox + 0.3, top + 0.2, oz - 0.25, 0.6, 0.05);
  return BufferGeometryUtils.mergeGeometries(parts);
}
function tubeCluster(seed, { n, h0, h1, r0, flare, spread, bumps, dark = 0.3, lipC = 1.25 }) {   // eğri, ağzı genişleyen boru demeti
  const parts = [], r = seeded(seed);
  for (let k = 0; k < n; k++) {
    const a = r() * TAU, d = k ? spread * (0.35 + r() * 0.65) : 0, L = h0 + r() * (h1 - h0);
    const lean = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(d * 1.1 + 0.08 * (r() - 0.5));
    const b = new THREE.Vector3(Math.cos(a) * d * 0.4, 0, Math.sin(a) * d * 0.4);
    const pts = [b, b.clone().add(new THREE.Vector3(0, L * 0.5, 0)).addScaledVector(lean, 0.35 * L),
      b.clone().add(new THREE.Vector3(0, L, 0)).addScaledVector(lean, 0.6 * L)];
    const rr = r0 * (0.75 + r() * 0.5);
    const R = (t) => rr * (0.85 + 0.15 * t + flare * smoothstep(0.75, 1, t) ** 2);
    parts.push(pathTube(pts, R, (t) => 0.7 + 0.35 * t, 12, 14, bumps));
    parts.push(pathTube(pts, (t) => R(t) * 0.78, () => dark, 6, 12));            // iç cidar (koyu)
    // dudak: dış ve iç ağız arasında halka
    const c = new THREE.CatmullRomCurve3(pts), e = c.getPointAt(1), tg = c.getTangentAt(1);
    const lip = new THREE.RingGeometry(R(1) * 0.78, R(1), 14).rotateX(-Math.PI / 2)
      .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, tg)).translate(e.x, e.y, e.z);
    parts.push(withColor(lip, () => lipC));
  }
  return BufferGeometryUtils.mergeGeometries(parts);
}
// Mercan dokuları: polip gözenekleri (korallit), tabla çizgileri; tepe yüzlerde kostik
const coralMat = (key, pattern, bump = 0.006) => {
  const m = procedural({
    key, physical: true, bump, uniforms: { uT: TIME },
    params: { color: 0xffffff, vertexColors: true, roughness: 0.78, side: THREE.DoubleSide, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff) },
    pattern: pattern + '\n col *= 1.0 + 2.2*causAt(p.xz*1.6)*max(pn.y, 0.0);',
  });
  injectCaustic(m);
  return m;
};
// Renkler: sağlıklı mercan dokusundaki zooksantel + konak pigmentleri → kahve, hardal-sarı, mor, pembe, yeşil, mavi uçlar
const TYPES = [
  { name: 'Dallı mercan (Acropora)', note: 'ısıya en hassas türlerden', base: 1.35,
    geos: [branchingGeo(21, 'geyik'), branchingGeo(44, 'cali'), branchingGeo(63, 'geyik')],
    pal: [0x9c6a3e, 0xa65cb0, 0xd9829e, 0xc39a3e, 0x6a86cc, 0x8e5a36],
    mat: coralMat('mercan-branch2', 'float c = cells3(p*60.0); col *= 0.8 + 0.28*c; h = smoothstep(0.1, 0.55, c);', 0.008) },
  { name: 'Beyin mercanı', note: 'iri, ısıya daha dayanıklı', base: 1.3,
    geos: [brainGeo(1.3, false), brainGeo(7.7, true)],
    pal: [0xb08a3a, 0x8a9a3c, 0x9c6a44, 0xc2a456, 0x7a6a8e, 0xb07a58],
    mat: coralMat('mercan-brain2', 'float c = cells3(p*70.0), n = vn3(p*18.0); col *= (0.86 + 0.2*c)*(0.9 + 0.15*n); h = c*0.6 + n*0.4;', 0.006) },
  { name: 'Masa mercanı', note: 'hızlı büyür ama ısıya hassas', base: 1.35,
    geos: [tableGeo(5, false), tableGeo(17, true)],
    pal: [0x8e8a4e, 0xa88c56, 0x7c8c58, 0x9a7a4e, 0x6e9486],
    mat: coralMat('mercan-table2', 'float a = atan(p.z, p.x), rr = length(p.xz); float st = 0.5 + 0.5*sin(a*120.0 + rr*14.0); float c = cells3(p*80.0); col *= (0.86 + 0.14*st)*(0.86 + 0.22*c); h = st*0.4 + c*0.6;') },
  { name: 'Tüp mercan', note: 'orta düzeyde dayanıklı', base: 0.95,
    geos: [tubeCluster(8, { n: 9, h0: 0.35, h1: 0.8, r0: 0.075, flare: 0.35, spread: 0.3, bumps: 0.06 }),
      tubeCluster(29, { n: 6, h0: 0.25, h1: 0.55, r0: 0.09, flare: 0.5, spread: 0.22, bumps: 0.08 })],
    pal: [0xe8742e, 0xf0a030, 0xdc4a40, 0xd8586e],
    mat: coralMat('mercan-tube2', 'float rid = 0.5 + 0.5*sin(atan(p.z, p.x)*40.0); float c = cells3(p*55.0); col *= (0.85 + 0.2*rid)*(0.85 + 0.2*c); h = rid*0.4 + c*0.6;') },
];
// Her tür × biçim çeşidi ayrı InstancedMesh
const meshes = [], meshOf = [];
TYPES.forEach((T, t) => T.geos.forEach((g, v) => {
  const m = instanced(g, T.mat, N);
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  m.frustumCulled = false;
  m.castShadow = !LOW; m.receiveShadow = true;
  m.count = 0;
  scene.add(m);
  meshOf.push({ t, v }); meshes.push(m);
}));

// Koloni yerleşimi (tür, konum, dönüş, boy). 0. koloni: kameranın önünde iri bir beyin mercanı başı (ön plan).
// Kolonilerin ~%25'i arka plandaki resif duvarına.
const col = [];
{
  const r = seeded(3), types = [];
  const CAM = [4.6, 11.8];
  for (let i = 0; i < N; i++) {
    let x, z, tries = 0;
    const onWall = i > 0 && i % 4 === 3;
    do {
      if (onWall) { x = (r() - 0.5) * 34; z = -12.5 - r() * 7; }
      else { const a = r() * TAU, d = Math.sqrt(r()) * REEF_R; x = Math.cos(a) * d; z = Math.sin(a) * d * 0.8; }
      tries++;
    } while (tries < 60 && (col.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < (q.hero ? 5.5 : 1.6)) || (x - CAM[0]) ** 2 + (z - CAM[1]) ** 2 < 14));
    let type = r() < 0.34 ? 0 : r() < 0.4 ? 1 : r() < 0.5 ? 2 : 3;
    let s = TYPES[type].base * (0.75 + r() * 0.55);
    let hero = false;
    if (i === 0) { type = 1; x = 4.4; z = 7.3; s = 2.3; hero = true; }
    if (i === 1) { type = 0; x = 0.2; z = 6.2; s = 1.9; hero = true; }   // sol ön planda geyik boynuzu mercan çalılığı
    if (onWall) s *= 1.25;
    types.push(type);
    const v = hero ? 0 : Math.floor(r() * TYPES[type].geos.length);   // kahramanlar: yarım küre beyin, açık dallı geyik boynuzu
    col.push({ x, z, y: reefH(x, z) - 0.05, type, v, rot: r() * TAU, s, slot: 0, tint: r(), hero });
  }
  const counts = meshes.map(() => 0);
  col.forEach((q) => { q.mesh = meshOf.findIndex((o) => o.t === q.type && o.v === q.v); q.slot = counts[q.mesh]++; });
  meshes.forEach((m, k) => (m.count = counts[k]));
  model.init(types);
}

const cBleach = new THREE.Color(0xf4f2ea), cDead = new THREE.Color(0x8a8272), cAlgae = new THREE.Color(0x56642e), tc = new THREE.Color();
const qs = new THREE.Quaternion(), ax = new THREE.Vector3(1, 0, 0);
const mtx = new THREE.Matrix4(), q4 = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const tc0 = new THREE.Color();

// --- Resif dokusu (modele girmeyen eşlik eden canlılar): gorgon yelpazeleri, fıçı ve tüp süngerleri, moloz ---
// Yelpazeler resif geneli ağarma oranıyla solar (gorgonlar da ağarabilir); süngerler ağarmaz (fotosentetik ortakları yok).
const FAN_N = LOW ? 12 : 22, SPONGE_N = LOW ? 8 : 12, TSP_N = LOW ? 8 : 14;
// Gorgon yelpazesi: tek düzlemde dallanan ağ. Kalın ana kaburgalar 3B boru; ince dallar ve aralarındaki ağsı bağlar
// (anastomoz) aynı dallanmadan çizilen alfa dokulu düzlemde.
const fanSegs = [];
function fanGeo() {
  const parts = [], r = seeded(31);
  const br = (x, y, a, len, rad, depth) => {
    const dx = Math.sin(a), dy = Math.cos(a), ex = x + dx * len, ey = y + dy * len;
    fanSegs.push([x, y, ex, ey, rad, depth]);
    if (depth >= 4) {
      const g = new THREE.CylinderGeometry(rad * 0.75, rad, len, 5, 1, true).translate(0, len / 2, 0).rotateZ(-a).translate(x, y, 0);
      parts.push(withColor(g, () => 0.7 + 0.08 * (7 - depth)));
    }
    if (depth > 0) {
      const k = depth > 5 ? 2 : 2 + (r() < 0.45 ? 1 : 0);
      for (let i = 0; i < k; i++) br(ex, ey, a + (i - (k - 1) / 2) * (0.42 + r() * 0.3) + (r() - 0.5) * 0.25, len * (0.74 + r() * 0.12), rad * 0.74, depth - 1);
    }
  };
  br(0, 0, 0, 0.22, 0.04, 7);
  const g = BufferGeometryUtils.mergeGeometries(parts);
  let maxY = 0, minX = 0, maxX = 0;
  for (const s of fanSegs) { maxY = Math.max(maxY, s[1], s[3]); minX = Math.min(minX, s[0], s[2]); maxX = Math.max(maxX, s[0], s[2]); }
  const sc = 1 / maxY;
  g.scale(sc, sc, sc);
  fanSegs.forEach((s) => { for (const i of [0, 1, 2, 3, 4]) s[i] *= sc; });
  return { g, minX: minX * sc - 0.03, maxX: maxX * sc + 0.03, maxY: 1.03 };
}
const fanShape = fanGeo();
function spongeGeo() {       // fıçı süngeri (Xestospongia): kalın cidarlı vazo, dikey kaburgalar, iç yüz koyu
  const prof = [[0.18, 0], [0.34, 0.08], [0.42, 0.35], [0.46, 0.7], [0.47, 0.95], [0.44, 1.0], [0.36, 0.98], [0.34, 0.7], [0.28, 0.3], [0.1, 0.22], [0.001, 0.2]].map(([a, b]) => new THREE.Vector2(a, b));
  const g = new THREE.LatheGeometry(prof, 40), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.07 * Math.max(0, Math.sin(a * 14)) * Math.min(1, y * 3);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  const out = withColor(g, (x, y, z) => (Math.hypot(x, z) < 0.37 && y > 0.25 ? 0.45 : 0.8 + 0.3 * y));
  return out;
}

function fanNetGeo() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const cx = cv.getContext('2d'), W = fanShape.maxX - fanShape.minX, H = fanShape.maxY;
  const tx = (x) => ((x - fanShape.minX) / W) * S, ty = (y) => (1 - y / H) * S;
  cx.strokeStyle = '#fff'; cx.lineCap = 'round';
  const pts = [];
  for (const [x0, y0, x1, y1, rad, d] of fanSegs) {
    cx.lineWidth = Math.max(2.4, rad * S * 0.9 / W);
    cx.beginPath(); cx.moveTo(tx(x0), ty(y0)); cx.lineTo(tx(x1), ty(y1)); cx.stroke();
    if (d <= 3) pts.push([tx(x1), ty(y1)]);
  }
  // ağsı bağlar: ince dal noktalarını en yakın 2 komşusuna bağla (gerçek yelpazelerdeki kafes)
  cx.lineWidth = 2.2;
  const r = seeded(12);
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const near = pts.map((p, j) => [j, (p[0] - ax) ** 2 + (p[1] - ay) ** 2]).filter(([j, d]) => j !== i && d > 16).sort((a, b) => a[1] - b[1]).slice(0, 2);
    for (const [j, d] of near) { if (d > 34 * 34 || r() < 0.2) continue; cx.beginPath(); cx.moveTo(ax, ay); cx.lineTo(pts[j][0], pts[j][1]); cx.stroke(); }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const g = new THREE.PlaneGeometry(W, H).translate((fanShape.minX + fanShape.maxX) / 2, H / 2, 0);
  return { g, tex };
}
const fanNet = fanNetGeo();
const fanMat = coralMat('mercan-fan', 'float c = cells3(p*90.0); col *= 0.8 + 0.3*c; h = c;', 0.004);
const fanNetMat = procedural({
  key: 'mercan-fannet', physical: true, bump: 0.0,
  params: { color: 0xffffff, map: fanNet.tex, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.8, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff) },
  pattern: 'col *= 0.85 + 0.25*vn3(p*30.0);',
});
const spongeMat = procedural({
  key: 'mercan-sponge', bump: 0.02, uniforms: { uT: TIME },
  params: { color: 0xffffff, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide },
  pattern: 'float c = cells3(p*22.0), n = fbm3(p*3.0, 3); col *= 0.7 + 0.35*c + 0.15*n; h = c; col *= 1.0 + 1.2*causAt(p.xz*1.6)*max(pn.y, 0.0);',
});
injectCaustic(spongeMat);
const fans = instanced(fanShape.g, fanMat, FAN_N), fanNets = instanced(fanNet.g, fanNetMat, FAN_N), sponges = instanced(spongeGeo(), spongeMat, SPONGE_N);
// Tüp süngerler (Aplysina, Callyspongia): uzun, ince cidarlı, ağzı açık boru demetleri; mor, sarı, pembe, lavanta
const tubeSponges = instanced(tubeCluster(51, { n: 5, h0: 0.55, h1: 1.15, r0: 0.075, flare: 0.18, spread: 0.2, bumps: 0, dark: 0.35, lipC: 1.0 }), spongeMat, TSP_N);
for (const m of [fans, fanNets, sponges, tubeSponges]) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.count * 3), 3);
const fanList = [];
{
  const r = seeded(77), FAN_C = [0x8e3f8c, 0xc85a34, 0xd49a3a, 0x7a3a6e, 0xb8456e], SP_C = [0x8a4636, 0x6d5a86, 0xa0643a];
  const TS_C = [0x7a4fa0, 0xd8b030, 0xc86a9a, 0x8a7ac8, 0xd07a3a];
  const free = (x, z, d) => col.every((q) => (q.x - x) ** 2 + (q.z - z) ** 2 > d * d * (q.hero ? 3 : 1)) && fanList.every((f) => (f.x - x) ** 2 + (f.z - z) ** 2 > d * d);
  const spot = (i, dMin, dMax) => {   // her 3. örnek arka plandaki resif duvarında
    if (i % 3 === 2) return [(r() - 0.5) * 32, -12.5 - r() * 6.5];
    const a = r() * TAU, d = dMin + Math.sqrt(r()) * dMax; return [Math.cos(a) * d, Math.sin(a) * d * 0.8];
  };
  let tries = 0;
  while (fanList.length < FAN_N && tries++ < 900) {
    const [x, z] = spot(fanList.length, 4, 10);
    if (!free(x, z, 0.9)) continue;
    fanList.push({ x, z, y: reefH(x, z) - 0.05, rot: Math.PI / 2 + (r() - 0.5) * 0.6, s: (0.9 + r() * 0.8) * (z < -12 ? 1.4 : 1), ph: r() * TAU, c: new THREE.Color(FAN_C[fanList.length % FAN_C.length]) });
  }
  fans.count = fanNets.count = fanList.length;
  const o = new THREE.Object3D();
  for (const [mesh, n, colors, tall] of [[sponges, SPONGE_N, SP_C, false], [tubeSponges, TSP_N, TS_C, true]]) {
    let k = 0; tries = 0;
    while (k < n && tries++ < 900) {
      const [x, z] = spot(k, 3, 11);
      if (!free(x, z, 0.8)) continue;
      const s = tall ? 0.75 + r() * 0.6 : 0.6 + r() * 0.7;
      o.position.set(x, reefH(x, z) - 0.08, z); o.rotation.set((r() - 0.5) * 0.15, r() * TAU, (r() - 0.5) * 0.15);
      o.scale.set(s * (0.9 + r() * 0.3), s * (0.8 + r() * 0.6), s);
      o.updateMatrix(); mesh.setMatrixAt(k, o.matrix); mesh.setColorAt(k, tc0.setHex(colors[(k + (tall ? 0 : 1)) % colors.length]));
      fanList.push({ x, z, sponge: true });
      k++;
    }
    mesh.count = k;
  }
  for (const m of [fans, fanNets, sponges, tubeSponges]) { m.castShadow = !LOW; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
}
const fanPale = new THREE.Color(0xe9e4dc);
function drawFans(t, bleached) {
  let k = 0;
  for (const f of fanList) {
    if (f.sponge) continue;
    q4.setFromAxisAngle(up, f.rot).multiply(qs.setFromAxisAngle(ax, 0.06 * Math.sin(t * 0.9 + f.ph)));
    mtx.compose(pv.set(f.x, f.y, f.z), q4, sv.set(f.s, f.s, f.s));
    fans.setMatrixAt(k, mtx); fanNets.setMatrixAt(k, mtx);
    tc0.copy(f.c).lerp(fanPale, clamp(bleached, 0, 1) * 0.75);
    fans.setColorAt(k, tc0); fanNets.setColorAt(k, tc0);
    k++;
  }
  for (const m of [fans, fanNets]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
}
// Moloz: ölü mercan parçaları ve küçük kaya kırıntıları (resif eteğinde)
{
  const rg = new THREE.DodecahedronGeometry(1, 1), p = rg.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.25 * Math.sin(x * 4 + z * 3) * Math.cos(y * 5); p.setXYZ(i, x * k, y * k * 0.6, z * k); }
  rg.computeVertexNormals();
  const RN = LOW ? 160 : 320, rub = instanced(rg, scene.getObjectByName('reef-rocks')?.material || mat.rock({ color: 0x8a8272 }), RN);
  const o = new THREE.Object3D(), r = seeded(55);
  for (let i = 0; i < RN; i++) {
    const a = r() * TAU, d = 2 + Math.sqrt(r()) * 22, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.85, s = 0.08 + r() ** 2 * 0.5;
    o.position.set(x, reefH(x, z) - s * 0.25, z); o.rotation.set(r() * 3, r() * 6, r() * 3); o.scale.set(s, s * (0.6 + r() * 0.6), s * (0.7 + r() * 0.6));
    o.updateMatrix(); rub.setMatrixAt(i, o.matrix);
  }
  rub.receiveShadow = true; rub.castShadow = true;
  scene.add(rub);
}
// Kırık dal molozu: fırtına ve balık ısırığıyla kopmuş, ağarmış/yosunlanmış Acropora dal parçaları (kumda yatık)
{
  const sg = BufferGeometryUtils.mergeGeometries([
    new THREE.CylinderGeometry(0.011, 0.018, 0.2, 6, 2).translate(0, 0.1, 0),
    new THREE.CylinderGeometry(0.008, 0.012, 0.09, 5, 1).translate(0, 0.045, 0).rotateZ(0.6).translate(0, 0.12, 0),
  ].map((g) => g.toNonIndexed()));
  const stickMat = procedural({
    key: 'mercan-stick', bump: 0.01, params: { color: 0xbcb4a2, roughness: 0.9 },
    pattern: 'float c = cells3(p*70.0); col *= 0.72 + 0.38*c; col = mix(col, vec3(0.42, 0.45, 0.28), smoothstep(0.5, 0.8, fbm3(p*3.0 + seed*9.0, 3))*0.55); h = c;',
  });
  const SN = LOW ? 260 : 650, sticks = instanced(sg, stickMat, SN), o = new THREE.Object3D(), r = seeded(66);
  for (let i = 0; i < SN; i++) {
    const a = r() * TAU, d = 1.2 + Math.sqrt(r()) * 18, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.85, s = 0.6 + r() * 1.3;
    o.position.set(x, reefH(x, z) + 0.01, z); o.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.3, r() * TAU, (r() - 0.5) * 0.3, 'YXZ'); o.scale.setScalar(s);
    o.updateMatrix(); sticks.setMatrixAt(i, o.matrix);
  }
  sticks.receiveShadow = true; sticks.castShadow = !LOW;
  scene.add(sticks);
}
// --- Yumuşak mercanlar (Sinularia, parmaklı deri mercan) ve deniz şakayıkları (anemon) ---
// İkisinin de dokusunda zooksantel yaşar: resif ısındığında onlar da ağarır (beyazlar), bu yüzden renkleri resif geneli ağarma oranına bağlı.
const SOFT_N = LOW ? 10 : 16, ANEM_N = LOW ? 8 : 12;
function softGeo() {        // parmaklı deri mercan (Sinularia): alçak, loblu taban + uçları yuvarlak, açık renkli parmak demeti
  const r = seeded(73), parts = [];
  const base = new THREE.SphereGeometry(0.3, 20, 10, 0, TAU, 0, Math.PI * 0.5), bp = base.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i), a = Math.atan2(z, x);
    const k = 1 + 0.12 * Math.sin(a * 5 + 0.7) + 0.06 * Math.sin(a * 11);
    bp.setXYZ(i, x * k, y * 0.55, z * k);
  }
  base.computeVertexNormals();
  parts.push(withColor(base, () => 0.7));
  for (let k = 0; k < 22; k++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.24, L = 0.12 + r() * 0.2;
    const b0 = new THREE.Vector3(Math.cos(a) * d, 0.1 + 0.06 * (1 - d / 0.3), Math.sin(a) * d);
    const dir = new THREE.Vector3(Math.cos(a) * (0.2 + d * 1.6), 1, Math.sin(a) * (0.2 + d * 1.6)).normalize();
    const pts = bend(b0, dir, L, r, 0.3), rad = 0.03 + r() * 0.02;
    parts.push(pathTube(pts, (t) => rad * (1 - 0.15 * t), (t) => 0.75 + 0.35 * t, 4, 8, 0.05));
    const e = pts[2];
    parts.push(withColor(new THREE.SphereGeometry(rad * 0.86, 8, 5).translate(e.x, e.y, e.z), () => 1.15));
  }
  return BufferGeometryUtils.mergeGeometries(parts);
}
function anemoneGeo() {     // deniz şakayığı: kısa gövde, ağız diski, uçları açık renkli dokunaç demeti
  const parts = [withColor(new THREE.CylinderGeometry(0.2, 0.16, 0.14, 16, 1).translate(0, 0.07, 0), () => 0.55),
    withColor(new THREE.CircleGeometry(0.2, 16).rotateX(-Math.PI / 2).translate(0, 0.141, 0), () => 0.6)];
  const r = seeded(19);
  for (let k = 0; k < 90; k++) {
    const rr = 0.05 + Math.sqrt(r()) * 0.16, a = r() * TAU, L = 0.13 + r() * 0.09;
    const g = new THREE.CylinderGeometry(0.005, 0.013, L, 5, 3).translate(0, L / 2, 0);
    const q = g.attributes.position;
    for (let i = 0; i < q.count; i++) { const y = q.getY(i); q.setX(i, q.getX(i) + 0.35 * y * y / L); }   // dışa kıvrılır
    g.computeVertexNormals();
    g.rotateZ(-(0.25 + rr * 3.2)).rotateY(-a).translate(Math.cos(a) * rr, 0.14, Math.sin(a) * rr);
    parts.push(withColor(g, (x, y) => 0.75 + 0.6 * smoothstep(0.17, 0.3, y)));
  }
  return BufferGeometryUtils.mergeGeometries(parts);
}
const softMat = coralMat('mercan-soft2', 'float c = cells3(p*140.0), f = vn3(p*260.0); col *= (0.78 + 0.3*c)*(0.92 + 0.12*f); h = c*0.7 + f*0.3;', 0.004);   // yüzeyde sık polip tüyleri
const anemMat = coralMat('mercan-anem', 'col *= 0.9 + 0.15*vn3(p*40.0);', 0.0);
const softs = instanced(softGeo(), softMat, SOFT_N), anems = instanced(anemoneGeo(), anemMat, ANEM_N);
for (const m of [softs, anems]) {
  m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.count * 3), 3);
  m.castShadow = m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
}
const softList = [];
{
  const r = seeded(91), SOFT_C = [0xb89a58, 0x8e9a52, 0xc98a8a, 0xa88a62], ANEM_C = [0xd8c078, 0xc07ab0, 0x9ec27a, 0xe08a6a];
  const free = (x, z, d) => col.every((q) => (q.x - x) ** 2 + (q.z - z) ** 2 > d * d) && fanList.every((f) => (f.x - x) ** 2 + (f.z - z) ** 2 > d * d)
    && softList.every((f) => (f.x - x) ** 2 + (f.z - z) ** 2 > d * d);
  for (const [n, anem] of [[SOFT_N, false], [ANEM_N, true]]) {
    let k = 0, tries = 0;
    while (k < n && tries++ < 900) {
      // öne (kameraya bakan yüze) ağırlık ver: yakın planda yumuşak mercan ve anemonlar okunsun
      const a = r() < 0.6 ? Math.PI * (0.2 + r() * 0.6) : r() * TAU, d = 2.5 + Math.sqrt(r()) * 9.5, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8;
      if (!free(x, z, 0.75)) continue;
      const s = anem ? 0.9 + r() * 0.5 : 0.8 + r() * 0.8;
      softList.push({ x, z, y: reefH(x, z) - 0.04, s, rot: r() * TAU, ph: r() * TAU, anem, k, c: new THREE.Color((anem ? ANEM_C : SOFT_C)[k % 4]) });
      k++;
    }
    (anem ? anems : softs).count = k;
  }
}
const softPale = new THREE.Color(0xf2efe6);
function drawSoft(t, bleached) {
  const b = clamp(bleached, 0, 1) * 0.85;
  for (const f of softList) {
    const m = f.anem ? anems : softs, w = (f.anem ? 0.09 : 0.03) * Math.sin(t * 0.8 + f.ph);
    q4.setFromAxisAngle(up, f.rot).multiply(qs.setFromAxisAngle(ax, w));
    mtx.compose(pv.set(f.x, f.y, f.z), q4, sv.set(f.s, f.s * (1 + (f.anem ? 0.05 * Math.sin(t * 0.5 + f.ph) : 0)), f.s));
    m.setMatrixAt(f.k, mtx);
    m.setColorAt(f.k, tc0.copy(f.c).lerp(softPale, b));
  }
  for (const m of [softs, anems]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
}
function drawCorals() {
  for (let i = 0; i < N; i++) {
    const q = col[i], T = TYPES[q.type], mesh = meshes[q.mesh];
    tc.setHex(T.pal[q.hero ? 0 : Math.floor(c.hue[i] * T.pal.length) % T.pal.length]);
    let sway = 0;
    if (c.dead[i]) {
      tc.copy(cDead).lerp(cAlgae, c.algae[i]);
    } else {
      tc.lerp(cBleach, clamp(c.b[i] * 1.05, 0, 1));
      if (q.type === 3) sway = Math.sin(sim.time * 1.3 + q.x) * 0.04;
    }
    const s = q.s * (0.3 + 0.7 * c.size[i]) * (c.dead[i] ? 0.92 : 1);
    q4.setFromAxisAngle(up, q.rot);
    if (sway) q4.multiply(qs.setFromAxisAngle(ax, sway));
    mtx.compose(pv.set(q.x, q.y, q.z), q4, sv.set(s, s, s));
    mesh.setMatrixAt(q.slot, mtx);
    mesh.setColorAt(q.slot, tc);
  }
  meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; });
}

// --- Balıklar: yanlardan basık gövde, çatal kuyruk, sırt yüzgeci; sırt koyu, karın açık ---
function fishGeo() {
  const body = new THREE.SphereGeometry(0.5, 16, 10);
  body.scale(0.42, 0.24, 0.075);
  const tail = new THREE.BufferGeometry();
  tail.setAttribute('position', new THREE.Float32BufferAttribute([-0.19, 0, 0, -0.33, 0.1, 0, -0.29, 0, 0, -0.19, 0, 0, -0.29, 0, 0, -0.33, -0.1, 0], 3));
  const dors = new THREE.BufferGeometry();
  dors.setAttribute('position', new THREE.Float32BufferAttribute([0.1, 0.1, 0, -0.14, 0.08, 0, -0.08, 0.17, 0, 0.02, -0.1, 0, -0.1, -0.08, 0, -0.08, -0.14, 0], 3));
  [tail, dors].forEach((g) => g.computeVertexNormals());
  const shade = (x, y) => 1.2 - 0.65 * smoothstep(-0.03, 0.09, y);   // sırt koyu, karın açık (ters gölgeleme)
  return BufferGeometryUtils.mergeGeometries([withColor(body, shade), withColor(tail, () => 0.8), withColor(dors, () => 0.7)]);
}
const fishMat = procedural({
  key: 'mercan-fish', physical: true, params: { color: 0xffffff, vertexColors: true, roughness: 0.35, side: THREE.DoubleSide, sheen: 0.3, iridescence: 0.25 },
  pattern: 'col *= 0.9 + 0.15*vn3(p*60.0 + seed*9.0);',
});
const fishMesh = instanced(fishGeo(), fishMat, MAXF);
fishMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXF * 3), 3);
fishMesh.frustumCulled = false;
scene.add(fishMesh);
// Sürüler: boy (m), gövde oranı (L uzunluk / D yükseklik çarpanı) ve pay (ağırlık) türe göre farklı
const SCHOOLS = [
  { color: 0xf2d02a, r: 9, y: 3.0, w: 0.22, size: 0.52, L: 0.95, D: 1.35, wt: 1 },     // sarı cerrah balığı (yüksek gövdeli)
  { color: 0x4f8fd0, r: 12, y: 4.2, w: -0.16, size: 0.27, L: 1, D: 1.05, wt: 2 },     // mavi kromis (küçük, kalabalık)
  { color: 0xf08a4a, r: 6, y: 2.2, w: 0.3, size: 0.24, L: 1.05, D: 1, wt: 2 },        // turuncu antias
  { color: 0x9a78c8, r: 14, y: 5.0, w: 0.12, size: 0.3, L: 1.1, D: 0.95, wt: 1.2 },  // mor antias
  { color: 0x7ad0a8, r: 8, y: 4.6, w: -0.25, size: 0.27, L: 1, D: 1.05, wt: 1.5 },    // yeşil kromis
  { color: 0xd8dde0, r: 11, y: 2.6, w: 0.19, size: 0.72, L: 1.3, D: 0.7, wt: 0.6 },   // gümüş iskarmoz (uzun, ince)
  { color: 0x3fa89a, r: 7, y: 1.9, w: -0.1, size: 0.95, L: 1.15, D: 1.05, wt: 0.12 }, // papağan balığı (iri, az)
  { color: 0xe8e0c8, r: 5, y: 1.6, w: 0.35, size: 0.38, L: 0.9, D: 1.5, wt: 0.3 },     // kelebek balığı (yassı, yüksek)
];
const WSUM = SCHOOLS.reduce((a, b) => a + b.wt, 0);
const fish = [];
{
  const r = seeded(9);
  for (let i = 0; i < MAXF; i++) {
    let u = ((i * 0.618034) % 1) * WSUM, s = 0;
    while (u > SCHOOLS[s].wt && s < SCHOOLS.length - 1) { u -= SCHOOLS[s].wt; s++; }
    fish.push({ s, ph: r() * TAU, dr: (r() - 0.5) * 3, dy: (r() - 0.5) * 1.6, spd: 0.85 + r() * 0.3, sc: SCHOOLS[s].size * (0.65 + r() * 0.7) });
    fishMesh.setColorAt(i, tc.setHex(SCHOOLS[s].color).offsetHSL((r() - 0.5) * 0.05, 0, (r() - 0.5) * 0.12));
  }
}
const eul = new THREE.Euler();
function drawFish(t) {
  const n = Math.min(MAXF, Math.round(model.fish));
  for (let i = 0; i < n; i++) {
    const f = fish[i], S = SCHOOLS[f.s];
    const a = t * S.w * (0.95 + 0.1 * (f.spd - 0.85) / 0.3) + f.ph * 0.12 + f.s * 1.3;   // sürü: dar açı aralığında birlikte yüzer
    const rr = S.r + f.dr + Math.sin(t * 0.4 + f.ph) * 0.8;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.8;
    const y = S.y + f.dy + Math.sin(t * 0.9 + f.ph) * 0.3;
    const dir = Math.sign(S.w);
    const heading = Math.atan2(-(Math.cos(a) * rr * 0.8) * dir, -Math.sin(a) * rr * dir);
    eul.set(0, heading + Math.sin(t * 8 + f.ph) * 0.12, 0);
    q4.setFromEuler(eul);
    mtx.compose(pv.set(x, y, z), q4, sv.set(f.sc * S.L, f.sc * S.D, f.sc));
    fishMesh.setMatrixAt(i, mtx);
  }
  fishMesh.count = n;
  fishMesh.instanceMatrix.needsUpdate = true;
}

// --- Su yüzeyi (alttan): Snell penceresi, dalgacık parıltısı, güneş lekesi ---
const surfMat = new THREE.ShaderMaterial({
  uniforms: { uT: TIME, uFog: { value: WATER.clone() }, uDens: { value: 0.03 }, uSun: { value: new THREE.Vector3() } },
  side: THREE.DoubleSide, depthWrite: false,
  vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
  fragmentShader: /* glsl */ `
    uniform float uT, uDens; uniform vec3 uFog, uSun; varying vec3 vW;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    void main(){
      vec3 V = normalize(vW - cameraPosition);
      float up = V.y;
      float rip = vn(vW.xz*0.9 + vec2(uT*0.3, uT*0.2))*0.6 + vn(vW.xz*2.3 - vec2(uT*0.5, -uT*0.35))*0.4;
      float win = smoothstep(0.6, 0.74, up + (rip - 0.5)*0.12);                     // Snell penceresi (≈ 48,6°)
      vec3 tir = uFog*0.9;                                                            // tam iç yansıma: suyun kendisi
      vec3 sky = vec3(0.55, 0.85, 0.95)*(0.75 + 0.5*rip);
      vec3 c = mix(tir, sky*1.6, win);
      c += vec3(1.0, 0.97, 0.9)*pow(max(dot(V, uSun), 0.0), 60.0)*3.0*(0.6 + 0.8*rip);
      float d = length(vW - cameraPosition);
      c = mix(c, uFog, 1.0 - exp(-d*uDens*0.55));
      gl_FragColor = vec4(c, 1.0);
    }`,
});
const surface = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), surfMat);
surface.rotation.x = -Math.PI / 2; surface.position.y = SURF;
surface.userData.noShadow = true; surface.userData.noFit = true;
scene.add(surface);
{
  // kırılmış güneş yönü (sudan yukarı bakınca güneşin göründüğü yön)
  const sd = sim.sky.sunDir, hor = Math.hypot(sd.x, sd.z), el = Math.atan2(sd.y, hor), thW = Math.asin(Math.cos(el) / 1.33);
  surfMat.uniforms.uSun.value.set(sd.x / hor * Math.sin(thW), Math.cos(thW), sd.z / hor * Math.sin(thW)).normalize();
}

// --- Işık hüzmeleri (yüzeyden aşağı, kırılan güneş yönünde) ve asılı parçacıklar ---
const rayTex = (() => {
  const W = 64, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / (W - 1) - 0.5, v = y / (H - 1);
    const edge = Math.exp(-((u / 0.28) ** 2)) * (0.75 + 0.25 * Math.sin(u * 40 + v * 3));
    const a = edge * (1 - v) ** 1.4 * smoothstep(0, 0.06, v);
    const k = (y * W + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.round(255 * a);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const rays = [];
const RAY_D = surfMat.uniforms.uSun.value.clone().negate();   // aşağı yönlü ışın
{
  const r = seeded(14);
  for (let k = 0; k < 11; k++) {
    const len = 9 + r() * 5;
    const g = new THREE.PlaneGeometry(1.2 + r() * 2.2, len); g.translate(0, -len / 2, 0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      map: rayTex, color: 0xbfeaf0, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    m.position.set(-16 + r() * 32, SURF - 0.1, -12 + r() * 22);
    m.userData.ph = r() * 6.28;
    m.userData.noShadow = true; m.userData.noFit = true;
    rays.push(m);
    scene.add(m);
  }
}
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _bm = new THREE.Matrix4();
function orientRays() {
  const cam = sim.camera.position;
  for (const m of rays) {
    _by.copy(RAY_D).negate();                                    // yerel +y: ışının geldiği yön (yukarı)
    _bz.subVectors(cam, m.position); _bz.addScaledVector(_by, -_bz.dot(_by)).normalize();
    _bx.crossVectors(_by, _bz).normalize();
    _bm.makeBasis(_bx, _by, _bz);
    m.quaternion.setFromRotationMatrix(_bm);
  }
}
const SN = LOW ? 900 : 1800, SBOX = 14;
const snowPos = new Float32Array(SN * 3);
{
  const r = seeded(4);
  for (let i = 0; i < SN; i++) snowPos.set([(r() - 0.5) * 2 * SBOX, r() * SURF, (r() - 0.5) * 2 * SBOX], i * 3);
}
const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xdaf2f0, size: 0.035, map: softDot(), transparent: true, opacity: 0.55, depthWrite: false }));
snow.frustumCulled = false; snow.userData.noShadow = true; snow.userData.noFit = true;
scene.add(snow);
const wrapS = (v) => v - 2 * SBOX * Math.round(v / (2 * SBOX));

// --- Termometre (veri göstergesi: cam tüp, renkli sıvı; Görünüm'den gizlenebilir) ---
const thermo = new THREE.Group();
thermo.position.set(-11, reefH(-11, -9), -9);
scene.add(thermo);
const TH = 4.2;
const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, specularIntensity: 1, depthWrite: false, side: THREE.DoubleSide });
const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, TH, 24, 1, true), glassM);
tube.position.y = TH / 2 + 0.55;
thermo.add(tube);
const cap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, TAU, 0, Math.PI / 2), mat.brushedMetal({ color: 0xc9ccd0 }));
cap.position.y = TH + 0.55; thermo.add(cap);
const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8), mat.brushedMetal({ color: 0x9aa0a6 }));
stake.position.y = 0.05; thermo.add(stake);
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xef4444, roughness: 0.15, clearcoat: 1 }));
bulb.position.y = 0.42;
const fillGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 16);
fillGeo.translate(0, 0.5, 0);
const fillMat = new THREE.MeshPhysicalMaterial({ color: 0xef4444, roughness: 0.2, clearcoat: 1 });
const fill = new THREE.Mesh(fillGeo, fillMat);
fill.position.y = 0.55;
thermo.add(bulb, fill);
// Eşik çizgileri: normal yaz en yüksek (MMM) ve ağarma eşiği (MMM + 1 °C). Termometre ölçeği: −4 … +4 °C
const T_MIN = -4, T_MAX = 4;
const tY = (v) => 0.55 + ((clamp(v, T_MIN, T_MAX) - T_MIN) / (T_MAX - T_MIN)) * TH;
for (const [v, color] of [[0, 0xfacc15], [1, 0xf97316]]) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.018, 6, 24), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = tY(v);
  thermo.add(ring);
}
const thermoLabel = sim.label('', { parent: thermo, position: [0, TH + 1.1, 0], className: 'plain' });
const ringLabel = sim.label('ağarma eşiği', { parent: thermo, position: [1.2, tY(1), 0], className: 'plain' });
ringLabel.el.style.fontSize = '11px';
const labels = [thermoLabel, ringLabel];

// --- Arayüz ---
const ui = sim.ui;
ui.section('Senaryo');
const preset = ui.segmented({
  options: [{ value: 'normal', label: 'Normal yıl' }, { value: 'dalga', label: 'Deniz ısı dalgası' },
    { value: 'y2100', label: '2100 yüksek emisyon (temsili)' }, { value: 'koruma', label: 'Koruma alanı' }],
  value: 'normal', onChange: () => { sim.reset(); sim.play(); },
});

ui.section('🌡️ Deniz sıcaklığı');
const warming = ui.slider({ label: 'Uzun vadeli ısınma', min: 0, max: 3, step: 0.1, value: 0, format: (v) => `+${fmt(v, 1)} °C`, onChange: (v) => (model.p.warming = v) });
const waveMode = ui.select({ label: 'Isı dalgası', value: 'yok', options: [{ value: 'yok', label: 'Yok' }, { value: 'bir', label: 'Yalnız ilk yaz' }, { value: 'her', label: 'Her yaz' }],
  onChange: (v) => (model.p.waveMode = v) });
const waveI = ui.slider({ label: 'Isı dalgası şiddeti', min: 0.5, max: 3, step: 0.1, value: 1.6, format: (v) => `+${fmt(v, 1)} °C`, onChange: (v) => (model.p.waveI = v) });
const waveD = ui.slider({ label: 'Isı dalgası süresi', min: 2, max: 20, step: 1, value: 10, unit: 'hafta', onChange: (v) => (model.p.waveD = v) });
ui.button({ label: '🔥 Şimdi bir ısı dalgası başlat', variant: 'danger', onClick: () => {
  model.triggerWave();
  sim.toast('🔥 Isı dalgası başladı: su normalden daha sıcak olacak', 'warn');
} });

ui.section('🧪 Su kalitesi ve koruma');
const pH = ui.slider({ label: 'Okyanus pH', min: 7.6, max: 8.2, step: 0.01, value: 8.05,
  format: (v) => `${fmt(v, 2)} · Ω ≈ ${fmt(omega(v), 1)}`, onChange: (v) => (model.p.pH = v) });
const pollution = ui.slider({ label: 'Kıyıdan kirlilik / gübre akışı', min: 0, max: 100, step: 1, value: 15, unit: '%', onChange: (v) => (model.p.pollution = v / 100) });
const mpa = ui.toggle({ label: '🛡️ Deniz koruma alanı (avcılık yasak)', value: false, onChange: (v) => (model.p.mpa = v) });

ui.section('📊 Durum');
const stTemp = ui.stat({ label: 'Normal yaz zirvesine göre', unit: '°C' });
const stDhw = ui.stat({ label: 'Isı stresi (DHW)', unit: '°C-hafta' });
const stFish = ui.stat({ label: '🐠 Balık' });
const stHealthy = ui.stat({ label: '🪸 Sağlıklı', unit: '%' });
const stBleach = ui.stat({ label: '🤍 Ağarmış', unit: '%' });
const stDead = ui.stat({ label: '🟫 Ölü / yosunlu', unit: '%' });
const alert = ui.meter({ label: 'Ağarma uyarısı', color: '#22c55e' });
const coralChart = ui.chart({ title: 'Mercanlar (%)', series: [{ name: 'Sağlıklı', color: '#f472b6', fill: true }, { name: 'Ağarmış', color: '#e2e8f0' }, { name: 'Ölü/yosunlu', color: '#a3a36b' }], maxPoints: 320, yMin: 0, yMax: 100 });
const heatChart = ui.chart({ title: 'Isı: sıcaklık farkı (°C) ve DHW (°C-hafta)', series: [{ name: 'Sıcaklık farkı', color: '#fb923c' }, { name: 'DHW', color: '#ef4444', fill: true }], maxPoints: 320, height: 100 });
const fishChart = ui.chart({ title: 'Balık sayısı', series: [{ name: 'Balık', color: '#38bdf8', fill: true }], maxPoints: 320, yMin: 0, height: 80 });
const note = ui.text('', 'card');

ui.section('Görünüm', { open: false });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => labels.forEach((l) => (l.visible = v)) });
ui.toggle({ label: 'Termometre', value: true, onChange: (v) => { thermo.visible = v; labels.forEach((l) => (l.visible = v)); } });
ui.toggle({ label: 'Işık hüzmeleri', value: true, onChange: (v) => rays.forEach((r) => (r.visible = v)) });
ui.buttons([
  { label: '🎥 Genel', onClick: () => sim.moveCamera([4.6, 2.5, 11.8], [-0.5, 1.2, -2]) },
  { label: '🗺️ Geniş', onClick: () => sim.moveCamera([3.2, 4.2, 16], [0, 1.0, -3]) },
  { label: '🤿 Yakın dalış', onClick: () => sim.moveCamera([4.5, 2.6, 7.5], [0, 1.2, 0]) },
  { label: '⬇️ Yukarıdan', onClick: () => sim.moveCamera([0, SURF - 0.6, 4], [0, 0, 0]) },
]);

// --- Hazır ayarlar ---
const PRESETS = {
  normal: { warming: 0, wave: 'yok', I: 1.6, D: 10, pH: 8.05, pol: 15, mpa: false },
  dalga: { warming: 0.3, wave: 'bir', I: 1.6, D: 10, pH: 8.05, pol: 20, mpa: false },
  y2100: { warming: 1.5, wave: 'yok', I: 1.6, D: 10, pH: 7.72, pol: 30, mpa: false },
  koruma: { warming: 0.3, wave: 'bir', I: 1.6, D: 10, pH: 8.05, pol: 5, mpa: true },
};
function load(name) {
  const P = PRESETS[name];
  warming.set(P.warming, true); waveMode.set(P.wave, true); waveI.set(P.I, true); waveD.set(P.D, true);
  pH.set(P.pH, true); pollution.set(P.pol, true); mpa.set(P.mpa, true);
  model.init(col.map((q) => q.type));
  model.sst = model.sstAt(0);
  acc = 0; nextPush = 0;
  coralChart.clear(); heatChart.clear(); fishChart.clear();
  drawCorals();
  updateStats();
}

// --- Döngü ---
let acc = 0, nextPush = 0, drawTick = 0, lastDeaths = 0;
sim.onUpdate((dt) => {
  acc += dt * WEEKS_PER_SEC;
  while (acc >= STEP) { model.step(); acc -= STEP; }
  if (model.t >= nextPush) {
    nextPush = model.t + 0.5;
    coralChart.push([model.healthy * 100, model.bleached * 100, model.deadF * 100]);
    heatChart.push([model.sst, model.dhw]);
    fishChart.push([model.fish]);
  }
  if (model.deaths - lastDeaths >= 10) { lastDeaths = model.deaths; sim.toast('🟫 Uzun süre ağarmış kalan mercanlar ölmeye başladı', 'bad'); }
});

const fogBlue = new THREE.Color(0x0a4862), fogGreen = new THREE.Color(0x2f5a46), fogHot = new THREE.Color(0x0e5c6c), bgc = new THREE.Color();
sim.onRender((rdt) => {
  const t = sim.time;
  TIME.value = performance.now() / 1000;
  applyUnderwater();
  drawFish(t);
  drawFans(t, model.bleached + model.deadF * 0.5);
  drawSoft(t, model.bleached + model.deadF * 0.5);
  if (drawTick++ % 3 === 0) drawCorals();
  if (drawTick % 12 === 1) updateStats();
  // kamera su yüzeyinin altında kalsın
  const cam = sim.camera.position;
  if (cam.y > SURF - 0.35) cam.y = SURF - 0.35;
  orientRays();
  rays.forEach((r) => { r.material.opacity = 0.03 + 0.04 * (0.5 + 0.5 * Math.sin(TIME.value * 0.6 + r.userData.ph)); });
  // asılı parçacıklar: yavaş çöker, akıntıyla sürüklenir; kamera çevresinde sarar
  const tg = sim.controls ? sim.controls.target : cam;
  for (let i = 0; i < SN; i++) {
    let y = snowPos[i * 3 + 1] - rdt * 0.04; if (y < 0) y += SURF;
    snowPos[i * 3 + 1] = y;
    snowPos[i * 3] = tg.x + wrapS(snowPos[i * 3] + rdt * 0.06 - tg.x);
    snowPos[i * 3 + 2] = tg.z + wrapS(snowPos[i * 3 + 2] - tg.z);
  }
  snowGeo.attributes.position.needsUpdate = true;
  // Su rengi ve görüş: kirlilik bulanık yeşil, sıcaklık hafif turkuaz
  bgc.copy(fogBlue).lerp(fogHot, clamp(model.sst / 3, 0, 0.5)).lerp(fogGreen, model.p.pollution * 0.75);
  scene.background.copy(bgc);
  uwFog.color.copy(bgc);
  uwFog.density = 0.034 + model.p.pollution * 0.045;
  surfMat.uniforms.uFog.value.copy(bgc); surfMat.uniforms.uDens.value = uwFog.density;
  snow.material.opacity = 0.45 + model.p.pollution * 0.4;
  // Termometre
  const v = model.sst;
  fill.scale.y = Math.max(0.01, tY(v) - 0.55);
  heatColor(clamp((v + 3) / 5, 0, 1), fillMat.color);
  bulb.material.color.copy(fillMat.color);
});

const ALERTS = [
  [0, 'Stres yok', '#22c55e'], [0, 'İzle: su ısınıyor', '#a3e635'], [0, 'Dikkat: ısı stresi birikiyor', '#facc15'],
  [4, '1. düzey: ağarma bekleniyor', '#f97316'], [8, '2. düzey: yaygın ağarma, ölüm riski', '#dc2626'],
];
function updateStats() {
  const sst = model.sst, dhw = model.dhw;
  stTemp.set(`${sst >= 0 ? '+' : ''}${fmt(sst, 1)}`, sst >= 1 ? 'bad' : sst >= 0 ? 'warn' : 'good');
  stDhw.set(fmt(dhw, 1), dhw >= 8 ? 'bad' : dhw >= 4 ? 'warn' : '');
  stFish.set(Math.round(model.fish), model.fish < 50 ? 'bad' : model.fish > 120 ? 'good' : '');
  stHealthy.set(fmt(model.healthy * 100, 0), model.healthy > 0.7 ? 'good' : model.healthy < 0.3 ? 'bad' : '');
  stBleach.set(fmt(model.bleached * 100, 0), model.bleached > 0.3 ? 'warn' : '');
  stDead.set(fmt(model.deadF * 100, 0), model.deadF > 0.3 ? 'bad' : '');
  const lvl = ALERTS[dhw >= 8 ? 4 : dhw >= 4 ? 3 : dhw > 0.01 ? 2 : sst >= 0 ? 1 : 0];
  alert.set(dhw / 12, `${lvl[1]} · ${fmt(dhw, 1)}`);
  alert.color(lvl[2]);
  thermoLabel.setText(`🌡️ <b>${sst >= 0 ? '+' : ''}${fmt(sst, 1)} °C</b><br><small>en sıcak ay ortalamasına göre · DHW ${fmt(dhw, 1)}</small>`);

  const calc = calcFactor(model.p.pH);
  let msg;
  if (dhw >= 8) msg = '🔥 <b>Çok uzun süren sıcak su!</b> Mercanlar alglerini attı ve bembeyaz oldu. Aç kalan hassas mercanlar ölmeye başlıyor.';
  else if (dhw >= 4) msg = '🤍 <b>Ağarma:</b> su haftalardır fazla sıcak. Mercanlar renk veren alglerini dışarı atıyor. Su zamanında serinlerse toparlanabilirler.';
  else if (model.bleached > 0.05 && model.hotspot < 1) msg = '🌈 <b>Toparlanma:</b> su serinledi, algler geri dönüyor ve renkler yavaş yavaş geri geliyor.';
  else if (model.deadF > 0.3 && model.p.pollution > 0.5) msg = '🟢 <b>Yosun baskısı:</b> kirli su yosunu besliyor; ölü iskeletleri kaplayan yosun yeni mercan yavrularının tutunmasını engelliyor.';
  else if (model.deadF > 0.3 && model.p.mpa) msg = '🛡️ <b>Koruma alanı:</b> otçul balıklar yosunu kırpıyor, boşalan yerlere yeni mercan yavruları tutunuyor. Toparlanma yavaş ama sürüyor.';
  else if (model.deadF > 0.3) msg = '🟫 <b>Resif yaralı:</b> ölü mercanlar yosunla kaplı; balıklar yuva bulamadığı için azaldı. Toparlanma yıllar sürer.';
  else if (calc < 0.45) msg = '🧪 <b>Asitlenme:</b> sudaki karbonat azaldı (Ω düşük). Mercanlar iskelet yapmakta zorlanıyor, çok yavaş büyüyor.';
  else if (sst >= 0) msg = '☀️ <b>Yaz:</b> su yılın en sıcak dönemine yaklaşıyor. Normal yaz zirvesini 1 °C aşarsa ısı stresi (DHW) birikmeye başlar.';
  else msg = '💙 <b>Sağlıklı resif:</b> mercanlar alg ortaklarıyla birlikte renkli ve büyüyor; balıklar bol.';
  note.set(msg);
}

// Mercana tıkla → bilgi
sim.onClick(() => meshes, (hit) => {
  const k = meshes.indexOf(hit.object);
  if (k < 0 || hit.instanceId == null) return;
  const i = col.findIndex((q) => q.mesh === k && q.slot === hit.instanceId);
  if (i < 0) return;
  const T = TYPES[col[i].type];
  const state = c.dead[i] ? (c.algae[i] > 0.5 ? 'ölmüş, üzeri yosun kaplı' : 'yeni ölmüş, beyaz iskelet')
    : c.b[i] > 0.7 ? 'ağarmış (algler gitmiş), aç kalıyor' : c.b[i] > 0.3 ? 'solgun, ağarmaya başlamış' : 'sağlıklı ve renkli';
  sim.toast(`🪸 <b>${T.name}</b> (${T.note}) · ${state}`, c.dead[i] ? 'bad' : c.b[i] > 0.5 ? 'warn' : 'good');
});

sim.onReset(() => { lastDeaths = 0; load(preset.value); });
load('normal');
