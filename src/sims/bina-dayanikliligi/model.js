// Toplanmış kütleli kayma binası: kat kütleleri, histeretik kat yayları (P-Δ dahil), Rayleigh sönümü, isteğe bağlı taban izolatörü.
// Birimler: m, s; kat kütlesi 1 (normalize), kuvvetler kütle × ivme.
export const G = 9.81, H = 3, DT = 0.002;

// Zemin sınıfları: baskın periyot, süzgeç sönümü (dar/geniş bant), büyütme — temsili değerler
export const SOILS = {
  kaya: { name: 'Kaya', Tg: 0.3, zg: 0.6, amp: 1.0, color: 0x6b7280 },
  siki: { name: 'Sıkı zemin', Tg: 0.6, zg: 0.45, amp: 1.2, color: 0x8b6b4a },
  yumusak: { name: 'Yumuşak alüvyon', Tg: 1.2, zg: 0.25, amp: 1.4, color: 0x5b4636 },
};

// Box–Muller, tohumlu
function gaussR(rnd) { return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); }

/** Sentetik yer ivmesi (Kanai–Tajimi süzgeçli beyaz gürültü × zarf) ya da sarsma masası sinüsü. m/s² dizisi. */
export function makeRecord({ pga, Tg, zg, amp, dur, sine, rnd }) {
  const n = Math.ceil((dur + 12) / DT);
  const a = new Float32Array(n);
  const w = (2 * Math.PI) / Tg;
  const env = (t) => (t < 2 ? (t / 2) ** 2 : t < 2 + dur * 0.45 ? 1 : t < dur ? Math.exp((-(t - 2 - dur * 0.45) * 3) / (dur * 0.55 - 2 + 1e-6)) : 0);
  if (sine) {
    for (let i = 0; i < n; i++) {
      const t = i * DT;
      const e = t < 3 ? t / 3 : t < dur - 2 ? 1 : t < dur ? (dur - t) / 2 : 0;
      a[i] = Math.sin(w * t) * Math.max(0, e);
    }
  } else {
    // Clough–Penzien: Kanai–Tajimi çıktısı ikinci bir yüksek geçiren süzgeçten geçer (uzun periyotlu kayma olmaz)
    let x = 0, xv = 0, y = 0, yv = 0;
    const wf = 2 * Math.PI / 4, zf = 0.7;
    for (let i = 0; i < n; i++) {
      const t = i * DT;
      const xa = -gaussR(rnd) * env(t) / Math.sqrt(DT) - 2 * zg * w * xv - w * w * x;
      xv += xa * DT; x += xv * DT;
      const kt = -(2 * zg * w * xv + w * w * x);
      const ya = kt - 2 * zf * wf * yv - wf * wf * y;
      yv += ya * DT; y += yv * DT;
      a[i] = ya;
    }
  }
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(a[i]));
  const s = (pga * amp * G) / peak;
  for (let i = 0; i < n; i++) a[i] *= s;
  return a;
}

/**
 * opts: { N, soft, cut, short, code, iso }
 * Kat j (0 = zemin kat) için rijitlik k, dayanım V (kat kesme kuvveti), göçme ötelenmesi thu.
 */
