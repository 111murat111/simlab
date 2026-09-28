// Tahliye yapı kiti (sim klasörüne yerel yardımcı): kesit (çatısız) bina görünümü için sıva duvar + koyu kesit yüzeyi,
// zemin kaplamaları (parke, terrazzo, beton), tiyatro koltuğu, stadyum koltuğu, sahne, süs havuzu, LED pano,
// çift kanatlı acil çıkış kapısı + yeşil ışıklı levha, örneklenmiş insan (gövde/bacak/baş). Birimler metre.
import { THREE, mat, procedural, RoundedBoxGeometry, BufferGeometryUtils } from '@core';

const merge = (list) => BufferGeometryUtils.mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));

let M = null;
export function mats() {
  if (M) return M;
  M = {
    plaster: procedural({
      key: 'th-plaster', params: { color: 0xe6e0d4, roughness: 0.9 }, bump: 0.02,
      pattern: `float n = fbm3(p*3.0, 4); col *= 0.9 + 0.12*n; col *= 1.0 - 0.18*smoothstep(0.25, 0.0, p.y); h = n;`,
    }),
    cut: mat.concrete({ color: 0x3b3d40, stains: 0.2 }),
    parquet: procedural({
      key: 'th-parquet', params: { color: 0xa0703f, roughness: 0.45 }, bump: 0.015,
      pattern: `
        vec2 q = p.xz*vec2(1.0/0.9, 1.0/0.12);
        float row = floor(q.y); q.x += h13(vec3(row, 1.0, 3.0))*3.0;
        vec2 f = fract(q), id = floor(q);
        float seam = smoothstep(0.0, 0.05, min(f.y, 1.0 - f.y))*smoothstep(0.0, 0.012, min(f.x, 1.0 - f.x));
        float t = h13(vec3(id, 5.0));
        float g = fbm3(vec3(p.x*9.0, 0.0, p.z*0.8 + t*10.0), 3);
        col *= (0.78 + 0.3*t)*(0.85 + 0.25*g);
        col *= mix(0.55, 1.0, seam);
        rough = mix(0.7, 0.35, seam); h = seam*0.6 + g*0.4;`,
    }),
    terrazzo: procedural({
      key: 'th-terrazzo', params: { color: 0xd9d4ca, roughness: 0.18 }, bump: 0.01,
      pattern: `
        vec2 f = abs(fract(p.xz/0.8) - 0.5)*2.0;
        float joint = smoothstep(0.975, 0.99, max(f.x, f.y));
        float chip = smoothstep(0.72, 0.8, vn3(p*38.0)), chip2 = smoothstep(0.75, 0.82, vn3(p*23.0 + 7.0));
        col *= 0.92 + 0.1*fbm3(p*1.5, 3);
        col = mix(col, vec3(0.42, 0.40, 0.38), chip*0.6); col = mix(col, vec3(0.62, 0.5, 0.4), chip2*0.5);
        col = mix(col, vec3(0.5, 0.49, 0.47), joint);
        rough = mix(0.16, 0.5, joint); h = 1.0 - joint;`,
    }),
    epoxy: procedural({
      key: 'th-epoxy', params: { color: 0x8d9296, roughness: 0.35 }, bump: 0.005,
      pattern: `float n = fbm3(p*0.6, 4); col *= 0.88 + 0.18*n; rough = 0.3 + 0.2*n; h = n;`,
    }),
    concrete: mat.concrete({ color: 0xa8a39a, stains: 0.45 }),
    column: mat.concrete({ color: 0xcfcac0, stains: 0.2 }),
    seatFabric: mat.fabric({ color: 0x8b1d24 }),
    seatFrame: mat.paintedMetal({ color: 0x2b2d30, wear: 0.15 }),
    plasticSeat: mat.plastic({ color: 0xffffff, gloss: 0.45 }),
    stage: mat.wood({ color: 0x5a3a22, ring: 30, varnish: true }),
    stone: mat.rock({ color: 0xbab3a6, strata: 0.1 }),
    water: new THREE.MeshPhysicalMaterial({ color: 0x3f7f86, roughness: 0.03, metalness: 0, transmission: 0, clearcoat: 1, clearcoatRoughness: 0.02 }),
    steel: mat.brushedMetal({ color: 0xb7bcc2, rough: 0.3 }),
    door: mat.paintedMetal({ color: 0x9aa3a8, wear: 0.1 }),
    doorGlass: mat.glass({ tint: 0xdce9ee, rough: 0.05 }),
    mat: mat.rubber({ color: 0x2a2b2d }),
    sign: mat.glow({ color: 0x19d86a, intensity: 4 }),
    signWhite: mat.glow({ color: 0xeafff2, intensity: 3 }),
    cloth: mat.fabric({ color: 0xffffff }),
    skin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62 }),
    led: mat.glow({ color: 0x2f7cff, intensity: 2.2 }),
    turf: procedural({
      key: 'th-turf', params: { color: 0x3f7a2c, roughness: 0.9 }, bump: 0.03,
      pattern: `float s = step(0.5, fract(p.x/5.0)); col *= 0.85 + 0.15*s; col *= 0.85 + 0.2*vn3(p*40.0); h = vn3(p*60.0);`,
    }),
  };
  return M;
}

