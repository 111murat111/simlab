// Tahliye modeli: ızgara kat planı, Dijkstra akış alanı, sosyal kuvvet (Helbing) yayaları, yangın ve duman. Saf JS.
export const CS = 0.5; // hücre boyu (m)
export const T = { FLOOR: 0, WALL: 1, SEAT: 2, EXIT: 3, OUT: 4, SRC: 5 };
const M = 3; // plan dışındaki kenar payı (hücre)

// Hazır planlar: iç ölçüler (m), aday çıkışlar [kenar, konum 0..1], varsayılanlar ve iç düzen
export const PLANS = {
  salon: {
    W: 30, H: 20, nExit: 2, n: 400,
    cand: [['N', 0.08], ['N', 0.92], ['S', 0.25], ['S', 0.75], ['E', 0.55], ['W', 0.55]],
    build(F) {
      F.rect(-8, -10, 8, -7, T.SEAT); // sahne
      for (let z = -4.75; z < 9; z += 1) { F.rect(-13.5, z, -2, z + 0.5, T.SEAT); F.rect(2, z, 13.5, z + 0.5, T.SEAT); }
    },
  },
  avm: {
    W: 44, H: 28, nExit: 2, n: 500,
    cand: [['W', 0.5], ['E', 0.5], ['N', 0.5], ['S', 0.5], ['N', 0.12], ['S', 0.88]],
    build(F) {
      for (const [x1, x2] of [[-20, -12], [-8, -2], [2, 8], [12, 20]]) {
        for (const [z1, z2] of [[-12, -5], [5, 12]]) {
          // Dükkân: duvarlı kutu, koridora bakan kapısı açık
          F.rect(x1, z1, x2, z2, T.WALL);
          const door = z1 < 0 ? [z2 - 0.5, z2] : [z1, z1 + 0.5];
          F.rect(x1 + 0.5, z1 + 0.5, x2 - 0.5, z2 - 0.5, T.FLOOR);
          F.rect((x1 + x2) / 2 - 1.25, door[0], (x1 + x2) / 2 + 1.25, door[1], T.FLOOR);
        }
      }
      F.rect(-2, -1.5, 2, 1.5, T.SEAT); // ortadaki havuz/kiosk
    },
  },
  stadyum: {
    W: 44, H: 28, nExit: 3, n: 700,
    cand: [['N', 0.2], ['N', 0.5], ['N', 0.8], ['S', 0.3], ['S', 0.7], ['W', 0.3]],
    build(F) {
      F.rect(-22, 10, 22, 14, T.SEAT); // saha kenarı (pano)
      for (let z = -11.75; z < 9; z += 1) {
        for (let x = -21; x < 20; x += 10.5) F.rect(x, z, x + 9, z + 0.5, T.SEAT);
      }
    },
  },
  sutun: {
    W: 20, H: 16, nExit: 1, n: 250, width: 1.2, panic: 0.8,
    cand: [['E', 0.5], ['W', 0.5], ['N', 0.5], ['S', 0.5]],
    build() {},
  },
};

