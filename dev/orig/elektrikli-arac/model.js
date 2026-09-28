// Elektrikli araç fiziği: yol yükleri (aerodinamik, yuvarlanma, eğim, ivme), rejeneratif fren, iklimlendirme,
// CC-CV şarj eğrisi ve mahalle akşam yükü (kontrolsüz / zamanlayıcı / akıllı şarj).

const G = 9.81;
export const ETA_DRIVE = 0.88; // batarya → tekerlek (evirici + motor + aktarma), temsilî
export const ETA_REGEN = 0.7; // tekerlek → batarya geri kazanım, temsilî
export const REGEN_MAX = 60e3; // W
export const AUX = 250; // W (elektronik, pompalar, ekranlar)
export const ETA_AC = 0.9, ETA_DC = 0.95;

export const CARS = {
  kucuk: { name: 'Küçük şehir aracı', m: 1350, Cd: 0.31, A: 2.1, Crr: 0.009, bat: 40, color: 0x22c55e },
  kompakt: { name: 'Kompakt', m: 1750, Cd: 0.27, A: 2.3, Crr: 0.0085, bat: 60, color: 0x38bdf8 },
  suv: { name: 'SUV', m: 2350, Cd: 0.30, A: 2.8, Crr: 0.0095, bat: 85, color: 0xe2e8f0 },
};

export const airRho = (T) => 101325 / (287.05 * (T + 273.15));

/** İklimlendirme elektrik gücü (W): kabin 21 °C'de; UA ≈ 100 W/K, güneş yükü, ısı pompası COP'u sıcaklıkla düşer. */
export function hvacPower(T, { on = true, heatPump = false } = {}) {
  if (!on) return 0;
  const UA = 100, target = 21;
  if (T < 17) {
    const q = UA * (target - T);
    const cop = heatPump ? Math.min(3.5, Math.max(1.3, 1.3 + 0.05 * (T + 15))) : 1;
    return q / cop + 150; // + fan
  }
  if (T > 24) {
    const q = UA * (T - target) + 600; // + güneş ışınımı
    return q / 2.5 + 150;
  }
  return 200; // yalnız havalandırma
}

/** Kullanılabilir batarya kapasitesi çarpanı (soğukta kimyasal tepkimeler yavaşlar) — temsilî. */
export const coldCapacity = (T) => 1 - 0.004 * Math.max(0, 15 - T);

/**
 * Bir sürüş döngüsünü sayısal tümleyip 100 km başına enerji ve kalem kalem dağılımı verir.
 * o: { car, v (km/h), city (bool), T, hvacOn, heatPump, regen, hills (bool) }
 */
export function consumption(o) {
  const c = o.car, vmax = o.v / 3.6, rho = airRho(o.T);
  const me = c.m * 1.05; // dönen kütleler
  const dt = 0.1;
  const L = 2000; // döngü uzunluğu (m); tepeli yolda eğim bu dalga boyunda
  const block = 400; // şehirde her 400 m'de bir duruş
  const aAcc = 1.5, aDec = 2.0, wait = 20;
  const grade = (s) => (o.hills ? 0.04 * Math.sin((2 * Math.PI * s) / L) : 0);
  let s = 0, v = o.city ? 0 : vmax, t = 0, waitT = 0;
  const e = { aero: 0, roll: 0, motorLoss: 0, brake: 0, hvac: 0, aux: 0 };
  let batt = 0, regenE = 0;
  const Phvac = hvacPower(o.T, { on: o.hvacOn, heatPump: o.heatPump });
  while (s < L && t < 3600) {
    let a = 0;
    if (o.city) {
      const inBlock = s % block, toStop = block - inBlock;
      if (waitT > 0) { waitT -= dt; a = 0; v = 0; }
      else if (v * v / (2 * aDec) >= toStop - 0.5 && v > 0.05) a = -Math.min(aDec * 1.5, (v * v) / (2 * Math.max(toStop, 0.3)));
      else if (v < vmax) a = Math.min(aAcc, (vmax - v) / dt);
    }
    const vNew = Math.max(0, v + a * dt);
    if (o.city && v > 0.05 && vNew <= 0.05 && waitT <= 0) { waitT = wait; s = Math.ceil(s / block) * block + 0.01; }
    const vm = (v + vNew) / 2;
    const th = Math.atan(grade(s));
    const Fa = 0.5 * rho * c.Cd * c.A * vm * vm;
    const Fr = c.Crr * c.m * G * Math.cos(th);
    const Fg = c.m * G * Math.sin(th);
    const Fi = me * ((vNew - v) / dt);
    const P = (Fa + Fr + Fg + Fi) * vm;
    e.aero += Fa * vm * dt; e.roll += Fr * vm * dt;
    if (P >= 0) { batt += (P / ETA_DRIVE) * dt; e.motorLoss += P * (1 / ETA_DRIVE - 1) * dt; }
    else {
      const Pr = o.regen ? Math.min(-P, REGEN_MAX) : 0;
      batt -= Pr * ETA_REGEN * dt; regenE += Pr * ETA_REGEN * dt;
      e.brake += (-P - Pr * ETA_REGEN) * dt;
    }
    e.hvac += Phvac * dt; e.aux += AUX * dt;
    s += vm * dt; v = vNew; t += dt;
  }
  batt += (Phvac + AUX) * t;
  const k = 100000 / s / 3.6e6; // J/döngü → kWh/100 km
  const parts = {};
  for (const key in e) parts[key] = e[key] * k;
  // Kapalı döngüde kinetik+potansiyel enerji başa döner; küçük sayısal farkı "fren" kalemine kat
  const sum = Object.values(parts).reduce((x, y) => x + y, 0);
  const total = batt * k;
  parts.brake = Math.max(0, parts.brake + (total - sum));
  return { per100: total, parts, avgSpeed: (s / t) * 3.6, regen: regenE * k, hvacW: Phvac };
}

