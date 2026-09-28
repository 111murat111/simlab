// Arı kolonisi nüfus modeli (günlük adım): yaş yapılı yavru, kovan/tarlacı arılar, bal-polen, varroa.
export const YEAR = 360;
export const SEASONS = [
  { name: 'İlkbahar', emoji: '🌸' }, { name: 'Yaz', emoji: '☀️' }, { name: 'Sonbahar', emoji: '🍂' }, { name: 'Kış', emoji: '❄️' },
];
export const seasonOf = (day) => Math.floor((day % YEAR) / 90);

const ramp = (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a)));

/** Çiçeklenme 0..1 (yılın gününe göre). */
export function bloom(day) {
  const d = day % YEAR;
  if (d < 90) return 0.25 + 0.75 * ramp(d, 0, 55);
  if (d < 180) return 1 - 0.45 * ramp(d, 110, 175);
  if (d < 270) return 0.55 * (1 - ramp(d, 180, 245));
  return 0;
}
/** Günlük ortalama sıcaklık (°C, temsili). */
export function temperature(day) {
  const d = day % YEAR;
  return 15 - 11 * Math.cos((2 * Math.PI * (d - 320)) / YEAR); // ≈ 4 °C ocak, ≈ 26 °C temmuz
}
/** Kraliçenin mevsimsel yumurtlama isteği 0..1. */
function layingSeason(day) {
  const d = day % YEAR;
  if (d < 60) return 0.3 + 0.7 * ramp(d, 0, 60);
  if (d < 140) return 1;
  if (d < 230) return 1 - 0.95 * ramp(d, 140, 230);
  if (d < 330) return 0.02;
  return 0.02 + 0.2 * ramp(d, 330, 360);
}

export function createColony() {
  return {
    day: 0, hive: 9000, foragers: 3000,
    brood: new Float64Array(21).fill(120), // 0-2 yumurta, 3-8 larva, 9-20 kapalı yavru
    honey: 7, pollen: 0.6, mites: 0,
    rain: false, forageToday: 0, dead: false, cause: '', winters: 0, harvested: 0,
  };
}

export function eggs(c) { return c.brood[0] + c.brood[1] + c.brood[2]; }
export function larvae(c) { let s = 0; for (let i = 3; i < 9; i++) s += c.brood[i]; return s; }
export function capped(c) { let s = 0; for (let i = 9; i < 21; i++) s += c.brood[i]; return s; }
export function broodTotal(c) { return c.brood.reduce((s, v) => s + v, 0); }
export function adults(c) { return c.hive + c.foragers; }

/**
 * Bir gün ilerlet. o: { flowers, rainChance, pesticide, varroa, rng }
 */
export function stepDay(c, o) {
  if (c.dead) return;
  const d = c.day % YEAR;
  const T = temperature(c.day);
  const bl = bloom(c.day);
  const A = adults(c);
  c.rain = o.rng() < o.rainChance && T > 4;
  const canFly = T > 8 && !c.rain;
  const winter = d >= 270 || d < 5;

  // Yiyecek toplama
  const flowerF = o.flowers / (o.flowers + 90) * 1.5;
  const eff = (o.pesticide ? 0.75 : 1);
  const trip = canFly ? bl * flowerF * eff : 0;
  c.forageToday = trip;
  // Çiçek başına sınırlı nektar: tarlacı sayısı arttıkça getiri doyar
  const sat = c.foragers / (c.foragers + o.flowers * 100);
  const honeyIn = 0.032 * o.flowers * sat * trip / flowerF;   // kg bal / gün
  const pollenIn = 0.008 * o.flowers * sat * trip / flowerF; // kg polen / gün

  // Tüketim
  const L = larvae(c);
  const honeyUse = A * 0.000010 * (winter ? 0.9 : 1.2) + L * 0.000006;
  const pollenUse = L * 0.000025 + (winter ? 0 : A * 0.0000012);
  c.honey = Math.max(0, c.honey + honeyIn - honeyUse);
  const pollenOk = Math.min(1, (c.pollen + pollenIn) / Math.max(1e-6, pollenUse));
  c.pollen = Math.max(0, c.pollen + pollenIn - pollenUse);

  // Yavru gelişimi (21 gün)
  const emerging = c.brood[20];
  for (let i = 20; i > 0; i--) c.brood[i] = c.brood[i - 1];
  // Larvalar yeterli polen yoksa kaybolur
  if (pollenOk < 1) for (let i = 3; i < 9; i++) c.brood[i] *= 0.7 + 0.3 * pollenOk;
  // Kraliçe yumurtlar: bakıcı arı, bal ve polen sınırlar
  const nurseF = Math.min(1, c.hive / Math.max(1, broodTotal(c) * 0.6 + 1));
  const foodF = Math.min(1, c.honey / 1.5) * (0.3 + 0.7 * Math.min(1, c.pollen / 0.2 + pollenIn * 5));
  c.brood[0] = 1900 * layingSeason(c.day) * nurseF * foodF;

  // Varroa: kapalı yavruda çoğalır
  let mitePenalty = 0;
  if (o.varroa) {
    if (c.mites < 1) c.mites = 60;
    const broodShare = capped(c) / Math.max(1, capped(c) + A);
    c.mites *= 1 + 0.028 * Math.min(1, broodShare * 3) - 0.004;
    c.mites = Math.min(c.mites, A * 0.6 + 50);
    const load = c.mites / Math.max(1, A);
    mitePenalty = load * (winter ? 0.12 : 0.06);         // virüs taşıyan akarlar ömrü kısaltır
    for (let i = 9; i < 21; i++) c.brood[i] *= 1 - Math.min(0.02, load * 0.02);
  } else c.mites = 0;

  // Ölüm
  const pest = o.pesticide && canFly && bl > 0.05 ? 0.018 : 0;
  const mF = (winter ? 0.02 : 0.038) + pest + mitePenalty;
  const mH = (winter || d > 210 ? 0.0045 : 0.02) + mitePenalty * 0.8 + (c.honey <= 0 ? 0.12 : 0);
  c.foragers *= 1 - Math.min(0.9, mF + (c.honey <= 0 ? 0.12 : 0));
  c.hive *= 1 - Math.min(0.9, mH);
  // Soğukta küçük salkım ısınamaz
  if (winter && T < 6 && A < 4000) c.hive *= 0.97;

  // Yeni arılar ve görev değişimi
  c.hive += emerging;
  const target = winter || !canFly && d > 250 ? 0 : 0.34 * (c.hive + c.foragers);
  const move = (target - c.foragers) * 0.08;
  if (move > 0) { const m = Math.min(move, c.hive); c.hive -= m; c.foragers += m; }
  else if (winter) { c.hive += c.foragers * 0.1; c.foragers *= 0.9; }

  c.day++;
  // Sonuç kontrolü
  const a = adults(c);
  if (a < 800) { c.dead = true; c.cause = c.honey <= 0 ? 'Bal bitti, arılar açlıktan öldü.' : c.mites > a * 0.1 ? 'Varroa akarları koloniyi zayıflattı.' : 'Arı sayısı çok azaldı; salkım ısınamadı.'; }
  if (c.day % YEAR === 0) c.winters++;
}

export function harvest(c, frac) {
  const keep = Math.max(0, c.honey * (1 - frac));
  const taken = c.honey - keep;
  c.honey = keep;
  c.harvested += taken;
  return taken;
}
