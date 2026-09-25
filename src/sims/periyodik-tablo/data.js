// Periyodik tablo verisi: sembol, Türkçe ad, atom kütlesi (radyoaktiflerde en kararlı izotopun kütle numarası), Pauling elektronegatifliği.
// Dizinin sırası atom numarasıdır (indeks + 1). Kütleler IUPAC standart atom ağırlıklarından kısaltılmıştır.

export const ELEMENTS = [
  ['H', 'Hidrojen', 1.008, 2.2], ['He', 'Helyum', 4.0026, null],
  ['Li', 'Lityum', 6.94, 0.98], ['Be', 'Berilyum', 9.0122, 1.57], ['B', 'Bor', 10.81, 2.04], ['C', 'Karbon', 12.011, 2.55],
  ['N', 'Azot', 14.007, 3.04], ['O', 'Oksijen', 15.999, 3.44], ['F', 'Flor', 18.998, 3.98], ['Ne', 'Neon', 20.18, null],
  ['Na', 'Sodyum', 22.99, 0.93], ['Mg', 'Magnezyum', 24.305, 1.31], ['Al', 'Alüminyum', 26.982, 1.61], ['Si', 'Silisyum', 28.085, 1.9],
  ['P', 'Fosfor', 30.974, 2.19], ['S', 'Kükürt', 32.06, 2.58], ['Cl', 'Klor', 35.45, 3.16], ['Ar', 'Argon', 39.948, null],
  ['K', 'Potasyum', 39.098, 0.82], ['Ca', 'Kalsiyum', 40.078, 1.0], ['Sc', 'Skandiyum', 44.956, 1.36], ['Ti', 'Titanyum', 47.867, 1.54],
  ['V', 'Vanadyum', 50.942, 1.63], ['Cr', 'Krom', 51.996, 1.66], ['Mn', 'Mangan', 54.938, 1.55], ['Fe', 'Demir', 55.845, 1.83],
  ['Co', 'Kobalt', 58.933, 1.88], ['Ni', 'Nikel', 58.693, 1.91], ['Cu', 'Bakır', 63.546, 1.9], ['Zn', 'Çinko', 65.38, 1.65],
  ['Ga', 'Galyum', 69.723, 1.81], ['Ge', 'Germanyum', 72.63, 2.01], ['As', 'Arsenik', 74.922, 2.18], ['Se', 'Selenyum', 78.971, 2.55],
  ['Br', 'Brom', 79.904, 2.96], ['Kr', 'Kripton', 83.798, 3.0],
  ['Rb', 'Rubidyum', 85.468, 0.82], ['Sr', 'Stronsiyum', 87.62, 0.95], ['Y', 'İtriyum', 88.906, 1.22], ['Zr', 'Zirkonyum', 91.224, 1.33],
  ['Nb', 'Niyobyum', 92.906, 1.6], ['Mo', 'Molibden', 95.95, 2.16], ['Tc', 'Teknesyum', 98, 1.9], ['Ru', 'Rutenyum', 101.07, 2.2],
  ['Rh', 'Rodyum', 102.91, 2.28], ['Pd', 'Paladyum', 106.42, 2.2], ['Ag', 'Gümüş', 107.87, 1.93], ['Cd', 'Kadmiyum', 112.41, 1.69],
  ['In', 'İndiyum', 114.82, 1.78], ['Sn', 'Kalay', 118.71, 1.96], ['Sb', 'Antimon', 121.76, 2.05], ['Te', 'Tellür', 127.6, 2.1],
  ['I', 'İyot', 126.9, 2.66], ['Xe', 'Ksenon', 131.29, 2.6],
  ['Cs', 'Sezyum', 132.91, 0.79], ['Ba', 'Baryum', 137.33, 0.89], ['La', 'Lantan', 138.91, 1.1], ['Ce', 'Seryum', 140.12, 1.12],
  ['Pr', 'Praseodim', 140.91, 1.13], ['Nd', 'Neodim', 144.24, 1.14], ['Pm', 'Prometyum', 145, 1.13], ['Sm', 'Samaryum', 150.36, 1.17],
  ['Eu', 'Evropiyum', 151.96, 1.2], ['Gd', 'Gadolinyum', 157.25, 1.2], ['Tb', 'Terbiyum', 158.93, 1.1], ['Dy', 'Disprosyum', 162.5, 1.22],
  ['Ho', 'Holmiyum', 164.93, 1.23], ['Er', 'Erbiyum', 167.26, 1.24], ['Tm', 'Tulyum', 168.93, 1.25], ['Yb', 'İterbiyum', 173.05, 1.1],
  ['Lu', 'Lutesyum', 174.97, 1.27], ['Hf', 'Hafniyum', 178.49, 1.3], ['Ta', 'Tantal', 180.95, 1.5], ['W', 'Tungsten', 183.84, 2.36],
  ['Re', 'Renyum', 186.21, 1.9], ['Os', 'Osmiyum', 190.23, 2.2], ['Ir', 'İridyum', 192.22, 2.2], ['Pt', 'Platin', 195.08, 2.28],
  ['Au', 'Altın', 196.97, 2.54], ['Hg', 'Cıva', 200.59, 2.0], ['Tl', 'Talyum', 204.38, 1.62], ['Pb', 'Kurşun', 207.2, 2.33],
  ['Bi', 'Bizmut', 208.98, 2.02], ['Po', 'Polonyum', 209, 2.0], ['At', 'Astatin', 210, 2.2], ['Rn', 'Radon', 222, 2.2],
  ['Fr', 'Fransiyum', 223, 0.7], ['Ra', 'Radyum', 226, 0.9], ['Ac', 'Aktinyum', 227, 1.1], ['Th', 'Toryum', 232.04, 1.3],
  ['Pa', 'Protaktinyum', 231.04, 1.5], ['U', 'Uranyum', 238.03, 1.38], ['Np', 'Neptünyum', 237, 1.36], ['Pu', 'Plütonyum', 244, 1.28],
  ['Am', 'Amerikyum', 243, 1.13], ['Cm', 'Küriyum', 247, 1.28], ['Bk', 'Berkelyum', 247, 1.3], ['Cf', 'Kaliforniyum', 251, 1.3],
  ['Es', 'Aynştaynyum', 252, 1.3], ['Fm', 'Fermiyum', 257, 1.3], ['Md', 'Mendelevyum', 258, 1.3], ['No', 'Nobelyum', 259, 1.3],
  ['Lr', 'Lavrensiyum', 266, null], ['Rf', 'Rutherfordiyum', 267, null], ['Db', 'Dubniyum', 268, null], ['Sg', 'Seaborgiyum', 269, null],
  ['Bh', 'Bohriyum', 270, null], ['Hs', 'Hassiyum', 269, null], ['Mt', 'Meitneriyum', 278, null], ['Ds', 'Darmstadtiyum', 281, null],
  ['Rg', 'Röntgenyum', 282, null], ['Cn', 'Kopernikyum', 285, null], ['Nh', 'Nihonyum', 286, null], ['Fl', 'Flerovyum', 289, null],
  ['Mc', 'Moskovyum', 290, null], ['Lv', 'Livermoryum', 293, null], ['Ts', 'Tenesin', 294, null], ['Og', 'Oganesson', 294, null],
];

