// Deprem anı odaları: mobilya kurucuları, serbest eşyalar, devrilebilir dolaplar ve her odanın seçenekleri.
import { THREE, rand, BufferGeometryUtils } from '@core';

const W = 4, D = 3, H = 2.8; // oda yarı genişliği (x), yarı derinliği (z), duvar yüksekliği

// Lambert: yazılım WebGL'de ve telefonlarda Standard'dan çok daha hızlı
const mat = (color, o = {}) => {
  const { roughness, metalness, ...rest } = o;
  return new THREE.MeshLambertMaterial({ color, ...rest });
};

function box(parent, w, h, d, m, x, y, z) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y + h / 2, z);
  parent.add(b);
  return b;
}

function floorTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (kind === 'tile') {
    g.fillStyle = '#cfd5d8'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#9aa3a8'; g.lineWidth = 3;
    for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  } else if (kind === 'school') {
    g.fillStyle = '#b9ad93'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(0,0,0,.05)';
    for (let i = 0; i < 400; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  } else {
    const base = kind === 'night' ? [92, 70, 60] : [160, 112, 70];
    for (let i = 0; i < 8; i++) {
      const k = 0.85 + Math.random() * 0.25;
      g.fillStyle = `rgb(${base.map((v) => Math.round(v * k)).join(',')})`;
      g.fillRect(0, i * 32, 256, 32);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(0, i * 32 + 31, 256, 1);
      g.fillRect(((i * 97) % 200) + 20, i * 32, 1, 32);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  return t;
}

/** Oda iskeleti + mobilya. Dönen ctx: group, loose (düşebilen eşyalar), tall (devrilebilir), windows, lamps. */
export function buildRoom(def) {
  const g = new THREE.Group();
  const ctx = { group: g, loose: [], tall: [], windows: [], lamps: [], def };

  // Zemin ve duvarlar (ön ve sağ duvar kesik: "bebek evi" görünümü)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2), new THREE.MeshLambertMaterial({ map: floorTexture(def.floor) }));
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  const wallM = mat(def.wall, { roughness: 0.95 });
  box(g, W * 2 + 0.3, H, 0.15, wallM, 0.15, 0, -D - 0.075);
  box(g, 0.15, H, D * 2 + 0.15, wallM, -W - 0.075, 0, 0.075);
  const baseM = mat(0xf5f5f0);
  box(g, W * 2, 0.1, 0.03, baseM, 0, 0, -D + 0.015);
  box(g, 0.03, 0.1, D * 2, baseM, -W + 0.015, 0, 0);
  // Kesik kenar pervazı
  const edgeM = mat(0x4b5563);
  box(g, W * 2 + 0.3, 0.12, 0.2, edgeM, 0.15, -0.12, D + 0.1);
  box(g, 0.2, 0.12, D * 2 + 0.3, edgeM, W + 0.1, -0.12, 0.15);

  for (const it of def.items) BUILD[it[0]](ctx, ...it.slice(1));
  mergeStatic(ctx);
  return ctx;
}

/** Hareket etmeyen kutuları renklerine göre tek meshte birleştirir (çizim çağrısı sayısını azaltır). */
function mergeStatic(ctx) {
  const dyn = new Set();
  ctx.loose.forEach((o) => dyn.add(o.mesh));
  ctx.tall.forEach((t) => dyn.add(t.pivot));
  ctx.lamps.forEach((l) => dyn.add(l.pivot));
  ctx.windows.forEach((w) => dyn.add(w.pane));
  (ctx.cabDoors || []).forEach((c) => dyn.add(c.g));
  if (ctx.door) dyn.add(ctx.door);
  if (ctx.pillow) dyn.add(ctx.pillow);
  const g = ctx.group;
  g.updateMatrixWorld(true);
  const buckets = new Map();
  const victims = [];
  const visit = (o) => {
    for (const c of o.children) {
      if (dyn.has(c)) continue;
      if (c.isMesh && c.material.isMeshLambertMaterial && !c.material.transparent && !c.material.map && c.children.length === 0) {
        const key = c.material.color.getHex() + '|' + (c.material.emissive?.getHex() || 0) + '|' + c.material.side + '|' + !!c.material.flatShading;
        if (!buckets.has(key)) buckets.set(key, { mat: c.material, geos: [] });
        const geo = (c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone());
        for (const a of Object.keys(geo.attributes)) if (a !== 'position' && a !== 'normal') geo.deleteAttribute(a);
        geo.applyMatrix4(c.matrixWorld);
        buckets.get(key).geos.push(geo);
        victims.push(c);
      } else visit(c);
    }
  };
  visit(g);
  for (const v of victims) { v.removeFromParent(); v.geometry.dispose(); }
  for (const { mat: m, geos } of buckets.values()) {
    const merged = BufferGeometryUtils.mergeGeometries(geos);
    geos.forEach((x) => x.dispose());
    if (merged) g.add(new THREE.Mesh(merged, m));
  }
}

// --- Yardımcılar ---
function addLoose(ctx, mesh, dir, thr = 0.5, half = 0.08) {
  ctx.loose.push({ mesh, dir, thr, half, v: new THREE.Vector3(), w: new THREE.Vector3(), state: 0, home: mesh.position.clone(), homeR: mesh.rotation.clone() });
}

/** Devrilebilir uzun eşya: pivot ön-alt kenarda. face: 'back' (arka duvarda, +z'ye bakar) | 'left' (sol duvarda, +x'e bakar) */
function makeTall(ctx, face, x, z, w, h, d, color, name, maxA = 1.35) {
  const pivot = new THREE.Group();
  const inner = new THREE.Group();
  pivot.add(inner);
  if (face === 'back') { pivot.position.set(x, 0, z + d / 2); inner.position.set(0, 0, -d / 2); }
  else { pivot.position.set(x + d / 2, 0, z); inner.position.set(-d / 2, 0, 0); inner.rotation.y = Math.PI / 2; }
  ctx.group.add(pivot);
  box(inner, w, h, d, mat(color), 0, 0, 0);
  const t = { pivot, inner, face, h, th: 0, om: 0, falling: false, maxA, name, items: [] };
  ctx.tall.push(t);
  return t;
}

function window_(ctx, x, w, h = 1.4, y0 = 0.95) {
  const g = ctx.group, z = -D + 0.02, night = ctx.def.night;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: night ? 0x1e2a4a : 0x9fd4f5 }));
  sky.position.set(x, y0 + h / 2, z);
  g.add(sky);
  if (night) {
    const moon = new THREE.Mesh(new THREE.CircleGeometry(0.13, 20), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }));
    moon.position.set(x + w * 0.25, y0 + h * 0.72, z + 0.005);
    g.add(moon);
  } else {
    // Karşıdaki binalar
    const bm = new THREE.MeshBasicMaterial({ color: 0xb9c7d6 });
    for (let i = 0; i < 3; i++) {
      const bh = h * (0.3 + 0.2 * i);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.22, bh), bm);
      b.position.set(x - w * 0.3 + i * w * 0.3, y0 + bh / 2, z + 0.004);
      g.add(b);
    }
  }
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xe0f4ff, transparent: true, opacity: 0.3 }));
  pane.position.set(x, y0 + h / 2, z + 0.03);
  g.add(pane);
  const fm = mat(0xf8fafc);
  box(g, w + 0.14, 0.07, 0.1, fm, x, y0 - 0.07, z + 0.03);
  box(g, w + 0.14, 0.07, 0.1, fm, x, y0 + h, z + 0.03);
  box(g, 0.07, h, 0.1, fm, x - w / 2 - 0.035, y0, z + 0.03);
  box(g, 0.07, h, 0.1, fm, x + w / 2 + 0.035, y0, z + 0.03);
  box(g, 0.05, h, 0.06, fm, x, y0, z + 0.04);
  box(g, w + 0.3, 0.04, 0.22, fm, x, y0 - 0.1, z + 0.1); // denizlik
  ctx.windows.push({ pane, x, y: y0 + h / 2, z: z + 0.05, w, h, broken: false });
}

