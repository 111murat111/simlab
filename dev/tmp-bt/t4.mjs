import { makeCity } from '../../src/core/gfx/streets.js';
const CL = [-225, -150, -75, 0, 75, 150, 225];
const t0 = performance.now();
const c = makeCity({ xs: CL, zs: CL, road: 7, walk: 3.5, seed: 8, parked: 30, camera: [46, 10, 44], tile: 75, near: 140,
  plan: (i, j) => (i === 3 && j === 3 ? 'plaza' : 'city'),
  floors: (x, z, r, type) => (type === 'apartment' ? 4 + Math.floor(r() * 4) : undefined) });
console.log('trafik-like', c.buildings.stats(), 'ms', (performance.now() - t0).toFixed(0), 'children', c.group.children.length);
