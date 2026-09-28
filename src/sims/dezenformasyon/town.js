// Alacakaranlıkta bir kasaba: her kullanıcı bir bina (pencere ışığı durumunu gösterir), botlar telsiz direği.
// Bütün binalar tek bir birleşik mesh; durum renkleri köşe özniteliği (aGlow) ile güncellenir — yalnız görsel.
import { THREE, procedural, BufferGeometryUtils, seeded } from '@core';

export const LOT = 16, BLOCK = 3, STREET = 12, PITCH = LOT * BLOCK + STREET, NB = 6;
export const HALF = (NB * PITCH) / 2;

/** Parsel merkezleri (x, z) ve blok/sokak düzeni. */
export function lots() {
  const L = [];
  for (let bx = 0; bx < NB; bx++) for (let bz = 0; bz < NB; bz++) for (let i = 0; i < BLOCK; i++) for (let j = 0; j < BLOCK; j++) {
    L.push([(bx - (NB - 1) / 2) * PITCH + (i - 1) * LOT, (bz - (NB - 1) / 2) * PITCH + (j - 1) * LOT]);
  }
  return L;
}

/** Bina malzemesi: kind 0 cephe (pencereli), 1 kiremit, 2 düz çatı, 3 metal, 4 lamba, 5 beton kaide. */
export function townMaterial() {
  const m = procedural({
    key: 'dz-town', scale: 1, bump: 0.02,
    params: { color: 0xffffff, roughness: 0.8, vertexColors: true },
    pattern: `
      vec3 a = axisDominant(pn);
      float k = vKind;
      float n = fbm3(p*0.35, 3);
      if (k < 0.5) {
        vec2 uv = a.x > 0.5 ? p.zy : p.xy;
        vec2 cell = uv / vec2(2.6, 3.0);
        vec2 id = floor(cell), f = fract(cell);
        float fw = length(fwidth(cell));
        float aa = 1.0 - smoothstep(0.25, 0.7, fw);
        float win = step(0.22, f.x)*step(f.x, 0.78)*step(0.3, f.y)*step(f.y, 0.84);
        float sill = step(0.24, f.y)*step(f.y, 0.3)*step(0.18, f.x)*step(f.x, 0.82);
        win = mix(0.33, win, aa)*(1.0 - a.y)*step(0.9, p.y);
        float r = h13(vec3(id, floor(p.x*0.0625 + 0.5)*7.0 + floor(p.z*0.0625 + 0.5)*131.0));
        col *= 0.84 + 0.3*n;
        col = mix(col, col*1.18, sill*aa);
        col = mix(col, vec3(0.035, 0.04, 0.05), win*0.93);
        rough = mix(0.88, 0.12, win);
        pLit = win*step(0.28, r)*(0.55 + 0.7*r) + win*(1.0 - aa)*0.25;
        h = (1.0 - win)*0.7 + sill*0.3;
      } else if (k < 1.5) {
        float row = p.y/0.26;
        float fr = fract(row);
        float t = fract((p.x + p.z)/0.32 + floor(row)*0.5);
        col *= 0.78 + 0.35*n + 0.12*(h13(vec3(floor(row), floor((p.x + p.z)/0.32 + floor(row)*0.5), 3.0)) - 0.5);
        col *= 0.72 + 0.28*smoothstep(0.0, 0.25, fr);
        rough = 0.72;
        h = smoothstep(0.0, 0.3, fr)*0.8 + smoothstep(0.0, 0.08, t)*smoothstep(1.0, 0.92, t)*0.2;
      } else if (k < 2.5) {
        float g = vn3(p*6.0);
        col *= 0.75 + 0.3*fbm3(p*1.5, 3) + 0.12*(g - 0.5);
        rough = 0.95; h = g;
      } else if (k < 3.5) {
        col *= 0.9 + 0.2*n; rough = 0.38; metal = 0.85; h = n*0.2;
      } else if (k < 4.5) {
        col = vec3(0.08); rough = 0.2; pLit = 1.0; h = 0.0;
      } else {
        col *= 0.8 + 0.3*n + 0.08*(vn3(p*30.0) - 0.5); rough = 0.9; h = n;
      }`,
  });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    base(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aGlow; attribute float aKind; varying vec3 vGlow; varying float vKind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow; vKind = aKind;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGlow; varying float vKind; float pLit = 0.0;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vGlow*pLit;');
  };
  m.customProgramCacheKey = () => 'simlab-dz-town';
  return m;
}