export function createModel() {
  const md = {};
  md.configure = (o) => {
    const N = o.N;
    const off = o.iso ? 1 : 0, M = N + off;
    // Temel binada T₁ ≈ 0,1·N olacak biçimde düzgün rijitlik
    const T0 = 0.1 * N;
    const k0 = (2 * Math.PI / T0) ** 2 / (4 * Math.sin(Math.PI / (4 * N + 2)) ** 2);
    const Cy = o.code ? 0.3 : 0.18;
    const k = new Float64Array(N), V = new Float64Array(N), thu = new Float64Array(N), P = new Float64Array(N);
    let wsum = 0;
    for (let j = 0; j < N; j++) wsum += (2 * (j + 1)) / (N + 1);
    let acc = wsum;
    for (let j = 0; j < N; j++) {
      k[j] = k0 * (o.code ? 1.4 : 1);
      V[j] = Cy * G * acc; // ters üçgen yük dağılımı
      acc -= (2 * (j + 1)) / (N + 1);
      thu[j] = o.code ? 0.04 : 0.02;
      P[j] = G * (N - j); // üstteki katların ağırlığı
      if (o.short) { k[j] *= 1.3; thu[j] *= 0.45; }
    }
    if (o.soft) { k[0] *= 0.35; V[0] *= 0.5; }
    if (o.cut) { k[0] *= 0.7; V[0] *= 0.5; thu[0] *= 0.7; }
    Object.assign(md, { N, off, M, k, V, thu, P, opts: o });
    md.m = new Float64Array(M).fill(1);
    // Periyotlar (ters yineleme)
    md.Tfix = period(Array.from(k), N);
    const w1 = (2 * Math.PI) / md.Tfix, w2 = 3 * w1, z = 0.05;
    if (o.iso) {
      md.kIso = (N + 1) * (2 * Math.PI / 3) ** 2; // izolatör: ~3 s hedef periyot
      md.cIso = 2 * 0.2 * (2 * Math.PI / 3) * (N + 1);
      md.T = period([md.kIso, ...k], M);
      md.alpha = 0; md.beta = (2 * z) / w1;
    } else {
      md.T = md.Tfix;
      md.alpha = (2 * z * w1 * w2) / (w1 + w2); md.beta = (2 * z) / (w1 + w2);
    }
    md.reset();
  };
  md.reset = () => {
    const { M, N } = md;
    md.u = new Float64Array(M); md.v = new Float64Array(M); md.F = new Float64Array(M);
    md.f = new Float64Array(N); md.dPrev = new Float64Array(N);
    md.th = new Float64Array(N); md.thMax = new Float64Array(N); md.D = new Float64Array(N);
    md.collapsed = -1; md.roofAcc = 0; md.maxRoofAcc = 0; md.maxIso = 0;
  };
  md.step = (ag) => {
    const { M, off, u, v, F, f, k, V, P, m, alpha, beta } = md;
    if (md.collapsed >= 0) return;
    for (let j = 0; j < M; j++) {
      const ub = j ? u[j - 1] : 0, vb = j ? v[j - 1] : 0;
      const d = u[j] - ub, dd = v[j] - vb;
      if (j < off) { F[j] = md.kIso * d + md.cIso * dd; continue; }
      const s = j - off, k0 = k[s];
      const ke = k0 * (1 - 0.6 * md.D[s]); // hasarla rijitlik azalır
      let ft = f[s] + ke * (d - md.dPrev[s]);
      md.dPrev[s] = d;
      const dy = V[s] / k0;
      const fmax = V[s] + 0.08 * k0 * Math.max(0, Math.abs(d) - dy);
      ft = ft > fmax ? fmax : ft < -fmax ? -fmax : ft;
      f[s] = ft;
      F[j] = ft + beta * k0 * dd - (P[s] * d) / H;
    }
    let ra = 0;
    for (let j = 0; j < M; j++) {
      const a = (-F[j] + (j + 1 < M ? F[j + 1] : 0) - alpha * m[j] * v[j]) / m[j] - ag;
      v[j] += a * DT;
      if (j === M - 1) ra = a + ag;
    }
    for (let j = 0; j < M; j++) u[j] += v[j] * DT;
    md.roofAcc = ra;
    if (off && Math.abs(u[0]) > md.maxIso) md.maxIso = Math.abs(u[0]);
    if (Math.abs(ra) > md.maxRoofAcc) md.maxRoofAcc = Math.abs(ra);
    for (let s = 0; s < md.N; s++) {
      const j = s + off;
      const th = (u[j] - (j ? u[j - 1] : 0)) / H;
      md.th[s] = th;
      const a = Math.abs(th);
      if (a > md.thMax[s]) {
        md.thMax[s] = a;
        const thy = V[s] / (k[s] * H);
        md.D[s] = Math.min(1, Math.max(0, (a - thy) / (md.thu[s] - thy)));
        if (a >= md.thu[s] && md.collapsed < 0) md.collapsed = s;
      }
    }
  };
  return md;
}

// Sabit tabanlı zincirin temel periyodu (ters yineleme, üç köşegenli K)
function period(k, M) {
  let x = new Float64Array(M).fill(1), lam = 0;
  for (let it = 0; it < 60; it++) {
    // K y = M x çöz (Thomas)
    const a = new Float64Array(M), b = new Float64Array(M), c = new Float64Array(M), d = Float64Array.from(x);
    for (let j = 0; j < M; j++) { b[j] = k[j] + (j + 1 < M ? k[j + 1] : 0); a[j] = j ? -k[j] : 0; c[j] = j + 1 < M ? -k[j + 1] : 0; }
    for (let j = 1; j < M; j++) { const w = a[j] / b[j - 1]; b[j] -= w * c[j - 1]; d[j] -= w * d[j - 1]; }
    const y = new Float64Array(M);
    y[M - 1] = d[M - 1] / b[M - 1];
    for (let j = M - 2; j >= 0; j--) y[j] = (d[j] - c[j] * y[j + 1]) / b[j];
    let num = 0, den = 0;
    for (let j = 0; j < M; j++) { num += x[j] * y[j]; den += y[j] * y[j]; }
    lam = num / den; // ω² ≈ xᵀy / yᵀy
    const nrm = Math.sqrt(den);
    for (let j = 0; j < M; j++) x[j] = y[j] / nrm;
  }
  return (2 * Math.PI) / Math.sqrt(lam);
}
