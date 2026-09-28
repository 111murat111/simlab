// Deprem anı odaları: mobilya kurucuları (gerçek ölçü, PBR malzeme), serbest eşyalar, devrilebilir dolaplar ve her odanın seçenekleri.
import { THREE, rand, mat as MAT, procedural, RoundedBoxGeometry, BufferGeometryUtils, textTexture } from '@core';

const W = 4, D = 3, H = 2.8; // oda yarı genişliği (x), yarı derinliği (z), tavan yüksekliği
const T = 0.15, TB = 0.25;  // iç duvar (sol/sağ) ve dış duvar (arka, pencereli) kalınlığı

// --- Malzemeler (oda başına önbellek; aynı tür + renk tek malzeme → statik parçalar birleştirilebilir) ---
let MC = new Map();
function M(kind, color = 0xffffff, o = {}) {
  const key = kind + ':' + color + ':' + JSON.stringify(o);
  if (MC.has(key)) return MC.get(key);
  let m;
  switch (kind) {
    case 'wood': m = MAT.wood({ color, varnish: !!o.varnish, scale: o.scale ?? 1 }); break;
    case 'fabric': m = MAT.fabric({ color, scale: o.scale ?? 1 }); break;
    case 'plastic': m = MAT.plastic({ color, gloss: o.gloss ?? 0.5 }); break;
    case 'metal': m = MAT.brushedMetal({ color, rough: o.rough ?? 0.3 }); break;
    case 'painted': m = MAT.paintedMetal({ color, wear: o.wear ?? 0.05 }); break;
    case 'ceramic': m = MAT.ceramic({ color }); break;
    case 'rubber': m = MAT.rubber({ color }); break;
    case 'glass': m = MAT.glass({}); break;
    // pencere camı: ince, hafif yeşilimsi, yansıtıcı (kırılma geçişi yok → dış dünya olduğu gibi görünür)
    case 'pane': m = new THREE.MeshPhysicalMaterial({ color: 0xe8f2ee, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.14, specularIntensity: 1, side: THREE.DoubleSide, depthWrite: false }); break;
    case 'glow': m = MAT.glow({ color, intensity: o.intensity ?? 3 }); break;
    case 'paint': m = procedural({
      key: 'deprem-paint', params: { color, roughness: 0.92 },
      pattern: /* glsl */ `
        // alçı sıva: geniş mala izleri + ince kum dokusu, hafif ton dalgalanması
        float big = fbm3(p*vec3(1.6, 1.1, 1.6), 3), r = fbm3(p*vec3(9.0, 2.5, 9.0), 3), s = vn3(p*55.0);
        float trowel = smoothstep(0.35, 0.75, fbm3(p*vec3(3.2, 5.0, 3.2) + 2.0, 3));
        col *= 0.9 + 0.12*big + 0.05*r + 0.035*s - 0.03*trowel;
        rough = 0.86 - 0.12*trowel;
        h = r*0.25 + s*0.2 + trowel*0.35;`,
      bump: 0.0025,
    }); break;
    case 'paper': m = procedural({
      key: 'deprem-paper', params: { color, roughness: 0.85 },
      pattern: /* glsl */ `
        // kitap: sırtta ince yatay şeritler (yazı bandı), sayfa kenarı açık
        float band = step(0.72, fract(p.y*7.0 + seed*3.0))*step(abs(pn.x), 0.5);
        col = mix(col, col*1.6 + 0.1, band*0.35);
        col *= 0.9 + 0.12*vn3(p*60.0);`,
      bump: 0.001,
    }); break;
    default: m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0 });
  }
  m.userData.merge = !m.transparent;
  MC.set(key, m);
  return m;
}

// Yuvarlatılmış kutu (mobilya kenarları gerçekte keskin değil)
function box(parent, w, h, d, m, x, y, z, r = 0.012) {
  const rr = Math.min(r, Math.min(w, h, d) * 0.45);
  const g = rr > 0.002 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d);
  const b = new THREE.Mesh(g, m);
  b.position.set(x, y + h / 2, z);
  parent.add(b);
  return b;
}
const cyl = (parent, r0, r1, h, m, x, y, z, seg = 24) => {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);
  c.position.set(x, y + h / 2, z);
  parent.add(c);
  return c;
};

// Zemin kaplamaları (dünya metresinde desen)
function floorMat(kind) {
  if (kind === 'tile') return procedural({
    key: 'deprem-tile', physical: true, params: { color: 0xd9dcdc, roughness: 0.25, clearcoat: 0.4, clearcoatRoughness: 0.2 },
    pattern: /* glsl */ `
      vec2 q = p.xz/0.6, f = abs(fract(q) - 0.5);
      float grout = 1.0 - smoothstep(0.482, 0.492, max(f.x, f.y));
      float id = h13(vec3(floor(q), 1.0));
      col *= 0.94 + 0.08*id + 0.06*fbm3(p*6.0, 3);
      col = mix(col, vec3(0.55, 0.55, 0.53), grout);
      float gf = 1.0 - smoothstep(0.002, 0.012, max(fwidth(p.x), fwidth(p.z)));
      rough = mix(0.22, 0.85, grout); h = -grout*gf;`,
    bump: 0.002,
  });
  if (kind === 'school') return procedural({
    key: 'deprem-lino', params: { color: 0xa99d84, roughness: 0.5 },
    pattern: /* glsl */ `
      float sp = smoothstep(0.75, 0.8, vn3(p*55.0)), sp2 = smoothstep(0.8, 0.85, vn3(p*38.0 + 4.0));
      col *= 0.92 + 0.1*fbm3(p*1.5, 3);
      col = mix(col, col*0.6, sp*0.5); col = mix(col, col*1.3, sp2*0.4);
      vec2 f = abs(fract(p.xz/2.0) - 0.5);
      float seam = 1.0 - smoothstep(0.497, 0.4995, max(f.x, f.y));
      col *= 1.0 - 0.25*seam; rough = 0.45 + 0.15*fbm3(p*4.0, 2);`,
  });
  const base = kind === 'night' ? 0x6e4c3a : 0xa9754a;
  return procedural({
    key: 'deprem-parquet', physical: true, params: { color: base, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35 },
    pattern: /* glsl */ `
      // Laminat parke: 0,19 m genişlik, 1,2 m boy, şaşırtmalı
      float row = floor(p.z/0.19);
      float off = h13(vec3(row, 3.0, 1.0))*1.2;
      float cellx = floor((p.x + off)/1.2);
      float id = h13(vec3(row, cellx, 7.0));
      float fx = fract((p.x + off)/1.2), fz = fract(p.z/0.19);
      float gap = max(1.0 - smoothstep(0.0, 0.004, fx*1.2)*smoothstep(0.0, 0.004, (1.0 - fx)*1.2), 1.0 - smoothstep(0.0, 0.01, fz)*smoothstep(0.0, 0.01, 1.0 - fz));
      float grain = fbm3(vec3(p.x*1.2 + id*9.0, p.y, p.z*38.0), 4);
      float rings = sin((p.z*95.0 + 6.0*fbm3(vec3(p.x*0.8 + id*5.0, 1.0, p.z*6.0), 3))*1.0 + id*20.0);
      float knot = smoothstep(0.86, 0.95, vn3(vec3(p.x*3.0 + id*13.0, 2.0, p.z*9.0)));
      col *= 0.74 + 0.42*id + 0.3*(grain - 0.5) + 0.07*rings;
      col = mix(col, col*0.55, knot*0.7);
      col = mix(col, col*vec3(1.05, 0.95, 0.85), 0.5*id);
      // uzakta derz çizgisi piksel altına iner: kabartma/koyulaşma söner (yansıma lekesi olmasın)
      float gf = 1.0 - smoothstep(0.002, 0.012, max(fwidth(p.x), fwidth(p.z)));
      col = mix(col, col*0.35, gap*gf + 0.04*(1.0 - gf));
      rough = mix(0.4, 0.8, gap*gf); h = (-gap + grain*0.2)*gf;`,
    bump: 0.0015,
  });
}

// Tablo resmi: yumuşak soyut manzara (renk parametreli)
function paintingMat(color) {
  return procedural({
    key: 'deprem-painting', params: { color, roughness: 0.6 },
    pattern: /* glsl */ `
      vec2 q = vec2(p.x + p.z, p.y);
      float hz = 0.02*sin(q.x*9.0) + 0.05*fbm3(vec3(q*3.0, 1.0), 3);
      vec3 sky = mix(col*1.25 + 0.15, vec3(0.95), 0.25 + 0.3*q.y);
      vec3 land = mix(col*0.55, vec3(0.25, 0.3, 0.2), 0.4)*(0.8 + 0.4*fbm3(vec3(q*9.0, 2.0), 3));
      col = mix(land, sky, smoothstep(-0.02, 0.02, q.y - hz));
      col *= 0.92 + 0.08*vn3(p*140.0);`,
  });
}

