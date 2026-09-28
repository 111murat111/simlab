// Sel ve Kentleşme — hidrolojik çekirdek: SCS-CN yağış fazlası, Nash kaskadı ile öteleme, Manning ile su derinliği.

export const AREA_KM2 = 17.28;   // 4,8 km × 3,6 km havza
export const T_END = 720;        // olay süresi (dk)
export const BASEFLOW = 0.4;     // taban akışı (m³/s)
export const BANKFULL_D = 2;     // kanal kıyı dolu derinliği (m)
export const CH = {
  dogal: { b: 12, n: 0.035 },    // doğal yatak: 12 m genişlik
  dar: { b: 7, n: 0.045 },       // yatağa yapılaşma: daralmış, pürüzlü yatak
};
const SLOPE = 0.003;             // boyuna eğim
const SFP = 0.0075;              // taşkın düzlüğünün yanal eğimi (100 m'de 0,75 m)
const NFP = 0.06;                // taşkın düzlüğü Manning n (bina, çit, bitki)
const POND_V = 150000;           // bekletme havuzu hacmi (m³)
const POND_Q = 18;               // havuzun geçirdiği en büyük debi (m³/s)
const GARDEN_MM = 15;            // yağmur bahçelerinin geçirimsiz alandan tuttuğu yüzey akışı (mm)

const scsQ = (P, cn) => {
  const S = 25400 / cn - 254, Ia = 0.2 * S;
  return P > Ia ? (P - Ia) ** 2 / (P - Ia + S) : 0;
};
// Önceki nem koşulu (AMC I/III) dönüşümü — Chow vd. (1988)
const amcAdj = (cn, a) => (a === 'kuru' ? cn / (2.281 - 0.01281 * cn) : a === 'islak' ? cn / (0.427 + 0.00573 * cn) : cn);

/** Arazi kullanım sınıfları: alan payı f, CN (TR-55, toprak grubu B), rasyonel C. */
export function classes(p) {
  const u = p.urban, nat = 1 - u, fo = p.forestShare ?? 0.6;
  return [
    { name: 'orman', f: nat * fo, cn: 60, c: 0.15 },
    { name: 'çayır', f: nat * (1 - fo), cn: 69, c: 0.25 },
    { name: 'çatı', f: u * 0.35, cn: p.greenRoof ? 86 : 98, c: p.greenRoof ? 0.5 : 0.9, imp: true },
    { name: 'kaldırım/otopark', f: u * 0.2, cn: p.permeable ? 76 : 98, c: p.permeable ? 0.4 : 0.9, imp: !p.permeable },
    { name: 'yol', f: u * 0.2, cn: 98, c: 0.9, imp: true },
    { name: 'bahçe', f: u * 0.25, cn: 61, c: 0.2 },
  ].map((k) => ({ ...k, cn: amcAdj(k.cn, p.amc) }));
}

/** SCS gecikme formülü (saat) + kentsel drenajın (oluk, boru) kısalttığı süre. */
export function lagHours(p) {
  const cls = classes(p);
  const cn = cls.reduce((s, k) => s + k.f * k.cn, 0);
  const l = 5000 * 3.281, Y = 10, S = 1000 / cn - 10;
  let L = (l ** 0.8 * (S + 1) ** 0.7) / (1900 * Math.sqrt(Y));
  L *= 1 - 0.45 * p.urban;
  if (p.rainGarden) L *= 1 + 0.08 * p.urban;
  if (p.permeable) L *= 1 + 0.05 * p.urban;
  return { lag: Math.max(L, 0.15), cn };
}

/** Kanal + taşkın düzlüğü için Manning debisi Q(h). */
export function flowAt(h, ch) {
  const D = BANKFULL_D;
  const A = ch.b * h, P = ch.b + 2 * Math.min(h, D);
  let Q = (1 / ch.n) * A * Math.cbrt((A / P) ** 2) * Math.sqrt(SLOPE);
  if (h > D) {
    const e = h - D, Af = (e * e) / SFP, Pf = (2 * e) / SFP;
    Q += (1 / NFP) * Af * Math.cbrt((Af / Pf) ** 2) * Math.sqrt(SLOPE);
  }
  return Q;
}

export function stageOf(Q, ch) {
  let lo = 0, hi = 15;
  for (let i = 0; i < 40; i++) {
    const m = (lo + hi) / 2;
    if (flowAt(m, ch) < Q) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

export const bankfullQ = (ch) => flowAt(BANKFULL_D, ch);

/**
 * Dakikalık olay benzetimi. p: {urban, forestShare, greenRoof, permeable, rainGarden, pond, amc}, i: mm/sa, dur: sa
 * Dönen: Q (m³/s), rain (mm/sa), pond (0..1 doluluk), pik, pik zamanı, hacimler.
 */
export function simulate(p, i, dur) {
  const cls = classes(p);
  const { lag, cn } = lagHours(p);
  const n = 3, K = (lag * 60) / (n - 1);          // Nash kaskadı: pik zamanı = (n-1)K = gecikme
  const A = AREA_KM2 * 1e6;
  const Q = new Float32Array(T_END + 1), rain = new Float32Array(T_END + 1), pond = new Float32Array(T_END + 1);
  const S = new Float64Array(n);
  let P = 0, prevRun = 0, pondV = 0, peak = 0, tPeak = 0, runVol = 0;
  const cumRun = (P) => cls.reduce((s, k) => {
    let q = scsQ(P, k.cn);
    if (p.rainGarden && k.imp) q = Math.max(0, q - GARDEN_MM);
    return s + k.f * q;
  }, 0);
  for (let t = 0; t <= T_END; t++) {
    const r = t < dur * 60 ? i : 0;
    rain[t] = r;
    P += r / 60;
    const run = cumRun(P);
    const inflow = (Math.max(0, run - prevRun) / 1000) * A / 60; // m³/s
    prevRun = run;
    runVol += inflow * 60;
    // Nash kaskadı (örtük adım, dt = 1 dk)
    let q = inflow;
    for (let k = 0; k < n; k++) { S[k] = (S[k] + q) / (1 + 1 / K); q = S[k] / K; }
    let out = q + BASEFLOW;
    if (p.pond) {
      if (out > POND_Q && pondV < POND_V) { const take = Math.min(out - POND_Q, (POND_V - pondV) / 60); pondV += take * 60; out -= take; }
      else if (out < POND_Q && pondV > 0) { const give = Math.min(POND_Q - out, pondV / 60, 3); pondV -= give * 60; out += give; }
    }
    pond[t] = pondV / POND_V;
    Q[t] = out;
    if (out > peak) { peak = out; tPeak = t; }
  }
  const rainVol = (i * dur / 1000) * A;
  const Cr = cls.reduce((s, k) => s + k.f * k.c, 0);
  return { Q, rain, pond, peak, tPeak, runVol, rainVol, C: rainVol ? runVol / rainVol : 0, cn, lag, Crat: Cr };
}

/** Rasyonel yöntem: Q = C·i·A / 3,6 (A km², i mm/sa). Süre < Tc ise şiddet süreye göre azaltılır. */
export function rational(p, i, dur) {
  const { lag } = lagHours(p);
  const tc = lag / 0.6;
  const Cr = classes(p).reduce((s, k) => s + k.f * k.c, 0);
  const ie = dur >= tc ? i : i * dur / tc;
  return { Q: (Cr * ie * AREA_KM2) / 3.6, C: Cr, tc };
}
