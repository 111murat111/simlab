// Beden SDF ilkelleri (yerel yardımcı): eklem noktalarından dikişsiz, anatomik oranlı gövde — arka plandaki eğitim mankeni için.
// (Sahnedeki insanlar motorun @core makePerson figürleridir.)
// Birim metre; ayakta duruş +z'ye bakar, kişinin sağı −x. Poz, eklem noktaları değiştirilerek verilir (diz çökme, uzanma…).
import { THREE } from '@core';
import { sEllipsoid, sCone, sPlane } from './bio.js';

const V = (a) => new THREE.Vector3(...a);
const mirrorX = (p) => [-p[0], p[1], p[2]];

/** Ayakta, kollar hafif açık duruş (eklemler, sağ taraf) */
export const STAND = {
  pelvis: [0, 0.93, 0], neck: [0, 1.45, -0.01], fwd: [0, 0, 1],
  shoulder: [-0.19, 1.405, -0.01], elbow: [-0.262, 1.13, -0.03], wrist: [-0.305, 0.88, 0.0], hand: [-0.322, 0.77, 0.018],
  hip: [-0.085, 0.89, 0], knee: [-0.09, 0.495, 0.012], ankle: [-0.092, 0.08, -0.02], toe: [-0.1, 0.018, 0.15],
};

/** y ekseni dir yönünde, x ekseni side'a olabildiğince yakın dönüş matrisi */
function basis(dir, side = [1, 0, 0]) {
  const y = V(dir).normalize(), x = V(side), z = new THREE.Vector3();
  x.addScaledVector(y, -x.dot(y)); if (x.lengthSq() < 1e-6) x.set(0, 0, 1).addScaledVector(y, -y.z); x.normalize();
  z.crossVectors(x, y).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
}
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add3 = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/**
 * Beden SDF ilkelleri. J: eklemler (sağ taraf; sol taraf ayna ya da J.L ile ayrı verilir). opt: { sex: 'm'|'f', build (0.9–1.2),
 * parts: {head, torso, arms, legs} (false → çıkarılır), floorCut (y altını kes), offset (yüzeyi içe/dışa kaydır, m) }
 */
