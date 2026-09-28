// Dil Evrimi — köyler arasında düzenli ses değişimleri, ödünçleme ve dalga yayılımı; UPGMA soy ağacı.
import { createSim, THREE, ImprovedNoise, clamp, smoothstep, fmt, pick, mat, procedural, landscape, createTerrain, terrainSkirt, createVegetation, depthTexture, BufferGeometryUtils, populateCity } from '@core';
import { VOCAB, RULES, metathesis, similarity, upgma, cutTree } from './lang.js';

const GEN_PER_SEC = 1.25;
const MAX_GEN = 200;

const sim = createSim({
  sky: { elevation: 30, azimuth: 222, clouds: 0.3, haze: 0.55, visibility: 26000, wind: [5, 2] },
  ocean: { wind: 5, windDir: 250, fetch: 40, foam: 0.3 },
  camera: { position: [-1150, 360, 760], target: [-60, 20, -50], fov: 40, near: 1, far: 80000 },
  controls: { minDistance: 120, maxDistance: 4500, maxPolarAngle: 1.45 },
  look: { aoRadius: 3, exposure: 0.66 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Altı köy aynı <b>ata dili</b> konuşarak başlar (14 temel sözcük: su, göz, taş, ev, yol, ekmek…). Her nesilde (~25 yıl)
    bir köyde bir <b>ses değişimi</b> başlayabilir. Değişim <b>düzenlidir</b>: o sesi içeren bütün sözcüklere birden uygulanır
    (ör. <i>ş → s</i>: taş → tas, baş → bas, kuş → kus). Türk dillerinde gerçekten görülen değişimler kullanıldı:
    başta ötümlüleşme (taş → daş, Azerice/Türkmence gibi), <i>y → c</i> (yol → col, Kırgızca gibi), ünsüz yumuşaması,
    ğ düşmesi (dağ → daa), ünlü uyumu değişimleri, ses göçüşmesi (yıldız → yıdlız).</p>
    <p>Yollar <b>temas</b> demektir: komşular birbirinden sözcük <b>ödünç alır</b> ve bir ses değişimi komşuya yayılabilir
    (dalga modeli). Dağlar ve deniz teması zayıflatır; kopan köyler hızla ayrışır.</p>
    <p>Benzerlik = 1 − Levenshtein uzaklığı / sözcük uzunluğu (14 sözcüğün ortalaması). Soy ağacı <b>UPGMA</b> yöntemiyle
    bu uzaklıklardan kurulur. Benzerlik %70'in altına inince köyleri "ayrı dil" sayıyoruz (temsili eşik).</p>
    <h3>Dene</h3>
    <ul>
      <li>Adaköy'ün deniz yolunu kes (<b>İzolasyon</b>): birkaç yüz yıl sonra ağaçta en uzak dal olur.</li>
      <li>Tüm yolları güçlü yap: köyler birlikte değişir, tek bir dil gibi kalır ama ata dilden yine uzaklaşır.</li>
      <li>İki uzak köyü <b>Göç</b> ile karıştır: ağaçta aniden yakınlaşırlar.</li>
      <li>Bir köye tıkla: sözcük listesini ata dille karşılaştır. Düzenli değişimler sayesinde dilbilimciler bu eşleşmelerden
      ata dili geri kurabilir (karşılaştırmalı yöntem).</li>
    </ul>
    <p><small>Gerçek diller çok daha karmaşıktır (anlam kayması, dilbilgisi, prestij, yazı). Sayılar temsili; model
    kavramları göstermek içindir.</small></p>`,
});

// --- Arazi (metre): kıyı, ada, iki sıradağ ve geçitler; batıda gerçek (FFT) deniz ---
// Model birimleri korunur (köy/yol koordinatları); 1 birim = S metre.
const S = 45, VZ = 0.85;
const noise = new ImprovedNoise();
function ridge(x, z, x0, z0, z1, h, w, passZ) {
  const fade = smoothstep(z0 - 1, z0 + 2, z) * smoothstep(z1 + 1, z1 - 2, z);
  const pass = 1 - 0.62 * Math.exp(-((z - passZ) ** 2) / 1.6);
  return h * Math.exp(-((x - x0 + Math.sin(z * 0.5) * 0.6) ** 2) / (w * w)) * fade * pass * (1 + 0.3 * noise.noise(x * 0.4, 3, z * 0.4));
}
function height(x, z) {
  let h = 0.7 + noise.noise(x * 0.12, 0.5, z * 0.12) * 0.7;
  const coast = -8.5 + Math.sin(z * 0.3) * 1.2;
  h -= smoothstep(coast, coast - 5, x) * 2.8;
  h += 2.4 * Math.exp(-((x + 16) ** 2 + (z + 3) ** 2) / 7);
  h += ridge(x, z, 4.8, -0.5, 14, 4.6, 1.5, 3.8);
  h += ridge(x, z, 9.6, -15, -1.5, 4.2, 1.4, -6.4);
  h += 1.1 * Math.exp(-((x - 9.5) ** 2 + (z - 6) ** 2) / 12);
  return h;
}
const farHills = landscape({ seed: 41, size: 1500, height: 520, base: -40 });
const detail = landscape({ seed: 9, size: 260, height: 14, octaves: 5 });
function hf(X, Z) {
  const x = X / S, z = Z / S;
  let h = (height(x, z) - 0.1) * S * VZ + (h0(x, z) > 0 ? detail(X, Z) * 0.6 : 0);
  // uzak doğu/kuzey/güney: tepeler ufku kapatır (denizde değil)
  const w = smoothstep(0, 1400, Math.max(X - 900, Math.abs(Z) - 1000)) * smoothstep(-1200, -300, X);
  return h + w * Math.max(0, farHills(X, Z) + 180);
}
const h0 = (x, z) => height(x, z) - 0.25;
const scene = sim.scene;
{
  scene.add(createTerrain(hf, { size: [9000, 9000], res: [260, 260], materialOptions: { water: 0, grass: 0x4f6e27, dry: 0x93844f, soil: 0x6a5134, forest: 1.1, forestCol: 0x2f4420, rock: 0x7a746b, snow: 290 } }));
  scene.add(terrainSkirt(hf, { inner: 4500, outer: 60000 }));
  const rect = [-3000, -3000, 3000, 3000];
  sim.ocean?.setDepth(depthTexture(hf, rect, 256), rect);
}
sim.label('⛰️ Dağlar', { position: [4.8 * S, 250, 10 * S], className: 'plain' });
sim.label('🌊 Deniz', { position: [-13 * S, 30, 8 * S], className: 'plain' });

// --- Köyler ---
const VILLAGES = [
  { name: 'Kıyıköy', x: -6.2, z: 4, color: '#f97316' },
  { name: 'Ovacık', x: 0, z: 1, color: '#22c55e' },
  { name: 'Dereköy', x: 2, z: -6, color: '#38bdf8' },
  { name: 'Yaylabaşı', x: 9.5, z: 6, color: '#e879f9' },
  { name: 'Uzakyurt', x: 14, z: -7, color: '#facc15' },
  { name: 'Adaköy', x: -16, z: -3, color: '#f87171' },
];
const ROADS = [
  { a: 0, b: 1, name: 'Kıyıköy – Ovacık', s: 0.8 },
  { a: 1, b: 2, name: 'Ovacık – Dereköy', s: 0.7 },
  { a: 1, b: 3, name: 'Ovacık – Yaylabaşı (dağ geçidi)', s: 0.3 },
  { a: 2, b: 4, name: 'Dereköy – Uzakyurt (dağ geçidi)', s: 0.25 },
  { a: 0, b: 5, name: 'Kıyıköy – Adaköy (deniz yolu)', s: 0.2, sea: true },
];
const overlay = { on: true };
const overlayGroup = new THREE.Group();
scene.add(overlayGroup);
const slope = (x, z) => Math.hypot(hf(x + 3, z) - hf(x - 3, z), hf(x, z + 3) - hf(x, z - 3)) / 6;

// Köy evleri: gerçek bina geometrisi (kırma/beşik kiremit çatı, girintili pencere, söve, kapı saçağı); meydana bakar
{
  const lots = [];
  let seedN = 11;
  const rr = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };
  VILLAGES.forEach((v, vi) => {
    const cx = v.x * S, cz = v.z * S;
    let n = 0;
    for (let i = 0; i < 70 && n < 17; i++) {
      const a = i * 2.39996 + vi * 0.7, r = 24 + Math.sqrt(i) * 15;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const w = 8 + rr() * 4, d = 7 + rr() * 3;
      const ys = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].map(([u, k]) => hf(x + u * w * 0.6, z + k * d * 0.6));
      const lo = Math.min(...ys), hi = Math.max(...ys);
      if (lo < 1.6 || hi - lo > 3.2) continue;
      lots.push({ x, z, rot: Math.atan2(cx - x, cz - z) + (rr() - 0.5) * 0.4, y0: lo - 0.35, type: 'house', width: w, depth: d,
        floors: rr() < 0.7 ? 1 : 2, roof: rr() < 0.55 ? 'gable' : 'hip', seed: vi * 100 + i, age: 0.5 + rr() * 0.4,
        colors: { wall: [0xe9e1cf, 0xefe6d2, 0xd9c7a4, 0xe6d8bc, 0xf1ece0][Math.floor(rr() * 5)] } });
      n++;
    }
  });
  const town = populateCity({ lots, tile: 120, noRaycast: true, camera: sim.camera });
  town.group.traverse((o) => { o.userData.noFit = true; });
  scene.add(town.group);
}

// Tarlalar: köylerin çevresinde araziye oturan ekili parseller (buğday, yeşil ekin, sürülmüş toprak)
{
  const fieldMat = procedural({
    key: 'dil-field', bump: 0.05, params: { color: 0xffffff, roughness: 0.95, vertexColors: true },
    pattern: `
      float rows = sin((p.x*0.8 + p.z*0.6)*2.2);
      float n = fbm3(p*0.05, 4), m = vn3(p*1.7);
      col *= (0.8 + 0.35*n)*(0.85 + 0.15*rows*aaW(p*0.35)) + 0.05*(m - 0.5);
      h = rows*0.5 + m*0.3;`,
  });
  const CROPS = [0xb8a15a, 0x7c8a3a, 0x6b5238, 0xa99552, 0x5f7a2e];
  const geos = [];
  let seedN = 3;
  const rr = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };
  VILLAGES.forEach((v) => {
    for (let f = 0; f < 9; f++) {
      const a = rr() * Math.PI * 2, rad = 120 + rr() * 110;
      const cx = v.x * S + Math.cos(a) * rad, cz = v.z * S + Math.sin(a) * rad;
      if (hf(cx, cz) < 2 || slope(cx, cz) > 0.22) continue;
      const w = 50 + rr() * 45, l = 60 + rr() * 50, rot = rr() * Math.PI;
      const g = new THREE.PlaneGeometry(w, l, 8, 8); g.rotateX(-Math.PI / 2); g.rotateY(rot);
      const p = g.attributes.position, c = new THREE.Color(CROPS[Math.floor(rr() * CROPS.length)]);
      const col = new Float32Array(p.count * 3);
      let ok = true;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + cx, z = p.getZ(i) + cz, y = hf(x, z);
        if (y < 1) ok = false;
        p.setXYZ(i, x, y + 0.35, z);
        col.set([c.r, c.g, c.b], i * 3);
      }
      if (!ok) { g.dispose(); continue; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.deleteAttribute('uv');
      g.computeVertexNormals();
      geos.push(g);
    }
  });
  const fields = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), fieldMat);
  fields.receiveShadow = true; fields.userData.noFit = true; fields.userData.noCast = true;
  scene.add(fields);
}

// Veri katmanı dokuları: topluluk alanı (yumuşak kenarlı disk) ve ışık sütunu (yukarı doğru sönen)
const TERR_TEX = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.72, 'rgba(255,255,255,0.4)');
  g.addColorStop(0.9, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const BEAM_TEX = (() => {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(0.7, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
  x.fillStyle = g; x.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function terrDisc(X, Z, R) {
  const NR = 14, NA = 72, pos = [], uv = [], idx = [];
  for (let i = 0; i <= NR; i++) for (let j = 0; j < NA; j++) {
    const r = (i / NR) * R, a = (j / NA) * Math.PI * 2;
    const x = X + Math.cos(a) * r, z = Z + Math.sin(a) * r;
    pos.push(x, Math.max(0.3, hf(x, z)) + 1.2, z);
    uv.push(0.5 + (0.5 * r / R) * Math.cos(a), 0.5 + (0.5 * r / R) * Math.sin(a));
  }
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const a = i * NA + j, b = i * NA + ((j + 1) % NA), c = a + NA, d = b + NA;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
const LANG_C = ['#f59e0b', '#0ea5e9', '#ec4899', '#22c55e', '#8b5cf6', '#ef4444'];
const markers = [];
VILLAGES.forEach((v, vi) => {
  const X = v.x * S, Z = v.z * S;
  v.y = Math.max(1, hf(X, Z));
  // köy halkası (veri katmanı): araziyi izleyen parlak halka
  const pts = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2, x = X + Math.cos(a) * 1.9 * S, z = Z + Math.sin(a) * 1.9 * S;
    pts.push(new THREE.Vector3(x, Math.max(0.6, hf(x, z)) + 2.5, z));
  }
  v.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(v.color).multiplyScalar(1.3), transparent: true, opacity: 0.85, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 128, 2.2, 6, true), v.ringMat);
  ring.userData.noFit = true; ring.userData.noCast = true;
  overlayGroup.add(ring);
  // dil topluluğu alanı: araziyi örten yumuşak renk lekesi (rengi = hangi dil kümesinde olduğu)
  v.terrMat = new THREE.MeshBasicMaterial({ map: TERR_TEX, color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const terr = new THREE.Mesh(terrDisc(X, Z, 3.4 * S), v.terrMat);
  terr.userData.noFit = true; terr.userData.noCast = true; terr.renderOrder = 2;
  overlayGroup.add(terr);
  // işaret ışığı: dağların ardından da görünen ince ışık sütunu (köy rengi)
  v.beaconMat = new THREE.MeshBasicMaterial({ map: BEAM_TEX, color: new THREE.Color(v.color).multiplyScalar(1.6), transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 5, 190, 16, 1, true).translate(0, 95, 0), v.beaconMat);
  beam.position.set(X, v.y, Z); beam.userData.noFit = true; beam.userData.noCast = true;
  overlayGroup.add(beam);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 12), mat.glow({ color: new THREE.Color(v.color).getHex(), intensity: 4 }));
  cap.position.set(X, v.y + 192, Z); cap.userData.noFit = true; cap.userData.noCast = true;
  overlayGroup.add(cap);
  // köy meydanı: bayrak direği ve bez bayrak
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 16, 10), mat.paintedMetal({ color: 0xd7d7d2, wear: 0.2 }));
  pole.position.set(X, v.y + 7, Z);
  const flagG = new THREE.PlaneGeometry(5, 3.2, 8, 4); flagG.translate(2.5, 0, 0);
  const flag = new THREE.Mesh(flagG, mat.fabric({ color: new THREE.Color(v.color).getHex() }));
  flag.material.side = THREE.DoubleSide;
  flag.position.set(X + 0.15, v.y + 12.2, Z);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(90, 90, 80, 12), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.set(X, v.y + 30, Z);
  hit.userData.vi = vi; hit.userData.noFit = true; hit.userData.noCast = true;
  scene.add(pole, flag, hit);
  markers.push(hit);
  v.flag = flag;
  v.label = sim.label('', { position: [X, v.y + 70, Z], className: 'clickable' });
  v.label.el.addEventListener('click', () => selectVillage(vi));
});

// Yollar: araziye oturan toprak yol şeridi + veri katmanında parlak temas çizgisi; deniz yolunda tekne
const RED = new THREE.Color(3, 0.35, 0.3), SEA_C = new THREE.Color(1.6, 2.0, 2.4), ROAD_C = new THREE.Color(2.6, 1.9, 0.9);
const dirtMat = procedural({
  key: 'dil-dirt', bump: 0.04, params: { color: 0x8a7556, roughness: 0.95 },
  pattern: `
    float n = fbm3(p*0.3, 4), g = vn3(p*4.0);
    col *= 0.78 + 0.35*n + 0.1*(g - 0.5);
    h = n*0.6 + g*0.3;`,
});
const roadPts = [];
ROADS.forEach((r) => {
  const A = VILLAGES[r.a], B = VILLAGES[r.b];
  const pts = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = (A.x + (B.x - A.x) * t) * S, z = (A.z + (B.z - A.z) * t + Math.sin(t * Math.PI) * (r.sea ? 1.5 : 0.8)) * S;
    pts.push(new THREE.Vector3(x, r.sea ? 1.2 : Math.max(1, hf(x, z)) + 0.5, z));
    if (!r.sea) roadPts.push([x, z]);
  }
  r.curve = new THREE.CatmullRomCurve3(pts);
  if (!r.sea) {
    // şerit
    const N = 240, W = 3.2, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const q = r.curve.getPointAt(i / N), tg = r.curve.getTangentAt(i / N);
      const nx = -tg.z, nz = tg.x, l = Math.hypot(nx, nz) || 1;
      for (const s of [-1, 1]) {
        const x = q.x + (nx / l) * W * s, z = q.z + (nz / l) * W * s;
        pos.push(x, hf(x, z) + 0.3, z);
      }
      if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const band = new THREE.Mesh(g, dirtMat);
    band.receiveShadow = true; band.userData.noFit = true; band.userData.noCast = true;
    scene.add(band);
  } else {
    // tekne: ahşap gövde, direk, yelken
    const boat = new THREE.Group();
    const hullS = new THREE.Shape();
    hullS.moveTo(0, -7); hullS.quadraticCurveTo(2.4, -3, 2.1, 5); hullS.lineTo(-2.1, 5); hullS.quadraticCurveTo(-2.4, -3, 0, -7);
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hullS, { depth: 1.6, bevelEnabled: true, bevelSize: 0.3, bevelThickness: 0.3, bevelSegments: 2 }).rotateX(Math.PI / 2).translate(0, 1.2, 0),
      mat.wood({ color: 0x7a5236, varnish: 0.5 }));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 9, 6).translate(0, 5.5, -1), mat.wood({ color: 0x8a6a48 }));
    const sailS = new THREE.Shape(); sailS.moveTo(0, 0); sailS.lineTo(0, 7.5); sailS.lineTo(4.5, 0.4); sailS.closePath();
    const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailS).rotateY(Math.PI / 2).translate(0.05, 1.6, -1), mat.fabric({ color: 0xece4d2 }));
    sail.material.side = THREE.DoubleSide;
    boat.add(hull, mast, sail);
    boat.userData.noFit = true;
    scene.add(boat);
    r.boat = boat;
  }
  // temas çizgisi (veri katmanı)
  r.glow = new THREE.MeshBasicMaterial({ color: r.sea ? SEA_C : ROAD_C, transparent: true, opacity: 0.8, depthWrite: false });
  const lift = r.curve.points.map((q) => new THREE.Vector3(q.x, q.y + 4, q.z));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lift), 120, 0.9, 5), r.glow);
  tube.userData.noFit = true; tube.userData.noCast = true;
  overlayGroup.add(tube);
});

// Gezginler: yollar üzerinde ilerleyen yumuşak ışıklar (temas ne kadar güçlüyse o kadar çok)
const travGeo = new THREE.BufferGeometry();
const travPos = new Float32Array(ROADS.length * 3 * 3);
travGeo.setAttribute('position', new THREE.BufferAttribute(travPos, 3));
{
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const pts = new THREE.Points(travGeo, new THREE.PointsMaterial({ size: 26, map: tex, color: new THREE.Color(3.2, 2.8, 1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; pts.userData.noFit = true;
  overlayGroup.add(pts);
}

// Orman: tepelerde ve dağ yamaçlarında; köy, tarla ve yol çevresi açık
const veg = createVegetation(hf, {
  rect: [-1400, -1300, 1600, 1300], trees: 4000, shrubs: 1200, rocks: 300, grass: 0, seed: 5, water: 0, maxSlope: 0.9,
  kinds: { pine: 0.5, broad: 0.35, cypress: 0.15 },
  forest: (x, z) => {
    for (const v of VILLAGES) { const d = Math.hypot(x - v.x * S, z - v.z * S); if (d < 250) return d < 120 ? 0 : 0.2; }
    for (const [px, pz] of roadPts) if (Math.abs(x - px) < 14 && Math.abs(z - pz) < 14) return 0;
    const f = 0.5 + 0.3 * Math.sin(x * 0.007 + 1.3) * Math.cos(z * 0.009) + 0.2 * Math.sin(x * 0.021 + z * 0.013);
    return f + Math.min(0.35, hf(x, z) / 300);
  },
});
scene.add(veg.group);

// --- Dil durumu ---
let lex, gen, logs, pending, selected = 1, history, finished;
const P = { drift: 0.35, contact: 0.5, showWord: '3' };

function reset() {
  lex = VILLAGES.map(() => VOCAB.slice());
  gen = 0; logs = []; pending = []; history = []; finished = false;
  chart.clear();
  sim.hud.hide();
  refresh();
}
function applyRule(vi, rule, how) {
  const before = lex[vi];
  const after = before.map(rule.f);
  const ex = [];
  after.forEach((w, k) => { if (w !== before[k] && ex.length < 3) ex.push(`${before[k]} → <b>${w}</b>`); });
  if (!ex.length) return false;
  lex[vi] = after;
  log(vi, `${rule.name} (${rule.short})${how ? ' · ' + how : ''}: ${ex.join(', ')}`);
  // Dalga modeli: değişim komşulara yayılabilir
  for (const r of ROADS) {
    const j = r.a === vi ? r.b : r.b === vi ? r.a : -1;
    if (j >= 0 && Math.random() < r.s * P.contact * 0.6) pending.push({ vi: j, rule, from: vi });
  }
  return true;
}
function log(vi, html) {
  logs.unshift(`<b style="color:${VILLAGES[vi].color}">${gen}. nesil · ${VILLAGES[vi].name}</b>: ${html}`);
  if (logs.length > 7) logs.pop();
}
function step() {
  gen++;
  // Önceki nesilden yayılan değişimler
  const pend = pending; pending = [];
  for (const p of pend) applyRule(p.vi, p.rule, `${VILLAGES[p.from].name}'dan yayıldı`);
  VILLAGES.forEach((v, vi) => {
    if (Math.random() < P.drift * 0.35) {
      for (let tries = 0; tries < 6; tries++) if (applyRule(vi, pick(RULES))) break;
    }
    if (Math.random() < P.drift * 0.12) {
      const k = Math.floor(Math.random() * VOCAB.length);
      const w = metathesis(lex[vi][k]);
      if (w !== lex[vi][k]) { log(vi, `Ses göçüşmesi (tek sözcük): ${lex[vi][k]} → <b>${w}</b>`); lex[vi][k] = w; }
    }
  });
  // Ödünçleme
  for (const r of ROADS) {
    if (Math.random() < r.s * P.contact * 0.5) {
      const [from, to] = Math.random() < 0.5 ? [r.a, r.b] : [r.b, r.a];
      const k = Math.floor(Math.random() * VOCAB.length);
      if (lex[from][k] !== lex[to][k]) {
        log(to, `Ödünçleme: <b>${lex[from][k]}</b> sözcüğünü ${VILLAGES[from].name}'dan aldı (önceki: ${lex[to][k]})`);
        lex[to][k] = lex[from][k];
      }
    }
  }
  const s = stats();
  chart.push([s.proto * 100, s.avg * 100, s.min * 100]);
  if (gen === MAX_GEN && !finished) {
    finished = true;
    sim.pause();
    sim.hud.show(`<h2>⏳ ${fmt(gen * 25)} yıl geçti</h2>${s.langs} ayrı dil oluştu · ata dile benzerlik %${fmt(s.proto * 100)}<br>
      <button class="btn primary" data-a="go">▶ Devam et</button><button class="btn" data-a="new">⟲ Baştan</button>`, { tone: 'good' });
    sim.hud.el.querySelector('[data-a=go]').onclick = () => { sim.hud.hide(); sim.play(); };
    sim.hud.el.querySelector('[data-a=new]').onclick = () => { reset(); sim.play(); };
  }
}
function stats() {
  const n = VILLAGES.length;
  const S = [];
  let sum = 0, cnt = 0, mn = 1, proto = 0;
  for (let i = 0; i < n; i++) { S[i] = []; proto += similarity(lex[i], VOCAB) / n; }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) { S[i][j] = 1; continue; }
    if (j < i) { S[i][j] = S[j][i]; continue; }
    S[i][j] = similarity(lex[i], lex[j]);
    sum += S[i][j]; cnt++; mn = Math.min(mn, S[i][j]);
  }
  const D = S.map((r) => r.map((v) => 1 - v));
  const tree = upgma(D);
  const cut = cutTree(tree, 0.15, n);
  return { S, avg: sum / cnt, min: mn, proto, tree, langs: cut.count, labels: cut.labels };
}

