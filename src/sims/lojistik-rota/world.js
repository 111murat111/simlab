// Lojistik Rota — gerçek ölçekli (metre) şehir sahnesi: 4,5 km ızgara şehir, depo, kamyonetler, trafik, katmanlar.
// Bu dosya yalnız görseli kurar; model/planlama main.js'te kalır.
import { THREE, mat, procedural, landscape, createTerrain, terrainSkirt, createVegetation, RoundedBoxGeometry, BufferGeometryUtils, clamp, crowd } from '@core';
import { createCity, buildingBatch, groundMats, streetTrees, streetLamps, carFleet, cityRng } from './city.js';

export const LOW = /[?&]low\b/.test(location.search);
const ss = THREE.MathUtils.smoothstep;
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
const clean = (g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return nonIdx(g); };
const merge = (list) => BufferGeometryUtils.mergeGeometries(list.map(clean));

// ---------------------------------------------------------------- Malzemeler
let KM = null;
function mats() {
  if (KM) return KM;
  KM = {
    clad: procedural({
      key: 'lr-clad', params: { color: 0xc3c8cb, roughness: 0.45, metalness: 0.5 }, bump: 0.03,
      pattern: `
        vec3 a = axisDominant(pn);
        if (a.y > 0.5) { col = vec3(0.47, 0.47, 0.45)*(0.8 + 0.3*fbm3(p*0.08, 3)); rough = 0.85; metal = 0.0; h = 0.0; }
        else {
          float u = a.x > 0.5 ? p.z : p.x;
          float w = fwidth(u)*4.0;
          float rib = mix(smoothstep(0.25, 0.75, abs(fract(u*3.0) - 0.5)*2.0), 0.5, clamp(w, 0.0, 1.0));
          float seam = mix(smoothstep(0.0, 0.04, abs(fract(p.y/4.5) - 0.5)), 1.0, clamp(fwidth(p.y)*0.8, 0.0, 1.0));
          float st = fbm3(vec3(u*0.3, p.y*0.05, u*0.08), 4);
          col *= (0.9 + 0.1*rib)*(0.88 + 0.12*seam)*(0.86 + 0.18*st);
          col *= 1.0 - 0.15*smoothstep(3.0, 0.0, p.y);
          h = rib;
        }`,
    }),
    shutter: procedural({
      key: 'lr-shutter', params: { color: 0x8f969b, roughness: 0.5, metalness: 0.45 }, bump: 0.04,
      pattern: `float r = abs(fract(p.y*5.0) - 0.5)*2.0; col *= 0.82 + 0.18*smoothstep(0.1, 0.6, r); col *= 0.85 + 0.2*fbm3(p*0.7, 3); h = r;`,
    }),
    yard: mat.concrete({ color: 0xa9a59c, scale: 0.15, stains: 0.45 }),
    rubber: mat.rubber({ color: 0x18191b }),
    trim: mat.paintedMetal({ color: 0x3b4046, wear: 0.15 }),
    orange: mat.paintedMetal({ color: 0xd9771a, wear: 0.08 }),
    skylight: new THREE.MeshPhysicalMaterial({ color: 0x9fb4c0, roughness: 0.15, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08 }),
    ac: mat.plastic({ color: 0xd9dad6, gloss: 0.3 }),
    pv: new THREE.MeshPhysicalMaterial({ color: 0x14202e, roughness: 0.12, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 }),
    pvFrame: mat.brushedMetal({ color: 0xb8bcc0, rough: 0.35 }),
    vanWhite: new THREE.MeshPhysicalMaterial({ color: 0xf1f1ee, roughness: 0.32, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
    vanGlass: new THREE.MeshPhysicalMaterial({ color: 0x0b1116, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 }),
    vanPlastic: mat.plastic({ color: 0x232527, gloss: 0.2 }),
    head: mat.glow({ color: 0xfff2d8, intensity: 1.4 }),
    tail: mat.glow({ color: 0xff2a1a, intensity: 1.0 }),
    tyre: mat.rubber({ color: 0x1b1c1e }),
    rim: mat.brushedMetal({ color: 0xaab0b6, rough: 0.35 }),
  };
  return KM;
}

// ---------------------------------------------------------------- Kamyonet (5,9 m panel van, +x yönüne bakar)
let VG = null;
function vanGeo() {
  if (VG) return VG;
  const bv = 0.1, W = 2.0;
  const s = new THREE.Shape();
  s.moveTo(-2.85, 0.42); s.lineTo(2.72, 0.42); s.quadraticCurveTo(2.88, 0.42, 2.88, 0.62);
  s.lineTo(2.88, 0.98); s.quadraticCurveTo(2.86, 1.12, 2.6, 1.18); s.lineTo(2.3, 1.27);
  s.lineTo(1.25, 2.38); s.quadraticCurveTo(1.12, 2.5, 0.85, 2.5); s.lineTo(-2.7, 2.5);
  s.quadraticCurveTo(-2.85, 2.5, -2.85, 2.35); s.lineTo(-2.85, 0.42);
  const body = new THREE.ExtrudeGeometry(s, { depth: W - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 2, curveSegments: 6 })
    .translate(0, 0, -(W - 2 * bv) / 2);
  // Ön cam: gövdenin eğik yüzünün hemen önünde ince levha
  const ex = 2.3 - 1.25, ey = 2.38 - 1.27, el = Math.hypot(ex, ey), nx = ey / el, ny = ex / el;
  const wind = new RoundedBoxGeometry(0.03, el - 0.18, W - 0.34, 1, 0.012)
    .rotateZ(Math.atan2(ex, ey)).translate((2.3 + 1.25) / 2 + nx * (bv + 0.02), (1.27 + 2.38) / 2 + ny * (bv + 0.02), 0);
  const side = [];
  for (const z of [-1, 1]) {
    const sh = new THREE.Shape();
    sh.moveTo(0.55, 1.42); sh.lineTo(2.02, 1.42); sh.lineTo(1.22, 2.28); sh.lineTo(0.55, 2.28); sh.lineTo(0.55, 1.42);
    side.push(new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false }).translate(0, 0, z > 0 ? W / 2 + 0.002 : -W / 2 - 0.014));
  }
  const rearWin = [-1, 1].map((z) => new RoundedBoxGeometry(0.03, 0.62, 0.78, 1, 0.01).translate(-2.96, 1.95, z * 0.45));
  const glass = merge([wind, ...side, ...rearWin]);
  // Firma şeridi (renk aracın rengi): yan yüzlerde ve arkada
  const stripe = merge([
    new RoundedBoxGeometry(3.55, 0.42, 0.02, 1, 0.008).translate(-1.0, 1.35, W / 2 + 0.006),
    new RoundedBoxGeometry(3.55, 0.42, 0.02, 1, 0.008).translate(-1.0, 1.35, -W / 2 - 0.006),
    new RoundedBoxGeometry(0.02, 0.3, 1.6, 1, 0.008).translate(-2.965, 1.1, 0),
  ]);
  const dark = merge([
    new RoundedBoxGeometry(0.28, 0.34, W + 0.04, 2, 0.08).translate(2.86, 0.6, 0),       // ön tampon
    new RoundedBoxGeometry(0.22, 0.3, W + 0.02, 2, 0.07).translate(-2.9, 0.56, 0),       // arka tampon
    new RoundedBoxGeometry(0.06, 0.34, 1.1, 1, 0.02).translate(2.97, 0.98, 0),            // ızgara
    new RoundedBoxGeometry(0.2, 0.26, 0.08, 1, 0.03).translate(1.95, 1.62, W / 2 + 0.16),  // aynalar
    new RoundedBoxGeometry(0.2, 0.26, 0.08, 1, 0.03).translate(1.95, 1.62, -W / 2 - 0.16),
    new RoundedBoxGeometry(5.0, 0.12, 0.03, 1, 0.01).translate(-0.3, 0.52, W / 2 + 0.01),  // eşik
    new RoundedBoxGeometry(5.0, 0.12, 0.03, 1, 0.01).translate(-0.3, 0.52, -W / 2 - 0.01),
    new RoundedBoxGeometry(0.02, 1.6, 0.03, 1, 0.005).translate(-2.965, 1.55, 0),         // arka kapı ayrımı
  ]);
  const head = merge([-1, 1].map((z) => new RoundedBoxGeometry(0.08, 0.16, 0.32, 1, 0.04).translate(2.83, 1.08, z * 0.72)));
  const tail = merge([-1, 1].map((z) => new RoundedBoxGeometry(0.04, 0.5, 0.14, 1, 0.02).translate(-2.965, 1.05, z * 0.9)));
  const wr = 0.36, ri = wr * 0.62, w = 0.22, wp = [], rp = [];
  for (const [a, b] of [[ri, -w / 2], [wr * 0.9, -w / 2], [wr, -w * 0.3], [wr, w * 0.3], [wr * 0.9, w / 2], [ri, w / 2]]) wp.push(new THREE.Vector2(a, b));
  for (const [a, b] of [[0.001, w * 0.4], [ri * 0.5, w * 0.34], [ri, w * 0.44], [ri, -w * 0.44], [0.001, -w * 0.3]]) rp.push(new THREE.Vector2(a, b));
  const tyres = [], rims = [];
  for (const x of [1.95, -1.72]) for (const z of [-1, 1]) {
    const flip = z < 0 ? Math.PI : 0;
    tyres.push(new THREE.LatheGeometry(wp, 18).rotateX(Math.PI / 2).rotateY(flip).translate(x, wr, z * 0.86));
    rims.push(new THREE.LatheGeometry(rp, 14).rotateX(Math.PI / 2).rotateY(flip).translate(x, wr, z * 0.86));
  }
  VG = { body: clean(body), glass, stripe, dark, head, tail, tyre: merge(tyres), rim: merge(rims) };
  return VG;
}
function vanParts(stripeMat) {
  const K = mats(), G = vanGeo();
  return [[G.body, K.vanWhite], [G.glass, K.vanGlass], [G.stripe, stripeMat], [G.dark, K.vanPlastic], [G.head, K.head], [G.tail, K.tail], [G.tyre, K.tyre], [G.rim, K.rim]];
}

