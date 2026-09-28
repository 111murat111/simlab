// Restoran Yönetimi — dakika adımlı kuyruk simülasyonu: Poisson gelişler, masa/aşçı/garson darboğazları, stok ve fire, 14 günlük işletme oyunu.
import { createSim, THREE, fmt, clamp, lerp, instanced, disposeObject, mat, procedural, textTexture, seeded, RoundedBoxGeometry, BufferGeometryUtils, crowd } from '@core';
import { facadeMaterial, createCity } from './city.js';
import { plankFloor, tiles, cardboard, chairGeometry, tableParts } from './interior.js';
import { paving } from './paving.js';

const SLOTS = 20, COLS = 5;
const MIN_PER_SEC = 10;          // 1× hızda 1 sn = 10 dk
const P0 = 350;                  // referans menü fiyatı (₺)
const ELASTIC = 1.2;             // talebin fiyat esnekliği
const UNIT_COST = 140;           // normal porsiyon malzeme maliyeti (₺)
const SHELF = 2;                 // taze malzeme raf ömrü (gün)
const GAME_DAYS = 14;
const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
const DAY_MUL = [0.9, 0.9, 0.95, 1, 1.15, 1.35, 1.3];
const PORTION = { kucuk: { name: 'Küçük', use: 0.75, sat: -0.5, cook: -1 }, normal: { name: 'Normal', use: 1, sat: 0, cook: 0 }, buyuk: { name: 'Büyük', use: 1.3, sat: 0.3, cook: 1 } };
const SHIRTS = [0x60a5fa, 0xf472b6, 0x34d399, 0xfbbf24, 0xa78bfa, 0xf87171, 0x22d3ee, 0xfb923c, 0xe2e8f0, 0x84cc16];

