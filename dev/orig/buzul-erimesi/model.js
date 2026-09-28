// Deniz seviyesi modeli — IPCC AR6 ortancalarına (1995–2014 tabanı) kabaca ayarlanmış basit bileşen modeli.
export const GLACIER_SLE = 0.32; // dağ buzullarının toplam deniz seviyesi eşdeğeri (m)

/** Isınma yolu: 2100'de hedef ısınma (Tw), sonrasında yüksek senaryolarda artmaya devam eder. */
export function warming(y, Tw) {
  if (y <= 2025) return 0.9 + (0.4 * (y - 2005)) / 20;
  if (y <= 2100) { const s = (y - 2025) / 75; return 1.3 + (Tw - 1.3) * (s * (1.4 - 0.4 * s)); }
  return Math.max(0, Tw + (Tw - 2.2) * 0.5 * Math.min(1, (y - 2100) / 200) * 2);
}

/** 2005'ten y2'ye kadar yıllık adımla bileşenleri toplar. Dönüş: m cinsinden (1995–2014 tabanı). */
export function simulate(Tw, yEnd = 2300) {
  let th = 0, gl = 0, gr = 0, an = 0, lw = 0;
  const out = [];
  for (let y = 2005; y <= yEnd; y++) {
    const T = warming(y, Tw);
    th += Math.max(-0.0005, 0.00155 * (T - 0.55)) * (y > 2100 ? 0.8 : 1);
    const rem = Math.max(0, 1 - gl / GLACIER_SLE);
    gl = Math.max(0, gl + 0.00105 * (T - 0.4) * rem);
    gr += 0.00060 * Math.max(-0.2, T - 0.57) * (1 + 0.004 * Math.max(0, y - 2100) * Math.max(0, T - 1.5));
    an += 0.00105 + 0.00015 * Math.max(0, T - 1) + 0.00032 * Math.max(0, T - 1.8) ** 2 * Math.min(1, Math.max(0, (y - 2080) / 100));
    lw += y < 2100 ? 0.0003 : 0.0001;
    out.push({ y, T, th, gl, gr, an, lw, total: th + gl + gr + an + lw });
  }
  return out;
}

/** Olası (likely) aralık çarpanları — 2100 sonrası güven düşer, aralık açılır. */
export function band(y) {
  const a = Math.min(1, Math.max(0, (y - 2050) / 50)), b = Math.min(1, Math.max(0, (y - 2100) / 200));
  const lo = y <= 2100 ? 0.85 - 0.1 * a : 0.75 - 0.4 * b;
  const hi = y <= 2100 ? 1.25 + 0.1 * a : 1.35 + 0.85 * b;
  return [lo, hi];
}