/** Hareketli kamyonet (Group, +x'e bakar); altında uzaktan görünsün diye renkli yumuşak hale (katman). */
export function makeVan(color, haloTex) {
  const g = new THREE.Group();
  const stripe = mat.paintedMetal({ color, wear: 0.03 });
  for (const [geo, m] of vanParts(stripe)) { const o = new THREE.Mesh(geo, m); o.castShadow = o.receiveShadow = true; g.add(o); }
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(56, 56).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, map: haloTex, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.position.y = 0.6; halo.renderOrder = 3; halo.userData.noAO = true; halo.raycast = () => {};
  g.add(halo);
  g.userData.halo = halo;
  return g;
}

function softDiscTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function beamTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128;
  const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgb(0,0,0)'); gr.addColorStop(0.55, 'rgb(80,80,80)'); gr.addColorStop(1, 'rgb(235,235,235)');
  x.fillStyle = gr; x.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- Dünya
// Ağır görsel katmanlar sayfa tamamen yüklendikten sonra kurulur (ayrıştırıcı ara verse bile açılışı bloklamaz)
const afterLoad = (fn) => (document.readyState === 'complete' ? setTimeout(fn, 0) : addEventListener('load', () => setTimeout(fn, 0), { once: true }));
export function buildWorld(sim, { GN, SP, HALF, DEPOT, nodePos, edges }) {
  const scene = sim.scene, K = mats(), G = groundMats();
  const hr = 7;                      // yol yarı genişliği (14 m: her yönde bir şerit + park şeridi)
  const [dnx, dnz] = nodePos(DEPOT);
  const DC = [dnx + SP / 2, dnz + SP / 2];                    // depo adası merkezi
  const inDepot = (x, z, m = 0) => Math.abs(x - DC[0]) < SP / 2 - hr + m && Math.abs(z - DC[1]) < SP / 2 - hr + m;
  const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

  // --- Arazi: şehir düz ovada; dışarıda hafif tepeler, tarla ve orman ---
  const hills = landscape({ seed: 31, size: 3800, height: 1, octaves: 5, warp: 0.35 });
  const E = HALF + 90;
  const heightAt = (x, z) => {
    const d = Math.max(Math.abs(x), Math.abs(z)) - E;
    if (d < 0) return -0.25;
    return -0.25 + ss(d, 0, 2600) * (40 + 190 * clamp(hills(x, z) + 0.35, 0, 1.2)) + ss(d, 0, 400) * 6 * hills(x * 3, z * 3);
  };
  const TS = 20000;
  const terrain = createTerrain(heightAt, { size: [TS, TS], res: LOW ? [200, 200] : [320, 320],
    materialOptions: { water: -80, grassAmount: 1.0, forest: 0.7, grass: 0x5a6e32, dry: 0x7f7e4c, soil: 0x6e5c40 } });
  terrain.userData.noFit = true;
  scene.add(terrain, terrainSkirt(heightAt, { inner: TS / 2, outer: 70000 }));

  // Şehir çevresi tarım parselleri: arazinin üstüne serilen, dışa doğru solan tarla deseni (ekin, nadas, sürülmüş toprak).
  // Tarla dokusu ve orman, sayfa açıldıktan hemen sonra (ilk görev döngüsünde) kurulur; açılış bekletilmez.
  const buildFields = () => {
    const R = E + 2600, N = 1024, px = N / (2 * R);
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d');
    const FC = ['#5d7236', '#6c7d3a', '#8a8a48', '#a39a5c', '#7a6446', '#665238', '#4f6a30', '#93924f', '#b3a766', '#58703a'];
    let sd = 911; const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    for (let z = -R; z < R;) {
      const hz = 90 + rr() * 150;
      for (let x = -R; x < R;) {
        const wx = 110 + rr() * 220;
        g.fillStyle = FC[Math.floor(rr() * FC.length)];
        g.fillRect((x + R) * px, (z + R) * px, wx * px + 0.5, hz * px + 0.5);
        if (rr() < 0.55) {               // sürüm/ekim izleri
          g.strokeStyle = 'rgba(40,35,20,0.12)'; g.lineWidth = 1;
          const vert = rr() < 0.5;
          g.beginPath();
          for (let k = 6; k < (vert ? wx : hz); k += 9) { if (vert) { g.moveTo((x + k + R) * px, (z + R) * px); g.lineTo((x + k + R) * px, (z + hz + R) * px); } else { g.moveTo((x + R) * px, (z + k + R) * px); g.lineTo((x + wx + R) * px, (z + k + R) * px); } }
          g.stroke();
        }
        g.strokeStyle = 'rgba(38,52,24,0.55)'; g.lineWidth = Math.max(1, 3 * px);   // çit/sınır
        g.strokeRect((x + R) * px, (z + R) * px, wx * px, hz * px);
        x += wx;
      }
      z += hz;
    }
    // Kenara doğru saydamlaşma; şehir karesi boş
    const id = g.getImageData(0, 0, N, N), D = id.data;
    for (let j = 0; j < N; j++) {
      const az = Math.abs(j / px - R);
      for (let i = 0; i < N; i++) {
        const ax = Math.abs(i / px - R), d = (ax > az ? ax : az) - E;
        let a = 0;
        if (d >= 30) { const f = 1 - (d - 1500) / 1100; a = (f > 1 ? 1 : f < 0 ? 0 : f) * (d > 120 ? 1 : 0.7 + 0.3 * (d - 30) / 90); }
        D[(j * N + i) * 4 + 3] = 255 * a;
      }
    }
    g.putImageData(id, 0, 0);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const fg = new THREE.PlaneGeometry(2 * R, 2 * R, LOW ? 120 : 200, LOW ? 120 : 200).rotateX(-Math.PI / 2);
    const P = fg.attributes.position;
    for (let k = 0; k < P.count; k++) P.setY(k, heightAt(P.getX(k), P.getZ(k)) + 0.4);
    fg.computeVertexNormals();
    const fm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const fields = new THREE.Mesh(fg, fm); fields.receiveShadow = true; fields.renderOrder = 1; fields.userData.noFit = true; fields.userData.noAO = true;
    scene.add(fields);
  };

  // Şehirden çıkan yollar (ana caddelerin devamı), araziyi izleyen asfalt şerit
  const AX = [nodePos(2)[0], nodePos(6)[0]];             // ana cadde sütunları (x)
  const AZ = [nodePos(2 * GN)[1], nodePos(6 * GN)[1]];   // ana cadde satırları (z)
  const outRoads = [];
  for (const x of AX) { outRoads.push([[x, -HALF - hr], [x, -TS / 2 + 200]]); outRoads.push([[x, HALF + hr], [x, TS / 2 - 200]]); }
  for (const z of AZ) { outRoads.push([[-HALF - hr, z], [-TS / 2 + 200, z]]); outRoads.push([[HALF + hr, z], [TS / 2 - 200, z]]); }
  {
    const rg = [], dg = [];
    for (const [[ax, az], [bx, bz]] of outRoads) {
      const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, rx = -uz, rz = ux, n = Math.ceil(L / 40);
      const P = [], I = [];
      for (let k = 0; k <= n; k++) {
        const x = ax + ux * L * k / n, z = az + uz * L * k / n;
        for (const o of [-hr, hr]) { const px = x + rx * o, pz = z + rz * o; P.push(px, heightAt(px, pz) + 0.35, pz); }
      }
      for (let k = 0; k < n; k++) { const a = k * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); g.computeVertexNormals();
      rg.push(g.toNonIndexed());
      for (let d = 10; d < Math.min(L, 3000); d += 12) {
        const x = ax + ux * d, z = az + uz * d;
        dg.push(new THREE.PlaneGeometry(0.15, 4.5).rotateX(-Math.PI / 2).rotateY(Math.atan2(ux, uz)).translate(x, heightAt(x, z) + 0.4, z));
      }
    }
    const a = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(rg), G.asphalt); a.receiveShadow = true; a.userData.noFit = true;
    const d = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(dg.map(nonIdx)), G.paint); d.userData.noFit = true; d.userData.noAO = true;
    scene.add(a, d);
  }
  const nearOut = (x, z) => outRoads.some(([[ax, az], [bx, bz]]) => (ax === bx ? Math.abs(x - ax) < 22 && (z - az) * (z - bz) <= 0 : Math.abs(z - az) < 22 && (x - ax) * (x - bx) <= 0));
  let veg = null;
  const buildVeg = () => { veg = createVegetation((x, z) => (Math.max(Math.abs(x), Math.abs(z)) < E + 60 || nearOut(x, z) ? -100 : heightAt(x, z)), {
    rect: [-8000, -8000, 8000, 8000], trees: LOW ? 3000 : 6000, rocks: 0, seed: 7, water: -80, maxSlope: 0.6, near: [-150, 150, 4300],
    kinds: { broad: 0.55, pine: 0.3, cypress: 0.15 },
    forest: (x, z) => 0.42 + 0.3 * Math.sin(x * 0.0011 + 1) * Math.cos(z * 0.0013 - 0.7) + 0.12 * Math.sin(x * 0.004 + z * 0.003) + 0.2 * ss(Math.max(Math.abs(x), Math.abs(z)), 3000, 6000),
  });
  scene.add(veg.group); };
  afterLoad(() => { buildFields(); buildVeg(); });

  // --- Şehir: graf yolları 500 m'de bir; aralarında birer ara sokak (250 m) ---
  // Graf yolları 500 m'de bir; aralarında üç ara sokak → 125 m'lik kent adaları (çevre blok + iç avlu)
  const lines = Array.from({ length: 4 * (GN - 1) + 1 }, (_, k) => -HALF + (k * SP) / 4);
  const myTrees = [];
  const residential = [0xe3d9c6, 0xd8cbb3, 0xece6da, 0xcfc4b0, 0xe6d2b5, 0xd5d9d6, 0xc9b8a0, 0xf0e9dc, 0xd9c2a2];
  const office = [0x9aa5ad, 0xb8bec2, 0x7d8a92, 0xc4c0b6, 0xa7b0b5];
  const bricks = [0x9c4a32, 0x8d4a36, 0xa65e3e, 0x7f3f2c];
  function place(batch, r, x, z, w, d, rot, fl, st, o = {}) {
    const fh = st === 1 ? 3.6 : 3.0;
    const shop = st !== 2 && (o.shop ?? r() < 0.5);
    const g0 = shop ? Math.max(fh * 1.3, 3.9) : fh;
    const hip = st !== 1 && fl <= 4 && r() < (o.hip ?? 0.3);
    batch.add({
      x, z, w, d, rot, h: g0 + (fl - 1) * fh + (hip ? 0 : 1.0), floorH: fh, bay: st === 1 ? 3.0 : 3.0 + r() * 0.8, style: st,
      color: st === 2 ? bricks[Math.floor(r() * 4)] : st === 1 ? office[Math.floor(r() * office.length)] : residential[Math.floor(r() * residential.length)],
      seed: r(), shop, roof: hip ? 'hip' : 'flat', balconies: o.balconies,
    });
  }
  function ring(inner, r, batch, { wMin, wMax, d, gap, floors, style, hip, shop }) {
    const run = (len, fn) => {
      let s = 0;
      while (s < len - wMin) {
        const w = Math.min(wMin + r() * (wMax - wMin), len - s);
        if (w < wMin * 0.7) break;
        fn(s + w / 2, w);
        s += w + gap * (0.6 + r() * 0.8);
      }
    };
    const P = (x, z, w, rot) => place(batch, r, x, z, w, d, rot, floors(), style(), { hip, shop });
    run(inner.w, (s, w) => P(inner.x0 + s, inner.z1 - d / 2, w, 0));
    run(inner.w, (s, w) => P(inner.x1 - s, inner.z0 + d / 2, w, Math.PI));
    const zl = inner.d - 2 * d - 2 * gap;
    run(zl, (s, w) => P(inner.x1 - d / 2, inner.z1 - d - gap - s, w, Math.PI / 2));
    run(zl, (s, w) => P(inner.x0 + d / 2, inner.z0 + d + gap + s, w, -Math.PI / 2));
  }
  const lots = (inner, r, batch) => {
    const dc = Math.hypot(inner.cx, inner.cz), ri = (a, b) => a + Math.floor(r() * (b - a + 1));
    if (dc < 820) {
      // merkez: 6–17 katlı çevre blok (ofis giydirme cephe + sıvalı), avluda kule ya da ağaçlık
      const tall = 1 - dc / 820;
      ring(inner, r, batch, { wMin: 20, wMax: 34, d: 18, gap: 4, floors: () => ri(6, 9 + Math.round(8 * tall)), style: () => (r() < 0.5 ? 1 : 0), hip: 0, shop: 0.85 });
      if (r() < 0.3 + 0.55 * tall) place(batch, r, inner.cx + (r() - 0.5) * 10, inner.cz + (r() - 0.5) * 10, 24 + r() * 12, 22 + r() * 8, r() < 0.5 ? 0 : Math.PI,
        ri(12, 16 + Math.round(22 * tall)), r() < 0.75 ? 1 : 0, { shop: false, balconies: false });
      else for (let k = 0; k < 3; k++) myTrees.push([inner.cx + (r() - 0.5) * 36, inner.cz + (r() - 0.5) * 30, 0, 1]);
    } else if (dc < 1750) {
      // iç halka: 4–8 katlı bitişik apartmanlar, yeşil iç avlu
      ring(inner, r, batch, { wMin: 14, wMax: 26, d: 14, gap: 3, floors: () => ri(4, 8), style: () => (r() < 0.78 ? 0 : 2), hip: 0.2, shop: 0.55 });
      for (let k = 0, n = LOW ? 2 : 5; k < n; k++) myTrees.push([inner.cx + (r() - 0.5) * 56, inner.cz + (r() - 0.5) * 50, 0, 1]);
    } else {
      // dış mahalleler: 2–4 katlı evler, arka bahçeler
      ring(inner, r, batch, { wMin: 11, wMax: 16, d: 11, gap: 7, floors: () => ri(2, 4), style: () => (r() < 0.85 ? 0 : 2), hip: 0.6, shop: 0.1 });
      for (const [xx, zz] of [[-22, -18], [22, -18], [-22, 18], [22, 18]]) {
        if (r() < 0.45) { myTrees.push([inner.cx + xx + (r() - 0.5) * 8, inner.cz + zz, 0, 1]); continue; }
        place(batch, r, inner.cx + xx, inner.cz + zz, 11 + r() * 3, 9, r() < 0.5 ? 0 : Math.PI, ri(2, 3), 0, { shop: false, hip: 0.7 });
      }
      if (!LOW) for (let k = 0; k < 3; k++) myTrees.push([inner.cx + (r() - 0.5) * 70, inner.cz + (r() - 0.5) * 60, 0, 1]);
    }
  };
  // Kent dokusu (binalar, park ve cadde ağaçları) açılıştan hemen sonra kurulur; sayfa yüklemesi bloklanmaz
  const buildCity = () => {
  const city = createCity({
    xs: lines, zs: lines, road: 2 * hr, walk: 4, seed: 11, parked: LOW ? 140 : 200, trees: false, lamps: false, lawnInside: true,
    plan: (i, j, rect) => (inDepot(rect.cx, rect.cz, 1) ? 'none' : hash(Math.floor(i / 2), Math.floor(j / 2)) < 0.07 ? 'park' : 'city'),
    lots, detail: (B) => !LOW && Math.hypot(B.x - DC[0], B.z - DC[1]) < 380,
    parkOk: (x, z) => !inDepot(x, z, hr + 4),
  });
  scene.add(city.group);
  // Parklarda ağaç (createCity yoğunluğu çok yüksek olurdu; kendimiz seyrek koyuyoruz)
  {
    const r = cityRng(77);
    for (const b of city.blocks) if (b.kind === 'park') {
      const n = LOW ? 16 : 36;
      for (let k = 0; k < n; k++) myTrees.push([b.x0 + 8 + r() * (b.w - 16), b.z0 + 8 + r() * (b.d - 16), 0, 1]);
    }
    // Ana caddeler (graf satır/sütun 2 ve 6) iki yanında ağaç dizisi
    const step = LOW ? 22 : 13;
    for (const x of AX) for (let z = -HALF + 14; z < HALF - 14; z += step) if (lines.every((l) => Math.abs(l - z) > 16) && !inDepot(x, z, 20)) for (const s of [-1, 1]) myTrees.push([x + s * (hr + 1.3), z]);
    for (const z of AZ) for (let x = -HALF + 14; x < HALF - 14; x += step) if (lines.every((l) => Math.abs(l - x) > 16) && !inDepot(x, z, 20)) for (const s of [-1, 1]) myTrees.push([x, z + s * (hr + 1.3)]);
  }
  };

  // --- Depo: lojistik deposu, rampa kapıları, kamyonet parkı ---
  const depot = new THREE.Group();
  let folkTick = () => {};
  depot.position.set(DC[0], 0, DC[1]);
  const Y = SP / 2 - hr;                          // ada yarı genişliği
  {
    const slab = new THREE.Mesh(new RoundedBoxGeometry(2 * Y, 0.3, 2 * Y, 2, 0.1).translate(0, 0.05, 0), G.paver);
    const lawn = new THREE.Mesh(new RoundedBoxGeometry(2 * Y - 10, 0.3, 2 * Y - 10, 2, 0.1).translate(0, 0.12, 0), G.lawn);
    const yard = new THREE.Mesh(new RoundedBoxGeometry(300, 0.3, 300, 2, 0.1).translate(10, 0.16, 25), G.asphalt);
    const HX = 115, HZ = 65, HH = 13, hx0 = 10, hz0 = -45;          // depo binası 230 × 130 × 13 m
    const hall = new THREE.Mesh(new RoundedBoxGeometry(2 * HX, HH, 2 * HZ, 2, 0.3).translate(hx0, HH / 2 + 0.2, hz0), K.clad);
    const parapet = new THREE.Mesh(merge([
      new RoundedBoxGeometry(2 * HX + 0.6, 0.9, 0.5, 1, 0.1).translate(hx0, HH + 0.6, hz0 + HZ), new RoundedBoxGeometry(2 * HX + 0.6, 0.9, 0.5, 1, 0.1).translate(hx0, HH + 0.6, hz0 - HZ),
      new RoundedBoxGeometry(0.5, 0.9, 2 * HZ, 1, 0.1).translate(hx0 + HX, HH + 0.6, hz0), new RoundedBoxGeometry(0.5, 0.9, 2 * HZ, 1, 0.1).translate(hx0 - HX, HH + 0.6, hz0),
    ]), K.trim);
    // Rampa kapıları (güney yüzü, +z)
    const doors = [], seals = [], bumpers = [];
    const fz = hz0 + HZ;
    for (let k = 0; k < 18; k++) {
      const x = hx0 - HX + 16 + k * 11.6;
      doors.push(new RoundedBoxGeometry(3.2, 3.4, 0.18, 1, 0.04).translate(x, 1.3 + 1.7, fz + 0.05));
      seals.push(new RoundedBoxGeometry(4.0, 0.45, 0.6, 1, 0.1).translate(x, 4.95, fz + 0.3));
      for (const s of [-1, 1]) seals.push(new RoundedBoxGeometry(0.45, 3.9, 0.6, 1, 0.1).translate(x + s * 1.95, 3.0, fz + 0.3));
      for (const s of [-1, 1]) bumpers.push(new RoundedBoxGeometry(0.3, 0.45, 0.25, 1, 0.06).translate(x + s * 1.3, 1.1, fz + 0.15));
    }
    const dock = new THREE.Mesh(new RoundedBoxGeometry(2 * HX - 12, 1.1, 1.2, 1, 0.1).translate(hx0, 0.75, fz + 0.5), K.yard);
    const canopy = new THREE.Mesh(new RoundedBoxGeometry(2 * HX - 8, 0.35, 5.5, 1, 0.1).translate(hx0, 5.8, fz + 2.75), K.trim);
    const doorM = new THREE.Mesh(merge(doors), K.shutter), sealM = new THREE.Mesh(merge([...seals, ...bumpers]), K.rubber);
    // Çatı: ışıklık şeritleri, iklimlendirme üniteleri, güneş paneli dizisi
    const sky = [], acs = [];
    for (let k = 0; k < 9; k++) sky.push(new RoundedBoxGeometry(2.6, 0.5, 2 * HZ - 16, 1, 0.1).translate(hx0 - HX + 24 + k * 12, HH + 0.45, hz0));
    for (let k = 0; k < 6; k++) acs.push(new RoundedBoxGeometry(3.6, 1.8, 2.4, 2, 0.12).translate(hx0 + 30 + (k % 3) * 9, HH + 1.1, hz0 - 30 + Math.floor(k / 3) * 8));
    const skyM = new THREE.Mesh(merge(sky), K.skylight), acM = new THREE.Mesh(merge(acs), K.ac);
    const pv = [];
    for (let row = 0; row < 12; row++) for (let c = 0; c < 6; c++) {
      pv.push(new RoundedBoxGeometry(9.6, 0.08, 2.1, 1, 0.02).rotateX(-0.17).translate(hx0 + 55 + c * 10, HH + 0.9, hz0 - 55 + row * 4.4));
    }
    const pvM = new THREE.Mesh(merge(pv), K.pv);
    // Firma tabelası
    const sign = new THREE.Mesh(new RoundedBoxGeometry(38, 3.2, 0.3, 2, 0.1).translate(hx0 - HX + 40, HH - 2.4, fz + 0.3), K.orange);
    // Yard çizgileri: park yerleri
    const marks = [];
    for (let k = 0; k < 26; k++) marks.push(new THREE.PlaneGeometry(0.15, 7.5).rotateX(-Math.PI / 2).translate(-100 + k * 3.4 * 2, 0.33, 150));
    for (let k = 0; k < 19; k++) marks.push(new THREE.PlaneGeometry(0.2, 18).rotateX(-Math.PI / 2).translate(hx0 - HX + 10.2 + k * 11.6, 0.33, fz + 16));
    const markM = new THREE.Mesh(merge(marks), G.paint); markM.userData.noAO = true;
    depot.add(slab, lawn, yard, hall, parapet, dock, canopy, doorM, sealM, skyM, acM, pvM, sign, markM);
    for (const o of depot.children) { o.castShadow = o.receiveShadow = true; o.userData.noFit = o === slab || o === lawn || o === yard; }
    // İdari bina (cephe kiti)
    const b = buildingBatch();
    b.add({ x: hx0 - HX - 26, z: hz0 + 20, w: 60, d: 24, rot: -Math.PI / 2, h: 3.9 + 3 * 3.6 + 1, floorH: 3.6, bay: 3.0, style: 1, color: 0xa7b0b5, seed: 0.37, shop: false, roof: 'flat' });
    depot.add(b.build(() => true));
    // Parktaki kamyonetler (örneklenmiş)
    const spots = [];
    for (let k = 0; k < 25; k++) if (k % 5 !== 2) spots.push([-100 + 3.4 + k * 6.8, 150, -Math.PI / 2]);
    for (let k = 0; k < 18; k++) if (k % 3 === 0) spots.push([hx0 - HX + 16 + k * 11.6, fz + 4.5, -Math.PI / 2]);
    const orange = mats().orange;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    for (const [geo, m] of vanParts(orange)) {
      const im = new THREE.InstancedMesh(geo, m, spots.length);
      spots.forEach((s, i) => { q.setFromAxisAngle(up, s[2]); im.setMatrixAt(i, m4.compose(v.set(s[0], 0.3, s[1]), q, one)); });
      im.castShadow = im.receiveShadow = true;
      depot.add(im);
    }
    // İnsanlar (motor figürleri, @core crowd): rampada kamyonet yükleyen hi-vis yelekli işçiler, avluda yürüyen ve
    // konuşan personel, depo adasının kaldırımında yürüyenler. Rota modeline katılmazlar.
    {
      const rr = cityRng(29), YB = 0.31;                       // avlu asfaltının üst kotu
      const P = [];                                            // { x, z, yaw, pose, outfit } ya da { seg / loop, v }
      spots.forEach(([x, z], i) => { if (z > 100 || (LOW && i % 2)) return;   // rampadaki kamyonetler: arkada yükleyen, yanında bekleyen
        P.push({ x: x - 1.7, z: fz + 1.5, yaw: Math.PI, pose: 'work', outfit: 'worker' });
        P.push({ x: x + 2.1, z: z - 0.8, yaw: -Math.PI / 2 + (rr() - 0.5) * 0.6, pose: 'stand', outfit: 'worker' }); });
      for (let k = 0; k < (LOW ? 3 : 6); k++) P.push({ seg: [hx0 - HX + 14, hx0 + HX - 14], z: fz + 11 + rr() * 5, s: rr(), v: 1.1 + rr() * 0.4, outfit: k % 3 ? 'worker' : 'office' });
      P.push({ x: -96, z: 58, yaw: 0.9, pose: 'stand', outfit: 'office' }, { x: -95, z: 59.2, yaw: -2.3, pose: 'stand', outfit: 'worker' });
      const Yw = Y - 2.5;
      for (let k = 0, n = LOW ? 4 : 10; k < n; k++) P.push({ loop: Yw - rr() * 0.6, s: (k + rr() * 0.5) / n, v: 1.0 + rr() * 0.5, dir: k % 2 ? 1 : -1 });
      const c = crowd(P.length, { seed: 13, camera: sim.camera, outfits: { casual: 5, office: 3, student: 1 } });
      P.forEach((p, i) => { if (p.outfit) c.dress(i, { outfit: p.outfit, seed: i * 31 + 7 }); if (p.pose) c.set(i, p.x, YB, p.z, p.yaw, p.pose); p.yawS = 0; });
      depot.add(c.group);
      let last = performance.now();
      folkTick = () => {
        const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
        P.forEach((p, i) => {
          let x, z, dx, dz, y = YB;
          if (p.seg) {   // avlu boyunca git-gel
            const [a, b] = p.seg, L = b - a; p.s += (p.v * dt) / L;
            const u = p.s % 2, fw = u < 1; x = a + (fw ? u : 2 - u) * L; z = p.z; dx = fw ? 1 : -1; dz = 0;
          } else if (p.loop) {   // ada kaldırımı (kare halka)
            const h = p.loop, L = 8 * h; p.s += (p.dir * p.v * dt) / L;
            let q = (((p.s % 1) + 1) % 1) * L;
            if (q < 2 * h) { x = -h + q; z = -h; dx = 1; dz = 0; } else if ((q -= 2 * h) < 2 * h) { x = h; z = -h + q; dx = 0; dz = 1; }
            else if ((q -= 2 * h) < 2 * h) { x = h - q; z = h; dx = -1; dz = 0; } else { q -= 2 * h; x = -h; z = h - q; dx = 0; dz = -1; }
            dx *= p.dir; dz *= p.dir; y = 0.2;
          } else return;
          let d = Math.atan2(dx, dz) - p.yawS; d = Math.atan2(Math.sin(d), Math.cos(d));
          p.yawS += d * Math.min(1, dt * 6);
          c.set(i, x, y, z, p.yawS, 'walk');
        });
        c.update(now / 1000);
      };
      folkTick();
    }
    // Ada kenarında ağaç sırası
    for (let s = -Y + 12; s < Y - 12; s += 14) {
      myTrees.push([DC[0] + s, DC[1] - Y + 5]); myTrees.push([DC[0] + s, DC[1] + Y - 5]);
      myTrees.push([DC[0] - Y + 5, DC[1] + s]); myTrees.push([DC[0] + Y - 5, DC[1] + s]);
    }
    for (let k = 0; k < 40; k++) myTrees.push([DC[0] - 200 + hash(k, 3) * 60, DC[1] - 220 + hash(k, 9) * 110, 0, 1]);
  }
  scene.add(depot);
  let trees = null;
  afterLoad(() => { buildCity(); trees = streetTrees(myTrees, 5, { broad: 0.75, cypress: 0.25 }); scene.add(trees.group); });
  // Sokak lambaları: graf yolları boyunca
  const lampPts = [];
  const lstep = LOW ? 90 : 45;
  for (let gi = 0; gi < GN; gi++) {
    const c = -HALF + gi * SP;
    for (let s = -HALF + 20, k = 0; s < HALF - 20; s += lstep, k++) {
      if (lines.some((l) => Math.abs(l - s) < 14)) continue;
      const side = k % 2 ? 1 : -1;
      if (!inDepot(c + side * (hr + 1.2), s, 3)) lampPts.push([c + side * (hr + 1.1), s, side > 0 ? -Math.PI / 2 : Math.PI / 2]);
      if (!inDepot(s, c + side * (hr + 1.2), 3)) lampPts.push([s, c + side * (hr + 1.1), side > 0 ? Math.PI : 0]);
    }
  }
  const lamps = streetLamps(lampPts);
  scene.add(lamps.group);

  // --- Tıklama hedefi: görünmez düzlem ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF + 3 * SP, 2 * HALF + 3 * SP).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
  ground.position.y = 0.4;
  scene.add(ground);

  // --- Katman: trafik renkleri (graf kenarları üzerinde yarı saydam şerit) ---
  const roadsM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const roads = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), roadsM, edges.length);
  {
    const m4 = new THREE.Matrix4();
    edges.forEach((e, i) => {
      const [ax, az] = nodePos(e.a), [bx, bz] = nodePos(e.b), horiz = az === bz;
      roads.setMatrixAt(i, m4.makeScale(horiz ? SP - 2 * hr - 8 : 2 * hr - 1, 1, horiz ? 2 * hr - 1 : SP - 2 * hr - 8).setPosition((ax + bx) / 2, 0.08, (az + bz) / 2));
      roads.setColorAt(i, new THREE.Color(0x475569));
    });
    roads.userData.noAO = true; roads.renderOrder = 2; roads.raycast = () => {};
    scene.add(roads);
  }

  // --- Trafik: kenar tıkanıklığına göre yoğunlaşan, kenar hızıyla akan otomobiller ---
  const NCAR = LOW ? 420 : 1100;
  const fleet = carFleet(NCAR, { seed: 21 });
  fleet.group.traverse((o) => { if (o.isInstancedMesh) o.userData.noFit = true; });
  scene.add(fleet.group);
  const LU = SP - 2 * hr - 10;
  let cars = [];
  function assignTraffic() {
    const w = edges.map((e) => 0.06 + (e.c || 0) * (e.c || 0) * 3 + (e.c || 0));
    const sum = w.reduce((a, b) => a + b, 0);
    cars = [];
    const r = cityRng(5);
    edges.forEach((e, i) => {
      const n = Math.min(Math.floor(LU / 7.5) * 2, Math.round((NCAR * w[i]) / sum));
      const per = [Math.ceil(n / 2), Math.floor(n / 2)];
      [1, -1].forEach((dir, k) => {
        const m = per[k], ph = r() * LU;
        for (let j = 0; j < m; j++) cars.push({ e, dir, s: (ph + (j + r() * 0.3) * (LU / m)) % LU });
      });
    });
    cars.length = Math.min(cars.length, NCAR);
    for (let i = cars.length; i < NCAR; i++) fleet.hide(i);
    placeCars(0);
  }
  function placeCars(dt) {
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i], e = c.e;
      c.s = (c.s + ((e.v || 30) / 3.6) * dt) % LU;
      const [ax, az] = nodePos(c.dir > 0 ? e.a : e.b), [bx, bz] = nodePos(c.dir > 0 ? e.b : e.a);
      const ux = Math.sign(bx - ax), uz = Math.sign(bz - az);
      const d = hr + 5 + c.s;
      fleet.set(i, ax + ux * d - uz * 1.9, 0.12, az + uz * d + ux * 1.9, Math.atan2(-uz, ux), c.s / 0.32);
    }
    fleet.commit();
  }

  // --- Teslimat işaretçisi (katman): yerden yükselen ışık sütunu + yer halkası ---
  const beamTex = beamTexture(), haloTex = softDiscTexture();
  const beamGeo = new THREE.CylinderGeometry(7, 7, 130, 20, 1, true).translate(0, 65, 0);
  {
    const uv = beamGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5);
  }
  const ringGeo = new THREE.RingGeometry(9, 15, 40).rotateX(-Math.PI / 2);
  function makeMarker(color) {
    const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, alphaMap: beamTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    m.renderOrder = 4;
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    ring.position.y = 0.3; ring.renderOrder = 4;
    ring.onBeforeRender = () => ring.material.color.copy(m.material.color);
    m.add(ring);
    m.userData.noAO = ring.userData.noAO = true;
    return m;
  }

  // --- Rota katmanı: yol üstünde parlayan şerit (HDR çekirdek + yumuşak kenarlı ışıma; uzaktan da okunur) ---
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 64;
    const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgb(0,0,0)'); gr.addColorStop(0.3, 'rgb(70,70,70)'); gr.addColorStop(0.5, 'rgb(255,255,255)'); gr.addColorStop(0.7, 'rgb(70,70,70)'); gr.addColorStop(1, 'rgb(0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 4, 64);
    return new THREE.CanvasTexture(c);
  })();
  const ribbon = (pts, W, y) => {
    const P = [], U = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 0.01) continue;
      const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L, rx = -uz * W / 2, rz = ux * W / 2;
      const ax = a.x - ux * W / 2, az = a.z - uz * W / 2, bx = b.x + ux * W / 2, bz = b.z + uz * W / 2;
      P.push(ax - rx, y, az - rz, bx - rx, y, bz - rz, bx + rx, y, bz + rz, ax - rx, y, az - rz, bx + rx, y, bz + rz, ax + rx, y, az + rz);
      U.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    return g;
  };
  function routeMesh(pts, color) {
    const c = new THREE.Color(color).multiplyScalar(2.4);
    const m = new THREE.Mesh(ribbon(pts, 9, 0.55), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    const glow = new THREE.Mesh(ribbon(pts, 34, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.3), alphaMap: glowTex, transparent: true, opacity: 0.55,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    // Binaların arkasında kalan kesimler için soluk "röntgen" izi (derinlik testi yok) — rota her açıdan okunur
    const xray = new THREE.Mesh(ribbon(pts, 16, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.1), alphaMap: glowTex, transparent: true, opacity: 0.3,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending }));
    m.renderOrder = 3; glow.renderOrder = 2; xray.renderOrder = 5;
    m.add(glow, xray);
    m.userData.noAO = glow.userData.noAO = xray.userData.noAO = true; m.raycast = glow.raycast = xray.raycast = () => {};
    return m;
  }

  return {
    ground, roads, depot, DC, heightAt, haloTex,
    makeVan: (c) => makeVan(c, haloTex), makeMarker, routeMesh, assignTraffic, placeCars,
    update(t) { if (trees) trees.update(t, 0.6); if (veg) veg.update(t, 0.6); folkTick(); },
  };
}
