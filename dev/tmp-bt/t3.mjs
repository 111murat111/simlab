import * as B from '../../src/core/gfx/buildings.js';
let ov = 0, n = 0, out = 0;
for (let s = 0; s < 40; s++) {
  const rect = { x0: 0, x1: 55 + (s % 5) * 8, z0: 0, z1: 50 + (s % 7) * 6 };
  const L = B.makeBlock(rect, { seed: s, gap: s % 2 ? 0 : 3 });
  const bx = L.map((l) => { const sw = Math.abs(Math.sin(l.rot)) > 0.5; const hw = (sw ? l.depth : l.width) / 2, hd = (sw ? l.width : l.depth) / 2; return [l.x - hw, l.x + hw, l.z - hd, l.z + hd]; });
  n += L.length;
  for (const b of bx) if (b[0] < rect.x0 - 0.01 || b[1] > rect.x1 + 0.01 || b[2] < rect.z0 - 0.01 || b[3] > rect.z1 + 0.01) out++;
  for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) { const a = bx[i], b = bx[j]; if (a[0] < b[1] - 0.05 && b[0] < a[1] - 0.05 && a[2] < b[3] - 0.05 && b[2] < a[3] - 0.05) ov++; }
}
console.log('lots', n, 'overlaps', ov, 'outside', out);
