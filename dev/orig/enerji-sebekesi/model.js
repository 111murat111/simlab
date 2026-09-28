// Enerji şebekesi modeli: talep/güneş/rüzgâr profilleri ve rampa sınırlı, öncelik sıralı dağıtım (saf JS).

// Saatlik talep biçimi (tepe = 1): gece dibi, sabah rampası, akşam 19–21 zirvesi
const DEM = [0.66, 0.62, 0.6, 0.59, 0.59, 0.62, 0.7, 0.8, 0.87, 0.9, 0.91, 0.92, 0.91, 0.9, 0.89, 0.89, 0.9, 0.94, 0.99, 1.0, 0.99, 0.93, 0.83, 0.73, 0.66];

export const SRC = {
  komur: { name: 'Kömür', color: '#8a8f98', co2: 0.95, fuel: 36, ramp: 0.25, min: 0.4 },
  hidro: { name: 'Hidro', color: '#3b82f6', co2: 0, fuel: 6 },
  gaz: { name: 'Doğalgaz', color: '#f97316', co2: 0.4, fuel: 72, ramp: 2 },
  ruzgar: { name: 'Rüzgâr', color: '#2dd4bf', co2: 0, fuel: 0 },
  gunes: { name: 'Güneş', color: '#facc15', co2: 0, fuel: 0 },
  batarya: { name: 'Batarya', color: '#c084fc', co2: 0, fuel: 2 },
};
export const STACK = ['komur', 'hidro', 'gaz', 'ruzgar', 'gunes', 'batarya'];
export const ETA = 0.95; // şarj ve deşarj verimi (gidiş-dönüş ≈ %90)

const smooth = (a, b, t) => a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * t));

export function demandShape(h) {
  h = ((h % 24) + 24) % 24;
  const i = Math.floor(h);
  return smooth(DEM[i], DEM[i + 1], h - i);
}

/** Tek boyutlu yumuşak gürültü (tekrarlanabilir). */
export function noise1(x, seed = 0) {
  const hash = (n) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(x);
  return smooth(hash(i), hash(i + 1), x - i) * 2 - 1;
}

/** Güneş: 06:30 doğar, 19:30 batar. 0..1 kapasite faktörü. */
export function sunHeight(h) {
  h = ((h % 24) + 24) % 24;
  return Math.sin((Math.PI * (h - 6.5)) / 13);
}
export function solarCF(h, cloud, tAbs) {
  const s = sunHeight(h);
  if (s <= 0) return 0;
  const pass = 0.75 + 0.25 * noise1(tAbs * 1.7, 3); // geçen bulutlar
  return 0.8 * Math.pow(s, 1.25) * (1 - cloud * 0.8 * pass);
}

/** Rüzgâr hızı (m/s); değişken modda saatler ölçeğinde dalgalanır. */
export function windSpeed(tAbs, mean, variable) {
  if (!variable) return mean;
  const v = mean * (1 + 0.55 * noise1(tAbs / 3.2, 7) + 0.2 * noise1(tAbs / 0.7, 11));
  return Math.max(0, v);
}
/** Türbin güç eğrisi: 3 m/s'de devreye girer, 12 m/s'de anma gücü, 25 m/s üstünde güvenlik için durur. */
export function windCF(v) {
  if (v < 3 || v > 25) return 0;
  if (v >= 12) return 1;
  return (v ** 3 - 27) / (1728 - 27);
}

export function marginalCost(k, carbon) {
  return SRC[k].fuel + SRC[k].co2 * carbon;
}

export function newState(p) {
  return {
    komur: p.cap.komur * SRC.komur.min, gaz: 0,
    hydroStore: p.cap.hidro * 8, battSoc: p.battE * 0.5,
    out: null,
  };
}

/**
 * dtH saatlik bir adım dağıtım yapar. p: { cap:{komur,gaz,hidro,gunes,ruzgar}, battP, battE, peak, cloud, windMean,
 * windVar, order:'maliyet'|'karbon', carbon, coalRamp, peakShave }
 */
