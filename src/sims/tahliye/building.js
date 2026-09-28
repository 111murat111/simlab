// Kesit bina kiti (yerel yardımcı, metre): eğik kesit düzlemiyle kesilmiş duvarlar (dış cephe taş kaplama, iç yüz ahşap
// lambri + boya, kesit yüzü koyu), sahne donanımı (perde, projeksiyon ekranı, kürsü, basamaklar), halı yolu, yangın
// dolabı, toplanma alanı levhası, bank, eklemli insan parçaları (bacak/kol ayrı: yürüme salınımı) ve ten malzemesi.
import { THREE, mat, procedural, RoundedBoxGeometry, BufferGeometryUtils } from '@core';

const merge = (list) => BufferGeometryUtils.mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
const clean = (g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g.index ? g.toNonIndexed() : g; };

let BM = null;
export function buildingMats() {
  if (BM) return BM;
  BM = {
    facade: procedural({
      key: 'th-facade', params: { color: 0xd6cfc2, roughness: 0.82 }, bump: 0.02,
      pattern: `
        vec3 a = axisDominant(pn); vec2 uv = vec2(a.x > 0.5 ? p.z : p.x, p.y);
        float plinth = step(uv.y, 0.45);
        vec2 q = uv/vec2(1.2, 0.6); q.x += mod(floor(q.y), 2.0)*0.5;
        vec2 f = fract(q), id = floor(q);
        float e = min(min(f.x, 1.0 - f.x)*2.0, min(f.y, 1.0 - f.y));
        float j = smoothstep(0.0, 0.02 + fwidth(e), e);
        float t = h13(vec3(id, 4.0)), n = fbm3(p*1.5, 4), sp = vn3(p*30.0);
        vec3 stone = col*(0.9 + 0.12*t)*(0.88 + 0.2*n + 0.05*sp);
        stone = mix(stone*0.62, stone, j);
        vec3 gran = vec3(0.3, 0.3, 0.31)*(0.8 + 0.3*sp + 0.2*n);
        col = mix(stone, gran, plinth);
        col *= 1.0 - 0.18*smoothstep(0.6, 0.0, uv.y)*(1.0 - plinth)*n;
        rough = mix(mix(0.9, 0.78, j), 0.45, plinth); h = j*0.7 + n*0.3;`,
    }),
    interior: procedural({
      key: 'th-interior', params: { color: 0xece6da, roughness: 0.9 }, bump: 0.01,
      pattern: `
        vec3 a = axisDominant(pn); float u = a.x > 0.5 ? p.z : p.x;
        float wain = step(p.y, 1.1), rail = step(1.1, p.y)*step(p.y, 1.16);
        float board = abs(fract(u/0.14) - 0.5)*2.0;
        float gr = fbm3(vec3(u*3.0, p.y*40.0, 0.0), 3);
        float fw = fwidth(u/0.14)*2.0, seam = smoothstep(0.9 - fw, 1.0, board)*(1.0 - smoothstep(0.3, 0.6, fw));
        vec3 wood = vec3(0.5, 0.32, 0.18)*(0.75 + 0.35*gr)*(1.0 - 0.3*seam);
        float n = fbm3(p*1.2, 4);
        vec3 paint = col*(0.93 + 0.08*n);
        col = mix(paint, wood, wain); col = mix(col, vec3(0.36, 0.23, 0.13), rail);
        rough = mix(0.9, 0.45, max(wain, rail)); h = wain*(1.0 - seam)*0.4 + rail;`,
    }),
    poche: mat.concrete({ color: 0x55575b, stains: 0.1, scale: 2 }),
    velvet: procedural({
      key: 'th-velvet', params: { color: 0x7a0f18, roughness: 0.8, side: THREE.DoubleSide }, bump: 0.01,
      pattern: `float n = fbm3(p*6.0, 3); col *= 0.85 + 0.2*n; h = n;`,
    }),
    carpet: procedural({
      key: 'th-carpet', params: { color: 0x6e1c22, roughness: 0.95 }, bump: 0.01,
      pattern: `float n = fbm3(p*3.0, 3), l = vn3(p*120.0); float b = step(0.08, abs(fract(p.x/2.4) - 0.5)*2.4); col *= (0.8 + 0.25*n + 0.1*l); col = mix(col*0.55, col, b); h = l;`,
    }),
    black: mat.fabric({ color: 0x151517 }),
    slab: procedural({
      key: 'th-slab', params: { color: 0xb4aea4, roughness: 0.85 }, bump: 0.015,
      pattern: `
        vec2 uv = p.xz/vec2(0.9, 0.6); uv.x += mod(floor(uv.y), 2.0)*0.5;
        vec2 f = fract(uv), id = floor(uv);
        float fw = max(fwidth(uv.x), fwidth(uv.y)), fade = 1.0 - smoothstep(0.06, 0.25, fw);
        float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
        float j = smoothstep(0.0, 0.025 + fw, e);
        float t = h13(vec3(id, 7.0)), n = fbm3(p*0.4, 4), g = vn3(p*25.0);
        col *= (0.93 + 0.1*t*fade)*(0.86 + 0.2*n)*(0.96 + 0.06*g);
        col *= mix(1.0, mix(0.72, 1.0, j), fade);
        rough = mix(0.95, 0.82, j); h = mix(1.0, j, fade)*0.7 + g*0.3;`,
    }),
    wood: mat.wood({ color: 0x8a5a33, varnish: true, ring: 22 }),
    steel: mat.brushedMetal({ color: 0xbfc4c9, rough: 0.28 }),
    red: mat.paintedMetal({ color: 0xb3151b, wear: 0.05 }),
    pole: mat.paintedMetal({ color: 0x3f454b, wear: 0.15 }),
    benchWood: mat.wood({ color: 0x9a6b3f, ring: 12 }),
    skin: procedural({
      key: 'th-skin', params: { color: 0xffffff, vertexColors: true, roughness: 0.55 }, bump: 0.004,
      pattern: `float n = fbm3(p*18.0, 3); col *= 0.93 + 0.1*n; h = n;`,
    }),
    cloth: procedural({
      key: 'th-cloth', params: { color: 0xffffff, vertexColors: true, roughness: 0.88 }, bump: 0.01,
      pattern: `float n = fbm3(p*7.0, 3), w = vn3(p*90.0); col *= 0.84 + 0.2*n + 0.06*w; h = n*0.6 + w*0.4;`,
    }),
  };
  return BM;
}

