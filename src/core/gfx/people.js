// İnsan figürleri: eklemli, yumuşak biçimli (lathe/kapsül) gövde. makePerson → tek kişi (THREE.Group), crowd → örneklenmiş kalabalık.
// Parça başına InstancedMesh (malzeme başına paylaşılan PBR), uzakta pozu pişirilmiş tek çizimli düşük detay; yürüme salınımı GPU'da.
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mat, procedural } from './materials.js';
import { seeded } from '../util.js';

const LOWQ = typeof location !== 'undefined' && /[?&]low\b/.test(location.search);
export const POSES = ['stand', 'walk', 'run', 'sit', 'kneel', 'lie', 'crouch', 'work'];
export const OUTFITS = ['casual', 'office', 'worker', 'medic', 'student', 'chef', 'waiter'];
const PI = Math.PI;

// ---------------------------------------------------------------- Geometri yardımcıları
const V2 = (a) => a.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
function tidy(g, fn) {
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  if (fn) { const p = g.attributes.position, v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { fn(v.fromBufferAttribute(p, i)); p.setXYZ(i, v.x, v.y, v.z); } }
  g = BufferGeometryUtils.mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  return g;
}
/** Dönel profil ([r, y], aşağıdan yukarı). sq: süperelips (köşeli kesit), sx/sz kesit ölçeği, fn(v) serbest biçimlendirme */
let DEC = false; // uzak kademe kurulurken profiller seyreltilir
function lathe(pts, seg, { sx = 1, sz = 1, sq = 0, fn, phi0 = PI, phiL = PI * 2 } = {}) {
  if (DEC && pts.length > 6) pts = pts.filter((p, i) => i === 0 || i === pts.length - 1 || i % 2 === 1);
  const g = new THREE.LatheGeometry(V2(pts), seg, phi0, phiL);
  const n = 2 + sq * 2;
  return tidy(g, (v) => {
    if (sq) { const r = Math.hypot(v.x, v.z); if (r > 1e-6) { const c = Math.abs(v.x / r), s = Math.abs(v.z / r), k = 1 / Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n); v.x *= k; v.z *= k; } }
    v.x *= sx; v.z *= sz;
    if (fn) fn(v);
  });
}
/** Aşağı sarkan yumuşak uzuv: tepede r1 yarıküre, len boyunca r2'ye incelir (mid: kas şişkinliği) */
function limb(r1, r2, len, seg, { mid = 0, midAt = 0.3, cap = 3, sx = 1, sz = 1, fn, openBottom = 0 } = {}) {
  const p = [];
  if (openBottom) p.push([r2 * openBottom, -len], [r2, -len + 0.002]);
  else for (let i = 0; i <= cap; i++) { const a = -PI / 2 + (i / cap) * PI / 2; p.push([r2 * Math.cos(a), -len + r2 * Math.sin(a)]); }
  const nm = DEC ? 2 : 5;
  for (let k = 1; k < nm; k++) { const t = k / nm; p.push([r2 + (r1 - r2) * t + mid * Math.exp(-Math.pow((1 - t - midAt) / 0.22, 2)), -len * (1 - t)]); }
  for (let i = 0; i <= cap; i++) { const a = (i / cap) * PI / 2; p.push([r1 * Math.cos(a), r1 * Math.sin(a)]); }
  return lathe(p, seg, { sx, sz, fn });
}
function ellipsoid(rx, ry, rz, seg, rings) {
  const g = new THREE.SphereGeometry(1, seg, rings); g.scale(rx, ry, rz); return tidy(g);
}
function merge(list) { return BufferGeometryUtils.mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g))); }
function paint(g, fn) { // köşe rengi (aksesuar malzemesi vertexColors)
  const p = g.attributes.position, c = new Float32Array(p.count * 3), v = new THREE.Vector3(), o = [1, 1, 1];
  for (let i = 0; i < p.count; i++) { o[0] = o[1] = o[2] = 1; if (fn) fn(v.fromBufferAttribute(p, i), o); c[i * 3] = o[0]; c[i * 3 + 1] = o[1]; c[i * 3 + 2] = o[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lin = (hex) => new THREE.Color(hex);

// ---------------------------------------------------------------- Beden ölçüleri (boy 1,75 m referans; kök ölçeği boy/1,75)
const B = {
  pelvisY: 0.955, hipX: 0.092, hipY: -0.045, thigh: 0.44, shin: 0.39,
  neckY: 0.47, neckZ: -0.012, headY: 0.105, shY: 0.42, shX: { m: 0.168, f: 0.153 }, upper: 0.29, fore: 0.25,
};

// Torso profilleri (pelvis pivotuna göre)
const TORSO = {
  m: [[0, -0.03], [0.168, -0.025], [0.172, 0.0], [0.163, 0.08], [0.158, 0.15], [0.165, 0.22], [0.176, 0.29], [0.183, 0.35], [0.184, 0.395], [0.179, 0.425], [0.16, 0.452], [0.12, 0.47], [0.075, 0.48], [0, 0.486]],
  f: [[0, -0.03], [0.166, -0.025], [0.17, 0.0], [0.148, 0.08], [0.136, 0.15], [0.143, 0.22], [0.153, 0.29], [0.157, 0.34], [0.158, 0.385], [0.154, 0.415], [0.139, 0.442], [0.105, 0.46], [0.066, 0.47], [0, 0.476]],
};
const bust = (v) => { if (v.z > 0) v.z += 0.03 * Math.exp(-Math.pow((v.y - 0.315) / 0.055, 2)) * Math.exp(-Math.pow((Math.abs(v.x) - 0.072) / 0.05, 2)); };
const jacketOf = (p) => [[0, -0.2], [0.176, -0.19], [0.182, -0.1], ...p.slice(2).map(([r, y]) => [r * 1.045 + (y > 0.38 && y < 0.46 ? 0.006 : 0), y + 0.004])];

function headGeo(seg) {
  const prof = [[0, -0.065], [0.03, -0.062], [0.05, -0.045], [0.062, -0.015], [0.07, 0.02], [0.077, 0.06], [0.081, 0.1], [0.08, 0.13], [0.072, 0.16], [0.055, 0.185], [0.03, 0.198], [0, 0.202]];
  const skull = lathe(prof, seg, { sz: 1.2, fn: headShape });
  const nose = limb(0.012, 0.017, 0.036, 7, { cap: 2, sx: 0.85, sz: 0.8 });
  nose.rotateX(-0.42); nose.translate(0, 0.098, 0.098);
  const ears = [-1, 1].map((s) => { const e = ellipsoid(0.011, 0.029, 0.02, 8, 6); e.rotateY(s * 0.35); e.translate(s * 0.078, 0.07, -0.004); return e; });
  return merge([skull, nose, ...ears]);
}
function headShape(v) {
  if (v.z < 0) v.z *= 0.72 + 0.28 * sst(-0.06, 0.07, v.y);     // ense
  if (v.z > 0) v.z *= 1 - 0.16 * Math.pow(Math.min(1, Math.abs(v.x) / 0.08), 2);
  if (v.z > 0 && v.y < 0.03) v.x *= 0.9 + 0.1 * sst(-0.06, 0.03, v.y); // çene daralır
  v.z += 0.012;
  if (v.z > 0.05) {
    const eye = Math.exp(-Math.pow((Math.abs(v.x) - 0.032) / 0.017, 2) - Math.pow((v.y - 0.087) / 0.013, 2));
    const brow = Math.exp(-Math.pow((v.y - 0.108) / 0.009, 2)) * sst(0.07, 0.0, Math.abs(v.x) - 0.02);
    const cheek = Math.exp(-Math.pow((Math.abs(v.x) - 0.045) / 0.02, 2) - Math.pow((v.y - 0.055) / 0.018, 2));
    v.z += -0.0075 * eye + 0.004 * brow + 0.004 * cheek;
    const lip = Math.exp(-Math.pow(v.x / 0.02, 2) - Math.pow((v.y - 0.025) / 0.01, 2));
    v.z += 0.003 * lip;
  }
}
function eyesGeo() {
  const out = [];
  for (const s of [-1, 1]) {
    const e = ellipsoid(0.0115, 0.0105, 0.0115, 10, 8);
    paint(e, (v, o) => { const f = v.z / 0.0115; if (f > 0.72) { o[0] = 0.05; o[1] = 0.035; o[2] = 0.03; } else if (f > 0.55) { o[0] = 0.28; o[1] = 0.18; o[2] = 0.1; } else { o[0] = 0.86; o[1] = 0.83; o[2] = 0.79; } });
    e.translate(s * 0.032, 0.087, 0.0875); out.push(e);
  }
  return merge(out);
}
// Saç: başın biraz büyütülmüş kabuğu; saç çizgisinin altındaki köşeler kafanın içine çekilir
function hairGeo(style, seg, far) {
  const prof = [[0, -0.065], [0.03, -0.062], [0.05, -0.045], [0.062, -0.015], [0.07, 0.02], [0.077, 0.06], [0.081, 0.1], [0.08, 0.13], [0.072, 0.16], [0.055, 0.185], [0.03, 0.198], [0, 0.202]];
  const C = new THREE.Vector3(0, 0.07, 0.01);
  const shell = lathe(prof.map(([r, y]) => [r * 1.075 + 0.003, y * 1.04 + 0.006]), seg, {
    sz: 1.2, fn: (v) => {
      headShape(v);
      const L = Math.hypot(v.x, v.z - 0.01) || 1, f = (v.z - 0.01) / L;
      let yl = f < 0.25 ? -0.035 + 0.125 * sst(-0.65, 0.25, f) : 0.09 + 0.05 * sst(0.25, 0.85, f);
      if (style === 'bald') yl = f > 0.1 || v.y > 0.07 ? 9 : yl;
      if (style === 'long') yl = f < 0.3 ? -0.2 : yl - 0.01;
      if (style === 'crop') yl += 0.01;
      const wav = style === 'long' || style === 'bun' ? 0.004 * Math.sin(Math.atan2(v.x, v.z) * 14 + v.y * 60) : 0.0015 * Math.sin(Math.atan2(v.x, v.z) * 23);
      if (v.y < yl) { v.sub(C).multiplyScalar(0.86).add(C); if (yl < 9) v.y = Math.min(v.y, yl); }
      else { const k = 1 + wav / 0.09; v.x *= k; v.z = (v.z - 0.012) * k + 0.012; }
      if (style === 'crop' && v.y > 0.12) v.y -= 0.004;
    },
  });
  const parts = [shell];
  if (style === 'long') {
    const back = lathe([[0.02, -0.215], [0.07, -0.21], [0.092, -0.17], [0.094, -0.09], [0.09, 0.0], [0.085, 0.07], [0, 0.08]], seg, {
      sz: 0.62, phi0: PI * 0.62, phiL: PI * 0.76,
      fn: (v) => { v.z -= 0.035; v.x *= 1 + 0.25 * sst(-0.05, -0.2, v.y); },
    });
    parts.push(back);
  }
  if (style === 'bun') { const b = ellipsoid(0.042, 0.04, 0.038, 10, 8); b.translate(0, 0.15, -0.085); parts.push(b); }
  if (!far) for (const s of [-1, 1]) { // kaşlar
    const b = limb(0.0045, 0.004, 0.028, 5, { cap: 2, sz: 0.6 }); b.rotateZ(s * (PI / 2 + 0.12)); b.translate(s * 0.018, 0.109, 0.1); parts.push(b);
  }
  return merge(parts);
}
function handGeo(side, seg) {
  const palm = lathe([[0, -0.172], [0.018, -0.168], [0.029, -0.145], [0.034, -0.095], [0.035, -0.045], [0.029, -0.012], [0.018, 0.0], [0, 0.006]], seg, {
    sx: 0.52, sz: 1.2, fn: (v) => { const c = Math.max(0, (-v.y - 0.09) / 0.08); v.x -= side * 0.02 * c * c; v.z += 0.004 * c; },
  });
  const th = limb(0.012, 0.0095, 0.052, 6, { cap: 2 });
  th.rotateX(-0.55); th.rotateZ(side * 0.25); th.translate(-side * 0.006, -0.03, 0.032);
  return merge([palm, th]);
}
function shoeGeo(seg, boot, far) {
  const body = lathe([[0, -1], [0.45, -0.9], [0.75, -0.62], [0.93, -0.3], [1, 0], [0.93, 0.35], [0.75, 0.65], [0.45, 0.9], [0, 1]], seg, {
    fn: (v) => {
      v.set(v.x * 0.05, v.y * 0.05, v.z * 0.13);   // yarıküre değil: uzun ayak
      v.y -= 0.04; v.z += 0.058;
      if (v.y < -0.074) v.y = -0.086 + (v.y + 0.074) * 0.15 + Math.max(0, v.z - 0.14) * 0.12;  // düz taban, kalkık burun
      if (v.y > -0.045 && v.z > 0.0) v.y = -0.045 + (v.y + 0.045) * (1 - 0.6 * sst(0.0, 0.14, v.z));
    },
  });
  if (far) return body;
  const collar = limb(0.042, 0.045, boot ? 0.12 : 0.06, seg, { cap: 2, sz: 1.1 });
  collar.translate(0, boot ? 0.07 : 0.025, -0.012);
  return merge([body, collar]);
}

// Parça geometrileri tembel üretilir (kalite kademesi: 'hi' | 'lo' | 'far'); yalnız kullanılan parçalar kurulur
const GEO = { hi: {}, lo: {}, far: {} };
const BUILD = {
  pelvis: (R) => ({
    m: lathe([[0, -0.13], [0.07, -0.125], [0.125, -0.1], [0.155, -0.05], [0.162, 0.0], [0.157, 0.05], [0.15, 0.1], [0, 0.11]], R, { sz: 0.7, sq: 0.25 }),
    f: lathe([[0, -0.13], [0.075, -0.125], [0.135, -0.1], [0.168, -0.05], [0.172, 0.0], [0.158, 0.05], [0.145, 0.1], [0, 0.11]], R, { sz: 0.7, sq: 0.25 }),
  }),
  torso: (R) => ({
    m: lathe(TORSO.m, R, { sz: 0.62, sq: 0.35 }), f: lathe(TORSO.f, R, { sz: 0.62, sq: 0.3, fn: bust }),
    mJ: lathe(jacketOf(TORSO.m), R, { sz: 0.64, sq: 0.4 }), fJ: lathe(jacketOf(TORSO.f), R, { sz: 0.64, sq: 0.35, fn: bust }),
  }),
  neck: (R, r) => {
    const neck = (k) => lathe([[0, -0.04], [0.056 * k, -0.03], [0.05 * k, 0.03], [0.047 * k, 0.07], [0.05 * k, 0.1], [0, 0.11]], r, { sz: 0.95 });
    return { m: neck(1), f: neck(0.86) };
  },
  head: (R, r, q) => ({ h: q === 'far' ? lathe([[0, -0.065], [0.05, -0.045], [0.07, 0.02], [0.081, 0.1], [0.072, 0.16], [0.03, 0.198], [0, 0.202]], R, { sz: 1.2, fn: headShape }) : headGeo(R) }),
  eyes: () => ({ e: eyesGeo() }),
  hat: (R) => ({
    toque: paint(lathe([[0, 0.12], [0.088, 0.12], [0.09, 0.17], [0.102, 0.22], [0.118, 0.29], [0.113, 0.335], [0.08, 0.36], [0, 0.366]], R, { sz: 1.15, fn: (v) => { v.z += 0.004; } })),
    hard: lathe([[0, 0.11], [0.098, 0.108], [0.128, 0.108], [0.132, 0.116], [0.1, 0.124], [0.096, 0.16], [0.086, 0.19], [0.06, 0.212], [0, 0.22]], R, { sz: 1.16, fn: (v) => { v.z += 0.008; if (v.z > 0.09 && v.y < 0.13) { v.z += 0.02; v.y -= 0.004; } } }),
  }),
  uarm: (R, r, q, c) => ({ m: limb(0.047, 0.04, B.upper, r, { mid: 0.004, cap: c }), f: limb(0.043, 0.035, B.upper, r, { mid: 0.003, cap: c }) }),
  sleeve: (R, r, q, c) => ({ short: limb(0.054, 0.053, 0.14, r, { openBottom: 0.55, cap: c }), long: limb(0.052, 0.046, B.upper, r, { mid: 0.003, cap: c }) }),
  farm: (R, r, q, c) => ({ skin: limb(0.042, 0.029, B.fore, r, { mid: 0.005, midAt: 0.15, cap: c }), cloth: limb(0.048, 0.039, B.fore - 0.015, r, { mid: 0.003, cap: c }) }),
  handL: (R, r, q) => ({ h: q === 'far' ? limb(0.032, 0.026, 0.13, 4, { cap: 1, sx: 0.55, sz: 1.15 }) : handGeo(1, r) }),
  handR: (R, r, q) => ({ h: q === 'far' ? limb(0.032, 0.026, 0.13, 4, { cap: 1, sx: 0.55, sz: 1.15 }) : handGeo(-1, r) }),
  thigh: (R, r, q, c) => ({ m: limb(0.085, 0.058, B.thigh, r, { mid: 0.006, sz: 0.97, cap: c }), f: limb(0.09, 0.057, B.thigh, r, { mid: 0.006, sz: 0.97, cap: c }) }),
  shin: (R, r, q, c) => ({ p: limb(0.061, 0.05, B.shin, r, { mid: 0.007, midAt: 0.25, cap: c }) }),
  foot: (R, r, q) => ({ s: shoeGeo(r, false, q === 'far'), b: shoeGeo(r, true, q === 'far') }),
  // Aksesuar (vertexColors): önlük, yelek, gömlek önü + kravat, çanta
  apron: (R) => ({ a: paint(lathe([[0.2, -0.5], [0.205, -0.49], [0.19, -0.3], [0.177, -0.1], [0.172, 0.0], [0.166, 0.07]], R, { sz: 0.74, phi0: -1.2, phiL: 2.4 })) }),
  vest: (R) => {
    const vest = (hex) => paint(lathe([[0, -0.03], [0.178, -0.02], [0.181, 0.04], [0.173, 0.1], [0.169, 0.15], [0.172, 0.175], [0.176, 0.21], [0.183, 0.27], [0.189, 0.305], [0.19, 0.35], [0.19, 0.395], [0.184, 0.425], [0.15, 0.458], [0.08, 0.476], [0, 0.48]], R, { sz: 0.66, sq: 0.35 }),
      (v, o) => { const s = (v.y > 0.148 && v.y < 0.177) || (v.y > 0.268 && v.y < 0.307); const c = s ? lin(0xd9dde0) : lin(hex); o[0] = c.r; o[1] = c.g; o[2] = c.b; });
    return { y: vest(0xc8f03c), o: vest(0xff7a1a) };
  },
  bib: () => ({ t: paint(lathe([[0, 0.3], [0.05, 0.31], [0.065, 0.4], [0.07, 0.455], [0, 0.46]], 8, { sx: 1, sz: 0.3, phi0: -PI / 2, phiL: PI, fn: (v) => { v.z += 0.121; v.x *= 0.15 + 0.85 * Math.max(0, (v.y - 0.3) / 0.16); } }),
    (v, o) => { if (Math.abs(v.x) < 0.009 + (0.44 - v.y) * 0.03 && v.y < 0.44) { o[0] = 0.22; o[1] = 0.03; o[2] = 0.05; } }) }),
  tie: () => ({ t: paint(limb(0.018, 0.034, 0.23, 6, { cap: 1, sz: 0.22, fn: (v) => { v.y += 0.44; v.z += 0.119 - Math.max(0, v.y - 0.36) * 0.08; } })) }),
  pack: (R) => ({ p: paint(tidy(new THREE.CapsuleGeometry(0.13, 0.16, 3, R), (v) => { v.z *= 0.45; v.y += 0.28; v.z -= 0.155; })) }),
};
function geo(q, g, v) {
  const C = GEO[q];
  if (g === 'hair') { const k = 'hair_' + v; return C[k] || (C[k] = hairGeo(v, q === 'hi' ? 14 : q === 'lo' ? 10 : 6, q === 'far')); }
  if (!C[g]) {
    const R = q === 'hi' ? 14 : q === 'lo' ? 10 : 6, r = q === 'hi' ? 9 : q === 'lo' ? 7 : 4, cap = q === 'far' ? 1 : q === 'lo' ? 2 : 3;
    DEC = q === 'far';
    try { C[g] = BUILD[g](R, r, q, cap); } finally { DEC = false; }
  }
  return C[g][v];
}

// ---------------------------------------------------------------- Malzemeler (modül başına tek; renkler örnek başına)
let MAT = null;
function materials() {
  if (MAT) return MAT;
  const skin = procedural({
    key: 'person-skin', physical: true, bump: 0.012,
    params: { color: 0xffffff, roughness: 0.56, sheen: 0.35, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x6a3a2c), specularIntensity: 0.55 },
    pattern: `
      float n = fbm3(p*7.0 + seed*3.0, 4), pore = vn3(p*300.0), bl = fbm3(p*2.5 + 7.0, 3);
      col *= 0.94 + 0.1*n;
      col = mix(col, col*vec3(1.06, 0.88, 0.86), smoothstep(0.5, 0.8, bl)*0.45);
      rough = 0.5 + 0.12*pore + 0.08*n;
      h = pore*0.45 + n*0.55;`,
  });
  const top = mat.fabric({ color: 0xffffff, scale: 3.2 }); top.sheenColor.set(0x3a3a3a); top.sheen = 0.7; top.userData.uniforms.pBump.value = 0.008;
  const bottom = procedural({
    key: 'person-twill', physical: true, bump: 0.008, scale: 2.2,
    params: { color: 0xffffff, roughness: 0.88, sheen: 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x2e2e2e) },
    pattern: `
      vec3 a = axisDominant(pn); vec2 uv = a.x > 0.5 ? p.zy : (a.y > 0.5 ? p.xz : p.xy);
      float tw = mix(0.5, 0.5 + 0.5*sin((uv.x + uv.y)*520.0), aaW(vec3(uv*83.0, 0.0)));
      float n = fbm3(p*4.0, 3), fade = fbm3(p*1.3 + seed*5.0, 3);
      col *= 0.82 + 0.2*tw + 0.12*n;
      col = mix(col, col*1.18 + 0.02, smoothstep(0.55, 0.85, fade)*0.35);
      h = tw*0.7 + n*0.3;`,
  });
  const shoe = procedural({
    key: 'person-shoe', bump: 0.01,
    params: { color: 0xffffff, roughness: 0.5 },
    pattern: `
      float n = fbm3(p*18.0, 3), cr = vn3(p*140.0);
      col *= 0.9 + 0.15*n;
      if (p.y < -0.07) { col = mix(col, vec3(0.13), 0.8); rough = 0.8; }
      rough = clamp(rough + 0.15*(cr - 0.5), 0.2, 0.95);
      h = n*0.6 + cr*0.4;`,
  });
  const hair = procedural({
    key: 'person-hair', physical: true, bump: 0.03,
    params: { color: 0xffffff, roughness: 0.5, sheen: 0.8, sheenRoughness: 0.3, sheenColor: new THREE.Color(0x8a7258), specularIntensity: 0.7 },
    pattern: `
      float a = atan(p.x, p.z);
      float s = vn3(vec3(a*40.0, p.y*18.0, 0.0))*0.6 + vn3(vec3(a*120.0, p.y*40.0, 3.0))*0.4;
      float cl = fbm3(p*12.0, 3);
      col *= 0.7 + 0.45*s + 0.15*cl;
      rough = 0.42 + 0.2*(1.0 - s);
      h = s;`,
  });
  const eye = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.15 });
  const acc = mat.fabric({ color: 0xffffff, scale: 3.2 }); acc.userData.uniforms.pBump.value = 0.008; acc.vertexColors = true; acc.side = THREE.DoubleSide; acc.sheenColor.set(0x3a3a3a); acc.sheen = 0.6;
  const gear = mat.plastic({ color: 0xffffff, gloss: 0.6 });
  const far = farMaterial();
  return (MAT = { skin, top, bottom, shoe, hair, eye, acc, gear, far });
}
// Uzak kademe: tek çizim; bölge rengi örnek başına, kol/bacak salınımı köşe gölgelendiricide
function farMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aRB; attribute vec3 iC0; attribute vec3 iC1; attribute vec3 iC2; attribute vec3 iC3; attribute vec3 iC4; attribute vec3 iC5; attribute vec2 iAnim;
        varying vec3 vPC;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        float pa = 0.0, pyv = 0.0, pb = aRB.y, psn = sin(iAnim.x);
        if (pb > 0.5) {
          if (pb < 1.5) { pa = -iAnim.y*psn; pyv = 0.91; } else if (pb < 2.5) { pa = iAnim.y*psn; pyv = 0.91; }
          else if (pb < 3.5) { pa = 0.75*iAnim.y*psn; pyv = 1.4; } else { pa = -0.75*iAnim.y*psn; pyv = 1.4; }
        }
        float pc = cos(pa), ps = sin(pa);
        objectNormal = vec3(objectNormal.x, pc*objectNormal.y - ps*objectNormal.z, ps*objectNormal.y + pc*objectNormal.z);
        float rg = aRB.x;
        vPC = rg < 0.5 ? iC0 : rg < 1.5 ? iC1 : rg < 2.5 ? iC2 : rg < 3.5 ? iC3 : rg < 4.5 ? iC4 : iC5;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 pq = transformed - vec3(0.0, pyv, 0.0);
          transformed = vec3(pq.x, pc*pq.y - ps*pq.z, ps*pq.y + pc*pq.z) + vec3(0.0, pyv, 0.0); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPC;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vPC;');
  };
  m.customProgramCacheKey = () => 'simlab-person-far';
  return m;
}

