// Kent ısı adası — hücre başına basit yüzey enerji dengesi (force-restore) + kent kanopi havası kutusu.
const SIG = 5.67e-8, K = 273.15, OMEGA = (2 * Math.PI) / 86400;
export const DT = 300; // s
export const STEPS = 86400 / DT; // günde 288 adım

// Yüzey türleri: albedo, buharlaşma oranı (β), ısı kapasitesi C (J/m²K), yayınım ε
export const SURF = {
  field: { a: 0.2, b: 0.5, C: 1.0e5, e: 0.95 },
  park: { a: 0.2, b: 0.55, C: 1.0e5, e: 0.96 },
  tree: { a: 0.17, b: 0.7, C: 0.9e5, e: 0.97 },
  roof: { a: 0.1, b: 0, C: 0.5e5, e: 0.92 },
  white: { a: 0.7, b: 0, C: 0.5e5, e: 0.9 },
  green: { a: 0.2, b: 0.45, C: 0.8e5, e: 0.95 },
};
export const ASPHALT = {
  koyu: { a: 0.06, b: 0, C: 1.6e5, e: 0.95, name: 'Yeni koyu asfalt' },
  eski: { a: 0.14, b: 0, C: 1.6e5, e: 0.95, name: 'Eskimiş asfalt' },
  serin: { a: 0.35, b: 0, C: 1.6e5, e: 0.93, name: 'Serin (açık renkli) kaplama' },
  gecirgen: { a: 0.25, b: 0.15, C: 1.3e5, e: 0.94, name: 'Geçirgen beton' },
};

export const LAT = 41 * Math.PI / 180, DECL = 20 * Math.PI / 180; // İstanbul enlemi, temmuz
export function sunElev(h) {
  const ha = ((h - 12.5) / 24) * 2 * Math.PI; // yaz saati kayması ≈ 0,5 sa
  return Math.asin(Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(ha));
}
export function solar(h) {
  const s = Math.sin(sunElev(h));
  return s <= 0.02 ? 0 : 1100 * s * Math.pow(0.78, 1 / s);
}
/** Kırsal hava sıcaklığı (°C): en düşük 05:00'te 21, en yüksek 15:00'te 32 (açık yaz günü). */
export function ruralAir(h) {
  const lo = 21, hi = 32;
  if (h >= 5 && h <= 15) return lo + (hi - lo) * (0.5 - 0.5 * Math.cos(Math.PI * (h - 5) / 10));
  const u = h > 15 ? (h - 15) / 14 : (h + 9) / 14;
  return hi - (hi - lo) * (1 - Math.exp(-2.4 * u)) / (1 - Math.exp(-2.4));
}
/** Atık ısının günlük biçimi (0..1): trafik zirveleri ve öğleden sonra klima. */
export function qfShape(h) {
  return 0.35 + 0.35 * Math.exp(-(((h - 8.5) / 1.8) ** 2)) + 0.65 * Math.exp(-(((h - 16) / 4) ** 2));
}

/**
 * cells: [{type:'road'|'roof'|'white'|'green'|'park'|'tree', tree:0..1 (yol üstü ağaç gölgesi)}]
 * p: { hw, qf, asphalt }
 * Döner: { ts: Float32Array(cells*48) (yarım saatlik yüzey), air:{city,rural}[48], surfMean[48], ruralSurf[48] }
 */
export function solve(cells, p) {
  const n = cells.length, hw = p.hw;
  const svfCan = Math.cos(Math.atan(2 * hw));            // kanyon tabanı gökyüzü görüş faktörü
  const trap = 1 - 0.35 * Math.min(1, hw / 2);          // çoklu yansıma ile etkin albedo azalır
  const windCan = 1 / (1 + 0.6 * hw);
  const props = cells.map((c) => {
    const base = c.type === 'road' ? ASPHALT[p.asphalt] : SURF[c.type];
    const ground = c.type === 'road' || c.type === 'park' || c.type === 'tree';
    let a = ground ? base.a * trap : base.a, b = base.b, C = base.C;
    const shade = c.type === 'road' ? c.tree * 0.75 : c.type === 'tree' ? 0.7 : 0;
    if (c.type === 'road' && c.tree > 0) { b = Math.max(b, 0.35 * c.tree); }
    const svf = ground ? (c.type === 'road' ? svfCan : 0.5 + 0.5 * svfCan) : 1;
    const sun = ground ? Math.max(0.35, 1 - 0.3 * hw) : 1; // kanyonda gölgelenme
    const hc = 12 * (ground ? windCan : 1.2);
    return { a, b, C, e: base.e, svf, sun: sun * (1 - shade), hc };
  });
  const rur = { ...SURF.field, svf: 1, sun: 1, hc: 12 };
  const ts = new Float64Array(n).fill(26), td = new Float64Array(n).fill(27);
  let tsR = 26, tdR = 27, dTa = 1;
  const out = { ts: new Float32Array(n * 48), air: [], surfMean: new Float32Array(48), ruralSurf: new Float32Array(48) };
  const flux = (pr, T, Ta, S, Ld, qf) => {
    const sw = (1 - pr.a) * S * pr.sun;
    const lw = pr.svf * (pr.e * Ld - pr.e * SIG * (T + K) ** 4);
    const rn = sw + lw;
    const H = pr.hc * (T - Ta);
    const LE = pr.b * Math.max(0, 0.75 * rn) + pr.b * 8;
    return { g0: rn - H - LE + qf, H };
  };
  for (let day = 0; day < 3; day++) {
    for (let s = 0; s < STEPS; s++) {
      const h = (s * DT) / 3600, S = solar(h), Tr = ruralAir(h), Tc = Tr + dTa;
      const Ld = 0.8 * SIG * (Tr + K) ** 4;
      const qf = p.qf * qfShape(h);
      let Hsum = 0;
      for (let i = 0; i < n; i++) {
        const pr = props[i], f = flux(pr, ts[i], Tc, S, Ld, qf * 0.6);
        Hsum += f.H;
        ts[i] += (DT / pr.C) * (f.g0 - OMEGA * pr.C * (ts[i] - td[i]));
        td[i] += (DT / (86400 * 2)) * (ts[i] - td[i]);
      }
      const fr = flux(rur, tsR, Tr, S, Ld, 0);
      tsR += (DT / rur.C) * (fr.g0 - OMEGA * rur.C * (tsR - tdR));
      tdR += (DT / (86400 * 2)) * (tsR - tdR);
      // Kanopi havası: fazladan duyulur ısı + atık ısının havaya giden kısmı; gündüz karışım güçlü, gece zayıf
      const w = Math.min(1, S / 250);
      const zmix = 45 + 255 * w, tau = 10800 - 7200 * w;
      dTa += DT * (((Hsum / n - fr.H) + qf * 0.4) / (1.2 * 1005 * zmix) - dTa / tau);
      if (day === 2 && s % 6 === 0) {
        const k = s / 6;
        let m = 0;
        for (let i = 0; i < n; i++) { out.ts[k * n + i] = ts[i]; m += ts[i]; }
        out.surfMean[k] = m / n;
        out.ruralSurf[k] = tsR;
        out.air.push({ city: Tr + dTa, rural: Tr });
      }
    }
  }
  return out;
}