// --- Güncelleme ---
let acc = 0;
sim.onUpdate((dt) => {
  if (finished && gen >= MAX_GEN && sim.paused) return;
  acc += dt * GEN_PER_SEC;
  let n = Math.min(Math.floor(acc), 10);
  acc -= Math.floor(acc);
  if (n > 0) { while (n--) step(); refresh(); }
});
let travT = 0;
sim.onRender((real) => {
  if (!sim.paused) travT += real * Math.min(sim.speed, 3) * 0.25;
  let k = 0;
  for (const r of ROADS) {
    r.glow.opacity = r.s <= 0.001 ? 0.9 : 0.15 + 0.75 * r.s;
    r.glow.color.copy(r.s <= 0.001 ? RED : r.sea ? SEA_C : ROAD_C);
    for (let i = 0; i < 3; i++) {
      const on = overlay.on && r.s > i * 0.3 + 0.01;
      const t = (travT * (0.6 + r.s) + i / 3) % 1;
      const q = r.curve.getPointAt(i % 2 ? 1 - t : t);
      travPos[k * 3] = q.x; travPos[k * 3 + 1] = on ? q.y + 6 : -1e4; travPos[k * 3 + 2] = q.z;
      k++;
    }
    if (r.boat) {
      const t = (travT * 0.35 * (0.6 + r.s)) % 2, u = t < 1 ? t : 2 - t;
      const q = r.curve.getPointAt(Math.min(0.99, u)), q2 = r.curve.getPointAt(Math.min(0.999, u + 0.009));
      r.boat.position.set(q.x, 0.2, q.z);
      r.boat.rotation.y = Math.atan2(q2.x - q.x, q2.z - q.z) + (t < 1 ? Math.PI : 0);
      r.boat.visible = r.s > 0.001;
    }
  }
  travGeo.attributes.position.needsUpdate = true;
  VILLAGES.forEach((v, i) => { v.flag.rotation.y = Math.sin(travT * 8 + i) * 0.3; });
  veg.update(performance.now() / 1000, 0.8);
});