/** Oda iskeleti + mobilya. Dönen ctx: group, loose (düşebilen eşyalar), tall (devrilebilir), windows, lamps. */
export function buildRoom(def) {
  MC = new Map();
  const g = new THREE.Group();
  const ctx = { group: g, loose: [], tall: [], windows: [], lamps: [], def };

  // Döşeme: betonarme plak + zemin kaplaması (kesit kenarında plak görünür)
  box(g, W * 2 + T * 2, 0.24, D * 2 + TB, MAT.concrete({ color: 0xa8a49c, stains: 0.2 }), 0, -0.265, -TB / 2, 0.004);
  const fl = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.025, D * 2), floorMat(def.floor));
  fl.position.set(0, -0.0125, 0);
  g.add(fl);
  ctx.floor = fl;
  const anchor = new THREE.Object3D();
  anchor.rotation.x = -Math.PI / 2;
  g.add(anchor);
  ctx.floorAnchor = anchor;

  // Duvarlar: açıklıklar (pencere, balkon kapısı, oda kapısı) gerçek boşluk olarak bırakılır.
  // Kamera tarafındaki (+z) duvar kesitle kaldırılmıştır; kalan üç duvar ve tavan odayı kapatır.
  const openB = [], openL = [];
  for (const it of def.items) {
    if (it[0] === 'window') openB.push({ x: it[1], w: it[2] + 0.12, y0: (it[4] ?? 0.95) - 0.06, y1: (it[4] ?? 0.95) + (it[3] ?? 1.4) + 0.06 });
    if (it[0] === 'balcony') openB.push({ x: it[1], w: (it[2] ?? 1.1) + 0.12, y0: 0, y1: 2.26 });
    if (it[0] === 'door') openL.push({ x: it[1], w: 1.02, y0: 0, y1: 2.14 });
  }
  const wallM = M('paint', def.wall);
  wallRun(g, wallM, openB, -W - T, W + T, (a, b, y0, y1) => box(g, b - a, y1 - y0, TB, wallM, (a + b) / 2, y0, -D - TB / 2, 0));
  wallRun(g, wallM, openL, -D, D, (a, b, y0, y1) => box(g, T, y1 - y0, b - a, wallM, -W - T / 2, y0, (a + b) / 2, 0));
  box(g, T, H, D * 2, wallM, W + T / 2, 0, 0, 0);
  // Tavan: betonarme plak + alçı sıva alt yüzü
  const ceilM = M('paint', def.ceil ?? 0xf3f1ec);
  box(g, W * 2 + T * 2, 0.24, D * 2 + TB, MAT.concrete({ color: 0xa39f97, stains: 0.15 }), 0, H, -TB / 2, 0.004);
  box(g, W * 2, 0.012, D * 2, ceilM, 0, H - 0.012, 0, 0);
  // Kesit yüzleri (z = +D): duvarların tuğla çekirdeği iki yanda sıva bandıyla, döşeme ve tavan plağı beton
  const brickM = MAT.brick({ color: 0x9c5a3e, mortar: 0xc9bfae, scale: 1.4 });
  for (const sx of [-1, 1]) box(g, T - 0.035, H - 0.02, 0.006, brickM, sx * (W + T / 2), 0.01, D + 0.003, 0);
  // Süpürgelik
  const baseM = M('wood', 0xf2efe8, { varnish: true });
  const skirt = (a, b, alongX) => (alongX ? box(g, b - a, 0.09, 0.015, baseM, (a + b) / 2, 0, -D + 0.0075, 0.003) : box(g, 0.015, 0.09, b - a, baseM, -W + 0.0075, 0, (a + b) / 2, 0.003));
  segs(openB.filter((o) => o.y0 < 0.1), -W, W).forEach(([a, b]) => skirt(a, b, true));
  segs(openL, -D, D).forEach(([a, b]) => skirt(a, b, false));
  box(g, 0.015, 0.09, D * 2, baseM, W - 0.0075, 0, 0, 0.003);

  trims(ctx, openB, openL);
  for (const it of def.items) BUILD[it[0]](ctx, ...it.slice(1));
  mergeStatic(ctx);
  return ctx;
}
function segs(opens, a, b) {
  const s = [...opens].sort((p, q) => p.x - q.x), out = [];
  let cur = a;
  for (const o of s) { if (o.x - o.w / 2 > cur) out.push([cur, o.x - o.w / 2]); cur = Math.max(cur, o.x + o.w / 2); }
  if (cur < b) out.push([cur, b]);
  return out;
}
function wallRun(g, m, opens, a, b, piece) {
  for (const [s0, s1] of segs(opens, a, b)) piece(s0, s1, 0, H);
  for (const o of opens) {
    if (o.y0 > 0.01) piece(o.x - o.w / 2, o.x + o.w / 2, 0, o.y0);
    piece(o.x - o.w / 2, o.x + o.w / 2, o.y1, H);
  }
}

/** Hareket etmeyen parçaları malzemelerine göre tek meshte birleştirir (çizim çağrısı sayısını azaltır). */
function mergeStatic(ctx) {
  const dyn = new Set();
  ctx.loose.forEach((o) => dyn.add(o.mesh));
  ctx.tall.forEach((t) => dyn.add(t.pivot));
  ctx.lamps.forEach((l) => dyn.add(l.pivot));
  ctx.windows.forEach((w) => dyn.add(w.pane));
  (ctx.cabDoors || []).forEach((c) => dyn.add(c.g));
  if (ctx.door) dyn.add(ctx.door);
  if (ctx.pillow) dyn.add(ctx.pillow);
  if (ctx.keep) ctx.keep.forEach((o) => dyn.add(o));
  const g = ctx.group;
  g.updateMatrixWorld(true);
  const buckets = new Map();
  const victims = [];
  const visit = (o) => {
    for (const c of o.children) {
      if (dyn.has(c)) continue;
      if (c.isMesh && c.material.userData.merge && c.children.length === 0) {
        if (!buckets.has(c.material)) buckets.set(c.material, []);
        const geo = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone());
        for (const a of Object.keys(geo.attributes)) if (a !== 'position' && a !== 'normal') geo.deleteAttribute(a);
        geo.applyMatrix4(c.matrixWorld);
        buckets.get(c.material).push(geo);
        victims.push(c);
      } else visit(c);
    }
  };
  visit(g);
  for (const v of victims) { v.removeFromParent(); v.geometry.dispose(); }
  for (const [m, geos] of buckets) {
    const merged = BufferGeometryUtils.mergeGeometries(geos);
    geos.forEach((x) => x.dispose());
    if (merged) g.add(new THREE.Mesh(merged, m));
  }
}

// --- Yardımcılar ---
function addLoose(ctx, mesh, dir, thr = 0.5, half = 0.08) {
  ctx.loose.push({ mesh, dir, thr, half, v: new THREE.Vector3(), w: new THREE.Vector3(), state: 0, home: mesh.position.clone(), homeR: mesh.rotation.clone() });
}
/** Birden çok parçalı serbest eşya: parçalar bir grupta; grup düşer. y = taban. */
function looseGroup(ctx, x, y, z, half) {
  const grp = new THREE.Group();
  grp.position.set(x, y + half, z);
  ctx.group.add(grp);
  return grp;
}

/** Devrilebilir uzun eşya: pivot ön-alt kenarda. face: 'back' (arka duvarda, +z'ye bakar) | 'left' (sol duvarda, +x'e bakar) */
function makeTall(ctx, face, x, z, w, h, d, name, maxA = 1.35) {
  const pivot = new THREE.Group();
  const inner = new THREE.Group();
  pivot.add(inner);
  if (face === 'back') { pivot.position.set(x, 0, z + d / 2); inner.position.set(0, 0, -d / 2); }
  else { pivot.position.set(x + d / 2, 0, z); inner.position.set(-d / 2, 0, 0); inner.rotation.y = Math.PI / 2; }
  ctx.group.add(pivot);
  const t = { pivot, inner, face, h, th: 0, om: 0, falling: false, maxA, name, items: [] };
  ctx.tall.push(t);
  return t;
}
/** Kasalı dolap gövdesi (yan, üst, alt, arka): inner içinde, ön yüz +z. */
function carcass(parent, w, h, d, m, t = 0.022) {
  box(parent, t, h, d, m, -w / 2 + t / 2, 0, 0, 0.004);
  box(parent, t, h, d, m, w / 2 - t / 2, 0, 0, 0.004);
  box(parent, w, t, d, m, 0, h - t, 0, 0.004);
  box(parent, w - 2 * t, 0.08, d - 0.02, m, 0, 0, 0.0, 0.004);
  box(parent, w - 2 * t, h - t - 0.08, 0.008, m, 0, 0.08, -d / 2 + 0.006, 0);
}

function window_(ctx, x, w, h = 1.4, y0 = 0.95) {
  const g = ctx.group, z = -D - 0.1;
  const fm = M('plastic', 0xf4f5f3, { gloss: 0.35 });
  // Kasa (PVC), orta kayıt, denizlik (mermer)
  box(g, w + 0.12, 0.06, 0.12, fm, x, y0 - 0.06, z, 0.008);
  box(g, w + 0.12, 0.06, 0.12, fm, x, y0 + h, z, 0.008);
  box(g, 0.06, h, 0.12, fm, x - w / 2 - 0.03, y0, z, 0.008);
  box(g, 0.06, h, 0.12, fm, x + w / 2 + 0.03, y0, z, 0.008);
  box(g, 0.05, h, 0.08, fm, x, y0, z, 0.008);
  box(g, w + 0.3, 0.03, 0.26, M('ceramic', 0xe9e5dc), x, y0 - 0.09, z + 0.12, 0.006);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M('pane'));
  pane.position.set(x, y0 + h / 2, z);
  pane.userData.noCast = true;
  g.add(pane);
  // Tül perde (yarı saydam kumaş, iki yanda toplu)
  const cm = new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: 0.9, transparent: true, opacity: ctx.def.night ? 0.8 : 0.55, side: THREE.DoubleSide });
  for (const s of [-1, 1]) {
    const cg = new THREE.PlaneGeometry(0.4, h + 0.35, 16, 1), pos = cg.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.025 * Math.sin(pos.getX(i) * 60));
    cg.computeVertexNormals();
    const c = new THREE.Mesh(cg, cm);
    c.position.set(x + s * (w / 2 + 0.05), y0 + h / 2 + 0.12, -D + 0.1);
    g.add(c);
  }
  ctx.windows.push({ pane, x, y: y0 + h / 2, z: -D + 0.05, w, h, broken: false });
}

function door(ctx, z, label = true) {
  const g = ctx.group, x = -W;
  // Kapının arkası: loş koridor (zemin, karşı duvar)
  box(g, 1.3, 0.02, 1.4, M('paint', 0x6d6a66), x - 0.8, -0.02, z, 0);
  box(g, 0.1, H, 1.6, M('paint', 0x55524e), x - 1.45, 0, z, 0);
  box(g, 1.5, 0.1, 1.6, M('paint', 0x77736d), x - 0.75, H, z, 0);
  const fm = M('wood', 0xece8df, { varnish: true });
  box(g, 0.2, 0.07, 1.14, fm, x, 2.1, z, 0.008);
  box(g, 0.2, 2.1, 0.07, fm, x, 0, z - 0.535, 0.008);
  box(g, 0.2, 2.1, 0.07, fm, x, 0, z + 0.535, 0.008);
  const hinge = new THREE.Group();
  hinge.position.set(x + 0.05, 0, z + 0.47);
  g.add(hinge);
  const leaf = box(hinge, 0.04, 2.05, 0.92, M('wood', 0x9b6a3c, { varnish: true }), 0, 0, -0.46, 0.01);
  const hm = M('metal', 0xd8d8d8);
  box(leaf, 0.06, 0.025, 0.13, hm, 0.05, -0.05, -0.34, 0.01);
  box(leaf, 0.06, 0.025, 0.13, hm, -0.05, -0.05, -0.34, 0.01);
  hinge.rotation.y = -0.5;
  ctx.door = hinge;
}