// ---- geometri yardımcıları (hepsi indekssiz, position/normal/color/aKind) ----
function prep(g, color, kind) {
  let x = g.index ? g.toNonIndexed() : g;
  if (x !== g) g.dispose();
  for (const k of Object.keys(x.attributes)) if (k !== 'position' && k !== 'normal') x.deleteAttribute(k);
  const n = x.attributes.position.count, c = new THREE.Color(color);
  const col = new Float32Array(n * 3), kk = new Float32Array(n);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; kk[i] = kind; }
  x.setAttribute('color', new THREE.BufferAttribute(col, 3));
  x.setAttribute('aKind', new THREE.BufferAttribute(kk, 1));
  return x;
}
const box = (w, h, d, x, y, z, color, kind) => prep(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), color, kind);

/** Beşik çatı: x yönünde mahya; w genişlik (z), l uzunluk (x), rh yükseklik. */
function gable(l, w, rh, x, y, z, color, rot) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, rh); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: l, bevelEnabled: false });
  g.translate(0, 0, -l / 2).rotateY(Math.PI / 2);
  if (rot) g.rotateY(Math.PI / 2);
  g.translate(x, y, z);
  return prep(g, color, 1);
}

const WALLS = [0xd9cfbf, 0xc9b79c, 0xe3dccf, 0xbfae95, 0xcfc4b0, 0xa9a198, 0xd6c3a5, 0xb7a58c];
const TILES = [0x8e4a32, 0x7a3f2c, 0x9b5a3d, 0x5b4a44, 0x6d3a2a];

/**
 * Kasabayı kurar. pos: ağ yerleşimi (3B, yalnız x,z kullanılır), deg, isBot.
 * Döner: { mesh, lotOf, anchor (Float32 N*3), ranges [[start,count]], empty (Set lot index), foot (N, yarıçap) }
 */