// ---------------------------------------------------------------- Parçalar: kemik, yuva (malzeme), renk anahtarı, kalınlık türü
// bones: 0 pelvis, 1 torso, 2 boyun, 3 baş, 4 omuzL, 5 dirsekL, 6 bilekL, 7 omuzR, 8 dirsekR, 9 bilekR, 10 kalçaL, 11 dizL, 12 bilekL(ayak), 13 kalçaR, 14 dizR, 15 ayakR
const NB = 16;
const PARTS = [
  { k: 'pelvis', g: 'pelvis', bone: 0, slot: 'bottom', col: 'bottom', w: 't', reg: 2 },
  { k: 'torso', g: 'torso', bone: 1, slot: 'top', col: 'top', w: 't', reg: 1 },
  { k: 'neck', g: 'neck', bone: 2, slot: 'skin', col: 'skin', w: 'n', reg: 0 },
  { k: 'head', g: 'head', bone: 3, slot: 'skin', col: 'skin', w: '', reg: 0 },
  { k: 'eyes', g: 'eyes', bone: 3, slot: 'eye', col: 'white', w: '' },
  { k: 'hair', g: 'hair', bone: 3, slot: 'hair', col: 'hair', w: '', reg: 3 },
  { k: 'hat', g: 'hat', bone: 3, slot: { toque: 'acc', hard: 'gear' }, col: 'hat', w: '' },
  { k: 'uarmL', g: 'uarm', bone: 4, slot: 'skin', col: 'skin', w: 'l', reg: 0, lb: 3 },
  { k: 'uarmR', g: 'uarm', bone: 7, slot: 'skin', col: 'skin', w: 'l', reg: 0, lb: 4 },
  { k: 'sleeveL', g: 'sleeve', bone: 4, slot: 'top', col: 'top', w: 'l', reg: 1, lb: 3 },
  { k: 'sleeveR', g: 'sleeve', bone: 7, slot: 'top', col: 'top', w: 'l', reg: 1, lb: 4 },
  { k: 'farmL', g: 'farm', bone: 5, slot: { skin: 'skin', cloth: 'top' }, col: { skin: 'skin', cloth: 'top' }, w: 'l', reg: 5, lb: 3 },
  { k: 'farmR', g: 'farm', bone: 8, slot: { skin: 'skin', cloth: 'top' }, col: { skin: 'skin', cloth: 'top' }, w: 'l', reg: 5, lb: 4 },
  { k: 'handL', g: 'handL', bone: 6, slot: 'skin', col: 'skin', w: '', reg: 0, lb: 3 },
  { k: 'handR', g: 'handR', bone: 9, slot: 'skin', col: 'skin', w: '', reg: 0, lb: 4 },
  { k: 'thighL', g: 'thigh', bone: 10, slot: 'bottom', col: 'bottom', w: 'l', reg: 2, lb: 1 },
  { k: 'thighR', g: 'thigh', bone: 13, slot: 'bottom', col: 'bottom', w: 'l', reg: 2, lb: 2 },
  { k: 'shinL', g: 'shin', bone: 11, slot: 'bottom', col: 'bottom', w: 'l', reg: 2, lb: 1 },
  { k: 'shinR', g: 'shin', bone: 14, slot: 'bottom', col: 'bottom', w: 'l', reg: 2, lb: 2 },
  { k: 'footL', g: 'foot', bone: 12, slot: 'shoe', col: 'shoe', w: '', reg: 4, lb: 1 },
  { k: 'footR', g: 'foot', bone: 15, slot: 'shoe', col: 'shoe', w: '', reg: 4, lb: 2 },
  { k: 'apron', g: 'apron', bone: 0, slot: 'acc', col: 'acc', w: 't' },
  { k: 'vest', g: 'vest', bone: 1, slot: 'acc', col: 'white', w: 't' },
  { k: 'bib', g: 'bib', bone: 1, slot: 'acc', col: 'white', w: 't' },
  { k: 'tie', g: 'tie', bone: 1, slot: 'acc', col: 'tie', w: 't' },
  { k: 'pack', g: 'pack', bone: 1, slot: 'acc', col: 'pack', w: 't' },
];
const NP = PARTS.length;
PARTS.forEach((p, i) => (p.i = i));
const COLKEYS = ['skin', 'top', 'bottom', 'shoe', 'hair', 'acc', 'hat', 'tie', 'pack', 'white'];
const CK = Object.fromEntries(COLKEYS.map((k, i) => [k, i]));
// Her parçanın varyant adları (sabit sıra → Uint8 kod)
const VNAMES = { pelvis: ['m', 'f'], torso: ['m', 'f', 'mJ', 'fJ'], neck: ['m', 'f'], head: ['h'], eyes: ['e'], hair: ['short', 'crop', 'long', 'bun', 'bald'],
  hat: ['toque', 'hard'], uarm: ['m', 'f'], sleeve: ['short', 'long'], farm: ['skin', 'cloth'], handL: ['h'], handR: ['h'], thigh: ['m', 'f'], shin: ['p'],
  foot: ['s', 'b'], apron: ['a'], vest: ['y', 'o'], bib: ['t'], tie: ['t'], pack: ['p'] };
