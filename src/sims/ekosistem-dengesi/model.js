// Ot–geyik–kurt ajan tabanlı modeli (THREE'den bağımsız; sabit adımla ilerler).
export const W = 40; // karo sayısı (bir kenar)
export const HALF = W / 2;
export const MAXD = 800;
export const MAXW = 160;
const CS = 5; // uzamsal ızgara hücresi
const GN = W / CS;
const MAXWIL = 90;
const WOLF_K = 40; // bölgecilik sınırı

export const riverX = (z) => 5 + 5.5 * Math.sin(z * 0.16 + 0.6);

export function createModel(rng = Math.random) {
  const p = {
    deerBirth: 0.07,  // üreme olasılığı / hafta (enerjisi yeterliyse)
    wolfBirth: 0.08,
    regrow: 0.14,     // ot büyüme hızı / hafta
    wolvesOn: true,
    hunting: false,
  };
  const grass = new Float32Array(W * W);
  const water = new Uint8Array(W * W);
  const D = { x: new Float32Array(MAXD), z: new Float32Array(MAXD), a: new Float32Array(MAXD), e: new Float32Array(MAXD), age: new Float32Array(MAXD), n: 0 };
  const Wf = { x: new Float32Array(MAXW), z: new Float32Array(MAXW), a: new Float32Array(MAXW), e: new Float32Array(MAXW), age: new Float32Array(MAXW), n: 0 };
  const wil = { x: new Float32Array(MAXWIL), z: new Float32Array(MAXWIL), h: new Float32Array(MAXWIL), n: 0 };
  const headD = new Int32Array(GN * GN), nextD = new Int32Array(MAXD);
  const headW = new Int32Array(GN * GN), nextW = new Int32Array(MAXW);
  const m = { p, grass, water, D, Wf, wil, drought: 0, time: 0, eaten: 0, starved: 0, hunted: 0, grassCover: 0, willowMean: 0 };

  for (let iz = 0; iz < W; iz++) {
    const z = iz - HALF + 0.5;
    for (let ix = 0; ix < W; ix++) {
      const x = ix - HALF + 0.5;
      if (Math.abs(x - riverX(z)) < 1.1) water[iz * W + ix] = 1;
    }
  }

  const tile = (x, z) => {
    let ix = Math.floor(x + HALF), iz = Math.floor(z + HALF);
    if (ix < 0) ix = 0; else if (ix >= W) ix = W - 1;
    if (iz < 0) iz = 0; else if (iz >= W) iz = W - 1;
    return iz * W + ix;
  };
  const cell = (x, z) => {
    let cx = Math.floor((x + HALF) / CS), cz = Math.floor((z + HALF) / CS);
    if (cx < 0) cx = 0; else if (cx >= GN) cx = GN - 1;
    if (cz < 0) cz = 0; else if (cz >= GN) cz = GN - 1;
    return cz * GN + cx;
  };
  m.tile = tile;

  function addDeer(x, z, e = 0.7, age = rng() * 20) {
    if (D.n >= MAXD) return -1;
    const i = D.n++;
    D.x[i] = x; D.z[i] = z; D.a[i] = rng() * 6.283; D.e[i] = e; D.age[i] = age;
    return i;
  }
  function addWolf(x, z, e = 1, age = rng() * 20) {
    if (Wf.n >= MAXW) return -1;
    const i = Wf.n++;
    Wf.x[i] = x; Wf.z[i] = z; Wf.a[i] = rng() * 6.283; Wf.e[i] = e; Wf.age[i] = age;
    return i;
  }
  function removeAt(S, i) {
    const l = --S.n;
    if (i !== l) { S.x[i] = S.x[l]; S.z[i] = S.z[l]; S.a[i] = S.a[l]; S.e[i] = S.e[l]; S.age[i] = S.age[l]; }
  }
  const randPos = () => (rng() - 0.5) * (W - 2);
  function edgePos() {
    const s = (rng() - 0.5) * (W - 2), side = Math.floor(rng() * 4), b = HALF - 1;
    return side === 0 ? [-b, s] : side === 1 ? [b, s] : side === 2 ? [s, -b] : [s, b];
  }
  m.addDeer = addDeer;
  m.addWolf = addWolf;

  m.reset = (nDeer = 260, nWolf = 22) => {
    for (let i = 0; i < W * W; i++) grass[i] = water[i] ? 0 : 0.55 + rng() * 0.45;
    D.n = 0; Wf.n = 0; m.time = 0; m.drought = 0; m.eaten = m.starved = m.hunted = 0;
    for (let i = 0; i < nDeer; i++) addDeer(randPos(), randPos(), 0.5 + rng() * 0.5);
    for (let i = 0; i < nWolf; i++) addWolf(randPos(), randPos(), 0.8 + rng() * 0.4);
    wil.n = 0;
    let guard = 0;
    while (wil.n < MAXWIL && guard++ < 5000) {
      const z = (rng() - 0.5) * (W - 2);
      const side = rng() < 0.5 ? -1 : 1;
      const x = riverX(z) + side * (1.5 + rng() * 1.6);
      if (Math.abs(x) > HALF - 1) continue;
      const k = wil.n++;
      wil.x[k] = x; wil.z[k] = z; wil.h[k] = 0.35 + rng() * 0.3;
    }
  };
  m.removeWolves = () => { Wf.n = 0; };

  function hash(S, head, next) {
    head.fill(-1);
    for (let i = 0; i < S.n; i++) { const c = cell(S.x[i], S.z[i]); next[i] = head[c]; head[c] = i; }
  }
  // en yakın bireyi bul (r yarıçap içinde); dönüş: indeks, m._d2 mesafe²
  function nearest(S, head, next, x, z, r, skipDead) {
    const cx = Math.floor((x + HALF) / CS), cz = Math.floor((z + HALF) / CS);
    const k = Math.ceil(r / CS);
    let best = -1, bd = r * r;
    for (let gz = Math.max(0, cz - k); gz <= Math.min(GN - 1, cz + k); gz++) {
      for (let gx = Math.max(0, cx - k); gx <= Math.min(GN - 1, cx + k); gx++) {
        for (let j = head[gz * GN + gx]; j >= 0; j = next[j]) {
          if (skipDead && S.e[j] < 0) continue;
          const dx = S.x[j] - x, dz = S.z[j] - z, d2 = dx * dx + dz * dz;
          if (d2 < bd) { bd = d2; best = j; }
        }
      }
    }
    m._d2 = bd;
    return best;
  }
  function countNear(S, head, next, x, z, r) {
    const cx = Math.floor((x + HALF) / CS), cz = Math.floor((z + HALF) / CS);
    let c = 0; const r2 = r * r;
    for (let gz = Math.max(0, cz - 1); gz <= Math.min(GN - 1, cz + 1); gz++) {
      for (let gx = Math.max(0, cx - 1); gx <= Math.min(GN - 1, cx + 1); gx++) {
        for (let j = head[gz * GN + gx]; j >= 0; j = next[j]) {
          const dx = S.x[j] - x, dz = S.z[j] - z;
          if (dx * dx + dz * dz < r2) c++;
        }
      }
    }
    return c;
  }

  function move(S, i, v, h) {
    let x = S.x[i] + Math.cos(S.a[i]) * v * h, z = S.z[i] + Math.sin(S.a[i]) * v * h;
    const b = HALF - 0.4;
    if (x < -b || x > b) { S.a[i] = Math.PI - S.a[i]; x = x < 0 ? -b : b; }
    if (z < -b || z > b) { S.a[i] = -S.a[i]; z = z < 0 ? -b : b; }
    S.x[i] = x; S.z[i] = z;
  }

  const gAhead = (x, z, a) => { const t = tile(x + Math.cos(a) * 1.6, z + Math.sin(a) * 1.6); return water[t] ? -1 : grass[t]; };

  m.step = (h) => {
    m.time += h;
    // Ot: tabanlı lojistik büyüme (kökler toprakta kalır)
    const rg = p.regrow * (m.drought > 0 ? 0.12 : 1);
    if (m.drought > 0) m.drought -= h;
    let cover = 0;
    for (let i = 0; i < W * W; i++) {
      if (water[i]) continue;
      const g = grass[i];
      const ng = g + rg * h * (0.12 + g) * (1 - g);
      grass[i] = ng > 1 ? 1 : ng;
      cover += grass[i];
    }
    m.grassCover = cover / (W * W - m.waterCount);

    // Geyikler
    hash(Wf, headW, nextW);
    for (let i = 0; i < D.n; i++) {
      const x = D.x[i], z = D.z[i];
      const w = Wf.n ? nearest(Wf, headW, nextW, x, z, 4, false) : -1;
      let v;
      if (w >= 0) {
        D.a[i] = Math.atan2(z - Wf.z[w], x - Wf.x[w]) + (rng() - 0.5) * 0.6;
        v = 2.1;
        D.e[i] -= 0.03 * h; // kaçmak yorar
      } else {
        const t = tile(x, z);
        if (grass[t] < 0.35 || water[t]) {
          // otlu yere doğru dön
          const a0 = D.a[i] + (rng() - 0.5) * 0.8;
          let ba = a0, bg = gAhead(x, z, a0);
          const a1 = a0 + 1.2, g1 = gAhead(x, z, a1);
          if (g1 > bg) { bg = g1; ba = a1; }
          const a2 = a0 - 1.2, g2 = gAhead(x, z, a2);
          if (g2 > bg) { bg = g2; ba = a2; }
          D.a[i] = ba;
          v = 1.2;
        } else {
          D.a[i] += (rng() - 0.5) * 1.2 * h * 4;
          v = 0.35;
        }
      }
      move(D, i, v, h);
      const t = tile(D.x[i], D.z[i]);
      if (D.e[i] < 1.4 && !water[t]) {
        const bite = Math.min(grass[t], 0.7 * h);
        grass[t] -= bite;
        D.e[i] += bite * 0.9;
      }
      D.e[i] -= 0.075 * h;
      D.age[i] += h;
      if (p.hunting && rng() < 0.03 * h) { D.e[i] = -1; m.hunted++; }
      if (D.e[i] <= 0 || D.age[i] > 70 + (i % 17)) {
        if (D.e[i] <= 0 && D.e[i] > -0.5) m.starved++;
        removeAt(D, i); i--; continue;
      }
      if (D.e[i] > 0.9 && rng() < p.deerBirth * h) {
        const c = addDeer(D.x[i], D.z[i], D.e[i] * 0.4, 0);
        if (c >= 0) D.e[i] *= 0.6;
      }
    }

    // Kurtlar
    hash(D, headD, nextD);
    let killed = 0;
    for (let j = 0; j < Wf.n; j++) {
      const x = Wf.x[j], z = Wf.z[j];
      const hungry = Wf.e[j] < 1.3;
      const d = hungry && D.n ? nearest(D, headD, nextD, x, z, 5, true) : -1;
      let v;
      if (d >= 0) {
        Wf.a[j] = Math.atan2(D.z[d] - z, D.x[d] - x);
        v = 2.8;
        // zayıf, çok genç ya da yaşlı geyikler daha kolay yakalanır
        const weak = D.e[d] < 0.35 || D.age[d] < 8 || D.age[d] > 55;
        if (m._d2 < 0.8 * 0.8 && rng() < 1 - Math.exp(-(weak ? 4 : 1.2) * h)) {
          D.e[d] = -1; killed++; m.eaten++;
          Wf.e[j] += 0.6;
        }
      } else {
        Wf.a[j] += (rng() - 0.5) * 3 * h;
        v = 1.3;
      }
      move(Wf, j, v, h);
      Wf.e[j] -= 0.07 * h;
      Wf.age[j] += h;
      if (Wf.e[j] <= 0 || Wf.age[j] > 90 + (j % 23)) { removeAt(Wf, j); j--; continue; }
      // kurt sürüleri bölge savunur: kalabalıkta daha az yavru
      if (Wf.e[j] > 1.0 && rng() < p.wolfBirth * h * Math.max(0, 1 - Wf.n / WOLF_K)) {
        const c = addWolf(Wf.x[j], Wf.z[j], Wf.e[j] * 0.4, 0);
        if (c >= 0) Wf.e[j] *= 0.6;
      }
    }
    if (killed) { for (let i = 0; i < D.n; i++) if (D.e[i] < 0) { removeAt(D, i); i--; } hash(D, headD, nextD); }

    // Göç: komşu bölgelerden ara sıra birey gelir (yok oluş kalıcı olmaz)
    if (D.n < 8 && rng() < 0.3 * h) { const [x, z] = edgePos(); addDeer(x, z, 0.8, 5); }
    if (p.wolvesOn && Wf.n < 3 && rng() < 0.04 * h) { const [x, z] = edgePos(); addWolf(x, z, 1.1, 5); }

    // Söğütler: kurt azsa geyikler nehir kıyısında rahatça otlar (korku etkisi)
    const fear = Math.min(1, Wf.n / 15);
    let ws = 0;
    for (let k = 0; k < wil.n; k++) {
      const c = countNear(D, headD, nextD, wil.x[k], wil.z[k], 2);
      let hh = wil.h[k] + h * (0.035 * (1 - wil.h[k]) - c * 0.02 * (1 - 0.7 * fear));
      if (m.drought > 0) hh -= 0.004 * h;
      wil.h[k] = hh < 0.04 ? 0.04 : hh > 1 ? 1 : hh;
      ws += wil.h[k];
    }
    m.willowMean = wil.n ? ws / wil.n : 0;
  };
  m.waterCount = water.reduce((s, v) => s + v, 0);
  return m;
}
