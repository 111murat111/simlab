// Merkez Bankası: Faiz ve Enflasyon — IS + Phillips + Taylor kuralı, beklentiler, politika gecikmesi ve Okun yasası; gerçek ölçekli kent meydanı.
import { createSim, THREE, fmt, clamp, lerp, heatColor, instanced, textTexture, textPlane, mat, landscape, createTerrain, terrainSkirt, createVegetation, RoundedBoxGeometry, BufferGeometryUtils,
  makeCity, makeBlock, streetLamps, streetMaterials as groundMats, crowd } from '@core';
import { createEconomy } from './model.js';
import { ashlar, fluted, paving, oldBrick } from './stone.js';

const LOW = /[?&]low\b/.test(location.search);
const Q_SEC = 1.2; // 1× hızda bir çeyrek kaç saniye

const sim = createSim({
  sky: { elevation: 27, azimuth: 243, clouds: 0.4, haze: 1.15, visibility: 6500, wind: [5, 2] },
  camera: { position: [42, 34, 92], target: [-6, 11, -8], fov: 45, near: 0.5, far: 80000 },
  controls: { maxDistance: 600, minDistance: 12 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Küçük bir ekonominin kent meydanı. Soldaki <b>merkez bankası</b>nın çatı kadranı politika faizini gösterir. Meydandaki
    <b>termometre anıtı</b> yıllık enflasyondur (beyaz halka: hedef, mor koni: beklenen enflasyon). Sağdaki tuğla <b>fabrikalar</b>
    üretimi temsil eder: çıktı açığı pozitifken bacalar yoğun tüter ve pencereler parlar. Öndeki iş bulma ofisinin önündeki
    <b>kuyruk</b> iş arayanlardır (işsizlik oranı).
    Bankadan fabrikalara giden borudaki ışıklar faiz kararının <b>parasal aktarımı</b>dır: mavi = sıkı (reel faiz nötrün üstünde),
    turuncu = gevşek. Bir kararın ekonomiye ulaşması birkaç çeyrek sürer.</p>
    <h3>Model</h3>
    <ul>
      <li><b>Fisher:</b> reel faiz r = i − πᵉ (nominal politika faizi − beklenen enflasyon). Talebi belirleyen nominal değil reel faizdir.</li>
      <li><b>IS eğrisi:</b> yₜ = ρ·yₜ₋₁ − a·(rₜ₋ₗ − r*) + talep şoku. Reel faiz nötr faizin (r*) üstündeyse çıktı açığı küçülür; L çeyrek gecikmeyle.</li>
      <li><b>Phillips eğrisi:</b> πₜ = πᵉₜ + κ·yₜ + arz şoku. Ekonomi ısınırsa enflasyon beklentinin üstüne çıkar.</li>
      <li><b>Beklentiler:</b> πᵉ = c·π* + (1 − c)·πₜ₋₁. c = güvenilirlik: 1'e yakınsa beklentiler hedefe çıpalıdır, 0'a yakınsa geçmiş enflasyonu izler.</li>
      <li><b>Taylor kuralı</b> (Taylor, 1993): i = r* + π + φπ·(π − π*) + φy·y. Taylor'ın özgün önerisi φπ = φy = 0,5 ve r* = π* = %2'dir.
      Enflasyon 1 puan artınca nominal faiz 1'den fazla (1 + φπ) artmalıdır ki reel faiz yükselsin (<i>Taylor ilkesi</i>).</li>
      <li><b>Okun yasası:</b> işsizlik u = u* − y / β (burada β = 2: çıktı açığındaki 2 puanlık düşüş işsizliği yaklaşık 1 puan artırır).</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li><b>Enerji şoku</b> ver, önce güvenilirliği 0,9 sonra 0,1 yap: çıpalı beklentilerde enflasyon kısa sürede geri döner; çıpasız beklentilerde kalıcılaşır ve daha pahalı bir durgunluk gerekir.</li>
      <li><b>Faizi sabit tutan banka</b> senaryosu: talep patlarken faiz sabit kalırsa enflasyon yükselir, reel faiz düşer ve ekonomi daha da ısınır.</li>
      <li>Taylor kuralında φπ'yi negatife çek (faiz enflasyondan az artsın) ve güvenilirliği düşür: enflasyon kontrolden çıkar.</li>
      <li><b>Yüksek enflasyondan dönüş</b>: gecikme ve güvenilirlik değiştikçe dezenflasyonun maliyeti (işsizlik) nasıl değişiyor?</li>
      <li>Manuel modda faizi aniden artır; enflasyonun hemen değil birkaç çeyrek sonra düştüğünü izle.</li>
    </ul>
    <h3>Sınırlar</h3>
    <p><small>Tüm katsayılar (a, κ, ρ, gecikme, geçişkenlik, u*, r*) <b>temsilîdir</b>; belirli bir ülkeye göre kalibre edilmemiştir.
    Gerçek ekonomilerde beklentiler ileriye dönük de oluşur, maliye politikası, kredi kanalları, dış ticaret, finansal istikrar ve
    belirsizlik de rol oynar. Model tahmin aracı değil, sezgi kazandırmak için bir öğretim modelidir.</small></p>`,
});

// --- Model ---
const P = {
  target: 2, rStar: 2, uStar: 5, okun: 2, phiPi: 0.5, phiY: 0.5, smooth: 0.5, rule: true, manual: 4,
  cred: 0.6, lag: 2, rhoY: 0.8, a: 0.25, kappa: 0.2, passThru: 0.3, shockSize: 1,
};
const eco = createEconomy(P);
sim.formatTime = () => `${Math.floor(eco.q / 4) + 1}. yıl · ${(eco.q % 4) + 1}. çeyrek`;

// --- Kent meydanı (metre): taş döşeli meydan, çevrede şehir, uzakta tepeler ---
const dummy = new THREE.Object3D();
const scene = sim.scene;
const V2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y));
{
  const hf = (x, z) => {
    const r = Math.hypot(x, z);
    const base = landscape({ seed: 17, size: 1500, height: 420, base: -40 });
    return -6 + THREE.MathUtils.smoothstep(r, 1500, 4200) * (base(x, z) + 160);
  };
  scene.add(createTerrain(hf, { size: [10000, 10000], res: [180, 180], materialOptions: { water: -500, grass: 0x56622f, dry: 0x958a5a, forest: 0.9 } }));
  scene.add(terrainSkirt(hf, { inner: 5000, outer: 60000 }));
  const street = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400).rotateX(-Math.PI / 2), groundMats().asphalt);
  street.position.y = -0.05; street.userData.noFit = true; street.userData.noCast = true;
  scene.add(street);
  const plaza = new THREE.Mesh(new RoundedBoxGeometry(150, 0.3, 90, 2, 0.1), paving({ color: 0xbcb3a4 }));
  plaza.position.set(-4, 0.06, 0); plaza.userData.noFit = true;
  scene.add(plaza);
  // kaldırım bordürü
  const curb = new THREE.Mesh(new RoundedBoxGeometry(152, 0.34, 92, 2, 0.12), mat.concrete({ color: 0x9d978c }));
  curb.position.set(-4, 0.03, 0); curb.userData.noFit = true;
  scene.add(curb);
  // Kent dokusu (şehir kiti): meydanı çevreleyen ızgara sokaklar — asfalt, şerit ve yaya geçidi çizgileri, bordürlü
  // kaldırımlar, sokak ağaçları ve lambaları, park etmiş araçlar; bitişik nizam 4–8 katlı sıvalı / tuğla apartmanlar
  // (dükkân katı, balkon, kırma kiremit çatı). Uzakta giydirme cepheli ofis kuleleriyle iş merkezi.
  const XS = [], ZS = [];
  for (let x = -910; x <= -100; x += 90) XS.push(x);
  for (let x = 92; x <= 902; x += 90) XS.push(x);
  for (let z = -1502; z <= -62; z += 90) ZS.push(z);
  for (let z = 62; z <= 512; z += 90) ZS.push(z);
  const inX = (x) => x >= -370 && x <= 362, inZ = (z) => z >= -422 && z <= 242;
  const cbd = (x, z) => Math.exp(-((x + 260) ** 2 + (z + 1050) ** 2) / 300 ** 2);
  const OFFICE_C = [0x27313a, 0x33404a, 0x1d262d, 0x444d55, 0x3a4a52, 0x2c3b36];
  // Parseller (motor kent kiti): iş merkezinde podyum + kademeli giydirme cepheli kuleler, diğer adalarda
  // 4–8 katlı Türk apartmanları (dükkân katı, balkon, çatı donanımı), eski evler; merkeze yaklaştıkça yükselir.
  const lotsFn = (inner, r) => {
    const t = cbd(inner.cx, inner.cz);
    if (t > 0.35 && r() < 0.5) {
      const fl = Math.round(12 + t * 22 + r() * 8), w = Math.min(inner.w - 8, 26 + r() * 12), d = Math.min(inner.d - 8, 24 + r() * 10);
      const wall = OFFICE_C[Math.floor(r() * OFFICE_C.length)], seed = r() * 1000;
      const f1 = Math.max(4, Math.round(fl * (0.62 + r() * 0.15)));
      const podH = 5.2 + 2 * 3.7 + 0.06, towH = 0.45 + f1 * 3.7 + 0.06; // üst kütle alttakinin çatı döşemesine oturur
      return [
        { type: 'office', x: inner.cx, z: inner.cz, width: inner.w - 4, depth: inner.d - 4, floors: 3, seed, roofGear: false, colors: { wall: 0x3a4148 } },
        { type: 'office', x: inner.cx, z: inner.cz, y0: podH, width: w, depth: d, floors: f1, seed: seed + 1, roofGear: false, colors: { wall } },
        { type: 'office', x: inner.cx, z: inner.cz, y0: podH + towH, width: w * 0.72, depth: d * 0.72, floors: Math.max(3, fl - f1), seed: seed + 2, colors: { wall } },
      ];
    }
    return makeBlock(inner, {
      seed: r() * 1000, shops: 0.6, roofs: { hip: 0.4 }, gap: r() < 0.5 ? 0 : 2.5,
      floors: (x, z, rr, type) => { const k = cbd(x, z); return type === 'apartment' ? (k > 0.15 ? 6 + Math.floor(rr() * 4 + k * 6) : 4 + Math.floor(rr() * 4.5)) : type === 'office' ? 8 + Math.floor(rr() * 8 + k * 12) : undefined; },
      type: (x, z, rr) => (rr() < cbd(x, z) * 0.8 ? 'office' : rr() < 0.85 ? 'apartment' : 'house'),
    });
  };
  const inner = makeCity({
    xs: XS.filter(inX), zs: ZS.filter(inZ), road: 14, walk: 4.5, seed: 29, parked: 90, trees: true, lamps: true, lawnInside: true,
    plan: (i, j, rc) => (rc.cx > -110 && rc.cx < 100 && rc.cz > -70 && rc.cz < 70 ? 'none' : 'city'),
    lots: lotsFn, asphalt: false, camera: [42, 34, 92], tile: 120, near: LOW ? 160 : 240,
    parkOk: (x, z) => !(x > -100 && x < 92 && z > -62 && z < 62),
  });
  scene.add(inner.group);
  const outer = makeCity({
    xs: XS, zs: ZS, road: 14, walk: 4.5, seed: 31, parked: 0, trees: false, lamps: false, lawnInside: false, asphalt: false, tile: 360,
    plan: (i, j, rc) => (inX(rc.cx) && inZ(rc.cz) ? 'none' : 'city'),
    lots: lotsFn,
  });
  scene.add(outer.group);
  sim.onRender(() => inner.update(performance.now() / 1000, 0.6));
  // Meydan çevresi: klasik sokak lambaları (kol dışa, yola doğru)
  const lp = [];
  for (let x = -70; x <= 64; x += 22) { lp.push([x, 47.2, 0]); lp.push([x, -47.2, Math.PI]); }
  for (let z = -30; z <= 30; z += 22) { lp.push([-81.2, z, -Math.PI / 2]); lp.push([73.2, z, Math.PI / 2]); }
  scene.add(streetLamps(lp).group);
  // Meydanın açık ön kısmında çim parterler, alçak şimşir çit ve banklar
  {
    const GM = groundMats(), hedgeM = mat.foliage ? mat.foliage({ color: 0x3f5a2a }) : GM.lawn;
    const benchM = mat.wood({ color: 0x6b4a2e, varnish: true });
    for (const [px, pz] of [[18, 16], [48, 16]]) {
      const bed = new THREE.Mesh(new RoundedBoxGeometry(22, 0.3, 11, 2, 0.1), GM.lawn); bed.position.set(px, 0.22, pz); bed.receiveShadow = true; scene.add(bed);
      const hg = [];
      for (const [w, d, x, z] of [[22.6, 0.6, 0, 5.8], [22.6, 0.6, 0, -5.8], [0.6, 11, 11.3, 0], [0.6, 11, -11.3, 0]]) hg.push(new RoundedBoxGeometry(w, 0.7, d, 2, 0.2).translate(px + x, 0.55, pz + z));
      const hedge = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(hg), hedgeM); hedge.castShadow = hedge.receiveShadow = true; scene.add(hedge);
      for (const sx of [-6, 0, 6]) {
        const b = new THREE.Group(); b.position.set(px + sx, 0.21, pz + 7.4);
        const seat = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.08, 0.5, 1, 0.02), benchM); seat.position.y = 0.45; b.add(seat);
        const back = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.45, 0.06, 1, 0.02), benchM); back.position.set(0, 0.75, 0.24); back.rotation.x = -0.15; b.add(back);
        for (const lx of [-0.85, 0.85]) { const leg = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.45, 0.5, 1, 0.02), mat.paintedMetal({ color: 0x1f2321, wear: 0.2 })); leg.position.set(lx, 0.22, 0); b.add(leg); }
        b.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        scene.add(b);
      }
    }
  }
  // Meydan ağaçları (iki sıra çınar) ve çimen şeritleri
  const flat = () => 0.15;
  const trees = createVegetation(flat, {
    rect: [-78, 30, 70, 44], trees: 26, shrubs: 0, rocks: 0, grass: 0, seed: 5, kinds: { broad: 1 }, water: -10,
    forest: (x, z) => (Math.abs(z - 37) < 3 ? 1 : 0),
  });
  scene.add(trees.group);
  sim.onRender(() => trees.update(performance.now() / 1000, 0.6));
}

// --- Merkez bankası: kesme taş, oluklu sütunlar, alınlık; çatı katında faiz kadranı ---
const BANK = new THREE.Vector3(-44, 0.15, -18);
const DIAL_MAX = 50;
const DIAL_Y = 29.5;
const dialAngle = (i) => -Math.PI * 0.75 + Math.PI * 1.5 * Math.sqrt(clamp(i, 0, DIAL_MAX) / DIAL_MAX);
let needle;
{
  const stone = ashlar({ color: 0xdcd3c1 });
  const trim = mat.concrete({ color: 0xd8d0bf, stains: 0.35 });
  const g = new THREE.Group();
  g.position.copy(BANK);
  // basamaklar + podyum
  for (let k = 0; k < 6; k++) {
    const st = new THREE.Mesh(new RoundedBoxGeometry(46 - k * 0.2, 0.36, 3.0 - k * 0.45, 1, 0.04), trim);
    st.position.set(0, 0.18 + k * 0.36, 12.4 - k * 0.45 + 1.5);
    g.add(st);
  }
  const podium = new THREE.Mesh(new RoundedBoxGeometry(48, 2.2, 26, 2, 0.08), stone);
  podium.position.set(0, 1.1, 0); g.add(podium);
  // gövde (kolonadın arkasında)
  const body = new THREE.Mesh(new RoundedBoxGeometry(42, 15, 18, 2, 0.1), stone);
  body.position.set(0, 2.2 + 7.5, -3); g.add(body);
  // pencereler: taş söve + koyu cam
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0x1b2430, roughness: 0.06, metalness: 0.2, clearcoat: 1 });
  const frameG = new RoundedBoxGeometry(2.2, 3.6, 0.5, 2, 0.06), paneG = new THREE.PlaneGeometry(1.7, 3.1);
  for (let row = 0; row < 2; row++) for (let c = 0; c < 8; c++) {
    if (row === 0 && (c === 3 || c === 4)) continue; // ana kapı
    const x = -16.8 + c * 4.8, y = 5.2 + row * 6;
    const fr = new THREE.Mesh(frameG, trim); fr.position.set(x, y, 6.05); g.add(fr);
    const pn = new THREE.Mesh(paneG, glassM); pn.position.set(x, y, 6.31); g.add(pn);
  }
  // kapı
  const door = new THREE.Mesh(new RoundedBoxGeometry(3.2, 5.4, 0.3, 2, 0.05), mat.wood({ color: 0x3a2618, varnish: true }));
  door.position.set(0, 2.2 + 2.7, 6.1); g.add(door);
  // sütunlar: taban, entasisli gövde, başlık (lathe)
  const shaftG = new THREE.LatheGeometry(V2(Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [0.78 * (1 - 0.12 * t * t), 0.9 + t * 11.3]; })), 40);
  const baseG = new THREE.LatheGeometry(V2([[0, 0], [1.15, 0], [1.15, 0.3], [1.0, 0.4], [0.98, 0.55], [0.86, 0.7], [0.8, 0.9], [0, 0.9]]), 40);
  const capG = new THREE.LatheGeometry(V2([[0, 12.2], [0.7, 12.2], [0.74, 12.35], [0.95, 12.6], [1.1, 12.85], [1.1, 13.0], [0, 13.0]]), 40);
  const abacus = new RoundedBoxGeometry(2.4, 0.35, 2.4, 1, 0.04);
  const colMat = fluted({ color: 0xdfd7c6 });
  for (let k = 0; k < 8; k++) {
    const x = -19.6 + k * 5.6, z = 10.2;
    const s = new THREE.Mesh(shaftG, colMat); s.position.set(x, 2.2, z); g.add(s);
    const b = new THREE.Mesh(baseG, trim); b.position.set(x, 2.2, z); g.add(b);
    const cp = new THREE.Mesh(capG, trim); cp.position.set(x, 2.2, z); g.add(cp);
    const ab = new THREE.Mesh(abacus, trim); ab.position.set(x, 2.2 + 13.17, z); g.add(ab);
  }
  // saçaklık, korniş, alınlık, çatı
  const ent = new THREE.Mesh(new RoundedBoxGeometry(46, 2.6, 16, 2, 0.08), stone);
  ent.position.set(0, 15.55 + 1.3, 4); g.add(ent);
  const corn = new THREE.Mesh(new RoundedBoxGeometry(47.4, 0.6, 17.2, 2, 0.12), trim);
  corn.position.set(0, 18.45, 4.2); g.add(corn);
  const triS = new THREE.Shape(V2([[-23.2, 0], [23.2, 0], [0, 6.2]]));
  const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(triS, { depth: 1.2, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 2 }), trim);
  ped.position.set(0, 18.75, 11.3); g.add(ped);
  const tymp = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(V2([[-20.5, 0.5], [20.5, 0.5], [0, 5.3]])), { depth: 0.2, bevelEnabled: false }), stone);
  tymp.position.set(0, 18.75, 12.55); g.add(tymp);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(V2([[-23, 0], [23, 0], [0, 6]])), { depth: 20, bevelEnabled: false }), mat.paintedMetal({ color: 0x5c6b66, wear: 0.4 }));
  roof.position.set(0, 18.75, -8.7); g.add(roof);
  // yazıt
  const ins = textPlane('MERKEZ BANKASI', 1.3, { color: '#4a4236', size: 72, font: '600 {s}px Georgia, serif' });
  ins.material = new THREE.MeshStandardMaterial({ map: ins.material.map, transparent: true, roughness: 0.9 });
  ins.position.set(0, 16.85, 12.02); g.add(ins);
  // çatı katı kulesi + aydınlatılmış kadran
  const tower = new THREE.Mesh(new RoundedBoxGeometry(12, 11, 9, 2, 0.1), stone);
  tower.position.set(0, 21 + 5.5, -2); g.add(tower);
  const tcap = new THREE.Mesh(new RoundedBoxGeometry(13, 0.7, 10, 2, 0.12), trim);
  tcap.position.set(0, 32.35, -2); g.add(tcap);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const x = cv.getContext('2d');
  x.scale(2, 2);
  x.fillStyle = '#f4efe2'; x.beginPath(); x.arc(128, 128, 124, 0, Math.PI * 2); x.fill();
  x.lineWidth = 8; x.strokeStyle = '#2a2721'; x.stroke();
  x.fillStyle = '#1f1c17'; x.font = 'bold 26px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (const v of [0, 2, 5, 10, 20, 35, 50]) {
    const a = dialAngle(v) - Math.PI / 2;
    x.save(); x.translate(128, 128); x.rotate(a + Math.PI / 2);
    x.fillRect(-3, -118, 6, 18); x.restore();
    x.fillText(String(v), 128 + Math.cos(a) * 80, 128 + Math.sin(a) * 80);
  }
  x.font = 'bold 20px Georgia, serif'; x.fillText('% FAİZ', 128, 190);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xfff2d8, emissiveIntensity: 0.14, roughness: 0.5 }));
  face.position.set(0, DIAL_Y - BANK.y, 2.56);
  g.add(face);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.22, 12, 64), mat.brushedMetal({ color: 0xb58b4a }));
  bezel.position.set(0, DIAL_Y - BANK.y, 2.56); g.add(bezel);
  needle = new THREE.Mesh(new RoundedBoxGeometry(0.34, 3.5, 0.12, 1, 0.05).translate(0, 1.5, 0), mat.paintedMetal({ color: 0xb91c1c, wear: 0.05 }));
  needle.position.set(0, DIAL_Y - BANK.y, 2.75);
  g.add(needle);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 24).rotateX(Math.PI / 2), mat.brushedMetal({ color: 0xb58b4a }));
  hub.position.set(0, DIAL_Y - BANK.y, 2.85); g.add(hub);
  // --- Klasik ayrıntılar ---
  const inst = (geo, m, list) => { const im = new THREE.InstancedMesh(geo, m, list.length); list.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.rotation.set(0, p[3] || 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); }); im.castShadow = im.receiveShadow = true; return im; };
  // arşitrav bandı (iki kademeli) ve korniş altı diş sırası (dentil)
  for (const [yy, zz, hh] of [[15.72, 12.12, 0.34], [16.05, 12.18, 0.2]]) { const b = new THREE.Mesh(new RoundedBoxGeometry(46.3, hh, 0.35, 1, 0.05), trim); b.position.set(0, yy, zz); g.add(b); }
  const dent = []; for (let x = -22.6; x <= 22.6; x += 0.75) dent.push([x, 17.95, 12.45]);
  for (let z = -3.8; z <= 12.2; z += 0.75) { dent.push([-23.25, 17.95, z, Math.PI / 2]); dent.push([23.25, 17.95, z, Math.PI / 2]); }
  g.add(inst(new RoundedBoxGeometry(0.4, 0.5, 0.45, 1, 0.03), trim, dent));
  const corn2 = new THREE.Mesh(new RoundedBoxGeometry(46.7, 0.2, 16.5, 1, 0.06), trim); corn2.position.set(0, 17.55, 4.1); g.add(corn2);
  // alınlık eğik kornişi (iki kol) ve akroterler (köşe ve tepe vazoları)
  const rake = Math.atan2(6.2, 23.2), rl = Math.hypot(23.2, 6.2);
  for (const sx of [-1, 1]) {
    const rk = new THREE.Mesh(new RoundedBoxGeometry(rl + 0.6, 0.55, 1.5, 2, 0.12), trim);
    rk.position.set(sx * 11.6, 18.75 + 3.1 + 0.25, 12.1); rk.rotation.z = -sx * rake; g.add(rk);
  }
  const urnG = new THREE.LatheGeometry(V2([[0, 0], [0.75, 0], [0.75, 0.3], [0.45, 0.45], [0.4, 0.7], [0.75, 1.1], [0.85, 1.5], [0.7, 1.9], [0.35, 2.05], [0.4, 2.2], [0.2, 2.4], [0.08, 2.75], [0, 2.8]]), 28);
  for (const [ux, uy] of [[-22.6, 18.75], [22.6, 18.75], [0, 25.1]]) { const u = new THREE.Mesh(urnG, trim); u.position.set(ux, uy + 0.2, 12.0); g.add(u); }
  // alınlık kabartması: defne çelengi içinde terazi arması (merkez bankacılığının simgesi)
  {
    const relief = new THREE.Group();
    relief.position.set(0, 18.75 + 2.35, 12.8);
    const wreath = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.2, 10, 48), trim); relief.add(wreath);
    const leafG = new THREE.SphereGeometry(0.2, 8, 6).scale(1.4, 0.55, 0.5);
    const leaves = [];
    for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; if (Math.abs(a - Math.PI * 1.5) < 0.35) continue; leaves.push([Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.12, a + 0.6]); }
    const lm = new THREE.InstancedMesh(leafG, trim, leaves.length);
    leaves.forEach((p, i) => { dummy.position.set(p[0], p[1], p[2]); dummy.rotation.set(0, 0, p[3]); dummy.updateMatrix(); lm.setMatrixAt(i, dummy.matrix); });
    relief.add(lm);
    const beam = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.12, 0.14, 1, 0.04), trim); beam.position.set(0, 0.55, 0.1); relief.add(beam);
    const post = new THREE.Mesh(new RoundedBoxGeometry(0.14, 1.5, 0.14, 1, 0.04), trim); post.position.set(0, -0.1, 0.1); relief.add(post);
    for (const sx of [-1, 1]) { const pan = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), trim); pan.position.set(sx * 0.85, 0.02, 0.1); relief.add(pan); }
    // sağır çerçeve: kabartmanın kenarı
    g.add(relief);
  }
  // cephe pencerelerine denizlik ve söve başlıkları (alt sıra düz korniş, üst sıra üçgen alınlık)
  const hoodG = new RoundedBoxGeometry(2.9, 0.28, 0.75, 1, 0.05), sillG = new RoundedBoxGeometry(2.6, 0.2, 0.62, 1, 0.04);
  const triG = new THREE.ExtrudeGeometry(new THREE.Shape(V2([[-1.55, 0], [1.55, 0], [0, 0.75]])), { depth: 0.5, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
  const hoods = [], sills = [], tris = [];
  for (let row = 0; row < 2; row++) for (let c = 0; c < 8; c++) {
    if (row === 0 && (c === 3 || c === 4)) continue;
    const x = -16.8 + c * 4.8, y = 5.2 + row * 6;
    sills.push([x, y - 1.92, 6.3]);
    if (row === 0) hoods.push([x, y + 2.0, 6.35]); else tris.push([x, y + 1.9, 5.95]);
  }
  // yan cepheler: pilastrlar arasında iki sıra pencere
  const sideFr = [], sidePn = [], pil = [];
  for (const sx of [-1, 1]) {
    for (const z of [-9.5, -4.5, 0.5]) for (let row = 0; row < 2; row++) {
      const y = 5.2 + row * 6;
      sideFr.push([sx * 21.05, y, z, Math.PI / 2]); sidePn.push([sx * 21.31, y, z, sx * Math.PI / 2]);
      sills.push([sx * 21.3, y - 1.92, z, Math.PI / 2]);
      if (row === 0) hoods.push([sx * 21.35, y + 2.0, z, Math.PI / 2]); else tris.push([sx * 20.95, y + 1.9, z, sx * Math.PI / 2]);
    }
    for (const z of [-12, -7, -2, 3]) pil.push([sx * 21.05, 2.2, z]);
  }
  g.add(inst(hoodG, trim, hoods), inst(sillG, trim, sills), inst(triG, trim, tris), inst(frameG, trim, sideFr), inst(paneG, glassM, sidePn));
  g.add(inst(new RoundedBoxGeometry(1.1, 14.6, 1.1, 1, 0.06).translate(0, 7.3, 0), fluted({ color: 0xded5c3 }), pil));
  // kapı çerçevesi ve bronz kapı kanatları
  const dfr = new THREE.Mesh(new RoundedBoxGeometry(4.0, 6.2, 0.5, 2, 0.06), trim); dfr.position.set(0, 2.2 + 2.95, 5.98); g.add(dfr);
  const dhood = new THREE.Mesh(triG, trim); dhood.scale.set(1.4, 1.1, 1); dhood.position.set(0, 2.2 + 6.15, 6.0); g.add(dhood);
  const bronze = mat.brushedMetal({ color: 0x8a6a3a, rough: 0.4 });
  for (const sx of [-1, 1]) for (const [py, ph] of [[1.4, 2.2], [3.95, 2.4]]) { const pn = new THREE.Mesh(new RoundedBoxGeometry(1.2, ph, 0.12, 1, 0.04), bronze); pn.position.set(sx * 0.78, 2.2 + py, 6.3); g.add(pn); }
  // merdiven başında iki dökme demir şamdan lamba
  const lampPole = new THREE.LatheGeometry(V2([[0, 0], [0.55, 0], [0.55, 0.5], [0.3, 0.8], [0.22, 1.2], [0.14, 1.5], [0.12, 4.2], [0.2, 4.4], [0.1, 4.6], [0, 4.6]]), 20);
  const castIron = mat.paintedMetal({ color: 0x1f2321, wear: 0.2 });
  for (const sx of [-1, 1]) {
    const lp2 = new THREE.Mesh(lampPole, castIron); lp2.position.set(sx * 20.5, 0, 17.2); g.add(lp2);
    const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.9, 6), new THREE.MeshPhysicalMaterial({ color: 0xfff1d0, emissive: 0xffd89a, emissiveIntensity: 0.6, roughness: 0.2, transmission: 0.2 }));
    lan.position.set(sx * 20.5, 5.05, 17.2); g.add(lan);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.55, 6), castIron); cap.position.set(sx * 20.5, 5.78, 17.2); g.add(cap);
  }
  scene.add(g);
}
const bankLbl = sim.label('', { position: [BANK.x, 37, BANK.z - 2] });

// --- Enflasyon termometresi: meydandaki anıt (taş kaide, cam tüp, bronz başlık) ---
const TH = new THREE.Vector3(-6, 0.15, -12);
const TUBE_H = 26, TB = 3.2; // tüp boyu, tüp tabanı yüksekliği
const piToH = (pi) => TUBE_H * Math.sqrt(clamp(pi + 4, 0, 64) / 64);
let liquid, targetRing, expCone;
const liquidMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.6, roughness: 0.25 });
{
  const bronze = mat.brushedMetal({ color: 0x9c6b3c, rough: 0.4 });
  const base = new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 0], [3.2, 0], [3.2, 0.6], [2.7, 0.8], [2.4, 1.0], [2.4, 2.6], [2.7, 2.8], [2.7, 3.2], [0, 3.2]]), 48), ashlar({ color: 0xcfc6b4, course: 0.8 }));
  base.position.set(TH.x, TH.y, TH.z); scene.add(base);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, TUBE_H, 40, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xdfefff, transparent: true, opacity: 0.22, roughness: 0.04, metalness: 0, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }));
  glass.position.set(TH.x, TH.y + TB + TUBE_H / 2, TH.z); scene.add(glass);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.7, 32, 16), liquidMat);
  bulb.position.set(TH.x, TH.y + TB + 0.4, TH.z); scene.add(bulb);
  liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1, 24).translate(0, 0.5, 0), liquidMat);
  liquid.position.set(TH.x, TH.y + TB, TH.z); scene.add(liquid);
  const cap = new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 0], [1.6, 0], [1.6, 0.5], [1.1, 0.9], [0.6, 1.8], [0.2, 2.6], [0, 2.7]]), 32), bronze);
  cap.position.set(TH.x, TH.y + TB + TUBE_H, TH.z); scene.add(cap);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.18, 10, 40).rotateX(Math.PI / 2), bronze);
  collar.position.set(TH.x, TH.y + TB + 0.1, TH.z); scene.add(collar);
  // bronz ölçek şeridi + çizgiler
  const strip = new THREE.Mesh(new RoundedBoxGeometry(0.5, TUBE_H, 0.3, 1, 0.08), bronze);
  strip.position.set(TH.x - 1.75, TH.y + TB + TUBE_H / 2, TH.z); scene.add(strip);
  for (const v of [0, 5, 10, 20, 40]) {
    const t = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.14, 0.34, 1, 0.04), bronze);
    t.position.set(TH.x - 2.1, TH.y + TB + piToH(v), TH.z);
    scene.add(t);
    sim.label(`%${v}`, { position: [TH.x - 3.6, TH.y + TB + piToH(v), TH.z], className: 'plain' });
  }
  targetRing = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.14, 10, 40).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2) }));
  targetRing.position.set(TH.x, TH.y + TB + piToH(2), TH.z);
  expCone = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.1, 16).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.6, 2.0) }));
  scene.add(targetRing, expCone);
}
const piLbl = sim.label('', { position: [TH.x + 1, TH.y + TB + TUBE_H + 5, TH.z] });

// --- Fabrikalar: tuğla sanayi yapıları, testere dişi çatı, tuğla bacalar; üretim → pencere ışığı + duman ---
const FACT = [[16, -22], [34, -24], [52, -21], [42, -2]];
const CHIMNEYS = [];
const windowMats = [];
{
  const brick = oldBrick({ color: 0x8e4a33 });
  const roofMat = mat.paintedMetal({ color: 0x59626b, wear: 0.35 });
  const skyl = new THREE.MeshPhysicalMaterial({ color: 0x9fb2c0, roughness: 0.15, metalness: 0.3 });
  const chimG = new THREE.LatheGeometry(V2([[0, 0], [1.5, 0], [1.45, 1.2], [1.25, 1.4], [0.95, 20], [1.15, 20.3], [1.15, 21], [0.8, 21], [0.8, 20.6], [0, 20.6]]), 32);
  const sawProfile = new THREE.Shape(V2([[0, 0], [4, 0], [4, 2.8], [0, 0]]));
  const sawG = new THREE.ExtrudeGeometry(sawProfile, { depth: 13, bevelEnabled: false }).translate(-2, 0, -6.5);
  FACT.forEach(([fx, fz], k) => {
    const g = new THREE.Group();
    g.position.set(fx, 0.15, fz);
    g.rotation.y = k === 3 ? -0.08 : 0.04 * (k - 1);
    const hall = new THREE.Mesh(new RoundedBoxGeometry(16, 8, 13, 2, 0.1), brick);
    hall.position.y = 4; g.add(hall);
    for (let j = 0; j < 4; j++) {
      const saw = new THREE.Mesh(sawG, roofMat);
      saw.position.set(-6 + j * 4, 8, 0); g.add(saw);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(13, 2.6).rotateY(Math.PI / 2), skyl);
      gl.position.set(-6 + j * 4 + 2.02, 9.4, 0); g.add(gl);
    }
    const wm = new THREE.MeshStandardMaterial({ color: 0x20262c, emissive: 0xffc76a, emissiveIntensity: 0.0, roughness: 0.2, metalness: 0.2 });
    windowMats.push(wm);
    for (let j = 0; j < 5; j++) {
      const fr = new THREE.Mesh(new RoundedBoxGeometry(2.1, 3.4, 0.3, 1, 0.05), mat.paintedMetal({ color: 0x2d3a34, wear: 0.3 }));
      fr.position.set(-6 + j * 3, 4.2, 6.55); g.add(fr);
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.1), wm);
      w.position.set(-6 + j * 3, 4.2, 6.72); g.add(w);
    }
    const c = new THREE.Mesh(chimG, brick);
    c.position.set(5.5, 0, -4.5); g.add(c);
    scene.add(g);
    g.updateMatrixWorld();
    CHIMNEYS.push(new THREE.Vector3(5.5, 21, -4.5).applyMatrix4(g.matrixWorld));
  });
}
const outLbl = sim.label('', { position: [36, 30, -22] });
// Duman: yumuşak yuvarlak sprite'lar (yükselir, genişler, söner)
const SMOKE = 120;
const puffTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const smokeSprites = Array.from({ length: SMOKE }, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xd9d4cc, transparent: true, opacity: 0, depthWrite: false }));
  s.visible = false; scene.add(s); return s;
});
const puffs = Array.from({ length: SMOKE }, () => ({ life: -1, x: 0, y: 0, z: 0, age: 0, c: 0 }));
let smokeAcc = 0;

// --- İşsizlik kuyruğu: iş bulma ofisinin önünde bekleyen insanlar (gerçek boy) ---
const Q_MAX = 60;
const OFFICE = new THREE.Vector3(-30, 0.15, 30);
// Motorun eklemli figürleri (@core crowd): iş arayanlar günlük/ofis giysili, ofise doğru dönük bekler (ağırlık aktarımı, nefes, baş hareketi)
const queue = crowd(Q_MAX, { seed: 29, camera: sim.camera, poses: ['stand'], outfits: { casual: 5, office: 3, student: 1, worker: 1 } });
scene.add(queue.group);
const qPos = [];
for (let k = 0; k < Q_MAX; k++) {
  const row = Math.floor(k / 20), col = k % 20;
  qPos.push([OFFICE.x + 5.8 + col * 0.95 + (row % 2) * 0.45 + Math.sin(k * 7.1) * 0.12, OFFICE.z + 1.5 + row * 1.2 + Math.cos(k * 3.3) * 0.15, Math.sin(k * 2.7) * 0.6]);
}
{
  // Ofis: cam cepheli küçük modern bina + ışıklı tabela
  const off = new THREE.Group();
  off.position.copy(OFFICE);
  const shell = new THREE.Mesh(new RoundedBoxGeometry(10, 4.6, 7, 2, 0.1), mat.concrete({ color: 0xc9c4ba }));
  shell.position.y = 2.3; off.add(shell);
  const glz = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.2), new THREE.MeshPhysicalMaterial({ color: 0x223040, roughness: 0.05, metalness: 0.3, clearcoat: 1 }));
  glz.position.set(0, 1.9, 3.52); off.add(glz);
  const cano = new THREE.Mesh(new RoundedBoxGeometry(11, 0.3, 2.2, 1, 0.06), mat.brushedMetal({ color: 0xa9adb2 }));
  cano.position.set(0, 4.0, 4.2); off.add(cano);
  const signTex = textTexture('İŞ ARAYANLAR', { size: 56, bg: '#1e3a8a', color: '#ffffff' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 6 / signTex.userData.aspect),
    new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.4 }));
  sign.position.set(0, 4.75, 5.32); off.add(sign);
  scene.add(off);
}
const uLbl = sim.label('', { position: [OFFICE.x + 13, 3.2, OFFICE.z + 2.5] });
let qShown = 0;

// --- Parasal aktarım borusu (veri katmanı): bankadan fabrikalara giden cam boru ve ışık darbeleri ---
const pipeCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-26, 12, -12), new THREE.Vector3(-14, 17, -4), new THREE.Vector3(4, 16, -2),
  new THREE.Vector3(20, 13, -10), new THREE.Vector3(30, 11, -17),
]);
const pipeGroup = new THREE.Group();
scene.add(pipeGroup);
{
  const tube = new THREE.Mesh(new THREE.TubeGeometry(pipeCurve, 96, 0.7, 16, false),
    new THREE.MeshPhysicalMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.2, roughness: 0.05, clearcoat: 1, depthWrite: false }));
  pipeGroup.add(tube);
}
const pipeLbl = sim.label('', { parent: pipeGroup, position: [0, 19, -3], className: 'plain' });
const PULSES = 16;
const pulseMesh = instanced(new THREE.SphereGeometry(0.55, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }), PULSES);
pulseMesh.frustumCulled = false;
pipeGroup.add(pulseMesh);
const pulses = Array.from({ length: PULSES }, () => ({ on: false, born: 0, col: new THREE.Color() }));
let pulseIdx = 0;
const TIGHT = new THREE.Color(0x3b82f6), LOOSE = new THREE.Color(0xf97316), NEUTRAL = new THREE.Color(0xe5e7eb);
const HDR = new THREE.Color();

// --- Zaman adımı ---
let acc = 0, qTime = 0;
function stepQuarter() {
  eco.step();
  const gap = eco.r - P.rStar;
  const p = pulses[pulseIdx++ % PULSES];
  p.on = true; p.born = eco.q;
  p.col.copy(NEUTRAL).lerp(gap > 0 ? TIGHT : LOOSE, clamp(Math.abs(gap) / 4, 0, 1));
  pushCharts();
  updateStats();
}

sim.onUpdate((dt) => {
  acc += dt;
  while (acc >= Q_SEC) { acc -= Q_SEC; stepQuarter(); }
  qTime = acc / Q_SEC;
});

const _c = new THREE.Color(), _v = new THREE.Vector3();
let disp = { i: eco.i, pi: eco.pi, pie: eco.pie, y: 0 };
sim.onRender((dt) => {
  const k = 1 - Math.exp(-dt * 4);
  disp.i = lerp(disp.i, eco.i, k); disp.pi = lerp(disp.pi, eco.pi, k); disp.pie = lerp(disp.pie, eco.pie, k); disp.y = lerp(disp.y, eco.y, k);
  needle.rotation.z = -dialAngle(disp.i);
  // termometre
  const h = Math.max(0.05, piToH(disp.pi));
  liquid.scale.y = h;
  heatColor(clamp(0.35 + (disp.pi - P.target) / 16, 0, 1), _c);
  liquidMat.color.copy(_c); liquidMat.emissive.copy(_c);
  targetRing.position.y = TH.y + TB + piToH(P.target);
  expCone.position.set(TH.x + 2.0, TH.y + TB + piToH(disp.pie), TH.z);
  // fabrikalar: kapasite kullanımı → yanan pencere sayısı ve duman
  const util = clamp(0.5 + disp.y / 10, 0.05, 1);
  windowMats.forEach((m, j) => { const on = util > (j + 0.5) / FACT.length * 0.9; m.emissiveIntensity = lerp(m.emissiveIntensity, on ? 2.2 : 0, k); });
  smokeAcc += dt * util * 26;
  while (smokeAcc > 1) {
    smokeAcc -= 1;
    const p = puffs.find((q) => q.life < 0);
    if (!p) break;
    const c = CHIMNEYS[Math.floor(Math.random() * CHIMNEYS.length)];
    Object.assign(p, { life: 1, age: 0, x: c.x, y: c.y, z: c.z, c: Math.random() });
  }
  puffs.forEach((p, j) => {
    const sp = smokeSprites[j];
    if (p.life >= 0) {
      p.age += dt;
      p.y += dt * (2.4 - p.age * 0.3); p.x += dt * (1.6 + p.c); p.z += dt * 0.5; p.life = 1 - p.age / 6;
    }
    sp.visible = p.life >= 0;
    if (!sp.visible) return;
    const s = 2.2 + p.age * 2.2;
    sp.position.set(p.x, p.y, p.z); sp.scale.set(s, s, 1);
    sp.material.opacity = 0.55 * Math.min(1, p.age * 3) * p.life;
    sp.material.rotation = p.c * 6;
  });
  // kuyruk
  const want = clamp(Math.round(eco.u * 3), 0, Q_MAX);
  if (want !== qShown) {
    qShown = want;
    for (let j = 0; j < Q_MAX; j++) {
      const [x, z, ry] = qPos[j];
      if (j < want) queue.set(j, x, 0.15, z, -Math.PI / 2 + ry * 0.6, 'stand'); else queue.hide(j);   // yüz ofise (−x)
    }
  }
  queue.update(performance.now() / 1000);
  // aktarım darbeleri: L çeyrekte bankadan fabrikalara ulaşır
  pulses.forEach((p, j) => {
    let s = 0;
    if (p.on) {
      const t = (eco.q - p.born + qTime) / Math.max(1, P.lag);
      if (t > 1.05) p.on = false;
      else { pipeCurve.getPointAt(clamp(t, 0, 1), _v); s = 1; }
    }
    dummy.position.copy(_v); dummy.scale.setScalar(s); dummy.updateMatrix();
    pulseMesh.setMatrixAt(j, dummy.matrix);
    pulseMesh.setColorAt(j, HDR.copy(p.col).multiplyScalar(3));
  });
  pulseMesh.instanceMatrix.needsUpdate = true;
  if (pulseMesh.instanceColor) pulseMesh.instanceColor.needsUpdate = true;
});

// --- Arayüz ---
const ui = sim.ui;
const pct = (v, d = 1) => `%${fmt(v, d)}`;

ui.section('Hazır senaryolar');
const PRESETS = {
  sakin: { label: '🌤 Sakin denge', set: {}, run: () => {} },
  petrol: { label: '⛽ Enerji şoku', set: {}, run: () => shock('enerji') },
  talep: { label: '🛍 Talep patlaması', set: {}, run: () => shock('talep') },
  sabit: { label: '📌 Faizi sabit tutan banka', set: { rule: false, manual: 4, cred: 0.25 }, run: () => shock('talep') },
  yuksek: { label: '🔥 Yüksek enflasyondan dönüş', set: { target: 5, cred: 0.2, smooth: 0.6 }, init: { pi: 45, pie: 45, i: 48 }, run: () => {} },
  kur: { label: '💱 Kur şoku', set: { cred: 0.4 }, run: () => shock('kur') },
};
const DEFAULTS = { target: 2, rStar: 2, uStar: 5, phiPi: 0.5, phiY: 0.5, smooth: 0.5, rule: true, manual: 4, cred: 0.6, lag: 2, a: 0.25, kappa: 0.2, passThru: 0.3, shockSize: 1 };
const presetBtns = Object.entries(PRESETS).map(([k, v]) => ({ label: v.label, onClick: () => loadPreset(k) }));
for (let j = 0; j < presetBtns.length; j += 2) ui.buttons(presetBtns.slice(j, j + 2));

ui.section('Şok ver (şimdi)');
ui.buttons([
  { label: '⛽ Enerji / petrol', onClick: () => shock('enerji') },
  { label: '🛍 Talep patlaması', onClick: () => shock('talep') },
]);
ui.buttons([
  { label: '💱 Kur değer kaybı', onClick: () => shock('kur') },
  { label: '📉 Güven kaybı', onClick: () => shock('guven') },
]);
const sizeS = ui.slider({ label: 'Şok büyüklüğü', min: 0.5, max: 3, step: 0.5, value: 1, format: (v) => `${fmt(v, 1)}×`, onChange: (v) => (P.shockSize = v) });

ui.section('Para politikası');
const modeSeg = ui.segmented({
  options: [{ value: 'taylor', label: '📐 Taylor kuralı' }, { value: 'manuel', label: '✋ Manuel faiz' }],
  value: 'taylor', onChange: (v) => { P.rule = v === 'taylor'; if (!P.rule) manualS.set(fmt0(eco.i)); P.manual = manualS.value; syncMode(); },
});
const fmt0 = (v) => Math.round(v * 4) / 4;
const manualS = ui.slider({ label: 'Politika faizi (manuel)', min: 0, max: 60, step: 0.25, value: 4, format: (v) => pct(v, 2), onInput: (v) => (P.manual = v) });
const targetS = ui.slider({ label: 'Enflasyon hedefi π*', min: 0, max: 10, step: 0.5, value: 2, format: (v) => pct(v), onInput: (v) => (P.target = v) });
const rStarS = ui.slider({ label: 'Nötr reel faiz r* (temsili)', min: 0, max: 5, step: 0.25, value: 2, format: (v) => pct(v, 2), onInput: (v) => (P.rStar = v) });
const phiPiS = ui.slider({ label: 'Taylor φπ (enflasyon tepkisi)', min: -0.5, max: 2, step: 0.1, value: 0.5, format: (v) => fmt(v, 1), onInput: (v) => (P.phiPi = v) });
const phiYS = ui.slider({ label: 'Taylor φy (çıktı açığı tepkisi)', min: 0, max: 1.5, step: 0.1, value: 0.5, format: (v) => fmt(v, 1), onInput: (v) => (P.phiY = v) });
const smoothS = ui.slider({ label: 'Faiz yumuşatma (kademeli adım)', min: 0, max: 0.9, step: 0.1, value: 0.5, format: (v) => fmt(v, 1), onInput: (v) => (P.smooth = v) });
const ruleText = ui.text('', 'card');

ui.section('Ekonomi (temsilî parametreler)');
const credS = ui.slider({ label: 'Güvenilirlik c (beklenti çıpası)', min: 0, max: 1, step: 0.05, value: 0.6, format: (v) => fmt(v, 2), onInput: (v) => (P.cred = v) });
const lagS = ui.slider({ label: 'Politika gecikmesi', min: 1, max: 6, step: 1, value: 2, unit: 'çeyrek', onInput: (v) => (P.lag = v) });
const aS = ui.slider({ label: 'Talebin reel faize duyarlılığı a', min: 0.05, max: 0.6, step: 0.05, value: 0.25, format: (v) => fmt(v, 2), onInput: (v) => (P.a = v) });
const kS = ui.slider({ label: 'Phillips eğimi κ', min: 0.05, max: 0.5, step: 0.05, value: 0.2, format: (v) => fmt(v, 2), onInput: (v) => (P.kappa = v) });
const ptS = ui.slider({ label: 'Kur geçişkenliği', min: 0, max: 0.6, step: 0.05, value: 0.3, format: (v) => pct(v * 100, 0), onInput: (v) => (P.passThru = v) });
const uStarS = ui.slider({ label: 'Doğal işsizlik u*', min: 2, max: 12, step: 0.5, value: 5, format: (v) => pct(v), onInput: (v) => (P.uStar = v) });

ui.section('Durum');
const stPi = ui.stat({ label: 'Enflasyon (yıllık)' });
const stPie = ui.stat({ label: 'Beklenen enflasyon' });
const stI = ui.stat({ label: 'Politika faizi' });
const stR = ui.stat({ label: 'Reel faiz (i − πᵉ)' });
const stY = ui.stat({ label: 'Çıktı açığı' });
const stU = ui.stat({ label: 'İşsizlik' });
const fisher = ui.text('', 'card');
const chPi = ui.chart({ title: 'Enflasyon, beklenti ve hedef (%)', maxPoints: 80,
  series: [{ name: 'Enflasyon', color: '#ef4444' }, { name: 'Beklenti', color: '#c084fc' }, { name: 'Hedef', color: '#e5e7eb' }] });
const chI = ui.chart({ title: 'Politika faizi ve reel faiz (%)', maxPoints: 80,
  series: [{ name: 'Politika faizi', color: '#38bdf8' }, { name: 'Reel faiz', color: '#22c55e' }, { name: 'Nötr r*', color: '#64748b' }] });
const chY = ui.chart({ title: 'Çıktı açığı ve işsizlik (%)', maxPoints: 80,
  series: [{ name: 'Çıktı açığı', color: '#facc15', fill: true }, { name: 'İşsizlik', color: '#fb923c' }] });
ui.text('<small>Her adım bir çeyrektir (3 ay). Tüm katsayılar temsilîdir; gerçek bir ekonomiye kalibre edilmemiştir.</small>');

ui.section('Görünüm', { open: false });
ui.buttons([
  { label: '🏙️ Meydan (genel)', onClick: () => sim.moveCamera([42, 34, 92], [-6, 11, -8]) },
  { label: '🏦 Banka kadranı', onClick: () => sim.moveCamera([-30, 24, 30], [-44, 26, -16]) },
]);
ui.buttons([
  { label: '🌡 Termometre', onClick: () => sim.moveCamera([10, 12, 22], [-6, 14, -12]) },
  { label: '🏭 Fabrikalar', onClick: () => sim.moveCamera([60, 16, 22], [34, 8, -16]) },
]);
ui.toggle({ label: 'Parasal aktarım borusu', value: true, onChange: (v) => (pipeGroup.visible = v) });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => scene.traverse((o) => { if (o.isCSS2DObject) o.visible = v; }) });

function syncMode() {
  manualS.disable(P.rule);
  [phiPiS, phiYS, smoothS].forEach((s) => s.disable(!P.rule));
}

function shock(kind) {
  const m = P.shockSize;
  if (kind === 'enerji') { eco.s += 4 * m; sim.toast(`⛽ Enerji fiyatları sıçradı: maliyet (arz) şoku`, 'warn'); }
  if (kind === 'talep') { eco.d += 2.5 * m; sim.toast('🛍 Talep patlaması: harcamalar hızla artıyor', 'warn'); }
  if (kind === 'kur') {
    const dep = 20 * m; // % değer kaybı
    eco.s += dep * P.passThru * 4 * 0.35; // fiyat düzeyine toplam etki ≈ değer kaybı × geçişkenlik
    eco.d += 0.4 * m;
    sim.toast(`💱 Ulusal para %${fmt(dep)} değer kaybetti; geçişkenlik %${fmt(P.passThru * 100)} → fiyatlara yansıyor`, 'warn');
  }
  if (kind === 'guven') { eco.credHit += 0.4 * m; eco.bias += 2 * m; sim.toast('📉 Güven kaybı: beklentiler hedeften kopuyor', 'bad'); }
}

function applyParams(o) {
  const v = { ...DEFAULTS, ...o };
  Object.assign(P, v);
  manualS.set(v.manual); targetS.set(v.target); rStarS.set(v.rStar); phiPiS.set(v.phiPi); phiYS.set(v.phiY); smoothS.set(v.smooth);
  credS.set(v.cred); lagS.set(v.lag); aS.set(v.a); kS.set(v.kappa); ptS.set(v.passThru); uStarS.set(v.uStar); sizeS.set(v.shockSize);
  modeSeg.set(v.rule ? 'taylor' : 'manuel');
  syncMode();
}

let current = 'sakin';
function loadPreset(k) {
  current = k;
  const pr = PRESETS[k];
  applyParams(pr.set);
  restart(pr.init);
  pr.run();
}

function restart(init) {
  eco.reset(init || {});
  acc = 0; qTime = 0;
  sim.time = 0;
  pulses.forEach((p) => (p.on = false));
  disp = { i: eco.i, pi: eco.pi, pie: eco.pie, y: eco.y };
  [chPi, chI, chY].forEach((c) => c.clear());
  pushCharts();
  updateStats();
}

function pushCharts() {
  chPi.push([eco.pi, eco.pie, P.target]);
  chI.push([eco.i, eco.r, P.rStar]);
  chY.push([eco.y, eco.u]);
}

function updateStats() {
  const dPi = eco.pi - P.target;
  stPi.set(pct(eco.pi), Math.abs(dPi) < 1 ? 'good' : Math.abs(dPi) < 4 ? 'warn' : 'bad');
  stPie.set(pct(eco.pie), Math.abs(eco.pie - P.target) < 1 ? 'good' : 'warn');
  stI.set(pct(eco.i, 2));
  const gap = eco.r - P.rStar;
  stR.set(pct(eco.r), gap > 0.5 ? 'good' : gap < -0.5 ? 'warn' : '');
  stY.set(`${eco.y >= 0 ? '+' : ''}${fmt(eco.y, 1)}`, Math.abs(eco.y) < 1 ? 'good' : Math.abs(eco.y) < 3 ? 'warn' : 'bad');
  stU.set(pct(eco.u), eco.u - P.uStar > 2 ? 'bad' : eco.u - P.uStar > 0.5 ? 'warn' : '');
  const stance = gap > 0.5 ? '<b style="color:#60a5fa">sıkı</b> (talebi yavaşlatır)' : gap < -0.5 ? '<b style="color:#fb923c">gevşek</b> (talebi canlandırır)' : '<b>nötr</b>';
  fisher.set(`<b>Fisher:</b> reel faiz = ${pct(eco.i, 2)} − ${pct(eco.pie)} = <b>${pct(eco.r)}</b><br>Nötr faiz r* = ${pct(P.rStar, 2)} → duruş ${stance}.
    <br><small>Etkisi ${P.lag} çeyrek sonra üretime ulaşır.</small>`);
  const tay = eco.taylor();
  ruleText.set(P.rule
    ? `Taylor önerisi: ${pct(P.rStar, 2)} + ${pct(eco.pi)} + ${fmt(P.phiPi, 1)}·(${fmt(dPi, 1)}) + ${fmt(P.phiY, 1)}·(${fmt(eco.y, 1)}) = <b>${pct(Math.max(0, tay), 2)}</b>`
    : `Manuel mod: faiz <b>${pct(P.manual, 2)}</b>. Taylor kuralı şu an <b>${pct(Math.max(0, tay), 2)}</b> önerirdi.`);
  bankLbl.setText(`🏦 Politika faizi <b>${pct(eco.i, 2)}</b>`);
  piLbl.setText(`🌡 Enflasyon <b>${pct(eco.pi)}</b><br><small style="color:#d8b4fe">beklenti ${pct(eco.pie)}</small> · <small>hedef ${pct(P.target)}</small>`);
  outLbl.setText(`🏭 Çıktı açığı <b>${eco.y >= 0 ? '+' : ''}${fmt(eco.y, 1)}</b>`);
  uLbl.setText(`🧍 İşsizlik <b>${pct(eco.u)}</b>`);
  pipeLbl.setText(`<span style="color:#cbd5e1">parasal aktarım · ${P.lag} çeyrek gecikme</span>`);
}

sim.onReset(() => loadPreset(current));
applyParams({});
restart();
