// Küçük çok katmanlı algılayıcı (MLP): ileri besleme, geri yayılım, SGD/Adam, L2; 2B oyuncak veri kümeleri.
import { seeded } from '@core';

const ACT = {
  tanh: { f: Math.tanh, d: (a) => 1 - a * a, lo: -1, hi: 1 },
  relu: { f: (z) => (z > 0 ? z : 0), d: (a) => (a > 0 ? 1 : 0), lo: 0, hi: null },
  sigmoid: { f: (z) => 1 / (1 + Math.exp(-z)), d: (a) => a * (1 - a), lo: 0, hi: 1 },
};
export { ACT };
const sig = (z) => 1 / (1 + Math.exp(-z));

/** sizes: [2, h1, h2, ..., 1] */
export function createNet(sizes, act = 'tanh', seed = 1) {
  const rnd = seeded(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const L = sizes.length - 1;
  const net = { sizes, act, L, W: [], b: [], mW: [], vW: [], mb: [], vb: [], gW: [], gb: [], t: 0 };
  for (let l = 0; l < L; l++) {
    const nIn = sizes[l], nOut = sizes[l + 1];
    const sd = act === 'relu' && l < L - 1 ? Math.sqrt(2 / nIn) : Math.sqrt(1 / nIn);
    const W = new Float64Array(nOut * nIn).map(() => gauss() * sd);
    const b = new Float64Array(nOut).fill(act === 'relu' && l < L - 1 ? 0.1 : 0);
    net.W.push(W); net.b.push(b);
    for (const k of ['mW', 'vW', 'gW']) net[k].push(new Float64Array(nOut * nIn));
    for (const k of ['mb', 'vb', 'gb']) net[k].push(new Float64Array(nOut));
  }
  // Aktivasyon tamponları
  net.a = sizes.map((n) => new Float64Array(n));
  net.delta = sizes.map((n) => new Float64Array(n));
  net.params = net.W.reduce((s, w) => s + w.length, 0) + net.b.reduce((s, b) => s + b.length, 0);
  return net;
}

/** İleri besleme; net.a içindeki tüm aktivasyonları doldurur, çıktı olasılığını döndürür. */
export function forward(net, x1, x2) {
  const A = ACT[net.act];
  net.a[0][0] = x1; net.a[0][1] = x2;
  for (let l = 0; l < net.L; l++) {
    const inp = net.a[l], out = net.a[l + 1], W = net.W[l], b = net.b[l];
    const nIn = inp.length, last = l === net.L - 1;
    for (let j = 0; j < out.length; j++) {
      let z = b[j];
      for (let i = 0; i < nIn; i++) z += W[j * nIn + i] * inp[i];
      out[j] = last ? sig(z) : A.f(z);
    }
  }
  return net.a[net.L][0];
}

/** Bir mini yığın üzerinde tek optimizasyon adımı. */
export function trainBatch(net, X, Y, idx, { lr, l2, opt }) {
  const A = ACT[net.act];
  for (let l = 0; l < net.L; l++) { net.gW[l].fill(0); net.gb[l].fill(0); }
  for (const k of idx) {
    forward(net, X[k * 2], X[k * 2 + 1]);
    // Çapraz entropi + sigmoid çıktısı: dL/dz = p − y
    net.delta[net.L][0] = net.a[net.L][0] - Y[k];
    for (let l = net.L - 1; l >= 0; l--) {
      const inp = net.a[l], dOut = net.delta[l + 1], W = net.W[l], nIn = inp.length;
      const gW = net.gW[l], gb = net.gb[l];
      for (let j = 0; j < dOut.length; j++) {
        const d = dOut[j];
        gb[j] += d;
        for (let i = 0; i < nIn; i++) gW[j * nIn + i] += d * inp[i];
      }
      if (l > 0) {
        const dIn = net.delta[l];
        for (let i = 0; i < nIn; i++) {
          let s = 0;
          for (let j = 0; j < dOut.length; j++) s += W[j * nIn + i] * dOut[j];
          dIn[i] = s * A.d(inp[i]);
        }
      }
    }
  }
  const n = idx.length;
  net.t++;
  const b1 = 0.9, b2 = 0.999, eps = 1e-8;
  const c1 = 1 - Math.pow(b1, net.t), c2 = 1 - Math.pow(b2, net.t);
  for (let l = 0; l < net.L; l++) {
    const upd = (P, G, M, V, reg) => {
      for (let q = 0; q < P.length; q++) {
        let g = G[q] / n + (reg ? l2 * P[q] : 0);
        if (!isFinite(g)) g = 0;
        if (opt === 'adam') {
          M[q] = b1 * M[q] + (1 - b1) * g;
          V[q] = b2 * V[q] + (1 - b2) * g * g;
          P[q] -= (lr * (M[q] / c1)) / (Math.sqrt(V[q] / c2) + eps);
        } else P[q] -= lr * g;
        if (P[q] > 50) P[q] = 50; else if (P[q] < -50) P[q] = -50;
      }
    };
    upd(net.W[l], net.gW[l], net.mW[l], net.vW[l], true);
    upd(net.b[l], net.gb[l], net.mb[l], net.vb[l], false);
  }
}

/** Ortalama ikili çapraz entropi ve doğruluk. */
export function evaluate(net, X, Y, idx) {
  if (!idx.length) return { loss: NaN, acc: NaN };
  let loss = 0, ok = 0;
  for (const k of idx) {
    const p = Math.min(1 - 1e-7, Math.max(1e-7, forward(net, X[k * 2], X[k * 2 + 1])));
    loss += Y[k] ? -Math.log(p) : -Math.log(1 - p);
    if ((p >= 0.5) === (Y[k] === 1)) ok++;
  }
  return { loss: loss / idx.length, acc: ok / idx.length };
}

/** 2B veri kümesi: X (düz dizi x1,x2), Y (0/1). Koordinatlar yaklaşık [-1, 1]. */
export function makeData(kind, n, noise, seed = 7) {
  const rnd = seeded(seed);
  const g = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const X = new Float64Array(n * 2), Y = new Uint8Array(n);
  const jit = noise * 0.35;
  for (let k = 0; k < n; k++) {
    const c = k % 2;
    let x = 0, y = 0;
    if (kind === 'daire') {
      const r = c ? rnd() * 0.45 : 0.62 + rnd() * 0.33, a = rnd() * Math.PI * 2;
      x = r * Math.cos(a); y = r * Math.sin(a);
    } else if (kind === 'xor') {
      x = (0.06 + rnd() * 0.88) * (rnd() < 0.5 ? -1 : 1);
      y = (0.06 + rnd() * 0.88) * (rnd() < 0.5 ? -1 : 1);
      if ((x * y > 0 ? 1 : 0) !== c) y = -y;
    } else if (kind === 'spiral') {
      const t = rnd(), r = 0.08 + t * 0.85, a = t * 1.75 * 2 * Math.PI + c * Math.PI;
      x = r * Math.cos(a); y = r * Math.sin(a);
    } else {
      const m = c ? 0.42 : -0.42;
      x = m + g() * 0.22; y = m + g() * 0.22;
    }
    X[k * 2] = Math.max(-1.2, Math.min(1.2, x + g() * jit));
    X[k * 2 + 1] = Math.max(-1.2, Math.min(1.2, y + g() * jit));
    Y[k] = c;
  }
  return { X, Y, n };
}