function balcony(ctx, x, w = 1.1) {
  const g = ctx.group, z = -D - 0.1;
  const fm = M('plastic', 0xf4f5f3, { gloss: 0.35 });
  box(g, w + 0.12, 0.06, 0.12, fm, x, 2.2, z, 0.008);
  box(g, 0.06, 2.2, 0.12, fm, x - w / 2 - 0.03, 0, z, 0.008);
  box(g, 0.06, 2.2, 0.12, fm, x + w / 2 + 0.03, 0, z, 0.008);
  box(g, w + 0.12, 0.05, 0.12, fm, x, 0, z, 0.008);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.15), M('pane'));
  pane.position.set(x, 1.12, z);
  pane.userData.noCast = true;
  g.add(pane);
  // Dışarıdaki balkon plağı ve korkuluk (duvarın arkasında, yukarıdan görünür)
  const slab = box(g, 2.6, 0.14, 1.3, MAT.concrete({ color: 0xb9b4aa, stains: 0.4 }), x, -0.16, -D - 0.9, 0.01);
  slab.userData.balcony = true;
  box(g, 2.5, 0.02, 1.1, floorMat('tile'), x, -0.02, -D - 0.85, 0);
  const rm = M('painted', 0x39414a, { wear: 0.25 });
  box(g, 2.6, 0.05, 0.06, rm, x, 1.0, -D - 1.42, 0.015);
  box(g, 0.05, 1.0, 1.3, rm, x - 1.28, 0, -D - 0.8, 0.015);
  box(g, 0.05, 1.0, 1.3, rm, x + 1.28, 0, -D - 0.8, 0.015);
  for (let i = 0; i <= 12; i++) box(g, 0.02, 1.0, 0.02, rm, x - 1.26 + i * 0.21, 0, -D - 1.42, 0);
  const pot = looseGroup(ctx, x + 0.9, 0, -D - 0.5, 0.15);
  plantInto(pot, 0.25, 0.3, 0.35);
  addLoose(ctx, pot, [0.2, 0, -0.4], 0.6, 0.15);
}

function table(ctx, x, z, w = 1.4, d = 0.9, color = 0x8b5a2b, chairs = true) {
  const g = ctx.group, m = M('wood', color, { varnish: true });
  box(g, w, 0.035, d, m, x, 0.705, z, 0.012);
  box(g, w - 0.12, 0.08, d - 0.12, m, x, 0.625, z, 0.006);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.055, 0.66, 0.055, m, x + sx * (w / 2 - 0.08), 0, z + sz * (d / 2 - 0.08), 0.01);
  if (chairs) for (const sx of [-1, 1]) chair(ctx, x + sx * (w / 2 + 0.25), z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, color);
  const cup = looseGroup(ctx, x + 0.3, 0.74, z - 0.1, 0.05);
  const cm = M('ceramic', 0xf6f3ee);
  cyl(cup, 0.042, 0.036, 0.095, cm, 0, -0.05, 0, 20);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.006, 8, 16), cm);
  handle.position.set(0.045, 0, 0); handle.rotation.z = Math.PI / 2; cup.add(handle);
  addLoose(ctx, cup, [0.3, 0, 0.3], 0.55, 0.05);
}

function chair(ctx, x, z, ry, color) {
  const c = new THREE.Group();
  c.position.set(x, 0, z);
  c.rotation.y = ry;
  const m = M('wood', color, { varnish: true });
  box(c, 0.42, 0.035, 0.42, m, 0, 0.43, 0, 0.01);
  box(c, 0.38, 0.03, 0.38, M('fabric', 0x8a7a64), 0, 0.465, 0.01, 0.012);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(c, 0.035, sz < 0 ? 0.9 : 0.43, 0.035, m, sx * 0.185, 0, sz * 0.185, 0.008);
  for (const y of [0.62, 0.78]) box(c, 0.36, 0.05, 0.02, m, 0, y, -0.185, 0.008);
  ctx.group.add(c);
}

function sofa(ctx, x, z) {
  const g = ctx.group, m = M('fabric', 0x4a6378), m2 = M('fabric', 0x405769);
  box(g, 2.0, 0.12, 0.85, M('wood', 0x3b2a1e), x, 0.03, z, 0.01);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, 0.02, 0.015, 0.05, M('wood', 0x3b2a1e), x + sx * 0.9, 0, z + sz * 0.35, 10);
  box(g, 1.64, 0.2, 0.62, m, x, 0.15, z - 0.06, 0.05);
  for (const s of [-0.41, 0.41]) box(g, 0.8, 0.14, 0.62, m, x + s, 0.35, z - 0.06, 0.06);
  box(g, 2.0, 0.55, 0.22, m2, x, 0.15, z + 0.32, 0.07);
  for (const s of [-0.41, 0.41]) box(g, 0.78, 0.4, 0.14, m, x + s, 0.45, z + 0.2, 0.07);
  box(g, 0.2, 0.45, 0.85, m2, x - 0.9, 0.15, z, 0.07);
  box(g, 0.2, 0.45, 0.85, m2, x + 0.9, 0.15, z, 0.07);
  const cushion = box(g, 0.4, 0.4, 0.13, M('fabric', 0xc99a3c), x + 0.55, 0.5, z + 0.08, 0.06);
  cushion.rotation.x = -0.25;
  cushion.position.y += 0.02;
  addLoose(ctx, cushion, [0, 0, -0.4], 0.8, 0.07);
}

const BOOK_COLS = [0x8c2f2a, 0x2d4e7a, 0x3c6b45, 0xc19a3a, 0x5e3f6e, 0xb8642f, 0xe8e2d3, 0x2b2b2b];
function bookshelf(ctx, face, x, z) {
  const t = makeTall(ctx, face, x, z, 1.0, 2.0, 0.35, 'Kitaplık');
  const wm = M('wood', 0x7a4a26, { varnish: true });
  carcass(t.inner, 1.0, 2.0, 0.35, wm);
  for (let s = 0; s < 4; s++) {
    box(t.inner, 0.956, 0.022, 0.32, wm, 0, 0.33 + s * 0.45, 0.01, 0.003);
    let bx = -0.44;
    for (let b = 0; b < 6; b++) {
      const bh = rand(0.22, 0.32), bw = rand(0.035, 0.07);
      if (bx + bw > 0.44) break;
      const bk = box(ctx.group, bw, bh, rand(0.17, 0.23), M('paper', BOOK_COLS[(s * 7 + b * 3) % BOOK_COLS.length]), 0, 0, 0, 0.004);
      const lx = bx + bw / 2, ly = 0.352 + s * 0.45 + bh / 2;
      bx += bw + rand(0.004, 0.02);
      // Kitap oda grubunda (düşünce bağımsız hareket etsin)
      if (face === 'back') bk.position.set(x + lx, ly, z + 0.03);
      else { bk.position.set(x + 0.03, ly, z - lx); bk.rotation.y = Math.PI / 2; }
      addLoose(ctx, bk, face === 'back' ? [0, 0, 1] : [1, 0, 0], 0.45 + s * 0.08 + rand(0, 0.35), bh / 2);
      t.items.push(ctx.loose[ctx.loose.length - 1]);
    }
  }
  return t;
}

function tvUnit(ctx, x) {
  const g = ctx.group, z = -D + 0.25;
  const wm = M('wood', 0x5a4636, { varnish: true });
  box(g, 1.6, 0.42, 0.42, wm, x, 0.06, z, 0.01);
  for (const s of [-0.4, 0.4]) box(g, 0.78, 0.36, 0.01, M('wood', 0x6a5442, { varnish: true }), x + s, 0.09, z + 0.21, 0.004);
  for (const s of [-1, 1]) box(g, 0.04, 0.06, 0.34, M('metal', 0x333333), x + s * 0.72, 0, z, 0.005);
  const t = makeTall(ctx, 'back', x, z - 0.02, 1.1, 0.68, 0.08, 'Televizyon', 1.45);
  t.pivot.position.y = 0.48;
  box(t.inner, 0.26, 0.015, 0.2, M('plastic', 0x1a1a1c, { gloss: 0.6 }), 0, 0, 0.0, 0.005);
  box(t.inner, 0.05, 0.08, 0.04, M('plastic', 0x1a1a1c, { gloss: 0.6 }), 0, 0.015, -0.01, 0.005);
  box(t.inner, 1.1, 0.64, 0.04, M('plastic', 0x121214, { gloss: 0.5 }), 0, 0.08, 0, 0.008);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.6), new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.08, clearcoat: 1, emissive: 0x1d3552, emissiveIntensity: 0.6 }));
  scr.position.set(0, 0.4, 0.021);
  t.inner.add(scr);
  t.screen = scr;
  const vase = looseGroup(ctx, x + 0.62, 0.48, z, 0.14);
  const prof = [[0, 0], [0.05, 0], [0.065, 0.06], [0.06, 0.16], [0.035, 0.24], [0.04, 0.28]].map(([r, y]) => new THREE.Vector2(r, y - 0.14));
  vase.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 24), M('ceramic', 0x2f7f79)));
  addLoose(ctx, vase, [0, 0, 1], 0.45, 0.14);
}

function frame(ctx, face, a, y, color = 0xfca5a5) {
  const grp = new THREE.Group();
  const fm = M('wood', 0x2c2622);
  box(grp, 0.6, 0.45, 0.03, fm, 0, -0.225, 0, 0.006);
  box(grp, 0.52, 0.37, 0.01, M('paper', 0xf3efe6), 0, -0.185, 0.016, 0);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), paintingMat(color));
  pic.position.set(0, 0, 0.0225);
  grp.add(pic);
  if (face === 'back') grp.position.set(a, y + 0.225, -D + 0.02);
  else if (face === 'right') { grp.position.set(W - 0.02, y + 0.225, a); grp.rotation.y = -Math.PI / 2; }
  else { grp.position.set(-W + 0.02, y + 0.225, a); grp.rotation.y = Math.PI / 2; }
  ctx.group.add(grp);
  addLoose(ctx, grp, face === 'back' ? [0, 0, 1] : face === 'right' ? [-1, 0, 0] : [1, 0, 0], 0.55, 0.22);
}

function rug(ctx, x, z, w, d, color) {
  const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), procedural({
    key: 'deprem-rug', physical: true, params: { color, roughness: 1, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffffff) },
    uniforms: { uHalf: { value: new THREE.Vector2(w / 2, d / 2) } },
    pattern: /* glsl */ `
      // kilim: kat kat bordür, göbekte baklava madalyonlar, kenar motifleri, dokuma dokusu
      vec2 q = abs(p.xz);
      float e = min(uHalf.x - q.x, uHalf.y - q.y);
      vec3 cream = vec3(0.86, 0.78, 0.62), navy = vec3(0.12, 0.16, 0.26), ochre = vec3(0.78, 0.55, 0.2);
      vec3 c = col;
      float b1 = step(0.04, e)*step(e, 0.2), b2 = step(0.07, e)*step(e, 0.17), b3 = step(0.23, e)*step(e, 0.27);
      c = mix(c, navy, b1);
      float tri = step(abs(fract((q.x + q.y)*6.0) - 0.5)*0.26, e - 0.07)*b2;
      c = mix(c, cream, b2*0.35 + tri*0.6);
      c = mix(c, ochre, b3);
      vec2 cq = vec2(fract((p.x + uHalf.x)*1.25) - 0.5, p.z/max(uHalf.y, 0.1)*1.2);
      float dd = abs(cq.x)*2.0 + abs(cq.y);
      float inner = step(0.3, e);
      c = mix(c, navy, inner*step(dd, 0.62)*step(0.5, dd));
      c = mix(c, cream, inner*step(dd, 0.48)*step(0.36, dd));
      c = mix(c, ochre, inner*step(dd, 0.2));
      float hook = step(abs(abs(cq.x) - 0.36), 0.03)*step(abs(cq.y), 0.25)*inner;
      c = mix(c, cream, hook*0.8);
      float weave = 0.5 + 0.5*sin(p.x*420.0)*sin(p.z*420.0);
      c *= 0.86 + 0.12*weave + 0.14*vn3(p*90.0);
      c *= 0.94 + 0.12*fbm3(p*3.0, 2);
      col = c;
      h = weave*0.6 + vn3(p*200.0)*0.4;`,
    bump: 0.002,
  }));
  r.position.set(x, 0.006, z);
  ctx.group.add(r);
}

