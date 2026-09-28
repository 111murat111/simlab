// Enerji şebekesi yapı kiti (sim klasörüne yerel yardımcı). Birimler metre, gerçek boyutlar:
// kafes iletim direği (42 m), rüzgâr türbini (82 m göbek, 42 m kanat), kömür santrali (180 m baca, 120 m hiperbolik
// soğutma kulesi, kazan binası, elektrofiltre, kömür stok sahası, konveyör), kombine çevrim doğalgaz santrali, beton
// ağırlık barajı + santral binası, trafo merkezi, konteyner batarya, tek eksenli güneş izleyici sıraları.
import { THREE, mat, procedural, RoundedBoxGeometry, BufferGeometryUtils, makeBuilding, streetLamps, streetMaterials } from '@core';

const merge = (list) => BufferGeometryUtils.mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
const _up = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0);
/** a → b arasında t kalınlığında köşebent/kiriş (kutu). */
export function bar(a, b, t = 0.2, t2 = t) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const g = new THREE.BoxGeometry(t, t2, L);
  const m = new THREE.Matrix4().lookAt(A, B, Math.abs(d.clone().normalize().y) > 0.95 ? _x : _up);
  g.applyMatrix4(m);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}

// ------------------------------------------------------------------ Malzemeler
let M = null;
export function mats() {
  if (M) return M;
  M = {
    galv: mat.brushedMetal({ color: 0x9da4a8, rough: 0.5 }),
    white: mat.paintedMetal({ color: 0xd8dbda, wear: 0.03 }),
    concrete: mat.concrete({ color: 0xbdb7aa, stains: 0.55 }),
    damC: mat.concrete({ color: 0xc4bdad, stains: 0.8, scale: 0.35 }),
    darkSteel: mat.paintedMetal({ color: 0x5a6166, wear: 0.25 }),
    trafo: mat.paintedMetal({ color: 0x7b8781, wear: 0.2 }),
    ceramic: mat.ceramic({ color: 0x6b3b22 }),
    clad: procedural({
      key: 'es-clad', params: { color: 0xb9c0c4, roughness: 0.45, metalness: 0.55 }, bump: 0.03,
      pattern: `
        vec3 a = axisDominant(pn);
        if (a.y > 0.5) { col = vec3(0.42, 0.42, 0.40)*(0.8 + 0.3*fbm3(p*0.3, 3)); rough = 0.9; metal = 0.0; h = 0.0; }
        else {
          float u = a.x > 0.5 ? p.z : p.x;
          float w = fwidth(u)*4.0;
          float rib = mix(smoothstep(0.25, 0.75, abs(fract(u*3.0) - 0.5)*2.0), 0.5, clamp(w, 0.0, 1.0));
          float seam = mix(smoothstep(0.0, 0.04, abs(fract(p.y/6.0) - 0.5)), 1.0, clamp(fwidth(p.y)*0.8, 0.0, 1.0));
          float st = fbm3(vec3(u*0.4, p.y*0.04, u*0.1), 4);
          col *= (0.9 + 0.1*rib)*(0.86 + 0.14*seam)*(0.84 + 0.2*st);
          col *= 1.0 - 0.12*smoothstep(0.0, 12.0, -p.y + 8.0);
          h = rib;
        }`,
    }),
    chimney: procedural({
      key: 'es-chimney', params: { color: 0xb3ab9f, roughness: 0.85 }, bump: 0.02, uniforms: { uTop: { value: 180 } },
      pattern: `
        float n = fbm3(p*vec3(0.25, 0.03, 0.25), 4);
        col *= 0.82 + 0.25*n;
        float d = uTop - p.y;
        if (d < 36.0) { float b = step(0.5, fract(d/12.0)); col = mix(vec3(0.82, 0.81, 0.78), vec3(0.55, 0.09, 0.07), b)*(0.9 + 0.12*n); rough = 0.6; }
        col *= 1.0 - 0.45*smoothstep(8.0, 0.0, d);
        h = n;`,
    }),
    tower: procedural({
      key: 'es-ctower', params: { color: 0xb8b2a6, roughness: 0.92, side: THREE.DoubleSide }, bump: 0.02,
      pattern: `
        float a = atan(p.z, p.x);
        float st = fbm3(vec3(a*30.0, p.y*0.035, 0.0), 4);
        float n = fbm3(p*0.2, 3);
        col *= (0.78 + 0.3*st)*(0.9 + 0.12*n);
        col *= 1.0 - 0.25*smoothstep(95.0, 120.0, p.y)*st;
        h = st;`,
    }),
    coal: procedural({
      key: 'es-coal', params: { color: 0x1d1c1b, roughness: 0.75, metalness: 0.1 }, bump: 0.08,
      pattern: `float n = fbm3(p*0.9, 4), c = vn3(p*6.0); col *= 0.7 + 0.5*n; rough = 0.6 + 0.3*c; h = n*0.7 + c*0.3;`,
    }),
    gravel: procedural({
      key: 'es-gravel', params: { color: 0x9a948a, roughness: 0.95 }, bump: 0.04,
      pattern: `float n = fbm3(p*0.5, 4), g = vn3(p*18.0); col *= 0.78 + 0.25*n + 0.1*(g - 0.5); h = g;`,
    }),
    container: procedural({
      key: 'es-container', params: { color: 0xe9ebe8, roughness: 0.5, metalness: 0.3 }, bump: 0.05,
      pattern: `
        vec3 a = axisDominant(pn);
        float u = a.x > 0.5 ? p.z : p.x;
        float w = clamp(fwidth(u)*6.0, 0.0, 1.0);
        float rib = mix(smoothstep(0.2, 0.8, abs(fract(u*3.6) - 0.5)*2.0), 0.5, w);
        col *= (a.y > 0.5 ? 0.92 : 0.92 + 0.08*rib)*(0.9 + 0.1*fbm3(p*0.8, 3));
        h = a.y > 0.5 ? 0.0 : rib;`,
    }),
    pv: procedural({
      physical: true, key: 'es-pv', params: { color: 0x101c2c, roughness: 0.14, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 }, bump: 0.0,
      pattern: `
        vec2 q = vec2(p.x/0.17, p.z/0.17);
        vec2 w = fwidth(q);
        float fade = clamp(max(w.x, w.y)*1.2, 0.0, 1.0);
        vec2 f = abs(fract(q) - 0.5)*2.0;
        float cell = smoothstep(0.86, 0.95, max(f.x, f.y));
        float fr = smoothstep(0.93, 0.985, abs(fract(p.z/1.05) - 0.5)*2.0);
        col = mix(col, vec3(0.3, 0.33, 0.36), mix(cell*0.35, 0.08, fade));
        col = mix(col, vec3(0.66, 0.68, 0.7), mix(fr, 0.06, fade));
        if (abs(pn.y) < 0.5) col = vec3(0.6, 0.62, 0.64);
        if (pn.y < -0.5) { col = vec3(0.85); metal = 0.0; rough = 0.6; }`,
    }),
    water: procedural({
      physical: true, key: 'es-water', params: { color: 0x0f2a30, roughness: 0.04, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.02 }, bump: 0.3,
      pattern: `float n = fbm3(vec3(p.x*0.05, 0.0, p.z*0.09), 4); col *= 0.85 + 0.3*n; h = fbm3(vec3(p.x*0.6, 0.0, p.z*0.9), 3);`,
    }),
    // Pencere camı: kırılma (transmission) yok — ekstra sahne geçişi istemez; kayıt/kayıt çerçeveli, gök yansıtan, bazı camlar stor
    win: procedural({
      key: 'es-win', params: { color: 0x33434d, roughness: 0.1, metalness: 0.55 }, bump: 0.02,
      pattern: `
        vec3 a = axisDominant(pn);
        float u = a.x > 0.5 ? p.z : p.x;
        vec2 q = vec2(u/1.55, p.y/1.9);
        vec2 f = abs(fract(q) - 0.5)*2.0;
        float w = clamp(max(fwidth(q.x), fwidth(q.y))*2.5, 0.0, 1.0);
        float frame = mix(smoothstep(0.86, 0.93, max(f.x, f.y)), 0.18, w);
        float id = h13(vec3(floor(q), 3.0));
        col *= 0.75 + 0.35*id;
        col = mix(col, vec3(0.62, 0.6, 0.55), step(0.82, id)*0.55*(1.0 - w));
        col = mix(col, vec3(0.3, 0.32, 0.34), frame);
        rough = mix(0.08, 0.45, frame); metal = mix(0.55, 0.35, frame);
        h = 1.0 - frame;`,
    }),
    // Cam izolatör (koyu yeşil, parlak) — kırılmasız
    insG: procedural({
      key: 'es-insg', params: { color: 0x2f5a4c, roughness: 0.12, metalness: 0.15 }, bump: 0.0,
      pattern: `col *= 0.85 + 0.3*vn3(p*3.0);`,
    }),
    yellow: mat.paintedMetal({ color: 0xd9a51c, wear: 0.25 }),
    alu: mat.brushedMetal({ color: 0xc6cacc, rough: 0.42 }), // yalıtımlı boru alüminyum kaplaması
    roofM: mat.paintedMetal({ color: 0x5f6d72, wear: 0.12 }),
    towerIn: procedural({
      key: 'es-ctower-in', params: { color: 0x6f6a61, roughness: 0.95, side: THREE.DoubleSide }, bump: 0.02,
      pattern: `float st = fbm3(vec3(atan(p.z, p.x)*30.0, p.y*0.05, 0.0), 4); col *= (0.55 + 0.35*st)*(0.65 + 0.35*smoothstep(10.0, 60.0, p.y)); h = st;`,
    }),
    rim: mat.concrete({ color: 0x9d978b, stains: 0.8, scale: 0.5 }),
    // Tesis sahası: çakıl + beton plak bölgeleri, büyük ölçekli ton farkı, yağ/ıslaklık lekeleri, araç izleri
    yard: procedural({
      key: 'es-yard', params: { color: 0x9b958a, roughness: 0.93 }, bump: 0.03,
      pattern: `
        float big = fbm3(p*0.018, 3), n = fbm3(p*0.5, 4), g = vn3(p*16.0);
        col *= (0.72 + 0.42*big)*(0.84 + 0.22*n + 0.08*(g - 0.5));
        vec2 q = p.xz/vec2(6.0, 5.0), f = abs(fract(q) - 0.5)*2.0;
        float j = smoothstep(0.92, 0.98, max(f.x, f.y))*(1.0 - smoothstep(0.1, 0.4, length(fwidth(q))));
        float slab = smoothstep(0.5, 0.56, fbm3(p*0.011 + 3.0, 3));
        col = mix(col, vec3(0.62, 0.6, 0.56)*(0.9 + 0.15*n)*(1.0 - 0.4*j), slab);
        float tr = 1.0 - smoothstep(0.0, 0.04, abs(abs(fract(p.x/9.0 + 0.2*fbm3(p*0.02, 2)) - 0.5) - 0.42));
        col *= 1.0 - 0.12*tr*(1.0 - slab);
        col *= 1.0 - 0.28*smoothstep(0.62, 0.8, fbm3(p*0.07 + 7.0, 3));
        rough = mix(0.95, 0.8, slab);
        h = mix(g, 1.0 - j, slab);`,
    }),
    mesh: procedural({
      key: 'es-mesh', params: { color: 0x8f9699, roughness: 0.55, metalness: 0.6, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }, bump: 0,
      pattern: `col *= 0.85 + 0.3*vn3(p*0.5);`,
    }),
  };
  return M;
}

