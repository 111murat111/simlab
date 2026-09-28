// Mikroskobik sinir dokusu ortamı (nöron kipinin arka planı): miyelinli lif demeti (Ranvier boğumları, Schwann hücresi
// çekirdekleri), glia hücreleri (astrosit), alyuvarlı kılcal damar, kolajen lifleri, uzak hücre katmanı ve ön plan
// "alan derinliği" bulanık parçacıkları. Hepsi sisle derinleşir; bilimsel model (HH aksonu) main.js'tedir.
import { THREE, procedural, seeded, BufferGeometryUtils } from '@core';
import { blobGeometry, loftTube, rbcGeometry, softDot, fbm } from './bio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function myelinMaterial(key = 'sinir-miyelin', opts = {}) {
  return procedural({
    key, physical: true, bump: 0.025,
    params: { color: 0xffffff, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12, sheen: 0.6, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xfff0d8), side: THREE.DoubleSide, ...opts },
    pattern: `
      // Sargı katmanları (lamel) ve lipit parlaklığı; hafif sarımsı krem, yer yer Schmidt–Lanterman yarıkları
      float n = fbm3(p*1.6 + seed*7.0, 4);
      float lam = 0.5 + 0.5*sin(dot(p, vec3(0.35, 0.35, 0.35))*38.0 + n*5.0);
      float cleft = smoothstep(0.93, 0.97, vn3(p*vec3(5.0, 5.0, 5.0) + 3.0));
      col = mix(vec3(0.86, 0.8, 0.66), vec3(0.97, 0.93, 0.84), n)*(0.9 + 0.1*lam);
      col *= 1.0 - 0.18*cleft;
      rough = 0.24 + 0.12*n + 0.1*cleft;
      h = n*0.4 + lam*0.12 - cleft*0.3;`,
  });
}

