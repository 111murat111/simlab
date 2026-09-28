// Schaefer artık üretim modeli (iki bölmeli: avlanan alan + koruma alanı) ve Gordon–Schaefer açık erişim ekonomisi.
// Birimler: biyokütle bin ton, zaman yıl, para temsili birim (milyon ₺ değil; yalnız oranlar anlamlı).
export const K = 100;            // taşıma kapasitesi (bin ton)
export const Q = 0.005;          // yakalama katsayısı (1 / tekne·yıl)
export const H = 0.02;           // model adımı (yıl)
export const FLEETS = [
  { name: 'Yakın Liman', costMul: 1.0 },
  { name: 'Orta Liman', costMul: 1.25 },
  { name: 'Uzak Liman', costMul: 1.6 },
];
export const MAXB = 60;          // filo başına en çok tekne
const SPAWN = 3;                 // av yasağı üreme mevsiminde, 3. aydan (Nisan) başlar

function gauss(rnd) {
  const u = 1 - rnd(), v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function createModel(rnd = Math.random) {
  const p = { r: 0.5, price: 3, cost: 0.25, quota: 0, closure: 0, reserve: 0, openAccess: false, noise: 0, mig: 0.6 };
  const RING = Math.round(1 / H);
  const m = {
    p, t: 0, Bf: 80, Br: 0, boats: [20, 20, 20], yearCatch: 0, yearRevenue: 0, yearIdx: 0, env: 1,
    ring: new Float32Array(RING), profRing: new Float32Array(RING), ri: 0,
    annualCatch: 0, annualProfit: 0, fishingOpen: true, closedBy: '', lastYear: null, collapsed: false,
  };
  m.B = () => m.Bf + m.Br;
  m.msy = () => (p.r * K) / 4;
  m.effort = () => m.boats.reduce((a, b) => a + b, 0);
  m.costOf = (i) => p.cost * FLEETS[i].costMul;

  m.reset = (B0 = 80, boats = [20, 20, 20]) => {
    const f = p.reserve;
    m.Bf = B0 * (1 - f); m.Br = B0 * f;
    m.boats = boats.slice();
    m.t = 0; m.yearCatch = 0; m.yearRevenue = 0; m.yearIdx = 0; m.env = 1; m.ri = 0;
    m.ring.fill(0); m.profRing.fill(0);
    m.annualCatch = 0; m.annualProfit = 0; m.lastYear = null; m.collapsed = false;
  };

  // Koruma alanı değişince toplam stok alanlara eşit yoğunlukla yeniden dağıtılır (basitleştirme)
  m.setReserve = (f) => {
    const B = m.B();
    p.reserve = f;
    m.Bf = B * (1 - f); m.Br = B * f;
  };

  m.step = () => {
    const h = H;
    const f = p.reserve, Kf = K * (1 - f), Kr = K * f;
    const month = (m.t % 1) * 12;
    const closed = p.closure > 0 && month >= SPAWN && month < SPAWN + p.closure;
    const quotaHit = p.quota > 0 && m.yearCatch >= p.quota - 1e-9;
    m.fishingOpen = !closed && !quotaHit;
    m.closedBy = closed ? 'sezon' : quotaHit ? 'kota' : '';

    const E = m.fishingOpen ? m.effort() : 0;
    const dens = Kf > 0 ? m.Bf / (1 - f) : 0;         // avlanan alandaki yoğunluk (K birimine göre)
    let C = Q * E * dens;                              // Schaefer: C = q·E·B (alan küçülünce tekneler yoğunlaşır)
    if (p.quota > 0) C = Math.min(C, (p.quota - m.yearCatch) / h);
    C = Math.max(0, Math.min(C, m.Bf / h * 0.9));

    const gF = Kf > 0 ? p.r * m.Bf * (1 - m.Bf / Kf) : 0;
    const gR = Kr > 0 ? p.r * m.Br * (1 - m.Br / Kr) : 0;
    const flux = f > 0 && f < 1 ? p.mig * (m.Br / f - m.Bf / (1 - f)) * f * (1 - f) : 0;   // yoğunluk farkıyla taşma
    m.Bf = Math.max(0, m.Bf + h * (gF * m.env + flux - C));
    m.Br = Math.max(0, m.Br + h * (gR * m.env - flux));
    if (m.B() < 0.05) { m.Bf = 0; m.Br = 0; }

    const catchStep = C * h;
    const revenue = p.price * catchStep;
    const costs = m.boats.reduce((a, n, i) => a + n * m.costOf(i), 0) * h;   // tekneler yıl boyu sabit gider öder
    m.yearCatch += catchStep;
    m.yearRevenue += revenue;
    m.ring[m.ri] = catchStep;
    m.profRing[m.ri] = revenue - costs;
    m.ri = (m.ri + 1) % RING;
    m.annualCatch = m.ring.reduce((a, b) => a + b, 0);
    m.annualProfit = m.profRing.reduce((a, b) => a + b, 0);
    m.t += h;

    if (Math.floor(m.t + 1e-9) > m.yearIdx) yearEnd(E);
    if (m.B() < 0.1 * K) m.collapsed = true;
    if (m.B() > 0.3 * K) m.collapsed = false;
  };

  // Yıl sonu: çevresel dalgalanma, açık erişimde filo büyüklüğü kâra göre değişir
  function yearEnd() {
    const E = m.effort();
    const share = (i) => (E > 0 ? m.boats[i] / E : 0);
    const prof = FLEETS.map((F, i) => p.price * m.yearCatch * share(i) - m.boats[i] * m.costOf(i));
    m.lastYear = { catch: m.yearCatch, revenue: m.yearRevenue, profit: prof.reduce((a, b) => a + b, 0), prof };
    if (p.openAccess) {
      const f = p.reserve;
      const dens = m.Bf / Math.max(1e-6, 1 - f);
      for (let i = 0; i < 3; i++) {
        const n = m.boats[i], c = m.costOf(i);
        const perBoat = n > 0.5 ? prof[i] / n : p.price * Q * dens * (1 - p.closure / 12) - c;  // yeni girenin beklentisi
        let dn = 0.8 * n * (perBoat / c);
        dn = Math.max(-0.3 * n, Math.min(Math.max(2, 0.35 * n), dn));
        if (n < 1 && perBoat > 0) dn = 2;
        m.boats[i] = Math.max(0, Math.min(MAXB, n + dn));
      }
    }
    m.env = p.noise > 0 ? Math.exp(p.noise * gauss(rnd) - (p.noise * p.noise) / 2) : 1;
    m.yearCatch = 0; m.yearRevenue = 0;
    m.yearIdx = Math.floor(m.t + 1e-9);
  }
  return m;
}
