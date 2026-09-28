// Karbon Ayak İzi Evi — kesit görünümlü evde her tercih yıllık CO₂e (kişi başı) hesabını ve evin görünümünü değiştirir.
import { createSim, THREE, fmt, clamp, lerp, rand, seeded } from '@core';
import { makePlot } from './plot.js';

// Yaklaşık emisyon katsayıları (kg CO₂e) — eğitim amaçlı yuvarlanmış değerler
const K = {
  grid: 0.45,          // şebeke elektriği, kg/kWh (Türkiye civarı)
  gas: 0.2 / 0.9,      // doğalgaz kombi, kg/kWh ısı (%90 verim)
  coal: 0.34 / 0.6,    // kömür sobası, kg/kWh ısı (%60 verim)
  heatPumpCOP: 3,      // ısı pompası: 1 kWh elektrikle ~3 kWh ısı
  heatDemand: 3300,    // kişi başı yıllık ısı ihtiyacı, kWh (orta yalıtım, 3 kişilik ev)
  car: 0.17, ev: 0.08, bus: 0.05, bike: 0,   // kg/km (kişi başı)
  treeKg: 20,          // bir ağacın yılda bağladığı CO₂ (yaklaşık)
  flight: 0.3,         // gidiş-dönüş kısa/orta mesafe uçuş (~2.000 km × ~0,15 kg/km), t
};
const PEOPLE = 3;
const INSUL = [1.4, 1, 0.6];
const WASH_KWH = { 30: 0.5, 40: 0.8, 60: 1.3, 90: 2.2 };
const TARGET = 2, TR_AVG = 6.6;
const CATS = [
  { key: 'heat', name: 'Isınma', color: '#f97316' },
  { key: 'elec', name: 'Elektrik', color: '#facc15' },
  { key: 'food', name: 'Beslenme', color: '#22c55e' },
  { key: 'trans', name: 'Ulaşım', color: '#38bdf8' },
  { key: 'fly', name: 'Uçuşlar', color: '#f472b6' },
  { key: 'other', name: 'Tüketim ve atık', color: '#a78bfa' },
];

