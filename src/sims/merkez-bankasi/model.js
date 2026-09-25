// Üç denklemli (IS – Phillips – politika kuralı) basit Yeni Keynesyen tarzı çeyreklik makro model. Oranlar yıllık %.
export function createEconomy(p) {
  const e = { p, hist: [] };
  e.reset = (o = {}) => {
    const T = p.target;
    e.q = 0;
    e.pi = o.pi ?? T; e.pie = o.pie ?? e.pi; e.y = o.y ?? 0;
    e.i = o.i ?? p.rStar + e.pi;
    e.r = e.i - e.pie;
    e.s = 0; e.d = 0; e.bias = 0; e.credHit = 0;
    e.P = 100; e.u = p.uStar;
    e.hist = [];
    for (let k = 0; k < 12; k++) e.hist.push(e.r);
  };
  e.taylor = () => p.rStar + e.pi + p.phiPi * (e.pi - p.target) + p.phiY * e.y;
  e.credibility = () => Math.max(0, p.cred - e.credHit);
  e.step = () => {
    const piPrev = e.pi, yPrev = e.y;
    // Beklentiler: hedefe çıpalı kısım (güvenilirlik) + geçmiş enflasyona uyarlanan kısım
    const c = e.credibility();
    e.pie = c * p.target + (1 - c) * piPrev + e.bias;
    // Politika faizi
    if (p.rule) {
      const tgt = e.taylor();
      e.i = Math.max(0, p.smooth * e.i + (1 - p.smooth) * tgt);
    } else e.i = Math.max(0, p.manual);
    // Fisher: ex-ante reel faiz = nominal − beklenen enflasyon
    e.r = e.i - e.pie;
    e.hist.push(e.r);
    if (e.hist.length > 16) e.hist.shift();
    const rLag = e.hist[e.hist.length - 1 - p.lag];
    // IS eğrisi (gecikmeli reel faiz)
    e.y = p.rhoY * yPrev - p.a * (rLag - p.rStar) + e.d;
    e.y = Math.max(-12, Math.min(12, e.y));
    // Phillips eğrisi
    e.pi = e.pie + p.kappa * e.y + e.s;
    e.pi = Math.max(-10, Math.min(200, e.pi));
    // Okun yasası
    e.u = Math.max(0.5, p.uStar - e.y / p.okun);
    e.P *= Math.pow(1 + e.pi / 100, 0.25);
    // Şokların sönümü
    e.s *= 0.65; e.d *= 0.8; e.bias *= 0.85; e.credHit *= 0.93;
    e.q++;
  };
  return e;
}