function door(ctx, z, label = true) {
  const g = ctx.group, x = -W + 0.02;
  box(g, 0.02, 2.1, 0.95, new THREE.MeshBasicMaterial({ color: 0x1f2937 }), x, 0, z);
  const fm = mat(0xe5e7eb);
  box(g, 0.1, 0.08, 1.11, fm, x + 0.03, 2.1, z);
  box(g, 0.1, 2.1, 0.08, fm, x + 0.03, 0, z - 0.515);
  box(g, 0.1, 2.1, 0.08, fm, x + 0.03, 0, z + 0.515);
  const hinge = new THREE.Group();
  hinge.position.set(x + 0.05, 0, z + 0.47);
  g.add(hinge);
  const leaf = box(hinge, 0.05, 2.05, 0.92, mat(0xa16207), 0, 0, -0.46);
  box(leaf, 0.08, 0.04, 0.12, mat(0xd4d4d8, { metalness: 0.8, roughness: 0.3 }), 0.05, -0.02, -0.34);
  hinge.rotation.y = -0.5;
  ctx.door = hinge;
}

function balcony(ctx, x, w = 1.1) {
  const g = ctx.group, z = -D + 0.02;
  box(g, w, 2.2, 0.02, new THREE.MeshBasicMaterial({ color: 0x9fd4f5 }), x, 0, z - 0.01);
  const fm = mat(0xf8fafc);
  box(g, w + 0.14, 0.07, 0.1, fm, x, 2.2, z + 0.03);
  box(g, 0.07, 2.2, 0.1, fm, x - w / 2 - 0.035, 0, z + 0.03);
  box(g, 0.07, 2.2, 0.1, fm, x + w / 2 + 0.035, 0, z + 0.03);
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.2), new THREE.MeshBasicMaterial({ color: 0xe0f4ff, transparent: true, opacity: 0.25 }));
  pane.position.set(x, 1.1, z + 0.03);
  g.add(pane);
  // Dışarıdaki balkon döşemesi ve korkuluk (duvarın arkasında, yukarıdan görünür)
  const slab = box(g, 2.6, 0.12, 1.3, mat(0x9ca3af), x, -0.12, -D - 0.8);
  slab.userData.balcony = true;
  const rm = mat(0x475569, { metalness: 0.5 });
  box(g, 2.6, 0.05, 0.05, rm, x, 1.0, -D - 1.42);
  for (let i = 0; i <= 8; i++) box(g, 0.03, 1.0, 0.03, rm, x - 1.28 + i * 0.32, 0, -D - 1.42);
  const pot = box(g, 0.25, 0.3, 0.25, mat(0xc2410c), x + 0.9, 0, -D - 0.5);
  addLoose(ctx, pot, [0.2, 0, -0.4], 0.6, 0.15);
}

