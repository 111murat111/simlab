// Restoran iç mekânı için yerel malzeme ve biçimler: ahşap döşeme, seramik karo, karton koli, bistro sandalye, masa, insan.
import { THREE, procedural, BufferGeometryUtils } from '@core';

const V2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y));

/** Ahşap döşeme: x boyunca uzanan tahtalar (genişlik w, boy L), her tahta ayrı ton + lif */
export const plankFloor = ({ color = 0x8a5f3c, w = 0.18, L = 1.6 } = {}) => procedural({
  key: 'plankfloor', physical: true, scale: 1, bump: 0.01,
  params: { color, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3 },
  uniforms: { uW: { value: w }, uL: { value: L } },
  pattern: `
    float row = floor(p.z/uW);
    float off = h13(vec3(row, 1.0, 2.0))*uL;
    float col_ = floor((p.x + off)/uL);
    vec2 f = vec2(fract((p.x + off)/uL), fract(p.z/uW));
    float fw = length(fwidth(p.xz))/uW;
    float j = smoothstep(0.0, 0.03 + fw, f.y)*smoothstep(0.0, 0.03 + fw, 1.0 - f.y)*smoothstep(0.0, 0.004 + fw*0.1, f.x)*smoothstep(0.0, 0.004 + fw*0.1, 1.0 - f.x);
    j = mix(1.0, j, 1.0 - smoothstep(0.3, 0.8, fw));
    float id = h13(vec3(row, col_, 7.0));
    float grain = vn3(vec3(p.x*6.0, p.y, p.z*90.0 + id*20.0))*0.6 + vn3(vec3(p.x*1.5, p.y, p.z*30.0 + id*9.0))*0.4;
    col *= (0.75 + 0.45*id)*(0.82 + 0.3*grain);
    col = mix(col*0.35, col, j);
    rough = mix(0.8, 0.45 + 0.2*grain, j);
    h = j*0.7 + grain*0.3;`,
});

/** Seramik karo: kare karolar (boyut s), derz; checker = iki tonlu dama */
export const tiles = ({ color = 0xeeeae2, color2 = 0x2b2d31, s = 0.3, checker = 0, brick = 0 } = {}) => procedural({
  key: 'tiles', physical: true, scale: 1, bump: 0.015,
  params: { color, roughness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.15 },
  uniforms: { uS: { value: s }, uC2: { value: new THREE.Color(color2) }, uChk: { value: checker }, uBrick: { value: brick } },
  pattern: `
    vec3 a = axisDominant(pn); vec2 uv = a.x > 0.5 ? p.zy : (a.y > 0.5 ? p.xz : p.xy);
    uv /= vec2(uS, uS*(1.0 - 0.5*uBrick));
    uv.x += uBrick*mod(floor(uv.y), 2.0)*0.5;
    vec2 f = fract(uv), id = floor(uv);
    float fw = length(fwidth(uv));
    float j = smoothstep(0.0, 0.03 + fw, min(f.x, 1.0 - f.x))*smoothstep(0.0, 0.03 + fw, min(f.y, 1.0 - f.y));
    j = mix(1.0, j, 1.0 - smoothstep(0.2, 0.6, fw));
    float chk = uChk*mod(id.x + id.y, 2.0);
    col = mix(col, uC2, chk);
    col *= 0.95 + 0.08*h13(vec3(id, 4.0)) + 0.04*fbm3(p*3.0, 3);
    col = mix(vec3(0.55, 0.53, 0.5)*0.8, col, j);
    rough = mix(0.9, 0.2, j);
    h = j;`,
});

/** Oluklu karton */
export const cardboard = ({ color = 0xb8894f } = {}) => procedural({
  key: 'cardboard', scale: 1, bump: 0.01, params: { color, roughness: 0.92 },
  pattern: `
    float n = fbm3(p*6.0, 4), t = smoothstep(0.02, 0.0, abs(p.x))*step(0.0, pn.y);
    col *= 0.85 + 0.25*n;
    col = mix(col, vec3(0.75, 0.62, 0.42), t*0.8);
    rough = mix(0.92, 0.35, t);
    h = n;`,
});

