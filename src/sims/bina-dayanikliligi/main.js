// Bina Dayanıklılığı — kayma binası modeli (histeretik katlar, P-Δ) sentetik deprem altında; zemin, yumuşak kat, kolon kesme, izolatör.
import { createSim, THREE, clamp, fmt, seeded } from '@core';
import { createModel, makeRecord, SOILS, G, H, DT } from './model.js';

const sim = createSim({
  background: 0x0d1424,
  camera: { position: [12, 14, 34], target: [0, 7, 0], fov: 42, far: 800 },
  controls: { minDistance: 8, maxDistance: 160, maxPolarAngle: Math.PI * 0.49 },
  fog: [120, 400],
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Her kat bir kütle, katlar arasındaki kolonlar birer yay gibi davranır (<b>kayma binası</b> modeli). Sentetik bir deprem
    kaydı zemini sarsar; model her 2 ms'de hareket denklemini çözer (açık Newmark / merkezi fark). Kolon renkleri o anki
    <b>göreli kat ötelemesini</b> (kat yer değiştirmesi ÷ kat yüksekliği) gösterir: mavi güvenli, kırmızı sınırda. Kolonlar
    akma dayanımını aşınca kalıcı şekil değiştirir, çatlar belirir; ötelenme göçme sınırını aşarsa kat çöker ve üst katlar
    üst üste yığılır (<b>pankek göçme</b>). Hareketler görünür olsun diye büyütülerek çizilir.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Rezonans:</b> Binanın doğal periyodu T₁ kabaca <b>0,1 × kat sayısı</b> saniyedir. Zeminin baskın periyodu buna
      yaklaşınca bina en büyük salınımı yapar. "Rezonans" senaryosunda sinüs sarsıntıyı binanın periyoduna ayarla, sonra periyodu değiştir.</li>
      <li><b>Yumuşak kat</b> ve <b>kolon kesme</b>: zemin kat zayıflayınca tüm şekil değiştirme orada toplanır ve bina oradan çöker.</li>
      <li><b>Yönetmeliğe uygun</b> bina daha rijit, daha dayanımlı ve sünektir: aynı depremde hasar alsa da ayakta kalır.</li>
      <li><b>Sismik izolatör</b> periyodu ~3 saniyeye uzatır; üst yapıya gelen ivme azalır. Yumuşak zeminde uzun periyotlu
      sarsıntıya karşı izolatörün de tasarımla uyumlu olması gerekir.</li>
      <li>"İki bina" ile aynı depremi iki farklı yapıda karşılaştır.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <ul>
      <li>1999 Marmara ve 2023 Kahramanmaraş depremlerinde yıkılan binaların önemli bir kısmında yumuşak kat, kolon kesme,
      kısa kolon, düşük beton kalitesi ve yetersiz etriye gibi kusurlar görüldü.</li>
      <li>Türkiye Bina Deprem Yönetmeliği (TBDY 2018) zemine göre tasarım yapılmasını ve taşıyıcı sisteme müdahale
      edilmemesini şart koşar. Dükkân açmak için kolon/perde kesmek hem suç hem ölümcül bir risktir.</li>
      <li>Binanın risk durumunu merak ediyorsan yetkili kurumlara ya da uzman mühendislere (ör. riskli yapı tespiti) başvur.</li>
    </ul>
    <p><small>Model eğitim amaçlıdır: kütle ve rijitlikler normalize, dayanım ve göçme ötelenmesi temsili değerlerdir;
    burulma, temel-zemin etkileşimi ve gerçek betonarme davranışının ayrıntıları yoktur. Gerçek bir binanın güvenliği
    hakkında karar vermek için kullanılamaz.</small></p>`,
});
sim.formatTime = (t) => `${fmt(qt, 1)} sn`;

// --- Zemin ---
const groundG = new THREE.Group();
sim.scene.add(groundG);
const soilMat = new THREE.MeshStandardMaterial({ color: 0x8b6b4a, roughness: 0.95 });
const soilBox = new THREE.Mesh(new THREE.BoxGeometry(90, 8, 50), soilMat);
soilBox.position.y = -4;
const grid = new THREE.GridHelper(90, 30, 0x475569, 0x334155);
grid.position.y = 0.01;
grid.material.transparent = true; grid.material.opacity = 0.45;
groundG.add(soilBox, grid);
const soilLbl = sim.label('', { parent: groundG, position: [0, -2.5, 25.2], className: 'plain' });

// --- Bina görseli ---
const COLS = [-3, 0, 3], BAYS = [[-3, 0], [0, 3]];
const unit = new THREE.BoxGeometry(1, 1, 1);
function crackTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(20,10,10,.95)';
  g.lineCap = 'round';
  const rnd = seeded(11);
  for (let k = 0; k < 7; k++) {
    let x = rnd() * 128, y = rnd() * 128;
    g.lineWidth = 1 + rnd() * 2.5;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (rnd() - 0.3) * 30; y += (rnd() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  // Çapraz (X) kesme çatlağı
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(10, 12); g.lineTo(60, 64); g.lineTo(118, 116); g.moveTo(116, 10); g.lineTo(66, 62); g.lineTo(12, 118); g.stroke();
  return new THREE.CanvasTexture(c);
}
const crackMap = crackTexture();
const MAXN = 15;
const tmpM = new THREE.Matrix4(), tmpC = new THREE.Color(), cGrey = new THREE.Color(0xd6d3d1), cWall = new THREE.Color(0xe7e0d4);
const C_BLUE = new THREE.Color(0x60a5fa), C_YEL = new THREE.Color(0xfacc15), C_RED = new THREE.Color(0xdc2626), C_DARK = new THREE.Color(0x3f3f46), C_BRICK = new THREE.Color(0x9a3412);

class Building {
  constructor(name) {
    this.md = createModel();
    this.g = new THREE.Group();
    sim.scene.add(this.g);
    const lam = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
    this.slabs = new THREE.InstancedMesh(unit, lam(0xffffff), MAXN + 1);
    this.cols = new THREE.InstancedMesh(unit, lam(0xffffff), MAXN * 9);
    this.walls = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0.8 }), MAXN * 6);
    this.cracks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: crackMap, transparent: true, depthWrite: false }), MAXN * 3);
    this.pads = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 16), lam(0x111827), 9);
    this.found = new THREE.Mesh(new THREE.BoxGeometry(8, 0.6, 8), lam(0x6b7280));
    this.found.position.y = -0.3;
    for (const m of [this.slabs, this.cols, this.walls, this.cracks, this.pads]) { m.frustumCulled = false; this.g.add(m); }
    this.g.add(this.found);
    this.label = sim.label(name, { parent: this.g, position: [0, 4, 0], className: 'plain' });
    this.coll = new Float64Array(MAXN); // her katın çökme ilerlemesi (0..1)
    this.collT = 0;
  }
  configure(o) {
    this.o = o;
    this.md.configure(o);
    this.reset();
  }
  reset() {
    this.md.reset();
    this.coll.fill(0);
    this.collT = 0;
    this.announced = false;
  }
  // Sheared kutu: alt uç x=a, üst uç x=b; y0..y1 arasında
  static shear(mesh, i, x0, z0, a, b, y0, y1, sx, sz) {
    const h = Math.max(y1 - y0, 0.01), s = (b - a) / h;
    tmpM.set(sx, s * h, 0, x0 + (a + b) / 2, 0, h, 0, (y0 + y1) / 2, 0, 0, sz, z0, 0, 0, 0, 1);
    mesh.setMatrixAt(i, tmpM);
  }
  render(dtReal, ug, exag) {
    const md = this.md, o = this.o, N = md.N, off = md.off;
    // Göçme ilerlemesi (pankek): çöken kattan başlayıp yukarı doğru
    if (md.collapsed >= 0) {
      this.collT += dtReal;
      for (let s = md.collapsed; s < N; s++) this.coll[s] = clamp((this.collT - (s - md.collapsed) * 0.3) / 0.5, 0, 1);
    }
    const x = (j) => ug + (j < 0 ? 0 : md.u[j]) * exag; // j: serbestlik derecesi (−1 = zemin)
    const baseY = o.iso ? 1.0 : 0;
    // Döşemeler
    let y = baseY;
    const ys = [baseY], xs = [x(off - 1)];
    for (let s = 0; s < N; s++) {
      const hh = H * (1 - 0.88 * this.coll[s]);
      y += hh;
      ys.push(y);
      xs.push(x(s + off));
    }
    for (let f = 0; f <= N; f++) {
      tmpM.makeScale(7.2, 0.32, 7.2).setPosition(xs[f], ys[f] - (f ? 0.16 : 0.1), 0);
      this.slabs.setMatrixAt(f, tmpM);
      this.slabs.setColorAt(f, f && this.coll[f - 1] > 0.5 ? tmpC.setHex(0x78716c) : cGrey);
    }
    this.slabs.count = N + 1;
    // Kolonlar ve duvarlar
    let ci = 0, wi = 0, ki = 0;
    for (let s = 0; s < N; s++) {
      const a = xs[s], b = xs[s + 1], y0 = ys[s], y1 = ys[s + 1] - 0.32;
      const r = Math.abs(md.th[s]) / md.thu[s];
      const t = Math.max(r, md.D[s] * 0.7);
      const col = t < 0.5 ? tmpC.copy(C_BLUE).lerp(C_YEL, t * 2) : tmpC.copy(C_YEL).lerp(C_RED, Math.min(1, (t - 0.5) * 2));
      if (this.coll[s] > 0) col.lerp(C_DARK, this.coll[s]);
      for (const cx of COLS) for (const cz of COLS) {
        const removed = o.cut && s === 0 && cz === 3 && cx === 0; // kesilen kolon (ön orta)
        Building.shear(this.cols, ci, cx, cz, a, b, y0, y1, removed ? 0.0001 : 0.5, removed ? 0.0001 : 0.5);
        this.cols.setColorAt(ci++, col);
      }
      // Dolgu duvarlar: yumuşak kat / kolon kesmede zemin kat açık (dükkân); kısa kolonda bant pencere (kısmi duvar)
      const open = s === 0 && (o.soft || o.cut);
      const hf = o.short ? 0.55 : 1;
      const wy1 = y0 + (y1 - y0) * hf, wb = a + (b - a) * hf;
      const wc = tmpC.copy(cWall).lerp(C_BRICK, md.D[s] * 0.5);
      for (const [x0, x1] of BAYS) {
        if (open) continue;
        Building.shear(this.walls, wi, (x0 + x1) / 2, -3, a, wb, y0, wy1, 2.5, 0.2); this.walls.setColorAt(wi++, wc);
        Building.shear(this.walls, wi, -3, (x0 + x1) / 2, a, wb, y0, wy1, 0.2, 2.5); this.walls.setColorAt(wi++, wc);
        Building.shear(this.walls, wi, 3, (x0 + x1) / 2, a, wb, y0, wy1, 0.2, 2.5); this.walls.setColorAt(wi++, wc);
      }
      // Çatlaklar (arka duvarın ön yüzü ve kolonlar üzerinde)
      if (md.D[s] > 0.15 && this.coll[s] < 1) {
        const sc = 0.8 + md.D[s] * 1.8;
        for (const cx of [-1.5, 1.5, 0]) {
          const mid = (a + b) / 2;
          tmpM.makeScale(cx === 0 ? sc * 0.45 : sc, cx === 0 ? sc * 0.9 : sc, 1).setPosition(mid + cx, (y0 + y1) / 2, cx === 0 ? 3.27 : -2.88);
          this.cracks.setMatrixAt(ki++, tmpM);
        }
      }
    }
    this.cols.count = ci; this.walls.count = wi; this.cracks.count = ki;
    for (const m of [this.slabs, this.cols, this.walls, this.cracks]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // İzolatör pedleri
    this.pads.count = o.iso ? 9 : 0;
    if (o.iso) {
      let p = 0;
      for (const cx of COLS) for (const cz of COLS) {
        Building.shear(this.pads, p++, cx, cz, ug, x(0), 0, baseY - 0.3, 1, 1);
      }
      this.pads.instanceMatrix.needsUpdate = true;
    }
    this.found.position.x = ug;
    this.label.position.set(xs[N], ys[N] + 2.2, 0);
  }
  status() {
    const md = this.md;
    if (md.collapsed >= 0) return ['Göçme', 'bad'];
    let r = 0;
    for (let s = 0; s < md.N; s++) r = Math.max(r, md.thMax[s] / md.thu[s]);
    return r < 0.1 ? ['Hasarsız', 'good'] : r < 0.3 ? ['Hafif hasar', 'good'] : r < 0.6 ? ['Orta hasar', 'warn'] : ['Ağır hasar', 'bad'];
  }
}
// Kolon ve döşemeler instanceColor kullanır: başlangıçta ayır
const A = new Building('A');
const B = new Building('B');
for (const b of [A, B]) {
  b.slabs.setColorAt(0, cGrey); b.cols.setColorAt(0, cGrey); b.walls.setColorAt(0, cWall);
}

// --- Toz parçacıkları ---
const DUST = 90;
const dust = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 6, 4), new THREE.MeshStandardMaterial({ color: 0xa8a29e, roughness: 1, transparent: true, opacity: 0.7 }), DUST);
dust.frustumCulled = false;
sim.scene.add(dust);
const dp = new Float32Array(DUST * 3), dv = new Float32Array(DUST * 3), dl = new Float32Array(DUST);
let dustNext = 0;
function puff(x, y) {
  for (let k = 0; k < 30; k++) {
    const i = dustNext++ % DUST;
    dp.set([x + (Math.random() - 0.5) * 7, y + Math.random() * 2, (Math.random() - 0.5) * 7], i * 3);
    dv.set([(Math.random() - 0.5) * 6, Math.random() * 2.5, (Math.random() - 0.5) * 6], i * 3);
    dl[i] = 1.8 + Math.random();
  }
}
function renderDust(dt) {
  for (let i = 0; i < DUST; i++) {
    if (dl[i] <= 0) { dust.setMatrixAt(i, tmpM.makeScale(0, 0, 0)); continue; }
    dl[i] -= dt;
    for (let c = 0; c < 3; c++) { dp[i * 3 + c] += dv[i * 3 + c] * dt; dv[i * 3 + c] *= 1 - 0.8 * dt; }
    const s = 1 + (2.8 - dl[i]) * 1.2;
    dust.setMatrixAt(i, tmpM.makeScale(s, s, s).setPosition(dp[i * 3], dp[i * 3 + 1], dp[i * 3 + 2]));
  }
  dust.instanceMatrix.needsUpdate = true;
}

// --- Deprem durumu ---
let rec = new Float32Array(1), qt = 0, qi = 0, seed = 7, ug = 0, vg = 0, running = false, pgaSeen = 0;
function buildOpts(which) {
  const o = { N: floors.value, soft: soft.value, cut: cut.value, short: shortC.value, code: code.value, iso: iso.value };
  if (which === 'B') {
    const v = bSel.value;
    if (v === 'uygun') Object.assign(o, { soft: false, cut: false, short: false, code: true, iso: false });
    else if (v === 'izolator') Object.assign(o, { iso: true });
    else if (v === 'yarim') o.N = Math.max(1, Math.round(o.N / 2));
    else if (v === 'cift') o.N = Math.min(15, o.N * 2);
  }
  return o;
}
function soil() { return SOILS[soilSel.value]; }
function restart() {
  const S = soil();
  rec = makeRecord({ pga: pga.value, Tg: tg.value, zg: S.zg, amp: S.amp, dur: dur.value, sine: kind.value === 'sinus', rnd: seeded(seed) });
  A.configure(buildOpts('A'));
  B.configure(buildOpts('B'));
  qt = 0; qi = 0; ug = 0; vg = 0; running = true; pgaSeen = 0;
  roofChart.clear(); accChart.clear();
  sampleT = 0;
  soilMat.color.setHex(S.color);
  soilLbl.setText(`Zemin: ${S.name} (büyütme ×${fmt(S.amp, 2)})`);
  layout();
  updateStaticStats();
}
function layout() {
  const two = twoMode.value;
  A.g.position.x = two ? -7 : 0;
  B.g.position.x = 7;
  B.g.visible = two;
  A.label.visible = B.label.visible = two;
  if (two) { A.label.setText('A: seçtiğin bina'); B.label.setText('B: ' + bSel.select.selectedOptions[0].textContent); }
  fitCamera();
}
function fitCamera() {
  const Nmax = Math.max(A.md.N, twoMode.value ? B.md.N : 0);
  const Ht = Nmax * H + 2;
  const w = twoMode.value ? 22 : 10;
  const a = sim.camera.aspect || 1.2;
  const d = Math.max(Ht * 1.75, (w * 1.75) / Math.min(a, 1.4)) + 5;
  sim.moveCamera([d * 0.3, Ht * 0.45 + d * 0.2, d], [0, Ht * 0.42, 0]);
}
let lastAspect = 0;

let sampleT = 0;
sim.onUpdate((dt) => {
  if (!running) return;
  const steps = Math.min(Math.round(dt / DT), 500);
  for (let s = 0; s < steps; s++) {
    const ag = qi < rec.length ? rec[qi] : 0;
    qi++;
    qt += DT;
    // Zemin yer değiştirmesi (görsel; sızıntılı integral ile kayma önlenir)
    vg += ag * DT; vg *= 1 - 0.6 * DT;
    ug += vg * DT; ug *= 1 - 0.6 * DT;
    pgaSeen = Math.max(pgaSeen, Math.abs(ag));
    for (const b of twoMode.value ? [A, B] : [A]) {
      const was = b.md.collapsed;
      b.md.step(ag);
      if (was < 0 && b.md.collapsed >= 0) onCollapse(b);
    }
    if (qt >= sampleT) {
      sampleT = qt + 0.05;
      const roof = (b) => (b.md.collapsed >= 0 ? 0 : b.md.u[b.md.M - 1] * 100);
      roofChart.push(twoMode.value ? [roof(A), roof(B)] : [roof(A), 0]);
      accChart.push([ag / G]);
    }
  }
  if (qi >= rec.length) running = false;
});
function onCollapse(b) {
  const s = b.md.collapsed;
  const who = twoMode.value ? `${b === A ? 'A' : 'B'} binası: ` : '';
  sim.toast(`💥 ${who}${s + 1}. kat göçtü (ötelenme %${fmt(b.md.thu[s] * 100, 1)} sınırını aştı)`, 'bad');
  puff(b.g.position.x, H * (s + 0.5));
}

sim.onRender((dt) => {
  const a = sim.camera.aspect;
  if (Math.abs(a - lastAspect) > 0.02) { lastAspect = a; fitCamera(); }
  const e = exag.value;
  groundG.position.x = ug * e;
  A.render(dt, ug * e, e);
  if (twoMode.value) B.render(dt, ug * e, e);
  renderDust(dt);
  if (sim.frame % 6 === 0) updateStats();
});

// --- Arayüz ---
const ui = sim.ui;
ui.section('Deprem');
ui.buttons([
  { label: '▶ Sars', variant: 'primary', onClick: restart },
  { label: '🎲 Yeni kayıt', onClick: () => { seed = (seed * 7919 + 13) % 100000; restart(); } },
]);
const soilSel = ui.segmented({
  label: 'Zemin sınıfı', value: 'siki',
  options: [{ value: 'kaya', label: 'Kaya' }, { value: 'siki', label: 'Sıkı' }, { value: 'yumusak', label: 'Yumuşak alüvyon' }],
  onChange: (v) => { tg.set(SOILS[v].Tg); restart(); },
});
const kind = ui.segmented({ label: 'Sarsıntı türü', value: 'deprem', options: [{ value: 'deprem', label: 'Deprem (sentetik)' }, { value: 'sinus', label: 'Sinüs (sarsma masası)' }], onChange: restart });
const pga = ui.slider({ label: 'Kaya üzerindeki en büyük yer ivmesi (PGA)', min: 0.05, max: 1, step: 0.01, value: 0.3, format: (v) => `${fmt(v, 2)} g`, onChange: restart });
const tg = ui.slider({ label: 'Baskın periyot', min: 0.1, max: 2.5, step: 0.05, value: 0.6, format: (v) => `${fmt(v, 2)} s`, onChange: restart });
const dur = ui.slider({ label: 'Süre', min: 5, max: 40, step: 1, value: 20, unit: ' sn', onChange: restart });

ui.section('Bina');
const floors = ui.slider({ label: 'Kat sayısı', min: 1, max: 15, step: 1, value: 5, onChange: restart });
const soft = ui.toggle({ label: 'Yumuşak kat (zemin kat açık, dükkân)', value: false, onChange: restart });
const cut = ui.toggle({ label: 'Kolon kesme (zemin kat)', value: false, onChange: restart });
const shortC = ui.toggle({ label: 'Kısa kolon (bant pencere)', value: false, onChange: restart });
const code = ui.toggle({ label: 'Yönetmeliğe uygun (rijit ve sünek)', value: false, onChange: restart });
const iso = ui.toggle({ label: 'Sismik izolatör', value: false, onChange: restart });

ui.section('Karşılaştırma ve görünüm');
const twoMode = ui.toggle({ label: 'İki bina yan yana', value: false, onChange: restart });
const bSel = ui.select({
  label: 'B binası', value: 'uygun', onChange: () => { if (twoMode.value) restart(); },
  options: [{ value: 'uygun', label: 'Yönetmeliğe uygun' }, { value: 'izolator', label: 'A + izolatör' }, { value: 'yarim', label: 'A, yarı kat sayısı' }, { value: 'cift', label: 'A, iki kat sayısı' }],
});
const exag = ui.slider({ label: 'Görsel büyütme', min: 1, max: 30, step: 1, value: 10, unit: '×' });

ui.section('Hazır senaryolar');
const SC = {
  rez: () => { set({ kind: 'sinus', pga: 0.12, soil: 'siki', N: 5 }); tg.set(Math.round(A.md.Tfix * 20) / 20 || 0.5); },
  yumusak: () => set({ soft: true, soil: 'yumusak', pga: 0.3 }),
  kesme: () => set({ cut: true, soil: 'siki', pga: 0.3 }),
  uygun: () => set({ code: true, soil: 'yumusak', pga: 0.35, two: false }),
  izo: () => set({ soil: 'siki', pga: 0.4, two: true, b: 'izolator' }),
};
function set({ kind: k = 'deprem', pga: p = 0.3, soil: so = 'siki', N = floors.value, soft: sf = false, cut: ct = false, short: sh = false, code: cd = false, iso: io = false, two = false, b = 'uygun' }) {
  kind.set(k); soilSel.set(so); tg.set(SOILS[so].Tg); pga.set(p); floors.set(N);
  soft.set(sf); cut.set(ct); shortC.set(sh); code.set(cd); iso.set(io); twoMode.set(two); bSel.set(b);
  A.configure(buildOpts('A'));
}
function runScenario(name) { SC[name](); restart(); }
ui.buttons([{ label: '〰️ Rezonans', onClick: () => runScenario('rez') }, { label: '🏪 Yumuşak kat', onClick: () => runScenario('yumusak') }]);
ui.buttons([{ label: '✂️ Kolon kesme', onClick: () => runScenario('kesme') }, { label: '✅ Yönetmelik', onClick: () => runScenario('uygun') }]);
ui.button({ label: '🛞 İzolatör karşılaştırması', onClick: () => runScenario('izo') });

ui.section('Durum');
const stT = ui.stat({ label: 'Bina periyodu T₁' });
const stRule = ui.stat({ label: 'Kural: 0,1 × N' });
const stRes = ui.stat({ label: 'T₁ / zemin periyodu' });
const stDrift = ui.stat({ label: 'En büyük kat ötelemesi' });
const stAcc = ui.stat({ label: 'Çatı ivmesi (en büyük)' });
const stDmg = ui.stat({ label: 'Hasar durumu' });
const stB = ui.stat({ label: 'B binası' });
const roofChart = ui.chart({ title: 'Çatının zemine göre yer değiştirmesi (cm)', series: [{ name: 'A', color: '#38bdf8' }, { name: 'B', color: '#f97316' }], maxPoints: 300 });
const accChart = ui.chart({ title: 'Yer ivmesi (g)', series: [{ name: 'Zemin', color: '#a3e635', fill: true }], maxPoints: 300, height: 80 });

function updateStaticStats() {
  const md = A.md;
  stT.set(`${fmt(md.T, 2)} s${iso.value ? ` (izolatörsüz ${fmt(md.Tfix, 2)} s)` : ''}`);
  stRule.set(`≈ ${fmt(0.1 * md.N, 1)} s`);
  const r = md.T / tg.value;
  stRes.set(`${fmt(r, 2)}${r > 0.8 && r < 1.25 ? ' · REZONANS' : ''}`, r > 0.8 && r < 1.25 ? 'bad' : r > 0.6 && r < 1.6 ? 'warn' : 'good');
  stB.el.style.display = twoMode.value ? '' : 'none';
}
function updateStats() {
  const md = A.md;
  let mx = 0, at = 0;
  for (let s = 0; s < md.N; s++) if (md.thMax[s] > mx) { mx = md.thMax[s]; at = s; }
  stDrift.set(`%${fmt(mx * 100, 2)} (${at + 1}. kat)`, mx / md.thu[at] > 0.6 ? 'bad' : mx / md.thu[at] > 0.3 ? 'warn' : '');
  stAcc.set(`${fmt(md.maxRoofAcc / G, 2)} g${md.off ? ` · izolatör ${fmt(md.maxIso * 100, 0)} cm` : ''}`);
  stDmg.set(...A.status());
  if (twoMode.value) {
    const [t, tone] = B.status();
    let bm = 0;
    for (let s = 0; s < B.md.N; s++) bm = Math.max(bm, B.md.thMax[s]);
    stB.set(`${t} · %${fmt(bm * 100, 2)}`, tone);
  }
}

sim.onReset(restart);
restart();
