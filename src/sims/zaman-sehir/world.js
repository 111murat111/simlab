// Zaman Makinesi Şehir — sahne (yalnız görsel, metre): denize inen yamaç, rıhtım, iskele, cami, dönem mimarisi, ağaçlar, araçlar.
// Model (parsel durumları, nüfus, ulaşım payları) main.js'te kalır; bu dosya o durumlardan sahneyi kurar.
import { THREE, mat, procedural, RoundedBoxGeometry, BufferGeometryUtils, landscape, createTerrain, terrainSkirt, terrainMaterial,
  createVegetation, depthTexture, treeParts, leafMaterial, seeded, smoothstep as ss, lerp, clamp,
  makeBuilding, populateCity, streetLamps, carFleet, streetMaterials as groundMats } from '@core';
import { ashlar, oldBrick, paving } from './stone.js';

export const LOW = /[?&]low\b/.test(location.search);
const clean = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; };
const merge = (list) => BufferGeometryUtils.mergeGeometries(list.map(clean));
const RB = (w, h, d, r = 0.05, s = 2) => new RoundedBoxGeometry(w, h, d, s, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));

// ---------------------------------------------------------------- Arazi
const hills = landscape({ seed: 23, size: 700, height: 120, octaves: 6, warp: 0.4 });
const farH = landscape({ seed: 57, size: 1000, height: 160, octaves: 6, warp: 0.5 });
/** Kıyı çizgisi (z, m): semt önünde düz rıhtım, dışında girintili kıyı. */
export function shoreZ(x) { const a = Math.abs(x); return 80 + ss(260, 700, a) * (45 * Math.sin(x * 0.0035 + 0.8) + 18 * Math.sin(x * 0.011 + 2)); }
/** Semt yamacı: z < 40 m'de %22 eğim (≈12°), sahil şeridi düz (1,8 m). */
export function slopeY(z) { const s = Math.max(0, 40 - z); return 1.8 + 0.22 * (s < 320 ? s : 320 + (s - 320) * 0.4); }
export function height(x, z) {
  const sz = shoreZ(x), d = z - sz;
  if (d > 0) {
    let h = Math.max(1.8 - Math.min(d * 1.3, 7) - Math.max(0, d - 5) * 0.1, -28);
    const o = ss(980, 1250, z);                           // karşı kıyı (≈1 km)
    if (o > 0) h = lerp(h, 4 + Math.max(0, farH(x, z) + 70) * 0.8, o);
    return h;
  }
  let h = slopeY(z - sz + 80);
  const wild = Math.max(ss(215, 520, Math.abs(x)), ss(262, 560, -z));
  if (wild > 0) h += wild * ss(10, 160, -d) * Math.max(-12, hills(x, z));
  return h;
}
const inCore = (x, z) => Math.abs(x) < 234 && z > -276 && z < 100;
const inStrip = (x, z) => { const d = z - shoreZ(x); return d > -98 && d < 6 && Math.abs(x) < 1180; };

// ---------------------------------------------------------------- Yerel malzemeler
function mats() {
  return {
    cobble: procedural({ // Arnavut kaldırımı: yuvarlak taşlar, koyu derz
      key: 'zs-cobble', params: { color: 0x7d776d, roughness: 0.85 }, bump: 0.05,
      pattern: `
        vec2 uv = p.xz*3.4;
        float c = cells3(vec3(uv, 0.3));
        float m = 1.0 - smoothstep(0.42, 0.62, c);
        float t = h13(vec3(floor(uv*1.0), 1.0)), n = fbm3(p*0.5, 3);
        col *= mix(0.45, (0.8 + 0.35*vn3(vec3(uv*1.7, 2.0)))*(0.85 + 0.25*n), m);
        rough = mix(0.97, 0.7, m); h = m*(1.0 - c*c);`,
    }),
    lead: procedural({ // kurşun kaplama: dikiş çizgileri, yaşlanma
      key: 'zs-lead', params: { color: 0x8b959c, roughness: 0.5, metalness: 0.55 }, bump: 0.02,
      pattern: `
        float a = atan(p.z, p.x)*6.0;
        float seam = smoothstep(0.0, 0.06, abs(fract(a) - 0.5) - 0.44);
        float n = fbm3(p*0.8, 4);
        col *= (0.85 + 0.2*n)*(1.0 - 0.15*seam);
        col = mix(col, vec3(0.55, 0.6, 0.58), 0.25*smoothstep(0.5, 0.8, fbm3(p*1.7, 3)));
        rough = 0.45 + 0.2*n; h = seam;`,
    }),
    wood: mat.wood({ color: 0x6b4a2e }),
    deck: mat.wood({ color: 0x8a6a48, scale: 1 }),
    stone: ashlar({ color: 0xd8d0bf, course: 0.55, len: 1.1 }),
    rubble: ashlar({ color: 0xa89c88, course: 0.35, len: 0.6 }),
    brick: oldBrick({ color: 0x8a4a34 }),
    paving: paving({ color: 0xbdb5a6, size: 1.2 }),
    conc: mat.concrete({ color: 0xb9b3a8, stains: 0.5 }),
    gold: mat.brushedMetal({ color: 0xd6b25e, rough: 0.3 }),
    iron: mat.paintedMetal({ color: 0x2c3a33, wear: 0.25 }),
    rail: mat.brushedMetal({ color: 0x9da2a6, rough: 0.35 }),
    white: mat.paintedMetal({ color: 0xf1f0ea, wear: 0.12 }),
    black: mat.paintedMetal({ color: 0x1a1c1f, wear: 0.2 }),
    red: mat.paintedMetal({ color: 0x9c1f1d, wear: 0.2 }),
    cream: mat.paintedMetal({ color: 0xe9dcb8, wear: 0.15 }),
    grey: mat.paintedMetal({ color: 0x6f7479, wear: 0.2 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x151d24, roughness: 0.06, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 }),
    orange: mat.plastic({ color: 0xe0661c, gloss: 0.4 }),
    bike: procedural({ key: 'zs-bike', params: { color: 0x2f7d46, roughness: 0.7 }, bump: 0.01, pattern: 'float n = fbm3(p*1.5, 3); col *= 0.8 + 0.3*n; rough = 0.6 + 0.3*n;' }),
  };
}

