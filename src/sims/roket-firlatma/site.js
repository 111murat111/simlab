// Fırlatma üssü: kıyı arazisi, yükseltilmiş beton rampa, alev kanalı, fırlatma masası, kafes servis kulesi, tanklar, yollar.
import { THREE, mat, landscape, RoundedBoxGeometry } from '@core';

export const GL = 3;          // rampa çevresindeki zemin (m)
export const PT = GL + 5;     // rampa üstü
export const MOUNT = PT + 3.5; // fırlatma masası üstü = roketin motor çıkış düzlemi
export const COAST = 430;     // kıyı çizgisi (x, m) — doğu (+x) deniz

const S = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Yükseklik fonksiyonu (dünya eğriliği dahil). R: gezegen yarıçapı (m). */
export function makeHeight(R) {
  const n0 = landscape({ seed: 5, size: 380, height: 9, base: 0, warp: 0.4 });
  const n1 = landscape({ seed: 17, size: 2600, height: 150, base: -20, warp: 0.6 });
  const coastAt = (z) => COAST + 70 * Math.sin(z / 760 + 0.4) + 28 * Math.sin(z / 210 + 1.7);
  const raw = (x, z) => {
    const d = x - coastAt(z);
    const hills = Math.max(0, n1(x, z)) * S(-900, -3200, x);
    const land = GL + 0.2 + (n0(x, z) - 3) * 0.45 + 5.5 * Math.exp(-(((d + 48) / 20) ** 2)) * (0.55 + 0.1 * n0(z, x)) + hills;
    const sea = -0.04 * d - 0.012 * Math.max(0, d - 120) - 0.004 * Math.max(0, d - 900);
    let h = d < -25 ? land : d > 0 ? Math.max(sea, -38) : THREE.MathUtils.lerp(land, -0.04 * d, S(-25, 0, d));
    const r = Math.hypot(x, z);
    h = THREE.MathUtils.lerp(GL, h, S(210, 360, r));
    return h;
  };
  return (x, z) => raw(x, z) - (x * x + z * z) / (2 * R);
}

// Uzun ince elemanlar (kafes çubukları) için örnekli silindir
const up = new THREE.Vector3(0, 1, 0);
export function beams(list, material, radial = 6) {
  const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, radial, 1), material, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), d = new THREE.Vector3(), mid = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach(([a, b, r], i) => {
    d.subVectors(b, a); const L = d.length(); d.normalize();
    q.setFromUnitVectors(up, d); mid.addVectors(a, b).multiplyScalar(0.5);
    m4.compose(mid, q, s.set(r, L, r)); im.setMatrixAt(i, m4);
  });
  return im;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Arazi üstünde şerit (yol): noktalar [x,z], genişlik, yükseklik fonksiyonu */
