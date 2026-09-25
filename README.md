# 🔬 SimLab — İnteraktif 3B Simülasyon Platformu

Biyoloji, kimya, fizik, anatomi, afet, iklim, meslek, güncel konular ve daha fazlası: **63 interaktif simülasyon**, Three.js ile.
Her yaş grubuna uygun; filtrelenebilir katalog, Türkçe arayüz, mobil uyumlu, **internet ve sunucu gerektirmez**.

## Hemen aç
`dist/index.html` dosyasına çift tıkla. Hepsi bu kadar. (Chrome, Edge, Firefox, Safari; WebGL gerekir.)

Web'de yayınlamak için `dist/` klasörünü herhangi bir statik barındırmaya (Vercel, Netlify, GitHub Pages, Cloudflare Pages)
olduğu gibi yükle.

## Geliştirme
```bash
npm install
npm run build                     # dist/ içine her şeyi derler
node build.mjs --only deprem-ani  # tek simülasyonu hızlıca derle
node build.mjs --dev              # küçültmeden (hata ayıklama için)
npm test                          # headless Chromium ile tüm sayfaları dener (playwright-core gerekir)
node pack.mjs                     # simlab.zip üretir
```

## Yapı
```
src/catalog.js           63 simülasyonun kaydı (kategori, yaş grubu, açıklama)
src/core/                Ortak çekirdek: sahne, kamera, panel, grafik, etiket, HUD (→ dist/assets/simcore.js)
src/sims/<id>/main.js    Her simülasyon (→ dist/sims/<id>/)
src/site/style.css       Tema
build.mjs                esbuild ile derleme + sayfa üretimi
smoke.mjs                Otomatik tarayıcı testi
SIM_GUIDE.md             Yeni simülasyon yazma rehberi ve çekirdek API'si
```

Yeni simülasyon eklemek: `src/catalog.js`'e bir satır ekle, `src/sims/<id>/main.js` yaz (bkz. `SIM_GUIDE.md`),
`node build.mjs --only <id>`.

Three.js çekirdeği tüm sayfalarca paylaşılır (tek dosya, ~800 KB); her simülasyon yalnızca kendi kodunu yükler.

## Not
Simülasyonlar eğitim amaçlıdır ve basitleştirilmiş modellere dayanır. Tıbbi, afet ve güvenlik içerikleri resmî
kaynakların (AFAD, Sağlık Bakanlığı, ERC/AHA) yerini tutmaz.