// --- Panel ---
const ui = sim.ui;
ui.section('Evrim');
const sDrift = ui.slider({ label: 'Ses değişimi hızı', min: 0, max: 1, step: 0.05, value: P.drift, format: (v) => `${fmt(v * 100)}%`, onChange: (v) => { P.drift = v; } });
const sContact = ui.slider({ label: 'Temasın etkisi (ödünçleme)', min: 0, max: 1, step: 0.05, value: P.contact, format: (v) => `${fmt(v * 100)}%`, onChange: (v) => { P.contact = v; } });
ui.buttons([
  { label: '⏭ 1 nesil', onClick: () => { step(); refresh(); } },
  { label: '⏩ 10 nesil', onClick: () => { for (let i = 0; i < 10; i++) step(); refresh(); } },
]);
ui.section('Yollar (temas gücü)');
const roadSliders = ROADS.map((r) => ui.slider({ label: r.name, min: 0, max: 1, step: 0.05, value: r.s, format: (v) => (v <= 0.001 ? '⛔ kapalı' : `${fmt(v * 100)}%`), onChange: (v) => { r.s = v; } }));
ui.section('Olaylar');
const roadSel = ui.select({ label: 'Yol', options: ROADS.map((r, i) => ({ value: i, label: r.name })), value: 4 });
ui.button({ label: '⛔ İzolasyon: yolu kes', variant: 'danger', onClick: () => {
  const i = +roadSel.value; ROADS[i].s = 0; roadSliders[i].set(0);
  sim.toast(`⛔ ${ROADS[i].name} yolu kesildi`, 'bad');
} });
const vOpts = VILLAGES.map((v, i) => ({ value: i, label: v.name }));
const migFrom = ui.select({ label: 'Göç eden köy', options: vOpts, value: 5 });
const migTo = ui.select({ label: 'Göç edilen köy', options: vOpts, value: 4 });
ui.button({ label: '🚶 Göç: nüfusları karıştır', variant: 'primary', onClick: () => {
  const a = +migFrom.value, b = +migTo.value;
  if (a === b) { sim.toast('Farklı iki köy seç', 'warn'); return; }
  let changed = 0;
  lex[b] = lex[b].map((w, k) => (Math.random() < 0.5 && w !== lex[a][k] ? (changed++, lex[a][k]) : w));
  log(b, `🚶 ${VILLAGES[a].name}'dan göç: ${changed} sözcük yeni gelenlerin biçimine geçti`);
  sim.toast(`🚶 ${VILLAGES[a].name} halkı ${VILLAGES[b].name}'e göçtü`, 'good');
  refresh();
} });
ui.section('Görünüm');
ui.buttons([
  { label: '🌊 Kıyıdan', onClick: () => sim.moveCamera([-1150, 360, 760], [-60, 20, -50]) },
  { label: '🗺️ Kuşbakışı', onClick: () => sim.moveCamera([60, 2100, 900], [-40, 0, -30]) },
]);
ui.toggle({ label: 'Köy halkaları, temas çizgileri, gezginler', value: true, onChange: (v) => { overlay.on = v; overlayGroup.visible = v; } });
ui.select({ label: 'Etiketlerde gösterilen', options: [{ value: '3', label: '3 sözcük (taş · yol · ekmek)' }, ...VOCAB.map((w, i) => ({ value: 'w' + i, label: `"${w}" sözcüğü` }))], value: '3', onChange: (v) => { P.showWord = v; refresh(); } });