function lamp(ctx, x, z, len = 0.9, on = true) {
  const pivot = new THREE.Group();
  pivot.position.set(x, H, z);
  ctx.group.add(pivot);
  cyl(ctx.group, 0.07, 0.06, 0.035, M('plastic', 0xf2f0ea), x, H - 0.035, z, 20);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, len, 6), M('rubber', 0x111111));
  cord.position.y = -len / 2;
  pivot.add(cord);
  const prof = [[0.02, 0.02], [0.05, 0.0], [0.1, -0.06], [0.2, -0.18], [0.24, -0.24]].map(([r, y]) => new THREE.Vector2(r, y));
  const shade = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), new THREE.MeshStandardMaterial({ color: 0xe9e1cf, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide, emissive: on ? 0x3a2a10 : 0 }));
  shade.position.y = -len;
  pivot.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 10), on ? M('glow', 0xffe0a8, { intensity: 6 }) : M('plastic', 0x777777));
  bulb.position.y = -len - 0.12;
  pivot.add(bulb);
  ctx.lamps.push({ pivot, len, px: 0, pz: 0, vx: 0, vz: 0 });
}

// Saksı bitkisi: toprak saksı + kavisli yapraklar (çift yüzlü yaprak dokusu)
const _leafGeo = (() => {
  const g = new THREE.PlaneGeometry(0.07, 0.34, 1, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.17, t = y / 0.34;
    p.setX(i, p.getX(i) * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)));
    p.setY(i, y);
    p.setZ(i, 0.12 * t * t);
  }
  g.computeVertexNormals();
  return g;
})();
function plantInto(parent, potW, potH, leafS = 0.45) {
  const prof = [[0, -potH / 2], [potW * 0.36, -potH / 2], [potW * 0.5, potH / 2 - 0.03], [potW * 0.52, potH / 2]].map(([r, y]) => new THREE.Vector2(r, y));
  parent.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 24), MAT.ceramic({ color: 0xa65a35 })));
  const soil = new THREE.Mesh(new THREE.CircleGeometry(potW * 0.48, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2e2218, roughness: 1 }));
  soil.position.y = potH / 2 - 0.03;
  parent.add(soil);
  const geos = [];
  for (let i = 0; i < 26; i++) {
    const lg = _leafGeo.clone(), s = leafS / 0.45 * (0.7 + Math.random() * 0.6);
    lg.scale(s, s, s);
    lg.rotateX(-0.2 - Math.random() * 0.9);
    lg.rotateY(i * 2.4 + Math.random());
    lg.translate(0, potH / 2 - 0.03, 0);
    geos.push(lg);
  }
  const leaves = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(geos), MAT.foliage({ color: 0x3d6b2c }));
  geos.forEach((x) => x.dispose());
  parent.add(leaves);
}
function plant(ctx, x, z) {
  const pot = looseGroup(ctx, x, 0, z, 0.18);
  plantInto(pot, 0.3, 0.35, 0.55);
  addLoose(ctx, pot, [0.6, 0, 0.6], 0.8, 0.18);
}

function wardrobe(ctx, x, z) {
  const t = makeTall(ctx, 'back', x, z, 1.5, 2.2, 0.6, 'Gardırop', 1.3);
  const wm = M('wood', 0x8a6a48, { varnish: true });
  carcass(t.inner, 1.5, 2.2, 0.6, wm);
  for (const s of [-1, 1]) box(t.inner, 0.735, 2.1, 0.02, M('wood', 0x9a7852, { varnish: true }), s * 0.37, 0.08, 0.29, 0.006);
  const hm = M('metal', 0xcfcfcf);
  for (const s of [-1, 1]) box(t.inner, 0.02, 0.3, 0.025, hm, s * 0.06, 1.0, 0.31, 0.008);
  const bx = box(ctx.group, 0.5, 0.3, 0.4, MAT.fabric({ color: 0xc9a78f }), x - 0.3, 2.2, z, 0.02);
  addLoose(ctx, bx, [0, 0, 1], 0.4, 0.15);
  t.items.push(ctx.loose[ctx.loose.length - 1]);
}

function bed(ctx, x, z) {
  const g = ctx.group;
  const wm = M('wood', 0x6b4a33, { varnish: true });
  box(g, 2.0, 0.28, 1.4, wm, x, 0.1, z, 0.02);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.07, 0.12, 0.07, wm, x + sx * 0.95, 0, z + sz * 0.65, 0.01);
  box(g, 1.96, 0.2, 1.36, M('fabric', 0xf2f0ea), x, 0.36, z, 0.06);
  // Yorgan: kenarlardan sarkan yumuşak örtü
  const q = new THREE.Mesh(new RoundedBoxGeometry(1.38, 0.1, 1.46, 3, 0.045), M('fabric', 0x3e4f86));
  q.position.set(x + 0.3, 0.6, z);
  g.add(q);
  box(g, 0.08, 1.0, 1.44, wm, x - 1.02, 0, z, 0.02);
  box(g, 0.05, 0.5, 1.3, M('fabric', 0x4a3c34), x - 0.96, 0.45, z, 0.02);
  const pillow = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.14, 0.72, 3, 0.06), M('fabric', 0xfafaf7));
  pillow.position.set(x - 0.7, 0.62, z);
  g.add(pillow);
  ctx.pillow = pillow;
}

function nightstand(ctx, x, z) {
  const g = ctx.group;
  const wm = M('wood', 0x6b4a33, { varnish: true });
  box(g, 0.45, 0.5, 0.4, wm, x, 0, z, 0.012);
  box(g, 0.4, 0.14, 0.01, M('wood', 0x7a583f, { varnish: true }), x, 0.3, z + 0.2, 0.004);
  const glass = looseGroup(ctx, x + 0.1, 0.5, z, 0.06);
  // Başucu bardağı: kırılmalı (transmission) cam yerine saydam cam — gece odasında ek tam sahne geçişi (kent dahil) çizilmesin
  cyl(glass, 0.035, 0.03, 0.12, M('pane'), 0, -0.06, 0, 20);
  cyl(glass, 0.031, 0.027, 0.07, new THREE.MeshPhysicalMaterial({ color: 0xcfe4f7, roughness: 0.04, specularIntensity: 1, transparent: true, opacity: 0.45, depthWrite: false }), 0, -0.055, 0, 20);
  addLoose(ctx, glass, [0.5, 0, 0.3], 0.4, 0.06);
  const lampG = looseGroup(ctx, x - 0.08, 0.5, z, 0.15);
  cyl(lampG, 0.06, 0.07, 0.14, M('ceramic', 0xe8e2d6), 0, -0.15, 0, 20);
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.13, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xf3e6c8, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffc070, emissiveIntensity: ctx.def.night ? 1.2 : 0.2 }));
  sh.position.y = 0.06;
  lampG.add(sh);
  addLoose(ctx, lampG, [0.5, 0, 0.2], 0.6, 0.15);
  if (ctx.def.night) ctx.nightLamp = [x - 0.08, 0.72, z];   // ışığın kendisi main.js'te kalıcıdır (ışık sayısı sabit)
}

function desk(ctx, x, z, ry = 0, color = 0xd6c29a) {
  const d = new THREE.Group();
  d.position.set(x, 0, z);
  d.rotation.y = ry;
  const top = M('wood', color, { varnish: true }), lm = M('painted', 0x3d4650, { wear: 0.2 });
  box(d, 1.2, 0.03, 0.55, top, 0, 0.7, 0, 0.01);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(d, 0.035, 0.7, 0.035, lm, sx * 0.55, 0, sz * 0.23, 0.008);
  box(d, 1.1, 0.02, 0.35, lm, 0, 0.56, -0.08, 0.005);
  box(d, 1.1, 0.3, 0.015, lm, 0, 0.4, -0.25, 0.005);
  // Öğrenci sandalyeleri (plastik oturak, metal ayak)
  const seat = M('plastic', 0x2f5f9e, { gloss: 0.4 });
  for (const sx of [-0.3, 0.3]) {
    box(d, 0.38, 0.03, 0.38, seat, sx, 0.43, 0.45, 0.012);
    box(d, 0.38, 0.28, 0.025, seat, sx, 0.56, 0.635, 0.012);
    for (const a of [-1, 1]) for (const b of [-1, 1]) box(d, 0.02, 0.43, 0.02, lm, sx + a * 0.16, 0, 0.45 + b * 0.16, 0.006);
    for (const a of [-1, 1]) box(d, 0.02, 0.4, 0.02, lm, sx + a * 0.16, 0.43, 0.63, 0.006);
  }
  ctx.group.add(d);
  const book = box(ctx.group, 0.25, 0.03, 0.32, M('paper', 0xa33a2e), x - 0.2, 0.73, z, 0.004);
  addLoose(ctx, book, [0, 0, 1], 0.6, 0.02);
}

