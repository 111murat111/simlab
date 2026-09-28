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