ui.section('Sonuç');
const stGen = ui.stat({ label: 'Nesil (~25 yıl)' });
const stProto = ui.stat({ label: 'Ata dile benzerlik', unit: '%' });
const stLangs = ui.stat({ label: 'Ayrı dil (<%70)' });
const chart = ui.chart({ title: 'Benzerlik (%)', series: [{ name: 'Ata dile', color: '#f59e0b' }, { name: 'Köyler ort.', color: '#38bdf8', fill: true }, { name: 'En farklı çift', color: '#f472b6' }], maxPoints: 200, yMin: 0, yMax: 100 });
const treeWrap = document.createElement('div');
treeWrap.className = 'chart';
treeWrap.innerHTML = '<div class="chart-title">Soy ağacı (UPGMA) · kesikli çizgi: dil sınırı</div>';
const treeC = document.createElement('canvas');
treeC.style.height = '150px';
treeWrap.append(treeC);
ui.append(treeWrap);
const lexCard = ui.text('', 'card');
ui.text('<b>Son değişimler</b>');
const logCard = ui.text('', 'card');

function selectVillage(i) {
  selected = i;
  refresh();
  sim.toast(`🔍 ${VILLAGES[i].name} sözlüğü panelde`, '');
}
sim.onClick(markers, (hit) => selectVillage(hit.object.userData.vi));

