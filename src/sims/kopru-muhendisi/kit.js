// Araç kiti: gerçek ölçekli kamyon ve otomobil (yuvarlatılmış gövde, koyu yansıtıcı cam, lastik + jant, farlar). +x = ileri.
import { THREE, mat, RoundedBoxGeometry } from '@core';

let M = null;
function mats() {
  if (M) return M;
  M = {
    rubber: mat.rubber({ color: 0x1b1c1e }),
    rim: mat.brushedMetal({ color: 0xc3c7cc, rough: 0.28 }),
    dark: mat.paintedMetal({ color: 0x1f2226, wear: 0.15 }),
    chrome: mat.brushedMetal({ color: 0xe2e5e8, rough: 0.12 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1116, roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4 }),
    head: mat.glow({ color: 0xfff2d8, intensity: 2.2 }),
    tail: mat.glow({ color: 0xff2a1a, intensity: 1.6 }),
    plastic: mat.plastic({ color: 0x2a2c2f, gloss: 0.2 }),
  };
  return M;
}
export const vehicleMats = mats;

/** Tekerlek (yarıçap r, genişlik w): lastik profili + jant + göbek; eksen z. */
export function wheelGeo(r = 0.5, w = 0.35) {
  const p = [], ri = r * 0.62;
  const prof = [[ri, -w / 2], [r * 0.9, -w / 2], [r * 0.98, -w * 0.42], [r, -w * 0.3], [r, w * 0.3], [r * 0.98, w * 0.42], [r * 0.9, w / 2], [ri, w / 2]];
  for (const [a, b] of prof) p.push(new THREE.Vector2(a, b));
  const tyre = new THREE.LatheGeometry(p, 28).rotateX(Math.PI / 2);
  const rp = [[0.001, w * 0.36], [ri * 0.35, w * 0.4], [ri * 0.5, w * 0.3], [ri * 0.92, w * 0.34], [ri, w * 0.44], [ri, -w * 0.44], [0.001, -w * 0.3]].map(([a, b]) => new THREE.Vector2(a, b));
  const rim = new THREE.LatheGeometry(rp, 24).rotateX(Math.PI / 2);
  return { tyre, rim };
}
// Dış grup z ekseninde döner (yuvarlanma); flip: jant yüzü −z tarafına
export function wheel(r, w, flip = false) {
  const m = mats(), g = new THREE.Group(), geo = wheelGeo(r, w);
  const a = new THREE.Mesh(geo.tyre, m.rubber), b = new THREE.Mesh(geo.rim, m.rim);
  if (flip) { a.rotation.y = Math.PI; b.rotation.y = Math.PI; }
  g.add(a, b);
  return g;
}

/** Kamyon: kabin + kasa, 7 m. color: kabin rengi, box: kasa rengi. */
export function truck({ color = 0xe0791a, box = 0xe9ebe8 } = {}) {
  const m = mats(), g = new THREE.Group(), wheels = [];
  const paint = mat.paintedMetal({ color, wear: 0.12 }), boxM = mat.paintedMetal({ color: box, wear: 0.1 });
  const add = (geo, mm, x, y, z = 0, par = g) => { const o = new THREE.Mesh(geo, mm); o.position.set(x, y, z); par.add(o); return o; };
  // Şasi
  for (const z of [-0.45, 0.45]) add(new RoundedBoxGeometry(6.8, 0.26, 0.16, 2, 0.04), m.dark, -0.2, 0.86, z);
  add(new RoundedBoxGeometry(1.2, 0.5, 1.9, 2, 0.08), m.dark, -1.9, 0.75, 0); // yakıt/akü kutusu arası
  // Kabin
  const cab = add(new RoundedBoxGeometry(1.95, 2.15, 2.42, 5, 0.22), paint, 2.62, 2.18, 0);
  add(new RoundedBoxGeometry(0.5, 0.9, 2.3, 3, 0.12), paint, 3.48, 1.55, 0); // ön alt (motor kaputu burnu)
  add(new RoundedBoxGeometry(0.12, 0.6, 1.6, 2, 0.04), m.plastic, 3.74, 1.5, 0);           // ızgara
  for (let i = 0; i < 5; i++) add(new RoundedBoxGeometry(0.02, 0.04, 1.5, 1, 0.01), m.chrome, 3.8, 1.28 + i * 0.11, 0);
  add(new RoundedBoxGeometry(0.22, 0.32, 2.5, 2, 0.08), m.dark, 3.72, 0.98, 0);           // tampon
  const ws = add(new RoundedBoxGeometry(0.08, 0.95, 2.2, 2, 0.04), m.glass, 3.6, 2.72, 0); // ön cam
  ws.rotation.z = -0.1;
  for (const z of [-1.215, 1.215]) {
    add(new RoundedBoxGeometry(1.0, 0.75, 0.04, 2, 0.02), m.glass, 2.95, 2.72, z);           // yan cam
    add(new RoundedBoxGeometry(0.06, 0.42, 0.06, 1, 0.02), m.dark, 3.55, 2.65, z * 1.14);    // ayna kolu
    add(new RoundedBoxGeometry(0.1, 0.36, 0.18, 2, 0.04), m.dark, 3.58, 2.72, z * 1.2);      // ayna
    add(new RoundedBoxGeometry(0.1, 0.16, 0.34, 2, 0.05), m.head, 3.77, 1.1, z * 0.78);       // far
    add(new RoundedBoxGeometry(0.9, 0.08, 0.35, 2, 0.03), m.dark, 2.2, 1.12, z * 1.05);       // basamak
  }
  add(new RoundedBoxGeometry(1.5, 0.35, 2.2, 3, 0.15), paint, 2.45, 3.4, 0);               // spoyler
  // Kasa: nervürlü panel
  const bx = add(new RoundedBoxGeometry(5.1, 2.62, 2.5, 3, 0.06), boxM, -1.05, 2.42, 0);
  const ribs = new THREE.InstancedMesh(new RoundedBoxGeometry(0.06, 2.5, 0.05, 1, 0.02), m.chrome, 36);
  const q = new THREE.Matrix4();
  for (let i = 0; i < 18; i++) for (const s of [-1, 1]) { q.makeTranslation(-3.45 + i * 0.28, 2.42, s * 1.27); ribs.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), q); }
  g.add(ribs);
  add(new RoundedBoxGeometry(0.06, 2.5, 2.4, 1, 0.02), m.dark, -3.62, 2.42, 0);              // arka kapı
  add(new RoundedBoxGeometry(0.04, 2.4, 0.03, 1, 0.01), m.chrome, -3.66, 2.42, 0);
  for (const z of [-1.0, 1.0]) add(new RoundedBoxGeometry(0.06, 0.12, 0.3, 1, 0.03), m.tail, -3.62, 1.05, z);
  bx.userData.box = true;
  // Tekerlekler (arka çift, ön tek) ve çamurluklar
  for (const x of [-2.6, -1.4, 2.4]) for (const z of [-1.0, 1.0]) {
    const w = wheel(0.52, x > 0 ? 0.32 : 0.46, z < 0); w.position.set(x, 0.52, z); g.add(w); wheels.push(w);
  }
  for (const z of [-1.08, 1.08]) add(new RoundedBoxGeometry(1.4, 0.08, 0.55, 2, 0.03), m.plastic, 2.4, 1.12, z);
  g.userData.wheels = wheels;
  cab.userData.cab = true;
  return g;
}