export function bodyItems(J = STAND, opt = {}) {
  const O = { sex: 'm', build: 1, parts: {}, offset: 0, ...opt };
  const b = O.build, off = O.offset, f = O.sex === 'f';
  const P = J.pelvis, N = J.neck;
  const up = V(N).sub(V(P)), L = up.length(); up.normalize();
  const fw = V(J.fwd || [0, 0, 1]); fw.addScaledVector(up, -fw.dot(up)).normalize();
  const sd = new THREE.Vector3().crossVectors(up, fw).normalize(); // kişinin solu (+x ayakta)
  const TM = new THREE.Matrix4().makeBasis(sd, up, fw);
  const k = L / 0.52;
  // Gövde yerel (ayakta referans yüksekliği y) → dünya
  const T = (x, y, z) => { const v = V(P).addScaledVector(sd, x).addScaledVector(up, (y - 0.93) * k).addScaledVector(fw, z); return [v.x, v.y, v.z]; };
  const E = (c, r, extra = null) => sEllipsoid(T(...c), r.map((v) => v + off), extra ? extra.clone().premultiply(TM) : TM);
  const items = [];
  const S = (x) => [x, -x];
  if (O.parts.torso !== false) {
    const tor = [
      E([0, 0.935, -0.005], [0.158 * b, 0.1, 0.1 * b]),                       // leğen
      ...S(0.072).map((x) => E([x, 0.87, -0.05], [0.082 * b, 0.092, 0.075 * b])), // kalça
      E([0, 1.04, 0.014], [0.135 * b, 0.12, 0.092 * b + (f ? 0 : 0.004)]),    // karın
      E([0, 1.13, -0.002], [f ? 0.118 : 0.128 * b, 0.1, 0.086 * b]),          // bel
      E([0, 1.255, 0.0], [0.15 * b, 0.145, 0.102 * b]),                       // göğüs kafesi
      E([0, 1.355, -0.008], [0.168 * b, 0.095, 0.095 * b]),                   // üst göğüs
      ...S(0.07).map((x) => (f ? E([x, 1.285, 0.07], [0.068, 0.068, 0.06]) : E([x, 1.315, 0.058], [0.078 * b, 0.058, 0.042]))), // göğüs
      ...S(0.075).map((x) => E([x, 1.325, -0.058], [0.078 * b, 0.1, 0.048])), // kürek bölgesi
      E([0, 1.12, -0.07], [0.06, 0.16, 0.03]),                                 // sırt kasları (omurga iki yanı)
    ];
    items.push({ p: tor, k: 0.05, tag: 'torso' });
    const yoke = S(1).map((s) => sCone(T(0.045 * s, 1.448, -0.018), T(0.165 * s * b, 1.418, -0.012), 0.052 + off, 0.05 + off));
    items.push({ p: yoke, k: 0.04, tag: 'torso' });
  }
  if (O.parts.head !== false) {
    const nb = T(0, 1.43, -0.012), nt = add3(T(0, 1.43, -0.012), [up.x, up.y, up.z], 0.13 * k);
    items.push({ p: [sCone(nb, nt, 0.058 + off, 0.05 + off)], k: 0.035, tag: 'neck' });
    // baş: boyun ucundan yukarı, gövde eksenine göre
    const H = (y, z, x = 0) => { const v = V(nt).addScaledVector(sd, x).addScaledVector(up, y).addScaledVector(fw, z); return [v.x, v.y, v.z]; };
    const HE = (c, r, rot = null) => sEllipsoid(H(...c), r.map((v) => v + off), rot ? new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot)).premultiply(TM) : TM);
    items.push({ p: [
      HE([0.1, -0.012], [0.077, 0.098, 0.097]),       // kafatası
      HE([0.045, 0.03], [0.064, 0.078, 0.07]),        // yüz
      HE([0.0, 0.035], [0.052, 0.04, 0.055]),         // çene
      HE([-0.012, 0.066], [0.024, 0.02, 0.02]),       // çene ucu
      HE([0.08, 0.072], [0.058, 0.016, 0.022]),       // kaş kemeri
      ...[-1, 1].map((s) => HE([0.042, 0.066, 0.036 * s], [0.02, 0.016, 0.018])), // elmacık
    ], k: 0.022, tag: 'head' });
    items.push({ p: [sCone(H(0.07, 0.093), H(0.036, 0.112), 0.009 + off, 0.013 + off), HE([0.034, 0.103], [0.017, 0.011, 0.01])], k: 0.012, tag: 'head' }); // burun
    items.push({ p: [-1, 1].map((s) => HE([0.058, -0.004, 0.077 * s], [0.011, 0.03, 0.02], [0, 0, 0])), k: 0.01, tag: 'head' }); // kulak
    items.push({ p: [-1, 1].map((s) => HE([0.066, 0.079, 0.031 * s], [0.017, 0.012, 0.012])), k: 0.012, op: 'sub' }); // göz çukuru
    items.push({ p: [HE([0.012, 0.086], [0.02, 0.0035, 0.01])], k: 0.006, op: 'sub' }); // ağız çizgisi
  }
  const limbs = (side) => {
    const m = side > 0 ? (J.L ? (p) => p : mirrorX) : (p) => p;
    const j = side > 0 && J.L ? J.L : J;
    const g = (n) => m(j[n]);
    const out = [];
    if (O.parts.arms !== false) {
      const s = g('shoulder'), e = g('elbow'), w = g('wrist'), h = g('hand');
      const ua = V(e).sub(V(s)).normalize(), fa = V(w).sub(V(e)).normalize();
      const sideV = [side * sd.x, side * sd.y, side * sd.z];
      out.push({ p: [
        sEllipsoid(lerp3(s, e, 0.08), [0.05 + off, 0.075 + off, 0.056 + off], basis([ua.x, ua.y, ua.z], sideV)), // omuz (deltoid)
        sCone(s, e, 0.044 * b + off, 0.034 * b + off),
        sEllipsoid(add3(lerp3(s, e, 0.5), [fw.x, fw.y, fw.z], 0.012), [0.032 + off, 0.075 + off, 0.035 + off], basis([ua.x, ua.y, ua.z], sideV)),
      ], k: 0.03, tag: 'uarm' });
      out.push({ p: [
        sCone(e, w, 0.036 * b + off, 0.024 * b + off),
        sEllipsoid(lerp3(e, w, 0.28), [0.038 + off, 0.07 + off, 0.034 + off], basis([fa.x, fa.y, fa.z], sideV)),
      ], k: 0.03, tag: 'farm' });
      // El: avuç (yassı elipsoit) + parmaklar + başparmak
      const hd = V(h).sub(V(w)).normalize(), pn = V(J.palm ? (side > 0 ? mirrorX(J.palm) : J.palm) : [side * -1, 0, 0]);
      const HB = basis([hd.x, hd.y, hd.z], [pn.x, pn.y, pn.z]);
      const hx = new THREE.Vector3().setFromMatrixColumn(HB, 0), hz = new THREE.Vector3().setFromMatrixColumn(HB, 2);
      const palmC = add3(w, [hd.x, hd.y, hd.z], 0.045);
      const knuck = add3(w, [hd.x, hd.y, hd.z], 0.088);
      const fingers = [[-0.024, 0.07], [-0.008, 0.082], [0.008, 0.078], [0.023, 0.064]].map(([o, l], i) => {
        const base = add3(knuck, [hz.x, hz.y, hz.z], o * side);
        const mid = add3(add3(base, [hd.x, hd.y, hd.z], l * 0.55), [hx.x, hx.y, hx.z], 0.006);
        const tip = add3(add3(base, [hd.x, hd.y, hd.z], l), [hx.x, hx.y, hx.z], 0.016);
        return [sCone(base, mid, 0.0095 + off, 0.0085 + off), sCone(mid, tip, 0.0085 + off, 0.007 + off)];
      }).flat();
      const tb = add3(w, [hz.x, hz.y, hz.z], -0.022 * side), tt = add3(add3(tb, [hd.x, hd.y, hd.z], 0.07), [hz.x, hz.y, hz.z], -0.02 * side);
      out.push({ p: [sEllipsoid(palmC, [0.014 + off, 0.05 + off, 0.04 + off], HB), sCone(w, palmC, 0.024 + off, 0.02 + off)], k: 0.018, tag: 'hand' });
      out.push({ p: [...fingers, sCone(tb, add3(tt, [hx.x, hx.y, hx.z], 0.012), 0.012 + off, 0.008 + off)], k: 0.007, tag: 'hand' });
    }
    if (O.parts.legs !== false) {
      const hp = g('hip'), kn = g('knee'), an = g('ankle'), to = g('toe');
      const th = V(kn).sub(V(hp)).normalize(), sh = V(an).sub(V(kn)).normalize();
      const sideV = [side * sd.x, side * sd.y, side * sd.z];
      const knFw = new THREE.Vector3().crossVectors(V(sideV), sh).normalize().multiplyScalar(-side); // dizin önü
      out.push({ p: [
        sCone(hp, kn, 0.082 * b + off, 0.05 * b + off),
        sEllipsoid(add3(lerp3(hp, kn, 0.42), [knFw.x, knFw.y, knFw.z], 0.018), [0.064 * b + off, 0.16 + off, 0.058 * b + off], basis([th.x, th.y, th.z], sideV)),
        sEllipsoid(add3(kn, [knFw.x, knFw.y, knFw.z], 0.035), [0.03 + off, 0.034 + off, 0.02 + off], basis([th.x, th.y, th.z], sideV)), // diz kapağı
      ], k: 0.04, tag: 'thigh' });
      out.push({ p: [
        sCone(kn, an, 0.05 * b + off, 0.03 + off),
        sEllipsoid(add3(lerp3(kn, an, 0.28), [knFw.x, knFw.y, knFw.z], -0.022), [0.046 * b + off, 0.1 + off, 0.045 * b + off], basis([sh.x, sh.y, sh.z], sideV)), // baldır
      ], k: 0.04, tag: 'shin' });
      const fd = V(to).sub(V(an)).normalize();
      const heel = add3(an, [sh.x, sh.y, sh.z], 0.035), heelB = add3(heel, [fd.x, fd.y, fd.z], -0.035);
      out.push({ p: [
        sEllipsoid(heelB, [0.03 + off, 0.034 + off, 0.036 + off]),
        sCone(add3(an, [sh.x, sh.y, sh.z], 0.02), to, 0.034 + off, 0.02 + off),
        sEllipsoid(add3(lerp3(an, to, 0.62), [sh.x, sh.y, sh.z], 0.035), [0.042 + off, 0.024 + off, 0.07 + off], basis([sh.x, sh.y, sh.z], sideV)),
      ], k: 0.025, tag: 'foot' });
    }
    return out;
  };
  items.push(...limbs(-1), ...limbs(1));
  if (O.floorCut != null) items.push({ p: [sPlane([0, -1, 0], -O.floorCut)], k: 0.004, op: 'cut' });
  return items;
}