const VARIANTS = PARTS.map((p) => VNAMES[p.g]);

// ---------------------------------------------------------------- Görünüm (kıyafet, ten, saç) — seed'e bağlı
const SKINS = [0xf3d3bc, 0xeec2a2, 0xe2ae8a, 0xd29d78, 0xc08560, 0xa66e4b, 0x8c5a3b, 0x6e432c, 0xe9bb98, 0xd8a582];
const HAIRS = [0x1c1612, 0x2a1d15, 0x3b2819, 0x4d3421, 0x0f0d0c, 0x6b4a2e, 0x8c6a43, 0xb89868, 0x7a766f, 0xb5b0a8, 0x5a2a1a];
const TEES = [0xf2f2ee, 0x1d1f24, 0x2d4a78, 0x8b2330, 0x3f6b4e, 0xd8b04a, 0x6d8fb8, 0xc9653b, 0x7b5c9a, 0x9aa0a6, 0xe7d8c0, 0x2f7f86, 0xd0829a, 0x50575f, 0x9b2b2b];
const JEANS = [0x2c3e5c, 0x3a5578, 0x1f2a3d, 0x4c6a8c, 0x23262b, 0x4a4b50, 0x7d6c55, 0x5a5144, 0x2f3a2e, 0x1b1c1f];
const SNEAK = [0xeeeeea, 0xe0e0dc, 0x2a2b2e, 0x6c7178, 0x8a2a2a, 0x2c4a7a, 0xb8a58a];
const SUITS = [0x1f2638, 0x2c2f35, 0x4a4d52, 0x1a1b1e, 0x5c4d3d, 0x3a3f4a, 0x6b6e73];
const SHIRTS = [0xf4f5f7, 0xdfe8f2, 0xeef0f5, 0xb9cde6, 0xf2e9dc, 0xd9d4e8];
const LEATHER = [0x1a1512, 0x2b1d14, 0x4a2e1c, 0x121212];
const TIES = [0x6e1a24, 0x1e2d5a, 0x2d4a3a, 0x5a3a6a, 0x8a6a2a, 0x3a3a3a];
const SCRUBS = [0x2f7f86, 0x3a6ea5, 0x4a7f5a, 0x5a8fb8, 0x6a4f8a, 0x2f5f8a];
const WORK = [0x2c3a52, 0x4a4f3a, 0x5a5448, 0x3a3f46, 0x2e4a5e];
const PACKS = [0x2b2d33, 0x8b2330, 0x2d4a78, 0x3f6b4e, 0xd8b04a, 0x6a4f8a, 0x5a5a58, 0xc9653b];
const pickR = (r, a) => a[Math.floor(r() * a.length) % a.length];
const hexOr = (v, d) => (v == null ? d : v);