// ------------------------------------------------------------------ Kafes direk
/** Tek devre kafes direk; kollar ±x, hat doğrultusu z. Döner {steel, ins, att:[[x,y]...], top} */
export function latticeTower() {
  const H = 42, levels = [0, 6, 12, 18, 24, 30, 36, 42];
  const hw = (y) => (y <= 30 ? 4 - 2.8 * (y / 30) : 1.2 - 0.25 * ((y - 30) / 12));
  const parts = [];
  const corner = (y, sx, sz) => [sx * hw(y), y, sz * hw(y)];
  const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < levels.length - 1; i++) {
    const y0 = levels[i], y1 = levels[i + 1];
    for (let c = 0; c < 4; c++) {
      const [sx, sz] = C[c], [tx, tz] = C[(c + 1) % 4];
      parts.push(bar(corner(y0, sx, sz), corner(y1, sx, sz), 0.34));
      parts.push(bar(corner(y1, sx, sz), corner(y1, tx, tz), 0.16));
      parts.push(bar(corner(y0, sx, sz), corner(y1, tx, tz), 0.12));
      parts.push(bar(corner(y0, tx, tz), corner(y1, sx, sz), 0.12));
    }
  }
  const att = [];
  for (const [y, L] of [[30, 9], [36, 6.5]]) for (const s of [-1, 1]) {
    const tip = [s * L, y, 0];
    parts.push(bar(corner(y, s, -1), tip, 0.2), bar(corner(y, s, 1), tip, 0.2));
    parts.push(bar([s * hw(y + 2.6) * 0.9, y + 2.6, 0], tip, 0.16));
    parts.push(bar(corner(y, s, -1), corner(y, s, 1), 0.16));
    att.push([s * L, y - 2.9]);
  }
  parts.push(bar([-1.1, H, 0], [1.1, H, 0], 0.16), bar([0, H, 0], [0, H + 2.2, 0], 0.18));
  const steel = merge(parts);
  // Cam/porselen izolatör zincirleri
  const disc = [];
  for (const [x, y] of att) for (let k = 0; k < 11; k++) disc.push(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10).translate(x, y + 0.2 + k * 0.24, 0));
  const ins = merge(disc);
  return { steel, ins, att, top: [0, H + 2.2] };
}

// ------------------------------------------------------------------ Rüzgâr türbini
function bladeGeo(R = 42) {
  const secs = 20, ring = 12, pos = [], idx = [];
  for (let i = 0; i <= secs; i++) {
    const t = i / secs, r = 1.6 + t * (R - 1.6);
    const chord = t < 0.2 ? THREE.MathUtils.lerp(1.9, 3.4, t / 0.2) : THREE.MathUtils.lerp(3.4, 0.45, Math.pow((t - 0.2) / 0.8, 0.8));
    const th = chord * THREE.MathUtils.lerp(0.95, 0.13, Math.min(1, t * 3.5));
    const tw = THREE.MathUtils.lerp(0.32, 0.0, t);
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2, c = Math.cos(a);
      const cx = c * chord * 0.5 + chord * 0.12, cz = Math.sin(a) * th * 0.5 * (c > 0 ? 0.6 : 1);
      pos.push(cx * Math.cos(tw) - cz * Math.sin(tw), r, cx * Math.sin(tw) + cz * Math.cos(tw));
    }
  }
  for (let i = 0; i < secs; i++) for (let k = 0; k < ring; k++) {
    const a = i * ring + k, b = i * ring + ((k + 1) % ring), c = a + ring, d = b + ring;
    idx.push(a, c, b, b, c, d);
  }
  const tip = pos.length / 3;
  pos.push(0.05, R + 0.25, 0);
  for (let k = 0; k < ring; k++) idx.push(secs * ring + k, tip, secs * ring + ((k + 1) % ring));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
