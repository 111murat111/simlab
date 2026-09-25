// Standart genetik kod, çeviri ve mutasyon sınıflandırması (THREE'den bağımsız saf fonksiyonlar).

const ORDER = 'TCAG';
// NCBI standart tablo (1): ilk baz × 16 + ikinci × 4 + üçüncü, T-C-A-G sırasıyla; * = DUR
const TABLE = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';

/** Tek harf → [3 harfli kısaltma, Türkçe ad, sınıf]. Sınıf: h hidrofobik, p polar, a asidik (−), b bazik (+) */
export const AA = {
  A: ['Ala', 'Alanin', 'h'], R: ['Arg', 'Arjinin', 'b'], N: ['Asn', 'Asparajin', 'p'], D: ['Asp', 'Aspartik asit', 'a'],
  C: ['Cys', 'Sistein', 'p'], Q: ['Gln', 'Glutamin', 'p'], E: ['Glu', 'Glutamik asit', 'a'], G: ['Gly', 'Glisin', 'h'],
  H: ['His', 'Histidin', 'b'], I: ['Ile', 'İzolösin', 'h'], L: ['Leu', 'Lösin', 'h'], K: ['Lys', 'Lizin', 'b'],
  M: ['Met', 'Metiyonin', 'h'], F: ['Phe', 'Fenilalanin', 'h'], P: ['Pro', 'Prolin', 'h'], S: ['Ser', 'Serin', 'p'],
  T: ['Thr', 'Treonin', 'p'], W: ['Trp', 'Triptofan', 'h'], Y: ['Tyr', 'Tirozin', 'p'], V: ['Val', 'Valin', 'h'],
};
export const CLASS_NAME = { h: 'hidrofobik (suyu sevmez)', p: 'polar (suyu sever)', a: 'asidik (− yüklü)', b: 'bazik (+ yüklü)' };
export const COMP = { A: 'T', T: 'A', G: 'C', C: 'G' };
export const RNA_COMP = { A: 'U', U: 'A', G: 'C', C: 'G' };

/** DNA kodonu (ör. "GAG") → tek harfli amino asit ya da "*" (DUR). */
export function aaOf(codon) {
  const i = ORDER.indexOf(codon[0]) * 16 + ORDER.indexOf(codon[1]) * 4 + ORDER.indexOf(codon[2]);
  return TABLE[i];
}
export const toRNA = (s) => s.replace(/T/g, 'U');
export const aaName = (a) => (a === '*' ? 'DUR' : AA[a][1]);
export const aaShort = (a) => (a === '*' ? 'DUR' : AA[a][0]);

/** Ribozom ilk ATG'den başlar, DUR'a ya da dizinin sonuna kadar okur. */
export function translate(seq) {
  const start = seq.indexOf('ATG');
  const out = { start, aa: '', pos: [], stop: false, stopAt: -1 };
  if (start < 0) return out;
  for (let i = start; i + 3 <= seq.length; i += 3) {
    const a = aaOf(seq.substr(i, 3));
    if (a === '*') { out.stop = true; out.stopAt = i; break; }
    out.aa += a;
    out.pos.push(i);
  }
  return out;
}

const commonPrefix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
const commonSuffix = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++; return i; };

/**
 * Güncel diziyi orijinalle karşılaştırır.
 * type: none | silent | missense | nonsense | stoploss | frameshift | inframe | startloss
 */
