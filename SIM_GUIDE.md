# SimLab — Simülasyon Yazım Rehberi

Her simülasyon tek bir klasördür: `src/sims/<id>/main.js` (gerekirse aynı klasörde yardımcı dosyalar, göreli import).
`<id>`, başlık ve açıklama `src/catalog.js` içinde tanımlıdır. **catalog.js, core/, build.mjs, smoke.mjs ve style.css'e dokunma.**
**Görsel standart: `QUALITY.md` (zorunlu, tek standart, 63 simülasyonun hepsi).** Referans görüntü `reference/acik-deniz.png`;
motorla yapılmış örnek: `src/sims/ruzgar-turbini/main.js` (+ `shots/ruzgar-turbini.png`) ve `dev/lab.js` (okyanus, kıyı,
stüdyo, uzay, malzeme sahneleri). Yazmadan önce QUALITY.md'yi, bu rehberin "Görsel motor" bölümünü ve örneği oku.

## Kurallar
- Yalnızca `@core`'dan import et: `import { createSim, THREE, ... } from '@core'`. `three` veya `three/examples/...` doğrudan
  import edilemez (derleme hata verir). Kullanılabilir eklentiler: `OrbitControls, CSS2DObject, RoundedBoxGeometry,
  ConvexGeometry, ImprovedNoise, BufferGeometryUtils`.
- Harici dosya, CDN, font, resim, ağ isteği **yok**. Dokular gerekiyorsa `<canvas>` ile üret (`textTexture`, `textPlane`
  yardımcıları var). Her şey çevrimdışı çalışmalı.
- Tüm metinler **Türkçe** (doğru ç, ğ, ı, İ, ö, ş, ü). Sayılar `fmt()` ile (Türkçe biçim: 1.234,5).
- Her simülasyon **gerçekten 3B Three.js sahnesi** kullanır; grafik ve istatistikler panelde olur. Doğası 2B olan
  konularda da (faiz, phishing, dil evrimi) konuyu 3B metaforla göster (kuleler, masa, harita, ağaç…).
- **Bilimsel doğruluk:** Basitleştirilmiş ama doğru model kullan (SIR, Lotka–Volterra, Henderson–Hasselbalch, Ohm,
  Snell, Newton, Arrhenius, Richter/MMI azalımı, √(g·h) tsunami hızı vb.). Sağlık/güvenlik konularında (CPR, ev
  kimyası, deprem, kan şekeri) gerçek resmî önerilerle çelişme (ör. CPR: 100–120/dk, 5–6 cm; deprem: Çök-Kapan-Tutun;
  çamaşır suyu + asit → klor gazı, + amonyak → kloramin). Emin olmadığın sayıları uydurma; nitel anlat.
- `info` alanına "Ne görüyorsun?" / "Dene" / (gerekiyorsa) modeli ve sınırlarını anlatan kısa HTML yaz (gunes-sistemi gibi).
- Performans: çok nesne için `InstancedMesh` (`instanced()` yardımcısı), her karede yeni geometri/materyal oluşturma,
  gölgeleri yalnız gerekiyorsa aç. Hedef orta seviye bir laptopta ve telefonda akıcı çalışmak.