const sim = createSim({
  background: 0x9ccbf0,
  camera: { position: [2, 12, 30], target: [-0.5, 6.8, 0], fov: 50 },
  controls: { minDistance: 10, maxDistance: 60, maxPolarAngle: Math.PI * 0.47 },
  fog: [45, 110],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Önü açık (kesit) bir ev: salon, mutfak, yatak odası ve çamaşır odası, yanında garaj. Paneldeki her tercih evde
    görünür bir şeyi değiştirir ve <b>yıllık karbon ayak izini</b> (kişi başı, ton CO₂e) yeniden hesaplar.
    Evin üstündeki <b>CO₂ bulutu</b> toplam salımla büyür, arka plandaki orman da bu salımı bir yılda bağlamak için
    gereken ağaç sayısını gösterir (her simge 10 ağaç).</p>
    <h3>Dene</h3>
    <ul>
      <li>Önce <b>yalıtımı</b> iyileştir: duvarlardan kaçan turuncu ısı parçacıkları azalır, ısınma payı düşer.</li>
      <li>Kömür sobasını <b>ısı pompasına</b> çevir; sonra çatıya <b>güneş paneli</b> ekle.</li>
      <li>Arabayı bırakıp <b>bisiklete</b> geç, haftadaki et günlerini azalt. Hangisi daha çok fark yaratıyor?</li>
      <li>"🌍 Yeşil ev" hazır ayarıyla 1,5 °C hedefine (~2 t) ne kadar yaklaşabildiğine bak.</li>
    </ul>
    <h3>Model</h3>
    <p>Hesap, 3 kişilik bir evde <b>kişi başı</b> paydır. Katsayılar <b>yaklaşıktır</b>: şebeke elektriği ≈ 0,45 kg/kWh,
    doğalgaz ≈ 0,2 kg/kWh, kömür ≈ 0,34 kg/kWh, benzinli araba ≈ 0,17 kg/km, toplu taşıma ≈ 0,05 kg/km (kişi başı),
    ısı pompası ≈ 3 kat verim (COP), 3 kW güneş paneli ≈ 4.000 kWh/yıl, bir ağaç yılda ≈ 20 kg CO₂.
    bir gidiş-dönüş uçuş (~2.000 km) ≈ 0,3 t. Türkiye'nin toplam sera gazı salımı kişi başı yaklaşık 6,6 t CO₂e'dir
    (TÜİK, 2022; sanayi dâhil); 1,5 °C hedefiyle uyumlu yaşam tarzı için kişi başı ~2 t civarına inmek gerekir.
    Kıyafet ve eşya alışverişi "Tüketim" kaleminde kaba bir sabit olarak tutulmuştur.</p>
    <p><small>Gerçek değerler iklime, evin büyüklüğüne, elektrik karışımına ve alışkanlıklara göre değişir.</small></p>`,
});
const scene = sim.scene;
scene.userData.sun.position.set(10, 18, 12);

// --- Yardımcılar ---
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
const house = new THREE.Group();
scene.add(house);
function box(w, h, d, m, x, y, z, parent = house) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function cyl(rt, rb, h, m, x, y, z, parent = house, seg = 20) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
const clickables = [];
function info(obj, text) { obj.userData.info = text; clickables.push(obj); return obj; }

// --- Zemin, yol ---
{
  const g = new THREE.Mesh(new THREE.CircleGeometry(70, 48), mat(0x5b8c2a, { roughness: 1 }));
  g.rotation.x = -Math.PI / 2;
  scene.add(g);
  box(60, 0.06, 3.4, mat(0x3f444d), 0, 0.03, 9, scene);
  for (let x = -28; x < 30; x += 3) box(1.4, 0.07, 0.14, mat(0xf8fafc), x, 0.04, 9, scene);
  box(4.4, 0.05, 4, mat(0x9ca3af), 6.7, 0.03, 5.3, scene); // garaj yolu
  box(1.2, 0.05, 4, mat(0xb8a58a), -1.5, 0.03, 5.3, scene); // giriş yolu
}

// --- Ev gövdesi ---
const wallM = mat(0xf1e4cf), innerM = mat(0xe7dcc8), floorM = mat(0xb07a4a), tileM = mat(0xcbd5e1);
box(10.6, 0.3, 7.6, mat(0x9ca3af), -1, -0.1, 0);
box(10, 0.05, 7, floorM, -1, 0.07, 0);
box(10, 0.22, 7, innerM, -1, 3.05, 0);
box(4.9, 0.05, 6.9, floorM, -3.5, 3.18, 0);
box(4.9, 0.05, 6.9, tileM, 1.5, 3.18, 0);
box(10, 0.2, 7, innerM, -1, 6.05, 0);
const backWall = box(10, 6.2, 0.3, wallM, -1, 3, -3.5);
const leftWall = box(0.3, 6.2, 7, wallM, -6, 3, 0);
const rightWall = box(0.3, 6.2, 7, wallM, 4, 3, 0);
box(0.15, 6, 6.6, innerM, -1, 3, -0.2);
// Yalıtım katmanı (dış cephe + çatı arası), kalınlığı ayarla değişir
const insM = mat(0xfacc15, { roughness: 0.95 });
const insul = new THREE.Group();
house.add(insul);
const insBack = box(10.6, 6.2, 1, insM, -1, 3, -3.65, insul);
const insLeft = box(1, 6.2, 7.3, insM, -6.15, 3, 0, insul);
const insRight = box(1, 6.2, 7.3, insM, 4.15, 3, 0, insul);
const insTop = box(10.3, 1, 7.3, insM, -1, 6.15, 0, insul);
info(backWall, '🧱 <b>Duvarlar ve yalıtım:</b> Yalıtım (mantolama, çift cam) ısı kaybını azaltır; aynı konfor için daha az yakıt.');
// Pencereler (arka duvar)
const glassM = mat(0x93c5fd, { emissive: 0x3b6ea8, emissiveIntensity: 0.5, roughness: 0.2 });
const frameM = mat(0xffffff);
const frames = new THREE.Group();
house.add(frames);
for (const [x, y] of [[-3.5, 1.7], [1.5, 1.9], [-3.5, 4.7], [2.8, 4.8]]) {
  box(1.6, 1.1, 0.05, glassM, x, y, -3.33);
  box(1.8, 0.12, 0.12, frameM, x, y + 0.6, -3.3, frames);
  box(1.8, 0.12, 0.12, frameM, x, y - 0.6, -3.3, frames);
  box(0.12, 1.3, 0.12, frameM, x - 0.85, y, -3.3, frames);
  box(0.12, 1.3, 0.12, frameM, x + 0.85, y, -3.3, frames);
  box(0.08, 1.2, 0.1, frameM, x, y, -3.28, frames);
}
// Çatı
const roofM = mat(0xb45309, { roughness: 0.7 });
const slope = Math.atan2(2.8, 4);
const roofF = box(10.8, 0.22, 4.95, roofM, -1, 7.45, 2);
roofF.rotation.x = slope;
const roofB = box(10.8, 0.22, 4.95, roofM, -1, 7.45, -2);
roofB.rotation.x = -slope;
{
  const sh = new THREE.Shape([new THREE.Vector2(-3.8, 0), new THREE.Vector2(3.8, 0), new THREE.Vector2(0, 2.7)]);
  for (const x of [-6, 4]) {
    const tri = new THREE.Mesh(new THREE.ShapeGeometry(sh), mat(0xe9d8bd, { side: THREE.DoubleSide }));
    tri.rotation.y = Math.PI / 2;
    tri.position.set(x, 6.15, 0);
    house.add(tri);
  }
}
const chimney = box(0.7, 2.6, 0.7, mat(0x7c2d12), -4.2, 8.2, -1.6);
// Güneş panelleri (ön çatı)
const solar = new THREE.Group();
{
  const pm = mat(0x1e3a8a, { roughness: 0.25, metalness: 0.4, emissive: 0x0b1a44 });
  for (let i = 0; i < 5; i++) for (let j = 0; j < 2; j++) {
    const p = box(1.55, 0.06, 1.7, pm, -4.6 + i * 1.75, 0, 0, solar);
    p.position.set(-4.6 + i * 1.75, 0.16, -0.9 + j * 1.85);
  }
  solar.position.set(-1, 7.45, 2);
  solar.rotation.x = slope;
  house.add(solar);
  info(solar.children[0], '☀️ <b>Güneş paneli:</b> 3 kW panel Türkiye güneşinde yılda yaklaşık 4.000 kWh üretir; şebekeden çekilen elektriği azaltır.');
}

// --- Oda etiketleri ---
[['Salon', -4.9, 2.6], ['Mutfak', 3.0, 2.6], ['Yatak odası', -4.6, 5.6], ['Banyo', 3.2, 5.6], ['Garaj', 6.7, 2.6]]
  .forEach(([t, x, y]) => sim.label(t, { position: [x, y, 3.4], className: 'plain' }));

// --- Isınma cihazları ---
const radM = mat(0xf8fafc, { roughness: 0.4 });
const radiators = new THREE.Group();
house.add(radiators);
for (const [x, y] of [[-3.5, 0.55], [1.5, 0.65], [-3.5, 3.6], [2.8, 3.6]]) {
  for (let k = 0; k < 7; k++) box(0.12, 0.7, 0.14, radM, x - 0.6 + k * 0.2, y, -3.22, radiators);
}
const kombi = new THREE.Group();
box(0.7, 0.9, 0.35, mat(0xffffff, { roughness: 0.35 }), 0, 0, 0, kombi);
const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 10), new THREE.MeshBasicMaterial({ color: 0x3b82f6 }));
flame.position.set(0, -0.2, 0.19);
kombi.add(flame);
kombi.position.set(-0.3, 2.2, -3.15);
house.add(kombi);
info(kombi.children[0], '🔥 <b>Doğalgaz kombi:</b> Yoğuşmalı kombiler verimlidir ama yine de fosil yakıt yakar (≈0,2 kg CO₂/kWh).');
const stove = new THREE.Group();
cyl(0.45, 0.5, 1.2, mat(0x1f2937, { metalness: 0.5, roughness: 0.5 }), 0, 0.6, 0, stove);
cyl(0.1, 0.1, 1.9, mat(0x374151, { metalness: 0.6 }), 0, 2.1, 0, stove);
const coalGlow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.05), new THREE.MeshBasicMaterial({ color: 0xff6a00 }));
coalGlow.position.set(0, 0.45, 0.47);
stove.add(coalGlow);
stove.position.set(-1.9, 0, -2.3);
house.add(stove);
info(stove.children[0], '⚫ <b>Kömür sobası:</b> Verimi düşük, yanması kirli: aynı ısı için doğalgazın yaklaşık 2,5 katı CO₂ ve bol is.');
const heatPump = new THREE.Group();
box(0.5, 0.9, 1.3, mat(0xe5e7eb, { roughness: 0.4 }), 0, 0.45, 0, heatPump);
const hpFan = new THREE.Mesh(new THREE.CircleGeometry(0.33, 6), mat(0x475569, { side: THREE.DoubleSide }));
hpFan.rotation.y = -Math.PI / 2;
hpFan.position.set(-0.26, 0.48, 0);
heatPump.add(hpFan);
heatPump.position.set(-6.9, 0, 1.2);
house.add(heatPump);
info(heatPump.children[0], '♨️ <b>Isı pompası:</b> Dış havadaki ısıyı içeri "pompalar"; 1 kWh elektrikle yaklaşık 3 kWh ısı verir.');

// --- Mobilya ---
box(2.6, 0.8, 0.9, mat(0xb91c1c), -4.2, 0.45, -2.6); // kanepe
box(2.6, 0.7, 0.25, mat(0x991b1b), -4.2, 1.0, -3.0);
box(0.15, 0.9, 1.6, mat(0x111827), -5.75, 1.6, -0.6); // TV
box(2.6, 0.03, 2.2, mat(0x7c3aed, { roughness: 1 }), -3.8, 0.1, 0.4); // halı
box(0.9, 2, 0.8, mat(0xf1f5f9, { roughness: 0.3 }), 3.3, 1.05, -2.8); // buzdolabı
box(2.4, 0.9, 0.7, mat(0x92400e), 1.1, 0.5, -3.0); // tezgah
box(2.9, 0.1, 1.5, mat(0xd6a36b), 1.5, 0.8, 0.8); // masa
for (const [x, z] of [[0.2, 0.2], [2.8, 0.2], [0.2, 1.4], [2.8, 1.4]]) box(0.08, 0.75, 0.08, mat(0x92400e), x, 0.4, z);
box(2.2, 0.45, 3, mat(0xffffff), -4.1, 3.5, -1.7); // yatak
box(2.2, 0.12, 2.1, mat(0x2563eb), -4.1, 3.78, -1.25);
box(1.6, 0.18, 0.5, mat(0xf8fafc), -4.1, 3.8, -2.9);
box(1.8, 0.55, 0.9, mat(0xffffff, { roughness: 0.3 }), 2.9, 3.5, -2.8); // küvet
// Çamaşır makinesi
const washer = new THREE.Group();
box(0.95, 1.05, 0.85, mat(0xf8fafc, { roughness: 0.35 }), 0, 0.52, 0, washer);
const drumM = new THREE.MeshBasicMaterial({ color: 0x60a5fa });
const drum = new THREE.Mesh(new THREE.CircleGeometry(0.3, 24), drumM);
drum.position.set(0, 0.5, 0.43);
washer.add(drum);
const door = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 24), mat(0x94a3b8, { metalness: 0.6 }));
door.position.set(0, 0.5, 0.44);
washer.add(door);
washer.position.set(0.2, 3.2, -2.7);
house.add(washer);
info(washer.children[0], '🧺 <b>Çamaşır makinesi:</b> Enerjinin çoğu suyu ısıtmaya gider; 30 °C yıkama 60 °C\'nin yarısından az enerji harcar.');
const washLbl = sim.label('', { parent: washer, position: [0, 1.3, 0.6], className: 'plain' });

// Tabaklar: haftanın 7 günü
const plates = [];
{
  const plateM = mat(0xffffff, { roughness: 0.3 });
  const steakM = mat(0x7f1d1d, { roughness: 0.6 }), saladM = mat(0x16a34a), tomM = mat(0xef4444);
  for (let i = 0; i < 7; i++) {
    const g = new THREE.Group();
    cyl(0.24, 0.2, 0.04, plateM, 0, 0, 0, g, 16);
    const steak = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), steakM);
    steak.scale.set(1.2, 0.35, 0.9);
    steak.position.y = 0.05;
    g.add(steak);
    const salad = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), k === 3 ? tomM : saladM);
      s.position.set(Math.cos(k * 1.8) * 0.09, 0.06, Math.sin(k * 1.8) * 0.09);
      salad.add(s);
    }
    g.add(salad);
    g.position.set(0.45 + (i % 4) * 0.7, 0.88, i < 4 ? 0.4 : 1.2);
    house.add(g);
    plates.push({ steak, salad });
  }
  info(plates[0].steak, '🥩 <b>Et tüketimi:</b> Kırmızı et üretimi (özellikle sığır) çok sera gazı salar; bitkisel ağırlıklı beslenme ayak izini belirgin düşürür.');
}
const plateLbl = sim.label('', { position: [1.5, 1.35, 1.6], className: 'plain' });

// Klima
const acIn = box(1.4, 0.42, 0.32, mat(0xffffff, { roughness: 0.3 }), -3.5, 5.35, -3.2);
info(acIn, '❄️ <b>Klima:</b> 1 kW\'lık bir klima günde 8 saat çalışırsa yazın yüzlerce kWh elektrik harcar.');
const acOut = new THREE.Group();
box(0.45, 0.7, 1.1, mat(0xe5e7eb), 0, 0, 0, acOut);
const acFan = new THREE.Mesh(new THREE.CircleGeometry(0.27, 6), mat(0x475569, { side: THREE.DoubleSide }));
acFan.rotation.y = -Math.PI / 2;
acFan.position.x = -0.24;
acOut.add(acFan);
acOut.position.set(-6.75, 4.4, -1.8);
house.add(acOut);

// Ampuller ve ışıklar
const bulbs = [];
for (const [x, y] of [[-3.5, 2.7], [1.5, 2.7], [-3.5, 5.7], [1.5, 5.7]]) {
  cyl(0.015, 0.015, 0.25, mat(0x111827), x, y + 0.18, 0);
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  b.position.set(x, y, 0);
  house.add(b);
  const l = new THREE.PointLight(0xffffff, 2, 7, 1.6);
  l.position.set(x, y - 0.3, 0.5);
  house.add(l);
  bulbs.push({ b, l });
  info(b, '💡 <b>Ampul:</b> Akkor ampul enerjinin çoğunu ısıya çevirir; LED aynı ışığı ~8 kat daha az elektrikle verir.');
}

// --- Garaj ve ulaşım ---
const garage = new THREE.Group();
scene.add(garage);
box(5.2, 0.12, 6.6, mat(0x9ca3af), 6.7, 0.06, 0.2, garage);
box(5, 3, 0.25, wallM, 6.7, 1.5, -3.05, garage);
box(0.25, 3, 6.6, wallM, 9.2, 1.5, 0.2, garage);
box(5.5, 0.25, 7, mat(0x78716c), 6.8, 3.1, 0.2, garage);
function makeCar(color) {
  const g = new THREE.Group();
  box(1.8, 0.6, 3.6, mat(color, { roughness: 0.35, metalness: 0.3 }), 0, 0.6, 0, g);
  box(1.6, 0.55, 1.9, mat(color, { roughness: 0.35, metalness: 0.3 }), 0, 1.15, -0.2, g);
  box(1.62, 0.4, 1.7, mat(0x1e293b, { roughness: 0.1 }), 0, 1.17, -0.2, g);
  const wm = mat(0x111111);
  for (const [x, z] of [[-0.9, 1.1], [0.9, 1.1], [-0.9, -1.1], [0.9, -1.1]]) {
    const w = cyl(0.36, 0.36, 0.25, wm, x, 0.36, z, g, 16);
    w.rotation.z = Math.PI / 2;
  }
  return g;
}
const car = makeCar(0xdc2626);
car.position.set(6.7, 0.1, 0.6);
garage.add(car);
info(car.children[0], '🚗 <b>Benzinli araba:</b> Tek kişiyle kilometre başına ≈170 g CO₂; günde 25 km yılda 1,5 tondan fazla eder.');
const ev = makeCar(0x0ea5a4);
ev.position.set(6.7, 0.1, 0.6);
garage.add(ev);
const charger = box(0.4, 0.8, 0.2, mat(0x16a34a, { emissive: 0x0a4d1e }), 8.9, 1.2, -1.2, garage);
info(ev.children[0], '🔌 <b>Elektrikli araba:</b> Egzozu yok; salımı şebeke elektriğinden gelir (≈80 g/km). Güneş paneliyle şarj edilirse daha da azalır.');
const bike = new THREE.Group();
{
  const bm = mat(0x2563eb, { metalness: 0.4 }), tm = mat(0x111111);
  for (const z of [-0.55, 0.55]) {
    const w = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 8, 24), tm);
    w.rotation.y = Math.PI / 2; w.position.set(0, 0.4, z); bike.add(w);
  }
  const a = box(0.06, 0.06, 1.1, bm, 0, 0.72, 0, bike); a.rotation.x = 0.1;
  const b = box(0.06, 0.6, 0.06, bm, 0, 0.6, -0.2, bike); b.rotation.x = 0.3;
  box(0.1, 0.05, 0.25, mat(0x111111), 0, 0.95, -0.28, bike);
  box(0.5, 0.05, 0.05, bm, 0, 1.0, 0.45, bike);
  bike.position.set(5.6, 0.1, 0.8);
  garage.add(bike);
  info(bike.children[2], '🚲 <b>Bisiklet:</b> Neredeyse sıfır salım, üstelik sağlıklı! Kısa mesafelerde en iyi seçenek.');
}
const busStop = new THREE.Group();
{
  cyl(0.06, 0.06, 2.4, mat(0x64748b), 0, 1.2, 0, busStop);
  const s = new THREE.Mesh(new THREE.CircleGeometry(0.4, 20), new THREE.MeshBasicMaterial({ color: 0x16a34a, side: THREE.DoubleSide }));
  s.position.set(0, 2.4, 0.01); busStop.add(s);
  box(1.6, 0.1, 0.5, mat(0x78350f), 1, 0.5, 0, busStop);
  busStop.position.set(-8, 0, 7);
  scene.add(busStop);
}
const bus = new THREE.Group();
{
  box(6.5, 2.2, 2, mat(0x2563eb, { roughness: 0.4 }), 0, 1.45, 0, bus);
  box(6.3, 0.7, 2.04, mat(0x0f172a, { roughness: 0.1 }), 0, 1.9, 0, bus);
  for (const x of [-2.2, 2.2]) for (const z of [-0.95, 0.95]) {
    const w = cyl(0.4, 0.4, 0.2, mat(0x111111), x, 0.4, z, bus, 14);
    w.rotation.x = Math.PI / 2;
  }
  bus.position.set(-40, 0, 8.2);
  scene.add(bus);
  info(bus.children[0], '🚌 <b>Toplu taşıma:</b> Bir otobüs onlarca kişiyi taşır; kişi başı salım arabanın yaklaşık üçte biri.');
}

// --- Uçak (yıllık uçuşlar) ---
const plane = new THREE.Group();
{
  const pm = mat(0xf8fafc, { roughness: 0.4 });
  const body = cyl(0.35, 0.25, 5, pm, 0, 0, 0, plane, 12);
  body.rotation.z = Math.PI / 2;
  box(1.2, 0.08, 6, pm, 0.2, 0, 0, plane);
  box(0.7, 1.1, 0.08, mat(0xdc2626), -2.3, 0.55, 0, plane);
  box(0.6, 0.06, 2.2, pm, -2.2, 0.1, 0, plane);
  plane.position.set(-30, 19, -12);
  scene.add(plane);
  info(body, '✈️ <b>Uçuşlar:</b> Bir gidiş-dönüş (~2.000 km) uçuş kişi başı yaklaşık 0,3 t CO₂e demektir; yüksek irtifa etkileriyle daha da fazla olabilir.');
}

// --- Geri dönüşüm ---
const bins = new THREE.Group();
[[0x2563eb, 'Kâğıt'], [0xeab308, 'Plastik'], [0x16a34a, 'Cam']].forEach(([c], i) => {
  box(0.8, 1.1, 0.8, mat(c), i * 1, 0.55, 0, bins);
  box(0.88, 0.1, 0.88, mat(c, { roughness: 0.5 }), i * 1, 1.15, 0, bins);
});
bins.position.set(-10.5, 0, 3);
scene.add(bins);
info(bins.children[0], '♻️ <b>Geri dönüşüm:</b> Kâğıt, cam, metal ve plastiği ayırmak yeni malzeme üretimindeki enerjiyi azaltır.');
const trash = new THREE.Group();
for (let i = 0; i < 6; i++) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), mat(0x111827, { roughness: 0.4 }));
  s.position.set((i % 3) * 0.7, 0.4 + Math.floor(i / 3) * 0.55, (i % 2) * 0.3);
  trash.add(s);
}
trash.position.set(-10.5, 0, 3);
scene.add(trash);
info(trash.children[0], '🗑️ <b>Karışık çöp:</b> Ayrıştırılmayan atık depolama alanında metan (güçlü bir sera gazı) üretebilir.');

// --- Orman: gereken ağaç sayısı (her simge = 10 ağaç) ---
const MAX_TREES = 160;
const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 1, 6), mat(0x6b4423), MAX_TREES);
const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.75, 0), mat(0x2f7d32, { flatShading: true }), MAX_TREES);
scene.add(trunks, crowns);
{
  const rnd = seeded(7), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const spots = [];
  while (spots.length < MAX_TREES) {
    const x = (rnd() - 0.5) * 56, z = -6 - rnd() * 26;
    if (spots.some(([a, b]) => Math.hypot(a - x, b - z) < 1.7)) continue;
    spots.push([x, z]);
  }
  spots.sort((a, b) => Math.hypot(a[0] + 15, a[1] + 9) - Math.hypot(b[0] + 15, b[1] + 9));
  spots.forEach(([x, z], i) => {
    const h = 0.8 + rnd() * 0.6;
    trunks.setMatrixAt(i, m4.compose(p.set(x, h / 2, z), q, s.set(1, h, 1)));
    const c = 0.8 + rnd() * 0.5;
    crowns.setMatrixAt(i, m4.compose(p.set(x, h + 0.55 * c, z), q, s.set(c, c * 1.3, c)));
    crowns.setColorAt(i, new THREE.Color().setHSL(0.3 + rnd() * 0.06, 0.55, 0.28 + rnd() * 0.1));
  });
}
const forestLbl = sim.label('', { position: [-15, 4.2, -9], className: 'big' });

// --- CO₂ bulutu ---
const cloud = new THREE.Group();
const cloudM = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 1, transparent: true, opacity: 0.92 });
[[0, 0, 0, 1.6], [1.5, -0.3, 0.2, 1.2], [-1.5, -0.2, 0, 1.25], [0.7, 0.8, -0.2, 1.1], [-0.8, 0.7, 0.3, 1.0], [2.6, -0.5, -0.2, 0.8],
  [-2.6, -0.4, 0.2, 0.85], [0, -0.6, 0.9, 0.95], [0.3, 0.1, -1, 1.1]].forEach(([x, y, z, r]) => {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), cloudM);
  s.position.set(x, y, z);
  cloud.add(s);
});
cloud.position.set(-1, 13.2, 0);
scene.add(cloud);
info(cloud.children[0], '☁️ <b>CO₂ bulutu:</b> Gerçekte CO₂ görünmez! Burada yıllık salımının büyüklüğünü göstermek için çizildi.');
const cloudLbl = sim.label('', { parent: cloud, position: [0, 2.3, 0], className: 'big' });

// --- Parçacıklar: ısı kaybı ve klima havası (toplamalı karışım, renk → siyah = görünmez) ---
function emitter(n, size) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false;
  scene.add(pts);
  const P = Array.from({ length: n }, () => ({ p: new THREE.Vector3(0, -99, 0), v: new THREE.Vector3(), life: 0, max: 1 }));
  return { pts, P, acc: 0 };
}
const heatFx = emitter(220, 0.32);
const airFx = emitter(60, 0.18);
const HEAT_RGB = [1, 0.45, 0.1], AIR_RGB = [0.55, 0.85, 1];
function spawnHeat(q) {
  const r = Math.random();
  if (r < 0.4) { q.p.set(rand(-6, 4), rand(0.2, 6), -3.8); q.v.set(0, 0.25, -0.8); }
  else if (r < 0.6) { q.p.set(-6.3, rand(0.2, 6), rand(-3.3, 3.3)); q.v.set(-0.8, 0.25, 0); }
  else if (r < 0.7) { q.p.set(4.3, rand(3.3, 6), rand(-3.3, 3.3)); q.v.set(0.8, 0.25, 0); }
  else { const z = rand(-3.8, 3.8); q.p.set(rand(-6, 4), 8.8 - Math.abs(z) * 0.7 + 0.2, z); q.v.set(0, 0.8, Math.sign(z) * 0.3); }
  q.max = rand(1.4, 2.4);
}
function spawnAir(q) { q.p.set(rand(-4.1, -2.9), 5.1, -3); q.v.set(rand(-0.1, 0.1), -0.5, 0.9); q.max = rand(1, 1.8); }
function stepFx(fx, rate, dt, spawn, rgb) {
  fx.acc += rate * dt;
  const pos = fx.pts.geometry.attributes.position.array, col = fx.pts.geometry.attributes.color.array;
  fx.P.forEach((q, i) => {
    if (q.life <= 0 && fx.acc >= 1) { fx.acc -= 1; spawn(q); q.life = q.max; }
    if (q.life > 0) { q.life -= dt; q.p.addScaledVector(q.v, dt); }
    const a = q.life > 0 ? Math.sin((q.life / q.max) * Math.PI) : 0;
    pos[i * 3] = q.p.x; pos[i * 3 + 1] = q.life > 0 ? q.p.y : -99; pos[i * 3 + 2] = q.p.z;
    col[i * 3] = rgb[0] * a; col[i * 3 + 1] = rgb[1] * a; col[i * 3 + 2] = rgb[2] * a;
  });
  fx.acc = Math.min(fx.acc, 5);
  fx.pts.geometry.attributes.position.needsUpdate = true;
  fx.pts.geometry.attributes.color.needsUpdate = true;
}

// Baca dumanı (örnek başına renk ile)
const PUFFS = 40;
const smoke = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false }), PUFFS);
smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
smoke.frustumCulled = false;
scene.add(smoke);
const puffs = Array.from({ length: PUFFS }, () => ({ p: new THREE.Vector3(), life: 0, max: 1, s: 1 }));
let puffAcc = 0;
const exhaust = Array.from({ length: 12 }, () => ({ p: new THREE.Vector3(), life: 0 }));
const exhaustMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ color: 0x9ca3af, transparent: true, opacity: 0.6, depthWrite: false }), 12);
exhaustMesh.frustumCulled = false;
scene.add(exhaustMesh);

// --- Durum ve hesap ---
const DEF = { heat: 'gas', ins: 1, bulb: 'akkor', ac: 4, wash: 40, meat: 4, trans: 'car', km: 25, fly: 1, solar: false, recycle: false };
const S = { ...DEF };

function compute() {
  const demand = K.heatDemand * INSUL[S.ins];
  let heat = 0, hpKwh = 0;
  if (S.heat === 'gas') heat = demand * K.gas;
  else if (S.heat === 'coal') heat = demand * K.coal;
  else { hpKwh = demand / K.heatPumpCOP; heat = hpKwh * K.grid; }
  const lightKwh = (10 * (S.bulb === 'akkor' ? 60 : 8) * 4 * 365) / 1000 / PEOPLE;
  const acKwh = (S.ac * 1.0 * 100) / PEOPLE;
  const washKwh = (208 * WASH_KWH[S.wash]) / PEOPLE;
  const baseKwh = 1500 / PEOPLE;
  const elecKwh = lightKwh + acKwh + washKwh + baseKwh;
  const evKwh = S.trans === 'ev' ? S.km * 365 * 0.18 : 0;
  let elec = elecKwh * K.grid;
  const food = 1300 + 1400 * (S.meat / 7);
  const perKm = { car: K.car, ev: K.ev, bus: K.bus, bike: K.bike }[S.trans];
  let trans = S.km * 365 * perKm;
  const other = S.recycle ? 1050 : 1200;
  // Güneş: 3 kW × ~1.350 kWh/kWp ≈ 4.000 kWh/yıl (hane), kişi payı; yalnızca evde tüketilen elektriği karşılar
  let solarSave = 0;
  if (S.solar) {
    const prod = 4000 / PEOPLE;
    const use = elecKwh + hpKwh + evKwh;
    solarSave = Math.min(prod, use) * K.grid;
  }
  const fly = S.fly * K.flight * 1000;
  const kg = { heat, elec, food, trans, fly, other };
  // Güneş kazancını elektrik tüketen kalemlerden sırayla düş
  let rest = solarSave;
  const takeFrom = (key, max) => { const t = Math.min(rest, max); kg[key] -= t; rest -= t; };
  takeFrom('elec', elec);
  if (S.heat === 'hp') takeFrom('heat', hpKwh * K.grid);
  if (S.trans === 'ev') takeFrom('trans', evKwh * K.grid);
  const t = Object.fromEntries(Object.entries(kg).map(([k, v]) => [k, v / 1000]));
  t.total = Object.values(kg).reduce((a, b) => a + b, 0) / 1000;
  t.solar = solarSave / 1000;
  t.lossRate = demand / K.heatDemand;
  return t;
}
let R = compute();

// --- Görsel güncelleme ---
const cloudTarget = { s: 1, c: new THREE.Color() };
function applyVisuals() {
  const th = [0, 0.16, 0.34][S.ins];
  insul.visible = S.ins > 0;
  insBack.scale.z = th || 0.01; insBack.position.z = -3.65 - th / 2;
  insLeft.scale.x = th || 0.01; insLeft.position.x = -6.15 - th / 2;
  insRight.scale.x = th || 0.01; insRight.position.x = 4.15 + th / 2;
  insTop.scale.y = th || 0.01; insTop.position.y = 6.15 + th / 2;
  frames.visible = S.ins > 0;
  kombi.visible = S.heat === 'gas';
  stove.visible = S.heat === 'coal';
  heatPump.visible = S.heat === 'hp';
  radiators.visible = S.heat !== 'coal';
  const warm = S.bulb === 'akkor';
  bulbs.forEach(({ b, l }) => { b.material.color.setHex(warm ? 0xffc46b : 0xf4f8ff); l.color.setHex(warm ? 0xffa64d : 0xe6f0ff); l.intensity = warm ? 2.6 : 2.2; });
  acOut.visible = S.ac > 0;
  drumM.color.copy(new THREE.Color(0x60a5fa).lerp(new THREE.Color(0xef4444), (S.wash - 30) / 60));
  washLbl.setText(`${S.wash} °C`);
  plates.forEach((p, i) => { p.steak.visible = i < S.meat; p.salad.visible = i >= S.meat; });
  plateLbl.setText(`🥩 ${S.meat} gün · 🥗 ${7 - S.meat} gün`);
  car.visible = S.trans === 'car';
  ev.visible = S.trans === 'ev';
  charger.visible = S.trans === 'ev';
  bike.visible = S.trans === 'bike' || S.trans === 'bus';
  bike.position.x = S.trans === 'bike' ? 6.7 : 5.2;
  busStop.visible = bus.visible = S.trans === 'bus';
  plane.visible = S.fly > 0;
  solar.visible = S.solar;
  bins.visible = S.recycle;
  trash.visible = !S.recycle;
  cloudTarget.s = Math.cbrt(Math.max(R.total, 0.2) / TR_AVG) * 1.25;
  cloudTarget.c.setHex(0x9ca3af).lerp(new THREE.Color(0x1f2937), clamp((R.total - 2) / 8, 0, 1));
  const trees = Math.round((R.total * 1000) / K.treeKg);
  const icons = Math.min(MAX_TREES, Math.round(trees / 10));
  trunks.count = crowns.count = icons;
  forestLbl.setText(`🌳 ${fmt(trees)} ağaç gerekir`);
  cloudLbl.setText(`${fmt(R.total, 1)} t CO₂e / yıl`);
}

// --- Animasyon ---
const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s3 = new THREE.Vector3(), c3 = new THREE.Color();
let busX = -40, clock = 0;
sim.onUpdate((dt) => {
  clock += dt;
  // Isı kaybı: yalıtım ve ısınma ihtiyacıyla orantılı
  stepFx(heatFx, 40 * R.lossRate ** 2, dt, spawnHeat, HEAT_RGB);
  stepFx(airFx, S.ac * 3, dt, spawnAir, AIR_RGB);
  // Baca
  const smokeRate = S.heat === 'coal' ? 9 : S.heat === 'gas' ? 2.5 : 0;
  puffAcc = Math.min(puffAcc + smokeRate * dt, 3);
  puffs.forEach((p, i) => {
    if (p.life <= 0 && puffAcc >= 1) { puffAcc -= 1; p.life = p.max = rand(2.5, 4); p.p.set(-4.2 + rand(-0.1, 0.1), 9.6, -1.6); p.s = S.heat === 'coal' ? 1.2 : 0.6; p.dark = S.heat === 'coal'; }
    if (p.life > 0) { p.life -= dt; p.p.y += dt * 0.9; p.p.x += dt * 0.5; }
    const k = p.life > 0 ? 1 - p.life / p.max : 0;
    const sc = p.life > 0 ? p.s * (0.5 + k * 1.8) : 0.0001;
    smoke.setMatrixAt(i, m4.compose(p.p, q4, s3.setScalar(sc)));
    smoke.setColorAt(i, c3.setHex(p.dark ? 0x27272a : 0xf1f5f9).lerp(new THREE.Color(0xd1d5db), k * 0.6));
  });
  smoke.instanceMatrix.needsUpdate = true;
  if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;
  // Egzoz (benzinli araba çalışırken)
  exhaust.forEach((e, i) => {
    if (e.life <= 0 && S.trans === 'car' && Math.random() < dt * 3) { e.life = 1.5; e.p.set(7.3, 0.4, 2.6); }
    if (e.life > 0) { e.life -= dt; e.p.z += dt * 0.8; e.p.y += dt * 0.3; }
    exhaustMesh.setMatrixAt(i, m4.compose(e.p, q4, s3.setScalar(e.life > 0 ? 0.6 + (1.5 - e.life) : 0.0001)));
  });
  exhaustMesh.instanceMatrix.needsUpdate = true;
  // Uçak gökyüzünden geçer (uçuş sayısı arttıkça daha sık)
  if (S.fly > 0) { plane.position.x += dt * (5 + S.fly * 1.5); if (plane.position.x > 45) plane.position.x = -45; }
  // Otobüs geçer
  if (S.trans === 'bus') {
    const stopX = -6.5;
    const dx = Math.abs(busX - stopX) < 0.3 && (clock % 8) < 3 ? 0 : 6;
    busX += dx * dt;
    if (busX > 40) busX = -40;
    bus.position.x = busX;
  }
});

sim.onRender((dt) => {
  hpFan.rotation.x += dt * 12 * (S.heat === 'hp' ? 1 : 0);
  acFan.rotation.x += dt * (4 + S.ac * 2);
  drum.rotation.z += dt * 5;
  flame.scale.y = 0.8 + Math.random() * 0.4;
  coalGlow.material.color.setHSL(0.06, 1, 0.45 + Math.random() * 0.1);
  const s = lerp(cloud.scale.x, cloudTarget.s, Math.min(1, dt * 3));
  cloud.scale.setScalar(s);
  cloud.position.y = 12.8 + s * 1.2 + Math.sin(performance.now() / 900) * 0.15;
  cloudM.color.lerp(cloudTarget.c, Math.min(1, dt * 3));
});

// --- Panel ---
const ui = sim.ui;
ui.section('🏠 Isınma ve yalıtım');
const cHeat = ui.segmented({ label: 'Isınma', options: [{ value: 'gas', label: '🔥 Kombi' }, { value: 'hp', label: '♨️ Isı pompası' }, { value: 'coal', label: '⚫ Soba' }], value: S.heat, onChange: (v) => set({ heat: v }) });
const cIns = ui.segmented({ label: 'Yalıtım (mantolama, çift cam)', options: [{ value: 0, label: 'Yok' }, { value: 1, label: 'Orta' }, { value: 2, label: 'İyi' }], value: S.ins, onChange: (v) => set({ ins: v }) });
ui.section('💡 Elektrik');
const cBulb = ui.segmented({ label: 'Ampuller', options: [{ value: 'akkor', label: 'Akkor (60 W)' }, { value: 'led', label: 'LED (8 W)' }], value: S.bulb, onChange: (v) => set({ bulb: v }) });
const cAc = ui.slider({ label: 'Klima (yazın, günde)', min: 0, max: 12, step: 1, value: S.ac, unit: 'saat', onInput: (v) => set({ ac: v }) });
const cWash = ui.segmented({ label: 'Çamaşır sıcaklığı', options: [30, 40, 60, 90].map((v) => ({ value: v, label: `${v} °C` })), value: S.wash, onChange: (v) => set({ wash: v }) });
const cSolar = ui.toggle({ label: '☀️ Çatıda güneş paneli (3 kW)', value: S.solar, onChange: (v) => set({ solar: v }) });
ui.section('🍽️ Beslenme ve atık');
const cMeat = ui.slider({ label: 'Haftada kaç gün et?', min: 0, max: 7, step: 1, value: S.meat, format: (v) => `${v} gün`, onInput: (v) => set({ meat: v }) });
const cRec = ui.toggle({ label: '♻️ Geri dönüşüm yapıyorum', value: S.recycle, onChange: (v) => set({ recycle: v }) });
ui.section('🚗 Ulaşım');
const cTrans = ui.segmented({ label: 'Günlük ulaşım', options: [{ value: 'car', label: '🚗 Araba' }, { value: 'ev', label: '🔌 E-araba' }, { value: 'bus', label: '🚌 Toplu' }, { value: 'bike', label: '🚲 Bisiklet' }], value: S.trans, onChange: (v) => set({ trans: v }) });
const cKm = ui.slider({ label: 'Günde yol', min: 0, max: 80, step: 1, value: S.km, unit: 'km', onInput: (v) => set({ km: v }) });
const cFly = ui.slider({ label: '✈️ Yılda uçuş (gidiş-dönüş)', min: 0, max: 10, step: 1, value: S.fly, format: (v) => `${v} kez`, onInput: (v) => set({ fly: v }) });
ui.section('⚡ Hazır evler');
ui.buttons([
  { label: '🌍 Yeşil ev', variant: 'good', onClick: () => set({ heat: 'hp', ins: 2, bulb: 'led', ac: 1, wash: 30, meat: 1, trans: 'bike', km: 10, fly: 0, solar: true, recycle: true }, true) },
  { label: '🏭 Yüksek karbon', variant: 'danger', onClick: () => set({ heat: 'coal', ins: 0, bulb: 'akkor', ac: 10, wash: 90, meat: 7, trans: 'car', km: 60, fly: 6, solar: false, recycle: false }, true) },
  { label: '↩ Ortalama ev', onClick: () => set({ ...DEF }, true) },
]);

ui.section('📊 Yıllık karbon ayak izi (kişi başı)');
const stTotal = ui.stat({ label: 'Toplam', unit: 't CO₂e' });
const stTrees = ui.stat({ label: 'Gereken ağaç', unit: 'adet' });
const stTarget = ui.stat({ label: '1,5 °C hedefinin', unit: 'katı' });
const stTR = ui.stat({ label: 'Türkiye ort. (≈6,6 t)', unit: '' });
const bar = makePlot(ui, { title: 'Kategori dağılımı (yaklaşık, ton)', height: 64, legend: CATS });
const meters = CATS.map((c) => ui.meter({ label: c.name, color: c.color }));
const solarMeter = ui.meter({ label: '☀️ Güneş panelinin kazandırdığı', color: '#34d399' });
const hist = ui.chart({ title: 'Değişikliklerinin etkisi (t CO₂e / yıl)', series: [{ name: 'Senin evin', color: '#f97316', fill: true }, { name: '1,5 °C hedefi ≈2 t', color: '#22c55e' }, { name: 'Türkiye ort. ≈6,6 t', color: '#94a3b8' }], maxPoints: 120, yMin: 0, yMax: 16 });
const tip = ui.text('', 'card');
ui.text('<small>Tüm katsayılar yaklaşık ve eğitim amaçlıdır. Evdeki nesnelere tıklayarak açıklamalarını gör.</small>');

const TIPS = {
  heat: 'En büyük payın <b>ısınma</b>. Yalıtım ve ısı pompası en etkili adımlar; termostatı 1 °C düşürmek de işe yarar.',
  elec: 'En büyük payın <b>elektrik</b>. LED ampul, daha az klima ve güneş paneli dene.',
  food: 'En büyük payın <b>beslenme</b>. Haftada birkaç gün et yerine baklagil (mercimek, nohut) seçmek büyük fark yaratır.',
  trans: 'En büyük payın <b>ulaşım</b>. Kısa yolları yürüyerek ya da bisikletle, uzunları toplu taşımayla yap.',
  fly: 'En büyük payın <b>uçuşlar</b>. Yakın yerlere trenle ya da otobüsle gitmek, uçuşları azaltmak büyük fark yaratır.',
  other: 'En büyük payın <b>tüketim</b>. Daha az ama uzun ömürlü eşya almak, onarmak ve geri dönüştürmek yardımcı olur.',
};

function refreshPanel() {
  const tone = R.total <= 2.5 ? 'good' : R.total <= TR_AVG ? 'warn' : 'bad';
  stTotal.set(fmt(R.total, 2), tone);
  const trees = Math.round((R.total * 1000) / K.treeKg);
  stTrees.set(fmt(trees), tone);
  stTarget.set(fmt(R.total / TARGET, 1) + '×', tone);
  const d = R.total - TR_AVG;
  stTR.set(`${d > 0 ? '+' : ''}${fmt(d, 1)} t`, d > 0 ? 'bad' : 'good');
  CATS.forEach((c, i) => meters[i].set(R[c.key] / 4, `${fmt(R[c.key], 2)} t`));
  solarMeter.set(R.solar / 1, R.solar ? `−${fmt(R.solar, 2)} t` : 'panel yok');
  let x = 0;
  const hbars = CATS.map((c) => { const b = { x0: x, x1: x + Math.max(0, R[c.key]), y0: 0.15, y1: 0.85, color: c.color }; x = b.x1; return b; });
  bar.set({ xMin: 0, xMax: 16, yMin: 0, yMax: 1, yTicks: [], xTicks: [0, 4, 8, 12, 16], xFmt: (v) => `${v} t`, padLeft: 8, hbars,
    vlines: [{ x: TARGET, color: '#22c55e', text: '1,5 °C' }, { x: TR_AVG, color: '#e2e8f0', text: 'TR' }] });
  const big = CATS.reduce((a, c) => (R[c.key] > R[a.key] ? c : a), CATS[0]);
  tip.set(`💡 ${TIPS[big.key]}${R.total <= 2.3 ? '<br>🎉 Harika! 1,5 °C hedefine çok yakınsın.' : ''}`);
}

function set(patch, syncUi = false) {
  Object.assign(S, patch);
  R = compute();
  applyVisuals();
  refreshPanel();
  if (syncUi) {
    cHeat.set(S.heat); cIns.set(S.ins); cBulb.set(S.bulb); cAc.set(S.ac); cWash.set(S.wash); cSolar.set(S.solar);
    cMeat.set(S.meat); cRec.set(S.recycle); cTrans.set(S.trans); cKm.set(S.km); cFly.set(S.fly);
  }
}

let histT = 0;
sim.onUpdate((dt) => {
  histT += dt;
  if (histT > 0.5) { histT = 0; hist.push([R.total, TARGET, TR_AVG]); }
});

sim.onClick(clickables, (hit) => {
  let o = hit.object;
  while (o && !o.userData.info) o = o.parent;
  if (o) sim.toast(o.userData.info);
});

sim.formatTime = () => `${fmt(R.total, 1)} t CO₂e / yıl`;
sim.onReset(() => { set({ ...DEF }, true); hist.clear(); busX = -40; });
set({ ...DEF });
sim.hud.show('🏡 Evdeki tercihlerini değiştir, <b>CO₂ bulutunu</b> küçült! Nesnelere tıklayarak öğren.', { timeout: 6000 });
