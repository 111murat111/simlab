// Hodgkin–Huxley kablo modeli: akson bölmeleri, miyelinli (Ranvier boğumu / boğumlar arası) ya da miyelinsiz.
// Zaman ms, gerilim mV (dinlenme ≈ −65; ekranda −5 mV kaydırılıp −70 gösterilir), akım µA/cm².
const exp = Math.exp;
function rates(V) {
  const an = Math.abs(V + 55) < 1e-6 ? 0.1 : (0.01 * (V + 55)) / (1 - exp(-(V + 55) / 10));
  const bn = 0.125 * exp(-(V + 65) / 80);
  const am = Math.abs(V + 40) < 1e-6 ? 1 : (0.1 * (V + 40)) / (1 - exp(-(V + 40) / 10));
  const bm = 4 * exp(-(V + 65) / 18);
  const ah = 0.07 * exp(-(V + 65) / 20);
  const bh = 1 / (1 + exp(-(V + 35) / 10));
  return [an, bn, am, bm, ah, bh];
}
export const SHIFT = -5; // ekran gerilimi = V + SHIFT

// Hız için hız sabitleri tablosu (−120…+80 mV, 0,05 mV adım)
const V0 = -120, DV = 0.05, NT = 4001;
const TAB = new Float64Array(NT * 6);
for (let k = 0; k < NT; k++) TAB.set(rates(V0 + k * DV), k * 6);

const REST = rates(-65);
const inf = (a, b) => a / (a + b);

/**
 * n bölmeli akson. Miyelinli kipte her nodeEvery'inci bölme bir Ranvier boğumudur (küçük alan → küçük kapasitans),
 * aradakiler miyelinle yalıtılmış, iyon kanalı olmayan, çok düşük kapasitanslı pasif bölmelerdir.
 */
export function createAxon({ n = 121, nodeEvery = 12, gc = 3.2, phi = 3, cNode = 0.3, cInter = 0.02, gInter = 0.005 } = {}) {
  const V = new Float64Array(n).fill(-65), m = new Float64Array(n), h = new Float64Array(n), nn = new Float64Array(n);
  const ina = new Float64Array(n), dv = new Float64Array(n), stim = new Float64Array(n);
  const ax = { n, V, m, h, nn, ina, stim, myelin: false, nodeEvery, t: 0, gcScale: 1 };
  ax.isNode = (i) => ax.myelin && i % nodeEvery === 0 && i >= 3;
  ax.active = (i) => !ax.myelin || i < 3 || i % nodeEvery === 0;
  ax.step = (dt) => {
    const g = gc * ax.gcScale, my = ax.myelin;
    for (let i = 0; i < n; i++) {
      const v = V[i];
      const left = i > 0 ? V[i - 1] : v, right = i < n - 1 ? V[i + 1] : v;
      const Iax = g * (left - 2 * v + right);
      if (!my || i < 3 || i % nodeEvery === 0) {
        let k = ((v - V0) / DV) | 0;
        k = k < 0 ? 0 : k >= NT ? NT - 1 : k;
        const o = k * 6, pd = phi * dt;
        nn[i] += pd * (TAB[o] * (1 - nn[i]) - TAB[o + 1] * nn[i]);
        m[i] += pd * (TAB[o + 2] * (1 - m[i]) - TAB[o + 3] * m[i]);
        h[i] += pd * (TAB[o + 4] * (1 - h[i]) - TAB[o + 5] * h[i]);
        const m3 = m[i] * m[i] * m[i], n2 = nn[i] * nn[i];
        ina[i] = 120 * m3 * h[i] * (v - 50);
        const Iion = ina[i] + 36 * n2 * n2 * (v + 77) + 0.3 * (v + 54.387);
        const c = my && i >= 3 ? cNode : 1; // boğumda eksenel akım küçük kapasitansı hızla yükler
        dv[i] = Iax / c + stim[i] - Iion;
      } else {
        ina[i] = 0;
        dv[i] = (Iax - gInter * (v + 65)) / cInter;
      }
    }
    for (let i = 0; i < n; i++) V[i] += dt * dv[i];
    ax.t += dt;
  };
  ax.reset = () => {
    V.fill(-65); m.fill(inf(REST[2], REST[3])); h.fill(inf(REST[4], REST[5])); nn.fill(inf(REST[0], REST[1]));
    ina.fill(0); stim.fill(0); ax.t = 0;
  };
  ax.reset();
  return ax;
}