// ---------------------------------------------------------------- Yardımcı geometri
/** Yere oturan şerit: (x0,z0)→(x1,z1), yarı genişlik w; y = height + yo. */
function ribbon(x0, z0, x1, z1, w, yo = 0.08, seg = 0, hf = height) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = seg || Math.max(1, Math.ceil(L / 8));
  const ux = (x1 - x0) / L, uz = (z1 - z0) / L, rx = -uz * w, rz = ux * w;
  const P = [], I = [];
  for (let k = 0; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n, z = z0 + (z1 - z0) * k / n;
    for (const s of [-1, 1]) { const px = x + rx * s, pz = z + rz * s; P.push(px, hf(px, pz) + yo, pz); }
  }
  for (let k = 0; k < n; k++) { const a = k * 2; I.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
/** Kıyı boyunca eğri şerit: d = kıyıdan uzaklık (−: kara), x0..x1. */
function coastRibbon(x0, x1, d, w, yo) {
  const P = [], I = [], n = Math.ceil((x1 - x0) / 6);
  for (let k = 0; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n;
    for (const s of [-1, 1]) { const z = shoreZ(x) + d + s * w; P.push(x, height(x, z) + yo, z); }
  }
  for (let k = 0; k < n; k++) { const a = k * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// ---------------------------------------------------------------- Ağaç havuzu (motor ağaçları, dönemle değişen yerleşim)
function treePool(scene) {
  const KINDS = { pine: 360, cypress: 420, broad: 520, fruit: 420, oak: 60 };
  const leaf = leafMaterial(0x4d6a2c, { wind: 0.5, bark: 0x4e3d2c });
  const pools = {};
  for (const [k, max] of Object.entries(KINDS)) {
    pools[k] = [0, 1].map((v) => {
      const t = treeParts(k, 11 + v * 7 + k.length, { dens: LOW ? 0.75 : 0.9 });
      const im = new THREE.InstancedMesh(BufferGeometryUtils.mergeGeometries([t.trunk, t.crown]), leaf, max);
      im.count = 0; im.frustumCulled = false; im.castShadow = im.receiveShadow = true; im.userData.noFit = true;
      scene.add(im);
      return im;
    });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), v = new THREE.Vector3(), c = new THREE.Color();
  return {
    /** list: [kind, x, z, scale, seed, y?] (y yoksa arazi yüksekliği) */
    set(list) {
      for (const k in pools) pools[k].forEach((im) => (im.count = 0));
      for (const [k, x, z, s, sd, yy] of list) {
        const im = pools[k][sd < 0.5 ? 0 : 1];
        if (im.count >= im.instanceMatrix.count) continue;
        q.setFromAxisAngle(up, sd * 40);
        m4.compose(v.set(x, yy ?? height(x, z) - 0.2, z), q, sc.set(s, s * (0.9 + 0.2 * ((sd * 7) % 1)), s));
        im.setMatrixAt(im.count, m4);
        im.setColorAt(im.count, c.setRGB(0.86 + 0.2 * ((sd * 13) % 1), 0.9 + 0.14 * ((sd * 3) % 1), 0.8 + 0.16 * ((sd * 7) % 1)));
        im.count++;
      }
      for (const k in pools) pools[k].forEach((im) => { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; });
    },
  };
}

// ---------------------------------------------------------------- Cami (sabit): kare harim, sekizgen kasnak, kurşun kubbe, son cemaat yeri, minare, şadırvan
function mosque(K, x, z) {
  const g = new THREE.Group();
  const yT = slopeY(z) + 0.2;
  g.position.set(x, yT, z);
  const add = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  // Teras (istinat duvarı) ve basamaklar
  add(RB(26, 7, 30, 0.2).translate(0, -3.4, 0), K.rubble);
  add(merge([0, 1, 2, 3, 4, 5].map((k) => RB(8, 0.4, 1.2, 0.05).translate(0, -3.6 + k * 0.6 + 0.2 - 0.6 * 0 , 15.2 + 5 * 1.1 - k * 1.1))), K.stone);
  add(RB(24.5, 0.25, 28.5, 0.08).translate(0, 0.1, 0), K.paving);
  // Harim
  const zc = -2.5;
  add(RB(13, 9, 13, 0.08).translate(0, 4.5, zc), K.stone);
  add(RB(13.6, 0.5, 13.6, 0.1).translate(0, 9.1, zc), K.stone);                // saçak silmesi
  // Pencereler: kemerli, iki sıra
  const win = new THREE.Shape(); win.moveTo(-0.55, 0); win.lineTo(0.55, 0); win.lineTo(0.55, 1.5); win.absarc(0, 1.5, 0.55, 0, Math.PI, false); win.lineTo(-0.55, 0);
  const wg = new THREE.ExtrudeGeometry(win, { depth: 0.12, bevelEnabled: false, curveSegments: 8 });
  const wins = [];
  for (const side of [0, 1, 2, 3]) for (const row of [1.6, 5.4]) for (const u of [-3.6, 0, 3.6]) {
    if (side === 0 && row < 3) continue;
    const w = wg.clone().translate(u, row, 6.47);
    w.rotateY(side * Math.PI / 2); w.translate(0, 0, 0);
    wins.push(w.translate(0, 0, 0));
  }
  add(merge(wins).translate(0, 0, zc), K.glass);
  // Kasnak, köşe ağırlık kuleleri, kubbe, alem
  add(new THREE.CylinderGeometry(5.9, 6.2, 2.4, 16).translate(0, 10.5, zc), K.stone);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    add(new THREE.CylinderGeometry(0.55, 0.6, 1.8, 10).translate(a * 5.8, 10.2, zc + b * 5.8), K.stone);
    add(new THREE.ConeGeometry(0.62, 1.3, 10).translate(a * 5.8, 11.75, zc + b * 5.8), K.lead);
  }
  add(new THREE.SphereGeometry(6.1, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.88, 1).translate(0, 11.7, zc), K.lead);
  add(lathe([[0.001, 0], [0.18, 0], [0.12, 0.5], [0.22, 0.8], [0.1, 1.2], [0.2, 1.5], [0.001, 2.2]], 10).translate(0, 17.0, zc), K.gold);
  // Son cemaat yeri: 5 sütun, 3 küçük kubbe
  const pz = zc + 6.5 + 2.6;
  for (let k = 0; k < 6; k++) add(lathe([[0.38, 0], [0.38, 0.35], [0.26, 0.5], [0.24, 4.2], [0.36, 4.4], [0.42, 4.8], [0.001, 4.8]], 14).translate(-6.2 + k * 2.48, 0.2, pz + 2.1), K.stone);
  add(RB(13.4, 0.7, 5.4, 0.1).translate(0, 5.3, pz), K.stone);
  for (const u of [-4.2, 0, 4.2]) {
    add(new THREE.CylinderGeometry(1.7, 1.8, 0.7, 12).translate(u, 5.95, pz), K.stone);
    add(new THREE.SphereGeometry(1.75, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 1).translate(u, 6.3, pz), K.lead);
  }
  // Minare: kare kaide, çokgen gövde, şerefe, külah, alem
  const mx = 7.4, mz = zc + 5.6;
  add(RB(2.9, 10, 2.9, 0.06).translate(mx, 5, mz), K.stone);
  add(new THREE.CylinderGeometry(1.5, 1.45, 1.2, 12).translate(mx, 10.6, mz), K.stone);
  add(lathe([[1.15, 0], [1.1, 14.5], [1.6, 15.3], [1.95, 16.0], [1.95, 16.25], [1.0, 16.3], [0.95, 20.5], [1.12, 20.7], [1.12, 21.0], [0.001, 21.0]], 12).translate(0, 11.2, 0).translate(mx, 0, mz), K.stone);
  add(new THREE.CylinderGeometry(1.95, 1.95, 1.0, 16, 1, true).translate(mx, 27.95, mz), K.stone); // şerefe korkuluğu
  add(new THREE.ConeGeometry(1.2, 7.5, 12).translate(mx, 32.2 + 3.75, mz), K.lead);
  add(lathe([[0.001, 0], [0.12, 0], [0.08, 0.4], [0.16, 0.6], [0.001, 1.4]], 8).translate(mx, 39.9, mz), K.gold);
  // Şadırvan
  const sx = -6.5, sz = 9.5;
  add(new THREE.CylinderGeometry(2.2, 2.3, 0.9, 8).translate(sx, 0.55, sz), K.stone);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; add(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 8).translate(sx + Math.cos(a) * 2.6, 1.3, sz + Math.sin(a) * 2.6), K.stone); }
  add(new THREE.ConeGeometry(3.3, 1.8, 8).translate(sx, 3.5, sz), K.lead);
  return { group: g, yT, top: yT + 40 };
}