function refresh() {
  const s = stats();
  stGen.set(gen);
  stProto.set(Math.round(s.proto * 100), s.proto > 0.8 ? 'good' : s.proto > 0.6 ? 'warn' : 'bad');
  stLangs.set(s.langs, s.langs <= 1 ? 'good' : s.langs <= 3 ? 'warn' : 'bad');
  // Köy etiketleri
  const CL = ['#fde68a', '#bae6fd', '#fbcfe8', '#bbf7d0', '#ddd6fe', '#fecaca'];
  VILLAGES.forEach((v, i) => {
    const ks = P.showWord === '3' ? [2, 4, 5] : [+P.showWord.slice(1)];
    const words = ks.map((k) => (lex[i][k] === VOCAB[k] ? lex[i][k] : `<span style="color:#fbbf24">${lex[i][k]}</span>`)).join(' · ');
    const sim100 = Math.round(similarity(lex[i], VOCAB) * 100);
    v.label.setText(`<b style="color:${v.color}">${v.name}</b> <small style="color:${CL[s.labels[i] % CL.length]}">● dil ${s.labels[i] + 1}</small><br><span style="font-size:14px">${words}</span><br><small>ata dile %${sim100}</small>`);
    v.label.el.style.outline = i === selected ? `2px solid ${v.color}` : '';
    v.ringMat.color.set(v.color).multiplyScalar(i === selected ? 3.2 : 1.3);
    v.terrMat.color.set(LANG_C[s.labels[i] % LANG_C.length]);
  });
  // Seçili köy sözlüğü
  const L = lex[selected];
  lexCard.set(`<b style="color:${VILLAGES[selected].color}">${VILLAGES[selected].name}</b> sözlüğü (ata dil → bugün):<br>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;margin-top:6px;font-size:12.5px">
    ${VOCAB.map((w, k) => `<span>${w} → ${L[k] === w ? `<span style="color:#94a3b8">${w}</span>` : `<b style="color:#fbbf24">${L[k]}</b>`}</span>`).join('')}</div>
    <small>Diğer köylere benzerlik: ${VILLAGES.map((v, j) => (j === selected ? '' : `${v.name} %${Math.round(s.S[selected][j] * 100)}`)).filter(Boolean).join(' · ')}</small>`);
  logCard.set(logs.length ? logs.join('<br>') : 'Henüz değişim yok. ▶ ile zamanı akıt.');
  drawTree(s.tree);
}