export function createFloor(key) {
  const P = PLANS[key];
  const nxI = Math.round(P.W / CS), nzI = Math.round(P.H / CS);
  const NX = nxI + 2 * M, NZ = nzI + 2 * M, N = NX * NZ;
  const F = {
    key, P, W: P.W, H: P.H, NX, NZ, N, nxI, nzI,
    x0: -P.W / 2 - M * CS, z0: -P.H / 2 - M * CS,
    base: new Uint8Array(N), type: new Uint8Array(N), fire: new Uint8Array(N), smoke: new Float32Array(N),
    D: new Float32Array(N), dir: new Float32Array(N * 2), fireCount: 0, fireList: [],
    exits: [], width: P.width || 1.6, pillars: [], pillarOn: false,
  };
  F.idx = (i, j) => j * NX + i;
  F.cx = (i) => F.x0 + (i + 0.5) * CS;
  F.cz = (j) => F.z0 + (j + 0.5) * CS;
  F.ci = (x) => Math.floor((x - F.x0) / CS);
  F.cj = (z) => Math.floor((z - F.z0) / CS);
  F.inside = (i, j) => i >= M && i < M + nxI && j >= M && j < M + nzI;
  F.rect = (x1, z1, x2, z2, t) => {
    for (let j = M; j < M + nzI; j++) for (let i = M; i < M + nxI; i++) {
      const x = F.cx(i), z = F.cz(j);
      if (x > x1 && x < x2 && z > z1 && z < z2) F.base[F.idx(i, j)] = t;
    }
  };
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const k = F.idx(i, j);
    if (F.inside(i, j)) F.base[k] = T.FLOOR;
    else if (i >= M - 1 && i <= M + nxI && j >= M - 1 && j <= M + nzI) F.base[k] = T.WALL;
    else F.base[k] = T.OUT;
  }
  P.build(F);
  F.exits = P.cand.slice(0, P.nExit).map(([side, t]) => ({ side, t }));
  applyLayout(F);
  return F;
}

const sideLen = (F, s) => (s === 'N' || s === 'S' ? F.W : F.H);

/** Duvar hücrelerini kenar + konuma çevirir (tıklama ile çıkış ekleme için). */
export function wallSide(F, i, j) {
  const { nxI, nzI } = F;
  let side = null;
  if (j === M - 1 && i >= M && i < M + nxI) side = 'N';
  else if (j === M + nzI && i >= M && i < M + nxI) side = 'S';
  else if (i === M - 1 && j >= M && j < M + nzI) side = 'W';
  else if (i === M + nxI && j >= M && j < M + nzI) side = 'E';
  if (!side) return null;
  const t = side === 'N' || side === 'S' ? (F.cx(i) + F.W / 2) / F.W : (F.cz(j) + F.H / 2) / F.H;
  return { side, t };
}

/** Çıkışları, sütunları ve yangını tip ızgarasına işler; akış alanını yeniden hesaplar. */
export function applyLayout(F) {
  F.type.set(F.base);
  const w = F.width;
  F.pillars = [];
  for (const e of F.exits) {
    const L = sideLen(F, e.side), c = -L / 2 + e.t * L;
    const cells = [];
    const horiz = e.side === 'N' || e.side === 'S';
    const n = horiz ? F.nxI : F.nzI;
    for (let k = 0; k < n; k++) {
      const p = -L / 2 + (k + 0.5) * CS;
      if (Math.abs(p - c) <= w / 2) cells.push(k);
    }
    if (!cells.length) cells.push(Math.max(0, Math.min(n - 1, Math.floor((c + L / 2) / CS))));
    for (const k of cells) {
      for (let o = 0; o < M; o++) {
        let i, j;
        if (e.side === 'N') { i = M + k; j = M - 1 - o; }
        else if (e.side === 'S') { i = M + k; j = M + F.nzI + o; }
        else if (e.side === 'W') { i = M - 1 - o; j = M + k; }
        else { i = M + F.nxI + o; j = M + k; }
        F.type[F.idx(i, j)] = o === 0 ? T.EXIT : T.SRC;
      }
      // Çıkış önündeki iç hücreler boş kalsın
      for (let o = 0; o < 2; o++) {
        let i, j;
        if (e.side === 'N') { i = M + k; j = M + o; }
        else if (e.side === 'S') { i = M + k; j = M + F.nzI - 1 - o; }
        else if (e.side === 'W') { i = M + o; j = M + k; }
        else { i = M + F.nxI - 1 - o; j = M + k; }
        if (F.type[F.idx(i, j)] === T.SEAT) F.type[F.idx(i, j)] = T.FLOOR;
      }
    }
    if (F.pillarOn) {
      // Çıkışın önüne, hafif yana kaydırılmış sütun (Helbing ve ark. 2000)
      const d = SF.PD + w * 0.35, off = SF.POFF, R = SF.PR;
      let x, z;
      if (e.side === 'N') { x = c + off; z = -F.H / 2 + d; }
      else if (e.side === 'S') { x = c + off; z = F.H / 2 - d; }
      else if (e.side === 'W') { x = -F.W / 2 + d; z = c + off; }
      else { x = F.W / 2 - d; z = c + off; }
      F.pillars.push({ x, z, r: R });
    }
  }
  for (const p of F.pillars) {
    for (let j = F.cj(p.z - 1); j <= F.cj(p.z + 1); j++) for (let i = F.ci(p.x - 1); i <= F.ci(p.x + 1); i++) {
      if (Math.hypot(F.cx(i) - p.x, F.cz(j) - p.z) < p.r + 0.1 && F.inside(i, j)) F.type[F.idx(i, j)] = T.WALL;
    }
  }
  computeField(F);
}

