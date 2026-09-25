# SimLab — Simülasyon Yazım Rehberi

Her simülasyon tek bir klasördür: `src/sims/<id>/main.js` (gerekirse aynı klasörde yardımcı dosyalar, göreli import).
`<id>`, başlık ve açıklama `src/catalog.js` içinde tanımlıdır. **catalog.js, core/, build.mjs, smoke.mjs ve style.css'e dokunma.**
Referans örnek: `src/sims/gunes-sistemi/main.js`. Yazmadan önce onu ve `src/core/*.js` dosyalarını oku.

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
2. Tarayıcı testi (sunucuda tek Chromium çalışabilir, kilitle sırala):
   `cd /root/simlab && SHOT_DIR=/root/simlab/shots flock /tmp/simlab-smoke.lock timeout 300 node smoke.mjs <id> --shots`
   → `✓` olmalı (konsol hatası yok, döngü dönüyor, mobilde yatay taşma yok). Test tüm kaydırıcı/düğme/seçimleri
   kurcalar; bu sırada hata veren kodu düzelt.
3. `shots/<id>.png` ve `shots/<id>-after.png` ekran görüntülerini Read ile **gözünle kontrol et**: sahne boş/siyah mı,
   nesneler kadrajda mı, etiketler okunuyor mu, panel dolu mu? Bu sunucuda WebGL yazılımla çalışır (saniyede 1–3 kare);
   yavaşlık normal, görüntü doğruluğu önemli.