export function strip(pts, width, hf, lift = 0.06) {
  const pos = [], idx = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    const nx = -tz * width / 2, nz = tx * width / 2;
    for (const s of [-1, 1]) { const x = pts[i][0] + nx * s, z = pts[i][1] + nz * s; pos.push(x, hf(x, z) + lift, z); }
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildSite(hf) {
  const site = new THREE.Group();
  const concrete = mat.concrete({ color: 0xb9b3a8, scale: 0.6 });
  const scorched = mat.concrete({ color: 0x57524c, scale: 0.8, stains: 1 });
  const steel = mat.paintedMetal({ color: 0x777d83, wear: 0.45 });
  const orange = mat.paintedMetal({ color: 0xc4512a, wear: 0.25 });
  const white = mat.paintedMetal({ color: 0xe9ebea, wear: 0.08 });
  const grate = mat.brushedMetal({ color: 0x8d9298, rough: 0.5 });
  const asphalt = mat.asphalt({ color: 0x3a3b3e, scale: 1.4 });
  const add = (geo, m, x, y, z, parent = site) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };

  // Rampa: alev kanalının iki yanında ve arkasında yükseltilmiş beton kütle
  const H = PT - GL + 1.2, cy = PT - H / 2;
  add(new RoundedBoxGeometry(84, H, 38, 3, 1.2), concrete, 2, cy, -23);
  add(new RoundedBoxGeometry(84, H, 38, 3, 1.2), concrete, 2, cy, 23);
  add(new RoundedBoxGeometry(34, H, 8.4, 3, 0.8), concrete, -23, cy, 0);
  // Kanal tabanı ve şev (egzoz doğuya, denize doğru çıkar)
  add(new RoundedBoxGeometry(60, 0.8, 8.2, 2, 0.3), scorched, 16, GL - 0.1, 0);
  // Batı rampası (araç yolu rampa üstüne çıkar)
  const ramp = add(new RoundedBoxGeometry(34, 1.0, 11, 2, 0.4), concrete, -55, (GL + PT) / 2 - 0.35, 0);
  ramp.rotation.z = Math.atan2(PT - GL, 34);
  // Rampa üstü kavrulmuş leke ve boya çizgileri
  const burn = add(new THREE.CircleGeometry(16, 48).rotateX(-Math.PI / 2), scorched, 6, PT + 0.02, 0);
  burn.scale.set(1.4, 1, 1);

  // Alev saptırıcı: kanalın içinde içbükey eğri, egzozu +x'e çevirir
  {
    const sh = new THREE.Shape();
    sh.moveTo(-3.5, 0); sh.lineTo(9, 0); sh.quadraticCurveTo(0.5, 0.4, -1.5, 5.6); sh.lineTo(-3.5, 5.6); sh.lineTo(-3.5, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 7.6, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2, curveSegments: 16 });
    g.translate(0, 0, -3.8);
    add(g, mat.paintedMetal({ color: 0x4a4541, wear: 0.8 }), 0, GL + 0.3, 0);
  }

  // Fırlatma masası: dört ayak + ortası delik kalın plaka + tutucu kıskaçlar
  const mount = new THREE.Group(); site.add(mount);
  for (const [x, z] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]]) {
    add(new RoundedBoxGeometry(1.4, MOUNT - PT, 1.4, 2, 0.15), steel, x, (MOUNT + PT) / 2 - 0.6, z, mount);
  }
  {
    const sh = new THREE.Shape();
    sh.moveTo(-7, -7); sh.lineTo(7, -7); sh.lineTo(7, 7); sh.lineTo(-7, 7); sh.lineTo(-7, -7);
    const hole = new THREE.Path(); hole.absarc(0, 0, 2.3, 0, Math.PI * 2, true); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.1, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2, curveSegments: 32 });
    g.rotateX(Math.PI / 2);
    add(g, steel, 0, MOUNT, 0, mount);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      const c = add(new RoundedBoxGeometry(0.5, 1.0, 0.9, 2, 0.1), mat.paintedMetal({ color: 0x2f3337, wear: 0.5 }), Math.cos(a) * 1.25, MOUNT + 0.45, Math.sin(a) * 1.25, mount);
      c.rotation.y = -a;
    }
    // Korkuluk
    const rails = [];
    for (const s of [-1, 1]) {
      rails.push([V(-6.8, MOUNT + 1.1, s * 6.8), V(6.8, MOUNT + 1.1, s * 6.8), 0.04], [V(s * 6.8, MOUNT + 1.1, -6.8), V(s * 6.8, MOUNT + 1.1, 6.8), 0.04]);
      for (let k = -3; k <= 3; k++) { rails.push([V(k * 2.2, MOUNT, s * 6.8), V(k * 2.2, MOUNT + 1.1, s * 6.8), 0.035]); rails.push([V(s * 6.8, MOUNT, k * 2.2), V(s * 6.8, MOUNT + 1.1, k * 2.2), 0.035]); }
    }
    mount.add(beams(rails, mat.paintedMetal({ color: 0xd9b21f, wear: 0.3 })));
  }

  // Servis kulesi (kafes, 4 m katlar), kuzeyde; kollar rokete uzanır
  const TW = 6, TH = 32, tx = -1, tz = -15;
  const members = [];
  const cx = [tx - TW / 2, tx + TW / 2], cz = [tz - TW / 2, tz + TW / 2];
  for (const x of cx) for (const z of cz) members.push([V(x, PT, z), V(x, PT + TH, z), 0.22]);
  for (let y = PT; y <= PT + TH + 0.01; y += 4) {
    members.push([V(cx[0], y, cz[0]), V(cx[1], y, cz[0]), 0.12], [V(cx[0], y, cz[1]), V(cx[1], y, cz[1]), 0.12],
      [V(cx[0], y, cz[0]), V(cx[0], y, cz[1]), 0.12], [V(cx[1], y, cz[0]), V(cx[1], y, cz[1]), 0.12]);
    if (y + 4 <= PT + TH + 0.01) {
      const y2 = y + 4;
      members.push([V(cx[0], y, cz[0]), V(cx[1], y2, cz[0]), 0.08], [V(cx[1], y, cz[0]), V(cx[0], y2, cz[0]), 0.08],
        [V(cx[0], y, cz[1]), V(cx[1], y2, cz[1]), 0.08], [V(cx[1], y, cz[1]), V(cx[0], y2, cz[1]), 0.08],
        [V(cx[0], y, cz[0]), V(cx[0], y2, cz[1]), 0.08], [V(cx[0], y, cz[1]), V(cx[0], y2, cz[0]), 0.08],
        [V(cx[1], y, cz[0]), V(cx[1], y2, cz[1]), 0.08], [V(cx[1], y, cz[1]), V(cx[1], y2, cz[0]), 0.08]);
    }
  }
  site.add(beams(members, orange, 4));
  for (let y = PT + 8; y < PT + TH; y += 8) add(new RoundedBoxGeometry(TW + 1.4, 0.18, TW + 1.4, 1, 0.05), grate, tx, y, tz);
  add(new RoundedBoxGeometry(TW + 1.6, 3.2, TW + 1.6, 2, 0.2), white, tx, PT + TH + 1.6, tz); // üst makine dairesi
  const mast = add(new THREE.CylinderGeometry(0.1, 0.3, 10, 12), grate, tx, PT + TH + 8, tz);
  mast.name = 'mast';
  // Kule ile rampa arasında asansör kovası ve boru demetleri
  add(new RoundedBoxGeometry(2.2, TH, 2.2, 2, 0.1), mat.paintedMetal({ color: 0x8b9096, wear: 0.3 }), tx + TW / 2 + 1.3, PT + TH / 2, tz - 1.5);
  const pipes = [];
  for (let k = 0; k < 3; k++) pipes.push([V(tx - 1 + k * 0.5, PT, tz + TW / 2 + 0.35), V(tx - 1 + k * 0.5, PT + TH - 6, tz + TW / 2 + 0.35), 0.18]);
  site.add(beams(pipes, mat.brushedMetal({ color: 0xb8bcc0 }), 12));

  // Salınan kollar (fırlatmada kuleye döner)
  const arms = [];
  function arm() {
    const pivot = new THREE.Group();
    pivot.position.set(tx + 1.2, 0, tz + TW / 2);
    const g = new THREE.Group(); pivot.add(g);
    const L = Math.abs(tz + TW / 2) - 0.9;
    const box = [];
    for (const x of [-0.6, 0.6]) for (const y of [0, 1.6]) box.push([V(x, y, 0), V(x, y, L), 0.07]);
    for (let z = 0; z <= L; z += 1.2) {
      box.push([V(-0.6, 0, z), V(0.6, 0, z), 0.05], [V(-0.6, 1.6, z), V(0.6, 1.6, z), 0.05], [V(-0.6, 0, z), V(-0.6, 1.6, z), 0.05], [V(0.6, 0, z), V(0.6, 1.6, z), 0.05]);
      if (z + 1.2 <= L) box.push([V(-0.6, 0, z), V(-0.6, 1.6, z + 1.2), 0.04], [V(0.6, 0, z), V(0.6, 1.6, z + 1.2), 0.04]);
    }
    g.add(beams(box, orange, 4));
    const floor = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.1, L, 1, 0.03), grate); floor.position.set(0, 0.05, L / 2); g.add(floor);
    const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, L, 10), mat.rubber()); hose.rotation.x = Math.PI / 2; hose.position.set(0.4, -0.3, L / 2); g.add(hose);
    const plate = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.9, 0.3, 2, 0.08), steel); plate.position.set(-tx - 1.2, 0.3, L + 0.05); g.add(plate);
    site.add(pivot);
    arms.push(pivot);
    return pivot;
  }
  arm(); arm();

  // Paratoner direkleri ve katener telleri
  const towers = [[-34, -34], [36, -34], [-34, 34], [36, 34]];
  const poleM = mat.paintedMetal({ color: 0xcfd2d4, wear: 0.2 });
  const wires = [];
  for (const [x, z] of towers) {
    const p = add(new THREE.CylinderGeometry(0.22, 0.6, 46, 14), poleM, x, PT + 23, z);
    p.name = 'pole';
    wires.push(V(x, PT + 45, z));
  }
  const wirePts = [];
  const top = V(tx, PT + TH + 12.5, tz);
  for (const w of wires) for (let i = 0; i <= 24; i++) {
    const t = i / 24, p = new THREE.Vector3().lerpVectors(w, top, t); p.y -= Math.sin(t * Math.PI) * 4;
    wirePts.push(p);
  }
  const wireL = [];
  for (let k = 0; k < 4; k++) for (let i = 0; i < 24; i++) wireL.push([wirePts[k * 25 + i], wirePts[k * 25 + i + 1], 0.03]);
  site.add(beams(wireL, grate, 4));

  // Projektör direkleri
  for (const [x, z] of [[-50, 52], [54, 52], [-50, -52], [54, -52]]) {
    add(new THREE.CylinderGeometry(0.16, 0.26, 22, 10), poleM, x, GL + 11, z);
    const head = add(new RoundedBoxGeometry(3.2, 1.6, 0.6, 2, 0.12), steel, x, GL + 22.4, z);
    head.lookAt(0, PT + 10, 0);
    const lens = new THREE.Mesh(new RoundedBoxGeometry(2.8, 1.2, 0.1, 1, 0.04), mat.glass({ tint: 0xfff4d6, rough: 0.1 }));
    lens.position.z = 0.32; head.add(lens);
  }

  // Su kulesi (ses bastırma suyu): kafes ayaklar üstünde küre-koni tank
  {
    const g = new THREE.Group(); g.position.set(-150, GL, 95); site.add(g);
    const legs = [];
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2, b = (i + 1) / 6 * Math.PI * 2;
      legs.push([V(Math.cos(a) * 9, 0, Math.sin(a) * 9), V(Math.cos(a) * 5, 34, Math.sin(a) * 5), 0.4]);
      for (const y of [8, 17, 26]) { const k = 9 - (y / 34) * 4; legs.push([V(Math.cos(a) * k, y, Math.sin(a) * k), V(Math.cos(b) * k, y, Math.sin(b) * k), 0.18]); }
    }
    legs.push([V(0, 0, 0), V(0, 36, 0), 0.9]);
    g.add(beams(legs, poleM, 8));
    const prof = [];
    for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + (i / 24) * Math.PI; prof.push(new THREE.Vector2(Math.max(0.01, Math.cos(a) * 9), 44 + Math.sin(a) * (a < 0 ? 9 : 6))); }
    const tank = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), white); g.add(tank);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(9.02, 0.15, 6, 64), steel); cap.rotation.x = Math.PI / 2; cap.position.y = 44; g.add(cap);
  }

  // Sıvı oksijen küreleri ve yakıt tankı
  function sphereTank(x, z, r) {
    const g = new THREE.Group(); g.position.set(x, GL, z); site.add(g);
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 24), white); s.position.y = r + 2.5; g.add(s);
    const eq = new THREE.Mesh(new THREE.TorusGeometry(r * 1.002, 0.12, 6, 64), steel); eq.rotation.x = Math.PI / 2; eq.position.y = r + 2.5; g.add(eq);
    const legs = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; legs.push([V(Math.cos(a) * r, 0, Math.sin(a) * r), V(Math.cos(a) * r, r + 2.5, Math.sin(a) * r), 0.22]); }
    g.add(beams(legs, steel, 8));
    const base = new THREE.Mesh(new RoundedBoxGeometry(r * 2.6, 0.5, r * 2.6, 2, 0.15), concrete); base.position.y = 0.1; g.add(base);
  }
  sphereTank(78, -92, 7); sphereTank(96, -92, 7);
  {
    const g = new THREE.Group(); g.position.set(-70, GL, -78); site.add(g);
    const prof = [];
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.01, Math.sin(a) * 3.2), -14 - Math.cos(a) * 1.4)); }
    for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; prof.push(new THREE.Vector2(Math.max(0.01, Math.cos(a) * 3.2), 14 + Math.sin(a) * 1.4)); }
    const t = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), white); t.rotation.z = Math.PI / 2; t.position.y = 4.4; g.add(t);
    for (const x of [-9, 0, 9]) { const s = new THREE.Mesh(new RoundedBoxGeometry(1, 2.4, 6, 2, 0.1), concrete); s.position.set(x, 1.2, 0); g.add(s); }
  }
  // Boru hattı: tanklardan rampaya, alçak destekler üstünde
  const lines = [];
  const pipeRun = (pts) => { for (let i = 0; i < pts.length - 1; i++) lines.push([pts[i], pts[i + 1], 0.35]); };
  pipeRun([V(78, GL + 2, -84), V(78, GL + 1.2, -60), V(20, GL + 1.2, -42), V(10, PT - 0.6, -40.5)]);
  pipeRun([V(-70, GL + 2, -73), V(-50, GL + 1.2, -60), V(-20, GL + 1.2, -42), V(-8, PT - 0.6, -40.5)]);
  site.add(beams(lines, mat.brushedMetal({ color: 0xc9ccd0, rough: 0.3 }), 12));

  // Kontrol bunkeri
  {
    const b = add(new RoundedBoxGeometry(26, 7, 14, 3, 0.6), concrete, -175, GL + 3.2, -62);
    b.rotation.y = 0.3;
    const roof = new THREE.Mesh(new RoundedBoxGeometry(27, 0.6, 15, 2, 0.2), mat.concrete({ color: 0x8f8a82 })); roof.position.y = 3.7; b.add(roof);
    for (let i = 0; i < 5; i++) {
      const w = new THREE.Mesh(new RoundedBoxGeometry(2.6, 1.2, 0.2, 1, 0.05), mat.glass({ tint: 0x9fb4c4, rough: 0.05 }));
      w.position.set(-9 + i * 4.5, 1.3, 7.05); b.add(w);
    }
  }

  // Yollar: batıdan rampa rampasına, tanklara kol yollar
  const roadM = asphalt;
  const road = (pts, w) => { const m = new THREE.Mesh(strip(pts, w, hf), roadM); site.add(m); return m; };
  const main = []; for (let x = -2200; x <= -72; x += 12) main.push([x, 12 * Math.sin(x / 400) * S(-160, -600, x)]);
  road(main, 9);
  const lines2 = []; for (let x = -2200; x <= -80; x += 12) lines2.push([x, 12 * Math.sin(x / 400) * S(-160, -600, x)]);
  const paint = mat.concrete({ color: 0xe8e2cf, stains: 0 });
  for (let i = 0; i < lines2.length - 1; i += 2) { const m = new THREE.Mesh(strip([lines2[i], lines2[i + 1]], 0.18, hf, 0.1), paint); site.add(m); }
  const branch = []; for (let t = 0; t <= 1.0001; t += 0.05) branch.push([THREE.MathUtils.lerp(-150, 87, t), THREE.MathUtils.lerp(0, -70, t * t)]);
  road(branch, 6);
  // Çit (rampa çevresi, 130 m)
  const fence = [];
  const FR = 130;
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    const x = Math.cos(a) * FR, z = Math.sin(a) * FR, x2 = Math.cos(a + 0.05) * FR, z2 = Math.sin(a + 0.05) * FR;
    if (Math.abs(z) < 12 && x < 0) continue;
    fence.push([V(x, hf(x, z), z), V(x, hf(x, z) + 2.2, z), 0.04], [V(x, hf(x, z) + 2.1, z), V(x2, hf(x2, z2) + 2.1, z2), 0.02], [V(x, hf(x, z) + 1.0, z), V(x2, hf(x2, z2) + 1.0, z2), 0.015]);
  }
  site.add(beams(fence, grate, 4));

  return { site, arms, tower: { tx, tz, TW, TH } };
}