let TB = null;
/** Döner { group, rotor, beacon } — rotor +z'ye bakar, rotation.z ile döner. */
export function windTurbine() {
  const K = mats();
  if (!TB) {
    const prof = [[0.001, 0], [2.25, 0], [2.2, 0.6], [2.1, 2], [1.3, 80], [1.2, 80.4], [0.001, 80.4]].map(([a, b]) => new THREE.Vector2(a, b));
    const sp = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; sp.push(new THREE.Vector2(Math.max(0.001, 1.75 * Math.sqrt(Math.max(0, 1 - t * t))), t * 3.6)); }
    TB = {
      tower: new THREE.LatheGeometry(prof, 28),
      base: new THREE.CylinderGeometry(3.2, 3.4, 0.8, 24).translate(0, 0.4, 0),
      nac: new RoundedBoxGeometry(3.8, 3.9, 11.5, 3, 1.1).translate(0, 82, -2.4),
      spin: new THREE.LatheGeometry(sp, 20).rotateX(Math.PI / 2),
      blade: bladeGeo(42),
      beacon: new THREE.SphereGeometry(0.35, 10, 8).translate(0, 84.1, -6.5),
    };
    TB.bladeM = K.white.clone(); TB.bladeM.side = THREE.DoubleSide;
    TB.bladeM.onBeforeCompile = K.white.onBeforeCompile; TB.bladeM.customProgramCacheKey = K.white.customProgramCacheKey; TB.bladeM.userData = K.white.userData;
    TB.beaconM = mat.glow({ color: 0xff2010, intensity: 0 });
  }
  const g = new THREE.Group();
  const add = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  add(TB.tower, K.white); add(TB.base, K.concrete); add(TB.nac, K.white);
  add(TB.beacon, TB.beaconM);
  const rotor = new THREE.Group();
  rotor.position.set(0, 82, 3.7);
  const sp = new THREE.Mesh(TB.spin, K.white); sp.castShadow = true; rotor.add(sp);
  for (let k = 0; k < 3; k++) {
    const b = new THREE.Mesh(TB.blade, TB.bladeM);
    b.rotation.z = (k * Math.PI * 2) / 3; b.position.z = 1.2; b.castShadow = true;
    rotor.add(b);
  }
  g.add(rotor);
  return { group: g, rotor, beaconM: TB.beaconM };
}

// ------------------------------------------------------------------ Endüstriyel ayrıntı yardımcıları
// Parçalar malzeme kovalarında toplanır (G.win, G.steel, …) ve sonunda malzeme başına tek geometriye birleşir.
const rectPath = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]];
/** w×d kutunun seçili yüzlerine (+z, −z, +x, −x) ys kotlarında şerit pencere + denizlik + başlık. */
function ribbons(G, cx, cz, w, d, ys, wh = 1.9, sides = [1, 1, 1, 1], inset = 2.5) {
  const F = [[0, 1], [0, -1], [1, 1], [1, -1]];
  for (const y of ys) F.forEach(([ax, s], i) => {
    if (!sides[i]) return;
    const L = (ax ? d : w) - 2 * inset, off = (ax ? w : d) / 2;
    const at = (o) => [cx + (ax ? s * (off + o) : 0), cz + (ax ? 0 : s * (off + o))];
    const box = (a, b, c) => (ax ? new THREE.BoxGeometry(c, b, a) : new THREE.BoxGeometry(a, b, c));
    let [px, pz] = at(0.06);
    G.win.push(box(L, wh, 0.3).translate(px, y + wh / 2, pz));
    [px, pz] = at(0.32);
    G.steel.push(box(L + 0.5, 0.28, 0.75).translate(px, y - 0.14, pz), box(L + 0.5, 0.22, 0.6).translate(px, y + wh + 0.11, pz));
  });
}
/** Korkuluk: dikmeler + küpeşte + ara lama (yol noktaları xz, kot y). */
function railing(list, pts, y, h = 1.1, step = 2.2) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / step));
    for (let k = i ? 1 : 0; k <= n; k++) { const t = k / n; list.push(new THREE.BoxGeometry(0.07, h, 0.07).translate(ax + (bx - ax) * t, y + h / 2, az + (bz - az) * t)); }
    list.push(bar([ax, y + h, az], [bx, y + h, bz], 0.065), bar([ax, y + h * 0.5, az], [bx, y + h * 0.5, bz], 0.045));
  }
}
/** Tel örgü çit: dikme + üç yatay boru + dikenli tel kolu; tel örgü yarı saydam panel. */
function fence(G, pts, h = 2.4, step = 3, gaps = []) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / step));
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    const inGap = (x, z) => gaps.some(([gx0, gz0, gx1, gz1]) => x >= gx0 && x <= gx1 && z >= gz0 && z <= gz1);
    let run = null;
    const flush = (end) => {
      if (!run) return;
      const [sx, sz] = run, ex = end[0], ez = end[1], len = Math.hypot(ex - sx, ez - sz);
      if (len > 0.5) {
        for (const y of [0.12, h * 0.5, h]) G.galv.push(bar([sx, y, sz], [ex, y, ez], 0.06));
        G.mesh.push(new THREE.PlaneGeometry(len, h - 0.1).rotateY(-Math.atan2(ez - sz, ex - sx)).translate((sx + ex) / 2, h / 2 + 0.05, (sz + ez) / 2));
      }
      run = null;
    };
    for (let k = 0; k <= n; k++) {
      const x = ax + ux * L * (k / n), z = az + uz * L * (k / n);
      if (inGap(x, z)) { flush([x - ux * (L / n), z - uz * (L / n)]); continue; }
      G.galv.push(new THREE.BoxGeometry(0.08, h + 0.45, 0.08).translate(x, (h + 0.45) / 2, z));
      if (!run) run = [x, z];
      if (k === n) flush([x, z]);
    }
  }
}
/** Boru köprüsü a → b (xz): portal çerçeveler + alüminyum kaplı borular + kablo tavası. */
function pipeRack(G, a, b, y = 8, w = 5, step = 7, pipes = [0.9, 0.6, 0.45]) {
  const [ax, az] = a, [bx, bz] = b, L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, rx = -uz, rz = ux;
  const n = Math.max(1, Math.round(L / step));
  for (let k = 0; k <= n; k++) {
    const x = ax + ux * L * (k / n), z = az + uz * L * (k / n);
    const p0 = [x - rx * w / 2, z - rz * w / 2], p1 = [x + rx * w / 2, z + rz * w / 2];
    for (const [px, pz] of [p0, p1]) G.steel.push(bar([px, 0, pz], [px, y + 3.2, pz], 0.4));
    G.steel.push(bar([p0[0], y, p0[1]], [p1[0], y, p1[1]], 0.35, 0.5), bar([p0[0], y + 3.2, p0[1]], [p1[0], y + 3.2, p1[1]], 0.3, 0.4));
    if (k < n) G.steel.push(bar([p0[0], 0.3, p0[1]], [x + rx * w / 2 + ux * L / n, y, z + rz * w / 2 + uz * L / n], 0.18)); // çapraz
  }
  let o = -w / 2 + 0.4;
  for (const r of pipes) {
    o += r;
    const cyl = new THREE.CylinderGeometry(r, r, L, 14).rotateX(Math.PI / 2).rotateY(Math.atan2(ux, uz));
    G.alu.push(cyl.translate((ax + bx) / 2 + rx * o, y + 0.25 + r, (az + bz) / 2 + rz * o));
    o += r + 0.25;
  }
  G.steel.push(bar([ax + rx * 1.2, y + 3.45, az + rz * 1.2], [bx + rx * 1.2, y + 3.45, bz + rz * 1.2], 1.4, 0.18)); // kablo tavası
}
/** Porselen buşing / izolatör: çanaklı döner profil (h yükseklik, r gövde yarıçapı). */
function bushingGeo(h = 4, r = 0.28, sheds = 10) {
  const pts = [new THREE.Vector2(0.001, 0), new THREE.Vector2(r * 1.5, 0), new THREE.Vector2(r * 1.4, 0.3)];
  for (let k = 0; k < sheds; k++) {
    const y = 0.35 + ((h - 0.7) * k) / sheds, s = (h - 0.7) / sheds;
    pts.push(new THREE.Vector2(r, y), new THREE.Vector2(r * 2.1, y + s * 0.25), new THREE.Vector2(r * 1.9, y + s * 0.45), new THREE.Vector2(r, y + s * 0.6));
  }
  pts.push(new THREE.Vector2(r * 1.2, h - 0.3), new THREE.Vector2(r * 0.6, h), new THREE.Vector2(0.001, h));
  return new THREE.LatheGeometry(pts, 12);
}
/** Güç trafosu (x, z): tank, radyatör bankaları, genleşme tankı, YG/AG buşingleri. */
function powerTransformer(G, x, z, s = 1) {
  G.trafo.push(new RoundedBoxGeometry(9 * s, 5.5 * s, 5 * s, 2, 0.25).translate(x, 2.75 * s + 0.4, z));
  G.trafo.push(new RoundedBoxGeometry(9.6 * s, 0.4, 5.6 * s, 1, 0.1).translate(x, 0.2, z)); // kaide
  for (const sz of [-1, 1]) for (let f = 0; f < 14; f++) G.trafo.push(new THREE.BoxGeometry(0.1, 4.2 * s, 1.5 * s).translate(x - 4 * s + f * 0.62 * s, 2.9 * s, z + sz * 3.4 * s));
  for (const sz of [-1, 1]) G.trafo.push(bar([x - 4.3 * s, 4.8 * s, z + sz * 3.4 * s], [x + 4.3 * s, 4.8 * s, z + sz * 3.4 * s], 0.18, 0.3));
  G.trafo.push(new THREE.CylinderGeometry(0.8 * s, 0.8 * s, 6 * s, 16).rotateZ(Math.PI / 2).translate(x, 7.4 * s, z - 1.6 * s));
  for (const dx of [-2.4, 2.4]) G.trafo.push(bar([x + dx * s, 5.8 * s, z - 1.6 * s], [x + dx * s, 7 * s, z - 1.6 * s], 0.25));
  for (let b = 0; b < 3; b++) {
    G.ins.push(bushingGeo(4.2 * s, 0.26 * s, 9).translate(x - 2.6 * s + b * 2.6 * s, 6.1 * s, z + 0.8 * s));
    G.ins.push(bushingGeo(1.4 * s, 0.16 * s, 4).translate(x - 2.6 * s + b * 2.6 * s, 6.1 * s, z - 0.4 * s));
  }
}
/** Şalt sahası portali: kafes kolon çifti + kiriş + asılı izolatör zincirleri; kotlar metre. */
function gantry(G, x, z, span = 14, h = 16, along = 'x') {
  const P = (u, y, v) => (along === 'x' ? [x + u, y, z + v] : [x + v, y, z + u]);
  for (const u of [-span / 2, span / 2]) {
    for (const [a, b] of [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]]) G.galv.push(bar(P(u + a, 0, b), P(u + a * 0.5, h, b * 0.5), 0.16));
    for (let y = 2; y < h; y += 2.4) G.galv.push(bar(P(u - 0.6, y, -0.6), P(u + 0.5, y + 2.2, 0.5), 0.08), bar(P(u + 0.6, y, -0.6), P(u - 0.5, y + 2.2, 0.5), 0.08));
  }
  for (const [a, b] of [[-0.5, 0], [0.5, 0]]) G.galv.push(bar(P(-span / 2, h + a, b), P(span / 2, h + a, b), 0.14));
  for (let u = -span / 2; u < span / 2; u += 1.2) G.galv.push(bar(P(u, h - 0.5, 0), P(u + 1.2, h + 0.5, 0), 0.07));
  for (const u of [-span / 4, 0, span / 4]) G.ins.push(bushingGeo(2.2, 0.1, 9).rotateX(Math.PI).translate(...P(u, h - 0.5, 0)));
}
/** Çelik kafes (brace) cephesi: yüzey üzerinde X çaprazlar. */
function braceFace(list, x0, x1, y0, y1, z, nx = 4, ny = 3) {
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const a = x0 + ((x1 - x0) * i) / nx, b = x0 + ((x1 - x0) * (i + 1)) / nx, c = y0 + ((y1 - y0) * j) / ny, d = y0 + ((y1 - y0) * (j + 1)) / ny;
    list.push(bar([a, c, z], [b, d, z], 0.3), bar([b, c, z], [a, d, z], 0.3), bar([a, d, z], [b, d, z], 0.35));
  }
}