// ---------------------------------------------------------------- Taşıtlar
function ferry(K) {
  const L = 31, B = 6.4, g = new THREE.Group();
  const plan = (l, b) => {
    const s = new THREE.Shape();
    s.moveTo(-l, 0); s.bezierCurveTo(-l, b * 0.8, -l * 0.72, b, -l * 0.45, b); s.lineTo(l * 0.45, b);
    s.bezierCurveTo(l * 0.72, b, l, b * 0.8, l, 0); s.bezierCurveTo(l, -b * 0.8, l * 0.72, -b, l * 0.45, -b);
    s.lineTo(-l * 0.45, -b); s.bezierCurveTo(-l * 0.72, -b, -l, -b * 0.8, -l, 0);
    return s;
  };
  const ext = (l, b, h, bev = 0.25) => new THREE.ExtrudeGeometry(plan(l, b), { depth: h, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 2, curveSegments: 10 }).rotateX(-Math.PI / 2);
  const add = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  add(ext(L, B, 2.2).translate(0, -1.6, 0), K.black);                  // su altı + siyah borda
  add(ext(L + 0.05, B + 0.05, 1.6, 0.12).translate(0, 0.75, 0), K.white);       // beyaz küpeşte bandı
  add(ext(L - 0.6, B - 0.5, 0.2, 0.05).translate(0, 2.45, 0), K.deck);
  add(RB(42, 2.6, 10.6, 0.25).translate(0, 3.9, 0), K.white);
  add(RB(40.5, 1.0, 10.75, 0.2).translate(0, 4.05, 0), K.glass);
  add(RB(33, 2.3, 9.4, 0.25).translate(0, 6.35, 0), K.white);
  add(RB(31.5, 0.9, 9.55, 0.2).translate(0, 6.5, 0), K.glass);
  add(RB(44, 0.25, 11.8, 0.1).translate(0, 5.3, 0), K.white);                   // gezinti güvertesi saçağı
  add(RB(35, 0.22, 10.6, 0.1).translate(0, 7.6, 0), K.white);
  for (const s of [-1, 1]) {
    add(RB(5, 2.1, 7, 0.3).translate(s * 12.5, 8.7, 0), K.white);                // kaptan köşkleri (çift uçlu vapur)
    add(RB(5.1, 0.8, 7.1, 0.2).translate(s * 12.5, 9.0, 0), K.glass);
    for (const b of [-1, 1]) add(new THREE.CapsuleGeometry(0.6, 3.2, 4, 10).rotateZ(Math.PI / 2).translate(s * 6.5, 8.3, b * 4.2), K.orange);
  }
  const funnel = add(lathe([[1.25, 0], [1.2, 4.6], [1.05, 4.8], [0.001, 4.8]], 20).translate(0, 7.7, 0), K.black);
  add(new THREE.CylinderGeometry(1.26, 1.3, 0.6, 20).translate(0, 8.0, 0), K.white);
  add(new THREE.CylinderGeometry(0.08, 0.1, 7, 6).translate(0, 11, -2.5), K.grey);
  g.userData.funnel = funnel;
  return g;
}
/** Ahşap balıkçı kayığı: istasyonlardan örülen gövde (sivri baş, yuvarlak kıç, sheer), küpeşte, küçük kaptan köşkü. */
function boatGeo() {
  const L = 7.2, B = 2.3, D = 0.95, N = 18, M = 10, P = [], I = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N * 2 - 1, x = t * L / 2;                        // t: −1 kıç … +1 baş
    const hb = (B / 2) * (t > 0 ? Math.pow(1 - Math.pow(t, 1.7), 0.75) : Math.pow(1 - Math.pow(-t, 3.2), 0.5)) + 0.02;
    const sheer = D * 0.25 * t * t + (t > 0 ? 0.15 * t * t * t : 0);
    for (let j = 0; j <= M; j++) {
      const a = -Math.PI / 2 + Math.PI * j / M;
      const k = Math.cos(a);
      P.push(x, sheer - D * Math.pow(k, 0.7) * (1 - 0.3 * t * t), hb * Math.sin(a));
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + M + 1; I.push(a, b, a + 1, a + 1, b, b + 1); }
  const hull = new THREE.BufferGeometry(); hull.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); hull.setIndex(I);
  hull.computeVertexNormals();
  const deck = new THREE.BoxGeometry(L * 0.86, 0.06, B * 0.8).translate(-0.1, -0.12, 0);
  const cabin = RB(1.5, 1.2, 1.3, 0.08).translate(-1.4, 0.45, 0);
  const roof = RB(1.8, 0.08, 1.6, 0.03).translate(-1.4, 1.08, 0);
  const mast = new THREE.CylinderGeometry(0.05, 0.06, 3.2, 6).translate(1.2, 1.4, 0);
  return { hull, top: merge([deck, cabin, roof, mast]), L };
}
function oldTram(K) {
  const g = new THREE.Group();
  const add = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  add(RB(8.6, 1.05, 2.2, 0.12).translate(0, 1.25, 0), K.red);
  add(RB(8.6, 1.25, 2.12, 0.08).translate(0, 2.4, 0), K.cream);
  const w = [];
  for (let k = 0; k < 7; k++) for (const s of [-1, 1]) w.push(RB(0.85, 0.8, 0.06, 0.03).translate(-3.3 + k * 1.1, 2.45, s * 1.07));
  add(merge(w), K.glass);
  add(RB(9.4, 0.18, 2.4, 0.08).translate(0, 3.1, 0), K.grey);
  add(RB(6, 0.35, 1.2, 0.1).translate(0, 3.35, 0), K.grey);
  for (const s of [-1, 1]) add(RB(0.9, 1.9, 2.0, 0.2).translate(s * 4.7, 1.95, 0), K.cream);   // açık sahanlıklar
  const wh = [];
  for (const x of [-2.4, 2.4]) for (const s of [-1, 1]) wh.push(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 14).rotateX(Math.PI / 2).translate(x, 0.45, s * 0.72));
  add(merge(wh), K.black);
  add(RB(6.5, 0.4, 1.6, 0.1).translate(0, 0.72, 0), K.black);
  const pole = add(new THREE.CylinderGeometry(0.04, 0.05, 5.2, 6).rotateZ(1.1).translate(-1.4, 4.55, 0), K.black);
  g.userData.pole = pole;
  return g;
}
function lightRail(K) {
  const g = new THREE.Group();
  const add = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  for (let k = 0; k < 3; k++) {
    const x = (k - 1) * 10.8, end = k !== 1;
    add(RB(10.4, 2.9, 2.65, end ? 0.6 : 0.25).translate(x, 1.85, 0), K.white);
    add(RB(end ? 9.6 : 10.45, 1.15, 2.7, 0.3).translate(x, 2.35, 0), K.glass);
    add(RB(10.45, 0.22, 2.7, 0.08).translate(x, 1.2, 0), K.red);
    add(RB(4, 0.45, 1.6, 0.15).translate(x, 3.5, 0), K.grey);
  }
  add(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5).rotateZ(0.9).translate(0.2, 4.35, 0), K.black);
  add(RB(1.6, 0.05, 0.3, 0.02).translate(0.8, 5.0, 0), K.black);
  return g;
}

// ---------------------------------------------------------------- Dünya
export const ROW_Z = [30, 4, -36, -62, -102, -128, -168, -194, -234];
export const ROADS = { coast: 59, r1: -16, r2: -82, l1: -148, l2: -214, sideX: [-197, -59, 59, 197] };