/** Otomobil (sedan/hatchback/suv): kesit profilinden bevel'li gövde + cam kabin. uzunluk ≈ 4,3–4,7 m. */
export function carGeometries(type = 'sedan') {
  const L = type === 'suv' ? 4.6 : type === 'hatch' ? 4.1 : 4.6, W = type === 'suv' ? 1.86 : 1.76;
  const H = type === 'suv' ? 1.7 : 1.45, sill = type === 'suv' ? 0.42 : 0.3, belt = type === 'suv' ? 1.08 : 0.9;
  const bv = 0.1;
  const sh = new THREE.Shape();
  const x0 = -L / 2 + bv, x1 = L / 2 - bv;
  sh.moveTo(x0 + 0.2, sill);
  sh.lineTo(x1 - 0.25, sill);
  sh.quadraticCurveTo(x1, sill + 0.02, x1, sill + 0.28);
  sh.quadraticCurveTo(x1 - 0.02, belt - 0.1, x1 - 0.4, belt - 0.02);
  sh.lineTo(type === 'hatch' ? x0 + 0.1 : x0 + 0.35, belt + 0.02);
  sh.quadraticCurveTo(x0, belt - 0.02, x0, belt - 0.3);
  sh.lineTo(x0, sill + 0.25);
  sh.quadraticCurveTo(x0, sill, x0 + 0.2, sill);
  const body = new THREE.ExtrudeGeometry(sh, { depth: W - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 3, curveSegments: 8 });
  body.translate(0, 0, -(W - 2 * bv) / 2);
  // Kabin (cam + tavan): üstten daralan profil
  const c = new THREE.Shape();
  const fA = type === 'suv' ? x1 - 1.05 : x1 - 1.25, rA = type === 'hatch' ? x0 + 0.15 : type === 'suv' ? x0 + 0.2 : x0 + 0.75;
  const roofF = fA - (type === 'suv' ? 0.45 : 0.7), roofR = rA + (type === 'hatch' ? 0.25 : type === 'suv' ? 0.12 : 0.5);
  c.moveTo(fA, belt - 0.02);
  c.quadraticCurveTo(roofF + 0.2, H - 0.12, roofF, H - 0.05);
  c.lineTo(roofR, H - 0.05);
  c.quadraticCurveTo(rA + 0.05, H - 0.1, rA, belt - 0.02);
  c.lineTo(fA, belt - 0.02);
  const cw = W - 0.28;
  const cabin = new THREE.ExtrudeGeometry(c, { depth: cw - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 8 });
  cabin.translate(0, 0, -(cw - 0.16) / 2);
  const roof = new RoundedBoxGeometry(Math.abs(roofF - roofR) - 0.1, 0.06, cw - 0.2, 2, 0.03).translate((roofF + roofR) / 2, H - 0.02, 0);
  return { body, cabin, roof, L, W, H, wheelX: L / 2 - (type === 'suv' ? 0.85 : 0.8), wheelR: type === 'suv' ? 0.37 : 0.32 };
}
export function car({ color = 0x9aa3ad, type = 'sedan' } = {}) {
  const m = mats(), g = new THREE.Group(), G = carGeometries(type);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 });
  g.add(new THREE.Mesh(G.body, paint), new THREE.Mesh(G.cabin, m.glass), new THREE.Mesh(G.roof, paint));
  for (const x of [-G.wheelX, G.wheelX]) for (const z of [-G.W / 2 + 0.16, G.W / 2 - 0.16]) {
    const w = wheel(G.wheelR, 0.22, z < 0); w.position.set(x, G.wheelR, z); g.add(w);
  }
  for (const z of [-G.W / 2 + 0.28, G.W / 2 - 0.28]) {
    const h = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.1, 0.34, 1, 0.03), m.head); h.position.set(G.L / 2 - 0.05, 0.72, z); g.add(h);
    const t = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.1, 0.3, 1, 0.03), m.tail); t.position.set(-G.L / 2 + 0.05, 0.78, z); g.add(t);
  }
  return g;
}