/** Kişi tanımı: {hs, build, sw, sex, vars[NP], cols[COLKEYS]} */
function makeSpec(o, r) {
  const outfit = o.outfit || 'casual';
  const sex = o.sex === 'f' || o.sex === 'female' ? 1 : o.sex === 'm' || o.sex === 'male' ? 0 : r() < 0.5 ? 1 : 0;
  const height = o.height ?? (sex ? 1.56 + r() * 0.18 : 1.66 + r() * 0.2);
  const build = o.build ?? 0.9 + r() * 0.3;
  const V = new Uint8Array(NP).fill(255);
  const set = (k, v) => { const p = PARTS.find((q) => q.k === k); V[p.i] = VARIANTS[p.i].indexOf(v); };
  const sx = sex ? 'f' : 'm';
  let hairStyle = typeof o.hair === 'object' && o.hair?.style;
  const age = r();
  if (!hairStyle) hairStyle = sex ? pickR(r, ['long', 'long', 'bun', 'short', 'long']) : age > 0.82 ? 'bald' : pickR(r, ['short', 'short', 'crop', 'crop', 'short']);
  const hairCol = typeof o.hair === 'number' ? o.hair : (typeof o.hair === 'object' && o.hair?.color != null) ? o.hair.color : age > 0.86 ? pickR(r, [0x8a857e, 0xb5b0a8, 0x9a948a]) : pickR(r, HAIRS);
  const c = o.colors || {};
  const cols = { skin: hexOr(o.skin, pickR(r, SKINS)), hair: hairCol, white: 0xffffff, acc: 0xf2f0ea, hat: 0xf6f6f2, tie: pickR(r, TIES), pack: pickR(r, PACKS) };
  let jacket = false, sleeves = r() < 0.7 ? 'short' : 'long', shoe = 's';
  if (outfit === 'casual') { cols.top = pickR(r, TEES); cols.bottom = pickR(r, JEANS); cols.shoe = pickR(r, SNEAK); }
  else if (outfit === 'student') { cols.top = pickR(r, TEES); cols.bottom = pickR(r, JEANS); cols.shoe = pickR(r, SNEAK); set('pack', 'p'); }
  else if (outfit === 'office') {
    sleeves = 'long'; cols.shoe = pickR(r, LEATHER);
    if (r() < 0.55) { jacket = true; cols.top = pickR(r, SUITS); cols.bottom = r() < 0.7 ? cols.top : pickR(r, SUITS); set('bib', 't'); }
    else { cols.top = pickR(r, SHIRTS); cols.bottom = pickR(r, SUITS); if (!sex || r() < 0.2) set('tie', 't'); }
  } else if (outfit === 'worker') {
    sleeves = 'long'; shoe = 'b'; cols.top = pickR(r, WORK); cols.bottom = pickR(r, WORK); cols.shoe = pickR(r, [0x4a2e1c, 0x2b1d14, 0x1a1512]);
    set('vest', r() < 0.5 ? 'y' : 'o'); set('hat', 'hard'); cols.hat = pickR(r, [0xf2c21a, 0xf2c21a, 0xf4f4f0, 0xe8661a]);
  } else if (outfit === 'medic') {
    sleeves = 'short'; cols.top = pickR(r, SCRUBS); cols.bottom = cols.top; cols.shoe = pickR(r, [0xf0f0ec, 0xe4e6e8, 0x2a2b2e]);
  } else if (outfit === 'chef') {
    sleeves = 'long'; cols.top = 0xf4f3ee; cols.bottom = pickR(r, [0x26272a, 0x333438, 0x1c1d20]); cols.shoe = 0x151515;
    set('apron', 'a'); cols.acc = 0xf6f5f0; set('hat', 'toque'); cols.hat = 0xf8f8f4;
  } else if (outfit === 'waiter') {
    sleeves = 'long'; const w = r() < 0.5; cols.top = w ? 0xf2f2f0 : 0x17181b; cols.bottom = 0x151619; cols.shoe = 0x121212;
    set('apron', 'a'); cols.acc = w ? 0x1a1b1e : 0xf0eee8;
  }
  if (o.sleeves) sleeves = o.sleeves;
  Object.assign(cols, c);
  if (o.apron) { set('apron', 'a'); if (typeof o.apron === 'number') cols.acc = o.apron; }
  if (o.pack) set('pack', 'p');
  if (o.hat) set('hat', o.hat);
  set('pelvis', sx); set('torso', sx + (jacket ? 'J' : '')); set('neck', sx); set('head', 'h'); set('eyes', 'e');
  set('hair', hairStyle);
  for (const s of ['L', 'R']) {
    if (sleeves === 'short') { set('uarm' + s, sx); set('sleeve' + s, 'short'); set('farm' + s, 'skin'); }
    else { set('sleeve' + s, 'long'); set('farm' + s, 'cloth'); }
    set('hand' + s, 'h'); set('thigh' + s, sx); set('shin' + s, 'p'); set('foot' + s, shoe);
  }
  const col = new Float32Array(COLKEYS.length * 3), tc = new THREE.Color();
  COLKEYS.forEach((k, i) => { tc.setHex(cols[k] ?? 0xffffff); col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b; });
  return {
    hs: height / 1.75, build, sw: (o.shoulders ?? 0.95 + r() * 0.1) * (sex ? 0.97 : 1), sex, V, col, outfit, height,
    fore: sleeves === 'short' ? 0 : 1, hairStyle,
  };
}

