// Kameraya yakın, ölçeksiz (görünürlük için çok büyütülmüş) örnek nesneler: ISS benzeri istasyon, küp uydular, boş roket kademesi.
import { THREE, mat, procedural, RoundedBoxGeometry } from '@core';

/** Güneş paneli: koyu hücreler, ince gümüş iletken çizgiler, hücreler arası boşluk. */
function solar(color) {
  return procedural({
    key: 'uz-solar', physical: true, bump: 0.002, params: { color, roughness: 0.3, metalness: 0.25 },
    pattern: `
      vec2 q = p.xy*vec2(46.0, 46.0);
      vec2 f = abs(fract(q) - 0.5);
      float gap = step(0.46, max(f.x, f.y));
      float bus = step(0.47, abs(fract(q.y*4.0) - 0.5))*0.6;
      float tone = vn3(vec3(floor(q), seed*9.0));
      col *= 0.8 + 0.35*tone;
      col = mix(col, vec3(0.62, 0.6, 0.55), max(gap, bus));
      metal = mix(metal, 0.9, max(gap, bus));
      rough = mix(rough - 0.05*tone, 0.35, gap);
      h = -gap;`,
  });
}

const white = () => mat.paintedMetal({ color: 0xe6e4df, wear: 0.08 });

/** ISS benzeri: kafes kiriş, 4 çift güneş kanadı, radyatörler, basınçlı modül zinciri. Kanat pivotları güneşe döner. */
function station() {
  const g = new THREE.Group();
  const truss = mat.brushedMetal({ color: 0xb8bbbf, rough: 0.4 });
  const modM = white(), radM = mat.plastic({ color: 0xf1f0ec, gloss: 0.25 }), arr = solar(0x6b4a24);
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  // Ana kiriş ve kafes çubukları
  add(new RoundedBoxGeometry(1.5, 0.05, 0.05, 1, 0.008), truss);
  for (let i = -7; i <= 7; i++) add(new THREE.BoxGeometry(0.008, 0.07, 0.07), truss, i * 0.1);
  // Basınçlı modüller (kirişe dik, uçuş yönünde)
  const mod = (r, l, z, x = 0) => { const o = add(new THREE.CylinderGeometry(r, r, l, 24).rotateX(Math.PI / 2), modM, x, -0.06, z); return o; };
  mod(0.045, 0.34, 0.02); mod(0.04, 0.2, 0.28); mod(0.05, 0.2, -0.24); mod(0.035, 0.16, -0.43);
  mod(0.038, 0.18, 0.02, 0.14).rotation.y = Math.PI / 2;
  add(new THREE.SphereGeometry(0.05, 20, 14), modM, 0, -0.06, 0.2);
  // Radyatörler (kirişin altında, beyaz)
  for (const x of [-0.26, 0.26]) add(new RoundedBoxGeometry(0.06, 0.005, 0.32, 1, 0.002), radM, x, -0.02, -0.2);
  // Güneş kanatları: her uçta iki pivot, her pivotta kirişin iki yanına uzanan uzun kanat
  const pivots = [];
  const wing = new RoundedBoxGeometry(0.1, 0.62, 0.006, 1, 0.002);
  const mast = new THREE.CylinderGeometry(0.004, 0.004, 1.3, 6);
  for (const x of [-0.72, -0.6, 0.6, 0.72]) {
    const pv = new THREE.Group(); pv.position.set(x, 0, 0); g.add(pv); pivots.push(pv);
    for (const s of [-1, 1]) { const w = new THREE.Mesh(wing, arr); w.position.y = s * 0.35; pv.add(w); }
    pv.add(new THREE.Mesh(mast, truss));
  }
  return { group: g, pivots };
}

/** 3U küp uydu: altın folyo gövde, açılmış dört panel. */
function cubesat() {
  const g = new THREE.Group();
  const frame = mat.brushedMetal({ color: 0x9da2a8, rough: 0.35 }), foil = mat.brushedMetal({ color: 0xd8a442, rough: 0.22 }), pan = solar(0x1a2750);
  g.add(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.05, 0.15, 1, 0.004), frame));
  const f = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.052, 0.13), foil); g.add(f);
  // Dört açılmış panel: gövdenin yanlarından dışa, gövde boyunca uzanır
  const pg = new RoundedBoxGeometry(0.05, 0.15, 0.003, 1, 0.001);
  for (let k = 0; k < 4; k++) {
    const pv = new THREE.Group(); pv.rotation.z = (k * Math.PI) / 2 + Math.PI / 4; g.add(pv);
    const p = new THREE.Mesh(pg, pan); p.rotation.x = Math.PI / 2; p.position.x = 0.062; pv.add(p);
  }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.12, 5), frame);
  ant.position.set(0.02, 0.07, 0.06); g.add(ant);
  return g;
}