function table(ctx, x, z, w = 1.4, d = 0.9, color = 0x8b5a2b, chairs = true) {
  const g = ctx.group, m = mat(color);
  box(g, w, 0.07, d, m, x, 0.7, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.07, 0.7, 0.07, m, x + sx * (w / 2 - 0.08), 0, z + sz * (d / 2 - 0.08));
  if (chairs) for (const sx of [-1, 1]) chair(ctx, x + sx * (w / 2 + 0.25), z, sx > 0 ? -Math.PI / 2 : Math.PI / 2, color);
  const cup = box(g, 0.09, 0.11, 0.09, mat(0xffffff), x + 0.3, 0.77, z - 0.1);
  addLoose(ctx, cup, [0.3, 0, 0.3], 0.55, 0.06);
}

function chair(ctx, x, z, ry, color) {
  const c = new THREE.Group();
  c.position.set(x, 0, z);
  c.rotation.y = ry;
  const m = mat(color);
  box(c, 0.42, 0.05, 0.42, m, 0, 0.42, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(c, 0.04, 0.42, 0.04, m, sx * 0.18, 0, sz * 0.18);
  box(c, 0.42, 0.45, 0.04, m, 0, 0.47, -0.19);
  ctx.group.add(c);
}

function sofa(ctx, x, z) {
  const g = ctx.group, m = mat(0x3b82f6, { roughness: 0.95 }), m2 = mat(0x2563eb, { roughness: 0.95 });
  box(g, 2.0, 0.42, 0.85, m, x, 0, z);
  box(g, 2.0, 0.5, 0.2, m2, x, 0.42, z + 0.33);
  box(g, 0.18, 0.28, 0.85, m2, x - 0.99, 0.42, z);
  box(g, 0.18, 0.28, 0.85, m2, x + 0.99, 0.42, z);
  const cushion = box(g, 0.35, 0.3, 0.12, mat(0xfbbf24), x + 0.6, 0.45, z + 0.18);
  addLoose(ctx, cushion, [0, 0, -0.4], 0.8, 0.06);
}

function bookshelf(ctx, face, x, z) {
  const t = makeTall(ctx, face, x, z, 1.0, 2.0, 0.35, 0x92400e, 'Kitaplık');
  const cols = [0xef4444, 0x3b82f6, 0x22c55e, 0xeab308, 0xa855f7, 0xf97316];
  const sm = mat(0x78350f);
  for (let s = 0; s < 4; s++) {
    box(t.inner, 0.94, 0.03, 0.3, sm, 0, 0.35 + s * 0.45, 0.03);
    for (let b = 0; b < 5; b++) {
      const bh = rand(0.24, 0.34);
      const bk = box(t.inner, 0.1, bh, 0.22, mat(cols[(s * 5 + b) % cols.length]), -0.38 + b * 0.14 + rand(-0.02, 0.02), 0.38 + s * 0.45, 0.06);
      // Kitabı oda grubuna taşı (düşünce bağımsız hareket etsin)
      const [rx, ry, rz] = face === 'back' ? [x + bk.position.x, bk.position.y, z + 0.06] : [x + 0.06, bk.position.y, z - bk.position.x];
      t.inner.remove(bk);
      bk.position.set(rx, ry, rz);
      if (face === 'left') bk.rotation.y = Math.PI / 2;
      ctx.group.add(bk);
      addLoose(ctx, bk, face === 'back' ? [0, 0, 1] : [1, 0, 0], 0.45 + s * 0.08 + rand(0, 0.35), bh / 2);
      t.items.push(ctx.loose[ctx.loose.length - 1]);
    }
  }
  return t;
}

function tvUnit(ctx, x) {
  const g = ctx.group, z = -D + 0.25;
  box(g, 1.6, 0.5, 0.45, mat(0x57534e), x, 0, z);
  const t = makeTall(ctx, 'back', x, z - 0.02, 1.1, 0.68, 0.08, 0x111827, 'Televizyon', 1.45);
  t.pivot.position.y = 0.5;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.56), new THREE.MeshBasicMaterial({ color: 0x1e3a8a }));
  scr.position.set(0, 0.34, 0.045);
  t.inner.add(scr);
  t.screen = scr;
  const vase = box(g, 0.14, 0.3, 0.14, mat(0x14b8a6), x + 0.62, 0.5, z);
  addLoose(ctx, vase, [0, 0, 1], 0.45, 0.15);
}

