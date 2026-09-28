// Uzay çöpü nüfus modeli: irtifa bantları, sürükleme ile iniş, fırlatma, görev sonu bertaraf, çarpışma (∝ yoğunluk²) ve parçalanma.
export const R_E = 6371;
export const EDGES = [200, 400, 500, 600, 700, 800, 900, 1000, 1200, 2000];
export const NB = EDGES.length - 1;
export const BAND_NAMES = EDGES.slice(0, -1).map((h, i) => `${h}–${EDGES[i + 1]}`);

// Başlangıç dağılımı (≥ 10 cm, temsili; toplam büyüklük ESA 2025 raporundaki mertebede)
const S0 = [200, 1600, 6200, 700, 700, 300, 100, 600, 300];   // aktif uydular
const D0 = [100, 300, 600, 800, 1200, 1400, 1000, 700, 900];  // ölü uydu + roket gövdesi
const F0 = [300, 1200, 1800, 2000, 3000, 3500, 2000, 1200, 1500]; // parçalar
export const LAUNCH_W = [0.03, 0.2, 0.55, 0.08, 0.04, 0.02, 0.01, 0.05, 0.02];

export const FRAG_CAT = 900;  // iki bütün nesne çarpışınca ≥10 cm parça (NASA SBM, M≈1000 kg)
export const FRAG_DMG = 50;   // parça–uydu çarpışması (hasar, temsili)
const OP_LIFE = 5;            // aktif görev ömrü (yıl, temsili)
const RB_PER_SAT = 0.03;      // uydu başına yörüngede kalan roket gövdesi (temsili)
const BETA = 2.4e-7;          // çarpışma katsayısı (başlangıçta yılda ≈ 0,1 büyük çarpışma olacak şekilde)

/** Sürükleme ile ömür (yıl), h km. Güneş etkinliği çarpanı 'sun' (yüksek etkinlik → atmosfer şişer → ömür kısalır). */
export const dragLife = (h, sun = 1) => (1.5 * Math.exp((h - 400) / 75)) / sun;
const VOL = EDGES.slice(0, -1).map((h, i) => ((R_E + EDGES[i + 1]) ** 3 - (R_E + h) ** 3) / 1e9);

export function initState() {
  return { year: 2025, S: [...S0], D: [...D0], Z: new Array(NB).fill(0), F: [...F0], collisions: 0, catastrophic: 0, reentries: 0, removed: 0 };
}

export const total = (s, i) => s.S[i] + s.D[i] + s.Z[i] + s.F[i];
export const sum = (a) => a.reduce((x, y) => x + y, 0);

/** Anlık oranlar: bant başına büyük (II) ve hasar (IF) çarpışma hızı (yıl⁻¹), parça üretimi ve sürükleme ile giderim. */
export function rates(s, p) {
  const out = [];
  for (let i = 0; i < NB; i++) {
    const I = s.D[i] + (s.S[i] + s.Z[i]) * (1 - p.avoid); // görev sonu inişteki uydular da manevra yapabilir
    const II = (BETA * I * I) / VOL[i];
    const IF = (BETA * 2 * I * s.F[i]) / VOL[i] * 0.5;
    const kd = 1 / (dragLife(EDGES[i + 1], p.sun) - dragLife(EDGES[i], p.sun));
    const prod = II * FRAG_CAT + IF * FRAG_DMG;
    const loss = s.F[i] * kd * 2;
    out.push({ II, IF, kd, prod, loss, ratio: loss > 0 ? prod / loss : prod > 0 ? 99 : 0, growth: (prod - loss) / Math.max(s.F[i], 1) });
  }
  return out;
}

function poisson(l, rng) {
  if (l <= 0) return 0;
  if (l > 30) return Math.max(0, Math.round(l + Math.sqrt(l) * gauss(rng)));
  let L = Math.exp(-l), k = 0, q = 1;
  do { k++; q *= rng(); } while (q > L);
  return k - 1;
}
function gauss(rng) { return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng()); }

/** Parçaları bantlara dağıt: %60 aynı bant, %20 üst, %20 alt */
export function addFragments(s, i, n) {
  const up = Math.min(NB - 1, i + 1), dn = Math.max(0, i - 1);
  s.F[i] += n * 0.6; s.F[up] += n * 0.2; s.F[dn] += n * 0.2;
}