/** Boş üst kademe: beyaz boyalı tank, koyu bant, ara bölme, motor lülesi. */
function rocketStage() {
  const g = new THREE.Group();
  const paint = mat.paintedMetal({ color: 0xdedbd3, wear: 0.35 }), band = mat.paintedMetal({ color: 0x2a2b2e, wear: 0.2 });
  const noz = mat.brushedMetal({ color: 0x6d655c, rough: 0.45 }), foil = mat.brushedMetal({ color: 0xc99a3c, rough: 0.3 });
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 32), paint); g.add(tank);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.08, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint); top.position.y = 0.21; g.add(top);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.0815, 0.0815, 0.06, 32), band); b.position.y = 0.08; g.add(b);
  const aft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.05, 32), foil); aft.position.y = -0.235; g.add(aft);
  const n = new THREE.Mesh(new THREE.LatheGeometry([[0.018, 0], [0.024, -0.02], [0.045, -0.1], [0.058, -0.15], [0.056, -0.152], [0.02, -0.02]].map(([x, y]) => new THREE.Vector2(x, y)), 28), noz);
  n.material.side = THREE.DoubleSide; n.position.y = -0.26; g.add(n);
  return g;
}

/**
 * Nesneleri sahneye yerleştirir. `place(dir, r)` konumu verir; `update(dt, sunDir)` yavaşça sürükler, döndürür, panelleri güneşe çevirir.
 * Modeller ölçeksizdir: gerçekte 100 m'lik ISS bu ölçekte bir pikselden çok daha küçüktür.
 */
export function createCraft(scene, { spots, scale = 1 }) {
  const iss = station(), cs1 = cubesat(), cs2 = cubesat(), stage = rocketStage();
  const items = [
    { o: iss.group, s: 1.25 * scale, spin: 0 },
    { o: cs1, s: 1.6 * scale, spin: 0.25 },
    { o: cs2, s: 1.6 * scale, spin: -0.18 },
    { o: stage, s: 1.7 * scale, spin: 0.12 },
  ];
  const root = new THREE.Group(); scene.add(root);
  items.forEach((it, i) => {
    const sp = spots[i];
    it.base = sp.dir.clone().normalize().multiplyScalar(sp.r);
    it.axis = new THREE.Vector3().crossVectors(it.base, sp.vel || new THREE.Vector3(0, 1, 0)).normalize();
    it.o.scale.setScalar(it.s);
    it.o.position.copy(it.base);
    it.o.rotation.set(i * 1.3, i * 0.7, i * 0.4);
    root.add(it.o);
  });
  // ISS: kiriş yörünge normali boyunca değil, yere paralel; +z uçuş yönü
  const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(), _fw = new THREE.Vector3(), _x = new THREE.Vector3();
  let t = 0;
  return {
    root,
    update(dt, sunDir) {
      t += dt;
      for (const it of items) {
        _q.setFromAxisAngle(it.axis, t * 0.004);
        it.o.position.copy(it.base).applyQuaternion(_q);
        if (it.o === iss.group) {
          _up.copy(it.o.position).normalize();
          _fw.crossVectors(it.axis, _up).normalize();
          _x.crossVectors(_up, _fw);
          _m.makeBasis(_x, _up, _fw);
          it.o.quaternion.setFromRotationMatrix(_m);
        } else {
          it.o.rotateY(dt * it.spin); it.o.rotateX(dt * it.spin * 0.6);
        }
      }
      // Kanat pivotları (x ekseni) güneşe döner
      iss.group.updateMatrixWorld();
      _s.copy(sunDir).transformDirection(_m.copy(iss.group.matrixWorld).invert());
      const a = Math.atan2(-_s.y, _s.z);
      for (const pv of iss.pivots) pv.rotation.x = a;
    },
  };
}
