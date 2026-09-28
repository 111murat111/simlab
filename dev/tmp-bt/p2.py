f='src/core/gfx/buildings.js'; s=open(f).read()
a=s[s.index("  buildHigh() {"):s.index("  distTo(p) {")]
b='''  /** Ayrıntılı geometriyi üret. budget (ms) verilirse bina bina ilerler, bitince true döner. */
  buildHigh(budget = Infinity) {
    if (this.high) return true;
    const t0 = performance.now();
    if (!this.bld) { this.bld = new Builder(); this.k = 0; }
    const o = [this.position.x, this.position.z];
    while (this.k < this.specs.length) {
      emitBuilding(this.bld, this.specs[this.k++], o);
      if (performance.now() - t0 > budget) return false;
    }
    this.high = this.bld.finish(new THREE.Group());
    this.bld = null;
    this.high.name = 'city:tile-high';
    this.add(this.high);
    this.high.updateMatrixWorld(true);
    return true;
  }
'''
s=s.replace(a,b)
a='''    if (want && !this.high) {
      const now = performance.now();
      if (now - budgetT > 40) { budgetT = now; budgetUsed = 0; }
      if (budgetUsed < this.opts.budget) { this.buildHigh(); budgetUsed += performance.now() - now; }
    }'''
b='''    if (want && !this.high) {
      const now = performance.now();
      if (now - budgetT > 12) { budgetT = now; budgetUsed = 0; }   // yeni kare: bütçe sıfırlanır
      const left = this.opts.budget - budgetUsed;
      if (left > 0) { this.buildHigh(left); budgetUsed += performance.now() - now; }
    }'''
assert a in s; s=s.replace(a,b)
s=s.replace("railL.push([-0.4375 + i * 0.125, 0.55, 0, 0.018, 0.9, 0.018, 15]);","railL.push([-0.4375 + i * 0.125, 0.55, 0, 0.018, 0.9, 0.018, 3]);")
s=s.replace("new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20).rotateX","new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12).rotateX")
open(f,'w').write(s)