export function classify(orig, cur) {
  const po = translate(orig), pc = translate(cur);
  const changed = new Set();
  for (let j = 0; j < Math.max(po.aa.length, pc.aa.length); j++) if (po.aa[j] !== pc.aa[j]) changed.add(j);
  const res = { po, pc, changed, type: 'none', title: 'Mutasyon yok', tone: '', text: 'Dizi orijinal tarifle aynı.' };
  if (cur === orig) return res;
  const lenDiff = cur.length - orig.length;
  const fd = commonPrefix(orig, cur);
  const same = po.aa === pc.aa && po.stop === pc.stop;

  if (same) {
    const suf = Math.min(commonSuffix(orig, cur), Math.min(orig.length, cur.length) - fd);
    const outside = po.start >= 0 && (orig.length - suf <= po.start || (po.stop && fd >= po.stopAt + 3));
    const where = outside ? ' Değişiklik proteini kodlayan bölgenin dışında.' : ' Kodon değişti ama aynı amino asidi kodluyor (genetik kodun “yedekliliği”).';
    return { ...res, type: 'silent', title: 'Sessiz mutasyon', tone: 'good', text: 'Protein hiç değişmedi.' + where };
  }
  if (pc.start < 0) {
    return { ...res, type: 'startloss', title: 'Başlangıç kodonu kaybı', tone: 'bad', text: 'mRNA\'da hiç AUG kalmadı; ribozom okumaya başlayamıyor, <b>protein yapılamıyor</b>.' };
  }
  if (po.start >= 0 && fd < po.start + 3 && pc.start !== po.start + (fd < po.start ? lenDiff : 0)) {
    return { ...res, type: 'startloss', title: 'Başlangıç kodonu değişti', tone: 'bad',
      text: `Asıl AUG bozuldu; ribozom ${pc.start + 1}. nükleotitteki ilk AUG'dan başlıyor. Ortaya çıkan protein tamamen farklı olabilir.` };
  }
  const first = Math.min(...changed);
  if (lenDiff % 3 !== 0) {
    const tail = pc.stop
      ? (pc.aa.length < po.aa.length ? `Yeni okuma çerçevesinde erken bir DUR çıktı: protein <b>${pc.aa.length}</b> amino asitte kesiliyor.` : `Protein ${pc.aa.length} amino asit uzunluğunda.`)
      : 'Yeni çerçevede DUR kodonu yok; ribozom mRNA\'nın sonuna kadar gidiyor.';
    return { ...res, type: 'frameshift', title: 'Çerçeve kayması', tone: 'bad',
      text: `${Math.abs(lenDiff) === 1 ? 'Tek harf' : Math.abs(lenDiff) + ' harf'} ${lenDiff > 0 ? 'eklendi' : 'silindi'}: ${first + 1}. amino asitten itibaren üçlü okuma kayıyor, sonraki kodonların hepsi değişiyor. ${tail}` };
  }
  if (lenDiff !== 0) {
    return { ...res, type: 'inframe', title: 'Çerçeve içi ekleme/silme', tone: 'warn',
      text: `${Math.abs(lenDiff)} harf (${Math.abs(lenDiff) / 3} kodon) ${lenDiff > 0 ? 'eklendi' : 'silindi'}; okuma çerçevesi korunuyor, protein ${Math.abs(lenDiff) / 3} amino asit ${lenDiff > 0 ? 'uzun' : 'kısa'}.` };
  }
  if (pc.stop && pc.aa.length < po.aa.length) {
    return { ...res, type: 'nonsense', title: 'Anlamsız (nonsense) mutasyon', tone: 'bad',
      text: `Bir kodon DUR kodonuna dönüştü: protein ${po.aa.length} yerine <b>${pc.aa.length}</b> amino asitte kesiliyor. Kısa protein genellikle işlevsizdir.` };
  }
  if (pc.aa.length > po.aa.length || (po.stop && !pc.stop)) {
    return { ...res, type: 'stoploss', title: 'DUR kodonu kaybı', tone: 'warn',
      text: `DUR kodonu başka bir amino aside dönüştü; ribozom okumaya devam ediyor, protein uzuyor (${pc.aa.length} amino asit).` };
  }
  const list = [...changed].slice(0, 3).map((j) => `${j + 1}. amino asit: <b>${aaName(po.aa[j])} → ${aaName(pc.aa[j])}</b>`);
  return { ...res, type: 'missense', title: 'Yanlış anlamlı (missense) mutasyon', tone: 'warn',
    text: `Bir amino asit başkasıyla değişti. ${list.join(', ')}.` };
}

/** 8–12 kodonluk rastgele gen: ATG + ara kodonlar (DUR yok) + DUR. */
export function randomGene() {
  const n = 7 + Math.floor(Math.random() * 5);
  let s = 'ATG';
  const B = 'ACGT';
  while (s.length < 3 + n * 3) {
    const c = B[Math.floor(Math.random() * 4)] + B[Math.floor(Math.random() * 4)] + B[Math.floor(Math.random() * 4)];
    if (aaOf(c) !== '*') s += c;
  }
  return s + ['TAA', 'TAG', 'TGA'][Math.floor(Math.random() * 3)];
}
