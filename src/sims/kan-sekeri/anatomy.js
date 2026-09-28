// Karın içi kesit sahnesi: karaciğer, mide, pankreas (Langerhans adacıklarıyla), on iki parmak bağırsağı, ince bağırsak,
// dalak, böbrekler, iskelet kası ve açık kesilmiş portal ven. Glukoz/insülin akışı parlayan parçacık akımlarıyla gösterilir.
// Birim ≈ 10 cm (dm): karaciğer ~26 cm, pankreas ~15 cm; damar kesiti okunabilsin diye büyütülmüştür.
import { THREE, procedural, mat, clamp, lerp } from '@core';
import { darkMedium, blobGeometry, loftTube, halfTube, rbcGeometry, softDot, fbm, n3, sdfMesh, sEllipsoid, sPlane } from './bio.js';

const V = (a) => new THREE.Vector3(...a);
const curve = (pts, closed = false) => new THREE.CatmullRomCurve3(pts.map(V), closed, 'centripetal');

/** Islak organ yüzeyi: düşük frekanslı ton, lobül hücre deseni, ince damarlar, parlak seröz zar (clearcoat) */
function organMat({ color, color2 = color, cells = 0, cellF = 6, veins = 0.4, veinCol = 0x3a0810, rough = 0.38, key, sheen = 0.35, cc = 0.55, ccr = 0.3 }) {
  return procedural({
    key: 'ks-organ-' + key, physical: true, bump: 0.035,
    params: { color: 0xffffff, roughness: rough, clearcoat: cc, clearcoatRoughness: ccr, side: THREE.DoubleSide, sheen, sheenRoughness: 0.4, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.45) },
    uniforms: { uA: { value: new THREE.Color(color) }, uB: { value: new THREE.Color(color2) }, uV: { value: new THREE.Color(veinCol) }, uCells: { value: cells }, uCellF: { value: cellF }, uVeins: { value: veins } },
    pattern: `
      float n = fbm3(p*1.2 + seed*5.0, 4), f = vn3(p*9.0);
      float c = cells3(p*uCellF + n*0.6);
      float lob = smoothstep(0.05, 0.4, c);
      float v1 = pow(ridge3(p*1.05 + n*0.9), 18.0), v2 = pow(ridge3(p*2.4 + n*1.4 + 7.0), 22.0);
      col = mix(uA, uB, smoothstep(0.3, 0.75, n))*(0.78 + 0.4*n + 0.05*(f - 0.5));
      col *= 1.0 - uCells*0.35*(1.0 - lob);
      col = mix(col, uV, clamp(v1 + 0.6*v2, 0.0, 1.0)*uVeins);
      rough = clamp(rough + 0.12*(n - 0.5) + uCells*0.1*(1.0 - lob), 0.15, 0.9);
      h = n*0.45 + lob*uCells*0.35 + (v1 + v2*0.5)*0.35*uVeins + f*0.05;`,
  });
}