// --- Şarj ---
// Bataryanın kabul edebildiği güç (C-oranı) doluluk durumuna göre: sabit akım, sonra sabit gerilim (azalan) — temsilî eğri
const ACC = [[0, 1.5], [0.1, 2.0], [0.5, 2.0], [0.8, 1.0], [0.9, 0.45], [1.0, 0.08]];
function accept(soc) {
  for (let i = 1; i < ACC.length; i++) {
    if (soc <= ACC[i][0]) {
      const [s0, c0] = ACC[i - 1], [s1, c1] = ACC[i];
      return c0 + ((c1 - c0) * (soc - s0)) / (s1 - s0);
    }
  }
  return ACC[ACC.length - 1][1];
}
/** Soğuk bataryada kabul edilen güç düşer (ön ısıtma yoksa) — temsilî. */
export const coldCharge = (T, precond) => (precond || T >= 15 ? 1 : Math.max(0.25, 1 - 0.035 * (15 - T)));

/** Şebekeden çekilen güç (kW) — şarj cihazı sınırı ile bataryanın kabulünün küçüğü. */
export function chargePower(soc, cap, charger, T, precond) {
  const batt = accept(soc) * cap * coldCharge(T, precond); // kW (bataryaya giren)
  const eta = charger.dc ? ETA_DC : ETA_AC;
  const toBatt = Math.min(charger.kw * eta, batt);
  return { grid: toBatt / eta, batt: toBatt };
}

/** s0 → s1 doluluk için süre (saat). */
export function chargeTime(s0, s1, cap, charger, T, precond) {
  const ds = 0.002;
  let h = 0;
  for (let s = s0; s < s1; s += ds) h += (ds * cap) / chargePower(s + ds / 2, cap, charger, T, precond).batt;
  return h;
}

// --- Mahalle yükü ---
// Temsilî hane yük profili (kW, saat başı, 00:00'dan): akşam zirvesi 19–21
export const HOUSE = [0.32, 0.28, 0.26, 0.25, 0.25, 0.28, 0.38, 0.52, 0.48, 0.4, 0.38, 0.4, 0.43, 0.41, 0.4, 0.43, 0.52, 0.7, 0.9, 1.0, 0.95, 0.8, 0.6, 0.42];
export const STEP = 0.25; // saat
export const T0 = 12; // grafik 12:00'de başlar, 24 saat
const NS = 24 / STEP;
export const houseLoad = (h) => {
  const x = ((h % 24) + 24) % 24, i = Math.floor(x), f = x - i;
  return HOUSE[i] * (1 - f) + HOUSE[(i + 1) % 24] * f;
};

/** Mahalle yükü: evs = [{arrive (saat, 12..36), kwh (şebekeden)}], mode: 'hemen' | 'zaman' | 'akilli' */
export function neighbourhood(nHouses, evs, kw, mode, depart = 31) {
  const base = new Float64Array(NS), ev = new Float64Array(NS);
  for (let i = 0; i < NS; i++) base[i] = nHouses * houseLoad(T0 + (i + 0.5) * STEP);
  const per = evs.map(() => new Float64Array(NS));
  const order = evs.map((_, i) => i).sort((a, b) => evs[a].arrive - evs[b].arrive);
  for (const j of order) {
    const car = evs[j];
    let left = car.kwh;
    const start = mode === 'zaman' ? Math.max(car.arrive, 23 + car.jitter) : car.arrive;
    const i0 = Math.max(0, Math.ceil((start - T0) / STEP - 1e-9));
    if (mode === 'akilli') {
      // Vadi doldurma: en düşük toplam yüklü dilimlere sırayla dağıt (kalkıştan önce bitmeli)
      const i1 = Math.min(NS, Math.floor((depart - T0) / STEP));
      const slots = [];
      for (let i = i0; i < i1; i++) slots.push(i);
      while (left > 1e-6 && slots.length) {
        let best = -1, bl = Infinity;
        for (const i of slots) {
          if (per[j][i] >= kw * STEP - 1e-9) continue;
          const l = base[i] + ev[i];
          if (l < bl) { bl = l; best = i; }
        }
        if (best < 0) break;
        const add = Math.min(left, kw * STEP - per[j][best], 0.25 * kw * STEP);
        per[j][best] += add; ev[best] += add / STEP; left -= add;
      }
    }
    for (let i = i0; i < NS && left > 1e-6; i++) {
      const add = Math.min(left, kw * STEP - per[j][i]);
      if (add <= 0) continue;
      per[j][i] += add; ev[i] += add / STEP; left -= add;
    }
  }
  // per[j][i] kWh → şarj ediyor mu (görsel için)
  const charging = per.map((p) => Array.from(p, (x) => x > 1e-6));
  return { base, ev, charging, NS };
}