// ------------------------------------------------------------------ Kömür santrali
/** Yerel koordinat: zemin y=0, ön (giriş) cephe +z. Döner { group, chimneyTop, towerTop, towerR, lights, lamps } */
export function coalPlant() {
  const K = mats(), g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const blk = (w, h, d, m, x, z, y = 0) => add(new RoundedBoxGeometry(w, h, d, 2, 0.4).translate(0, h / 2, 0), m, x, y, z);
  const G = { win: [], steel: [], galv: [], yellow: [], alu: [], trafo: [], ins: [], mesh: [], conc: [], roof: [] };

  // Saha: çakıl zemin, asfalt iç yollar
  add(new RoundedBoxGeometry(330, 0.2, 250, 1, 0.08).translate(-35, 0.06, -40), K.yard).castShadow = false;
  const G2 = streetMaterials();
  const roads = [new THREE.BoxGeometry(392, 0.14, 8).translate(-5, 0.2, 110), new THREE.BoxGeometry(9, 0.14, 62).translate(0, 0.21, 139)];
  add(merge(roads), G2.asphalt).castShadow = false;

  // Kazan binası (46×78×42) + üst yapı: kaplama paneli, şerit pencereler, köşe kolonları, merdiven kulesi, çatı korkuluğu
  blk(46, 78, 42, K.clad, 0, 0);
  blk(20, 12, 40, K.clad, 0, 0, 78);
  ribbons(G, 0, 0, 46, 42, [9, 21, 33, 45, 57, 69]);
  ribbons(G, 0, 0, 20, 40, [83], 1.6, [1, 1, 0, 0], 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) G.steel.push(new RoundedBoxGeometry(1.5, 79, 1.5, 1, 0.2).translate(sx * 23, 39.5, sz * 21));
  for (const x of [-7.7, 7.7]) for (const sz of [-1, 1]) G.steel.push(new THREE.BoxGeometry(0.9, 78, 0.6).translate(x, 39, sz * 21.2));
  blk(8, 88, 8, K.clad, -27, 18);
  G.win.push(new THREE.BoxGeometry(1.4, 82, 0.3).translate(-27, 44, 22.1));
  railing(G.yellow, rectPath(-22.6, -20.6, 22.6, 20.6), 78);
  railing(G.yellow, rectPath(-9.6, -19.6, 9.6, 19.6), 90);
  for (const [x, z] of [[-15, -12], [-15, 10], [15, -12], [15, 10]]) G.alu.push(new RoundedBoxGeometry(3.2, 2.2, 3.2, 1, 0.3).translate(x, 79.1, z));
  // Dış merdiven (kazan binası batı yüzü, zikzak kollar + sahanlıklar)
  for (let i = 0; i < 13; i++) {
    const y = i * 6, za = i % 2 ? 11 : -13, zb = i % 2 ? -13 : 11;
    G.yellow.push(bar([-24.5, y, za], [-24.5, y + 6, zb], 1.1, 0.25));
    G.steel.push(new THREE.BoxGeometry(2.2, 0.2, 2.6).translate(-24.5, y + 6, zb + (i % 2 ? -1.3 : 1.3)));
  }
  // Türbin salonu: basık kemer çatı, üst bant cam, pilastrlar, büyük kapı
  blk(84, 36, 40, K.clad, 66, 0);
  {
    const s = new THREE.Shape();
    for (let i = 0; i <= 16; i++) { const t = i / 16, zz = -20.6 + 41.2 * t; s[i ? 'lineTo' : 'moveTo'](zz, 36 + 3.4 * (1 - ((2 * t - 1) ** 2))); }
    for (let i = 16; i >= 0; i--) { const t = i / 16, zz = -20.6 + 41.2 * t; s.lineTo(zz, 35.5 + 3.4 * (1 - ((2 * t - 1) ** 2))); }
    G.roof.push(new THREE.ExtrudeGeometry(s, { depth: 85, bevelEnabled: false, curveSegments: 2 }).rotateY(Math.PI / 2).translate(66 - 42.5, 0, 0));
  }
  ribbons(G, 66, 0, 84, 40, [25], 5.5, [1, 1, 1, 0], 3);
  ribbons(G, 66, 0, 84, 40, [5], 1.6, [1, 1, 0, 0], 4);
  for (let x = 28; x <= 104; x += 9.5) for (const sz of [-1, 1]) G.steel.push(new THREE.BoxGeometry(0.8, 36, 0.7).translate(x, 18, sz * 20.3));
  G.steel.push(new THREE.BoxGeometry(0.4, 12.5, 10.5).translate(108.2, 6.25, 6));
  G.roof.push(new THREE.BoxGeometry(0.25, 12, 10).translate(108.45, 6, 6)); // sarmal kepenk
  railing(G.yellow, [[24, 20.3], [108, 20.3]], 36);
  // Elektrofiltre: yükseltilmiş kutu + dikme ribleri + çatı mahfazaları + bunkerler
  blk(34, 30, 34, K.darkSteel, -2, -56, 6);
  for (let k = 0; k <= 12; k++) for (const sx of [-1, 1]) G.steel.push(new THREE.BoxGeometry(0.35, 30, 0.5).translate(-2 + sx * 17.2, 21, -73 + k * 2.83));
  for (let k = 0; k <= 12; k++) G.steel.push(new THREE.BoxGeometry(0.5, 30, 0.35).translate(-19 + k * 2.83, 21, -38.8));
  for (const x of [-10, 6]) G.alu.push(new RoundedBoxGeometry(9, 3, 26, 1, 0.3).translate(x, 37.5, -56));
  railing(G.yellow, rectPath(-18.6, -72.6, 14.6, -39.4), 36);
  for (const x of [-14, 10]) for (const z of [-44, -68]) add(new THREE.CylinderGeometry(0.8, 0.8, 6, 10).translate(0, 3, 0), K.darkSteel, x, 0, z);
  for (const x of [-10, 6]) add(new THREE.ConeGeometry(7, 7, 4).rotateY(Math.PI / 4).rotateX(Math.PI).translate(0, 3.5, 0), K.darkSteel, x, 2.5, -56);
  // Baca gazı kanalı → baca (kanal: nervürlü kaplama, taşıyıcı ayaklar)
  add(bar([-2, 26, -74], [-2, 26, -104], 7, 8), K.clad);
  for (const z of [-80, -90, -100]) G.steel.push(bar([-5, 0, z], [-5, 22, z], 0.5), bar([1, 0, z], [1, 22, z], 0.5), bar([-5, 22, z], [1, 22, z], 0.5));
  // Baca 180 m: kırmızı-beyaz bantlar (malzemede), galeriler, dış merdiven kafesi, uçak ikaz ışıkları
  const cp = [[0.001, 0], [10.5, 0], [10.2, 3], [6.2, 180], [6.6, 180.4], [6.6, 181.2], [5.4, 181.2], [5.4, 176], [0.001, 176]].map(([a, b]) => new THREE.Vector2(a, b));
  add(new THREE.LatheGeometry(cp, 36), K.chimney, -2, 0, -112);
  for (const y of [60, 120, 150, 170]) {
    const r = 10.2 - (4 * (y - 3)) / 177;
    add(new THREE.TorusGeometry(r + 0.9, 0.18, 6, 40).rotateX(Math.PI / 2), K.galv, -2, y, -112);
    add(new THREE.TorusGeometry(r + 1.8, 0.07, 4, 40).rotateX(Math.PI / 2).translate(0, 1.1, 0), K.galv, -2, y, -112);
    G.steel.push(new THREE.RingGeometry(r + 0.1, r + 1.9, 40).rotateX(-Math.PI / 2).translate(-2, y - 0.02, -112));
  }
  for (const dz of [-0.4, 0.4]) G.galv.push(bar([-2 + 10.45, 3, -112 + dz], [-2 + 6.45, 180, -112 + dz], 0.09));
  for (let y = 6; y < 178; y += 2.2) { const r = 10.2 - (4 * (y - 3)) / 177; G.galv.push(bar([-2 + r + 0.25, y, -112.4], [-2 + r + 0.25, y, -111.6], 0.06)); }
  // Hiperbolik soğutma kulesi: kabuk (dış/iç ayrı malzeme), üst kenar kirişi, ayak halkası, havuz duvarı, yıldırımlık, basınçlı su boruları
  const a = 30, y0 = 92, b = 69.7, prof = [];
  for (let i = 0; i <= 28; i++) { const y = 8 + (i / 28) * 112; prof.push(new THREE.Vector2(a * Math.sqrt(1 + ((y - y0) / b) ** 2), y)); }
  const TX = -150, TZ = 10;
  add(new THREE.LatheGeometry(prof, 72), K.tower, TX, 0, TZ);
  add(new THREE.LatheGeometry(prof.slice().reverse().map((v) => new THREE.Vector2(v.x - 0.7, v.y)), 72), K.towerIn, TX, 0, TZ);
  const rT = prof.at(-1).x, r0 = prof[0].x;
  add(new THREE.LatheGeometry([[rT - 0.9, 119.2], [rT + 0.35, 119.4], [rT + 0.55, 120.2], [rT + 0.45, 121.3], [rT - 0.9, 121.3]].map(([x, y]) => new THREE.Vector2(x, y)), 72), K.rim, TX, 0, TZ);
  add(new THREE.LatheGeometry([[r0 - 0.8, 7.6], [r0 + 0.9, 7.6], [r0 + 1.1, 8.3], [r0 + 0.8, 9.4], [r0 - 0.8, 9.4]].map(([x, y]) => new THREE.Vector2(x, y)), 72), K.rim, TX, 0, TZ);
  const legs = [];
  for (let k = 0; k < 48; k++) {
    const t0 = (k / 48) * Math.PI * 2, t1 = t0 + Math.PI / 48 * 1.6;
    legs.push(bar([Math.cos(t0) * (r0 + 1.5), 0, Math.sin(t0) * (r0 + 1.5)], [Math.cos(t1) * r0, 8.2, Math.sin(t1) * r0], 0.9));
    legs.push(bar([Math.cos(t1) * (r0 + 1.5), 0, Math.sin(t1) * (r0 + 1.5)], [Math.cos(t0) * r0, 8.2, Math.sin(t0) * r0], 0.9));
  }
  add(merge(legs), K.concrete, TX, 0, TZ);
  add(new THREE.CylinderGeometry(r0 + 2, r0 + 2, 0.6, 48).translate(0, 0.3, 0), K.water, TX, 0.1, TZ); // havuz
  add(new THREE.LatheGeometry([[r0 + 2, 0], [r0 + 3.2, 0], [r0 + 3.2, 1.3], [r0 + 2, 1.3]].map(([x, y]) => new THREE.Vector2(x, y)), 64), K.rim, TX, 0, TZ);
  for (const th of [0.9, 2.6, 4.4]) {
    const c = new THREE.CatmullRomCurve3(prof.map((v) => new THREE.Vector3(Math.cos(th) * (v.x + 0.25), v.y, Math.sin(th) * (v.x + 0.25))));
    G.steel.push(new THREE.TubeGeometry(c, 40, 0.09, 4).translate(TX, 0, TZ));
  }
  for (const dz of [-3.2, 3.2]) G.alu.push(bar([TX + r0 + 2, 1.9, TZ + dz], [-24, 1.9, 10 + dz], 2.6));
  for (let x = TX + r0 + 8; x < -26; x += 9) for (const dz of [-3.2, 3.2]) G.conc.push(new RoundedBoxGeometry(1.2, 1.4, 3.6, 1, 0.1).translate(x, 0.7, 10 + dz));
  // Boru köprüleri: kazan binası → soğutma kulesi yönü, türbin salonu → su arıtma tankları
  pipeRack(G, [-104, 44], [-24, 44], 8, 5, 8, [0.9, 0.7, 0.45, 0.35]);
  pipeRack(G, [108, -12], [124, -12], 7, 4, 8, [0.55, 0.4, 0.3]);
  for (const z of [-4, -26]) {
    add(new THREE.LatheGeometry([[0.001, 0], [7, 0], [7, 12], [6.6, 12.9], [3, 13.8], [0.001, 14]].map(([x, y]) => new THREE.Vector2(x, y)), 32), K.white, 134, 0, z);
    G.yellow.push(new THREE.TorusGeometry(7.4, 0.05, 4, 32).rotateX(Math.PI / 2).translate(134, 13.2, z));
  }
  // Kömür stok sahası + konveyör galerisi + istifleyici
  const pile = (sx, sy, sz, seed) => {
    const gg = new THREE.IcosahedronGeometry(1, 5), p = gg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.08 * Math.sin(x * 9 + seed) * Math.cos(z * 7 - seed) + 0.05 * Math.sin(y * 13 + seed * 2);
      p.setXYZ(i, x * sx * n, Math.max(0, y) * sy * n - 0.5, z * sz * n);
    }
    gg.computeVertexNormals();
    return gg;
  };
  add(pile(70, 16, 22, 1), K.coal, 60, 0, -70);
  add(pile(55, 13, 20, 4), K.coal, 60, 0, -118);
  const gal = [bar([60, 3, -94], [12, 46, -10], 4.5, 3.8)];
  for (let k = 1; k < 5; k++) { const t = k / 5, x = 60 - 48 * t, y = 3 + 43 * t, z = -94 + 84 * t; gal.push(bar([x - 1.5, 0, z], [x - 1.5, y - 2, z], 0.7), bar([x + 1.5, 0, z], [x + 1.5, y - 2, z], 0.7), bar([x - 1.5, y - 2, z], [x + 1.5, y - 2, z], 0.6)); }
  add(merge(gal), K.clad);
  add(bar([20, 12, -94], [100, 12, -94], 2.2), K.darkSteel);
  add(bar([58, 0, -94], [58, 14, -94], 3), K.darkSteel);
  add(bar([58, 14, -94], [58, 18, -70], 1.4), K.darkSteel);
  // Blok trafoları (yangın duvarlı) + faz izoleli bara kanalı + şalt sahası (portaller, bara boruları, ayırıcılar)
  for (let k = 0; k < 3; k++) {
    const x = 42 + k * 20;
    powerTransformer(G, x, 36);
    for (let p = -1; p <= 1; p++) G.alu.push(bar([x + p * 2.6, 9, 20.4], [x + p * 2.6, 9, 32], 0.9), bar([x + p * 2.6, 9, 32], [x + p * 2.6, 6.6, 36.8], 0.9));
  }
  for (const x of [32, 52, 72, 92]) G.conc.push(new RoundedBoxGeometry(0.5, 9, 11, 1, 0.1).translate(x, 4.5, 36));
  add(new THREE.BoxGeometry(84, 0.12, 60).translate(0, 0.14, 0), K.gravel, 110, 0, 78).castShadow = false;
  for (const x of [80, 110, 140]) gantry(G, x, 64, 14, 15, 'x');
  gantry(G, 110, 92, 60, 18, 'x');
  for (const x of [80, 110, 140]) for (const dx of [-4.5, 0, 4.5]) {
    G.galv.push(bar([x + dx, 0, 78], [x + dx, 5, 78], 0.35));
    G.ins.push(bushingGeo(2.3, 0.14, 7).translate(x + dx, 5, 78));
    G.alu.push(bar([x + dx, 7.4, 78], [x + dx, 11, 64.5], 0.12), bar([x + dx, 11, 64.5], [x + dx, 14.3, 64], 0.12));
  }
  for (const dz of [-1.2, 0, 1.2]) G.alu.push(bar([82, 15.2, 92 + dz], [138, 15.2, 92 + dz], 0.16));
  fence(G, rectPath(64, 44, 156, 108), 2.4, 3);
  // Çevre çiti (giriş kapısı boşluklu) ve giriş: idari bina, atölye
  fence(G, rectPath(-203, -168, 208, 164), 2.5, 3.2, [[-8, 160, 8, 168]]);
  for (const sx of [-1, 1]) G.conc.push(new RoundedBoxGeometry(1, 3.2, 1, 1, 0.1).translate(sx * 8.8, 1.6, 164));
  G.yellow.push(bar([-8, 1.1, 164.6], [8, 1.1, 164.6], 0.14, 0.14));
  const office = makeBuilding({ type: 'office', floors: 3, width: 34, depth: 14, seed: 17, roof: 'flat', shop: false, colors: { wall: 0xd8d4cb, trim: 0xb8bcbe, frame: 0x8e969b } });
  office.position.set(-48, 0.1, 132);
  g.add(office);
  const shop = makeBuilding({ type: 'industrial', floors: 2, width: 36, depth: 22, seed: 23 });
  shop.position.set(58, 0.1, 140);
  g.add(shop);
  // Saha aydınlatması (motor sokak lambası; gece yanar)
  const lp = [];
  for (let x = -190; x <= 190; x += 32) lp.push([x, 115.2, Math.PI]);
  for (let z = 122; z < 160; z += 18) lp.push([5.6, z, -Math.PI / 2]);
  const lamps = streetLamps(lp);
  g.add(lamps.group);

  // Kovaları birleştir
  const put = (list, m, cast = true) => { if (!list.length) return; const o = add(merge(list), m); o.castShadow = cast; };
  put(G.win, K.win, false); put(G.steel, K.darkSteel); put(G.galv, K.galv); put(G.yellow, K.yellow, false); put(G.alu, K.alu);
  put(G.trafo, K.trafo); put(G.ins, K.ceramic, false); put(G.conc, K.concrete); put(G.roof, K.roofM);
  if (G.mesh.length) { const o = add(merge(G.mesh), K.mesh); o.castShadow = false; o.userData.noAO = true; }
  // Uçak ikaz ışıkları
  const lights = mat.glow({ color: 0xff2010, intensity: 0 });
  add(new THREE.SphereGeometry(0.9, 10, 8), lights, -2, 182, -112);
  add(new THREE.SphereGeometry(0.9, 10, 8), lights, TX, 121.8, TZ + rT);
  for (const y of [60, 120]) add(new THREE.SphereGeometry(0.6, 8, 6), lights, -2 + 10.2 - (4 * (y - 3)) / 177 + 1, y + 1.3, -112);
  return { group: g, chimneyTop: new THREE.Vector3(-2, 182, -112), towerTop: new THREE.Vector3(TX, 122, TZ), towerR: rT, lights, lamps };
}