/**
 * Duvar dikdörtgenleri → kesit geometri. rects: [x0, z0, x1, z1, y0?]; cut(x, z) → üst kot; isOut(x, z) → nokta binanın
 * dışında mı (dış cephe yüzünü seçmek için). Döner { ext, int, top } BufferGeometry.
 */
export function cutawayWalls(rects, cut, isOut) {
  const E = [[], []], I = [[], []], TP = [[], []];
  const tri = (out, v, n) => { for (const p of v) { out[0].push(p[0], p[1], p[2]); out[1].push(n[0], n[1], n[2]); } };
  const quad = (out, a, b, c, d, n) => tri(out, [a, b, c, a, c, d], n);
  const face = (a, b, c, d, n) => {
    const cx = (a[0] + b[0]) / 2 + n[0] * 0.3, cz = (a[2] + b[2]) / 2 + n[2] * 0.3;
    quad(isOut(cx, cz) ? E : I, a, b, c, d, n);
  };
  for (const [x0, z0, x1, z1, y0 = 0] of rects) {
    const hA = cut(x0, z0), hB = cut(x1, z0), hC = cut(x1, z1), hD = cut(x0, z1);
    if (Math.max(hA, hB, hC, hD) <= y0 + 0.01) continue;
    face([x0, y0, z1], [x1, y0, z1], [x1, hC, z1], [x0, hD, z1], [0, 0, 1]);
    face([x1, y0, z0], [x0, y0, z0], [x0, hA, z0], [x1, hB, z0], [0, 0, -1]);
    face([x1, y0, z1], [x1, y0, z0], [x1, hB, z0], [x1, hC, z1], [1, 0, 0]);
    face([x0, y0, z0], [x0, y0, z1], [x0, hD, z1], [x0, hA, z0], [-1, 0, 0]);
    const u = new THREE.Vector3(x1 - x0, hC - hD, 0), v = new THREE.Vector3(0, hA - hD, z0 - z1);
    const n = u.clone().cross(v).normalize(); if (n.y < 0) n.negate();
    quad(TP, [x0, hD, z1], [x1, hC, z1], [x1, hB, z0], [x0, hA, z0], [n.x, n.y, n.z]);
    if (y0 > 0) quad(I, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
  }
  const mk = (a) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a[0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(a[1], 3)); g.computeBoundingSphere(); return g; };
  return { ext: mk(E), int: mk(I), top: mk(TP) };
}
/** Satır dikdörtgenlerini aynı x aralığına sahip ardışık satırlarda dikey olarak birleştirir */
export function mergeRuns(rects) {
  const key = (r) => r[0].toFixed(3) + ':' + r[2].toFixed(3);
  const open = new Map(), out = [];
  rects.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const r of rects) {
    const k = key(r), o = open.get(k);
    if (o && Math.abs(o[3] - r[1]) < 1e-4) o[3] = r[3];
    else { const n = r.slice(); open.set(k, n); out.push(n); }
  }
  return out;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Konferans sahnesi: ahşap platform, siyah etek, çelik burun, yan basamaklar, pileli kadife perde + saçak, ekran, kürsü */