function frame(ctx, face, a, y, color = 0xfca5a5) {
  const g = ctx.group;
  const f = face === 'back' ? box(g, 0.6, 0.45, 0.04, mat(0x3f3f46), a, y, -D + 0.03) : box(g, 0.04, 0.45, 0.6, mat(0x3f3f46), -W + 0.03, y, a);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.35), new THREE.MeshBasicMaterial({ color }));
  if (face === 'back') p.position.set(0, 0, 0.025); else { p.position.set(0.025, 0, 0); p.rotation.y = Math.PI / 2; }
  f.add(p);
  addLoose(ctx, f, face === 'back' ? [0, 0, 1] : [1, 0, 0], 0.55, 0.22);
}

function rug(ctx, x, z, w, d, color) {
  const r = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, { roughness: 1 }));
  r.rotation.x = -Math.PI / 2;
  r.position.set(x, 0.005, z);
  ctx.group.add(r);
}

function lamp(ctx, x, z, len = 0.9, on = true) {
  const pivot = new THREE.Group();
  pivot.position.set(x, H, z);
  ctx.group.add(pivot);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, len, 6), mat(0x111111));
  cord.position.y = -len / 2;
  pivot.add(cord);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.22, 20, 1, true), mat(0xfde68a, { side: THREE.DoubleSide, emissive: on ? 0x6b4e10 : 0 }));
  shade.position.y = -len - 0.05;
  pivot.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: on ? 0xfff7cc : 0x777777 }));
  bulb.position.y = -len - 0.12;
  pivot.add(bulb);
  ctx.lamps.push({ pivot, len, px: 0, pz: 0, vx: 0, vz: 0 });
}