// ------------------------------------------------------------------ Kombine çevrim doğalgaz santrali
/** Yerel: zemin y=0; kuzeyden (−z) yol girişi. Döner { group, stacks, lamps } */
export function gasPlant() {
  const K = mats(), g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const blk = (w, h, d, m, x, z, y = 0) => add(new RoundedBoxGeometry(w, h, d, 2, 0.3).translate(0, h / 2, 0), m, x, y, z);
  const K2 = { hall: K.clad, hrsg: mat.paintedMetal({ color: 0x9aa3a8, wear: 0.15 }), stack: mat.paintedMetal({ color: 0x7e868c, wear: 0.3 }) };
  const G = { win: [], steel: [], galv: [], yellow: [], alu: [], trafo: [], ins: [], mesh: [], conc: [], roof: [], hrsg: [] };
  // Çakıl/beton saha yalnız ekipman bloklarının altında; çit içindeki boş köşeler çim kalır (düz gri levha görünümü yerine)
  add(new RoundedBoxGeometry(156, 0.2, 124, 1, 0.08).translate(-4, 0.06, -20), K.yard).castShadow = false;
  add(new RoundedBoxGeometry(104, 0.2, 58, 1, 0.08).translate(2, 0.07, 66), K.yard).castShadow = false;
  // Türbin salonu: kemer çatı, şerit pencereler, pilastrlar
  blk(72, 26, 34, K2.hall, 0, 0);
  {
    const s = new THREE.Shape();
    for (let i = 0; i <= 14; i++) { const t = i / 14; s[i ? 'lineTo' : 'moveTo'](-17.5 + 35 * t, 26 + 2.8 * (1 - ((2 * t - 1) ** 2))); }
    for (let i = 14; i >= 0; i--) { const t = i / 14; s.lineTo(-17.5 + 35 * t, 25.5 + 2.8 * (1 - ((2 * t - 1) ** 2))); }
    G.roof.push(new THREE.ExtrudeGeometry(s, { depth: 73, bevelEnabled: false, curveSegments: 2 }).rotateY(Math.PI / 2).translate(-36.5, 0, 0));
  }
  ribbons(G, 0, 0, 72, 34, [17], 4.5, [1, 1, 1, 1], 3);
  ribbons(G, 0, 0, 72, 34, [4], 1.5, [1, 0, 1, 1], 4);
  for (let x = -32; x <= 32; x += 8) for (const sz of [-1, 1]) G.steel.push(new THREE.BoxGeometry(0.7, 26, 0.6).translate(x, 13, sz * 17.25));
  railing(G.yellow, [[-36, 17.2], [36, 17.2]], 26);
  const stacks = [];
  for (const x of [-18, 18]) {
    // Atık ısı kazanı (HRSG): dikme ribleri, kat sahanlıkları, üstte buhar domu
    blk(14, 30, 34, K2.hrsg, x, -38);
    for (let z = -54; z <= -22; z += 2.7) for (const sx of [-1, 1]) G.steel.push(new THREE.BoxGeometry(0.3, 30, 0.35).translate(x + sx * 7.15, 15, z));
    for (const y of [10, 20]) {
      for (const sx of [-1, 1]) G.steel.push(new THREE.BoxGeometry(1.6, 0.2, 34).translate(x + sx * 7.9, y, -38));
      for (const sx of [-1, 1]) railing(G.yellow, [[x + sx * 8.6, -55], [x + sx * 8.6, -21]], y);
    }
    G.alu.push(new THREE.CylinderGeometry(1.1, 1.1, 12, 16).rotateX(Math.PI / 2).translate(x, 31.6, -38));
    for (const z of [-42, -34]) G.steel.push(bar([x, 30, z], [x, 30.6, z], 0.6));
    railing(G.yellow, rectPath(x - 6.8, -54.8, x + 6.8, -21.2), 30);
    add(bar([x, 18, -16], [x, 18, -21], 10, 12), K2.hrsg);
    const sp = [[0.001, 0], [3.4, 0], [3.3, 58], [3.55, 58.5], [3.55, 60], [0.001, 60]].map(([a, b]) => new THREE.Vector2(a, b));
    add(new THREE.LatheGeometry(sp, 24), K2.stack, x, 0, -62);
    add(new THREE.LatheGeometry([[3.33, 51], [3.62, 51], [3.62, 57.8], [3.33, 57.8]].map(([a, b]) => new THREE.Vector2(a, b)), 24), K.darkSteel, x, 0, -62);
    add(bar([x, 24, -55], [x, 24, -59], 5, 6), K2.hrsg);
    for (const y of [22, 44]) {
      add(new THREE.TorusGeometry(4.2, 0.15, 6, 28).rotateX(Math.PI / 2), K.galv, x, y, -62);
      G.steel.push(new THREE.RingGeometry(3.4, 4.3, 28).rotateX(-Math.PI / 2).translate(x, y - 1.05, -62));
    }
    for (const dz of [-0.35, 0.35]) G.galv.push(bar([x + 3.55, 1, -62 + dz], [x + 3.45, 58, -62 + dz], 0.08));
    stacks.push(new THREE.Vector3(x, 61, -62));
  }
  // Hava soğutmalı kondenser: kolonlar + X çaprazlar, 24 m fan güvertesi, 2×4 fan, rüzgâr perdesi, A-çerçeve boru demetleri
  const acc = [];
  for (const x of [-30, -10, 10, 30]) for (const z of [0, 20]) acc.push(new THREE.CylinderGeometry(0.8, 0.9, 22, 10).translate(x, 11, z));
  acc.push(new RoundedBoxGeometry(80, 2, 40, 1, 0.3).translate(0, 23, 10));
  acc.push(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-19, 0), new THREE.Vector2(19, 0), new THREE.Vector2(0, 9.5)]), { depth: 76, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-38, 24, 10));
  add(merge(acc), K.galv, 0, 0, 56);
  for (const z of [56, 76]) for (let i = 0; i < 3; i++) { const x0 = -30 + i * 20; G.galv.push(bar([x0, 1, z], [x0 + 20, 21, z], 0.35), bar([x0 + 20, 1, z], [x0, 21, z], 0.35)); }
  for (const s of [-1, 1]) {
    G.hrsg.push(new THREE.BoxGeometry(80, 10, 0.4).translate(0, 29, 66 + s * 20));
    G.hrsg.push(new THREE.BoxGeometry(0.4, 10, 40).translate(s * 40, 29, 66));
  }
  railing(G.yellow, rectPath(-40, 46, 40, 86), 34);
  const fans = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) fans.push(new THREE.TorusGeometry(4.4, 0.35, 8, 28).rotateX(Math.PI / 2).translate(-30 + i * 20, 22, 56 + j * 20));
  add(merge(fans), K.darkSteel);
  // Kondenser merdiven kulesi
  for (let i = 0; i < 4; i++) G.yellow.push(bar([43, i * 6, i % 2 ? 60 : 72], [43, i * 6 + 6, i % 2 ? 72 : 60], 1.1, 0.25));
  for (const [x, z] of [[42, 59], [44, 59], [42, 73], [44, 73]]) G.steel.push(bar([x, 0, z], [x, 24, z], 0.3));
  // Tanklar, boru köprüsü, blok trafoları (buşingli), çit ve lambalar
  for (const [x, z, r, h] of [[62, -30, 9, 12], [62, 0, 6, 9]]) add(new THREE.LatheGeometry([[0.001, 0], [r, 0], [r, h], [r * 0.95, h + 0.6], [r * 0.4, h + 1.4], [0.001, h + 1.5]].map(([a, b]) => new THREE.Vector2(a, b)), 32), mat.paintedMetal({ color: 0xdadbd7, wear: 0.15 }), x, 0, z);
  pipeRack(G, [36, -12], [54, -12], 6, 4, 6, [0.45, 0.35, 0.3]);
  for (let k = 0; k < 2; k++) powerTransformer(G, -50 + k * 16, 28, 0.8);
  for (const x of [-58, -42, -26]) G.conc.push(new RoundedBoxGeometry(0.5, 7.5, 9, 1, 0.1).translate(x, 3.75, 28));
  fence(G, rectPath(-102, -82, 86, 98), 2.5, 3.2, [[-9, -86, 9, -78]]);
  const lp = [];
  for (let x = -90; x <= 80; x += 34) lp.push([x, -74, 0], [x, 92, Math.PI]);
  const lamps = streetLamps(lp);
  g.add(lamps.group);
  const put = (list, m, cast = true) => { if (!list.length) return; const o = add(merge(list), m); o.castShadow = cast; };
  put(G.win, K.win, false); put(G.steel, K.darkSteel); put(G.galv, K.galv); put(G.yellow, K.yellow, false); put(G.alu, K.alu);
  put(G.trafo, K.trafo); put(G.ins, K.ceramic, false); put(G.conc, K.concrete); put(G.roof, K.roofM); put(G.hrsg, K.clad);
  if (G.mesh.length) { const o = add(merge(G.mesh), K.mesh); o.castShadow = false; o.userData.noAO = true; }
  return { group: g, stacks, lamps };
}

