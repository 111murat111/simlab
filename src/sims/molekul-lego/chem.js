// Molekül Lego — element verileri, VSEPR (AXₙEₘ) çözümlemesi ve hazır moleküller.

// v: değerlik elektronu, p: periyot, en: Pauling elektronegatifliği, rc: kovalent yarıçap (Å), rv: van der Waals yarıçapı (Å)
export const ATOMS = {
  H: { sym: 'H', name: 'Hidrojen', v: 1, p: 1, en: 2.2, rc: 0.31, rv: 1.2, color: 0xf1f5f9 },
  Be: { sym: 'Be', name: 'Berilyum', v: 2, p: 2, en: 1.57, rc: 0.96, rv: 1.53, color: 0xc2ff00 },
  B: { sym: 'B', name: 'Bor', v: 3, p: 2, en: 2.04, rc: 0.84, rv: 1.92, color: 0xffb5b5 },
  C: { sym: 'C', name: 'Karbon', v: 4, p: 2, en: 2.55, rc: 0.76, rv: 1.7, color: 0x5b5f66 },
  N: { sym: 'N', name: 'Azot', v: 5, p: 2, en: 3.04, rc: 0.71, rv: 1.55, color: 0x3b63f8 },
  O: { sym: 'O', name: 'Oksijen', v: 6, p: 2, en: 3.44, rc: 0.66, rv: 1.52, color: 0xef2b2b },
  F: { sym: 'F', name: 'Flor', v: 7, p: 2, en: 3.98, rc: 0.57, rv: 1.47, color: 0x90e050 },
  Si: { sym: 'Si', name: 'Silisyum', v: 4, p: 3, en: 1.9, rc: 1.11, rv: 2.1, color: 0xf0c8a0 },
  P: { sym: 'P', name: 'Fosfor', v: 5, p: 3, en: 2.19, rc: 1.07, rv: 1.8, color: 0xff8000 },
  S: { sym: 'S', name: 'Kükürt', v: 6, p: 3, en: 2.58, rc: 1.05, rv: 1.8, color: 0xfde047 },
  Cl: { sym: 'Cl', name: 'Klor', v: 7, p: 3, en: 3.16, rc: 1.02, rv: 1.75, color: 0x1ff01f },
  Br: { sym: 'Br', name: 'Brom', v: 7, p: 4, en: 2.96, rc: 1.2, rv: 1.85, color: 0xa62929 },
  I: { sym: 'I', name: 'İyot', v: 7, p: 5, en: 2.66, rc: 1.39, rv: 1.98, color: 0x9d2bb8 },
  Xe: { sym: 'Xe', name: 'Ksenon', v: 8, p: 5, en: 2.6, rc: 1.4, rv: 2.16, color: 0x429eb0 },
};

export const CENTRALS = ['Be', 'B', 'C', 'N', 'O', 'Si', 'P', 'S', 'Cl', 'I', 'Xe'];
// Bağlanabilecek uç atomlar: O çift bağla (=O), diğerleri tek bağla
export const LIGANDS = [
  { el: 'H', order: 1 }, { el: 'F', order: 1 }, { el: 'Cl', order: 1 },
  { el: 'Br', order: 1 }, { el: 'I', order: 1 }, { el: 'O', order: 2 },
];

const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const sub = (n) => (n > 1 ? String(n).replace(/\d/g, (d) => SUB[d]) : '');

// Geometri adı ve ideal açı metni: anahtar `${bağlı atom}-${ortaklanmamış çift}`
const GEO = {
  '1-0': ['doğrusal (iki atomlu)', '—'], '1-1': ['doğrusal (iki atomlu)', '—'],
  '1-2': ['doğrusal (iki atomlu)', '—'], '1-3': ['doğrusal (iki atomlu)', '—'],
  '2-0': ['doğrusal', '180°'], '2-1': ['kırık doğru (açısal)', '120°’den biraz küçük'],
  '2-2': ['kırık doğru (açısal)', '109,5°’den küçük'], '2-3': ['doğrusal', '180°'],
  '3-0': ['üçgen düzlem', '120°'], '3-1': ['üçgen piramit', '109,5°’den küçük'], '3-2': ['T-şekli', '90°’den biraz küçük'],
  '4-0': ['düzgün dörtyüzlü', '109,5°'], '4-1': ['tahterevalli', '90° ve 120°’den küçük'], '4-2': ['kare düzlem', '90°'],
  '5-0': ['üçgen çift piramit', '90° ve 120°'], '5-1': ['kare piramit', '90°’den biraz küçük'],
  '6-0': ['düzgün sekizyüzlü', '90°'],
};
const EGEO = { 2: 'doğrusal', 3: 'üçgen düzlem', 4: 'dörtyüzlü', 5: 'üçgen çift piramit', 6: 'sekizyüzlü' };