/** Hücre listesi → satır boyunca birleştirilmiş duvar kutuları: { sides, tops } geometrileri. cells: [[x0,z0,x1,z1], ...] */
export function wallGeometry(rects, H) {
  const P = [], N = [], TP = [], TN = [];
  const quad = (A, B, C, D, n, out, on) => { for (const v of [A, B, C, A, C, D]) { out.push(...v); on.push(...n); } };
  for (const [x0, z0, x1, z1] of rects) {
    quad([x0, 0, z1], [x1, 0, z1], [x1, H, z1], [x0, H, z1], [0, 0, 1], P, N);
    quad([x1, 0, z0], [x0, 0, z0], [x0, H, z0], [x1, H, z0], [0, 0, -1], P, N);
    quad([x1, 0, z1], [x1, 0, z0], [x1, H, z0], [x1, H, z1], [1, 0, 0], P, N);
    quad([x0, 0, z0], [x0, 0, z1], [x0, H, z1], [x0, H, z0], [-1, 0, 0], P, N);
    quad([x0, H, z1], [x1, H, z1], [x1, H, z0], [x0, H, z0], [0, 1, 0], TP, TN);
  }
  const mk = (p, n) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.computeBoundingSphere(); return g; };
  return { sides: mk(P, N), tops: mk(TP, TN) };
}

/** Tiyatro koltuğu (sahneye −z yönünde bakar), hücre merkezine oturur. */
export function theatreChair() {
  const fab = merge([
    new RoundedBoxGeometry(0.44, 0.09, 0.4, 2, 0.035).translate(0, 0.46, -0.02),
    new RoundedBoxGeometry(0.44, 0.52, 0.08, 2, 0.035).rotateX(-0.12).translate(0, 0.76, 0.2),
  ]);
  const frame = merge([
    new RoundedBoxGeometry(0.05, 0.62, 0.42, 1, 0.02).translate(-0.245, 0.31, 0.02),
    new RoundedBoxGeometry(0.05, 0.62, 0.42, 1, 0.02).translate(0.245, 0.31, 0.02),
    new RoundedBoxGeometry(0.07, 0.05, 0.38, 1, 0.02).translate(-0.245, 0.64, 0.0),
    new RoundedBoxGeometry(0.07, 0.05, 0.38, 1, 0.02).translate(0.245, 0.64, 0.0),
  ]);
  return { fab, frame };
}
/** Stadyum koltuğu: tek parça plastik kabuk (+z sahaya bakar). */
export function stadiumSeat() {
  const shell = merge([
    new RoundedBoxGeometry(0.42, 0.06, 0.38, 2, 0.025).translate(0, 0.42, 0),
    new RoundedBoxGeometry(0.42, 0.34, 0.05, 2, 0.025).rotateX(0.18).translate(0, 0.6, -0.2),
  ]);
  const leg = new RoundedBoxGeometry(0.06, 0.4, 0.3, 1, 0.02).translate(0, 0.2, -0.05);
  return { shell, leg };
}

