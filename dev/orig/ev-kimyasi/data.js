// Ev Kimyası Güvenliği — ürünler, gazlar ve 36 ikili karışımın sonuç tablosu (yalnızca uyarı amaçlı, miktar yok).

export const PRODUCTS = [
  { id: 'camasir', name: 'Çamaşır suyu', short: 'Çamaşır suyu', code: 'ÇS', tag: 'ÇAMAŞIR\nSUYU',
    active: 'Sodyum hipoklorit (NaOCl)', nature: 'Bazik, güçlü oksitleyici', shape: 'jug',
    body: 0xf1f5f9, cap: 0x2563eb, labelBg: '#1d4ed8', liquid: 0xeef3c4 },
  { id: 'tuzruhu', name: 'Tuz ruhu', short: 'Tuz ruhu', code: 'TR', tag: 'TUZ\nRUHU',
    active: 'Hidroklorik asit (HCl)', nature: 'Kuvvetli asit, aşındırıcı', shape: 'bottle',
    body: 0xfde68a, cap: 0xdc2626, labelBg: '#b91c1c', liquid: 0xf6e7a1, clear: true },
  { id: 'sirke', name: 'Sirke', short: 'Sirke', code: 'Si', tag: 'SİRKE',
    active: 'Asetik asit (CH₃COOH, seyreltik)', nature: 'Zayıf asit', shape: 'glass',
    body: 0xd6a756, cap: 0x3f2a14, labelBg: '#7c2d12', liquid: 0xc98a2b, clear: true },
  { id: 'amonyak', name: 'Amonyaklı cam temizleyici', short: 'Cam sil (NH₃)', code: 'Am', tag: 'CAM\nSİL',
    active: 'Amonyak (NH₃) + alkol + yüzey aktif madde', nature: 'Bazik', shape: 'spray',
    body: 0x93c5fd, cap: 0xf8fafc, labelBg: '#0369a1', liquid: 0x38bdf8, clear: true },
  { id: 'kirec', name: 'Kireç çözücü', short: 'Kireç çözücü', code: 'KÇ', tag: 'KİREÇ\nÇÖZÜCÜ',
    active: 'Asit (ürüne göre sülfamik, fosforik, sitrik asit ya da HCl)', nature: 'Asidik, aşındırıcı', shape: 'bottle',
    body: 0xf9a8d4, cap: 0x9d174d, labelBg: '#9d174d', liquid: 0xf472b6, clear: true },
  { id: 'karbonat', name: 'Karbonat', short: 'Karbonat', code: 'Ka', tag: 'KARBONAT',
    active: 'Sodyum bikarbonat (NaHCO₃)', nature: 'Zayıf baz, toz', shape: 'box',
    body: 0xf59e0b, cap: 0xffffff, labelBg: '#ffffff', labelFg: '#b45309', liquid: 0xf8fafc },
  { id: 'deterjan', name: 'Bulaşık deterjanı', short: 'Bulaşık det.', code: 'De', tag: 'BULAŞIK',
    active: 'Yüzey aktif maddeler (anyonik/noniyonik)', nature: 'Genelde nötre yakın', shape: 'squeeze',
    body: 0x4ade80, cap: 0x166534, labelBg: '#15803d', liquid: 0x6ee05a },
  { id: 'oksijenli', name: 'Oksijenli su', short: 'Oksijenli su', code: 'OS', tag: 'H₂O₂',
    active: 'Hidrojen peroksit (H₂O₂, seyreltik)', nature: 'Oksitleyici', shape: 'brown',
    body: 0x5b3413, cap: 0xf8fafc, labelBg: '#f8fafc', labelFg: '#5b3413', liquid: 0xe8f1f5 },
  { id: 'alkol', name: 'Alkol / kolonya', short: 'Alkol', code: 'Al', tag: 'ALKOL',
    active: 'Etanol (C₂H₅OH) ya da izopropil alkol', nature: 'Yanıcı', shape: 'glass',
    body: 0xdbeafe, cap: 0x475569, labelBg: '#334155', liquid: 0xe0f2fe, clear: true },
];

