// Bileşik Faiz ve Enflasyon — gün batımında çatı terasındaki masa: nominal / reel / yastık altı jeton kuleleri ve kredi kartı borç sarmalı.
import { createSim, THREE, fmt, clamp, lerp, instanced, textPlane, textTexture, disposeObject, mat, procedural, landscape, createTerrain, terrainSkirt, RoundedBoxGeometry, seeded } from '@core';
import { createCity } from './city.js';

const COIN_H = 0.21;          // bir jetonun kalınlığı (dünya birimi)
const MAX_COINS = 44;         // en yüksek kuledeki jeton sayısı
const MAX_TOWERS = 52;
const ROWS = 3;
const ROW_Z = [3.4, -0.9, -5.2];
const SEC_PER_YEAR = 0.85;    // 1× hızda bir yıl kaç saniye sürer
const CAP = MAX_TOWERS * ROWS * (MAX_COINS + 4);

const C = {
  principal: 0x7fb2ff, interest: 0xf5c542, real: 0x2dd4bf, pillow: 0x9aa4b2,
  debt: 0xef4444, paidP: 0x8b95a5, paidI: 0xfb923c,
};

const sim = createSim({
  sky: { elevation: 11, azimuth: 282, clouds: 0.3, haze: 1, visibility: 6500, wind: [3, 1] },
  camera: { position: [-0.225, 0.25, 0.585], target: [-0.005, 0.09, -0.03], fov: 42, near: 0.02, far: 30000 },
  controls: { maxDistance: 9, minDistance: 0.18, maxPolarAngle: Math.PI * 0.49 },
  look: { aoRadius: 0.05 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Gün batımında bir çatı terasındaki masa; arkada şehir. Zaman soldan sağa akar; her jeton kulesi bir yılın sonundaki
    birikimdir ve her jeton sabit bir tutardır (tutarı panelde yazar). <b style="color:#7fb2ff">Mavi</b> jetonlar senin yatırdığın
    para (başlangıç + aylık katkılar), <b style="color:#f5c542">altın</b> jetonlar faizin faizi dahil kazanılan getiridir. Orta
    sıradaki <b style="color:#2dd4bf">turkuaz</b> kuleler aynı paranın <b>bugünkü alım gücü</b> (reel değer); üzerindeki kırmızı
    saydam kısım enflasyonun erittiği değerdir. Arka gri sıra “yastık altı”: hiç faiz almadan bekleyen paranın reel değeri.</p>
    <p>Bileşik faiz: <b>A = P·(1 + r/m)<sup>m·t</sup></b> (m: yılda kaç kez faiz eklendiği). Reel getiri:
    <b>(1 + faiz) / (1 + enflasyon) − 1</b>. <b>72 kuralı:</b> paranın ikiye katlanma süresi ≈ 72 / yıllık % getiri.</p>
    <h3>Dene</h3>
    <ul>
      <li>Faizi enflasyona eşitle: nominal kule büyür ama turkuaz (reel) kule yerinde sayar.</li>
      <li>Süreyi 10'dan 30 yıla çıkar: altın jetonların payı nasıl hızla büyüyor?</li>
      <li>Bileşik sıklığını yıllıktan günlüğe çevir: fark ne kadar? (Faiz oranı arttıkça fark büyür.)</li>
      <li>Kredi kartı modunda yalnız asgari ödemeyi yap, sonra her ay 1.000 ₺ fazla öde: süre ve toplam faiz nasıl değişiyor?</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Mevduat faizinden stopaj (vergi) kesilir; kredi kartı faizine KKDF ve BSMV eklenir. Gerçekte faiz ve enflasyon her yıl değişir;
    bu model onları sabit kabul eder. Kredi kartında faiz oranı ve asgari ödeme oranı düzenlemelerle değişir; kaydırıcılarla dene.</p>
    <p><small>Bu simülasyon eğitim amaçlıdır; yatırım tavsiyesi değildir.</small></p>`,
});

// Dar ekranda (telefon, dikey pencere) tüm grafik kadraja girsin diye kamera geri çekilir
function fitCamera() {
  const st = sim.stage, a = (st.clientWidth || 1) / (st.clientHeight || 1);
  if (a >= 1.3) return;
  const t = sim.controls.target;
  sim.camera.position.sub(t).multiplyScalar(Math.min(2.2, 1.3 / a)).add(t);
  sim.controls.update();
}
fitCamera();

// --- Para biçimi ---
function tl(v) {
  const a = Math.abs(v);
  if (!isFinite(v)) return '—';
  if (a >= 1e9) return `${fmt(v / 1e9, a >= 1e11 ? 0 : 2)} mr ₺`;
  if (a >= 1e6) return `${fmt(v / 1e6, a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)} mn ₺`;
  if (a >= 1e4) return `${fmt(v / 1e3, 0)} bin ₺`;
  return `${fmt(v, 0)} ₺`;
}
const tlShort = (v) => tl(v).replace(' ₺', '');

// --- Sahne: çatı terası, masa ve şehir (metre) ---
const scene = sim.scene;
const S = 0.018;              // jeton birimi → metre (jeton çapı ≈ 1–2 cm)
const content = new THREE.Group();
content.scale.setScalar(S);
const PLINTH_TOP = 0.032;     // grafik kaidesinin üst yüzü (masa üstünden, m)
content.position.set(0.02, PLINTH_TOP, -0.02);
scene.add(content);

const walnut = mat.wood({ color: 0x9a6a44, varnish: true, ring: 7, scale: 3 });
const steel = mat.brushedMetal({ color: 0xb9bec4 });
const blackSteel = mat.paintedMetal({ color: 0x23262a, wear: 0.05 });
{
  // Masa: cilalı ceviz tabla, çelik ayaklar
  // ahşap deseni nesnenin y ekseni boyunca akar: tabla boyu y'de kurulup yatırılır
  const top = new THREE.Mesh(new RoundedBoxGeometry(0.045, 1.9, 1.0, 4, 0.012), walnut);
  top.rotation.z = Math.PI / 2;
  top.position.set(0, -0.0225, -0.1);
  scene.add(top);
  const legG = new RoundedBoxGeometry(0.05, 0.71, 0.05, 2, 0.008);
  for (const [x, z] of [[-0.86, -0.54], [0.86, -0.54], [-0.86, 0.34], [0.86, 0.34]]) {
    const l = new THREE.Mesh(legG, blackSteel); l.position.set(x, -0.4, z); scene.add(l);
  }
  const rail = new THREE.Mesh(new RoundedBoxGeometry(1.72, 0.06, 0.03, 2, 0.008), blackSteel);
  rail.position.set(0, -0.08, -0.54); scene.add(rail);

  // Teras zemini: ahşap deck tahtaları (her tahta ayrı ton), beton parapet, çelik korkuluk
  const plankG = new RoundedBoxGeometry(0.14, 12, 0.03, 2, 0.006).rotateX(Math.PI / 2);
  const planks = instanced(plankG, mat.wood({ color: 0x8a6446, ring: 3, scale: 2 }), 80);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
  for (let i = 0; i < 80; i++) {
    const z = -2.55 + i * 0.145;
    planks.setMatrixAt(i, m4.compose(new THREE.Vector3((i % 3) * 0.3 - 0.3, -0.765, z), q, new THREE.Vector3(1, 1, 1)));
  }
  scene.add(planks);
  const conc = mat.concrete({ color: 0xb5ada1 });
  const parapet = new THREE.Mesh(new RoundedBoxGeometry(14, 0.32, 0.3, 2, 0.03), conc);
  parapet.position.set(0, -0.62, -2.75); scene.add(parapet);
  const bldg = new THREE.Mesh(new THREE.BoxGeometry(18, 40, 16), conc);
  bldg.position.set(0, -20.78, 5.1); bldg.userData.noFit = true; scene.add(bldg);
  const handrail = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 14, 16), steel);
  handrail.rotation.z = Math.PI / 2; handrail.position.set(0, 0.34, -2.75); scene.add(handrail);
  const postG = new THREE.LatheGeometry([[0, 0], [0.028, 0], [0.028, 0.02], [0.02, 0.03], [0.02, 0.8], [0, 0.8]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
  for (let i = 0; i < 12; i++) {
    const pst = new THREE.Mesh(postG, steel); pst.position.set(-6.6 + i * 1.2, -0.46, -2.75); scene.add(pst);
  }
  for (const y of [-0.2, 0.0, 0.18]) {
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 14, 6), steel);
    cab.rotation.z = Math.PI / 2; cab.position.set(0, y, -2.75); scene.add(cab);
  }
  // Masa üstü: kupa (kahve), deri defter + kalem
  const mug = new THREE.Group();
  const prof = [[0, 0], [0.036, 0], [0.041, 0.004], [0.043, 0.09], [0.04, 0.094], [0.037, 0.09], [0.035, 0.008], [0, 0.008]];
  mug.add(new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 40), mat.ceramic({ color: 0xe8e1d4 })));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0065, 12, 24, Math.PI * 1.1), mat.ceramic({ color: 0xe8e1d4 }));
  handle.rotation.z = -Math.PI * 0.55; handle.position.set(0.044, 0.048, 0); mug.add(handle);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.035, 32).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x2a1508, roughness: 0.05, clearcoat: 1 }));
  coffee.position.y = 0.075; mug.add(coffee);
  mug.position.set(0.6, 0, 0.12); mug.rotation.y = 2.4;
  scene.add(mug);
  const book = new THREE.Group();
  const cover = new THREE.Mesh(new RoundedBoxGeometry(0.21, 0.02, 0.29, 2, 0.005), mat.fabric({ color: 0x4a2c1c }));
  cover.position.y = 0.01; book.add(cover);
  const pages = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.014, 0.284, 1, 0.002), mat.plastic({ color: 0xf0eadb, gloss: 0 }));
  pages.position.set(0.006, 0.01, 0); book.add(pages);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.022, 0.292), mat.rubber({ color: 0x151515 }));
  band.position.set(0.07, 0.01, 0); book.add(band);
  const penG = new THREE.LatheGeometry([[0, 0], [0.002, 0.004], [0.0045, 0.02], [0.0048, 0.12], [0.0045, 0.14], [0, 0.142]].map(([x, y]) => new THREE.Vector2(x, y)), 16);
  const pen = new THREE.Mesh(penG, mat.paintedMetal({ color: 0x1c2733, wear: 0.02 }));
  pen.rotation.set(Math.PI / 2, 0, 0.3); pen.position.set(-0.03, 0.026, -0.06); book.add(pen);
  book.position.set(-0.66, 0, 0.1); book.rotation.y = 0.22;
  scene.add(book);
}
// Grafik kaidesi: siyah ayak üstünde cilalı damarlı mermer tabla, pirinç kenar çıtası ve yan bant
const marble = procedural({
  key: 'bf-marble', physical: true, scale: 9, bump: 0.004,
  params: { color: 0x2c3031, roughness: 0.16, clearcoat: 0.75, clearcoatRoughness: 0.07 },
  pattern: `
    float n = fbm3(p*0.9, 5);
    float v = pow(ridge3(p*0.55 + vec3(n*1.6)), 14.0);
    float v2 = pow(ridge3(p*1.7 + vec3(n*2.3) + 5.0), 22.0);
    col *= 0.78 + 0.35*n;
    col = mix(col, vec3(0.80, 0.76, 0.68), clamp(v*0.85 + v2*0.45, 0.0, 1.0));
    rough = clamp(0.12 + 0.12*n + 0.1*v, 0.06, 0.4);
    h = v*0.3 + n*0.2;`,
});
const brass = mat.brushedMetal({ color: 0xc9a15a, rough: 0.26 });
{
  const W = 0.58, D = 0.27, cx = 0.02, cz = -0.02;
  const foot = new THREE.Mesh(new RoundedBoxGeometry(W - 0.03, 0.008, D - 0.03, 2, 0.003), blackSteel);
  foot.position.set(cx, 0.004, cz); scene.add(foot);
  const slab = new THREE.Mesh(new RoundedBoxGeometry(W, PLINTH_TOP - 0.008, D, 3, 0.004), marble);
  slab.position.set(cx, 0.008 + (PLINTH_TOP - 0.008) / 2, cz); scene.add(slab);
  const band = new THREE.Mesh(new RoundedBoxGeometry(W + 0.003, 0.004, D + 0.003, 2, 0.0015), brass);
  band.position.set(cx, 0.013, cz); scene.add(band);
  // üst kenar çıtası (dört parça, köşeleri üst üste)
  for (const [w, d, x, z] of [[W, 0.006, 0, D / 2 - 0.003], [W, 0.006, 0, -D / 2 + 0.003], [0.006, D, W / 2 - 0.003, 0], [0.006, D, -W / 2 + 0.003, 0]]) {
    const b = new THREE.Mesh(new RoundedBoxGeometry(w, 0.004, d, 2, 0.0015), brass);
    b.position.set(cx + x, PLINTH_TOP + 0.0015, cz + z); scene.add(b);
  }
}

// Hesap makinesi: ekranında seçili senaryonun son değeri
const calc = new THREE.Group();
const lcdCanvas = document.createElement('canvas');
lcdCanvas.width = 256; lcdCanvas.height = 64;
const lcdTex = new THREE.CanvasTexture(lcdCanvas); lcdTex.colorSpace = THREE.SRGBColorSpace;
{
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.014, 0.15, 3, 0.005), mat.plastic({ color: 0x2b2d31, gloss: 0.2 }));
  body.position.y = 0.007; calc.add(body);
  const keys = instanced(new RoundedBoxGeometry(0.014, 0.005, 0.011, 2, 0.002), mat.rubber({ color: 0x4a4d52 }), 20);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 20; i++) keys.setMatrixAt(i, m4.makeTranslation(-0.0285 + (i % 4) * 0.019, 0.015, -0.004 + Math.floor(i / 4) * 0.0145));
  calc.add(keys);
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.074, 0.02).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: lcdTex, emissiveMap: lcdTex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.2 }));
  lcd.position.set(0, 0.0145, -0.05); calc.add(lcd);
  calc.position.set(0.5, 0, -0.34); calc.rotation.y = -0.35;
  scene.add(calc);
}
function drawLCD(v) {
  const g = lcdCanvas.getContext('2d');
  g.fillStyle = '#b9c4a4'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#1d231a'; g.font = '600 40px ui-monospace, monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillText(isFinite(v) ? fmt(Math.round(v)) : 'E', 244, 34);
  lcdTex.needsUpdate = true;
}

// Şehir: ileride yüksek kuleler, uzakta tepeler (hava perspektifiyle soluklaşır)
{
  const hf = (x, z) => {
    const r = Math.hypot(x, z);
    const base = landscape({ seed: 9, size: 1600, height: 380, base: -60 });
    return -46 + THREE.MathUtils.smoothstep(r, 2300, 5200) * (base(x, z) + 120);
  };
  scene.add(createTerrain(hf, { size: [12000, 12000], res: [200, 200], materialOptions: { water: -500, grass: 0x55602f, dry: 0x8f8456, forest: 0.9 } }));
  scene.add(terrainSkirt(hf, { inner: 6000, outer: 60000 }));
  const street = new THREE.Mesh(new THREE.PlaneGeometry(5200, 5200).rotateX(-Math.PI / 2), mat.asphalt({ color: 0x44454a }));
  street.position.y = -40; street.userData.noFit = true; street.userData.noCast = true;
  scene.add(street);
  scene.add(createCity({
    ground: -40, rect: [-2200, -2500, 2200, 900], pitch: 92, seed: 11, lit: 0.12, glow: 0.9,
    avoid: (x, z) => Math.hypot(x, z) < 280 && !(Math.abs(x) < 60 && z > 60),
    tall: (x, z) => 0.05 + 0.55 * Math.exp(-((x + 380) ** 2 + (z + 1150) ** 2) / 520 ** 2) + 0.3 * Math.exp(-((x - 900) ** 2 + (z + 1900) ** 2) / 380 ** 2),
  }));
}

// Kahve buharı: yumuşak yuvarlak parçacıklar
const puffTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const NSTEAM = 24, steamPos = new Float32Array(NSTEAM * 3), steamAge = new Float32Array(NSTEAM);
const steamGeo = new THREE.BufferGeometry();
steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPos, 3));
const steam = new THREE.Points(steamGeo, new THREE.PointsMaterial({ map: puffTex, size: 0.03, transparent: true, opacity: 0.12, depthWrite: false }));
steam.frustumCulled = false;
scene.add(steam);
for (let i = 0; i < NSTEAM; i++) steamAge[i] = Math.random() * 3;
sim.onRender((dt) => {
  for (let i = 0; i < NSTEAM; i++) {
    steamAge[i] += dt;
    if (steamAge[i] > 3) steamAge[i] = 0;
    const a = steamAge[i];
    steamPos[i * 3] = 0.6 + Math.sin(a * 2 + i) * 0.008 * a;
    steamPos[i * 3 + 1] = 0.08 + a * 0.045;
    steamPos[i * 3 + 2] = 0.12 + Math.cos(a * 1.7 + i * 2) * 0.006 * a;
  }
  steamGeo.attributes.position.needsUpdate = true;
});

// Sıra tepsileri: yeşil çuha kaplı ahşap tepsiler (boy rebuild'da)
const feltMat = mat.fabric({ color: 0x1f3d30 });
const trayMat = mat.wood({ color: 0x3e2618, varnish: true, ring: 5 });
const platforms = ROW_Z.map((z) => {
  const g = new THREE.Group();
  g.position.set(0, 0, z);
  content.add(g);
  return g;
});
function sizePlatform(g, len) {
  g.children.forEach((c) => c.geometry.dispose());
  g.clear();
  const tray = new THREE.Mesh(new RoundedBoxGeometry(len, 0.1, 2.2, 2, 0.05), trayMat);
  tray.position.y = 0.05; g.add(tray);
  const felt = new THREE.Mesh(new RoundedBoxGeometry(len - 0.25, 0.05, 1.95, 2, 0.02), feltMat);
  felt.position.y = 0.095; g.add(felt);
}

// --- Jetonlar (tek InstancedMesh): kenarı kabarık, yüzü hafif çukur, eloksallı metal (her örnek kendi rengi) ---
const coinGeo = new THREE.LatheGeometry([[0, -0.43], [0.8, -0.43], [0.84, -0.5], [0.97, -0.5], [1, -0.44], [1, 0.44], [0.97, 0.5], [0.84, 0.5], [0.8, 0.43], [0, 0.43]]
  .map(([x, y]) => new THREE.Vector2(x, y)), 28);
const coinMat = procedural({
  key: 'coin-anodized', physical: true, scale: 3, bump: 0.012,
  params: { color: 0xffffff, roughness: 0.3, metalness: 1, clearcoat: 0.3, clearcoatRoughness: 0.2 },
  pattern: `
    float n = fbm3(p*1.5 + seed*9.0, 4), s = vn3(vec3(p.x*30.0, p.y*2.0, p.z*30.0));
    col *= 0.82 + 0.3*n;
    rough = clamp(0.18 + 0.28*n + 0.08*s, 0.08, 0.6);
    metal = 1.0;
    h = n*0.5 + s*0.3;`,
});
const coins = instanced(coinGeo, coinMat, CAP);
coins.frustumCulled = false;
const white = new THREE.Color(1, 1, 1);
for (let i = 0; i < CAP; i++) coins.setColorAt(i, white);
coins.count = 0;
content.add(coins);
const coinOwner = new Int16Array(CAP * 2); // [yıl, sıra]

// Enflasyonun erittiği kısım (saydam kırmızı silindir kılıf, açılıp kapanır)
const ghosts = instanced(new THREE.CylinderGeometry(1, 1, 1, 28, 1, true),
  new THREE.MeshStandardMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.28, depthWrite: false, roughness: 0.4, side: THREE.DoubleSide }), MAX_TOWERS * 2);
ghosts.frustumCulled = false;
ghosts.count = 0;
content.add(ghosts);

// Seçili yıl vurgusu
const hilite = new THREE.Mesh(new THREE.PlaneGeometry(1, 11.2), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.22, depthWrite: false }));
hilite.rotation.x = -Math.PI / 2;
hilite.position.set(0, 0.14, -0.9);
hilite.visible = false;
content.add(hilite);

// Etiketler
const nomLbl = sim.label('', { parent: content, position: [0, 0, 0] });
const realLbl = sim.label('', { parent: content, position: [0, 0, 0] });
let yearLbls = [];
let rowSigns = [];

// Kanvas dokulu sprite etiketler: ekranda sabit piksel boyunda, hep kameraya dönük, grafiğin önünde (derinlik testi yok)
const overlay = new THREE.Group();
scene.add(overlay);
const toWorld = (x, y, z) => new THREE.Vector3(content.position.x + x * S, content.position.y + y * S, content.position.z + z * S);
function spriteLabel(text, { px = 22, color = '#f4f1ea', bg = null, chips = null, center = [0.5, 0.5], weight = 600 } = {}) {
  const R = 2.2;                      // doku / ekran piksel oranı (keskin kalsın)
  const fs = Math.round(px * 0.62 * R), pad = Math.round(fs * 0.5), h = Math.round(px * R);
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const font = `${weight} ${fs}px system-ui, "Segoe UI", Roboto, sans-serif`;
  g.font = font;
  const chipW = chips ? Math.round(fs * 0.95) : 0, gap = chips ? Math.round(fs * 0.4) : 0;
  const w = Math.ceil(g.measureText(text).width + pad * 2 + chipW + gap);
  c.width = w; c.height = h;
  if (bg) {
    g.fillStyle = bg; g.beginPath(); g.roundRect(1, 1, w - 2, h - 2, h * 0.28); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.stroke();
  }
  if (chips) {
    const cy = h / 2, ch = fs * 0.72, x0 = pad, cw = chipW / chips.length;
    g.save(); g.beginPath(); g.roundRect(x0, cy - ch / 2, chipW, ch, ch * 0.3); g.clip();
    chips.forEach((col, i) => { g.fillStyle = col; g.fillRect(x0 + i * cw, cy - ch / 2, cw + 0.5, ch); });
    g.restore();
  }
  g.font = font; g.textBaseline = 'middle'; g.textAlign = 'left';
  if (!bg) { g.lineJoin = 'round'; g.lineWidth = fs * 0.22; g.strokeStyle = 'rgba(8,10,14,0.85)'; g.strokeText(text, pad + chipW + gap, h / 2 + fs * 0.04); }
  g.fillStyle = color; g.fillText(text, pad + chipW + gap, h / 2 + fs * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, fog: false }));
  sp.center.set(center[0], center[1]);
  sp.renderOrder = 20;
  sp.userData.px = px; sp.userData.aspect = w / h;
  overlay.add(sp);
  return sp;
}
function dropSprite(sp) { sp.material.map.dispose(); sp.material.dispose(); sp.removeFromParent(); }
// Ekran boyu ve pozlama değişse de etiketler aynı piksel boyunda ve parlaklıkta kalır (bloom'a taşmaz)
sim.onRender(() => {
  const H = sim.renderer.domElement.clientHeight || 1;
  const k = (2 * Math.tan(THREE.MathUtils.degToRad(sim.camera.fov) / 2)) / H;
  const bright = 0.92 / Math.max(sim.renderer.toneMappingExposure, 1e-3);
  for (const sp of overlay.children) {
    const px = sp.userData.px * clamp(H / 520, 0.9, 1.35);
    sp.scale.set(px * sp.userData.aspect * k, px * k, 1);
    sp.material.color.setScalar(bright);
  }
});

// Yıl çentikleri: kaidenin ön şeridine gömülü pirinç çizgiler (her yıl kısa, etiketli yıllarda uzun) + taban çizgisi
const ticks = instanced(new THREE.BoxGeometry(1, 1, 1), brass, MAX_TOWERS + 2);
ticks.count = 0;
ticks.frustumCulled = false;
content.add(ticks);

// --- Durum ---
let mode = 'birikim';
let plan = null;       // { n, xs, spacing, r, coinV, rows:[{segs(k)→[[v,renk]]}] , ghost(k)→[[lo,hi]] }
let progress = 0;      // yıl cinsinden animasyon ilerlemesi
let firstBuild = true;
let lastDrawn = -1;
let pushedYears = 0;
let selected = -1;

// --- Modeller ---
function computeSaving() {
  const P0 = startAmt.value, mon = monthly.value, r = rate.value / 100, inf = infl.value / 100, tax = taxRate.value / 100;
  const N = years.value, freq = +freqSel.value;
  const rd = r / 365;
  let bal = P0, accrued = 0, principal = P0, taxPaid = 0, gross = 0;
  const out = [{ nom: P0, prin: P0, real: P0, pillow: P0, tax: 0 }];
  for (let y = 1; y <= N; y++) {
    let month = -1;
    for (let d = 0; d < 365; d++) {
      const m = Math.floor((d * 12) / 365);
      if (m !== month) { month = m; bal += mon; principal += mon; }
      accrued += bal * rd;
      const endOfMonth = Math.floor(((d + 1) * 12) / 365) !== m;
      const credit = freq === 365 || (freq === 12 && endOfMonth) || (freq === 1 && d === 364);
      if (credit) {
        const t = accrued * tax;
        gross += accrued; taxPaid += t; bal += accrued - t; accrued = 0;
      }
    }
    const cpi = Math.pow(1 + inf, y);
    out.push({ nom: bal, prin: principal, real: bal / cpi, pillow: principal / cpi, tax: taxPaid });
  }
  const last = out[N];
  const showPillow = pillowT.value;
  const netR = Math.pow(last.nom / Math.max(1, last.prin), 0) && effectiveNet(r, freq, tax);
  const realR = (1 + netR) / (1 + inf) - 1;
  return {
    kind: 'birikim', data: out, n: N + 1, gross, taxPaid, netR, realR,
    rows: [
      (k) => [[out[k].prin, C.principal], [Math.max(0, out[k].nom - out[k].prin), C.interest]],
      (k) => [[out[k].real, C.real]],
      showPillow ? (k) => [[out[k].pillow, C.pillow]] : null,
    ],
    ghost: (k) => [[1, out[k].real, out[k].nom], showPillow ? [2, out[k].pillow, out[k].prin] : null],
    maxV: Math.max(...out.map((o) => Math.max(o.nom, o.real, o.prin))),
    rowNames: ['Nominal birikim', 'Reel değer (bugünün parası)', showPillow ? 'Yastık altı (reel)' : null],
  };
}

function effectiveNet(r, freq, tax) {
  // Vergi sonrası yıllık efektif getiri
  const rn = r * (1 - tax);
  return freq === 1 ? rn : Math.pow(1 + rn / freq, freq) - 1;
}

function computeDebt() {
  const D = debtAmt.value, i = (cardRate.value / 100) * (kkdf.value ? 1.3 : 1), pct = minPct.value / 100, extra = extraPay.value;
  let B = D, paidP = 0, paidI = 0, m = 0, firstPay = 0;
  const out = [{ debt: D, paidP: 0, paidI: 0 }];
  while (B > 0.5 && m < 600) {
    const int = B * i;
    B += int;
    let pay = Math.max(B * pct, Math.min(100, B)) + extra;
    pay = Math.min(pay, B);
    if (m === 0) firstPay = pay;
    const toI = Math.min(pay, int);
    paidI += toI; paidP += pay - toI; B -= pay; m++;
    if (m % 12 === 0 || B <= 0.5) out.push({ debt: Math.max(0, B), paidP, paidI });
  }
  const done = B <= 0.5;
  const pmt12 = (D * i) / (1 - Math.pow(1 + i, -12));
  return {
    kind: 'borc', data: out, n: out.length, months: m, done, paidI, paidP, firstPay, pmt12, iEff: i, endDebt: B,
    rows: [
      (k) => [[out[k].debt, C.debt]],
      (k) => [[out[k].paidP, C.paidP], [out[k].paidI, C.paidI]],
      null,
    ],
    ghost: () => [],
    maxV: Math.max(...out.map((o) => Math.max(o.debt, o.paidP + o.paidI))),
    rowNames: ['Kalan borç', 'Ödediğin toplam (anapara + faiz)', null],
  };
}

// --- Yerleşim ---
function rebuild() {
  plan = mode === 'birikim' ? computeSaving() : computeDebt();
  const n = plan.n;
  plan.spacing = n > 1 ? Math.min(1.7, 26 / (n - 1)) : 1;
  const len = plan.spacing * (n - 1);
  plan.xs = Array.from({ length: n }, (_, k) => -len / 2 + k * plan.spacing);
  plan.r = clamp(plan.spacing * 0.4, 0.14, 0.62);
  plan.coinV = Math.max(plan.maxV, 1) / MAX_COINS;

  platforms.forEach((p, i) => {
    p.visible = !!plan.rows[i];
    sizePlatform(p, len + plan.r * 2 + 1.2);
  });
  hilite.scale.x = plan.r * 2.6;

  // Yıl etiketleri ve çentikler (etiket aralığı ekranda sığacak biçimde)
  yearLbls.forEach(dropSprite);
  const step = n <= 7 ? 1 : n <= 13 ? 2 : n <= 32 ? 5 : 10;
  yearLbls = [];
  const zTick = ROW_Z[0] + 1.35;
  let ti = 0;
  for (let k = 0; k < n; k++) {
    const major = k % step === 0;
    const L = major ? 1.0 : 0.5;
    ticks.setMatrixAt(ti++, _m.compose(_p.set(plan.xs[k], 0.012, zTick + L / 2), _q, _s.set(0.09, 0.03, L)));
    if (!major) continue;
    const t = plan.kind === 'birikim' ? (k === 0 ? 'Bugün' : `${k}. yıl`) : (k === 0 ? 'Başlangıç' : `${k}. yıl`);
    const yl = spriteLabel(t, { px: 19, center: [0.5, 1.05], color: '#f3ead8' });
    yl.position.copy(toWorld(plan.xs[k], 0, zTick + 1.3));
    yl.visible = labelsOn;
    yearLbls.push(yl);
  }
  ticks.setMatrixAt(ti++, _m.compose(_p.set(0, 0.012, zTick), _q, _s.set(len + 0.09, 0.03, 0.07)));
  ticks.count = ti;
  ticks.instanceMatrix.needsUpdate = true;

  // Sıra etiketleri: her sıranın başında, ilk kulelerin üstünde (renk çipi = jeton rengi)
  rowSigns.forEach(dropSprite);
  rowSigns = [];
  const hex = (c) => '#' + new THREE.Color(c).getHexString();
  const chipCols = mode === 'borc' ? [[C.debt], [C.paidP, C.paidI]] : [[C.principal, C.interest], [C.real], [C.pillow]];
  const kLim = Math.max(1, Math.ceil((n - 1) * 0.35));
  const coinH = (v) => Math.min(MAX_COINS + 3, Math.round(v / plan.coinV)) * COIN_H;
  plan.rowNames.forEach((name, i) => {
    if (!name) return;
    let top = 0;
    for (let k = 0; k <= Math.min(kLim, n - 1); k++) {
      top = Math.max(top, coinH(plan.rows[i](k).reduce((a, sg) => a + sg[0], 0)));
      for (const gg of plan.ghost(k)) if (gg && gg[0] === i) top = Math.max(top, coinH(gg[2]));
    }
    const lb = spriteLabel(name, { px: 24, bg: 'rgba(14,18,24,0.78)', chips: chipCols[i].map(hex), center: [0, 0] });
    lb.position.copy(toWorld(plan.xs[0] - plan.r, 0.12 + top + 0.6 + i * 1.0, ROW_Z[i]));
    rowSigns.push(lb);
  });

  selected = -1;
  hilite.visible = false;
  sim.time = 0;
  // İlk açılışta sonuç hazır görünür; ayar değişince kuleler yeniden büyür
  progress = firstBuild ? plan.n - 1 : 0;
  firstBuild = false;
  lastDrawn = -1;
  pushedYears = 0;
  (mode === 'birikim' ? chartSave : chartDebt).clear();
  updateStats();
  draw(progress);
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Color();
const hash = (a, b, c) => { const x = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453; return x - Math.floor(x); };

function segsAt(row, k, g) {
  const cur = row(k);
  if (g >= 1 || k === 0) return cur;
  const prev = row(k - 1);
  return cur.map(([v, col], i) => [lerp(prev[i] ? prev[i][0] : 0, v, g), col]);
}

function draw(p) {
  const P = plan, n = P.n;
  let idx = 0, gi = 0;
  const kMax = Math.min(n - 1, Math.floor(p) + 1);
  let topNom = 0, topReal = 0, topK = 0, valNom = 0, valReal = 0;
  for (let k = 0; k <= kMax; k++) {
    const g = k === 0 ? 1 : clamp(p - k + 1, 0, 1);
    if (g <= 0) break;
    const x = P.xs[k];
    for (let ri = 0; ri < ROWS; ri++) {
      const row = P.rows[ri];
      if (!row) continue;
      const segs = segsAt(row, k, g);
      const total = segs.reduce((a, s) => a + s[0], 0);
      const count = Math.min(MAX_COINS + 3, Math.round(total / P.coinV));
      for (let c = 0; c < count && idx < CAP; c++) {
        const mid = (c + 0.5) * P.coinV;
        let acc = 0, col = segs[segs.length - 1][1];
        for (const [v, cc] of segs) { acc += v; if (mid <= acc) { col = cc; break; } }
        const j = hash(k, c, ri);
        _p.set(x + (j - 0.5) * P.r * 0.12, 0.12 + (c + 0.5) * COIN_H, ROW_Z[ri] + (hash(c, k, ri + 3) - 0.5) * P.r * 0.12);
        _s.set(P.r, COIN_H * 0.84, P.r);
        coins.setMatrixAt(idx, _m.compose(_p, _q, _s));
        coins.setColorAt(idx, _c.setHex(col).multiplyScalar(0.86 + j * 0.2));
        coinOwner[idx * 2] = k; coinOwner[idx * 2 + 1] = ri;
        idx++;
      }
      if (ri === 0) { topNom = 0.12 + count * COIN_H; valNom = total; topK = k; }
      if (ri === 1) { topReal = 0.12 + count * COIN_H; valReal = total; }
    }
    // Enflasyon erimesi
    const gh = P.ghost(k);
    for (const gg of gh) {
      if (!gg) continue;
      const [ri, lo0, hi0] = gg;
      const lo = k === 0 ? lo0 : lerp(P.ghost(k - 1).find((q) => q && q[0] === ri)?.[1] ?? 0, lo0, g);
      const hi = k === 0 ? hi0 : lerp(P.ghost(k - 1).find((q) => q && q[0] === ri)?.[2] ?? 0, hi0, g);
      const hLo = Math.round(lo / P.coinV) * COIN_H, hHi = Math.round(hi / P.coinV) * COIN_H;
      if (hHi - hLo < 0.02) continue;
      _p.set(x, 0.12 + (hLo + hHi) / 2, ROW_Z[ri]);
      _s.set(P.r * 1.07, hHi - hLo, P.r * 1.07);
      ghosts.setMatrixAt(gi++, _m.compose(_p, _q, _s));
    }
  }
  coins.count = idx;
  coins.instanceMatrix.needsUpdate = true;
  if (coins.instanceColor) coins.instanceColor.needsUpdate = true;
  coins.boundingSphere = null;
  ghosts.count = gi;
  ghosts.instanceMatrix.needsUpdate = true;

  nomLbl.position.set(P.xs[topK], topNom + 0.45, ROW_Z[0]);
  realLbl.position.set(P.xs[topK], topReal + 0.45, ROW_Z[1]);
  if (P.kind === 'birikim') {
    nomLbl.setText(`<span style="color:#f5c542">${tl(valNom)}</span>`);
    realLbl.setText(`<span style="color:#5eead4">${tl(valReal)}</span>`);
  } else {
    nomLbl.setText(`<span style="color:#fca5a5">Borç ${tl(valNom)}</span>`);
    realLbl.setText(`<span style="color:#fdba74">Ödenen ${tl(valReal)}</span>`);
  }
}

// --- Güncelleme döngüsü ---
sim.onUpdate((dt) => {
  if (!plan) return;
  const end = plan.n - 1;
  if (progress >= end && lastDrawn >= end) return;
  progress = Math.min(end, progress + dt / SEC_PER_YEAR);
  const q = Math.round(progress * 30) / 30;
  if (q !== lastDrawn) { lastDrawn = q; draw(q); }
  // Grafik: tamamlanan yıllar
  while (pushedYears <= Math.floor(progress)) {
    const d = plan.data[pushedYears];
    if (plan.kind === 'birikim') chartSave.push([d.nom, d.real, pillowT.value ? d.pillow : d.prin / Math.pow(1 + infl.value / 100, pushedYears)]);
    else chartDebt.push([d.debt, d.paidI, d.paidP]);
    pushedYears++;
  }
});

sim.formatTime = () => {
  if (!plan) return '';
  const y = Math.floor(progress);
  return plan.kind === 'birikim' ? `${y}. yıl / ${plan.n - 1}` : `${y}. yıl · ${fmt(Math.min(plan.months, Math.round(progress * 12)))}. ay`;
};

// --- Arayüz ---
const ui = sim.ui;
ui.section('Mod');
const modeSeg = ui.segmented({
  options: [{ value: 'birikim', label: '💰 Birikim' }, { value: 'borc', label: '💳 Kredi kartı borcu' }],
  value: 'birikim', onChange: (v) => { mode = v; syncMode(); rebuild(); },
});

const secSave = ui.section('Birikim ayarları');
const startAmt = ui.slider({ label: 'Başlangıç tutarı', min: 0, max: 1000000, step: 5000, value: 100000, format: (v) => `${fmt(v)} ₺`, onChange: () => rebuild() });
const monthly = ui.slider({ label: 'Aylık katkı', min: 0, max: 50000, step: 250, value: 2000, format: (v) => `${fmt(v)} ₺`, onChange: () => rebuild() });
const rate = ui.slider({ label: 'Yıllık faiz / getiri', min: 0, max: 80, step: 0.5, value: 30, format: (v) => `%${fmt(v, 1)}`, onChange: () => rebuild() });
const infl = ui.slider({ label: 'Yıllık enflasyon', min: 0, max: 80, step: 0.5, value: 25, format: (v) => `%${fmt(v, 1)}`, onChange: () => rebuild() });
const taxRate = ui.slider({ label: 'Vergi / stopaj (faizden)', min: 0, max: 25, step: 0.5, value: 15, format: (v) => `%${fmt(v, 1)}`, onChange: () => rebuild() });
const years = ui.slider({ label: 'Süre', min: 1, max: 40, step: 1, value: 20, unit: 'yıl', onChange: () => rebuild() });
const freqSel = ui.segmented({
  label: 'Bileşik sıklığı (faiz ne sıklıkla eklenir)',
  options: [{ value: '1', label: 'Yıllık' }, { value: '12', label: 'Aylık' }, { value: '365', label: 'Günlük' }],
  value: '12', onChange: () => rebuild(),
});
const pillowT = ui.toggle({ label: 'Yastık altı karşılaştırması', value: true, onChange: () => rebuild() });
ui.text('<b>Hazır senaryolar</b>');
ui.buttons([
  { label: 'Yüksek enflasyon', onClick: () => preset({ rate: 45, infl: 50 }) },
  { label: 'Düşük enflasyon', onClick: () => preset({ rate: 6, infl: 2.5 }) },
]);
ui.buttons([
  { label: 'Pozitif reel faiz', onClick: () => preset({ rate: 40, infl: 25 }) },
  { label: 'Erken başla', onClick: () => preset({ start: 0, monthly: 1000, years: 40, rate: 12, infl: 8 }) },
]);

const secDebt = ui.section('Kredi kartı borcu');
const debtAmt = ui.slider({ label: 'Kart borcu', min: 1000, max: 200000, step: 1000, value: 30000, format: (v) => `${fmt(v)} ₺`, onChange: () => rebuild() });
const cardRate = ui.slider({ label: 'Aylık akdi faiz', min: 0.5, max: 6, step: 0.05, value: 3.5, format: (v) => `%${fmt(v, 2)} / ay`, onChange: () => rebuild() });
const kkdf = ui.toggle({ label: 'KKDF + BSMV ekle (faizin %30\'u kadar)', value: true, onChange: () => rebuild() });
const minPct = ui.slider({ label: 'Asgari ödeme oranı', min: 2, max: 60, step: 1, value: 20, format: (v) => `%${fmt(v)}`, onChange: () => rebuild() });
const extraPay = ui.slider({ label: 'Her ay ek ödeme', min: 0, max: 10000, step: 250, value: 0, format: (v) => `${fmt(v)} ₺`, onChange: () => rebuild() });
ui.text('<small>Ödeme = max(asgari oran × ekstre, 100 ₺) + ek ödeme. Kartla yeni harcama yapılmadığı varsayılır.</small>');

ui.section('Sonuçlar');
const scale = ui.text('', 'card');
const st = [0, 1, 2, 3, 4, 5, 6, 7].map(() => ui.stat({ label: '' }));
const summary = ui.text('', 'card');
const chartSave = ui.chart({
  title: 'Yıl sonu değer', maxPoints: 41, format: tlShort,
  series: [{ name: 'Nominal', color: '#f5c542' }, { name: 'Reel', color: '#2dd4bf', fill: true }, { name: 'Yastık altı (reel)', color: '#9aa4b2' }],
});
const chartDebt = ui.chart({
  title: 'Borç sarmalı (yıl sonu)', maxPoints: 51, format: tlShort,
  series: [{ name: 'Kalan borç', color: '#ef4444', fill: true }, { name: 'Ödenen faiz', color: '#fb923c' }, { name: 'Ödenen anapara', color: '#8b95a5' }],
});
ui.text('<small>Kuleye tıkla: o yılın ayrıntıları. Eğitim amaçlıdır, yatırım tavsiyesi değildir.</small>');

ui.section('Görünüm', { open: false });
ui.buttons([
  { label: '🔍 Masaya yakın', onClick: () => sim.moveCamera([-0.225, 0.25, 0.585], [-0.005, 0.09, -0.03]) },
  { label: '🏙️ Teras ve şehir', onClick: () => sim.moveCamera([1.6, 0.9, 2.6], [0, 0.0, -0.6]) },
]);
ui.toggle({ label: 'Enflasyon erimesi (kırmızı kılıf)', value: true, onChange: (v) => (ghosts.visible = v) });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => { [nomLbl, realLbl, ...yearLbls].forEach((l) => (l.visible = v)); labelsOn = v; } });
let labelsOn = true;

function setStat(i, label, val, tone) {
  st[i].el.querySelector('.stat-l').textContent = label;
  st[i].set(val, tone);
  st[i].el.style.display = label ? '' : 'none';
}

function preset(o) {
  if (o.start != null) startAmt.set(o.start);
  if (o.monthly != null) monthly.set(o.monthly);
  if (o.years != null) years.set(o.years);
  if (o.rate != null) rate.set(o.rate);
  if (o.infl != null) infl.set(o.infl);
  rebuild();
  sim.toast(`Faiz %${fmt(rate.value, 1)} · enflasyon %${fmt(infl.value, 1)}`);
}

function syncMode() {
  secSave.parentElement.style.display = mode === 'birikim' ? '' : 'none';
  secDebt.parentElement.style.display = mode === 'borc' ? '' : 'none';
  chartSave.el.style.display = mode === 'birikim' ? '' : 'none';
  chartDebt.el.style.display = mode === 'borc' ? '' : 'none';
}

function updateStats() {
  const P = plan;
  scale.set(`🪙 1 jeton ≈ <b>${tl(P.coinV)}</b>`);
  drawLCD(P.kind === 'birikim' ? P.data[P.n - 1].nom : P.paidI + P.paidP);
  if (P.kind === 'birikim') {
    const L = P.data[P.n - 1], N = P.n - 1;
    const pct = (x) => `%${fmt(x * 100, 1)}`;
    const dbl = P.netR > 0 ? 72 / (P.netR * 100) : Infinity;
    setStat(0, 'Nominal son değer', tl(L.nom), 'good');
    setStat(1, 'Reel son değer', tl(L.real), L.real >= L.prin ? 'good' : 'bad');
    setStat(2, 'Toplam yatırılan', tl(L.prin));
    setStat(3, 'Net faiz kazancı', tl(L.nom - L.prin), 'good');
    setStat(4, 'Ödenen stopaj', tl(P.taxPaid), P.taxPaid > 0 ? 'warn' : '');
    setStat(5, 'Yastık altı (reel)', tl(L.pillow), L.pillow < L.prin ? 'bad' : '');
    setStat(6, '72 kuralı: 2 katına', isFinite(dbl) ? `≈ ${fmt(dbl, 1)} yıl` : 'hiç', '');
    setStat(7, 'Reel getiri / yıl', pct(P.realR), P.realR >= 0 ? 'good' : 'bad');
    const realWord = P.realR >= 0
      ? `Reel getiri pozitif: alım gücün yılda yaklaşık <b>${pct(P.realR)}</b> artıyor; 72 kuralına göre reel olarak ~${fmt(72 / Math.max(0.01, P.realR * 100), 0)} yılda ikiye katlanır.`
      : `Reel getiri <b>negatif (${pct(P.realR)})</b>: rakam büyüse de alım gücün eriyor; reel olarak ~${fmt(72 / Math.max(0.01, -P.realR * 100), 0)} yılda yarıya iner.`;
    summary.set(`${N} yılda yatırdığın <b>${tl(L.prin)}</b>, nominal <b>${tl(L.nom)}</b> oldu; bugünün parasıyla <b>${tl(L.real)}</b> ediyor.
      Yastık altında kalsaydı alım gücü <b>${tl(L.pillow)}</b> olurdu.<br>${realWord}<br><small>Net efektif faiz (vergi sonrası): ${pct(P.netR)}/yıl.</small>`);
  } else {
    const yrs = P.months / 12;
    setStat(0, 'Bitiş süresi', P.done ? (P.months < 24 ? `${P.months} ay` : `${fmt(yrs, 1)} yıl`) : '50+ yıl', P.done ? (P.months > 36 ? 'warn' : 'good') : 'bad');
    setStat(1, 'Toplam faiz', tl(P.paidI), 'bad');
    setStat(2, 'Toplam ödeme', tl(P.paidI + P.paidP));
    setStat(3, 'İlk ay ödemesi', tl(P.firstPay));
    setStat(4, 'Efektif aylık faiz', `%${fmt(P.iEff * 100, 2)}`, 'warn');
    setStat(5, 'Yıllık bileşik', `%${fmt((Math.pow(1 + P.iEff, 12) - 1) * 100, 0)}`, 'bad');
    setStat(6, '12 ayda kapatmak için', `${tl(P.pmt12)}/ay`, 'good');
    setStat(7, '', '');
    const ratio = P.paidI / debtAmt.value;
    summary.set(P.done
      ? `Bu ödeme planıyla <b>${tl(debtAmt.value)}</b> borç <b>${P.months} ayda</b> bitiyor ve <b>${tl(P.paidI)}</b> faiz ödüyorsun
         (borcun <b>%${fmt(ratio * 100, 0)}</b>'i kadar). Her ay biraz fazla ödemek süreyi ve faizi çarpıcı biçimde kısaltır.`
      : `⚠️ Ödemeler faizi karşılamıyor: 50 yıl sonra bile <b>${tl(P.endDebt)}</b> borç kalıyor. Bu bir <b>borç sarmalı</b>.
         Asgari ödeme oranını ya da ek ödemeyi artır.`);
  }
}

// Kuleye tıkla → ayrıntı
sim.onClick(() => [coins], (hit) => {
  if (hit.instanceId == null || !plan) return;
  const k = coinOwner[hit.instanceId * 2];
  const d = plan.data[k];
  selected = k;
  hilite.visible = true;
  hilite.position.x = plan.xs[k];
  if (plan.kind === 'birikim') {
    sim.toast(`<b>${k === 0 ? 'Başlangıç' : k + '. yıl sonu'}</b><br>Nominal: ${tl(d.nom)} (yatırılan ${tl(d.prin)} + faiz ${tl(d.nom - d.prin)})<br>
      Reel: ${tl(d.real)} · Yastık altı: ${tl(d.pillow)}`);
  } else {
    sim.toast(`<b>${k === 0 ? 'Başlangıç' : k + '. yıl sonu'}</b><br>Kalan borç: ${tl(d.debt)}<br>Ödenen: anapara ${tl(d.paidP)} + faiz ${tl(d.paidI)}`, d.debt > debtAmt.value ? 'bad' : '');
  }
});

sim.onReset(() => rebuild());
syncMode();
rebuild();