function plant(ctx, x, z) {
  const g = ctx.group;
  const pot = box(g, 0.3, 0.35, 0.3, mat(0xb45309), x, 0, z);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), mat(0x16a34a, { flatShading: true }));
  leaves.position.y = 0.4;
  pot.add(leaves);
  addLoose(ctx, pot, [0.6, 0, 0.6], 0.8, 0.18);
}

function wardrobe(ctx, x, z) {
  const t = makeTall(ctx, 'back', x, z, 1.5, 2.2, 0.6, 0xa16207, 'Gardırop', 1.3);
  const m = mat(0x854d0e);
  box(t.inner, 0.02, 2.0, 0.02, m, 0, 0.1, 0.31);
  box(t.inner, 0.05, 0.25, 0.04, mat(0xd4d4d8), -0.08, 1.0, 0.32);
  box(t.inner, 0.05, 0.25, 0.04, mat(0xd4d4d8), 0.08, 1.0, 0.32);
  const bx = box(ctx.group, 0.5, 0.3, 0.4, mat(0xfda4af), x - 0.3, 2.2, z);
  addLoose(ctx, bx, [0, 0, 1], 0.4, 0.15);
  t.items.push(ctx.loose[ctx.loose.length - 1]);
}

function bed(ctx, x, z) {
  const g = ctx.group;
  box(g, 2.0, 0.4, 1.4, mat(0x7c2d12), x, 0, z);
  box(g, 1.95, 0.15, 1.35, mat(0xf1f5f9), x, 0.4, z);
  box(g, 1.3, 0.08, 1.38, mat(0x6366f1), x + 0.3, 0.55, z);
  box(g, 0.1, 0.9, 1.4, mat(0x7c2d12), x - 1.0, 0, z);
  const pillow = box(g, 0.4, 0.14, 0.7, mat(0xffffff), x - 0.7, 0.55, z);
  ctx.pillow = pillow;
}

function nightstand(ctx, x, z) {
  const g = ctx.group;
  box(g, 0.45, 0.5, 0.4, mat(0x7c2d12), x, 0, z);
  const glass = box(g, 0.08, 0.14, 0.08, mat(0xbae6fd, { transparent: true, opacity: 0.7 }), x + 0.1, 0.5, z);
  addLoose(ctx, glass, [0.5, 0, 0.3], 0.4, 0.07);
  const lampM = box(g, 0.18, 0.3, 0.18, mat(0xfef3c7, { emissive: 0x3f3000 }), x - 0.08, 0.5, z);
  addLoose(ctx, lampM, [0.5, 0, 0.2], 0.6, 0.15);
}