/** Çift kanatlı acil çıkış kapısı (yerel: duvar x boyunca, dışarısı −z), genişlik w, duvar yüksekliği H. */
export function exitDoor(w, H) {
  const K = mats(), g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const lw = w / 2, dh = Math.min(H, 2.1);
  for (const s of [-1, 1]) {
    // Kasa dikmesi
    add(new RoundedBoxGeometry(0.08, H, 0.56, 1, 0.02), K.door, s * (w / 2 + 0.04), H / 2, 0);
    // Dışarı açılmış kanat (90°), panik barlı, üst yarısı camlı
    const leaf = new THREE.Group();
    leaf.position.set(s * (w / 2 - 0.02), 0, -0.26);
    const pan = new THREE.Mesh(new RoundedBoxGeometry(0.05, dh * 0.55, lw - 0.04, 1, 0.015), K.door);
    pan.position.set(0, dh * 0.275 + 0.01, -(lw - 0.04) / 2); pan.castShadow = true; leaf.add(pan);
    const gl = new THREE.Mesh(new THREE.BoxGeometry(0.03, dh * 0.42, lw - 0.16), K.doorGlass);
    gl.position.set(0, dh * 0.55 + dh * 0.21 + 0.01, -(lw - 0.04) / 2); leaf.add(gl);
    const fr = new THREE.Mesh(merge([
      new THREE.BoxGeometry(0.05, 0.06, lw - 0.04).translate(0, dh - 0.03, 0),
      new THREE.BoxGeometry(0.05, dh * 0.45, 0.06).translate(0, dh * 0.775, -(lw - 0.04) / 2 + 0.03),
      new THREE.BoxGeometry(0.05, dh * 0.45, 0.06).translate(0, dh * 0.775, (lw - 0.04) / 2 - 0.03),
    ]), K.door);
    fr.position.set(0, 0, -(lw - 0.04) / 2); leaf.add(fr);
    const bar = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.06, lw * 0.7, 1, 0.02), K.steel);
    bar.position.set(-s * 0.05, 1.0, -(lw - 0.04) / 2); leaf.add(bar);
    g.add(leaf);
  }
  add(new THREE.BoxGeometry(w + 0.1, 0.02, 1.4), K.mat, 0, 0.01, -0.6);
  // Yeşil ışıklı acil çıkış levhası (duvar kesitinin üstünde, askı çubuklarıyla)
  add(new RoundedBoxGeometry(0.62, 0.24, 0.07, 1, 0.02), K.sign, 0, H + 0.42, 0.05);
  add(new THREE.BoxGeometry(0.14, 0.12, 0.075), K.signWhite, -0.16, H + 0.42, 0.05);
  add(new THREE.BoxGeometry(0.2, 0.05, 0.075), K.signWhite, 0.1, H + 0.42, 0.05);
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 6), K.steel, s * 0.25, H + 0.15, 0.05);
  return g;
}

/** Örneklenmiş insan parçaları (yükseklik ≈ 1,72 m; +z yüzü). */
export function humanParts() {
  const cap = (r, l, x, y, z, rx = 0, rz = 0) => new THREE.CapsuleGeometry(r, l, 3, 8).rotateX(rx).rotateZ(rz).translate(x, y, z);
  const legs = merge([cap(0.068, 0.72, -0.085, 0.45, 0, 0, 0.03), cap(0.068, 0.72, 0.085, 0.45, 0, 0, -0.03),
    new RoundedBoxGeometry(0.1, 0.07, 0.24, 1, 0.03).translate(-0.09, 0.035, 0.04), new RoundedBoxGeometry(0.1, 0.07, 0.24, 1, 0.03).translate(0.09, 0.035, 0.04)]);
  const torso = new THREE.CapsuleGeometry(0.16, 0.36, 4, 12).scale(1, 1, 0.66).translate(0, 1.16, 0);
  const body = merge([torso, cap(0.048, 0.5, -0.215, 1.12, 0, 0, 0.09), cap(0.048, 0.5, 0.215, 1.12, 0, 0, -0.09)]);
  // Baş: yüz (ten) + saç (koyu) tepe vertex rengiyle
  const head = new THREE.SphereGeometry(0.1, 14, 10).scale(0.9, 1.08, 1).translate(0, 1.6, 0);
  const neck = new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8).translate(0, 1.47, 0);
  const hair = new THREE.SphereGeometry(0.106, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(0.92, 1.05, 1.03).translate(0, 1.615, -0.008);
  const paint = (g, c) => { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const headG = merge([paint(head, new THREE.Color(1, 1, 1)), paint(neck, new THREE.Color(1, 1, 1)), paint(hair, new THREE.Color(0.16, 0.12, 0.1))]);
  return { legs, body, head: headG };
}