export function buildTown(N, pos, deg, isBot, seed) {
  const L = lots(), r = seeded(seed * 13 + 5);
  // hedef konum: ağ yerleşiminin x–z izdüşümü, kasabaya ölçeklenir (komşular yakın parsellere düşer)
  const d = [];
  for (let i = 0; i < N; i++) d.push(Math.hypot(pos[i * 3], pos[i * 3 + 2]));
  const sorted = [...d].sort((a, b) => a - b);
  const k = (HALF - 30) / (sorted[Math.floor(N * 0.95)] || 1);
  const order = [...Array(N).keys()].sort((a, b) => deg[b] - deg[a]);
  const taken = new Int32Array(L.length).fill(-1), lotOf = new Int32Array(N);
  for (const i of order) {
    const tx = pos[i * 3] * k, tz = pos[i * 3 + 2] * k;
    let best = -1, bd = 1e18;
    for (let l = 0; l < L.length; l++) {
      if (taken[l] >= 0) continue;
      const dd = (L[l][0] - tx) ** 2 + (L[l][1] - tz) ** 2;
      if (dd < bd) { bd = dd; best = l; }
    }
    taken[best] = i; lotOf[i] = best;
  }
  const geos = [], ranges = [], anchor = new Float32Array(N * 3), foot = new Float32Array(N);
  let vcount = 0;
  const maxDeg = Math.max(...deg);
  for (let i = 0; i < N; i++) {
    const [x, z] = L[lotOf[i]];
    const parts = [];
    const wall = WALLS[Math.floor(r() * WALLS.length)];
    let top;
    if (isBot[i]) {
      // telsiz / sunucu direği: beton kaide, dolap, kafes gövde (inceltilmiş), tepede durum lambası
      const H = 24 + r() * 6;
      parts.push(box(3.2, 0.5, 3.2, x, 0, z, 0x9a958c, 5));
      parts.push(box(1.6, 2.1, 1.0, x + 2.6, 0, z + 1.2, 0xb8bcc0, 3));
      for (const [ox, oz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
        const leg = new THREE.CylinderGeometry(0.07, 0.11, H, 6).translate(0, H / 2 + 0.5, 0);
        const p = leg.attributes.position;
        for (let v = 0; v < p.count; v++) { const t = (p.getY(v) - 0.5) / H; p.setX(v, p.getX(v) + ox * (1.3 - t)); p.setZ(v, p.getZ(v) + oz * (1.3 - t)); }
        leg.computeVertexNormals();
        leg.translate(x, 0, z);
        parts.push(prep(leg, 0x9ea4aa, 3));
      }
      for (let h = 3; h < H; h += 3) {
        const s = 1.3 - (h - 0.5) / H;
        parts.push(box(1.2 * s + 0.1, 0.08, 0.08, x, h, z - 0.6 * s, 0x9ea4aa, 3));
        parts.push(box(1.2 * s + 0.1, 0.08, 0.08, x, h, z + 0.6 * s, 0x9ea4aa, 3));
        parts.push(box(0.08, 0.08, 1.2 * s + 0.1, x - 0.6 * s, h, z, 0x9ea4aa, 3));
        parts.push(box(0.08, 0.08, 1.2 * s + 0.1, x + 0.6 * s, h, z, 0x9ea4aa, 3));
      }
      // anten panelleri
      for (let a = 0; a < 3; a++) {
        const ang = a * Math.PI * 2 / 3;
        const g = new THREE.BoxGeometry(0.35, 1.8, 0.12).translate(0, H - 1.6, 0.55).rotateY(ang).translate(x, 0, z);
        parts.push(prep(g, 0xe8e8e4, 3));
      }
      const lamp = new THREE.SphereGeometry(0.55, 12, 8).translate(x, H + 0.9, z);
      parts.push(prep(lamp, 0x222222, 4));
      top = H + 1.4; foot[i] = 3.2;
    } else if (deg[i] >= 9) {
      // çok bağlantılı "fenomen": yüksek apartman (kat sayısı bağlantıyla artar)
      const fl = Math.min(16, 5 + Math.round((deg[i] - 9) * 0.55 + (deg[i] / maxDeg) * 4));
      const H = fl * 3.0, w = 12.5, dd = 11.5;
      parts.push(box(w + 0.6, 0.6, dd + 0.6, x, 0, z, 0x8e8a82, 5));
      parts.push(box(w, H, dd, x, 0.6, z, wall, 0));
      parts.push(box(w + 0.4, 0.5, dd + 0.4, x, H + 0.6, z, 0x9c978d, 5));
      parts.push(box(w - 0.6, 0.12, dd - 0.6, x, H + 1.0, z, 0x77736c, 2));
      parts.push(box(3.2, 2.6, 3.2, x - 2.5, H + 1.1, z + 1.5, 0xa8a49b, 5));
      parts.push(box(1.8, 1.0, 1.2, x + 3.0, H + 1.1, z - 2.0, 0xb4b8bc, 3));
      top = H + 3.2; foot[i] = 9.5;
    } else if (deg[i] >= 4) {
      // 3–4 katlı düz çatılı apartman
      const fl = 3 + (deg[i] >= 6 ? 1 : 0), H = fl * 3.0, w = 11 + r() * 1.5, dd = 10 + r() * 1.5;
      parts.push(box(w + 0.5, 0.6, dd + 0.5, x, 0, z, 0x8e8a82, 5));
      parts.push(box(w, H, dd, x, 0.6, z, wall, 0));
      parts.push(box(w + 0.3, 0.45, dd + 0.3, x, H + 0.6, z, 0x9c978d, 5));
      parts.push(box(w - 0.5, 0.1, dd - 0.5, x, H + 0.95, z, 0x77736c, 2));
      if (r() < 0.6) parts.push(box(1.2, 1.4, 1.2, x + (r() - 0.5) * 5, H + 1.05, z + (r() - 0.5) * 4, 0x6e6a64, 3));
      top = H + 2.2; foot[i] = 8.5;
    } else {
      // müstakil ev: iki kat, beşik çatı, baca
      const rot = r() < 0.5, l = 9 + r() * 2, w = 7.5 + r() * 1.2, H = 5.8, rh = 2.6 + r() * 0.6;
      const [bl, bw] = rot ? [w, l] : [l, w];
      parts.push(box(bl + 0.3, 0.5, bw + 0.3, x, 0, z, 0x8e8a82, 5));
      parts.push(box(bl, H, bw, x, 0.5, z, wall, 0));
      parts.push(gable(l + 0.8, w + 0.9, rh, x, H + 0.5, z, TILES[Math.floor(r() * TILES.length)], rot));
      parts.push(box(0.7, 2.4, 0.7, x + (rot ? 1.5 : 2.4), H + 1.2, z + (rot ? 2.4 : 1.5), 0x8a5a45, 5));
      top = H + 0.5 + rh + 0.8; foot[i] = 7;
    }
    let cnt = 0;
    for (const g of parts) { cnt += g.attributes.position.count; geos.push(g); }
    ranges.push([vcount, cnt]); vcount += cnt;
    anchor[i * 3] = x; anchor[i * 3 + 1] = top; anchor[i * 3 + 2] = z;
  }
  const g = BufferGeometryUtils.mergeGeometries(geos, false);
  geos.forEach((x) => x.dispose());
  const glow = new Float32Array(vcount * 3), node = new Float32Array(vcount);
  ranges.forEach(([s, c], i) => node.fill(i, s, s + c));
  g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 3));
  g.setAttribute('aNode', new THREE.BufferAttribute(node, 1));
  g.computeBoundingSphere();
  const empty = new Set();
  taken.forEach((v, l) => { if (v < 0) empty.add(l); });
  return { geometry: g, lotOf, anchor, ranges, empty, foot, lots: L };
}

