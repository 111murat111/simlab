// Yerel yardımcılar (karbon-evi): gerçek ölçekli ev eşyaları ve çevre nesneleri (radyatör, bisiklet, otobüs, yolcu uçağı,
// çöp kutuları, çöp poşetleri, güneş paneli, sıva / fayans / PV hücre malzemeleri). +x = ileri (araçlarda).
import { THREE, mat, procedural, RoundedBoxGeometry, BufferGeometryUtils } from '@core';

export const plaster = (color = 0xf1e4cf) => procedural({
  key: 'plaster', params: { color, roughness: 0.9 }, bump: 0.015,
  pattern: `float n = fbm3(p*3.0, 4); col *= 0.9 + 0.13*n;
    col = mix(col, col*vec3(0.86, 0.84, 0.8), 0.3*smoothstep(0.62, 0.85, fbm3(p*0.45 + 2.0, 3)));
    rough = 0.85 + 0.1*n; h = n;`,
});
export const tiles = (color = 0xdfe3e6, size = 0.3) => procedural({
  key: 'tiles', params: { color, roughness: 0.3 }, bump: 0.02, uniforms: { tSize: { value: size } },
  pattern: `vec3 a = axisDominant(pn);
    vec2 uv = (a.y > 0.5 ? p.xz : (a.x > 0.5 ? p.zy : p.xy))/tSize;
    vec2 f = fract(uv), id = floor(uv);
    float m = smoothstep(0.0, 0.025, min(f.x, 1.0 - f.x))*smoothstep(0.0, 0.025, min(f.y, 1.0 - f.y));
    float t = h13(vec3(id, 1.0));
    col *= mix(0.6, 0.93 + 0.1*t, m); rough = mix(0.85, 0.12, m); h = m;`,
});
/** Lamine parke: 14 cm × ~1 m tahtalar, şaşırtmalı derzler, tahta başına ton farkı, lif dokusu, vernik (üst yüz xz). */
export const parquet = (color = 0xb27d4c) => procedural({
  key: 'parquet', physical: true, params: { color, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.22 }, bump: 0.015,
  pattern: `vec2 uv = p.xz;
    float w = 0.14, L = 0.98, row = floor(uv.y/w);
    float u = uv.x/L + h13(vec3(row, 1.0, 7.0)), id = floor(u);
    vec2 f = vec2(fract(u)*L, fract(uv.y/w)*w);
    float seam = smoothstep(0.0, 0.004, min(f.x, L - f.x))*smoothstep(0.0, 0.004, min(f.y, w - f.y));
    float t = h13(vec3(id, row, 2.0));
    float grain = vn3(vec3(uv.x*4.0 + t*20.0, uv.y*160.0, row));
    float fig = fbm3(vec3(uv.x*1.5, uv.y*18.0, t*9.0), 3);
    col *= (0.74 + 0.38*t)*(0.86 + 0.16*grain + 0.1*fig);
    col = mix(col*0.35, col, seam);
    rough = mix(0.8, rough, seam); h = seam*0.7 + grain*0.3;`,
});
export const pvMat = () => procedural({
  key: 'pv-cells', params: { color: 0x0b1628, roughness: 0.1, metalness: 0.3 }, bump: 0.01,
  pattern: `vec3 a = axisDominant(pn);
    if (a.y > 0.5 && pn.y > 0.0) {
      vec2 uv = p.xz*vec2(6.0/1.55, 10.0/1.7) + vec2(3.0, 5.0);
      vec2 f = fract(uv);
      float gap = smoothstep(0.0, 0.05, min(f.x, 1.0 - f.x))*smoothstep(0.0, 0.05, min(f.y, 1.0 - f.y));
      float edge = step(0.035, min(min(p.x + 0.775, 0.775 - p.x), min(p.z + 0.85, 0.85 - p.z)));
      float bus = max(step(abs(f.x - 0.33), 0.012), step(abs(f.x - 0.66), 0.012));
      col = mix(vec3(0.78, 0.8, 0.83), vec3(0.025, 0.05, 0.12)*(0.85 + 0.3*h13(vec3(floor(uv), 3.0))), gap);
      col = mix(col, vec3(0.55, 0.57, 0.6), bus*gap);
      col = mix(vec3(0.72, 0.74, 0.77), col, edge);
      rough = mix(0.35, 0.06, gap*edge); metal = mix(0.85, 0.25, edge); h = gap;
    } else { col = vec3(0.7, 0.72, 0.75); rough = 0.35; metal = 0.9; }`,
});

