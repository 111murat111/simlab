// Sahne yardımcıları (yerel): süpürme geometrisi, ev/tekne modelleri, kiremit ve sıva malzemeleri, yumuşak parçacık dokusu.
import { THREE, mat, procedural, RoundedBoxGeometry, BufferGeometryUtils, treeParts, leafMaterial } from '@core';

const ni = (g) => (g.index ? g.toNonIndexed() : g);

/** Yumuşak yuvarlak parçacık dokusu (kare piksel değil). */
export function softDot(size = 64) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * Profil süpürme: profile [[yan, yukarı], …] (açık çoklu çizgi), path Vector3[] (y yukarı).
 * Her profil kenarı ayrı şerit (keskin köşe), uçlar kapaklı.
 */
export function sweep(profile, path, { caps = true } = {}) {
  const pos = [], up = new THREE.Vector3(0, 1, 0), t = new THREE.Vector3(), side = new THREE.Vector3();
  const rings = path.map((p, i) => {
    t.copy(path[Math.min(i + 1, path.length - 1)]).sub(path[Math.max(i - 1, 0)]).setY(0).normalize();
    side.crossVectors(up, t).normalize();
    return profile.map(([u, v]) => new THREE.Vector3(p.x + side.x * u, p.y + v, p.z + side.z * u));
  });
  const quad = (a, b, c, d) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < profile.length - 1; j++) quad(rings[i][j], rings[i + 1][j], rings[i][j + 1], rings[i + 1][j + 1]);
  if (caps) for (const [r, flip] of [[rings[0], true], [rings[rings.length - 1], false]]) {
    const c = r.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / r.length);
    for (let j = 0; j < r.length - 1; j++) { const a = r[j], b = r[j + 1]; if (flip) pos.push(c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z); else pos.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Sıva duvar: hafif kirlenme, alt kısımda nem izi. */
export function plaster(color = 0xece4d6) {
  return procedural({
    key: 'kit-plaster', bump: 0.012, params: { color, roughness: 0.88 },
    pattern: `
      float n = fbm3(p*1.6 + seed*9.0, 5), f = vn3(p*28.0);
      col *= 0.86 + 0.18*n + 0.05*(f - 0.5);
      col *= mix(0.78, 1.0, smoothstep(0.0, 0.9, p.y));      // zemine yakın nem/kir
      col *= 1.0 - 0.12*smoothstep(0.55, 0.8, fbm3(vec3(p.x*0.6, p.y*3.0, p.z*0.6) + seed*3.0, 4));
      rough = 0.8 + 0.12*n; h = n*0.5 + f*0.3;`,
  });
}

/** Kiremit çatı (Marsilya tipi): sıra gölgesi, oluk kabartması, ton farkı. */
export function roofTiles(color = 0xa4492c) {
  return procedural({
    key: 'kit-roof', bump: 0.05, params: { color, roughness: 0.72 },
    pattern: `
      float row = fract(p.y*3.4);
      float cz = fract((abs(pn.x) > 0.5 ? p.z : p.x)*3.6 + floor(p.y*3.4)*0.5);
      float lip = smoothstep(0.0, 0.18, row);
      float gut = 0.5 + 0.5*cos(cz*6.2832);
      float tint = h13(vec3(floor(p.y*3.4), floor((abs(pn.x) > 0.5 ? p.z : p.x)*3.6), seed*7.0));
      col *= (0.62 + 0.38*lip)*(0.8 + 0.22*gut)*(0.82 + 0.3*tint)*(0.85 + 0.25*fbm3(p*0.7 + seed*5.0, 3));
      col = mix(col, col*vec3(0.55, 0.6, 0.5), smoothstep(0.6, 0.85, fbm3(p*0.9 + 3.0, 4))*0.5);   // liken/kir
      rough = 0.62 + 0.2*(1.0 - gut); h = lip*0.5 + gut*0.5;`,
  });
}

/** Ev parçaları (m): taban merkezde, 1 kat = 3 m. { walls, roof, glass, trim } geometrileri. */
export function houseGeometries({ w = 10, d = 9, floors = 3, roof = 'gable' } = {}) {
  const H = floors * 3;
  const walls = new RoundedBoxGeometry(w, H, d, 2, 0.12).translate(0, H / 2, 0);
  let roofG;
  if (roof === 'gable') {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 - 0.5, 0); s.lineTo(w / 2 + 0.5, 0); s.lineTo(0, Math.min(3.2, w * 0.28)); s.closePath();
    roofG = new THREE.ExtrudeGeometry(s, { depth: d + 0.8, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1 });
    roofG.translate(0, H, -d / 2 - 0.4);
  } else { // teras çatı: parapet
    roofG = BufferGeometryUtils.mergeGeometries([
      new RoundedBoxGeometry(w + 0.3, 0.9, 0.3, 1, 0.05).translate(0, H + 0.45, d / 2),
      new RoundedBoxGeometry(w + 0.3, 0.9, 0.3, 1, 0.05).translate(0, H + 0.45, -d / 2),
      new RoundedBoxGeometry(0.3, 0.9, d, 1, 0.05).translate(w / 2, H + 0.45, 0),
      new RoundedBoxGeometry(0.3, 0.9, d, 1, 0.05).translate(-w / 2, H + 0.45, 0),
      new RoundedBoxGeometry(2.2, 1.6, 2.2, 1, 0.1).translate(w * 0.2, H + 0.8, 0),
    ].map(ni));
  }
  // Pencereler: iki cephede, her katta; balkon döşemesi ve korkuluk
  const glass = [], trim = [];
  const nx = Math.max(2, Math.round(w / 3.2));
  for (let f = 0; f < floors; f++) for (let i = 0; i < nx; i++) {
    const x = (i - (nx - 1) / 2) * (w / nx), y = f * 3 + 1.55;
    for (const sz of [1, -1]) {
      if (f === 0 && i === Math.floor(nx / 2) && sz === 1) { glass.push(new RoundedBoxGeometry(1.1, 2.2, 0.14, 1, 0.03).translate(x, 1.1, sz * d / 2)); continue; }
      glass.push(new RoundedBoxGeometry(1.2, 1.4, 0.12, 1, 0.03).translate(x, y, sz * d / 2));
      trim.push(new RoundedBoxGeometry(1.5, 0.12, 0.3, 1, 0.03).translate(x, y - 0.78, sz * (d / 2 + 0.08)));
    }
  }
  for (let f = 1; f < floors; f++) {
    trim.push(new RoundedBoxGeometry(w * 0.6, 0.16, 1.3, 1, 0.05).translate(0, f * 3, d / 2 + 0.6));
    trim.push(new RoundedBoxGeometry(w * 0.6, 0.9, 0.06, 1, 0.02).translate(0, f * 3 + 0.5, d / 2 + 1.22));
  }
  const m = (a) => BufferGeometryUtils.mergeGeometries(a.map(ni));
  return { walls, roof: roofG, glass: m(glass), trim: m(trim) };
}