export function stageSet(x1, z1, x2, z2, top = 0.9) {
  const K = buildingMats(), g = new THREE.Group();
  const w = x2 - x1, d = z2 - z1, cx = (x1 + x2) / 2;
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  add(new RoundedBoxGeometry(w, top, d, 2, 0.02), K.wood, cx, top / 2, (z1 + z2) / 2);
  add(new RoundedBoxGeometry(w + 0.02, top - 0.08, 0.03, 1, 0.01), K.black, cx, (top - 0.08) / 2, z2 + 0.01);
  add(new RoundedBoxGeometry(w + 0.04, 0.05, 0.08, 1, 0.015), K.steel, cx, top - 0.02, z2);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const h = top * (k + 1) / 5;
    add(new RoundedBoxGeometry(1.2, h, 0.3, 1, 0.02), K.wood, cx + s * (w / 2 - 0.9), h / 2, z2 + 0.15 + (3 - k) * 0.3);
  }
  // Pileli perde (kıvrımlar sinüs ile), üstte saçak
  const ph = 3.0, pg = new THREE.PlaneGeometry(w * 0.96, ph, 160, 1), pp = pg.attributes.position;
  for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin(pp.getX(i) * 9.0) * 0.07 + Math.sin(pp.getX(i) * 2.3) * 0.03);
  pg.computeVertexNormals();
  add(pg, K.velvet, cx, top + ph / 2, z1 + 0.25);
  const vg = new THREE.PlaneGeometry(w * 1.0, 0.5, 200, 1), vp = vg.attributes.position;
  for (let i = 0; i < vp.count; i++) vp.setZ(i, Math.sin(vp.getX(i) * 14.0) * 0.04);
  vg.computeVertexNormals();
  add(vg, K.velvet, cx, top + ph - 0.2, z1 + 0.45);
  // Projeksiyon ekranı (ışıklı slayt)
  const tex = canvasTex(1024, 576, (c, W, H) => {
    const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#f4f7fb'); gr.addColorStop(1, '#dfe7f1');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.fillStyle = '#b91c1c'; c.fillRect(0, 0, W, 90);
    c.fillStyle = '#fff'; c.font = '800 54px system-ui, sans-serif'; c.textBaseline = 'middle'; c.fillText('ACİL DURUM TATBİKATI', 40, 47);
    c.fillStyle = '#1f2937'; c.font = '600 40px system-ui, sans-serif';
    ['• En yakın çıkışa yürüyün, koşmayın', '• Asansör kullanmayın', '• Toplanma alanında bekleyin'].forEach((t, i) => c.fillText(t, 50, 190 + i * 80));
    c.fillStyle = '#16a34a'; c.fillRect(W - 250, H - 140, 210, 100); c.fillStyle = '#fff'; c.font = '800 44px system-ui'; c.fillText('ÇIKIŞ', W - 208, H - 90);
  });
  const sw = Math.min(4.6, w * 0.4), sh = sw * 0.5625;
  add(new THREE.PlaneGeometry(sw, sh), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.25, roughness: 0.5 }), cx, top + 0.7 + sh / 2, z1 + 0.5);
  add(new RoundedBoxGeometry(sw + 0.12, 0.12, 0.12, 2, 0.04), K.pole, cx, top + 0.7 + sh + 0.06, z1 + 0.5);
  // Kürsü + mikrofon
  const lec = new THREE.Group();
  const lg = new THREE.Shape([[-0.32, 0], [0.32, 0], [0.36, 1.05], [-0.36, 1.05]].map(([a, b]) => new THREE.Vector2(a, b)));
  const lgeo = new THREE.ExtrudeGeometry(lg, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }).translate(0, 0, -0.225);
  lec.add(new THREE.Mesh(lgeo, K.wood));
  const topS = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.04, 0.55, 2, 0.015), K.wood); topS.position.set(0, 1.1, 0.02); topS.rotation.x = 0.25; lec.add(topS);
  const mic = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.15, 1.1, -0.1), new THREE.Vector3(0.15, 1.45, -0.05), new THREE.Vector3(0.1, 1.42, 0.15)), 12, 0.006, 6), K.pole);
  lec.add(mic);
  lec.position.set(cx + w * 0.3, top, (z1 + z2) / 2 + 0.3);
  g.add(lec);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.raycast = () => {}; } });
  return g;
}

