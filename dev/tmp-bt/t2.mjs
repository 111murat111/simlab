import * as B from '../../src/core/gfx/buildings.js';
for (const type of ['apartment', 'office', 'public']) {
  B.makeBuilding({ type, seed: 1, lod: false });
  let t0 = performance.now(); const n = 10;
  for (let i = 0; i < n; i++) B.makeBuilding({ type, seed: 5 + i, lod: false });
  const b = B.makeBuilding({ type, seed: 5, lod: false });
  console.log(type, 'avg ms', ((performance.now() - t0) / n).toFixed(1));
  const rows = [];
  b.traverse((o) => { if (o.isMesh) { const g = o.geometry; const n = (g.index ? g.index.count : g.attributes.position.count) / 3; rows.push([o.name, o.isInstancedMesh ? o.count : 1, n, Math.round(n * (o.isInstancedMesh ? o.count : 1))]); } });
  rows.sort((a, b) => b[3] - a[3]); console.log(rows.slice(0, 8).map((r) => r.join(':')).join('  '));
}
