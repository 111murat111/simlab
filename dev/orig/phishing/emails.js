// Oltalama senaryoları — tüm marka, kişi ve alan adları KURGUSALDIR. level: 1 kolay, 2 orta, 3 zor.
// clue.at: 'from' | 'subject' | 'p<n>' | 'link<n>' | 'attach<n>' ; clue.type: CLUE anahtarı
export const CLUE = {
  domain: '🌐 Sahte ya da benzer alan adı',
  urgency: '⏰ Aciliyet, korku ya da tehdit',
  link: '🔗 Bağlantı metni ile gerçek adres farklı',
  attach: '📎 Tehlikeli ek (.exe, .zip, çift uzantı)',
  iban: '🏦 IBAN / ödeme bilgisi değişikliği',
  lang: '✍️ Dil ve yazım hataları',
  otp: '🔑 Şifre ya da tek kullanımlık kod (OTP) isteği',
  prize: '🎁 Gerçek olamayacak kadar iyi teklif',
  card: '💳 Kart bilgisi ya da küçük ödeme isteği',
  verify: '📞 "Başka kanaldan teyit etmeyin" uyarısı',
  ok: '✅ Güven işareti',
};

export const EMAILS = [
  {
    level: 1, phish: true, fromName: 'HızlıKargo', fromAddr: 'destek@hizli-kargo-teslimat.xyz', date: 'Bugün 09:12',
    subject: 'Paketiniz teslim edilemedi!',
    body: [
      'Sayın müşterimiz,',
      'Paketiniz adres bilgisi eksik oldugu için teslim edilememiştir. Paketiniz 24 saat içinde iade edilecekdir.',
      'Yeniden gönderim için 12,90 TL adres doğrulama ücretini hemen ödeyiniz.',
    ],
    links: [{ text: 'hizlikargo.com.tr/takip', url: 'http://hizlikargo-odeme.xyz/tr/pay', button: false }],
    attachments: [],
    clues: [
      { at: 'from', type: 'domain', note: 'Gönderen "hizli-kargo-teslimat.xyz": şirketin kendi alan adı değil.' },
      { at: 'p1', type: 'urgency', note: '"24 saat içinde iade" ile acele ettiriliyor. Yazım hataları da var ("oldugu", "edilecekdir").' },
      { at: 'p2', type: 'card', note: 'Küçük bir ücret isteniyor: amaç kart bilgilerinizi almak.' },
      { at: 'link0', type: 'link', note: 'Bağlantıda "hizlikargo.com.tr" yazıyor ama gerçek adres "hizlikargo-odeme.xyz".' },
    ],
  },
  {
    level: 1, phish: true, fromName: 'Anadolu Dijital Bank', fromAddr: 'guvenlik@anadoIudijital.com', date: 'Bugün 08:47',
    subject: '⚠ Hesabınız askıya alındı',
    body: [
      'Değerli müşterimiz,',
      'Hesabınızda olağandışı işlem tespit edildi ve hesabınız kısıtlandı. 2 saat içinde doğrulama yapmazsanız hesabınız kalıcı olarak kapatılacaktır.',
      'Doğrulama sayfasında internet şubesi şifrenizi ve telefonunuza gelen SMS kodunu giriniz.',
    ],
    links: [{ text: 'Hemen Doğrula', url: 'http://anadoludijital-dogrulama.com/giris', button: true }],
    attachments: [],
    clues: [
      { at: 'from', type: 'domain', note: '"anadoIudijital": küçük L yerine büyük i (I) kullanılmış; üstelik uzantı .com.tr değil.' },
      { at: 'p1', type: 'urgency', note: '"2 saat içinde kalıcı olarak kapatılacak" — panik yaratıp düşünmeden tıklatma taktiği.' },
      { at: 'p2', type: 'otp', note: 'Bankalar e-postayla şifre ya da SMS kodu İSTEMEZ.' },
      { at: 'link0', type: 'link', note: 'Düğme bankanın değil "anadoludijital-dogrulama.com" adresine gidiyor.' },
    ],
  },
  {
    level: 1, phish: true, fromName: 'Çarşım Çekiliş', fromAddr: 'cekilis@carsim-hediye.net', date: 'Dün 22:03',
    subject: 'TEBRİKLER!!! Akıllı telefon kazandınız 🎉',
    body: [
      'Çarşım 10. yıl çekilişinde 1.000.000. ziyaretçi siz oldunuz!',
      'Yeni model akıllı telefonunuzu almak için sadece 49 TL kargo ücreti ödemeniz yeterli. Kampanya son 15 dakika!',
    ],
    links: [{ text: 'Hediyemi Al', url: 'http://carsim-hediye.net/odul?id=88213', button: true }],
    attachments: [],
    clues: [
      { at: 'subject', type: 'prize', note: 'Katılmadığınız bir çekilişte büyük ödül: klasik tuzak.' },
      { at: 'from', type: 'domain', note: 'Mağazanın adresi "carsim.com.tr"; bu ise "carsim-hediye.net".' },
      { at: 'p1', type: 'urgency', note: '"Son 15 dakika" ile düşünme süresi elinizden alınıyor; "sadece 49 TL" kart bilgisi avı.' },
      { at: 'link0', type: 'link', note: 'Bağlantı mağazaya değil başka bir siteye gidiyor.' },
    ],
  },
  {
    level: 1, phish: false, fromName: 'Çarşım', fromAddr: 'siparis@carsim.com.tr', date: 'Bugün 10:30',
    subject: 'Siparişiniz kargoya verildi (#TR48213)',
    body: [
      'Merhaba Deniz,',
      '#TR48213 numaralı siparişiniz HızlıKargo ile yola çıktı. Tahmini teslim: 2 iş günü.',
      'Sipariş ayrıntılarını hesabınızdaki "Siparişlerim" bölümünden görebilirsiniz.',
    ],
    links: [{ text: 'www.carsim.com.tr/hesabim/siparisler', url: 'https://www.carsim.com.tr/hesabim/siparisler', button: false }],
    attachments: [],
    clues: [
      { at: 'from', type: 'ok', note: 'Gönderen, mağazanın bilinen alan adı (carsim.com.tr).' },
      { at: 'p0', type: 'ok', note: 'Adınızla hitap ediyor ve gerçekten verdiğiniz bir siparişten söz ediyor.' },
      { at: 'link0', type: 'ok', note: 'Bağlantı metni ile gerçek adres aynı; ödeme ya da şifre istenmiyor.' },
    ],
  },
  {
    level: 1, phish: true, fromName: 'Muhasebe Birimi', fromAddr: 'fatura@e-fatura-bildirim.info', date: 'Bugün 07:55',
    subject: 'Ödenmemiş faturanız — yasal takip başlatılacaktır',
    body: [
      'Sayın ilgili,',
      'Ödenmemiş borcunuz bulunmaktadır. Ekteki faturayı açarak detayları inceleyiniz.',
      'Bugün ödeme yapılmazsa dosyanız avukatımıza iletilecektir.',
    ],
    links: [],
    attachments: [{ name: 'Fatura_Mart.pdf.exe', size: '412 KB' }],
    clues: [
      { at: 'attach0', type: 'attach', note: '"pdf.exe": çift uzantı. Aslında çalıştırılabilir bir program — açarsanız zararlı yazılım bulaşır.' },
      { at: 'from', type: 'domain', note: 'Hangi şirketten geldiği belli değil; "e-fatura-bildirim.info" kurumsal bir adres değil.' },
      { at: 'p2', type: 'urgency', note: '"Avukata iletilecek" tehdidiyle korku yaratılıyor.' },
    ],
  },
  {
    level: 1, phish: false, fromName: 'Örnek A.Ş. İnsan Kaynakları', fromAddr: 'ik@ornekas.com.tr', date: 'Pzt 14:20',
    subject: 'Yıllık izin planlaması',
    body: [
      'Merhaba,',
      'Yıllık izin planlarınızı ay sonuna kadar İK portalına girmenizi rica ederiz. Sorularınız için İK ekibine dahili 204\'ten ulaşabilirsiniz.',
    ],
    links: [{ text: 'portal.ornekas.com.tr/izin', url: 'https://portal.ornekas.com.tr/izin', button: false }],
    attachments: [],
    clues: [
      { at: 'from', type: 'ok', note: 'Şirketin kendi alan adından (ornekas.com.tr) geliyor.' },
      { at: 'p1', type: 'ok', note: 'Makul süre veriliyor, tehdit yok; teyit için bilinen dahili numara verilmiş.' },
      { at: 'link0', type: 'ok', note: 'Bağlantı şirket portalına gidiyor; metin ile adres aynı.' },
    ],
  },
  {
    level: 2, phish: true, fromName: 'Demir Lojistik Muhasebe', fromAddr: 'muhasebe@demirlojistik-tr.com', date: 'Bugün 11:05',
    subject: 'Banka hesap bilgilerimiz değişmiştir',
    body: [
      'Merhaba,',
      'Banka hesabımız değişmiştir. Bu ayki 184.500 TL tutarındaki ödemeyi aşağıdaki yeni IBAN\'a yapmanızı rica ederiz: TR12 0006 1000 0000 1234 5678 90',
      'Telefon hatlarımız arızalı olduğundan lütfen telefonla teyit etmeyiniz, ödemeyi bugün yapınız.',
    ],
    links: [],
    attachments: [],
    clues: [
      { at: 'from', type: 'domain', note: 'Tedarikçinin gerçek adresi "demirlojistik.com.tr"; bu ise "demirlojistik-tr.com".' },
      { at: 'p1', type: 'iban', note: 'IBAN değişikliği e-postayla bildiriliyor: şirketlerin en çok para kaybettiği dolandırıcılık türü.' },
      { at: 'p2', type: 'verify', note: '"Telefonla teyit etmeyin" + "bugün yapın": sizi doğrulamadan uzak tutmaya çalışıyor.' },
    ],
  },
  {
    level: 2, phish: true, fromName: 'e-Portal', fromAddr: 'bildirim@eportal-gov.com', date: 'Bugün 13:40',
    subject: 'Vergi iadeniz hazır: 1.250,00 TL',
    body: [
      'Sayın vatandaşımız,',
      'Adınıza 1.250,00 TL vergi iadesi tanımlanmıştır. İadenin hesabınıza aktarılması için kart numaranızı, son kullanma tarihini ve CVV kodunu girmeniz gerekmektedir.',
    ],
    links: [{ text: 'https://www.eportal.gov.tr/iade', url: 'http://eportal-iade.com.tr.giris-dogrula.net/', button: false }],
    attachments: [],
    clues: [
      { at: 'from', type: 'domain', note: 'Resmî kurumlar .gov.tr kullanır; "eportal-gov.com" değil.' },
      { at: 'subject', type: 'prize', note: 'Beklenmedik para iadesi vaadi.' },
      { at: 'p1', type: 'card', note: 'İade için CVV gerekmez — kart bilgisi avı.' },
      { at: 'link0', type: 'link', note: 'Metin ".gov.tr" gösteriyor ama gerçek adres "giris-dogrula.net" sitesine gidiyor (sondaki alan adı belirleyicidir).' },
    ],
  },
  {
    level: 2, phish: false, fromName: 'e-Portal', fromAddr: 'bilgilendirme@eportal.gov.tr', date: 'Sal 16:12',
    subject: 'Yeni bir belgeniz var',
    body: [
      'Sayın Deniz Kaya,',
      'Adınıza yeni bir resmî belge düzenlenmiştir. Güvenliğiniz için bu e-postada bağlantı bulunmamaktadır.',
      'Belgeyi görmek için tarayıcınıza adresi kendiniz yazarak e-Portal\'a giriş yapabilirsiniz.',
    ],
    links: [],
    attachments: [],
    clues: [
      { at: 'from', type: 'ok', note: 'Resmî alan adı: ".gov.tr" ile bitiyor.' },
      { at: 'p1', type: 'ok', note: 'Bağlantı ya da ek yok; sizi kendiniz giriş yapmaya yönlendiriyor — en güvenli yöntem.' },
    ],
  },
  {
    level: 2, phish: true, fromName: 'BulutKasa', fromAddr: 'no-reply@bulutkasa.com-destek.info', date: 'Bugün 06:31',
    subject: 'Depolama alanınız doldu — dosyalarınız silinecek',
    body: [
      'Depolama alanınız %100 doldu. 48 saat içinde işlem yapmazsanız fotoğraflarınız ve belgeleriniz kalıcı olarak silinecektir.',
      'Ücretsiz 50 GB ek alan için hesabınıza tekrar giriş yapın ve şifrenizi onaylayın.',
    ],
    links: [{ text: 'Depolamayı yönet', url: 'https://bulutkasa.com-destek.info/login', button: true }],
    attachments: [],
    clues: [
      { at: 'from', type: 'domain', note: 'Adres "bulutkasa.com-destek.info": gerçek alan adı sondaki "com-destek.info". "bulutkasa.com" yalnızca ön ek.' },
      { at: 'p0', type: 'urgency', note: 'Fotoğrafları kaybetme korkusu ve 48 saat süre.' },
      { at: 'p1', type: 'otp', note: 'Şifre "onaylatma" bahanesi: şifreniz sahte sayfaya yazdırılmak isteniyor.' },
      { at: 'link0', type: 'link', note: 'Düğmenin gerçek adresi "com-destek.info" alan adında.' },
    ],
  },
  {
    level: 2, phish: false, fromName: 'HızlıKargo', fromAddr: 'bilgi@hizlikargo.com.tr', date: 'Bugün 12:02',
    subject: 'Gönderiniz yola çıktı — HK4471902',
    body: [
      'Merhaba Deniz,',
      'HK4471902 numaralı gönderiniz transfer merkezimizden çıktı. Teslimat için herhangi bir ödeme yapmanız gerekmez.',
    ],
    links: [{ text: 'www.hizlikargo.com.tr/takip?no=HK4471902', url: 'https://www.hizlikargo.com.tr/takip?no=HK4471902', button: false }],
    attachments: [],
    clues: [
      { at: 'from', type: 'ok', note: 'Kargo şirketinin kendi alan adı.' },
      { at: 'p1', type: 'ok', note: 'Ödeme istenmiyor; takip numarası sizin siparişinizle eşleşiyor.' },
      { at: 'link0', type: 'ok', note: 'Bağlantı metni ile gerçek adres birebir aynı.' },
    ],
  },
  {
    level: 2, phish: true, fromName: 'Insan Kaynaklari', fromAddr: 'ik@ornekas-ik.com', date: 'Bugün 15:47',
    subject: 'Zam listesi 2026 (GİZLİ)',
    body: [
      'Merhabalar,',
      'Yeni donem zam oranlari ekteki dosyadadir. Lutfen dosyayi acip sirket sifreniz ile giris yapiniz. Dosya bu aksam kaldirilacakdir.',
    ],
    links: [],
    attachments: [{ name: 'Zam_Listesi_2026.zip', size: '1,2 MB' }],
    clues: [
      { at: 'from', type: 'domain', note: 'Şirket adresi "ornekas.com.tr"; bu "ornekas-ik.com" — taklit alan adı.' },
      { at: 'p1', type: 'lang', note: 'Türkçe karakterler yok, yazım hatası var ("kaldirilacakdir"). Kurumsal yazışmada beklenmez.' },
      { at: 'attach0', type: 'attach', note: '.zip içinde zararlı yazılım gizlenebilir; ayrıca şifre soruyor.' },
      { at: 'subject', type: 'urgency', note: '"GİZLİ" ve "bu akşam kaldırılacak" merak ve acele uyandırıyor.' },
    ],
  },
  {
    level: 2, phish: false, fromName: 'Anadolu Dijital Bank', fromAddr: 'bilgi@anadoludijital.com.tr', date: 'Çar 09:00',
    subject: 'Hesap özetiniz hazır',
    body: [
      'Sayın Deniz Kaya,',
      'Mart dönemi hesap özetiniz mobil uygulamamızda ve internet şubemizde görüntülenebilir.',
      'Güvenliğiniz için hatırlatma: Bankamız sizden hiçbir zaman e-posta, SMS ya da telefonla şifre veya doğrulama kodu istemez.',
    ],
    links: [],
    attachments: [],
    clues: [
      { at: 'from', type: 'ok', note: 'Bankanın doğru alan adı (anadoludijital.com.tr), harf oyunu yok.' },
      { at: 'p1', type: 'ok', note: 'Bağlantı yok; uygulamaya kendiniz girmeniz öneriliyor.' },
      { at: 'p2', type: 'ok', note: 'Şifre/kod istemediğini açıkça hatırlatıyor.' },
    ],
  },
  {
    level: 3, phish: true, fromName: 'SosyalKare', fromAddr: 'security@sosyalkare.com', date: 'Bugün 03:14',
    subject: 'Hesabınıza yeni bir cihazdan giriş yapıldı',
    body: [
      'Merhaba,',
      'Hesabınıza Ankara, Türkiye konumundan yeni bir cihazla giriş yapıldı. Bu siz değilseniz hesabınızı hemen güvenceye alın.',
    ],
    links: [{ text: 'Bu ben değildim', url: 'https://sosyalkare.com.hesap-guvenlik.co/verify', button: true }],
    attachments: [],
    clues: [
      { at: 'from', type: 'ok', note: 'Gönderen adresi doğru görünüyor — ama gönderen adı ve adresi taklit edilebilir (spoofing).' },
      { at: 'link0', type: 'link', note: 'Asıl ipucu bağlantıda: "sosyalkare.com.hesap-guvenlik.co" — gerçek alan adı "hesap-guvenlik.co".' },
      { at: 'p1', type: 'urgency', note: 'Gece saatinde gelen "hemen" çağrısı. Emin değilseniz uygulamayı kendiniz açın.' },
    ],
  },
  {
    level: 3, phish: false, fromName: 'SosyalKare', fromAddr: 'security@sosyalkare.com', date: 'Per 19:26',
    subject: 'Yeni cihaz girişi',
    body: [
      'Merhaba Deniz,',
      'Hesabına İzmir konumundan bir tabletle giriş yapıldı. Bu sensen bir şey yapmana gerek yok.',
      'Sen değilsen uygulamadan Ayarlar › Güvenlik bölümüne giderek şifreni değiştirebilirsin.',
    ],
    links: [{ text: 'www.sosyalkare.com/ayarlar/guvenlik', url: 'https://www.sosyalkare.com/ayarlar/guvenlik', button: false }],
    attachments: [],
    clues: [
      { at: 'link0', type: 'ok', note: 'Bağlantı gerçekten sosyalkare.com alan adına gidiyor.' },
      { at: 'p2', type: 'ok', note: 'Panik yaratmıyor, uygulamayı kendin açmanı öneriyor; şifre istemiyor.' },
    ],
  },
  {
    level: 3, phish: true, fromName: 'HızlıKargo Kurye', fromAddr: 'kurye.hizlikargo@postamail.net', date: 'Bugün 10:58',
    subject: 'Teslimat kodu',
    body: [
      'Merhaba kurye arkadasiniz kapida, teslimatı tamamlamak icin telefonunuza gelen 6 haneli kodu bu e-postaya cevap olarak yazarmısınız.',
      'Kod gelmezse paket depoya geri doner.',
    ],
    links: [],
    attachments: [],
    clues: [
      { at: 'from', type: 'domain', note: 'Ücretsiz e-posta servisi (postamail.net): şirketler kişisel posta kutusu kullanmaz.' },
      { at: 'p0', type: 'otp', note: 'Telefona gelen kodu kimseyle paylaşmayın: çoğu zaman hesabınızı ele geçirme kodudur.' },
      { at: 'p1', type: 'lang', note: 'Yazım hataları ve teslim edilmeme baskısı.' },
    ],
  },
  {
    level: 3, phish: true, fromName: 'Ayşe Yılmaz', fromAddr: 'ayse.yilmaz@ornekas.com.tr', date: 'Bugün 16:22',
    subject: 'Toplantı notları',
    body: [
      'Selam,',
      'Toplantı notlarını paylaştım, görüntülemek için şirket hesabınla giriş yapman gerekiyor.',
    ],
    links: [{ text: 'BulutKasa\'da görüntüle', url: 'https://bulutkasa-paylasim.web-docs.site/login?o=ornekas', button: true }],
    attachments: [],
    clues: [
      { at: 'from', type: 'ok', note: 'Adres gerçek bir iş arkadaşına ait — ama hesabı ele geçirilmiş olabilir.' },
      { at: 'link0', type: 'link', note: 'Paylaşım bağlantısı BulutKasa\'ya değil "web-docs.site" alan adına gidiyor.' },
      { at: 'p1', type: 'otp', note: 'Belge görmek için şirket şifresi isteniyor. Şüphelenince Ayşe\'yi telefonla ara.' },
    ],
  },
  {
    level: 3, phish: false, fromName: 'Demir Lojistik Muhasebe', fromAddr: 'muhasebe@demirlojistik.com.tr', date: 'Cum 11:40',
    subject: 'Mart 2026 faturası',
    body: [
      'Merhaba Deniz Hanım,',
      'Mart ayına ait faturamız ektedir. Ödeme bilgilerimizde bir değişiklik yoktur; sözleşmedeki hesabımıza ödeme yapabilirsiniz.',
      'Sorunuz olursa bilinen numaramızdan bize ulaşabilirsiniz.',
    ],
    links: [],
    attachments: [{ name: 'Fatura_2026-03.pdf', size: '186 KB' }],
    clues: [
      { at: 'from', type: 'ok', note: 'Tedarikçinin bilinen alan adı (demirlojistik.com.tr).' },
      { at: 'p1', type: 'ok', note: 'IBAN değişikliği yok, acele yok.' },
      { at: 'attach0', type: 'ok', note: 'Ek gerçek bir PDF: tek uzantı (.pdf), beklenen boyut.' },
    ],
  },
  {
    level: 3, phish: true, fromName: 'Anadolu Dijital Bank', fromAddr: 'kampanya@anadoludijital-kampanya.com', date: 'Bugün 12:44',
    subject: 'Kart aidatınız iade edilecek',
    body: [
      'Değerli müşterimiz,',
      'Mahkeme kararı gereği son 5 yılda ödediğiniz kart aidatları iade edilecektir. İade için kart bilgilerinizi aşağıdaki güvenli sayfadan güncelleyiniz.',
    ],
    links: [{ text: 'www.anadoludijital.com.tr/aidat-iade', url: 'http://203.0.113.45/adb/giris', button: false }],
    attachments: [],
    clues: [
      { at: 'from', type: 'domain', note: 'Bankanın adresi "anadoludijital.com.tr"; bu "anadoludijital-kampanya.com".' },
      { at: 'p1', type: 'prize', note: 'Cazip para iadesi + kart bilgisi isteği.' },
      { at: 'link0', type: 'link', note: 'Gerçek adres bir alan adı değil, çıplak IP adresi (203.0.113.45): bankalar böyle bağlantı göndermez.' },
    ],
  },
  {
    level: 2, phish: false, fromName: 'Örnek A.Ş. BT Destek', fromAddr: 'bt-destek@ornekas.com.tr', date: 'Pzt 17:05',
    subject: 'Cumartesi planlı bakım',
    body: [
      'Merhaba,',
      'Cumartesi 02:00–04:00 arasında e-posta sunucularımızda planlı bakım yapılacaktır. Bu sürede e-posta gönderimi gecikebilir.',
      'Sizden herhangi bir işlem yapmanız veya şifre girmeniz gerekmez.',
    ],
    links: [],
    attachments: [],
    clues: [
      { at: 'from', type: 'ok', note: 'Şirket içi adres.' },
      { at: 'p2', type: 'ok', note: 'Hiçbir işlem, bağlantı ya da şifre istemiyor — sadece bilgilendiriyor.' },
    ],
  },
];