/** Tekne gövdesi: istasyonlardan örülmüş U kesit, pruvada incelen (L boy, B en, D derinlik). */
export function hullGeometry(L = 9, B = 3, D = 1.3) {
  const NS = 24, NJ = 14, pos = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    const half = (B / 2) * (s < 0.55 ? 0.82 + 0.18 * Math.sin((s / 0.55) * Math.PI / 2) : Math.cos(((s - 0.55) / 0.45) * Math.PI / 2) ** 0.8);
    const sheer = 0.25 * ((s - 0.4) / 0.6) ** 2 * (s > 0.4 ? 1 : 0.3);
    for (let j = 0; j <= NJ; j++) {
      const t = (j / NJ) * 2 - 1;
      const y = -D * Math.pow(Math.max(0, 1 - t * t), 0.55) * (s > 0.9 ? 1 - (s - 0.9) * 4 : 1) + sheer;
      pos.push(half * t, y + D * 0.35, (s - 0.5) * L);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NJ; j++) {
    const a = i * (NJ + 1) + j, b = a + 1, c = a + NJ + 1, e = c + 1;
    idx.push(a, b, c, b, e, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Küçük balıkçı teknesi grubu (gövde + güverte + kamara). */
export function fishingBoat(color = 0xf2f2ee, stripe = 0x2c5aa0) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(hullGeometry(9, 3, 1.3), mat.paintedMetal({ color, wear: 0.25 }));
  hull.material.side = THREE.DoubleSide;
  g.add(hull);
  const deck = new THREE.Mesh(new RoundedBoxGeometry(2.5, 0.12, 7.4, 1, 0.05), mat.wood({ color: 0x8a6a45 }));
  deck.position.set(0, 0.62, -0.3); g.add(deck);
  const cab = new THREE.Mesh(new RoundedBoxGeometry(1.9, 1.6, 2.2, 2, 0.12), mat.paintedMetal({ color: 0xf6f6f2, wear: 0.15 }));
  cab.position.set(0, 1.45, -1.2); g.add(cab);
  const win = new THREE.Mesh(new RoundedBoxGeometry(1.95, 0.45, 1.5, 1, 0.05), mat.plastic({ color: 0x1b2530, gloss: 1 }));
  win.position.set(0, 1.85, -1.0); g.add(win);
  const rim = new THREE.Mesh(hullGeometry(9.1, 3.08, 0.25), mat.paintedMetal({ color: stripe, wear: 0.2 }));
  rim.material.side = THREE.DoubleSide; rim.position.y = 0.47; g.add(rim);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 4, 8), mat.wood({ color: 0x6d5236 }));
  mast.position.set(0, 3.0, 1.0); g.add(mast);
  return g;
}