const clean = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; };
export const merge = (list) => BufferGeometryUtils.mergeGeometries(list.map(clean));

/** Panel radyatör (genişlik w): dilimler + üst/alt kollektör + vanalar. Duvara paralel (x ekseni boyunca), arka yüz −z. */
export function radiatorGeo(w = 1.4, h = 0.7) {
  const parts = [];
  const n = Math.round(w / 0.1);
  for (let k = 0; k < n; k++) parts.push(new RoundedBoxGeometry(0.075, h, 0.1, 1, 0.025).translate(-w / 2 + 0.05 + k * (w - 0.1) / (n - 1), 0, 0));
  for (const y of [-h / 2 + 0.05, h / 2 - 0.05]) parts.push(new THREE.CylinderGeometry(0.025, 0.025, w + 0.06, 10).rotateZ(Math.PI / 2).translate(0, y, 0));
  return merge(parts);
}

/** Bisiklet (gerçek ölçek ~1,75 m), +x ileri. */
export function bicycle(color = 0x2563eb) {
  const g = new THREE.Group();
  const frameM = mat.paintedMetal({ color, wear: 0.1 }), tyreM = mat.rubber({ color: 0x151515 }), steel = mat.brushedMetal({ color: 0xc7cbd0, rough: 0.2 });
  const R = 0.34;
  const wheels = [];
  for (const x of [-0.53, 0.53]) {
    const w = new THREE.Group();
    w.add(new THREE.Mesh(new THREE.TorusGeometry(R, 0.022, 10, 36), tyreM));
    w.add(new THREE.Mesh(new THREE.TorusGeometry(R - 0.03, 0.009, 6, 36), steel));
    const sp = [];
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; sp.push(new THREE.CylinderGeometry(0.0025, 0.0025, R - 0.04, 4).translate(0, (R - 0.04) / 2, 0).rotateZ(a)); }
    w.add(new THREE.Mesh(merge(sp), steel), new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 10).rotateX(Math.PI / 2), steel));
    w.position.set(x, R + 0.022, 0);
    g.add(w); wheels.push(w);
  }
  const V = (x, y) => new THREE.Vector3(x, y, 0);
  const tube = (a, b, r = 0.018) => new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, r, 8);
  const BB = V(0, 0.33), ST = V(-0.12, 0.86), HT = V(0.4, 0.84), HB = V(0.44, 0.7), RA = V(-0.53, 0.36), FA = V(0.53, 0.36);
  const fr = [tube(BB, ST), tube(ST, HT), tube(BB, HB, 0.021), tube(BB, RA, 0.012), tube(ST, RA, 0.012), tube(HB, FA, 0.015), tube(HT, HB, 0.024)];
  g.add(new THREE.Mesh(merge(fr), frameM));
  g.add(new THREE.Mesh(merge([tube(V(0.4, 0.84), V(0.36, 0.98), 0.012), new THREE.CylinderGeometry(0.012, 0.012, 0.56, 8).rotateX(Math.PI / 2).translate(0.36, 0.98, 0)]), steel));
  const grip = mat.rubber({ color: 0x222222 });
  for (const s of [-1, 1]) { const o = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.11, 8).rotateX(Math.PI / 2), grip); o.position.set(0.36, 0.98, s * 0.24); g.add(o); }
  const seat = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.05, 0.14, 2, 0.02), mat.plastic({ color: 0x1b1b1b, gloss: 0.3 }));
  seat.position.set(-0.15, 0.95, 0); g.add(seat);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 8).translate(-0.13, 0.9, 0), steel));
  const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.015, 20).rotateX(Math.PI / 2).translate(0, 0.33, 0.05), steel);
  g.add(crank);
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  g.userData.wheels = wheels;
  return g;
}