// ---------------------------------------------------------------- Pozlar (eklem açıları)
function newAngles() {
  return { mode: 0, pp: 0, pr: 0, pw: 0, sp: 0, sr: 0, sw: 0, np: 0, hp: 0, hw: 0, hr: 0,
    shP: [0, 0], shR: [0, 0], shW: [0, 0], el: [0, 0], wr: [0, 0], hiP: [0, 0], hiR: [0, 0], kn: [0, 0], an: [0, 0] };
}
const mix = (a, b, t) => a + (b - a) * t;
/** pose, ph: adım fazı, g: yürüyüş miktarı 0–1, t: saniye, s: kişiye özgü 0–1 */
function poseAngles(A, pose, ph, g, t, s) {
  const w = Math.sin(t * 0.42 + s * 40), br = Math.sin(t * 1.5 + s * 20);
  A.mode = 0; A.pp = 0.02; A.pr = 0.035 * w; A.pw = 0; A.sp = 0.02 + 0.012 * br; A.sr = -A.pr * 1.2; A.sw = 0;
  A.np = 0.03; A.hp = 0.05 + 0.04 * Math.sin(t * 0.3 + s * 9); A.hw = 0.35 * Math.sin(t * 0.17 + s * 30) * Math.sin(t * 0.11 + s * 7); A.hr = 0.03 * w;
  for (let k = 0; k < 2; k++) {
    A.shP[k] = 0.04 + 0.03 * Math.sin(t * 0.6 + s * 5 + k * 2); A.shR[k] = 0.1; A.shW[k] = 0; A.el[k] = 0.18 + 0.05 * s; A.wr[k] = 0;
    A.hiP[k] = 0.01; A.hiR[k] = 0.035 + (k === 0 ? -A.pr : A.pr);
    A.kn[k] = 0.03 + 0.1 * Math.max(0, k === 0 ? w : -w); A.an[k] = A.kn[k] - A.hiP[k];
  }
  if (pose === 'walk' || pose === 'run') {
    const run = pose === 'run';
    A.pr *= 1 - g; A.sr *= 1 - g; A.hw *= 1 - g; A.hr *= 1 - g;
    A.pw = -(run ? 0.1 : 0.07) * Math.sin(ph) * g; A.sw = (run ? 0.16 : 0.1) * Math.sin(ph) * g;
    A.sp = mix(A.sp, run ? 0.2 : 0.045, g); A.hp = mix(A.hp, run ? -0.1 : 0.02, g);
    for (let k = 0; k < 2; k++) {
      const p = ph + k * PI, sn = Math.sin(p);
      if (run) {
        A.hiP[k] = mix(A.hiP[k], 0.3 + 0.62 * sn, g);
        A.kn[k] = mix(A.kn[k], 0.3 + 1.55 * Math.pow(Math.max(0, Math.cos(p + 0.25)), 1.5), g);
        A.shP[k] = mix(A.shP[k], -0.6 * sn + 0.1, g); A.el[k] = mix(A.el[k], 1.45, g); A.shR[k] = mix(A.shR[k], 0.16, g);
      } else {
        A.hiP[k] = mix(A.hiP[k], 0.12 + 0.34 * sn, g);
        A.kn[k] = mix(A.kn[k], 0.06 + 0.95 * Math.pow(Math.max(0, Math.cos(p + 0.35)), 2), g);
        A.shP[k] = mix(A.shP[k], -0.32 * sn + 0.04, g); A.el[k] = mix(A.el[k], 0.3 + 0.25 * Math.max(0, -sn), g); A.shR[k] = mix(A.shR[k], 0.09, g);
      }
      A.hiR[k] = mix(A.hiR[k], 0.02, g);
      A.an[k] = A.kn[k] - A.hiP[k] + (run ? 0.3 : 0.22) * sn * g;
    }
  } else if (pose === 'sit') {
    A.mode = 1; A.pr = 0; A.sr = 0; A.pp = -0.08; A.sp = 0.12 + 0.015 * br; A.hp = 0.12 + 0.06 * Math.sin(t * 0.5 + s * 11);
    A.hw = 0.45 * Math.sin(t * 0.21 + s * 17);
    const talk = Math.pow(Math.max(0, Math.sin(t * 1.1 + s * 13)), 6);
    for (let k = 0; k < 2; k++) {
      A.hiP[k] = 1.5 + (k ? 0.05 : -0.05) * (s - 0.5); A.hiR[k] = 0.09 + 0.05 * s;
      A.kn[k] = 1.42 + (k === (s > 0.5 ? 0 : 1) ? 0.22 : 0); A.an[k] = A.kn[k] - A.hiP[k] + A.pp;
      A.shP[k] = 0.62 + (k ? talk * 0.25 : 0); A.shR[k] = 0.12; A.el[k] = 0.98 + (k ? talk * 0.45 : 0); A.shW[k] = (k ? -1 : 1) * 0.15;
    }
  } else if (pose === 'work') { // tezgâh başında: önkollar önde, eller çalışır
    const a = Math.sin(t * 2.3 + s * 9), b = Math.sin(t * 3.1 + s * 5);
    A.sp = 0.12; A.hp = 0.38 + 0.05 * a; A.hw *= 0.3;
    for (let k = 0; k < 2; k++) { A.shP[k] = 0.5 + 0.12 * (k ? a : b); A.shR[k] = 0.14; A.el[k] = 1.2 + 0.18 * (k ? b : a); A.shW[k] = (k ? -1 : 1) * 0.25; }
  } else if (pose === 'kneel') {
    A.pr = 0; A.sr = 0; A.pp = 0.05; A.sp = 0.22; A.hp = 0.28;
    for (let k = 0; k < 2; k++) { A.hiP[k] = 0.05; A.hiR[k] = 0.1; A.kn[k] = 1.58; A.an[k] = -1.15; A.shP[k] = 0.55; A.shR[k] = 0.08; A.el[k] = 0.35; }
  } else if (pose === 'crouch') {
    A.pr = 0; A.sr = 0; A.pp = 0.2; A.sp = 0.42; A.np = -0.25; A.hp = -0.15;
    for (let k = 0; k < 2; k++) { A.hiP[k] = 1.95; A.hiR[k] = 0.24; A.kn[k] = 2.3; A.an[k] = 2.3 - 1.95 - 0.2 - A.pp; A.shP[k] = 0.9; A.shR[k] = 0.1; A.el[k] = 0.9; }
  } else if (pose === 'lie') {
    A.mode = 2; A.pr = 0; A.sr = 0; A.pp = 0; A.sp = -0.02; A.np = -0.2; A.hp = -0.05; A.hw = 0.25 * Math.sin(s * 30);
    for (let k = 0; k < 2; k++) { A.hiP[k] = 0.03; A.hiR[k] = 0.07; A.kn[k] = 0.06; A.an[k] = -0.35; A.shP[k] = 0.02; A.shR[k] = 0.2; A.el[k] = 0.12; }
  }
  return A;
}

