// Sokak kiti: asfalt (yama, lastik izi, yağ lekesi), şerit/yaya geçidi çizgileri, granit bordürlü kaldırım (parke taşı),
// rögar kapağı ve ızgaralar, sokak lambaları, sokak ağaçları (motor bitki örtüsü), park etmiş / hareketli otomobiller,
// ve bunları buildings.js ile birleştiren ızgara kent kurucu makeCity().
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mat, procedural } from './materials.js';
import { createVegetation } from './vegetation.js';
import { cityRng, makeBlock, populateCity } from './buildings.js';

const strip = (g) => (g.index ? g.toNonIndexed() : g);
const clean = (g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return strip(g); };

// ---------------------------------------------------------------- Zemin malzemeleri
let GM = null;
/** Paylaşılan sokak malzemeleri: asphalt, paver, lawn, paint, yellow, pole, curb, iron (rögar). */
export function streetMaterials() {
  if (GM) return GM;
  GM = {
    asphalt: procedural({
      key: 'street-asphalt', params: { color: 0x3a3b3e, roughness: 0.9 }, bump: 0.02,
      pattern: `
        float agg = cells3(p*16.0), n = fbm3(p*0.9, 4), big = fbm3(p*0.08, 3);
        col *= 0.78 + 0.35*smoothstep(0.1, 0.4, agg) + 0.22*n;
        col *= 0.86 + 0.24*big;
        col += vec3(0.05)*step(0.975, vn3(p*70.0));
        // yama: köşeli, daha koyu ve pürüzsüz
        vec2 pc = floor(p.xz/vec2(7.0, 4.0));
        float patchK = step(0.86, h13(vec3(pc, 9.0)));
        vec2 pf = abs(fract(p.xz/vec2(7.0, 4.0)) - 0.5);
        float inP = patchK*step(max(pf.x, pf.y), 0.36);
        col = mix(col, col*0.72, inP);
        // yağ lekeleri ve çatlaklar
        float oil = smoothstep(0.66, 0.8, fbm3(p*0.35 + 4.0, 4));
        col *= 1.0 - 0.3*oil;
        float cr = smoothstep(0.03, 0.0, abs(fbm3(p*0.6 + 11.0, 4) - 0.5))*step(0.55, fbm3(p*0.13, 2));
        col *= 1.0 - 0.45*cr;
        rough = clamp(0.84 + 0.12*n - 0.3*oil - 0.1*inP, 0.4, 1.0);
        h = smoothstep(0.05, 0.35, agg) - cr;`,
    }),
    paver: procedural({
      key: 'street-paver', params: { color: 0xb9b2a6, roughness: 0.85 }, bump: 0.03,
      pattern: `
        vec2 uv = p.xz*vec2(4.0, 4.0);
        float row = floor(uv.y); uv.x += mod(row, 2.0)*0.5;
        vec2 f = fract(uv), id = floor(uv);
        float m = smoothstep(0.0, 0.06, min(f.x, 1.0 - f.x))*smoothstep(0.0, 0.06, min(f.y, 1.0 - f.y));
        float t = h13(vec3(id, 2.0)), n = fbm3(p*0.8, 3);
        float aa = 1.0 - smoothstep(0.12, 0.45, length(fwidth(uv)));
        m = mix(0.93, m, aa); t = mix(0.5, t, aa);
        col *= mix(0.55, (0.8 + 0.25*t)*(0.85 + 0.25*n), m);
        col *= 1.0 - 0.18*smoothstep(0.6, 0.85, fbm3(p*0.4 + 2.0, 3));
        rough = mix(0.95, 0.8, m); h = m;`,
    }),
    lawn: procedural({
      key: 'street-lawn', params: { color: 0x4f6a2a, roughness: 0.95 }, bump: 0.02,
      pattern: `
        float n = fbm3(p*0.35, 4), m = vn3(p*6.0);
        col = mix(vec3(0.19, 0.27, 0.09), vec3(0.36, 0.38, 0.16), n)*(0.8 + 0.3*m);
        col = mix(col, vec3(0.32, 0.26, 0.17), 0.35*smoothstep(0.62, 0.8, fbm3(p*0.9 + 3.0, 3)));
        h = m;`,
    }),
    paint: procedural({
      key: 'roadpaint', params: { color: 0xe7e5dd, roughness: 0.6 }, bump: 0.01,
      pattern: `float n = fbm3(p*2.5, 3); col *= 0.72 + 0.3*n; col = mix(col, vec3(0.2), 0.35*smoothstep(0.62, 0.85, vn3(p*9.0))); rough = 0.55 + 0.3*n;`,
    }),
    yellow: procedural({
      key: 'roadpaint-y', params: { color: 0xd9a21b, roughness: 0.6 }, bump: 0.01,
      pattern: `float n = fbm3(p*2.5, 3); col *= 0.75 + 0.3*n; rough = 0.55 + 0.3*n;`,
    }),
    slab: procedural({
      key: 'street-slab', params: { color: 0xb5afa4, roughness: 0.8 }, bump: 0.025,
      pattern: `
        vec2 uv = p.xz/vec2(0.9, 0.6);
        float row = floor(uv.y); uv.x += mod(row, 2.0)*0.5;
        vec2 f = fract(uv), id = floor(uv);
        float m = smoothstep(0.0, 0.03, min(f.x, 1.0 - f.x)*0.66)*smoothstep(0.0, 0.03, min(f.y, 1.0 - f.y));
        float aa = 1.0 - smoothstep(0.1, 0.35, length(fwidth(uv)));
        m = mix(0.95, m, aa);
        float t = mix(0.5, h13(vec3(id, 6.0)), aa), n = fbm3(p*0.6, 4), sp = vn3(p*40.0);
        col *= mix(0.5, (0.82 + 0.2*t)*(0.86 + 0.2*n) + 0.05*(sp - 0.5), m);
        col *= 1.0 - 0.22*smoothstep(0.55, 0.85, fbm3(p*0.25 + 7.0, 3));
        col = mix(col, vec3(0.35, 0.33, 0.3), 0.5*smoothstep(0.7, 0.9, fbm3(p*0.9 + 21.0, 3)));
        rough = mix(0.95, 0.72 + 0.15*sp, m); h = m*0.7 + sp*0.3;`,
    }),
    pole: mat.paintedMetal({ color: 0x4a4f55, wear: 0.2 }),
    curb: procedural({
      key: 'street-curb', params: { color: 0x9d9a94, roughness: 0.75 }, bump: 0.02,
      pattern: `
        float seg = fract((p.x + p.z)*1.0);
        float j = smoothstep(0.0, 0.015, min(seg, 1.0 - seg));
        float n = fbm3(p*3.0, 4), sp = vn3(p*80.0);
        col *= (0.82 + 0.25*n + 0.08*(sp - 0.5))*mix(0.6, 1.0, j);
        col *= mix(0.75, 1.0, smoothstep(0.0, 0.12, p.y));
        rough = 0.65 + 0.2*sp; h = sp*0.5 + j*0.5;`,
    }),
    iron: procedural({
      key: 'street-iron', params: { color: 0x3b3a38, roughness: 0.55, metalness: 0.6 }, bump: 0.06,
      pattern: `
        vec2 q = p.xz*9.0; float g = step(0.5, fract(q.x + 0.5*step(0.5, fract(q.y*0.5))))*step(0.5, fract(q.y));
        float n = fbm3(p*6.0, 3); col *= 0.8 + 0.3*n; col = mix(col, vec3(0.35, 0.22, 0.13), 0.35*smoothstep(0.6, 0.8, n));
        rough = 0.45 + 0.3*n; h = g;`,
    }),
  };
  return GM;
}