export const passable = (F, k) => { const t = F.type[k]; return (t === T.FLOOR || t === T.EXIT || t === T.SRC) && !F.fire[k]; };

/** Çok kaynaklı Dijkstra: her hücrenin en yakın çıkışa "maliyetli" uzaklığı ve iniş yönü. */
export function computeField(F) {
  const { NX, NZ, N, D } = F;
  D.fill(Infinity);
  const heap = new Heap(N);
  for (let k = 0; k < N; k++) if (F.type[k] === T.SRC) { D[k] = 0; heap.push(k, 0); }
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
  while (heap.size) {
    const [k, d] = heap.pop();
    if (d > D[k]) continue;
    const i = k % NX, j = (k - i) / NX;
    for (let m = 0; m < 8; m++) {
      const ni = i + DI[m], nj = j + DJ[m];
      if (ni < 0 || nj < 0 || ni >= NX || nj >= NZ) continue;
      const nk = nj * NX + ni;
      if (!passable(F, nk)) continue;
      if (m >= 4 && (!passable(F, j * NX + ni) || !passable(F, nj * NX + i))) continue;
      const nd = d + (m >= 4 ? 1.4142 : 1) * cellCost(F, ni, nj);
      if (nd < D[nk]) { D[nk] = nd; heap.push(nk, nd); }
    }
  }
  const dir = F.dir;
  dir.fill(0);
  for (let j = 1; j < NZ - 1; j++) for (let i = 1; i < NX - 1; i++) {
    const k = j * NX + i;
    if (!isFinite(D[k])) continue;
    let gx = 0, gz = 0;
    for (let m = 0; m < 8; m++) {
      const nk = (j + DJ[m]) * NX + i + DI[m];
      if (!(D[nk] < D[k])) continue;
      const len = m >= 4 ? 1.4142 : 1;
      const w = (D[k] - D[nk]) / len;
      gx += (DI[m] / len) * w; gz += (DJ[m] / len) * w;
    }
    const l = Math.hypot(gx, gz);
    if (l > 0) { dir[k * 2] = gx / l; dir[k * 2 + 1] = gz / l; }
  }
}

function cellCost(F, i, j) {
  const k = j * F.NX + i;
  let c = 1 + F.smoke[k] * 3;
  // Duvar ve ateş yakınında biraz daha pahalı: akış duvara yapışmasın, ateşten uzak dursun
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const nk = (j + dj) * F.NX + i + di;
    if (F.fire[nk]) c += 2;
    else if (F.type[nk] === T.WALL || F.type[nk] === T.SEAT) c += 0.15;
  }
  return c;
}

class Heap {
  constructor(n) { this.k = new Int32Array(n * 4); this.v = new Float32Array(n * 4); this.size = 0; }
  push(k, v) {
    if (this.size >= this.k.length) return;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.v[p] <= v) break;
      this.k[i] = this.k[p]; this.v[i] = this.v[p]; i = p;
    }
    this.k[i] = k; this.v[i] = v;
  }
  pop() {
    const rk = this.k[0], rv = this.v[0];
    const k = this.k[--this.size], v = this.v[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.v[c + 1] < this.v[c]) c++;
      if (this.v[c] >= v) break;
      this.k[i] = this.k[c]; this.v[i] = this.v[c]; i = c;
    }
    this.k[i] = k; this.v[i] = v;
    return [rk, rv];
  }
}