/** Duvara asılı yangın dolabı: kırmızı kutu, camlı kapak, içinde söndürücü */
export function fireCabinet() {
  const K = buildingMats(), g = new THREE.Group();
  const b = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.75, 0.2, 2, 0.02), K.red); b.position.set(0, 1.3, 0.1); g.add(b);
  const ext = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.08, 0], [0.085, 0.02], [0.085, 0.46], [0.06, 0.52], [0.02, 0.55], [0, 0.55]].map(([x, y]) => new THREE.Vector2(x, y)), 20), K.red);
  ext.position.set(0, 1.0, 0.24); g.add(ext);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ roughness: 0.5, map: canvasTex(128, 128, (c) => { c.fillStyle = '#c1121f'; c.fillRect(0, 0, 128, 128); c.fillStyle = '#fff'; c.font = '800 22px system-ui'; c.textAlign = 'center'; c.fillText('YANGIN', 64, 56); c.fillText('DOLABI', 64, 86); }) }));
  sign.position.set(0, 1.95, 0.01); g.add(sign);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.raycast = () => {}; } });
  return g;
}

/** Toplanma alanı levhası (yeşil zemin, dört yönden oklar ve insan simgesi) — iki direkli */
export function assemblySign() {
  const K = buildingMats(), g = new THREE.Group();
  const tex = canvasTex(512, 640, (c, W, H) => {
    c.fillStyle = '#0f8a3c'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#fff'; c.lineWidth = 12; c.strokeRect(14, 14, W - 28, H - 28);
    const cx = W / 2, cy = 230;
    c.fillStyle = '#fff';
    for (let k = 0; k < 4; k++) {
      c.save(); c.translate(cx, cy); c.rotate(k * Math.PI / 2);
      c.beginPath(); c.moveTo(0, -60); c.lineTo(-40, -110); c.lineTo(-14, -110); c.lineTo(-14, -170); c.lineTo(14, -170); c.lineTo(14, -110); c.lineTo(40, -110); c.closePath(); c.fill(); c.restore();
    }
    for (const [dx, s] of [[-22, 0.8], [22, 0.8], [0, 1]]) { c.beginPath(); c.arc(cx + dx, cy - 22 * s, 11 * s, 0, 7); c.fill(); c.fillRect(cx + dx - 11 * s, cy - 8 * s, 22 * s, 40 * s); }
    c.font = '800 64px system-ui, sans-serif'; c.textAlign = 'center';
    c.fillText('TOPLANMA', cx, 480); c.fillText('ALANI', cx, 555);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.25), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, side: THREE.DoubleSide }));
  board.position.y = 2.35; g.add(board);
  const back = new THREE.Mesh(new RoundedBoxGeometry(1.04, 1.29, 0.03, 1, 0.01), K.steel); back.position.set(0, 2.35, -0.02); g.add(back);
  for (const s of [-0.42, 0.42]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 3.0, 12), K.pole); p.position.set(s, 1.5, -0.05); g.add(p); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.raycast = () => {}; } });
  return g;
}

/** Park bankı: dökme ayaklar + ahşap çıtalar (m) */
export function bench() {
  const K = buildingMats(), g = new THREE.Group();
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.035, 0.1, 1, 0.012), K.benchWood); s.position.set(0, 0.45, -0.18 + i * 0.12); g.add(s); }
  for (let i = 0; i < 2; i++) { const s = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.1, 0.035, 1, 0.012), K.benchWood); s.position.set(0, 0.62 + i * 0.13, -0.26); s.rotation.x = -0.15; g.add(s); }
  for (const x of [-0.75, 0.75]) {
    const leg = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.45, 0.5, 1, 0.02), K.pole); leg.position.set(x, 0.225, -0.02); g.add(leg);
    const bk = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.4, 0.05, 1, 0.02), K.pole); bk.position.set(x, 0.65, -0.28); g.add(bk);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.raycast = () => {}; } });
  return g;
}

/**
 * Eklemli insan (yükseklik ≈ 1,72 m, +z yüzü). Parçalar: legL, legR (kalça ekseni y = HIP), armL, armR (omuz ekseni y = SHO),
 * body (gövde + boyun + kalça), head (yüz + saç). Hepsi 'color' özniteliği taşır (ayakkabı/saç koyu, kalan beyaz → örnek rengi).
 */
