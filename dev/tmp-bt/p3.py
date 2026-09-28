f='src/core/gfx/buildings.js'; s=open(f).read()
rep=[
("class Bucket { constructor() { this.p = []; this.n = []; this.c = []; this.b = []; this.i = []; } }",
'''// Büyüyen tipli diziler (JS dizisine push + dönüştürme yerine: ~4 kat hızlı, çöp üretmez)
class Bucket {
  constructor() { this.nv = 0; this.ni = 0; this.cap = 0; this.icap = 0; this.grow(1024, 2048); }
  grow(v, i) {
    if (v > this.cap) {
      const c = Math.max(v, this.cap * 2), o = this;
      const g = (a, k) => { const b = new Float32Array(c * k); if (a) b.set(a.subarray(0, o.nv * k)); return b; };
      this.p = g(this.p, 3); this.n = g(this.n, 3); this.c = g(this.c, 3); this.b = g(this.b, 4); this.cap = c;
    }
    if (i > this.icap) { const c = Math.max(i, this.icap * 2), b = new Uint32Array(c); if (this.i) b.set(this.i.subarray(0, this.ni)); this.i = b; this.icap = c; }
  }
  vert(x, y, z, nx, ny, nz, c, I) {
    const k = this.nv++, p = this.p, n = this.n, cc = this.c, b = this.b;
    p[k * 3] = x; p[k * 3 + 1] = y; p[k * 3 + 2] = z; n[k * 3] = nx; n[k * 3 + 1] = ny; n[k * 3 + 2] = nz;
    cc[k * 3] = c[0]; cc[k * 3 + 1] = c[1]; cc[k * 3 + 2] = c[2]; b[k * 4] = I[0]; b[k * 4 + 1] = I[1]; b[k * 4 + 2] = I[2]; b[k * 4 + 3] = I[3];
  }
  tri(a, b, c) { const i = this.i, k = this.ni; i[k] = a; i[k + 1] = b; i[k + 2] = c; this.ni += 3; }
}'''),
('''    const bk = this.bucket(k), e = this.F.elements, base = bk.p.length / 3, c = col || this.col, I = this.inf;
    const nx = e[0] * n[0] + e[4] * n[1] + e[8] * n[2], ny = e[1] * n[0] + e[5] * n[1] + e[9] * n[2], nz = e[2] * n[0] + e[6] * n[1] + e[10] * n[2];
    for (const q of pts) {
      bk.p.push(e[0] * q[0] + e[4] * q[1] + e[8] * q[2] + e[12], e[1] * q[0] + e[5] * q[1] + e[9] * q[2] + e[13], e[2] * q[0] + e[6] * q[1] + e[10] * q[2] + e[14]);
      bk.n.push(nx, ny, nz); bk.c.push(c[0], c[1], c[2]); bk.b.push(I[0], I[1], I[2], I[3]);
    }''','''    const bk = this.bucket(k), e = this.F.elements, base = bk.nv, c = col || this.col, I = this.inf;
    bk.grow(bk.nv + pts.length, bk.ni + (pts.length - 2) * 3);
    const nx = e[0] * n[0] + e[4] * n[1] + e[8] * n[2], ny = e[1] * n[0] + e[5] * n[1] + e[9] * n[2], nz = e[2] * n[0] + e[6] * n[1] + e[10] * n[2];
    for (const q of pts) bk.vert(e[0] * q[0] + e[4] * q[1] + e[8] * q[2] + e[12], e[1] * q[0] + e[5] * q[1] + e[9] * q[2] + e[13], e[2] * q[0] + e[6] * q[1] + e[10] * q[2] + e[14], nx, ny, nz, c, I);'''),
("    for (let j = 1; j + 1 < pts.length; j++) { if (flip) bk.i.push(base, base + j + 1, base + j); else bk.i.push(base, base + j, base + j + 1); }",
 "    for (let j = 1; j + 1 < pts.length; j++) { if (flip) bk.tri(base, base + j + 1, base + j); else bk.tri(base, base + j, base + j + 1); }"),
('''    const bk = this.bucket(k), base = bk.p.length / 3, c = col || this.col, I = this.inf;
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(_m2); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      bk.p.push(v.x, v.y, v.z); bk.n.push(n.x, n.y, n.z); bk.c.push(c[0], c[1], c[2]); bk.b.push(I[0], I[1], I[2], I[3]);
      bk.i.push(base + i);
    }''','''    const bk = this.bucket(k), base = bk.nv, c = col || this.col, I = this.inf;
    bk.grow(bk.nv + P.count, bk.ni + P.count);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(_m2); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      bk.vert(v.x, v.y, v.z, n.x, n.y, n.z, c, I);
    }
    for (let i = 0; i + 2 < P.count; i += 3) bk.tri(base + i, base + i + 1, base + i + 2);'''),
('''      if (!bk.i.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bk.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(bk.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(bk.c, 3));
      g.setAttribute('bInfo', new THREE.Float32BufferAttribute(bk.b, 4));
      g.setIndex(bk.i);''','''      if (!bk.ni) continue;
      const g = new THREE.BufferGeometry(), nv = bk.nv;
      g.setAttribute('position', new THREE.BufferAttribute(bk.p.slice(0, nv * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(bk.n.slice(0, nv * 3), 3));
      g.setAttribute('color', new THREE.BufferAttribute(bk.c.slice(0, nv * 3), 3));
      g.setAttribute('bInfo', new THREE.BufferAttribute(bk.b.slice(0, nv * 4), 4));
      g.setIndex(new THREE.BufferAttribute(nv < 65536 ? Uint16Array.from(bk.i.subarray(0, bk.ni)) : bk.i.slice(0, bk.ni), 1));'''),
]
for a,b in rep:
    assert a in s, a[:60]
    s=s.replace(a,b)
open(f,'w').write(s)