// ---------------------------------------------------------------- İleri kinematik (gövde uzayı, boy 1,75)
const _e = new THREE.Euler(), _r = new THREE.Matrix4(), _t = new THREE.Matrix4();
function rot(m, x, y, z, order = 'XYZ') { _e.set(x, y, z, order); return m.multiply(_r.makeRotationFromEuler(_e)); }
function tr(m, x, y, z) { const e = m.elements; e[12] += e[0] * x + e[4] * y + e[8] * z; e[13] += e[1] * x + e[5] * y + e[9] * z; e[14] += e[2] * x + e[6] * y + e[10] * z; return m; }
const yAt = (m, x, y, z) => { const e = m.elements; return e[1] * x + e[5] * y + e[9] * z + e[13]; };
/** Kemik matrislerini doldurur (gövde uzayında, zemine oturtulmuş). sw: omuz genişliği, sex, seat: oturak yüksekliği/hs */
function solve(A, sw, sex, seatH, M) {
  const P = M[0];
  if (A.mode === 1) P.makeTranslation(0, seatH + 0.1, -0.07);
  else if (A.mode === 2) { P.makeTranslation(0, 0.118, 0); rot(P, -PI / 2, 0, 0); }
  else P.makeTranslation(0, B.pelvisY, 0);
  rot(P, A.pp, A.pw, A.pr, 'YXZ');
  // gövde: bel pivotu
  M[1].copy(P); tr(M[1], 0, 0.1, 0); rot(M[1], A.sp, A.sw, A.sr, 'YXZ'); tr(M[1], 0, -0.1, 0);
  M[2].copy(M[1]); tr(M[2], 0, B.neckY, B.neckZ); rot(M[2], A.np, A.hw * 0.4, 0);
  M[3].copy(M[2]); tr(M[3], 0, B.headY, 0.004); rot(M[3], A.hp, A.hw * 0.6, A.hr, 'YXZ');
  const shx = (sex ? B.shX.f : B.shX.m) * sw;
  for (let k = 0; k < 2; k++) {
    const sg = k ? -1 : 1, o = k * 3;
    const S = M[4 + o].copy(M[1]); tr(S, sg * shx, B.shY, -0.008); rot(S, -A.shP[k], sg * A.shW[k], sg * A.shR[k], 'YXZ');
    const E = M[5 + o].copy(S); tr(E, 0, -B.upper, 0); rot(E, -A.el[k], 0, 0);
    const W = M[6 + o].copy(E); tr(W, 0, -B.fore, 0); rot(W, A.wr[k], sg * 0.15, 0);
    const H = M[10 + o].copy(P); tr(H, sg * B.hipX * (sex ? 1.06 : 1), B.hipY, 0); rot(H, -A.hiP[k], 0, sg * A.hiR[k], 'YXZ');
    const K = M[11 + o].copy(H); tr(K, 0, -B.thigh, 0); rot(K, A.kn[k], 0, 0);
    const F = M[12 + o].copy(K); tr(F, 0, -B.shin, 0); rot(F, -A.an[k], sg * 0.12, 0);
  }
  if (A.mode === 0) { // en alçak nokta (topuk, burun, diz) zemine
    let mn = 9;
    for (let f = 12; f <= 15; f += 3) mn = Math.min(mn, yAt(M[f], 0, -0.088, -0.06), yAt(M[f], 0, -0.086, 0.19), M[f - 1].elements[13] - 0.058);
    for (let i = 0; i < NB; i++) M[i].elements[13] -= mn;
  }
}

