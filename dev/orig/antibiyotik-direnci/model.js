// Direnç sınıflarına bölünmüş bakteri popülasyonu: lojistik büyüme, Emax/Hill öldürme, mutasyon, tek bölmeli farmakokinetik.
export const BINS = 17;          // direnç sınıfı i → log2(MIC/MIC₀) = i·DR
export const DR = 0.5;
export const K = 1e9;            // taşıma kapasitesi (bakteri)
// Mutasyon sıçramaları: +1…+4 sınıf (olasılık geometrik azalır) ve −1 (geri dönüş/telafi)
const JUMPS = 5;
const JW = [0.5, 0.25, 0.12, 0.06, 0.3];

export const DEFAULTS = {
  g0: 0.6,        // en yüksek büyüme hızı (1/sa)
  cost: 0.05,     // her log2 MIC birimi için büyüme kaybı (direncin bedeli)
  d0: 0.05,       // doğal ölüm (1/sa)
  emax: 1.0,      // en yüksek ilaç öldürme hızı (1/sa)
  hill: 2,        // Hill katsayısı
  ec50: 1.2,      // EC50 / MIC
  mu: 1e-6,       // bölünme başına komşu sınıfa geçiş olasılığı (her yön)
  immune: true,
  immMax: 0.3,    // bağışıklık öldürme hızı (düşük yoğunlukta)
  immHalf: 1e5,
};

// Küçük sayılar için Poisson, büyükler için normal yaklaşım
function poisson(l, rnd) {
  if (l <= 0) return 0;
  if (l < 30) {
    const L = Math.exp(-l);
    let k = 0, p = 1;
    do { k++; p *= rnd(); } while (p > L);
    return k - 1;
  }
  const u = 1 - rnd(), v = rnd();
  return Math.max(0, Math.round(l + Math.sqrt(l) * Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v)));
}

export function createModel(rnd = Math.random) {
  const m = {
    p: { ...DEFAULTS },
    n: new Float64Array(BINS),
    births: new Float64Array(BINS),
    kills: new Float64Array(BINS),  // son adımdaki ilaç öldürme hızı (görsel için)
    C: 0,                            // ilaç derişimi (× MIC₀)
    halfLife: 4,
    total() { let s = 0; for (let i = 0; i < BINS; i++) s += m.n[i]; return s; },
    /** Geometrik ortalama MIC'in log2'si */
    meanR() {
      let s = 0, w = 0;
      for (let i = 0; i < BINS; i++) { s += m.n[i] * i * DR; w += m.n[i]; }
      return w > 0 ? s / w : 0;
    },
    killRate(i, C = m.C) {
      const x = C / Math.pow(2, i * DR) / m.p.ec50;
      const xh = Math.pow(x, m.p.hill);
      return m.p.emax * xh / (1 + xh);
    },
    /** İlaçsız dengeye yakın başlangıç (mutasyon–seçilim dengesi) */
    seed(N0 = K * 0.9) {
      m.n.fill(0);
      m.n[0] = N0;
      const C = m.C; m.C = 0;
      for (let k = 0; k < 4000; k++) m.step(0.25, true);
      m.C = C;
      // Toplamı N0'a ölçekle
      const s = m.total();
      for (let i = 0; i < BINS; i++) m.n[i] = m.n[i] * N0 / s;
    },
    step(h, deterministic = false) {
      const p = m.p;
      m.C *= Math.exp(-Math.LN2 / m.halfLife * h);
      const N = m.total();
      const f = Math.max(0, 1 - N / K);
      const imm = p.immune ? p.immMax * p.immHalf / (p.immHalf + N) : 0;
      const b = m.births;
      for (let i = 0; i < BINS; i++) {
        const ni = m.n[i];
        if (ni <= 0) { b[i] = 0; m.kills[i] = m.killRate(i); continue; }
        const r = i * DR;
        const g = p.g0 * Math.max(0.05, 1 - p.cost * r) * f;
        const kill = m.killRate(i);
        m.kills[i] = kill;
        const dRate = p.d0 + kill + imm;
        if (deterministic || ni > 2e4) {
          b[i] = g * ni * h;
          m.n[i] = ni * Math.exp(-dRate * h);
        } else {
          b[i] = poisson(g * ni * h, rnd);
          const died = poisson(ni * (1 - Math.exp(-dRate * h)), rnd);
          m.n[i] = Math.max(0, Math.round(ni) - died);
        }
      }
      // Yeni doğanlar; küçük bir kısmı mutasyonla başka direnç sınıfına geçer (çoğu küçük, azı büyük sıçrama)
      for (let i = 0; i < BINS; i++) {
        const bi = b[i];
        if (bi <= 0) continue;
        let moved = 0;
        for (let k = 1; k <= JUMPS; k++) {
          const j = i + (k === JUMPS ? -1 : k);
          if (j < 0 || j >= BINS) continue;
          let x = bi * p.mu * JW[k - 1];
          if (!deterministic && x < 30) x = poisson(x, rnd);
          if (x) { m.n[j] += x; moved += x; }
        }
        m.n[i] += bi - moved;
      }
      for (let i = 0; i < BINS; i++) if (m.n[i] < 0.5 && !deterministic) m.n[i] = 0;
    },
  };
  return m;
}