/** Sokaklar (asfalt) ve kaldırımlar (beton) — iki birleşik mesh. */
export function streets(asphaltMat, walkMat) {
  const a = [], w = [];
  const len = NB * PITCH + STREET;
  for (let s = 0; s <= NB; s++) {
    const c = (s - NB / 2) * PITCH;
    a.push(new THREE.PlaneGeometry(STREET - 3, len).rotateX(-Math.PI / 2).translate(c, 0.04, 0));
    a.push(new THREE.PlaneGeometry(len, STREET - 3).rotateX(-Math.PI / 2).translate(0, 0.045, c));
    for (const o of [-1, 1]) {
      w.push(new THREE.BoxGeometry(1.5, 0.16, len).translate(c + o * (STREET / 2 - 0.75), 0.08, 0));
      w.push(new THREE.BoxGeometry(len, 0.16, 1.5).translate(0, 0.08, c + o * (STREET / 2 - 0.75)));
    }
  }
  const strip = (arr) => arr.map((g) => { const x = g.toNonIndexed(); g.dispose(); x.deleteAttribute('uv'); return x; });
  const ma = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(strip(a)), asphaltMat);
  const mw = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(strip(w)), walkMat);
  ma.receiveShadow = mw.receiveShadow = true;
  ma.userData.noFit = mw.userData.noFit = true;
  ma.userData.noCast = true;
  return [ma, mw];
}

/** Sokak lambası konumları (sokak kenarında, ~30 m arayla). */
export function lampSpots() {
  const out = [];
  for (let s = 0; s <= NB; s++) {
    const c = (s - NB / 2) * PITCH;
    for (let t = -HALF + 15; t < HALF; t += 30) {
      out.push([c + STREET / 2 - 0.8, t, -1]);
      out.push([t + 15, c - STREET / 2 + 0.8, 0]);
    }
  }
  return out;
}

/** Yumuşak, yuvarlak ışık lekesi dokusu (parçacıklar için). */
export function softSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