// Bulut partikülleri: renk, üretim hızı, kaldırma (– : havadan ağır, yere çöker), opaklık
export const GASES = {
  cl2: { label: 'Cl₂ · klor', color: 0xc4e03c, rate: 55, buoy: -0.16, alpha: 0.6, size: 1.5 },
  kloramin: { label: 'NH₂Cl · kloramin', color: 0xeef5cf, rate: 45, buoy: -0.05, alpha: 0.42, size: 1.4 },
  chcl3: { label: 'CHCl₃ · kloroform', color: 0xd6ccff, rate: 30, buoy: -0.12, alpha: 0.34, size: 1.4 },
  peracid: { label: 'CH₃COOOH · perasetik asit', color: 0xf5e8ff, rate: 22, buoy: 0.02, alpha: 0.3, size: 1.3 },
  nh4cl: { label: 'NH₄Cl · beyaz duman', color: 0xffffff, rate: 70, buoy: 0.14, alpha: 0.55, size: 1.2 },
  vapor: { label: 'tahriş edici buhar', color: 0xdce6ef, rate: 12, buoy: 0.08, alpha: 0.24, size: 1.2 },
};

export const SYM = {
  cl2: 'Gözlerde yanma ve sulanma, öksürük, boğazda yanma, göğüste sıkışma, nefes darlığı. Yüksek maruziyette akciğerde sıvı birikimi olabilir; belirtiler saatler sonra ağırlaşabilir.',
  kloramin: 'Öksürük, hırıltılı solunum, nefes darlığı, göğüs ağrısı, göz-burun-boğaz tahrişi, bulantı. Ağır durumda akciğerde sıvı birikimi.',
  chcl3: 'Baş dönmesi, baş ağrısı, bulantı, sersemlik; yüksek derişimde bilinç kaybı. Göz ve solunum yolu tahrişi; karaciğer ve böbreğe zararlıdır.',
  peracid: 'Göz, cilt ve solunum yollarında yanma/tahriş, keskin batıcı koku, öksürük.',
  splash: 'Hızlı köpürme aşındırıcı sıvıyı sıçratabilir: gözde ve ciltte kimyasal yanık. Kapalı kap basınçla patlayabilir.',
  pressure: 'Açık kapta zararsızdır; kapalı kapta biriken gaz kapağı fırlatabilir.',
  irritant: 'Göz, burun ve boğaz tahrişi, öksürük; sıçrayan sıvı cildi tahriş eder.',
  acid: 'Asit buharı gözü ve solunum yollarını tahriş eder; sıvı ciltte yanık yapar, yüzeyleri aşındırır.',
  unknown: 'Sonuç ürünün gerçek içeriğine bağlıdır; etiketteki uyarı ve içerik bilgisini oku.',
  flammable: 'Belirgin tepkime beklenmez; alkol buharı yanıcıdır, ısı ve alevden uzak tut.',
  none: 'Belirgin bir tehlike beklenmez.',
};

const R = {};
const key = (a, b) => [a, b].sort().join('+');
const P = (a, b, r) => { R[key(a, b)] = r; };

// level: safe | warn | danger · gas: GASES anahtarı · foam: 0..1+ köpürme · heat: ısınma
P('camasir', 'tuzruhu', { level: 'danger', title: 'Klor gazı (Cl₂) açığa çıkar!', gas: 'cl2', foam: 0.15, sym: 'cl2',
  eq: 'NaOCl + 2 HCl → Cl₂↑ + NaCl + H₂O',
  text: 'Asit, hipokloriti klora dönüştürür. Klor sarı-yeşil, keskin kokulu ve havadan ağır bir gazdır; yere yakın birikir. Evdeki kimyasal kazaların en bilinen nedenlerinden biridir.' });
P('camasir', 'sirke', { level: 'danger', title: 'Klor gazı (Cl₂) açığa çıkar!', gas: 'cl2', rate: 0.75, sym: 'cl2',
  eq: 'NaOCl + CH₃COOH → HOCl + CH₃COONa<br>HOCl + H⁺ + Cl⁻ → Cl₂↑ + H₂O',
  text: 'Sirke zayıf asit olsa da çamaşır suyunu asitleştirmeye yeter: önce hipokloröz asit (HOCl), ardından ortamdaki klorür ile klor gazı oluşur. "Doğal" ürün olması karışımı güvenli yapmaz.' });