// ---------------------------------------------------------------- Sokak ağaçları
/** pts: [[x, z, rot?, büyük?], …] → { group, update(t, wind) } (motor ağaç geometrisi). */
export function streetTrees(pts, seed = 3, kinds = { broad: 1 }) {
  const veg = createVegetation(() => 10, { rect: [0, 0, 1, 1], trees: 3 * Object.keys(kinds).length, rocks: 0, kinds, seed, leafA: 0x3d5a22, leafB: 0x71803a });
  const group = new THREE.Group();
  group.name = 'city:trees';
  const src = veg.group.children.filter((c) => c.isInstancedMesh);
  if (!pts.length || !src.length) return { group, update() {} };
  const per = src.map(() => []);
  const r = cityRng(seed + 99);
  pts.forEach((p) => per[Math.floor(r() * src.length)].push(p));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), v = new THREE.Vector3();
  src.forEach((s, k) => {
    if (!per[k].length) return;
    const im = new THREE.InstancedMesh(s.geometry, s.material, per[k].length);
    per[k].forEach((p, i) => {
      q.setFromAxisAngle(up, r() * 6.283);
      const big = p[3] ? 0.9 + r() * 0.35 : 0.8 + r() * 0.2;
      m4.compose(v.set(p[0], p[4] ?? 0.1, p[1]), q, sc.set(big, big * (0.9 + r() * 0.2), big));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = im.receiveShadow = true; im.userData.noFit = true; im.userData.noAO = true;
    group.add(im);
  });
  return { group, update: veg.update };
}

// ---------------------------------------------------------------- Sokak lambaları
/** pts: [[x, z, yön], …] (kol +z yerel yönde) → { group, setLit(0–1) } */
export function streetLamps(pts, { y = 0.15 } = {}) {
  const group = new THREE.Group();
  group.name = 'city:lamps';
  if (!pts.length) return { group, setLit() {} };
  const G = streetMaterials();
  const prof = [[0.001, 0], [0.17, 0], [0.17, 0.08], [0.13, 0.12], [0.13, 0.5], [0.1, 0.62], [0.075, 3], [0.055, 8.2], [0.001, 8.25]].map(([a, b]) => new THREE.Vector2(a, b));
  const pole = new THREE.LatheGeometry(prof, 12);
  const arm = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 8.0, 0), new THREE.Vector3(0, 8.6, 0.5), new THREE.Vector3(0, 8.5, 1.6)), 10, 0.045, 6);
  const head = new RoundedBoxGeometry(0.34, 0.14, 0.75, 2, 0.05).translate(0, 8.45, 1.85);
  const door = new THREE.BoxGeometry(0.1, 0.3, 0.02).translate(0, 0.9, 0.12);
  const lens = new RoundedBoxGeometry(0.26, 0.03, 0.6, 1, 0.01).translate(0, 8.37, 1.85);
  const glowM = mat.glow({ color: 0xffe2b0, intensity: 0 });
  const mP = new THREE.InstancedMesh(mergeGeometries([pole, arm, head, door].map(clean)), G.pole, pts.length);
  const mL = new THREE.InstancedMesh(lens, glowM, pts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  pts.forEach((p, i) => { q.setFromAxisAngle(up, p[2] || 0); m4.compose(v.set(p[0], p[3] ?? y, p[1]), q, one); mP.setMatrixAt(i, m4); mL.setMatrixAt(i, m4); });
  mP.castShadow = true; mP.receiveShadow = true; mP.userData.noFit = true; mL.userData.noFit = true;
  group.add(mP, mL);
  return { group, setLit(v) { glowM.emissiveIntensity = 0.35 + v * 6; } };
}

