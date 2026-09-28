// Veri merkezi enerji modeli: PUE (soğutma türü + dış sıcaklık), buharlaşma fiziğinden WUE, karbon ve eşdeğerler.
import { smoothstep, clamp } from '@core';

export const COOLING = {
  klasik: { name: 'Klasik hava soğutma (kompresörlü chiller)', short: 'Klasik hava' },
  serbest: { name: 'Serbest soğutma (dış hava) + chiller desteği', short: 'Serbest soğutma' },
  evap: { name: 'Buharlaşmalı (evaporatif) soğutma kulesi', short: 'Buharlaşmalı' },
  sivi: { name: 'Doğrudan sıvı soğutma (çip üstü, kuru soğutucu)', short: 'Sıvı soğutma' },
};

// Ember (2026) verisi, Our World in Data aracılığıyla — 2024, yaşam döngüsü gCO₂e/kWh
export const GRIDS = [
  { value: 'nor', label: 'Norveç (hidro) — 30', g: 30 },
  { value: 'fra', label: 'Fransa (nükleer) — 40', g: 40 },
  { value: 'deu', label: 'Almanya — 336', g: 336 },
  { value: 'usa', label: 'ABD — 384', g: 384 },
  { value: 'tur', label: 'Türkiye — 470', g: 470 },
  { value: 'wld', label: 'Dünya ortalaması — 471', g: 471 },
  { value: 'chn', label: 'Çin — 555', g: 555 },
  { value: 'pol', label: 'Polonya (kömür ağırlıklı) — 608', g: 608 },
  { value: 'ind', label: 'Hindistan — 705', g: 705 },
  { value: 'ozel', label: 'Özel (kaydırıcı)', g: null },
];

const LATENT = 3.6 / 2.43; // L/kWh: 1 kWh ısıyı buharlaştırarak atmak için gereken su (buharlaşma ısısı ≈ 2,43 MJ/kg)
const CYCLES = 4; // konsantrasyon çevrimi: blöf suyu ile toplam su = buharlaşan × C/(C−1)

const chillerCOP = (T, base) => clamp(base - 0.1 * (T - 15), 2.2, 7);

/** Tesis yükleri (BT yükünün kesri olarak): soğutma, elektrik dağıtım kaybı, diğer. */
export function overheads(type, T) {
  let cool, dist = 0.06;
  if (type === 'klasik') { cool = 0.15 + 1 / chillerCOP(T, 5.5); dist = 0.1; }
  else if (type === 'serbest') { const free = 1 - smoothstep(12, 26, T); cool = 0.05 + (1 - free) / chillerCOP(T, 6); }
  else if (type === 'evap') cool = 0.06 + 0.05 * smoothstep(28, 42, T);
  else cool = 0.03 + 0.2 * 0.08 + 0.12 * smoothstep(30, 42, T); // pompalar + kalan %20 hava ısısı + sıcakta chiller desteği
  return { cool, dist, misc: 0.02 };
}

export function pue(type, T) {
  const o = overheads(type, T);
  return 1 + o.cool + o.dist + o.misc;
}

/** Tesis suyu (L / BT kWh). Yalnız buharlaşmalı soğutmada; soğuk havada kuru çalışır. */
export function wue(type, T) {
  if (type !== 'evap') return 0;
  const o = overheads(type, T);
  const evapShare = smoothstep(6, 24, T);
  return LATENT * (1 + o.cool) * evapShare * (CYCLES / (CYCLES - 1));
}

export const RACK_KW = { klasik: 8, ai: 60 }; // temsilî raf gücü (kW)

/** o: { itMW, ai (0..1), util (0..1), type, T, g } */
export function facility(o) {
  const itAvg = o.itMW * (0.35 + 0.65 * o.util); // boştaki sunucu da güç çeker (temsilî %35)
  const ov = overheads(o.type, o.T);
  const P = pue(o.type, o.T);
  const total = itAvg * P;
  const itMWh = itAvg * 8760, totMWh = total * 8760;
  const W = wue(o.type, o.T);
  return {
    itAvg, total, pue: P, ov, wue: W,
    itMWh, totMWh,
    water: (W * itMWh * 1000) / 1000, // m³/yıl
    co2: (totMWh * o.g) / 1000, // t/yıl
    racks: (o.itMW * 1000 * (1 - o.ai)) / RACK_KW.klasik + (o.itMW * 1000 * o.ai) / RACK_KW.ai,
    aiMWh: itMWh * o.ai,
  };
}