function desk(ctx, x, z, ry = 0, color = 0xd6c29a) {
  const d = new THREE.Group();
  d.position.set(x, 0, z);
  d.rotation.y = ry;
  const m = mat(color), lm = mat(0x475569, { metalness: 0.6 });
  box(d, 1.2, 0.05, 0.55, m, 0, 0.7, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(d, 0.04, 0.7, 0.04, lm, sx * 0.55, 0, sz * 0.23);
  box(d, 1.1, 0.35, 0.02, lm, 0, 0.35, -0.24);
  // Sandalyeler
  for (const sx of [-0.3, 0.3]) {
    box(d, 0.36, 0.04, 0.36, mat(0x2563eb), sx, 0.42, 0.45);
    box(d, 0.36, 0.38, 0.03, mat(0x2563eb), sx, 0.46, 0.62);
    for (const a of [-1, 1]) for (const b of [-1, 1]) box(d, 0.03, 0.42, 0.03, lm, sx + a * 0.15, 0, 0.45 + b * 0.15);
  }
  ctx.group.add(d);
  const book = box(ctx.group, 0.25, 0.04, 0.32, mat(0xef4444), x - 0.2, 0.75, z);
  addLoose(ctx, book, [0, 0, 1], 0.6, 0.02);
}

function board(ctx, x) {
  const g = ctx.group, z = -D + 0.03;
  box(g, 2.8, 1.2, 0.05, mat(0x14532d), x, 0.95, z);
  const fm = mat(0x92400e);
  box(g, 2.9, 0.06, 0.08, fm, x, 0.9, z);
  box(g, 2.9, 0.06, 0.08, fm, x, 2.15, z);
  const txt = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), new THREE.MeshBasicMaterial({ map: boardTex(), transparent: true }));
  txt.position.set(x, 1.55, z + 0.03);
  g.add(txt);
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 24), mat(0xffffff));
  clock.rotation.x = Math.PI / 2;
  clock.position.set(x + 2.0, 2.3, z + 0.02);
  g.add(clock);
  addLoose(ctx, clock, [0, 0, 1], 0.55, 0.2);
}

function boardTex() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#f1f5f9';
  g.font = '600 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('ÇÖK · KAPAN · TUTUN', 256, 70);
  g.font = '32px system-ui, sans-serif';
  g.fillText('Tatbikat: 3. ders', 256, 140);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function teacherDesk(ctx, x, z) {
  const g = ctx.group, m = mat(0x92400e);
  box(g, 1.5, 0.75, 0.7, m, x, 0, z);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat(0x2563eb));
  globe.position.set(x + 0.5, 0.91, z);
  g.add(globe);
  addLoose(ctx, globe, [0.5, 0, 0.8], 0.45, 0.16);
}

function cabinet(ctx, face, x, z) {
  const t = makeTall(ctx, face, x, z, 1.1, 1.9, 0.45, 0x64748b, 'Dolap');
  box(t.inner, 0.02, 1.8, 0.02, mat(0x334155), 0, 0.05, 0.23);
  const bx = box(ctx.group, 0.45, 0.3, 0.35, mat(0xfacc15), x, 1.9, z);
  addLoose(ctx, bx, face === 'left' ? [1, 0, 0] : [0, 0, 1], 0.4, 0.15);
  t.items.push(ctx.loose[ctx.loose.length - 1]);
}

