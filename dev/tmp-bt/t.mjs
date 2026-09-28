import * as B from '/root/simlab/src/core/gfx/buildings.js';
import * as THREE from 'three';
const tri = (g) => { let t = 0, inst = 0; g.traverse((o) => { if (o.isMesh) { const n = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; t += n * (o.isInstancedMesh ? o.count : 1); if (o.isInstancedMesh) inst += o.count; } }); return [Math.round(t), inst]; };
for (const type of ['apartment', 'house', 'office', 'public', 'industrial']) {
  for (const roof of [undefined, 'hip', 'flat', 'gable']) {
    const t0 = performance.now();
    const b = B.makeBuilding({ type, seed: 5, roof, lod: false });
    const [t, i] = tri(b);
    let bad = 0; b.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { const a = o.geometry.attributes.position.array; for (const v of a) if (!Number.isFinite(v)) bad++; } });
    console.log(type, roof ?? '-', 'tris', t, 'inst', i, 'ms', (performance.now() - t0).toFixed(1), 'NaN', bad, 'H', b.userData.spec.H.toFixed(1));
  }
}
const lots = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) lots.push(...B.makeBlock({ x0: i * 80, x1: i * 80 + 65, z0: j * 80, z1: j * 80 + 65 }, { seed: i * 7 + j }));
const t0 = performance.now();
const c = B.populateCity({ lots, near: 300, camera: [0, 2, 0] });
console.log('city', c.stats(), 'lots', lots.length, 'ms', (performance.now() - t0).toFixed(0));
const t1 = performance.now(); c.tiles.forEach((t) => t.high || t.buildHigh()); console.log('all high ms', (performance.now() - t1).toFixed(0), 'tris', tri(c.group));
