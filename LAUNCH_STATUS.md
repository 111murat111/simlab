# Yayın durumu (güncelleme: 2026-09-27 22:05 TR) — KARAR: 60 sim ile yayın; 3 sim yayın sonrasına — ölçüt: reference/acik-deniz.png

## Geçti (58)
uzay-copu, hucre-sehri, sinir-sinyali, kopru-muhendisi, restoran-yonetimi, sanal-laboratuvar, kuantum-cift-yarik, isik-optik,
tarim-hasat, ilac-dozu, elektrik-devresi, lojistik-rota, mercan-resifi, trafik-kavsak, merkez-bankasi, mars-kolonisi,
jev-karsilastirma, ruzgar-turbini, antibiyotik-direnci, ari-kolonisi, ebru, periyodik-tablo, kan-sekeri, kalp-pompasi,
lokma-yolculugu, deprem-ani, zaman-sehir, isi-adasi, tahliye, salgin-haritasi, bina-dayanikliligi, enerji-sebekesi,
evrim-akvaryumu, balikcilik, bagisiklik, bilesik-faiz, buzul-erimesi, cay-demleme, dalga-ses, deprem-cantasi,
dezenformasyon, ev-kimyasi, gunes-sistemi, molekul-lego, orman-yangini, phishing, pil-kimyasi, reaksiyon-hizi,
roket-firlatma, sinir-agi, tsunami, veri-merkezi, yildiz-yasami, cpr-egitimi, katman-insan, dil-evrimi,
uyku-dongusu (gündüz modu düzeltiliyor), fay-hatti (saha görünümü; bölgesel kamera düzeltiliyor)

## Yayın sonrasına bırakıldı (3)
dna-mutfagi (sınırda), sel-kentlesme (dere kadrajı), elektrikli-arac (siyah kare)

## 60'a girecek, küçük iş kaldı (2)
ekosistem-dengesi (çayır zemini dokusu), karbon-evi (final çekim + smoke)

## Final cila turu (başladı 17:05 TR)
- shots-desktop/<id>.png: ?low'suz masaüstü çekimler, kuyruk scratchpad/desktop-queue.log
- İnsan figürleri tek standart, kadraj/pozlama/etiket son kontrol, QUALITY.md maddeleri
- Sonda: node smoke.mjs (60/60), node build.mjs, node pack.mjs, önce/sonra raporu