// --- Ağaçlar: motorun yaprak kartlı ağaçları (treeParts/leafMaterial); taç ve gövde ayrı InstancedMesh ---
const KIND = { pine: 'redpine', oak: 'oak', shrub: 'shrub', poplar: 'poplar', fruit: 'fruit' };
/** kind: 'pine' (kızılçam), 'oak' (meşe), 'shrub' (maki), 'poplar' (kavak), 'fruit' (meyve ağacı) → { crown, trunk } (m).
 *  dens: yaprak kartı yoğunluğu — binlerce örnekte düşük (varsayılan 0.45), sahne önündeki tek ağaçlarda 1. */
export function treeGeometry(kind, seed = 1, { dens = 0.45 } = {}) {
  return treeParts(KIND[kind] || 'broad', seed, { dens });
}
/** Yaprak malzemesi: alfa kesimli yaprak kartları, küme gölgesi, örnek başına ton farkı (setColorAt), rüzgâr salınımı. */
export function leafMat(color = 0x3a5a26) {
  return leafMaterial(color);
}
export function barkMat(color = 0x4a3b2c) {
  return procedural({
    key: 'kit-bark', bump: 0.05, params: { color, roughness: 0.92, vertexColors: true },
    pattern: `
      float f = vn3(vec3(p.x*9.0, p.y*1.2, p.z*9.0) + seed*5.0), n = fbm3(p*2.0, 3);
      col *= 0.6 + 0.6*f*(0.7 + 0.5*n); h = f;`,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Balıkçı teknesi (≈ 13 m ahşap kıyı balıkçısı): istasyonlardan örülmüş gövde, güverte, kamara, direk, ağ yığını.
// Ölçüler metre; pruva +x, su hattı y = 0.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const RB = [[0, 0], [0.16, 0.02], [0.44, 0.08], [0.7, 0.2], [0.87, 0.38], [0.96, 0.58], [1.0, 0.79], [1.01, 1.0]];   // yuvarlak sintine
const VB = [[0, 0], [0.1, 0.06], [0.26, 0.17], [0.43, 0.3], [0.6, 0.46], [0.76, 0.63], [0.9, 0.81], [1.0, 1.0]];    // pruvada V kesit
export const HULL = { L: 13, B: 4.3, D: 1.2, F: 1.1 };
function hullAt(s) {
  const { B, D, F } = HULL;
  const hb = (B / 2) * (s < 0.5 ? 0.84 + 0.16 * Math.sin((s / 0.5) * Math.PI / 2) : Math.pow(Math.max(0, Math.cos(((s - 0.5) / 0.5) * Math.PI / 2)), 0.72));
  const ysh = F + 0.9 * Math.max(0, (s - 0.42) / 0.58) ** 2 + 0.25 * Math.max(0, (0.22 - s) / 0.22) ** 1.5;
  let yk = -D * (s < 0.14 ? 0.35 + 0.65 * Math.pow(s / 0.14, 0.6) : 1);
  if (s > 0.7) yk = -D + (ysh + D) * Math.pow((s - 0.7) / 0.3, 1.9);
  const v = smooth(0.4, 0.95, s);
  return { hb, ysh, yk, v };
}
function secPt(s, ny) {
  const H = hullAt(s);
  let nx = 0;
  for (let i = 0; i < RB.length - 1; i++) {
    const a = RB[i], b = RB[i + 1], c = VB[i], d = VB[i + 1];
    const y0 = a[1] + (c[1] - a[1]) * H.v, y1 = b[1] + (d[1] - b[1]) * H.v;
    if (ny <= y1 || i === RB.length - 2) {
      const t = Math.min(1, Math.max(0, (ny - y0) / Math.max(1e-6, y1 - y0)));
      const x0 = a[0] + (c[0] - a[0]) * H.v, x1 = b[0] + (d[0] - b[0]) * H.v;
      nx = x0 + (x1 - x0) * t; break;
    }
  }
  const y = H.yk + (H.ysh - H.yk) * ny;
  const x = (s - 0.5) * HULL.L + 0.85 * ny * smooth(0.82, 1, s) - 0.3 * ny * (1 - smooth(0, 0.06, s));   // pruva ve ayna eğimi
  return [x, y, H.hb * nx];
}
/** Gövde kabuğu (dış yüz) + ayna kapağı. */
export function boatHullGeometry() {
  const NS = 40, NY = 12, pos = [], idx = [];
  const ringN = NY * 2 + 1;
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    for (let j = 0; j < ringN; j++) {
      const side = j < NY ? 1 : -1, ny = j < NY ? 1 - j / NY : (j - NY) / NY;
      const [x, y, z] = secPt(s, ny);
      pos.push(x, y, side * z);
    }
  }
  for (let i = 0; i < NS; i++) for (let j = 0; j < ringN - 1; j++) {
    const a = i * ringN + j, b = a + 1, c = a + ringN, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // ayna (kıç) kapağı
  const c0 = pos.length / 3;
  const [cx, cy] = secPt(0, 0.55); pos.push(cx, cy, 0);
  for (let j = 0; j < ringN - 1; j++) idx.push(c0, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Küpeşte bandı (filo rengi) + küpeşte kapak rayı: gövdenin üst 0,34 m'si, biraz dışarıda. */
export function boatBandGeometry() {
  const NS = 40, pos = [], idx = [];
  for (const side of [1, -1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= NS; i++) {
      const s = i / NS, H = hullAt(s);
      const nyB = 1 - 0.34 / Math.max(0.4, H.ysh - H.yk);
      const [x0, y0, z0] = secPt(s, Math.max(0, nyB)), [x1, y1, z1] = secPt(s, 1);
      const o = 0.025;
      const zi = Math.max(0, z1 - 0.13);
      pos.push(x0, y0, side * (z0 + o), x1, y1 + 0.05, side * (z1 + o), x1, y1 + 0.05, side * zi, x1, y1 - 0.25, side * zi);
    }
    for (let i = 0; i < NS; i++) for (let j = 0; j < 3; j++) {
      const a = base + i * 4 + j, b = a + 1, c = a + 4, d = c + 1;
      if (side > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
/** Güverte: küpeşte kotunun 0,45 m altında, kıçtan pruvaya. */
export function boatDeckGeometry() {
  const NS = 30, pos = [], idx = [];
  for (let i = 0; i <= NS; i++) {
    const s = i / NS * 0.97, H = hullAt(s);
    const ny = 1 - 0.45 / Math.max(0.5, H.ysh - H.yk);
    const [x, y, z] = secPt(s, ny);
    pos.push(x, y, z - 0.02, x, y, -z + 0.02);
  }
  for (let i = 0; i < NS; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
export const deckY = (x) => { const s = x / HULL.L + 0.5, H = hullAt(s); return secPt(s, 1 - 0.45 / Math.max(0.5, H.ysh - H.yk))[1]; };

const vc = (g, c) => {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const col = new THREE.Color(c), a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = col.r; a[i + 1] = col.g; a[i + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const rbox = (w, h, d, r = 0.05, s = 1) => new RoundedBoxGeometry(w, h, d, s, r);
const rod = (a, b, r0, r1 = r0, seg = 6) => {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), dir = B.clone().sub(A), L = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg, 1).translate(0, L / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  return g.translate(A.x, A.y, A.z);
};
/**
 * Üst yapı (köşe renkli, tek geometri): kamara + pencere çerçeveleri, çatı donanımı, direk ve bumba, halatlar,
 * kıçta ağ yığını ve mantar yaka, ağ tamburu, balık kasaları, can simidi, lastik usturmaçalar, egzoz.
 * glass: kamara camları (ayrı malzeme).
 */
export function boatUpperGeometries(seed = 1) {
  const P = [], G = [];
  const WHT = 0xeeeae2, GRY = 0x9aa0a4, DK = 0x2a2d30, WOOD = 0x6e5236, ORG = 0xe0641c, NETC = 0x2f5a4a, BLU = 0x2f6fb0, RED = 0xb8322a, YEL = 0xe0b020;
  const dM = deckY(-1.1), dF = deckY(2.6), dA = deckY(-4.2);
  // kamara (kıça yakın orta): gövde, çatı saçağı, alt süpürgelik
  const cx = -1.2, cw = 2.5, cl = 2.7, ch = 2.05, cy = dM + ch / 2;
  P.push(vc(rbox(cl, ch, cw, 0.1, 2).translate(cx, cy, 0), WHT));
  P.push(vc(rbox(cl + 0.5, 0.1, cw + 0.4, 0.04).translate(cx + 0.15, dM + ch + 0.05, 0), 0xf4f2ee));
  P.push(vc(rbox(cl + 0.04, 0.22, cw + 0.04, 0.03).translate(cx, dM + 0.11, 0), BLU));
  // camlar: ön 3, yan 2 + kapı; çerçeveler
  const wy = dM + ch - 0.62;
  for (const z of [-0.8, 0, 0.8]) { G.push(rbox(0.05, 0.62, 0.7, 0.02).translate(cx + cl / 2 + 0.01, wy, z)); P.push(vc(rbox(0.07, 0.72, 0.08, 0.02).translate(cx + cl / 2 + 0.01, wy, z + 0.39), 0xf8f8f6)); }
  for (const s of [1, -1]) {
    for (const x of [cx + 0.55]) G.push(rbox(0.8, 0.56, 0.05, 0.02).translate(x, wy, s * (cw / 2 + 0.01)));
    G.push(rbox(0.62, 1.55, 0.04, 0.02).translate(cx - 0.62, dM + 0.95, s * (cw / 2 + 0.01)));
    P.push(vc(rbox(0.72, 1.62, 0.05, 0.02).translate(cx - 0.62, dM + 0.92, s * (cw / 2 + 0.005)), DK));
    // can simidi
    P.push(vc(new THREE.TorusGeometry(0.3, 0.07, 6, 14).translate(cx + 0.55, dM + 0.72, s * (cw / 2 + 0.08)), ORG));
  }
  // çatı: radar kubbesi, projektör, anten, pusula direği, egzoz
  const roofY = dM + ch + 0.1;
  P.push(vc(new THREE.LatheGeometry([[0.001, 0], [0.36, 0], [0.36, 0.12], [0.3, 0.3], [0.001, 0.36]].map(([a, b]) => new THREE.Vector2(a, b)), 12).translate(cx - 0.3, roofY + 0.25, 0), 0xf6f6f4));
  P.push(vc(rod([cx - 0.3, roofY, 0], [cx - 0.3, roofY + 0.25, 0], 0.08), GRY));
  P.push(vc(rod([cx + 0.9, roofY, 0.7], [cx + 0.9, roofY + 2.4, 0.7], 0.02, 0.008), DK));
  P.push(vc(rod([cx + 0.9, roofY, -0.7], [cx + 0.9, roofY + 1.3, -0.7], 0.018, 0.01), DK));
  P.push(vc(new THREE.CylinderGeometry(0.13, 0.11, 0.22, 10).rotateZ(Math.PI / 2).translate(cx + 1.0, roofY + 0.18, 0), GRY));
  P.push(vc(rod([cx - cl / 2 - 0.2, dM, 0.75], [cx - cl / 2 - 0.2, roofY + 1.0, 0.75], 0.11, 0.1, 8), 0x3a3d40));
  P.push(vc(rod([cx - cl / 2 - 0.2, roofY + 1.0, 0.75], [cx - cl / 2 - 0.2, roofY + 1.15, 0.75], 0.115, 0.115, 8), 0x111111));
  // direk (pruvaya yakın), çapraz çubuk, seyir fenerleri, bumba ve halatlar
  const mx = 2.7, mTop = dF + 6.4;
  P.push(vc(rod([mx, dF, 0], [mx, mTop, 0], 0.1, 0.06, 8), WHT));
  P.push(vc(rbox(0.12, 0.1, 1.5, 0.03).translate(mx, dF + 4.9, 0), WHT));
  P.push(vc(new THREE.SphereGeometry(0.08, 8, 6).translate(mx + 0.06, mTop - 0.2, 0), 0xf0f0e0));
  P.push(vc(rod([mx, dF + 1.4, 0], [5.3, dF + 3.2, 0], 0.07, 0.05, 6), WOOD));
  P.push(vc(rod([mx, mTop - 0.3, 0], [5.3, dF + 3.2, 0], 0.012), 0x2b2b2b));
  P.push(vc(rod([mx, mTop - 0.3, 0], [cx + cl / 2, roofY, 0], 0.012), 0x2b2b2b));
  for (const s of [1, -1]) P.push(vc(rod([mx, dF + 4.9, s * 0.72], [mx - 0.6, dF + 0.2, s * 1.95], 0.01), 0x2b2b2b));
  const bowX = 6.5;
  P.push(vc(rod([mx, mTop - 0.3, 0], [bowX, deckY(6.2) + 0.5, 0], 0.012), 0x2b2b2b));
  // kıç: ağ yığını (gırgır ağı), üstünde turuncu mantar yaka ve kurşun yaka
  {
    const r = (() => { let a = seed * 9973 + 17; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
    const pile = new THREE.IcosahedronGeometry(1, 2), pa = pile.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      const n = 1 + 0.12 * Math.sin(v.x * 7 + seed) * Math.cos(v.z * 6 + v.y * 4) + 0.06 * Math.sin(v.y * 13 + v.x * 5);
      pa.setXYZ(i, v.x * 1.5 * n, Math.max(-0.1, v.y) * 0.7 * n, v.z * 1.55 * n);
    }
    pile.computeVertexNormals();
    P.push(vc(pile.translate(-4.4, dA + 0.1, 0), NETC));
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2, x = -4.4 + Math.cos(a) * 1.15 * (0.85 + 0.2 * r()), z = Math.sin(a) * 1.25 * (0.85 + 0.2 * r());
      P.push(vc(new THREE.CapsuleGeometry(0.1, 0.16, 2, 6).rotateZ(Math.PI / 2).rotateY(a).translate(x, dA + 0.55 + 0.1 * r(), z), ORG));
    }
  }
  // ağ tamburu (kamara arkası), balık kasaları, pruvada ırgat
  P.push(vc(new THREE.CylinderGeometry(0.42, 0.42, 1.5, 14).rotateX(Math.PI / 2).translate(-3.0, dM + 0.62, 0), NETC));
  for (const s of [1, -1]) P.push(vc(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 16).rotateX(Math.PI / 2).translate(-3.0, dM + 0.62, s * 0.78), GRY));
  P.push(vc(rbox(0.3, 0.9, 0.3, 0.04).translate(-3.0, dM + 0.3, 0.85), GRY));
  P.push(vc(rbox(0.3, 0.9, 0.3, 0.04).translate(-3.0, dM + 0.3, -0.85), GRY));
  for (let k = 0; k < 5; k++) P.push(vc(rbox(0.8, 0.32, 0.55, 0.04).translate(0.9 + (k % 2) * 0.05, dM + 0.16 + Math.floor(k / 2) * 0.32, k < 2 ? 0.95 - k * 0.6 : k < 4 ? 0.95 - (k - 2) * 0.6 : 0.65), k % 3 ? BLU : RED));
  P.push(vc(new THREE.CylinderGeometry(0.22, 0.22, 0.6, 10).rotateX(Math.PI / 2).translate(4.4, deckY(4.4) + 0.35, 0), 0x46494c));
  // usturmaçalar: bordadan sarkan eski lastikler
  for (const s of [1, -1]) for (const x of [-2.8, -0.6, 1.6]) {
    const z = secPt(x / HULL.L + 0.5, 0.78)[2] + 0.16;
    P.push(vc(new THREE.TorusGeometry(0.3, 0.12, 6, 12).translate(x, 0.42, s * z), 0x151515));
  }
  const upper = BufferGeometryUtils.mergeGeometries(P);
  const glass = BufferGeometryUtils.mergeGeometries(G.map((g) => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); return g; }));
  return { upper, glass };
}

/** Tekne gövde boyası: kırmızı zehirli boya (su altı), koyu su hattı şeridi, beyaz borda; pas izi, sürtme, yosun. */
export function hullPaint() {
  return procedural({
    key: 'bal-hull', bump: 0.012, params: { color: 0xf1efe9, roughness: 0.5, side: THREE.DoubleSide },
    pattern: `
      float y = p.y;
      float wav = 0.02*sin(p.x*2.1 + seed*6.0);
      vec3 anti = vec3(0.42, 0.1, 0.07)*(0.8 + 0.3*fbm3(p*3.0, 3));
      vec3 boot = vec3(0.05, 0.08, 0.13);
      float n = fbm3(p*1.7 + seed*5.0, 4), fine = vn3(p*38.0);
      vec3 c = col*(0.9 + 0.1*n);
      // pas ve kir izleri: frengi deliklerinden aşağı süzülen dikey çizgiler
      float streak = smoothstep(0.62, 0.9, vn3(vec3(p.x*5.0, p.y*0.35, p.z*5.0) + seed*3.0))*smoothstep(1.4, 0.2, y);
      c = mix(c, c*vec3(0.62, 0.45, 0.33), streak*0.55);
      // iskele/rıhtım sürtmesi, boya atması
      float chip = smoothstep(0.74, 0.8, fbm3(p*vec3(2.5, 7.0, 2.5) + seed*11.0, 4))*smoothstep(1.2, 0.4, y);
      c = mix(c, vec3(0.42, 0.36, 0.3), chip*0.8);
      col = y < 0.02 + wav ? anti : (y < 0.2 + wav ? boot : c);
      // su hattında yosun ve tuz lekesi
      float wl = exp(-pow((y - 0.05 - wav)/0.1, 2.0));
      col = mix(col, vec3(0.24, 0.3, 0.16), wl*0.45*n);
      rough = y < 0.2 + wav ? 0.75 : 0.42 + 0.25*n + 0.2*chip;
      h = n*0.4 + fine*0.2 - chip*0.6;`,
  });
}
/** Köşe renkli boyalı ahşap/metal üst yapı: yıpranma, kir, pas. */
export function workPaint() {
  return procedural({
    key: 'bal-work', bump: 0.01, params: { color: 0xffffff, roughness: 0.55, vertexColors: true },
    pattern: `
      float n = fbm3(p*2.0 + seed*7.0, 4), fine = vn3(p*45.0);
      float chip = smoothstep(0.76, 0.82, fbm3(p*6.0 + seed*9.0, 4));
      col *= 0.85 + 0.2*n;
      col = mix(col, col*vec3(0.7, 0.62, 0.52), smoothstep(0.55, 0.85, vn3(vec3(p.x*6.0, p.y*0.5, p.z*6.0)))*0.35);
      col = mix(col, vec3(0.36, 0.32, 0.28), chip*0.6);
      rough = 0.5 + 0.3*n + 0.2*chip; h = n*0.5 + fine*0.3 - chip*0.4;`,
  });
}
/** Filo renginde boyalı ahşap küpeşte bandı. */
export function bandPaint(color) {
  return procedural({
    key: 'bal-band', bump: 0.01, params: { color, roughness: 0.45, side: THREE.DoubleSide },
    pattern: `
      float n = fbm3(p*2.2 + seed*5.0, 4);
      float chip = smoothstep(0.72, 0.78, fbm3(p*vec3(3.0, 9.0, 3.0) + seed*13.0, 4));
      col *= 0.88 + 0.18*n;
      col = mix(col, vec3(0.5, 0.44, 0.36), chip*0.85);
      rough = 0.4 + 0.2*n + 0.3*chip; h = n*0.4 - chip*0.6;`,
  });
}
/** Güverte tahtası: boyuna tahtalar, derz, aşınmış yürüme izi. */
export function deckPlanks(color = 0x9a7650) {
  return procedural({
    key: 'bal-deck', bump: 0.02, params: { color, roughness: 0.8 },
    pattern: `
      float w = p.z*6.5; float id = floor(w); float f = fract(w);
      float seam = smoothstep(0.0, 0.06, f)*smoothstep(1.0, 0.94, f);
      float tint = h13(vec3(id, floor(p.x*0.4 + id*0.37), 2.0));
      float grain = vn3(vec3(p.x*3.0, 0.0, p.z*90.0));
      col *= (0.62 + 0.4*tint)*(0.85 + 0.2*grain)*mix(0.35, 1.0, seam);
      rough = 0.75 + 0.2*grain; h = seam*0.7 + grain*0.3;`,
  });
}
/** Rıhtım: üstte beton döşeme plakaları, yüzlerde derzli kesme taş, su hattında yosun ve ıslaklık. */
export function quayStone() {
  return procedural({
    key: 'bal-quay', bump: 0.04, params: { color: 0xc4bcae, roughness: 0.88 },
    pattern: `
      float n = fbm3(p*0.9, 4), fine = vn3(p*30.0);
      if (pn.y > 0.6) {
        vec2 q = p.xz*vec2(0.5, 0.5); vec2 f = fract(q); vec2 id = floor(q);
        float j = smoothstep(0.0, 0.025, f.x)*smoothstep(1.0, 0.975, f.x)*smoothstep(0.0, 0.025, f.y)*smoothstep(1.0, 0.975, f.y);
        col *= (0.82 + 0.22*h13(vec3(id, 1.0)))*(0.85 + 0.2*n)*mix(0.55, 1.0, j);
        col *= 1.0 - 0.25*smoothstep(0.6, 0.85, fbm3(p*0.3 + 4.0, 3));
        rough = 0.85; h = j*0.6 + fine*0.3;
      } else {
        vec3 a = axisDominant(pn); vec2 uv = a.x > 0.5 ? p.zy : p.xy;
        uv *= vec2(0.8, 1.6); float row = floor(uv.y); uv.x += mod(row, 2.0)*0.5;
        vec2 f = fract(uv), id = floor(uv);
        float j = smoothstep(0.0, 0.05, f.x)*smoothstep(1.0, 0.95, f.x)*smoothstep(0.0, 0.08, f.y)*smoothstep(1.0, 0.92, f.y);
        col *= vec3(0.93, 0.9, 0.84)*(0.72 + 0.35*h13(vec3(id, 5.0)))*(0.8 + 0.3*n)*mix(0.45, 1.0, j);
        float wet = smoothstep(0.9, -0.1, p.y + 0.3*n);
        col = mix(col, col*vec3(0.42, 0.46, 0.36), wet*0.8);
        col = mix(col, vec3(0.12, 0.17, 0.1), smoothstep(0.3, -0.3, p.y + 0.2*fine)*0.6);
        rough = mix(0.9, 0.35, wet); h = j*0.8 + n*0.2;
      }`,
  });
}

/** Martı (sarı bacaklı martı, kanat açıklığı ≈ 1,4 m): gövde + iki kanat (kanatlar ayrı örneklerle çırpar). */
export function gullGeometries() {
  const body = BufferGeometryUtils.mergeGeometries([
    vc(new THREE.SphereGeometry(0.1, 12, 8).scale(2.6, 1, 1.05), 0xf4f3ef),
    vc(new THREE.SphereGeometry(0.068, 10, 8).translate(0.27, 0.05, 0), 0xf6f6f2),
    vc(new THREE.ConeGeometry(0.018, 0.09, 6).rotateZ(-Math.PI / 2).translate(0.37, 0.04, 0), 0xe0b020),
    vc(new THREE.ConeGeometry(0.06, 0.2, 6).rotateZ(Math.PI / 2).scale(1, 0.35, 1).translate(-0.3, 0.0, 0), 0xf2f2ee),
  ]);
  // kanat: +z yönüne uzanan, ucu siyah, üstü gri; kök (z = 0) gövdede
  const wing = (s) => {
    const pos = [], col = [], idx = [];
    const N = 8;
    for (let i = 0; i <= N; i++) {
      const t = i / N, z = s * (0.06 + 0.66 * t);
      const lead = 0.07 - 0.12 * t * t, trail = -0.13 + 0.07 * t + 0.1 * t * t;
      const y = 0.02 * Math.sin(t * Math.PI) - 0.03 * t;
      const c = t > 0.8 ? [0.08, 0.08, 0.09] : t > 0.72 ? [0.45, 0.47, 0.5] : [0.62, 0.65, 0.68];
      pos.push(lead, y, z, trail, y, z); col.push(...c, ...c.map((v) => Math.min(1, v * 1.25)));
    }
    for (let i = 0; i < N; i++) { const a = i * 2; if (s > 0) idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g.toNonIndexed();
  };
  return { body, wingL: wing(1), wingR: wing(-1) };
}
