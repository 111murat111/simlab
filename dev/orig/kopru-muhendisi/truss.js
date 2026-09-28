// Köprü kafes modeli: hazır geometriler, kesit/kapasite hesabı ve 2B doğrudan rijitlik çözücüsü (saf JS).
export const HALF = 16;        // açıklığın yarısı (m) → 32 m köprü
export const PANEL = 4;        // panel boyu (m)
export const G = 9.81;

export const MATS = {
  celik: { name: 'Çelik', E: 210e9, ft: 235e6, fc: 235e6, rho: 7850, price: 60, color: 0xaab4c3 },
  ahsap: { name: 'Ahşap', E: 11.5e9, ft: 19e6, fc: 24e6, rho: 480, price: 35, color: 0xc08a52 },
};
export const CABLE = { E: 190e9, ft: 1570e6, rho: 7850, price: 90, color: 0x475569 };

/** Vadinin (V biçimli kanyon) z=0 kesitindeki zemin yüksekliği. */
export function gorgeY(x) {
  const e = HALF - Math.abs(x);
  return e <= 0 ? 0 : -Math.min(24, e * 3.2);
}

/** Kesit: çelik → kare kutu profil (et kalınlığı d/12), ahşap → dolu kare. d metre. */
function section(mat, d) {
  if (mat === 'celik') {
    const t = d / 12, di = d - 2 * t;
    return { A: d * d - di * di, I: (d ** 4 - di ** 4) / 12 };
  }
  return { A: d * d, I: d ** 4 / 12 };
}

export function memberProps(m, design) {
  if (m.group === 'cable' || m.group === 'hanger') {
    const d = m.group === 'cable' ? design.dCable : design.dCable * 0.5;
    const A = (Math.PI * d * d) / 4 * 0.8; // tel demeti doluluk oranı
    return { E: CABLE.E, A, I: 0, ft: CABLE.ft, fc: 0, rho: CABLE.rho, price: CABLE.price, cable: true, d };
  }
  const mat = MATS[design.mat];
  const d = m.group === 'tower' ? design.dChord * 1.8 : m.group === 'chord' ? design.dChord : design.dWeb;
  const { A, I } = section(design.mat, d);
  return { E: mat.E, A, I, ft: mat.ft, fc: mat.fc, rho: mat.rho, price: mat.price, cable: false, d };
}

/** Elemanların kesit, boy ve taşıma kapasitelerini hesaplar. */
export function applyDesign(model, design) {
  for (const m of model.members) {
    const a = model.nodes[m.a], b = model.nodes[m.b];
    m.L = Math.hypot(b.x - a.x, b.y - a.y);
    m.p = memberProps(m, design);
    m.capT = m.p.ft * m.p.A;
    m.capY = m.p.fc * m.p.A;                                        // ezilme
    m.capB = m.p.cable ? 0 : (Math.PI ** 2 * m.p.E * m.p.I) / (m.L * m.L); // Euler burkulması
    m.capC = Math.min(m.capY, m.capB);
    m.mass = m.p.rho * m.p.A * m.L;
  }
}