// ---------------- Kalabalık ----------------
export function createCrowd(F, n, rnd = Math.random) {
  const free = [];
  for (let k = 0; k < F.N; k++) {
    const i = k % F.NX, j = (k - i) / F.NX;
    if (F.inside(i, j) && F.type[k] === T.FLOOR && !F.fire[k] && isFinite(F.D[k])) free.push(k);
  }
  // Çıkışlara çok yakın hücrelere yerleştirme
  const cand = free.filter((k) => F.D[k] > 3);
  const pool = cand.length > n ? cand : free;
  const C = {
    n, px: new Float32Array(n), pz: new Float32Array(n), vx: new Float32Array(n), vz: new Float32Array(n),
    r: new Float32Array(n), delay: new Float32Array(n), vmul: new Float32Array(n), out: new Uint8Array(n),
    ax: new Float32Array(n), az: new Float32Array(n), dens: new Float32Array(n), smokeT: new Float32Array(n),
    outCount: 0, outTimes: [], t: 0, head: null, next: new Int32Array(n),
  };
  const used = new Map();
  for (let a = 0; a < n; a++) {
    let k = pool[Math.floor(rnd() * pool.length)];
    const u = used.get(k) || 0;
    used.set(k, u + 1);
    const i = k % F.NX, j = (k - i) / F.NX;
    const ox = u % 2 ? 0.22 : -0.02, oz = u >= 2 ? 0.22 : -0.02;
    C.px[a] = F.cx(i) - 0.1 + ox + (rnd() - 0.5) * 0.08;
    C.pz[a] = F.cz(j) - 0.1 + oz + (rnd() - 0.5) * 0.08;
    C.r[a] = 0.2 + rnd() * 0.06;
    C.vmul[a] = 0.85 + rnd() * 0.3;
    C.delay[a] = rnd();
  }
  return C;
}