export const CATS = {
  al: { name: 'Alkali metal', color: '#f87171' },
  ta: { name: 'Toprak alkali metal', color: '#fb923c' },
  ge: { name: 'Geçiş metali', color: '#fcd34d' },
  zm: { name: 'Metal (zayıf metal)', color: '#94a3b8' },
  ym: { name: 'Yarı metal', color: '#a3e635' },
  am: { name: 'Ametal', color: '#4ade80' },
  ha: { name: 'Halojen', color: '#22d3ee' },
  sg: { name: 'Soy gaz', color: '#a78bfa' },
  la: { name: 'Lantanit', color: '#f9a8d4' },
  ac: { name: 'Aktinit', color: '#e879f9' },
};

const SETS = {
  al: [3, 11, 19, 37, 55, 87],
  ta: [4, 12, 20, 38, 56, 88],
  am: [1, 6, 7, 8, 15, 16, 34],
  ha: [9, 17, 35, 53, 85, 117],
  sg: [2, 10, 18, 36, 54, 86, 118],
  ym: [5, 14, 32, 33, 51, 52],
  zm: [13, 31, 49, 50, 81, 82, 83, 84, 113, 114, 115, 116],
};

export function categoryOf(Z) {
  if (Z >= 57 && Z <= 71) return 'la';
  if (Z >= 89 && Z <= 103) return 'ac';
  for (const k in SETS) if (SETS[k].includes(Z)) return k;
  return 'ge';
}

