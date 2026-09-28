// Evrim akvaryumu modeli (THREE'den bağımsız): kalıtsal genli av balıkları, görerek avlanan avcılar, yem.
export const MAXP = 450;
export const MAXF = 300;
export const MAXH = 12;
export const BOX = { x: 11, y0: 0.7, y1: 8.6, z: 5.2, floor: 0.15 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
function gauss(m, s) {
  const u = 1 - Math.random(), v = Math.random();
  return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v);
}
/** İki renk tonu arasındaki fark, 0 (aynı) … 1 (renk çemberinde tam karşıt). */
export function hueDiff(a, b) {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d * 2;
}

export function createWorld() {
  const P = {
    n: 0, px: new Float32Array(MAXP), py: new Float32Array(MAXP), pz: new Float32Array(MAXP),
    vx: new Float32Array(MAXP), vy: new Float32Array(MAXP), vz: new Float32Array(MAXP),
    hue: new Float32Array(MAXP), spd: new Float32Array(MAXP), size: new Float32Array(MAXP),
    energy: new Float32Array(MAXP), age: new Float32Array(MAXP), maxAge: new Float32Array(MAXP),
    gen: new Int32Array(MAXP), id: new Int32Array(MAXP), flee: new Uint8Array(MAXP),
    tFood: new Int32Array(MAXP), tFoodId: new Int32Array(MAXP), retarget: new Float32Array(MAXP),
  };
  const F = {
    n: 0, x: new Float32Array(MAXF), y: new Float32Array(MAXF), z: new Float32Array(MAXF),
    age: new Float32Array(MAXF), id: new Int32Array(MAXF), ph: new Float32Array(MAXF),
  };
  const H = [];
  for (let i = 0; i < MAXH; i++) {
    H.push({ x: 0, y: 0, z: 0, vx: 1, vy: 0, vz: 0, spd: 3, energy: 3, age: 0, life: 150, catches: 0,
      state: 0, timer: 0, target: -1, targetId: -1, gen: 1, active: false });
  }
  const w = {
    P, F, H,
    params: { predators: 4, mutation: 0.05, food: 12, floorHue: 0.13 },
    stats: { eaten: 0, born: 0, starved: 0, old: 0, predGen: 1, predDied: 0 },
    nextId: 1, foodSerial: 1, foodAcc: 0, time: 0, predTimer: 6,
  };

  // --- Av ---
  function addPrey(hue, spd, size, gen, x, y, z, energy) {
    if (P.n >= MAXP) return -1;
    const i = P.n++;
    P.px[i] = x; P.py[i] = y; P.pz[i] = z;
    const a = rnd(0, 6.283);
    P.vx[i] = Math.cos(a) * 0.5; P.vy[i] = 0; P.vz[i] = Math.sin(a) * 0.5;
    P.hue[i] = ((hue % 1) + 1) % 1; P.spd[i] = clamp(spd, 0.6, 5); P.size[i] = clamp(size, 0.5, 1.8);
    P.energy[i] = energy; P.age[i] = 0; P.maxAge[i] = gauss(95, 15);
    P.gen[i] = gen; P.id[i] = w.nextId++; P.flee[i] = 0;
    P.tFood[i] = -1; P.tFoodId[i] = -1; P.retarget[i] = Math.random() * 0.5;
    return i;
  }
  function removePrey(i) {
    const last = --P.n;
    for (const h of H) if (h.active && h.target === i) { h.target = -1; h.state = 0; h.timer = 0.6; }
    if (i !== last) {
      for (const k of ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'hue', 'spd', 'size', 'energy', 'age', 'maxAge', 'gen', 'id', 'flee', 'tFood', 'tFoodId', 'retarget']) P[k][i] = P[k][last];
      for (const h of H) if (h.active && h.target === last) h.target = i;
    }
  }
  w.removePrey = removePrey;

  // --- Yem ---
  function addFood(x, z, y = BOX.y1 + 0.4) {
    if (F.n >= MAXF) return;
    const i = F.n++;
    F.x[i] = x; F.y[i] = y; F.z[i] = z; F.age[i] = 0; F.id[i] = w.foodSerial++; F.ph[i] = Math.random() * 6.28;
  }
  function removeFood(i) {
    const last = --F.n;
    if (i !== last) { F.x[i] = F.x[last]; F.y[i] = F.y[last]; F.z[i] = F.z[last]; F.age[i] = F.age[last]; F.id[i] = F.id[last]; F.ph[i] = F.ph[last]; }
  }
  w.sprinkle = (count = 40) => {
    const cx = rnd(-BOX.x * 0.6, BOX.x * 0.6), cz = rnd(-BOX.z * 0.5, BOX.z * 0.5);
    for (let k = 0; k < count; k++) addFood(clamp(cx + gauss(0, 2), -BOX.x, BOX.x), clamp(cz + gauss(0, 1.5), -BOX.z, BOX.z), BOX.y1 + rnd(0, 1));
  };

  // --- Avcılar ---
  function activatePred(h, spd, gen) {
    h.active = true;
    h.x = rnd(-BOX.x, BOX.x) * 0.8; h.y = rnd(3, 7); h.z = rnd(-BOX.z, BOX.z) * 0.8;
    const a = rnd(0, 6.283);
    h.vx = Math.cos(a); h.vy = 0; h.vz = Math.sin(a);
    h.spd = clamp(spd, 2, 7); h.energy = 3; h.age = 0; h.life = gauss(150, 25); h.catches = 0;
    h.state = 0; h.timer = rnd(0, 2); h.target = -1; h.gen = gen;
  }
  function syncPredators(one = false) {
    const want = w.params.predators;
    let n = 0, added = 0;
    for (const h of H) if (h.active) n++;
    for (const h of H) {
      if (n < want && !h.active && !(one && added)) {
        added++;
        const alive = H.filter((q) => q.active);
        const src = alive.length ? alive[Math.floor(Math.random() * alive.length)] : null;
        activatePred(h, src ? src.spd : 4, src ? src.gen : 1);
        n++;
      } else if (n > want && h.active) { h.active = false; h.target = -1; n--; }
    }
  }
  w.syncPredators = syncPredators;
  function replacePredator(h) {
    // Yeni avcı, yaşayan avcılardan yakaladığı av sayısıyla orantılı seçilen birinin yavrusudur.
    let tot = 0;
    for (const q of H) if (q.active && q !== h) tot += q.catches + 0.5;
    let r = Math.random() * tot, parent = null;
    for (const q of H) if (q.active && q !== h) { r -= q.catches + 0.5; if (r <= 0) { parent = q; break; } }
    const base = parent ? parent.spd : h.spd, gen = (parent ? parent.gen : h.gen) + 1;
    activatePred(h, base + gauss(0, 0.8 * w.params.mutation + 0.02), gen);
    w.stats.predGen = Math.max(w.stats.predGen, gen);
  }

  w.reset = (initial = 150) => {
    P.n = 0; F.n = 0; w.nextId = 1; w.foodAcc = 0; w.time = 0;
    Object.assign(w.stats, { eaten: 0, born: 0, starved: 0, old: 0, predGen: 1, predDied: 0 });
    for (const h of H) h.active = false;
    for (let k = 0; k < initial; k++) {
      addPrey(Math.random(), gauss(2.2, 0.35), gauss(1, 0.12), 1,
        rnd(-BOX.x, BOX.x), rnd(BOX.y0, 4), rnd(-BOX.z, BOX.z), rnd(1.2, 2.6));
      P.age[P.n - 1] = rnd(0, 50);
    }
    for (let k = 0; k < 60; k++) addFood(rnd(-BOX.x, BOX.x), rnd(-BOX.z, BOX.z), rnd(BOX.floor, BOX.y1));
    syncPredators();
  };

  // --- Adım ---
  function stepFood(h) {
    w.foodAcc += w.params.food * h;
    while (w.foodAcc >= 1) { w.foodAcc -= 1; addFood(rnd(-BOX.x, BOX.x), rnd(-BOX.z, BOX.z)); }
    for (let i = F.n - 1; i >= 0; i--) {
      F.age[i] += h;
      if (F.y[i] > BOX.floor + 0.12) {
        F.y[i] -= 0.8 * h;
        F.x[i] += Math.sin(F.age[i] * 2 + F.ph[i]) * 0.2 * h;
      }
      if (F.age[i] > 45) removeFood(i);
    }
  }

  function stepPrey(h) {
    const mut = w.params.mutation, fh = w.params.floorHue;
    for (let i = P.n - 1; i >= 0; i--) {
      const size = P.size[i], spd = P.spd[i];
      P.age[i] += h;
      // Metabolizma: büyük gövde ve güçlü kaçış kasları (hız²) daha çok enerji harcar
      P.energy[i] -= h * (0.006 + 0.016 * size * size + 0.0022 * spd * spd + (P.flee[i] ? 0.03 : 0));
      if (P.energy[i] <= 0) { w.stats.starved++; removePrey(i); continue; }
      if (P.age[i] > P.maxAge[i]) { w.stats.old++; removePrey(i); continue; }
      const x = P.px[i], y = P.py[i], z = P.pz[i];
      let dx = 0, dy = 0, dz = 0, speed = 0.8;
      // 1) Avcıdan kaç
      let fleeing = 0, best = 6.25;
      for (const q of H) {
        if (!q.active) continue;
        const ex = x - q.x, ey = y - q.y, ez = z - q.z, d2 = ex * ex + ey * ey + ez * ez;
        if (d2 < best) { best = d2; const inv = 1 / Math.sqrt(d2 + 1e-4); dx = ex * inv; dy = ey * inv * 0.5; dz = ez * inv; fleeing = 1; }
      }
      if (fleeing) speed = spd;
      else {
        // 2) Yeme yönel (acıkınca)
        if ((P.retarget[i] -= h) <= 0) {
          P.retarget[i] = 0.5 + Math.random() * 0.2;
          let bi = -1, bd = 36;
          if (P.energy[i] < 3.2) {
            for (let f = 0; f < F.n; f++) {
              const fx = F.x[f] - x, fy = F.y[f] - y, fz = F.z[f] - z, d2 = fx * fx + fy * fy + fz * fz;
              if (d2 < bd) { bd = d2; bi = f; }
            }
          }
          P.tFood[i] = bi; P.tFoodId[i] = bi >= 0 ? F.id[bi] : -1;
        }
        const f = P.tFood[i];
        if (f >= 0 && f < F.n && F.id[f] === P.tFoodId[i]) {
          const fx = F.x[f] - x, fy = F.y[f] - y, fz = F.z[f] - z, d2 = fx * fx + fy * fy + fz * fz;
          const r = 0.3 + 0.15 * size;
          if (d2 < r * r) {
            P.energy[i] = Math.min(P.energy[i] + 1, 4.5);
            removeFood(f); P.tFood[i] = -1; P.retarget[i] = 0;
          } else {
            const inv = 1 / Math.sqrt(d2); dx = fx * inv; dy = fy * inv; dz = fz * inv; speed = 1.4;
          }
        } else {
          // 3) Dolaş
          const vl = Math.hypot(P.vx[i], P.vy[i], P.vz[i]) + 1e-4;
          dx = P.vx[i] / vl + rnd(-0.6, 0.6); dy = P.vy[i] / vl * 0.5 + rnd(-0.3, 0.3) - (y - 2.2) * 0.05; dz = P.vz[i] / vl + rnd(-0.6, 0.6);
        }
      }
      P.flee[i] = fleeing;
      // Duvarlardan uzak dur
      if (x > BOX.x - 1) dx -= (x - BOX.x + 1) * 1.5; else if (x < -BOX.x + 1) dx += (-BOX.x + 1 - x) * 1.5;
      if (z > BOX.z - 1) dz -= (z - BOX.z + 1) * 1.5; else if (z < -BOX.z + 1) dz += (-BOX.z + 1 - z) * 1.5;
      if (y < BOX.y0 + 0.3) dy += 0.6; else if (y > BOX.y1 - 0.5) dy -= 0.6;
      const dl = Math.hypot(dx, dy, dz) + 1e-6, k = Math.min(1, (fleeing ? 6 : 3) * h);
      P.vx[i] += (dx / dl * speed - P.vx[i]) * k;
      P.vy[i] += (dy / dl * speed - P.vy[i]) * k;
      P.vz[i] += (dz / dl * speed - P.vz[i]) * k;
      P.px[i] = clamp(x + P.vx[i] * h, -BOX.x, BOX.x);
      P.py[i] = clamp(y + P.vy[i] * h, BOX.y0, BOX.y1);
      P.pz[i] = clamp(z + P.vz[i] * h, -BOX.z, BOX.z);
      // Üreme: yeterli enerji → mutasyonlu yavru
      if (P.energy[i] >= 3 && P.age[i] > 6 && P.n < MAXP) {
        P.energy[i] -= 1.8;
        const c = addPrey(P.hue[i] + gauss(0, mut), P.spd[i] + gauss(0, mut * 3), P.size[i] + gauss(0, mut * 1.2),
          P.gen[i] + 1, P.px[i] + rnd(-0.3, 0.3), P.py[i], P.pz[i] + rnd(-0.3, 0.3), 1.2);
        if (c >= 0) w.stats.born++;
      }
    }
    void fh;
  }

  function stepPred(h) {
    const fh = w.params.floorHue;
    for (const q of H) {
      if (!q.active) continue;
      q.age += h;
      q.energy -= h * (0.03 + 0.0025 * q.spd * q.spd);
      if (q.energy <= 0 || q.age > q.life) {
        // Av azsa ölen avcının yerine yenisi gelmez (avcılar da besine bağlıdır)
        if (P.n > 30) replacePredator(q); else { q.active = false; q.target = -1; w.stats.predDied++; }
        continue;
      }
      let dx, dy, dz, speed;
      if (q.state === 1 && q.target >= 0) {
        // Kovala
        const t = q.target;
        const ex = P.px[t] - q.x, ey = P.py[t] - q.y, ez = P.pz[t] - q.z, d2 = ex * ex + ey * ey + ez * ez;
        q.timer -= h;
        const reach = 0.7 + 0.25 * P.size[t];
        if (d2 < reach * reach) {
          // Ağız genişliği sınırı: büyük avı yutmak zor
          const grown = P.size[t] * Math.min(1, 0.5 + P.age[t] / 20);
          if (Math.random() < clamp(1.25 - 0.3 * grown, 0.4, 0.95)) {
            removePrey(t); w.stats.eaten++;
            q.catches++; q.energy = Math.min(q.energy + 1.2, 6);
            q.state = 2; q.timer = 1.5; q.target = -1;
          } else { q.state = 0; q.timer = 1.2; q.target = -1; }
          continue;
        }
        if (q.timer <= 0 || d2 > 90) { q.state = 0; q.timer = 0.8; q.target = -1; continue; }
        const inv = 1 / Math.sqrt(d2); dx = ex * inv; dy = ey * inv; dz = ez * inv; speed = q.spd * 1.15;
      } else {
        if (q.state === 1) q.state = 0;
        q.timer -= h;
        if (q.state === 2 && q.timer <= 0) { q.state = 0; q.timer = 0.3; }
        if (q.state === 0 && q.timer <= 0) {
          // Tara: her av için görülme olasılığı zeminle renk karşıtlığına ve boyuta bağlı
          q.timer = 0.3;
          let bi = -1, bd = 1e9;
          for (let i = 0; i < P.n; i++) {
            const ex = P.px[i] - q.x, ey = P.py[i] - q.y, ez = P.pz[i] - q.z, d2 = ex * ex + ey * ey + ez * ez;
            if (d2 > 49 || d2 >= bd) continue;
            const c = hueDiff(P.hue[i], fh);
            const vis = (0.03 + c * c * 1.6 + c * 0.4) * P.size[i] * P.size[i] * (P.flee[i] ? 1.3 : 1);
            if (Math.random() < 1 - Math.exp(-0.5 * vis)) { bd = d2; bi = i; }
          }
          if (bi >= 0) { q.state = 1; q.target = bi; q.timer = 5; }
        }
        const vl = Math.hypot(q.vx, q.vy, q.vz) + 1e-4;
        dx = q.vx / vl + rnd(-0.3, 0.3); dy = q.vy / vl * 0.4 + rnd(-0.15, 0.15) - (q.y - 4) * 0.04; dz = q.vz / vl + rnd(-0.3, 0.3);
        speed = q.state === 2 ? 0.7 : 1.3;
      }
      if (q.x > BOX.x - 1.5) dx -= 1.2; else if (q.x < -BOX.x + 1.5) dx += 1.2;
      if (q.z > BOX.z - 1.5) dz -= 1.2; else if (q.z < -BOX.z + 1.5) dz += 1.2;
      if (q.y < BOX.y0 + 0.6) dy += 0.5; else if (q.y > BOX.y1 - 0.8) dy -= 0.5;
      const dl = Math.hypot(dx, dy, dz) + 1e-6, k = Math.min(1, (q.state === 1 ? 7 : 3.5) * h);
      q.vx += (dx / dl * speed - q.vx) * k; q.vy += (dy / dl * speed - q.vy) * k; q.vz += (dz / dl * speed - q.vz) * k;
      q.x = clamp(q.x + q.vx * h, -BOX.x, BOX.x); q.y = clamp(q.y + q.vy * h, BOX.y0 + 0.3, BOX.y1); q.z = clamp(q.z + q.vz * h, -BOX.z, BOX.z);
    }
  }

  w.step = (dt) => {
    const n = Math.min(10, Math.ceil(dt / 0.1));
    const h = dt / n;
    for (let s = 0; s < n; s++) {
      w.time += h;
      stepFood(h);
      stepPrey(h);
      stepPred(h);
      // Av bolsa eksik avcılar zamanla geri gelir
      if ((w.predTimer -= h) <= 0) { w.predTimer = 6; if (P.n > 40) syncPredators(true); }
    }
  };

  /** Özet istatistikler (tahsis yapmadan, önceden verilen nesneye yazar). */
  w.summary = (out) => {
    const n = P.n;
    let sx = 0, sy = 0, sp = 0, sz = 0, sg = 0, dh = 0;
    for (let i = 0; i < n; i++) {
      const a = P.hue[i] * 6.283185307;
      sx += Math.cos(a); sy += Math.sin(a);
      sp += P.spd[i]; sz += P.size[i]; sg += P.gen[i];
      dh += hueDiff(P.hue[i], w.params.floorHue);
    }
    let hs = 0, hn = 0;
    for (const q of H) if (q.active) { hs += q.spd; hn++; }
    out.n = n;
    out.meanHue = n ? (((Math.atan2(sy, sx) / 6.283185307) % 1) + 1) % 1 : 0;
    out.hueSpread = n ? 1 - Math.hypot(sx, sy) / n : 0;
    out.speed = n ? sp / n : 0;
    out.size = n ? sz / n : 0;
    out.gen = n ? sg / n : 0;
    out.diffDeg = n ? (dh / n) * 180 : 0;
    out.predSpeed = hn ? hs / hn : 0;
    out.preds = hn;
    return out;
  };
  return w;
}