const HC = 1; // komşu arama ızgarası (m)
// Sosyal kuvvet katsayıları (kütle başına): itme A·e^((r−d)/B), cisim sıkışması K, sürtünme KAP (Helbing ve ark. 2000)
export const SF = { A: 25, B: 0.08, K: 1500, KAP: 3000, TAU: 0.5, PD: 1.5, POFF: 0.25, PR: 0.45, FMAX: 400 };
export function stepCrowd(F, C, dt, panic) {
  C.t += dt;
  const n = C.n, HX = Math.ceil((F.NX * CS) / HC) + 1, HZ = Math.ceil((F.NZ * CS) / HC) + 1;
  if (!C.head || C.head.length !== HX * HZ) C.head = new Int32Array(HX * HZ);
  const head = C.head, next = C.next;
  head.fill(-1);
  for (let a = 0; a < n; a++) {
    if (C.out[a]) continue;
    const h = Math.floor((C.pz[a] - F.z0) / HC) * HX + Math.floor((C.px[a] - F.x0) / HC);
    next[a] = head[h]; head[h] = a;
  }
  const { A, B, K, KAP, TAU } = SF;
  const v0base = 1.3 + 1.4 * panic, herd = 0.45 * panic, delayMax = 6 * (1 - 0.7 * panic);
  for (let a = 0; a < n; a++) {
    if (C.out[a]) continue;
    const x = C.px[a], z = C.pz[a], ra = C.r[a], vxa = C.vx[a], vza = C.vz[a];
    const ci = Math.floor((x - F.x0) / CS), cj = Math.floor((z - F.z0) / CS), ck = cj * F.NX + ci;
    let fx = 0, fz = 0, nb = 0, hvx = 0, hvz = 0;
    // Komşular
    const hi = Math.floor((x - F.x0) / HC), hj = Math.floor((z - F.z0) / HC);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const hh = (hj + dj) * HX + hi + di;
      if (hh < 0 || hh >= head.length) continue;
      for (let b = head[hh]; b >= 0; b = next[b]) {
        if (b === a) continue;
        let dx = x - C.px[b], dz = z - C.pz[b];
        const d2 = dx * dx + dz * dz;
        if (d2 > 1.44) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz); }
        const nx = dx / d, nz = dz / d, rij = ra + C.r[b], ov = rij - d;
        if (d < 0.75) nb++;
        if (d < 1.2) { hvx += C.vx[b]; hvz += C.vz[b]; }
        let f = A * Math.exp(ov / B);
        if (ov > 0) {
          f += K * ov;
          const tx = -nz, tz = nx, dvt = (C.vx[b] - vxa) * tx + (C.vz[b] - vza) * tz;
          fx += KAP * ov * dvt * tx; fz += KAP * ov * dvt * tz;
        }
        // Görüş alanı: arkadaki kişilerin itişi daha zayıf algılanır
        fx += f * nx; fz += f * nz;
      }
    }
    // Duvarlar, oturma sıraları, ateş
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= F.NX || j >= F.NZ) continue;
      const k = j * F.NX + i;
      if (passable(F, k)) continue;
      const wx = F.cx(i), wz = F.cz(j);
      const qx = Math.max(wx - CS / 2, Math.min(wx + CS / 2, x)), qz = Math.max(wz - CS / 2, Math.min(wz + CS / 2, z));
      let dx = x - qx, dz = z - qz, d = Math.hypot(dx, dz);
      if (d < 1e-4) { dx = x - wx; dz = z - wz; d = 0; }
      const l = Math.hypot(dx, dz) || 1;
      const nx = dx / l, nz = dz / l, ov = ra - d;
      let f = (F.fire[k] ? 3 : 1) * A * Math.exp(ov / B);
      if (ov > 0) {
        f += K * ov;
        const tx = -nz, tz = nx, vt = vxa * tx + vza * tz;
        fx -= KAP * ov * vt * tx; fz -= KAP * ov * vt * tz;
      }
      fx += f * nx; fz += f * nz;
    }
    for (const p of F.pillars) {
      let dx = x - p.x, dz = z - p.z;
      const dc = Math.hypot(dx, dz) || 1e-4;
      if (dc > p.r + 1.2) continue;
      const nx = dx / dc, nz = dz / dc, ov = ra + p.r - dc;
      let f = A * Math.exp(ov / B);
      if (ov > 0) {
        f += K * ov;
        const tx = -nz, tz = nx, vt = vxa * tx + vza * tz;
        fx -= KAP * ov * vt * tx; fz -= KAP * ov * vt * tz;
      }
      fx += f * nx; fz += f * nz;
    }
    // İstenen yön: akış alanı (çift doğrusal) + panikte sürü davranışı
    let ex = 0, ez = 0;
    if (C.t > C.delay[a] * delayMax) {
      const gx = (x - F.x0) / CS - 0.5, gz = (z - F.z0) / CS - 0.5;
      const i0 = Math.floor(gx), j0 = Math.floor(gz), u = gx - i0, w = gz - j0;
      for (let q = 0; q < 4; q++) {
        const ii = i0 + (q & 1), jj = j0 + (q >> 1);
        if (ii < 0 || jj < 0 || ii >= F.NX || jj >= F.NZ) continue;
        const k = jj * F.NX + ii, wt = ((q & 1) ? u : 1 - u) * ((q >> 1) ? w : 1 - w);
        ex += F.dir[k * 2] * wt; ez += F.dir[k * 2 + 1] * wt;
      }
      let l = Math.hypot(ex, ez);
      if (l < 1e-3 && ck >= 0 && ck < F.N) { ex = F.dir[ck * 2]; ez = F.dir[ck * 2 + 1]; l = Math.hypot(ex, ez); }
      if (F.type[ck] === T.EXIT || F.type[ck] === T.SRC) { ex = vxa; ez = vza; l = Math.hypot(ex, ez); }
      if (l > 1e-3) { ex /= l; ez /= l; }
      const hl = Math.hypot(hvx, hvz);
      if (herd > 0 && hl > 0.2) { ex = ex * (1 - herd) + (hvx / hl) * herd; ez = ez * (1 - herd) + (hvz / hl) * herd; const l2 = Math.hypot(ex, ez) || 1; ex /= l2; ez /= l2; }
    }
    const sm = ck >= 0 && ck < F.N ? F.smoke[ck] : 0;
    const v0 = v0base * C.vmul[a] * (1 - 0.6 * Math.min(1, sm));
    fx += (v0 * ex - vxa) / TAU; fz += (v0 * ez - vza) / TAU;
    const fl = Math.hypot(fx, fz);
    if (fl > SF.FMAX) { fx *= SF.FMAX / fl; fz *= SF.FMAX / fl; }
    C.ax[a] = fx; C.az[a] = fz;
    C.dens[a] = nb / (Math.PI * 0.75 * 0.75) + 1 / 1.77;
    if (sm > 0.35) C.smokeT[a] += dt;
  }
  const vmax = 3.2;
  for (let a = 0; a < n; a++) {
    if (C.out[a]) continue;
    let vx = C.vx[a] + C.ax[a] * dt, vz = C.vz[a] + C.az[a] * dt;
    const v = Math.hypot(vx, vz);
    if (v > vmax) { vx *= vmax / v; vz *= vmax / v; }
    const x = C.px[a], z = C.pz[a];
    let nxp = x + vx * dt, nzp = z + vz * dt;
    // Duvardan geçmeyi engelle
    const blocked = (px, pz) => { const k = F.cj(pz) * F.NX + F.ci(px); return k < 0 || k >= F.N || !passable(F, k); };
    if (blocked(nxp, nzp)) {
      if (!blocked(nxp, z)) { nzp = z; vz = 0; }
      else if (!blocked(x, nzp)) { nxp = x; vx = 0; }
      else { nxp = x; nzp = z; vx = vz = 0; }
    }
    C.px[a] = nxp; C.pz[a] = nzp; C.vx[a] = vx; C.vz[a] = vz;
    if (Math.abs(nxp) > F.W / 2 + 0.3 || Math.abs(nzp) > F.H / 2 + 0.3) {
      C.out[a] = 1; C.outCount++; C.outTimes.push(C.t);
    }
  }
}