P('camasir', 'amonyak', { level: 'danger', title: 'Kloramin gazları oluşur!', gas: 'kloramin', sym: 'kloramin',
  eq: 'NaOCl + NH₃ → NH₂Cl + NaOH<br>(devamında NHCl₂ ve NCl₃)',
  text: 'Hipoklorit amonyağı klorlayarak kloraminlere dönüştürür. Bu buharlar solunum yollarını ağır biçimde tahriş eder; kapalı banyoda özellikle tehlikelidir. Amonyak birçok cam temizleyicide ve idrarda da bulunur.' });
P('camasir', 'kirec', { level: 'danger', title: 'Klor gazı (Cl₂) açığa çıkar!', gas: 'cl2', sym: 'cl2',
  eq: 'OCl⁻ + Cl⁻ + 2 H⁺ → Cl₂↑ + H₂O',
  text: 'Kireç çözücüler asit içerir (ürüne göre sülfamik, fosforik, sitrik asit ya da HCl). Hangi asit olursa olsun çamaşır suyuyla klor gazı çıkar. Klozete ikisini birlikte dökmek tipik bir kaza nedenidir.' });
P('camasir', 'karbonat', { level: 'warn', title: 'Belirgin gaz beklenmez, yine de önerilmez', foam: 0.05, sym: 'none',
  eq: 'NaOH + NaHCO₃ → Na₂CO₃ + H₂O',
  text: 'Karbonat zayıf bazdır; çamaşır suyuyla zehirli gaz oluşturması beklenmez. Ancak ortamın pH\'ı düşer ve hipoklorit daha kararsız hale gelir. Altın kural: çamaşır suyunu yalnızca etiketindeki talimata göre, suyla kullan.' });
P('camasir', 'deterjan', { level: 'warn', title: 'İçeriğe bağlı — karıştırma', sym: 'unknown',
  eq: '— (deterjanın içeriğine bağlı)',
  text: 'Sıradan bulaşık deterjanları çoğunlukla yalnız yüzey aktif madde içerir; ama bazı temizlik ürünlerinde amonyak ya da asit bulunabilir ve o zaman kloramin veya klor oluşur. İçeriğini bilmediğin hiçbir ürünü çamaşır suyuyla karıştırma.' });
P('camasir', 'oksijenli', { level: 'danger', title: 'Şiddetli köpürme ve oksijen çıkışı', gas: 'vapor', rate: 0.6, foam: 1.25, heat: true, sym: 'splash',
  eq: 'NaOCl + H₂O₂ → NaCl + H₂O + O₂↑',
  text: 'İki oksitleyici birbirini hızla parçalar; bol oksijen gazı ve ısı açığa çıkar. Karışım köpürüp taşabilir, aşındırıcı sıvı göze ve cilde sıçrayabilir; kapalı kap basınçtan patlayabilir.' });
P('camasir', 'alkol', { level: 'danger', title: 'Kloroform ve klorlu bileşikler oluşur!', gas: 'chcl3', sym: 'chcl3', heat: true,
  eq: 'C₂H₅OH + 4 OCl⁻ → CHCl₃ + HCOO⁻ + Cl⁻ + 2 OH⁻ + H₂O',
  text: 'Hipoklorit alkolü önce aldehite yükseltger, sonra klorlar (haloform tepkimesi). Kloroform ve diğer klorlu organik bileşikler baş dönmesi, bulantı ve bilinç kaybına yol açabilir. Kolonya ve dezenfektan alkol de buna dahildir.' });

P('tuzruhu', 'sirke', { level: 'warn', title: 'Asit + asit: yarar yok, risk var', gas: 'vapor', sym: 'acid',
  eq: 'Belirgin tepkime yok (iki asit)',
  text: 'İki asit birbiriyle tepkimeye girmez ama karışım yine güçlü bir asittir; tuz ruhunun keskin HCl buharı gözü ve solunum yollarını tahriş eder. Temizlik gücü artmaz.' });
P('tuzruhu', 'amonyak', { level: 'warn', title: 'Beyaz duman (NH₄Cl) ve ısınma', gas: 'nh4cl', heat: true, foam: 0.1, sym: 'irritant',
  eq: 'NH₃ + HCl → NH₄Cl (beyaz katı duman)',
  text: 'Kuvvetli asit ile baz nötrleşir: ısı açığa çıkar, sıvı sıçrayabilir ve havada amonyum klorür dumanı oluşur. Duman ve buharlar solunum yollarını tahriş eder.' });
