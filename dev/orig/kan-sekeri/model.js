// Basitleştirilmiş Bergman minimal modeli (dakika birimi) + bağırsak emilimi, deri altı insülin, egzersiz ve böbrek atılımı.
// G: glukoz (mg/dL), X: uzak insülin etkisi, I: plazma insülini (µU/mL). Parametreler eğitim amaçlı ayarlanmıştır.
export const VG = 112;      // glukoz dağılım hacmi (dL, 70 kg)
export const VI = 8400;     // insülin dağılım hacmi (mL)
export const RENAL = 180;   // böbrek eşiği (mg/dL)

export const PROFILES = {
  saglikli: { name: 'Sağlıklı', Gb: 90, SI: 1.0, beta: 1.0 },
  direnc: { name: 'İnsülin direnci / prediyabet', Gb: 140, SI: 0.25, beta: 1.35 },
  tip1: { name: 'Tip 1 diyabet', Gb: 95, SI: 0.6, beta: 0 },
  tip2: { name: 'Tip 2 diyabet', Gb: 165, SI: 0.35, beta: 0.5 },
};

export const P = {
  SG: 0.014,      // glukoz etkinliği (1/dk)
  SI0: 0.0014,    // insülin duyarlılığı (mL/µU/dk²) → X ile çarpılır
  p2: 0.03,       // insülin etkisinin yerleşme hızı (1/dk)
  n: 0.14,        // plazma insülin temizlenmesi (1/dk)
  Ib: 10,         // bazal insülin referansı (µU/mL)
  kSec: 0.3,      // beta hücresi yanıt hızı (1/dk)
  Imax: 110, K: 150,
  kFast: 0.02, kSlow: 0.01, // bağırsak emilim hızları (1/dk)
  kSC: 0.022,     // deri altı hızlı etkili insülin emilimi (1/dk)
  kR: 0.006,      // böbrek atılımı (1/dk)
};

export function createState(profile) {
  const pr = PROFILES[profile];
  return { G: pr.Gb, X: 0, I: pr.beta > 0 ? P.Ib : P.Ib * 0.9, Y: pr.beta > 0 ? P.Ib : 0,
    gutF: [0, 0], gutS: [0, 0], sc: [0, 0], ex: 0, exBoost: 0, sleep: 0, dawn: 0 };
}

const hill = (G) => { const r = (G / P.K) ** 4; return (P.Imax * r) / (1 + r); };
// Hill eğrisini bazal glukozda Ib verecek şekilde ölçekle
const secretionTarget = (G, pr) => (pr.beta * hill(G) * P.Ib) / hill(90);

/**
 * h dakikalık adım. inp: { basal (U/dk, yalnız tip 1), exercising (0/1), sleeping (0/1), dawnFactor }
 * Döndürür: { Ra (mg/dL/dk), sec (µU/mL/dk), uptakeMuscle, hepatic (+üretim / −depolama) } — organ ışıması için
 */
export function step(s, h, profile, inp) {
  const pr = PROFILES[profile];
  // Bağırsak (iki bölmeli)
  const aF = P.kFast * s.gutF[1], aS = P.kSlow * s.gutS[1];
  s.gutF[0] -= P.kFast * s.gutF[0] * h; s.gutF[1] += (P.kFast * s.gutF[0] - aF) * h;
  s.gutS[0] -= P.kSlow * s.gutS[0] * h; s.gutS[1] += (P.kSlow * s.gutS[0] - aS) * h;
  const Ra = ((aF + aS) * 1000 * 0.9) / VG; // g/dk → mg/dL/dk
  // Deri altı insülin (iki bölmeli) → plazma
  const aSC = P.kSC * s.sc[1];
  s.sc[0] += (-P.kSC * s.sc[0]) * h; s.sc[1] += (P.kSC * s.sc[0] - aSC) * h;
  const exo = ((aSC + (inp.basal || 0)) * 1e6) / VI; // µU/mL/dk
  // Pankreas: hedefe gecikmeli yaklaşan salgı
  const target = secretionTarget(s.G, pr);
  s.Y += P.kSec * (target - s.Y) * h;
  const sec = P.n * s.Y;
  s.I += (sec + exo - P.n * s.I) * h;
  // Egzersiz: insülinden bağımsız kas alımı + saatlerce süren duyarlılık artışı
  s.ex += ((inp.exercising ? 1 : 0) - s.ex) * Math.min(1, h * 0.15);
  if (inp.exercising) s.exBoost = Math.min(1, s.exBoost + h * 0.012);
  else s.exBoost = Math.max(0, s.exBoost - h * 0.0035);
  const SI = P.SI0 * pr.SI * (1 + 0.8 * s.exBoost);
  s.X += (-P.p2 * s.X + P.p2 * (s.I - P.Ib)) * h;
  // Şafak olayı: sabaha karşı karaciğer üretimi artar (diyabette belirgin)
  const Gb = pr.Gb * (1 + (inp.dawnFactor || 0));
  const hepatic = P.SG * (Gb - s.G); // karaciğer + insülinden bağımsız alım: bazal dengeye çekiş
  const insulinUptake = Math.max(SI * s.X, -P.SG * 0.9) * s.G;
  const exUptake = 0.0045 * s.ex * s.G;
  const renal = s.G > RENAL ? P.kR * (s.G - RENAL) : 0;
  s.G += (hepatic - insulinUptake - exUptake - renal + Ra) * h;
  s.G = Math.max(s.G, 25);
  return { Ra, sec, exo, muscle: Math.max(0, insulinUptake) * 0.7 + exUptake, hepatic: hepatic - Math.max(0, insulinUptake) * 0.3, renal };
}

export function eat(s, grams, fast) { (fast ? s.gutF : s.gutS)[0] += grams; }
export function inject(s, units) { s.sc[0] += units; }