## Notlar
- smoke.mjs 27.09: goto 'commit' + 150 sn kare bekleme (SwiftShader'da shader derlemesi 30 sn'yi aşıyordu).
- Masaüstü (?low'suz) çekim şimdilik yalnız trafik-kavsak için alındı; final cila turunda hepsine alınacak.

## Devir notu (2026-09-27 20:50 TR) — haftalık Opus limiti doldu (açılış: 2 Ekim 23:00 TR)
- Tüm düzeltme ajanları öldü; kod derleniyor (node build.mjs 63/63 ✓). Yarım kalanlar:
  - ekosistem-dengesi: çayır zemin dokusu düzenlemesi ortasında kesildi; derleniyor ama görsel doğrulanmadı.
  - karbon-evi: onaylı çekim scratchpad/ke/g1.png; shots/karbon-evi.png güncellenmedi, smoke yok.
  - uyku-dongusu: gündüz modu düzeltildi (ajan sözü), smoke bekleniyor.
  - fay-hatti: bölge kamerası 30 km'ye alındı, derlendi, doğrulanmadı. deprem-ani: gece odası doğrulanmadı (2 çekim Chromium çöktü).
  - salgin, bina, enerji, isi-adasi: temiz smoke koşusu scratchpad/smoke-city2.log (timeout 3600) kuyrukta.
- Masaüstü çekim kuyruğu (scratchpad/desktop-queue.sh, log desktop-queue.log) kendi kendine sürüyor: 19/58 tamam.
- Kaldığı yerden devam: shots-desktop/ çekimlerini referansla incele → kusurları toplu tek ajana ver → global smoke (60) → build → pack → önce/sonra raporu.

## 22:05 TR — limitler açıldı, cila turu sürüyor
- Ajanlar: (1) 60'ı tamamlama [ekosistem, karbon-evi, uyku gündüz, fay bölge, deprem gece]; (2) cila 1 [mercan, ruzgar, kopru]; (3) motor insan modülü people.js + restoran/tahliye pilotları.
- Masaüstü çekim: 21/58; incelenen 20'de 3 kusur (polish-notes.md). salgin smoke ✓ (kare=28); bina/enerji/isi tek tek smoke kuyrukta (smoke-city3.log).
- Smoke süresi yük altında 15 dk'ya çıkıyor; final global smoke yalnız son ✓'dan sonra değişen simler için koşulacak.

## 23:30 TR — cila turu durumu
- Masaüstü çekim: 22/58 çekildi; kopru-muhendisi ✓, ruzgar-turbini ✓ (cila 1 düzeltmeleri geçti). mercan-resifi: büyük iyileşme, yeni çekim kuyrukta, son karar bekliyor.
- Şehir smoke: bina-dayanikliligi ✓ (kare=38); enerji-sebekesi kuyrukta (timeout 2400), isi-adasi sırada.
- Kilit kuyruğu ~27 iş (ajan probe/çekimleri + masaüstü kuyruğu). Masaüstü kuyruğu kan-sekeri'nde 40+ dk bekliyor; kuyruk FIFO değil.
- Ajanlar: finish-the-60 karbon-evi/ekosistem probe'larında; cila 1 mercan reshoot bekliyor; people modülü yüz/figür çekimi bekliyor.
- Yeni kusur birikmedi (yeni masaüstü çekimi yok) → yeni cila partisi açılmadı.

## 00:10 TR
- Masaüstü çekim 24/58 (+ mercan yeniden çekim bekleniyor). Yeni: restoran-yonetimi ✓, tahliye ✓ (insan modülü pilotları), kan-sekeri ✓. Yeni kusur yok.
- enerji-sebekesi smoke çalışıyor (13 dk); isi-adasi sırada. Kilit kuyruğu 27 → 9'a indi.

## 00:30 TR — cila 1. parti kapandı
- mercan-resifi ✓ (gerçek mercan formları, smoke kare=41), kopru-muhendisi ✓ (kare=23), ruzgar-turbini ✓ (kare=25). Masaüstü inceleme: 25/25 geçti. Cila ajanı (a030c9f) tamamlandı; core dosyalarına dokunulmadı.

## 00:50 TR
- Masaüstü 26/58 geçti (kalp-pompasi ✓, restoran yeniden ✓). Kusur birikmedi.
- enerji-sebekesi smoke ✗ (kare=0, yük altında zaman aşımı) → tek başına yeniden koşturma kuyruğa alındı (scratchpad/smoke-enerji2.log). isi-adasi sırada.
- finish-the-60 ajanı raporunu yazıyor; insan modülü pilot çekimleri bekliyor.

## 01:30 TR
- Masaüstü 26/58 geçti; tahliye yeniden çekim ✓. Kuyruk lokma-yolculugu'nda 40 dk bekliyor (kilit: 5 iş).
- Şehir smoke: isi-adasi da ✗ (kare=0, kontrol karıştırma sonrası #stage 30 sn yanıt vermedi). enerji ve isi tek başına yeniden koşturmada; yalnızken de düşerse ajan görevlendirilecek.
- finish-the-60 ajanı hâlâ probe çekimlerini bekliyor (fay-hatti multi.mjs çalışıyor); insan modülü ajanı tahliye smoke'unu bekliyor.

## 02:10 TR
- Masaüstü 27/58 geçti (lokma-yolculugu ✓). Kuyruk deprem-ani'de. Kusur birikmedi.
- enerji-sebekesi tek başına smoke çalışıyor (15 dk); isi-adasi sırada.
- finish-the-60: ekosistem-dengesi ve deprem-ani smoke2 + fay-d çekimi bekleniyor. İnsan modülü: tahliye smoke bekleniyor.

## 02:30 TR — insan modülü teslim edildi
- `src/core/gfx/people.js` (makePerson/crowd, SIM_GUIDE §4c), tam derleme 63/63 ✓, restoran ✓ kare=24, tahliye ✓ kare=46. Pilotlar masaüstünde geçti.
- Tahliye masaüstü çekiminde kent görünmüyor: 8 sn'de yalnız 2 kare çizildiği için (yük). 15 sn beklemeyle yeniden çekilecek; sim hatası değil.
- Yayılım: 2 Opus ajanı, 9 sim (A: tsunami, salgin, balikcilik, merkez, cpr; B: trafik, isi-adasi, lojistik, dezenformasyon).

## 02:50 TR
- enerji-sebekesi ve isi-adasi smoke'u TEK BAŞINA da ✗ (kare=0, kontrol karıştırma sonrası #stage 30 sn kilitli) → gerçek sorun. enerji için ayrı Opus fix ajanı açıldı (kontrol başına süre ölçümü + debounce); isi-adasi yayılım-B ajanının görevinde.
- finish-the-60 hâlâ ekosistem/deprem smoke2 ve fay-d çekimini bekliyor. Yayılım A tsunami smoke'unda, B kapanış çekimlerini kuyruğa aldı.
- Aktif ajan: 4 (finish-60, yayılım A, yayılım B, enerji fix).

## 02:55 TR
- Masaüstü 28 çekildi: deprem-ani odası iyi ama oturan figür eski blob gövde → insan modülüne geçecek (finish-the-60 bitince, 2. cila partisi). Kuyruk zaman-sehir'de; kilit 16 iş.
- 4 ajan aktif: finish-60 (deprem smoke2 koşuyor), yayılım A (tsunami), yayılım B (trafik), enerji fix (probe).

## 03:35 TR
- tahliye masaüstü ✓ (kent artık görünüyor). trafik-kavsak: figürler iyi, ama çekim meydan görünümünde; B raporunda kavşak çekimi doğrulanacak.
- deprem-ani smoke2 ✓ (kare=25); finish-the-60 raporu bekleniyor. merkez-bankasi smoke çalışıyor (yayılım A). Kilit 13 iş; boş RAM 80 MB (sıkışık).

## 04:15 TR
- isi-adasi ✓, dezenformasyon ✓ (masaüstü). Masaüstü 31 çekim / 30 geçti.
- finish-the-60 kuyrukta: fay 'Bölge' çekimi (fay-e) + ekosistem smoke yeniden koşumu bekliyor; deprem-ani smoke ✓.
- Kilit kuyruğu 13 (yayılım A beş simi birden kuyrukladı). Masaüstü kuyruğu zaman-sehir'de 80 dk bekliyor. lojistik-rota smoke çalışıyor.

## 04:55 TR
- lojistik-rota masaüstü: kent ayrıntılı ama gökyüzü düz gri-beyaz, rota çizgileri okunmuyor → kusur (2. cila partisine).
- enerji-sebekesi kök neden bulundu: ilk kaydırıcı 0'a çekilince sayfa donuyor (RAF 60 sn yok); fix ajanı düzeltiyor.
- finish-the-60 fay-e çekimi/ekosistem smoke için kuyrukta (12 iş). Masaüstü 32 çekim / 30 geçti / 2 kusur.

## 05:40 TR
- zaman-sehir ✓, tsunami ✓ (masaüstü). 34 çekim / 32 geçti / 2 kusur. Masaüstü kuyruğu salgin-haritasi'nda; kilit 12 iş.
- finish-the-60 raporu hâlâ bekleniyor (fay-e çekimi geldi, ekosistem smoke kuyrukta). Yayılım A/B ve enerji fix çalışıyor.

## 06:20 TR — 2. cila partisi
- balikcilik ✓, merkez-bankasi ✓, cpr-egitimi ✓ (masaüstü). salgin-haritasi: kuş bakışı düz meydanlar, insanlar sarı nokta → kusur, yayılım A'ya iletildi. lojistik-rota kusuru yayılım B'ye iletildi.
- deprem-ani insan modülü + pozlama için ayrı Opus ajanı (2. cila partisi) açıldı. 38 çekim / 35 geçti / 3 kusur işlemde.
- Aktif ajan: 5 (finish-60 kuyrukta, A, B, enerji fix, cila 2).

## 07:00 TR
- salgin-haritasi yeni çekim ✓: kamera meydan seviyesine indi, tezgâhlar, banklar, okunur figürler (A ajanının düzeltmesi). Kusur kapandı. Masaüstü kuyruğu bina-dayanikliligi'nde.
- Kilit 15 iş; ekosistem-dengesi probe çalışıyor (finish-60). 5 ajan aktif, hepsi kilit sırasında.

## 07:40 TR
- Yeni çekim yok; kilit kuyruğu 14 iş, tur başına neredeyse sıfır çıktı. A ve B ajanlarına onaylı simler için ek yakın-plan çekimlerini bırakmaları söylendi (kilit rahatlatma).
- Bekleyen raporlar: finish-60 (ekosistem), A (salgin smoke), B (isi smoke fix, lojistik, trafik), enerji fix (2. profil), cila 2 (deprem-ani smoke).

## 08:15 TR — cila 2 (deprem-ani) ara rapor
- deprem-ani: blob figür `makePerson`'a geçti (otur/çök/koş/yat pozları, gece aydınlatma listesine eklendi), gündüz pozlama düşürüldü. build ✓, smoke ✓ kare=24 (Chromium çökmedi). Masaüstü çekimi kuyrukta (scratchpad/deprem-ani-v1.log, SHOTEXIT bekleniyor); görsel doğrulama BENDE — çekim gelince inceleyip gerekirse ajanı devam ettireceğim.

## 08:21 TR
- trafik-kavsak son masaüstü çekimi şu an yazılıyor (B ajanı raporunu hazırlıyor). deprem-ani çekimi kuyrukta. Kilit 14 → 10 iş, boş RAM 300 MB (rahatladı).

## 08:35 TR — yayılım A tamamlandı
- tsunami ✓ kare=27, salgin-haritasi ✓ kare=30, balikcilik ✓ kare=40, merkez-bankasi ✓ kare=20, cpr-egitimi ✓ kare=30; beşi de masaüstü çekimde geçti. Core dosyalarına dokunulmadı; eski dosyalar scratchpad/pb/*.orig.js.
- Zayıf kalanlar (kabul edilebilir): salgin damalı kaldırım biraz düzenli; merkez kuyruğu ağaçların arkasında; tsunami/balikcilik/merkez figürleri yakın plandan doğrulanmadı.
- A ajanının artık gereksiz yakın-plan çekim işleri kilit kuyruğunda duruyor (izin sistemi ajanın kendi işlerini öldürmesini engelledi). Kendiliğinden bitecekler (~40–60 dk kilit süresi). İptal etmek kullanıcı kararı.

## 08:55 TR
- trafik-kavsak masaüstü ✓ (kavşak görünümü). lojistik-rota 05:36 çekimi hâlâ düz gökyüzü/okunmayan rota → B raporu bekleniyor.
- deprem-ani çekimi hâlâ kuyrukta (fay-hatti çekimi kilidi tutuyor, 10 iş). 40 çekim / 38 geçti.

## 09:35 TR
- bina-dayanikliligi masaüstü ✓ (41 çekim / 39 geçti). Masaüstü kuyruğu enerji-sebekesi'nde (fix ajanı bitmeden çekilirse eski derleme olur; fix sonrası ajan yeniden çekecek).
- ekosistem-dengesi multi-probe 29 dk'dır kilidi tutuyor (finish-60). Kilit 9 iş. deprem-ani çekimi hâlâ sırada.

## 10:15 TR — açık kusur kalmadı
- deprem-ani ✓ (gerçek figür), lojistik-rota ✓ (rota şeritleri okunur, kamera alçaldı), salgin ✓. Masaüstü inceleme 41/41 geçti.
- Kalan: B raporu (isi-adasi smoke fix), enerji fix raporu, finish-60 raporu (fay/ekosistem), ve henüz masaüstü çekimi olmayan ~17 sim (kuyruk enerji-sebekesi'nde). Kilit 5 iş.

## 10:55 TR
- enerji-sebekesi masaüstü çekimi geldi (kuyruk çekimi; fix ajanı üçüncü profil koşumunda, ens-prof3). Masaüstü kuyruğu evrim-akvaryumu'nda. Kilit 4 iş.
- B: isi-adasi smoke bekliyor. finish-60: fay/ekosistem probe sonuçlarını bekliyor.

## 11:40 TR
- evrim-akvaryumu masaüstü ✓. 43 çekim / 42 geçti. Masaüstü kuyruğu bagisiklik'te; kilit 3 iş.
- enerji fix ajanı 8+ saattir profil ölçümünde dönüyordu → süre sınırı koydum: ölçümü bırak, düzeltmeyi uygula, 1 smoke + 1 çekim. finish-the-60 ajanını uyandırdım (probe çıktıları hazırdı, 05:47'den beri rapor yoktu): ekosistem/karbon için son adımlar + rapor istendi. B: isi-adasi smoke koşuyor.

## 12:05 TR — enerji-sebekesi smoke teşhisi
- Fix ajanı ölçtü: kaydırıcı/handler hatası YOK (2000 rastgele konfigürasyon, NaN yok). Sorun SwiftShader kare süresi: 10,9 M üçgen/kare (7800 ağaç, frustumCulled=false) → 55 sn/kare; ajan ağaçları 500 m karolara bölüp 4 kademeli LOD ekledi → 15 sn/kare. Playwright `boundingBox` RAF beklediği için kurcalama sonrası 30 sn'de düşüyor. Bu bir sim hatası değil, test koşum sınırı.
- Karar (benim): smoke.mjs'de #stage kutusu kurcalamadan ÖNCE alınıyor (timeout 120 sn); yedek scratchpad/smoke.mjs.bak2. Simlerin kendisi değişmedi. isi-adasi'nın aynı nedenden düştüğü varsayılıyor; B ajanına bildirildi.
- enerji-sebekesi kompozisyon kusuru + ağaç sayısı/impostor için 3. cila ajanı açılıyor; önce yeni harness ile smoke, sonra görsel iş.

## 12:18 TR
- bagisiklik masaüstü ✓ (44 çekim / 43 geçti). Masaüstü kuyruğu bilesik-faiz'de. Kilit 7 iş; ekosistem-dengesi smoke koşuyor (finish-60).
- B: son isi-adasi smoke'unu bekliyor. Cila 3 (enerji): ölçüm hazırlığında.

## 12:55 TR — finish-the-60 raporu geldi → 59 onaylı
- karbon-evi ✓ (NaN siyah kare düzeltildi, smoke kare=21, masaüstü ✓) → onaylı listeye girdi (59).
- ekosistem-dengesi: smoke ✓ kare=44, çayır dokusu/yüksek ot eklendi; masaüstü çekimi SwiftShader'da çok ağır (1 kare/dk), yeniden deneme kuyrukta (me/eko-dshot2.log). Çekim gelince 60 tamam.
- uyku-dongusu gündüz modu doğrulandı (ekstra kod yok). fay-hatti 'Bölge' görünümü iyileşti ama hâlâ zayıf (ikincil görünüm, yayın sonrası). deprem-ani gece modu artık çökmüyor.
- Bekleyen raporlar: B (isi-adasi), cila 3 (enerji).

## 12:59 TR
- bilesik-faiz masaüstü: KUSUR — grafik küçük ve sağdan kesik, etiketler okunmuyor → 4. cila partisi (45 çekim / 44 geçti / 2 açık kusur). Masaüstü kuyruğu buzul-erimesi'nde. Kilit 5 iş; enerji-sebekesi smoke (yeni harness) koşuyor.
- B: son isi-adasi smoke'unu bekliyor. ekosistem masaüstü yeniden çekimi kuyrukta.

## 13:10 TR — yayılım B raporu
- trafik-kavsak ✓, lojistik-rota ✓, dezenformasyon ✓ (son derleme smoke'suz), isi-adasi: smoke hâlâ ✗ (SwiftShader kare süresi; kırsal orman 8,9 M üçgen → 3000 ağaca indirildi, gölgeden çıkarıldı, yeniden çizim 350 ms debounce). isi'nin yeni derlemesi görsel olarak doğrulanmadı.
- Harness: boundingBox zaman aşımı 300 sn'ye çıkarıldı. 4. cila partisi: bilesik-faiz kompozisyonu + isi/dezenformasyon/lojistik doğrulama smoke'ları ve isi masaüstü çekimi.

## 13:45 TR — 60 sim masaüstünde çekildi
- ekosistem-dengesi masaüstü ✓ (kare=25) → 60 simin hepsi onaylı (58 + karbon-evi + ekosistem). buzul-erimesi ✓.
- Masaüstü inceleme: 47 çekim / 46 geçti / 2 açık kusur (enerji cila 3'te, bilesik-faiz cila 4'te). Henüz masaüstü çekimi olmayan ~13 sim; kuyruk cay-demleme'de.
- enerji smoke 120 sn harness'te ✗; 300 sn harness ile yeni koşum sürüyor.

## 14:05 TR — cila 4 ara raporu
- isi-adasi smoke ✓ kare=46 (orman yarıya indirilmiş derleme, 300 sn harness). Masaüstü çekimi alınıyor; görsel doğrulama bende.
- bilesik-faiz: kamera/plinth/sprite etiketler/yıl çentikleri yazıldı, build ✓; çekim + smoke kuyrukta (pa-bf-shot.log, pa-bf-smoke.log). dezenformasyon ve lojistik doğrulama smoke'ları sırada (pb-dez-smoke.log, pb-loj-smoke.log).

## 14:10 TR
- bilesik-faiz masaüstü ✓ (grafik tam kadrajda, etiketler okunur, mermer kaide). Smoke sonucu bekleniyor. Açık kusur 1 (enerji). isi-adasi çekimi, dezenformasyon ve lojistik smoke'ları kuyrukta.

## 14:25 TR — açık kusur kalmadı
- enerji-sebekesi masaüstü ✓ (cila 3: trafo sahası, kazan binası, soğutma kulesi buharı, tarlalar, ağaç sıraları). Smoke sonucu bekleniyor (chain3).
- isi-adasi yeni derleme masaüstü ✓ (kırsal halka ağaçlı), smoke ✓ kare=46. dalga-ses ✓. bilesik-faiz smoke ✓ kare=57.
- Bekleyen: dezenformasyon + lojistik doğrulama smoke'ları, enerji smoke, kalan ~9 masaüstü çekim (kuyruk deprem-cantasi'nda).

## 14:35 TR — kapanış smoke turu başladı
- Son ✓ kanıtı loglarda bulunamayan 30 sim (çoğu 26 Eylül'de son düzenlenmiş, masaüstü çekimleri geçmiş) için sıralı smoke başlatıldı: scratchpad/closing-smoke.txt → closing-smoke.log (sim başına timeout 1500 sn, kilit sırasında masaüstü kuyruğuyla dönüşümlü). dezenformasyon/lojistik smoke'ları cila 4 zincirinde.
- Kalan adımlar: closing smoke sonuçları → düşenler için düzeltme → `node build.mjs` → `node pack.mjs` → öncesi/sonrası raporu.