- `sim.onReset(fn)` ile sıfırlama desteği ver (playbar'daki ⟲ ve R tuşu). Zaman birimi anlamlıysa
  `sim.formatTime = (t) => ...` ayarla (ör. "Gün 12", "14:30", "3. nesil").
- Oyunsu simülasyonlar (deprem anı, deprem çantası, phishing, CPR, restoran) HUD ile ilerler:
  `sim.hud.show(html)`; HUD içindeki `<button>`lara `sim.hud.el.querySelector(...)` ile olay bağla. Oyunun sonunda
  puan/geri bildirim ve "Tekrar oyna" olsun.
- Kod temiz, yorumlar Türkçe ve seyrek (referanstaki gibi). Dosya başına tek satırlık açıklama yorumu.


## Görsel motor (zorunlu) — `src/core/gfx/*`, hepsi `@core`'dan
Eski yöntem (düz `background` rengi, `fog`, elle `HemisphereLight`/`DirectionalLight`, çıplak `MeshStandardMaterial({color})`,
kutu/silindir/küre nesneler) **artık kabul edilmez**. Her simülasyon aşağıdaki ortamlardan birini kullanır; ışık, gölge,
AO, bloom, ton eşleme ve pozlama motor tarafından otomatik kurulur. Birimler **metre** (gerçek ölçek; gerekirse içerik
grubunu ölçekle, örnekteki `content` grubu gibi).

### 1) Ortam (createSim seçeneği — biri seçilir)
```js
createSim({ sky: { elevation: 30, azimuth: 128, clouds: 0.35, haze: 1, visibility: 9000, wind: [7, 2] }, … })
//   Fiziksel atmosfer (Rayleigh+Mie), güneş, bulutlar, gece yıldızları, hava perspektifi (visibility m). Açık hava sahneleri.
//   Çalışırken: sim.sky.set({ elevation, azimuth, clouds, haze, visibility }) — gün döngüsü, fırtına, sis, gün batımı.
//   azimut 0 = kuzey (−z), 90 = doğu (+x). Güneş kameranın yanında/arkasında dursun (biçim ve gölge okunur).
createSim({ studio: { color: 0xa9a6a0, mood: 'day'|'lab'|'night', warmth: 0.2, key: { el: 48, az: 35 }, radius: 30 }, … })
//   Ürün fotoğrafı stüdyosu: kesintisiz fon, softbox yansımaları, ana ışık + gölge. Masa/laboratuvar/nesne/vücut/mikro
//   sahneleri. Daha iyisi mümkünse gerçek bir mekân kur (oda, laboratuvar tezgâhı, pencere dışında sky) — mat.* ile.
createSim({ space: { star: [0, 0, 0], power: 1, milky: 1, nebula: 1, stars: 1 }, … })
//   Uzay: gerçekçi yıldız alanı, Samanyolu, bulutsular; noktasal yıldız ışığı (star konumunda), gölge.
```
`background`, `fog`, `lights` seçeneklerini bu ortamlarla birlikte **verme**; `camera.far` sahneye göre (arazi eteği 60 km ise 80000).

### 2) Açık hava katmanları
```js
import { landscape, createTerrain, terrainSkirt, createVegetation, createOcean, depthTexture } from '@core';
const hf = landscape({ seed, size: 1100, height: 190, base: -30, warp: 0.55, shape: (x, z, h) => h });  // (x,z)→y metre
scene.add(createTerrain(hf, { size: [6400, 6400], res: [384, 384], materialOptions: { water: 0, grass, dry, forest: 0.8, snow } }));
scene.add(terrainSkirt(hf, { inner: 3200, outer: 60000 }));   // ufka kadar kesintisiz arazi (camera.far ≥ 80000)
const veg = createVegetation(hf, { rect, trees, shrubs, rocks, grass, grassAt: [x, z, r], near: [x, z, r],
  kinds: { pine, broad, cypress }, forest: (x, z) => 0..1, water });           // veg.update(t, rüzgârKatsayısı) her kare
const ocean = createOcean(sim.renderer, sim.sky, { wind: 9, windDir: 225, fetch: 150 });  // FFT okyanus (Açık Deniz)
scene.add(ocean.mesh); ocean.setDepth(depthTexture(hf, rect, 256), rect);    // sığlık/kıyı köpüğü; her kare ocean.update(dt, camera)
// ya da createSim({ sky, ocean: { wind } }) → otomatik güncellenir. ocean.setLongWave(tex, rect): tsunami/gel-git yüksekliği.
```

### 3) Malzemeler — `mat.*` (prosedürel PBR: doku + pürüzlülük + mikro kabartma, örtüşmesiz)
`concrete, asphalt, brushedMetal, paintedMetal({color, wear}), wood({varnish}), plastic({gloss}), rubber, fabric, brick,
rock, ceramic, foliage, tissue({veins}), glass({tint, rough, thickness}), liquid({color, density}), glow({color, intensity})`.
Hepsi `{ color, scale }` alır. Yeni doku gerekirse `procedural({ pattern: 'GLSL…', params, uniforms, bump })` ile yaz
(`vn3/fbm3/cells3` gürültüleri; ince frekanslar otomatik söner). `MeshBasicMaterial` yalnız yazı, çizgi, veri katmanı ve
ışık kaynağı için. Parlayan her şey `mat.glow` (bloom ile gerçekten parlar).

### 4) Biçim
Çıplak ilkel şekil yok: `RoundedBoxGeometry` (pah), `LatheGeometry` (dönel profil: şişe, kule, burun), `ExtrudeGeometry`
(bevel'li profil), istasyonlardan örülmüş özel geometri (örnekteki kanat), `BufferGeometryUtils.mergeGeometries`.
Tekrarlanan doğal nesnelerde ölçek/renk/dönüş çeşitliliği (InstancedMesh). Ölçek referansı (insan, araç) gerçek boyda.

### 4b) Kent: binalar ve sokaklar (`src/core/gfx/buildings.js`, `streets.js`)
Kutu + cephe dokusu değil, gerçek geometri: girintili pencere (söve, denizlik, örneklenmiş PVC/ahşap doğrama), iç mekânı
görünen yansıtıcı cam (oda kutusu, mobilya, tül/fon perde/stor; gece `setLit` ile yanar), kat silmeleri, korniş,
balkon (dolu / demir korkuluk / cam balkon), dükkân katı (vitrin, tabela, tente, kepenk), giriş kapısı + saçak, klima,
çanak anten; çatı: kırma/beşik kiremit (saçak, mahya, oluk) ya da düz (parapet, harpuşta, merdiven kovası, su deposu,
güneş enerjili ısıtıcı, TV anteni). Sıva yıpranması: yağmur izleri, zemine yakın kir, koyu andezit subasman.
```js
import { makeBuilding, makeBlock, populateCity, makeCity, carFleet, streetLamps, streetTrees, streetMaterials } from '@core';
// Tek bina (orijin taban merkezi, ön cephe +z). type: apartment | house | office | public | industrial
const b = makeBuilding({ type: 'apartment', floors: 6, width: 16, depth: 12, seed: 4,
  colors: { wall: 0xe4d3b4, trim: 0xf4f1ea, roof: 0xb4583a, frame: 0xf3f3f0 },   // hepsi isteğe bağlı
  shop: true, roof: 'flat' /* hip|gable|flat|saw */, balcony: 'glazed' /* solid|rail|glazed|none */, age: 0.5 });
b.userData.spec.H;   // hesaplanan duvar üst kotu (m)
// Kademeli kule: podyum (office, floors 3) + üstüne y0 ile oturan kütle (lobby: false kendiliğinden), roofGear: false → çatı donanımı yok
// Bir adanın parselleri (yola bakan binalar; gap: 0 → bitişik nizam, yan duvarlar penceresiz)
const lots = makeBlock({ x0, x1, z0, z1 }, { seed, mix: { apartment: 0.7, house: 0.3 }, gap: 3, shops: 0.6,
  floors: (x, z, r, type) => kat, type: (x, z, r) => tür });
// Çok bina: karolara bölünür; uzak karo = tek çizimli kabuk, yakın karo = ayrıntılı geometri (tembel üretilir)
const city = populateCity({ lots, near: 280, tile: 100, camera: [x, y, z] });  // lot: { x, z, rot, y0, ...makeBuilding }
scene.add(city.group); city.setLit(0..1); city.stats();
// Hepsi bir arada: ızgara yollar + bordürlü kaldırım + çizgiler + rögar + lamba + ağaç + park etmiş araç + binalar
const c = makeCity({ xs: [...], zs: [...], road: 9, walk: 3.5, seed: 8, parked: 40, camera: [..],
  plan: (i, j, rect) => 'city' | 'park' | 'plaza' | 'none', block: (inner, i, j) => makeBlock seçenekleri,
  floors, type, lots: (inner, r, i, j) => [...], treeOk, parkOk, asphalt: true });
scene.add(c.group); sim.onRender(() => c.update(performance.now() / 1000, 0.6)); c.setLit(gece);
const cars = carFleet(n, { seed }); cars.set(i, x, 0, z, yaw, tekerAçısı); cars.commit();  // +x = ileri
```
Performans: bina parçaları malzeme başına birleşir, tekrarlanan parçalar örneklenir. 300+ bina masaüstünde akıcı;
`near` (ayrıntı mesafesi) LOW'da 170 m, masaüstünde 280 m. Karolar dünya koordinatında kurulur; grubu taşıyabilirsin.

### 4c) İnsanlar (`src/core/gfx/people.js`)
Silindir bacak / blob gövde yok: eklemli figür — yumuşak birleşen lathe/kapsül gövde, kalça, boyun, baş (burun, kulak, göz,
kaş), saç (short/crop/long/bun/bald), eller (başparmak), ayakkabı/bot; giysi `mat.fabric` + dimi pantolon, ıslak olmayan ten
malzemesi. Boy, omuz, yapı ve renkler seed'e bağlı. Kıyafetler: `casual | office | worker | medic | student | chef | waiter`
(ceket+gömlek önü, kravat, hi-vis yelek + baret, önlük + aşçı kepi, sırt çantası). Pozlar: `stand | walk | run | sit | kneel |
lie | crouch | work` (work: tezgâh başında eller önde). Birimler metre, orijin ayak tabanı ortası, yaw = 0 → +z'ye bakar.
```js
import { makePerson, crowd } from '@core';
// Tek kişi (THREE.Group): kahraman figür, yakın plan
const p = makePerson({ seed: 3, outfit: 'medic', sex: 'f', height: 1.68, pose: 'kneel', skin: 0xc08560, hair: { style: 'bun', color: 0x2a1d15 } });
scene.add(p); sim.onRender(() => p.update(performance.now() / 1000));   // p.setPose('stand'), p.dress({ outfit: 'office' })
// Kalabalık: parça başına InstancedMesh (malzemeler paylaşılır), uzakta poz başına tek çizimli düşük detay (yürüme salınımı GPU'da)
const c = crowd(300, { seed: 4, rect: [-20, -10, 20, 10] /* | ring: [cx, cz, r0, r1] | pts: [[x, z], …] */,
  poses: { stand: 3, walk: 1 }, outfits: { casual: 5, office: 2, student: 1 }, camera: sim.camera, seat: 0.46 });
scene.add(c.group);
c.set(i, x, 0, z, yaw, 'walk');     // her kare konum; adım fazı gerçek yer değiştirmeden (ayak kaymaz), duran 'walk' → ayakta
c.pose(i, 'sit', 0.47); c.dress(i, { outfit: 'chef' }); c.tint(i, 0xef4444, 0.5); c.hide(i); c.speed(i, 1.3) /* yerinde yürüme */;
sim.onRender(() => c.update(performance.now() / 1000));   // ağırlık aktarımı, nefes, baş hareketi, yürüme/koşu döngüsü
```
Ayrıntı mesafesi `lod` (masaüstü 30 m, LOW 14 m; LOW'da yakın geometri de seyrelir). 300 kişi masaüstünde akıcı; `c.stats()` →
{ near, far, draws }. İç mekânda ortam haritası kısılıyorsa `c.materials` listesini de ekle. `set()` çağrılmayan kişi görünmez.

### 5) Veri katmanları
Parçacık, ısı haritası, etiket, akış tüpü gibi bilimsel katmanlar gerçekçi sahnenin **üstüne** biner ve "Görünüm"
bölümünden açılıp kapanır. Parçacıklar yumuşak yuvarlak doku ile (kare piksel değil), ölçülü opaklıkta.

## Çekirdek API (özet — ayrıntı için src/core/index.js, ui.js, util.js)
```js
const sim = createSim({
  background: 0x0b1020, camera: { position:[x,y,z], target:[x,y,z], fov, ortho /*yükseklik→ortografik*/ },
  controls: true | false | { maxPolarAngle, minDistance, enableRotate… }, shadows: false, lights: true, fog: [yakın, uzak],
  playback: true, info: '<h3>…</h3>',
});
sim.scene, sim.camera, sim.renderer, sim.controls
sim.onUpdate((dt, t) => {})   // duraklatılınca durur, hız çarpanı uygulanmış dt (≤0,1 s × hız)
sim.onRender((realDt) => {})  // her kare
sim.onReset(() => {}); sim.reset(); sim.pause(); sim.play(); sim.setSpeed(2)
sim.label('metin', { parent, position:[x,y,z], className:'plain'|'big'|'clickable' }) → CSS2DObject (.setText, .el)
sim.hud.show(html, { timeout, tone:'good'|'bad'|'warn' }); sim.hud.hide(); sim.hud.el
sim.toast('mesaj', 'good'|'bad'|'warn')
sim.onClick(objects | () => objects, (hit, ev) => {})   // sürükleme değil gerçek tıklama
sim.raycast(ev, objects), sim.pointOnPlane(ev, plane), sim.dom  // sürükle-bırak için (sim.controls.enabled=false yap)
sim.moveCamera([x,y,z], [tx,ty,tz]); sim.formatTime = t => '…'

const ui = sim.ui;
ui.section('Başlık')                         // sonraki kontroller bu bölüme
ui.slider({ label, min, max, step, value, unit, format:v=>'', onChange, onInput }) → { value, set(v, fire) }
ui.toggle({ label, value, onChange }) ; ui.select({ label, options:[{value,label}], value, onChange })
ui.segmented({ label, options, value, onChange }) ; ui.button({ label, onClick, variant:'primary'|'danger'|'good' })
ui.buttons([{ label, onClick, variant }]) ; ui.stat({ label, unit }) → set(v, 'good'|'warn'|'bad')
ui.meter({ label, color }) → set(0..1, metin) ; ui.text(html, 'card'|'good'|'bad') → set(html)
ui.chart({ title, series:[{name,color,fill}], maxPoints, yMin, yMax, format }) → push([v1,v2…]), clear()

// util: clamp, lerp, mapRange, smoothstep, rand, randInt, pick, gauss, seeded(seed), TAU, heatColor(t),
// fmt(n, basamak), fmtClock, textTexture, textPlane(text, yükseklik, opts), disposeObject, makeGround, instanced
```

## Doğrulama (zorunlu, bitirmeden önce)
1. Derle: `cd /root/simlab && node build.mjs --only <id>` → hata yok.
2. Duman testi: `cd /root/simlab && SHOT_DIR=/root/simlab/shots flock /tmp/simlab-smoke.lock timeout 400 node smoke.mjs <id>` → `✓`.
3. Görsel kontrol (asıl ölçüt): `cd /root/simlab && timeout 600 flock /tmp/simlab-smoke.lock node dev/shot.mjs
   "file:///root/simlab/dist/sims/<id>/index.html?low" shots/<id>.png 8000 1100 620` → görüntüyü Read ile aç,
   `reference/acik-deniz.png` ile yan yana düşün ve QUALITY.md maddelerini tek tek işaretle. Düz renk yüzey, çıplak kutu,
   boş arka plan, soluk/aşırı pozlama, kaybolan nesne, okunmayan etiket varsa düzelt ve tekrar çek.
   Bu sunucuda WebGL yazılımla çalışır: bir çekim 1–6 dk sürer; tek Chromium kuralı (`flock`) zorunlu. `pkill -f` kullanma.
4. Önce/sonra: `shots-before/<id>.png` eski hâlidir; yeni görüntü açıkça üstün olmalı.