/** Bistro sandalye (başlangıç zeminde, sırt −z yönünde; oturan +z'ye bakar) */
export function chairGeometry() {
  const parts = [];
  const seat = new THREE.LatheGeometry(V2([[0, 0], [0.2, 0], [0.215, 0.012], [0.215, 0.03], [0.2, 0.04], [0, 0.04]]), 24);
  seat.translate(0, 0.44, 0); parts.push(seat);
  for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
    const l = new THREE.CylinderGeometry(0.012, 0.015, 0.45, 8);
    l.rotateZ(-x * 0.35); l.rotateX(z * 0.35); l.translate(x * 1.05, 0.22, z * 1.05); parts.push(l);
  }
  const ring = new THREE.TorusGeometry(0.16, 0.008, 6, 24); ring.rotateX(Math.PI / 2); ring.translate(0, 0.2, 0); parts.push(ring);
  const back = new THREE.TorusGeometry(0.2, 0.014, 8, 24, Math.PI); back.rotateX(-0.12); back.translate(0, 0.62, -0.18); parts.push(back);
  for (const x of [-0.19, 0.19]) { const s = new THREE.CylinderGeometry(0.013, 0.013, 0.2, 8); s.translate(x, 0.54, -0.19); parts.push(s); }
  const g = BufferGeometryUtils.mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p.toNonIndexed(); }));
  return g;
}

/** Yuvarlak masa: tabla (lathe, pahlı kenar) + döküm ayak */
export function tableParts() {
  const top = new THREE.LatheGeometry(V2([[0, 0.7], [0.68, 0.7], [0.7, 0.71], [0.71, 0.73], [0.7, 0.75], [0.68, 0.76], [0, 0.76]]), 48);
  const base = new THREE.LatheGeometry(V2([[0, 0], [0.34, 0], [0.34, 0.015], [0.22, 0.04], [0.06, 0.1], [0.045, 0.14], [0.045, 0.64], [0.07, 0.66], [0.2, 0.7], [0, 0.7]]), 32);
  return { top, base };
}

/** İnsan üst gövdesi (ayakta, tabanda orijin; boy ≈ 1,72 m, bacaksız ve başsız): gövde, omuz, kollar, eller, boyun */
export function bodyGeometry() {
  const parts = [];
  const torso = new THREE.LatheGeometry(V2([[0, 0.86], [0.15, 0.87], [0.17, 0.95], [0.16, 1.08], [0.18, 1.26], [0.2, 1.36], [0.17, 1.42], [0.08, 1.46], [0.05, 1.47], [0, 1.47]]), 20);
  torso.scale(1, 1, 0.64); parts.push(torso);
  for (const sx of [-1, 1]) {
    const arm = new THREE.CapsuleGeometry(0.05, 0.5, 3, 8); arm.rotateZ(sx * -0.08); arm.translate(sx * 0.225, 1.12, 0.01); parts.push(arm);
  }
  const neck = new THREE.CylinderGeometry(0.048, 0.056, 0.1, 10); neck.translate(0, 1.5, 0); parts.push(neck);
  return BufferGeometryUtils.mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); if (p.index) p = p.toNonIndexed(); return p; }));
}
/** Uyluk (kalçada orijin, aşağı doğru 0,44 m) — iki bacak birlikte */
export function thighGeometry() {
  const parts = [];
  for (const sx of [-1, 1]) { const g = new THREE.CapsuleGeometry(0.075, 0.34, 3, 10); g.translate(sx * 0.095, -0.22, 0); parts.push(g); }
  return BufferGeometryUtils.mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p.toNonIndexed(); }));
}
/** Baldır + ayakkabı (dizde orijin, aşağı 0,46 m) — iki bacak birlikte */
export function shinGeometry() {
  const parts = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.CapsuleGeometry(0.058, 0.36, 3, 10); g.translate(sx * 0.095, -0.21, 0); parts.push(g);
    const shoe = new THREE.CapsuleGeometry(0.045, 0.14, 3, 8); shoe.rotateX(Math.PI / 2); shoe.scale(1.1, 0.7, 1); shoe.translate(sx * 0.095, -0.43, 0.05); parts.push(shoe);
  }
  return BufferGeometryUtils.mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p.toNonIndexed(); }));
}
/** Saç: başın üstünü ve arkasını saran kabuk (baş merkezinde orijin) */
export function hairGeometry() {
  const g = new THREE.SphereGeometry(0.118, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
  g.rotateX(-0.35); g.scale(0.92, 1.08, 1.02); g.translate(0, 0.012, -0.012);
  g.deleteAttribute('uv');
  return g;
}