// ---------------------------------------------------------------- Otomobiller
function carGeo(type) {
  const L = type === 'suv' ? 4.6 : type === 'hatch' ? 4.1 : 4.6, W = type === 'suv' ? 1.86 : 1.76;
  const H = type === 'suv' ? 1.7 : 1.45, sill = type === 'suv' ? 0.42 : 0.3, belt = type === 'suv' ? 1.08 : 0.9, bv = 0.1;
  const sh = new THREE.Shape(), x0 = -L / 2 + bv, x1 = L / 2 - bv;
  sh.moveTo(x0 + 0.2, sill); sh.lineTo(x1 - 0.25, sill);
  sh.quadraticCurveTo(x1, sill + 0.02, x1, sill + 0.28);
  sh.quadraticCurveTo(x1 - 0.02, belt - 0.1, x1 - 0.4, belt - 0.02);
  sh.lineTo(type === 'hatch' ? x0 + 0.1 : x0 + 0.35, belt + 0.02);
  sh.quadraticCurveTo(x0, belt - 0.02, x0, belt - 0.3);
  sh.lineTo(x0, sill + 0.25); sh.quadraticCurveTo(x0, sill, x0 + 0.2, sill);
  const body = new THREE.ExtrudeGeometry(sh, { depth: W - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, -(W - 2 * bv) / 2);
  const c = new THREE.Shape();
  const fA = type === 'suv' ? x1 - 1.05 : x1 - 1.25, rA = type === 'hatch' ? x0 + 0.15 : type === 'suv' ? x0 + 0.2 : x0 + 0.75;
  const roofF = fA - (type === 'suv' ? 0.45 : 0.7), roofR = rA + (type === 'hatch' ? 0.25 : type === 'suv' ? 0.12 : 0.5);
  c.moveTo(fA, belt - 0.02); c.quadraticCurveTo(roofF + 0.2, H - 0.12, roofF, H - 0.05); c.lineTo(roofR, H - 0.05);
  c.quadraticCurveTo(rA + 0.05, H - 0.1, rA, belt - 0.02); c.lineTo(fA, belt - 0.02);
  const cw = W - 0.28;
  const cabin = new THREE.ExtrudeGeometry(c, { depth: cw - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, -(cw - 0.16) / 2);
  const roof = new RoundedBoxGeometry(Math.abs(roofF - roofR) - 0.1, 0.06, cw - 0.2, 2, 0.03).translate((roofF + roofR) / 2, H - 0.02, 0);
  // B direği (boya rengi) ve yan aynalar
  const bx = (fA + rA) / 2 + 0.1;
  const pillar = new THREE.BoxGeometry(0.12, H - belt - 0.08, cw + 0.02).translate(bx, (H + belt) / 2 - 0.05, 0);
  const mirrors = [-1, 1].map((s) => new RoundedBoxGeometry(0.16, 0.12, 0.2, 1, 0.03).translate(fA - 0.1, belt + 0.08, s * (W / 2 + 0.06)));
  const paint = mergeGeometries([clean(body), clean(roof), clean(pillar), ...mirrors.map(clean)]);
  // tampon altı + plaka (siyah plastik / beyaz)
  const trimG = mergeGeometries([
    clean(new RoundedBoxGeometry(0.14, 0.2, W - 0.05, 1, 0.05).translate(L / 2 - 0.06, sill + 0.08, 0)),
    clean(new RoundedBoxGeometry(0.14, 0.2, W - 0.05, 1, 0.05).translate(-L / 2 + 0.06, sill + 0.08, 0)),
    clean(new THREE.BoxGeometry(L - 1.2, 0.08, W + 0.005).translate(0, sill + 0.03, 0)),
  ]);
  const plate = mergeGeometries([clean(new THREE.BoxGeometry(0.02, 0.11, 0.52).translate(L / 2 + 0.01, sill + 0.2, 0)), clean(new THREE.BoxGeometry(0.02, 0.11, 0.52).translate(-L / 2 - 0.01, sill + 0.3, 0))]);
  const wr = type === 'suv' ? 0.37 : 0.32, wx = L / 2 - (type === 'suv' ? 0.85 : 0.8);
  const lights = [-W / 2 + 0.28, W / 2 - 0.28].map((z) => clean(new RoundedBoxGeometry(0.08, 0.1, 0.34, 1, 0.03).translate(L / 2 - 0.05, 0.72, z)));
  const tails = [-W / 2 + 0.28, W / 2 - 0.28].map((z) => clean(new RoundedBoxGeometry(0.06, 0.1, 0.3, 1, 0.03).translate(-L / 2 + 0.05, 0.78, z)));
  return { paint, glass: clean(cabin), trim: trimG, plate, head: mergeGeometries(lights), tail: mergeGeometries(tails), L, W, H, wr, wx };
}
export const CAR_COLORS = [0xf2f2f0, 0xf2f2f0, 0xf2f2f0, 0x1a1c1f, 0x8e959c, 0xb7bcc0, 0x24344f, 0x8a1d1d, 0x6b6f73, 0xd7d2c4, 0x2f4a3a, 0x1e5a8a];
/**
 * n otomobil (sedan/hatch/suv). set(i, x, y, z, yaw, wheel?) → commit(). +x = ileri (yaw = 0'da +x yönünde).
 * Döner: { group, count, set, hide, setColor, tint, base, info, commit, lights(0–1) }
 */
export function carFleet(n, { seed = 5, types = ['sedan', 'hatch', 'suv'], colors = CAR_COLORS } = {}) {
  const group = new THREE.Group();
  group.name = 'city:cars';
  const r = cityRng(seed);
  const paintM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.05 });
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0x0a0f13, roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1 });
  const trimM = mat.plastic({ color: 0x1c1d1f, gloss: 0.25 });
  const plateM = new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.4 });
  const headM = mat.glow({ color: 0xfff2d8, intensity: 1.2 }), tailM = mat.glow({ color: 0xff2a1a, intensity: 0.9 });
  const tyreM = mat.rubber({ color: 0x1b1c1e }), rimM = mat.brushedMetal({ color: 0xb9bec4, rough: 0.3 });
  const assign = Array.from({ length: n }, () => Math.floor(r() * types.length));
  const idx = new Int32Array(n), cnt = types.map(() => 0);
  assign.forEach((t, i) => { idx[i] = cnt[t]++; });
  const PARTS = ['paint', 'glass', 'trim', 'plate', 'head', 'tail', 'tyre', 'rim'];
  const T = types.map((type, t) => {
    const g = carGeo(type), c = Math.max(1, cnt[t]);
    const wp = [], rp = [];
    const ri = g.wr * 0.62, w = 0.22;
    for (const [a, b] of [[ri, -w / 2], [g.wr * 0.9, -w / 2], [g.wr, -w * 0.3], [g.wr, w * 0.3], [g.wr * 0.9, w / 2], [ri, w / 2]]) wp.push(new THREE.Vector2(a, b));
    for (const [a, b] of [[0.001, w * 0.4], [ri * 0.5, w * 0.34], [ri, w * 0.44], [ri, -w * 0.44], [0.001, -w * 0.3]]) rp.push(new THREE.Vector2(a, b));
    const tyre = new THREE.LatheGeometry(wp, 18).rotateX(Math.PI / 2), rim = new THREE.LatheGeometry(rp, 14).rotateX(Math.PI / 2);
    const mk = (geo, m, k = 1) => { const im = new THREE.InstancedMesh(geo, m, c * k); im.castShadow = im.receiveShadow = true; im.count = cnt[t] * k; im.frustumCulled = false; im.userData.noFit = true; group.add(im); return im; };
    return {
      g, paint: mk(g.paint, paintM), glass: mk(g.glass, glassM), trim: mk(g.trim, trimM), plate: mk(g.plate, plateM), head: mk(g.head, headM), tail: mk(g.tail, tailM),
      tyre: mk(tyre, tyreM, 4), rim: mk(rim, rimM, 4),
    };
  });
  const m4 = new THREE.Matrix4(), w4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), cc = new THREE.Color();
  const rz = new THREE.Matrix4(), fl = new THREE.Matrix4().makeRotationY(Math.PI);
  const base = new Int32Array(n);
  for (let i = 0; i < n; i++) { const t = T[assign[i]]; base[i] = colors[Math.floor(r() * colors.length)]; t.paint.setColorAt(idx[i], cc.set(base[i])); }
  const api = {
    group, count: n,
    set(i, x, y, z, yaw, wheel = 0) {
      const t = T[assign[i]], k = idx[i], g = t.g;
      q.setFromAxisAngle(up, yaw);
      m4.compose(v.set(x, y, z), q, one);
      for (const p of ['paint', 'glass', 'trim', 'plate', 'head', 'tail']) t[p].setMatrixAt(k, m4);
      let j = 0;
      for (const wx of [-g.wx, g.wx]) for (const s of [-1, 1]) {
        w4.makeTranslation(wx, g.wr, s * (g.W / 2 - 0.16)).multiply(rz.makeRotationZ(-wheel));
        if (s < 0) w4.multiply(fl);
        w4.premultiply(m4);
        t.tyre.setMatrixAt(k * 4 + j, w4); t.rim.setMatrixAt(k * 4 + j, w4); j++;
      }
    },
    hide(i) { api.set(i, 0, -1000, 0, 0); },
    setColor(i, hex) { const t = T[assign[i]]; t.paint.setColorAt(idx[i], cc.set(hex)); t.paint.instanceColor.needsUpdate = true; },
    /** Boyayı bir renge (THREE.Color) boya; null → aracın kendi rengi. commit() ile yüklenir. */
    tint(i, color) { const t = T[assign[i]]; t.paint.setColorAt(idx[i], color ? color : cc.set(base[i])); },
    base(i, hex) { base[i] = hex; },
    info(i) { const g = T[assign[i]].g; return { L: g.L, W: g.W, H: g.H }; },
    commit() {
      for (const t of T) for (const k of PARTS) { t[k].instanceMatrix.needsUpdate = true; if (t[k].instanceColor) t[k].instanceColor.needsUpdate = true; }
    },
    lights(v) { headM.emissiveIntensity = 1.2 + v * 4; tailM.emissiveIntensity = 0.9 + v * 2.5; },
  };
  for (let i = 0; i < n; i++) api.hide(i);
  return api;
}