function kitchen(ctx) {
  const g = ctx.group, z = -D + 0.32;
  const cm = mat(0xf5f5f4), top = mat(0x44403c);
  box(g, 5.0, 0.86, 0.62, cm, 0.3, 0, z);
  box(g, 5.0, 0.05, 0.64, top, 0.3, 0.86, z);
  // Ocak
  box(g, 0.7, 0.02, 0.5, mat(0x111827), -0.3, 0.91, z);
  for (const [a, b] of [[-0.15, -0.1], [0.15, -0.1], [-0.15, 0.12], [0.15, 0.12]]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 16), mat(0x9ca3af));
    r.rotation.x = Math.PI / 2;
    r.position.set(-0.3 + a, 0.94, z + b);
    g.add(r);
  }
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.2, 16), mat(0xb91c1c, { metalness: 0.4 }));
  pot.position.set(-0.45, 1.03, z + 0.1);
  g.add(pot);
  addLoose(ctx, pot, [0, 0, 1], 0.5, 0.1);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.06, 10), new THREE.MeshBasicMaterial({ color: 0x60a5fa }));
  flame.position.set(-0.45, 0.95, z + 0.1);
  g.add(flame);
  ctx.flame = flame;
  // Evye
  box(g, 0.6, 0.02, 0.4, mat(0x94a3b8, { metalness: 0.7, roughness: 0.3 }), 2.1, 0.9, z);
  // Üst dolaplar ve tabaklar
  const um = mat(0xe7e5e4);
  for (let i = 0; i < 3; i++) {
    const ux = -1.6 + i * 0.9;
    box(g, 0.86, 0.75, 0.35, um, ux, 1.55, -D + 0.18);
    const dd = new THREE.Group();
    dd.position.set(ux - 0.42, 1.55, -D + 0.36);
    g.add(dd);
    box(dd, 0.02, 0.73, 0.02, mat(0x78716c), 0.42, 0.01, 0);
    const leaf = box(dd, 0.84, 0.73, 0.02, mat(0xd6d3d1), 0.42, 0.01, 0);
    leaf.userData.cab = true;
    ctx.cabDoors = ctx.cabDoors || [];
    ctx.cabDoors.push({ g: dd, a: 0 });
    for (let k = 0; k < 3; k++) {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 14), mat(0xffffff));
      plate.position.set(ux - 0.25 + k * 0.25, 1.62, -D + 0.25);
      plate.rotation.x = Math.PI / 2;
      g.add(plate);
      addLoose(ctx, plate, [0, 0, 1], 0.5 + k * 0.1 + rand(0, 0.2), 0.1);
      ctx.loose[ctx.loose.length - 1].inCab = true;
    }
  }
  const jar = box(g, 0.12, 0.2, 0.12, mat(0xfde68a, { transparent: true, opacity: 0.85 }), 1.2, 0.91, z);
  addLoose(ctx, jar, [0, 0, 1], 0.5, 0.1);
}

function fridge(ctx, x, z) {
  const t = makeTall(ctx, 'back', x, z, 0.75, 1.85, 0.65, 0xe5e7eb, 'Buzdolabı', 1.2);
  box(t.inner, 0.72, 0.01, 0.01, mat(0x9ca3af), 0, 1.2, 0.33);
  box(t.inner, 0.04, 0.4, 0.04, mat(0x9ca3af), 0.28, 1.35, 0.34);
  box(t.inner, 0.1, 0.1, 0.01, mat(0xf43f5e), -0.1, 1.5, 0.33);
  return t;
}

export const BUILD = { window: window_, door, balcony, table, sofa, bookshelf, tvUnit, frame, rug, lamp, plant, wardrobe, bed, nightstand, desk, board, teacherDesk, cabinet, kitchen, fridge };