/** Şehir otobüsü (12 m, gerçek ölçek), +x ileri. */
export function cityBus(color = 0x2563eb) {
  const g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.08 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf1f3f4, roughness: 0.3, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1218, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
  const trim = mat.plastic({ color: 0x1d1f22, gloss: 0.2 });
  const add = (geo, m, x, y, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  add(new RoundedBoxGeometry(12, 2.4, 2.55, 4, 0.18), white, 0, 1.75, 0);
  add(new RoundedBoxGeometry(11.6, 0.55, 2.57, 2, 0.1), paint, 0, 0.75, 0);                 // alt bant
  add(new RoundedBoxGeometry(11.4, 1.05, 2.58, 2, 0.06), glass, -0.2, 2.15, 0);             // yan camlar
  add(new RoundedBoxGeometry(0.1, 1.5, 2.3, 2, 0.05), glass, 5.97, 1.95, 0);                // ön cam
  add(new RoundedBoxGeometry(0.1, 0.9, 2.2, 2, 0.05), glass, -5.97, 2.25, 0);               // arka cam
  add(new RoundedBoxGeometry(11.2, 0.25, 2.2, 2, 0.08), white, -0.2, 3.05, 0);               // tavan kutuları
  add(new RoundedBoxGeometry(2.4, 0.35, 1.8, 2, 0.1), white, -3.5, 3.3, 0);                  // klima ünitesi
  const disp = mat.glow({ color: 0xffa726, intensity: 1.6 });
  add(new RoundedBoxGeometry(0.06, 0.26, 1.6, 1, 0.02), disp, 6.0, 2.82, 0);
  for (const x of [3.6, -1.0]) add(new RoundedBoxGeometry(1.25, 2.2, 0.05, 2, 0.02), glass, x, 1.6, 1.29); // kapılar (sağ taraf, +z)
  add(new RoundedBoxGeometry(0.2, 0.45, 2.6, 2, 0.08), trim, 5.95, 0.6, 0);
  add(new RoundedBoxGeometry(0.2, 0.45, 2.6, 2, 0.08), trim, -5.95, 0.6, 0);
  const head = mat.glow({ color: 0xfff4dc, intensity: 2 }), tail = mat.glow({ color: 0xff2a1a, intensity: 1.4 });
  for (const z of [-0.95, 0.95]) { add(new RoundedBoxGeometry(0.08, 0.16, 0.36, 1, 0.04), head, 6.02, 0.95, z); add(new RoundedBoxGeometry(0.08, 0.36, 0.14, 1, 0.04), tail, -6.02, 1.1, z); }
  const tyre = mat.rubber({ color: 0x18191b }), rim = mat.brushedMetal({ color: 0xbfc3c8, rough: 0.3 });
  const tg = new THREE.CylinderGeometry(0.5, 0.5, 0.32, 24).rotateX(Math.PI / 2), rg = new THREE.CylinderGeometry(0.3, 0.3, 0.34, 20).rotateX(Math.PI / 2);
  for (const x of [3.9, -2.4]) for (const z of [-1.1, 1.1]) { add(tg, tyre, x, 0.5, z); add(rg, rim, x, 0.5, z); }
  return g;
}

/** Yolcu uçağı (≈38 m, dar gövde), +x ileri. */
export function airliner(tailColor = 0xdc2626) {
  const g = new THREE.Group();
  const white = mat.paintedMetal({ color: 0xf2f4f6, wear: 0.05 }), grey = mat.brushedMetal({ color: 0xaeb4ba, rough: 0.3 });
  const tailM = mat.paintedMetal({ color: tailColor, wear: 0.05 });
  const L = 37.5, R = 1.98;
  const prof = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, x = -L / 2 + t * L;
    let r = R;
    if (t < 0.12) r = R * Math.sqrt(t / 0.12) * 0.98 + 0.02;            // burun
    if (t > 0.72) r = R * (1 - Math.pow((t - 0.72) / 0.28, 1.6) * 0.85);  // kuyruk konisi
    prof.push(new THREE.Vector2(Math.max(0.02, r), x));
  }
  const fus = new THREE.LatheGeometry(prof, 28).rotateZ(Math.PI / 2);
  g.add(new THREE.Mesh(fus, white));
  const wing = (span, root, tip, sweep, th) => {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(-sweep, span); s.lineTo(-sweep - tip, span); s.lineTo(-root, 0); s.lineTo(0, 0);
    return new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: true, bevelThickness: th * 0.4, bevelSize: th * 0.4, bevelSegments: 2 });
  };
  for (const sd of [-1, 1]) {
    const w = new THREE.Mesh(wing(16.5, 6.2, 1.6, 6.5, 0.22), white);
    w.rotation.x = sd > 0 ? Math.PI / 2 : -Math.PI / 2; w.position.set(2.6, -0.9, 0);
    g.add(w);
    const st = new THREE.Mesh(wing(5.8, 3.4, 1.2, 3.2, 0.14), white);
    st.rotation.x = sd > 0 ? Math.PI / 2 : -Math.PI / 2; st.position.set(-14.8, 0.4, 0);
    g.add(st);
    const eng = new THREE.LatheGeometry([[0.001, -2.0], [0.7, -1.95], [0.85, -1.2], [0.82, 1.2], [0.55, 2.0], [0.001, 2.05]].map(([a, b]) => new THREE.Vector2(a, b)), 20).rotateZ(Math.PI / 2);
    const e = new THREE.Mesh(eng, grey); e.position.set(0.8, -1.95, sd * 5.8); g.add(e);
    const py = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.8, 0.3, 2, 0.1), white); py.position.set(0.8, -1.3, sd * 5.8); g.add(py);
  }
  const fin = new THREE.Shape(); fin.moveTo(0, 0); fin.lineTo(-4.2, 6.2); fin.lineTo(-6.0, 6.2); fin.lineTo(-6.6, 0); fin.lineTo(0, 0);
  const f = new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 }), tailM);
  f.position.set(-11.6, 1.2, -0.1); g.add(f);
  // Kokpit camları
  const cw = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.35, 1.9, 2, 0.1), new THREE.MeshPhysicalMaterial({ color: 0x0b1015, roughness: 0.05, metalness: 0.3, clearcoat: 1 }));
  cw.position.set(16.1, 0.75, 0); cw.rotation.z = -0.5; g.add(cw);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Tekerlekli çöp kutusu (240 L). */