// ---------------------------------------------------------------- Izgara kent
const roundRect = (w, d, rad, cx = 0, cz = 0) => {
  const s = new THREE.Shape(), x = cx - w / 2, y = cz - d / 2;
  s.moveTo(x + rad, y); s.lineTo(x + w - rad, y); s.quadraticCurveTo(x + w, y, x + w, y + rad);
  s.lineTo(x + w, y + d - rad); s.quadraticCurveTo(x + w, y + d, x + w - rad, y + d);
  s.lineTo(x + rad, y + d); s.quadraticCurveTo(x, y + d, x, y + d - rad);
  s.lineTo(x, y + rad); s.quadraticCurveTo(x, y, x + rad, y);
  return s;
};
// Şekil XY düzleminde çizilir, −90° X döndürmesiyle XZ'ye yatar: y → −z. Bu yüzden z yerine −z veriyoruz.
const slab = (cx, cz, w, d, rad, h, y0 = 0) => new THREE.ExtrudeGeometry(roundRect(w, d, rad), { depth: h, bevelEnabled: false, curveSegments: 5 })
  .rotateX(-Math.PI / 2).translate(cx, y0, cz);
/** Kaldırım kenarı granit bordür (üstü pahlı halka). */
function curbRing(cx, cz, w, d, rad, h = 0.17, cw = 0.24) {
  const outer = roundRect(w, d, rad);
  const hs = roundRect(w - 2 * cw, d - 2 * cw, Math.max(0.2, rad - cw));
  const hole = new THREE.Path(hs.getPoints(5).reverse());
  outer.holes.push(hole);
  return new THREE.ExtrudeGeometry(outer, { depth: h, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 5 })
    .rotateX(-Math.PI / 2).translate(cx, 0, cz);
}

