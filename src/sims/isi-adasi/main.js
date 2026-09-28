// Şehir Isı Adası — hücre tabanlı yüzey enerji dengesi, termal kamera, gün/gece döngüsü ve tıklayarak yeşillendirme.
// Sahne: gerçek ölçekli kent (12 m hücre; cepheli binalar, asfalt yollar, kaldırımlar, ağaçlar) + çevresinde kırsal arazi ve tarlalar,
// fiziksel gökyüzüyle gün/gece döngüsü. Termal kamera, sahnenin üstüne yarı saydam bir veri katmanı olarak biner.
import { createSim, THREE, fmt, clamp, lerp, seeded, heatColor, landscape, createTerrain, terrainSkirt, createVegetation, procedural, mat, RoundedBoxGeometry,
  makeCity, makeBlock, populateCity, streetTrees, streetMaterials as groundMats, cityRng, crowd } from '@core';
import { solve, sunElev, ASPHALT } from './model.js';

let hour = 14;
const G = 17, CS = 12, HALF = (G * CS) / 2; // hücre 12 m (bir sokak genişliği)
const T_LO = 18, T_HI = 62; // termal kamera renk ölçeği (°C)
const LOW = /[?&]low\b/.test(location.search);

const sim = createSim({
  sky: { elevation: 55, azimuth: 205, clouds: 0.3, haze: 0.85, visibility: 6500 },
  camera: { position: [44, 21, 156], target: [-12, 11, 20], fov: 50, near: 0.5, far: 40000 },
  controls: { maxDistance: 720, minDistance: 40, maxPolarAngle: Math.PI * 0.47 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Temsili bir kent dokusu (yollar, bina adaları, parklar) ve çevresindeki kırsal alan. Her hücre için basit bir
    <b>yüzey enerji dengesi</b> çözülür: emilen güneş ışınımı (1 − albedo), uzun dalga ışınım kaybı, havaya verilen duyulur ısı,
    bitkilerin terlemesiyle <b>buharlaşma serinlemesi</b>, zemine/binaya depolanan ısı ve trafik–klima kaynaklı <b>atık ısı</b>.</p>
    <p>Çatılar modeldeki yüzeyle aynı malzemeyi taşır: koyu bitümlü membran (albedo ≈0,1), beyaz serin çatı membranı (≈0,7),
    toprak ve bitkili yeşil çatı, alçak evlerde kil kiremit (≈0,25). Düz çatılarda su deposu ve güneş enerjili su ısıtıcıları görülür.</p>
    <p>Koyu asfalt ve çatılar gündüz güneşi emip depolar; dar sokak kanyonları geceleyin gökyüzüne ısı yayamaz.
    Bu yüzden kent–kır hava sıcaklığı farkı çoğunlukla <b>gece</b> en büyüktür (tipik 2–5 °C).</p>
    <h3>Dene</h3>
    <ul>
      <li>"Termal kamera"yı aç, saat 14:00 civarında asfalt ile parkı karşılaştır.</li>
      <li>Beyaz çatı oranını %80 yap: gündüz çatı sıcaklığı kaç derece düştü?</li>
      <li>Bina yüksekliğini artır: gündüz sokaklar gölgelenir ama gece ısı adası büyür.</li>
      <li>Haritada hücrelere tıklayarak ağaç dik veya çatıları boya.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Açık renkli "serin çatılar" güneşin çoğunu geri yansıtır; ağaçlar hem gölge yapar hem de terleyerek havayı serinletir.
    Birçok şehir ağaçlandırma, yeşil çatı ve açık renkli kaplamayla ısı dalgalarında sağlık riskini ve klima yükünü azaltmaya çalışıyor.</p>
    <p><small>Model: açık ve rüzgârsız bir temmuz günü, 41° K enlemi; kırsal hava 21–32 °C. Albedo, ısı kapasitesi ve buharlaşma
    değerleri tipik literatür aralıklarından seçilmiş yaklaşık değerlerdir. Kent havası tek bir "kutu" olarak alınır (gündüz karışım
    güçlü, gece zayıf). Klima tahmini: 100 m² daire, 24 °C üzeri her derece-saat için ≈0,05 kWh elektrik (COP ≈ 3).</small></p>`,
});

// --- Hücreler ---
const rnd = seeded(11);
const cells = [];
const BP = 10.67; // ada içi parsel aralığı (2 m kaldırım düşülünce)
const vis = (i) => { // hücre indeksinden görsel konum: yollar tam hücrede, parseller kaldırımın içinde
  const b = Math.floor(i / 4), l = i % 4;
  return l === 0 ? -HALF + CS * (i + 0.5) : -HALF + CS * (4 * b + 2 + 0.5) + (l - 2) * BP;
};
for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
  const road = i % 4 === 0 || j % 4 === 0;
  cells.push({ i, j, x: vis(i), z: vis(j), road, r: rnd(), q: rnd(), hv: 0.7 + rnd() * 0.6, ov: null, type: 'road', tree: 0 });
}

const floorsOf = (c) => Math.max(1, Math.round((Math.max(3.6, hwS.value * CS * c.hv) - 1) / 3));
function assign() {
  const park = parkS.value / 100, white = whiteS.value / 100, green = greenS.value / 100;
  for (const c of cells) {
    if (c.road) {
      c.type = 'road';
      c.tree = c.ov === 'tree' ? 1 : c.ov === 'none' ? 0 : c.r < park * 0.8 ? 0.8 : 0;
      continue;
    }
    let t = c.r < park * 0.6 ? (c.q < 0.5 ? 'tree' : 'park') : 'roof';
    if (t === 'roof') t = c.q < white ? 'white' : c.q < white + green ? 'green' : 'roof';
    if (t === 'roof' && floorsOf(c) <= 3) t = 'tile';          // alçak binalar: kiremit çatılı evler
    if (c.ov) t = c.ov === 'none' ? 'roof' : c.ov;
    c.type = t;
    c.tree = 0;
  }
}

// --- Kent iskeleti: yollar, kaldırımlar, lambalar, park etmiş araçlar ---
const RL = [0, 4, 8, 12, 16].map((i) => -HALF + CS * (i + 0.5));
// motor sokak kiti: asfalt, şerit/yaya geçidi çizgileri, granit bordürlü kaldırım, rögar/ızgara, lambalar, park etmiş araçlar
const city = makeCity({ xs: RL, zs: RL, road: 12, walk: 2, seed: 5, parked: LOW ? 24 : 40, trees: false, lamps: true, lawnInside: false, lots: () => [] });
sim.scene.add(city.group);
const GM = groundMats();
// Kaldırımlarda yürüyen insanlar (motor figürleri, @core crowd): her adanın çevresinde bordürden 1,4–1,8 m içeride döner;
// gece sokaklar boşalır (yalnız birkaç kişi kalır). Isı modeline katılmazlar.
const folk = (() => {
  const rr = cityRng(63), per = LOW ? 3 : 7, W = [];
  for (let a = 0; a + 1 < RL.length; a++) for (let b = 0; b + 1 < RL.length; b++) for (let k = 0; k < per; k++) {
    const d = 6 + 1.4 + rr() * 0.4;
    W.push({ r: [RL[a] + d, RL[b] + d, RL[a + 1] - d, RL[b + 1] - d], s: (k + rr() * 0.7) / per, v: 1.0 + rr() * 0.5, dir: k % 2 ? 1 : -1, night: rr() < 0.25, yaw: 0 });
  }
  const c = crowd(W.length, { seed: 19, camera: sim.camera, outfits: { casual: 7, office: 3, student: 2, worker: 1 } });
  c.group.position.y = 0.15;   // kaldırım üst kotu
  sim.scene.add(c.group);
  let lit = 0;
  const at = (w) => {
    const [x0, z0, x1, z1] = w.r, X = x1 - x0, Z = z1 - z0;
    let p = (((w.s % 1) + 1) % 1) * 2 * (X + Z);
    if (p < X) return [x0 + p, z0, w.dir, 0];
    if ((p -= X) < Z) return [x1, z0 + p, 0, w.dir];
    if ((p -= Z) < X) return [x1 - p, z1, -w.dir, 0];
    p -= X; return [x0, z1 - p, 0, -w.dir];
  };
  return {
    setLit(v) { lit = v; },
    update(real, moving) {
      W.forEach((w, i) => {
        if (lit > 0.5 && !w.night) { c.hide(i); return; }
        if (moving) w.s += (w.dir * w.v * Math.min(real, 0.1)) / (2 * (w.r[2] - w.r[0] + w.r[3] - w.r[1]));
        const [x, z, dx, dz] = at(w);
        let d = Math.atan2(dx, dz) - w.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        w.yaw += d * Math.min(1, real * 6);
        c.set(i, x, 0, z, w.yaw, 'walk');
      });
      c.update(performance.now() / 1000);
    },
  };
})();

// --- Kırsal: tepeler, tarlalar, ağaçlar ---
const hfun = landscape({ seed: 31, size: 2400, height: 150, warp: 0.35, octaves: 6,
  shape: (x, z, h) => {
    const d = Math.max(Math.abs(x), Math.abs(z)), t = THREE.MathUtils.smoothstep(d, 150, 1100);
    // kuzeyde (ufukta) metropolün geri kalanının oturduğu düzlük
    const fl = THREE.MathUtils.smoothstep(-z, 560, 760) * (1 - THREE.MathUtils.smoothstep(Math.abs(x), 1500, 1900));
    return -0.25 + t * (h * (1 - 0.85 * fl) + 10);
  } });
const terrain = createTerrain(hfun, { size: [3200, 3200], res: LOW ? [128, 128] : [220, 220],
  materialOptions: { water: -60, grassAmount: 0.55, forest: 0.45, grass: 0x6b7433, dry: 0xa8925e, soil: 0x7a6247 } });
terrain.userData.noFit = true;
sim.scene.add(terrain, terrainSkirt(hfun, { inner: 1600, outer: 22000 }));
const cityFree = (x, z) => Math.max(Math.abs(x), Math.abs(z)) < HALF + 24;
// Ufuktaki kent: yeşil kuşağın ötesinde metropolün diğer semtleri (motor kent kiti; uzak karolar tek çizimli kabuk)
const FAR = { x0: -1500, x1: 1500, z0: -2600, z1: -720 };
const inFar = (x, z) => x > FAR.x0 - 30 && x < FAR.x1 + 30 && z > FAR.z0 - 30 && z < FAR.z1 + 30;
{
  const lots = [], r = cityRng(91), S = 118;
  for (let x = FAR.x0; x < FAR.x1; x += S) for (let z = FAR.z0; z < FAR.z1; z += S) {
    if (r() < (LOW ? 0.4 : 0.22)) continue;                     // park, boş parsel
    const dn = (-z - 720) / 1900;
    const L = makeBlock({ x0: x + 9, x1: x + S - 9, z0: z + 9, z1: z + S - 9 }, {
      seed: r() * 1000, gap: r() < 0.5 ? 0 : 3, shops: 0.5, mix: { apartment: 0.8, house: 0.12, office: 0.08 },
      floors: (xx, zz, rr, type) => (type === 'apartment' ? 4 + Math.floor(rr() * 5 + dn * 3) : type === 'office' ? 10 + Math.floor(rr() * 14) : undefined),
    });
    for (const l of L) { l.y0 = hfun(l.x, l.z) - 0.3; lots.push(l); }
  }
  const far = populateCity({ lots, tile: 400, near: 250, noRaycast: true });
  sim.scene.add(far.group);
  // kentsel zemin (asfalt + beton karışımı), araziyi izler
  const g = new THREE.PlaneGeometry(FAR.x1 - FAR.x0 + 40, FAR.z1 - FAR.z0 + 40, 60, 40).rotateX(-Math.PI / 2).translate((FAR.x0 + FAR.x1) / 2, 0, (FAR.z0 + FAR.z1) / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, hfun(p.getX(i), p.getZ(i)) + 0.15);
  g.computeVertexNormals();
  const ground = new THREE.Mesh(g, mat.concrete({ color: 0x6f6c66 }));
  ground.receiveShadow = true; ground.userData.noFit = true;
  sim.scene.add(ground);
}
// Kır ormanı: ağaçların çoğu kentin 700 m çevresinde (kameradan görünen saçak); uzak halka puslu ve seyrek.
// (6500 tam ayrıntılı ağaç ≈ 8,9 M alfa-testli üçgendi — sahnenin %85'i; yazılım WebGL'de kare başına ~40 sn)
const veg = createVegetation((x, z) => (cityFree(x, z) || inFar(x, z) ? -100 : hfun(x, z)), {
  rect: [-1500, -1500, 1500, 1500], trees: LOW ? 1500 : 3000, near: [0, 0, 700], rocks: 0, seed: 9, water: -60, kinds: { broad: 0.6, pine: 0.25, cypress: 0.15 },
  forest: (x, z) => 0.35 + 0.35 * Math.sin(x * 0.009 + 1.1) * Math.cos(z * 0.011 - 0.6) + (Math.max(Math.abs(x), Math.abs(z)) > 450 ? 0.25 : -0.2),
});
// Kır ağaçları gölge haritasına girmesin: gölge kamerası yalnız kent çevresini kapsar, ama örnekler kırpılmadığından
// hepsi gölge geçişinde yeniden çiziliyordu (görsel fark yok, kare maliyeti yarıya iner)
veg.group.traverse((o) => { if (o.isMesh) o.userData.noCast = true; });
sim.scene.add(veg.group);
// Kent kenarı: çevre yolu boyunca ağaç sırası ve çayırda ağaç kümeleri (motor sokak ağaçları)
const edgeTrees = (() => {
  const pts = [], r = cityRng(77);
  for (let t = -HALF - 10; t <= HALF + 10; t += 9 + r() * 4) {
    pts.push([t, HALF + 14 + r() * 2, 0, 1, hfun(t, HALF + 15) + 0.05]);
    pts.push([-HALF - 14 - r() * 2, t, 0, 1, hfun(-HALF - 15, t) + 0.05]);
    pts.push([HALF + 14 + r() * 2, t, 0, 1, hfun(HALF + 15, t) + 0.05]);
  }
  for (let k = 0; k < 16; k++) {
    const cx = (r() - 0.5) * 420, cz = HALF + 45 + r() * 170;
    for (let n = 0; n < 3 + r() * 5; n++) { const x = cx + (r() - 0.5) * 22, z = cz + (r() - 0.5) * 16; pts.push([x, z, 0, 1, hfun(x, z) + 0.05]); }
  }
  return streetTrees(pts, 21, { broad: 0.7, cypress: 0.3 });
})();
sim.scene.add(edgeTrees.group);
// Tarlalar: sürülmüş sıralı ekin parselleri (her biri kendi tonunda)
const cropMat = procedural({
  key: 'crop-rows', params: { color: 0xffffff, roughness: 0.95 }, bump: 0.05,
  pattern: `
    float row = sin(p.x*11.0)*0.5 + 0.5, n = fbm3(p*0.08, 4), m = vn3(p*2.0);
    col *= (0.72 + 0.28*row)*(0.8 + 0.35*n)*(0.9 + 0.15*m);
    h = row*0.8 + m*0.2; rough = 0.9 + 0.08*n;`,
});
const fields = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 0.3, 1, 1, 0.05), cropMat, 90);
{
  const m = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  let k = 0;
  for (let t = 0; t < 900 && k < 90; t++) {
    const x = (rnd() - 0.5) * 760, z = (rnd() - 0.5) * 760;
    if (Math.max(Math.abs(x), Math.abs(z)) < HALF + 30) continue;
    if (z > 0 && z < 330 && Math.abs(x) < 260) continue;     // açılış karesinin ön planı: çayır + ağaçlar (düz tarla lekesi değil)
    const w = 36 + rnd() * 50, d = 28 + rnd() * 40, y = Math.min(hfun(x - w / 2, z - d / 2), hfun(x + w / 2, z + d / 2), hfun(x, z));
    if (Math.abs(hfun(x + w / 2, z) - hfun(x - w / 2, z)) > 3) continue;
    q.setFromAxisAngle(up, (rnd() - 0.5) * 0.4);
    m.compose(new THREE.Vector3(x, y + 0.02, z), q, new THREE.Vector3(w, 1, d));
    fields.setMatrixAt(k, m);
    fields.setColorAt(k++, c.setHex([0xb9a35c, 0x8fa650, 0x6e8a3f, 0xc8b26a, 0x8a6e4c][k % 5]));
  }
  fields.count = k; fields.receiveShadow = true; fields.userData.noFit = true;
}
sim.scene.add(fields);

// --- Dinamik kent katmanı: motor binaları (ada başına bir küme; yalnız değişen ada yeniden kurulur), park çimleri,
//     ağaçlar, yeşil çatı bitki katmanı; tasarım değişince güncellenir ---
const clusters = new Map();                                // ada → { sig, lots, city }
const NEAR = LOW ? 200 : 320;
const roofLawn = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 1, 0.08), GM.lawn, cells.length);
roofLawn.receiveShadow = true; roofLawn.count = 0; roofLawn.userData.noFit = true;
sim.scene.add(roofLawn);
const roofGravel = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 1, 0.04), procedural({ key: 'roof-gravel', params: { color: 0xa9a397, roughness: 0.95 }, bump: 0.05,
  pattern: `float c = cells3(p*9.0), n = fbm3(p*0.6, 3); col *= (0.7 + 0.45*smoothstep(0.15, 0.55, c))*(0.9 + 0.15*n); h = 1.0 - c;` }), cells.length);
roofGravel.receiveShadow = true; roofGravel.count = 0; roofGravel.userData.noFit = true;
sim.scene.add(roofGravel);
const lawns = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 0.22, 1, 1, 0.05), GM.lawn, cells.length);
lawns.receiveShadow = true;
sim.scene.add(lawns);
const paths = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), procedural({ key: 'park-path', params: { color: 0xb8a684, roughness: 0.95 }, bump: 0.03,
  pattern: `float n = vn3(p*9.0), m = fbm3(p*0.7, 3); col *= 0.8 + 0.25*n + 0.15*m; h = n;` }), cells.length);
paths.receiveShadow = true; paths.count = 0;
sim.scene.add(paths);
const TREE_MAX = cells.length * 3;
const treeSrc = createVegetation(() => 10, { rect: [0, 0, 1, 1], trees: 3, rocks: 0, kinds: { broad: 1 }, seed: 4, leafA: 0x3d5a22, leafB: 0x71803a });
const treeIM = treeSrc.group.children.filter((o) => o.isInstancedMesh).map((s) => {
  const im = new THREE.InstancedMesh(s.geometry, s.material, TREE_MAX);
  im.castShadow = im.receiveShadow = true; im.count = 0; im.frustumCulled = false; im.userData.noAO = true;
  sim.scene.add(im);
  return im;
});
// Tıklama için görünmez hücre kutuları (bina hacmi ya da zemin karosu)
const pick = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ visible: false }), cells.length);
sim.scene.add(pick);

// Termal kamera katmanı: zemin/çatı karoları + bina kabukları (ışıktan bağımsız, yarı saydam)
const thermalG = new THREE.Group();
sim.scene.add(thermalG);
const ovMat = (op) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false, fog: false });
// yumuşak kenarlı karo: komşu hücreler kesintisiz bir ısı alanı gibi kaynaşır (keskin ızgara yerine)
const softTile = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), im = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const u = Math.abs(x - 31.5) / 32, v = Math.abs(y - 31.5) / 32, e = Math.max(u, v);
    const a = 255 * (1 - THREE.MathUtils.smoothstep(e, 0.72, 1.0) * 0.85);
    const i = (y * 64 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = a; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return new THREE.CanvasTexture(c);
})();
const ovTiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.12, 1.12).rotateX(-Math.PI / 2), ovMat(0.8), cells.length);
ovTiles.material.alphaMap = softTile;
const ovShell = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 1, 0.01).translate(0, 0.5, 0), ovMat(0.42), cells.length);
const ovRural = new THREE.Mesh((() => {
  // Araziye oturan (tepeleri izleyen) kırsal termal örtü; şehir karesi boş
  const P = [], S = 10, E = 420;
  for (let z = -E; z < E; z += S) for (let x = -E; x < E; x += S) {
    if (Math.max(Math.abs(x + S / 2), Math.abs(z + S / 2)) < HALF) continue;
    const v = (a, b) => [a, hfun(a, b) + 0.6, b];
    const a = v(x, z), b = v(x + S, z), c = v(x + S, z + S), d = v(x, z + S);
    P.push(...a, ...d, ...c, ...a, ...c, ...b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  return g;
})(), ovMat(0.55));
for (const o of [ovTiles, ovShell, ovRural]) { o.renderOrder = 5; o.userData.noAO = true; o.userData.noShadow = true; o.castShadow = false; o.raycast = () => {}; o.frustumCulled = false; }
thermalG.add(ovTiles, ovShell, ovRural);

// Kır istasyonu: meteoroloji siperi (panjurlu beyaz kutu) + rüzgâr direği
const station = new THREE.Group();
{
  const white = mat.paintedMetal({ color: 0xf2f2ee, wear: 0.15 });
  const louv = procedural({ key: 'louvre', params: { color: 0xf3f3ef, roughness: 0.6 }, bump: 0.05,
    pattern: `float l = fract(p.y*14.0); col *= 0.8 + 0.2*smoothstep(0.1, 0.5, l); h = smoothstep(0.0, 0.6, l);` });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; station.add(o); return o; };
  for (const [x, z] of [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.3], [0.35, 0.3]]) add(new RoundedBoxGeometry(0.06, 1.2, 0.06, 1, 0.02), white, x, 0.6, z);
  add(new RoundedBoxGeometry(0.9, 0.7, 0.75, 2, 0.03), louv, 0, 1.55, 0);
  add(new RoundedBoxGeometry(1.05, 0.08, 0.9, 2, 0.03), white, 0, 1.95, 0);
  add(new THREE.CylinderGeometry(0.035, 0.05, 6, 10), mat.brushedMetal(), 1.6, 3, 0);
  for (let k = 0; k < 3; k++) { const a = add(new THREE.SphereGeometry(0.06, 10, 8, 0, Math.PI), white, 1.6 + Math.cos(k * 2.09) * 0.22, 6.05, Math.sin(k * 2.09) * 0.22); a.rotation.y = -k * 2.09; }
  const y0 = hfun(-HALF - 18, -HALF + 18);
  station.position.set(-HALF - 18, y0, -HALF + 18);
}
sim.scene.add(station);
const ruralLbl = sim.label('', { parent: station, position: [0, 8, 0] });
const cityLbl = sim.label('', { position: [0, 72, 0], className: 'big' });

const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), q0 = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
const PALETTE = [0xe3d9c6, 0xd8cbb3, 0xece6da, 0xcfc4b0, 0xe6d2b5, 0xd5d9d6, 0xc9b8a0, 0xf0e9dc, 0xd9c2a2, 0xe8cfb0, 0xc8d3d6];
const HOUSE = [0xd9b77f, 0xe5d6bd, 0xc98f74, 0xe9e1d0, 0xb9c4c1, 0xd7a98a, 0xc7b48f, 0xe2cfa7];
// çatı kaplaması modeldeki yüzeyle aynı: koyu bitümlü membran (albedo 0,1), beyaz serin çatı membranı (0,7), kil kiremit (0,25)
const ROOF_COL = { roof: 0x3d3c3a, white: 0xf4f4f1, green: 0x6e6a62, tile: 0xa94f33 };
const isBld = (t) => t === 'roof' || t === 'white' || t === 'green' || t === 'tile';
const bodyH = new Float32Array(cells.length);

function buildGeometry() {
  let nl = 0, np = 0, ng = 0;
  const trees = treeIM.map(() => []);
  let nt = 0;
  const putTree = (x, z, s, y = 0.15) => { if (nt >= TREE_MAX) return; trees[nt % trees.length].push([x, z, s, y]); nt++; };
  const groups = new Map();
  for (const [k, c] of cells.entries()) {
    bodyH[k] = 0;
    if (isBld(c.type)) {
      const li = c.i % 4, lj = c.j % 4;
      const rot = lj === 3 ? 0 : lj === 1 ? Math.PI : li === 3 ? Math.PI / 2 : li === 1 ? -Math.PI / 2 : 0;
      const fl = floorsOf(c), u = (c.q * 97) % 1, v = (c.r * 53) % 1;
      const L = { k, x: c.x, z: c.z, rot, width: BP - 0.9 - u * 0.7, depth: BP - 0.9 - v * 1.1, seed: k * 3.7 + 1 };
      if (c.type === 'tile') Object.assign(L, { type: 'house', floors: Math.min(3, Math.max(2, fl)), roof: v < 0.65 ? 'hip' : 'gable', colors: { wall: HOUSE[Math.floor(u * HOUSE.length)], roof: ROOF_COL.tile } });
      else Object.assign(L, { type: 'apartment', floors: fl, roof: 'flat', shop: lj === 3 && fl >= 3 && v < 0.7, material: v > 0.88 ? 'brick' : 'plaster',
        colors: { wall: PALETTE[Math.floor(u * PALETTE.length)], roof: ROOF_COL[c.type] }, roofGear: c.type !== 'green', green: c.type === 'green' });
      const key = Math.floor(c.i / 4) + ',' + Math.floor(c.j / 4);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(L);
    } else {
      pick.setMatrixAt(k, tmpM.compose(v1.set(c.x, -0.3, c.z), q0, v2.set(c.road ? CS : BP, 0.6, c.road ? CS : BP)));
    }
    if (c.type === 'park' || c.type === 'tree') {
      lawns.setMatrixAt(nl++, tmpM.compose(v1.set(c.x, 0.11, c.z), q0, v2.set(BP - 0.4, 1, BP - 0.4)));
      if (c.type === 'tree') { putTree(c.x - 2.6, c.z - 2.2, 1.0); putTree(c.x + 2.4, c.z + 2.5, 1.05); putTree(c.x + 2.2, c.z - 2.8, 0.9); putTree(c.x - 2.8, c.z + 2.9, 0.75); }
      else { putTree(c.x + 3.2, c.z - 3.1, 0.95); putTree(c.x - 3.4, c.z + 3.0, 0.7); }
      // parkın içinden geçen çakıl yol (çapraz), yol kenarına bank
      paths.setMatrixAt(np++, tmpM.compose(v1.set(c.x, 0.23, c.z), q0.setFromAxisAngle(v2.set(0, 1, 0), c.r < 0.5 ? Math.PI / 4 : -Math.PI / 4), v2.set(1.6, 1, BP * 1.25)));
      q0.identity();
    } else if (c.road && c.tree > 0) {
      const vx = c.i % 4 === 0, vz = c.j % 4 === 0;
      if (vx && !vz) { putTree(c.x - 6.9, c.z, 0.8); putTree(c.x + 6.9, c.z + 3, 0.8); }
      else if (vz && !vx) { putTree(c.x, c.z - 6.9, 0.8); putTree(c.x + 3, c.z + 6.9, 0.8); }
    }
  }
  // Değişen adaları yeniden kur (yakındakiler hemen ayrıntılı; uzaktakiler kabuk, yaklaşınca ayrıntı)
  const first = !clusters.size;
  for (const [key, lots] of groups) {
    const sig = JSON.stringify(lots), C = clusters.get(key);
    if (C && C.sig === sig) continue;
    if (C) { sim.scene.remove(C.city.group); C.city.dispose(); }
    // İlk kurulumda yakın adalar hemen ayrıntılı; sonraki değişikliklerde önce kabuk, ayrıntı kare başına bütçeyle
    // (ana iş parçacığı saniyelerce kilitlenmesin — tüm adalar aynı anda değişse bile)
    const bc = populateCity({ lots, tile: 4000, near: NEAR, budget: 30, camera: first ? sim.camera : undefined, noRaycast: true });
    sim.scene.add(bc.group);
    clusters.set(key, { sig, lots, city: bc });
  }
  for (const [key, C] of clusters) if (!groups.has(key)) { sim.scene.remove(C.city.group); C.city.dispose(); clusters.delete(key); }
  // Bina hacimleri (tıklama + termal kabuk) ve yeşil çatılar: gerçek bina ölçülerinden
  for (const C of clusters.values()) C.lots.forEach((L, i) => {
    const S = C.city.specs[i], k = L.k, c = cells[k];
    const h = S.roof === 'flat' ? S.H : S.height;
    bodyH[k] = h;
    pick.setMatrixAt(k, tmpM.compose(v1.set(c.x, 0, c.z), q0, v2.set(BP, h, BP)));
    if (L.green) {
      // yeşil çatı: parapet içinde bitkili toprak (sedum/çim), kenarda çakıl şerit, birkaç çalı
      const yt = S.top + 0.06, rq = q0.setFromAxisAngle(v2.set(0, 1, 0), S.rot);
      roofGravel.setMatrixAt(ng, tmpM.compose(v1.set(S.x, yt + 0.05, S.z), rq, v2.set(S.w - 0.5, 0.1, S.d - 0.5)));
      roofLawn.setMatrixAt(ng++, tmpM.compose(v1.set(S.x, yt + 0.12, S.z), rq, v2.set(S.w - 1.5, 0.2, S.d - 1.5)));
      q0.identity();
      const r = cityRng(k + 0.5);
      for (let n = 0; n < 3; n++) putTree(S.x + (r() - 0.5) * (S.w - 4), S.z + (r() - 0.5) * (S.d - 4), 0.2 + r() * 0.1, yt + 0.2);
    }
  });
  lawns.count = nl;
  roofLawn.count = roofGravel.count = ng; roofLawn.instanceMatrix.needsUpdate = roofGravel.instanceMatrix.needsUpdate = true;
  paths.count = np; paths.instanceMatrix.needsUpdate = true;
  lawns.instanceMatrix.needsUpdate = true;
  pick.instanceMatrix.needsUpdate = true; pick.computeBoundingSphere();
  const r = cityRng(3);
  treeIM.forEach((im, s) => {
    trees[s].forEach(([x, z, sc, y], i) => { q0.setFromAxisAngle(v1.set(0, 1, 0), r() * 6.28); im.setMatrixAt(i, tmpM.compose(v2.set(x, y, z), q0, v1.set(sc, sc * (0.9 + r() * 0.2), sc))); });
    im.count = trees[s].length; im.instanceMatrix.needsUpdate = true;
  });
  q0.identity();
  const a = ASPHALT[asphaltS.value].a;
  GM.asphalt.color.setRGB(a * 1.04, a, a * 0.96);
  colorize();
}

// --- Çözüm ve güncel değerler ---
let sol = null, dirty = true, lastSolve = 0;
const curT = new Float32Array(cells.length);
let cur = { city: 0, rural: 0, surf: 0, rsurf: 0 };
let dirtyAt = 0;
// Yeniden hesaplama son değişiklikten 350 ms sonra bir kez (kaydırıcı sürüklenirken ya da ardışık değişikliklerde tekrar tekrar kurulmaz)
const markDirty = () => { dirty = true; dirtyAt = performance.now(); };
function doSolve() {
  assign();
  sol = solve(cells, { hw: hwS.value, qf: qfS.value, asphalt: asphaltS.value });
  buildGeometry();
  // 24 saatlik grafik ve günlük özetler
  chart.clear();
  let maxNight = -99, maxDay = -99, cdhC = 0, cdhR = 0, hot = -99;
  for (let k = 0; k <= 48; k++) {
    const a = sol.air[k % 48];
    chart.push([a.city, a.rural, sol.surfMean[k % 48], sol.ruralSurf[k % 48]]);
    if (k === 48) break;
    const d = a.city - a.rural, h = k / 2;
    if (h < 6 || h >= 21) maxNight = Math.max(maxNight, d); else if (h >= 10 && h <= 17) maxDay = Math.max(maxDay, d);
    cdhC += Math.max(0, a.city - 24) * 0.5; cdhR += Math.max(0, a.rural - 24) * 0.5;
    for (let i = 0; i < cells.length; i++) hot = Math.max(hot, sol.ts[k * cells.length + i]);
  }
  const kwh = (cdh) => (0.15 * cdh) / 3;
  stNight.set(`+${fmt(maxNight, 1)} °C`, maxNight > 4 ? 'bad' : maxNight > 2 ? 'warn' : 'good');
  stDay.set(`${maxDay >= 0 ? '+' : ''}${fmt(maxDay, 1)} °C`);
  stAC.set(`${fmt(kwh(cdhC), 1)} kWh/gün`, cdhC > cdhR * 1.3 ? 'bad' : cdhC > cdhR * 1.1 ? 'warn' : 'good');
  acNote.set(`Kırsal evde aynı daire: <b>${fmt(kwh(cdhR), 1)} kWh/gün</b> · kentte fazladan <b>%${fmt(cdhR ? (cdhC / cdhR - 1) * 100 : 0)}</b>. Günün en sıcak yüzeyi: <b>${fmt(hot, 0)} °C</b>.`);
}

function sample(hour) {
  const f = (((hour % 24) + 24) % 24) * 2, k0 = Math.floor(f) % 48, k1 = (k0 + 1) % 48, u = f - Math.floor(f), n = cells.length;
  let m = 0;
  for (let i = 0; i < n; i++) { curT[i] = lerp(sol.ts[k0 * n + i], sol.ts[k1 * n + i], u); m += curT[i]; }
  cur = {
    city: lerp(sol.air[k0].city, sol.air[k1].city, u), rural: lerp(sol.air[k0].rural, sol.air[k1].rural, u),
    surf: m / n, rsurf: lerp(sol.ruralSurf[k0], sol.ruralSurf[k1], u),
  };
}

const heat = (t) => heatColor((t - T_LO) / (T_HI - T_LO), tmpC);
function colorize() {
  if (!sol) return;
  const th = thermal.value;
  thermalG.visible = th;
  if (!th) return;
  let ns = 0;
  cells.forEach((c, k) => {
    const h = bodyH[k], w = c.road ? CS : BP;
    ovTiles.setMatrixAt(k, tmpM.compose(v1.set(c.x, h > 0 ? h + 0.12 : 0.45, c.z), q0, v2.set(h > 0 ? BP - 0.9 : w, 1, h > 0 ? BP - 0.9 : w)));
    ovTiles.setColorAt(k, heat(curT[k]));
    if (h > 0) {
      ovShell.setMatrixAt(ns, tmpM.compose(v1.set(c.x, 0, c.z), q0, v2.set(BP - 0.7, h + 0.05, BP - 0.7)));
      ovShell.setColorAt(ns++, heat(lerp(cur.city, curT[k], 0.55)));
    }
  });
  ovShell.count = ns;
  ovRural.material.color.copy(heat(cur.rsurf));
  // Pozlama telafisi: veri katmanı gece de aynı parlaklıkta okunur
  const e = 1 / Math.max(0.5, sim.sky.exposure());
  ovTiles.material.color.setScalar(e); ovShell.material.color.setScalar(e);
  ovRural.material.color.multiplyScalar(e);
  // Gündüz sahne görünür kalsın (yarı saydam örtü), gece veri katmanı daha belirgin
  const dk = THREE.MathUtils.smoothstep(-sunElev(hour) * 180 / Math.PI, -6, 4);
  ovTiles.material.opacity = lerp(0.6, 0.8, dk); ovShell.material.opacity = lerp(0.14, 0.3, dk); ovRural.material.opacity = lerp(0.3, 0.5, dk);
  for (const m of [ovTiles, ovShell]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}

let skyEl = NaN, skyAz = NaN;
function updateSky() {
  const el = sunElev(hour) * 180 / Math.PI;
  const az = clamp(180 + (hour - 12.5) * 17, 45, 315);
  // Gökyüzü/ortam ışığı yeniden pişirimi pahalı (yazılım WebGL'de saniyeler): güneş gözle görülür kaydıysa güncelle
  if (!(Math.abs(el - skyEl) < 0.4 && Math.abs(az - skyAz) < 0.8)) { skyEl = el; skyAz = az; sim.sky.set({ elevation: el, azimuth: az }); }
  const lit = THREE.MathUtils.smoothstep(-el, -6, 4);
  city.setLit(lit);
  city.fleet.lights(lit);
  folk.setLit(lit);
}

function refresh() {
  if (!sol) return;
  sample(hour);
  colorize();
  updateSky();
  const d = cur.city - cur.rural;
  stSurf.set(`${fmt(cur.surf, 1)} °C`, cur.surf > 45 ? 'bad' : cur.surf > 35 ? 'warn' : '');
  stRSurf.set(`${fmt(cur.rsurf, 1)} °C`);
  stAir.set(`${fmt(cur.city, 1)} / ${fmt(cur.rural, 1)} °C`);
  stDiff.set(`${d >= 0 ? '+' : ''}${fmt(d, 1)} °C`, d > 3 ? 'bad' : d > 1.5 ? 'warn' : 'good');
  cityLbl.setText(`🏙️ Kent havası ${fmt(cur.city, 1)} °C`);
  ruralLbl.setText(`🌾 Kır ${fmt(cur.rural, 1)} °C`);
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır şehirler');
const PRESETS = {
  bugun: { park: 10, white: 10, green: 5, asphalt: 'koyu', hw: 1.2, qf: 40 },
  serin: { park: 40, white: 50, green: 25, asphalt: 'serin', hw: 1, qf: 25 },
  beton: { park: 0, white: 0, green: 0, asphalt: 'koyu', hw: 2.8, qf: 100 },
  kasaba: { park: 30, white: 10, green: 0, asphalt: 'eski', hw: 0.4, qf: 8 },
};
const presetSeg = ui.segmented({
  options: [{ value: 'bugun', label: 'Bugünkü şehir' }, { value: 'serin', label: 'Serin şehir' }, { value: 'beton', label: 'Beton orman' }, { value: 'kasaba', label: 'Kasaba' }],
  value: 'bugun', onChange: (v) => loadPreset(v),
});
function loadPreset(v) {
  const p = PRESETS[v];
  parkS.set(p.park); whiteS.set(p.white); greenS.set(p.green); asphaltS.set(p.asphalt); hwS.set(p.hw); qfS.set(p.qf);
  cells.forEach((c) => (c.ov = null));
  markDirty();
}

ui.section('Kent tasarımı');
const parkS = ui.slider({ label: 'Ağaç / park örtüsü', min: 0, max: 60, step: 5, value: 10, unit: '%', onInput: markDirty });
const whiteS = ui.slider({ label: 'Beyaz (serin) çatı', min: 0, max: 100, step: 5, value: 10, unit: '%', onInput: (v) => { if (v + greenS.value > 100) greenS.set(100 - v); markDirty(); } });
const greenS = ui.slider({ label: 'Yeşil çatı', min: 0, max: 100, step: 5, value: 5, unit: '%', onInput: (v) => { if (v + whiteS.value > 100) whiteS.set(100 - v); markDirty(); } });
const asphaltS = ui.select({ label: 'Yol kaplaması', options: Object.entries(ASPHALT).map(([value, a]) => ({ value, label: `${a.name} (albedo ${fmt(a.a, 2)})` })), value: 'koyu', onChange: markDirty });
const hwS = ui.slider({ label: 'Bina yüksekliği / sokak genişliği (H/W)', min: 0.3, max: 3, step: 0.1, value: 1.2, format: (v) => `${fmt(v, 1)} · ≈${fmt(v * 12 / 3)} kat`, onInput: markDirty });
const qfS = ui.slider({ label: 'Atık ısı (trafik + klima)', min: 0, max: 120, step: 5, value: 40, unit: 'W/m²', onInput: markDirty });

ui.section('Zaman ve görünüm');
const hourS = ui.slider({ label: 'Gün saati', min: 0, max: 23.75, step: 0.25, value: 14, format: (v) => clock(v), onInput: (v) => { hour = v; refresh(); } });
const runDay = ui.toggle({ label: 'Gün aksın', value: true });
const thermal = ui.toggle({ label: '🌡️ Termal kamera', value: /[?&]thermal\b/.test(location.search), onChange: () => { legend.el.style.display = thermal.value ? '' : 'none'; colorize(); } });
const legend = ui.text(`<div style="height:10px;border-radius:5px;background:linear-gradient(90deg,#2563eb,#22c55e 35%,#facc15 60%,#f97316 80%,#dc2626)"></div>
  <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:3px"><span>${T_LO} °C</span><span>yüzey sıcaklığı</span><span>${T_HI} °C</span></div>`, 'card');
legend.el.style.display = thermal.value ? '' : 'none';
const tool = ui.segmented({
  label: 'Haritaya tıklayınca',
  options: [{ value: 'tree', label: '🌳 Ağaç' }, { value: 'white', label: '⬜ Beyaz çatı' }, { value: 'green', label: '🌿 Yeşil çatı' }, { value: 'none', label: '⬛ Koyu/sil' }],
  value: 'tree',
});

ui.section('Durum');
const stSurf = ui.stat({ label: 'Ort. kent yüzeyi' });
const stRSurf = ui.stat({ label: 'Kır yüzeyi' });
const stAir = ui.stat({ label: 'Hava: kent / kır' });
const stDiff = ui.stat({ label: 'Kent − kır (hava)' });
const stNight = ui.stat({ label: 'Gece en büyük fark' });
const stDay = ui.stat({ label: 'Gündüz en büyük fark' });
const stAC = ui.stat({ label: 'Klima enerjisi (100 m²)' });
const acNote = ui.text('', 'card');
const chart = ui.chart({
  title: '24 saat: sıcaklık (°C), 00:00 → 24:00',
  series: [{ name: 'Kent havası', color: '#f97316' }, { name: 'Kır havası', color: '#22c55e' }, { name: 'Kent yüzeyi', color: '#ef4444' }, { name: 'Kır yüzeyi', color: '#60a5fa' }],
  maxPoints: 49, height: 140,
});

function clock(h) { const m = Math.round(h * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
sim.formatTime = () => clock(hour);

// Tıklayarak düzenleme
sim.onClick(() => [pick], (hit) => {
  const k = hit.instanceId;
  const c = cells[k];
  if (!c) return;
  const t = tool.value;
  if (c.road) {
    if (t === 'tree' || t === 'none') { c.ov = t; sim.toast(t === 'tree' ? '🌳 Sokağa ağaç dikildi' : 'Sokak ağaçları kaldırıldı'); }
    else sim.toast('Burası yol — çatı yok', 'warn');
  } else {
    c.ov = t;
    sim.toast({ tree: '🌳 Küçük park yapıldı', white: '⬜ Çatı beyaza boyandı', green: '🌿 Yeşil çatı yapıldı', none: '⬛ Koyu çatılı bina' }[t]);
  }
  sim.hud.show(`Hücre sıcaklığı şimdi: <b>${fmt(curT[k], 1)} °C</b> — yeniden hesaplanıyor…`, { timeout: 1800 });
  presetSeg.set('');
  markDirty();
});

sim.onUpdate((dt) => {
  if (!runDay.value) return;
  hour = (hour + dt * 0.5) % 24;
  hourS.set(Math.floor(hour * 4) / 4);
});
let tick = 0;
let vt = 0;
sim.onRender((dt) => {
  vt += dt;
  veg.update(vt, 0.6);
  treeSrc.update(vt, 0.6);
  edgeTrees.update(vt, 0.6);
  folk.update(dt, !sim.paused);
  const now = performance.now();
  if (dirty && now - dirtyAt > 350 && now - lastSolve > 150) { dirty = false; lastSolve = now; doSolve(); refresh(); return; }
  if (++tick % 3 === 0) refresh();
});

sim.onReset(() => { hour = 14; hourS.set(14); runDay.set(true); presetSeg.set('bugun'); loadPreset('bugun'); });
assign();
doSolve();
refresh();
dirty = false;