export function wheelieBin(color) {
  const g = new THREE.Group(), m = mat.plastic({ color, gloss: 0.35 });
  const s = new THREE.Shape(); s.moveTo(-0.29, 0); s.lineTo(0.29, 0); s.lineTo(0.34, 1.0); s.lineTo(-0.34, 1.0); s.lineTo(-0.29, 0);
  const body = new THREE.ExtrudeGeometry(s, { depth: 0.62, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }).translate(0, 0, -0.31);
  const b = new THREE.Mesh(body, m); b.position.y = 0.06; g.add(b);
  const lid = new THREE.Mesh(new RoundedBoxGeometry(0.76, 0.06, 0.78, 2, 0.025), m); lid.position.set(0, 1.12, 0.02); g.add(lid);
  const w = mat.rubber({ color: 0x1b1b1b });
  for (const z of [-0.3, 0.3]) { const o = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16).rotateX(Math.PI / 2), w); o.position.set(-0.3, 0.1, z); g.add(o); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return g;
}

/** Bağlı siyah çöp poşeti (düzensiz, parlak plastik). */
let bagGeo = null;
export function trashBag() {
  if (!bagGeo) {
    bagGeo = new THREE.IcosahedronGeometry(0.42, 3);
    const p = bagGeo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = 0.08 * Math.sin(v.x * 17 + v.y * 5) * Math.cos(v.z * 13) + 0.05 * Math.sin(v.y * 23 + v.z * 7);
      const k = v.y < 0 ? 0.82 : 1 + Math.max(0, v.y - 0.25) * 0.8;
      v.multiplyScalar(1 + n); v.x *= 1.05; v.y = v.y * 0.85 * (v.y < 0 ? 0.8 : 1); v.z *= k > 1 ? 1 / k : 1;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    bagGeo.computeVertexNormals();
  }
  const m = new THREE.MeshPhysicalMaterial({ color: 0x0c0d0f, roughness: 0.28, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const g = new THREE.Group(), b = new THREE.Mesh(bagGeo, m); b.castShadow = b.receiveShadow = true; g.add(b);
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), m); knot.position.y = 0.42; g.add(knot);
  return g;
}

/** Yuvarlak yumuşak nokta dokusu (parçacıklar için). */
let dotTex = null;
export function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}
