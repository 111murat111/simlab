// Lojistik ayrıştırma salonu: beton zemin, çelik portal kolonlar, oluklu sac duvarlar, tepe ışıklıkları,
// konveyör bantlar, bant sonu tarayıcı kapıları ve cam jeton siloları — yalnız görsel.
import { THREE, mat, procedural, RoundedBoxGeometry, BufferGeometryUtils } from '@core';

export const HALL = { x0: -20, x1: 24, z0: -18, z1: 20, h: 11 };

const corrugated = (color) => procedural({
  key: 'jev-corrugated', bump: 0.06, params: { color, roughness: 0.5, metalness: 0.55 },
  pattern: `
    vec3 a = axisDominant(pn);
    float u = a.x > 0.5 ? p.z : p.x;
    float w = sin(u*6.2832/0.2);
    float n = fbm3(p*0.4, 3);
    col *= 0.85 + 0.12*w + 0.12*n;
    rough = 0.45 + 0.2*n; metal = 0.6;
    h = w*0.5 + 0.5;`,
});

const floorMat = () => procedural({
  key: 'jev-floor', bump: 0.012, params: { color: 0xa39f97, roughness: 0.55 },
  pattern: `
    float n = fbm3(p*0.35, 5), s = fbm3(p*3.0, 3), sp = vn3(p*60.0);
    col *= 0.84 + 0.26*n + 0.05*(sp - 0.5);
    vec2 g = abs(fract(p.xz/6.0 + 0.5) - 0.5)*6.0;
    float joint = (1.0 - smoothstep(0.0, 0.02, min(g.x, g.y)))*aaW(p*0.5);
    col *= 1.0 - 0.45*joint;
    rough = 0.42 + 0.3*s + 0.2*joint;
    h = n*0.4 - joint;`,
});

const cardboard = () => procedural({
  key: 'jev-cardboard', bump: 0.02, params: { color: 0xa9825a, roughness: 0.92 },
  pattern: `
    float n = fbm3(p*1.2, 3), f = vn3(p*vec3(40.0, 3.0, 40.0));
    col *= 0.86 + 0.2*n + 0.06*(f - 0.5);
    vec3 a = axisDominant(pn);
    float tape = (1.0 - step(0.06, abs(p.z - floor(p.z + 0.5))))*a.y;
    col = mix(col, vec3(0.62, 0.5, 0.36), tape*0.8);
    rough = mix(0.92, 0.45, tape); h = n*0.3;`,
});

function iBeam(len, hgt, wid, axis) {
  // I profili: iki başlık + gövde, len boyunca (axis: 'y' dikey, 'x' yatay)
  const t = 0.02 * (hgt / 0.4) + 0.012;
  const parts = [
    new THREE.BoxGeometry(wid, t, len).translate(0, hgt / 2 - t / 2, 0),
    new THREE.BoxGeometry(wid, t, len).translate(0, -hgt / 2 + t / 2, 0),
    new THREE.BoxGeometry(t * 0.7, hgt - 2 * t, len),
  ];
  const g = BufferGeometryUtils.mergeGeometries(parts.map((p) => p.toNonIndexed()));
  if (axis === 'y') g.rotateX(Math.PI / 2);
  if (axis === 'x') g.rotateY(Math.PI / 2);
  return g;
}