// --- Odalar ve seçenekler ---
// verdict: 'iyi' | 'orta' | 'kötü'; pose: 'crouch' | 'stand' | 'lie' | 'gone' | 'pillow'
export const ROOMS = [
  {
    key: 'salon', tab: 'Salon', icon: '🏠', title: 'Evde, salonda', wall: 0xe9dcc6, floor: 'wood', night: false,
    intro: 'Akşam saatleri. Kanepede oturmuş kitap okuyorsun. Birden avizede bir tıkırtı… Sarsıntı başlayınca ne yapacaksın?',
    start: { pos: [0.4, 1.6], pose: 'sit' },
    items: [['rug', 0.6, 0.4, 3.4, 2.4, 0xb45309], ['window', 2.3, 1.6], ['balcony', -0.6], ['door', 1.6], ['bookshelf', 'left', -3.83, -1.4],
      ['tvUnit', -2.55], ['table', 1.9, -0.3], ['sofa', 0.4, 1.9], ['frame', 'left', 0.2, 1.4], ['frame', 'back', 0.9, 1.5, 0x93c5fd],
      ['plant', 3.4, -2.4], ['lamp', 1.9, -0.3, 0.9]],
    spots: [
      { key: 'masa', icon: '🛡️', text: 'Sağlam masanın altında Çök-Kapan-Tutun', short: 'Masanın altı', pos: [1.9, -0.3], pose: 'crouch', verdict: 'iyi',
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
    key: 'sinif', tab: 'Sınıf', icon: '🏫', title: 'Okulda, sınıfta', wall: 0xdcebe2, floor: 'school', night: false,
    intro: 'Matematik dersindesin, sıranda oturuyorsun. Öğretmenin tahtaya yazarken sınıf sallanmaya başladı!',
    start: { pos: [0.1, 2.25], pose: 'sit' },
    items: [['board', -0.8], ['window', 2.7, 1.5], ['door', 1.9], ['cabinet', 'left', -3.77, -1.6], ['teacherDesk', -2.3, -1.7],
      ['desk', -1.6, 0.2], ['desk', 0.4, 0.2], ['desk', 2.4, 0.2], ['desk', -1.6, 1.8], ['desk', 0.4, 1.8], ['desk', 2.4, 1.8],
      ['frame', 'left', 0.3, 1.5, 0xfde047], ['plant', 3.5, -2.5]],
    spots: [
      { key: 'sira', icon: '🛡️', text: 'Sıranın altında Çök-Kapan-Tutun', short: 'Sıranın altı', pos: [0.4, 1.8], pose: 'crouch', verdict: 'iyi',
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
    key: 'mutfak', tab: 'Mutfak', icon: '🍳', title: 'Evde, mutfakta', wall: 0xf1efe7, floor: 'tile', night: false,
    intro: 'Annenle birlikte mutfaktasın, ocakta çorba pişiyor. Tabaklar tıkırdamaya başladı… Deprem!',
    start: { pos: [-0.4, -1.9], pose: 'stand' },
    items: [['kitchen'], ['window', 2.1, 1.1, 0.9, 1.05], ['fridge', -3.35, -2.65], ['door', 1.8], ['table', 1.6, 0.9, 1.3, 0.85, 0xa16207],
      ['frame', 'left', -0.4, 1.4, 0x86efac], ['lamp', 1.6, 0.9, 0.8]],
    spots: [
      { key: 'masa', icon: '🛡️', text: 'Mutfak masasının altında Çök-Kapan-Tutun', short: 'Masanın altı', pos: [1.6, 0.9], pose: 'crouch', verdict: 'iyi',
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
    key: 'gece', tab: 'Gece', icon: '🌙', title: 'Gece, yatak odasında', wall: 0x8e97bd, floor: 'night', night: true,
    intro: 'Gece saat 03.00. Derin uykudasın… Yatağın sallanıyor, karanlıkta bir şeyler düşüyor!',
    start: { pos: [-3.0, -0.3], pose: 'lie' },
    items: [['rug', 0.3, 0.8, 2.6, 2.0, 0x4338ca], ['bed', -3.0, -0.3], ['nightstand', -3.6, -1.35], ['wardrobe', -0.4, -2.68], ['window', 2.4, 1.4],
      ['door', 2.2], ['frame', 'back', 1.0, 1.5, 0xc4b5fd], ['desk', 2.8, 1.6, -Math.PI / 2, 0xe2e8f0]],
    spots: [
      { key: 'yatak', icon: '🛏️', text: 'Yatakta kal, başını yastıkla koru', short: 'Yatakta kal', pos: [-3.0, -0.3], pose: 'pillow', verdict: 'iyi',
        why: 'Doğru! Gece yataktaysan yatakta kal, yüzüstü dönüp başını ve enseni yastıkla koru. Karanlıkta yürümeye çalışmak, yerdeki cam kırıkları ve düşen eşyalar yüzünden daha tehlikelidir.' },
      { key: 'masa', icon: '🪑', text: 'Kalkıp çalışma masasının altına geç', short: 'Çalışma masası', pos: [2.8, 1.6], pose: 'crouch', verdict: 'orta',
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