export function buildPreset(name) {
  const nodes = [], members = [], cross = [];
  let deck = [];
  // fix: 3 = sabit mafsal, 2 = kayıcı mesnet (yalnız düşey)
  const N = (x, y, fix = 0) => (nodes.push({ x, y, fx: fix === 3, fy: fix >= 2 }), nodes.length - 1);
  const M = (a, b, group, label) => members.push({ a, b, group, label, alive: true, slack: false, F: 0, util: 0, mode: '' });
  const X = (i) => -HALF + PANEL * i;
  const b = [];
  for (let i = 0; i <= 8; i++) b.push(N(X(i), 0, i === 0 ? 3 : i === 8 ? 2 : 0));
  deck = b;

  if (name === 'warren') {
    const t = [];
    for (let i = 0; i < 8; i++) t.push(N(X(i + 0.5), 4));
    for (let i = 0; i < 8; i++) M(b[i], b[i + 1], 'chord', 'Alt başlık');
    for (let i = 0; i < 7; i++) M(t[i], t[i + 1], 'chord', 'Üst başlık');
    for (let i = 0; i < 8; i++) { M(b[i], t[i], 'web', 'Çapraz'); M(t[i], b[i + 1], 'web', 'Çapraz'); }
    cross.push(...t);
  } else if (name === 'pratt' || name === 'howe') {
    const t = [];
    for (let i = 1; i <= 7; i++) t[i] = N(X(i), 4);
    for (let i = 0; i < 8; i++) M(b[i], b[i + 1], 'chord', 'Alt başlık');
    for (let i = 1; i < 7; i++) M(t[i], t[i + 1], 'chord', 'Üst başlık');
    for (let i = 1; i <= 7; i++) M(b[i], t[i], 'web', 'Dikme');
    M(b[0], t[1], 'chord', 'Uç dikmesi'); M(b[8], t[7], 'chord', 'Uç dikmesi');
    for (let i = 1; i <= 3; i++) name === 'pratt' ? M(t[i], b[i + 1], 'web', 'Çapraz') : M(b[i], t[i + 1], 'web', 'Çapraz');
    for (let i = 4; i <= 6; i++) name === 'pratt' ? M(t[i + 1], b[i], 'web', 'Çapraz') : M(b[i + 1], t[i], 'web', 'Çapraz');
    cross.push(...t.filter((v) => v != null));
  } else if (name === 'kemer') {
    // Tabliyenin altında kemer: kemer ayakları kanyon duvarına mafsallı
    const xs = HALF - 2, ys = gorgeY(xs), yc = -1;
    const archY = (x) => yc + (ys - yc) * (x / xs) ** 2;
    const s0 = N(-xs, ys, 3), s1 = N(xs, ys, 3);
    const a = [];
    for (let i = 1; i <= 7; i++) a[i] = N(X(i), archY(X(i)));
    for (let i = 0; i < 8; i++) M(b[i], b[i + 1], 'chord', 'Tabliye kirişi');
    M(s0, a[1], 'chord', 'Kemer');
    for (let i = 1; i < 7; i++) M(a[i], a[i + 1], 'chord', 'Kemer');
    M(a[7], s1, 'chord', 'Kemer');
    for (let i = 1; i <= 7; i++) M(b[i], a[i], 'web', 'Dikme');
    M(b[0], a[1], 'web', 'Çapraz'); M(b[8], a[7], 'web', 'Çapraz');
    for (let i = 1; i <= 3; i++) M(b[i], a[i + 1], 'web', 'Çapraz');
    for (let i = 4; i <= 6; i++) M(a[i], b[i + 1], 'web', 'Çapraz');
    cross.push(...a.filter((v) => v != null), s0, s1);
  } else if (name === 'asma') {
    // Basit asma köprü: sığ rijitleştirme kafesi + ana kablo + askılar + kuleler + ankraj
    const l = [];
    for (let i = 0; i < 8; i++) l.push(N(X(i + 0.5), -1.6));
    for (let i = 0; i < 8; i++) M(b[i], b[i + 1], 'chord', 'Tabliye kirişi');
    for (let i = 0; i < 7; i++) M(l[i], l[i + 1], 'chord', 'Alt başlık');
    for (let i = 0; i < 8; i++) { M(b[i], l[i], 'web', 'Çapraz'); M(l[i], b[i + 1], 'web', 'Çapraz'); }
    const H = 13, sag = 1.4;
    const T0 = N(-HALF, H), T1 = N(HALF, H);
    const A0 = N(-HALF - 11, 0, 3), A1 = N(HALF + 11, 0, 3);
    M(b[0], T0, 'tower', 'Kule'); M(b[8], T1, 'tower', 'Kule');
    M(A0, T0, 'cable', 'Ankraj kablosu'); M(A1, T1, 'cable', 'Ankraj kablosu');
    const c = [];
    for (let i = 1; i <= 7; i++) c[i] = N(X(i), sag + (H - sag) * (X(i) / HALF) ** 2);
    M(T0, c[1], 'cable', 'Ana kablo');
    for (let i = 1; i < 7; i++) M(c[i], c[i + 1], 'cable', 'Ana kablo');
    M(c[7], T1, 'cable', 'Ana kablo');
    for (let i = 1; i <= 7; i++) M(b[i], c[i], 'hanger', 'Askı');
    cross.push(T0, T1, ...l);
  }
  return { name, nodes, members, deck, cross };
}

/** Kamyon ve ölü yükler: F dizisine (N) tek bir kafes düzlemi için düşey yük yazar. */
export function buildLoads(model, F, { truckX = null, truckT = 0, deckQ = 5000 } = {}) {
  F.fill(0);
  const { nodes, members, deck } = model;
  for (const m of members) {
    if (!m.alive) continue;
    const w = m.mass * G;
    F[2 * m.a + 1] -= w / 2; F[2 * m.b + 1] -= w / 2;
  }
  // Tabliye öz ağırlığı (kafes başına deckQ N/m)
  for (let k = 0; k < deck.length; k++) {
    const x0 = nodes[deck[Math.max(0, k - 1)]].x, x1 = nodes[deck[Math.min(deck.length - 1, k + 1)]].x;
    F[2 * deck[k] + 1] -= (deckQ * (x1 - x0)) / 2;
  }
  if (truckX != null && truckT > 0) {
    const W = truckT * 1000 * G / 2; // iki kafes düzlemi yükü paylaşır
    axle(model, F, truckX - 2.0, W * 0.65);
    axle(model, F, truckX + 2.4, W * 0.35);
  }
}

function axle(model, F, x, P) {
  const { nodes, deck } = model;
  for (let k = 0; k < deck.length - 1; k++) {
    const a = nodes[deck[k]], b = nodes[deck[k + 1]];
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      F[2 * deck[k] + 1] -= P * (1 - t);
      F[2 * deck[k + 1] + 1] -= P * t;
      return;
    }
  }
}