export const HIP = 0.9, SHO = 1.38;
export function humanParts2() {
  const paint = (g, c) => { g = clean(g); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const W1 = new THREE.Color(1, 1, 1), SHOE = new THREE.Color(0.09, 0.08, 0.08), HAIR = new THREE.Color(0.14, 0.1, 0.08), HAND = new THREE.Color(0.95, 0.78, 0.66);
  const cap = (r, l, x, y, z, rz = 0) => new THREE.CapsuleGeometry(r, l, 2, 7).rotateZ(rz).translate(x, y, z);
  const leg = (s) => merge([
    paint(cap(0.074, 0.36, s * 0.09, 0.66, 0, 0), W1),           // uyluk
    paint(cap(0.058, 0.36, s * 0.092, 0.27, 0, 0), W1),          // baldır
    paint(new RoundedBoxGeometry(0.1, 0.075, 0.26, 1, 0.03).translate(s * 0.092, 0.038, 0.045), SHOE),
  ]);
  const arm = (s) => merge([
    paint(cap(0.05, 0.26, s * 0.215, 1.22, 0, s * -0.06), W1),
    paint(cap(0.042, 0.24, s * 0.235, 0.93, 0.02, s * -0.04), W1),
    paint(new THREE.SphereGeometry(0.045, 6, 4).scale(0.8, 1.2, 0.6).translate(s * 0.245, 0.76, 0.03), HAND),
  ]);
  const body = merge([
    paint(new THREE.CapsuleGeometry(0.16, 0.32, 3, 11).scale(1, 1, 0.64).translate(0, 1.2, 0), W1),
    paint(new THREE.CapsuleGeometry(0.14, 0.06, 2, 9).scale(1.05, 1, 0.72).translate(0, 0.93, 0), W1),
  ]);
  const head = merge([
    paint(new THREE.SphereGeometry(0.1, 11, 8).scale(0.88, 1.1, 0.98).translate(0, 1.61, 0.005), W1),
    paint(new THREE.CylinderGeometry(0.043, 0.05, 0.12, 7, 1, true).translate(0, 1.47, 0), W1),
    paint(new THREE.SphereGeometry(0.106, 11, 5, 0, Math.PI * 2, 0, Math.PI * 0.56).scale(0.92, 1.06, 1.04).translate(0, 1.628, -0.012), HAIR),
  ]);
  return { legL: leg(-1), legR: leg(1), armL: arm(-1), armR: arm(1), body, head };
}

/** Zemin boyası: toplanma alanı yazısı (yeşil zemin, beyaz yazı + simge), düzlem yere yatık (m) */
export function zoneDecal(w, d) {
  const tex = canvasTex(1024, Math.round(1024 * d / w), (c, W, H) => {
    c.fillStyle = 'rgba(22,128,60,0.55)'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#f4f4ef'; c.lineWidth = W * 0.012; c.strokeRect(W * 0.01, W * 0.01, W - W * 0.02, H - W * 0.02);
    c.fillStyle = 'rgba(244,244,239,0.92)'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 ${Math.round(H * 0.2)}px system-ui, sans-serif`;
    c.fillText('TOPLANMA ALANI', W / 2, H * 0.5);
  });
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.receiveShadow = true; m.userData.noAO = true; m.raycast = () => {};
  return m;
}
/** Yere boyalı yeşil yön okları (kaçış güzergâhı), örneklenmiş; set(i, x, z, yön) + commit() */
export function routeArrows(n) {
  const tex = canvasTex(256, 256, (c) => {
    c.fillStyle = '#1f9d4f'; c.strokeStyle = '#f4f4ef'; c.lineWidth = 14; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(128, 20); c.lineTo(228, 140); c.lineTo(168, 140); c.lineTo(168, 236); c.lineTo(88, 236); c.lineTo(88, 140); c.lineTo(28, 140); c.closePath();
    c.fill(); c.stroke();
  });
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2).rotateY(Math.PI), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }), n);
  im.count = 0; im.receiveShadow = true; im.userData.noAO = true; im.raycast = () => {};
  const o = new THREE.Object3D();
  return {
    mesh: im,
    set(i, x, z, dir) { o.position.set(x, 0.008, z); o.rotation.set(0, dir, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.count = Math.max(im.count, i + 1); },
    reset() { im.count = 0; },
    commit() { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); },
  };
}
