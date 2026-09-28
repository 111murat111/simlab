// Fay izi sahası (yakın ölçek): köy, yollar, elektrik direkleri, çit, kavak sırası, meyve bahçesi, dere suyu, çöküntü gölü,
// yamaçlarda meşe/çam, kırılma tozu. Kuzey bloktaki parçalar deprem anındaki sağ yanal atımla (setSlip) doğuya kayar.
import { THREE, mat, procedural, BufferGeometryUtils, createVegetation, seeded, clamp } from '@core';
import { plaster, roofTiles, houseGeometries, treeGeometry, leafMat, barkMat, softDot } from './kit.js';

const ni = (g) => (g.index ? g.toNonIndexed() : g);

export function buildSite(o) {
  const { hS, scarpY, fromUV, ST, SN, SO, STREAM, POND, LOW, farmAt, vilAt, streamDist, ROAD_U, ROAD_V, ORCH, POPLAR_U, FENCE_U, WALL_U = 236, WALL_OFF = 4.5, TRACK_V = -30, TRACK_U = 203.5 } = o;
  const root = new THREE.Group();
  root.name = 'fay-saha';
  const north = new THREE.Group(); // kuzey blok: deprem anında ST yönünde ötelenir
  root.add(north);
  const rnd = seeded(71);
  const P = (u, v, dy = 0) => { const [x, z] = fromUV(u, v); return new THREE.Vector3(x, hS(x, z) + dy, z); };
  const side = (v) => (v > 0 ? north : root);
  const theta = Math.atan2(-ST.z, ST.x); // yerel x → fay doğrultusu (doğu), yerel z → güney

  // --- Yol malzemesi: asfalt + şerit çizgileri (nesne uzayı: x yanal, z yol boyunca) + stabilize banket ---
  const roadMat = procedural({
    key: 'fay-road', bump: 0.03, params: { color: 0x333436, roughness: 0.9 },
    pattern: /* glsl */ `
      float ax = abs(p.x);
      vec3 asph = vec3(0.2, 0.2, 0.21)*(0.78 + 0.36*fbm3(p*0.9, 4))*(0.9 + 0.2*vn3(p*11.0));
      asph *= mix(1.0, 0.78, smoothstep(0.62, 0.74, fbm3(p*0.07 + 3.0, 3)));        // yama/onarım lekeleri
      asph = mix(asph, asph*0.7, smoothstep(0.8, 0.0, abs(ax - 1.6))*0.35);          // tekerlek izi koyuluğu
      float edge = 1.0 - smoothstep(0.06, 0.1, abs(ax - 2.85));
      float dash = (1.0 - smoothstep(0.05, 0.09, ax))*step(fract(p.z/9.0), 0.42);
      float paint = max(edge, dash)*(0.7 + 0.3*vn3(p*2.5));
      float grav = smoothstep(3.05, 3.35, ax);
      vec3 g = vec3(0.52, 0.47, 0.4)*(0.7 + 0.5*fbm3(p*1.7, 3))*(0.85 + 0.3*vn3(p*14.0));
      col = mix(asph, vec3(0.86, 0.85, 0.8), paint);
      col = mix(col, g, grav);
      rough = mix(mix(0.88, 0.55, paint), 0.97, grav);
      h = fbm3(p*7.0, 2)*0.6 + grav*vn3(p*20.0)*0.4;`,
  });
  /** Arazi üstüne serili yol şeridi: başlangıç (u,v), yön (du,dv) birim, uzunluk; parent'a eklenir. */
  function road(u0, v0, du, dv, len, parent, width = 4.4) {
    const D = { x: du * ST.x + dv * SN.x, z: du * ST.z + dv * SN.z };
    const th = Math.atan2(D.x, D.z), cs = Math.cos(th), sn = Math.sin(th);
    const [ox, oz] = fromUV(u0, v0);
    const XS = [-width, -3.3, -2.2, 0, 2.2, 3.3, width], YS = [0.02, 0.25, 0.32, 0.35, 0.32, 0.25, 0.02];
    const n = Math.max(2, Math.ceil(len / 4)) + 1, pos = [], idx = [];
    for (let i = 0; i < n; i++) {
      const z = (i / (n - 1)) * len;
      XS.forEach((x, k) => {
        const wx = ox + x * cs + z * sn, wz = oz - x * sn + z * cs;
        pos.push(x, hS(wx, wz) + YS[k], z);
      });
    }
    const m = XS.length;
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < m - 1; k++) { const a = i * m + k, b = a + m; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    roadMat.polygonOffset = true; roadMat.polygonOffsetFactor = -3; roadMat.polygonOffsetUnits = -3;
    const mesh = new THREE.Mesh(g, roadMat);
    mesh.position.set(ox, 0, oz); mesh.rotation.y = th;
    mesh.userData.noCast = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  // K–G köy yolu fayı dik keser (kuzey parçası kayar), D–B köy yolu güney blokta kalır
  road(ROAD_U, -1500, 0, 1, 1500 - 0.4, root);
  road(ROAD_U, 0.4, 0, 1, 700, north);
  road(-1000, ROAD_V, 1, 0, 2620, root);

  // --- Köy: sıvalı, kiremit çatılı 1–2 katlı evler + cami ---
  const wallMat = plaster(0xece3d2), roofMat = roofTiles(0xa4492c), glassMat = mat.plastic({ color: 0x1c242c, gloss: 1 }), trimMat = mat.concrete({ color: 0xd8d2c6 });
  const PROTOS = [{ w: 9, d: 8, floors: 1 }, { w: 10, d: 9, floors: 2 }, { w: 12, d: 9, floors: 2 }, { w: 8, d: 7, floors: 1 }].map((p) => houseGeometries({ ...p, roof: 'gable' }));
  const spots = [[], [], [], []];
  const houseXZ = [];
  const place = (u, v, faceU, faceV) => {
    for (const q of houseXZ) if ((q[0] - u) ** 2 + (q[1] - v) ** 2 < 17 ** 2) return;
    if (Math.abs(u - ROAD_U) < 11 || (Math.abs(v - ROAD_V) < 11 && u > -1020)) return;
    houseXZ.push([u, v]);
    const k = (rnd() * 4) | 0, p = P(u, v);
    // en düşük köşe: sıva duvar zemine gömülsün
    let hm = Infinity;
    for (const [a, b] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { const [x, z] = fromUV(u + a, v + b); hm = Math.min(hm, hS(x, z)); }
    const D = { x: faceU * ST.x + faceV * SN.x, z: faceU * ST.z + faceV * SN.z };
    spots[k].push({ x: p.x, y: hm - 0.25, z: p.z, ry: Math.atan2(D.x, D.z) + (rnd() - 0.5) * 0.08, s: 0.92 + rnd() * 0.16 });
  };
  const NH = LOW ? 0.55 : 1;
  // cami alanı boş kalsın
  const MQ = [150, -205];   // cami: fay izine yakın, yol kavşağının güneyinde
  for (const [a, b] of [[-9, -9], [9, -9], [-9, 9], [9, 9], [0, 0]]) houseXZ.push([MQ[0] + a, MQ[1] + b]);
  for (let u = -900; u < 700; u += 23 / NH) for (const s of [1, -1]) {
    const v = ROAD_V + s * (15 + rnd() * 6);
    if (rnd() < 0.82) place(u + (rnd() - 0.5) * 6, v, 0, -s);
    if (rnd() < 0.45 * NH) place(u + (rnd() - 0.5) * 10, ROAD_V + s * (44 + rnd() * 14), (rnd() - 0.5) * 0.4, -s);
  }
  for (let v = ROAD_V - 30; v > -1050; v -= 24 / NH) for (const s of [1, -1]) {
    if (rnd() < 0.75) place(ROAD_U + s * (15 + rnd() * 5), v + (rnd() - 0.5) * 5, -s, 0);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tv = new THREE.Vector3();
  const WALLC = [0xefe8da, 0xf3efe6, 0xe8d8b8, 0xe9d2c0, 0xdfe3e4, 0xf0e2c4], ROOFC = [0xffffff, 0xe8d0c0, 0xd8b6a0, 0xf2e2d8];
  const col = new THREE.Color();
  PROTOS.forEach((g, k) => {
    const L = spots[k];
    if (!L.length) return;
    const parts = [[g.walls, wallMat, WALLC], [g.roof, roofMat, ROOFC], [g.glass, glassMat, null], [g.trim, trimMat, null]];
    for (const [geo, m, pal] of parts) {
      const im = new THREE.InstancedMesh(geo, m, L.length);
      L.forEach((s, i) => {
        q.setFromAxisAngle(up, s.ry);
        m4.compose(tv.set(s.x, s.y, s.z), q, sc.set(s.s, 1, s.s));
        im.setMatrixAt(i, m4);
        if (pal) im.setColorAt(i, col.setHex(pal[(i * 7 + k * 3) % pal.length]));
      });
      im.castShadow = true; im.receiveShadow = true;
      root.add(im);
    }
  });
  // --- Fay izine yakın çiftlik evleri: yüzey kırığı ve en şiddetli sarsıntı burada → eğilir, çöker, çatı kiremitleri dökülür ---
  const farm = [];
  {
    const FS = [[300, -26], [385, 30], [165, 30], [228, -62], [296, -108], [118, -44], [335, -160], [205, -140], [92, -118], [-300, -20], [-275, -34], [-150, -16], [-118, 26], [-70, 30], [-40, -22], [-12, 36], [-880, -22], [-905, 30], [-1150, -60], [-640, 34], [-610, -26]];
    const byK = [[], [], [], []];
    FS.forEach(([u, v], n) => {
      const k = n % 4, p = P(u, v);
      let hm = Infinity;
      for (const [a, b] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { const [x, z] = fromUV(u + a, v + b); hm = Math.min(hm, hS(x, z)); }
      const ry = theta + Math.PI / 2 * ((n * 3) % 4) + (rnd() - 0.5) * 0.2;
      const ax = new THREE.Vector3(rnd() - 0.5, 0, rnd() - 0.5).normalize();
      byK[k].push({ x: p.x, y: hm - 0.25, z: p.z, v, ry, ax, tilt: (0.07 + rnd() * 0.08) * Math.exp(-Math.abs(v) / 45), sink: 0.5 + rnd() * 0.6, pal: n });
    });
    PROTOS.forEach((g, k) => {
      for (const [grp, filt] of [[root, (h) => h.v <= 0], [north, (h) => h.v > 0]]) {
        const L = byK[k].filter(filt);
        if (!L.length) continue;
        const parts = [[g.walls, wallMat, WALLC], [g.roof, roofMat, ROOFC], [g.glass, glassMat, null], [g.trim, trimMat, null]];
        const ims = parts.map(([geo, m, pal]) => {
          const im = new THREE.InstancedMesh(geo, m, L.length);
          if (pal) L.forEach((h, i) => im.setColorAt(i, new THREE.Color(pal[(h.pal * 5 + 1) % pal.length])));
          im.castShadow = true; im.receiveShadow = true;
          grp.add(im);
          return im;
        });
        farm.push({ L, ims, roof: ims[1], base: L.map((h) => new THREE.Color(ROOFC[(h.pal * 5 + 1) % ROOFC.length])) });
      }
    });
  }
  const dq = new THREE.Quaternion(), dark = new THREE.Color(0x6b5a4c);
  function setDamage(d) { // d: 0 sağlam → 1 ağır hasar
    for (const F of farm) {
      F.L.forEach((h, i) => {
        q.setFromAxisAngle(up, h.ry);
        dq.setFromAxisAngle(h.ax, h.tilt * d); q.premultiply(dq);
        m4.compose(tv.set(h.x, h.y - h.sink * d * Math.exp(-Math.abs(h.v) / 45), h.z), q, sc.set(1, 1 - 0.18 * d * Math.exp(-Math.abs(h.v) / 30), 1));
        for (const im of F.ims) im.setMatrixAt(i, m4);
        F.roof.setColorAt(i, col.copy(F.base[i]).lerp(dark, 0.55 * d));
      });
      for (const im of F.ims) im.instanceMatrix.needsUpdate = true;
      F.roof.instanceColor.needsUpdate = true;
    }
  }
  setDamage(0);

  {
    // Cami: kare harim, kasnaklı kurşun kubbe, tek şerefeli minare
    const g = new THREE.Group(), c = P(MQ[0], MQ[1]);
    g.position.set(c.x, c.y - 0.4, c.z); g.rotation.y = theta;
    const white = plaster(0xf1ede4), lead = mat.brushedMetal({ color: 0x8b9298, rough: 0.5 });
    const hall = new THREE.Mesh(new THREE.BoxGeometry(15, 7.5, 15).translate(0, 3.75, 0), white); g.add(hall);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.2, 2.2, 24).translate(0, 8.6, 0), white); g.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(5.8, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 9.6, 0), lead); g.add(dome);
    const fin = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 1.6, 6).translate(0, 16.2, 0), mat.brushedMetal({ color: 0xd4b25a, rough: 0.3 })); g.add(fin);
    const porch = new THREE.Mesh(new THREE.BoxGeometry(15, 5, 5).translate(0, 2.5, 10), white); g.add(porch);
    const mx = 8.6, mz = 8.6;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 8, 12).translate(mx, 4, mz), white); g.add(base);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 20, 16).translate(mx, 18, mz), white); g.add(shaft);
    const ser = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.25, 0.9, 16).translate(mx, 23.5, mz), white); g.add(ser);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.07, 6, 24).rotateX(Math.PI / 2).translate(mx, 24.5, mz), lead); g.add(rail);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 4, 16).translate(mx, 30, mz), white); g.add(top);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.15, 6.5, 16).translate(mx, 35.2, mz), lead); g.add(cone);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    root.add(g);
  }

  // --- Ağaçlar: tür başına birkaç tohum; gövde + taç ayrı InstancedMesh; kuzey/güney blok ayrı ---
  const bark = barkMat(0x4f4032);
  const leafCache = {};
  function trees(kind, list, { color = 0x4a6a2a, seeds = 3, dens = 0.4 } = {}) {
    if (!leafCache[color]) leafCache[color] = leafMat(color);
    const lm = leafCache[color];
    for (const [grp, filt] of [[root, (t) => t.v <= 0], [north, (t) => t.v > 0]]) {
      const L = list.filter(filt);
      if (!L.length) continue;
      for (let s = 0; s < seeds; s++) {
        const S = L.filter((_, i) => i % seeds === s);
        if (!S.length) continue;
        const g = treeGeometry(kind, 11 + s * 17 + kind.length, { dens });
        const tr = new THREE.InstancedMesh(g.trunk, bark, S.length), cr = new THREE.InstancedMesh(g.crown, lm, S.length);
        S.forEach((t, i) => {
          q.setFromAxisAngle(up, rnd() * Math.PI * 2);
          m4.compose(tv.set(t.x, t.y - 0.15, t.z), q, sc.set(t.s * (0.92 + rnd() * 0.16), t.s * t.sy, t.s * (0.92 + rnd() * 0.16)));
          tr.setMatrixAt(i, m4); cr.setMatrixAt(i, m4);
          { const k = 0.8 + rnd() * 0.4; cr.setColorAt(i, col.setRGB(k * (0.95 + rnd() * 0.1), k, k * (0.9 + rnd() * 0.15))); }
        });
        for (const im of [tr, cr]) { im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; grp.add(im); }
      }
    }
  }
  const T = (u, v, s = 1, sy = 1) => { const p = P(u, v); return { x: p.x, y: Math.max(p.y, scarpY(u, v)), z: p.z, v, s, sy }; };
  // Meyve bahçesi: sıralar fayı dik keser → atım sıraları kaydırır
  {
    const L = [], L2 = [], sp = LOW ? 9 : 7;
    for (let u = ORCH[0]; u <= ORCH[1]; u += sp) for (let v = ORCH[2]; v <= ORCH[3]; v += sp) {
      if (Math.abs(v) < 3) continue;
      L.push(T(u + (rnd() - 0.5) * 0.5, v + (rnd() - 0.5) * 0.5, 0.8 + rnd() * 0.3));
    }
    // ikinci bahçe: yolun batısında, fay izinin hemen güneyinde (bağ/meyve sıraları)
    for (let u = 20; u <= 196; u += sp) for (let v = -100; v <= -14; v += sp) {
      if ((u - 118) ** 2 + (v + 44) ** 2 < 16 ** 2 || (u - 205) ** 2 + (v + 140) ** 2 < 16 ** 2 || (u - 92) ** 2 + (v + 118) ** 2 < 16 ** 2) continue;
      L2.push(T(u + (rnd() - 0.5) * 0.5, v + (rnd() - 0.5) * 0.5, 0.75 + rnd() * 0.3));
    }
    trees('fruit', L, { color: 0x557a2e, seeds: 3, dens: LOW ? 0.3 : 0.38 });
    trees('fruit', L2, { color: 0x5a7f30, seeds: 2, dens: LOW ? 0.3 : 0.38 });
  }
  // Kavak sırası (rüzgâr kırıcı): biri fayı dik keser, biri güney blokta fay boyunca
  {
    const L = [];
    for (let v = -90; v <= 110; v += 6.5) if (Math.abs(v) > 3) L.push(T(345 + (rnd() - 0.5) * 0.6, v, 0.85 + rnd() * 0.3, 1 + rnd() * 0.2)); // yol yanındaki bahçe sınırı
    for (const pu of [POPLAR_U, 40]) for (let v = -290; v <= 430; v += 6.5) if (Math.abs(v) > 3) L.push(T(pu + (rnd() - 0.5) * 0.6, v, 0.85 + rnd() * 0.3, 1 + rnd() * 0.2));
    for (let u = -180; u <= 20; u += 7) L.push(T(u, -150 + (rnd() - 0.5) * 0.6, 0.85 + rnd() * 0.3, 1 + rnd() * 0.2));
    for (let u = -700; u <= -262; u += 7) L.push(T(u, -225 + (rnd() - 0.5) * 0.6, 0.85 + rnd() * 0.3, 1 + rnd() * 0.2));
    trees('poplar', L, { color: 0x5b7a30, seeds: 3, dens: 0.5 });
  }
  // Dere boyu söğüt/kavak; tarla kenarı tek ağaçlar (ceviz/meşe); köy bahçeleri
  {
    const L = [], P2 = [];
    for (let i = 0; i < STREAM.length; i += 1) {
      if (rnd() > (LOW ? 0.45 : 0.75)) continue;
      const a = STREAM[Math.max(0, i - 1)], b = STREAM[Math.min(STREAM.length - 1, i + 1)];
      let du = b[0] - a[0], dv = b[1] - a[1]; const l = Math.hypot(du, dv) || 1; du /= l; dv /= l;
      const s = rnd() < 0.5 ? 1 : -1, off = 9 + rnd() * 7, u = STREAM[i][0] - dv * off * s, v = STREAM[i][1] + du * off * s;
      if (Math.abs(v) < 4) continue;
      (rnd() < 0.25 ? P2 : L).push(T(u, v, 0.8 + rnd() * 0.4));
    }
    trees('oak', L, { color: 0x58782f, seeds: 3, dens: 0.4 });
    trees('poplar', P2, { color: 0x62823a, seeds: 2, dens: 0.45 });
    const F = [];
    for (let k = 0; k < (LOW ? 280 : 650); k++) {
      const u = -1500 + rnd() * 3000, v = -1400 + rnd() * 2900;
      if (farmAt(u, v) < 0.5 || vilAt(u, v) > 0 || Math.abs(v) < 8 || Math.abs(u - ROAD_U) < 12 || streamDist(u, v) < 16) continue;
      F.push(T(u, v, 1.0 + rnd() * 0.7));
    }
    trees('oak', F, { color: 0x4d6a2a, seeds: 2, dens: 0.45 });
    const G = [];
    for (const [u, v] of houseXZ) for (let k = 0; k < (LOW ? 3 : 4); k++) {
      const a = rnd() * Math.PI * 2, d = 11 + rnd() * 6, uu = u + Math.cos(a) * d, vv = v + Math.sin(a) * d;
      if (Math.abs(uu - ROAD_U) < 9 || Math.abs(vv - ROAD_V) < 9) continue;
      G.push(T(uu, vv, 0.7 + rnd() * 0.35));
    }
    // Köy içi bahçe ve bostan ağaçları (dut, ceviz, meyve)
    for (let k = 0; k < (LOW ? 160 : 520); k++) {
      const u = -960 + rnd() * 1700, v = -700 + rnd() * 520;
      if (vilAt(u, v) < 0.05 || Math.abs(u - ROAD_U) < 10 || Math.abs(v - ROAD_V) < 10) continue;
      if (houseXZ.some((q) => (q[0] - u) ** 2 + (q[1] - v) ** 2 < 9 ** 2)) continue;
      G.push(T(u, v, 0.8 + rnd() * 0.6));
    }
    trees('fruit', G, { color: 0x4f7430, seeds: 2, dens: 0.35 });
  }
  // Fay boyunca bitki çizgisi: ezilmiş fay kayacı yeraltı suyunu keser → izin üstünde kaynak, sazlık ve söğüt/çalı sırası
  {
    const W = [], S = [];
    for (let u = -1650; u <= 1650; u += LOW ? 9 : 3.2) {
      if (Math.abs(u - ROAD_U) < 10 || Math.abs(u - FENCE_U) < 4 || Math.abs(u - WALL_U - WALL_OFF / 2) < 6 || streamDist(u, 0) < 10) continue;
      if (u > ORCH[0] - 4 && u < ORCH[1] + 4) continue;
      const v = -(3 + rnd() * 6);   // basamağın dibinde (kaynak çıkışı)
      if (rnd() < 0.45) W.push(T(u + (rnd() - 0.5) * 2, v, 0.85 + rnd() * 0.5));
      else S.push(T(u + (rnd() - 0.5) * 2, v * 0.8, 0.9 + rnd() * 0.8));
    }
    trees('oak', W, { color: 0x5f8a34, seeds: LOW ? 1 : 2, dens: 0.45 });
    trees('shrub', S, { color: 0x5b7f2e, seeds: LOW ? 1 : 2, dens: LOW ? 0.4 : 0.55 });
  }
  // Yamaçlar: meşe–kızılçam korusu, maki (motor bitki örtüsü); tarla, köy, yol, dere ve fay izi dışında
  const R = 3200;
  const hVeg = (x, z) => {
    const dx = x - SO.x, dz = z - SO.z, u = dx * ST.x + dz * ST.z, v = dx * SN.x + dz * SN.z;
    if (Math.abs(v) < 60 && u > -1200 && u < 0) return -100;
    if (farmAt(u, v) > 0.3 || vilAt(u, v) > -0.25 || Math.abs(v) < 10 || Math.abs(u - ROAD_U) < 14 || (Math.abs(v - ROAD_V) < 14 && u > -1020 && u < 1640)) return -100;
    if (u > ORCH[0] - 8 && u < ORCH[1] + 8 && v > ORCH[2] - 8 && v < ORCH[3] + 8) return -100;
    if (Math.abs(u) < 1700 && Math.abs(v) < 1700 && streamDist(u, v) < 14) return -100;
    if (((u - POND.u) / (POND.a + 20)) ** 2 + ((v - POND.v) / (POND.b + 16)) ** 2 < 1) return -100;
    return hS(x, z);
  };
  const veg = createVegetation(hVeg, {
    rect: [SO.x - R, SO.z - R, SO.x + R, SO.z + R], trees: LOW ? 1400 : 3200, rocks: LOW ? 60 : 160, shrubs: LOW ? 400 : 1100, seed: 5,
    kinds: { oak: 0.5, redpine: 0.3, broad: 0.2 }, maxSlope: 0.6, leafA: 0x3b5424, leafB: 0x6f7a38, bark: 0x4a3b2c,
  });
  root.add(veg.group);

  // --- Çit (ahşap direk + 3 tel) ve elektrik hattı: fayı dik keser ---
  {
    const post = new THREE.CylinderGeometry(0.055, 0.07, 1.45, 6).translate(0, 0.6, 0);
    const wood = mat.wood({ color: 0x7a6248 });
    const wireM = new THREE.LineBasicMaterial({ color: 0x3d3d3d, transparent: true, opacity: 0.8 });
    for (const [grp, v0, v1] of [[root, -300, -1.2], [north, 1.2, 400]]) {
      const L = [];
      for (let v = v0; v <= v1 + 0.01; v += 2.6) L.push(P(FENCE_U + (rnd() - 0.5) * 0.12, v));
      const im = new THREE.InstancedMesh(post, wood, L.length);
      L.forEach((p, i) => { q.setFromAxisAngle(up, rnd() * 3); m4.compose(p, q, sc.set(1, 0.9 + rnd() * 0.2, 1)); im.setMatrixAt(i, m4); });
      im.castShadow = true; grp.add(im);
      for (const hy of [0.45, 0.8, 1.15]) {
        const g = new THREE.BufferGeometry().setFromPoints(L.map((p) => new THREE.Vector3(p.x, p.y + hy, p.z)));
        grp.add(new THREE.Line(g, wireM));
      }
    }
  }
  // --- Eski kuru taş duvar: fayı dik keser; kuzey parçası önceki bir depremde WALL_OFF metre doğuya ötelenmiş.
  // Fay izinde yıkılmış (moloz), tarla yolunda kapı boşluğu; kuzey parçası deprem anında yine kayar (north grubu).
  {
    const stoneGeo = (seed) => {
      const r = seeded(seed);
      let g = new THREE.IcosahedronGeometry(0.5, 0);
      g.deleteAttribute('normal'); g.deleteAttribute('uv');
      g = BufferGeometryUtils.mergeVertices(g);
      const a = g.attributes.position;
      for (let i = 0; i < a.count; i++) { const k = 0.82 + r() * 0.3; a.setXYZ(i, a.getX(i) * k, a.getY(i) * (0.8 + r() * 0.35), a.getZ(i) * k); }
      g.computeVertexNormals();
      return g;
    };
    const GEOS = [3, 8, 21].map(stoneGeo);
    const stoneMat = mat.rock({ color: 0x9c9383, scale: 2.2, strata: 0.15 });
    const yAt = (u, v) => { const p = P(u, v); return Math.max(p.y, scarpY(u, v)); };
    const along = new THREE.Vector3(SN.x, 0, SN.z), across = new THREE.Vector3(ST.x, 0, ST.z);
    const baseQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, up, along.clone().negate()));
    const lists = { s: [[], [], []], n: [[], [], []] };
    const eq = new THREE.Quaternion(), eu = new THREE.Euler();
    const put = (u, v, dy, sx, sy, sz, tilt = 0.12) => {
      const key = v > 0 ? 'n' : 's', p = P(u, v);
      p.y = yAt(u, v) + dy;
      eu.set((rnd() - 0.5) * tilt, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * tilt);
      const qq = baseQ.clone().multiply(eq.setFromEuler(eu));
      lists[key][(rnd() * 3) | 0].push(new THREE.Matrix4().compose(p, qq, new THREE.Vector3(sx, sy, sz)));
    };
    const ds = LOW ? 0.46 : 0.38, V0 = LOW ? -120 : -170, V1 = LOW ? 120 : 170;
    for (let v = V0; v <= V1; v += ds) {
      if (Math.abs(v - TRACK_V) < 2.2) continue;                        // tarla yolu kapısı
      const u0 = WALL_U + (v > 0 ? WALL_OFF : 0) + 0.25 * Math.sin(v * 0.05);
      if (Math.abs(v) < 4.2) {                                           // fay izinde yıkılmış duvar: dağınık taşlar
        for (let k = 0; k < 4; k++) put(u0 + (rnd() - 0.5) * 3.2 + (v > 0 ? 0 : 0), v + (rnd() - 0.5) * 0.6, 0.02, 0.34 + rnd() * 0.2, 0.2 + rnd() * 0.1, 0.34 + rnd() * 0.2, 1.2);
        continue;
      }
      const hn = 0.5 + 0.5 * Math.sin(v * 0.083 + 1.7) * Math.sin(v * 0.021);
      const courses = rnd() < 0.05 ? 1 : hn > 0.55 ? 4 : 3;              // yer yer yıkık, yer yer tam boy
      for (let c = 0; c < courses; c++) {
        const w = 0.72 - c * 0.08, y = 0.1 + c * 0.24;
        if (c === courses - 1 && courses > 2) { put(u0, v, y + 0.02, w * 1.05, 0.2 + rnd() * 0.06, ds * 1.1); continue; } // üst sıra: enine kapak taşı
        for (const sgn of [-1, 1]) put(u0 + sgn * w * 0.25 + (rnd() - 0.5) * 0.06, v + (rnd() - 0.5) * 0.08, y, w * 0.55, 0.27 + rnd() * 0.06, ds * (1.05 + rnd() * 0.3));
      }
      if (courses === 1 || rnd() < 0.04) for (let k = 0; k < 3; k++) put(u0 + (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 1.2), v + (rnd() - 0.5) * 1.5, 0.03, 0.3 + rnd() * 0.15, 0.2, 0.3 + rnd() * 0.15, 1.2); // duvar dibine düşmüş taş
    }
    for (const [key, grp] of [['s', root], ['n', north]]) lists[key].forEach((L, i) => {
      if (!L.length) return;
      const im = new THREE.InstancedMesh(GEOS[i], stoneMat, L.length);
      L.forEach((m, k) => im.setMatrixAt(k, m));
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.userData.noFit = true;
      grp.add(im);
    });
  }
  // Ön plan: kaya çıkıntıları (motor kayaları) ve çalılar (duvar/çit dibinde çalı çizgisi, çayırda öbekler)
  {
    const fg = (x, z) => {
      const dx = x - SO.x, dz = z - SO.z, u = dx * ST.x + dz * ST.z, v = dx * SN.x + dz * SN.z;
      if (u < 198 || u > ROAD_U - 8 || v > -3 || v < -130) return -100;
      if ((u - 228) ** 2 + (v + 62) ** 2 < 144 || (u - 205) ** 2 + (v + 140) ** 2 < 144) return -100;   // çiftlik evleri
      if (Math.abs(u - WALL_U) < 2.2 || Math.abs(u - FENCE_U) < 1.6 || Math.abs(u - TRACK_U) < 2.5 || Math.abs(v - TRACK_V) < 2.6) return -100;
      return Math.max(hS(x, z), scarpY(u, v));
    };
    const c = fromUV(228, -60);
    const rocks = createVegetation(fg, {
      rect: [c[0] - 80, c[1] - 80, c[0] + 80, c[1] + 80], trees: 0, shrubs: 0, rocks: LOW ? 16 : 26, water: -50, seed: 27, maxSlope: 2,
    });
    rocks.group.traverse((ob) => { if (ob.isInstancedMesh) ob.userData.noFit = true; });
    root.add(rocks.group);
    const S = [];
    for (let v = -150; v <= 150; v += LOW ? 4.5 : 3) {
      if (Math.abs(v) < 4 || Math.abs(v - TRACK_V) < 3) continue;
      if (rnd() < 0.5) S.push(T(WALL_U + (v > 0 ? WALL_OFF : 0) + (rnd() < 0.5 ? -1 : 1) * (0.9 + rnd() * 0.5), v + (rnd() - 0.5) * 2, 0.55 + rnd() * 0.6));
      if (rnd() < 0.22) S.push(T(FENCE_U + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.4), v, 0.5 + rnd() * 0.5));
    }
    for (let k = 0; k < (LOW ? 16 : 28); k++) {
      const u = 214 + rnd() * 40, v = -12 - rnd() * 90;
      if (Math.abs(u - WALL_U) < 2.5 || Math.abs(v - TRACK_V) < 3 || (u - 228) ** 2 + (v + 62) ** 2 < 100) continue;
      S.push(T(u, v, 0.45 + rnd() * 0.55));
    }
    trees('shrub', S, { color: 0x56722c, seeds: LOW ? 1 : 2, dens: LOW ? 0.4 : 0.55 });
  }
  const poleTops = { s: null, n: null };
  const lineMat = new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.6 });
  let crossing = null;
  {
    const pole = BufferGeometryUtils.mergeGeometries([
      new THREE.CylinderGeometry(0.12, 0.17, 9, 8).translate(0, 4.5, 0),
      new THREE.BoxGeometry(1.9, 0.12, 0.12).translate(0, 8.4, 0),
      new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6).translate(-0.8, 8.58, 0),
      new THREE.CylinderGeometry(0.05, 0.05, 0.25, 6).translate(0.8, 8.58, 0),
    ].map(ni));
    const wood = mat.wood({ color: 0x5b4633 });
    const U0 = ROAD_U + 7.5;
    for (const [grp, vs, key] of [[root, [-1080, -1035, -990, -945, -900, -855, -810, -765, -720, -675, -630, -585, -540, -495, -450, -405, -360, -315, -270, -225, -180, -135, -90, -45, -12], 's'], [north, [12, 57, 102, 147, 192, 237, 282, 327, 372, 417, 462, 507, 552, 597, 642, 687, 732, 777, 822, 867, 912, 957, 1002, 1047, 1092], 'n']]) {
      const L = vs.map((v) => P(U0, v));
      const im = new THREE.InstancedMesh(pole, wood, L.length);
      L.forEach((p, i) => { q.setFromAxisAngle(up, theta); m4.compose(p, q, sc.set(1, 1, 1)); im.setMatrixAt(i, m4); });
      im.castShadow = true; grp.add(im);
      // teller: iki iletken, sarkma (katener ≈ parabol)
      const ex = new THREE.Vector3(ST.x * 0.8, 0, ST.z * 0.8);
      for (const sgn of [1, -1]) {
        const pts = [];
        for (let i = 0; i < L.length - 1; i++) for (let k = 0; k <= 8; k++) {
          const t = k / 8, a = L[i], b = L[i + 1];
          pts.push(new THREE.Vector3().lerpVectors(a, b, t).add(tv.copy(ex).multiplyScalar(sgn)).setY(a.y + (b.y - a.y) * t + 8.68 - 0.9 * 4 * t * (1 - t)));
        }
        grp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
      }
      poleTops[key] = key === 's' ? L[L.length - 1] : L[0];
    }
    crossing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(18).fill(0).map(() => new THREE.Vector3())), lineMat);
    crossing.frustumCulled = false;
    root.add(crossing);
  }
  function updateCrossing(slip) {
    const a = poleTops.s, b = poleTops.n.clone().add(tv.set(ST.x * slip, 0, ST.z * slip));
    const arr = crossing.geometry.attributes.position, ex = new THREE.Vector3(ST.x * 0.8, 0, ST.z * 0.8);
    let j = 0;
    for (const sgn of [1, -1]) for (let k = 0; k <= 8; k++) {
      const t = k / 8, p = new THREE.Vector3().lerpVectors(a, b, t).addScaledVector(ex, sgn);
      arr.setXYZ(j++, p.x, a.y + (b.y - a.y) * t + 8.68 - 0.6 * 4 * t * (1 - t), p.z);
    }
    arr.needsUpdate = true;
  }
  updateCrossing(0);

  // --- Su: dere şeridi ve çöküntü (sag) gölü ---
  const waterMat = procedural({
    key: 'fay-water', physical: true, bump: 0.03,
    params: { color: 0x3a5a52, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.93, ior: 1.33, specularIntensity: 1, side: THREE.DoubleSide },
    uniforms: { uT: { value: 0 } },
    pattern: /* glsl */ `
      vec2 q = p.xz;
      float r1 = vn3(vec3(q*0.35, uT*0.35)), r2 = vn3(vec3(q*1.7 + uT*0.4, uT*0.8));
      h = r1*0.6 + r2*0.4;
      col *= 0.85 + 0.25*fbm3(vec3(q*0.03, uT*0.02), 3);`,
  });
  {
    const pos = [], idx = [], n = STREAM.length;
    for (let i = 0; i < n; i++) {
      const a = STREAM[Math.max(0, i - 1)], b = STREAM[Math.min(n - 1, i + 1)];
      let du = b[0] - a[0], dv = b[1] - a[1]; const l = Math.hypot(du, dv) || 1; du /= l; dv /= l;
      for (const s of [-1, 1]) {
        const [x, z] = fromUV(STREAM[i][0] - dv * 6.6 * s, STREAM[i][1] + du * 6.6 * s);
        pos.push(x, STREAM[i][2], z);
      }
      if (i < n - 1) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const w = new THREE.Mesh(g, waterMat);
    w.userData.noCast = true; w.renderOrder = 1;
    root.add(w);
    const sh = new THREE.Shape();
    sh.absellipse(0, 0, POND.a * 1.03, POND.b * 1.05, 0, Math.PI * 2);
    const pg = new THREE.ShapeGeometry(sh, 48).rotateX(-Math.PI / 2);
    const pw = new THREE.Mesh(pg, waterMat);
    const [px, pz] = fromUV(POND.u, POND.v);
    pw.position.set(px, POND.W, pz); pw.rotation.y = theta;
    pw.userData.noCast = true; pw.renderOrder = 1;
    root.add(pw);
    // kıyı sazlığı
    const R2 = [];
    for (let k = 0; k < (LOW ? 50 : 110); k++) {
      const a = rnd() * Math.PI * 2, e = 1.02 + rnd() * 0.18, u = POND.u + Math.cos(a) * POND.a * e, v = POND.v + Math.sin(a) * POND.b * e;
      R2.push(T(u, v, 0.8 + rnd() * 0.5, 0.8));
    }
    trees('shrub', R2, { color: 0x6a7a36, seeds: 2, dens: 0.5 });
  }

  // --- Kırılma tozu: yüzey kırığı boyunca yükselen yumuşak toz ---
  const NDU = LOW ? 260 : 600;
  const dg = new THREE.BufferGeometry(), dpos = new Float32Array(NDU * 3), dseed = [];
  for (let i = 0; i < NDU; i++) {
    const u = -1500 + rnd() * 3000, p = P(u, (rnd() - 0.5) * 6, 0.3);
    dseed.push({ x: p.x, y: p.y, z: p.z, r: rnd(), vx: (rnd() - 0.5) * 2, vz: (rnd() - 0.5) * 2 });
    dpos.set([p.x, -1e5, p.z], i * 3);
  }
  dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dmat = new THREE.PointsMaterial({ size: 9, map: softDot(), transparent: true, opacity: 0, depthWrite: false, color: 0xb7a58c, sizeAttenuation: true });
  const dust = new THREE.Points(dg, dmat);
  dust.frustumCulled = false; dust.userData.noShadow = true;
  root.add(dust);
  let dustT = -1;

  return {
    root, north,
    setSlip(s) { north.position.set(ST.x * s, 0, ST.z * s); updateCrossing(s); },
    setDamage,
    burst() { dustT = 0; },
    update(dt, time, showDust) {
      waterMat.userData.uniforms.uT.value = time;
      veg.update(time);
      if (dustT < 0 || !showDust) { dmat.opacity = 0; dust.visible = false; return; }
      dust.visible = true;
      dustT += dt;
      const k = dustT;
      for (let i = 0; i < NDU; i++) {
        const d = dseed[i], t = Math.max(0, k - d.r * 1.5);
        dpos[i * 3] = d.x + d.vx * t * 1.5; dpos[i * 3 + 1] = d.y + 7 * (1 - Math.exp(-t * 0.5)) * (0.4 + d.r); dpos[i * 3 + 2] = d.z + d.vz * t * 1.5;
      }
      dg.attributes.position.needsUpdate = true;
      dmat.opacity = clamp(k * 2, 0, 1) * clamp(1 - (k - 3) / 12, 0, 1) * 0.55;
      dmat.size = 9 + k * 1.2;
      if (k > 15) dustT = -1;
    },
  };
}
