// Salgın Haritası modeli: ajan tabanlı S-I-R + aşılı (V), hane / işyeri / okul / çarşı temasları (THREE'den bağımsız).

export const S = 0, I = 1, R = 2, V = 3;
export const TICKS = 12; // günde 12 adım (2 saat)
export const PLACE_KEYS = ['okul', 'ofis', 'carsi', 'fabrika', 'hastane'];
const OKUL = 0, OFIS = 1, CARSI = 2, FABRIKA = 3, HASTANE = 4;
const HOME_RATE = 0.4;      // evde, 2 saatte ortalama hane içi temas
const SEVERE = [0.005, 0.03, 0.15]; // çocuk / yetişkin / yaşlı ağır seyir olasılığı (model varsayımı)
const SYMPTOMATIC = 0.65;   // belirti gösterenlerin oranı (kalanı belirtisiz)
const MASK_SRC = 0.5, MASK_RCV = 0.3; // maske: takan hastadan / takan sağlıklıya bulaşmayı azaltma (varsayım)

export function createModel({ buildings = 60, perBuilding = 20, hhSize = 4 } = {}) {
  const N = buildings * perBuilding;
  const H = Math.ceil(N / hhSize);
  const P0 = H;               // yer kimlikleri: 0..H-1 haneler, sonra 5 mekân, sonra hastane koğuşu
  const WARD = H + 5;
  const nLoc = H + 6;

  const age = new Uint8Array(N), hh = new Int32Array(N), bld = new Int32Array(N), work = new Int8Array(N);
  const state = new Uint8Array(N), tInf = new Float32Array(N), dur = new Float32Array(N);
  const severe = new Uint8Array(N), symp = new Uint8Array(N), hosp = new Uint8Array(N);
  const maskU = new Float32Array(N), mobU = new Float32Array(N), vacU = new Float32Array(N), shopU = new Float32Array(N);
  const loc = new Int32Array(N), sec = new Uint16Array(N), wasV = new Uint8Array(N);
  const cnt = new Int32Array(nLoc + 1), start = new Int32Array(nLoc + 1), occ = new Int32Array(N);
  const newInf = new Int32Array(N);

  const p = {
    vacc: 0, ve: 0.8, mask: 0, mobility: 1, contacts: 8, beta: 0.04, duration: 8, capacity: 8,
    quarantine: false, schoolsClosed: false,
  };

  const m = {
    N, H, P0, WARD, nLoc, p,
    age, hh, bld, work, state, loc, hosp, symp,
    day: 0, hour: 0, now: 0,
    counts: [0, 0, 0, 0], hospCount: 0, unmet: 0,
    newToday: 0, totalInf: 0, peak: 0, peakDay: 0, overDays: 0, maxHosp: 0,
    incid: [], rt: NaN, ended: false,
    placeCount: new Int32Array(6),
  };

  function reset(seedCount = 4) {
    for (let i = 0; i < N; i++) {
      const r = Math.random();
      age[i] = r < 0.25 ? 0 : r < 0.83 ? 1 : 2;
      bld[i] = Math.floor(i / perBuilding);
      hh[i] = Math.floor(i / hhSize);
      if (age[i] === 1) {
        const w = Math.random();
        work[i] = w < 0.35 ? OFIS : w < 0.7 ? FABRIKA : w < 0.8 ? CARSI : w < 0.88 ? HASTANE : OKUL;
      } else work[i] = -1;
      state[i] = S; tInf[i] = 0; dur[i] = 0; severe[i] = 0; symp[i] = 0; hosp[i] = 0; sec[i] = 0; wasV[i] = 0;
      maskU[i] = Math.random(); mobU[i] = Math.random(); vacU[i] = Math.random(); shopU[i] = Math.random();
      loc[i] = hh[i];
    }
    Object.assign(m, { day: 0, hour: 4, now: 4 / TICKS, hospCount: 0, unmet: 0, newToday: 0, totalInf: 0,
      peak: 0, peakDay: 0, overDays: 0, maxHosp: 0, rt: NaN, ended: false });
    m.incid.length = 0;
    applyVaccination();
    seed(seedCount);
    assign();
    count();
  }

  /** Aşı oranı değişince: vacU < oran olan hassaslar aşılanır, üstündekiler aşısız kalır. */
  function applyVaccination() {
    for (let i = 0; i < N; i++) {
      if (state[i] === S && vacU[i] < p.vacc) state[i] = V;
      else if (state[i] === V && vacU[i] >= p.vacc) state[i] = S;
    }
    count();
  }

  function infect(i) {
    wasV[i] = state[i] === V ? 1 : 0;
    state[i] = I;
    tInf[i] = m.now;
    dur[i] = Math.max(2, p.duration * (0.75 + Math.random() * 0.5));
    const sev = SEVERE[age[i]] * (wasV[i] ? 0.3 : 1);
    severe[i] = Math.random() < sev ? 1 : 0;
    symp[i] = severe[i] || Math.random() < SYMPTOMATIC ? 1 : 0;
    hosp[i] = 0; sec[i] = 0;
    m.newToday++; m.totalInf++;
    m.ended = false;
  }

  /** Rastgele n hassas (yoksa aşılı) kişiyi enfekte eder; bina verilirse yalnız oradan. */
  function seed(n, building = -1) {
    let done = 0;
    for (let tries = 0; tries < 4000 && done < n; tries++) {
      const i = building >= 0 ? building * perBuilding + Math.floor(Math.random() * perBuilding) : Math.floor(Math.random() * N);
      if (state[i] === S || (tries > 2000 && state[i] === V)) { infect(i); done++; }
    }
    count();
    return done;
  }

  const isolating = (i) => p.quarantine && state[i] === I && symp[i] && m.now - tInf[i] >= 1.5;

  function desired(i, h) {
    if (hosp[i]) return WARD;
    const home = hh[i];
    if (isolating(i)) return home;
    const hr = h * 2;
    if (hr < 8 || hr >= 20) return home;
    if (hr <= 16) {
      if (age[i] === 0) return p.schoolsClosed ? home : P0 + OKUL;
      if (age[i] === 1) {
        if (work[i] === OKUL && p.schoolsClosed) return home;
        return mobU[i] < p.mobility ? P0 + work[i] : home;
      }
      // yaşlılar: öğle saatlerinde bir kısmı çarşıya çıkar
      return hr >= 10 && hr <= 12 && mobU[i] < p.mobility * 0.5 ? P0 + CARSI : home;
    }
    // akşam 18:00 alışverişi: her gün farklı kişiler
    const u = (shopU[i] + m.day * 0.618034) % 1;
    return u < 0.25 * p.mobility && age[i] !== 0 ? P0 + CARSI : home;
  }

  function assign() {
    const h = m.hour;
    cnt.fill(0);
    for (let i = 0; i < N; i++) { const l = desired(i, h); loc[i] = l; cnt[l]++; }
    let s = 0;
    for (let l = 0; l < nLoc; l++) { start[l] = s; s += cnt[l]; cnt[l] = start[l]; }
    start[nLoc] = s;
    for (let i = 0; i < N; i++) occ[cnt[loc[i]]++] = i;
    for (let k = 0; k < 6; k++) m.placeCount[k] = start[P0 + k + 1] - start[P0 + k];
  }

  function poisson(l) {
    if (l <= 0) return 0;
    const L = Math.exp(-l);
    let k = 0, q = 1;
    do { k++; q *= Math.random(); } while (q > L && k < 60);
    return k - 1;
  }

  function transmit() {
    let nNew = 0;
    const outRate = p.contacts / 6; // gündüz 5 + akşam 1 dış adım
    for (let i = 0; i < N; i++) {
      if (state[i] !== I || hosp[i] || tInf[i] >= m.now) continue;
      const l = loc[i];
      const home = l < P0;
      if (l === WARD) continue;
      const rate = home ? HOME_RATE * (isolating(i) ? 0.5 : 1) : outRate;
      const n = poisson(rate);
      const a = start[l], len = start[l + 1] - a;
      if (len < 2) continue;
      for (let k = 0; k < n; k++) {
        const j = occ[a + Math.floor(Math.random() * len)];
        if (j === i) continue;
        const sj = state[j];
        if (sj !== S && sj !== V) continue;
        let pr = p.beta;
        if (sj === V) pr *= 1 - p.ve;
        if (!home) {
          if (maskU[i] < p.mask) pr *= 1 - MASK_SRC;
          if (maskU[j] < p.mask) pr *= 1 - MASK_RCV;
        }
        if (Math.random() < pr) { newInf[nNew++] = j; sec[i]++; state[j] = 255; } // aynı adımda çift sayma olmasın
      }
    }
    for (let k = 0; k < nNew; k++) {
      const j = newInf[k];
      state[j] = vacU[j] < p.vacc ? V : S; // infect() eski durumu okusun
      infect(j);
    }
  }

  function progress() {
    for (let i = 0; i < N; i++) {
      if (state[i] !== I) continue;
      const d = m.now - tInf[i];
      if (d >= dur[i] + (severe[i] ? 3 : 0)) {
        state[i] = R;
        if (hosp[i]) { hosp[i] = 0; m.hospCount--; }
        continue;
      }
      if (severe[i] && !hosp[i] && d >= 3 && m.hospCount < p.capacity) { hosp[i] = 1; m.hospCount++; }
    }
    // yatak bulamayan ağır hastalar
    let un = 0;
    for (let i = 0; i < N; i++) if (state[i] === I && severe[i] && !hosp[i] && m.now - tInf[i] >= 3) un++;
    m.unmet = un;
  }

  function count() {
    const c = m.counts;
    c[0] = c[1] = c[2] = c[3] = 0;
    for (let i = 0; i < N; i++) if (state[i] < 4) c[state[i]]++;
  }

  /** Bir zaman adımı (2 saat). Gün bittiyse true döner. */
  function tick() {
    if (m.ended) return false;
    assign();
    transmit();
    progress();
    m.hour++;
    let dayEnd = false;
    if (m.hour >= TICKS) {
      m.hour = 0; m.day++; dayEnd = true;
      m.incid.push(m.newToday);
      m.newToday = 0;
    }
    m.now = m.day + m.hour / TICKS;
    count();
    if (dayEnd) daily();
    return dayEnd;
  }

  function daily() {
    const inf = m.counts[I];
    if (inf > m.peak) { m.peak = inf; m.peakDay = m.day; }
    if (m.unmet > 0) m.overDays++;
    m.maxHosp = Math.max(m.maxHosp, m.hospCount + m.unmet);
    // Efektif R ≈ günlük yeni vaka × ortalama bulaştırıcılık süresi / anlık vaka (son 3 gün ortalaması)
    const k = m.incid.length;
    if (inf >= 5 && k >= 3) {
      const inc = (m.incid[k - 1] + m.incid[k - 2] + m.incid[k - 3]) / 3;
      m.rt = (inc * p.duration) / inf;
    } else m.rt = inf === 0 ? 0 : NaN;
    if (inf === 0) m.ended = true;
  }

  function buildingInfected(out) {
    out.fill(0);
    for (let i = 0; i < N; i++) if (state[i] === I) out[bld[i]]++;
  }

  Object.assign(m, { reset, tick, seed, applyVaccination, buildingInfected, isolating, perBuilding, buildings, sec });
  return m;
}
