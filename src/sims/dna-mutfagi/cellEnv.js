// Hücre ortamı (yerel yardımcı): çekirdek zarı (iki lipit zar + por kompleksleri) zemin ve arka duvar olarak kıvrılır;
// çekirdekte boncuklu kromatin ve çekirdekçik, sitoplazmada granüllü ER yığınları ve serbest ribozomlar; serbest
// nükleotit parıltıları ve ön planda bulanık (odak dışı) parçacıklar derinlik hissi verir.
import { THREE, procedural, BufferGeometryUtils } from '@core';
import { blobGeometry, loftTube, softDot, tissue, fbm } from './bio.js';

export const ENV_Y = 2.85;                       // çekirdek zarı (zemin) yüksekliği
const Z0 = -0.35, Z1 = -3.3, ARC = 4.6, TOP = 22, W = 96;
const BEND = 0.0055;                             // zar x boyunca hafifçe kıvrılır (çekirdeğin yuvarlak alt kenarı)
const bendY = (x) => BEND * x * x;
const rnd = (a, b) => a + Math.random() * (b - a);
// Zar katmanları (profil normali boyunca, çekirdeğe doğru +): iç zar (çekirdek tarafı) ve dış zar (sitoplazma tarafı)
const IN0 = 0.05, IN1 = 0.33, OUT0 = -0.6, OUT1 = -0.32;

/** Zar kesit profili (z, y) ve çekirdeğe bakan normali: öne doğru hafif alçalan zemin → kavis → arka duvar */
function profile(n) {
  const out = [];
  const nF = Math.round(n * 0.2), nA = Math.round(n * 0.35), nW = n - nF - nA;
  const RISE = 0.45;
  for (let i = 0; i < nF; i++) {
    const u = i / nF, z = Z0 + (Z1 - Z0) * u, y = ENV_Y + RISE * u * u;
    const dy = (2 * RISE * u) / (Z0 - Z1), l = Math.hypot(1, dy);   // eğim → normal
    out.push([z, y, dy / l, 1 / l]);
  }
  const yA = ENV_Y + RISE;
  for (let i = 0; i < nA; i++) {
    const a = (i / nA) * Math.PI / 2;
    out.push([Z1 - ARC * Math.sin(a), yA + ARC * (1 - Math.cos(a)), Math.sin(a), Math.cos(a)]);
  }
  for (let i = 0; i <= nW; i++) out.push([Z1 - ARC, yA + ARC + (TOP - yA - ARC) * (i / nW), 1, 0]);
  return out;
}