function removeIntact(s, i, n) {
  for (const k of ['D', 'Z', 'S']) {
    const take = Math.min(s[k][i], n);
    s[k][i] -= take; n -= take;
    if (n <= 0) return;
  }
}

/**
 * dt yıl ilerlet. p: {launch, pmd(0..1), rule(0 | 25 | 5), adr, avoid(0..1), sun}
 * rng verilirse çarpışmalar Poisson ile rastgele, yoksa beklenen değerle. Olay listesi döndürür.
 */
export function step(s, p, dt, rng) {
  const ev = [];
  const r = rates(s, p);
  // Çarpışmalar
  for (let i = 0; i < NB; i++) {
    const nII = rng ? poisson(r[i].II * dt, rng) : r[i].II * dt;
    const nIF = rng ? poisson(r[i].IF * dt, rng) : r[i].IF * dt;
    if (nII > 0) {
      removeIntact(s, i, 2 * nII);
      addFragments(s, i, FRAG_CAT * nII);
      s.catastrophic += nII;
      if (rng) for (let k = 0; k < Math.min(nII, 3); k++) ev.push({ band: i, big: true });
    }
    if (nIF > 0) {
      // Aktif uydu vurulursa ölü nesneye dönüşür
      const hitS = Math.min(s.S[i], nIF * (s.S[i] * (1 - p.avoid)) / (s.D[i] + (s.S[i] + s.Z[i]) * (1 - p.avoid) + 1e-9));
      s.S[i] -= hitS; s.D[i] += hitS;
      addFragments(s, i, FRAG_DMG * nIF);
      if (rng) for (let k = 0; k < Math.min(nIF, 2); k++) ev.push({ band: i, big: false });
    }
    s.collisions += nII + nIF;
  }
  if (!p.rule) for (let i = 0; i < NB; i++) { s.D[i] += s.Z[i]; s.Z[i] = 0; }
  // Görev sonu: uyumlu olanlar bertaraf havuzuna (kural süresinde iner), diğerleri ölü nesne olur
  const comp = p.rule ? p.pmd : 0;
  for (let i = 0; i < NB; i++) {
    const retire = (s.S[i] / OP_LIFE) * dt;
    s.S[i] -= retire;
    s.Z[i] += retire * comp;
    s.D[i] += retire * (1 - comp);
  }
  // Fırlatmalar
  for (let i = 0; i < NB; i++) {
    s.S[i] += p.launch * LAUNCH_W[i] * dt;
    s.D[i] += p.launch * LAUNCH_W[i] * RB_PER_SAT * dt;
  }
  // Sürükleme: aşağı banda iniş; en alttan atmosfere giriş. Bertaraf havuzu kural süresinde iner.
  const moved = { D: new Array(NB).fill(0), Z: new Array(NB).fill(0), F: new Array(NB).fill(0) };
  for (let i = 0; i < NB; i++) {
    const kd = r[i].kd;
    for (const [k, f] of [['D', 1], ['Z', 1], ['F', 2]]) {
      const m = Math.min(s[k][i], s[k][i] * kd * f * dt);
      s[k][i] -= m;
      if (i === 0) s.reentries += m; else moved[k][i - 1] += m;
    }
    if (p.rule) {
      const z = Math.min(s.Z[i], (s.Z[i] / p.rule) * dt * 1.5);
      s.Z[i] -= z;
      s.reentries += z;
    }
  }
  for (let i = 0; i < NB; i++) { s.D[i] += moved.D[i]; s.Z[i] += moved.Z[i]; s.F[i] += moved.F[i]; }
  // Aktif enkaz kaldırma: kalabalık ve uzun ömürlü bantlardaki büyük ölü nesneler önce
  let adr = p.adr * dt;
  while (adr > 1e-9) {
    let best = -1, bv = 0;
    for (let i = 0; i < NB; i++) { const v = ((s.D[i] * total(s, i)) / VOL[i]) * Math.min(1 / r[i].kd, 300); if (v > bv && s.D[i] > 0.5) { bv = v; best = i; } }
    if (best < 0) break;
    const t = Math.min(adr, s.D[best]);
    s.D[best] -= t; s.removed += t; adr -= t;
  }
  s.year += dt;
  return ev;
}