// ---------------- Yangın ve duman ----------------
export function ignite(F, i, j) {
  const k = F.idx(i, j);
  if (!F.inside(i, j) || F.fire[k] || F.type[k] === T.WALL) return false;
  F.fire[k] = 1; F.fireList.push(k); F.fireCount++;
  return true;
}
export function stepFire(F, dt, spread, rnd = Math.random) {
  let changed = false;
  if (spread > 0 && F.fireCount < 1200) {
    const list = F.fireList.slice();
    for (const k of list) {
      const i = k % F.NX, j = (k - i) / F.NX;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, nk = F.idx(ni, nj);
        if (!F.inside(ni, nj) || F.fire[nk] || F.type[nk] === T.WALL) continue;
        const rate = spread * (F.type[nk] === T.SEAT ? 0.5 : 0.18);
        if (rnd() < 1 - Math.exp(-rate * dt)) changed = ignite(F, ni, nj) || changed;
      }
    }
  }
  // Duman: kaynak + yayılma (açık hücreler arasında) + çıkışlardan tahliye
  const S = F.smoke, NX = F.NX, next = new Float32Array(S.length);
  const Dc = 0.35 * dt / (CS * CS);
  for (let k = NX; k < F.N - NX; k++) {
    const t = F.type[k];
    if (t === T.WALL || t === T.OUT) continue;
    let s = S[k], lap = 0;
    for (const nk of [k - 1, k + 1, k - NX, k + NX]) {
      const nt = F.type[nk];
      if (nt === T.WALL || nt === T.OUT) continue;
      lap += S[nk] - s;
    }
    s += Dc * lap;
    if (F.fire[k]) s += 0.9 * dt;
    if (t === T.EXIT || t === T.SRC) s *= 1 - Math.min(1, 3 * dt);
    next[k] = Math.max(0, Math.min(1, s * (1 - 0.004 * dt)));
  }
  S.set(next);
  return changed;
}