/**
 * Doğrusal kafes çözümü (K·u = F). Kablolar yalnız çekme taşır (basınçta gevşer).
 * Dönüş: { ok, U, maxDisp } — ok=false ise sistem mekanizma (tekil rijitlik).
 */
export function solveTruss(model, F) {
  const { nodes, members } = model;
  const n = nodes.length, nd = 2 * n;
  const idx = new Int32Array(nd);
  let nf = 0;
  for (let i = 0; i < n; i++) {
    idx[2 * i] = nodes[i].fx ? -1 : nf++;
    idx[2 * i + 1] = nodes[i].fy ? -1 : nf++;
  }
  const U = new Float64Array(nd);
  const K = new Float64Array(nf * nf), R = new Float64Array(nf);
  for (const m of members) m.slack = false;
  for (let iter = 0; iter < 6; iter++) {
    K.fill(0);
    for (let d = 0; d < nd; d++) if (idx[d] >= 0) R[idx[d]] = F[d];
    for (const m of members) {
      if (!m.alive) continue;
      const a = nodes[m.a], b = nodes[m.b];
      const c = (b.x - a.x) / m.L, s = (b.y - a.y) / m.L;
      const k = (m.p.E * m.p.A) / m.L * (m.slack ? 1e-6 : 1);
      const dofs = [2 * m.a, 2 * m.a + 1, 2 * m.b, 2 * m.b + 1], v = [-c, -s, c, s];
      for (let i = 0; i < 4; i++) {
        const I = idx[dofs[i]];
        if (I < 0) continue;
        for (let j = 0; j < 4; j++) {
          const J = idx[dofs[j]];
          if (J >= 0) K[I * nf + J] += k * v[i] * v[j];
        }
      }
    }
    const u = gauss(K, R, nf);
    if (!u) return { ok: false };
    for (let d = 0; d < nd; d++) U[d] = idx[d] >= 0 ? u[idx[d]] : 0;
    let changed = false;
    for (const m of members) {
      if (!m.alive) continue;
      const a = nodes[m.a], b = nodes[m.b];
      const c = (b.x - a.x) / m.L, s = (b.y - a.y) / m.L;
      const e = (U[2 * m.b] - U[2 * m.a]) * c + (U[2 * m.b + 1] - U[2 * m.a + 1]) * s; // uzama
      const k = (m.p.E * m.p.A) / m.L;
      if (m.p.cable) {
        const sl = e < 0;
        if (sl !== m.slack) { m.slack = sl; changed = true; }
        m.F = sl ? 0 : k * e;
      } else m.F = k * e;
    }
    if (!changed) break;
  }
  let maxDisp = 0;
  for (let i = 0; i < n; i++) maxDisp = Math.max(maxDisp, Math.hypot(U[2 * i], U[2 * i + 1]));
  for (const m of members) {
    if (!m.alive) { m.util = 0; continue; }
    if (m.F >= 0) { m.util = m.F / m.capT; m.mode = m.p.cable ? 'kopma' : 'kopma'; }
    else if (m.p.cable) { m.util = 0; m.mode = 'gevşek'; }
    else { m.util = -m.F / m.capC; m.mode = m.capB < m.capY ? 'burkulma' : 'ezilme'; }
  }
  return { ok: true, U, maxDisp };
}

/** Kısmi pivotlamalı Gauss eliminasyonu. Tekilse null. */
function gauss(K, R, n) {
  const A = Float64Array.from(K), b = Float64Array.from(R);
  let maxDiag = 0;
  for (let i = 0; i < n; i++) maxDiag = Math.max(maxDiag, Math.abs(A[i * n + i]));
  const eps = maxDiag * 1e-11;
  for (let c = 0; c < n; c++) {
    let p = c, best = Math.abs(A[c * n + c]);
    for (let r = c + 1; r < n; r++) { const v = Math.abs(A[r * n + c]); if (v > best) { best = v; p = r; } }
    if (best <= eps) return null;
    if (p !== c) {
      for (let j = c; j < n; j++) { const t = A[c * n + j]; A[c * n + j] = A[p * n + j]; A[p * n + j] = t; }
      const t = b[c]; b[c] = b[p]; b[p] = t;
    }
    const piv = A[c * n + c];
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / piv;
      if (f === 0) continue;
      for (let j = c; j < n; j++) A[r * n + j] -= f * A[c * n + j];
      b[r] -= f * b[c];
    }
  }
  const x = new Float64Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let j = r + 1; j < n; j++) s -= A[r * n + j] * x[j];
    x[r] = s / A[r * n + r];
  }
  return x;
}

/** Toplam malzeme kütlesi (kg) ve maliyeti (₺) — iki kafes düzlemi birlikte. */
export function totals(model) {
  let mass = 0, cost = 0;
  for (const m of model.members) { mass += 2 * m.mass; cost += 2 * m.mass * m.p.price; }
  return { mass, cost };
}
