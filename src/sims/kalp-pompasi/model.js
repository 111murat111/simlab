// Kalp pompası modeli: zamanla değişen elastans (sol kalp) + Windkessel arter + Bernoulli kapak akışı.
// Birimler: hacim mL, basınç mmHg, akış mL/s, zaman s.

/** Kapak akışı: ΔP = R·Q + Q²/(2500·A²)  (A: cm², Bernoulli ΔP = 4v²) */
export function orifice(dP, A, R = 0.003) {
  if (dP <= 0 || A <= 0) return 0;
  const a = 1 / (2500 * A * A);
  return (-R + Math.sqrt(R * R + 4 * a * dP)) / (2 * a);
}

export function createHeartModel() {
  const p = {
    hr: 70, contract: 1, avArea: 3.5, mrArea: 0, rs: 1.05, ca: 1.35, venTone: 1,
  };
  const s = { t: 0, vlv: 120, vla: 60, pao: 85, vv: 350, vpv: 130, pv: 5, ppv: 10, qr: 85, plv: 0, pla: 0, qmv: 0, qav: 0, qpv: 0, ea: 0, ev: 0 };
  const EMIN = 0.07, V0 = 10, LA_EMIN = 0.2, LA_EA = 0.3, V0LA = 20, RPV = 0.03, CV = 70, CPV = 12, GR = 17;
  // Atım bazında kayıt
  let acc = newAcc();
  const beat = { edv: 120, esv: 50, sv: 70, fsv: 70, rv: 0, sys: 120, dia: 80, map: 93, plvMax: 120, laMean: 8, grad: 0, ef: 0.58, co: 4.9, count: 0 };
  function newAcc() { return { vmax: 0, vmin: 1e9, fwd: 0, back: 0, pmax: -1e9, pmin: 1e9, pint: 0, laint: 0, plvmax: 0, dur: 0, edv: null }; }

  function timing() {
    const T = 60 / p.hr;
    const PR = 0.12 + 0.05 * T;
    const Ts = 0.16 + 0.2 * T;
    return { T, PR, Ts };
  }

  function step(dt) {
    const { T, PR, Ts } = timing();
    s.t += dt;
    if (s.t >= T) { s.t -= T; endBeat(); }
    const ta = s.t;
    s.ea = ta < 0.11 ? Math.sin(Math.PI * ta / 0.11) : 0;
    const tv = s.t - PR;
    const T1 = 0.62 * Ts;
    s.ev = tv < 0 || tv >= Ts ? 0 : tv < T1 ? 0.5 * (1 - Math.cos(Math.PI * tv / T1)) : 0.5 * (1 + Math.cos(Math.PI * (tv - T1) / (Ts - T1)));
    if (tv >= 0 && acc.edv == null) acc.edv = s.vlv;
    const emax = 2.3 * p.contract;
    s.plv = (EMIN + (emax - EMIN) * s.ev) * (s.vlv - V0);
    s.pla = (LA_EMIN + LA_EA * s.ea) * (s.vla - V0LA);
    s.pv = (s.vv / CV) * p.venTone;
    s.ppv = s.vpv / CPV;
    // Sağ kalp: Frank–Starling benzeri pompa (venöz basınçla artan debi)
    s.qr = GR * Math.max(0, s.pv) * Math.sqrt(p.hr / 70);
    s.qpv = (s.ppv - s.pla) / RPV;
    const qs = (s.pao - s.pv) / p.rs;
    const dm = s.pla - s.plv;
    s.qmv = dm > 0 ? orifice(dm, 4.5) : -orifice(-dm, p.mrArea, 0.004);
    s.qav = orifice(s.plv - s.pao, p.avArea);
    s.vla += (s.qpv - s.qmv) * dt;
    s.vlv += (s.qmv - s.qav) * dt;
    s.pao += ((s.qav - qs) / p.ca) * dt;
    s.vv += (qs - s.qr) * dt;
    s.vpv += (s.qr - s.qpv) * dt;
    // kayıt
    acc.vmax = Math.max(acc.vmax, s.vlv); acc.vmin = Math.min(acc.vmin, s.vlv);
    acc.fwd += s.qav * dt; if (s.qmv < 0) acc.back -= s.qmv * dt;
    acc.pmax = Math.max(acc.pmax, s.pao); acc.pmin = Math.min(acc.pmin, s.pao);
    acc.pint += s.pao * dt; acc.laint += s.pla * dt; acc.dur += dt;
    acc.plvmax = Math.max(acc.plvmax, s.plv);
  }

  function endBeat() {
    const a = acc;
    if (a.dur > 0.1) {
      const edv = a.edv ?? a.vmax;
      Object.assign(beat, {
        edv, esv: a.vmin, sv: edv - a.vmin, fsv: a.fwd, rv: a.back, sys: a.pmax, dia: a.pmin, map: a.pint / a.dur,
        laMean: a.laint / a.dur, plvMax: a.plvmax, grad: Math.max(0, a.plvmax - a.pmax), ef: (edv - a.vmin) / edv,
        co: (a.fwd * p.hr) / 1000, count: beat.count + 1,
      });
    }
    acc = newAcc();
  }

  function reset() {
    Object.assign(s, { t: 0, vlv: 120, vla: 60, pao: 85, vv: 350, vpv: 130 });
    acc = newAcc();
    beat.count = 0;
  }

  return { p, s, beat, step, timing, reset };
}