function board(ctx, x) {
  const g = ctx.group, z = -D + 0.03;
  const bm = procedural({
    key: 'deprem-chalk', params: { color: 0x1f3a2b, roughness: 0.85 },
    pattern: /* glsl */ `
      float dust = fbm3(p*vec3(3.0, 6.0, 3.0), 4);
      col = mix(col, vec3(0.5, 0.55, 0.52), smoothstep(0.5, 0.85, dust)*0.35);
      col *= 0.9 + 0.12*vn3(p*90.0);`,
  });
  box(g, 2.8, 1.2, 0.03, bm, x, 0.95, z, 0.004);
  const fm = M('metal', 0xb9bcc0);
  box(g, 2.9, 0.035, 0.05, fm, x, 0.93, z + 0.01, 0.008);
  box(g, 2.9, 0.035, 0.05, fm, x, 2.15, z + 0.01, 0.008);
  box(g, 2.9, 0.03, 0.09, fm, x, 0.92, z + 0.05, 0.008);
  const txt = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshStandardMaterial({ map: boardTex(), transparent: true, roughness: 0.9 }));
  txt.position.set(x, 1.55, z + 0.02);
  g.add(txt);
  const clock = looseGroup(ctx, x + 2.0, 2.1, z + 0.02, 0.2);
  const cf = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 32).rotateX(Math.PI / 2), M('plastic', 0x1a1a1a, { gloss: 0.6 }));
  clock.add(cf);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.18, 32), new THREE.MeshStandardMaterial({ map: textTexture('12\n\n9      3\n\n6', { size: 40, color: '#222', bg: '#f4f1ea', pad: 20, width: 256 }), roughness: 0.5 }));
  face.position.z = 0.021; clock.add(face);
  for (const [l, a] of [[0.1, 0.9], [0.14, -1.9]]) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.008, l, 0.004).translate(0, l / 2, 0), M('plastic', 0x111111));
    hand.position.z = 0.025; hand.rotation.z = a; clock.add(hand);
  }
  addLoose(ctx, clock, [0, 0, 1], 0.55, 0.2);
}