// 25 °C ve 1 atm'deki hâl (Z ≥ 100 hiç gözle görülür miktarda üretilemedi)
const GAS = [1, 2, 7, 8, 9, 10, 17, 18, 36, 54, 86];
export function stateOf(Z) {
  if (GAS.includes(Z)) return 'gaz';
  if (Z === 35 || Z === 80) return 'sıvı';
  if (Z >= 100) return 'bilinmiyor';
  return 'katı';
}
// Kararlı izotopu olmayan elementler (Bi'nin yarı ömrü evrenin yaşından çok uzun olduğu için dahil edilmedi)
export const isRadioactive = (Z) => Z === 43 || Z === 61 || Z >= 84;

// Günlük kullanım ve tehlike notları (sembole göre)
export const NOTES = {
  H: ['Güneş, hidrojeni füzyonla helyuma çevirerek parlar. Suyun (H₂O) yapısında vardır; yakıt hücrelerinde ve gübre (amonyak) üretiminde kullanılır.',
    'Havayla karışımı çok kolay tutuşur ve patlayabilir.'],
  He: ['Uçan balonlar ve zeplinler; sıvı helyum MR cihazlarının mıknatıslarını soğutur.',
    'Zehirli değildir ama solunduğunda akciğerdeki oksijenin yerini alır; balondan helyum çekmek bayılma ve boğulmaya yol açabilir.'],
  Li: ['Telefon, dizüstü bilgisayar ve elektrikli araçlardaki lityum-iyon pillerde; bazı ilaçlarda.',
    'Metal hâli suyla tepkimeye girer. Ezilmiş, şişmiş ya da delinmiş lityum piller ısınıp alev alabilir.'],
  B: ['Isıya dayanıklı borosilikat cam (fırın kapları), deterjanlar, borik asit. Dünyadaki bor rezervlerinin en büyük kısmı Türkiye\'dedir.',
    'Borik asit yutulursa zehirlidir; çocuklardan uzak tutulmalıdır.'],
  C: ['Bütün canlıların temel yapı taşı. Elmas, grafit (kurşun kalem ucu) ve kömür karbondan oluşur.',
    'Kötü yanmada oluşan karbon monoksit (CO) renksiz, kokusuz ve öldürücüdür; bacası tıkalı sobalar ve şofbenler bu yüzden tehlikelidir.'],
  N: ['Havanın yaklaşık %78\'i azottur. Gübrelerde, cips paketlerinde koruyucu gaz olarak, sıvı azotla dondurmada kullanılır.',
    'Sıvı azot ciddi soğuk yanıklarına yol açar; kapalı alanda buharlaşınca oksijeni azaltarak boğabilir.'],
  O: ['Havanın yaklaşık %21\'i. Solunum ve yanma için gerekir; hastanelerde oksijen tüpleriyle hastalara verilir.',
    'Saf oksijen yangını çok hızlandırır; oksijen tüplerinin yakınında ateş ve sigara yakılmaz.'],
  F: ['Diş macunundaki florür dişleri çürüğe karşı korur; yapışmaz tavaların kaplaması (teflon) flor içerir.',
    'Flor gazı son derece zehirli ve aşındırıcıdır. Diş macununu yutmamak gerekir; çok fazla florür zararlıdır.'],
  Ne: ['Kırmızı-turuncu ışıklı neon tabelalar.', 'Zehirli değildir, tepkimeye girmez; kapalı alanda yalnızca oksijeni azaltabilir.'],
  Na: ['Sofra tuzu (NaCl), karbonat (sodyum bikarbonat), sarı ışıklı sokak lambaları.',
    'Metal sodyum suyla şiddetli tepkimeye girip yanabilir. Fazla tuz tüketmek tansiyonu yükseltir.'],
  Mg: ['Hafif alaşımlar (bisiklet, dizüstü bilgisayar kasası), havai fişeklerde beyaz ışık. Bitkilerdeki klorofilin merkezinde bir magnezyum atomu vardır.',
    'Şerit ya da toz hâlinde çok parlak ve sıcak yanar; parlaklığı gözlere zarar verebilir, yangını suyla söndürülmez.'],
  Al: ['İçecek kutuları, alüminyum folyo, uçak gövdeleri, pencere doğramaları. Yer kabuğunda en bol bulunan metaldir.',
    'Metal hâli güvenlidir; çok ince alüminyum tozu ise yanıcıdır.'],
  Si: ['Bilgisayar çipleri ve güneş panelleri; kum ve camın ana bileşeni silisyum dioksittir (SiO₂).',
    'Kristal silika (kum, taş) tozunu uzun süre solumak akciğer hastalığına (silikoz) yol açar.'],
  P: ['Gübreler, kibrit kutusunun sürtünme yüzeyi. DNA\'da ve kemiklerimizde fosfor vardır.',
    'Beyaz fosfor havada kendiliğinden tutuşur ve çok zehirlidir.'],
  S: ['Sülfürik asit üretimi, araba lastiklerinin sertleştirilmesi (vulkanizasyon), gübreler. Çürük yumurta kokusu bir kükürt bileşiğinden (H₂S) gelir.',
    'Yanınca oluşan kükürt dioksit solunum yollarını tahriş eder; hidrojen sülfür gazı zehirlidir.'],
  Cl: ['İçme suyunun ve havuzların mikroptan arındırılması, PVC plastik; sofra tuzunun yapısında klor vardır.',
    'Klor gazı çok zehirlidir. Çamaşır suyunu tuz ruhu, kireç çözücü gibi asitlerle karıştırmak klor gazı açığa çıkarır.'],
  Ar: ['Eski tip ampullerin içi ve kaynak işlerinde koruyucu gaz. Havanın yaklaşık %1\'i argondur.',
    'Zehirli değildir; havadan ağır olduğu için kapalı alanlarda birikip oksijeni azaltabilir.'],
  K: ['Muz, patates ve kuru baklagillerde bol bulunur; sinir ve kasların çalışması için gereklidir. Gübrelerde kullanılır.',
    'Metal potasyum suyla patlayarak tepkimeye girer.'],
  Ca: ['Kemik ve dişlerin yapısında; süt ürünleri, kireç, çimento ve alçı.',
    'Metal hâli suyla tepkimeye girer; sönmemiş kireç (CaO) ıslak ciltte yanık yapar.'],
  Ti: ['Kalça protezleri, diş implantları, uçak parçaları; beyaz boya ve güneş kremlerindeki titanyum dioksit.',
    'Metal hâli vücutla uyumludur ve güvenlidir; ince tozu yanıcıdır.'],
  Cr: ['Paslanmaz çelik ve parlak krom kaplamalar (musluklar, araba parçaları).',
    'Krom(VI) bileşikleri kanserojendir; metal krom ve besinlerdeki krom(III) bu kadar zararlı değildir.'],
  Fe: ['Çelik, inşaat demiri, araçlar. Kandaki hemoglobinin merkezinde demir vardır; kırmızı et, mercimek ve ıspanakta bulunur.',
    'Metal hâli güvenlidir; çocukların yanlışlıkla çok sayıda demir hapı yutması ciddi zehirlenmeye yol açar.'],
  Co: ['Mavi cam ve seramik boyaları, şarj edilebilir piller; B12 vitamininin merkezinde kobalt vardır.',
    'Tozu ve bazı bileşikleri solunduğunda zararlıdır.'],
  Ni: ['Madenî paralar, paslanmaz çelik, şarj edilebilir piller.', 'Takılarda ve kemer tokalarında sık görülen bir cilt alerjisi nedenidir.'],
  Cu: ['Elektrik kabloları, su boruları, bakır tencereler; pirinç ve bronz alaşımları.',
    'Kalaylanmamış bakır kapta asitli yiyecek (turşu, salça) bekletmek bakır zehirlenmesine yol açabilir.'],
  Zn: ['Demiri paslanmaktan korumak için galvaniz kaplama, piller, çinko merhemi. Bağışıklık sistemi için gereklidir.',
    'Çinko buharını solumak "metal dumanı ateşi" denen gribe benzer bir hastalık yapar.'],
  Ga: ['LED lambalar ve güneş panelleri. 29,8 °C\'de erir; avuç içinde bile sıvılaşabilir.',
    'Zehirliliği düşüktür ama alüminyumun içine sızarak onu kırılgan hâle getirir.'],
  Br: ['Yangın geciktiriciler ve bazı ilaçlar. Oda sıcaklığında sıvı olan tek ametaldir.', 'Sıvı brom ve buharı çok zehirli ve yakıcıdır.'],
  Ag: ['Takılar, çatal-bıçak takımları; elektriği en iyi ileten metaldir. Mikrop öldürücü özelliği vardır.',
    'Metal hâli güvenlidir; bazı gümüş bileşikleri cildi ve gözü tahriş eder.'],
  Sn: ['Konserve kutularının iç kaplaması, lehim, bronz. Bakır kapların "kalaylanması" bu elementle yapılır.',
    'Metal hâli güvenlidir; bazı organik kalay bileşikleri zehirlidir.'],
  I: ['Tiroid bezinin çalışması için gereklidir; iyotlu tuz, yara antiseptikleri (povidon iyot).',
    'Saf iyot buharı ve aşırı yüksek dozu zehirlidir.'],
  Xe: ['Otomobillerin xenon farları, bazı uyduların iyon motorları.', 'Zehirli değildir; kapalı alanda oksijeni azaltabilir.'],
  Cs: ['Atom saatleri: saniyenin tanımı sezyum-133 atomuna dayanır.', 'Suyla patlayarak tepkimeye girer.'],
  Ba: ['Röntgen çekiminden önce içilen baryum sülfat, havai fişeklerde yeşil renk.',
    'Suda çözünen baryum bileşikleri zehirlidir (baryum sülfat çözünmediği için güvenlidir).'],
  Nd: ['Çok güçlü neodimyum mıknatıslar: kulaklıklar, elektrik motorları, rüzgâr türbinleri.',
    'Güçlü mıknatıslar parmağı sıkıştırabilir; yutulan birden fazla mıknatıs bağırsakları delebilir, çocuklardan uzak tutulmalıdır.'],
  W: ['Eski tip ampullerin ince telleri, matkap uçları. Erime noktası en yüksek metaldir (yaklaşık 3422 °C).',
    'Metal hâli genel olarak güvenlidir.'],
  Pt: ['Arabaların egzozundaki katalitik konvertörler, takılar, kalp pilleri, bazı kanser ilaçları.',
    'Metal hâli güvenlidir; bazı platin bileşikleri alerji yapar.'],
  Au: ['Takılar, yatırım, elektronik devrelerdeki bağlantılar, diş hekimliği. Hiç paslanmaz.', 'Çok az tepkimeye girer; zararsızdır.'],
  Hg: ['Eski termometreler ve tansiyon aletleri, floresan lambalar. Oda sıcaklığında sıvı olan tek metaldir.',
    'Cıva buharı sinir sistemine zararlıdır. Kırılan termometrenin cıvası elektrikli süpürgeyle toplanmamalı, oda havalandırılmalıdır.'],
  Pb: ['Araba aküleri, röntgen odalarındaki radyasyon kalkanları. Eskiden boya ve benzinde kullanılırdı.',
    'Zehirli bir ağır metaldir; özellikle çocuklarda zihinsel gelişimi etkiler. Vücutta birikerek zarar verir.'],
  Rn: ['Toprak ve kayalardaki uranyumun bozunmasıyla oluşan radyoaktif bir gazdır.',
    'Havalandırılmayan bodrum ve zemin katlarda birikebilir; sigaradan sonra akciğer kanserinin önemli nedenlerindendir.'],
  Ra: ['Marie ve Pierre Curie tarafından keşfedildi; eskiden karanlıkta parlayan saat kadranlarında kullanıldı.',
    'Çok radyoaktiftir; saat kadranı boyayan işçilerde ağır hastalıklara yol açtı.'],
  U: ['Nükleer santrallerde yakıt olarak kullanılır.',
    'Radyoaktif ve kimyasal olarak zehirlidir; sıkı denetim altında tutulur.'],
  Am: ['Bazı duman dedektörlerinde çok küçük miktarda amerikyum-241 bulunur.',
    'Radyoaktiftir; duman dedektörleri sökülüp içi açılmamalıdır.'],
};