// ---------------------------------------------------------------- Uzak kademe geometrisi (poz başına pişirilmiş)
const FAR_POSES = { stand: 'stand', walk: 'stand', run: 'stand', work: 'stand', sit: 'sit', kneel: 'kneel', lie: 'lie', crouch: 'crouch' };
const FAR_KEYS = ['stand', 'sit', 'kneel', 'lie', 'crouch'];
let FARGEO = null;
function farGeos() {
  if (FARGEO) return FARGEO;
  const M = Array.from({ length: NB }, () => new THREE.Matrix4()), A = newAngles();
  const use = { pelvis: 'm', torso: 'm', head: 'h', sleeveL: 'long', sleeveR: 'long', farmL: 'cloth', farmR: 'cloth', handL: 'h', handR: 'h', thighL: 'm', thighR: 'm', shinL: 'p', shinR: 'p', footL: 's', footR: 's' };
  FARGEO = {};
  for (const pose of FAR_KEYS) {
    poseAngles(A, pose, 0, 0, 0, 0.5);
    if (pose === 'stand') for (let k = 0; k < 2; k++) { A.hiR[k] = 0.035; A.kn[k] = 0.04; A.an[k] = 0.03; }
    A.hw = 0; A.pr = 0; A.sr = 0;
    solve(A, 1, 0, 0.46, M);
    const list = [];
    for (const p of PARTS) {
      const v = use[p.k]; if (!v) continue;
      const g = geo('far', p.g, v).clone();
      g.applyMatrix4(M[p.bone]);
      const n = g.attributes.position.count, rb = new Float32Array(n * 2);
      const pos = geo('far', p.g, v).attributes.position;
      for (let i = 0; i < n; i++) {
        let reg = p.reg;
        if (p.k === 'head') { // saç bölgesi başın kendisinde (ayrı saç kabuğu yok)
          const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), f = (z - 0.01) / (Math.hypot(x, z - 0.01) || 1);
          if (y > (f < 0.25 ? -0.02 + 0.11 * sst(-0.65, 0.25, f) : 0.09 + 0.05 * sst(0.25, 0.85, f))) reg = 3;
        }
        rb[i * 2] = reg; rb[i * 2 + 1] = pose === 'stand' ? p.lb || 0 : 0;
      }
      g.setAttribute('aRB', new THREE.BufferAttribute(rb, 2));
      list.push(g.index ? g.toNonIndexed() : g);
    }
    FARGEO[pose] = BufferGeometryUtils.mergeGeometries(list);
  }
  return FARGEO;
}

// ---------------------------------------------------------------- Kalabalık
const tmpC = new THREE.Color();
const FARCI = [0, 1, 2, 4, 3]; // bölge → renk anahtarı (ten, üst, alt, saç, ayakkabı)
function toXZ(a) { return Array.isArray(a) ? a : [a.x0, a.z0, a.x1, a.z1]; }
function weighted(r, w, list) {
  if (!w) return list[0];
  if (Array.isArray(w)) return w[Math.floor(r() * w.length) % w.length];
  const ks = Object.keys(w), tot = ks.reduce((s, k) => s + w[k], 0); let x = r() * tot;
  for (const k of ks) { x -= w[k]; if (x <= 0) return k; }
  return ks[ks.length - 1];
}

/**
 * n kişilik kalabalık. o = { seed, rect: [x0,z0,x1,z1] | {x0,x1,z0,z1}, ring: [cx,cz,r0,r1], pts: [[x,z]|[x,y,z]],
 *   poses: ['stand','walk'] | { stand: 0.7, walk: 0.3 }, outfits: [...] | {...}, camera (Camera | [x,y,z]),
 *   lod: ayrıntı mesafesi m (LOW 14, masaüstü 30), seat: oturak yüksekliği (0,46), person: makePerson seçenekleri,
 *   shadows: true, quality: 'hi'|'lo' }
 * Döner: { group, count, set(i,x,y,z,yaw,pose?), pose(i,p,seat?), dress(i,o), tint(i,hex|null,k?), hide(i), show(i),
 *   speed(i, m/s), update(t), info(i), stats() }
 */