/**
 * Izgara kent: yollar (x = xs[i], z = zs[j] eksenleri), bordürlü kaldırımlar, adalarda gerçek binalar (populateCity + makeBlock).
 * o = { xs, zs, road: yol genişliği, walk: kaldırım genişliği, seed, parked: park etmiş araç sayısı,
 *   plan(i, j, rect) → 'city' | 'park' | 'plaza' | 'none',
 *   lots(inner, r, i, j) → parsel dizisi (yoksa makeBlock), block: makeBlock seçenekleri ya da (inner, i, j) → seçenekler,
 *   floors(x, z, r, type) → kat, type(x, z, r) → bina türü, treeOk(x, z), parkOk(x, z, alongX),
 *   trees, lamps, extent (asfaltı taşır), lawnInside, asphalt (false → asfalt zemini çizme), near / tile / budget / camera (LOD) }
 * Döner: { group, buildings (populateCity), lots, blocks, fleet, trees, lamps, carPts, update(t, wind), setLit(v) }
 */
export function makeCity(o = {}) {
  const P = { road: 12, walk: 3.5, seed: 3, parked: 40, trees: true, lamps: true, extent: 0, lawnInside: true, asphalt: true, ...o };
  const r = cityRng(P.seed);
  const G = streetMaterials();
  const group = new THREE.Group();
  group.name = 'city';
  const xs = P.xs, zs = P.zs;
  const blocks = [], lots = [];
  const walkGeos = [], curbGeos = [], lawnGeos = [], grates = [];
  const treePts = [], lampPts = [], carPts = [], marks = [];
  const rr = (a, b) => a + r() * (b - a);
  const hr = P.road / 2;
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    const rect = { x0: xs[i] + hr, x1: xs[i + 1] - hr, z0: zs[j] + hr, z1: zs[j + 1] - hr };
    rect.cx = (rect.x0 + rect.x1) / 2; rect.cz = (rect.z0 + rect.z1) / 2; rect.w = rect.x1 - rect.x0; rect.d = rect.z1 - rect.z0;
    const kind = P.plan ? P.plan(i, j, rect) : 'city';
    blocks.push({ i, j, ...rect, kind });
    if (kind === 'none') continue;
    walkGeos.push(slab(rect.cx, rect.cz, rect.w - 0.4, rect.d - 0.4, 3.8, 0.15));
    curbGeos.push(curbRing(rect.cx, rect.cz, rect.w, rect.d, 4, 0.15));
    const inner = { x0: rect.x0 + P.walk, x1: rect.x1 - P.walk, z0: rect.z0 + P.walk, z1: rect.z1 - P.walk };
    inner.w = inner.x1 - inner.x0; inner.d = inner.z1 - inner.z0; inner.cx = rect.cx; inner.cz = rect.cz;
    if (kind === 'park' || (kind === 'city' && P.lawnInside)) lawnGeos.push(slab(rect.cx, rect.cz, inner.w, inner.d, 1.5, 0.17));
    const edge = (fn, len, step, off) => { for (let s = off; s < len - 2; s += step) fn(s); };
    const perim = [
      (s) => [rect.x0 + s, rect.z1 - 1.1, 0], (s) => [rect.x0 + s, rect.z0 + 1.1, Math.PI],
      (s) => [rect.x1 - 1.1, rect.z0 + s, Math.PI / 2], (s) => [rect.x0 + 1.1, rect.z0 + s, -Math.PI / 2],
    ];
    const lens = [rect.w, rect.w, rect.d, rect.d];
    perim.forEach((f, k) => {
      if (P.trees) edge((s) => { const p = f(s); if (r() < 0.8 && (!P.treeOk || P.treeOk(p[0], p[1]))) treePts.push(p); }, lens[k], rr(8, 11), rr(5, 8));
      if (P.lamps) edge((s) => { const p = f(s); lampPts.push([p[0], p[1], p[2]]); }, lens[k], 28, 12);
    });
    // yağmur suyu ızgaraları (bordür dibinde)
    for (const [x, z, a] of [[rect.x0 + 6, rect.z1 + 0.45, 0], [rect.x1 - 6, rect.z0 - 0.45, 0], [rect.x1 + 0.45, rect.cz, 1], [rect.x0 - 0.45, rect.cz, 1]]) grates.push([x, z, a]);
    if (kind === 'park') {
      for (let k = 0; k < inner.w * inner.d / 70; k++) treePts.push([rr(inner.x0 + 2, inner.x1 - 2), rr(inner.z0 + 2, inner.z1 - 2), r() * 6, 1]);
    } else if (kind === 'city') {
      const bo = typeof P.block === 'function' ? P.block(inner, i, j) : P.block || {};
      const L = P.lots ? P.lots(inner, r, i, j) : makeBlock(inner, { seed: P.seed * 131 + i * 17 + j * 7, floors: P.floors, type: P.type, ...bo });
      if (L) lots.push(...L);
    }
  }
  const X0 = xs[0] - P.extent, X1 = xs[xs.length - 1] + P.extent, Z0 = zs[0] - P.extent, Z1 = zs[zs.length - 1] + P.extent;
  if (P.asphalt) {
    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + P.road, Z1 - Z0 + P.road).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2), G.asphalt);
    asphalt.receiveShadow = true; asphalt.userData.noFit = true; asphalt.name = 'city:asphalt';
    group.add(asphalt);
  }
  const addM = (geos, m, cast = true) => { if (!geos.length) return; const me = new THREE.Mesh(mergeGeometries(geos.map(clean)), m); me.receiveShadow = true; me.castShadow = cast; me.userData.noFit = true; group.add(me); };
  addM(walkGeos, G.paver); addM(curbGeos, G.curb); addM(lawnGeos, G.lawn, false);
  // yol çizgileri + yaya geçitleri + rögar kapakları
  const zmin = zs[0], zmax = zs[zs.length - 1], xmin = xs[0], xmax = xs[xs.length - 1];
  const holes = [];
  for (const x of xs) for (let j = 0; j + 1 < zs.length; j++) {
    for (let z = zs[j] + hr + 4; z < zs[j + 1] - hr - 4; z += 9) marks.push([x, z + 1.5, 0.15, 3]);
    holes.push([x + hr * 0.45, (zs[j] + zs[j + 1]) / 2 + rr(-8, 8)]);
  }
  for (const z of zs) for (let i = 0; i + 1 < xs.length; i++) {
    for (let x = xs[i] + hr + 4; x < xs[i + 1] - hr - 4; x += 9) marks.push([x + 1.5, z, 3, 0.15]);
    holes.push([(xs[i] + xs[i + 1]) / 2 + rr(-8, 8), z - hr * 0.45]);
  }
  for (const x of xs) for (const z of zs) {
    const n = Math.max(3, Math.floor((P.road - 1) / 1.1 / 2));
    for (let k = -n; k <= n; k++) {
      if (z > zmin) marks.push([x + k * 1.1, z - hr - 2.2, 0.55, 3]);
      if (z < zmax) marks.push([x + k * 1.1, z + hr + 2.2, 0.55, 3]);
      if (x > xmin) marks.push([x - hr - 2.2, z + k * 1.1, 3, 0.55]);
      if (x < xmax) marks.push([x + hr + 2.2, z + k * 1.1, 3, 0.55]);
    }
    // dur çizgileri
    if (z > zmin) marks.push([x - hr / 2, z - hr - 4.3, hr - 0.4, 0.4]);
    if (z < zmax) marks.push([x + hr / 2, z + hr + 4.3, hr - 0.4, 0.4]);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const mk = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.02, 1), G.paint, marks.length);
  marks.forEach((a, k) => mk.setMatrixAt(k, m4.makeScale(a[2], 1, a[3]).setPosition(a[0], 0.012, a[1])));
  mk.receiveShadow = true; mk.userData.noFit = true; mk.userData.noAO = true; mk.name = 'city:marks';
  group.add(mk);
  const cover = clean(new THREE.CylinderGeometry(0.33, 0.35, 0.03, 24));
  const grate = clean(new THREE.BoxGeometry(0.5, 0.02, 0.9));
  const ir = new THREE.InstancedMesh(mergeGeometries([cover]), G.iron, holes.length);
  holes.forEach((h, k) => ir.setMatrixAt(k, m4.makeTranslation(h[0], 0.006, h[1])));
  const gr = new THREE.InstancedMesh(grate, G.iron, grates.length);
  grates.forEach((g, k) => { q.setFromAxisAngle(up, g[2] ? Math.PI / 2 : 0); gr.setMatrixAt(k, m4.compose(v.set(g[0], 0.004, g[1]), q, sc.set(1, 1, 1))); });
  for (const im of [ir, gr]) { im.receiveShadow = true; im.userData.noFit = true; im.userData.noAO = true; group.add(im); }
  // park etmiş araçlar: yol kenarı şeridinde
  for (let n = 0, t = 0; n < P.parked && t < P.parked * 20; t++) {
    const alongX = r() < 0.5;
    if (alongX) {
      const z = zs[Math.floor(r() * zs.length)], x = rr(xmin + hr + 6, xmax - hr - 6), side = r() < 0.5 ? 1 : -1;
      if (xs.some((xx) => Math.abs(xx - x) < hr + 7)) continue;
      if (P.parkOk && !P.parkOk(x, z, true)) continue;
      carPts.push([x, z + side * (hr - 1.25), side > 0 ? 0 : Math.PI]); n++;
    } else {
      const x = xs[Math.floor(r() * xs.length)], z = rr(zmin + hr + 6, zmax - hr - 6), side = r() < 0.5 ? 1 : -1;
      if (zs.some((zz) => Math.abs(zz - z) < hr + 7)) continue;
      if (P.parkOk && !P.parkOk(x, z, false)) continue;
      carPts.push([x + side * (hr - 1.25), z, side > 0 ? -Math.PI / 2 : Math.PI / 2]); n++;
    }
  }
  const fleet = carFleet(carPts.length + (P.extraCars || 0), { seed: P.seed + 7 });
  carPts.forEach((c, i) => fleet.set(i, c[0], 0, c[1], c[2]));
  fleet.commit();
  group.add(fleet.group);
  const trees = streetTrees(treePts, P.seed);
  group.add(trees.group);
  const lamps = streetLamps(lampPts);
  group.add(lamps.group);
  const extra = P.extraLots || [];
  const buildings = populateCity({ lots: [...lots, ...extra], seed: P.seed, near: P.near, tile: P.tile, budget: P.budget, camera: P.camera, ownLights: P.ownLights, noRaycast: P.noRaycast, mats: P.mats });
  group.add(buildings.group);
  return {
    group, buildings, lots, blocks, fleet, trees, lamps, carPts,
    update(t, wind = 1) { trees.update(t, wind); },
    setLit(v) { buildings.setLit(v); lamps.setLit(v); },
  };
}