export function buildNerveEnv(parent, { LOWQ = false, avoid = null } = {}) {
  const G = new THREE.Group();
  parent.add(G);
  const rnd = seeded(33);
  const R = (a, b) => a + (b - a) * rnd();

  // ---------- Miyelinli lif demeti ----------
  const axMat = procedural({
    key: 'sinir-bg-akson', physical: true, bump: 0.02,
    params: { color: 0xffffff, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2, sheen: 0.5, sheenColor: new THREE.Color(0x9fd8ff), side: THREE.DoubleSide },
    pattern: `float n = fbm3(p*2.0, 4); col = mix(vec3(0.18, 0.36, 0.55), vec3(0.3, 0.55, 0.7), n); h = n;`,
  });
  const myMat = myelinMaterial('sinir-bg-miyelin');
  const nucMat = procedural({
    key: 'sinir-schwann-cekirdek', physical: true, bump: 0.02,
    params: { color: 0xffffff, roughness: 0.35, clearcoat: 0.6, sheen: 0.5, sheenColor: new THREE.Color(0xd8c8ff) },
    pattern: `float n = fbm3(p*3.0 + seed*4.0, 4), c = cells3(p*9.0); col = mix(vec3(0.42, 0.34, 0.6), vec3(0.6, 0.5, 0.75), n)*(0.8 + 0.3*smoothstep(0.1, 0.4, c)); h = n*0.5 + c*0.3;`,
  });
  // Tek segment: iki ucu incelen (paranod) sargı; boy 1, yarıçap 1 → örnek başına ölçeklenir
  const segProf = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; const r = Math.pow(Math.sin(Math.PI * t), 0.22); segProf.push(new THREE.Vector2(Math.max(r, 0.35), t - 0.5)); }
  const segGeo = new THREE.LatheGeometry(segProf, 20);
  const fibers = [];
  const NF = LOWQ ? 9 : 14;
  for (let f = 0; f < NF; f++) {
    const z = R(-5, -17), y0 = R(-6.5, 6.5), tilt = R(-0.22, 0.22);
    const pts = [];
    for (let s = 0; s <= 6; s++) { const x = -30 + s * 10; pts.push(V(x, y0 + tilt * x + R(-0.8, 0.8), z + R(-1.2, 1.2))); }
    const c = new THREE.CatmullRomCurve3(pts);
    fibers.push({ c, r: R(0.28, 0.5) });
  }
  // Önde, kameraya yakın iki kalın lif (derinlik katmanı)
  fibers.push({ c: new THREE.CatmullRomCurve3([V(-26, -6.5, 3), V(-12, -5.2, 2.2), V(0, -4.8, 1.5), V(14, -5.6, 1), V(28, -6.4, 0.5)]), r: 0.62 });
  fibers.push({ c: new THREE.CatmullRomCurve3([V(-24, 7.8, -2), V(-10, 6.6, -2.8), V(4, 6.9, -3.2), V(20, 8.4, -3.6)]), r: 0.55 });
  const segs = [], nucs = [], axGeos = [];
  for (const { c, r } of fibers) {
    const L = c.getLength(), inter = r * 7.5;
    axGeos.push(loftTube(c, () => r * 0.42, { segs: 90, radial: 10, caps: false }));
    for (let s = 0; s * inter < L; s++) {
      const u0 = (s * inter + 0.08 * inter) / L, u1 = ((s + 1) * inter - 0.08 * inter) / L;
      if (u1 > 1) break;
      const um = (u0 + u1) / 2;
      segs.push({ p: c.getPointAt(um), t: c.getTangentAt(um), len: (u1 - u0) * L, r });
      if (rnd() < 0.55) nucs.push({ p: c.getPointAt(um + R(-0.2, 0.2) * (u1 - u0)), t: c.getTangentAt(um), r });
    }
  }
  const axBundle = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(axGeos), axMat);
  G.add(axBundle);
  const Y = V(0, 1, 0), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), off = new THREE.Vector3();
  const segMesh = new THREE.InstancedMesh(segGeo, myMat, segs.length);
  segs.forEach((s, i) => { q.setFromUnitVectors(Y, s.t); segMesh.setMatrixAt(i, m4.compose(s.p, q, sc.set(s.r, s.len, s.r))); });
  G.add(segMesh);
  const nucGeo = blobGeometry(1, { detail: 4, amp: 0.1, seed: 2, stretch: [0.55, 1.6, 0.55] });
  const nucMesh = new THREE.InstancedMesh(nucGeo, nucMat, nucs.length);
  nucs.forEach((s, i) => {
    q.setFromUnitVectors(Y, s.t);
    off.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).cross(s.t).normalize().multiplyScalar(s.r * 0.95);
    nucMesh.setMatrixAt(i, m4.compose(s.p.clone().add(off), q, sc.setScalar(s.r * 0.45)));
  });
  G.add(nucMesh);

  // ---------- Glia hücreleri (astrosit: gövde + dallanan uzantılar) ----------
  const gliaMat = procedural({
    key: 'sinir-glia', physical: true, bump: 0.02,
    params: { color: 0xffffff, roughness: 0.34, clearcoat: 0.6, clearcoatRoughness: 0.2, sheen: 0.7, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xe0c8ff), side: THREE.DoubleSide },
    pattern: `float n = fbm3(p*1.8 + seed*6.0, 4); col = mix(vec3(0.55, 0.42, 0.7), vec3(0.75, 0.62, 0.85), n)*(0.85 + 0.25*vn3(p*8.0)); h = n;`,
  });
  const gliaAt = [[-9.5, 4.2, -3.5, 0.75], [-2.5, 4.8, -6.5, 0.7], [4.5, 3.4, -4.5, 0.65], [-8.8, -3.6, -2.5, 0.7], [7.5, -3.2, -5.5, 0.6], [1.5, -4.2, -8, 0.7]];
  for (const [x, y, z, s] of gliaAt.slice(0, LOWQ ? 4 : 6)) {
    const geos = [blobGeometry(s, { detail: 6, amp: 0.15, seed: x })];
    const np = 7 + Math.floor(rnd() * 3);
    for (let k = 0; k < np; k++) {
      const d = V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
      let p0 = V(x, y, z).addScaledVector(d, s * 0.55), dir = d.clone(), rr = s * 0.3;
      const pts = [p0.clone()];
      for (let j = 0; j < 4; j++) { dir.add(V(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.7)).normalize(); p0 = p0.clone().addScaledVector(dir, s * R(0.6, 1.1)); pts.push(p0); }
      geos.push(loftTube(new THREE.CatmullRomCurve3(pts), (t) => rr * (0.3 + 0.7 * (1 - t) ** 1.6) + rr * 0.55 * Math.exp(-((t - 0.97) ** 2) / 0.003), { segs: 24, radial: 8, caps: true }));
    }
    const glia = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos.map((g) => g.index ? g.toNonIndexed() : g).map((g) => { g.deleteAttribute('uv'); return g; })), gliaMat);
    G.add(glia);
  }

  // ---------- Kılcal damar + alyuvarlar ----------
  const capCurve = new THREE.CatmullRomCurve3([V(-24, -1.5, -11), V(-12, 0.5, -9.5), V(-3, 2.6, -10.5), V(8, 1.2, -12), V(22, 3.5, -13)]);
  const capMat = procedural({
    key: 'sinir-kilcal', physical: true, bump: 0.02,
    params: { color: 0xffffff, roughness: 0.25, transparent: true, opacity: 0.55, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide, depthWrite: false },
    pattern: `float n = fbm3(p*1.5, 4), c = cells3(p*2.2 + n); col = mix(vec3(0.75, 0.42, 0.45), vec3(0.9, 0.6, 0.6), n)*(0.8 + 0.3*smoothstep(0.05, 0.3, c)); h = c;`,
  });
  const cap = new THREE.Mesh(loftTube(capCurve, () => 0.75, { segs: 120, radial: 20, caps: false }), capMat);
  cap.userData.noCast = true;
  G.add(cap);
  const rbcMat = procedural({
    key: 'sinir-alyuvar', physical: true, bump: 0.01,
    params: { color: 0xffffff, roughness: 0.3, clearcoat: 0.8, sheen: 0.6, sheenColor: new THREE.Color(0xff7070) },
    pattern: `float n = vn3(p*3.0 + seed*9.0); col = vec3(0.6, 0.05, 0.06)*(0.8 + 0.35*n)*(0.85 + 0.3*seed); h = n;`,
  });
  const NR = LOWQ ? 40 : 70;
  const rbcs = new THREE.InstancedMesh(rbcGeometry(0.32, 16), rbcMat, NR);
  rbcs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const rbcOff = Array.from({ length: NR }, () => [rnd(), rnd() * 6.28, rnd() * 0.4, new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)]);
  G.add(rbcs);

  // ---------- Kolajen lifleri (hücre dışı matris) ----------
  {
    const geos = [];
    const NC = LOWQ ? 22 : 40;
    for (let k = 0; k < NC; k++) {
      const p0 = V(R(-22, 22), R(-9, 9), R(-16, -2)), d = V(rnd() - 0.5, (rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.5).normalize();
      const pts = [];
      for (let j = 0; j <= 6; j++) pts.push(p0.clone().addScaledVector(d, j * 1.6).add(V(Math.sin(j * 1.7 + k) * 0.3, Math.cos(j * 1.3 + k) * 0.3, 0)));
      geos.push(loftTube(new THREE.CatmullRomCurve3(pts), () => 0.035, { segs: 40, radial: 5, caps: false }));
    }
    const col = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), new THREE.MeshPhysicalMaterial({ color: 0xe8e0d0, roughness: 0.3, sheen: 1, sheenColor: new THREE.Color(0xffffff), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    col.userData.noCast = true;
    G.add(col);
  }

  // ---------- Uzak hücre katmanı (sisle yumuşar) ----------
  {
    const NB = LOWQ ? 30 : 55;
    const far = new THREE.InstancedMesh(blobGeometry(1, { detail: 4, amp: 0.2, seed: 5 }), gliaMat, NB);
    for (let k = 0; k < NB; k++) {
      const s = R(0.8, 2.2);
      far.setMatrixAt(k, m4.compose(V(R(-40, 40), R(-18, 18), R(-34, -20)), q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, 0)), sc.set(s, s * R(0.6, 1.1), s)));
    }
    far.userData.noCast = true;
    G.add(far);
  }

  // ---------- Ön plan bulanık parçacıklar (alan derinliği hissi) ----------
  const NBk = 26;
  const bpos = new Float32Array(NBk * 3), bcol = new Float32Array(NBk * 3);
  for (let k = 0; k < NBk; k++) {
    bpos.set([R(-16, 10), R(-7, 8), R(4, 12)], k * 3);
    const c = rnd() < 0.7 ? [0.35, 0.7, 0.9] : [0.9, 0.7, 0.45];
    bcol.set(c.map((v) => v * R(0.25, 0.6)), k * 3);
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  bg.setAttribute('color', new THREE.BufferAttribute(bcol, 3));
  const bokeh = new THREE.Points(bg, new THREE.PointsMaterial({ map: softDot(), size: 1.6, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  bokeh.frustumCulled = false; bokeh.raycast = () => {};
  G.add(bokeh);

  G.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3();
  let tt = 0;
  return {
    group: G,
    update(dt) {
      tt += dt;
      for (let i = 0; i < NR; i++) {
        const o = rbcOff[i];
        const u = (o[0] + tt * 0.012) % 1;
        capCurve.getPointAt(u, P); capCurve.getTangentAt(u, T);
        N1.crossVectors(T, Y).normalize(); N2.crossVectors(T, N1);
        const a = o[1] + tt * 0.3;
        P.addScaledVector(N1, Math.cos(a) * o[2]).addScaledVector(N2, Math.sin(a) * o[2]);
        o[3].x += dt * 0.4;
        rbcs.setMatrixAt(i, m4.compose(P, q.setFromEuler(o[3]), sc.set(1, 1, 1)));
      }
      rbcs.instanceMatrix.needsUpdate = true;
      bokeh.rotation.y = Math.sin(tt * 0.05) * 0.02;
    },
  };
}
