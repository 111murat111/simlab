// Halka yol (Sugiyama deneyi): tepki gecikmeli IDM sürücüler + dalga sönümleyen otonom (ACC) araçlar. Saf JS.
export const CAR_LEN = 4.2;
export const RING_DT = 0.05;

/** IDM ivmesi. */
export function idm(v, gap, dv, p) {
  const sStar = p.s0 + Math.max(0, v * p.T + (v * dv) / (2 * Math.sqrt(p.a * p.b)));
  return p.a * (1 - Math.pow(v / p.v0, 4) - Math.pow(sStar / Math.max(gap, 0.1), 2));
}

export function createRing(o = {}) {
  const r = {
    L: 230, n: 22, T: 1.0, tau: 0.6, v0: 14, a: 1.2, b: 1.8, s0: 1.5, noise: 0.25, nAV: 0,
    cars: [], t: 0, rnd: Math.random, brakeT: 0, brakeCar: 0, ...o,
  };
  r.reset = () => {
    r.cars = [];
    const sp = r.L / r.n;
    for (let i = 0; i < r.n; i++) r.cars.push(newCar(r, i * sp + (r.rnd() - 0.5) * 0.3, 0));
    r.setAV(r.nAV);
    r.t = 0;
    r.uMean = null;
  };
  r.setAV = (k) => {
    r.nAV = k;
    r.cars.forEach((c) => (c.av = false));
    for (let j = 0; j < k; j++) r.cars[Math.floor((j * r.n) / Math.max(1, k)) % r.n].av = true;
  };
  /** Araç sayısını değiştir (yerleşimi koruyarak ekle/çıkar). */
  r.setCount = (n) => {
    n = Math.round(n);
    while (r.cars.length > n) {
      // En büyük boşluğun önündekini değil, rastgele birini çıkar
      r.cars.splice(Math.floor(r.rnd() * r.cars.length), 1);
    }
    while (r.cars.length < n) {
      // En büyük boşluğun ortasına ekle
      const sorted = [...r.cars].sort((a, b) => a.x - b.x);
      let best = 0, bx = 0, bv = 0;
      for (let i = 0; i < sorted.length; i++) {
        const a = sorted[i], b = sorted[(i + 1) % sorted.length];
        const g = (((b.x - a.x) % r.L) + r.L) % r.L || r.L;
        if (g > best) { best = g; bx = a.x + g / 2; bv = (a.v + b.v) / 2; }
      }
      if (best < CAR_LEN * 2.2 && sorted.length) break;
      r.cars.push(newCar(r, bx % r.L, bv));
    }
    r.n = r.cars.length;
    r.setAV(Math.min(r.nAV, r.n));
  };
  r.brake = (i = 0) => { r.brakeT = 2.5; r.brakeCar = i % r.cars.length; };
  r.step = (dt) => stepRing(r, dt);
  r.reset();
  return r;
}

function newCar(r, x, v) {
  return { x, v, acc: 0, av: false, hist: [], stopT: 0 };
}

function stepRing(r, dt) {
  const cars = r.cars, n = cars.length;
  if (!n) return;
  const order = cars.map((c, i) => i).sort((i, j) => cars[i].x - cars[j].x);
  const delaySteps = Math.round(r.tau / RING_DT);
  let vm = 0;
  for (const c of cars) vm += c.v;
  r.uMean = r.uMean == null ? vm / n : r.uMean + (vm / n - r.uMean) * Math.min(1, dt / 20);
  for (let k = 0; k < n; k++) {
    const c = cars[order[k]], ld = cars[order[(k + 1) % n]];
    let gap = (((ld.x - c.x) % r.L) + r.L) % r.L - CAR_LEN;
    if (n === 1) gap = r.L - CAR_LEN;
    const dv = c.v - ld.v;
    // Algı geçmişi (tepki gecikmesi)
    c.hist.push([gap, c.v, dv]);
    if (c.hist.length > 40) c.hist.shift();
    let acc;
    if (c.av) {
      // Otonom/ACC ("FollowerStopper", Stern ve ark. 2018): akışın ortalama hızını hedefler, önünde tampon boşluk
      // bırakır; dalgaya dalıp sert fren yapmak yerine hızını yumuşakça ayarlar → dalga söner.
      const U = Math.min(r.v0, Math.max(2, r.uMean + 0.3));
      const vl = Math.min(Math.max(ld.v, 0), U), dvm = Math.min(ld.v - c.v, 0);
      const dx1 = 4.5 + (dvm * dvm) / 3, dx2 = 5.25 + (dvm * dvm) / 2, dx3 = 6 + dvm * dvm;
      const g = gap + 1.5;
      const vc = g <= dx1 ? 0 : g <= dx2 ? vl * (g - dx1) / (dx2 - dx1) : g <= dx3 ? vl + (U - vl) * (g - dx2) / (dx3 - dx2) : U;
      acc = Math.max(-3, Math.min(0.8, 0.6 * (vc - c.v)));
    } else {
      const h = c.hist[Math.max(0, c.hist.length - 1 - delaySteps)];
      acc = idm(h[1], h[0], h[2], r) + r.noise * gaussish(r.rnd);
    }
    if (r.brakeT > 0 && order[k] === r.brakeCar) acc = Math.min(acc, -3.5);
    // Çarpışma önleyici (fiziksel sınır)
    const safe = gap > 0.3 ? acc : -9;
    c.acc = Math.max(-9, Math.min(r.a * 1.5, safe));
  }
  for (const c of cars) {
    const v1 = Math.max(0, c.v + c.acc * dt);
    c.x = (c.x + (c.v + v1) * 0.5 * dt) % r.L;
    c.v = v1;
    c.stopT = c.v < 0.5 ? c.stopT + dt : 0;
  }
  // Çarpışmayı engelle: öndekine göre konumu sınırla
  for (let k = 0; k < n; k++) {
    const c = cars[order[k]], ld = cars[order[(k + 1) % n]];
    const gap = (((ld.x - c.x) % r.L) + r.L) % r.L - CAR_LEN;
    if (n > 1 && gap < 0.2) { c.x = (((ld.x - CAR_LEN - 0.2) % r.L) + r.L) % r.L; c.v = Math.min(c.v, ld.v); }
  }
  if (r.brakeT > 0) r.brakeT -= dt;
  r.t += dt;
}

function gaussish(rnd) { return (rnd() + rnd() + rnd() - 1.5) * 2; }

export function ringStats(r) {
  const vs = r.cars.map((c) => c.v);
  const n = vs.length || 1;
  const mean = vs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { mean, sd, min: Math.min(...vs), stopped: vs.filter((v) => v < 1).length, flow: (n / r.L) * mean * 3600 };
}
