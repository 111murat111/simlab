// Roket fiziği (saf, 2B yörünge düzlemi): Tsiolkovsky kütle akışı, 1/r² yerçekimi, irtifayla azalan sürükleme.
// Ölçekli gezegen: yarıçap Dünya'nın 1/10'u, yüzey yerçekimi aynı (9,81 m/s²).
export const R = 637100;            // m
export const G0 = 9.81;             // m/s²
export const MU = G0 * R * R;       // m³/s²
export const H_SCALE = 6000;        // atmosfer ölçek yüksekliği (m)
export const RHO0 = 1.225;          // kg/m³
export const ATM = 60000;           // atmosfer "kenarı" (m)
export const CDA = 1.2;             // Cd·A (m²)
export const PAYLOAD = 1000;        // kg
export const V_ORBIT_LOW = Math.sqrt(MU / (R + 80000));

/** Tasarım: yakıt (kg), itki (N), kademe sayısı */
export function design(fuel, thrust, stages) {
  if (stages === 2) {
    const f1 = fuel * 0.72, f2 = fuel * 0.28;
    return [
      { fuel: f1, dry: 1500 + 0.12 * f1, thrust, ve: 2600 },
      { fuel: f2, dry: 500 + 0.12 * f2, thrust: thrust * 0.3, ve: 3000 },
    ];
  }
  return [{ fuel, dry: 2000 + 0.15 * fuel, thrust, ve: 2600 }];
}

export function createState(stages) {
  const st = stages.map((s) => ({ ...s, left: s.fuel }));
  return { x: 0, y: R, vx: 0, vy: 0, t: 0, stages: st, cur: 0, engine: false, landed: true, crashed: false,
    maxQ: 0, maxAlt: 0, lastDrag: 0, lastAcc: 0, phase: 'ascent' };
}

export function mass(s) {
  let m = PAYLOAD;
  for (let i = s.cur; i < s.stages.length; i++) m += s.stages[i].dry + s.stages[i].left;
  return m;
}
export const density = (h) => (h > 150000 ? 0 : RHO0 * Math.exp(-Math.max(h, 0) / H_SCALE));

/** Kalan Δv (Tsiolkovsky): Σ ve·ln(m0/mf) */
export function deltaV(s) {
  let dv = 0;
  for (let i = s.cur; i < s.stages.length; i++) {
    let above = PAYLOAD;
    for (let j = i + 1; j < s.stages.length; j++) above += s.stages[j].dry + s.stages[j].left;
    const m0 = above + s.stages[i].dry + s.stages[i].left, mf = above + s.stages[i].dry;
    dv += s.stages[i].ve * Math.log(m0 / mf);
  }
  return dv;
}

/**
 * Bir adım (yarı-örtük Euler). pitch: yerel dikeyden doğuya açı (rad).
 * Dönüş: 'stage' (kademe ayrıldı) | 'burnout' | 'crash' | null
 */
export function step(s, h, pitch) {
  const r = Math.hypot(s.x, s.y), ux = s.x / r, uy = s.y / r;
  const alt = r - R;
  let ax = (-MU / (r * r)) * ux, ay = (-MU / (r * r)) * uy;
  let ev = null;
  const stg = s.stages[s.cur];
  let thrustA = 0;
  const m = mass(s);
  if (s.engine && stg && stg.left > 0) {
    const ex = uy, ey = -ux; // doğu yönü
    const dx = Math.sin(pitch) * ex + Math.cos(pitch) * ux, dy = Math.sin(pitch) * ey + Math.cos(pitch) * uy;
    thrustA = stg.thrust / m;
    ax += thrustA * dx; ay += thrustA * dy;
    stg.left = Math.max(0, stg.left - (stg.thrust / stg.ve) * h);
    if (stg.left <= 0) {
      if (s.cur < s.stages.length - 1) { s.cur++; ev = 'stage'; } else { s.engine = false; ev = 'burnout'; }
    }
  }
  // Sürükleme (dönmeyen gezegen, hava durgun)
  const v = Math.hypot(s.vx, s.vy);
  const rho = density(alt);
  const q = 0.5 * rho * v * v;
  s.maxQ = Math.max(s.maxQ, q);
  if (v > 0.01 && rho > 0) {
    const fd = (q * CDA) / m;
    ax -= (fd * s.vx) / v; ay -= (fd * s.vy) / v;
    s.lastDrag = fd;
  } else s.lastDrag = 0;
  s.lastAcc = thrustA;
  // Rampada: itki ağırlığı yenmedikçe yerde kal
  if (s.landed) {
    const radial = ax * ux + ay * uy;
    if (radial <= 0) { s.vx = s.vy = 0; s.t += h; return ev; }
    s.landed = false;
  }
  s.vx += ax * h; s.vy += ay * h;
  s.x += s.vx * h; s.y += s.vy * h;
  s.t += h;
  const r2 = Math.hypot(s.x, s.y);
  s.maxAlt = Math.max(s.maxAlt, r2 - R);
  if (r2 < R) { s.crashed = true; s.engine = false; const k = R / r2; s.x *= k; s.y *= k; return 'crash'; }
  return ev;
}