/** Parlayan parçacık akımı: eğri boyunca akan yumuşak noktalar; görünür sayı drawRange ile */
function stream(parent, n, color, size, { curve: c = null, radius = 0.05, speed = 0.08 } = {}) {
  const pos = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setDrawRange(0, 0);
  const m = new THREE.PointsMaterial({ map: softDot(), color: new THREE.Color(color), size, sizeAttenuation: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false; pts.raycast = () => {};
  parent.add(pts);
  const off = Array.from({ length: n }, () => [Math.random(), Math.random() * Math.PI * 2, Math.sqrt(Math.random()), 0.7 + Math.random() * 0.6]);
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
  return {
    pts, mat: m, curve: c,
    update(time, count, dir = 1) {
      const k = Math.max(0, Math.min(n, Math.round(count)));
      g.setDrawRange(0, k);
      if (!k || !c) return;
      for (let i = 0; i < k; i++) {
        const o = off[i];
        let u = (o[0] + dir * time * speed * o[3]) % 1; if (u < 0) u += 1;
        c.getPointAt(u, P); c.getTangentAt(u, T);
        N1.crossVectors(T, up); if (N1.lengthSq() < 1e-6) N1.set(1, 0, 0); N1.normalize(); N2.crossVectors(T, N1);
        const a = o[1] + time * 0.7 * o[3], r = radius * o[2];
        pos[i * 3] = P.x + (Math.cos(a) * N1.x + Math.sin(a) * N2.x) * r;
        pos[i * 3 + 1] = P.y + (Math.cos(a) * N1.y + Math.sin(a) * N2.y) * r;
        pos[i * 3 + 2] = P.z + (Math.cos(a) * N1.z + Math.sin(a) * N2.z) * r;
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

export function buildAnatomy(sim, LOWQ) {
  const scene = sim.scene;
  darkMedium(sim, { top: 0x2e2a36, bottom: 0x0a0a10, glow: 0x4a4a66, glowDir: [0.5, 0.7, -0.5], tint: 0x2a3450, fog: 0x121218,
    density: 0.035, motes: LOWQ ? 160 : 320, box: [14, 9, 9], center: [0, 0, 0], moteColor: 0xffd2c0, moteColor2: 0xfff0b0, moteSize: 0.09, moteOpacity: 0.25 });
  const root = new THREE.Group();
  scene.add(root);
  // Serin kenar ışığı (arkadan-üstten): organların sıcak kırmızı kütlesini arka plandan ayırır
  const rim = new THREE.DirectionalLight(0xa8c4ff, 1.4);
  rim.position.set(-3, 5, -6); rim.target.position.set(0, 0.5, 0);
  scene.add(rim, rim.target);
  const DET = LOWQ ? 14 : 22;
  const shape = (g, f) => { const p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); f(v); p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return g; };
  const add = (geo, m, pos = [0, 0, 0], rot = [0, 0, 0], parent = root) => { const o = new THREE.Mesh(geo, m); o.position.fromArray(pos); o.rotation.set(...rot); parent.add(o); return o; };

  // --- Arka karın duvarı (periton): kavisli, damarlı, yağlı doku perdesi — boşluk yok ---
  {
    const g = new THREE.PlaneGeometry(22, 13, 110, 65);
    shape(g, (v) => { const r2 = v.x * v.x * 0.012 + v.y * v.y * 0.02; v.z = -2.9 + r2 * 2.2 + 0.25 * fbm(v.x * 0.35, v.y * 0.35, 1.7, 4); });
    const wall = add(g, organMat({ key: 'wall', color: 0x4a3c46, color2: 0x6e5a5c, cells: 0, cellF: 1.6, veins: 0.12, veinCol: 0x8a3a40, rough: 0.5, cc: 0.25, ccr: 0.45, sheen: 0.45 }));
    wall.userData.noCast = true;
  }

  // Diyafram kasıtlı olarak çizilmiyor: kamera karın boşluğunun içinden baktığı için tavan ya kadrajı kesen bir şerit
  // ya da ışık almayan karanlık bir bant olarak görünüyordu; organların anatomik yerleşimi diyafram olmadan da okunuyor.
  // --- Karaciğer: büyük sağ lob (izleyicinin solunda), mideye uzanan ince sol lob; üstü kubbe (diyafram yüzü),
  // altı arkaya bakan düz/içbükey iç organ yüzü; önde keskin alt kenar, orak bağ ve ligamentum teres çentiği
  const liverGeo = sdfMesh([
    { p: [sEllipsoid([-0.55, 0.02, 0], [0.98, 0.66, 0.74], [0, 0, 0.12]), sEllipsoid([0.86, 0.12, -0.02], [1.02, 0.29, 0.52], [0, 0.1, -0.16])], k: 0.32 },
    { p: sPlane([0, -1, -0.75], 0.02), op: 'cut' },
    { p: sEllipsoid([0.12, -0.12, 0.62], [0.07, 0.26, 0.2]), op: 'sub', k: 0.06 },
  ], { cell: LOWQ ? 0.045 : 0.03, noiseAmp: 0.008, noiseFreq: 3 });
  const liverMat = organMat({ key: 'liver', color: 0x5c2012, color2: 0x86381c, cells: 0.18, cellF: 5, veins: 0.08, veinCol: 0x3a0a06, rough: 0.55, cc: 0.18, ccr: 0.65, sheen: 0.2 });
  // Sağ diyafram kubbesinin altında; sol lob midenin ön-üst yüzüne yaslanır, safra kesesi keskin alt kenarın altında
  const liver = add(liverGeo, liverMat, [-1.0, 1.52, 0.12], [0.16, -0.2, -0.06]);
  liver.scale.setScalar(1.08);
  // Orak bağ (falciform): iki lob arasında, diyafram yüzünden öne uzanan ince, yarı saydam periton katlantısı
  {
    const fg = new THREE.CircleGeometry(0.5, 32, 0, Math.PI).rotateY(Math.PI / 2).scale(1, 0.75, 1.1);
    const fm = new THREE.MeshPhysicalMaterial({ color: 0xf0d0c0, roughness: 0.3, transparent: true, opacity: 0.45, clearcoat: 1, clearcoatRoughness: 0.15, side: THREE.DoubleSide, depthWrite: false });
    const fal = add(fg, fm, [0.12, 0.42, 0.28], [0.35, 0, 0], liver);
    fal.userData.noCast = true;
  }
  // Safra kesesi
  const gb = add(shape(blobGeometry(0.2, { detail: 8, amp: 0.05, seed: 4, stretch: [0.8, 1.6, 0.8] }), (v) => { if (v.y < 0) { v.x *= 1 + v.y; v.z *= 1 + v.y; } }),
    organMat({ key: 'gb', color: 0x3c7a36, color2: 0x86a83a, veins: 0.2, veinCol: 0x1e4a1a, rough: 0.3, cc: 0.6, ccr: 0.35 }), [-0.95, 0.78, 0.62], [0.55, 0, 0.45]);
  gb.scale.setScalar(1.25);

  // --- Mide: J biçimli kese ---
  const stomachCurve = curve([[1.35, 2.05, -0.45], [1.6, 1.45, -0.05], [1.2, 0.85, 0.25], [0.45, 0.62, 0.35], [-0.15, 0.72, 0.3]]);
  const stomachMat = organMat({ key: 'stomach', color: 0xe29aa0, color2: 0xf2c2ae, veins: 0.25, veinCol: 0x9a3040, rough: 0.42, cc: 0.35, ccr: 0.4 });
  const stomach = add(loftTube(stomachCurve, (t) => 0.13 + 0.5 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.95)) ** 0.8, { segs: 64, radial: 36, noiseAmp: 0.025, noiseFreq: 2.5 }), stomachMat);

  // --- On iki parmak bağırsağı (C kıvrımı) ---
  const duoCurve = curve([[-0.15, 0.72, 0.3], [-0.75, 0.55, 0.35], [-1.15, 0.05, 0.3], [-1.0, -0.55, 0.3], [-0.35, -0.7, 0.3], [0.25, -0.55, 0.15]]);
  const gutMat = organMat({ key: 'gut', color: 0xd88a80, color2: 0xecb09a, veins: 0.55, veinCol: 0x6a1428, rough: 0.32 });
  const duo = add(loftTube(duoCurve, () => 0.17, { segs: 90, radial: 24, noiseAmp: 0.03, noiseFreq: 5 }), gutMat);

  // --- Pankreas: baş C kıvrımının içinde, gövde ve kuyruk dalağa uzanır; loblu yüzey (örnekli lobüller) ---
  const pancCurve = curve([[-0.75, -0.1, 0.35], [-0.2, 0.0, 0.3], [0.6, 0.02, -0.02], [1.4, 0.38, -0.42], [2.1, 0.78, -0.72]]);
  const pancR = (t) => 0.3 * (1 - t) + 0.13 * t + 0.06 * Math.exp(-((t - 0.05) ** 2) / 0.005);
  const pancMat = organMat({ key: 'panc', color: 0xe8b894, color2: 0xf6dcb0, cells: 0.6, cellF: 16, veins: 0.2, veinCol: 0x9a4a3a, rough: 0.45, cc: 0.35, ccr: 0.4 });
  const pancCore = add(loftTube(pancCurve, (t) => pancR(t) * 0.82, { segs: 80, radial: 24, noiseAmp: 0.04, noiseFreq: 6 }), pancMat);
  const NL = LOWQ ? 420 : 900;
  const lobGeo = blobGeometry(1, { detail: 3, amp: 0.2, freq: 2, seed: 1 });
  const lobes = new THREE.InstancedMesh(lobGeo, pancMat, NL);
  {
    const m = new THREE.Matrix4(), P = new THREE.Vector3(), T = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
    for (let i = 0; i < NL; i++) {
      const t = Math.random(), a = Math.random() * Math.PI * 2;
      pancCurve.getPointAt(t, P); pancCurve.getTangentAt(t, T);
      N1.crossVectors(T, new THREE.Vector3(0, 0, 1)).normalize(); N2.crossVectors(T, N1);
      const r = pancR(t) * (0.78 + Math.random() * 0.12);
      P.addScaledVector(N1, Math.cos(a) * r).addScaledVector(N2, Math.sin(a) * r);
      const k = pancR(t) * (0.22 + Math.random() * 0.2);
      s.set(k, k * (0.7 + Math.random() * 0.4), k * (0.8 + Math.random() * 0.4));
      q.setFromEuler(e.set(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      lobes.setMatrixAt(i, m.compose(P, q, s));
    }
  }
  root.add(lobes);
  // Langerhans adacıkları: pankreas yüzeyinde insülin salgıladıkça parlayan küçük hücre kümeleri
  const NI = 38;
  const isleMat = new THREE.MeshStandardMaterial({ color: 0x2a1030, emissive: 0xb07aff, emissiveIntensity: 0.3, roughness: 0.4 });
  const isles = new THREE.InstancedMesh(blobGeometry(1, { detail: 2, amp: 0.25, seed: 6 }), isleMat, NI);
  const islePos = [];
  {
    const m = new THREE.Matrix4(), P = new THREE.Vector3(), T = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3();
    for (let i = 0; i < NI; i++) {
      const t = 0.15 + 0.8 * (i / NI) + Math.random() * 0.02, a = Math.PI * (0.15 + Math.random() * 0.8); // ön-üst yüz
      pancCurve.getPointAt(t, P); pancCurve.getTangentAt(t, T);
      N1.crossVectors(T, new THREE.Vector3(0, 0, 1)).normalize(); N2.crossVectors(T, N1);
      if (N2.z < 0) N2.negate();
      P.addScaledVector(N1, Math.cos(a) * pancR(t) * 0.95).addScaledVector(N2, Math.sin(a) * pancR(t) * 0.95);
      const k = 0.025 + Math.random() * 0.02;
      isles.setMatrixAt(i, m.makeScale(k, k, k).setPosition(P));
      islePos.push(P.clone());
    }
  }
  isles.userData.noCast = true;
  root.add(isles);

  // --- Dalak ---
  add(shape(blobGeometry(0.5, { detail: DET >> 1, amp: 0.08, seed: 11, stretch: [0.55, 1.1, 0.8] }), (v) => { if (v.x > 0) v.x *= 0.5; }),
    organMat({ key: 'spleen', color: 0x5a1a3c, color2: 0x80305a, cells: 0.2, cellF: 10, veins: 0.2, rough: 0.35, cc: 0.4, ccr: 0.4 }), [2.4, 1.25, -0.85], [0, 0.5, -0.25]);

  // --- Böbrekler (arkada, yağ kapsülü içinde) ---
  const kidneys = [[-1.75, -0.35, -1.45, 1], [2.05, -0.05, -1.5, -1]].map(([x, y, z, s]) => add(shape(blobGeometry(0.42, { detail: DET >> 1, amp: 0.04, seed: 8 + s, stretch: [0.65, 1.2, 0.5] }),
    (v) => { const inner = Math.max(0, s * v.x) / 0.27; v.x -= s * 0.1 * Math.exp(-(v.y * v.y) / 0.02) * inner; }), organMat({ key: 'kidney' + s, color: 0x7a2a1e, color2: 0x9a4228, veins: 0.3, rough: 0.34, cc: 0.4, ccr: 0.4 }), [x, y, z], [0, -s * 0.5, s * 0.15]));

  // --- Büyük damarlar (arkada): aort ve alt ana toplardamar ---
  const aortaMat = organMat({ key: 'aorta', color: 0xc0302c, color2: 0xe06050, veins: 0.1, veinCol: 0x7a1010, rough: 0.32, cc: 0.7, ccr: 0.3, sheen: 0.5 });
  const ivcMat = organMat({ key: 'ivc', color: 0x34448e, color2: 0x5a6cc0, veins: 0.1, veinCol: 0x1a2050, rough: 0.32, cc: 0.7, ccr: 0.3, sheen: 0.5 });
  add(loftTube(curve([[0.45, 3.4, -1.6], [0.4, 1.2, -1.45], [0.35, -1.0, -1.4], [0.4, -3.2, -1.5]]), () => 0.24, { segs: 40, radial: 24, caps: false }), aortaMat);
  add(loftTube(curve([[-0.45, 3.4, -1.55], [-0.5, 1.2, -1.45], [-0.45, -1.0, -1.45], [-0.5, -3.2, -1.5]]), () => 0.28, { segs: 40, radial: 24, caps: false }),
    ivcMat);
  // Böbrek atardamarları (aorttan) ve toplardamarları (alt ana toplardamara)
  for (const [x, y, z, s] of [[-1.75, -0.35, -1.45, 1], [2.05, -0.05, -1.5, -1]]) {
    const kx = x + s * 0.22;
    add(loftTube(curve([[0.4, y + 0.12, -1.42], [(0.4 + kx) / 2, y + 0.18, -1.35], [kx, y + 0.06, z + 0.05]]), () => 0.07, { segs: 24, radial: 10 }), aortaMat);
    add(loftTube(curve([[-0.45, y - 0.08, -1.42], [(-0.45 + kx) / 2, y - 0.1, -1.3], [kx, y - 0.1, z + 0.1]]), () => 0.085, { segs: 24, radial: 10 }), ivcMat);
  }

  // --- İnce bağırsak kıvrımları (altta, önde) ---
  const loops = [];
  const ribbon = [];
  for (let row = 0; row < 4; row++) {
    const y = -1.15 - row * 0.42, z = 0.55 - row * 0.05, dir = row % 2 ? -1 : 1;
    for (let i = 0; i <= 26; i++) {
      const f = i / 26, x = dir * lerp(-2.3, 2.0, f);
      ribbon.push([x, y + 0.14 * Math.sin(f * 17 + row) + 0.05 * row * Math.sin(f * 5), z + 0.22 * Math.sin(f * 11 + row * 2)]);
    }
  }
  const gutCurve = curve(ribbon);
  const gut = add(loftTube(gutCurve, () => 0.19, { segs: LOWQ ? 260 : 420, radial: 20, noiseAmp: 0.03, noiseFreq: 4 }), organMat({ key: 'gut2', color: 0xd08078, color2: 0xe8a894, veins: 0.6, veinCol: 0x6a1428, rough: 0.32 }));
  gut.position.set(0, -0.15, -0.25);
  gut.material.emissive = new THREE.Color(0xffb347); gut.material.emissiveIntensity = 0;
  loops.push(gut);
  // Mezenter yağ damlacıkları (bağırsak ve pankreas çevresi)
  {
    const NF = LOWQ ? 90 : 180;
    const fat = new THREE.InstancedMesh(blobGeometry(1, { detail: 3, amp: 0.2, seed: 3 }), organMat({ key: 'fat', color: 0xd8a848, color2: 0xf0d080, cells: 0.3, cellF: 14, veins: 0.2, veinCol: 0x9a3020, rough: 0.3 }), NF);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), P = new THREE.Vector3();
    for (let i = 0; i < NF; i++) {
      const band = Math.random();
      if (band < 0.55) P.set(lerp(-2.6, 2.6, Math.random()), lerp(-0.95, -2.8, Math.random()), lerp(-0.4, 0.2, Math.random()));
      else P.set(lerp(-1.6, 2.4, Math.random()), lerp(-0.2, 0.7, Math.random()), lerp(-0.7, -0.1, Math.random()));
      const k = 0.08 + Math.random() * 0.14;
      s.set(k, k * (0.7 + Math.random() * 0.3), k);
      fat.setMatrixAt(i, m.compose(P, q.setFromEuler(e.set(Math.random() * 3, Math.random() * 3, 0)), s));
    }
    root.add(fat);
  }

  // --- İskelet kası (sağ önde): liflerden örülmüş demet, kesik ucunda fasikül dokusu görünür ---
  const muscle = new THREE.Group();
  muscle.position.set(3.5, -1.1, 0.2);
  muscle.scale.setScalar(0.85);
  muscle.rotation.set(0.25, 0.3, -0.2);
  root.add(muscle);
  const fibMat = procedural({
    key: 'ks-fiber', physical: true, bump: 0.03,
    params: { color: 0xffffff, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.4, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xff9080), side: THREE.DoubleSide },
    pattern: `
      float st = sin(p.y*260.0)*0.5 + 0.5;
      float n = fbm3(p*vec3(3.0, 0.4, 3.0) + seed*9.0, 4);
      col = vec3(0.42, 0.05, 0.05)*(0.7 + 0.5*n)*(0.85 + 0.2*mix(0.5, st, 0.6)) * (0.8 + 0.4*seed);
      rough = 0.35 + 0.15*n;
      h = n*0.4 + st*0.15;`,
  });
  fibMat.emissive = new THREE.Color(0xffc060); fibMat.emissiveIntensity = 0;
  const NFB = LOWQ ? 40 : 70;
  const fibGeo = loftTube(new THREE.LineCurve3(V([0, -1.6, 0]), V([0, 1.6, 0])), (t) => 0.5 + 0.5 * Math.sin(Math.PI * t) ** 0.5, { segs: 24, radial: 10, caps: true });
  const fibers = new THREE.InstancedMesh(fibGeo, fibMat, NFB);
  const fibBase = [];
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < NFB; i++) {
      const a = i * 2.39996, r = 0.42 * Math.sqrt((i + 0.5) / NFB);
      const k = 0.07 + Math.random() * 0.03;
      fibBase.push([Math.cos(a) * r, (Math.random() - 0.5) * 0.25, Math.sin(a) * r, k, Math.random() * 0.2 - 0.1]);
      m.makeScale(k, 1, k).setPosition(Math.cos(a) * r, 0, Math.sin(a) * r);
      fibers.setMatrixAt(i, m);
    }
  }
  muscle.add(fibers);
  // Kas zarı (epimisyum): yarı saydam parlak kılıf
  const sheath = new THREE.Mesh(loftTube(new THREE.LineCurve3(V([0, -1.55, 0]), V([0, 1.55, 0])), () => 0.56, { segs: 8, radial: 32, caps: false }),
    new THREE.MeshPhysicalMaterial({ color: 0xf6d8d0, roughness: 0.25, transparent: true, opacity: 0.1, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  sheath.userData.noCast = true;
  muscle.add(sheath);

  // --- Kahraman damar: açık kesilmiş portal ven (bağırsaktan karaciğere) ---
  const portal = curve([[2.6, -1.25, 1.15], [1.3, -0.95, 1.2], [0.0, -0.55, 1.05], [-0.95, 0.15, 0.8], [-1.35, 0.9, 0.25]]);
  const VR = 0.3;
  const vesselMat = procedural({
    key: 'ks-vessel', physical: true, bump: 0.03,
    params: { color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.4, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xff8c8c), side: THREE.DoubleSide },
    pattern: `
      float n = fbm3(p*2.0, 4), v = pow(ridge3(p*1.6 + n), 16.0);
      col = mix(vec3(0.34, 0.06, 0.1), vec3(0.5, 0.14, 0.16), n)*(0.8 + 0.3*n);
      col = mix(col, vec3(0.12, 0.02, 0.06), v*0.8);
      h = n*0.5 + v*0.4;`,
  });
  const vessel = add(halfTube(portal, () => VR, { segs: 90, radial: 28, thick: 0.14, view: [0.1, 0.35, 1], arc: 0.25 }), vesselMat);
  // Alyuvarlar
  const NR = LOWQ ? 70 : 140;
  const rbcMat = procedural({
    key: 'ks-rbc', physical: true, bump: 0.01,
    params: { color: 0xffffff, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.6, sheenRoughness: 0.3, sheenColor: new THREE.Color(0xff6060) },
    pattern: `float n = vn3(p*3.0 + seed*9.0); col = vec3(0.55, 0.03, 0.04)*(0.75 + 0.4*n)*(0.8 + 0.4*seed); rough = 0.3 + 0.1*n; h = n;`,
  });
  const rbcs = new THREE.InstancedMesh(rbcGeometry(0.075, 16), rbcMat, NR);
  rbcs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rbcs.userData.noCast = true;
  root.add(rbcs);
  const rbcOff = Array.from({ length: NR }, () => [Math.random(), Math.random() * 6.283, 0.25 + 0.7 * Math.sqrt(Math.random()), new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)]);

  // Pankreastan portal vene akan küçük toplardamarlar (insülin buradan kana karışır)
  const pvMat = organMat({ key: 'pv', color: 0x44509a, color2: 0x6a78c0, veins: 0.1, rough: 0.32, cc: 0.6, ccr: 0.3 });
  const drain = [];
  for (const t of [0.12, 0.3, 0.5]) {
    const a = pancCurve.getPointAt(t).add(V([0, -0.15, 0.1])), b = portal.getPointAt(0.3 + t * 0.9);
    const c = curve([a.toArray(), a.clone().lerp(b, 0.5).add(V([0, -0.1, 0.25])).toArray(), b.toArray()]);
    add(loftTube(c, () => 0.035, { segs: 20, radial: 8 }), pvMat);
    drain.push(c);
  }

  // --- Parçacık katmanları (veri) ---
  const fx = new THREE.Group();
  root.add(fx);
  const NG = LOWQ ? 260 : 420, NIns = LOWQ ? 120 : 200;
  const glc = stream(fx, NG, new THREE.Color(3.2, 2.5, 1.2), 0.12, { curve: portal, radius: VR * 0.8, speed: 0.05 });
  const ins = stream(fx, NIns, new THREE.Color(2.0, 1.1, 3.4), 0.11, { curve: portal, radius: VR * 0.75, speed: 0.045 });
  // Akımlar: bağırsak → ven (emilim), adacık → ven (insülin), ven → karaciğer, ven → kas, ven → böbrek
  const absCurve = curve([[0.9, -1.6, 0.8], [1.3, -1.3, 1.05], [1.6, -1.08, 1.15]]);
  const liverCurve = curve([[-1.35, 0.9, 0.25], [-1.5, 1.3, 0.1], [-1.6, 1.7, -0.1], [-1.9, 1.9, -0.3]]);
  const musCurve = curve([[2.3, -1.2, 1.1], [2.8, -1.2, 0.9], [3.1, -1.05, 0.5]]);
  const renCurve = curve([[0.3, -0.4, -0.9], [1.2, -0.2, -1.2], [1.9, -0.05, -1.4]]);
  const S = {
    abs: stream(fx, 90, new THREE.Color(3.2, 2.4, 1.1), 0.11, { curve: absCurve, radius: 0.12, speed: 0.12 }),
    liver: stream(fx, 90, new THREE.Color(0.8, 3.0, 1.2), 0.11, { curve: liverCurve, radius: 0.18, speed: 0.1 }),
    mus: stream(fx, 90, new THREE.Color(3.2, 2.4, 1.1), 0.11, { curve: musCurve, radius: 0.12, speed: 0.12 }),
    ren: stream(fx, 60, new THREE.Color(3.2, 2.2, 0.6), 0.1, { curve: renCurve, radius: 0.08, speed: 0.12 }),
    isl: drain.map((c) => stream(fx, 30, new THREE.Color(2.0, 1.1, 3.4), 0.09, { curve: c, radius: 0.03, speed: 0.15 })),
  };

  const organs = {
    liver, stomach, pancreas: pancCore, duo, gut, kidneys, muscle: fibers, vessel,
    labels: [[liver, [0.2, 0.75, 0.5], 'Karaciğer'], [stomach, [1.95, 1.9, 0.2], 'Mide'], [pancCore, [0.9, 0.62, 0.45], 'Pankreas'],
      [gut, [-2.1, -1.3, 0.9], 'İnce bağırsak'], [muscle, [0, 1.8, 0], 'Kas'], [vessel, [0.9, -0.55, 1.4], 'Portal ven'], [kidneys[1], [0, 0.6, 0], 'Böbrek']],
  };

  // Karaciğer ışıma rengi için ayrı emissive
  for (const m of [liver.material, stomach.material, pancCore.material]) { m.emissive = new THREE.Color(0); m.emissiveIntensity = 0; }
  const pancGlow = pancMat; // lobüller aynı malzemeyi kullanır
  kidneys.forEach((k) => { k.material.emissive = new THREE.Color(0xfbbf24); k.material.emissiveIntensity = 0; });

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), P = new THREE.Vector3(), T = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3();
  let tFlow = 0, beat = 0, contract = 0;
  const data = { visible: true };
  return {
    root, organs, fx, data,
    /** st: { G, I, rates, sleeping, exercising, dt } */
    update({ G, I, r, sleeping, exercising, dt, paused, fill = 0 }) {
      const flowK = paused ? 0 : (exercising ? 1.8 : sleeping ? 0.6 : 1);
      tFlow += dt * flowK;
      beat += dt * (exercising ? 2.2 : sleeping ? 0.9 : 1.2) * Math.PI * 2 * (paused ? 0 : 1);
      // Kalp atımıyla damar nabzı
      const pulse = 1 + 0.06 * Math.max(0, Math.sin(beat)) ** 3;
      // Alyuvarlar
      for (let i = 0; i < NR; i++) {
        const o = rbcOff[i];
        const u = (o[0] + tFlow * 0.05) % 1;
        portal.getPointAt(u, P); portal.getTangentAt(u, T);
        N1.crossVectors(T, new THREE.Vector3(0, 0, 1)).normalize(); N2.crossVectors(T, N1);
        const a = o[1] + tFlow * 0.4, rr = VR * 0.78 * o[2] * pulse;
        P.addScaledVector(N1, Math.cos(a) * rr).addScaledVector(N2, Math.sin(a) * rr * 0.9);
        _q.setFromEuler(o[3]); o[3].x += dt * 0.6 * flowK;
        rbcs.setMatrixAt(i, _m.compose(P, _q, _s.set(1, 1, 1)));
      }
      rbcs.instanceMatrix.needsUpdate = true;
      // Organ ışımaları (etkinlik)
      const ease = (m, v, k = 0.12) => { m.emissiveIntensity = lerp(m.emissiveIntensity, v, k); };
      isleMat.emissiveIntensity = lerp(isleMat.emissiveIntensity, 0.25 + clamp(r.sec / 8, 0, 1) * 5, 0.12);
      ease(gut.material, clamp(r.Ra / 5, 0, 1) * 0.45);
      const hep = r.hepatic;
      liver.material.emissive.setHex(hep < 0 ? 0x22c55e : 0xf97316);
      ease(liver.material, clamp(Math.abs(hep) / 3, 0, 1) * 0.35);
      ease(fibMat, clamp(r.muscle / 4, 0, 1) * 0.5 + (exercising ? 0.1 : 0));
      kidneys.forEach((k) => ease(k.material, clamp(r.renal / 1.5, 0, 1) * 0.6));
      stomach.material.emissive.setHex(0xffb080);
      ease(stomach.material, clamp(fill / 60, 0, 1) * 0.3);
      // Kas: egzersizde ritmik kasılma (lifler kısalıp kalınlaşır)
      contract = lerp(contract, exercising ? 0.5 + 0.5 * Math.sin(beat * 0.5) : 0, 0.15);
      for (let i = 0; i < NFB; i++) {
        const [x, y, z, k] = fibBase[i];
        const sy = 1 - 0.12 * contract, sk = k * (1 + 0.14 * contract);
        fibers.setMatrixAt(i, _m.makeScale(sk, sy, sk).setPosition(x * (1 + 0.1 * contract), y, z * (1 + 0.1 * contract)));
      }
      fibers.instanceMatrix.needsUpdate = true;
      // Parçacıklar
      fx.visible = data.visible;
      if (!data.visible) return;
      const tt = tFlow;
      glc.update(tt, clamp(G / 400, 0.03, 1) * NG);
      ins.update(tt, clamp(I / 100, 0.02, 1) * NIns);
      S.abs.update(tt, clamp(r.Ra / 4, 0, 1) * 90);
      S.liver.update(tt, clamp(Math.abs(hep) / 2.5, 0, 1) * 90, hep < 0 ? 1 : -1);
      S.liver.mat.color.setRGB(hep < 0 ? 0.8 : 3.4, hep < 0 ? 3.0 : 1.6, hep < 0 ? 1.2 : 0.4);
      S.mus.update(tt, clamp(r.muscle / 3, 0, 1) * 90);
      S.ren.update(tt, clamp(r.renal / 1.2, 0, 1) * 60);
      S.isl.forEach((s) => s.update(tt, clamp(r.sec / 6, 0, 1) * 30));
    },
    setGlucoseColor(c) { glc.mat.color.copy(c); },
  };
}