/** Profil boyunca d0..d1 kalınlıkta, x boyunca uzanan (ve kıvrılan) zar dilimi: iki yüzey + ön kesit şeridi */
function membraneSlab(prof, d0, d1, nx = 64) {
  const pos = [], idx = [], P = prof.length;
  const surf = (d) => {
    const base = pos.length / 3;
    for (let i = 0; i <= nx; i++) {
      const x = -W / 2 + (W * i) / nx;
      for (const [z, y, nz, ny] of prof) pos.push(x, y + ny * d + bendY(x), z + nz * d);
    }
    for (let i = 0; i < nx; i++) for (let j = 0; j < P - 1; j++) { const a = base + i * P + j, b = a + P; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  };
  surf(d1); surf(d0);
  const base = pos.length / 3, [z0, y0] = prof[0];
  for (let i = 0; i <= nx; i++) { const x = -W / 2 + (W * i) / nx; pos.push(x, y0 + d0 + bendY(x), z0, x, y0 + d1 + bendY(x), z0); }
  for (let i = 0; i < nx; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function envelopeMat(key, a, b, opacity = 1) {
  return procedural({
    key, physical: true, bump: 0.05,
    params: { color: 0xffffff, roughness: 0.6, sheen: 0.4, sheenRoughness: 0.6,
      sheenColor: new THREE.Color(0xa8b4f0), side: THREE.DoubleSide, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 },
    uniforms: { uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } },
    pattern: `
      float n = fbm3(p*0.28 + seed*3.0, 3);
      float c = cells3(p*7.0 + n*0.8);
      float hd = smoothstep(0.02, 0.32, c);
      float fine = vn3(p*26.0);
      col = mix(uA, uB, smoothstep(0.25, 0.75, n))*(0.7 + 0.45*hd + 0.06*(fine - 0.5));
      rough = clamp(0.5 + 0.2*(1.0 - hd), 0.45, 0.85);
      h = hd*0.55 + n*0.35 + fine*0.05;`,
  });
}

/** Nükleer por kompleksi: iki halka 8 alt birim + çekirdek tarafında sepet; eksen +y */
function poreGeometry(LOWQ) {
  const parts = [];
  const sub = blobGeometry(0.15, { detail: LOWQ ? 1 : 2, amp: 0.18, freq: 2.2, seed: 4, stretch: [0.9, 1.35, 0.9] });
  for (const yy of [-0.14, 0.14]) for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + (yy > 0 ? 0.2 : 0);
    parts.push(sub.clone().translate(Math.cos(a) * 0.42, yy, Math.sin(a) * 0.42));
  }
  const ring = new THREE.TorusGeometry(0.4, 0.06, 6, 24).rotateX(Math.PI / 2);
  parts.push(ring.clone().translate(0, 0.26, 0), ring.clone().translate(0, -0.26, 0));
  if (!LOWQ) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const c = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(a) * 0.4, 0.26, Math.sin(a) * 0.4),
        new THREE.Vector3(Math.cos(a) * 0.36, 0.55, Math.sin(a) * 0.36),
        new THREE.Vector3(Math.cos(a) * 0.18, 0.78, Math.sin(a) * 0.18)]);
      parts.push(loftTube(c, () => 0.028, { segs: 8, radial: 5, caps: false }));
    }
    parts.push(new THREE.TorusGeometry(0.18, 0.035, 5, 16).rotateX(Math.PI / 2).translate(0, 0.78, 0));
  }
  return clean(parts);
}

/** Birleştirme için öznitelikleri eşitle (yalnız konum + normal, indekssiz) */
function clean(parts) {
  return BufferGeometryUtils.mergeGeometries(parts.map((g) => {
    const q = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(q.attributes)) if (k !== 'position' && k !== 'normal') q.deleteAttribute(k);
    if (!q.attributes.normal) q.computeVertexNormals();
    return q;
  }));
}

