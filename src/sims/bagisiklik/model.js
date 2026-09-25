// Basit bağışıklık ODE modeli (gün birimi): mikrop, doğuştan bağışıklık, B/T hücreleri, antikor ve hafıza hücreleri.
// Tüm parametreler temsilidir; amaç nitel davranışı (birincil ↔ ikincil yanıt) doğru göstermektir.
export const KP = 100;           // mikrop yükü tavanı (normalize)
export const H = 0.02;           // adım (gün)
export const MMAX = 0.1;         // hafıza havuzu tavanı
export const VACC_M = 0.06;      // aşının bıraktığı hafıza (temsili)

export function createModel() {
  const p = { kind: 'bakteri', dose: 1, growth: 1.6, weak: 0, antibiotic: false, vaccinated: false };
  const s = { t: 0, P: 0, N: 0.3, B: 0, T: 0, Ab: 0, M: 0, exposures: 0, peakP: 0, cleared: false, lastExpo: 0, sick: 0 };
  const m = { p, s };

  m.reset = () => {
    Object.assign(s, { t: 0, P: 0, N: 0.3, B: 0, T: 0, Ab: 0, M: p.vaccinated ? VACC_M : 0, exposures: 0, peakP: 0, cleared: false, lastExpo: 0, sick: 0 });
    if (p.vaccinated) s.Ab = 0.6;   // aşıdan kalan düşük antikor düzeyi
  };
  m.vaccinate = () => { s.M = Math.max(s.M, VACC_M); s.Ab = Math.max(s.Ab, 0.6); };
  m.expose = () => { s.P += p.dose; s.exposures++; s.lastExpo = s.t; s.peakP = s.P; s.cleared = false; };

  m.step = () => {
    const h = H, { P, N, B, T, Ab, M } = s;
    const k = 1 - p.weak;
    const act = P / (P + 0.3);                                   // antijen sinyali (doygun)
    const bact = p.kind === 'bakteri';
    // Mikrop: lojistik çoğalma − doğuştan hücreler − antikor − T hücreleri − antibiyotik (yalnız bakteri!)
    const kill = 0.6 * N + (bact ? 0.35 : 0.25) * Ab + (bact ? 0.4 : 1.1) * T + (p.antibiotic && bact ? 2.2 : 0);
    const dP = p.growth * P * (1 - P / KP) - kill * P;
    // Doğuştan: dokudaki yerleşik makrofajlar + kandan gelen nötrofiller (hızlı ama sınırlı)
    const dN = 0.3 * 0.5 + k * 1.2 * P / (P + 8) - 0.5 * N;
    // Uyarlanır: naif öncüller çok az → birincil yanıt gecikir; hafıza hücreleri hızlı başlatır
    const dB = k * act * (1.35 * B + 0.0002 + 4 * M) - 0.12 * B - (act < 0.02 ? 0.2 * B : 0);
    const dT = k * act * (1.35 * T + 0.0002 + 4 * M) - 0.12 * T - (act < 0.02 ? 0.25 * T : 0);
    const dAb = 1.2 * B - (Math.LN2 / 21) * Ab - 0.02 * Ab * P;   // IgG yarı ömrü ≈ 3 hafta
    const dM = 0.05 * (B + T) * (1 - M / MMAX);
    s.P = Math.max(0, P + h * dP);
    if (s.P < 0.005) s.P = 0;   // son mikroplar da temizlendi
    s.N = Math.max(0, N + h * dN);
    s.B = Math.max(0, B + h * dB);
    s.T = Math.max(0, T + h * dT);
    s.Ab = Math.max(0, Ab + h * dAb);
    s.M = Math.min(MMAX, M + h * dM);
    s.t += h;
    s.peakP = Math.max(s.peakP, s.P);
    if (s.exposures && !s.cleared && s.P === 0) s.cleared = true;
    // Hastalık belirtisi: mikrop yükü + iltihap (doğuştan yanıt)
    const sickT = Math.min(1, s.P / 40 + Math.max(0, s.N - 0.6) * 0.12);
    s.sick += (sickT - s.sick) * Math.min(1, h / 0.7);
  };
  return m;
}