export function buildHall(scene) {
  const { x0, x1, z0, z1, h } = HALL;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), floorMat());
  floor.position.set(cx, 0, cz); floor.receiveShadow = true; floor.userData.noFit = true; floor.userData.noCast = true;
  scene.add(floor);
  // duvarlar: alt 2,4 m beton blok, üstte oluklu sac; uzun duvarda pencere bandı
  const block = mat.concrete({ color: 0xcfcabd, stains: 0.3 });
  const sheet = corrugated(0xdadfe2);
  const add = (g, m, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; o.userData.noFit = true; scene.add(o); return o; };
  add(new THREE.BoxGeometry(W, 2.4, 0.3).translate(cx, 1.2, z0), block);
  add(new THREE.BoxGeometry(0.3, 2.4, D).translate(x0, 1.2, cz), block);
  add(new THREE.BoxGeometry(0.3, 2.4, D).translate(x1, 1.2, cz), block);
  add(new THREE.BoxGeometry(W, h - 2.4, 0.12).translate(cx, 2.4 + (h - 2.4) / 2, z0), sheet);
  add(new THREE.BoxGeometry(0.12, h - 2.4, D).translate(x1, 2.4 + (h - 2.4) / 2, cz), sheet);
  // sol (x0) duvar: pencere bandı 3,2–5,2 m
  add(new THREE.BoxGeometry(0.12, 0.8, D).translate(x0, 2.8, cz), sheet);
  add(new THREE.BoxGeometry(0.12, h - 5.2, D).translate(x0, 5.2 + (h - 5.2) / 2, cz), sheet);
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fb4c0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.25 });
  const gl = add(new THREE.BoxGeometry(0.03, 2.0, D).translate(x0, 4.2, cz), glass, false);
  gl.userData.noCast = true;
  const mull = [];
  for (let z = z0; z <= z1; z += 2.5) mull.push(new THREE.BoxGeometry(0.1, 2.0, 0.08).translate(x0, 4.2, z).toNonIndexed());
  add(BufferGeometryUtils.mergeGeometries(mull), mat.paintedMetal({ color: 0x3b3f44, wear: 0.1 }));
  // çelik kolonlar ve çatı makasları (6 m aralık)
  const steel = mat.paintedMetal({ color: 0x2f5d8a, wear: 0.25 });
  const cols = [], truss = [];
  for (let x = x0 + 2; x <= x1 - 1; x += 6) {
    for (const z of [z0 + 0.5, z1 - 0.5]) cols.push(iBeam(h, 0.4, 0.3, 'y').translate(x, h / 2, z));
    truss.push(iBeam(D, 0.6, 0.25).translate(x, h - 0.3, cz));
    // diyagonal çubuklar
    for (let k = 0; k < 8; k++) {
      const za = z0 + (k + 0.5) * (D / 8);
      truss.push(new THREE.BoxGeometry(0.08, 1.1, 0.08).rotateX(k % 2 ? 0.7 : -0.7).translate(x, h - 1.1, za).toNonIndexed());
    }
    truss.push(new THREE.BoxGeometry(0.2, 0.15, D).translate(x, h - 1.75, cz).toNonIndexed());
  }
  add(BufferGeometryUtils.mergeGeometries(cols.map((g) => g.index ? g.toNonIndexed() : g)), steel);
  const tr = add(BufferGeometryUtils.mergeGeometries(truss.map((g) => g.index ? g.toNonIndexed() : g)), steel);
  tr.castShadow = true;
  // aşıklar
  const purl = [];
  for (let z = z0 + 1; z < z1; z += 2.4) purl.push(new THREE.BoxGeometry(W, 0.18, 0.1).translate(cx, h + 0.1, z).toNonIndexed());
  add(BufferGeometryUtils.mergeGeometries(purl), mat.paintedMetal({ color: 0x8a8f94, wear: 0.2 }));
  // çatı: iki ışıklık şeridi dışında sac; ışıklıktan güneş girer
  const SKY = [[1.5, 4.5], [9.5, 12.5]];
  const roofParts = [];
  let zz = z0;
  for (const [a, b] of SKY) { roofParts.push(new THREE.BoxGeometry(W, 0.1, a - zz).translate(cx, h + 0.25, (zz + a) / 2).toNonIndexed()); zz = b; }
  roofParts.push(new THREE.BoxGeometry(W, 0.1, z1 - zz).translate(cx, h + 0.25, (zz + z1) / 2).toNonIndexed());
  add(BufferGeometryUtils.mergeGeometries(roofParts), corrugated(0xa9aeb2));
  const skyMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.4, transparent: true, opacity: 0.35 });
  for (const [a, b] of SKY) {
    const s = add(new THREE.BoxGeometry(W, 0.05, b - a).translate(cx, h + 0.28, (a + b) / 2), skyMat, false);
    s.userData.noCast = true;
  }
  // tavan lambaları (LED high-bay): çiçeklenen disk
  const lampG = new THREE.LatheGeometry([[0, 0.28], [0.25, 0.3], [0.38, 0.12], [0.36, 0.0], [0, 0.0]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
  const discG = new THREE.CircleGeometry(0.33, 20).rotateX(Math.PI / 2).translate(0, -0.005, 0);
  const lampM = mat.paintedMetal({ color: 0x3c4043, wear: 0.1 }), discM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.1, 2.9) });
  for (let x = x0 + 5; x < x1; x += 6) for (let z = z0 + 5; z < z1 - 2; z += 7) {
    const l = new THREE.Mesh(lampG, lampM); l.position.set(x, h - 2.3, z); l.userData.noFit = true; scene.add(l);
    const d = new THREE.Mesh(discG, discM); d.position.set(x, h - 2.3, z); d.userData.noFit = true; d.userData.noCast = true; scene.add(d);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 2.0, 4), lampM); w.position.set(x, h - 1.3, z); w.userData.noFit = true; scene.add(w);
  }
  // kapı: sağ duvarda seksiyonel kapı (kapalı), yanında yangın dolabı
  const door = add(new THREE.BoxGeometry(0.1, 5, 5).translate(x1 - 0.12, 2.5, -8), corrugated(0xd1d4d6));
  door.castShadow = false;
  const cab = add(new RoundedBoxGeometry(0.9, 1.2, 0.3, 2, 0.03).translate(x1 - 0.35, 1.5, 6), mat.paintedMetal({ color: 0xb3261e, wear: 0.15 }));
  cab.castShadow = false;
  // Arka duvar boyunca palet raf sistemi (mavi dikmeler, turuncu kirişler, 3 kat), üzerinde koli yüklü paletler
  {
    const up = [], bm = [], pals = [], boxes = [];
    const RZ = z0 + 1.6, DEP = 1.1, BAY = 2.7, LV = [0.12, 1.75, 3.4, 5.05];
    for (let x = x0 + 1.2, k = 0; x <= x1 - 4; x += BAY, k++) {
      for (const dz of [-DEP / 2, DEP / 2]) up.push(new THREE.BoxGeometry(0.1, 6.4, 0.08).translate(x, 3.2, RZ + dz).toNonIndexed());
      for (let y = 0.6; y < 6.4; y += 1.1) up.push(new THREE.BoxGeometry(0.04, 0.04, DEP).translate(x, y, RZ).toNonIndexed());
      if (x + BAY > x1 - 4) break;
      for (const y of LV.slice(1)) for (const dz of [-DEP / 2, DEP / 2]) bm.push(new THREE.BoxGeometry(BAY - 0.1, 0.14, 0.06).translate(x + BAY / 2, y - 0.07, RZ + dz).toNonIndexed());
      for (let l = 0; l < LV.length; l++) for (const px of [0.72, 1.98]) {
        const h = ((k * 7 + l * 3 + (px > 1 ? 5 : 0)) % 6);
        if (h === 5) continue;
        const cx = x + px, py = LV[l];
        pals.push(new THREE.BoxGeometry(1.2, 0.14, 1.0).translate(cx, py + 0.07, RZ).toNonIndexed());
        const n = 1 + (h % 3), bh = l === 0 ? 0.5 : 0.42;
        for (let j = 0; j < n && py + 0.14 + (j + 1) * bh < (LV[l + 1] ?? 6.7) - 0.18; j++) boxes.push(new RoundedBoxGeometry(1.1 - 0.06 * (h % 2), bh - 0.02, 0.9, 1, 0.02).translate(cx, py + 0.14 + bh / 2 + j * bh, RZ).toNonIndexed());
      }
    }
    add(BufferGeometryUtils.mergeGeometries(up), mat.paintedMetal({ color: 0x1f4f9a, wear: 0.15 }));
    add(BufferGeometryUtils.mergeGeometries(bm), mat.paintedMetal({ color: 0xe0661c, wear: 0.2 }));
    add(BufferGeometryUtils.mergeGeometries(pals), mat.wood({ color: 0xb08a5a, varnish: 0 }));
    add(BufferGeometryUtils.mergeGeometries(boxes), cardboard());
  }
  // Işıklıklardan giren güneş huzmeleri (havadaki toz): güneş yönünde eğik, yukarıda yoğun, zemine doğru sönen hacim
  {
    const sd = scene.userData.sunDirHint || new THREE.Vector3(0.11, 0.848, 0.518).normalize();
    const shaftM = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide,
      uniforms: { uCol: { value: new THREE.Color(1.0, 0.93, 0.8).multiplyScalar(0.07) } },
      vertexShader: `attribute vec3 aLoc; varying vec3 vL; varying vec3 vW; void main(){ vL = aLoc; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 uCol; varying vec3 vL; varying vec3 vW;
        float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
        void main(){
          float t = clamp(vW.y/11.0, 0.0, 1.0);
          float a = smoothstep(0.0, 0.7, t)*(0.35 + 0.65*t);
          float e = smoothstep(0.0, 0.08, 0.5 - abs(vL.x));
          float streak = 0.75 + 0.25*sin(vW.x*1.7 + vW.z*0.6) * sin(vW.x*0.37 - 1.3);
          gl_FragColor = vec4(uCol*a*e*streak, 1.0);
        }`,
    });
    for (const [a, b] of [[1.5, 4.5], [9.5, 12.5]]) {
      const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const Hs = h + 0.2;
      // birim kutu → ışıklık dikdörtgeni (y=0 zemin, y=1 çatı), güneşe doğru kaydırılmış (shear)
      const k = 1 / sd.y;
      const pos = g.attributes.position;
      const v = new THREE.Vector3();
      const loc = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        loc[i * 3] = v.x; loc[i * 3 + 1] = v.y; loc[i * 3 + 2] = v.z;
        const y = v.y;
        v.set((W - 1) * v.x + cx + sd.x * k * Hs * (y - 1), Hs * y, (b - a) * v.z + (a + b) / 2 + sd.z * k * Hs * (y - 1));
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      g.setAttribute('aLoc', new THREE.BufferAttribute(loc, 3));
      g.computeVertexNormals();
      const sh = new THREE.Mesh(g, shaftM);
      sh.userData.noCast = sh.userData.noAO = sh.userData.noFit = sh.userData.noShadow = true;
      sh.castShadow = false; sh.receiveShadow = false; sh.renderOrder = 5;
      scene.add(sh);
    }
  }
  // Tepe lambalarının ortama saçtığı sıcak beyaz ışık (seçili armatürlerde nokta ışık) + genel dolgu
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x6f675a, 0.55));
  for (const [x, z] of [[-9, -6], [-3, 1], [3, -6], [9, 1], [-9, 8], [3, 8]]) {
    const pl = new THREE.PointLight(0xfff1dc, 70, 0, 2);
    pl.position.set(x, h - 2.45, z);
    scene.add(pl);
  }
  // palet ve koliler (arka planda)
  const pal = mat.wood({ color: 0xb08a5a, varnish: 0 });
  for (const [x, z, n] of [[-17, -15, 3], [-14.5, -15, 2], [20, 16, 3], [-17, 16, 2]]) {
    add(new THREE.BoxGeometry(1.2, 0.14, 1.0).translate(x, 0.07, z), pal);
    for (let k = 0; k < n; k++) add(new RoundedBoxGeometry(1.1, 0.5, 0.9, 1, 0.02).translate(x, 0.39 + k * 0.5, z), cardboard());
  }
}