export const GEOMETRIES = ['doğrusal', 'kırık doğru (açısal)', 'üçgen düzlem', 'üçgen piramit', 'T-şekli', 'düzgün dörtyüzlü',
  'tahterevalli', 'kare düzlem', 'üçgen çift piramit', 'kare piramit', 'düzgün sekizyüzlü'];

/** Molekülün elektron sayımı ve VSEPR sınıfı. ligs: [{el, order}] */
export function analyze(central, ligs) {
  const c = ATOMS[central];
  const n = ligs.length;
  const BO = ligs.reduce((s, l) => s + l.order, 0);
  const rem = c.v - BO;
  const nLP = Math.floor(rem / 2), unpaired = rem % 2;
  const SN = n + nLP + unpaired;
  const around = c.v + BO; // merkez atomun çevresindeki elektron sayısı
  const g = [...(GEO[`${n}-${nLP + unpaired}`] || ['—', '—'])];
  // Farklı uç atomlar simetriyi bozar: "düzgün" sıfatı düşer
  if (g[0].startsWith('düzgün') && new Set(ligs.map((l) => l.el)).size > 1) g[0] = g[0].replace('düzgün ', '') + ' (bozulmuş)';
  let stable = false, status = '';
  const deficient = central === 'B' || central === 'Be';
  if (n === 0) status = `Henüz bağ yok. ${c.name} atomunun <b>${c.v}</b> değerlik elektronu var — bir atom ekle.`;
  else if (unpaired) status = `⚠ 1 eşleşmemiş elektron kaldı (radikal): kararsız. Bir atom daha ekle.`;
  else if (deficient) {
    stable = BO === c.v;
    status = stable
      ? `✓ Kararlı ama <b>oktet eksik</b>: merkezde yalnızca ${around} elektron var (elektron eksikliği). Ortaklanmamış çifti olan moleküllerle kolayca bağ kurar.`
      : `⚠ ${c.name} daha ${c.v - BO} bağ yapabilir.`;
  } else if (around < 8) status = `⚠ Oktet tamamlanmadı: merkezde ${around}/8 elektron. Bir bağ daha ekle.`;
  else {
    stable = true;
    status = around > 8
      ? `✓ Kararlı · <b>Genişlemiş oktet</b>: merkezde ${around} elektron. 3. periyot ve sonrasındaki büyük atomlar 8'den fazla elektron taşıyabilir.`
      : `✓ Kararlı: merkez atom okteti tamamladı (8 elektron).`;
  }
  return { c, n, BO, rem, nLP, unpaired, SN, around, geo: g[0], ideal: g[1], egeo: EGEO[SN] || '—', stable, status };
}

/** Yeni bağ eklenebilir mi? Hata metni ya da null döner. */
export function canAdd(central, ligs, lig) {
  const c = ATOMS[central];
  const BO = ligs.reduce((s, l) => s + l.order, 0) + lig.order;
  if (BO > c.v) return `${c.name} atomunun bağ yapacak serbest elektronu kalmadı (değerlik elektronu: ${c.v}).`;
  if (c.p === 2 && c.v + BO > 8) return `${c.sym} 2. periyotta: çevresinde en fazla 8 elektron (oktet) olabilir.`;
  const rem = c.v - BO;
  if (ligs.length + 1 + Math.ceil(rem / 2) > 6) return '7 elektron bölgesi: basit VSEPR modelinin dışında (ör. XeF₆ bozuk sekizyüzlüdür).';
  return null;
}