export function step(st, p, hAbs, dtH) {
  const h = ((hAbs % 24) + 24) % 24;
  const D = p.peak * demandShape(h) * (1 + 0.015 * noise1(hAbs * 2, 5));
  const wind = windSpeed(hAbs, p.windMean, p.windVar);
  let S = p.cap.gunes * solarCF(h, p.cloud, hAbs);
  let W = p.cap.ruzgar * windCF(wind);
  const S0 = S, W0 = W;

  // Hidro: su bütçesi (depo) ve sabit akış
  const hydroMaxStore = p.cap.hidro * 12;
  const inflow = p.cap.hidro * 0.4;
  st.hydroStore = Math.min(hydroMaxStore, st.hydroStore + inflow * dtH);
  const hydroMax = Math.min(p.cap.hidro, st.hydroStore / dtH);
  const battDisMax = Math.min(p.battP, (st.battSoc * ETA) / dtH);
  const battChMax = Math.min(p.battP, (p.battE - st.battSoc) / (ETA * dtH));

  // Öncelik: temiz sıralamada gaz kömürden önce; ekonomik sıralamada marjinal maliyete göre
  let thermal = ['komur', 'gaz'];
  if (p.order === 'karbon') thermal = ['gaz', 'komur'];
  else thermal.sort((a, b) => marginalCost(a, p.carbon) - marginalCost(b, p.carbon));
  const peakTime = p.peakShave && h >= 17 && h < 23;
  const order = peakTime ? ['hidro', 'batarya', ...thermal] : ['hidro', ...thermal, 'batarya'];
  const maxOf = { hidro: hydroMax, batarya: battDisMax, komur: p.cap.komur, gaz: p.cap.gaz };

  // 1) İdeal paylaşım → kömür hedefi (kömür yavaş: rampa sınırı ve minimum kararlı yük)
  let rem = Math.max(0, D - S - W);
  const ideal = {};
  for (const k of order) { ideal[k] = Math.min(rem, maxOf[k]); rem -= ideal[k]; }
  const cMin = p.cap.komur * SRC.komur.min;
  const cTarget = Math.max(cMin, ideal.komur);
  const cStep = p.cap.komur * p.coalRamp * dtH;
  st.komur = Math.min(p.cap.komur, Math.max(cMin, st.komur + Math.max(-cStep, Math.min(cStep, cTarget - st.komur))));
  let coal = st.komur;

  // 2) Gerçek denge
  const out = { D, S, W, wind, komur: 0, hidro: 0, gaz: 0, batarya: 0, charge: 0, deficit: 0, curtail: 0, coalForced: false };
  let need = D - S - W - coal;
  const gStep = p.cap.gaz * SRC.gaz.ramp * dtH;
  const gasHi = Math.min(p.cap.gaz, st.gaz + gStep), gasLo = Math.max(0, st.gaz - gStep);
  let gas = gasLo;
  need -= gas;
  for (const k of order) {
    if (k === 'komur' || need <= 0) continue;
    let give = 0;
    if (k === 'hidro') give = Math.min(need, hydroMax);
    else if (k === 'batarya') give = Math.min(need, battDisMax);
    else if (k === 'gaz') { give = Math.min(need, gasHi - gas); gas += give; need -= give; continue; }
    out[k] += give;
    need -= give;
  }
  if (need > 0) out.deficit = need;
  else if (need < 0) {
    let sur = -need;
    const ch = Math.min(sur, battChMax);
    out.charge = ch; sur -= ch;
    // Fazla yenilenebilir kısılır
    const ren = S + W;
    if (sur > 0 && ren > 0) {
      const cut = Math.min(sur, ren);
      S -= cut * (S / ren); W -= cut * (W / ren);
      out.curtail = cut; sur -= cut;
    }
    if (sur > 0) { coal = Math.max(0, coal - sur); st.komur = coal; out.coalForced = true; sur = 0; }
  }
  st.gaz = gas;
  out.komur = coal; out.gaz = gas; out.S = S; out.W = W; out.S0 = S0; out.W0 = W0;

  st.hydroStore -= out.hidro * dtH;
  st.battSoc = Math.min(p.battE, Math.max(0, st.battSoc + out.charge * ETA * dtH - (out.batarya / ETA) * dtH));
  out.hydroFrac = hydroMaxStore > 0 ? st.hydroStore / hydroMaxStore : 0;
  out.soc = p.battE > 0 ? st.battSoc / p.battE : 0;
  out.served = D - out.deficit;
  out.co2 = (coal * SRC.komur.co2 + gas * SRC.gaz.co2) * dtH;
  out.cost = (coal * marginalCost('komur', p.carbon) + gas * marginalCost('gaz', p.carbon) + out.hidro * SRC.hidro.fuel + out.batarya * SRC.batarya.fuel) * dtH;
  // Fiyatı belirleyen (en pahalı çalışan) kaynak
  const running = [['gunes', S], ['ruzgar', W], ['hidro', out.hidro], ['batarya', out.batarya], ['komur', coal], ['gaz', gas]].filter(([, v]) => v > 1);
  out.marginal = out.deficit > 1 ? 'kesinti' : running.sort((a, b) => marginalCost(b[0], p.carbon) - marginalCost(a[0], p.carbon))[0]?.[0] || 'gunes';
  st.out = out;
  return out;
}
