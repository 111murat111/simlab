import { landscape } from '../src/core/gfx/terrain.js';
const hf0 = landscape({ seed: 12, size: 1100, height: 190, base: -30, warp: 0.55 });
const sm = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hf = (x, z) => { const r = Math.hypot(x, z), f = sm(r, 70, 320); return 4 + (hf0(x, z) - hf0(0, 0) + 4 + 0.012 * r - 4) * f + 26 * (1 - Math.exp(-((r / 2600) ** 2))); };
console.log('hf0(0,0)=', hf0(0, 0).toFixed(1));
for (const d of [200, 500, 800, 1200, 2000, 3000]) { const x = d * 0.6, z = -d * 0.8; console.log(d, hf(x, z).toFixed(1), hf(x + 300, z + 200).toFixed(1)); }