function boardTex() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 384;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(240,244,240,0.85)';
  g.font = '600 88px "Segoe Print", "Comic Sans MS", system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('ÇÖK · KAPAN · TUTUN', 512, 140);
  g.font = '64px "Segoe Print", "Comic Sans MS", system-ui, sans-serif';
  g.fillText('Tatbikat: 3. ders', 512, 280);
  // tebeşir dokusu: rastgele boşluklar
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.6})`; g.fillRect(Math.random() * 1024, Math.random() * 384, 2, 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function teacherDesk(ctx, x, z) {
  const g = ctx.group, m = M('wood', 0x7b4f2c, { varnish: true });
  box(g, 1.5, 0.04, 0.7, m, x, 0.73, z, 0.012);
  box(g, 0.45, 0.73, 0.66, m, x - 0.5, 0, z, 0.01);
  box(g, 0.04, 0.73, 0.66, m, x + 0.72, 0, z, 0.006);
  box(g, 1.4, 0.45, 0.02, m, x, 0.28, z - 0.3, 0.004);
  for (let k = 0; k < 3; k++) box(g, 0.4, 0.2, 0.01, M('wood', 0x8a5c36, { varnish: true }), x - 0.5, 0.05 + k * 0.23, z + 0.33, 0.004);
  const globe = looseGroup(ctx, x + 0.45, 0.77, z, 0.2);
  cyl(globe, 0.07, 0.08, 0.03, M('wood', 0x3a2a1c), 0, -0.2, 0, 20);
  cyl(globe, 0.008, 0.008, 0.1, M('metal', 0xb08d57), 0, -0.17, 0, 8);
  const sph = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 20), procedural({
    key: 'deprem-globe', params: { color: 0x2d5f9a, roughness: 0.35 },
    pattern: /* glsl */ `
      float l = smoothstep(0.52, 0.56, fbm3(normalize(p)*2.2 + 3.0, 5));
      col = mix(col, mix(vec3(0.42, 0.55, 0.28), vec3(0.72, 0.62, 0.4), fbm3(p*9.0, 3)), l);
      col = mix(col, vec3(0.95), smoothstep(0.85, 0.9, abs(normalize(p).y)));`,
  }));
  sph.position.y = 0.02;
  sph.rotation.z = 0.41;
  globe.add(sph);
  addLoose(ctx, globe, [0.5, 0, 0.8], 0.45, 0.2);
}

function cabinet(ctx, face, x, z) {
  const t = makeTall(ctx, face, x, z, 1.1, 1.9, 0.45, 'Dolap');
  const pm = M('painted', 0x8b96a3, { wear: 0.15 });
  carcass(t.inner, 1.1, 1.9, 0.45, pm, 0.02);
  for (const s of [-1, 1]) box(t.inner, 0.535, 1.8, 0.018, pm, s * 0.275, 0.07, 0.216, 0.004);
  for (const s of [-1, 1]) box(t.inner, 0.015, 0.14, 0.02, M('metal', 0x444444), s * 0.03, 1.0, 0.235, 0.005);
  const bx = box(ctx.group, 0.45, 0.3, 0.35, MAT.fabric({ color: 0xb58e5c }), x, 1.9, z, 0.015);
  addLoose(ctx, bx, face === 'left' ? [1, 0, 0] : [0, 0, 1], 0.4, 0.15);
  t.items.push(ctx.loose[ctx.loose.length - 1]);
}

function kitchen(ctx) {
  const g = ctx.group, z = -D + 0.32;
  const doorM = M('plastic', 0xf1efea, { gloss: 0.55 }), carc = M('plastic', 0xe4e1da, { gloss: 0.3 });
  box(g, 5.0, 0.1, 0.56, M('plastic', 0x2a2a2a, { gloss: 0.2 }), 0.3, 0, z - 0.03, 0.005);
  box(g, 5.0, 0.76, 0.58, carc, 0.3, 0.1, z - 0.02, 0.006);
  for (let i = 0; i < 8; i++) box(g, 0.6, 0.72, 0.02, doorM, -1.9 + i * 0.63 - 0.01 + 0.3 - 0.3 + 0.0, 0.12, z + 0.28, 0.006);
  for (let i = 0; i < 8; i++) box(g, 0.2, 0.012, 0.02, M('metal', 0xbfc3c7), -1.9 + i * 0.63, 0.76, z + 0.3, 0.005);
  const top = MAT.rock({ color: 0x3e3b38, strata: 0.1 });
  box(g, 5.0, 0.04, 0.64, top, 0.3, 0.86, z, 0.006);
  // Ankastre ocak (siyah cam) ve bekler
  box(g, 0.62, 0.012, 0.52, new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.05, clearcoat: 1 }), -0.3, 0.9, z, 0.004);
  for (const [a, b] of [[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.12], [0.15, 0.12]]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 8, 24), M('metal', 0x9a9ea3));
    r.rotation.x = Math.PI / 2;
    r.position.set(-0.3 + a, 0.918, z + b);
    g.add(r);
  }
  const pot = looseGroup(ctx, -0.45, 0.92, z + 0.1, 0.1);
  cyl(pot, 0.13, 0.12, 0.18, M('ceramic', 0xa3281f), 0, -0.1, 0, 28);
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.135, 24, 8, 0, Math.PI * 2, 0, 0.5), M('metal', 0xc9ccd0));
  lid.position.y = 0.02 - 0.075; pot.add(lid);
  for (const s of [-1, 1]) { const hd = box(pot, 0.05, 0.02, 0.03, M('rubber', 0x151515), s * 0.15, 0.03, 0, 0.008); hd.position.y = 0.05; }
  addLoose(ctx, pot, [0, 0, 1], 0.5, 0.1);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.035, 18, 1, true), M('glow', 0x5aa0ff, { intensity: 5 }));
  flame.position.set(-0.45, 0.935, z + 0.1);
  g.add(flame);
  ctx.flame = flame;
  ctx.keep = [...(ctx.keep || []), flame];
  // Evye (paslanmaz) ve batarya
  box(g, 0.62, 0.015, 0.44, M('metal', 0xc2c6ca, { rough: 0.25 }), 2.1, 0.892, z, 0.01);
  box(g, 0.52, 0.01, 0.34, M('metal', 0x8d9196, { rough: 0.35 }), 2.1, 0.894, z, 0.004);
  cyl(g, 0.018, 0.02, 0.26, M('metal', 0xd8dbde, { rough: 0.15 }), 2.1, 0.9, z - 0.18, 12);
  const spout = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 8, 20, Math.PI), M('metal', 0xd8dbde, { rough: 0.15 }));
  spout.position.set(2.1, 1.16, z - 0.09); spout.rotation.y = Math.PI / 2; g.add(spout);
  // Üst dolaplar, kapaklar (açılabilir) ve tabaklar
  for (let i = 0; i < 3; i++) {
    const ux = -1.6 + i * 0.9;
    box(g, 0.86, 0.75, 0.35, carc, ux, 1.55, -D + 0.18, 0.006);
    box(g, 0.8, 0.015, 0.3, carc, ux, 1.8, -D + 0.18, 0.003);
    const dd = new THREE.Group();
    dd.position.set(ux - 0.42, 1.55, -D + 0.36);
    g.add(dd);
    const leaf = box(dd, 0.84, 0.73, 0.02, doorM, 0.42, 0.01, 0, 0.006);
    box(dd, 0.02, 0.18, 0.02, M('metal', 0xbfc3c7), 0.78, 0.05, 0.02, 0.006);
    leaf.userData.cab = true;
    ctx.cabDoors = ctx.cabDoors || [];
    ctx.cabDoors.push({ g: dd, a: 0 });
    for (let k = 0; k < 3; k++) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.02, 28), M('ceramic', 0xfbfaf6));
      plate.position.set(ux - 0.25 + k * 0.25, 1.64, -D + 0.25);
      plate.rotation.x = Math.PI / 2 - 0.12;
      g.add(plate);
      addLoose(ctx, plate, [0, 0, 1], 0.5 + k * 0.1 + rand(0, 0.2), 0.1);
      ctx.loose[ctx.loose.length - 1].inCab = true;
    }
  }
  const jar = looseGroup(ctx, 1.2, 0.88, z, 0.1);
  cyl(jar, 0.06, 0.06, 0.18, M('glass'), 0, -0.1, 0, 20);
  cyl(jar, 0.055, 0.055, 0.12, new THREE.MeshStandardMaterial({ color: 0xd99a2b, roughness: 0.3 }), 0, -0.095, 0, 20);
  cyl(jar, 0.062, 0.062, 0.03, M('painted', 0xb3261e), 0, 0.08, 0, 20);
  addLoose(ctx, jar, [0, 0, 1], 0.5, 0.1);
}

function fridge(ctx, x, z) {
  const t = makeTall(ctx, 'back', x, z, 0.75, 1.85, 0.65, 'Buzdolabı', 1.2);
  const body = M('painted', 0xeceeef, { wear: 0.02 });
  box(t.inner, 0.75, 1.85, 0.62, body, 0, 0, -0.015, 0.03);
  box(t.inner, 0.74, 0.6, 0.03, body, 0, 1.24, 0.31, 0.02);
  box(t.inner, 0.74, 1.18, 0.03, body, 0, 0.04, 0.31, 0.02);
  const hm = M('metal', 0xbfc3c7);
  box(t.inner, 0.025, 0.4, 0.035, hm, 0.3, 1.3, 0.34, 0.01);
  box(t.inner, 0.025, 0.5, 0.035, hm, 0.3, 0.6, 0.34, 0.01);
  box(t.inner, 0.1, 0.1, 0.012, M('plastic', 0xd43d51), -0.12, 1.5, 0.332, 0.004);
  box(t.inner, 0.14, 0.09, 0.006, M('paper', 0xf6f0d8), -0.15, 1.32, 0.33, 0.002);
  return t;
}

// --- Yaşanmışlık ayrıntıları ---
// Orta sehpa: üstünde kitap yığını, kupa ve kumanda (düşebilir)
function coffeeTable(ctx, x, z) {
  const g = ctx.group, wm = M('wood', 0x6b4a30, { varnish: true });
  box(g, 0.9, 0.04, 0.5, wm, x, 0.4, z, 0.012);
  box(g, 0.82, 0.02, 0.42, wm, x, 0.12, z, 0.006);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.04, 0.44, 0.04, wm, x + sx * 0.4, 0, z + sz * 0.2, 0.008);
  // alt raftaki dergiler
  for (let i = 0; i < 3; i++) { const mg = box(g, 0.3, 0.012, 0.22, M('paper', [0xd9d2c0, 0x3d6a8a, 0xb8483a][i]), x - 0.18 + i * 0.03, 0.14 + i * 0.012, z + 0.02 - i * 0.02, 0.002); mg.rotation.y = i * 0.2 - 0.2; }
  const st = looseGroup(ctx, x + 0.18, 0.44, z - 0.02, 0.06);
  [[0x2d4e7a, 0.24, 0.17, 0.035], [0xc19a3a, 0.22, 0.15, 0.03], [0x8c2f2a, 0.2, 0.14, 0.04]].reduce((y, [c, w, d, h], i) => {
    const b = box(st, w, h, d, M('paper', c), 0, y, 0, 0.004); b.rotation.y = (i - 1) * 0.18; return y + h;
  }, -0.06);
  addLoose(ctx, st, [0.3, 0, 0.5], 0.5, 0.06);
  const cup = looseGroup(ctx, x - 0.22, 0.44, z + 0.08, 0.05);
  cyl(cup, 0.04, 0.034, 0.09, M('ceramic', 0xd9624a), 0, -0.05, 0, 18);
  addLoose(ctx, cup, [-0.3, 0, 0.4], 0.45, 0.05);
  const rc = box(g, 0.05, 0.018, 0.16, M('plastic', 0x1c1c1e), x - 0.05, 0.44, z - 0.12, 0.006); rc.rotation.y = 0.5;
}

// Ayaklı lamba (kumaş abajur, sıcak ışık; devrilebilir sayılmaz, ağır tabanlı)
function floorLamp(ctx, x, z, on = true) {
  const g = ctx.group, bm = M('metal', 0x2b2b2b, { rough: 0.4 });
  cyl(g, 0.16, 0.17, 0.03, bm, x, 0, z, 28);
  cyl(g, 0.012, 0.012, 1.42, bm, x, 0.03, z, 10);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.3, 32, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xefe4cc, roughness: 0.95, side: THREE.DoubleSide, emissive: on ? 0xffc98a : 0, emissiveIntensity: ctx.def.night ? 0.25 : 0.55 }));
  shade.position.set(x, 1.52, z);
  g.add(shade);
}

// Tül perdenin iki yanında kalın fon perde + korniş (kıvrımlı kumaş)
function curtains(ctx, x, w, h = 1.4, y0 = 0.95, color = 0x9b5d3a) {
  const g = ctx.group, top = y0 + h + 0.28;
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, w + 1.3, 10).rotateZ(Math.PI / 2), M('metal', 0x8a7a5a, { rough: 0.35 }));
  rod.position.set(x, top, -D + 0.13); g.add(rod);
  for (const s of [-1, 1]) {
    const L = top - 0.02, cg = new THREE.PlaneGeometry(0.46, L, 28, 8).translate(0, -L / 2, 0), pos = cg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i), v = -pos.getY(i) / L;
      pos.setX(i, u * (1 - 0.25 * Math.sin(Math.PI * Math.min(1, v * 1.4)) * (v > 0.55 ? 1 : v / 0.55)));
      pos.setZ(i, 0.045 * Math.sin(u * 44 + s) * (0.7 + 0.3 * v));
    }
    cg.computeVertexNormals();
    const c = new THREE.Mesh(cg, M('fabric', color, { scale: 2 }));
    c.material.side = THREE.DoubleSide;
    c.position.set(x + s * (w / 2 + 0.36), top, -D + 0.17);
    g.add(c);
  }
}

// Panel radyatör (pencere altında)
function radiator(ctx, x, w = 1.2) {
  const g = ctx.group, rm = M('painted', 0xf4f3ef, { wear: 0.02 });
  box(g, w, 0.55, 0.06, rm, x, 0.16, -D + 0.07, 0.01);
  for (let i = 0; i < Math.floor(w / 0.05); i++) box(g, 0.012, 0.52, 0.012, rm, x - w / 2 + 0.03 + i * 0.05, 0.175, -D + 0.105, 0.003);
  cyl(g, 0.012, 0.012, 0.16, M('metal', 0xd0d3d6), x - w / 2 - 0.04, 0, -D + 0.07, 10);
}

// Mutfak köşesi (açık mutfak tezgâhı: alt dolaplar, tezgâh üstünde düşebilecek eşyalar, raf)
function kitchenette(ctx, x, z0, z1) {
  const g = ctx.group, L = z1 - z0, zc = (z0 + z1) / 2;
  const carc = M('plastic', 0xe8e4dc, { gloss: 0.3 }), doorM = M('wood', 0x8a6444, { varnish: true });
  box(g, 0.56, 0.1, L - 0.04, M('plastic', 0x2a2a2a, { gloss: 0.2 }), x + 0.02, 0, zc, 0.005);
  box(g, 0.6, 0.76, L, carc, x, 0.1, zc, 0.006);
  const n = Math.round(L / 0.6);
  for (let i = 0; i < n; i++) {
    const zz = z0 + (i + 0.5) * (L / n);
    box(g, 0.02, 0.72, L / n - 0.02, doorM, x - 0.3, 0.12, zz, 0.006);
    box(g, 0.02, 0.012, 0.16, M('metal', 0x2e2e2e), x - 0.32, 0.8, zz, 0.004);
  }
  box(g, 0.66, 0.04, L + 0.04, MAT.rock({ color: 0xd8d3ca, strata: 0.15 }), x, 0.86, zc, 0.006);
  // su ısıtıcısı, meyve kâsesi, kesme tahtası, kavanozlar
  const k = looseGroup(ctx, x, 0.9, z0 + 0.3, 0.12);
  cyl(k, 0.085, 0.1, 0.2, M('metal', 0xcfd2d5, { rough: 0.15 }), 0, -0.12, 0, 24);
  cyl(k, 0.07, 0.085, 0.03, M('plastic', 0x1c1c1c), 0, 0.08, 0, 20);
  addLoose(ctx, k, [-1, 0, 0], 0.5, 0.12);
  const bowl = looseGroup(ctx, x - 0.05, 0.9, zc + 0.15, 0.06);
  bowl.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45).translate(0, 0.08, 0), M('ceramic', 0x2f6d8a)));
  for (const [a, c] of [[0, 0xd9412b], [2.1, 0xe8a326], [4.2, 0x8fb33a], [1, 0xd9412b]]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), M('plastic', c, { gloss: 0.6 })); f.position.set(Math.cos(a) * 0.06, -0.01 + (a === 1 ? 0.05 : 0), Math.sin(a) * 0.06); bowl.add(f); }
  addLoose(ctx, bowl, [-1, 0, 0.3], 0.55, 0.06);
  const cb = box(g, 0.3, 0.02, 0.4, M('wood', 0xc49a62), x + 0.05, 0.9, z1 - 0.4, 0.006); cb.rotation.y = 0.15;
  for (let i = 0; i < 3; i++) {
    const j = looseGroup(ctx, x + 0.2, 0.9, z1 - 0.12 - i * 0.13, 0.08);
    cyl(j, 0.05, 0.05, 0.16, M('glass'), 0, -0.08, 0, 16);
    cyl(j, 0.045, 0.045, 0.1 - i * 0.02, new THREE.MeshStandardMaterial({ color: [0xe8dcc0, 0x7a4a2a, 0xd8b04a][i], roughness: 0.8 }), 0, -0.075, 0, 16);
    cyl(j, 0.052, 0.052, 0.025, M('wood', 0xa07850), 0, 0.075, 0, 16);
    addLoose(ctx, j, [-1, 0, 0], 0.45 + i * 0.05, 0.08);
  }
}

// Avize: tavan göbeği, zincir, pirinç kollar ve cam laleler (sallanır; ctx.lamps)
function chandelier(ctx, x, z, len = 0.55, on = true) {
  const brass = M('metal', 0xb08a4e, { rough: 0.3 });
  cyl(ctx.group, 0.09, 0.07, 0.04, brass, x, H - 0.04, z, 24);
  const pivot = new THREE.Group();
  pivot.position.set(x, H - 0.04, z);
  ctx.group.add(pivot);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 6), brass);
  chain.position.y = -len / 2; pivot.add(chain);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 12), brass); hub.position.y = -len; pivot.add(hub);
  const shadeM = new THREE.MeshPhysicalMaterial({ color: 0xfaf3e4, roughness: 0.35, transmission: 0, transparent: true, opacity: 0.9, side: THREE.DoubleSide, emissive: on ? 0xffd9a0 : 0, emissiveIntensity: ctx.def.night ? 0.3 : 0.9 });
  const tulip = new THREE.LatheGeometry([[0.015, 0], [0.045, 0.02], [0.06, 0.07], [0.055, 0.1]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.007, 6, 16, Math.PI), brass);
    arm.position.set(Math.cos(a) * 0.1, -len, Math.sin(a) * 0.1);
    arm.rotation.set(0, -a, Math.PI); pivot.add(arm);
    const t = new THREE.Mesh(tulip, shadeM);
    t.position.set(Math.cos(a) * 0.2, -len, Math.sin(a) * 0.2); pivot.add(t);
  }
  ctx.lamps.push({ pivot, len, px: 0, pz: 0, vx: 0, vz: 0 });
}

// Duvar saati (düşebilir)
function wallClock(ctx, x, y) {
  const clock = looseGroup(ctx, x, y, -D + 0.03, 0.16);
  clock.add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 36).rotateX(Math.PI / 2), M('wood', 0x3a2a1c, { varnish: true })));
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.14, 36), new THREE.MeshStandardMaterial({ map: textTexture('12\n\n9      3\n\n6', { size: 40, color: '#222', bg: '#f4f1ea', pad: 20, width: 256 }), roughness: 0.5 }));
  face.position.z = 0.019; clock.add(face);
  for (const [l, a] of [[0.08, 2.4], [0.115, -0.6]]) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.007, l, 0.003).translate(0, l / 2, 0), M('plastic', 0x111111));
    hand.position.z = 0.022; hand.rotation.z = a; clock.add(hand);
  }
  addLoose(ctx, clock, [0, 0, 1], 0.55, 0.16);
}

// Tavan kornişi ve priz/anahtar (duvarlar boyunca)
function trims(ctx, openB, openL) {
  const g = ctx.group, cm = M('paint', 0xf4f1ea);
  box(g, W * 2, 0.07, 0.05, cm, 0, H - 0.082, -D + 0.025, 0.01);
  box(g, 0.05, 0.07, D * 2, cm, -W + 0.025, H - 0.082, 0, 0.01);
  box(g, 0.05, 0.07, D * 2, cm, W - 0.025, H - 0.082, 0, 0.01);
  box(g, 0.012, 0.08, 0.08, M('plastic', 0xf6f6f2, { gloss: 0.4 }), W - 0.006, 0.3, -1.2, 0.004);
  const pm = M('plastic', 0xf6f6f2, { gloss: 0.4 });
  box(g, 0.08, 0.08, 0.012, pm, -W + 0.5, 0.3, -D + 0.006, 0.004);
  box(g, 0.012, 0.08, 0.08, pm, -W + 0.006, 0.3, 1.0, 0.004);
  const dz = openL[0]?.x;
  if (dz != null) box(g, 0.012, 0.11, 0.07, pm, -W + 0.006, 1.05, dz - 0.72, 0.004);
  void openB;
}

// Tavan armatürü (sınıf): alüminyum kasa + opal difüzör (parlar)
function panel(ctx, x, z) {
  const g = ctx.group;
  box(g, 1.24, 0.05, 0.34, M('metal', 0xd6d8da, { rough: 0.4 }), x, H - 0.062, z, 0.008);
  box(g, 1.16, 0.012, 0.26, M('glow', 0xfff4e2, { intensity: 2.2 }), x, H - 0.07, z, 0.003);
}

export const BUILD = { panel, coffeeTable, floorLamp, curtains, radiator, kitchenette, chandelier, wallClock, window: window_, door, balcony, table, sofa, bookshelf, tvUnit, frame, rug, lamp, plant, wardrobe, bed, nightstand, desk, board, teacherDesk, cabinet, kitchen, fridge };

// --- Odalar ve seçenekler ---
// verdict: 'iyi' | 'orta' | 'kötü'; pose: 'crouch' | 'stand' | 'lie' | 'gone' | 'pillow'
// fig: [x, z, yaw] figürün duracağı yer (masa altı hedefleri: masanın kenarında, dizler altta); yoksa pos
export const ROOMS = [
  {
    key: 'salon', tab: 'Salon', icon: '🏠', title: 'Evde, salonda', wall: 0xe8ddcb, floor: 'wood', night: false,
    sky: { elevation: 21, azimuth: 336, clouds: 0.3 },
    intro: 'Akşam saatleri. Kanepede oturmuş kitap okuyorsun. Birden avizede bir tıkırtı… Sarsıntı başlayınca ne yapacaksın?',
    start: { pos: [0.4, 1.83], pose: 'sit', seat: 0.43, yaw: Math.PI },   // kanepede, TV'ye dönük (oturak minderi 0,49 m, yumuşak çöküş)
    items: [['rug', 0.6, 0.4, 3.4, 2.4, 0x8a3b24], ['window', 2.3, 1.6], ['balcony', -0.6], ['door', 1.6], ['bookshelf', 'left', -3.83, -1.4],
      ['tvUnit', -2.55], ['table', 1.9, -0.3], ['sofa', 0.4, 1.9], ['frame', 'left', 0.2, 1.4], ['frame', 'back', 0.9, 1.5, 0x6f97c4],
      ['plant', 3.4, -2.4], ['chandelier', 1.9, -0.3, 0.62], ['coffeeTable', -1.2, 1.0], ['floorLamp', -0.95, 2.35], ['frame', 'right', 1.5, 1.45, 0xc4a36f],
      ['curtains', 2.3, 1.6], ['radiator', 2.3], ['kitchenette', 3.66, -1.75, 0.55], ['wallClock', -2.55, 1.72]],
    spots: [
      { key: 'masa', icon: '🛡️', text: 'Sağlam masanın altında Çök-Kapan-Tutun', short: 'Masanın altı', pos: [1.9, -0.3], fig: [1.9, 0.62, Math.PI], pose: 'crouch', verdict: 'iyi',
        why: 'Harika! Sağlam bir masanın altı, düşen eşyalara karşı seni korur. Bir elinle başını-enseni korudun, diğeriyle masanın ayağını tuttun; masa kayarsa sen de onunla birlikte hareket edersin.' },
      { key: 'kanepe', icon: '🧎', text: 'Kanepenin yanında çök, başını ve enseni koru', short: 'Kanepenin yanı', pos: [1.65, 1.1], pose: 'crouch', verdict: 'orta',
        why: 'Fena değil: Masaya ulaşamıyorsan pencerelerden ve devrilebilecek eşyalardan uzakta, alçak ve sağlam bir eşyanın yanında çöküp başını-enseni korumak kabul edilir. Ama yakındaki sağlam masanın altı daha iyi korurdu.' },
      { key: 'kapi', icon: '🚪', text: 'Kapı eşiğine koş', short: 'Kapı eşiği', pos: [-3.6, 1.6], pose: 'stand', verdict: 'kötü',
        why: 'Kapı eşiği bugünkü binalarda odanın geri kalanından daha sağlam değildir. Sallanan kapı çarpıp seni yaralayabilir; oraya koşarken de düşebilirsin.' },
      { key: 'balkon', icon: '🌇', text: 'Balkona çık', short: 'Balkon', pos: [-0.6, -3.7], pose: 'stand', verdict: 'kötü',
        why: 'Balkonlar binanın en riskli bölümlerindendir: yukarıdan parça düşebilir, korkuluk ya da balkon hasar görebilir. Sarsıntı sırasında dışarıya ya da balkona çıkılmaz.' },
      { key: 'asansor', icon: '🛗', text: 'Asansöre koş', short: 'Asansör', pos: [-4.9, 1.6], pose: 'gone', verdict: 'kötü',
        why: 'Deprem sırasında ve sonrasında asansör asla kullanılmaz! Elektrik kesilir, asansör katlar arasında kalır ve içinde mahsur kalırsın.' },
      { key: 'pencere', icon: '🪟', text: 'Pencere kenarında dur', short: 'Pencere önü', pos: [2.3, -2.4], pose: 'stand', verdict: 'kötü',
        why: 'Camlar sarsıntıda kırılıp içeri saçılabilir. Pencerelerden, aynalardan ve cam eşyalardan uzak durmalısın.' },
      { key: 'kitaplik', icon: '📚', text: 'Kitaplığın dibine sığın', short: 'Kitaplık dibi', pos: [-3.2, -1.4], pose: 'crouch', verdict: 'kötü', tall: 'Kitaplık',
        why: 'Duvara sabitlenmemiş kitaplık devrilebilir; sabitli olsa bile raflardaki kitaplar üstüne düşer. Uzun ve ağır eşyaların yanından uzak dur.' },
    ],
    post: {
      q: 'Sarsıntı durdu. Şimdi ne yapmalısın?',
      options: [
        { text: 'Ayakkabımı giyerim, gaz vanasını ve elektriği kapatırım, deprem çantamla merdivenden inip toplanma alanına giderim', ok: true,
          why: 'Doğru! Cam kırıklarına karşı ayakkabı, yangına karşı gaz ve elektrik, asansör yerine merdiven, sonra toplanma alanı. Artçı sarsıntılara hazırlıklı ol.' },
        { text: 'Hızlıca asansörle aşağı inerim', ok: false, why: 'Asansör deprem sonrasında da kullanılmaz; elektrik kesilebilir, asansör hasar görmüş olabilir. Merdiveni kullan.' },
        { text: 'Gaz kaçağı var mı diye çakmak yakıp bakarım', ok: false, why: 'Asla! Gaz kaçağı varsa kıvılcım patlamaya yol açar. Kibrit, çakmak yakma; elektrik düğmelerine dokunma, gaz vanasını kapat.' },
      ],
    },
  },
  {
    key: 'sinif', tab: 'Sınıf', icon: '🏫', title: 'Okulda, sınıfta', wall: 0xdfe8df, floor: 'school', night: false,
    sky: { elevation: 40, azimuth: 352, clouds: 0.35 },
    intro: 'Matematik dersindesin, sıranda oturuyorsun. Öğretmenin tahtaya yazarken sınıf sallanmaya başladı!',
    start: { pos: [0.1, 2.3], pose: 'sit', seat: 0.44, yaw: Math.PI },    // sırada, tahtaya dönük
    items: [['board', -0.8], ['window', 2.7, 1.5], ['door', 1.9], ['cabinet', 'left', -3.77, -1.6], ['teacherDesk', -2.3, -1.7],
      ['desk', -1.6, 0.2], ['desk', 0.4, 0.2], ['desk', 2.4, 0.2], ['desk', -1.6, 1.8], ['desk', 0.4, 1.8], ['desk', 2.4, 1.8],
      ['frame', 'left', 0.3, 1.5, 0xd9b44a], ['frame', 'right', 0.6, 1.5, 0x6fa0c4], ['plant', 3.5, -2.5],
      ['panel', -1.4, -0.9], ['panel', 1.8, -0.9], ['panel', -1.4, 1.5], ['panel', 1.8, 1.5]],
    spots: [
      { key: 'sira', icon: '🛡️', text: 'Sıranın altında Çök-Kapan-Tutun', short: 'Sıranın altı', pos: [0.4, 1.8], fig: [1.62, 1.8, -Math.PI / 2], pose: 'crouch', verdict: 'iyi',
        why: 'Süper! Sıranın altına girip başını ve enseni korudun, sıranın ayağından sıkıca tuttun. Okullarda yapılan tatbikatlar tam da bunun içindir.' },
      { key: 'duvar', icon: '🧱', text: 'İç duvarın dibinde çök, başını koru', short: 'İç duvar dibi', pos: [-3.6, 0.45], pose: 'crouch', verdict: 'orta',
        why: 'Masa ya da sıra yoksa pencerelerden ve dolaplardan uzak bir iç duvarın dibinde çöküp başını-enseni korumak kabul edilir. Ama sıranın altı hemen yanındaydı ve daha iyi korurdu; yürürken de düşebilirdin.' },
      { key: 'koridor', icon: '🏃', text: 'Koridora koşup merdivenden in', short: 'Koridor / merdiven', pos: [-4.9, 1.9], pose: 'gone', verdict: 'kötü',
        why: 'Sarsıntı sırasında koşmak, merdivenlerde düşmek ve kalabalıkta itişmek en sık yaralanma nedenlerindendir. Önce olduğun yerde Çök-Kapan-Tutun; tahliye sarsıntı bitince, öğretmenin talimatıyla yapılır.' },
      { key: 'pencere', icon: '🪟', text: 'Pencerenin yanına git', short: 'Pencere', pos: [2.7, -2.4], pose: 'stand', verdict: 'kötü',
        why: 'Pencere camları kırılıp saçılabilir. Sınıfta pencere kenarındaki sıralardan bile uzaklaşıp sıranın altına girmek gerekir.' },
      { key: 'kapi', icon: '🚪', text: 'Kapı eşiğinde dur', short: 'Kapı eşiği', pos: [-3.6, 1.9], pose: 'stand', verdict: 'kötü',
        why: 'Kapı eşiği korunaklı bir yer değildir; kapı çarpabilir, herkes kapıya yönelince izdiham olur.' },
      { key: 'dolap', icon: '🗄️', text: 'Dolabın yanına sığın', short: 'Dolabın yanı', pos: [-3.1, -1.6], pose: 'crouch', verdict: 'kötü', tall: 'Dolap',
        why: 'Duvara sabitlenmemiş dolaplar devrilebilir, üstündeki kutular düşer. Uzun eşyalardan uzak dur.' },
    ],
    post: {
      q: 'Sarsıntı durdu. Sınıfça ne yapmalısınız?',
      options: [
        { text: 'Öğretmeni dinleriz; koşmadan, itişmeden, sırayla merdivenden inip okulun toplanma alanına gideriz', ok: true,
          why: 'Doğru! Sakin ve düzenli tahliye çok önemli. Toplanma alanında öğretmen yoklama alır; kimse eksik kalmaz.' },
        { text: 'Çantamı ve telefonumu bulmak için sınıfa geri dönerim', ok: false, why: 'Eşyalar için geri dönülmez. Artçı sarsıntı olabilir; önce güvenli alana çık.' },
        { text: 'Hemen binanın dibinde arkadaşlarımla beklerim', ok: false, why: 'Bina dibinde düşen parçalar (cam, sıva, tabela) tehlikelidir. Binalardan uzak, açık toplanma alanına gidilir.' },
      ],
    },
  },
  {
    key: 'mutfak', tab: 'Mutfak', icon: '🍳', title: 'Evde, mutfakta', wall: 0xefece4, floor: 'tile', night: false,
    sky: { elevation: 30, azimuth: 328, clouds: 0.25 },
    intro: 'Annenle birlikte mutfaktasın, ocakta çorba pişiyor. Tabaklar tıkırdamaya başladı… Deprem!',
    start: { pos: [-0.4, -1.9], pose: 'stand', yaw: Math.PI },
    items: [['kitchen'], ['window', 2.1, 1.1, 0.9, 1.05], ['fridge', -3.35, -2.65], ['door', 1.8], ['table', 1.6, 0.9, 1.3, 0.85, 0x9a6a3a],
      ['frame', 'left', -0.4, 1.4, 0x7fb07a], ['frame', 'right', 0.2, 1.45, 0xd98a5a], ['lamp', 1.6, 0.9, 0.8]],
    spots: [
      { key: 'masa', icon: '🛡️', text: 'Mutfak masasının altında Çök-Kapan-Tutun', short: 'Masanın altı', pos: [1.6, 0.9], fig: [1.6, 1.79, Math.PI], pose: 'crouch', verdict: 'iyi',
        why: 'Çok iyi! Ocaktan, dolaplardan ve buzdolabından uzaklaşıp sağlam masanın altına girdin. Mutfakta düşen tabaklar ve devrilen eşyalar en büyük tehlikedir.' },
      { key: 'ocak', icon: '🔥', text: 'Ocağı kapatmaya çalış', short: 'Ocak başı', pos: [-0.4, -2.3], pose: 'stand', verdict: 'kötü',
        why: 'Sarsıntı sırasında sıcak tencere üstüne dökülebilir, üst dolaptaki tabaklar düşebilir. Önce kendini koru; ocağı ve gaz vanasını sarsıntı bitince kapat.' },
      { key: 'buzdolabi', icon: '🧊', text: 'Buzdolabının yanına sığın', short: 'Buzdolabı yanı', pos: [-2.6, -2.0], pose: 'crouch', verdict: 'kötü', tall: 'Buzdolabı',
        why: 'Buzdolabı gibi ağır eşyalar kayabilir ya da devrilebilir. Sabitlenmemişse üstüne düşebilir.' },
      { key: 'tezgah', icon: '🍽️', text: 'Tezgâhın önünde çömel', short: 'Tezgâh önü', pos: [0.9, -2.2], pose: 'crouch', verdict: 'kötü',
        why: 'Üst dolapların kapakları sarsıntıda açılır, tabaklar ve bardaklar kafana düşebilir. Dolapların altından uzaklaş.' },
      { key: 'pencere', icon: '🪟', text: 'Pencereden dışarı bak', short: 'Pencere', pos: [2.1, -2.25], pose: 'stand', verdict: 'kötü',
        why: 'Pencere camı kırılabilir. Dışarıya bakmak seni korumaz; en yakın sağlam masanın altına gir.' },
      { key: 'disari', icon: '🏃', text: 'Kapıdan dışarı koş', short: 'Dışarı koş', pos: [-4.9, 1.8], pose: 'gone', verdict: 'kötü',
        why: 'Sarsıntı sırasında koşarak çıkmaya çalışmak düşmelere, merdivende yaralanmalara ve dışarıda düşen parçalara maruz kalmaya yol açar. Sarsıntı bitene kadar olduğun yerde korun.' },
    ],
    post: {
      q: 'Sarsıntı durdu. Mutfakta gaz kokusu alıyorsun. Ne yaparsın?',
      options: [
        { text: 'Ocağı ve gaz vanasını kapatırım, ışık düğmelerine dokunmadan pencereyi açarım, dışarı çıkıp durumu büyüklere / 112\'ye bildiririm', ok: true,
          why: 'Doğru! Gaz kokusu varsa kıvılcım çıkarabilecek hiçbir şeye (ışık düğmesi, çakmak) dokunulmaz. Gazı kes, havalandır, uzaklaş ve bildir.' },
        { text: 'Işığı yakıp nereden kaçtığına bakarım', ok: false, why: 'Işık düğmesi küçük bir kıvılcım çıkarabilir ve gaz patlamasına yol açabilir. Düğmelere dokunma.' },
        { text: 'Önce yere dökülen yemeği ve kırıkları temizlerim', ok: false, why: 'Temizlik bekleyebilir. Önce gaz ve elektrik güvenliği, sonra güvenli tahliye. Artçı sarsıntılar olabilir.' },
      ],
    },
  },
  {
    key: 'gece', tab: 'Gece', icon: '🌙', title: 'Gece, yatak odasında', wall: 0x9aa2bf, floor: 'night', night: true,
    sky: { elevation: -15, azimuth: 200, clouds: 0.15 },
    intro: 'Gece saat 03.00. Derin uykudasın… Yatağın sallanıyor, karanlıkta bir şeyler düşüyor!',
    start: { pos: [-3.05, -0.3], pose: 'lie' },
    items: [['rug', 0.3, 0.8, 2.6, 2.0, 0x3b3f7a], ['bed', -3.0, -0.3], ['nightstand', -3.6, -1.35], ['wardrobe', -0.4, -2.68], ['window', 2.4, 1.4],
      ['door', 2.2], ['frame', 'back', 1.0, 1.5, 0x8b7fc4], ['frame', 'right', -0.9, 1.45, 0x6f8fb0], ['desk', 2.8, 1.6, -Math.PI / 2, 0xd8d2c6]],
    spots: [
      { key: 'yatak', icon: '🛏️', text: 'Yatakta kal, başını yastıkla koru', short: 'Yatakta kal', pos: [-3.0, -0.3], pose: 'pillow', verdict: 'iyi',
        why: 'Doğru! Gece yataktaysan yatakta kal, yüzüstü dönüp başını ve enseni yastıkla koru. Karanlıkta yürümeye çalışmak, yerdeki cam kırıkları ve düşen eşyalar yüzünden daha tehlikelidir.' },
      { key: 'masa', icon: '🪑', text: 'Kalkıp çalışma masasının altına geç', short: 'Çalışma masası', pos: [2.8, 1.6], fig: [2.8, 0.37, 0], pose: 'crouch', verdict: 'orta',
        why: 'Masa altı iyi bir yer ama gece karanlığında yataktan kalkıp yürümek riskli: yere düşen cam ve eşyalara basabilir, düşebilirsin. Yataktaysan yatakta kalmak daha güvenli.' },
      { key: 'kapi', icon: '🚪', text: 'Karanlıkta kapıya koş', short: 'Kapıya koş', pos: [-3.6, 2.2], pose: 'stand', verdict: 'kötü',
        why: 'Karanlıkta koşarken düşebilir, çıplak ayakla cam kırıklarına basabilirsin. Kapı çarpabilir. Sarsıntı sırasında yer değiştirme.' },
      { key: 'pencere', icon: '🪟', text: 'Pencereye gidip dışarı bak', short: 'Pencere', pos: [2.4, -2.4], pose: 'stand', verdict: 'kötü',
        why: 'Pencere camı kırılıp üstüne saçılabilir. Neler olduğunu görmek için pencereye gitmek seni tehlikeye atar.' },
      { key: 'gardirop', icon: '🚪', text: 'Gardırobun önüne sığın', short: 'Gardırop önü', pos: [-0.4, -1.95], pose: 'crouch', verdict: 'kötü', tall: 'Gardırop',
        why: 'Sabitlenmemiş gardırop devrilebilir, üstündeki kutular düşer. Yatak odasında gardırobu duvara sabitlemek ve yatağı ondan uzağa koymak çok önemlidir.' },
    ],
    post: {
      q: 'Sarsıntı durdu. Karanlık ve elektrikler kesik. Ne yaparsın?',
      options: [
        { text: 'Başucumdaki el fenerini alırım, ayakkabımı giyerim, ailemle buluşup merdivenle toplanma alanına çıkarız', ok: true,
          why: 'Doğru! El feneri ve ayakkabı gece depremlerinde hayat kurtarır: yerde cam kırıkları olabilir. Ailecek buluşup güvenli şekilde çıkın.' },
        { text: 'Mum ya da kibrit yakarak yolumu bulurum', ok: false, why: 'Gaz kaçağı olabilir; açık alev yangın ve patlama riski taşır. El feneri kullan.' },
        { text: 'Çıplak ayakla hemen koşarak dışarı çıkarım', ok: false, why: 'Yerde cam kırıkları ve devrilmiş eşyalar olabilir. Ayakkabı giy, dikkatli ve sakin çık.' },
      ],
    },
  },
];

export { W, D, H };
