# SimLab Görsel Kalite Standardı

**Tek standart, 63 simülasyonun hepsi için.** Referans `reference/acik-deniz.png` (Açık Deniz). Hedef bu referansın
**üstü**: yan yana konduğunda Açık Deniz amatör kalmalı. Bu listenin tek maddesini bile geçemeyen simülasyon
"bitti" sayılmaz ve teslim edilmez. Kategori, yaş grubu ya da konu farkı istisna değildir.

## 1. Işık ve renk (hepsi zorunlu)
- [ ] Işık tek fiziksel kaynaktan gelir: açık hava sahneleri `sky` (atmosfer + güneş + ortam ışığı); iç mekân / mikro /
      uzay sahneleri motorun stüdyo, doku ya da uzay aydınlatması. Elle rastgele `HemisphereLight` + `DirectionalLight` yok.
- [ ] HDR + sinematik ton eşleme + pozlama; hiçbir yüzey düz, gölgesiz tek renk değildir.
- [ ] Gölgeler açık ve nesneler zemine oturur (temas gölgesi / AO).
- [ ] Parlayan şeyler (güneş, ekran, ateş, LED, yıldız) gerçekten parlar (bloom), fakat sahne soluklaşmaz.

## 2. Malzeme ve biçim
- [ ] `MeshBasicMaterial` yalnız yazı, çizgi ve ışık kaynağı için. Diğer her şey PBR (motorun prosedürel malzemeleri).
- [ ] Her yüzeyin dokusu vardır (prosedürel albedo + pürüzlülük + mikro normal): ahşap ahşaba, beton betona, deri deriye benzer.
- [ ] Çıplak ilkel şekil (kutu/silindir/küre) tek başına nesne olarak kullanılmaz; pah, profil, detay, varyasyon şarttır.
- [ ] Doğal nesneler (bitki, kaya, hücre, mercan, hayvan) çeşitlilik gösterir: ölçek, renk, biçim tek tip değildir.

## 3. Sahne ve atmosfer
- [ ] Arka plan düz renk değildir: gökyüzü, uzay, su altı ya da tasarlanmış stüdyo ortamı.
- [ ] Derinlik hissi: hava perspektifi / sis / su altı saçılması / alan derinliği.
- [ ] Sahne yaşar: rüzgâr, su, parçacık, ışık değişimi — donuk maket yok.
- [ ] Bilim modeli görüntünün kendisidir (ör. tsunami yüksekliği gerçekten suyu kaldırır); veri katmanları
      (ısı haritası, etiket) açılıp kapanabilir ve gerçekçi görüntünün üstüne biner, onun yerine geçmez.

## 4. Kamera ve kompozisyon
- [ ] İlk açılış karesi bir fotoğraf gibi kurgulanmıştır (ufuk çizgisi, odak nesnesi, ışık yönü).
- [ ] En az bir "yakın" ve bir "genel" bakış; geçişler yumuşak.

## 5. Doğrulama (her simülasyon, teslimden önce)
1. `node build.mjs --only <id>` hatasız.
2. `node smoke.mjs <id>` ✓ (konsol hatası yok, kontroller çalışıyor, mobilde taşma yok).
3. `node dev/shot.mjs <sim url> shots/<id>.png` → görüntü `reference/acik-deniz.png` ile **yan yana** incelenir;
   yukarıdaki her madde tek tek işaretlenir. Bir madde bile eksikse düzeltilir, tekrar çekilir.
4. Önce/sonra: `shots-before/<id>.png` ile karşılaştırma kullanıcıya gösterilir.

## 6. Performans (kaliteden ödün vermeden)
- Masaüstünde tam kalite; telefonda (`LOW`) aynı görüntü dili, daha düşük çözünürlük / örnek sayısı.
  Kalite katmanı kapatılarak değil, ölçeklenerek hafifletilir.