/** Konveyör bant: x0..x1 boyunca, üst yüzey y = top, genişlik w. Döner grup. */
export function conveyor(x0, x1, z, top, w, colorHex) {
  const g = new THREE.Group();
  const L = x1 - x0, cx = (x0 + x1) / 2;
  const frame = mat.brushedMetal({ color: 0xb9bec4, rough: 0.35 });
  const legs = mat.paintedMetal({ color: 0x3b3f44, wear: 0.2 });
  // PVC/kauçuk bant: enine ince nervürler, kenarlarda aşınma parlaklığı
  const belt = procedural({
    key: 'jev-belt', bump: 0.004, params: { color: 0x26292c, roughness: 0.7 },
    pattern: `float r = smoothstep(0.35, 0.5, abs(fract(p.x/0.035) - 0.5));
      float n = fbm3(p*vec3(0.6, 4.0, 4.0), 3), wear = vn3(vec3(p.x*0.3, 0.0, p.z*9.0));
      col *= 0.8 + 0.25*n + 0.12*r; rough = 0.62 + 0.18*n - 0.12*wear; h = r;`,
  });
  const m = (geo, mt) => { const o = new THREE.Mesh(geo, mt); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  m(new RoundedBoxGeometry(L, 0.05, w, 1, 0.02).translate(cx, top - 0.025, z), belt);
  for (const s of [-1, 1]) m(new RoundedBoxGeometry(L + 0.3, 0.18, 0.06, 1, 0.02).translate(cx, top - 0.02, z + s * (w / 2 + 0.04)), frame);
  for (const x of [x0 - 0.1, x1 + 0.1]) m(new THREE.CylinderGeometry(0.1, 0.1, w, 16).rotateX(Math.PI / 2).translate(x, top - 0.1, z), frame);
  // dönüş rulosu (bandın alt kolu üstünde döner) ve alt bant kolu
  const rolls = [];
  for (let x = x0 + 1.2; x < x1; x += 1.4) rolls.push(new THREE.CylinderGeometry(0.045, 0.045, w + 0.04, 14).rotateX(Math.PI / 2).translate(x, top - 0.2, z).toNonIndexed());
  m(BufferGeometryUtils.mergeGeometries(rolls), frame);
  m(new THREE.BoxGeometry(L, 0.012, w * 0.96).translate(cx, top - 0.252, z), belt);
  for (let x = x0 + 0.5; x <= x1; x += 2.8) for (const s of [-1, 1]) m(new THREE.BoxGeometry(0.06, top - 0.1, 0.06).translate(x, (top - 0.1) / 2, z + s * (w / 2 - 0.02)), legs);
  const guard = [];
  for (let x = x0 + 0.5; x <= x1; x += 2.8) guard.push(new THREE.BoxGeometry(0.05, 0.05, w).translate(x, 0.25, z).toNonIndexed());
  m(BufferGeometryUtils.mergeGeometries(guard), legs);
  // bant başı: besleme kutusu, üzerinde model rengi ışık şeridi
  m(new RoundedBoxGeometry(1.1, top + 0.55, w + 0.3, 2, 0.04).translate(x0 - 0.9, (top + 0.55) / 2, z), mat.paintedMetal({ color: 0xd9d6cf, wear: 0.2 }));
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, w + 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex).multiplyScalar(2.2) }));
  strip.position.set(x0 - 0.33, top + 0.35, z); g.add(strip);
  return g;
}