P('tuzruhu', 'kirec', { level: 'warn', title: 'Daha aşındırıcı bir asit karışımı', gas: 'vapor', sym: 'acid',
  eq: 'Belirgin tepkime yok (asit + asit)',
  text: 'Kireç çözücü de asittir. Karışım yüzeylere (derz, mermer, metal) ve cilde daha çok zarar verir, HCl buharı artar. İçeriği bilinmeyen ürünleri üst üste kullanma.' });
P('tuzruhu', 'karbonat', { level: 'warn', title: 'Şiddetli köpürme (CO₂)', foam: 0.85, sym: 'splash',
  eq: 'NaHCO₃ + HCl → NaCl + H₂O + CO₂↑',
  text: 'Karbonat asidi nötrleştirir, bol karbondioksit kabarcığı çıkar. CO₂ zehirli değildir ama hızlı köpürme kuvvetli asidi sıçratabilir; kapalı kapta basınç oluşur.' });
P('tuzruhu', 'deterjan', { level: 'warn', title: 'Önerilmez', gas: 'vapor', rate: 0.6, sym: 'acid',
  eq: 'Belirgin tepkime beklenmez',
  text: 'Sıradan bulaşık deterjanıyla belirgin gaz beklenmez; ancak tuz ruhu tek başına çok aşındırıcıdır ve karışım temizlik gücünü artırmaz. Deterjan hipoklorit içeriyorsa (çamaşır sulu jeller) klor çıkar.' });
P('tuzruhu', 'oksijenli', { level: 'danger', title: 'Klor gazı çıkabilir, çok aşındırıcı', gas: 'cl2', rate: 0.5, sym: 'cl2',
  eq: '2 HCl + H₂O₂ → Cl₂↑ + 2 H₂O',
  text: 'Hidrojen peroksit hidroklorik asidi yükseltgeyerek klor gazı oluşturabilir (özellikle derişik ve ılık olduğunda). Karışım metalleri ve dokuları hızla aşındırır.' });
P('tuzruhu', 'alkol', { level: 'warn', title: 'Önerilmez', gas: 'vapor', rate: 0.6, sym: 'acid',
  eq: 'Oda sıcaklığında belirgin tepkime yok',
  text: 'Belirgin tepkime beklenmez; ancak aşındırıcı asit buharı ile yanıcı alkol buharı bir araya gelir. Karıştırmanın hiçbir yararı yoktur.' });

P('sirke', 'amonyak', { level: 'safe', title: 'Birbirini nötrleştirir', sym: 'irritant',
  eq: 'CH₃COOH + NH₃ → CH₃COONH₄',
  text: 'Zayıf asit ile zayıf baz tuz oluşturur; tehlikeli gaz çıkmaz ama iki ürün de etkisini yitirir. Amonyak kokusu tahriş edicidir; havalandır.' });
P('sirke', 'kirec', { level: 'warn', title: 'Asit + asit: önerilmez', sym: 'acid',
  eq: 'Belirgin tepkime beklenmez',
  text: 'Genellikle belirgin tepkime olmaz; ancak kireç çözücünün asidi aşındırıcıdır ve içeriği ürüne göre değişir. Birlikte kullanmak etkiyi anlamlı artırmaz, yüzeylere zarar riskini artırır.' });
P('sirke', 'karbonat', { level: 'safe', title: 'Köpürme: karbondioksit', foam: 0.95, sym: 'pressure',
  eq: 'NaHCO₃ + CH₃COOH → CH₃COONa + H₂O + CO₂↑',
  text: 'Klasik "yanardağ" deneyi: kabarcıklar zararsız CO₂\'dir. Kapalı bir şişede yapılırsa basınç kapağı fırlatabilir. Temizlik açısından ikisi birbirini nötrleştirir, etkisi azalır.' });
P('sirke', 'deterjan', { level: 'safe', title: 'Genelde güvenli', foam: 0.15, sym: 'none',
  eq: 'Belirgin tepkime yok',
  text: 'Evde sık birlikte kullanılır; tehlikeli gaz oluşmaz. Sirke asidik olduğu için mermer ve doğal taşta kullanma.' });