export function buildWorld(sim, plots) {
  const scene = sim.scene, K = mats(), G = groundMats();

  // --- Arazi, deniz tabanı, uzak kıyı ---
  const TOPT = { water: 0, grass: 0x66703a, dry: 0xa39461, forest: 0.85, sand: 0xc2b28e, rock: 0x857d70 };
  const tmat = terrainMaterial(TOPT);
  scene.add(createTerrain(height, { size: [1800, 1800], center: [0, -150], res: LOW ? [260, 260] : [380, 380], material: tmat }));
  const BIG = 16000;
  scene.add(createTerrain((x, z) => height(x, z) - 3 * Math.min(ss(900, 860, Math.abs(x)), ss(900, 860, Math.abs(z + 150))),
    { size: [BIG, BIG], res: LOW ? [200, 200] : [260, 260], material: tmat }));
  scene.add(terrainSkirt(height, { inner: BIG / 2, outer: 70000, material: tmat }));
  const DR = [-2600, -1300, 2600, 1900];
  sim.ocean.setDepth(depthTexture(height, DR, LOW ? 256 : 384), DR);
  const veg = createVegetation((x, z) => (inCore(x, z) || inStrip(x, z) ? -100 : height(x, z)), {
    rect: [-2600, -1400, 2600, 1800], trees: LOW ? 3600 : 8000, shrubs: LOW ? 900 : 2000, rocks: 40, seed: 5, water: 0.5,
    near: [0, -300, 950], kinds: { pine: 0.45, broad: 0.35, cypress: 0.2 }, leafA: 0x3a5224, leafB: 0x66713a,
  });
  scene.add(veg.group);

  // --- Rıhtım: taş sur duvarı, döşeli sahil, babalar ---
  {
    add(RB(472, 5.6, 1.4, 0.15).translate(0, -0.85, 83.6), K.stone);
    add(RB(470, 2.4, 14, 0.1).translate(0, 0.78, 76.2), K.paving);
    add(RB(472, 0.3, 1.6, 0.08).translate(0, 2.05, 83.4), K.stone);             // rıhtım kenar taşı
    const b = [];
    for (let x = -228; x <= 228; x += 9) b.push(lathe([[0.22, 0], [0.24, 0.45], [0.16, 0.55], [0.2, 0.75], [0.001, 0.8]], 10).translate(x, 2.2, 82.4));
    add(merge(b), K.iron);
  }
  function add(geo, m, parent = scene) { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; parent.add(o); return o; }

  // --- Yollar ---
  const mainRoads = [];
  mainRoads.push(add(coastRibbon(-1180, 1180, -21, 11, 0.07), K.cobble));
  mainRoads.push(add(ribbon(-420, ROADS.r1, 420, ROADS.r1, 7, 0.07), K.cobble));
  const r2 = add(ribbon(-420, ROADS.r2, 420, ROADS.r2, 7, 0.07), K.cobble);
  mainRoads.push(r2);
  const lanes = [];
  for (const z of [ROADS.l1, ROADS.l2]) lanes.push(ribbon(-205, z, 205, z, 5, 0.07));
  for (const x of ROADS.sideX) lanes.push(ribbon(x, -262, x, 47, Math.abs(x) > 100 ? 5 : 6, 0.08));
  add(merge(lanes), K.cobble);
  // Kaldırımlar (sahil yolunun kara tarafı: dükkân önüne kadar döşeli; ana yollar)
  const walks = [coastRibbon(-1180, 1180, -36.8, 4.8, 0.2)];
  for (const z of [ROADS.r1, ROADS.r2]) for (const s of [-1, 1]) walks.push(ribbon(-232, z + s * 8.3, 232, z + s * 8.3, 1.3, 0.2));
  add(merge(walks), G.paver);
  // Yol çizgileri (1965 sonrası), bisiklet yolu
  const dash = [];
  for (let x = -1150; x < 1150; x += 9) { const z = shoreZ(x) - 21; dash.push(new THREE.PlaneGeometry(3, 0.16).rotateX(-Math.PI / 2).rotateY(-Math.atan((shoreZ(x + 1) - shoreZ(x - 1)) / 2)).translate(x, height(x, z) + 0.1, z)); }
  for (const z of [ROADS.r1]) for (let x = -410; x < 410; x += 9) dash.push(new THREE.PlaneGeometry(3, 0.16).rotateX(-Math.PI / 2).rotateX(Math.atan(0.22)).translate(x, slopeY(z) + 0.1, z));
  const marks = add(merge(dash), G.paint); marks.userData.noAO = true; marks.castShadow = false;
  const bikeA = add(coastRibbon(-1180, 1180, -12.2, 1.0, 0.1), K.bike); bikeA.castShadow = false;
  const bikeB = add(ribbon(-232, ROADS.r1 + 5.3, 232, ROADS.r1 + 5.3, 0.9, 0.1), K.bike); bikeB.castShadow = false;
  // Tramvay rayları (sahil yolu), direkler ve katener
  const tramRails = new THREE.Group();
  {
    const rails = [];
    for (const s of [-0.72, 0.72]) rails.push(coastRibbon(-1180, 1180, -28 + s, 0.05, 0.12));
    add(merge(rails), K.rail, tramRails);
  }
  const catenary = new THREE.Group();
  {
    const poles = [];
    for (let x = -1150; x < 1150; x += 34) {
      const z = shoreZ(x) - 33.2, y = height(x, z);
      poles.push(lathe([[0.16, 0], [0.12, 0.6], [0.09, 6.8], [0.001, 7.0]], 8).translate(x, y, z));
      poles.push(new THREE.CylinderGeometry(0.04, 0.04, 5.6, 5).rotateX(Math.PI / 2).translate(x, y + 6.6, z + 2.8));
    }
    add(merge(poles), K.iron, catenary);
  }
  scene.add(tramRails, catenary);
  // Raylı sistem (2008+): yol ortasında çift hat, ada peron, saçak
  const railLine = new THREE.Group();
  {
    const bed = ribbon(-420, ROADS.r2, 420, ROADS.r2, 3.6, 0.1);
    add(bed, G.lawn, railLine);
    const rails = [];
    for (const c of [-2.6, 2.6]) for (const s of [-0.72, 0.72]) rails.push(ribbon(-420, ROADS.r2 + c + s, 420, ROADS.r2 + c + s, 0.05, 0.2));
    add(merge(rails), K.rail, railLine);
    const px = 15, pz = ROADS.r2, py = slopeY(pz);
    add(RB(42, 0.9, 2.4, 0.08).rotateX(Math.atan(0.22) * 0).translate(px, py + 0.45, pz), K.conc, railLine);
    const cols = [];
    for (let k = -3; k <= 3; k++) cols.push(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 8).translate(px + k * 6, py + 2.5, pz));
    add(merge(cols), K.grey, railLine);
    add(RB(40, 0.18, 4.2, 0.06).translate(px, py + 4.15, pz), K.glass, railLine);
    const cp = [];
    for (let x = -410; x < 420; x += 30) cp.push(new THREE.CylinderGeometry(0.1, 0.12, 7, 8).translate(x, slopeY(pz) + 3.5, pz), new THREE.CylinderGeometry(0.035, 0.035, 6.2, 5).rotateX(Math.PI / 2).translate(x, slopeY(pz) + 6.6, pz));
    add(merge(cp), K.grey, railLine);
  }
  scene.add(railLine);
  // Sokak lambaları (1960 sonrası): sahil kaldırımı + ana yolların iki yanı (kol yola doğru)
  const lampPts = [];
  for (let x = -1150; x < 1150; x += 36) { const z = shoreZ(x) - 34.2; lampPts.push([x, z, 0, height(x, z) + 0.15]); }
  for (let x = -222; x < 230; x += 26) if (Math.abs(x - 40) > 10) lampPts.push([x, 78.5, Math.PI, 2.0]);   // rıhtım gezinti yolu
  for (const z of [ROADS.r1, ROADS.r2]) for (const sd of [-1, 1]) for (let x = -222 + (sd > 0 ? 0 : 16); x < 230; x += 32) {
    if (ROADS.sideX.some((sx) => Math.abs(sx - x) < 9)) continue;
    const zz = z + sd * 8.1; lampPts.push([x, zz, sd > 0 ? Math.PI : 0, slopeY(zz) + 0.15]);
  }
  const lamps = streetLamps(lampPts);
  scene.add(lamps.group);

  // --- İskele: kazıklar, ahşap güverte, kiremit çatılı iskele binası ---
  const PIER = { x: 40, z0: 84, z1: 128 };
  {
    const piles = [];
    for (let z = PIER.z0 + 2; z <= PIER.z1; z += 4) for (const x of [-6, -2, 2, 6]) piles.push(new THREE.CylinderGeometry(0.22, 0.26, 9, 8).translate(PIER.x + x, -2.6, z));
    add(merge(piles), K.wood);
    add(RB(14, 0.45, PIER.z1 - PIER.z0, 0.06).translate(PIER.x, 1.95, (PIER.z0 + PIER.z1) / 2), K.deck);
    const rail = [];
    for (const x of [-6.9, 6.9]) { rail.push(RB(0.12, 0.1, PIER.z1 - PIER.z0, 0.03).translate(PIER.x + x, 3.2, (PIER.z0 + PIER.z1) / 2)); for (let z = PIER.z0 + 1; z < PIER.z1; z += 2) rail.push(RB(0.1, 1.0, 0.1, 0.02).translate(PIER.x + x, 2.7, z)); }
    add(merge(rail), K.white);
  }
  {
    const pb = makeBuilding({ type: 'house', floors: 1, width: 16, depth: 10, seed: 61, roof: 'hip', age: 0.35,
      colors: { wall: 0xe9dcc0, trim: 0xf4efe4, roof: 0xb4583a, frame: 0x3f5a4a } });
    pb.position.set(PIER.x, 2.1, PIER.z1 - 8); pb.rotation.y = Math.PI;
    scene.add(pb);
  }

  // --- Cami ---
  const mp = plots.find((p) => p.mosque);
  const M = mosque(K, mp.x, mp.z);
  scene.add(M.group);

  // --- Dönemle değişen katmanlar: motor binaları (parsel kümeleri; yalnız içeriği değişen küme yeniden kurulur),
  //     avlu döşemesi, eğim dolguları (moloz taş / beton), çatı bahçeleri, ağaçlar ---
  const trees = treePool(scene);
  const tilt = Math.atan(0.22);
  const patchGeo = RB(23.4, 0.3, 23.4, 0.1).rotateX(tilt);
  const mkIM = (geo, m, n) => { const im = new THREE.InstancedMesh(geo, m, n); im.count = 0; im.castShadow = im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im; };
  const patchPave = mkIM(patchGeo, G.paver, 200);
  patchPave.castShadow = false;
  const box = RB(1, 1, 1, 0.04);
  const plinthStone = mkIM(box, K.rubble, 1400), plinthConc = mkIM(box, K.conc, 400), roofLawn = mkIM(RB(1, 1, 1, 0.1), G.lawn, 200);
  roofLawn.castShadow = false;
  const IMS = [patchPave, plinthStone, plinthConc, roofLawn];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  const put = (im, x, y, z, sx, sy, sz, rot = 0) => { if (im.count >= im.instanceMatrix.count) return; q.setFromAxisAngle(up, rot); im.setMatrixAt(im.count++, m4.compose(v3.set(x, y, z), q, s3.set(sx, sy, sz))); };
  // Ege / Marmara kıyı kasabası paleti: badana beyazı, kum, hardal, kiremit pembesi, soluk mavi-yeşil
  const HOUSE = [0xefe9dc, 0xe5d6bd, 0xd9b77f, 0xc98f74, 0xd7a98a, 0xb9c4c1, 0xe2cfa7, 0xf2eee6, 0xc7b48f, 0xe9c9a4];
  const APT50 = [0xe8d8b2, 0xdcb9a0, 0xd9a860, 0xc8795a, 0xe8c4b8, 0xd6ccb8, 0xe2c9a0, 0xc9d3c5, 0xe6cfa8];
  const APT80 = [0xe3b98a, 0xd99a7a, 0xf0d2c4, 0xcfc6b2, 0xdcc07c, 0xd9d1c2, 0xe6dccb, 0xc8d3d6, 0xe8cfb0, 0xb9a48a];
  const TOWER = [0x2c3b44, 0x3a4a52, 0x33404a, 0x44525a];
  const pick = (a, u) => a[Math.floor(u * a.length) % a.length];
  const NEAR = LOW ? 230 : 380;
  const clusters = new Map();                                        // anahtar → { sig, lots, city }

  /** Eski ev: eğime oturan moloz taş bodrum + motorun 'house' arketipi (kiremit kırma/beşik çatı, söveli pencere). */
  function oldHouse(out, x, zF, s, rot, w, d, color, seed, floors = 2) {
    const zc = zF - s * d / 2, yF = height(x, zF), yB = height(x, zc - s * d / 2);
    const y0 = Math.max(yF, yB) + 0.05, yLow = Math.min(yF, yB) - 0.4;
    if (y0 - yLow > 0.5) put(plinthStone, x, (y0 + yLow) / 2, zc, w + 0.3, y0 - yLow, d + 0.3, rot);
    out.push({ type: 'house', x, z: zc, rot, y0, width: w, depth: d, floors, seed: Math.round(seed * 1e4) / 10, age: 0.45 + seed * 0.45, colors: { wall: color } });
  }
  /** Apartman: ön cephe sokağa, arka taraf eğimde beton dolgu. */
  function apartment(out, x, zF, s, rot, w, d, L) {
    const zc = zF - s * d / 2, yF = height(x, zF), yB = height(x, zc - s * d / 2), y0 = yF - 0.1;
    if (yB < yF) put(plinthConc, x, (y0 + yB - 0.5) / 2, zc, w + 0.1, y0 - yB + 0.5, d + 0.1, rot);
    out.push({ type: 'apartment', x, z: zc, rot, y0, width: w, depth: d, ...L });
  }
  const isApt = (st) => st && (st.type === 'apt' || st.type === 'green');
  const isRow = (st) => st && (isApt(st) || st.type === 'house' || st.type === 'hist');   // rıhtım sırasına katılan yapılar

  function rebuild(states, y, plan) {
    for (const im of IMS) im.count = 0;
    const groups = new Map(), T = [];
    const lotsOf = (k) => { if (!groups.has(k)) groups.set(k, []); return groups.get(k); };
    const tr = (kind, x, z, s, sd, yy) => T.push([kind, x, z, s, sd, yy]);
    const idx = new Map(plots.map((p, i) => [p.r + ',' + p.c, i]));
    plots.forEach((p, i) => {
      const st = states[i], r = seeded(1000 + i * 17);
      const out = lotsOf('c' + Math.floor(p.c / 4) + '_' + Math.floor(p.r / 2));
      const s = p.r % 2 ? -1 : 1, rot = (s < 0 ? Math.PI : 0) + p.rot * 0.5;
      const edge = p.z + s * 12.2;                                   // sokağa bakan parsel kenarı
      const pz = p.r === 0 ? 28.5 : p.z;
      if (st.type === 'apt' || st.type === 'tower') put(patchPave, p.x, slopeY(pz) - 0.08, pz, 1, 1, p.r === 0 ? 0.98 : 1, 0);
      if (p.r === 0 && (st.type === 'house' || st.type === 'hist')) {
        // 1900'lerin rıhtımı: altı dükkân, üstü konut iki-üç katlı kâgir sıra evler (kiremit kırma çatı, bitişik nizam)
        const blk = Math.floor(p.c / 4);
        const nb = (dc) => { const c = p.c + dc; return Math.floor(c / 4) === blk && isRow(states[idx.get('0,' + c)]); };
        const xL = p.x - 13 + (nb(-1) ? 0 : 1.4), xR = p.x + 13 - (nb(1) ? 0 : 1.4);
        const cuts = [xL, p.x - 4.5 + r() * 2, p.x + 3.5 + r() * 2, xR];
        for (let k = 0; k < 3; k++) {
          apartment(out, (cuts[k] + cuts[k + 1]) / 2, edge - 1.2 - r() * 0.6, 1, 0, cuts[k + 1] - cuts[k], 10 + r() * 2, {
            floors: r() < 0.45 ? 3 : 2, shop: true, roof: 'hip', balcony: r() < 0.5 ? 'rail' : 'none', bands: true, age: 0.6 + r() * 0.35,
            colors: { wall: pick(HOUSE, r()), frame: pick([0x5a3b26, 0x3f5a4a, 0xf1efe8, 0x6b4a32], r()) }, seed: r() * 1000,
            attL: k > 0 || nb(-1), attR: k < 2 || nb(1) });
        }
        tr(r() < 0.5 ? 'fruit' : 'broad', p.x + (r() - 0.5) * 16, p.z - 9, 0.7 + r() * 0.3, r());
      } else if (st.type === 'house' || st.type === 'hist') {
        const w = 11 + p.v * 3, d = 9.5 + r() * 1.5;
        const color = st.type === 'hist' && y >= 1985 ? [0xd8a86a, 0xb45a45, 0xe2cf9a][Math.floor(p.col * 3)] : pick(HOUSE, p.col);
        if (st.type === 'house' && p.v < 0.7) {
          // sokağa dayalı iki dar ev (dönemin tipik parsel bölünmesi)
          for (const u of [-1, 1]) {
            const wi = 9.2 + r() * 1.4, ci = pick(HOUSE, r());
            oldHouse(out, p.x + u * 5.8, edge - s * (0.5 + r() * 0.9), s, rot + (r() - 0.5) * 0.06, wi, 8.6 + r() * 1.4, ci, r(), r() < 0.25 ? 3 : 2);
          }
        } else oldHouse(out, p.x + (r() - 0.5) * 5, edge - s * (0.6 + r() * 1.8), s, rot + (r() - 0.5) * 0.16, w, d, color, r(), p.v > 0.75 ? 3 : 2);
        // moloz taş bahçe duvarları: arka sınır + eğime basamaklı yan duvarlar
        { const zb = p.z - s * 11.4; put(plinthStone, p.x, height(p.x, zb) + 0.55, zb, 23, 1.9, 0.5, 0);
          for (const u of [-11.4, 11.4]) for (let k = 0; k < 2; k++) { const zz = p.z - s * (1.5 + k * 5); put(plinthStone, p.x + u, height(p.x + u, zz) + 0.5, zz, 0.45, 1.7, 5.2, 0); } }
        const gz = p.z - s * 6.5;
        tr(r() < 0.55 ? 'fruit' : 'broad', p.x - 6 + r() * 3, gz, 0.75 + r() * 0.35, r());
        if (r() < 0.6) tr(r() < 0.35 ? 'cypress' : 'fruit', p.x + 5 + r() * 3, gz - s * r() * 3, 0.7 + r() * 0.4, r());
      } else if (isApt(st)) {
        const green = st.type === 'green', early = p.tA < 1966 && !green;
        const colors = { wall: green ? pick([0xf1efe8, 0xe9e4d8, 0xdfe3e2], p.col) : pick(early ? APT50 : APT80, p.col) };
        const hip = early && st.floors <= 5 && p.v < 0.45;
        const base = { floors: st.floors, colors, roof: green ? 'flat' : hip ? 'hip' : 'flat', age: early ? 0.5 + p.v * 0.2 : green ? 0.1 : 0.3 + p.v * 0.25, green };
        if (green) Object.assign(base, { roofGear: false, balcony: 'rail' });
        if (p.r === 0) {
          // Rıhtım cephesi: dükkân katlı, bitişik nizam sıra binalar (komşu parsel de apartmansa yan duvar sağır ve bitişik)
          const blk = Math.floor(p.c / 4);
          const nb = (dc) => { const c = p.c + dc; return Math.floor(c / 4) === blk && isRow(states[idx.get('0,' + c)]); };
          const xL = p.x - 13 + (nb(-1) ? 0 : 1.4), xR = p.x + 13 - (nb(1) ? 0 : 1.4), xm = p.x + (r() - 0.5) * 5;
          const d = 12.5 + r() * 2, zF = edge - 1.2;
          const f2 = clamp(st.floors + [-2, -1, 0, 1][Math.floor(r() * 4)], 2, 8);
          apartment(out, (xL + xm) / 2, zF, 1, 0, xm - xL, d, { ...base, shop: !green, seed: r() * 1000, attL: nb(-1), attR: true });
          apartment(out, (xm + xR) / 2, zF, 1, 0, xR - xm, d, { ...base, floors: f2, shop: !green, seed: r() * 1000, attL: true, attR: nb(1), colors: { wall: pick(early ? APT50 : APT80, r()) } });
        } else {
          // parselin bir kısmında eski ev hâlâ ayakta: dar apartman + yanında 2–3 katlı sıvalı ev (karışık doku)
          const withHouse = !green && r() < 0.42;
          const w = green ? 18 : withHouse ? 12 + r() * 2 : early ? 14 + r() * 2 : 16 + r() * 4, d = green ? 14 : early ? 12 : 13 + r() * 2;
          const shop = p.r <= 4 && !green && r() < 0.7, ax = withHouse ? p.x - 5 : p.x;
          apartment(out, ax, edge - s * (early ? 1.5 : 2.5), s, rot, w, d, { ...base, shop, seed: r() * 1000 });
          if (withHouse) oldHouse(out, p.x + 7.4, edge - s * (1 + r() * 1.5), s, rot + (r() - 0.5) * 0.08, 8.4 + r() * 1.2, 8.8 + r() * 1.2, pick(HOUSE, r()), r(), r() < 0.45 ? 3 : 2);
        }
        if (green) { tr('broad', p.x - 8, p.z - s * 9, 0.9, r()); tr('broad', p.x + 7, p.z - s * 9, 0.8, r()); tr('oak', p.x, p.z + s * 11, 0.7, r()); }
        else if (r() < 0.4) tr('broad', p.x + (r() - 0.5) * 14, p.z - s * 9.5, 0.75, r());
      } else if (st.type === 'tower') {
        // Yüksek bina: dükkânlı podyum + giydirme cepheli kule (motor 'office' arketipi, kademeli kütle)
        const zF = edge - s * 2, zc = zF - s * 10, y0 = height(p.x, zF) - 0.1, yB = height(p.x, zc - s * 10);
        if (yB < y0) put(plinthConc, p.x, (y0 + yB - 0.5) / 2, zc, 22.1, y0 - yB + 0.5, 20.1, rot);
        const sd = r() * 1000, wall = pick(TOWER, p.col);
        out.push({ type: 'office', x: p.x, z: zc, rot, y0, width: 22, depth: 20, floors: 2, lobby: true, seed: sd, roofGear: false, colors: { wall: 0x3a4148 } });
        out.push({ type: 'office', x: p.x - s * 0.5, z: zc - s * 1, rot, y0: y0 + 5.2 + 3.7 + 0.06, width: 16, depth: 15, floors: Math.max(4, st.floors - 3), lobby: false, seed: sd + 1, colors: { wall } });
        tr('broad', p.x - 9, zF + s * 0.5, 0.6, r()); tr('broad', p.x + 9, zF + s * 0.5, 0.6, r());
      } else if (st.type === 'park') {
        for (let k = 0; k < 5; k++) tr(k === 2 ? 'oak' : 'broad', p.x + (r() - 0.5) * 18, p.z + (r() - 0.5) * 18, 0.8 + r() * 0.4, r());
      } else if (st.type === 'grove') {
        for (let k = 0; k < 6; k++) tr(r() < 0.55 ? 'pine' : 'cypress', p.x + (r() - 0.5) * 20, p.z + (r() - 0.5) * 20, 0.8 + r() * 0.5, r());
      }
    });
    // Cami avlusu çınarları, servileri; sahil ağaçları (çınar sırası); 1970 sonrası ana yol ağaçları
    tr('oak', mp.x - 9, mp.z + 9, 1.2, 0.3); tr('oak', mp.x + 9, mp.z + 11, 1.1, 0.8);
    for (const [dx, dz] of [[-11, -12], [11, -12], [-12, 2], [12, 0]]) tr('cypress', mp.x + dx, mp.z + dz, 1.0, 0.55);
    for (let x = -226; x <= 226; x += 17) if (Math.abs(x - PIER.x) > 10) tr('broad', x, 71.5, 0.85, ((x * 0.37) % 1 + 1) % 1);
    if (y >= 1970) for (const z of [ROADS.r1, ROADS.r2]) for (const sd of [-1, 1]) for (let x = -214 + (sd > 0 ? 8 : 24); x < 226; x += 32) {
      if (ROADS.sideX.some((sx) => Math.abs(sx - x) < 10)) continue;
      tr('broad', x, z + sd * 8.1, 0.5 + ((x * 0.13) % 0.2), ((x * 0.71) % 1 + 1) % 1);
    }
    // Kıyı şeridi dışındaki bağlam binaları: 1950'ye kadar eski evler, sonra kısmen apartmanlaşma
    const rc = seeded(77);
    for (const side of [-1, 1]) for (let a = 262; a < 1150; a += 29 + rc() * 8) for (const row of [0, 1]) {
      const x = side * a + (rc() - 0.5) * 6, dRow = row ? -80 : -50, z = shoreZ(x) + dRow;
      const t = (shoreZ(x + 1) - shoreZ(x - 1)) / 2, rot = Math.atan2(-t, 1);
      const conv = 1952 + rc() * 45, keep = rc() < 0.3, sd = rc(), big = rc();
      const apt = !keep && y >= conv, fl = apt ? 3 + Math.floor(big * 4) + (plan === 'B' && y > 2035 ? 3 : 0) : 2 + (row ? 0 : 1);
      const w = apt ? 15 + big * 4 : 11 + big * 3, d = apt ? 13 : 10;
      const hs = [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]].map(([u, v]) => height(x + u * Math.cos(rot) + v * Math.sin(rot), z - u * Math.sin(rot) + v * Math.cos(rot)));
      const lo = Math.min(...hs), hi = Math.max(...hs);
      const out = lotsOf('x' + side + '_' + Math.floor(a / 160));
      if (!apt) {
        const y0 = hi + 0.05;
        put(plinthStone, x, (y0 + lo - 0.5) / 2, z, w + 0.3, y0 - lo + 0.5, d + 0.3, rot);
        out.push({ type: 'house', x, z, rot, y0, width: w, depth: d, floors: fl, seed: Math.round(sd * 1e4) / 10, colors: { wall: pick(HOUSE, sd) } });
      } else {
        const y0 = hi - 0.1;
        put(plinthConc, x, (y0 + lo - 0.5) / 2, z, w + 0.1, y0 - lo + 0.5, d + 0.1, rot);
        out.push({ type: 'apartment', x, z, rot, y0, width: w, depth: d, floors: fl, seed: Math.round(sd * 1e4) / 10, shop: !row, roof: big < 0.35 ? 'hip' : 'flat', colors: { wall: pick(APT80, sd) } });
      }
      if (rc() < 0.7) tr(rc() < 0.5 ? 'broad' : 'cypress', x + (rc() - 0.5) * 20, z - 14, 0.8, rc());
    }
    // Değişen kümeleri yeniden kur (yakındakiler hemen ayrıntılı, uzaktakiler kabuk → yaklaşınca ayrıntı)
    const seen = new Set();
    for (const [k, lots] of groups) {
      seen.add(k);
      const sig = JSON.stringify(lots);
      const C = clusters.get(k);
      if (C && C.sig === sig) continue;
      if (C) { scene.remove(C.city.group); C.city.dispose(); }
      const city = populateCity({ lots, tile: 4000, near: NEAR, budget: 14, camera: sim.camera });
      scene.add(city.group);
      clusters.set(k, { sig, lots, city });
    }
    for (const [k, C] of clusters) if (!seen.has(k)) { scene.remove(C.city.group); C.city.dispose(); clusters.delete(k); }
    // Yeşil çatılar (Plan A): parapet içinde bitkili toprak katmanı + çalılar
    for (const C of clusters.values()) C.lots.forEach((L, i) => {
      if (!L.green) return;
      const S = C.city.specs[i], yt = S.y0 + S.top + 0.12;
      put(roofLawn, S.x, yt, S.z, S.w - 0.9, 0.24, S.d - 0.9, S.rot);
      const rr = seeded(i * 31 + S.seed);
      for (let k = 0; k < 5; k++) tr('broad', S.x + (rr() - 0.5) * (S.w - 4), S.z + (rr() - 0.5) * (S.d - 4), 0.28 + rr() * 0.12, rr(), yt);
    });
    for (const im of IMS) im.instanceMatrix.needsUpdate = true;
    trees.set(T);
    // Dönem malzemeleri: 1950'ye dek Arnavut kaldırımı, sonra asfalt
    const asph = y >= 1950;
    mainRoads.forEach((m) => (m.material = asph ? G.asphalt : K.cobble));
    marks.visible = y >= 1965;
    lamps.group.visible = y >= 1960;
  }

  // Park etmiş otomobiller (1950 sonrası; sayı otomobil payıyla artar): sahil yolunun dükkân önü şeridi, ara yollar
  const PARK_MAX = LOW ? 60 : 90;
  const parked = carFleet(PARK_MAX, { seed: 21 });
  parked.group.traverse((o) => { if (o.isInstancedMesh) o.userData.noFit = true; });
  scene.add(parked.group);
  const slots = [];
  {
    const r = seeded(33);
    for (let x = -228; x < 230; x += 5.6) if (r() < 0.7 && Math.abs(x - PIER.x) > 8) slots.push([x, shoreZ(x) - 30.6, r() < 0.5 ? 0 : Math.PI, 0]);
    for (const sd of [-1, 1]) for (let x = -226; x < 230; x += 5.8) if (r() < 0.55 && !ROADS.sideX.some((sx) => Math.abs(sx - x) < 10)) slots.push([x, ROADS.r1 + sd * 5.5, sd > 0 ? 0 : Math.PI, 0]);
    for (const sd of [-1, 1]) for (let x = -226; x < 230; x += 5.8) if (r() < 0.45 && !ROADS.sideX.some((sx) => Math.abs(sx - x) < 10)) slots.push([x, ROADS.r2 + sd * 5.5, sd > 0 ? 0 : Math.PI, 1]);
    for (const z of [ROADS.l1, ROADS.l2]) for (let x = -200; x < 200; x += 5.8) if (r() < 0.4 && !ROADS.sideX.some((sx) => Math.abs(sx - x) < 9)) slots.push([x, z + 3.6, 0, 0]);
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  }
  let parkKey = '';
  function setParked(n, rail) {
    const key = n + '|' + rail;
    if (key === parkKey) return;
    parkKey = key;
    let k = 0;
    for (const [x, z, yaw, onR2] of slots) {
      if (k >= n) break;
      if (onR2 && rail) continue;
      parked.set(k++, x, height(x, z) + 0.06, z, yaw);
    }
    for (; k < PARK_MAX; k++) parked.hide(k);
    parked.commit();
  }

  // --- Taşıtlar ---
  const ferries = [0, 1].map((k) => { const f = ferry(K); f.userData.phase = k * Math.PI; scene.add(f); return f; });
  const tram = new THREE.Group(); { const a = oldTram(K), b = oldTram(K); b.position.x = -10; b.userData.pole.visible = false; tram.add(a, b); tram.userData.pole = a.userData.pole; }
  scene.add(tram);
  const train = lightRail(K); scene.add(train);
  const CAR_MAX = 90;
  const fleet = carFleet(CAR_MAX, { seed: 9 });
  fleet.group.traverse((o) => { if (o.isInstancedMesh) o.userData.noFit = true; });
  scene.add(fleet.group);
  const cars = [];
  { const r = seeded(4); for (let k = 0; k < CAR_MAX; k++) { const lane = k % 6; cars.push({ lane, x: (r() * 2 - 1) * (lane < 4 ? 1100 : 400), sp: 9 + r() * 5 }); } }
  // Rıhtıma bağlı balıkçı kayıkları (baş rıhtıma, halat bağlı), dalgayla hafifçe sallanır
  const BG = boatGeo(), boats = [];
  const hullIM = new THREE.InstancedMesh(BG.hull, mat.paintedMetal({ color: 0xffffff, wear: 0.35 }), 24);
  const topIM = new THREE.InstancedMesh(BG.top, K.deck, 24);
  {
    const r = seeded(51), cols = [0xf2f0ea, 0xf2f0ea, 0x2f6fa8, 0x3b8f86, 0xb8432f, 0x2f5f3a, 0xe8d6a0];
    for (let x = -210; x < 215 && boats.length < 24; x += 7 + r() * 9) {
      if (Math.abs(x - PIER.x) < 13) continue;
      boats.push({ x, z: 84.2 + 4.2 + r() * 0.8, yaw: -Math.PI / 2 + (r() - 0.5) * 0.25, ph: r() * 6.28 });
      hullIM.setColorAt(boats.length - 1, new THREE.Color(cols[Math.floor(r() * cols.length)]));
    }
    hullIM.count = topIM.count = boats.length;
    for (const im of [hullIM, topIM]) { im.castShadow = im.receiveShadow = true; im.userData.noFit = true; im.frustumCulled = false; scene.add(im); }
  }
  const bm = new THREE.Matrix4(), be = new THREE.Euler(), bq = new THREE.Quaternion(), bp = new THREE.Vector3(), b1 = new THREE.Vector3(1, 1, 1);
  const funnelBlack = K.black, funnelAmber = mat.paintedMetal({ color: 0xe0a21a, wear: 0.15 });

  return {
    rebuild, trees, M, PIER, railLine, tramRails, catenary, bikeA, bikeB, tram, train, ferries, fleet,
    buildings: () => [...clusters.values()].map((C) => C.city.group),
    update(t, dt, s) {
      // s: { veh, y, nCars, railY }
      veg.update(t, 0.6);
      const y = s.y;
      tram.visible = s.veh && y < 1962;
      tram.userData.pole.visible = y >= 1914;
      catenary.visible = y >= 1914 && y < 1962;
      tramRails.visible = y < 1962;
      railLine.visible = y >= 2008;
      train.visible = s.veh && y >= 2012;
      // eski tramvay: sahil yolu boyunca
      const tx = ((t * 5.5) % 1800) - 900, tz = shoreZ(tx) - 28;
      tram.position.set(tx, height(tx, tz) + 0.12, tz);
      tram.rotation.y = -Math.atan((shoreZ(tx + 1) - shoreZ(tx - 1)) / 2);
      const rx = ((t * 11) % 900) - 450;
      train.position.set(rx, slopeY(ROADS.r2) + 0.22, ROADS.r2 - 2.6);
      // otomobiller
      const n = s.veh ? Math.min(CAR_MAX, s.nCars) : 0;
      for (let k = 0; k < CAR_MAX; k++) {
        const c = cars[k];
        if (k >= n) { fleet.hide(k); continue; }
        const dir = c.lane % 2 ? -1 : 1;
        c.x += dir * c.sp * Math.min(dt, 0.25);
        const span = c.lane < 4 ? 1100 : 400;
        if (c.x > span) c.x -= 2 * span; else if (c.x < -span) c.x += 2 * span;
        let z, yaw = dir > 0 ? 0 : Math.PI;
        if (c.lane < 4) {
          const off = [-24.5, -17.5, -21, -14][c.lane] + (y >= 1962 ? 0 : 0);
          z = shoreZ(c.x) + off;
          yaw -= Math.atan((shoreZ(c.x + 1) - shoreZ(c.x - 1)) / 2);
        } else {
          const road = c.lane === 4 ? ROADS.r1 : ROADS.r2;
          z = road + (road === ROADS.r2 && y >= 2008 ? (dir > 0 ? 5.2 : -5.2) : (dir > 0 ? 2.4 : -2.4));
        }
        fleet.set(k, c.x, height(c.x, z) + 0.08, z, yaw, c.x / 0.32);
      }
      fleet.commit();
      setParked(s.veh && y >= 1950 ? Math.min(PARK_MAX, Math.round(s.nCars * 0.9)) : 0, y >= 2008);
      boats.forEach((b, i) => {
        const w = t * 1.3 + b.ph;
        be.set(Math.sin(w) * 0.04, b.yaw + Math.sin(w * 0.37) * 0.03, Math.sin(w * 0.8 + 1) * 0.025);
        bm.compose(bp.set(b.x, 0.55 + Math.sin(w * 0.9) * 0.08, b.z), bq.setFromEuler(be), b1);
        hullIM.setMatrixAt(i, bm); topIM.setMatrixAt(i, bm);
      });
      hullIM.instanceMatrix.needsUpdate = topIM.instanceMatrix.needsUpdate = true;
      ferries.forEach((f) => {
        f.visible = s.veh;
        const a = t * 0.035 + f.userData.phase;
        const x = Math.cos(a) * 520, z = 175 + Math.sin(a) * 38;
        f.position.set(x, Math.sin(t * 0.9 + f.userData.phase) * 0.15, z);
        f.rotation.y = Math.atan2(-(Math.cos(a) * 38), -(Math.sin(a) * 520)) ;
        f.rotation.z = Math.sin(t * 0.7 + f.userData.phase) * 0.012;
        f.userData.funnel.material = y < 1960 ? funnelBlack : funnelAmber;
      });
    },
  };
}