/** Bant sonu tarayıcı kapısı: çelik kemer + tamamlanan istekte parlayan şerit (emissive). */
export function scanGate(x, z, top, w, colorHex) {
  const g = new THREE.Group();
  const post = mat.paintedMetal({ color: 0x3b3f44, wear: 0.15 });
  const H = top + 0.9;
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new RoundedBoxGeometry(0.12, H, 0.12, 1, 0.02), post); p.position.set(x, H / 2, z + s * (w / 2 + 0.12)); p.castShadow = true; g.add(p); }
  const beam = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.2, w + 0.4, 1, 0.03), post); beam.position.set(x, H, z); beam.castShadow = true; g.add(beam);
  const col = new THREE.Color(colorHex);
  const light = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 0.6, roughness: 0.3 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, w + 0.2), light); bar.position.set(x - 0.11, H - 0.02, z); g.add(bar);
  return { group: g, light };
}

/** Cam silo: pirinç taban/kapak halkası + şeffaf tüp. */
export function silo(x, z, r, H) {
  const g = new THREE.Group();
  const brass = mat.brushedMetal({ color: 0xb08d57, rough: 0.3 });
  const base = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [r + 0.25, 0], [r + 0.25, 0.22], [r + 0.12, 0.3], [r + 0.05, 0.3], [0, 0.3]].map(([a, b]) => new THREE.Vector2(a, b)), 40), brass);
  base.castShadow = true; base.receiveShadow = true; g.add(base);
  const cap = new THREE.Mesh(new THREE.TorusGeometry(r + 0.03, 0.05, 8, 40).rotateX(Math.PI / 2).translate(0, H, 0), brass); g.add(cap);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, H - 0.3, 40, 1, true).translate(0, 0.3 + (H - 0.3) / 2, 0),
    new THREE.MeshStandardMaterial({ color: 0xd8e4ea, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }));
  tube.userData.noCast = true; g.add(tube);
  // ölçek çizgileri (her 8 jeton ≈ 10 kat)
  const ticks = [];
  for (let k = 1; k * 8 * 0.11 < H - 0.4; k++) ticks.push(new THREE.BoxGeometry(0.16, 0.012, 0.01).translate(0, 0.3 + k * 8 * 0.11, r + 0.005).toNonIndexed());
  if (ticks.length) g.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(ticks), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })));
  g.position.set(x, 0, z);
  g.traverse((o) => { o.userData.noFit = true; });
  return g;
}

/** Jeton: kenarı tırtıklı, yüzü kabartmalı madeni para (lathe). */
export function coinGeometry(r, t) {
  const pts = [[0, -t / 2], [r * 0.9, -t / 2], [r, -t * 0.35], [r, t * 0.35], [r * 0.9, t / 2], [r * 0.82, t * 0.42], [r * 0.8, t * 0.38], [0, t * 0.38]];
  return new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), 36);
}

/** Plastik sevkiyat kasası (hafif konik, kulp oyuklu). */
export function toteGeometry(s) {
  const g = new RoundedBoxGeometry(s, s * 0.8, s * 1.1, 2, s * 0.06);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / (s * 0.8) + 0.5; const k = 0.9 + 0.1 * y; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals();
  g.translate(0, s * 0.4, 0);
  return g;
}