P('sirke', 'oksijenli', { level: 'danger', title: 'Perasetik asit oluşur', gas: 'peracid', sym: 'peracid',
  eq: 'CH₃COOH + H₂O₂ ⇌ CH₃COOOH + H₂O',
  text: 'Aynı kapta bekletildiğinde perasetik asit oluşur. Aşındırıcıdır; göze, cilde ve solunum yollarına zarar verir. Ayrı ayrı (arada durulayarak) kullanılabilirler, ama aynı kapta birleştirilmemelidir.' });
P('sirke', 'alkol', { level: 'safe', title: 'Belirgin tepkime yok', sym: 'flammable',
  eq: 'CH₃COOH + C₂H₅OH ⇌ CH₃COOC₂H₅ + H₂O<br>(katalizörsüz ve soğukta ihmal edilecek kadar yavaş)',
  text: 'Esterleşme için kuvvetli asit katalizörü ve ısı gerekir; oda koşullarında ihmal edilebilir. Tehlikeli gaz oluşmaz; alkolün yanıcılığına dikkat.' });

P('amonyak', 'kirec', { level: 'warn', title: 'Nötrleşme, ısınma, tahriş edici buhar', gas: 'nh4cl', rate: 0.4, heat: true, sym: 'irritant',
  eq: 'NH₃ + H⁺ → NH₄⁺ (ısı açığa çıkar)',
  text: 'Asit ile baz nötrleşir; ısınma ve sıçrama olabilir. Kireç çözücü HCl içeriyorsa beyaz amonyum klorür dumanı görülür. Buharlar tahriş edicidir.' });
P('amonyak', 'karbonat', { level: 'safe', title: 'Belirgin tepkime yok', sym: 'irritant',
  eq: 'Belirgin tepkime yok (ikisi de bazik)',
  text: 'İkisi de baziktir; tehlikeli tepkime beklenmez. Amonyak buharı yine de tahriş edicidir, havalandırarak kullan.' });
P('amonyak', 'deterjan', { level: 'safe', title: 'Genelde güvenli', foam: 0.15, sym: 'unknown',
  eq: 'Belirgin tepkime yok',
  text: 'Birçok yüzey temizleyici zaten amonyak ve yüzey aktif madde içerir. Ancak deterjan hipoklorit içeriyorsa (çamaşır sulu ürünler) kloramin oluşur — etiketi kontrol et.' });
P('amonyak', 'oksijenli', { level: 'warn', title: 'Peroksit hızla bozunur', foam: 0.35, sym: 'irritant',
  eq: '2 H₂O₂ → 2 H₂O + O₂↑ (bazik ortamda hızlanır)',
  text: 'Bazik ortamda hidrojen peroksit daha hızlı bozunup oksijen verir; köpürme ve ısınma olabilir. Belirgin zehirli gaz beklenmez ama karışımın yararı yoktur ve amonyak buharı tahriş edicidir.' });
P('amonyak', 'alkol', { level: 'safe', title: 'Güvenli (cam temizleyicinin bileşimi)', sym: 'flammable',
  eq: 'Belirgin tepkime yok',
  text: 'Birçok cam temizleyici zaten amonyak ve alkol içerir. Tehlikeli tepkime beklenmez; alkol yanıcıdır, amonyak buharı tahriş eder.' });

P('kirec', 'karbonat', { level: 'warn', title: 'Şiddetli köpürme (CO₂)', foam: 0.85, sym: 'splash',
  eq: 'HCO₃⁻ + H⁺ → H₂O + CO₂↑',
  text: 'Asit karbonatı parçalar; bol CO₂ köpüğü çıkar. Gaz zehirli değildir ama asidik köpük taşıp sıçrayabilir; kapalı kapta basınç oluşur. Birbirini nötrleştirdikleri için kireç çözme etkisi de azalır.' });
P('kirec', 'deterjan', { level: 'warn', title: 'İçeriğe bağlı — önerilmez', sym: 'unknown',
  eq: 'Belirgin tepkime beklenmez',
  text: 'Sıradan bulaşık deterjanıyla genelde tepkime olmaz; ancak kireç çözücünün asidi aşındırıcıdır ve deterjan hipoklorit içeriyorsa klor çıkar. İçeriği bilinmeyen ürünleri karıştırma.' });
