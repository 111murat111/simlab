// Rüzgâr Türbini — P = ½ρAv³Cp, Betz sınırı, Cp(λ, β) eğrisi, kanat açısı kontrolü, iz (wake) akışı ve Weibull yıllık enerji.
import { createSim, THREE, fmt, clamp, rand, lerp, disposeObject, mat, landscape, createTerrain, terrainSkirt, createVegetation, createOcean, RoundedBoxGeometry, BufferGeometryUtils } from '@core';
import { BETZ, CUT_IN, CUT_OUT, ETA, cp, lamOpt, cpMax, airDensity, hubHeight, ratedWind, operate, operateManual, induction, weibull, annual } from './model.js';
import { xyPlot } from './plot.js';

const RV = 10; // görsel rotor yarıçapı (birim)
const NP = 1400; // akış izi (en fazla)
const FLOW = 1.3; // parçacık görsel hızı: birim/s başına m/s
const X0 = -40, X1 = 80, RMAX = 16;

const sim = createSim({
  sky: { elevation: 30, azimuth: 128, clouds: 0.35, visibility: 9000, wind: [7, 2] },
  camera: { position: [-260, 190, 400], target: [100, 90, 0], fov: 50, near: 0.3, far: 80000 },
  controls: { maxDistance: 2600, minDistance: 3 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Yatay eksenli bir rüzgâr türbini. Rüzgâr soldan gelir; rotor rüzgârın kinetik enerjisinin bir kısmını alır, bu yüzden
    arkasındaki hava <b>yavaşlar</b> (kısalan mavi akış izleri) ve genişleyen bir <b>iz</b> (wake) oluşur. Rüzgârdaki güç
    <b>P = ½·ρ·A·v³</b>: hız iki katına çıkınca güç <b>8 katına</b>, rotor çapı iki katına çıkınca güç <b>4 katına</b> çıkar.</p>
    <p>Türbinin aldığı pay <b>güç katsayısı Cp</b>'dir. Hiçbir türbin <b>Betz sınırını (16/27 ≈ %59,3)</b> aşamaz: havayı tamamen
    durdurursan arkadan gelen hava geçemez. En iyi durumda rotor önündeki rüzgârı 1/3 oranında yavaşlatır, iz ise
    serbest rüzgârın 1/3'üne iner. Gerçek büyük türbinlerde aerodinamik Cp ≈ 0,45–0,50'dir.</p>
    <p>Cp, <b>uç hız oranına</b> λ = ωR/v (kanat ucunun hızı / rüzgâr hızı) ve kanat açısına (pitch, β) bağlıdır.
    Otomatik kontrolde türbin üç bölgede çalışır: <b>${CUT_IN} m/s</b> altında durur; nominal hıza kadar rotor devrini
    ayarlayıp en iyi λ'yı izler (Cp en yüksek); nominal hızın üstünde kanatları döndürüp (pitch) gücü sınırlar;
    <b>${CUT_OUT} m/s</b> üstünde kanatları rüzgâra paralel (bayrak) konuma alıp durur.</p>
    <h3>Dene</h3>
    <ul>
      <li>Rüzgârı 6'dan 12 m/s'ye çıkar: rüzgârdaki güç 8 kat artar ama çıkış nominal güçte kesilir; kanat açısı büyür.</li>
      <li>"Elle" kontrole geç, λ'yı 3 ile 14 arasında gezdir: Cp tepe noktasını bul. Kanat sayısını 2'ye indir, tepe sağa kayar.</li>
      <li>Rakımı 2.500 m'ye çıkar veya sıcaklığı 35 °C yap: hava seyrelir, aynı rüzgârda daha az enerji.</li>
      <li>"Küçük ev türbini": ortalama 4,5 m/s rüzgârda kapasite faktörü neden bu kadar düşük? Ortalama hızı 6'ya çıkar.</li>
      <li>Weibull k'yi 1,5'e düşür (değişken rüzgâr) ve 3'e çıkar (düzenli rüzgâr): aynı ortalamada yıllık enerji değişir.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p><small>Cp(λ, β) için Heier (1998) / Slootweg vd. (2003, IEEE Trans. Power Systems) ampirik formülü kullanılır:
    Cp = 0,5176·(116/λᵢ − 0,4β − 5)·e<sup>−21/λᵢ</sup> + 0,0068λ, 1/λᵢ = 1/(λ+0,08β) − 0,035/(β³+1); tepe ≈ 0,48 (λ ≈ 8,1).
    Bu formül 3 kanatlı türbin içindir; 1, 2, 4, 5 kanat için λ ekseni ve tepe değeri <b>temsilî</b> olarak ölçeklenir
    (az kanat → yüksek optimum λ ve daha büyük uç kaybı). Dişli + jeneratör verimi %95 kabul edilir. İz hızı ideal
    aktüatör disk kuramından (Cp = 4a(1−a)²) gelir; parçacıklar görünürlük için hızlandırılmıştır, görsel dönüş hızı
    sınırlıdır. Rüzgâr hızı göbek yüksekliğindedir; rüzgâr kesmesi, türbülans, yaw ve park içi iz kayıpları "diğer kayıplar"
    kaydırıcısında toplanır. Yıllık enerji: güç eğrisi × Weibull dağılımı × 8.760 saat. Hazır ayarlardaki boyutlar temsilîdir;
    açık deniz ayarı 240 m rotorlu IEA 15 MW referans türbinine (Gaertner vd., NREL, 2020) benzer.</small></p>`,
});

// --- Sahne ---
// Dünya metre cinsinden (arazi, deniz, gökyüzü gerçek ölçekte). Simülasyon içeriği (türbin, akış, etiketler) RV birimli
// "content" grubunda; grup ölçeği = rotor yarıçapı / RV, böylece 3 m'lik ev türbini de 240 m'lik deniz türbini de gerçek boyda.
const scene = sim.scene;
const content = new THREE.Group();
scene.add(content);

// Arazi: türbin sırtı düzleştirilmiş, çevrede aşınmış tepeler; uzakta kademeli ufuk
const hf0 = landscape({ seed: 12, size: 1300, height: 280, base: -40, warp: 0.55 });
const hf = (x, z) => {
  const r = Math.hypot(x, z), flat = THREE.MathUtils.smoothstep(r, 70, 320);
  return THREE.MathUtils.lerp(4, hf0(x, z) - hf0(0, 0) + 4 + 0.012 * r, flat) + 26 * (1 - Math.exp(-((r / 2600) ** 2))) ;
};
const land = new THREE.Group();
scene.add(land);
const TR = 3200;
land.add(createTerrain(hf, { size: [2 * TR, 2 * TR], res: [384, 384], materialOptions: { water: -50, grass: 0x5b6d2c, dry: 0x9c8f58, forest: 0.8 } }));
land.add(terrainSkirt(hf, { inner: TR, outer: 60000 }));
const veg = createVegetation(hf, {
  rect: [-2400, -2400, 2400, 2400], trees: 2600, shrubs: 2600, rocks: 500, grass: 22000, grassAt: [0, 0, 55], seed: 21,
  kinds: { broad: 0.55, pine: 0.3, cypress: 0.15 }, near: [0, 0, 900],
  forest: (x, z) => { const r = Math.hypot(x, z); return r < 120 ? 0 : 0.38 + 0.3 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.024) + 0.25 * Math.sin((x - 0.6 * z) * 0.057) * Math.cos(z * 0.043 + x * 0.01); },
});
land.add(veg.group);

// Açık deniz ayarı için okyanus (yalnız o ayarda görünür ve güncellenir)
const ocean = createOcean(sim.renderer, sim.sky, { wind: 10, windDir: 260, fetch: 300 });
ocean.mesh.visible = false;
scene.add(ocean.mesh);

// --- Türbin (içerik birimi: RV = rotor yarıçapı) ---
const turbine = new THREE.Group();
content.add(turbine);
const paint = mat.paintedMetal({ color: 0xeef1f2, wear: 0.02 });
const gel = mat.plastic({ color: 0xf1f3f3, gloss: 0.35 });
const steel = mat.brushedMetal({ color: 0xa9adb2 });
const yellow = mat.paintedMetal({ color: 0xf0b90b, wear: 0.2 });
const concrete = mat.concrete({ color: 0xa8a399 });

// Kule: konik, üç bölüm, flanş halkaları; boy layout()'ta yeniden kurulur
let tower = null;
const towerGroup = new THREE.Group();
turbine.add(towerGroup);
function buildTower(h) {
  towerGroup.clear();
  tower = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.36, h, 64, 8), paint);
  tower.position.y = h / 2;
  towerGroup.add(tower);
  for (const f of [0.34, 0.68]) {
    const r = lerp(0.36, 0.2, f);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.004, 0.012, 8, 64), steel);
    ring.rotation.x = Math.PI / 2; ring.position.y = h * f;
    towerGroup.add(ring);
  }
  const door = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.36, 0.2, 3, 0.03), steel);
  door.position.set(-0.34, 0.32, 0); towerGroup.add(door);
  const vent = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.1, 0.16, 2, 0.02), steel);
  vent.position.set(-0.335, 0.62, 0); towerGroup.add(vent);
}
// Temel: beton kaide + çakıl alan (karada) / sarı geçiş parçası + monopil (denizde)
const base = new THREE.Group();
turbine.add(base);
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.18, 64), concrete);
plinth.position.y = 0.04; base.add(plinth);
const gravel = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64).rotateX(-Math.PI / 2), mat.asphalt({ color: 0x77726a, scale: 2 }));
gravel.position.y = 0.07; base.add(gravel);
const seaBase = new THREE.Group();
const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.6, 64), yellow);
tp.position.y = 0.6; seaBase.add(tp);
const deck = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.06, 64), steel);
deck.position.y = 1.4; seaBase.add(deck);
for (let i = 0; i < 24; i++) {
  const a = (i / 24) * Math.PI * 2, post = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), yellow);
  post.position.set(Math.cos(a) * 0.87, 1.5, Math.sin(a) * 0.87); seaBase.add(post);
}
const rail = new THREE.Mesh(new THREE.TorusGeometry(0.87, 0.008, 6, 96), yellow);
rail.rotation.x = Math.PI / 2; rail.position.y = 1.57; seaBase.add(rail);
const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 6, 48), mat.paintedMetal({ color: 0x3b4046, wear: 0.4 }));
pile.position.y = -3.2; seaBase.add(pile);
seaBase.visible = false;
turbine.add(seaBase);

const head = new THREE.Group(); // nasel + rotor
turbine.add(head);
// Nasel: yuvarlatılmış gövde, arka soğutucu, üstte anemometre direği ve uçak ikaz lambası
const nacelle = new THREE.Mesh(new RoundedBoxGeometry(3.8, 1.4, 1.35, 6, 0.34), paint);
nacelle.position.x = 1.1;
head.add(nacelle);
const cooler = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.9, 1.1, 3, 0.08), steel);
cooler.position.set(3.05, 0.1, 0); head.add(cooler);
const yawRing = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.25, 48), steel);
yawRing.position.set(0.2, -0.72, 0); head.add(yawRing);
const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 8), steel);
mast.position.set(2.4, 0.95, 0.2); head.add(mast);
const cups = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 16), steel);
cups.rotation.x = Math.PI / 2; cups.position.set(2.4, 1.2, 0.2); head.add(cups);
const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 8), mat.glow({ color: 0xff2211, intensity: 6 }));
beacon.position.set(2.4, 0.8, -0.3); head.add(beacon);
const rotor = new THREE.Group();
rotor.position.x = -1.1;
head.add(rotor);
// Burun konisi (lathe profili)
const spinner = new THREE.Mesh(new THREE.LatheGeometry(Array.from({ length: 17 }, (_, i) => {
  const t = i / 16; return new THREE.Vector2(0.78 * Math.sqrt(Math.max(0, 1 - (1 - t) ** 2 * 0.98)) * (t < 1 ? 1 : 0) + 1e-3, -1.3 * (1 - t));
}), 64), gel);
spinner.rotation.z = Math.PI / 2;
rotor.add(spinner);
const hubRing = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.25, 64), gel);
hubRing.rotation.z = Math.PI / 2; hubRing.position.x = 0.12; rotor.add(hubRing);

// Kanat: kanat profili (NACA 4 haneli, %2 kamburluk) istasyonlarla örülür; veter kökte geniş → uçta dar, burulma 14° → 0°,
// kök silindirik. Açıklık +y, veter z, kalınlık x (rüzgâr +x yönünde).
function bladeGeometry() {
  const r0 = 0.55, NS = 40, NA = 28, pos = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const s = i / NS, r = r0 + (RV - r0) * Math.pow(s, 0.9);
    const x = (r - r0) / (RV - r0);
    const chord = x < 0.18 ? lerp(0.62, 1.0, THREE.MathUtils.smoothstep(x, 0, 0.18)) : lerp(1.0, 0.16, Math.pow((x - 0.18) / 0.82, 0.8));
    const tc = lerp(1.0, 0.24, THREE.MathUtils.smoothstep(x, 0.02, 0.3)) - 0.08 * x; // kalınlık/veter
    const twist = THREE.MathUtils.degToRad(lerp(14, 0, Math.pow(x, 0.7)));
    const round = 1 - THREE.MathUtils.smoothstep(x, 0.0, 0.16); // kökte daireye geçiş
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      // profil: xc ∈ [0,1] veter boyu; üst/alt yüzey NACA kalınlık dağılımı
      const xc = 0.5 - 0.5 * Math.cos(a), up = a < Math.PI ? 1 : -1;
      const yt = 5 * tc * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4);
      const camber = 0.02 * (xc < 0.4 ? (2 * 0.4 * xc - xc * xc) / 0.16 : ((1 - 0.8) + 2 * 0.4 * xc - xc * xc) / 0.36);
      let cz = (xc - 0.3) * chord, cx = (camber * (1 - round) + up * yt) * chord;
      const cr = 0.24 * Math.min(1, chord); // kök dairesi
      cz = lerp(cz, Math.cos(a) * -cr, round); cx = lerp(cx, Math.sin(a) * cr, round);
      const zz = cz * Math.cos(twist) - cx * Math.sin(twist), xx = cz * Math.sin(twist) + cx * Math.cos(twist);
      pos.push(xx * 0.55, r, zz * 0.75);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NA; j++) {
    const a = i * NA + j, b = i * NA + (j + 1) % NA, c = a + NA, d = b + NA;
    idx.push(a, c, b, b, c, d);
  }
  const tip = pos.length / 3; const tp = pos.slice(-NA * 3);
  let cx = 0, cy = 0, cz = 0; for (let j = 0; j < NA; j++) { cx += tp[j * 3]; cy += tp[j * 3 + 1]; cz += tp[j * 3 + 2]; }
  pos.push(cx / NA, cy / NA + 0.05, cz / NA);
  for (let j = 0; j < NA; j++) idx.push(NS * NA + j, tip, NS * NA + (j + 1) % NA);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const bladeGeo = bladeGeometry();
let bladePivots = [];
function buildBlades(B) {
  bladePivots.forEach((p) => p.parent.removeFromParent());
  bladePivots = [];
  for (let i = 0; i < B; i++) {
    const arm = new THREE.Group();
    arm.rotation.x = (i / B) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.add(new THREE.Mesh(bladeGeo, gel));
    arm.add(pivot);
    rotor.add(arm);
    bladePivots.push(pivot);
  }
}

// Rüzgâr çiftliği: aynı türbinin kopyaları gerçek ölçekte, arazide ya da denizde
const farm = new THREE.Group();
scene.add(farm);
const farmRotors = [];
function buildFarm(site, m, hub) {
  farm.clear(); farmRotors.length = 0;
  if (site === 'kucuk') return;
  const spots = site === 'deniz'
    ? [[7, -6], [14, -2], [-6, -9], [2, -15], [11, -12], [20, -8], [-14, -16], [26, -18]]
    : [[6, -7], [-5, -10], [12, 3], [16, -9], [-11, -3], [3, -18], [22, -3], [-17, -14]];
  const D = RV * 2 * m;
  for (const [a, b] of spots) {
    const x = a * D, z = b * D, y = site === 'deniz' ? 0 : hf(x, z);
    const t = new THREE.Group();
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.36, hub, 24), paint); tw.position.y = hub / 2; t.add(tw);
    const hd = new THREE.Group(); hd.position.y = hub; t.add(hd);
    const nc = new THREE.Mesh(new RoundedBoxGeometry(3.8, 1.4, 1.35, 3, 0.34), paint); nc.position.x = 1.1; hd.add(nc);
    const rt = new THREE.Group(); rt.position.x = -1.1; hd.add(rt);
    rt.add(spinner.clone());
    for (let i = 0; i < 3; i++) { const arm = new THREE.Group(); arm.rotation.x = (i / 3) * Math.PI * 2; arm.add(new THREE.Mesh(bladeGeo, gel)); rt.add(arm); }
    if (site === 'deniz') { const s = seaBase.clone(); s.visible = true; t.add(s); } else { const p = plinth.clone(); t.add(p); }
    t.scale.setScalar(m);
    t.position.set(x, y + (site === 'deniz' ? 0 : -0.2), z);
    t.rotation.y = rand(-0.08, 0.08);
    farm.add(t);
    farmRotors.push({ r: rt, ph: rand(0, 6.28) });
  }
}

// Ölçek için insan figürü (1,8 m): eklemli gövde, iş tulumu ve baret
const person = new THREE.Group();
{
  const suit = mat.fabric({ color: 0xe8661c }), skin = mat.tissue({ color: 0xd6a07c, veins: 0 }), dark = mat.fabric({ color: 0x2b2f36 });
  const add = (g, m, x, y, z, rx = 0, rz = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, 0, rz); person.add(o); return o; };
  add(new THREE.CapsuleGeometry(0.16, 0.42, 6, 16), suit, 0, 1.2, 0);                                     // gövde
  add(new THREE.CapsuleGeometry(0.065, 0.72, 4, 12), dark, -0.09, 0.47, 0.02, 0.05);                       // bacaklar
  add(new THREE.CapsuleGeometry(0.065, 0.72, 4, 12), dark, 0.09, 0.47, -0.02, -0.05);
  add(new THREE.CapsuleGeometry(0.05, 0.52, 4, 12), suit, -0.23, 1.17, 0, 0.1, 0.12);                        // kollar
  add(new THREE.CapsuleGeometry(0.05, 0.52, 4, 12), suit, 0.23, 1.17, 0, -0.1, -0.12);
  add(new THREE.SphereGeometry(0.105, 24, 16), skin, 0, 1.62, 0);                                            // baş
  add(new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.plastic({ color: 0xf5f5f0, gloss: 0.6 }), 0, 1.66, 0); // baret
  person.position.set(3, 0, 5);
  content.add(person);
}
const personLabel = sim.label('insan 1,8 m', { parent: person, position: [0, 1.4, 0], className: 'plain' });

// Akış tüpü yüzeyi (rotordan geçen havanın sınırı)
// Yalnız kenarda belirgin (Fresnel) cam benzeri zar: arkasındaki manzarayı karartmaz
const tubeMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
  uniforms: { uCol: { value: new THREE.Color(0.75, 0.9, 1.0) } },
  vertexShader: `varying vec3 vN, vV; void main(){ vec4 mv = modelViewMatrix*vec4(position, 1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uCol; varying vec3 vN, vV; void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uCol, 0.006 + 0.2*pow(f, 5.0)); }`,
});
let tube = null;

// Akış izleri: her parçacık hızına göre uzayan ince bir çizgi (baş opak, kuyruk saydam).
// Rotor ve iz bölgesinde yoğun, dışarıda ve kameraya yakında seyrek/soluk.
const pPos = new Float32Array(NP * 6), pCol = new Float32Array(NP * 8);
const px = new Float32Array(NP), pr0 = new Float32Array(NP), pth = new Float32Array(NP);
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 4));
const DENS = { az: 260, orta: 600, cok: NP };
let nActive = DENS.az;
pGeo.setDrawRange(0, nActive * 2);
const points = new THREE.LineSegments(pGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: true }));
points.frustumCulled = false;
content.add(points);
function spawn(i, anywhere) {
  px[i] = anywhere ? rand(X0, X1) : X0 + rand(0, 3);
  // %80'i rotordan geçen akış tüpü içinde/çevresinde, kalanı dış akışta
  pr0[i] = Math.random() < 0.8 ? RV * 1.05 * Math.sqrt(Math.random()) : RV * 1.05 + (RMAX - RV * 1.05) * Math.random();
  pth[i] = rand(0, Math.PI * 2);
}
for (let i = 0; i < NP; i++) spawn(i, true);

const hubLabel = sim.label('', { parent: head, position: [0, 3.2, 0] });
const windLabel = sim.label('Rüzgâr →', { parent: content, position: [X0 + 6, 0, 0], className: 'plain' });
const wakeLabel = sim.label('', { parent: content, position: [60, 0, 0], className: 'plain' });

// --- Durum ---
const st = { v: 9, alt: 0, temp: 15, D: 130, Pk: 4000, B: 3, manual: false, lam: 8, beta: 0, U: 7.5, k: 2, loss: 10 };
let t = {}, op = {}, a = 0, hubVis = 16, S = 1, rotorAngle = 0;
let annualRes = { E: 0, cf: 0 };
let camD = -1;

function turbineParams() {
  return { D: st.D, B: st.B, Prated: st.Pk * 1000, rho: airDensity(st.alt, st.temp) };
}

let site = 'kara', towerH = -1, camSite = '';
function layout() {
  S = RV / (st.D / 2);
  const m = 1 / S; // metre / içerik birimi
  hubVis = hubHeight(st.D) * S;
  content.scale.setScalar(m);
  const sea = site === 'deniz';
  content.position.y = sea ? 1.5 * m : hf(0, 0) - 0.02 * m;
  seaBase.position.y = -1.5;
  if (Math.abs(towerH - hubVis) > 1e-3) { towerH = hubVis; buildTower(hubVis); }
  head.position.y = hubVis;
  person.scale.setScalar(S);
  if (sea) person.position.set(0.55, -0.07, 0.45);
  else person.position.set(RV * 0.35 + 0.4 * S, 0, RV * 0.45);
  personLabel.position.y = 2.1;
  hubLabel.position.y = 3.2;
  windLabel.position.y = hubVis + RMAX * 0.2;
  wakeLabel.position.y = hubVis - RV * 1.35;
  if (camD === st.D && camSite === site) return;
  camD = st.D; camSite = site;
  buildFarm(st.D < 10 ? 'kucuk' : site, m, hubVis);
  const dist = Math.max(40, (hubVis + RV) * 1.35);
  const cam = sim.camera;
  cam.near = Math.max(0.1, dist * m * 0.004); cam.updateProjectionMatrix();
  if (sim.controls) { sim.controls.minDistance = 6 * m; sim.controls.maxDistance = Math.max(300, 320 * m); }
  sim.moveCamera([-dist * 0.75 * m, (hubVis * 0.75 + 8) * m + content.position.y, dist * 0.9 * m],
    [16 * m, Math.max(hubVis * 0.72, hubVis - RV * 0.6) * m + content.position.y, 0]);
}

// Eksen üzerindeki hız açığı (aktüatör disk / girdap silindiri), x birim cinsinden
const deficit = (x) => a * (1 + x / Math.sqrt(x * x + RV * RV));
const recover = (x) => (x > 45 ? Math.exp(-(x - 45) / 70) : 1);

function buildTube() {
  if (tube) disposeObject(tube);
  tube = null;
  if (a < 0.005) return;
  const Rinf = RV * Math.sqrt(1 - a);
  const pts = [];
  for (let x = -30; x <= 70; x += 2.5) pts.push(new THREE.Vector2(Rinf * Math.sqrt(1 / (1 - deficit(x))), x));
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateZ(-Math.PI / 2);
  tube = new THREE.Mesh(g, tubeMat);
  tube.position.y = hubVis;
  tube.visible = showTube.value;
  content.add(tube);
}

function compute() {
  t = turbineParams();
  op = st.manual ? operateManual(t, st.v, st.lam, st.beta) : operate(t, st.v);
  a = induction(op.cp);
  if (op.region === 4 || st.v < 0.5) a = 0;
}

function recomputeAll() {
  compute();
  layout();
  buildTube();
  const lossF = 1 - st.loss / 100;
  const r = annual(t, st.U, st.k);
  annualRes = { E: r.E * lossF, cf: r.cf * lossF };
  refreshPanel();
  drawCharts();
}

// --- Güncelleme ---
const col = new THREE.Color(), cSlow = new THREE.Color(0x4f8dff), cFast = new THREE.Color(0xe4edf7), camL = new THREE.Vector3();
sim.onUpdate((dt) => {
  // Rotor: gerçek açısal hız, görsel olarak en fazla ≈ 50 d/dk
  const w = Math.min(op.omega || 0, 5.2);
  rotorAngle += w * dt;
  rotor.rotation.x = -rotorAngle;
  for (const f of farmRotors) f.r.rotation.x = -rotorAngle * 0.97 - f.ph;
  const beta = THREE.MathUtils.degToRad(op.beta || 0);
  for (const p of bladePivots) p.rotation.y = lerp(p.rotation.y, beta, Math.min(1, dt * 3));

  const vis = st.v * FLOW;
  const Rinf2 = RV * RV * (1 - a);
  // kamera içerik koordinatında: yakındaki izler soluklaşır (ön planı kirletmesin)
  content.worldToLocal(camL.copy(sim.camera.position));
  const tailT = 0.32; // kuyruk = hız × 0,32 s
  for (let i = 0; i < nActive; i++) {
    const x = px[i];
    const d = deficit(x);
    const r02 = pr0[i] * pr0[i];
    const inside = r02 < Rinf2;
    const geo = 1 / (1 - d);
    const r = Math.sqrt(inside ? r02 * geo : r02 + Rinf2 * (geo - 1));
    const u = inside ? 1 - d * recover(x) : 1 + 0.25 * a * Math.exp(-((x / 25) ** 2)) * (Rinf2 / (r * r + 1));
    const sp = Math.max(0.15, vis * u);
    px[i] += sp * dt + 0.02;
    if (px[i] > X1) spawn(i, false);
    const y = hubVis + r * Math.sin(pth[i]), z = r * Math.cos(pth[i]);
    const L = Math.min(9, sp * tailT + 0.3);
    const o = i * 6, hide = y < 0.3 ? -500 : 0;
    pPos[o] = px[i]; pPos[o + 1] = y + hide; pPos[o + 2] = z;
    pPos[o + 3] = px[i] - L; pPos[o + 4] = y + hide; pPos[o + 5] = z;
    // opaklık: giriş/çıkışta yumuşak, dış akışta seyrek, kameraya yakında soluk
    const fx = THREE.MathUtils.smoothstep(px[i], X0, X0 + 14) * (1 - THREE.MathUtils.smoothstep(px[i], X1 - 22, X1));
    const fr = pr0[i] < RV * 1.05 ? 0.6 + 0.4 * THREE.MathUtils.smoothstep(px[i], -14, 2) : 0.35;   // rotor ve iz (wake) bölgesi belirgin
    const dc = Math.hypot(px[i] - camL.x, y - camL.y, z - camL.z);
    const fc = THREE.MathUtils.smoothstep(dc, RV * 1.2, RV * 3.5);
    col.copy(cSlow).lerp(cFast, clamp((u - 0.3) / 0.7, 0, 1));
    const al = 0.6 * fx * fr * fc;
    const c = i * 8;
    pCol[c] = col.r; pCol[c + 1] = col.g; pCol[c + 2] = col.b; pCol[c + 3] = al;
    pCol[c + 4] = col.r; pCol[c + 5] = col.g; pCol[c + 6] = col.b; pCol[c + 7] = 0;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
});

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır ayarlar');
const PRESETS = {
  kara: { v: 9, alt: 300, temp: 15, D: 130, Pk: 4000, B: 3, U: 7.5, k: 2, site: 'kara', manual: false },
  deniz: { v: 11, alt: 0, temp: 12, D: 240, Pk: 15000, B: 3, U: 9.5, k: 2.2, site: 'deniz', manual: false },
  firtina: { v: 28, alt: 300, temp: 8, D: 130, Pk: 4000, B: 3, U: 7.5, k: 2, site: 'firtina', manual: false },
  kucuk: { v: 7, alt: 100, temp: 15, D: 3, Pk: 2.5, B: 3, U: 4.5, k: 2, site: 'kara', manual: false },
};
ui.buttons([
  { label: '🏞️ Kara türbini', onClick: () => applyPreset('kara') },
  { label: '🌊 Açık deniz', onClick: () => applyPreset('deniz') },
]);
ui.buttons([
  { label: '⛈️ Fırtına', onClick: () => applyPreset('firtina') },
  { label: '🏡 Küçük ev türbini', onClick: () => applyPreset('kucuk') },
]);

ui.section('Rüzgâr ve hava');
const sV = ui.slider({ label: 'Rüzgâr hızı (göbekte)', min: 0, max: 30, step: 0.5, value: st.v, unit: 'm/s', onInput: (v) => { st.v = v; recomputeLight(); } });
const sAlt = ui.slider({ label: 'Rakım', min: 0, max: 3000, step: 50, value: st.alt, unit: 'm', onInput: (v) => { st.alt = v; recomputeAll(); } });
const sTemp = ui.slider({ label: 'Hava sıcaklığı', min: -20, max: 40, step: 1, value: st.temp, unit: '°C', onInput: (v) => { st.temp = v; recomputeAll(); } });

ui.section('Türbin');
const sD = ui.slider({ label: 'Rotor çapı', min: 2, max: 240, step: 1, value: st.D, unit: 'm', onInput: (v) => { st.D = v; recomputeAll(); } });
const PMIN = 1, PMAX = 20000;
const toP = (s) => {
  const p = PMIN * Math.pow(PMAX / PMIN, s / 100), e = Math.pow(10, Math.floor(Math.log10(p)) - 1);
  return Math.round(p / e) * e; // iki anlamlı basamak
};
const fromP = (p) => (100 * Math.log(p / PMIN)) / Math.log(PMAX / PMIN);
const fmtP = (w) => (w >= 1e6 ? `${fmt(w / 1e6, w >= 1e7 ? 1 : 2)} MW` : w >= 1e3 ? `${fmt(w / 1e3, w >= 1e5 ? 0 : 1)} kW` : `${fmt(w, 0)} W`);
const sP = ui.slider({ label: 'Nominal güç', min: 0, max: 100, step: 0.1, value: fromP(st.Pk), format: (s) => fmtP(toP(s) * 1000), onInput: (s) => { st.Pk = toP(s); recomputeAll(); } });
const segB = ui.segmented({ label: 'Kanat sayısı', options: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) })), value: st.B,
  onChange: (b) => { st.B = b; buildBlades(b); recomputeAll(); } });
const segMode = ui.segmented({ label: 'Kontrol', options: [{ value: 'oto', label: 'Otomatik' }, { value: 'elle', label: 'Elle' }], value: 'oto',
  onChange: (m) => { st.manual = m === 'elle'; syncManual(); recomputeAll(); } });
const sLam = ui.slider({ label: 'Uç hız oranı λ (elle)', min: 1, max: 16, step: 0.1, value: st.lam, onInput: (v) => { st.lam = v; recomputeLight(); } });
const sBeta = ui.slider({ label: 'Kanat açısı β (elle)', min: 0, max: 40, step: 0.5, value: st.beta, unit: '°', onInput: (v) => { st.beta = v; recomputeLight(); } });
function syncManual() { sLam.disable(!st.manual); sBeta.disable(!st.manual); }

ui.section('Anlık durum');
const stWind = ui.stat({ label: 'Rüzgârdaki güç' });
const stOut = ui.stat({ label: 'Elektrik çıkışı' });
const stCp = ui.stat({ label: 'Cp (aerodinamik)' });
const stLam = ui.stat({ label: 'Uç hız oranı λ' });
const stRpm = ui.stat({ label: 'Rotor devri', unit: 'd/dk' });
const stTip = ui.stat({ label: 'Kanat ucu hızı', unit: 'm/s' });
const stBeta = ui.stat({ label: 'Kanat açısı β', unit: '°' });
const stRho = ui.stat({ label: 'Hava yoğunluğu', unit: 'kg/m³' });
const mBetz = ui.meter({ label: 'Betz sınırına yakınlık (Cp / 0,593)', color: '#22c55e' });
const regionText = ui.text('', 'card');
const cpPlot = xyPlot(ui, { title: 'Cp – λ eğrisi (seçili β ve kanat sayısı)', height: 130, xFmt: (v) => fmt(v, 0), yFmt: (v) => fmt(v, 2),
  legend: [{ name: 'Cp(λ)', color: '#38bdf8' }, { name: 'Betz 0,593', color: '#f87171' }, { name: 'çalışma noktası', color: '#facc15' }] });
const pcPlot = xyPlot(ui, { title: 'Güç eğrisi ve rüzgâr dağılımı', height: 140, xFmt: (v) => fmt(v, 0), yFmt: (v) => fmt(v, 0) + '%', y2Fmt: (v) => fmt(v, 0) + '%',
  legend: [{ name: 'çıkış / nominal (sol)', color: '#38bdf8' }, { name: 'Weibull saat payı (sağ)', color: '#a78bfa' }, { name: 'şu an', color: '#facc15' }] });

ui.section('Yıllık üretim');
const sU = ui.slider({ label: 'Yıllık ortalama rüzgâr', min: 3, max: 12, step: 0.1, value: st.U, unit: 'm/s', onInput: (v) => { st.U = v; recomputeAll(); } });
const sK = ui.slider({ label: 'Weibull biçim k (2 = Rayleigh)', min: 1.2, max: 3.5, step: 0.1, value: st.k, onInput: (v) => { st.k = v; recomputeAll(); } });
const sLoss = ui.slider({ label: 'Diğer kayıplar (iz, arıza, şebeke)', min: 0, max: 30, step: 1, value: st.loss, unit: '%', onInput: (v) => { st.loss = v; recomputeAll(); } });
const stAEP = ui.stat({ label: 'Yıllık enerji' });
const stCF = ui.stat({ label: 'Kapasite faktörü', unit: '%' });
const stFLH = ui.stat({ label: 'Tam yük saati', unit: 'saat/yıl' });
const stVr = ui.stat({ label: 'Nominal rüzgâr', unit: 'm/s' });
const aepNote = ui.text('', '');

ui.section('Görünüm', { open: false });
const showFlow = ui.toggle({ label: 'Akış izleri', value: true, onChange: (v) => (points.visible = v) });
ui.segmented({ label: 'İz yoğunluğu', options: [{ value: 'az', label: 'Az' }, { value: 'orta', label: 'Orta' }, { value: 'cok', label: 'Çok' }], value: 'az',
  onChange: (v) => { nActive = DENS[v]; pGeo.setDrawRange(0, nActive * 2); } });
const showTube = ui.toggle({ label: 'Akış tüpü (rotordan geçen hava)', value: true, onChange: (v) => tube && (tube.visible = v) });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => [hubLabel, windLabel, wakeLabel, personLabel].forEach((l) => (l.visible = v)) });

const fmtE = (wh) => (wh >= 1e9 ? `${fmt(wh / 1e9, 1)} GWh` : wh >= 1e6 ? `${fmt(wh / 1e6, 1)} MWh` : `${fmt(wh / 1e3, 0)} kWh`);
const REGION = {
  0: 'Elle kontrol: rotor devri λ ile, kanat açısı β ile senin elinde. Güç nominali aşarsa jeneratör aşırı yüklenir.',
  1: `Bölge 1 — rüzgâr ${fmt(CUT_IN)} m/s altında: üretim yok, rotor boşta döner.`,
  2: 'Bölge 2 — değişken hız: rotor devri rüzgârla birlikte artar, λ en iyi değerde tutulur → Cp en yüksek.',
  3: 'Bölge 3 — nominal güç: rotor devri sabit, kanatlar döndürülerek (pitch) fazla güç rüzgâra bırakılır.',
  4: `Fırtına — rüzgâr ${fmt(CUT_OUT)} m/s üstünde: kanatlar bayrak konumunda (β = 90°), rotor frenlendi, üretim yok.`,
};

function refreshPanel() {
  stWind.set(fmtP(op.Pwind));
  const over = st.manual && op.P > t.Prated * 1.02;
  stOut.set(fmtP(op.P), over ? 'bad' : op.P > 0 ? 'good' : '');
  stCp.set(fmt(op.cp, 3), op.cp > BETZ ? 'bad' : '');
  stLam.set(fmt(op.lam, 1));
  const rpm = (op.omega * 60) / (2 * Math.PI);
  stRpm.set(fmt(rpm, rpm < 10 ? 1 : 0));
  const tip = op.omega * st.D / 2;
  stTip.set(fmt(tip, 0), tip > 90 ? 'warn' : '');
  stBeta.set(fmt(op.beta, 1));
  stRho.set(fmt(t.rho, 3));
  mBetz.set(op.cp / BETZ, `${fmt((op.cp / BETZ) * 100, 0)}%`);
  let txt = REGION[op.region];
  if (over) txt += ` <b>Şu an nominalin ${fmt(op.P / t.Prated, 1)} katı!</b>`;
  if (st.manual && st.v > CUT_OUT) txt += ' Bu rüzgârda gerçek türbin kendini durdururdu.';
  regionText.set(txt);
  hubLabel.setText(`<b>${fmtP(op.P)}</b> · Cp ${fmt(op.cp, 2)}`);
  windLabel.setText(`Rüzgâr ${fmt(st.v, 1)} m/s →`);
  wakeLabel.setText(a > 0.005 ? `iz ≈ ${fmt(st.v * (1 - 2 * a), 1)} m/s` : '');
  stAEP.set(fmtE(annualRes.E));
  stCF.set(fmt(annualRes.cf * 100, 1), annualRes.cf > 0.3 ? 'good' : annualRes.cf < 0.15 ? 'bad' : 'warn');
  stFLH.set(fmt(annualRes.cf * 8760, 0));
  stVr.set(fmt(ratedWind(t), 1));
  const homes = annualRes.E / 1e3 / 10791;
  aepNote.set(`Nominal güç ${fmtP(t.Prated)} × 8.760 saat = ${fmtE(t.Prated * 8760)} olurdu; rüzgâr hep esmediği için gerçek üretim bu üst sınırın
    yalnızca bir kısmıdır (kapasite faktörü %${fmt(annualRes.cf * 100, 0)}). Bu enerji ≈ <b>${fmt(homes, homes < 10 ? 1 : 0)}</b> ABD hanesinin yıllık tüketimine eşit
    (10.791 kWh/hane, EIA 2022).`);
}

function drawCharts() {
  const B = st.B, beta = st.manual ? st.beta : op.beta;
  const cpPts = [];
  for (let l = 0; l <= 16; l += 0.2) cpPts.push([l, cp(l, beta, B)]);
  cpPlot.draw({
    xMin: 0, xMax: 16, yMin: 0, yMax: 0.6, xTicks: 8,
    series: [{ pts: cpPts, color: '#38bdf8', fill: 0.12 }],
    hlines: [{ y: BETZ, color: '#f87171', label: 'Betz 16/27' }],
    vlines: [{ x: lamOpt(B), color: 'rgba(148,163,184,.7)', label: `λopt ${fmt(lamOpt(B), 1)}`, bottom: true }],
    marks: op.lam > 0 ? [{ x: Math.min(op.lam, 16), y: op.cp, color: '#facc15' }] : [],
  });
  const f = weibull(st.U, st.k);
  const pc = [], wb = [];
  let wmax = 0;
  for (let v = 0; v <= 30; v += 0.25) {
    pc.push([v, (operate(t, v).P / t.Prated) * 100]);
    const w = f(v) * 100;
    wmax = Math.max(wmax, w);
    wb.push([v, w]);
  }
  pcPlot.draw({
    xMin: 0, xMax: 30, yMin: 0, yMax: 120, xTicks: 6, y2: { min: 0, max: Math.ceil((wmax * 1.1) / 3) * 3 },
    series: [{ pts: wb, color: '#a78bfa', axis: 2, fill: 0.15, width: 1.5 }, { pts: pc, color: '#38bdf8' }],
    vlines: [{ x: CUT_IN, color: 'rgba(148,163,184,.6)', label: 'başlama' }, { x: CUT_OUT, color: 'rgba(248,113,113,.8)', label: 'kesme' }],
    marks: [{ x: Math.min(st.v, 30), y: Math.min(120, (op.P / t.Prated) * 100), color: '#facc15' }],
  });
}

// Çevre: bitki örtüsü rüzgârla salınır, deniz (açık deniz ayarında) dalgalanır
let envT = 0;
sim.onRender((dt) => {
  envT += sim.paused ? 0 : dt;
  veg.update(envT, clamp(st.v / 9, 0.2, 3.5));
  if (ocean.mesh.visible) ocean.update(sim.paused ? 0 : dt, sim.camera);
});

function recomputeLight() {
  compute();
  buildTube();
  refreshPanel();
  drawCharts();
}

function setSite(name) {
  const sea = name === 'deniz', storm = name === 'firtina';
  site = name === 'firtina' ? 'kara' : name;
  land.visible = !sea; ocean.mesh.visible = sea; base.visible = !sea; seaBase.visible = sea;
  sim.sky.set({ clouds: storm ? 0.93 : sea ? 0.22 : 0.35, haze: storm ? 2.2 : 1, visibility: storm ? 3200 : sea ? 16000 : 9000, elevation: storm ? 22 : 30 });
  if (sea) ocean.set({ wind: clamp(st.v * 0.85, 3, 22) });
  camD = -1;
}

function applyPreset(name) {
  const p = PRESETS[name];
  Object.assign(st, { v: p.v, alt: p.alt, temp: p.temp, D: p.D, Pk: p.Pk, B: p.B, U: p.U, k: p.k, manual: p.manual });
  sV.set(p.v); sAlt.set(p.alt); sTemp.set(p.temp); sD.set(p.D); sP.set(fromP(p.Pk)); sU.set(p.U); sK.set(p.k);
  segB.set(p.B); segMode.set('oto');
  buildBlades(p.B);
  syncManual();
  setSite(p.site);
  recomputeAll();
  for (let i = 0; i < NP; i++) spawn(i, true);
}

sim.onReset(() => applyPreset('kara'));
applyPreset('kara');
