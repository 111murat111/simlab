import * as B from '../../src/core/gfx/buildings.js';
const lots = [];
for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) lots.push(...B.makeBlock({ x0: i * 75 + 5, x1: i * 75 + 67, z0: j * 75 + 5, z1: j * 75 + 67 }, { seed: i * 7 + j, floors: (x, z, r, t) => t === 'apartment' ? 4 + Math.floor(r() * 4) : undefined }));
B.makeBuilding({ type: 'apartment', lod: false });
const c = B.populateCity({ lots });
const t0 = performance.now(); c.tiles.forEach((t) => t.buildHigh());
const ms = performance.now() - t0; console.log(lots.length, 'bld', (ms / lots.length).toFixed(1), 'ms/bld');