export function crowd(n, o = {}) {
  const r = seeded(o.seed ?? 7);
  const Mt = materials();
  const q = o.quality || (LOWQ ? 'lo' : 'hi');
  const lod = o.lod ?? (LOWQ ? 14 : 30), lod2 = lod * lod;
  const group = new THREE.Group(); group.name = 'crowd';
  const shadows = o.shadows !== false;
  const mk = (geo, material, cap) => {
    const im = new THREE.InstancedMesh(geo, material, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0; im.visible = false; im.frustumCulled = false; im.castShadow = shadows; im.receiveShadow = true; im.userData.noFit = true;
    group.add(im); return im;
  };
  // Parça × varyant örnek ağları (ilk kullanımda kurulur; sığa = n, her kare sıkıştırılarak doldurulur)
  const MESH = PARTS.map((p, pi) => VARIANTS[pi].map(() => null));
  const LIVE = [];
  const partMesh = (pi, vi) => {
    const p = PARTS[pi], v = VARIANTS[pi][vi];
    const slot = typeof p.slot === 'object' ? p.slot[v] : p.slot;
    const im = mk(geo(q, p.g, v), Mt[slot], n);
    im.setColorAt(0, tmpC.set(1, 1, 1));
    im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    im.userData.col = CK[typeof p.col === 'object' ? p.col[v] : p.col];
    im.userData.c = 0;
    LIVE.push(im);
    return (MESH[pi][vi] = im);
  };
  const FG = farGeos();
  const FAR = {};
  for (const k of FAR_KEYS) {
    const geo = FG[k].clone();
    const at = {};
    for (const nm of ['iC0', 'iC1', 'iC2', 'iC3', 'iC4', 'iC5']) { at[nm] = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); at[nm].setUsage(THREE.DynamicDrawUsage); geo.setAttribute(nm, at[nm]); }
    at.iAnim = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2); at.iAnim.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('iAnim', at.iAnim);
    at.list = ['iC0', 'iC1', 'iC2', 'iC3', 'iC4', 'iC5'].map((k) => at[k]);
    const im = mk(geo, Mt.far, n); im.userData.at = at; im.userData.c = 0;
    FAR[k] = im;
  }
  // Kişi durumu
  const S = new Array(n), P = new Float32Array(n * 4), L = new Float32Array(n * 2), PH = new Float32Array(n), V = new Float32Array(n), GA = new Float32Array(n);
  const PO = new Array(n), SEAT = new Float32Array(n).fill(o.seat ?? 0.46), VIS = new Uint8Array(n), SEED = new Float32Array(n), NOM = new Float32Array(n).fill(o.speed ?? 0);
  const TINT = new Float32Array(n * 4);
  const base = o.person || {};
  for (let i = 0; i < n; i++) {
    const outfit = base.outfit || weighted(r, o.outfits, ['casual']);
    S[i] = makeSpec({ ...base, outfit }, r);
    PO[i] = weighted(r, o.poses, ['stand']);
    SEED[i] = r(); PH[i] = r() * PI * 2;
  }
  // Başlangıç yerleşimi
  const place = (i, x, y, z, yaw) => { P[i * 4] = x; P[i * 4 + 1] = y; P[i * 4 + 2] = z; P[i * 4 + 3] = yaw; L[i * 2] = x; L[i * 2 + 1] = z; VIS[i] = 1; };
  if (o.rect) { const [x0, z0, x1, z1] = toXZ(o.rect); for (let i = 0; i < n; i++) place(i, x0 + r() * (x1 - x0), 0, z0 + r() * (z1 - z0), r() * PI * 2); }
  else if (o.ring) { const [cx, cz, r0, r1] = o.ring; for (let i = 0; i < n; i++) { const a = r() * PI * 2, d = Math.sqrt(r0 * r0 + r() * (r1 * r1 - r0 * r0)); place(i, cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d, Math.atan2(cx - (cx + Math.cos(a) * d), cz - (cz + Math.sin(a) * d)) + (r() - 0.5) * 0.8); } }
  else if (o.pts) o.pts.forEach((p, i) => { if (i < n) place(i, p[0], p.length > 2 ? p[1] : 0, p.length > 2 ? p[2] : p[1], p[3] ?? r() * PI * 2); });

  const A = newAngles(), BM = Array.from({ length: NB }, () => new THREE.Matrix4());
  const root = new THREE.Matrix4(), m = new THREE.Matrix4(), sc = new THREE.Vector3(), cam = new THREE.Vector3(), inv = new THREE.Matrix4();
  let lastT = null, nNear = 0, nFar = 0;
  const writeCol = (arr, k, sp, ci, i) => {
    const c = sp.col; let a = c[ci * 3], b = c[ci * 3 + 1], d = c[ci * 3 + 2];
    if (ci === 1 && TINT[i * 4 + 3] > 0) { const t = TINT[i * 4 + 3]; a = mix(a, TINT[i * 4], t); b = mix(b, TINT[i * 4 + 1], t); d = mix(d, TINT[i * 4 + 2], t); }
    arr[k * 3] = a; arr[k * 3 + 1] = b; arr[k * 3 + 2] = d;
  };
  const api = {
    group, count: n, poses: POSES, materials: Object.values(Mt),
    /** Konum (grup uzayı, y = zemin), yaw (0 → +z'ye bakar), isteğe bağlı poz */
    set(i, x, y, z, yaw, pose) {
      if (!VIS[i]) { L[i * 2] = x; L[i * 2 + 1] = z; }
      P[i * 4] = x; P[i * 4 + 1] = y; P[i * 4 + 2] = z; P[i * 4 + 3] = yaw; VIS[i] = 1;
      if (pose) PO[i] = pose;
    },
    pose(i, p, seat) { if (p) PO[i] = p; if (seat != null) SEAT[i] = seat; },
    getPose: (i) => PO[i],
    /** Kıyafet/görünüm değiştir (makePerson seçenekleri) */
    dress(i, opts = {}) { S[i] = makeSpec({ ...base, ...opts }, seeded(opts.seed ?? (i * 7919 + 13))); },
    /** Üst giysiyi bir renge boya (k: 0–1 karışım); null → kaldır */
    tint(i, hex, k = 1) { if (hex == null) { TINT[i * 4 + 3] = 0; return; } tmpC.set(hex); TINT[i * 4] = tmpC.r; TINT[i * 4 + 1] = tmpC.g; TINT[i * 4 + 2] = tmpC.b; TINT[i * 4 + 3] = k; },
    hide(i) { VIS[i] = 0; }, show(i) { VIS[i] = 1; }, visible: (i) => !!VIS[i],
    /** Yerinde yürüme hızı (m/s): konum değişmezken de yürüme/koşu döngüsü */
    speed(i, v) { NOM[i] = v; },
    info(i) { const s = S[i]; return { height: s.height, outfit: s.outfit, sex: s.sex ? 'f' : 'm', pose: PO[i], hair: s.hairStyle }; },
    stats: () => ({ near: nNear, far: nFar, draws: group.children.filter((c) => c.visible).length }),
    /** Her kare: t saniye. Yürüme fazı gerçek yer değiştirmeden (ayak kaymaz), LOD kameradan. */
    update(t = performance.now() / 1000) {
      const dt = lastT == null ? 0 : Math.min(0.25, Math.max(0, t - lastT)); lastT = t;
      let hasCam = false;
      if (o.camera) {
        if (o.camera.isObject3D) o.camera.getWorldPosition(cam); else cam.fromArray(o.camera);
        group.updateWorldMatrix(true, false); inv.copy(group.matrixWorld).invert(); cam.applyMatrix4(inv); hasCam = true;
      }
      for (const im of LIVE) im.userData.c = 0;
      for (const k of FAR_KEYS) FAR[k].userData.c = 0;
      nNear = nFar = 0;
      for (let i = 0; i < n; i++) {
        if (!VIS[i]) continue;
        const x = P[i * 4], y = P[i * 4 + 1], z = P[i * 4 + 2], yaw = P[i * 4 + 3], sp = S[i], pose = PO[i];
        // yürüme: yer değiştirme → faz; hız yumuşatılır
        let d = Math.hypot(x - L[i * 2], z - L[i * 2 + 1]); L[i * 2] = x; L[i * 2 + 1] = z;
        if (d > 2) d = 0;
        const moving = pose === 'walk' || pose === 'run';
        let v = dt > 0 ? d / dt : 0;
        if (moving && d < 1e-5 && NOM[i] > 0) { v = NOM[i]; d = v * dt; }
        V[i] = mix(V[i], v, 1 - Math.exp(-dt * 8));
        const run = pose === 'run';
        const gTarget = moving ? Math.min(1, V[i] / (run ? 2.0 : 0.9)) : 0;
        GA[i] = mix(GA[i], gTarget, 1 - Math.exp(-dt * 6));
        const stride = (run ? 2.3 : 1.45) * sp.hs * Math.max(0.45, GA[i]);
        PH[i] += (d / stride) * PI * 2;
        const far = hasCam && ((x - cam.x) ** 2 + (y - cam.y) ** 2 + (z - cam.z) ** 2) > lod2;
        const hs = sp.hs;
        if (far) {
          const fk = FAR_POSES[pose] || 'stand', im = FAR[fk], k = im.userData.c++, at = im.userData.at;
          const lift = fk === 'sit' ? (SEAT[i] - 0.46) : 0;
          root.makeRotationY(yaw).scale(sc.set(hs, hs, hs)); root.setPosition(x, y + lift, z);
          root.toArray(im.instanceMatrix.array, k * 16);
          const c = sp.col;
          for (let j = 0; j < 6; j++) writeCol(at.list[j].array, k, sp, j === 5 ? sp.fore : FARCI[j], i);
          at.iAnim.array[k * 2] = PH[i]; at.iAnim.array[k * 2 + 1] = fk === 'stand' ? GA[i] * (run ? 0.62 : 0.36) : 0;
          nFar++;
          continue;
        }
        nNear++;
        poseAngles(A, pose, PH[i], GA[i], t, SEED[i]);
        solve(A, sp.sw, sp.sex, SEAT[i] / hs, BM);
        root.makeRotationY(yaw).scale(sc.set(hs, hs, hs)); root.setPosition(x, y, z);
        const b = sp.build, tw = b * sp.sw, lb = Math.sqrt(b);
        for (let pi = 0; pi < NP; pi++) {
          const vi = sp.V[pi]; if (vi === 255) continue;
          const part = PARTS[pi], im = MESH[pi][vi] || partMesh(pi, vi), k = im.userData.c++;
          m.multiplyMatrices(root, BM[part.bone]);
          if (part.w === 't') m.scale(sc.set(tw, 1, b));
          else if (part.w === 'l') m.scale(sc.set(lb, 1, lb));
          else if (part.w === 'n') m.scale(sc.set(Math.sqrt(lb), 1, Math.sqrt(lb)));
          m.toArray(im.instanceMatrix.array, k * 16);
          writeCol(im.instanceColor.array, k, sp, im.userData.col, i);
        }
      }
      for (const im of LIVE) {
        im.count = im.userData.c; im.visible = im.count > 0;
        if (im.visible) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
      }
      for (const k of FAR_KEYS) {
        const im = FAR[k]; im.count = im.userData.c; im.visible = im.count > 0;
        if (im.visible) { im.instanceMatrix.needsUpdate = true; for (const a of im.userData.at.list) a.needsUpdate = true; im.userData.at.iAnim.needsUpdate = true; }
      }
    },
    dispose() { group.traverse((c) => { if (c.isInstancedMesh) c.dispose(); }); for (const k of FAR_KEYS) FAR[k].geometry.dispose(); },
  };
  api.update(0);
  return api;
}

/**
 * Tek kişi (THREE.Group; orijin ayak tabanı ortası, +z'ye bakar). o = { seed, height 1,6–1,9, build 0,85–1,25, sex 'm'|'f',
 *   pose, outfit, skin (hex), hair (hex | { style: short|crop|long|bun|bald, color }), colors: { top, bottom, shoe, acc, hat },
 *   apron, pack, hat: 'toque'|'hard', sleeves: 'short'|'long', seat (oturma yüksekliği), speed (yerinde yürüme m/s) }
 * Grup üstünde: person.setPose(p, seat?), person.update(t), person.dress(o), person.crowd
 */
export function makePerson(o = {}) {
  const c = crowd(1, { seed: o.seed ?? 1, person: o, poses: [o.pose || 'stand'], quality: o.quality, seat: o.seat, speed: o.speed ?? (o.pose === 'walk' ? 1.3 : o.pose === 'run' ? 3.2 : 0), shadows: o.shadows });
  c.set(0, 0, 0, 0, 0);
  c.update(0);
  const g = c.group; g.name = 'person';
  g.crowd = c;
  g.setPose = (p, seat) => { c.pose(0, p, seat); c.update(); };
  g.update = (t) => c.update(t);
  g.dress = (opts) => { c.dress(0, { ...o, ...opts }); c.update(); };
  return g;
}