const sim = createSim({
  sky: { elevation: 30, azimuth: 198, clouds: 0.35, haze: 1, visibility: 2500, wind: [4, 1] },
  camera: { position: [9.5, 1.7, 6.3], target: [-2.5, 1.05, -3.2], fov: 52, near: 0.05, far: 30000 },
  controls: { maxDistance: 70, minDistance: 2, maxPolarAngle: Math.PI * 0.495 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Restoranın bir günü dakika dakika işler. Müşteri grupları kapıya <b>Poisson süreci</b> ile gelir; geliş hızı öğle
    (12–14) ve akşam (19–21) saatlerinde zirve yapar, hafta sonu artar. Boş masa yoksa kuyruğa girerler; çok beklerlerse
    <b>vazgeçip giderler</b>. Masadaki grup için garson siparişi alır, aşçılar tabakları pişirir, garson servis eder,
    yemekten sonra hesap gelir. Masanın üstündeki top: <span style="color:#fb923c">turuncu</span> garson bekliyor,
    <span style="color:#facc15">sarı</span> yemek pişiyor, <span style="color:#4ade80">yeşil</span> yiyor,
    <span style="color:#60a5fa">mavi</span> hesap bekliyor.</p>
    <p><b>Talep:</b> fiyat arttıkça müşteri azalır (esneklik ≈ ${fmt(ELASTIC, 1)}: fiyat %10 artınca talep ~%11 düşer).
    Memnuniyet (★) bekleme süresi, porsiyon, fiyat ve stok yokluğuna bağlıdır ve itibar yoluyla gelecek günlerin talebini etkiler.
    <b>Stok:</b> her sabah sipariş ettiğin porsiyonluk malzeme gelir; ${SHELF} gün içinde kullanılmayan taze malzeme <b>fire</b> olur.</p>
    <p>Simülasyon ilk günün öğle servisinin ortasından (13:20) izlenmeye başlar; sabah saatleri aynı kurallarla arka planda işletilmiştir.</p>
    <h3>Dene</h3>
    <ul>
      <li>Öğle zirvesinde kuyruk uzuyorsa darboğaz nerede? Masa mı, aşçı mı, garson mu? Birini artırıp gözle.</li>
      <li>Fiyatı düşür: müşteri artar ama kâr artar mı? Mutfak yetişemezse memnuniyet düşer.</li>
      <li>Stok siparişini çok artır: fire maliyeti; çok azalt: “stok bitti”, kızgın müşteri. En iyi nokta nerede?</li>
      <li>“Tedarik zammı” sonrası fiyatı ya da porsiyonu nasıl ayarlarsın?</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Restoranlarda malzeme maliyeti genellikle cironun üçte biri civarında hedeflenir; personel ve kira en büyük sabit
    giderlerdir. Kuyruk teorisi (Little yasası: ortalama kuyruk = geliş hızı × ortalama bekleme) kapasite planlamasında kullanılır.
    Fiyatlara %10 KDV dahil kabul edilmiştir; diğer tutarlar örnektir.</p>`,
});

// --- Sahne (metre): sokak üstünde bir lokanta; tavan yalnız içeriden görünür (yukarıdan bakınca kesit), kirişler ve sarkıt lambalar ---
const scene = sim.scene;
const slotPos = (j) => [-8 + (j % COLS) * 4, -2.6 + Math.floor(j / COLS) * 2.75];
const V2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y));
const WALL_H = 3.4;
const pendants = []; // masa başına sarkıt lamba (masa kaldırılınca lamba da kalkar)
const steel = mat.brushedMetal({ color: 0xc9c5bf });
// Davlumbaz: sıcak tonlu, daha mat paslanmaz (gökyüzü ortam haritasını mavi yansıtmasın)
const hoodSteel = mat.brushedMetal({ color: 0xd8c9b4, rough: 0.55 });
const darkSteel = mat.paintedMetal({ color: 0x24272b, wear: 0.15 });
const plaster = mat.concrete({ color: 0xe6dccb, stains: 0.2, scale: 2 });
const oak = mat.wood({ color: 0x8a5a35, varnish: true, ring: 10, scale: 2 });
{
  // Zeminler: salon ahşap, mutfak dama karo, sokak kaldırımı ve asfalt
  const floor = new THREE.Mesh(new RoundedBoxGeometry(22, 0.2, 12.3, 1, 0.02), plankFloor({ color: 0x8e6038 }));
  floor.position.set(0, -0.1, 1.85); scene.add(floor);
  const kfloor = new THREE.Mesh(new RoundedBoxGeometry(22, 0.2, 3.7, 1, 0.02), tiles({ color: 0xe9e6df, color2: 0x33363b, s: 0.3, checker: 1 }));
  kfloor.position.set(0, -0.099, -6.15); scene.add(kfloor);
  const walk = new THREE.Mesh(new RoundedBoxGeometry(70, 0.18, 6, 1, 0.03), paving({ color: 0xa8a39a }));
  walk.position.set(0, -0.12, 11.1); walk.userData.noFit = walk.userData.outside = true; scene.add(walk);
  const curb = new THREE.Mesh(new RoundedBoxGeometry(70, 0.2, 0.3, 1, 0.05), mat.concrete({ color: 0x9d988e }));
  curb.position.set(0, -0.12, 14.2); curb.userData.noFit = curb.userData.outside = true; scene.add(curb);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), mat.asphalt({ color: 0x3c3d41 }));
  road.position.set(0, -0.25, 0); road.userData.noFit = road.userData.outside = true; road.userData.noCast = true; scene.add(road);
  // Duvarlar: arka (mutfak, beyaz metro karo), yanlar (sıva + ahşap lambri), ön cephe camlı vitrin
  const back = new THREE.Mesh(new RoundedBoxGeometry(22.6, WALL_H, 0.3, 1, 0.03), tiles({ color: 0xf2f0ea, s: 0.2, brick: 1 }));
  back.position.set(0, WALL_H / 2, -8.15); scene.add(back);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new RoundedBoxGeometry(0.3, WALL_H, 16.3, 1, 0.03), plaster);
    w.position.set(sx * 11.15, WALL_H / 2, 0); scene.add(w);
    const wain = new THREE.Mesh(new RoundedBoxGeometry(0.06, 1.0, 12, 1, 0.02), oak);
    wain.position.set(sx * 10.98, 0.5, 1.9); scene.add(wain);
  }
  // Vitrin: alt ahşap panel, çelik kayıtlar, cam; kapı boşluğu ortada
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xdde8ee, transparent: true, opacity: 0.1, roughness: 0.02, metalness: 0, clearcoat: 1, depthWrite: false });
  for (const sx of [-1, 1]) {
    const cx = sx * 6.25;
    const pan = new THREE.Mesh(new RoundedBoxGeometry(9.5, 0.6, 0.25, 1, 0.03), mat.wood({ color: 0x3f2616, varnish: true }));
    pan.position.set(cx, 0.3, 8.1); scene.add(pan);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(9.5, WALL_H - 0.6), glassM);
    gl.position.set(cx, 0.6 + (WALL_H - 0.6) / 2, 8.1); scene.add(gl);
    for (let k = 0; k <= 4; k++) {
      const mu = new THREE.Mesh(new RoundedBoxGeometry(0.08, WALL_H - 0.6, 0.12, 1, 0.02), darkSteel);
      mu.position.set(cx - 4.75 + k * 2.375, 0.6 + (WALL_H - 0.6) / 2, 8.1); scene.add(mu);
    }
  }
  const lintel = new THREE.Mesh(new RoundedBoxGeometry(22.6, 0.5, 0.35, 1, 0.04), darkSteel);
  lintel.position.set(0, WALL_H + 0.05, 8.1); scene.add(lintel);
  // Tente ve tabela (sokağa bakar)
  const awning = new THREE.Mesh(new THREE.PlaneGeometry(22, 1.6, 1, 8), mat.fabric({ color: 0x7a1f1f }));
  const ap = awning.geometry.attributes.position;
  for (let i = 0; i < ap.count; i++) { const y = ap.getY(i); ap.setZ(i, (0.8 - y) * 0.9); }
  awning.geometry.computeVertexNormals();
  awning.position.set(0, WALL_H - 0.35, 8.3); awning.userData.outside = true; scene.add(awning);
  const signTex = textTexture('LOKANTA', { size: 96, color: '#f6e7c8', bg: '#2a1a12', font: '700 {s}px Georgia, serif', pad: 30 });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1 * signTex.userData.aspect, 1.1),
    new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffe2b0, emissiveIntensity: 0.9, roughness: 0.5 }));
  sign.position.set(0, WALL_H + 0.9, 8.3); scene.add(sign);
  const signBox = new THREE.Mesh(new RoundedBoxGeometry(1.1 * signTex.userData.aspect + 0.2, 1.3, 0.2, 2, 0.05), darkSteel);
  signBox.position.set(0, WALL_H + 0.9, 8.18); scene.add(signBox);
  // Tavan kirişleri ve sarkıt lambalar
  for (let k = 0; k < 5; k++) {
    const bm = new THREE.Mesh(new RoundedBoxGeometry(22.2, 0.3, 0.22, 1, 0.03), mat.wood({ color: 0x4a2f1e, ring: 6 }));
    bm.position.set(0, WALL_H - 0.15, -6 + k * 3.4); scene.add(bm);
  }
  const shadeG = new THREE.LatheGeometry(V2([[0.02, 0.32], [0.03, 0.3], [0.06, 0.26], [0.2, 0.06], [0.26, 0.0], [0.25, -0.01], [0.19, 0.05], [0.05, 0.25]]), 28);
  const bulbM = mat.glow({ color: 0xffc98a, intensity: 5 }), copper = mat.brushedMetal({ color: 0xc27c4e, rough: 0.3 });
  copper.side = THREE.DoubleSide;
  const shadeGlow = mat.glow({ color: 0xffa860, intensity: 1.1 }); shadeGlow.side = THREE.DoubleSide;
  const poolTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const poolG = new THREE.CircleGeometry(0.8, 32).rotateX(-Math.PI / 2);
  const poolMat = (o) => new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffb466, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const poolTable = poolMat(0.22), poolFloor = poolMat(0.12);
  for (let j = 0; j < SLOTS; j++) {
    const [x, z] = slotPos(j);
    if (Math.abs(z + 2.6 - 2.75 * Math.round((z + 2.6) / 2.75)) > 0.01) continue;
    const pend = new THREE.Group(); pendants.push(pend); scene.add(pend);
    const shade = new THREE.Mesh(shadeG, copper); shade.position.set(x, 2.25, z); pend.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), bulbM); bulb.position.set(x, 2.27, z); pend.add(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, WALL_H - 2.55, 5), darkSteel);
    cord.position.set(x, 2.55 + (WALL_H - 2.55) / 2 - 0.05, z); pend.add(cord);
    // Kısmayla ışıyan abajur içi (bloom yakalar) ve masaya/zemine düşen sahte ışık havuzu: gerçek ışık yalnız birkaç sarkıtta
    const inner = new THREE.Mesh(shadeG, shadeGlow); inner.scale.setScalar(0.95); inner.position.set(x, 2.25, z); pend.add(inner);
    const tp = new THREE.Mesh(poolG, poolTable); tp.position.set(x, 0.772, z); pend.add(tp);
    const fp = new THREE.Mesh(poolG, poolFloor); fp.scale.setScalar(2.3); fp.position.set(x, 0.006, z); pend.add(fp);
    for (const o of [inner, tp, fp]) { o.userData.noCast = true; o.userData.noAO = true; o.userData.noFit = true; o.renderOrder = 2; }
  }
  // Gerçek ışık: iki sarkıt + mutfak pası (performans; kalan sarkıtlar sahte ışıkla)
  for (const [x, y, z, c, i, d] of [[4, 2.1, 2.9, 0xffc27a, 11, 12], [-4, 2.1, 0.15, 0xffc27a, 11, 12], [-1, 2.5, -5.4, 0xffe9cf, 6, 9]]) {
    const L = new THREE.PointLight(c, i, d, 2); L.position.set(x, y, z); scene.add(L);
  }
  // Tavan: yalnız aşağıya bakan yüz (içeriden tavan, yukarıdan kesit); gün ışığını keser, gölge verir
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(22.3, 16.2).rotateX(Math.PI / 2), mat.concrete({ color: 0xefe8dc, stains: 0.1, scale: 1.5 }));
  ceiling.position.set(0, WALL_H, 0); scene.add(ceiling);
  // Sol duvar: çerçeveli tablolar (prosedürel yağlı boya manzara) ve aplikler
  const paintM = procedural({
    key: 'rest-painting', bump: 0.03, params: { color: 0xffffff, roughness: 0.7 },
    pattern: `
      float y = p.y + 0.12*fbm3(p*3.0 + seed*9.0, 4);
      vec3 sky = mix(vec3(0.95, 0.78, 0.55), vec3(0.45, 0.6, 0.78), smoothstep(0.0, 0.35, y));
      vec3 hill = mix(vec3(0.35, 0.42, 0.22), vec3(0.62, 0.5, 0.3), fbm3(p*4.0 + seed*3.0, 3));
      vec3 sea = vec3(0.18, 0.36, 0.48)*(0.8 + 0.4*vn3(p*vec3(2.0, 30.0, 2.0)));
      col = y > 0.02 ? sky : (y > -0.12 ? hill : sea);
      float stroke = vn3(p*vec3(60.0, 18.0, 60.0));
      col *= 0.88 + 0.24*stroke;
      h = stroke;`,
  });
  const frameGold = mat.brushedMetal({ color: 0xb8924a, rough: 0.35 });
  [[-4.6, 1.3, 0.9], [-0.6, 1.0, 0.75], [3.2, 1.3, 0.9]].forEach(([z, w, hh], i) => {
    const fr = new THREE.Mesh(new RoundedBoxGeometry(0.06, hh + 0.12, w + 0.12, 2, 0.02), frameGold);
    fr.position.set(-10.97, 1.95, z); scene.add(fr);
    const cv = new THREE.Mesh(new RoundedBoxGeometry(0.02, hh, w, 1, 0.004), paintM);
    cv.position.set(-10.93, 1.95, z); cv.position.y += i * 0.001; scene.add(cv);
  });
  const sconceShade = new THREE.LatheGeometry(V2([[0.05, 0], [0.09, 0.02], [0.11, 0.16], [0.105, 0.165], [0.085, 0.025], [0.045, 0.005]]), 24);
  for (const z of [-2.6, 1.3, 5.2]) {
    const sh = new THREE.Mesh(sconceShade, mat.fabric({ color: 0xf1e3c6 })); sh.material.side = THREE.DoubleSide;
    sh.position.set(-10.85, 1.95, z); scene.add(sh);
    const bb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), mat.glow({ color: 0xffcf8f, intensity: 3 })); bb.position.set(-10.85, 2.02, z); scene.add(bb);
    const arm = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.03, 0.03, 1, 0.01), frameGold); arm.position.set(-10.93, 1.97, z); scene.add(arm);
  }
  // Büyük saksı bitkileri (salon köşeleri): gövde + yüzlerce yaprak
  const leafG = new THREE.SphereGeometry(0.09, 8, 6); leafG.scale(1, 0.18, 0.5); leafG.translate(0.07, 0, 0);
  const leafI = instanced(leafG, mat.foliage({ color: 0x3f6d2c }), 3 * 180);
  const potG = new THREE.LatheGeometry(V2([[0, 0], [0.24, 0], [0.27, 0.05], [0.3, 0.55], [0.32, 0.58], [0.3, 0.6], [0, 0.55]]), 32);
  const potM = mat.ceramic({ color: 0x2f3a3f }), trunkM = mat.wood({ color: 0x5a4330 });
  const rr = seeded(11), dd = new THREE.Object3D();
  let li = 0;
  for (const [px, pz] of [[-10.3, 7.3], [10.3, 7.3], [-10.3, -3.6]]) {
    const pot = new THREE.Mesh(potG, potM); pot.position.set(px, 0, pz); scene.add(pot);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.3, 8), trunkM); tr.position.set(px, 1.2, pz); scene.add(tr);
    for (let k = 0; k < 180; k++) {
      const a = rr() * Math.PI * 2, y = 1.0 + rr() * 1.2, r = 0.12 + rr() * 0.42 * Math.sin(Math.PI * (y - 0.95) / 1.3);
      dd.position.set(px + Math.cos(a) * r, y, pz + Math.sin(a) * r);
      dd.rotation.set(rr() * 0.8 - 0.4, -a + rr() * 0.6, -0.3 - rr() * 0.6);
      dd.scale.setScalar(0.8 + rr() * 0.5); dd.updateMatrix(); leafI.setMatrixAt(li++, dd.matrix);
    }
  }
  scene.add(leafI);
  // Mutfak: paslanmaz servis bankosu (ısıtıcı lambalar), ocak sırası, davlumbaz, raf ve tencereler
  const counter = new THREE.Mesh(new RoundedBoxGeometry(16, 1, 0.8, 2, 0.03), steel);
  counter.position.set(-1, 0.5, -4.3); scene.add(counter);
  const kick = new THREE.Mesh(new RoundedBoxGeometry(15.8, 0.12, 0.7, 1, 0.02), darkSteel);
  kick.position.set(-1, 0.06, -4.3); scene.add(kick);
  const lampBar = new THREE.Mesh(new RoundedBoxGeometry(15, 0.08, 0.35, 1, 0.02), steel);
  lampBar.position.set(-1, 1.62, -4.3); scene.add(lampBar);
  for (const x of [-8, 6]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 10), steel); post.position.set(x, 1.3, -4.3); scene.add(post); }
  const heat = new THREE.Mesh(new RoundedBoxGeometry(14, 0.04, 0.2, 1, 0.01), mat.glow({ color: 0xff7a2a, intensity: 3 }));
  heat.position.set(-1, 1.57, -4.3); scene.add(heat);
  const stoveG = new RoundedBoxGeometry(1.4, 0.9, 1, 2, 0.03);
  const burnerG = new THREE.TorusGeometry(0.16, 0.025, 8, 24).rotateX(Math.PI / 2);
  const flameM = mat.glow({ color: 0x3b82f6, intensity: 2.5 });
  for (let i = 0; i < 6; i++) {
    const x = -7.5 + i * 2.2;
    const st = new THREE.Mesh(stoveG, steel); st.position.set(x, 0.45, -7.4); scene.add(st);
    const top = new THREE.Mesh(new RoundedBoxGeometry(1.36, 0.04, 0.96, 1, 0.01), darkSteel); top.position.set(x, 0.92, -7.4); scene.add(top);
    for (const [bx, bz] of [[-0.33, -0.22], [0.33, -0.22], [-0.33, 0.22], [0.33, 0.22]]) {
      const b = new THREE.Mesh(burnerG, darkSteel); b.position.set(x + bx, 0.95, -7.4 + bz); scene.add(b);
      if ((i + (bx > 0 ? 1 : 0)) % 2 === 0) { const f = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 20).rotateX(Math.PI / 2), flameM); f.position.set(x + bx, 0.97, -7.4 + bz); scene.add(f); }
    }
    const pot = new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 0], [0.17, 0], [0.18, 0.02], [0.18, 0.22], [0.195, 0.23], [0.18, 0.235], [0, 0.2]]), 24), steel);
    pot.position.set(x - 0.33, 0.97, -7.4 - 0.22); scene.add(pot);
  }
  const hoodShape = new THREE.Shape(V2([[0, 0], [1.1, 0], [1.1, 0.25], [0.35, 0.9], [0, 0.9]]));
  const hood = new THREE.Mesh(new THREE.ExtrudeGeometry(hoodShape, { depth: 14, bevelEnabled: false }), hoodSteel);
  hood.rotation.y = -Math.PI / 2; hood.position.set(7.2, 2.2, -8.0); scene.add(hood);
  const shelf = new THREE.Mesh(new RoundedBoxGeometry(14, 0.04, 0.35, 1, 0.01), steel);
  shelf.position.set(-1, 3.05, -7.8); scene.add(shelf);
}
// Soğuk oda kapısı ve stok kolileri
const fridge = new THREE.Group();
{
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.2, 2.4, 1.2, 2, 0.04), steel);
  body.position.y = 1.2; fridge.add(body);
  const seam = new THREE.Mesh(new RoundedBoxGeometry(0.02, 2.2, 0.02, 1, 0.005), darkSteel);
  seam.position.set(0, 1.2, 0.61); fridge.add(seam);
  for (const x of [-0.12, 0.12]) { const h = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.7, 0.06, 1, 0.015), darkSteel); h.position.set(x, 1.25, 0.64); fridge.add(h); }
  fridge.position.set(9.4, 0, -6.9);
  scene.add(fridge);
}
const STOCK_BOX = 60;
const stockBoxes = instanced(new RoundedBoxGeometry(0.42, 0.3, 0.42, 1, 0.012), cardboard(), STOCK_BOX);
{
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < STOCK_BOX; i++) {
    const layer = Math.floor(i / 12), k = i % 12;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(i * 12.9) * 0.08);
    stockBoxes.setMatrixAt(i, m.compose(new THREE.Vector3(7.3 + (k % 4) * 0.5 - 0.75, 0.16 + layer * 0.31, -5.9 + Math.floor(k / 4) * 0.5), q, s));
    stockBoxes.setColorAt(i, new THREE.Color(0xffffff).multiplyScalar(0.85 + 0.15 * Math.abs(Math.sin(i * 3.1))));
  }
  scene.add(stockBoxes);
}
const stockLbl = sim.label('', { position: [8.3, 2.9, -6.4] });
const queueLbl = sim.label('', { position: [2.6, 1.9, 9.2] });

// Komşu binalar ve arkadaki şehir (sokak dokusu)
{
  const r = seeded(3), geos = [];
  const nb = (w, h, d, x, z, c) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, h / 2 - 0.25, z); const col = new THREE.Color(c); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); geos.push(g); };
  nb(14, 13.6, 18, -18.6, -0.8, 0xc9b79a); nb(12, 17, 18, 17.6, -0.8, 0xb7b2a8); nb(10, 10.2, 18, -30.6, -0.8, 0xa69683);
  nb(14, 14.4, 18, 30.6, -0.8, 0xcfc4b0); nb(24, 20, 14, 0, -17.5, 0xb3aa9c); nb(18, 12, 14, -22, -17.5, 0xa8a095);
  for (let i = 0; i < 8; i++) nb(10 + r() * 8, 10 + r() * 14, 12, -40 + i * 12, 28, [0xbfb4a3, 0xa79b8b, 0xc8c1b4][i % 3]);
  const g = BufferGeometryUtils.mergeGeometries(geos);
  const m = new THREE.Mesh(g, facadeMaterial({ lit: 0.25, glow: 1.2 }));
  m.userData.noFit = m.userData.outside = true; scene.add(m);
  const city = createCity({ ground: -0.25, rect: [-900, -1200, 900, 700], pitch: 70, seed: 8, lit: 0.2, glow: 1.2, avoid: (x, z) => Math.abs(x) < 70 && Math.abs(z) < 60 });
  city.userData.outside = true; scene.add(city);
}

// Masalar ve sandalyeler
const tableMeshes = [];
const chairs = instanced(chairGeometry(), mat.paintedMetal({ color: 0x1d2521, wear: 0.25 }), SLOTS * 4);
const SEAT = [[-0.85, 0], [0.85, 0], [0, -0.85], [0, 0.85]];
{
  const { top: topGeo, base: legGeo } = tableParts();
  const topMat = mat.wood({ color: 0x9a6a40, varnish: true, ring: 14, scale: 2 }), legMat = mat.paintedMetal({ color: 0x1f2226, wear: 0.2 });
  for (let j = 0; j < SLOTS; j++) {
    const [x, z] = slotPos(j);
    const g = new THREE.Group();
    const top = new THREE.Mesh(topGeo, topMat);
    const leg = new THREE.Mesh(legGeo, legMat);
    g.add(top, leg);
    g.position.set(x, 0, z);
    g.rotation.y = j * 1.3;
    g.userData.slot = j;
    top.userData.slot = j;
    scene.add(g);
    tableMeshes.push(g);
  }
}
// Durum göstergesi (veri katmanı): masanın üstünde süzülen parlak top
const indicators = instanced(new THREE.SphereGeometry(0.14, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }), SLOTS);
const plates = instanced(new THREE.LatheGeometry(V2([[0, 0], [0.08, 0], [0.1, 0.012], [0.15, 0.02], [0.155, 0.026], [0.14, 0.024], [0.09, 0.016], [0, 0.014]]), 32),
  mat.ceramic({ color: 0xf6f3ec }), SLOTS * 4);
const food = instanced(new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1), mat.tissue({ color: 0xb4602a, veins: 0 }), SLOTS * 4);
indicators.frustumCulled = plates.frustumCulled = chairs.frustumCulled = food.frustumCulled = false;
// Masa düzeni: peçete + çatal-bıçak (her sandalye), ortada vazo + çiçek + mumluk
const napkins = instanced(new RoundedBoxGeometry(0.13, 0.008, 0.2, 1, 0.003), mat.fabric({ color: 0xf1ebe0 }), SLOTS * 4);
const cutlery = instanced((() => {
  const k = new RoundedBoxGeometry(0.014, 0.004, 0.2, 1, 0.0015); k.translate(0.2, 0, 0);
  const f = new RoundedBoxGeometry(0.016, 0.004, 0.19, 1, 0.0015); f.translate(-0.2, 0, 0);
  return BufferGeometryUtils.mergeGeometries([k, f]);
})(), mat.brushedMetal({ color: 0xd6d8da, rough: 0.2 }), SLOTS * 4);
const vases = instanced(new THREE.LatheGeometry(V2([[0, 0], [0.035, 0], [0.04, 0.03], [0.022, 0.1], [0.015, 0.16], [0.02, 0.17], [0, 0.16]]), 20), mat.ceramic({ color: 0x3f6f78 }), SLOTS);
const blooms = instanced(new THREE.IcosahedronGeometry(0.03, 1).scale(1, 0.7, 1), mat.fabric({ color: 0xd8423a }), SLOTS);
const candles = instanced(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 12), mat.glow({ color: 0xffb35c, intensity: 2.5 }), SLOTS);
const SETTING = [napkins, cutlery, vases, blooms, candles];
SETTING.forEach((m) => { m.frustumCulled = false; scene.add(m); });
// Mutfak fiş rayı: bekleyen her fiş rayda asılı bir kâğıt
const rail = new THREE.Mesh(new RoundedBoxGeometry(6, 0.03, 0.03, 1, 0.01), steel); rail.position.set(-1, 1.5, -3.92); scene.add(rail);
const tickets = instanced(new THREE.PlaneGeometry(0.075, 0.14).translate(0, -0.07, 0), mat.fabric({ color: 0xf7f3e8 }), 24);
tickets.material.side = THREE.DoubleSide;
{ const d = new THREE.Object3D(); for (let i = 0; i < 24; i++) { d.position.set(-3.8 + i * 0.24, 1.49, -3.9); d.rotation.set(0.05 * Math.sin(i * 7), 0, 0.06 * Math.sin(i * 3)); d.updateMatrix(); tickets.setMatrixAt(i, d.matrix); } }
tickets.count = 0; scene.add(tickets);
for (let i = 0; i < SLOTS; i++) indicators.setColorAt(i, new THREE.Color(1, 1, 1));
scene.add(chairs, indicators, plates, food);

// İnsanlar: motorun eklemli figürleri (@core crowd). Müşteri yuvaları kalıcıdır (kişi masadan kalkana dek aynı görünüş).
const MAXP = 220;
const guests = crowd(MAXP, { seed: 21, outfits: { casual: 6, office: 3, student: 2 }, camera: sim.camera, seat: 0.47, lod: 26 });
scene.add(guests.group);
const freeSlots = Array.from({ length: MAXP }, (_, i) => MAXP - 1 - i), slotSeen = new Uint8Array(MAXP), slotLive = new Uint8Array(MAXP);
const GUEST_OUTFITS = ['casual', 'casual', 'casual', 'office', 'office', 'student'];
// Personel: aşçı (beyaz ceket, önlük, kep) mutfakta tezgâh başında; garson (siyah/beyaz, bel önlüğü) masalara gider
const staff = crowd(12, { seed: 5, camera: sim.camera, lod: 26 });
for (let i = 0; i < 6; i++) staff.dress(i, { outfit: 'chef', seed: 100 + i });
for (let i = 6; i < 12; i++) staff.dress(i, { outfit: 'waiter', seed: 200 + i });
scene.add(staff.group);
const staffPos = Array.from({ length: 12 }, (_, i) => (i < 6 ? new THREE.Vector3(-7.5 + i * 2.2, 0, -6.3) : new THREE.Vector3(-6 + (i - 6) * 2, 0, -3.4)));
const staffYaw = new Float32Array(12).fill(Math.PI);

// --- Durum ---
let S; // gün içi ve toplam durum
let groups = [];
let gid = 0;
function freshState() {
  return {
    day: 0, minute: 0, rep: 4.0, zam: false, surge: 1,
    batches: [],                 // [{qty, age}]
    totals: { revenue: 0, cost: 0, profit: 0, customers: 0, lost: 0, waste: 0 },
    over: false,
  };
}
function dayState() {
  return { customers: 0, groups: 0, lost: 0, balked: 0, plates: 0, revenue: 0, ratings: [], stockout: 0, waste: 0, waitSum: 0, waitN: 0, maxQueue: 0, stockoutToast: false };
}
let D = dayState();
let tasks = [], kitchenQ = [];
let waiters = [], chefs = [];

const openMin = () => openH.value * 60, closeMin = () => closeH.value * 60;
const activeTables = () => tables.value;
let tableOcc = new Array(SLOTS).fill(null);

function stockQty() { return S.batches.reduce((a, b) => a + b.qty, 0); }
function takeStock(q) {
  let need = q;
  for (const b of S.batches) { const t = Math.min(b.qty, need); b.qty -= t; need -= t; if (need <= 1e-9) break; }
  S.batches = S.batches.filter((b) => b.qty > 1e-6);
  return q - need;
}

// Poisson sayısı (Knuth)
function poisson(l) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; }
const bump = (h, mu, s) => Math.exp(-((h - mu) ** 2) / (2 * s * s));
function arrivalRate(minute) {
  const h = minute / 60;
  const base = 1.5 + 3 * bump(h, 9, 1) + 14 * bump(h, 13, 1) + 12 * bump(h, 20, 1.3);
  const price = Math.pow(price_.value / P0, -ELASTIC);
  const rep = clamp(1 + 0.3 * (S.rep - 4), 0.45, 1.4);
  return base * price * rep * DAY_MUL[S.day % 7] * (campaign.value ? 1.3 : 1) * S.surge; // grup / saat
}

function startDay() {
  D = dayState();
  S.minute = openMin();
  S.surge = S.surge > 1 ? S.surge : 1;
  const q = stockOrder.value;
  if (q > 0) S.batches.push({ qty: q, age: 0 });
  D.orderCost = q * UNIT_COST * (S.zam ? 1.35 : 1);
  groups = []; tasks = []; kitchenQ = [];
  tableOcc = new Array(SLOTS).fill(null);
  syncStaff();
  chartDay.clear();
}
function syncStaff() {
  while (waiters.length < waitersN.value) waiters.push({ busy: 0, task: null });
  while (chefs.length < chefsN.value) chefs.push({ busy: 0, g: null });
}

function newGroup() {
  const r = Math.random();
  const size = r < 0.25 ? 1 : r < 0.65 ? 2 : r < 0.85 ? 3 : 4;
  const [dx, dz] = [(Math.random() - 0.5) * 6, 16];
  return {
    id: gid++, size, state: 'queue', t: 0, table: -1, arrive: S.minute, patience: 8 + Math.random() * 20,
    waitQ: 0, seatedAt: 0, servedAt: 0, plates: 0, missing: 0, rating: 0,
    members: Array.from({ length: size }, (_, i) => ({ pos: new THREE.Vector3(dx + i * 0.5, 0, dz), color: SHIRTS[(Math.random() * SHIRTS.length) | 0] })),
  };
}

function rate(g, ok = true) {
  const pf = PORTION[portion.value];
  const wait = g.waitQ + (g.servedAt - g.seatedAt);
  let s = 4.6 - Math.max(0, wait - 20) * 0.045 + pf.sat - (price_.value / P0 - 1) * 1.2 - (g.plates ? g.missing / (g.plates + g.missing) : 1) * 2.5;
  if (!ok) s = 1.5;
  g.rating = clamp(s, 1, 5);
  D.ratings.push(g.rating);
  D.waitSum += wait; D.waitN++;
}

// Bir dakikalık adım
function stepMinute() {
  const m = S.minute, open = m < closeMin();
  // Gelişler
  if (open) {
    const n = poisson(arrivalRate(m) / 60);
    for (let i = 0; i < n; i++) {
      const qLen = groups.filter((g) => g.state === 'queue').length;
      if (qLen >= 12 || (qLen >= 7 && Math.random() < 0.5)) { D.balked++; continue; }
      const g = newGroup();
      groups.push(g); D.groups++;
    }
  }
  // Kuyruk: sabır ve oturma
  for (const g of groups) {
    if (g.state !== 'queue') continue;
    g.waitQ++;
    if (g.waitQ > g.patience || !open) { g.state = 'leave'; g.t = 3; D.lost += g.size; if (open) { D.ratings.push(2.5); } continue; }
    const j = tableOcc.findIndex((o, k) => o === null && k < activeTables());
    if (j >= 0) { tableOcc[j] = g; g.table = j; g.state = 'order'; g.seatedAt = m; tasks.push({ g, type: 'order' }); }
  }
  // Garsonlar
  for (let w = 0; w < waiters.length; w++) {
    const W = waiters[w];
    if (W.busy > 0 && --W.busy === 0 && W.task) finishTask(W.task);
    if (W.busy === 0) {
      W.task = null;
      if (w < waitersN.value && tasks.length) { W.task = tasks.shift(); W.busy = W.task.type === 'serve' ? 2 : 3; }
    }
  }
  waiters = waiters.filter((W, w) => w < waitersN.value || W.busy > 0);
  // Mutfak
  for (let c = 0; c < chefs.length; c++) {
    const C = chefs[c];
    if (C.busy > 0 && --C.busy === 0 && C.g) { const g = C.g; g.state = 'serve'; tasks.push({ g, type: 'serve' }); }
    if (C.busy === 0) {
      C.g = null;
      // Bir aşçı bir masanın siparişini (fişini) bütün olarak hazırlar
      if (c < chefsN.value && kitchenQ.length) { C.g = kitchenQ.shift(); C.busy = Math.max(4, Math.round(6 + 1.5 * C.g.plates + Math.random() * 4 + PORTION[portion.value].cook)); }
    }
  }
  chefs = chefs.filter((C, c) => c < chefsN.value || C.busy > 0);
  // Yemek ve ayrılma
  for (const g of groups) {
    if (g.state === 'eat' && --g.t <= 0) { g.state = 'bill'; tasks.push({ g, type: 'bill' }); }
    else if (g.state === 'leave') g.t -= 1;
  }
  groups = groups.filter((g) => !(g.state === 'leave' && g.t <= 0));
  D.maxQueue = Math.max(D.maxQueue, groups.filter((g) => g.state === 'queue').length);
  S.minute++;
  if (S.minute % 10 === 0) {
    const q = groups.filter((g) => g.state === 'queue').length;
    const occ = tableOcc.filter((o, k) => o && k < activeTables()).length / Math.max(1, activeTables());
    chartDay.push([q, occ * 100]);
  }
  if (!open && !groups.length) endDay();
}

function finishTask(task) {
  const g = task.g;
  if (task.type === 'order') {
    const use = PORTION[portion.value].use;
    const got = Math.floor(takeStock(g.size * use) / use + 1e-6);
    g.plates = got; g.missing = g.size - got;
    if (got < g.size) {
      D.stockout += g.size - got;
      if (!D.stockoutToast) { D.stockoutToast = true; sim.toast('📦 Stok bitti! Bazı yemekler verilemiyor.', 'bad'); }
    }
    if (got === 0) { rate(g, false); leaveTable(g); D.lost += g.size; return; }
    g.state = 'cook';
    kitchenQ.push(g);
  } else if (task.type === 'serve') {
    g.state = 'eat'; g.servedAt = S.minute; g.t = 25 + Math.random() * 15;
  } else if (task.type === 'bill') {
    const rev = (g.plates * price_.value) / 1.1; // KDV hariç
    D.revenue += rev; D.plates += g.plates; D.customers += g.size;
    rate(g, true);
    leaveTable(g);
  }
}
function leaveTable(g) {
  if (g.table >= 0) tableOcc[g.table] = null;
  g.state = 'leave'; g.t = 3;
}

function endDay() {
  // Fire: raf ömrü dolan malzeme
  for (const b of S.batches) b.age++;
  const spoiled = S.batches.filter((b) => b.age >= SHELF).reduce((a, b) => a + b.qty, 0);
  S.batches = S.batches.filter((b) => b.age < SHELF);
  const unit = UNIT_COST * (S.zam ? 1.35 : 1);
  D.waste = spoiled;
  const hours = (closeMin() - openMin()) / 60;
  const staff = (chefsN.value * 3000 + waitersN.value * 2000) * (hours / 12);
  const rent = 6000, util = 250 * hours, ad = campaign.value ? 1500 : 0;
  const cost = D.orderCost + staff + rent + util + ad;
  const profit = D.revenue - cost;
  const avg = D.ratings.length ? D.ratings.reduce((a, b) => a + b, 0) / D.ratings.length : S.rep;
  S.rep = lerp(S.rep, avg, 0.35);
  const T = S.totals;
  T.revenue += D.revenue; T.cost += cost; T.profit += profit; T.customers += D.customers; T.lost += D.lost; T.waste += spoiled * unit;
  lastDay = { ...D, cost, profit, staff, rent, util, ad, avg, wasteCost: spoiled * unit, dayName: DAYS[S.day % 7] };
  chartDays.push([D.revenue / 1000, cost / 1000, profit / 1000]);
  S.day++;
  S.surge = 1;
  if (S.day >= GAME_DAYS) { gameOver(); return; }
  sim.hud.show(`<b>${lastDay.dayName} bitti</b> · ${fmt(D.customers)} müşteri · ciro ${fmt(D.revenue)} ₺ ·
    <span style="color:${profit >= 0 ? '#86efac' : '#fca5a5'}">kâr ${fmt(profit)} ₺</span> · ★ ${fmt(avg, 1)}
    ${D.lost ? ` · ${D.lost} kişi vazgeçti` : ''}${spoiled > 0.5 ? ` · fire ${fmt(spoiled)} porsiyon` : ''}`, { timeout: 3500, tone: profit >= 0 ? 'good' : 'bad' });
  startDay();
}
let lastDay = null;

function gameOver() {
  S.over = true;
  sim.pause();
  const T = S.totals;
  const grade = T.profit > 100000 && S.rep >= 4 ? '🏆 Usta işletmeci' : T.profit > 0 ? '👍 Kârdasın' : '📉 Zarardasın';
  sim.hud.show(`<h2>${GAME_DAYS} gün tamamlandı · ${grade}</h2>
    Toplam ciro <b>${fmt(T.revenue)} ₺</b> · gider <b>${fmt(T.cost)} ₺</b> ·
    kâr <b style="color:${T.profit >= 0 ? '#86efac' : '#fca5a5'}">${fmt(T.profit)} ₺</b><br>
    ${fmt(T.customers)} müşteri ağırladın, ${fmt(T.lost)} kişi vazgeçti · fire ${fmt(T.waste)} ₺ · itibar ★ ${fmt(S.rep, 1)}<br>
    <button class="btn primary" data-a="again">Tekrar oyna</button>`, { tone: T.profit >= 0 ? 'good' : 'bad' });
  sim.hud.el.querySelector('[data-a=again]').onclick = () => { newGame(); sim.play(); };
}

function newGame() {
  S = freshState();
  gid = 0; waiters = []; chefs = [];
  chartDays.clear();
  sim.hud.hide();
  startDay();
  updatePanel();
}

let acc = 0;
sim.onUpdate((dt) => {
  if (S.over) return;
  acc += dt * MIN_PER_SEC;
  let n = 0;
  while (acc >= 1 && n < 200 && !S.over) { acc -= 1; stepMinute(); n++; }
  if (n && sim.frame % 3 === 0) updatePanel();
});

// --- Görsel ---
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _q = new THREE.Quaternion(), _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0), _q2 = new THREE.Quaternion(), _qSit = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const IND = { order: 0xfb923c, cook: 0xfacc15, serve: 0xfacc15, eat: 0x4ade80, bill: 0x60a5fa };
const DOOR = new THREE.Vector3(0, 0, 8);
function targetFor(g, i, out) {
  if (g.state === 'queue') {
    const qi = queueIndex.get(g.id) ?? 0;
    const row = Math.min(qi, 14);
    return out.set(-1.2 + i * 0.55 + (row % 2) * 0.2, 0, 9.3 + row * 0.95);
  }
  if (g.state === 'leave') return g.table >= 0 && g.t > 2 ? out.copy(DOOR) : out.set(5 + g.id % 4, 0, 14);
  const [x, z] = slotPos(g.table);
  return out.set(x + SEAT[i][0] * 1.235, 0, z + SEAT[i][1] * 1.235);   // sandalye merkezi (masadan 1,05 m)
}
// Hedefe yürü: yakında yumuşak yaklaş, uzakta en çok vmax m/s (bacak döngüsü gerçek yer değiştirmeden)
function walkTo(p, target, k, rdt, vmax) {
  if (snapNext) return p.copy(target);
  const d = p.distanceTo(target);
  if (d < 1e-4) return p.copy(target);
  return p.lerp(target, Math.min(1, Math.min(d * k, rdt * vmax) / d));
}
const queueIndex = new Map();
sim.onRender((rdt) => {
  queueIndex.clear();
  let qi = 0;
  for (const g of groups) if (g.state === 'queue') queueIndex.set(g.id, qi++);
  const k = snapNext ? 1 : Math.min(1, rdt * 5);
  slotSeen.fill(0);
  for (const g of groups) {
    g.members.forEach((mb, i) => {
      if (mb.slot == null) {
        if (!freeSlots.length) return;
        mb.slot = freeSlots.pop(); slotLive[mb.slot] = 1;
        guests.dress(mb.slot, { seed: g.id * 13 + i * 7 + 1, outfit: GUEST_OUTFITS[(g.id * 5 + i * 3) % GUEST_OUTFITS.length] });
      }
      const sl = mb.slot; slotSeen[sl] = 1;
      targetFor(g, i, _v);
      walkTo(mb.pos, _v, k, rdt, 2.6);
      const atSeat = g.state !== 'queue' && g.state !== 'leave' && g.table >= 0 && mb.pos.distanceToSquared(_v) < 0.004;
      const moving = mb.pos.distanceToSquared(_v) > 0.0025;
      // oturan masaya döner; yürüyen gittiği yöne; kuyrukta kapıya (−z) bakar
      let yaw = Math.PI;
      if (g.table >= 0 && g.state !== 'queue' && g.state !== 'leave') { const [tx, tz] = slotPos(g.table); yaw = Math.atan2(tx - mb.pos.x, tz - mb.pos.z); }
      if (moving && !atSeat) yaw = Math.atan2(_v.x - mb.pos.x, _v.z - mb.pos.z);
      mb.yaw = mb.yaw == null || snapNext ? yaw : mb.yaw + Math.atan2(Math.sin(yaw - mb.yaw), Math.cos(yaw - mb.yaw)) * Math.min(1, rdt * 8);
      guests.set(sl, mb.pos.x, 0, mb.pos.z, mb.yaw, atSeat ? 'sit' : moving ? 'walk' : 'stand');
      if (g.state === 'queue' && g.waitQ > g.patience * 0.7) guests.tint(sl, 0xef4444, 0.55); else guests.tint(sl, null);
    });
  }
  for (let i = 0; i < MAXP; i++) if (slotLive[i] && !slotSeen[i]) { slotLive[i] = 0; guests.hide(i); freeSlots.push(i); }
  guests.update(performance.now() / 1000);
  // Masalar, göstergeler, tabaklar
  let ii = 0, pl = 0, ch = 0, ts = 0;
  for (let j = 0; j < SLOTS; j++) {
    const g = tableOcc[j];
    const vis = j < activeTables() || !!g;
    tableMeshes[j].visible = vis; pendants[j].visible = vis;
    if (!vis) continue;
    const [x, z] = slotPos(j);
    for (const [sx, sz] of SEAT) {
      _q.setFromAxisAngle(_up, Math.atan2(-sx, -sz));
      napkins.setMatrixAt(ch, _m.compose(_s.set(x + sx * 0.45 + sz * 0.34, 0.765, z + sz * 0.45 - sx * 0.34), _q, _v.set(1, 1, 1)));
      cutlery.setMatrixAt(ch, _m.compose(_s.set(x + sx * 0.47, 0.763, z + sz * 0.47), _q, _v));
      chairs.setMatrixAt(ch++, _m.compose(_s.set(x + sx * 1.05, 0, z + sz * 1.05), _q, _v));
    }
    vases.setMatrixAt(ts, _m.makeTranslation(x + 0.08, 0.76, z - 0.05));
    blooms.setMatrixAt(ts, _m.makeTranslation(x + 0.08, 0.95, z - 0.05));
    candles.setMatrixAt(ts++, _m.makeTranslation(x - 0.1, 0.785, z + 0.06));
    if (g && IND[g.state]) {
      const bob = 2.7 + Math.sin(performance.now() / 300 + j) * 0.08;
      indicators.setMatrixAt(ii, _m.makeTranslation(x, bob, z));
      indicators.setColorAt(ii++, _c.setHex(IND[g.state]).multiplyScalar(2.2));
    }
    if (g && (g.state === 'eat' || g.state === 'bill')) {
      for (let i = 0; i < g.plates; i++) {
        plates.setMatrixAt(pl, _m.makeTranslation(x + SEAT[i][0] * 0.45, 0.76, z + SEAT[i][1] * 0.45));
        food.setMatrixAt(pl++, _m.makeTranslation(x + SEAT[i][0] * 0.45, 0.775, z + SEAT[i][1] * 0.45));
      }
    }
  }
  chairs.count = napkins.count = cutlery.count = ch; indicators.count = ii; plates.count = food.count = pl;
  for (const m of SETTING) { if (m !== napkins && m !== cutlery) m.count = ts; m.instanceMatrix.needsUpdate = true; }
  tickets.count = Math.min(24, kitchenQ.length);
  chairs.instanceMatrix.needsUpdate = indicators.instanceMatrix.needsUpdate = plates.instanceMatrix.needsUpdate = food.instanceMatrix.needsUpdate = true;
  if (indicators.instanceColor) indicators.instanceColor.needsUpdate = true;
  // Personel
  const t = performance.now() / 1000;
  for (let i = 0; i < 6; i++) {
    if (i >= chefsN.value) { staff.hide(i); continue; }
    const busy = chefs[i] && chefs[i].busy > 0;
    staff.set(i, staffPos[i].x, 0, staffPos[i].z, Math.PI + (busy ? Math.sin(t * 0.7 + i) * 0.25 : 0), busy ? 'work' : 'stand');
  }
  for (let i = 0; i < 6; i++) {
    const s = 6 + i;
    if (i >= waitersN.value) { staff.hide(s); continue; }
    const W = waiters[i];
    let face = Math.PI;
    if (W && W.task && W.busy > 0 && W.task.g.table >= 0) {
      const [x, z] = slotPos(W.task.g.table);
      _v.set(x + 1.1, 0, z - 0.3); face = Math.atan2(x - _v.x, z - _v.z);
    } else _v.set(-6 + i * 2, 0, -3.4);
    const P = staffPos[s], d2 = P.distanceToSquared(_v);
    const want = d2 > 0.01 ? Math.atan2(_v.x - P.x, _v.z - P.z) : face;
    walkTo(P, _v, k * 1.2, rdt, 2.2);
    staffYaw[s] += Math.atan2(Math.sin(want - staffYaw[s]), Math.cos(want - staffYaw[s])) * (snapNext ? 1 : Math.min(1, rdt * 8));
    staff.set(s, P.x, 0, P.z, staffYaw[s], d2 > 0.01 ? 'walk' : 'stand');
  }
  staff.update(t);
  // Stok rafı
  const q = stockQty();
  const nb = Math.min(STOCK_BOX, Math.ceil(q / 10));
  stockBoxes.count = nb;
  stockLbl.setText(`📦 Stok: ${fmt(q)} porsiyon`);
  const ql = qi;
  queueLbl.setText(ql ? `⏳ Kuyruk: ${ql} grup` : '🚪 Kuyruk yok');
  queueLbl.el.style.color = ql > 6 ? '#fca5a5' : '';
  snapNext = false;
});
const _v2c = new THREE.Color();

// --- Arayüz ---
const ui = sim.ui;
ui.section('Kapasite');
const tables = ui.slider({ label: 'Masa sayısı (4 kişilik)', min: 4, max: 20, step: 1, value: 14 });
const chefsN = ui.slider({ label: 'Aşçı', min: 1, max: 6, step: 1, value: 3, onChange: () => { syncStaff(); updatePanel(); } });
const waitersN = ui.slider({ label: 'Garson', min: 1, max: 6, step: 1, value: 3, onChange: () => { syncStaff(); updatePanel(); } });
const openH = ui.slider({ label: 'Açılış saati', min: 7, max: 12, step: 1, value: 10, format: (v) => `${String(v).padStart(2, '0')}:00 (yarından)` });
const closeH = ui.slider({ label: 'Kapanış saati', min: 18, max: 24, step: 1, value: 23, format: (v) => (v === 24 ? '00:00' : `${v}:00`) + ' (yeni gelişler durur)' });

ui.section('Menü ve stok');
const price_ = ui.slider({ label: 'Menü fiyatı (kişi başı, KDV dahil)', min: 150, max: 800, step: 10, value: 350, format: (v) => `${fmt(v)} ₺`, onChange: () => updatePanel() });
const portion = ui.segmented({ label: 'Porsiyon', options: [{ value: 'kucuk', label: 'Küçük' }, { value: 'normal', label: 'Normal' }, { value: 'buyuk', label: 'Büyük' }], value: 'normal', onChange: () => updatePanel() });
const stockOrder = ui.slider({ label: 'Günlük stok siparişi (sabah gelir)', min: 0, max: 600, step: 10, value: 240, format: (v) => `${fmt(v)} porsiyon` });
const campaign = ui.toggle({ label: '📣 Reklam kampanyası (+%30 talep, 1.500 ₺/gün)', value: false });
const unitTxt = ui.text('', '');

ui.section('Senaryolar');
ui.buttons([
  { label: '🎉 Hafta sonu yoğunluğu', onClick: () => { S.surge = 1.8; sim.toast('Bugün kalabalık: talep ×1,8', 'warn'); } },
  { label: '📈 Tedarik zammı', onClick: () => { S.zam = !S.zam; sim.toast(S.zam ? 'Malzeme maliyeti %35 arttı (yarınki siparişten itibaren)' : 'Zam geri alındı', S.zam ? 'bad' : 'good'); updatePanel(); } },
]);
ui.button({ label: '⏩ Günü hemen bitir', variant: 'primary', onClick: () => { let g = 0; const d = S.day; while (S.day === d && !S.over && g++ < 3000) stepMinute(); updatePanel(); } });

ui.section('Bugün');
const stDay = ui.stat({ label: 'Gün' });
const stQueue = ui.stat({ label: 'Kuyruk (grup)' });
const stOcc = ui.stat({ label: 'Dolu masa' });
const stCust = ui.stat({ label: 'Müşteri / vazgeçen' });
const stRev = ui.stat({ label: 'Bugünkü ciro', unit: '₺' });
const stWait = ui.stat({ label: 'Ort. bekleme', unit: 'dk' });
const stKitchen = ui.stat({ label: 'Mutfakta bekleyen fiş' });
const stStars = ui.stat({ label: 'İtibar' });
const chartDay = ui.chart({ title: 'Gün içi: kuyruk (grup) ve doluluk (%)', maxPoints: 100, series: [{ name: 'Kuyruk ×10', color: '#f87171' }, { name: 'Doluluk %', color: '#38bdf8', fill: true }] });

ui.section('İşletme sonuçları');
const lastTxt = ui.text('', 'card');
const stTotal = ui.stat({ label: 'Toplam kâr', unit: '₺' });
const stDays = ui.stat({ label: 'Kalan gün' });
const chartDays = ui.chart({ title: 'Günlük (bin ₺)', maxPoints: GAME_DAYS, series: [{ name: 'Ciro', color: '#38bdf8' }, { name: 'Gider', color: '#f97316' }, { name: 'Kâr', color: '#4ade80', fill: true }] });

ui.section('Görünüm', { open: false });
ui.buttons([
  { label: '🍽️ Salon (genel)', onClick: () => sim.moveCamera([9.5, 1.7, 6.3], [-2.5, 1.05, -3.2]) },
  { label: '👨‍🍳 Mutfak (yakın)', onClick: () => sim.moveCamera([-1.2, 2.3, 0.6], [-2, 1.0, -6.2]) },
]);
ui.buttons([{ label: '🚪 Kapı ve kuyruk', onClick: () => sim.moveCamera([6, 3.2, 17], [0, 1, 9]) }, { label: '🔭 Kesit (yukarıdan)', onClick: () => sim.moveCamera([3.5, 15.5, 21.5], [0, 0.2, 0.6]) }]);
ui.toggle({ label: 'Masa durum göstergeleri', value: true, onChange: (v) => (indicators.visible = v) });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => [stockLbl, queueLbl].forEach((l) => (l.visible = v)) });

// Grafik kuyruğu 10 ile ölçeklensin (doluluk yüzdesiyle aynı eksende okunabilsin)
const _push = chartDay.push;
chartDay.push = (v) => _push([v[0] * 10, v[1]]);

function updatePanel() {
  stDay.set(`${S.day + 1}. ${DAYS[S.day % 7].slice(0, 3)}`);
  const q = groups.filter((g) => g.state === 'queue').length;
  stQueue.set(q, q > 6 ? 'bad' : q > 2 ? 'warn' : '');
  const occ = tableOcc.filter((o) => o).length;
  stOcc.set(`${occ}/${activeTables()}`);
  stCust.set(`${D.customers} / ${D.lost}`, D.lost > D.customers * 0.15 ? 'bad' : '');
  stRev.set(fmt(D.revenue));
  stWait.set(D.waitN ? fmt(D.waitSum / D.waitN) : '—', D.waitN && D.waitSum / D.waitN > 35 ? 'bad' : '');
  stKitchen.set(kitchenQ.length, kitchenQ.length > 5 ? 'bad' : '');
  stStars.set(`★ ${fmt(S.rep, 1)}`, S.rep >= 4 ? 'good' : S.rep < 3 ? 'bad' : 'warn');
  stTotal.set(fmt(S.totals.profit), S.totals.profit >= 0 ? 'good' : 'bad');
  stDays.set(GAME_DAYS - S.day);
  const unit = UNIT_COST * (S.zam ? 1.35 : 1) * PORTION[portion.value].use;
  const net = price_.value / 1.1;
  unitTxt.set(`<small>Porsiyon malzeme maliyeti ≈ ${fmt(unit)} ₺ · KDV hariç satış ${fmt(net)} ₺ → malzeme oranı <b>%${fmt((unit / net) * 100)}</b>.
    Talep çarpanı (fiyat): ×${fmt(Math.pow(price_.value / P0, -ELASTIC), 2)}</small>`);
  if (lastDay) {
    lastTxt.set(`<b>Dün (${lastDay.dayName})</b>: ciro ${fmt(lastDay.revenue)} ₺<br>
      Gider: malzeme ${fmt(lastDay.orderCost)} · personel ${fmt(lastDay.staff)} · kira ${fmt(lastDay.rent)} · enerji ${fmt(lastDay.util)}${lastDay.ad ? ` · reklam ${fmt(lastDay.ad)}` : ''} ₺<br>
      Fire: ${fmt(lastDay.waste)} porsiyon (${fmt(lastDay.wasteCost)} ₺) · stok yokluğu: ${lastDay.stockout} tabak<br>
      <b style="color:${lastDay.profit >= 0 ? '#86efac' : '#fca5a5'}">Kâr: ${fmt(lastDay.profit)} ₺</b> · memnuniyet ★ ${fmt(lastDay.avg, 1)}`);
  } else lastTxt.set(`Gün sonunda gelir-gider özeti burada görünür. ${GAME_DAYS} günde en yüksek kârı ve itibarı hedefle!`);
}

sim.formatTime = () => {
  if (!S) return '';
  const h = Math.floor(S.minute / 60) % 24, m = S.minute % 60;
  return `${S.day + 1}. gün ${DAYS[S.day % 7].slice(0, 3)} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Masaya tıkla → durum
sim.onClick(() => tableMeshes, (hit) => {
  let o = hit.object;
  while (o && o.userData.slot == null) o = o.parent;
  if (!o) return;
  const g = tableOcc[o.userData.slot];
  const names = { order: 'garson bekliyor', cook: `${g?.plates} tabak pişiyor`, serve: 'servis bekliyor', eat: 'yemek yiyor', bill: 'hesap bekliyor' };
  if (!g) return sim.toast(`Masa ${o.userData.slot + 1}: boş`);
  sim.toast(`Masa ${o.userData.slot + 1}: ${g.size} kişi · ${names[g.state] || g.state} · oturalı ${S.minute - g.seatedAt} dk (kuyrukta ${g.waitQ} dk)`);
});

// Açılışta gün öğle servisinin ortasından izlenir: sabah saatleri aynı modelle dakika dakika önceden işletilir
// (model değişmez; yalnızca izlemeye 13:20'de başlanır) ve insanlar ilk karede yerlerine oturtulur.
let snapNext = false;
function warmStart() {
  const target = Math.max(openMin(), 13 * 60 + 20);
  let g = 0;
  while (S.minute < target && !S.over && g++ < 1500) stepMinute();
  snapNext = true;
  updatePanel();
}
sim.onReset(() => { newGame(); warmStart(); sim.play(); });
newGame();
warmStart();

// İç mekân ortam ışığı: gökyüzü haritası içeride kısık bağlanır (tavan ve duvarlar gökyüzünü örter)
{
  const inner = new Set();
  scene.traverse((o) => {
    let q = o; while (q && !q.userData.outside) q = q.parent;
    if (!q && o.material && o.material.isMeshStandardMaterial) inner.add(o.material);
  });
  for (const m of guests.materials) if (m.isMeshStandardMaterial) inner.add(m);
  let bound = null;
  sim.onRender(() => {
    if (scene.environment === bound) return;
    bound = scene.environment;
    for (const m of inner) { m.envMap = bound; m.envMapIntensity = m === steel ? 0.3 : m === hoodSteel ? 0.2 : 0.75; }
  });
}
