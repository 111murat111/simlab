// Bina Dayanıklılığı — kayma binası modeli (histeretik katlar, P-Δ) sentetik deprem altında; zemin, yumuşak kat, kolon kesme, izolatör.
// Sahne: gerçek ölçekli betonarme apartman (kolon, döşeme, pencereli dolgu duvar, balkon) bir kent adasında; çevre binalar, yollar, ağaçlar.
import { createSim, THREE, clamp, fmt, seeded, mat, procedural, RoundedBoxGeometry, BufferGeometryUtils, landscape, createTerrain, terrainSkirt,
  makeCity, populateCity, cityRng, streetMaterials as groundMats } from '@core';
import { createModel, makeRecord, SOILS, G, H, DT } from './model.js';
import { createSmoke } from './smoke.js';

const LOW = /[?&]low\b/.test(location.search);
const sim = createSim({
  sky: { elevation: 36, azimuth: 205, clouds: 0.4, haze: 1.25, visibility: 3200 },
  camera: { position: [12, 14, 34], target: [0, 7, 0], fov: 42, near: 0.3, far: 30000 },
  controls: { minDistance: 8, maxDistance: 160, maxPolarAngle: Math.PI * 0.49 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Her kat bir kütle, katlar arasındaki kolonlar birer yay gibi davranır (<b>kayma binası</b> modeli). Sentetik bir deprem
    kaydı zemini sarsar; model her 2 ms'de hareket denklemini çözer (açık Newmark / merkezi fark). Kolon renkleri o anki
    <b>göreli kat ötelemesini</b> (kat yer değiştirmesi ÷ kat yüksekliği) gösterir: mavi güvenli, kırmızı sınırda ("Kolonlarda ötelenme renkleri" ile açılıp kapanır). Kolonlar
    akma dayanımını aşınca kalıcı şekil değiştirir, çatlar belirir; ötelenme göçme sınırını aşarsa kat çöker ve üst katlar
    üst üste yığılır (<b>pankek göçme</b>). Hareketler görünür olsun diye büyütülerek çizilir.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Rezonans:</b> Binanın doğal periyodu T₁ kabaca <b>0,1 × kat sayısı</b> saniyedir. Zeminin baskın periyodu buna
      yaklaşınca bina en büyük salınımı yapar. "Rezonans" senaryosunda sinüs sarsıntıyı binanın periyoduna ayarla, sonra periyodu değiştir.</li>
      <li><b>Yumuşak kat</b> ve <b>kolon kesme</b>: zemin kat zayıflayınca tüm şekil değiştirme orada toplanır ve bina oradan çöker.</li>
      <li><b>Yönetmeliğe uygun</b> bina daha rijit, daha dayanımlı ve sünektir: aynı depremde hasar alsa da ayakta kalır.</li>
      <li><b>Sismik izolatör</b> periyodu ~3 saniyeye uzatır; üst yapıya gelen ivme azalır. Yumuşak zeminde uzun periyotlu
      sarsıntıya karşı izolatörün de tasarımla uyumlu olması gerekir.</li>
      <li>"İki bina" ile aynı depremi iki farklı yapıda karşılaştır.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <ul>
      <li>1999 Marmara ve 2023 Kahramanmaraş depremlerinde yıkılan binaların önemli bir kısmında yumuşak kat, kolon kesme,
      kısa kolon, düşük beton kalitesi ve yetersiz etriye gibi kusurlar görüldü.</li>
      <li>Türkiye Bina Deprem Yönetmeliği (TBDY 2018) zemine göre tasarım yapılmasını ve taşıyıcı sisteme müdahale
      edilmemesini şart koşar. Dükkân açmak için kolon/perde kesmek hem suç hem ölümcül bir risktir.</li>
      <li>Binanın risk durumunu merak ediyorsan yetkili kurumlara ya da uzman mühendislere (ör. riskli yapı tespiti) başvur.</li>
    </ul>
    <p><small>Model eğitim amaçlıdır: kütle ve rijitlikler normalize, dayanım ve göçme ötelenmesi temsili değerlerdir;
    burulma, temel-zemin etkileşimi ve gerçek betonarme davranışının ayrıntıları yoktur. Gerçek bir binanın güvenliği
    hakkında karar vermek için kullanılamaz.</small></p>`,
});
sim.formatTime = (t) => `${fmt(qt, 1)} sn`;

// --- Kent: sarsılan zemin grubu (adalar, yollar, komşu binalar) + uzak tepelerde yerleşim ---
const groundG = new THREE.Group();
sim.scene.add(groundG);
const XS = [-316, -224, -132, -44, 44, 132, 224, 316];
const ZS = [-294, -202, -110, -30, 22, 110, 202, 294];
const HERO = [3, 3], FRONT = [3, 4];
// Kahraman adası (iç: x −34,5…34,5, z −20,5…12,5): arka sırada üç, yol cephesinde iki komşu; ortada deprem parseli boş
const heroLots = [
  { type: 'apartment', x: -24.5, z: -15, width: 20, depth: 11, rot: Math.PI, floors: 5, shop: false, colors: { wall: 0xd8cbb3 }, seed: 11 },
  { type: 'apartment', x: 0, z: -15, width: 20, depth: 11, rot: Math.PI, floors: 6, shop: false, colors: { wall: 0xece6da }, seed: 12 },
  { type: 'apartment', x: 24.5, z: -15, width: 20, depth: 11, rot: Math.PI, floors: 4, shop: false, material: 'brick', seed: 13 },
  { type: 'apartment', x: -26, z: 6.5, width: 17, depth: 12, rot: 0, floors: 5, shop: true, colors: { wall: 0xe6d2b5 }, seed: 14 },
  { type: 'apartment', x: 26, z: 6.5, width: 17, depth: 12, rot: 0, floors: 6, shop: true, colors: { wall: 0xcfc4b0 }, seed: 15 },
];
// Motor kent kiti: gerçek geometrili apartmanlar (girintili pencere, balkon, dükkân katı, çatı donanımı), bordürlü kaldırım, ağaç, lamba, araç
const city = makeCity({
  xs: XS, zs: ZS, road: 12, walk: 3.5, seed: 21, parked: LOW ? 40 : 70, extent: 30, camera: [12, 14, 34], tile: 92, near: LOW ? 170 : 260,
  plan: (i, j) => (i === FRONT[0] && j === FRONT[1] ? 'park' : i === HERO[0] && j === HERO[1] ? 'plaza' : 'city'),
  block: (inner) => ({ mix: { apartment: 0.84, house: 0.12, office: 0.04 }, gap: Math.hypot(inner.cx, inner.cz) < 200 ? 0 : 2.5, shops: 0.55, roofs: { hip: 0.35 } }),
  floors: (x, z, r, type) => (type === 'apartment' ? Math.max(3, Math.round(3 + r() * 4 + (Math.hypot(x, z) < 200 ? 1 : 0))) : undefined),
  extraLots: heroLots,
});
groundG.add(city.group);

// Deprem parseli: zemin sınıfına göre renklenen toprak/çakıl avlu
const soilMat = procedural({
  key: 'yard-soil', params: { color: 0x8b6b4a, roughness: 0.95 }, bump: 0.05,
  pattern: `
    float c = cells3(p*5.0), n = fbm3(p*0.9, 4), g = vn3(p*23.0);
    col *= (0.7 + 0.45*n)*(0.82 + 0.3*smoothstep(0.08, 0.45, c));
    col = mix(col, vec3(0.55, 0.53, 0.5)*(0.8 + 0.4*g), 0.25*step(0.72, g));
    rough = 0.9 + 0.08*n; h = smoothstep(0.05, 0.4, c)*0.7 + g*0.3;`,
});
{
  const yard = new THREE.Mesh(new THREE.BoxGeometry(34, 0.3, 32).translate(0, 0.02, -4.5), soilMat);
  yard.receiveShadow = true;
  groundG.add(yard);
  // Avluya giriş yolu (karo)
  const path = new THREE.Mesh(new RoundedBoxGeometry(3, 0.1, 9.5, 1, 0.03).translate(-12.5, 0.16, 7.8), groundMats().paver);
  path.receiveShadow = true;
  groundG.add(path);
}
const soilLbl = sim.label('', { parent: groundG, position: [0, 0.6, 12.2], className: 'plain' });

// Uzak tepeler ve üzerlerine dağılmış yerleşim (sarsılmaz; ufuk)
const hfar = landscape({ seed: 12, size: 2600, height: 190, warp: 0.4, octaves: 6,
  shape: (x, z, h) => { const d = Math.max(Math.abs(x), Math.abs(z)); const t = THREE.MathUtils.smoothstep(d, 360, 1300); return -0.35 + t * Math.max(0, h + 20); } });
const terr = createTerrain(hfar, { size: [3400, 3400], res: LOW ? [120, 120] : [200, 200],
  materialOptions: { water: -50, grassAmount: 0.7, forest: 0.5, grass: 0x5d6a31, dry: 0x9a8a5c, soil: 0x6d5a45 } });
terr.userData.noFit = true;
sim.scene.add(terr);
const skirt = terrainSkirt(hfar, { inner: 1700, outer: 22000 });
sim.scene.add(skirt);
{
  // Uzak yamaçlardaki yerleşim: motor binaları (uzakta tek çizimli kabuk), taban kotu yamaca oturur
  const r = cityRng(77), lots = [];
  const pal = [0xe3d9c6, 0xd8cbb3, 0xece6da, 0xcfc4b0, 0xe6d2b5, 0xd5d9d6, 0xc9b8a0, 0xf0e9dc];
  for (let k = 0, n = LOW ? 500 : 900; k < n * 4 && lots.length < n; k++) {
    const a = r() * Math.PI * 2, d = 350 + Math.pow(r(), 0.8) * 1100, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.max(Math.abs(x), Math.abs(z)) < 345) continue;
    const e = 6, s = Math.hypot(hfar(x + e, z) - hfar(x - e, z), hfar(x, z + e) - hfar(x, z - e)) / (2 * e);
    const cl = 0.5 + 0.5 * Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.009 - 0.4);
    if (s > 0.32 || r() > 0.25 + cl * 0.75) continue;
    const house = r() < 0.35;
    const w = house ? 9 + r() * 4 : 12 + r() * 8, dd = house ? 8 + r() * 3 : 10 + r() * 4, fl = house ? 1 + Math.floor(r() * 2) : 3 + Math.floor(r() * 5);
    const y0 = Math.min(hfar(x - w / 2, z - dd / 2), hfar(x + w / 2, z + dd / 2), hfar(x - w / 2, z + dd / 2), hfar(x + w / 2, z - dd / 2)) - 0.3;
    lots.push({ type: house ? 'house' : 'apartment', x, z, width: w, depth: dd, rot: Math.round(r() * 4) * Math.PI / 2 + (r() - 0.5) * 0.3, y0, floors: fl,
      colors: r() < 0.8 ? { wall: pal[Math.floor(r() * pal.length)] } : undefined, roof: fl <= 4 && r() < 0.5 ? 'hip' : 'flat', shop: false, seed: r() * 1000 });
  }
  const far = populateCity({ lots, tile: 250, near: LOW ? 170 : 280, noRaycast: true });
  far.group.traverse((o) => { o.userData.noFit = true; });
  sim.scene.add(far.group);
}

// --- Bina görseli (sahnedeki deprem binası) ---
const COLS = [-3, 0, 3];
const unit = new THREE.BoxGeometry(1, 1, 1);
function crackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(20,10,10,.95)';
  g.lineCap = 'round';
  const rnd = seeded(11);
  for (let k = 0; k < 7; k++) {
    let x = rnd() * 128, y = rnd() * 128;
    g.lineWidth = 1 + rnd() * 2.5;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (rnd() - 0.3) * 30; y += (rnd() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  // Çapraz (X) kesme çatlağı
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(10, 12); g.lineTo(60, 64); g.lineTo(118, 116); g.moveTo(116, 10); g.lineTo(66, 62); g.lineTo(12, 118); g.stroke();
  return new THREE.CanvasTexture(c);
}
const crackMap = crackTexture();
const MAXN = 15;
const HC = H - 0.32; // kat net yüksekliği (döşeme altına kadar)
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), cGrey = new THREE.Color(0xd6d3d1), cWall = new THREE.Color(0xe9dfcf), cConc = new THREE.Color(0xd9d5ce);
const C_BLUE = new THREE.Color(0x60a5fa), C_YEL = new THREE.Color(0xfacc15), C_RED = new THREE.Color(0xdc2626), C_DARK = new THREE.Color(0x3f3f46), C_BRICK = new THREE.Color(0x9a3412);

// Kat kabuğu geometrileri (yerel: y 0..HC, eksen çizgileri x,z = ±3). Üç tür: normal pencereli, kısa kolon (bant pencere), dükkân (cam vitrin).
const strip = (g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; };
const merge = (arr) => BufferGeometryUtils.mergeGeometries(arr.map(strip));
function rectShape(x0, y0, x1, y1, holes = []) {
  const s = new THREE.Shape(); s.moveTo(x0, y0); s.lineTo(x1, y0); s.lineTo(x1, y1); s.lineTo(x0, y1); s.lineTo(x0, y0);
  for (const [a, b, c, d] of holes) { const p = new THREE.Path(); p.moveTo(a, b); p.lineTo(a, d); p.lineTo(c, d); p.lineTo(c, b); p.lineTo(a, b); s.holes.push(p); }
  return s;
}
const ext = (shape, depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -depth / 2);
function frameParts(x0, y0, x1, y1, nMull) {
  const f = 0.06, parts = [ext(rectShape(x0, y0, x1, y1, [[x0 + f, y0 + f, x1 - f, y1 - f]]), 0.08)];
  for (let k = 1; k <= nMull; k++) { const x = x0 + (x1 - x0) * k / (nMull + 1); parts.push(new THREE.BoxGeometry(0.05, y1 - y0 - 2 * f, 0.07).translate(x, (y0 + y1) / 2, 0)); }
  return parts;
}
// Yüz yerleştirme: yerel xy panelini cepheye taşı
const FACES = {
  front: (g, u) => g.translate(u, 0, 3), back: (g, u) => g.rotateY(Math.PI).translate(-u, 0, -3),
  left: (g, u) => g.rotateY(-Math.PI / 2).translate(-3, 0, -u), right: (g, u) => g.rotateY(Math.PI / 2).translate(3, 0, u),
};
function storeyKit(kind) {
  const wall = [], frame = [], glass = [];
  for (const [face, place] of Object.entries(FACES)) for (const u of [-1.5, 1.5]) {
    const W = 1.25;
    if (kind === 'normal') {
      const win = [-0.62, 0.85, 0.62, 2.2];
      wall.push(place(ext(rectShape(-W, 0, W, HC, [win]), 0.2), u));
      for (const p of frameParts(...win, 1)) frame.push(place(p, u));
      glass.push(place(new THREE.BoxGeometry(1.14, 1.27, 0.02).translate(0, (0.85 + 2.2) / 2, -0.01), u));
    } else if (kind === 'short') {
      const hb = HC * 0.55;
      wall.push(place(ext(rectShape(-W, 0, W, hb), 0.2), u));
      for (const p of frameParts(-W, hb, W, HC, 2)) frame.push(place(p, u));
      glass.push(place(new THREE.BoxGeometry(2 * W - 0.1, HC - hb - 0.1, 0.02).translate(0, (hb + HC) / 2, -0.01), u));
    } else if (face !== 'back') { // dükkân: vitrin camı + tabela bandı; arka açık
      const top = HC - 0.55;
      wall.push(place(ext(rectShape(-W, top, W, HC), 0.22), u));
      for (const p of frameParts(-W, 0.05, W, top, 2)) frame.push(place(p, u));
      glass.push(place(new THREE.BoxGeometry(2 * W - 0.1, top - 0.15, 0.02).translate(0, (0.05 + top) / 2, -0.01), u));
    }
  }
  return { wall: merge(wall), frame: merge(frame), glass: merge(glass) };
}
const KITS = { normal: storeyKit('normal'), short: storeyKit('short'), shop: storeyKit('shop') };
const M = {
  conc: mat.concrete({ color: 0xffffff, stains: 0.45, scale: 1.2 }),
  slab: mat.concrete({ color: 0xffffff, stains: 0.6 }),
  plaster: mat.concrete({ color: 0xffffff, stains: 0.22, scale: 1.6 }),
  frame: mat.plastic({ color: 0xf1f1ee, gloss: 0.45 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x28323a, roughness: 0.04, metalness: 0.85, clearcoat: 1, clearcoatRoughness: 0.02 }),
  rail: mat.brushedMetal({ color: 0x8e949a, rough: 0.35 }),
  rubber: mat.rubber({ color: 0x1d1e20 }),
  steel: mat.brushedMetal({ color: 0xb4b8bd, rough: 0.3 }),
  crack: new THREE.MeshStandardMaterial({ map: crackMap, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
};
// Balkon (ön cephe sağ aks) ve çatı: korkuluk duvarı + güneş kolektörü
const BAL = {
  slab: new RoundedBoxGeometry(2.5, 0.18, 1.25, 2, 0.04).translate(1.5, -0.09, 3.1 + 0.62),
  par: merge([new RoundedBoxGeometry(2.5, 1.0, 0.1, 1, 0.03).translate(1.5, 0.5, 4.3), new RoundedBoxGeometry(0.1, 1.0, 1.2, 1, 0.03).translate(0.3, 0.5, 3.72), new RoundedBoxGeometry(0.1, 1.0, 1.2, 1, 0.03).translate(2.7, 0.5, 3.72)]),
  rail: new RoundedBoxGeometry(2.55, 0.05, 0.08, 1, 0.02).translate(1.5, 1.03, 4.3),
};
const ROOF = {
  par: merge([[0, 3.55, 7.2, 0.15], [0, -3.55, 7.2, 0.15], [3.55, 0, 0.15, 7.2], [-3.55, 0, 0.15, 7.2]].map(([x, z, w, d]) => new RoundedBoxGeometry(w, 0.9, d, 1, 0.03).translate(x, 0.45, z))),
  panel: merge([new RoundedBoxGeometry(1.0, 0.07, 2.0, 1, 0.02).rotateX(-0.75).translate(-1.2, 0.95, -1.2), new RoundedBoxGeometry(0.9, 0.06, 1.2, 1, 0.02).translate(-1.2, 0.25, -1.2)]),
  tank: new THREE.CapsuleGeometry(0.28, 1.1, 4, 14).rotateZ(Math.PI / 2).translate(-1.2, 1.72, -2.02),
};

class Building {
  constructor(name) {
    this.md = createModel();
    this.g = new THREE.Group();
    sim.scene.add(this.g);
    const im = (geo, m, n) => { const o = new THREE.InstancedMesh(geo, m, n); o.frustumCulled = false; o.castShadow = o.receiveShadow = true; this.g.add(o); return o; };
    this.slabs = im(unit, M.slab, MAXN + 1);
    this.cols = im(new RoundedBoxGeometry(1, 1, 1, 1, 0.04), M.conc, MAXN * 9);
    this.kit = {};
    for (const [k, v] of Object.entries(KITS)) this.kit[k] = { wall: im(v.wall, M.plaster, MAXN), frame: im(v.frame, M.frame, MAXN), glass: im(v.glass, M.glass, MAXN) };
    this.bal = { slab: im(BAL.slab, M.slab, MAXN), par: im(BAL.par, M.plaster, MAXN), rail: im(BAL.rail, M.rail, MAXN) };
    this.cracks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), M.crack, MAXN * 3);
    this.cracks.frustumCulled = false; this.cracks.userData.noAO = true;
    this.g.add(this.cracks);
    // Kurşun çekirdekli kauçuk izolatör: kauçuk gövde + çelik başlık/taban plakaları
    const prof = [[0.001, 0], [0.62, 0], [0.62, 0.05], [0.5, 0.06]];
    for (let k = 0; k < 8; k++) { const y = 0.08 + k * 0.07; prof.push([0.5, y], [0.53, y + 0.035]); }
    prof.push([0.5, 0.64], [0.62, 0.65], [0.62, 0.7], [0.001, 0.7]);
    this.pads = im(new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 24), M.rubber, 9);
    this.found = new THREE.Mesh(new RoundedBoxGeometry(8, 0.6, 8, 2, 0.05), M.conc);
    this.found.position.y = -0.3; this.found.receiveShadow = true;
    this.g.add(this.found);
    this.roof = new THREE.Group();
    const rm = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; this.roof.add(o); return o; };
    this.roofPar = rm(ROOF.par, M.plaster);
    rm(ROOF.panel, new THREE.MeshPhysicalMaterial({ color: 0x14202e, roughness: 0.12, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 }));
    rm(ROOF.tank, mat.paintedMetal({ color: 0xe8e8e4, wear: 0.25 }));
    this.g.add(this.roof);
    this.label = sim.label(name, { parent: this.g, position: [0, 4, 0], className: 'plain' });
    this.coll = new Float64Array(MAXN); // her katın çökme ilerlemesi (0..1)
    this.collT = 0;
  }
  configure(o) {
    this.o = o;
    this.md.configure(o);
    this.reset();
  }
  reset() {
    this.md.reset();
    this.coll.fill(0);
    this.collT = 0;
    this.announced = false;
  }
  // Sheared kutu: alt uç x=a, üst uç x=b; y0..y1 arasında
  static shear(mesh, i, x0, z0, a, b, y0, y1, sx, sz) {
    const h = Math.max(y1 - y0, 0.01), s = (b - a) / h;
    tmpM.set(sx, s * h, 0, x0 + (a + b) / 2, 0, h, 0, (y0 + y1) / 2, 0, 0, sz, z0, 0, 0, 0, 1);
    mesh.setMatrixAt(i, tmpM);
  }
  render(dtReal, ug, exag) {
    const md = this.md, o = this.o, N = md.N, off = md.off;
    // Göçme ilerlemesi (pankek): çöken kattan başlayıp yukarı doğru
    if (md.collapsed >= 0) {
      this.collT += dtReal;
      for (let s = md.collapsed; s < N; s++) this.coll[s] = clamp((this.collT - (s - md.collapsed) * 0.3) / 0.5, 0, 1);
      if (this.collT < 3.5 && Math.random() < dtReal * 30) {
        const s = Math.min(N - 1, md.collapsed + Math.floor(Math.random() * 2));
        puff(this.g.position.x + ug, H * (s + 0.3), 3);
      }
    }
    const x = (j) => ug + (j < 0 ? 0 : md.u[j]) * exag; // j: serbestlik derecesi (−1 = zemin)
    const baseY = o.iso ? 1.0 : 0;
    // Döşemeler
    let y = baseY;
    const ys = [baseY], xs = [x(off - 1)];
    for (let s = 0; s < N; s++) {
      const hh = H * (1 - 0.88 * this.coll[s]);
      y += hh;
      ys.push(y);
      xs.push(x(s + off));
    }
    for (let f = 0; f <= N; f++) {
      tmpM.makeScale(7.2, 0.32, 7.2).setPosition(xs[f], ys[f] - (f ? 0.16 : 0.1), 0);
      this.slabs.setMatrixAt(f, tmpM);
      this.slabs.setColorAt(f, f && this.coll[f - 1] > 0.5 ? tmpC.setHex(0x8a847c) : cGrey);
    }
    this.slabs.count = N + 1;
    // Balkonlar (1. kattan itibaren döşemeye bağlı)
    let bi = 0;
    for (let f = 1; f < N; f++) {
      tmpM.makeTranslation(xs[f], ys[f], 0);
      for (const m of Object.values(this.bal)) m.setMatrixAt(bi, tmpM);
      this.bal.par.setColorAt(bi, cWall);
      bi++;
    }
    for (const m of Object.values(this.bal)) { m.count = bi; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    // Çatı
    this.roof.position.set(xs[N], ys[N], 0);
    this.roof.visible = this.coll[N - 1] < 0.5;
    // Kolonlar ve duvarlar
    let ci = 0, ki = 0;
    const cnt = { normal: 0, short: 0, shop: 0 };
    const colorOn = driftCol.value;
    for (let s = 0; s < N; s++) {
      const a = xs[s], b = xs[s + 1], y0 = ys[s], y1 = ys[s + 1] - 0.32;
      const r = Math.abs(md.th[s]) / md.thu[s];
      const t = Math.max(r, md.D[s] * 0.7);
      const col = colorOn
        ? (t < 0.5 ? tmpC.copy(C_BLUE).lerp(C_YEL, t * 2) : tmpC.copy(C_YEL).lerp(C_RED, Math.min(1, (t - 0.5) * 2)))
        : tmpC.copy(cConc).lerp(C_DARK, md.D[s] * 0.5);
      if (this.coll[s] > 0) col.lerp(C_DARK, this.coll[s]);
      for (const cx of COLS) for (const cz of COLS) {
        const removed = o.cut && s === 0 && cz === 3 && cx === 0; // kesilen kolon (ön orta)
        Building.shear(this.cols, ci, cx, cz, a, b, y0, y1, removed ? 0.0001 : 0.5, removed ? 0.0001 : 0.5);
        this.cols.setColorAt(ci++, col);
      }
      // Dolgu duvarlar: yumuşak kat / kolon kesmede zemin kat açık (dükkân vitrini); kısa kolonda bant pencere
      const kind = s === 0 && (o.soft || o.cut) ? 'shop' : o.short ? 'short' : 'normal';
      const k = this.kit[kind], i = cnt[kind]++;
      const hc = Math.max(y1 - y0, 0.01);
      tmpM.set(1, (b - a) / HC, 0, a, 0, hc / HC, 0, y0, 0, 0, 1, 0, 0, 0, 0, 1);
      k.wall.setMatrixAt(i, tmpM); k.frame.setMatrixAt(i, tmpM); k.glass.setMatrixAt(i, tmpM);
      k.wall.setColorAt(i, tmpC.copy(cWall).lerp(C_BRICK, md.D[s] * 0.5));
      // Çatlaklar (ön cephe duvarı ve ön orta kolon)
      if (md.D[s] > 0.15 && this.coll[s] < 1) {
        const sc = 0.8 + md.D[s] * 1.8;
        for (const cx of [-1.5, 1.5, 0]) {
          const mid = (a + b) / 2;
          tmpM.makeScale(cx === 0 ? sc * 0.45 : sc, cx === 0 ? sc * 0.9 : sc, 1).setPosition(mid + cx, (y0 + y1) / 2, cx === 0 ? 3.26 : 3.11);
          this.cracks.setMatrixAt(ki++, tmpM);
        }
      }
    }
    this.cols.count = ci; this.cracks.count = ki;
    for (const [kk, k] of Object.entries(this.kit)) for (const m of Object.values(k)) {
      m.count = cnt[kk]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    for (const m of [this.slabs, this.cols, this.cracks]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // İzolatör pedleri
    this.pads.count = o.iso ? 9 : 0;
    if (o.iso) {
      let p = 0;
      for (const cx of COLS) for (const cz of COLS) {
        const h = Math.max(baseY - 0.3, 0.01), sx = (x(0) - ug) / 0.7;
        tmpM.set(1, sx, 0, cx + ug, 0, h / 0.7, 0, 0, 0, 0, 1, cz, 0, 0, 0, 1);
        this.pads.setMatrixAt(p++, tmpM);
      }
      this.pads.instanceMatrix.needsUpdate = true;
    }
    this.found.position.x = ug;
    this.label.position.set(xs[N], ys[N] + 2.6, 0);
  }
  status() {
    const md = this.md;
    if (md.collapsed >= 0) return ['Göçme', 'bad'];
    let r = 0;
    for (let s = 0; s < md.N; s++) r = Math.max(r, md.thMax[s] / md.thu[s]);
    return r < 0.1 ? ['Hasarsız', 'good'] : r < 0.3 ? ['Hafif hasar', 'good'] : r < 0.6 ? ['Orta hasar', 'warn'] : ['Ağır hasar', 'bad'];
  }
}
// Kolon ve döşemeler instanceColor kullanır: başlangıçta ayır
const A = new Building('A');
const B = new Building('B');
for (const b of [A, B]) {
  b.slabs.setColorAt(0, cGrey); b.cols.setColorAt(0, cGrey);
  for (const k of Object.values(b.kit)) k.wall.setColorAt(0, cWall);
  b.bal.par.setColorAt(0, cWall);
}

// --- Toz bulutu: yumuşak, güneşle aydınlanan parçacıklar ---
const dust = createSmoke(LOW ? 500 : 900);
dust.wind.set(0.8, 0, 0.4);
sim.scene.add(dust.mesh);
function puff(x, y, n = 30) {
  for (let k = 0; k < n; k++) {
    dust.emit(x + (Math.random() - 0.5) * 7, y + Math.random() * 2, (Math.random() - 0.5) * 7,
      (Math.random() - 0.5) * 6, Math.random() * 2.5, (Math.random() - 0.5) * 6,
      { s0: 1.5, s1: 7 + Math.random() * 5, life: 5 + Math.random() * 3, a: 0.45, drag: 0.9, rise: 0.25, alb: 0.78 });
  }
}
function renderDust(dt) {
  dust.update(dt);
  dust.light(sim.sky, sim.camera);
}

// --- Deprem durumu ---
let rec = new Float32Array(1), qt = 0, qi = 0, seed = 7, ug = 0, vg = 0, running = false, pgaSeen = 0;
function buildOpts(which) {
  const o = { N: floors.value, soft: soft.value, cut: cut.value, short: shortC.value, code: code.value, iso: iso.value };
  if (which === 'B') {
    const v = bSel.value;
    if (v === 'uygun') Object.assign(o, { soft: false, cut: false, short: false, code: true, iso: false });
    else if (v === 'izolator') Object.assign(o, { iso: true });
    else if (v === 'yarim') o.N = Math.max(1, Math.round(o.N / 2));
    else if (v === 'cift') o.N = Math.min(15, o.N * 2);
  }
  return o;
}
function soil() { return SOILS[soilSel.value]; }
function restart() {
  const S = soil();
  rec = makeRecord({ pga: pga.value, Tg: tg.value, zg: S.zg, amp: S.amp, dur: dur.value, sine: kind.value === 'sinus', rnd: seeded(seed) });
  A.configure(buildOpts('A'));
  B.configure(buildOpts('B'));
  qt = 0; qi = 0; ug = 0; vg = 0; running = true; pgaSeen = 0;
  roofChart.clear(); accChart.clear();
  sampleT = 0;
  soilMat.color.setHex(S.color);
  soilLbl.setText(`Zemin: ${S.name} (büyütme ×${fmt(S.amp, 2)})`);
  layout();
  updateStaticStats();
}
function layout() {
  const two = twoMode.value;
  A.g.position.x = two ? -7 : 0;
  B.g.position.x = 7;
  B.g.visible = two;
  A.label.visible = B.label.visible = two;
  if (two) { A.label.setText('A: seçtiğin bina'); B.label.setText('B: ' + bSel.select.selectedOptions[0].textContent); }
  fitCamera();
}
function fitCamera() {
  const Nmax = Math.max(A.md.N, twoMode.value ? B.md.N : 0);
  const Ht = Nmax * H + 2;
  const w = twoMode.value ? 22 : 10;
  const a = sim.camera.aspect || 1.2;
  const d = Math.max(Ht * 1.75, (w * 1.75) / Math.min(a, 1.4)) + 5;
  sim.moveCamera([d * 0.3, Ht * 0.45 + d * 0.2, d], [0, Ht * 0.42, 0]);
}
let lastAspect = 0;

let sampleT = 0;
sim.onUpdate((dt) => {
  if (!running) return;
  const steps = Math.min(Math.round(dt / DT), 500);
  for (let s = 0; s < steps; s++) {
    const ag = qi < rec.length ? rec[qi] : 0;
    qi++;
    qt += DT;
    // Zemin yer değiştirmesi (görsel; sızıntılı integral ile kayma önlenir)
    vg += ag * DT; vg *= 1 - 0.6 * DT;
    ug += vg * DT; ug *= 1 - 0.6 * DT;
    pgaSeen = Math.max(pgaSeen, Math.abs(ag));
    for (const b of twoMode.value ? [A, B] : [A]) {
      const was = b.md.collapsed;
      b.md.step(ag);
      if (was < 0 && b.md.collapsed >= 0) onCollapse(b);
    }
    if (qt >= sampleT) {
      sampleT = qt + 0.05;
      const roof = (b) => (b.md.collapsed >= 0 ? 0 : b.md.u[b.md.M - 1] * 100);
      roofChart.push(twoMode.value ? [roof(A), roof(B)] : [roof(A), 0]);
      accChart.push([ag / G]);
    }
  }
  if (qi >= rec.length) running = false;
});
function onCollapse(b) {
  const s = b.md.collapsed;
  const who = twoMode.value ? `${b === A ? 'A' : 'B'} binası: ` : '';
  sim.toast(`💥 ${who}${s + 1}. kat göçtü (ötelenme %${fmt(b.md.thu[s] * 100, 1)} sınırını aştı)`, 'bad');
  puff(b.g.position.x, H * (s + 0.5));
}

let simT = 0;
sim.onRender((dt) => {
  const a = sim.camera.aspect;
  if (Math.abs(a - lastAspect) > 0.02) { lastAspect = a; fitCamera(); }
  const e = exag.value;
  groundG.position.x = ug * e;
  A.render(dt, ug * e, e);
  if (twoMode.value) B.render(dt, ug * e, e);
  renderDust(dt);
  simT += dt;
  city.update(simT, 0.8);
  if (sim.frame % 6 === 0) updateStats();
});

// --- Arayüz ---
const ui = sim.ui;
ui.section('Deprem');
ui.buttons([
  { label: '▶ Sars', variant: 'primary', onClick: restart },
  { label: '🎲 Yeni kayıt', onClick: () => { seed = (seed * 7919 + 13) % 100000; restart(); } },
]);
const soilSel = ui.segmented({
  label: 'Zemin sınıfı', value: 'siki',
  options: [{ value: 'kaya', label: 'Kaya' }, { value: 'siki', label: 'Sıkı' }, { value: 'yumusak', label: 'Yumuşak alüvyon' }],
  onChange: (v) => { tg.set(SOILS[v].Tg); restart(); },
});
const kind = ui.segmented({ label: 'Sarsıntı türü', value: 'deprem', options: [{ value: 'deprem', label: 'Deprem (sentetik)' }, { value: 'sinus', label: 'Sinüs (sarsma masası)' }], onChange: restart });
const pga = ui.slider({ label: 'Kaya üzerindeki en büyük yer ivmesi (PGA)', min: 0.05, max: 1, step: 0.01, value: 0.3, format: (v) => `${fmt(v, 2)} g`, onChange: restart });
const tg = ui.slider({ label: 'Baskın periyot', min: 0.1, max: 2.5, step: 0.05, value: 0.6, format: (v) => `${fmt(v, 2)} s`, onChange: restart });
const dur = ui.slider({ label: 'Süre', min: 5, max: 40, step: 1, value: 20, unit: ' sn', onChange: restart });

ui.section('Bina');
const floors = ui.slider({ label: 'Kat sayısı', min: 1, max: 15, step: 1, value: 5, onChange: restart });
const soft = ui.toggle({ label: 'Yumuşak kat (zemin kat açık, dükkân)', value: false, onChange: restart });
const cut = ui.toggle({ label: 'Kolon kesme (zemin kat)', value: false, onChange: restart });
const shortC = ui.toggle({ label: 'Kısa kolon (bant pencere)', value: false, onChange: restart });
const code = ui.toggle({ label: 'Yönetmeliğe uygun (rijit ve sünek)', value: false, onChange: restart });
const iso = ui.toggle({ label: 'Sismik izolatör', value: false, onChange: restart });

ui.section('Karşılaştırma ve görünüm');
const twoMode = ui.toggle({ label: 'İki bina yan yana', value: false, onChange: restart });
const bSel = ui.select({
  label: 'B binası', value: 'uygun', onChange: () => { if (twoMode.value) restart(); },
  options: [{ value: 'uygun', label: 'Yönetmeliğe uygun' }, { value: 'izolator', label: 'A + izolatör' }, { value: 'yarim', label: 'A, yarı kat sayısı' }, { value: 'cift', label: 'A, iki kat sayısı' }],
});
const exag = ui.slider({ label: 'Görsel büyütme', min: 1, max: 30, step: 1, value: 10, unit: '×' });
const driftCol = ui.toggle({ label: 'Kolonlarda ötelenme renkleri', value: true });

ui.section('Hazır senaryolar');
const SC = {
  rez: () => { set({ kind: 'sinus', pga: 0.12, soil: 'siki', N: 5 }); tg.set(Math.round(A.md.Tfix * 20) / 20 || 0.5); },
  yumusak: () => set({ soft: true, soil: 'yumusak', pga: 0.3 }),
  kesme: () => set({ cut: true, soil: 'siki', pga: 0.3 }),
  uygun: () => set({ code: true, soil: 'yumusak', pga: 0.35, two: false }),
  izo: () => set({ soil: 'siki', pga: 0.4, two: true, b: 'izolator' }),
};
function set({ kind: k = 'deprem', pga: p = 0.3, soil: so = 'siki', N = floors.value, soft: sf = false, cut: ct = false, short: sh = false, code: cd = false, iso: io = false, two = false, b = 'uygun' }) {
  kind.set(k); soilSel.set(so); tg.set(SOILS[so].Tg); pga.set(p); floors.set(N);
  soft.set(sf); cut.set(ct); shortC.set(sh); code.set(cd); iso.set(io); twoMode.set(two); bSel.set(b);
  A.configure(buildOpts('A'));
}
function runScenario(name) { SC[name](); restart(); }
ui.buttons([{ label: '〰️ Rezonans', onClick: () => runScenario('rez') }, { label: '🏪 Yumuşak kat', onClick: () => runScenario('yumusak') }]);
ui.buttons([{ label: '✂️ Kolon kesme', onClick: () => runScenario('kesme') }, { label: '✅ Yönetmelik', onClick: () => runScenario('uygun') }]);
ui.button({ label: '🛞 İzolatör karşılaştırması', onClick: () => runScenario('izo') });

ui.section('Durum');
const stT = ui.stat({ label: 'Bina periyodu T₁' });
const stRule = ui.stat({ label: 'Kural: 0,1 × N' });
const stRes = ui.stat({ label: 'T₁ / zemin periyodu' });
const stDrift = ui.stat({ label: 'En büyük kat ötelemesi' });
const stAcc = ui.stat({ label: 'Çatı ivmesi (en büyük)' });
const stDmg = ui.stat({ label: 'Hasar durumu' });
const stB = ui.stat({ label: 'B binası' });
const roofChart = ui.chart({ title: 'Çatının zemine göre yer değiştirmesi (cm)', series: [{ name: 'A', color: '#38bdf8' }, { name: 'B', color: '#f97316' }], maxPoints: 300 });
const accChart = ui.chart({ title: 'Yer ivmesi (g)', series: [{ name: 'Zemin', color: '#a3e635', fill: true }], maxPoints: 300, height: 80 });

function updateStaticStats() {
  const md = A.md;
  stT.set(`${fmt(md.T, 2)} s${iso.value ? ` (izolatörsüz ${fmt(md.Tfix, 2)} s)` : ''}`);
  stRule.set(`≈ ${fmt(0.1 * md.N, 1)} s`);
  const r = md.T / tg.value;
  stRes.set(`${fmt(r, 2)}${r > 0.8 && r < 1.25 ? ' · REZONANS' : ''}`, r > 0.8 && r < 1.25 ? 'bad' : r > 0.6 && r < 1.6 ? 'warn' : 'good');
  stB.el.style.display = twoMode.value ? '' : 'none';
}
function updateStats() {
  const md = A.md;
  let mx = 0, at = 0;
  for (let s = 0; s < md.N; s++) if (md.thMax[s] > mx) { mx = md.thMax[s]; at = s; }
  stDrift.set(`%${fmt(mx * 100, 2)} (${at + 1}. kat)`, mx / md.thu[at] > 0.6 ? 'bad' : mx / md.thu[at] > 0.3 ? 'warn' : '');
  stAcc.set(`${fmt(md.maxRoofAcc / G, 2)} g${md.off ? ` · izolatör ${fmt(md.maxIso * 100, 0)} cm` : ''}`);
  stDmg.set(...A.status());
  if (twoMode.value) {
    const [t, tone] = B.status();
    let bm = 0;
    for (let s = 0; s < B.md.N; s++) bm = Math.max(bm, B.md.thMax[s]);
    stB.set(`${t} · %${fmt(bm * 100, 2)}`, tone);
  }
}

sim.onReset(restart);
restart();