// ------------------------------------------------------------------ Baraj
/** Beton ağırlık barajı, yerel z=0 memba yüzü; x boyunca L m. Döner { group, crest } */
export function dam(L = 300, H = 97) {
  const K = mats(), g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const s = new THREE.Shape();
  // (x = -z_profil, y) → rotateY(π/2) ile z_profil'e döner
  const pr = [[-6, -12], [-6, H], [5, H], [5, H - 8], [84, -12]];
  s.moveTo(-pr[0][0], pr[0][1]);
  for (const [z, y] of pr.slice(1)) s.lineTo(-z, y);
  const body = new THREE.ExtrudeGeometry(s, { depth: L, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-L / 2, 0, 0);
  add(body, K.damC);
  // Korkuluklar ve kret yolu
  for (const z of [-6.2, 5.2]) add(new RoundedBoxGeometry(L, 1.1, 0.35, 1, 0.1).translate(0, H + 0.55, z), K.concrete);
  add(new THREE.BoxGeometry(L - 2, 0.12, 7).translate(0, H + 0.06, -0.5), mat.asphalt({ color: 0x3c3d40 }));
  // Dolusavak: basamaklı oluk (sağ yakada)
  const steps = [];
  for (let k = 0; k < 40; k++) {
    const t = k / 40, y = H - 8 - t * (H - 4), z = 5 + (79 * (H - 8 - y)) / (H + 4);
    steps.push(new THREE.BoxGeometry(26, 0.6, 2.2).translate(0, y + 0.3, z + 1));
  }
  add(merge(steps), K.concrete, L * 0.28, 0, 0);
  for (const sx of [-1, 1]) add(bar([L * 0.28 + sx * 13.5, H + 1, 4], [L * 0.28 + sx * 13.5, 1.5, 84], 1.2, 3.2), K.concrete);
  // Kapak ayakları (kret üstünde)
  for (let k = 0; k < 4; k++) add(new RoundedBoxGeometry(2, 8, 9, 1, 0.2).translate(L * 0.28 - 12 + k * 8, H + 4, -1), K.concrete);
  // Cebri borular + santral binası
  for (const x of [-24, -12, 0]) add(bar([x - 20, 32, 30], [x - 20, 6, 70], 4.2), mat.paintedMetal({ color: 0x5b6e7a, wear: 0.35 }));
  add(new RoundedBoxGeometry(56, 22, 24, 2, 0.4).translate(0, 11, 0), K.clad, -32, 0, 86);
  add(new RoundedBoxGeometry(56, 1.2, 26, 1, 0.3).translate(0, 22.6, 0), K.concrete, -32, 0, 86);
  // Memba giriş kulesi
  add(new THREE.CylinderGeometry(5, 6, H + 14, 24).translate(0, (H + 14) / 2 - 12, 0), K.concrete, -60, 0, -18);
  add(bar([-60, H + 1, -12.8], [-60, H + 1, -6], 3, 0.8), K.concrete);
  return { group: g, crest: H };
}

// ------------------------------------------------------------------ Trafo merkezi
export function substation() {
  const K = mats(), g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(150, 0.3, 100).translate(0, 0.15, 0), K.gravel);
  // Güç trafoları: tank + radyatör + buşingler
  const tk = [], rad = [], bus = [];
  for (let k = 0; k < 3; k++) {
    const x = -40 + k * 40;
    tk.push(new RoundedBoxGeometry(8, 5, 4.4, 2, 0.2).translate(x, 2.5 + 0.3, 8));
    tk.push(new THREE.CylinderGeometry(1, 1, 5, 16).rotateX(Math.PI / 2).translate(x - 2.6, 6.2, 8));
    for (let f = 0; f < 12; f++) rad.push(new THREE.BoxGeometry(0.08, 3.6, 1.1).translate(x - 3.3 + f * 0.6, 2.6, 11.2), new THREE.BoxGeometry(0.08, 3.6, 1.1).translate(x - 3.3 + f * 0.6, 2.6, 4.8));
    for (let b = 0; b < 3; b++) bus.push(new THREE.CylinderGeometry(0.22, 0.38, 3.4, 10).translate(x - 2 + b * 2, 7, 8));
  }
  add(merge(tk), K.trafo); add(merge(rad), K.trafo); add(merge(bus), K.ceramic);
  // Portal çelik gantriler + bara boruları
  const st = [], bb = [];
  for (let k = 0; k < 5; k++) {
    const x = -60 + k * 30;
    for (const z of [-26, -6]) { st.push(bar([x - 6, 0, z], [x - 6, 16, z], 0.6)); st.push(bar([x + 6, 0, z], [x + 6, 16, z], 0.6)); st.push(bar([x - 6, 16, z], [x + 6, 16, z], 0.6, 1.2)); }
    for (const dx of [-3, 0, 3]) { st.push(bar([x + dx, 0, -16], [x + dx, 6, -16], 0.3)); bus.push(new THREE.CylinderGeometry(0.22, 0.3, 2.2, 8).translate(x + dx, 7.1, -16)); }
  }
  for (const dx of [-3, 0, 3]) bb.push(bar([-66, 8.2, -16 + dx * 0.001], [66, 8.2, -16 + dx * 0.001], 0.18).translate(0, 0, dx));
  add(merge(st), K.galv); add(merge(bb), mat.brushedMetal({ color: 0xc9b48a, rough: 0.35 }));
  add(merge(bus.slice(9)), K.ceramic);
  // Kumanda binası
  add(new RoundedBoxGeometry(26, 6, 12, 2, 0.3).translate(0, 3, 0), mat.concrete({ color: 0xd9d2c3, stains: 0.3 }), 48, 0.3, 34);
  add(new THREE.BoxGeometry(22, 1.4, 0.1).translate(0, 3.6, 6.05), K.win, 48, 0.3, 34);
  return g;
}