export function buildCellEnv(scene, { LOWQ = false } = {}) {
  const group = new THREE.Group();
  group.name = 'hücre-ortamı';
  scene.add(group);
  const noPick = (o) => { o.raycast = () => {}; return o; };
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);

  // Çekirdek zarı: iç ve dış zar, arada perinükleer boşluk; ön kenarda kesit görünür
  const prof = profile(LOWQ ? 40 : 72);
  const inner = noPick(new THREE.Mesh(membraneSlab(prof, IN0, IN1, LOWQ ? 48 : 72), envelopeMat('dna-env-in', 0x4450a0, 0x98a4ee)));
  const outer = noPick(new THREE.Mesh(membraneSlab(prof, OUT0, OUT1, LOWQ ? 48 : 72), envelopeMat('dna-env-out', 0x5a4aa4, 0xae96ec)));
  inner.receiveShadow = outer.receiveShadow = true;
  group.add(inner, outer);

  // Ön kesit: her zar bir lipit çift katmanı; iki sıra baş grubu (boncuk) ve arada yağ asidi kuyrukları.
  // Por komplekslerinde iç ve dış zar birleşir, orada kesit boncukları kesilir.
  const X0 = LOWQ ? -24 : -30, X1 = -X0, STEP = LOWQ ? 0.17 : 0.14;
  const poreX = [];
  for (let x = X0 + 2.2; x < X1; x += rnd(3.8, 5.2)) poreX.push(x);
  const nearPore = (x, r) => poreX.some((px) => Math.abs(px - x) < r);
  {
    const heads = [];
    for (const [a, b] of [[IN0, IN1], [OUT0, OUT1]]) {
      for (const d of [a + 0.055, b - 0.055]) for (let x = X0; x <= X1; x += STEP) {
        if (nearPore(x, 0.62)) continue;
        heads.push([x + rnd(-0.015, 0.015), prof[0][1] + d + bendY(x) + rnd(-0.012, 0.012), Z0 + 0.05]);
      }
    }
    const hm = tissue({ color: 0xf0c4e6, veins: 0.05 });
    hm.emissive = new THREE.Color(0x6a3a70); hm.emissiveIntensity = 0.55;
    const hMesh = noPick(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.068, 1), hm, heads.length));
    heads.forEach(([x, y, z], i) => { _p.set(x, y, z); _q.identity(); _s.setScalar(rnd(0.9, 1.1)); hMesh.setMatrixAt(i, _m.compose(_p, _q, _s)); });
    group.add(hMesh);
    // Kuyruk şeridi: baş sıraları arasında ince, dikey çizgili koyu bant
    const tailMat = procedural({
      key: 'dna-lipid-tail', physical: true,
      params: { color: 0xffffff, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0x9a8ad8) },
      uniforms: { uA: { value: new THREE.Color(0x3a2c6c) }, uB: { value: new THREE.Color(0x8a70c0) } },
      pattern: `
        float st = 0.5 + 0.5*sin(p.x*44.0 + vn3(p*6.0)*3.0);
        col = mix(uA, uB, st*0.7);
        rough = 0.5 + 0.2*st;
        h = st*0.3;`,
    });
    const tails = [];
    for (const [a, b] of [[IN0, IN1], [OUT0, OUT1]]) {
      const pos = [], idx = [], N = 160;
      for (let i = 0; i <= N; i++) {
        const x = X0 + ((X1 - X0) * i) / N;
        pos.push(x, prof[0][1] + a + 0.1 + bendY(x), Z0 + 0.03, x, prof[0][1] + b - 0.1 + bendY(x), Z0 + 0.03);
      }
      for (let i = 0; i < N; i++) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => (k % 3 === 2 ? 1 : 0)), 3));
      g.setIndex(idx);
      tails.push(g);
    }
    group.add(noPick(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(tails), tailMat)));
  }

  // Por kompleksleri: ön kesitte zarın içinden geçen tıkaçlar, zeminde iki sıra, kavis ve duvarda seyrek ızgara
  const poreMat = tissue({ color: 0xc4b4f4, veins: 0.1 });
  poreMat.emissive = new THREE.Color(0x3a3490); poreMat.emissiveIntensity = 0.45;
  const spots = [];                               // [x, profil konumu s (0..1), ölçek]
  for (const x of poreX) spots.push([x, 0.012, 1.55]);
  for (let x = -30; x <= 30; x += 3.4) { spots.push([x + rnd(-0.6, 0.6), 0.09, 1.35]); spots.push([x + 1.7 + rnd(-0.6, 0.6), 0.16, 1.35]); }
  const onProf = (s) => prof[Math.min(prof.length - 1, Math.floor(s * (prof.length - 1)))];
  const nWall = LOWQ ? 34 : 70;
  for (let i = 0; i < nWall; i++) spots.push([rnd(-34, 34), rnd(0.24, 0.8), rnd(1.25, 1.5)]);
  const pores = noPick(new THREE.InstancedMesh(poreGeometry(LOWQ), poreMat, spots.length));
  const MID = (IN1 + OUT0) / 2;
  spots.forEach(([x, s, k], i) => {
    const [pz, py, nz, ny] = onProf(s);
    const n = new THREE.Vector3(0, ny, nz);
    _p.set(x, py + bendY(x), pz).addScaledVector(n, MID);
    _q.setFromUnitVectors(UP, n);
    _s.setScalar(k);
    pores.setMatrixAt(i, _m.compose(_p, _q, _s));
  });
  group.add(pores);

  // Kromatin: nükleozom boncuklu ipler (bağlayıcı DNA + histon makaraları), çekirdek içinde arka planda
  const chromMat = tissue({ color: 0x6f64cf, veins: 0.2 });
  chromMat.side = THREE.DoubleSide;
  chromMat.emissive = new THREE.Color(0x1c1850); chromMat.emissiveIntensity = 0.6;
  // Bağlayıcı DNA: boncuklar arasındaki ince iplik; açık renkli ve hafif ışıyan doku (gölge atmaz, arka duvara kara iz düşürmez)
  const linkMat = tissue({ color: 0xa89cf0, veins: 0.05 });
  linkMat.emissive = new THREE.Color(0x3a3490); linkMat.emissiveIntensity = 0.7;
  const nucGeo = blobGeometry(0.26, { detail: LOWQ ? 1 : 2, amp: 0.12, freq: 2.0, seed: 9, stretch: [1, 0.62, 1] });
  const beads = [];
  const nF = LOWQ ? 6 : 11;
  for (let f = 0; f < nF; f++) {
    const pts = [];
    let p = new THREE.Vector3(rnd(-22, 22), rnd(6.5, 14), rnd(-7.4, -4.2));
    for (let k = 0; k < 7; k++) {
      pts.push(p.clone());
      p = p.clone().add(new THREE.Vector3(rnd(-2.6, 2.6), rnd(-1.4, 1.4), rnd(-1.0, 1.0)));
      p.y = THREE.MathUtils.clamp(p.y, 4.4, 16); p.z = THREE.MathUtils.clamp(p.z, -7.6, -3.6);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    group.add(noPick(new THREE.Mesh(new THREE.TubeGeometry(curve, 110, 0.085, 6, false), linkMat)));
    const len = curve.getLength(), nb = Math.floor(len / 0.5);
    for (let b = 0; b < nb; b++) {
      const t = (b + 0.5) / nb;
      beads.push([curve.getPointAt(t), curve.getTangentAt(t)]);
    }
  }
  const beadMesh = noPick(new THREE.InstancedMesh(nucGeo, chromMat, beads.length));
  beads.forEach(([p, t], i) => {
    _q.setFromUnitVectors(UP, t);
    _s.setScalar(rnd(0.85, 1.15));
    beadMesh.setMatrixAt(i, _m.compose(p, _q, _s));
  });
  beadMesh.userData.noCast = true;
  group.add(beadMesh);

  // Çekirdekçik: rRNA'nın üretildiği yoğun, granüllü bölge (sağ üst arkada)
  const nucleolus = noPick(new THREE.Mesh(blobGeometry(2.3, { detail: LOWQ ? 5 : 8, amp: 0.2, freq: 1.5, seed: 11, stretch: [1.25, 0.9, 0.8] }),
    (() => { const m = tissue({ color: 0x8a5ad8, veins: 0.15 }); m.emissive = new THREE.Color(0x2a1260); m.emissiveIntensity = 0.7; return m; })()));
  nucleolus.position.set(14, 11, -6.4);
  nucleolus.userData.noCast = true;
  group.add(nucleolus);
  // Granüler bileşen: yüzeyi kaplayan ribozom öncülü tanecikleri (yoğun, pürüzlü doku)
  {
    const NGr = LOWQ ? 140 : 320, gm = tissue({ color: 0xa47ae0, veins: 0.1 });
    gm.emissive = new THREE.Color(0x301868); gm.emissiveIntensity = 0.6;
    const gr = noPick(new THREE.InstancedMesh(blobGeometry(0.2, { detail: 1, amp: 0.25, freq: 3, seed: 21 }), gm, NGr));
    const v = new THREE.Vector3();
    for (let i = 0; i < NGr; i++) {
      v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();
      _p.set(v.x * 2.3 * 1.25, v.y * 2.3 * 0.9, v.z * 2.3 * 0.8).multiplyScalar(rnd(0.93, 1.08)).add(nucleolus.position);
      _q.setFromEuler(new THREE.Euler(rnd(0, 6), rnd(0, 6), 0)); _s.setScalar(rnd(0.7, 1.5));
      gr.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    gr.userData.noCast = true;
    group.add(gr);
  }

  // Sitoplazma: granüllü (ribozomlu) ER; üst üste dizilmiş, yassı ve dalgalı sarnıçlar (keseler), yüzeyleri ribozom tanecikli
  const erMat = tissue({ color: 0xc09ae8, veins: 0.3 });
  erMat.side = THREE.DoubleSide;
  erMat.emissive = new THREE.Color(0x4a2a88); erMat.emissiveIntensity = 0.55;
  const ribPts = [];
  const nStack = LOWQ ? 3 : 4;
  const LX = 3.4, LZ = 1.5, TH = 0.14;
  for (let st = 0; st < nStack; st++) {
    const sg = new THREE.Group();
    sg.position.set(-17 + (st * 34) / (nStack - 1) + rnd(-1.5, 1.5), rnd(-6.2, -4.2), rnd(-12, -8.5));
    sg.rotation.set(0.42, rnd(-0.5, 0.5), rnd(-0.12, 0.12));
    sg.updateMatrix();
    group.add(sg);
    const nLay = LOWQ ? 4 : 5;
    for (let lay = 0; lay < nLay; lay++) {
      const ph = rnd(0, 6), sc = 1 - Math.abs(lay - (nLay - 1) / 2) * 0.09, off = rnd(-0.4, 0.4);
      const wave = (x, z) => 0.22 * Math.sin(x * 0.85 + ph) + 0.08 * Math.sin(z * 2.1 + ph);
      const g = blobGeometry(1, { detail: LOWQ ? 4 : 5, amp: 0.2, freq: 1.2, seed: st * 7 + lay, stretch: [LX * sc, TH, LZ * sc] });
      const pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) pa.setY(i, pa.getY(i) + wave(pa.getX(i), pa.getZ(i)));
      g.computeVertexNormals();
      g.translate(off, lay * 0.46, 0);
      const cis = noPick(new THREE.Mesh(g, erMat));
      sg.add(cis);
      for (let r = 0; r < (LOWQ ? 22 : 40); r++) {
        const u = rnd(-0.92, 0.92), v = rnd(-0.85, 0.85);
        if (u * u + v * v > 0.8) continue;
        const x = u * LX * sc, z = v * LZ * sc;
        const y = wave(x, z) + TH * Math.sqrt(Math.max(0, 1 - u * u - v * v)) + 0.1;
        ribPts.push(new THREE.Vector3(x + off, y + lay * 0.46 + (Math.random() < 0.5 ? 0 : -2 * (y - wave(x, z))), z).applyMatrix4(sg.matrix));
      }
    }
  }
  // Serbest ribozomlar sitoplazmada, ER üzerindekilerle birlikte tek örnekli ağ
  for (let i = 0; i < (LOWQ ? 30 : 70); i++) ribPts.push(new THREE.Vector3(rnd(-24, 24), rnd(-7, 1.6), rnd(-12, -3)));
  const ribMat = tissue({ color: 0xc09af0, veins: 0.1 });
  ribMat.emissive = new THREE.Color(0x3a2070); ribMat.emissiveIntensity = 0.6;
  const rib = noPick(new THREE.InstancedMesh(blobGeometry(0.14, { detail: 1, amp: 0.25, freq: 2.6, seed: 5 }), ribMat, ribPts.length));
  ribPts.forEach((p, i) => {
    _q.setFromEuler(new THREE.Euler(rnd(0, 6), rnd(0, 6), 0));
    _s.setScalar(rnd(0.8, 1.4));
    rib.setMatrixAt(i, _m.compose(p, _q, _s));
  });
  rib.userData.noCast = true;
  group.add(rib);

  // Polizomlar: sitoplazmada bir mRNA ipliği boyunca dizilmiş ribozomlar (büyük + küçük alt birim), arka planda
  {
    const rg = BufferGeometryUtils.mergeGeometries([
      blobGeometry(0.3, { detail: 2, amp: 0.2, freq: 2.4, seed: 31 }).scale(1.2, 0.85, 1),
      blobGeometry(0.2, { detail: 2, amp: 0.2, freq: 2.6, seed: 32 }).scale(1.3, 0.7, 1).translate(0, -0.34, 0.02),
    ]);
    const sm = tissue({ color: 0xe0b870, veins: 0.1 });
    sm.emissive = new THREE.Color(0x4a3010); sm.emissiveIntensity = 0.5;
    const where = [];
    const NPol = LOWQ ? 5 : 8;
    for (let k = 0; k < NPol; k++) {
      const c = new THREE.Vector3(-20 + (40 * (k + 0.5)) / NPol + rnd(-2, 2), rnd(-6.5, 0.8), rnd(-7, -3.2));
      const pts = [];
      for (let i = 0; i < 6; i++) pts.push(c.clone().add(new THREE.Vector3(Math.cos(i * 1.1 + k) * 1.3 + i * 0.3, Math.sin(i * 0.9 + k) * 0.9, Math.sin(i * 1.3) * 0.6)));
      const curve = new THREE.CatmullRomCurve3(pts);
      group.add(noPick(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.035, 5, false), sm)));
      const nr = 5 + (k % 3);
      for (let i = 0; i < nr; i++) where.push([curve.getPointAt((i + 0.5) / nr), curve.getTangentAt((i + 0.5) / nr)]);
    }
    const rm = tissue({ color: 0xb58ef0, veins: 0.15 });
    rm.emissive = new THREE.Color(0x3a2070); rm.emissiveIntensity = 0.55;
    const pol = noPick(new THREE.InstancedMesh(rg, rm, where.length));
    where.forEach(([p, t], i) => { _q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), t); _s.setScalar(rnd(0.9, 1.1)); pol.setMatrixAt(i, _m.compose(p, _q, _s)); });
    pol.userData.noCast = true;
    group.add(pol);
  }
  // Uzak organeller: mitokondriler (iç zar kıvrımları yüzeyde oluklar olarak) ve taşıma kesecikleri
  {
    const mitoMat = procedural({
      key: 'dna-mito', physical: true, bump: 0.08,
      params: { color: 0xffffff, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: new THREE.Color(0xffb0c8) },
      uniforms: { uA: { value: new THREE.Color(0x9a3a62) }, uB: { value: new THREE.Color(0xf0a0b8) } },
      pattern: `
        float n = fbm3(p*0.9 + seed*2.0, 3);
        float cr = 0.5 + 0.5*sin(p.x*4.5 + n*2.5);
        cr = smoothstep(0.35, 0.9, cr);
        col = mix(uA, uB, 0.35 + 0.5*cr)*(0.85 + 0.2*n);
        rough = 0.4 + 0.25*(1.0 - cr);
        h = cr*0.6 + n*0.2;`,
    });
    mitoMat.emissive = new THREE.Color(0x4a1030); mitoMat.emissiveIntensity = 0.45;
    const spotsM = [[-22, -2.8, -15], [-6, -7.2, -17], [9, -3.4, -16], [21, -6.5, -13], [-12, -0.6, -19], [15, 0.2, -20]];
    spotsM.slice(0, LOWQ ? 4 : 6).forEach(([x, y, z], k) => {
      const m = noPick(new THREE.Mesh(blobGeometry(1, { detail: LOWQ ? 4 : 6, amp: 0.1, freq: 1.1, seed: 40 + k, stretch: [2.4, 0.95, 1] }), mitoMat));
      m.position.set(x, y, z);
      m.rotation.set(rnd(-0.4, 0.4), rnd(-0.8, 0.8), rnd(-0.5, 0.5));
      m.scale.setScalar(rnd(0.9, 1.25));
      group.add(m);
    });
    const vesMat = tissue({ color: 0x9fd0e8, veins: 0.05 });
    vesMat.emissive = new THREE.Color(0x1a4a68); vesMat.emissiveIntensity = 0.5;
    const NV = LOWQ ? 14 : 26;
    const ves = noPick(new THREE.InstancedMesh(blobGeometry(1, { detail: 3, amp: 0.06, freq: 1.5, seed: 50 }), vesMat, NV));
    for (let i = 0; i < NV; i++) {
      _p.set(rnd(-24, 24), rnd(-8, 1.2), rnd(-16, -4));
      _q.identity(); _s.setScalar(rnd(0.22, 0.55));
      ves.setMatrixAt(i, _m.compose(_p, _q, _s));
    }
    group.add(ves);
  }

  // Hücre iskeleti: kalın, düz mikrotübüller (taşıma rayları) ve ince, kıvrımlı aktin iplikleri sitoplazmayı çaprazlar
  {
    const mtMat = tissue({ color: 0x86d8cc, veins: 0.05 });
    mtMat.emissive = new THREE.Color(0x1a5a50); mtMat.emissiveIntensity = 0.6;
    const acMat = tissue({ color: 0xe0a6d8, veins: 0.05 });
    acMat.emissive = new THREE.Color(0x5a2a58); acMat.emissiveIntensity = 0.6;
    const mts = [], acs = [];
    const NMT = LOWQ ? 5 : 8;
    for (let i = 0; i < NMT; i++) {
      const z = rnd(-15, -5), y0 = rnd(-9, -2), y1 = rnd(-4, 1.8);
      const a = new THREE.Vector3(rnd(-30, -10), y0, z), b = new THREE.Vector3(rnd(10, 30), y1, z + rnd(-3, 3));
      if (i % 2) { a.x *= -1; b.x *= -1; }
      const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, rnd(-1.2, 1.2), rnd(-1.5, 1.5)));
      mts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, mid, b]), 60, 0.12, 8, false));
    }
    const NAC = LOWQ ? 8 : 14;
    for (let i = 0; i < NAC; i++) {
      const pts = [], p = new THREE.Vector3(rnd(-26, 26), rnd(-8, 1.5), rnd(-13, -4));
      const dir = new THREE.Vector3(rnd(-1, 1), rnd(-0.4, 0.4), rnd(-0.4, 0.4)).normalize();
      for (let k = 0; k < 7; k++) {
        pts.push(p.clone());
        p.addScaledVector(dir, rnd(1.2, 2.2)).add(new THREE.Vector3(rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(-0.5, 0.5)));
        p.y = Math.min(p.y, 1.8);
      }
      acs.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 0.04, 5, false));
    }
    group.add(noPick(new THREE.Mesh(clean(mts), mtMat)), noPick(new THREE.Mesh(clean(acs), acMat)));
  }

  // Sitoplazmanın dibi: hücre zarının iç yüzü (korteks); lifli, yumuşak ışıklı zemin sisle uzakta kaybolur
  {
    const cg = new THREE.PlaneGeometry(130, 80, LOWQ ? 70 : 120, LOWQ ? 44 : 72).rotateX(-Math.PI / 2);
    const pa = cg.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i), z = pa.getZ(i);
      pa.setY(i, 0.9 * fbm(x * 0.09, z * 0.09, 3.1, 3) + 0.25 * fbm(x * 0.3, z * 0.3, 7.7, 2));
    }
    cg.computeVertexNormals();
    const cortex = procedural({
      key: 'dna-cortex', physical: true, bump: 0.12,
      params: { color: 0xffffff, roughness: 0.6, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xb0a0f0) },
      uniforms: { uA: { value: new THREE.Color(0x2e2a70) }, uB: { value: new THREE.Color(0x6454a8) } },
      pattern: `
        float n = fbm3(p*0.12 + seed, 3);
        float fib = pow(ridge3(p*vec3(0.55, 0.55, 0.9) + n*1.5), 6.0);
        float fine = vn3(p*3.0);
        col = mix(uA, uB, 0.3 + 0.5*n + 0.35*fib)*(0.9 + 0.12*(fine - 0.5));
        rough = 0.55 + 0.2*(1.0 - fib);
        h = n*0.4 + fib*0.5 + fine*0.1;`,
    });
    const floor = noPick(new THREE.Mesh(cg, cortex));
    floor.position.set(0, -9.2, -24);
    floor.receiveShadow = false;   // sarmalın ve ipliklerin gölgesi zar altındaki zemine düşmesin
    group.add(floor);
  }

  // Hacim pusu: iri, soluk yumuşak lekeler; çekirdekte mavi, sitoplazmada mor/turkuaz ve dibe doğru daha aydınlık
  {
    const NH = LOWQ ? 40 : 64, hp = new Float32Array(NH * 3), hc = new Float32Array(NH * 3);
    const cN = new THREE.Color(0x3a56b0), cC = new THREE.Color(0x6a3a9a), cT = new THREE.Color(0x2a6a8a), cL = new THREE.Color(0x7a5ab8);
    for (let i = 0; i < NH; i++) {
      const kind = i % 4;
      let c;
      if (kind === 0) { hp[i * 3 + 1] = rnd(5, 13); hp[i * 3 + 2] = rnd(-7, -2); c = cN; }
      else if (kind === 3) { hp[i * 3 + 1] = rnd(-8.5, -5.5); hp[i * 3 + 2] = rnd(-22, -4); c = cL; }
      else { hp[i * 3 + 1] = rnd(-6, 1.2); hp[i * 3 + 2] = rnd(-16, -3); c = kind === 1 ? cC : cT; }
      hp[i * 3] = rnd(-26, 26);
      hc[i * 3] = c.r; hc[i * 3 + 1] = c.g; hc[i * 3 + 2] = c.b;
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    hg.setAttribute('color', new THREE.BufferAttribute(hc, 3));
    const haze = noPick(new THREE.Points(hg, new THREE.PointsMaterial({ map: softDot(), size: 11, vertexColors: true, transparent: true, opacity: 0.11,
      depthWrite: false, blending: THREE.AdditiveBlending })));
    haze.frustumCulled = false; haze.renderOrder = -5;
    group.add(haze);
  }

  // Serbest nükleotitler (ATP/GTP/CTP/UTP): çekirdekte, DNA çevresinde yumuşak parıltılar
  const NN = LOWQ ? 160 : 380;
  const nPos = new Float32Array(NN * 3), nCol = new Float32Array(NN * 3), nVel = new Float32Array(NN * 3);
  const pal = [0x22c55e, 0xeab308, 0x3b82f6, 0xf97316].map((h) => new THREE.Color(h).multiplyScalar(1.6));
  for (let i = 0; i < NN; i++) {
    nPos[i * 3] = rnd(-16, 16); nPos[i * 3 + 1] = rnd(3.2, 9.5); nPos[i * 3 + 2] = rnd(-3.2, 3.5);
    const c = pal[i % 4];
    nCol[i * 3] = c.r; nCol[i * 3 + 1] = c.g; nCol[i * 3 + 2] = c.b;
    nVel[i * 3] = rnd(-0.12, 0.12); nVel[i * 3 + 1] = rnd(-0.08, 0.08); nVel[i * 3 + 2] = rnd(-0.1, 0.1);
  }
  const ng = new THREE.BufferGeometry();
  ng.setAttribute('position', new THREE.BufferAttribute(nPos, 3).setUsage(THREE.DynamicDrawUsage));
  ng.setAttribute('color', new THREE.BufferAttribute(nCol, 3));
  const ntp = noPick(new THREE.Points(ng, new THREE.PointsMaterial({ map: softDot(), size: 0.16, vertexColors: true, transparent: true, opacity: 0.8,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
  ntp.frustumCulled = false;
  group.add(ntp);

  // Ön plan: kameraya yakın, odak dışı iri yumuşak lekeler (alan derinliği hissi)
  const NB = LOWQ ? 18 : 30;
  const bPos = new Float32Array(NB * 3);
  for (let i = 0; i < NB; i++) { bPos[i * 3] = rnd(-14, 14); bPos[i * 3 + 1] = rnd(-5, 10); bPos[i * 3 + 2] = rnd(7, 13); }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  const bokeh = noPick(new THREE.Points(bg, new THREE.PointsMaterial({ map: softDot(), size: 1.3, color: new THREE.Color(0.35, 0.42, 0.9), transparent: true,
    opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })));
  bokeh.frustumCulled = false;
  group.add(bokeh);

  group.traverse((o) => { if (o.isMesh) o.userData.noCast = true; });

  let time = 0;
  return {
    group, pores,
    update(dt) {
      time += dt;
      for (let i = 0; i < NN; i++) {
        const o = i * 3;
        nPos[o] += (nVel[o] + 0.05 * Math.sin(time * 0.7 + i)) * dt;
        nPos[o + 1] += (nVel[o + 1] + 0.04 * Math.cos(time * 0.9 + i * 1.3)) * dt;
        nPos[o + 2] += nVel[o + 2] * dt;
        if (nPos[o] > 16) nPos[o] = -16; else if (nPos[o] < -16) nPos[o] = 16;
        if (nPos[o + 1] > 9.5 || nPos[o + 1] < 3.2) nVel[o + 1] *= -1;
        if (nPos[o + 2] > 3.5 || nPos[o + 2] < -3.2) nVel[o + 2] *= -1;
      }
      ng.attributes.position.needsUpdate = true;
      bokeh.rotation.y = Math.sin(time * 0.05) * 0.02;
    },
  };
}