function drawTree(root) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = treeC.clientWidth || 260, H = 150;
  if (treeC.width !== W * dpr) { treeC.width = W * dpr; treeC.height = H * dpr; }
  const g = treeC.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const pl = 74, pr = 10, pt = 10, pb = 18;
  const maxH = Math.max(0.25, root.h * 1.1);
  const X = (h) => pl + (h / maxH) * (W - pl - pr);
  const order = [];
  (function walk(n) { if (n.leaf != null) order.push(n.leaf); else { walk(n.left); walk(n.right); } })(root);
  const ly = {};
  order.forEach((l, i) => (ly[l] = pt + ((H - pt - pb) * (i + 0.5)) / order.length));
  g.lineWidth = 1.8;
  function draw(n) {
    if (n.leaf != null) return ly[n.leaf];
    const y1 = draw(n.left), y2 = draw(n.right);
    const x = X(n.h);
    g.strokeStyle = '#cbd5e1';
    g.beginPath();
    g.moveTo(X(n.left.h), y1); g.lineTo(x, y1); g.lineTo(x, y2); g.lineTo(X(n.right.h), y2);
    g.stroke();
    return (y1 + y2) / 2;
  }
  draw(root);
  g.font = '11px system-ui'; g.textAlign = 'right'; g.textBaseline = 'middle';
  order.forEach((l) => { g.fillStyle = VILLAGES[l].color; g.fillText(VILLAGES[l].name, pl - 6, ly[l]); });
  // Dil sınırı (benzerlik %70 → yükseklik 0,15)
  g.setLineDash([4, 3]); g.strokeStyle = '#f87171'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(X(0.15), pt - 4); g.lineTo(X(0.15), H - pb + 2); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(148,163,184,.9)'; g.font = '10px system-ui'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  for (const v of [0, 0.1, 0.2, 0.3, 0.4, 0.5].filter((v) => v <= maxH)) g.fillText(`%${fmt(v * 200)}`, X(v), H);
}

sim.formatTime = () => `${gen}. nesil · ~${fmt(gen * 25)} yıl`;
sim.onReset(() => {
  ROADS.forEach((r, i) => { r.s = [0.8, 0.7, 0.3, 0.25, 0.2][i]; roadSliders[i].set(r.s); });
  P.drift = 0.35; P.contact = 0.5; sDrift.set(0.35); sContact.set(0.5);
  reset();
  if (sim.paused) sim.play();
});
new ResizeObserver(() => refresh()).observe(sim.ui.body);
reset();