// ------------------------------------------------------------------ Batarya (konteyner)
export function batteryYard() {
  const K = mats(), g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(110, 0.4, 50).translate(0, 0.2, 0), mat.concrete({ color: 0xc2bcb0, stains: 0.4 }));
  const cont = new RoundedBoxGeometry(12.2, 2.9, 2.44, 2, 0.06).translate(0, 1.45 + 0.4, 0);
  const hvac = new RoundedBoxGeometry(1.2, 2.2, 2.0, 2, 0.08).translate(6.7, 1.1 + 0.4, 0);
  const im = new THREE.InstancedMesh(cont, K.container, 12), ih = new THREE.InstancedMesh(hvac, mat.plastic({ color: 0xd6d8d4, gloss: 0.3 }), 12);
  const m4 = new THREE.Matrix4(), leds = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) {
    const x = -40 + i * 16, z = r ? -9 : 9, k = r * 6 + i;
    m4.makeTranslation(x, 0, z); im.setMatrixAt(k, m4); ih.setMatrixAt(k, m4);
    if (!r) {
      const led = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.22), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
      led.position.set(x - 3, 2.9, z + 1.23);
      g.add(led); leds.push(led);
    }
  }
  im.castShadow = im.receiveShadow = ih.castShadow = true;
  g.add(im, ih);
  for (let k = 0; k < 3; k++) add(new RoundedBoxGeometry(6, 3.2, 2.6, 2, 0.1).translate(0, 2, 0), K.trafo, -40 + k * 40, 0, 20);
  return { group: g, leds };
}

