// Deprem Çantası Hazırlama — sınırlı ağırlık/hacimle çanta hazırla, 72 saatlik senaryoda test et.
import { createSim, THREE, RoundedBoxGeometry, fmt, clamp, lerp } from '@core';

const sim = createSim({
  background: 0x16213a,
  camera: { position: [0, 10.5, 10], target: [0, 0, 1.1], fov: 44 },
  controls: { minDistance: 6, maxDistance: 22, maxPolarAngle: Math.PI * 0.46 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Masada bir deprem sonrası işine yarayabilecek (ve yaramayacak) eşyalar var. Her birinin <b>ağırlığı</b> ve
    <b>hacmi</b> farklı. Çantanın taşıyabileceği yük sınırlı: yetişkin için ~9 kg, çocuk için ~5 kg.</p>
    <h3>Dene</h3>
    <ul>
      <li>Eşyalara tıklayarak çantaya koy; yerindeki halkaya tıklayarak geri çıkar.</li>
      <li><b>72 saat testi</b>ni başlat: 3 gün boyunca karanlık, soğuk, yaralanma, susuzluk gibi olaylar yaşanır.
      Doğru eşyayı aldıysan sorun çözülür.</li>
      <li>Laptop ya da oyun konsolu alırsan ne olduğuna bak. Mum neden iyi bir fikir değil?</li>
      <li>"Çocuk" çantasıyla dene: 5 kg'a en önemli neleri sığdırabilirsin?</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>AFAD, her evde kolay ulaşılabilir bir <b>afet ve acil durum çantası</b> bulundurmayı önerir: su, bozulmayan
    yiyecek, düdük, el feneri, yedek pil, pilli radyo, ilk yardım malzemesi, kişisel ilaçlar, önemli belgelerin
    fotokopileri, nakit para, battaniye, mevsime uygun yedek kıyafet, hijyen malzemeleri, toz maskesi ve çakı gibi.
    Çantayı çıkışa yakın tut ve son kullanma tarihlerini düzenli (ör. 6 ayda bir) kontrol et. Sarsıntı anında
    <b>Çök-Kapan-Tutun</b>; sonrasında gaz kaçağı olabileceği için kibrit/çakmak yakma.</p>
    <p><small>Bir kişi günde en az ~2 litre içme suyuna ihtiyaç duyar; 3 günlük suyun tamamı çantaya sığmaz, evde ayrıca
    su depolanmalıdır. Ağırlıklar yaklaşık değerlerdir. Senaryo eğitim amaçlı basitleştirilmiştir.</small></p>`,
});

// --- Malzeme / geometri yardımcıları ---
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
const rbox = (w, h, d, mat, x, y, z, r = 0.04) => mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), mat, x, y ?? h / 2, z);
const cyl = (r1, r2, h, mat, x, y, z, seg = 18) => mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat, x, y, z);
const lay = (m, axis = 'z') => { m.rotation[axis] = Math.PI / 2; return m; };

// --- Eşyalar: kg, litre, önem ---
// kind: 'temel' (AFAD listesinde), 'faydali', 'gereksiz', 'tehlikeli'
const ITEMS = [
  { id: 'su1', short: 'Su', name: 'Su 1,5 L', kg: 1.55, L: 1.7, kind: 'temel', why: 'İnsan günde en az ~2 L içme suyuna ihtiyaç duyar. Susuzluk birkaç günde hayati tehlike olur.',
    build: (g) => { const m = std(0x7dd3fc, { transparent: true, opacity: 0.75, roughness: 0.15 }); g.add(cyl(0.2, 0.2, 0.85, m, 0, 0.43, 0), cyl(0.205, 0.205, 0.25, std(0x2563eb), 0, 0.45, 0), cyl(0.08, 0.08, 0.1, std(0x1d4ed8), 0, 0.9, 0)); } },
  { id: 'su2', short: 'Su (2. şişe)', name: 'Su 1,5 L (2.)', kg: 1.55, L: 1.7, kind: 'temel', why: 'İkinci şişe: 2. ve 3. günlerde de içecek suyun olur.',
    build: (g) => ITEMS[0].build(g) },
  { id: 'gida', short: 'Konserve', name: 'Konserve + bisküvi', kg: 0.9, L: 1.2, kind: 'temel', why: 'Bozulmayan, pişirmeden yenebilen yiyecekler enerjini korur.',
    build: (g) => { const t = std(0xb0b7c3, { metalness: 0.7, roughness: 0.35 }); g.add(cyl(0.17, 0.17, 0.3, t, -0.22, 0.15, 0.08), cyl(0.172, 0.172, 0.16, std(0xdc2626), -0.22, 0.15, 0.08), cyl(0.17, 0.17, 0.3, t, 0.12, 0.15, -0.1), cyl(0.172, 0.172, 0.16, std(0x16a34a), 0.12, 0.15, -0.1), rbox(0.45, 0.1, 0.22, std(0xf59e0b), 0.12, 0.05, 0.25)); } },
  { id: 'duduk', short: 'Düdük', name: 'Düdük', kg: 0.02, L: 0.02, kind: 'temel', why: 'Enkaz altında düdük sesi bağırmaktan çok daha uzağa gider ve seni yormaz.',
    build: (g) => { const o = std(0xf97316); g.add(rbox(0.36, 0.13, 0.13, o, 0, 0.065, 0, 0.05), cyl(0.09, 0.09, 0.13, o, 0.17, 0.09, 0), lay(mesh(new THREE.TorusGeometry(0.08, 0.018, 8, 16), std(0x94a3b8, { metalness: 0.8 }), -0.25, 0.07, 0), 'x')); } },
  { id: 'fener', short: 'El feneri', name: 'El feneri', kg: 0.2, L: 0.3, kind: 'temel', why: 'Elektrik kesilince karanlıkta yolunu bulmanı ve görülmeni sağlar.',
    build: (g) => { g.add(lay(cyl(0.08, 0.08, 0.55, std(0x1f2937), 0, 0.09, 0)), lay(cyl(0.14, 0.09, 0.16, std(0xfacc15), 0.33, 0.14, 0)), lay(cyl(0.12, 0.12, 0.02, std(0xfffbeb, { emissive: 0xfff2b0, emissiveIntensity: 0.6 }), 0.415, 0.14, 0))); } },
  { id: 'pil', short: 'Yedek pil', name: 'Yedek pil', kg: 0.1, L: 0.1, kind: 'temel', why: 'Fener ve radyo pilsiz kalınca işe yaramaz.',
    build: (g) => { for (let i = 0; i < 4; i++) g.add(lay(cyl(0.055, 0.055, 0.26, std(i % 2 ? 0x111827 : 0xb45309, { metalness: 0.5 }), 0, 0.055, -0.18 + i * 0.12), 'z')); } },
  { id: 'powerbank', short: 'Powerbank', name: 'Powerbank', kg: 0.3, L: 0.2, kind: 'faydali', why: 'Telefonu şarj ederek ailene ulaşmanı sağlar (şebeke çalışıyorsa).',
    build: (g) => { g.add(rbox(0.5, 0.09, 0.3, std(0x334155), 0, 0.045, 0), rbox(0.06, 0.02, 0.03, std(0x22c55e, { emissive: 0x22c55e, emissiveIntensity: 1 }), 0.15, 0.095, 0.1)); } },
  { id: 'ilkyardim', short: 'İlk yardım', name: 'İlk yardım çantası', kg: 0.5, L: 2, kind: 'temel', why: 'Kesik ve sıyrıkları temizleyip sarmak enfeksiyonu önler.',
    build: (g) => { const w = std(0xffffff); g.add(rbox(0.75, 0.34, 0.5, std(0xdc2626), 0, 0.17, 0, 0.06), rbox(0.3, 0.02, 0.09, w, 0, 0.345, 0, 0.005), rbox(0.09, 0.02, 0.3, w, 0, 0.345, 0, 0.005), rbox(0.2, 0.06, 0.05, std(0x111827), 0, 0.36, -0.2, 0.02)); } },
  { id: 'ilac', short: 'İlaçlar', name: 'Kişisel ilaçlar', kg: 0.1, L: 0.2, kind: 'temel', why: 'Düzenli kullandığın ilaçlara eczaneler kapalıyken ulaşamayabilirsin.',
    build: (g) => { const b = std(0xf97316, { transparent: true, opacity: 0.85 }); g.add(cyl(0.09, 0.09, 0.24, b, -0.12, 0.12, 0), cyl(0.095, 0.095, 0.06, std(0xffffff), -0.12, 0.26, 0), cyl(0.07, 0.07, 0.18, b, 0.1, 0.09, 0.12), cyl(0.075, 0.075, 0.05, std(0xffffff), 0.1, 0.2, 0.12), rbox(0.3, 0.03, 0.2, std(0xcbd5e1, { metalness: 0.6 }), 0.1, 0.015, -0.14, 0.01)); } },
  { id: 'battaniye', short: 'Battaniye', name: 'Battaniye', kg: 1.2, L: 6, kind: 'temel', why: 'Geceleri vücut ısısını korur; soğuk en az susuzluk kadar tehlikelidir.',
    build: (g) => { g.add(lay(cyl(0.27, 0.27, 0.95, std(0x7c3aed, { roughness: 0.95 }), 0, 0.27, 0), 'z'), lay(cyl(0.275, 0.275, 0.12, std(0xfbbf24, { roughness: 0.95 }), -0.25, 0.27, 0), 'z'), lay(cyl(0.275, 0.275, 0.12, std(0xfbbf24, { roughness: 0.95 }), 0.25, 0.27, 0), 'z')); } },
  { id: 'termal', short: 'Termal örtü', name: 'Termal battaniye', kg: 0.06, L: 0.2, kind: 'faydali', why: 'Alüminyum kaplı ince örtü: çok hafiftir, vücut ısısını geri yansıtır.',
    build: (g) => { g.add(rbox(0.42, 0.06, 0.3, std(0xe5e7eb, { metalness: 0.9, roughness: 0.2 }), 0, 0.03, 0, 0.02), rbox(0.42, 0.061, 0.08, std(0xf59e0b, { metalness: 0.8, roughness: 0.25 }), 0, 0.031, 0.06, 0.01)); } },
  { id: 'kiyafet', short: 'Kıyafet', name: 'Yedek kıyafet', kg: 0.8, L: 4, kind: 'temel', why: 'Islanan ya da kirlenen kıyafetle üşürsün; mevsime uygun yedek şart.',
    build: (g) => { g.add(rbox(0.72, 0.13, 0.52, std(0x2563eb, { roughness: 0.95 }), 0, 0.065, 0, 0.05), rbox(0.68, 0.12, 0.48, std(0x9ca3af, { roughness: 0.95 }), 0, 0.19, 0, 0.05), rbox(0.6, 0.1, 0.42, std(0x16a34a, { roughness: 0.95 }), 0, 0.3, 0, 0.04)); } },
  { id: 'nakit', short: 'Nakit', name: 'Nakit para', kg: 0.05, L: 0.05, kind: 'temel', why: 'Elektrik ve internet yokken kartlar çalışmayabilir.',
    build: (g) => { g.add(rbox(0.52, 0.06, 0.26, std(0x65a30d, { roughness: 0.9 }), 0, 0.03, 0, 0.01), rbox(0.1, 0.065, 0.27, std(0xfef3c7), 0, 0.033, 0, 0.005), cyl(0.07, 0.07, 0.02, std(0xd4a017, { metalness: 0.8, roughness: 0.3 }), 0.32, 0.01, 0.12)); } },
  { id: 'belge', short: 'Belgeler', name: 'Kimlik fotokopisi', kg: 0.05, L: 0.1, kind: 'temel', why: 'Kimlik, tapu, sağlık kaydı fotokopileri su geçirmez poşette: yardım ve kayıt işlemleri için.',
    build: (g) => { g.add(rbox(0.5, 0.025, 0.36, std(0xffffff), 0, 0.0125, 0, 0.005), rbox(0.5, 0.027, 0.07, std(0x2563eb), 0, 0.014, -0.12, 0.005), rbox(0.56, 0.05, 0.42, std(0xbae6fd, { transparent: true, opacity: 0.35, roughness: 0.1 }), 0, 0.025, 0, 0.01)); } },
  { id: 'radyo', short: 'Radyo', name: 'Pilli radyo', kg: 0.4, L: 0.8, kind: 'temel', why: 'Telefon ve internet çökse bile resmî duyuruları radyodan dinlersin.',
    build: (g) => { g.add(rbox(0.62, 0.36, 0.22, std(0x334155), 0, 0.18, 0, 0.05), lay(cyl(0.11, 0.11, 0.02, std(0x0f172a), -0.14, 0.18, 0.11), 'x'), rbox(0.2, 0.07, 0.02, std(0xfde68a, { emissive: 0xfde68a, emissiveIntensity: 0.3 }), 0.14, 0.24, 0.11, 0.01)); const a = cyl(0.012, 0.012, 0.55, std(0xcbd5e1, { metalness: 0.9 }), 0.22, 0.55, -0.05, 6); a.rotation.z = -0.35; g.add(a); } },
  { id: 'maske', short: 'Maske', name: 'Toz maskesi', kg: 0.05, L: 0.3, kind: 'temel', why: 'Yıkıntı tozu ciğerlerine zarar verir; maske solumayı kolaylaştırır.',
    build: (g) => { const s = mesh(new THREE.SphereGeometry(0.22, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf8fafc, { side: THREE.DoubleSide }), 0, 0.0, 0); s.scale.set(1, 0.7, 0.8); g.add(s, rbox(0.62, 0.02, 0.03, std(0x60a5fa), 0, 0.03, 0, 0.01)); } },
  { id: 'mendil', short: 'Mendil', name: 'Islak mendil', kg: 0.3, L: 0.5, kind: 'temel', why: 'Su kıtken elleri temizlemek hastalıkları önler.',
    build: (g) => { g.add(rbox(0.56, 0.13, 0.3, std(0x14b8a6), 0, 0.065, 0, 0.05), rbox(0.3, 0.02, 0.14, std(0xffffff), 0, 0.135, 0, 0.01)); } },
  { id: 'caki', short: 'Çakı', name: 'Çok amaçlı çakı', kg: 0.1, L: 0.05, kind: 'temel', why: 'Konserve açmak, ip ya da bez kesmek gibi işler için.',
    build: (g) => { g.add(rbox(0.36, 0.07, 0.1, std(0xdc2626), 0, 0.035, 0, 0.03)); const b = rbox(0.3, 0.02, 0.06, std(0xe2e8f0, { metalness: 0.9, roughness: 0.2 }), 0.28, 0.045, 0.01, 0.005); b.rotation.y = 0.25; g.add(b); } },
  { id: 'mum', short: 'Mum, kibrit', name: 'Mum ve kibrit', kg: 0.2, L: 0.3, kind: 'tehlikeli', why: 'Deprem sonrası gaz kaçağı olabilir: kibrit/mum yakmak yangın ve patlama riski taşır. Fener kullan!',
    build: (g) => { const w = std(0xfef9c3); g.add(cyl(0.07, 0.07, 0.4, w, -0.12, 0.2, 0), cyl(0.07, 0.07, 0.32, w, 0.05, 0.16, 0.05), rbox(0.24, 0.06, 0.16, std(0x92400e), 0.2, 0.03, -0.12, 0.01)); } },
  { id: 'laptop', short: 'Laptop', name: 'Laptop', kg: 2.0, L: 2.5, kind: 'gereksiz', why: 'Ağır ve şarjı çabuk biter; afet anında işe yaramaz, seni yorar.',
    build: (g) => { const gr = std(0x94a3b8, { metalness: 0.6, roughness: 0.35 }); g.add(rbox(0.9, 0.05, 0.6, gr, 0, 0.025, 0.08, 0.02)); const lid = new THREE.Group(); lid.position.set(0, 0.05, -0.22); lid.rotation.x = -0.35; lid.add(rbox(0.9, 0.6, 0.03, gr, 0, 0.3, 0, 0.02), mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial({ color: 0x1e3a8a }), 0, 0.3, 0.017)); g.add(lid); } },
  { id: 'konsol', short: 'Konsol', name: 'Oyun konsolu', kg: 0.6, L: 1.5, kind: 'gereksiz', why: 'Birkaç saatte şarjı biter; ağırlığını suya ayırmak daha iyi.',
    build: (g) => { g.add(rbox(0.72, 0.1, 0.34, std(0x111827), 0, 0.05, 0, 0.04), mesh(new THREE.PlaneGeometry(0.4, 0.24), new THREE.MeshBasicMaterial({ color: 0x0ea5e9 }), 0, 0.101, 0), cyl(0.04, 0.04, 0.06, std(0xef4444), -0.28, 0.12, 0), cyl(0.04, 0.04, 0.06, std(0x3b82f6), 0.28, 0.12, 0)); g.children[1].rotation.x = -Math.PI / 2; } },
  { id: 'kitap', short: 'Kitap', name: 'Kitap', kg: 0.35, L: 0.6, kind: 'faydali', why: 'Uzun bekleyişlerde moralini yüksek tutar; çocukların korkusunu azaltır.',
    build: (g) => { g.add(rbox(0.45, 0.12, 0.6, std(0x0ea5e9), 0, 0.06, 0, 0.01), rbox(0.43, 0.1, 0.58, std(0xfefce8), 0.012, 0.06, 0, 0.005)); } },
  { id: 'parfum', short: 'Parfüm', name: 'Parfüm', kg: 0.25, L: 0.3, kind: 'gereksiz', why: 'Hayatta kalmana katkısı yok; cam şişe kırılabilir.',
    build: (g) => { g.add(rbox(0.22, 0.3, 0.14, std(0xf472b6, { transparent: true, opacity: 0.8, roughness: 0.1 }), 0, 0.15, 0, 0.03), cyl(0.05, 0.05, 0.08, std(0xd4a017, { metalness: 0.9, roughness: 0.2 }), 0, 0.34, 0)); } },
];
const byId = Object.fromEntries(ITEMS.map((it) => [it.id, it]));

// --- Sahne: oda, masa, çanta ---
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), std(0x3a2f2a, { roughness: 0.95 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.6;
sim.scene.add(floor);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), std(0x334155, { roughness: 1 }));
wall.position.set(0, 7, -8);
sim.scene.add(wall);

const TABLE = { w: 12.8, d: 9.2 };
const table = new THREE.Group();
const wood = std(0x9a6b43, { roughness: 0.8 });
table.add(rbox(TABLE.w, 0.3, TABLE.d, wood, 0, -0.15, 0, 0.08));
for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) table.add(mesh(new THREE.BoxGeometry(0.3, 2.45, 0.3), std(0x7c5433), x * (TABLE.w / 2 - 0.5), -1.45, z * (TABLE.d / 2 - 0.5)));
table.position.z = 0.7;
sim.scene.add(table);

// Çanta
const BAG_POS = new THREE.Vector3(0, 0, -2.4);
const bag = new THREE.Group();
bag.position.copy(BAG_POS);
const bagMat = std(0xea580c, { roughness: 0.85 });
const bagDark = std(0x9a3412, { roughness: 0.85 });
const bagBody = new THREE.Group();
bagBody.add(rbox(2.0, 2.4, 1.2, bagMat, 0, 1.2, 0, 0.35));
bagBody.add(rbox(1.5, 1.0, 0.4, bagDark, 0, 0.75, 0.66, 0.15));
bagBody.add(rbox(2.02, 0.5, 1.22, bagDark, 0, 2.2, 0.02, 0.2));
bagBody.add(rbox(0.9, 0.08, 0.02, std(0xe5e7eb, { metalness: 0.7 }), 0, 1.15, 0.87, 0.01));
const handle = mesh(new THREE.TorusGeometry(0.28, 0.05, 8, 20, Math.PI), bagDark, 0, 2.45, 0);
bagBody.add(handle);
for (const x of [-0.55, 0.55]) bagBody.add(rbox(0.22, 2.0, 0.1, bagDark, x, 1.2, -0.65, 0.04));
// Yansıtıcı şerit (gece görünürlüğü)
bagBody.add(rbox(1.52, 0.08, 0.02, std(0xe5e7eb, { emissive: 0x555555, metalness: 0.5 }), 0, 0.98, 0.87, 0.01));
bag.add(bagBody);
sim.scene.add(bag);
const bagLabel = sim.label('', { parent: bag, position: [0, 3.25, 0], className: 'big' });

// Fener ışığı (gece, fener çantadaysa)
const torch = new THREE.PointLight(0xffe7a3, 0, 14, 1.5);
torch.position.set(BAG_POS.x - 1.2, 2.2, BAG_POS.z + 1.2);
sim.scene.add(torch);

// --- Eşyaları masaya diz ---
const COLS = 6, SX = 1.95, SZ = 1.55, X0 = -4.875, Z0 = -0.2;
const clickTargets = [];
const ringGeo = new THREE.RingGeometry(0.5, 0.56, 36);
ITEMS.forEach((it, i) => {
  const c = i % COLS, r = Math.floor(i / COLS);
  it.home = new THREE.Vector3(X0 + c * SX, 0.001, Z0 + r * SZ);
  const g = new THREE.Group();
  it.build(g);
  g.position.copy(it.home);
  g.rotation.y = (i * 0.37) % 0.5 - 0.25;
  g.traverse((o) => { if (o.isMesh) { o.userData.item = it; if (o.material.emissive) o.userData.baseEm = o.material.emissive.getHex(); } });
  sim.scene.add(g);
  it.group = g;
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(it.home).setY(0.01);
  // Tıklanabilir görünmez disk
  const hit = new THREE.Mesh(new THREE.CircleGeometry(0.58, 20), new THREE.MeshBasicMaterial({ visible: false }));
  hit.rotation.x = -Math.PI / 2;
  hit.position.copy(it.home).setY(0.02);
  hit.userData.item = it;
  sim.scene.add(ring, hit);
  it.ring = ring;
  clickTargets.push(g, hit);
  it.label = sim.label(it.short, { position: [it.home.x, 0, it.home.z + 0.62], className: 'plain' });
  it.label.el.style.fontSize = '10.5px';
  it.label.el.style.fontWeight = '600';
  it.packed = false;
  it.anim = null;
});

// --- Durum ---
const S = { phase: 'pack', cap: 9, volCap: 28, hour: 0, evIdx: 0, active: null, wait: 0, health: 100, energy: 100, moral: 100, log: [], order: [] };
const START_HOUR = 17; // deprem 17:00'de oluyor
const packedList = () => ITEMS.filter((it) => it.packed);
const has = (id) => byId[id].packed;
const totals = () => packedList().reduce((a, it) => ({ kg: a.kg + it.kg, L: a.L + it.L }), { kg: 0, L: 0 });

// --- Paketleme ---
function pack(it) {
  if (S.phase !== 'pack') { sim.toast('Test sürerken çanta değiştirilemez. ⟲ ile baştan başla.', 'warn'); return; }
  if (it.packed) return unpack(it);
  const t = totals();
  if (t.kg + it.kg > S.cap + 1e-6) {
    sim.toast(`Çok ağır! ${it.name} (${fmt(it.kg, 2)} kg) sığmıyor. Kalan: ${fmt(S.cap - t.kg, 2)} kg`, 'bad');
    shake = 0.5;
    return;
  }
  if (t.L + it.L > S.volCap + 1e-6) {
    sim.toast(`Çanta doldu! ${it.name} için yer yok (${fmt(it.L, 1)} L).`, 'bad');
    shake = 0.5;
    return;
  }
  it.packed = true;
  S.order.push(it.id);
  it.anim = { t: it.anim ? 1 - it.anim.t : 0, dir: 1 };
  it.group.visible = true;
  if (it.kind === 'gereksiz') sim.toast(`Hmm… ${it.name} gerçekten gerekli mi?`, 'warn');
  if (it.kind === 'tehlikeli') sim.toast('Dikkat: deprem sonrası gaz kaçağı olabilir, ateş yakmak tehlikeli!', 'warn');
  hideIntro();
  showInfo(it);
  refresh();
}
function unpack(it, instant = false) {
  if (!it.packed) return;
  it.packed = false;
  S.order = S.order.filter((x) => x !== it.id);
  it.group.visible = true;
  if (instant) { it.anim = null; placeHome(it); } else it.anim = { t: it.anim ? 1 - it.anim.t : 0, dir: -1 };
  refresh();
}
function placeHome(it) {
  it.group.position.copy(it.home);
  it.group.scale.setScalar(1);
  it.group.visible = true;
}

const _p = new THREE.Vector3();
const BAG_MOUTH = new THREE.Vector3(BAG_POS.x, 2.8, BAG_POS.z);
function animateItem(it, dt) {
  const a = it.anim;
  a.t = Math.min(1, a.t + dt * 1.8);
  const k = a.dir > 0 ? a.t : 1 - a.t;
  const e = k * k * (3 - 2 * k);
  _p.lerpVectors(it.home, BAG_MOUTH, e);
  _p.y += Math.sin(Math.PI * e) * 2.2;
  if (e > 0.85) _p.y -= (e - 0.85) / 0.15 * 1.2;
  it.group.position.copy(_p);
  it.group.scale.setScalar(lerp(1, 0.35, e));
  it.group.rotation.x = e * 1.5;
  if (a.t >= 1) {
    it.anim = null;
    it.group.rotation.x = 0;
    if (a.dir > 0) { it.group.visible = false; bagPop = 0.25; }
    else placeHome(it);
  }
}

// Olay sırasında eşyanın çantadan çıkıp gösterilmesi
const showing = [];
function presentItems(ids) {
  ids.forEach((id, k) => {
    const it = byId[id];
    if (!it.packed) return;
    it.group.visible = true;
    it.group.scale.setScalar(1.25);
    it.group.rotation.set(0, 0, 0);
    showing.push({ it, t: 0, x: BAG_POS.x - 2.4 - k * 1.3 });
  });
}
function clearShowing() {
  for (const s of showing) if (s.it.packed) s.it.group.visible = false;
  showing.length = 0;
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('🎒 Çantan');
const capSeg = ui.segmented({
  label: 'Çanta', value: 9,
  options: [{ value: 9, label: 'Yetişkin (9 kg)' }, { value: 5, label: 'Çocuk (5 kg)' }],
  onChange: (v) => {
    S.cap = v; S.volCap = v === 9 ? 28 : 18;
    // Sınırı aşan son eklenenleri çıkar
    while (totals().kg > S.cap + 1e-6 || totals().L > S.volCap + 1e-6) unpack(byId[S.order[S.order.length - 1]], true);
    refresh();
  },
});
const mKg = ui.meter({ label: 'Ağırlık', color: 'var(--good)' });
const mL = ui.meter({ label: 'Hacim', color: 'var(--accent)' });
const stCount = ui.stat({ label: 'Eşya sayısı' });
const stAfad = ui.stat({ label: 'AFAD temel listesi' });
const infoCard = ui.text('Bir eşyanın üzerine gel ya da tıkla: ne işe yaradığını burada gör.', 'card');
const hint = ui.toggle({ label: 'İpucu: önerilen eşyaları vurgula', value: false, onChange: () => refresh() });
ui.buttons([
  { label: '🧹 Çantayı boşalt', onClick: () => { if (S.phase !== 'pack') return; ITEMS.forEach((it) => unpack(it)); } },
  { label: '⏱ 72 saat testi', variant: 'primary', onClick: () => startTest() },
]);

ui.section('⏱ 72 saat testi');
const stPhase = ui.text('Önce çantanı hazırla, sonra testi başlat.', 'card');
const mH = ui.meter({ label: '❤️ Sağlık', color: 'var(--bad)' });
const mE = ui.meter({ label: '⚡ Enerji', color: 'var(--warn)' });
const mM = ui.meter({ label: '🙂 Moral', color: 'var(--accent)' });
const stScore = ui.stat({ label: 'Puan' });
const stSolved = ui.stat({ label: 'Çözülen olay' });
const chart = ui.chart({ title: 'Durumun (saat saat)', series: [{ name: 'Sağlık', color: '#ef4444' }, { name: 'Enerji', color: '#f59e0b' }, { name: 'Moral', color: '#38bdf8' }], maxPoints: 73, yMin: 0, yMax: 100, format: (v) => fmt(v, 0) });
const autoGo = ui.toggle({ label: 'Olaylarda otomatik devam et', value: true });

ui.section('📋 AFAD önerileriyle karşılaştır', { open: false });
const cmpCard = ui.text('', 'card');

function showInfo(it) {
  const kindTxt = { temel: '<span style="color:var(--good)">AFAD temel listesinde</span>', faydali: '<span style="color:var(--accent)">faydalı</span>', gereksiz: '<span style="color:var(--warn)">gereksiz</span>', tehlikeli: '<span style="color:var(--bad)">tehlikeli olabilir</span>' }[it.kind];
  infoCard.set(`<b>${it.name}</b> · ${fmt(it.kg, 2)} kg · ${fmt(it.L, 1)} L · ${kindTxt}<br>${it.why}`);
}

function refresh() {
  const t = totals();
  const f = t.kg / S.cap;
  mKg.set(f, `${fmt(t.kg, 2)} / ${S.cap} kg`);
  mKg.color(f > 0.95 ? 'var(--bad)' : f > 0.8 ? 'var(--warn)' : 'var(--good)');
  mL.set(t.L / S.volCap, `${fmt(t.L, 1)} / ${S.volCap} L`);
  stCount.set(packedList().length);
  const temel = ITEMS.filter((it) => it.kind === 'temel');
  const got = temel.filter((it) => it.packed).length;
  stAfad.set(`${got}/${temel.length}`, got === temel.length ? 'good' : got > temel.length / 2 ? 'warn' : 'bad');
  bagLabel.setText(`🎒 ${fmt(t.kg, 1)} / ${S.cap} kg`);
  bagLabel.el.style.color = f > 0.95 ? '#fca5a5' : '#e5ecf6';
  for (const it of ITEMS) {
    it.label.setText(it.packed ? `✓ ${it.short}` : it.short);
    it.label.el.style.color = it.packed ? '#86efac' : '#e2e8f0';
    const rec = hint.value && (it.kind === 'temel');
    it.ring.material.color.setHex(it.packed ? 0x22c55e : rec ? 0xfacc15 : 0x94a3b8);
    it.ring.material.opacity = it.packed ? 0.8 : rec ? 0.9 : 0.25;
  }
  const want = bagBodyScale();
  bagTarget = want;
  cmpCard.set(compareHtml());
}
let bagTarget = 1, bagScale = 1, bagPop = 0, shake = 0;
const bagBodyScale = () => 0.82 + 0.3 * clamp(totals().L / S.volCap, 0, 1);

function compareHtml() {
  const rows = ITEMS.filter((it) => it.kind === 'temel' && it.id !== 'su2').map((it) => {
    const ok = it.id === 'su1' ? has('su1') || has('su2') : it.id === 'battaniye' ? has('battaniye') || has('termal') : it.packed;
    return `<div>${ok ? '✅' : '❌'} ${it.id === 'su1' ? 'Su' : it.id === 'battaniye' ? 'Battaniye / termal battaniye' : it.name}</div>`;
  }).join('');
  const bad = packedList().filter((it) => it.kind === 'gereksiz' || it.kind === 'tehlikeli');
  return `<b>AFAD'ın önerdiği temel malzemeler (özet)</b>${rows}` +
    (bad.length ? `<div style="margin-top:6px;color:var(--warn)">Gereksiz/riskli: ${bad.map((b) => `${b.name} (${fmt(b.kg, 2)} kg)`).join(', ')}</div>` : '');
}

// --- 72 saat senaryosu ---
// h: depremden sonraki saat; w: önem; run(): {ok: 1 | 0,5 | 0, msg, show:[id], d:{h,e,m}}
const EVENTS = [
  { h: 0, title: 'Deprem!', w: 3, run: () => has('duduk')
    ? { ok: 1, msg: 'Çök-Kapan-Tutun yaptın. Çıkış kapandı ama <b>düdüğün</b> sesiyle kurtarma ekibi yerini hemen buldu.', show: ['duduk'] }
    : { ok: 0, msg: 'Çök-Kapan-Tutun yaptın ama çıkış kapandı. Düdüğün yok; saatlerce bağırmak seni yordu ve toz yuttun.', d: { e: -25, h: -5 } } },
  { h: 0.6, title: 'Toz bulutu', w: 2, run: () => has('maske')
    ? { ok: 1, msg: '<b>Toz maskesi</b> sayesinde rahat nefes aldın.', show: ['maske'] }
    : { ok: 0, msg: 'Etraf yıkıntı tozuyla dolu. Maske olmadan öksürük krizine girdin.', d: { h: -10 } } },
  { h: 1.5, title: 'Küçük bir yara', w: 3, run: () => has('ilkyardim')
    ? { ok: 1, msg: 'Kolunda bir kesik var. <b>İlk yardım çantası</b>yla temizleyip sardın.', show: ['ilkyardim'] }
    : { ok: 0, msg: 'Kolundaki kesiği temizleyecek bir şey yok; yara iltihaplanma riski taşıyor.', d: { h: -18, m: -5 } } },
  { h: 3, title: 'Gece çöktü', w: 3, run: () => has('fener')
    ? { ok: 1, msg: 'Elektrik yok, zifiri karanlık. <b>El feneri</b>yle yolunu buldun.', show: ['fener'] }
    : has('mum') ? { ok: 0, msg: 'Mum yakmak istedin ama <b>gaz kaçağı</b> olabilir! Ateş yakmak çok tehlikeli; karanlıkta kaldın.', show: ['mum'], d: { h: -8, m: -10 } }
      : { ok: 0, msg: 'Zifiri karanlık. Fenerin yok; bir yere çarptın ve çok korktun.', d: { h: -8, m: -12 } } },
  { h: 5, title: 'Susadın', w: 3, run: () => has('su1') || has('su2')
    ? { ok: 1, msg: '<b>Suyun</b> var. İdareli içtin.', show: [has('su1') ? 'su1' : 'su2'] }
    : { ok: 0, msg: 'İçecek su yok! Susuzluk hızla güçsüz düşürür.', d: { h: -20, e: -15 } } },
  { h: 6, title: 'Haber lazım', w: 2, run: () => has('radyo')
    ? { ok: 1, msg: '<b>Pilli radyo</b>dan toplanma alanlarını ve yardım noktalarını öğrendin.', show: ['radyo'] }
    : { ok: 0, msg: 'İnternet ve telefon çalışmıyor; nereye gideceğini bilmiyorsun.', d: { m: -15 } } },
  { h: 9, title: 'Soğuk gece', w: 3, run: () => {
    if (has('battaniye') || has('termal')) return { ok: 1, msg: `Hava 5 °C'ye düştü. ${has('battaniye') ? '<b>Battaniye</b>' : '<b>Termal battaniye</b>'} seni sıcak tuttu.`, show: [has('battaniye') ? 'battaniye' : 'termal'] };
    if (has('kiyafet')) return { ok: 0.5, msg: 'Hava 5 °C\'ye düştü. <b>Yedek kıyafet</b>lerini üst üste giydin, yine de üşüdün.', show: ['kiyafet'], d: { h: -8, e: -8 } };
    return { ok: 0, msg: 'Hava 5 °C\'ye düştü. Örtün yok; titreyerek uyuyamadın.', d: { h: -15, e: -20, m: -10 } };
  } },
  { h: 14, title: 'İlaç saati', w: 2, run: () => has('ilac')
    ? { ok: 1, msg: 'Düzenli ilacını <b>çantandan</b> aldın. Eczaneler kapalıydı!', show: ['ilac'] }
    : { ok: 0, msg: 'Düzenli ilacın evde kaldı ve eczaneler kapalı.', d: { h: -15 } } },
  { h: 17, title: 'Acıktın', w: 3, run: () => has('gida')
    ? { ok: 1, msg: '<b>Konserve ve bisküvi</b> enerjini geri getirdi.', show: ['gida'] }
    : { ok: 0, msg: 'Bütün gün bir şey yemedin; enerjin çok düştü.', d: { e: -25, m: -5 } } },
  { h: 20, title: 'Ailene ulaş', w: 2, run: () => has('powerbank')
    ? { ok: 1, msg: 'Şebeke kısa süre geri geldi; telefonu <b>powerbank</b>le şarj edip ailene "iyiyim" dedin.', show: ['powerbank'] }
    : { ok: 0, msg: 'Şebeke geldi ama telefonun kapalı; ailene haber veremedin.', d: { m: -18 } } },
  { h: 23, title: 'Temizlik', w: 1, run: () => has('mendil')
    ? { ok: 1, msg: 'Su kıt. <b>Islak mendil</b>le ellerini temizledin.', show: ['mendil'] }
    : { ok: 0, msg: 'Ellerini yıkayacak su yok; mide rahatsızlığı başladı.', d: { h: -8 } } },
  { h: 27, title: 'Bir şey kesmen lazım', w: 1, run: () => has('caki')
    ? { ok: 1, msg: 'Branda ipini ve konserve kapağını <b>çakı</b>yla açtın.', show: ['caki'] }
    : { ok: 0, msg: 'Branda ipini kesemedin; sığınağın yarım kaldı.', d: { e: -8 } } },
  { h: 30, title: '2. gün suyu', w: 3, run: () => {
    const n = (has('su1') ? 1 : 0) + (has('su2') ? 1 : 0);
    if (n === 2) return { ok: 1, msg: '<b>İkinci şişe suyun</b> sayesinde 2. ve 3. günü rahat geçirdin.', show: ['su2'] };
    if (n === 1) return { ok: 0.5, msg: 'Tek şişe su hızla bitti; dağıtım noktasına ulaşana kadar susuz kaldın.', d: { h: -10, e: -10 } };
    return { ok: 0, msg: 'Hâlâ suyun yok. Bu çok tehlikeli!', d: { h: -20, e: -15 } };
  } },
  { h: 35, title: 'Yağmur yağdı', w: 2, run: () => has('kiyafet')
    ? { ok: 1, msg: 'Sırılsıklam oldun ama <b>yedek kıyafet</b>lerini giydin.', show: ['kiyafet'] }
    : { ok: 0, msg: 'Islak kıyafetle kaldın; üşüdün ve hastalandın.', d: { h: -12, m: -8 } } },
  { h: 40, title: 'Yardım kaydı', w: 1, run: () => has('belge')
    ? { ok: 1, msg: 'Çadır kaydı için <b>kimlik fotokopin</b> hazırdı.', show: ['belge'] }
    : { ok: 0, msg: 'Kimliğin enkazda kaldı; kayıt işlemleri uzadı.', d: { m: -8 } } },
  { h: 45, title: 'Bakkal açık', w: 1, run: () => has('nakit')
    ? { ok: 1, msg: 'Kart çalışmıyordu; <b>nakit paranla</b> ekmek aldın.', show: ['nakit'] }
    : { ok: 0, msg: 'POS cihazı çalışmıyor, nakit yok; alışveriş yapamadın.', d: { e: -5, m: -5 } } },
  { h: 51, title: 'Fener zayıfladı', w: 1, run: () => !has('fener')
    ? { ok: 0, msg: 'Üçüncü gece de karanlıkta geçti.', d: { m: -8 } }
    : has('pil') ? { ok: 1, msg: 'Fenerin söndü; <b>yedek pil</b>i taktın.', show: ['pil', 'fener'] }
      : { ok: 0.5, msg: 'Fenerin pili bitti ve yedeğin yok.', show: ['fener'], d: { m: -6 } } },
  { h: 58, title: 'Uzun bekleyiş', w: 1, run: () => has('kitap')
    ? { ok: 1, msg: 'Çadırda saatler geçmiyor. <b>Kitabını</b> okudun, çocuklara masal anlattın.', show: ['kitap'], d: { m: 10 } }
    : has('konsol') ? { ok: 0.5, msg: '<b>Oyun konsolu</b>nun şarjı çoktan bitmişti. Sohbet edip oyun uydurdunuz.', show: ['konsol'], d: { m: -3 } }
      : { ok: 0.5, msg: 'Zaman geçmiyor; komşularla sohbet ederek moral buldun.', d: { m: -3 } } },
  { h: 64, title: 'Toplanma alanına yürüyüş', w: 2, run: () => {
    const junk = packedList().filter((it) => it.kind === 'gereksiz' || it.kind === 'tehlikeli');
    const kg = junk.reduce((a, it) => a + it.kg, 0);
    if (kg >= 0.5) return { ok: 0, msg: `3 km yürüdün. Çantandaki gereksiz yük (${junk.map((j) => j.name).join(', ')}: ${fmt(kg, 2)} kg) seni çok yordu.`, show: junk.map((j) => j.id).slice(0, 3), d: { e: -8 - kg * 8 } };
    return { ok: 1, msg: '3 km yürüdün. Çantan gereksiz yük taşımadığı için rahat yürüdün.' };
  } },
  { h: 72, title: '72 saat doldu', w: 0, run: () => ({ ok: 1, msg: 'Yardım ekipleri bölgene ulaştı. Tebrikler, 3 günü atlattın!' }) },
];
const MAX_W = EVENTS.reduce((a, e) => a + e.w, 0);
let earned = 0, solved = 0;

function startTest() {
  if (S.phase === 'test') return;
  if (S.phase === 'done') softReset(false);
  ITEMS.forEach((it) => { if (it.anim) { it.anim.t = 1; animateItem(it, 0); } });
  S.phase = 'test';
  S.hour = 0; S.evIdx = 0; S.active = null;
  S.health = S.energy = S.moral = 100;
  earned = 0; solved = 0;
  chart.clear();
  pushChart();
  if (!packedList().length) sim.toast('Çantan boş! Bakalım ne olacak…', 'warn');
  sim.moveCamera([0, 8.2, 7.6], [0, 1, -0.6]);
  sim.play();
  refreshTest();
}

function pushChart() { chart.push([S.health, S.energy, S.moral]); }

function resolveEvent(ev) {
  const r = ev.run();
  const d = r.d || {};
  S.health = clamp(S.health + (d.h || 0), 0, 100);
  S.energy = clamp(S.energy + (d.e || 0), 0, 100);
  S.moral = clamp(S.moral + (d.m || 0), 0, 100);
  earned += ev.w * r.ok;
  if (ev.w && r.ok >= 1) solved++;
  S.log.push({ title: ev.title, ok: r.ok });
  clearShowing();
  if (r.show) presentItems(r.show);
  const tone = r.ok >= 1 ? 'good' : r.ok > 0 ? 'warn' : 'bad';
  const icon = r.ok >= 1 ? '✅' : r.ok > 0 ? '⚠️' : '❌';
  S.active = ev;
  S.wait = 4.5;
  if (ev.w === 0) return finish();
  sim.hud.show(`<h2>${icon} ${clockText(S.hour)} · ${ev.title}</h2><div>${r.msg}</div><button class="btn primary" data-go>Devam ▶</button>`, { tone });
  sim.hud.el.querySelector('[data-go]').onclick = () => { S.wait = 0; };
  refreshTest();
}

function finish() {
  S.phase = 'done';
  const score = Math.round(100 * (0.7 * earned / MAX_W + 0.3 * (S.health + S.energy + S.moral) / 300));
  const stars = score >= 85 ? 3 : score >= 60 ? 2 : score >= 35 ? 1 : 0;
  const missing = ITEMS.filter((it) => it.kind === 'temel' && !it.packed && !(it.id === 'battaniye' && has('termal')));
  const junk = packedList().filter((it) => it.kind === 'gereksiz' || it.kind === 'tehlikeli');
  const verdict = score >= 85 ? 'Harika bir çanta! Gerçek hayatta da hazırsın.' : score >= 60 ? 'İyi iş! Birkaç eksikle daha da hazır olabilirsin.' : score >= 35 ? 'Fena değil ama önemli eksiklerin var.' : 'Çantan seni 3 gün taşıyamadı. Tekrar dene!';
  sim.hud.show(`<h2>${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} Puanın: ${score}/100</h2>
    <div>${verdict}</div>
    ${missing.length ? `<div style="margin-top:6px;font-size:13px">Eksik: ${missing.map((m) => m.name).join(', ')}</div>` : ''}
    ${junk.length ? `<div style="font-size:13px;color:var(--warn)">Gereksiz/riskli: ${junk.map((m) => m.name).join(', ')}</div>` : ''}
    <button class="btn primary" data-again>🔁 Tekrar oyna</button>`, { tone: stars >= 2 ? 'good' : stars ? 'warn' : 'bad' });
  sim.hud.el.querySelector('[data-again]').onclick = () => sim.reset();
  stScore.set(score, stars >= 2 ? 'good' : stars ? 'warn' : 'bad');
  stPhase.set(`<b>Test bitti.</b> ${verdict} AFAD karşılaştırması aşağıda.`);
  cmpCard.el.closest('details').open = true;
  S.active = null;
}

function clockText(h) {
  const abs = START_HOUR + h;
  const day = Math.floor(abs / 24) + 1;
  const hh = Math.floor(abs % 24), mm = Math.floor((abs % 1) * 60);
  return `Gün ${day} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
sim.formatTime = () => (S.phase === 'pack' ? 'Hazırlık' : clockText(S.hour));

function refreshTest() {
  mH.set(S.health / 100, fmt(S.health, 0));
  mE.set(S.energy / 100, fmt(S.energy, 0));
  mM.set(S.moral / 100, fmt(S.moral, 0));
  const played = EVENTS.slice(0, S.evIdx).filter((e) => e.w).length;
  stSolved.set(`${solved}/${played}`);
  if (S.phase === 'test') {
    stScore.set(Math.round((100 * earned) / MAX_W));
    const next = EVENTS[S.evIdx];
    stPhase.set(`<b>${clockText(S.hour)}</b> — ${next ? `Sıradaki: ${next.title.toLowerCase()}…` : ''}`);
  }
}

const HOURS_PER_SEC = 1.6; // 1× hızda 1 gerçek saniye = 1,6 senaryo saati
sim.onUpdate((dt) => {
  if (S.phase !== 'test') return;
  if (S.active) {
    // Olay mesajı gerçek zamanla okunur (hız çarpanından bağımsız)
    if (autoGo.value || S.wait <= 0) S.wait -= dt / Math.max(sim.speed, 1e-3);
    if (S.wait <= 0) { S.active = null; sim.hud.hide(); clearShowing(); }
    return;
  }
  const next = EVENTS[S.evIdx];
  if (!next) return;
  const before = S.hour;
  S.hour = Math.min(next.h, S.hour + dt * HOURS_PER_SEC);
  // Enerji zamanla azalır (yorgunluk), her saat grafiğe nokta
  S.energy = clamp(S.energy - (S.hour - before) * 0.15, 0, 100);
  if (Math.floor(S.hour) !== Math.floor(before)) pushChart();
  if (S.hour >= next.h) { S.evIdx++; resolveEvent(next); }
  refreshTest();
});

// --- Gündüz / gece ışığı ---
const skyDay = new THREE.Color(0x3b5b86), skyNight = new THREE.Color(0x05070f), skyPack = new THREE.Color(0x16213a);
const bgc = new THREE.Color();
function daylight(h) {
  const hr = (START_HOUR + h) % 24;
  // 6–8 arası şafak, 18–20 arası alacakaranlık
  return clamp(Math.min((hr - 5.5) / 2, (20 - hr) / 2), 0, 1);
}

// --- Döngü: animasyonlar ---
let tAcc = 0;
sim.onRender((dt) => {
  tAcc += dt;
  for (const it of ITEMS) if (it.anim) animateItem(it, dt);
  // Çanta şişer, sallanır
  bagScale += (bagTarget - bagScale) * Math.min(1, dt * 6);
  bagPop = Math.max(0, bagPop - dt);
  shake = Math.max(0, shake - dt);
  const pop = Math.sin(bagPop * 25) * bagPop * 0.25;
  bagBody.scale.set(1 + pop * 0.5, 1 + pop, bagScale + pop);
  bag.rotation.z = Math.sin(shake * 40) * shake * 0.12;
  // Olayda gösterilen eşyalar çantanın önünde döner
  for (const s of showing) {
    s.t += dt;
    s.it.group.position.set(s.x, 1.6 + Math.sin(s.t * 3) * 0.15, BAG_POS.z + 0.8);
    s.it.group.rotation.y += dt * 1.5;
  }
  // Işık
  const sun = sim.scene.userData.sun, hemi = sim.scene.userData.hemi;
  const dl = S.phase === 'pack' ? -1 : daylight(S.hour);
  if (dl < 0) {
    bgc.copy(skyPack); hemi.intensity = 1.4; sun.intensity = 2.2; torch.intensity = 0;
  } else {
    bgc.copy(skyNight).lerp(skyDay, dl);
    hemi.intensity = lerp(0.25, 1.4, dl);
    sun.intensity = lerp(0.12, 2.2, dl);
    torch.intensity = has('fener') && S.health > 0 ? lerp(18, 0, dl) * (0.9 + 0.1 * Math.sin(tAcc * 7)) : 0;
  }
  sim.scene.background.copy(bgc);
});

// --- Tıklama ve üzerine gelme ---
sim.onClick(clickTargets, (hit) => {
  const it = hit.object.userData.item;
  if (it) pack(it);
});
let hovered = null, lastMove = 0;
function setHover(it) {
  if (hovered === it) return;
  const paint = (x, on) => x && x.group.traverse((o) => { if (o.isMesh && o.material.emissive) o.material.emissive.setHex(on ? 0x3b3b1a : o.userData.baseEm ?? 0); });
  paint(hovered, false);
  hovered = it;
  paint(hovered, true);
  sim.dom.style.cursor = it ? 'pointer' : '';
  if (it) showInfo(it);
}
sim.dom.addEventListener('pointermove', (e) => {
  const now = performance.now();
  if (now - lastMove < 60) return;
  lastMove = now;
  const hits = sim.raycast(e, clickTargets);
  const it = hits.length ? hits[0].object.userData.item : null;
  setHover(it && !it.anim ? it : null);
});

// --- Giriş ve sıfırlama ---
let introShown = false;
function intro() {
  introShown = true;
  sim.hud.show(`<h2>🎒 Deprem çantanı hazırla!</h2><div>Masadaki eşyalara tıkla, çantaya koy. Ama dikkat: çanta en fazla
    <b>${S.cap} kg</b> taşıyabilir. Hazır olunca <b>72 saat testi</b>ne başla.</div><button class="btn primary" data-ok>Başla</button>`);
  sim.hud.el.querySelector('[data-ok]').onclick = () => hideIntro();
}
function hideIntro() { if (introShown) { introShown = false; sim.hud.hide(); } }

function softReset(keepBag = true) {
  S.phase = 'pack'; S.hour = 0; S.evIdx = 0; S.active = null; S.log = [];
  S.health = S.energy = S.moral = 100;
  earned = 0; solved = 0;
  clearShowing();
  if (!keepBag) ITEMS.forEach((it) => { if (it.packed) { it.group.visible = false; } });
  chart.clear();
  stScore.set('—'); stSolved.set('—');
  stPhase.set('Önce çantanı hazırla, sonra testi başlat.');
  refreshTest();
}

sim.onReset(() => {
  softReset();
  ITEMS.forEach((it) => unpack(it, true));
  ITEMS.forEach(placeHome);
  sim.hud.hide();
  sim.moveCamera([0, 10.5, 10], [0, 0, 1.1]);
  refresh();
  intro();
});

refresh();
refreshTest();
intro();
