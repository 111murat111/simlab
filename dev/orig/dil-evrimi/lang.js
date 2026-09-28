// Ses değişimi kuralları, Levenshtein benzerliği ve UPGMA ağacı (DOM'dan bağımsız).
export const VOCAB = ['su', 'göz', 'taş', 'ev', 'yol', 'ekmek', 'dağ', 'ağaç', 'baş', 'kuş', 'yıldız', 'kapı', 'elma', 'kara'];

const V = 'aeıioöuü';
const FRONT = 'eiöü', BACK = 'aıou';
const isV = (c) => V.includes(c);
const toFront = { a: 'e', ı: 'i', o: 'ö', u: 'ü' };
const toBack = { e: 'a', i: 'ı', ö: 'o', ü: 'u' };
const vowelsOf = (w) => [...w].filter(isV);

// Düzenli kurallar tüm sözcüklere birden uygulanır (Yeni Dilbilgiciler: ses değişimi istisnasızdır).
export const RULES = [
  { id: 'lenK', name: 'Ünsüz yumuşaması', short: 'ünlü arası k → ğ', f: (w) => w.replace(/([aeıioöuü])k(?=[aeıioöuü])/g, '$1ğ') },
  { id: 'lenPTC', name: 'Ünsüz yumuşaması', short: 'ünlü arası p, t, ç → b, d, c', f: (w) => w.replace(/([aeıioöuü])([ptç])(?=[aeıioöuü])/g, (m, v, c) => v + { p: 'b', t: 'd', ç: 'c' }[c]) },
  { id: 'initT', name: 'Başta ötümlüleşme', short: 'başta t → d', f: (w) => w.replace(/^t/, 'd') },
  { id: 'initK', name: 'Başta ötümlüleşme', short: 'başta k → g', f: (w) => w.replace(/^k/, 'g') },
  { id: 'sh2s', name: 'Ünsüz değişimi', short: 'ş → s', f: (w) => w.replace(/ş/g, 's') },
  { id: 'ch2sh', name: 'Ünsüz değişimi', short: 'ç → ş', f: (w) => w.replace(/ç/g, 'ş') },
  { id: 'y2c', name: 'Ünsüz değişimi', short: 'başta y → c', f: (w) => w.replace(/^y/, 'c') },
  { id: 'b2v', name: 'Sızıcılaşma', short: 'ünlü arası b → v', f: (w) => w.replace(/([aeıioöuü])b(?=[aeıioöuü])/g, '$1v') },
  { id: 'gLoss', name: 'Ünsüz düşmesi', short: 'ğ düşer, ünlü uzar', f: (w) => w.replace(/([aeıioöuü])ğ([aeıioöuü])/g, '$1$2').replace(/([aeıioöuü])ğ/g, '$1$1').replace(/([aeıioöuü])\1\1/g, '$1$1') },
  { id: 'finK', name: 'Ünsüz düşmesi', short: 'sonda k düşer', f: (w) => (w.length > 3 ? w.replace(/([aeıioöuü])k$/, '$1') : w) },
  { id: 'apoc', name: 'Ünlü düşmesi', short: 'iki heceli sözcüklerde sondaki ünlü düşer', f: (w) => (vowelsOf(w).length >= 2 && isV(w[w.length - 1]) && !isV(w[w.length - 2]) ? w.slice(0, -1) : w) },
  { id: 'harmF', name: 'Ünlü uyumu değişimi', short: 'ön ünlüden sonra art ünlüler önleşir', f: (w) => {
    let front = null;
    return [...w].map((c) => { if (!isV(c)) return c; if (front === null) { front = FRONT.includes(c); return c; } return front && toFront[c] ? toFront[c] : c; }).join('');
  } },
  { id: 'harmB', name: 'Ünlü uyumu değişimi', short: 'ilk ünlü sondakine uyar (art)', f: (w) => {
    const vs = vowelsOf(w);
    if (vs.length < 2 || !BACK.includes(vs[vs.length - 1]) || !FRONT.includes(vs[0])) return w;
    const i = [...w].findIndex(isV);
    return w.slice(0, i) + toBack[w[i]] + w.slice(i + 1);
  } },
  { id: 'o2u', name: 'Ünlü değişimi', short: 'ö → ü (daralma)', f: (w) => w.replace(/ö/g, 'ü') },
  { id: 'u2i', name: 'Ünlü değişimi', short: 'ü → i (düzleşme)', f: (w) => w.replace(/ü/g, 'i') },
  { id: 'ı2i', name: 'Ünlü değişimi', short: 'ı → i (önleşme)', f: (w) => w.replace(/ı/g, 'i') },
  { id: 'e2i', name: 'Ünlü değişimi', short: 'ilk hecede e → i (daralma)', f: (w) => w.replace(/^([^aeıioöuü]*)e/, '$1i') },
  { id: 'a2o', name: 'Ünlü değişimi', short: 'dudak ünsüzünden sonra a → o', f: (w) => w.replace(/([bmpv])a/g, '$1o') },
];

/** Düzensiz (tek sözcükte) ses göçüşmesi: yan yana iki ünsüzün yer değiştirmesi. */
export function metathesis(w) {
  const arr = [...w];
  const idx = [];
  for (let i = 0; i < arr.length - 1; i++) if (!isV(arr[i]) && !isV(arr[i + 1]) && arr[i] !== arr[i + 1]) idx.push(i);
  if (!idx.length) return w;
  const i = idx[Math.floor(Math.random() * idx.length)];
  [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
  return arr.join('');
}

export function lev(a, b) {
  a = [...a]; b = [...b];
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
/** Normalleştirilmiş benzerlik 0..1 (sözcük listesi ortalaması). */
export function similarity(A, B) {
  let s = 0;
  for (let k = 0; k < A.length; k++) s += 1 - lev(A[k], B[k]) / Math.max([...A[k]].length, [...B[k]].length, 1);
  return s / A.length;
}

/** UPGMA: uzaklık matrisi → ikili ağaç { left, right, h, members } (h = birleşme yüksekliği = uzaklık/2). */
export function upgma(D) {
  let cl = D.map((_, i) => ({ leaf: i, h: 0, members: [i] }));
  const dist = D.map((r) => r.slice());
  let ids = cl.map((_, i) => i);
  const nodes = cl.slice();
  while (ids.length > 1) {
    let best = [0, 1], bd = Infinity;
    for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
      const d = dist[ids[a]][ids[b]];
      if (d < bd) { bd = d; best = [a, b]; }
    }
    const [ia, ib] = [ids[best[0]], ids[best[1]]];
    const A = nodes[ia], B = nodes[ib];
    const node = { left: A, right: B, h: Math.max(bd / 2, A.h, B.h), members: [...A.members, ...B.members] };
    const id = nodes.length;
    nodes.push(node);
    dist[id] = [];
    for (const k of ids) {
      if (k === ia || k === ib) continue;
      const d = (A.members.length * dist[ia][k] + B.members.length * dist[ib][k]) / (A.members.length + B.members.length);
      dist[id][k] = d; dist[k][id] = d;
    }
    ids = ids.filter((k) => k !== ia && k !== ib);
    ids.push(id);
  }
  return nodes[ids[0]];
}
/** Ağacı eşikte keserek küme etiketleri döndürür. */
export function cutTree(root, hCut, n) {
  const lab = new Array(n).fill(0);
  let c = 0;
  (function walk(nd) {
    if (nd.leaf != null || nd.h <= hCut) { nd.members.forEach((m) => (lab[m] = c)); c++; return; }
    walk(nd.left); walk(nd.right);
  })(root);
  return { labels: lab, count: c };
}