// ------------------------------------------------------------------ Güneş izleyici sıraları
/** rows × blocks tablo (2,3 m × len m), tek eksen (z) izleyici. Döner { panels (InstancedMesh), setTilt(rad) } */
export function solarField(xs, zs, len = 80) {
  const K = mats();
  const n = xs.length * zs.length;
  const table = new THREE.BoxGeometry(2.3, 0.07, len);
  const panels = new THREE.InstancedMesh(table, K.pv, n);
  const tube = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, len, 8).rotateX(Math.PI / 2), K.galv, n);
  const npost = Math.floor(len / 8) + 1;
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 2.1, 0.16).translate(0, 1.05, 0), K.galv, n * npost);
  const base = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  let k = 0, pk = 0;
  for (const x of xs) for (const z of zs) {
    base.push([x, z]);
    m4.makeTranslation(x, 2.2, z); tube.setMatrixAt(k, m4);
    for (let j = 0; j < npost; j++) { m4.makeTranslation(x, 0, z - len / 2 + j * (len / (npost - 1))); posts.setMatrixAt(pk++, m4); }
    k++;
  }
  panels.castShadow = panels.receiveShadow = true; posts.castShadow = true; tube.castShadow = true;
  const g = new THREE.Group();
  g.add(panels, tube, posts);
  let last = 1e9;
  function setTilt(a) {
    if (Math.abs(a - last) < 0.003) return;
    last = a;
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
    base.forEach(([x, z], i) => { m4.compose(v.set(x, 2.3, z), q, one); panels.setMatrixAt(i, m4); });
    panels.instanceMatrix.needsUpdate = true;
    panels.computeBoundingSphere();
  }
  setTilt(0);
  return { group: g, panels, setTilt };
}
