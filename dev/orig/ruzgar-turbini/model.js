// Rüzgâr türbini fiziği: P = ½ρAv³Cp, Heier/Slootweg Cp(λ, β) yaklaşımı, kanat açısı kontrolü, Weibull yıllık enerji.

export const BETZ = 16 / 27;
export const CUT_IN = 3;
export const CUT_OUT = 25;
export const ETA = 0.95; // dişli kutusu + jeneratör verimi (temsilî)

// Kanat sayısına göre optimum uç hız oranı ve uç kaybı çarpanı (temsilî ölçekleme; Heier eğrisi 3 kanat içindir)
const LOPT = { 1: 14, 2: 10.5, 3: 8.1, 4: 6.8, 5: 6 };
const KB = { 1: 0.86, 2: 0.95, 3: 1, 4: 1.01, 5: 1.015 };

/** Heier (1998) / Slootweg vd. (2003) ampirik Cp(λ, β) — 3 kanatlı büyük türbin. */
export function cpHeier(lam, beta) {
  if (lam <= 0.05) return 0;
  const inv = 1 / (lam + 0.08 * beta) - 0.035 / (beta ** 3 + 1);
  if (inv <= 0) return 0;
  const li = 1 / inv;
  const cp = 0.5176 * (116 / li - 0.4 * beta - 5) * Math.exp(-21 / li) + 0.0068 * lam;
  return Math.max(0, cp);
}

/** Kanat sayısı B için Cp: λ ekseni optimum λ'ya göre ölçeklenir, tepe değeri uç kaybıyla çarpılır. */
export function cp(lam, beta, B = 3) {
  return KB[B] * cpHeier((lam * LOPT[3]) / LOPT[B], beta);
}
export const lamOpt = (B) => LOPT[B];
export const cpMax = (B) => cp(LOPT[B], 0, B);

/** Hava yoğunluğu: standart atmosfer basıncı (rakım) + ideal gaz (sıcaklık). */
export function airDensity(altitude, tempC) {
  const p = 101325 * Math.pow(1 - 2.25577e-5 * altitude, 5.25588);
  return p / (287.05 * (tempC + 273.15));
}

/** Göbek yüksekliği (m) — rotor çapından temsilî. */
export const hubHeight = (D) => D / 2 + 4.5 + Math.min(1, Math.max(0, (D - 10) / 110)) * 35;

/** Nominal güce ulaşılan rüzgâr hızı. */
export function ratedWind(t) {
  const A = Math.PI * (t.D / 2) ** 2;
  return Math.cbrt(t.Prated / (ETA * cpMax(t.B) * 0.5 * t.rho * A));
}

/**
 * Otomatik kontrol ile çalışma noktası. t: {D, B, Prated (W), rho}
 * → {P, Pwind, cp, lam, beta, omega, region}
 */
export function operate(t, v) {
  const R = t.D / 2, A = Math.PI * R * R;
  const Pwind = 0.5 * t.rho * A * v ** 3;
  const lo = lamOpt(t.B);
  const vr = ratedWind(t);
  if (v < CUT_IN) return { P: 0, Pwind, cp: 0, lam: 0, beta: 0, omega: v > 0.5 ? (0.25 * lo * v) / R : 0, region: 1 };
  if (v > CUT_OUT) return { P: 0, Pwind, cp: 0, lam: 0, beta: 90, omega: 0, region: 4 };
  if (v <= vr) {
    const c = cp(lo, 0, t.B);
    return { P: ETA * c * Pwind, Pwind, cp: c, lam: lo, beta: 0, omega: (lo * v) / R, region: 2 };
  }
  // Bölge 3: rotor nominal hızda sabit, kanat açısı gücü nominalde tutacak şekilde artar
  const omega = (lo * vr) / R;
  const lam = (omega * R) / v;
  const need = t.Prated / (ETA * Pwind);
  let a = 0, b = 45;
  for (let i = 0; i < 40; i++) {
    const m = (a + b) / 2;
    if (cp(lam, m, t.B) > need) a = m; else b = m;
  }
  const beta = (a + b) / 2;
  return { P: t.Prated, Pwind, cp: cp(lam, beta, t.B), lam, beta, omega, region: 3 };
}

/** Elle çalışma: kullanıcı λ ve β seçer. */
export function operateManual(t, v, lam, beta) {
  const R = t.D / 2, A = Math.PI * R * R;
  const Pwind = 0.5 * t.rho * A * v ** 3;
  const c = cp(lam, beta, t.B);
  return { P: ETA * c * Pwind, Pwind, cp: c, lam, beta, omega: (lam * v) / R, region: 0 };
}

/** Aerodinamik Cp'den eksenel indüksiyon a: Cp = 4a(1−a)², a ≤ 1/3. */
export function induction(c) {
  c = Math.min(c, BETZ);
  let lo = 0, hi = 1 / 3;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    if (4 * m * (1 - m) ** 2 < c) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

function gamma(z) {
  // Lanczos yaklaşımı
  const g = 7, C = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  let x = C[0];
  for (let i = 1; i < g + 2; i++) x += C[i] / (z + i);
  const tt = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * tt ** (z + 0.5) * Math.exp(-tt) * x;
}

/** Weibull olasılık yoğunluğu; ortalama hız U ve biçim k (k = 2 → Rayleigh). */
export function weibull(U, k) {
  const c = U / gamma(1 + 1 / k);
  return (v) => (v <= 0 ? 0 : (k / c) * (v / c) ** (k - 1) * Math.exp(-((v / c) ** k)));
}

/** Yıllık enerji (Wh) ve kapasite faktörü. */
export function annual(t, U, k) {
  const f = weibull(U, k);
  const dv = 0.1;
  let Pavg = 0;
  for (let v = dv / 2; v < 40; v += dv) Pavg += operate(t, v).P * f(v) * dv;
  return { E: Pavg * 8760, cf: Pavg / t.Prated, Pavg };
}
