// Mercan resifi modeli: mevsimsel deniz sıcaklığı + ısı dalgaları → Derece Isınma Haftası (DHW) → ağarma, toparlanma, ölüm.
// Zaman birimi: hafta. Sıcaklıklar "normal yaz en yüksek değeri"ne (MMM) göre fark (°C) olarak tutulur.
export const STEP = 0.25;          // model adımı (hafta)
export const WINDOW = 12;          // DHW penceresi (hafta)
export const PEAK_WEEK = 34;       // mevsimsel sıcaklığın zirve yaptığı hafta (Ağustos sonu)
export const START_WEEK = 18;      // simülasyon Mayıs başında başlar

// Aragonit doygunluğu Ω: [CO₃²⁻] ile orantılı; pH 0,1 düşünce karbonat ≈ %20 azalır (temsili yaklaşık ilişki)
export const omega = (pH) => 3.6 * Math.pow(10, 0.95 * (pH - 8.05));
// Kireçlenme (büyüme) oranı ∝ (Ω − 1) — ampirik ilişki, günümüze göre normalize
export const calcFactor = (pH) => Math.max(-0.3, Math.min(1.3, (omega(pH) - 1) / (3.6 - 1)));

export function createModel(N, rnd) {
  const c = {
    type: new Uint8Array(N), size: new Float32Array(N), b: new Float32Array(N), starve: new Float32Array(N),
    dead: new Uint8Array(N), algae: new Float32Array(N), tol: new Float32Array(N), endur: new Float32Array(N),
    hue: new Float32Array(N), born: new Float32Array(N),
  };
  const buf = new Float32Array(Math.round(WINDOW / STEP));
  const p = { warming: 0, waveMode: 'yok', waveI: 2, waveD: 10, pH: 8.05, pollution: 0.15, mpa: false };
  const m = { c, p, N, t: 0, sst: 0, hotspot: 0, dhw: 0, maxDhw: 0, fish: 0, waveStart: -1e9, waveOnce: null, bi: 0,
    healthy: 0, bleached: 0, deadF: 0, cover: 0, recruits: 0, deaths: 0 };

  // Tür: 0 dallı (Acropora benzeri, hassas), 1 beyin/masif (dayanıklı), 2 masa mercanı (hassas), 3 parmak/tüp (orta)
  const TOL = [0.8, 1.45, 0.85, 1.1];
  const END = [11, 26, 12, 17];   // ağarmış halde dayanabileceği süre (hafta, temsili)
  function newColony(i, size) {
    c.size[i] = size; c.b[i] = 0; c.starve[i] = 0; c.dead[i] = 0; c.algae[i] = 0;
    const t = c.type[i];
    c.tol[i] = TOL[t] * (0.85 + rnd() * 0.3);
    c.endur[i] = END[t] * (0.8 + rnd() * 0.4);
    c.hue[i] = rnd();
    c.born[i] = m.t;
  }

  m.init = (types) => {
    for (let i = 0; i < N; i++) { c.type[i] = types[i]; newColony(i, 0.6 + rnd() * 0.4); }
    buf.fill(0); m.bi = 0; m.t = 0; m.dhw = 0; m.maxDhw = 0; m.waveOnce = null; m.recruits = m.deaths = 0;
    m.summarize();
    m.fish = m.fishTarget();
  };

  m.week = () => m.t + START_WEEK;
  m.triggerWave = () => { m.waveOnce = m.t; };

  function waveAt(t) {
    const { waveI: I, waveD: D } = p;
    let v = 0;
    const bump = (s) => (t >= s && t <= s + D ? I * Math.sin((Math.PI * (t - s)) / D) : 0);
    if (p.waveMode === 'her') {
      const w = t + START_WEEK, y = Math.floor(w / 52);
      for (const yy of [y - 1, y]) v = Math.max(v, bump(yy * 52 + PEAK_WEEK - D / 2 - START_WEEK));
    } else if (p.waveMode === 'bir') v = bump(PEAK_WEEK - D / 2 - START_WEEK);   // yalnız ilk yaz
    if (m.waveOnce != null) v = Math.max(v, bump(m.waveOnce));
    return v;
  }

  // Sıcaklık farkı (MMM'ye göre): mevsimsel döngünün tepesi MMM − 0,2 °C
  m.sstAt = (t) => p.warming - 1.7 + 1.5 * Math.cos((2 * Math.PI * (t + START_WEEK - PEAK_WEEK)) / 52) + waveAt(t);

  m.fishTarget = () => {
    const shelter = m.cover;                      // canlı mercan = yuva ve besin
    return Math.max(4, (12 + 210 * shelter) * (p.mpa ? 1.2 : 0.8) * (1 - 0.35 * p.pollution));
  };

  m.step = (rnd2 = rnd) => {
    const h = STEP;
    m.t += h;
    m.sst = m.sstAt(m.t);
    m.hotspot = Math.max(0, m.sst);
    // NOAA CRW: yalnız HotSpot ≥ 1 °C olan değerler 12 haftalık pencerede toplanır
    buf[m.bi] = m.hotspot >= 1 ? m.hotspot * h : 0;
    m.bi = (m.bi + 1) % buf.length;
    let s = 0;
    for (let k = 0; k < buf.length; k++) s += buf[k];
    m.dhw = s;
    m.maxDhw = Math.max(m.maxDhw, s);

    const pol = p.pollution, calc = calcFactor(p.pH);
    const tolMul = 1 - 0.25 * pol;                        // kirlilik ısı toleransını düşürür
    const recRate = (1 / 12) * (p.mpa ? 1.3 : 1) * (1 - 0.4 * pol);
    const grazing = Math.min(1, m.fish / 170) * (p.mpa ? 1 : 0.7);   // otçul balıklar yosunu kırpar
    const larvae = Math.max(0.12, m.cover);
    for (let i = 0; i < N; i++) {
      if (c.dead[i]) {
        // Ölü iskelet: yosun kaplar; otlama ve temiz su yeni mercan yavrusu (larva) tutunmasına izin verir
        c.algae[i] = Math.min(1, Math.max(0, c.algae[i] + h * ((0.05 + 0.18 * pol) * (1 - c.algae[i]) - 0.06 * grazing * c.algae[i])));
        if (calc < 0.35) c.size[i] = Math.max(0.25, c.size[i] - h * 0.004);  // düşük Ω: iskelet aşınır
        const pr = 0.012 * h * larvae * (1 - 0.85 * c.algae[i]) * Math.max(0, calc) * (1 - 0.6 * pol) * (p.mpa ? 1.3 : 1);
        if (m.hotspot < 0.5 && rnd2() < pr) { newColony(i, 0.1); m.recruits++; }
        continue;
      }
      const thr = 4 * c.tol[i] * tolMul;
      const target = Math.min(1, Math.max(0, (m.dhw - 0.45 * thr) / (0.55 * thr)));
      if (target > c.b[i]) c.b[i] = Math.min(target, c.b[i] + h * 0.3);
      else if (m.hotspot < 1) c.b[i] = Math.max(0, c.b[i] - h * recRate);   // serinleyince alg ortakları geri döner
      if (c.b[i] > 0.8) c.starve[i] += h;
      else c.starve[i] = Math.max(0, c.starve[i] - h * 0.5);
      const acute = 0.04 * Math.min(1, Math.max(0, (m.dhw - 2 * thr) / thr));
      if (c.starve[i] > c.endur[i] || rnd2() < acute * h) {
        c.dead[i] = 1; c.algae[i] = 0; c.b[i] = 1; m.deaths++;
        continue;
      }
      // Büyüme: yalnız ağarmamış mercan kireç biriktirir; Ω < 1 ise net çözünme
      const g = 0.006 * calc * (1 - c.b[i]) * (1 - 0.3 * pol);
      c.size[i] = Math.min(1, Math.max(0.05, c.size[i] + h * g * (g > 0 ? 1 - c.size[i] * 0.7 : 1)));
    }
    m.summarize();
    const ft = m.fishTarget();
    m.fish += (ft - m.fish) * Math.min(1, h / 14);
  };

  m.summarize = () => {
    let he = 0, bl = 0, de = 0, cov = 0;
    for (let i = 0; i < N; i++) {
      if (c.dead[i]) { de++; continue; }
      if (c.b[i] >= 0.5) bl++; else he++;
      cov += c.size[i] * (1 - c.b[i] * 0.5);
    }
    m.healthy = he / N; m.bleached = bl / N; m.deadF = de / N; m.cover = cov / N;
  };
  return m;
}