/** Yörünge elemanları: enerji, a, e, apoapsis/periapsis irtifası, ω */
export function elements(s) {
  const r = Math.hypot(s.x, s.y), v2 = s.vx * s.vx + s.vy * s.vy;
  const eps = v2 / 2 - MU / r;
  const hz = s.x * s.vy - s.y * s.vx;
  const rv = s.x * s.vx + s.y * s.vy;
  const exv = ((v2 - MU / r) * s.x - rv * s.vx) / MU, eyv = ((v2 - MU / r) * s.y - rv * s.vy) / MU;
  const e = Math.hypot(exv, eyv);
  const a = eps < 0 ? -MU / (2 * eps) : Infinity;
  const p = (hz * hz) / MU;
  const rp = eps < 0 ? a * (1 - Math.min(e, 1)) : p / (1 + e);
  const ra = eps < 0 ? a * (1 + Math.min(e, 1)) : Infinity;
  return { eps, a, e, p, rp, ra, peri: rp - R, apo: ra - R, w: Math.atan2(eyv, exv), hz, escape: eps >= 0 };
}

/**
 * Yönlendirme: 'fixed' → 1 km'ye kadar dikey, sonra yerel dikeyden sabit açı;
 * 'turn' → yerçekimi dönüşü: 1 km'den turnAlt'a kadar kademeli olarak yataya yatar.
 */
export function pitchFor(s, mode, angleDeg, turnAlt) {
  const alt = Math.hypot(s.x, s.y) - R;
  if (alt < 1000) return 0;
  if (mode === 'fixed') return (angleDeg * Math.PI) / 180;
  const t = Math.min(1, Math.max(0, (alt - 1000) / (turnAlt - 1000)));
  return (Math.PI / 2) * Math.sqrt(t);
}

export const TARGET_APO = 120000;
/**
 * Otopilot: hedef apoapsise ulaşınca motoru keser, apoapsis yakınında yatay itkiyle yörüngeyi daireselleştirir.
 * s.phase: 'ascent' | 'coast' | 'circ' | 'done'. Dönüş: bu adımın itki açısı (rad).
 */
export function autopilot(s, pitch) {
  const el = elements(s);
  const r = Math.hypot(s.x, s.y), alt = r - R;
  const vr = (s.x * s.vx + s.y * s.vy) / r;
  if (s.phase === 'ascent') {
    if (el.escape || el.apo >= TARGET_APO) { s.engine = false; s.phase = 'coast'; }
    return pitch;
  }
  if (s.phase === 'coast') {
    if (alt > ATM && vr < 40 && !el.escape && hasFuel(s)) { s.engine = true; s.phase = 'circ'; }
    return Math.PI / 2;
  }
  if (s.phase === 'circ') {
    if (el.peri > ATM + 25000 || el.escape) { s.engine = false; s.phase = 'done'; }
    return Math.PI / 2 - Math.max(-0.3, Math.min(0.6, -vr * 0.004));
  }
  return pitch;
}
export const hasFuel = (s) => s.stages.slice(s.cur).some((x) => x.left > 0);

export function classify(s) {
  if (s.crashed) return 'crash';
  if (s.landed) return 'pad';
  const el = elements(s);
  if (el.escape) return 'escape';
  if (el.peri > ATM) return 'orbit';
  return 'sub';
}