const ORDER = ['H', 'O', 'F', 'Cl', 'Br', 'I'];
export function formula(central, ligs) {
  const cnt = { [central]: 1 };
  ligs.forEach((l) => (cnt[l.el] = (cnt[l.el] || 0) + 1));
  // Grup 16–17 merkezde ve H bağlıysa H başa yazılır (H₂O, HCl)
  const hFirst = central !== 'H' && cnt.H && ['O', 'S', 'Cl', 'Br', 'I', 'F'].includes(central);
  const seq = hFirst ? ['H', central, ...ORDER] : [central, ...ORDER];
  const done = new Set();
  let s = '';
  for (const e of seq) {
    if (!cnt[e] || done.has(e)) continue;
    done.add(e);
    s += e + sub(cnt[e]);
  }
  return s;
}
export const keyOf = (central, ligs) => central + '|' + ligs.map((l) => l.el).sort().join(',');

const L = (s) => s.split(',').map((el) => ({ el, order: el === 'O' ? 2 : 1 }));
// angle: ölçülmüş en küçük bağ açısı (derece) → model buna göre ayarlanır. mu: deneysel dipol momenti (D)
export const PRESETS = [
  { id: 'H2O', name: 'Su', c: 'O', l: L('H,H'), angle: 104.5, mu: 1.85, fact: 'Kırık şekli sayesinde polardır: tuzu çözer, yüksek kaynama noktasına sahiptir. Mikrodalga fırın su moleküllerini döndürerek ısıtır.' },
  { id: 'CO2', name: 'Karbondioksit', c: 'C', l: L('O,O'), mu: 0, fact: 'Bağları polar ama molekül doğrusal olduğu için dipoller birbirini sıfırlar: apolar. Titreşimleri kızılötesi ışığı soğurduğu için sera gazıdır.' },
  { id: 'CH4', name: 'Metan', c: 'C', l: L('H,H,H,H'), mu: 0, fact: 'Doğal gazın ana bileşeni. Apolar olduğu için suda çok az çözünür.' },
  { id: 'NH3', name: 'Amonyak', c: 'N', l: L('H,H,H'), angle: 107.8, mu: 1.47, fact: 'Gübre üretiminin temel maddesi. Azot üzerindeki ortaklanmamış çift H⁺ bağlayabildiği için baz gibi davranır.' },
  { id: 'BF3', name: 'Bor triflorür', c: 'B', l: L('F,F,F'), mu: 0, fact: 'Borun okteti eksiktir; NH₃ gibi ortaklanmamış çifti olan moleküllerle kolayca bağ kurar (Lewis asidi). Endüstride katalizör olarak kullanılır.' },
  { id: 'SF6', name: 'Kükürt hekzaflorür', c: 'S', l: L('F,F,F,F,F,F'), mu: 0, fact: 'Yüksek gerilim şalt cihazlarında yalıtkan gaz olarak kullanılır; ancak CO₂’den 20 binden fazla kat güçlü bir sera gazıdır.' },
  { id: 'PCl5', name: 'Fosfor pentaklorür', c: 'P', l: L('Cl,Cl,Cl,Cl,Cl'), mu: 0, fact: 'Organik kimyada –OH gruplarını klorla değiştirmek için kullanılan bir reaktif. Gaz hâlinde üçgen çift piramittir.' },
  { id: 'XeF4', name: 'Ksenon tetraflorür', c: 'Xe', l: L('F,F,F,F'), mu: 0, fact: 'Soy gazlar da bileşik yapabilir! İlk ksenon bileşikleri 1962’de elde edildi. İki ortaklanmamış çift karşılıklı durur → kare düzlem.' },
  { id: 'HCl', name: 'Hidrojen klorür', c: 'Cl', l: L('H'), mu: 1.08, fact: 'Suda çözününce hidroklorik asit (tuz ruhu) olur. Midemizdeki asit de HCl’dir.' },
  { id: 'BeCl2', name: 'Berilyum klorür', c: 'Be', l: L('Cl,Cl'), mu: 0, fact: 'Gaz fazında doğrusal tekil moleküllerdir; berilyumun çevresinde yalnızca 4 elektron vardır. Katı hâlde zincirler oluşturur.' },
  { id: 'SF4', name: 'Kükürt tetraflorür', c: 'S', l: L('F,F,F,F'), mu: 0.63, realText: 'Gerçekte F–S–F ≈ 173° (eksen) ve ≈ 102° (ekvator)', fact: 'Organik kimyada florlama reaktifi. Ekvatordaki ortaklanmamış çift molekülü tahterevalliye çevirir.' },
  { id: 'ClF3', name: 'Klor triflorür', c: 'Cl', l: L('F,F,F'), angle: 87.5, mu: 0.6, fact: 'Bilinen en reaktif maddelerden biri; camı, kumu, hatta betonu tutuşturabilir.' },
  { id: 'XeF2', name: 'Ksenon diflorür', c: 'Xe', l: L('F,F'), mu: 0, fact: 'Üç ortaklanmamış çift ekvatoru doldurur, F atomları eksende kalır: doğrusal ve apolar. Laboratuvarda florlama reaktifi.' },
  { id: 'IF5', name: 'İyot pentaflorür', c: 'I', l: L('F,F,F,F,F'), angle: 81.9, mu: 2.18, fact: 'Tek ortaklanmamış çift sekizyüzlünün bir köşesini kaplar → kare piramit. Florlama reaktifi olarak kullanılır.' },
  { id: 'SO2', name: 'Kükürt dioksit', c: 'S', l: L('O,O'), angle: 119.5, mu: 1.63, fact: 'Volkanlarda ve kömür yakılınca açığa çıkar; asit yağmurlarına yol açar. Kuru kayısıda koruyucu (E220) olarak kullanılır.' },
  { id: 'SO3', name: 'Kükürt trioksit', c: 'S', l: L('O,O,O'), mu: 0, fact: 'Sülfürik asit üretiminde ara ürün. Üçgen düzlem ve simetrik olduğu için apolar.' },
  { id: 'CH2O', name: 'Formaldehit', c: 'C', l: L('H,H,O'), angle: 116.5, mu: 2.33, fact: 'Sulu çözeltisi formalindir; bazı yapıştırıcı ve reçinelerde bulunur, zehirlidir. C=O çift bağı H–C–H açısını daraltır.' },
  { id: 'CCl4', name: 'Karbon tetraklorür', c: 'C', l: L('Cl,Cl,Cl,Cl'), mu: 0, fact: 'Eskiden kuru temizleme ve yangın söndürmede kullanılırdı; zehirli ve ozon tabakasına zararlı olduğu için yasaklandı.' },
  { id: 'CHCl3', name: 'Kloroform', c: 'C', l: L('H,Cl,Cl,Cl'), mu: 1.04, realText: 'Gerçekte Cl–C–Cl ≈ 111°', fact: 'Bir zamanlar anestezik olarak kullanıldı. Tek bir C–H bağı simetriyi bozar → molekül polardır.' },
  { id: 'H2S', name: 'Hidrojen sülfür', c: 'S', l: L('H,H'), angle: 92.1, mu: 0.97, fact: 'Çürük yumurta kokulu, çok zehirli bir gaz. Açısı sudan çok daha dardır.' },
  { id: 'PH3', name: 'Fosfin', c: 'P', l: L('H,H,H'), angle: 93.5, mu: 0.57, fact: 'Zehirli bir gaz. P–H bağları neredeyse apolardır; zayıf polarlık ortaklanmamış çiftten gelir.' },
  { id: 'NF3', name: 'Azot triflorür', c: 'N', l: L('F,F,F'), angle: 102.2, mu: 0.23, fact: 'Çip üretiminde temizleme gazı. N–F bağ dipolleri ile ortaklanmamış çiftin etkisi birbirine karşı çalışır → dipolü NH₃’ten çok küçüktür.' },
  { id: 'PCl3', name: 'Fosfor triklorür', c: 'P', l: L('Cl,Cl,Cl'), angle: 100.3, mu: 0.56, fact: 'Tarım ilaçları ve plastik katkı maddelerinin hammaddesi.' },
  { id: 'OF2', name: 'Oksijen diflorür', c: 'O', l: L('F,F'), angle: 103.1, mu: 0.3, fact: 'Oksijenin pozitif kısmi yük taşıdığı ender bileşiklerden: çünkü flor oksijenden daha elektronegatiftir.' },
];
export const PRESET_BY_KEY = Object.fromEntries(PRESETS.map((p) => [keyOf(p.c, p.l), p]));

export function bondType(d) {
  d = Math.abs(d);
  if (d < 0.4) return 'apolar kovalent';
  if (d < 1.7) return 'polar kovalent';
  return 'iyonik karakteri yüksek';
}
