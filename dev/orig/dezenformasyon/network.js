// Ağ üreticileri (ölçeksiz, küçük dünya, rastgele) ve 3B kuvvet yönelimli yerleşim.
import { seeded } from '@core';

export function buildNetwork(type, N, seed = 1) {
  const rnd = seeded(seed);
  const adj = Array.from({ length: N }, () => new Set());
  const link = (a, b) => { if (a !== b) { adj[a].add(b); adj[b].add(a); } };
  if (type === 'olceksiz') {
    // Barabási–Albert: yeni gelen, bağlantısı çok olana bağlanmayı tercih eder (m = 2)
    const m = 2, targets = [];
    link(0, 1); link(1, 2); link(2, 0);
    targets.push(0, 1, 1, 2, 2, 0);
    for (let v = 3; v < N; v++) {
      const chosen = new Set();
      while (chosen.size < m) chosen.add(targets[Math.floor(rnd() * targets.length)]);
      for (const u of chosen) { link(v, u); targets.push(v, u); }
    }
  } else if (type === 'kucukdunya') {
    // Watts–Strogatz: halka kafes (k = 6) + %8 rastgele yeniden bağlama
    const k = 3, p = 0.08;
    for (let v = 0; v < N; v++) {
      for (let j = 1; j <= k; j++) {
        let u = (v + j) % N;
        if (rnd() < p) { do u = Math.floor(rnd() * N); while (u === v || adj[v].has(u)); }
        link(v, u);
      }
    }
  } else {
    // Erdős–Rényi: her çift aynı küçük olasılıkla bağlı (ortalama derece ≈ 5)
    const p = 5 / (N - 1);
    for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) if (rnd() < p) link(a, b);
    // yalnız kalanları bağla
    for (let v = 0; v < N; v++) if (!adj[v].size) link(v, Math.floor(rnd() * N));
  }
  const nbr = adj.map((s) => [...s]);
  const edges = [];
  nbr.forEach((list, a) => list.forEach((b) => { if (a < b) edges.push([a, b]); }));
  return { N, nbr, edges, pos: layout(N, edges, rnd, type) };
}

function layout(N, edges, rnd, type) {
  const P = new Float64Array(N * 3), F = new Float64Array(N * 3);
  for (let i = 0; i < N; i++) {
    if (type === 'kucukdunya') {
      const a = (i / N) * Math.PI * 2;
      P[i * 3] = Math.cos(a) * 8; P[i * 3 + 1] = (rnd() - 0.5) * 2; P[i * 3 + 2] = Math.sin(a) * 8;
    } else {
      P[i * 3] = (rnd() - 0.5) * 12; P[i * 3 + 1] = (rnd() - 0.5) * 12; P[i * 3 + 2] = (rnd() - 0.5) * 12;
    }
  }
  const k = 1.4;
  let temp = 1.2;
  for (let it = 0; it < 140; it++) {
    F.fill(0);
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = P[i * 3] - P[j * 3], dy = P[i * 3 + 1] - P[j * 3 + 1], dz = P[i * 3 + 2] - P[j * 3 + 2];
        const d2 = dx * dx + dy * dy + dz * dz + 0.01;
        const f = (k * k) / d2;
        dx *= f; dy *= f; dz *= f;
        F[i * 3] += dx; F[i * 3 + 1] += dy; F[i * 3 + 2] += dz;
        F[j * 3] -= dx; F[j * 3 + 1] -= dy; F[j * 3 + 2] -= dz;
      }
    }
    for (const [a, b] of edges) {
      const dx = P[a * 3] - P[b * 3], dy = P[a * 3 + 1] - P[b * 3 + 1], dz = P[a * 3 + 2] - P[b * 3 + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      const f = d / k;
      F[a * 3] -= dx * f; F[a * 3 + 1] -= dy * f; F[a * 3 + 2] -= dz * f;
      F[b * 3] += dx * f; F[b * 3 + 1] += dy * f; F[b * 3 + 2] += dz * f;
    }
    for (let i = 0; i < N; i++) {
      // merkeze hafif çekim (kopuk parçalar uzaklaşmasın)
      F[i * 3] -= P[i * 3] * 0.05; F[i * 3 + 1] -= P[i * 3 + 1] * 0.05; F[i * 3 + 2] -= P[i * 3 + 2] * 0.05;
      const fl = Math.hypot(F[i * 3], F[i * 3 + 1], F[i * 3 + 2]) + 1e-9;
      const s = Math.min(fl, temp) / fl;
      P[i * 3] += F[i * 3] * s; P[i * 3 + 1] += F[i * 3 + 1] * s; P[i * 3 + 2] += F[i * 3 + 2] * s;
    }
    temp *= 0.975;
  }
  // Ortala ve yarıçapı ~8 birime ölçekle
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < N; i++) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; }
  cx /= N; cy /= N; cz /= N;
  const d = [];
  for (let i = 0; i < N; i++) { P[i * 3] -= cx; P[i * 3 + 1] -= cy; P[i * 3 + 2] -= cz; d.push(Math.hypot(P[i * 3], P[i * 3 + 1], P[i * 3 + 2])); }
  d.sort((a, b) => a - b);
  const s = 8 / (d[Math.floor(N * 0.95)] || 1);
  for (let i = 0; i < N * 3; i++) P[i] *= s;
  return P;
}