P('kirec', 'oksijenli', { level: 'warn', title: 'İçeriğe bağlı — klor riski', gas: 'vapor', sym: 'acid',
  eq: 'HCl içeriyorsa: 2 HCl + H₂O₂ → Cl₂↑ + 2 H₂O',
  text: 'Kireç çözücü hidroklorik asit içeriyorsa klor gazı oluşabilir; diğer asitlerle de karışım aşındırıcı ve oksitleyicidir. Birlikte kullanma.' });
P('kirec', 'alkol', { level: 'warn', title: 'Önerilmez', sym: 'acid',
  eq: 'Belirgin tepkime beklenmez',
  text: 'Belirgin tepkime beklenmez; ancak aşındırıcı asit ve yanıcı alkol bir arada kullanılmamalı. Karıştırmanın yararı yok.' });

P('karbonat', 'deterjan', { level: 'safe', title: 'Güvenli', foam: 0.2, sym: 'none',
  eq: 'Belirgin tepkime yok',
  text: 'Karbonat hafif ovucu ve yağ çözücüdür; bulaşık deterjanıyla birlikte güvenle kullanılır.' });
P('karbonat', 'oksijenli', { level: 'safe', title: 'Genelde güvenli', foam: 0.15, sym: 'none',
  eq: '2 H₂O₂ → 2 H₂O + O₂↑ (hafif, bazik ortamda)',
  text: 'Leke çıkarmada birlikte kullanılabilen bir çifttir; hafif kabarcıklanma olabilir. Karışımı kapalı kapta saklama, oksijenli suyun göze kaçmamasına dikkat et.' });
P('karbonat', 'alkol', { level: 'safe', title: 'Güvenli', sym: 'flammable',
  eq: 'Belirgin tepkime yok',
  text: 'Tepkime yok. Alkolün yanıcılığına dikkat.' });
P('deterjan', 'oksijenli', { level: 'safe', title: 'Genelde güvenli', foam: 0.2, sym: 'none',
  eq: 'Belirgin tepkime yok',
  text: 'Belirgin tepkime beklenmez; hafif köpürme olabilir. Hazırlanan karışımı saklama, etiketsiz kaplara koyma.' });
P('deterjan', 'alkol', { level: 'safe', title: 'Güvenli', sym: 'flammable',
  eq: 'Belirgin tepkime yok',
  text: 'Tepkime yok. Alkol yanıcıdır, ısı kaynağından uzak tut.' });
P('oksijenli', 'alkol', { level: 'safe', title: 'Belirgin tepkime yok', sym: 'flammable',
  eq: 'Ev tipi seyreltik çözeltilerde belirgin tepkime yok',
  text: 'İkisi de dezenfektandır ama karıştırmak etkiyi artırmaz. Alkol yanıcıdır.' });

export const result = (a, b) => R[key(a, b)];
export const pairKey = key;
export const ALL_PAIRS = Object.keys(R).map((k) => k.split('+'));

export const LEVEL = {
  safe: { icon: '✅', name: 'GÜVENLİ (genel olarak)', color: '#22c55e', tone: 'good' },
  warn: { icon: '⚠️', name: 'DİKKAT — önerilmez', color: '#f59e0b', tone: 'warn' },
  danger: { icon: '☠️', name: 'TEHLİKELİ', color: '#ef4444', tone: 'bad' },
};

export const FIRST_AID = `<ol style="margin:4px 0 0;padding-left:18px">
  <li>Hemen ortamdan çık, <b>temiz havaya</b> geç; başkalarını da uzaklaştır.</li>
  <li>Güvenliyse pencereleri aç. Karışımı başka bir maddeyle "nötrleştirmeye" çalışma.</li>
  <li>Göze/cilde temas: bol akan suyla en az 15 dakika yıka, kirlenen giysiyi çıkar.</li>
  <li>Danış: <b>114</b> Ulusal Zehir Danışma Merkezi (UZEM, 7/24).</li>
  <li>Nefes darlığı, göğüs ağrısı, bilinç bulanıklığı varsa hemen <b>112</b>.</li>
</ol>`;
