// Biyolojik sahne yardımcıları (yerel): koyu sıvı ortam (fon + derinlik pusu + süzülen parçacıklar), organik geometri,
// yarım (kesit) tüp, değişken yarıçaplı tüp, alyuvar (bikonkav disk), yumuşak nokta dokusu.
import { THREE, mat, ImprovedNoise, BufferGeometryUtils, NOISE3_GLSL } from '@core';

const noise = new ImprovedNoise();
export const n3 = (x, y, z) => noise.noise(x, y, z);
export function fbm(x, y, z, oct = 3) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise.noise(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}

/** Yumuşak yuvarlak parçacık dokusu (kare piksel değil) */
let dotTex = null;
export function softDot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  dotTex = new THREE.CanvasTexture(c);
  dotTex.colorSpace = THREE.SRGBColorSpace;
  return dotTex;
}

const BG_VS = /* glsl */ `varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.99999, 1.0); }`;
const BG_FS = NOISE3_GLSL + /* glsl */ `
uniform vec3 uTop, uBottom, uGlow, uGlowDir, uTint; uniform mat4 uProjInv, uCamWorld; uniform float uTime, uCloud;
varying vec2 vNdc;
void main(){
  vec4 v = uProjInv*vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize((uCamWorld*vec4(v.xyz/v.w, 0.0)).xyz);
  vec3 c = mix(uBottom, uTop, smoothstep(-0.6, 0.9, d.y));
  float g = max(dot(d, uGlowDir), 0.0);
  c += uGlow*(pow(g, 3.0)*0.8 + pow(g, 12.0)*0.8);
  // Ortamın içindeki bulutsu yoğunluk farkları (sıvı / doku arası boşluk)
  float n = fbm3(d*2.6 + vec3(0.0, uTime*0.01, 0.0), 5), m = fbm3(d*7.0 - vec3(uTime*0.015), 4);
  c *= 0.62 + 0.75*n;
  c += uTint*smoothstep(0.55, 0.85, m)*0.35*uCloud;
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)))*43758.5453) - 0.5)/255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

const MOTE_VS = /* glsl */ `
attribute float aSeed; uniform float uTime, uSize, uPix; varying float vA; varying float vS;
void main(){
  vec3 p = position;
  p += vec3(sin(uTime*0.21 + aSeed*40.0), sin(uTime*0.17 + aSeed*71.0)*0.8, cos(uTime*0.19 + aSeed*23.0))*0.25*(0.4 + aSeed);
  vec4 mv = modelViewMatrix*vec4(p, 1.0);
  gl_Position = projectionMatrix*mv;
  float s = uSize*(0.35 + 1.3*fract(aSeed*13.7));
  gl_PointSize = clamp(s*uPix/max(-mv.z, 0.01), 1.0, 48.0);
  vA = smoothstep(0.2, 2.5, -mv.z)*(0.35 + 0.65*fract(aSeed*7.3)); vS = aSeed;
}`;
const MOTE_FS = /* glsl */ `
uniform sampler2D uTex; uniform vec3 uCol, uCol2; uniform float uOpacity; varying float vA; varying float vS;
void main(){
  float a = texture2D(uTex, gl_PointCoord).a*vA*uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(uCol, uCol2, step(0.8, fract(vS*31.0))), a);
}`;

/**
 * Koyu sıvı ortam (mikro / vücut içi sahneler): stüdyo siklorama gizlenir, yerine bulutsu degrade fon, üstel sis (FogExp2)
 * ve süzülen yumuşak parçacıklar gelir. Işık stüdyo ortamından (mood: 'night' | 'lab') gelmeye devam eder.
 * @param o { top, bottom, glow, glowDir:[x,y,z], tint, fog, density, motes, box:[w,h,d], center:[x,y,z], moteColor, moteColor2, moteSize, moteOpacity }
 */
export function darkMedium(sim, o = {}) {
  const P = { top: 0x16283a, bottom: 0x04070b, glow: 0x3a5a7a, glowDir: [0.4, 0.7, -0.6], tint: 0x6a3040, cloud: 1,
    fog: 0x0a141e, density: 0.03, motes: 700, box: [30, 16, 30], center: [0, 0, 0], moteColor: 0xbcd6ff, moteColor2: 0xffc4a8,
    moteSize: 0.08, moteOpacity: 0.55, ...o };
  const scene = sim.scene, cam = sim.camera;
  if (sim.sky && sim.sky.mesh) sim.sky.mesh.visible = false;
  scene.background = new THREE.Color(P.fog);
  scene.fog = new THREE.FogExp2(P.fog, P.density);
  const lin = (h, k = 1) => new THREE.Color(h).multiplyScalar(k);
  const U = {
    uTop: { value: lin(P.top, 2) }, uBottom: { value: lin(P.bottom, 2) }, uGlow: { value: lin(P.glow, 2) }, uTint: { value: lin(P.tint, 2) },
    uGlowDir: { value: new THREE.Vector3(...P.glowDir).normalize() }, uCloud: { value: P.cloud },
    uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uTime: { value: 0 },
  };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const bg = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: BG_VS, fragmentShader: BG_FS, depthWrite: false, depthTest: false, fog: false }));
  bg.frustumCulled = false; bg.renderOrder = -1e9; bg.raycast = () => {}; bg.userData.noAO = true;
  scene.add(bg);

  // Süzülen parçacıklar
  let motes = null;
  const MU = { uTime: { value: 0 }, uSize: { value: P.moteSize }, uPix: { value: 600 }, uTex: { value: softDot() },
    uCol: { value: lin(P.moteColor, 1.4) }, uCol2: { value: lin(P.moteColor2, 1.6) }, uOpacity: { value: P.moteOpacity } };
  if (P.motes > 0) {
    const pos = new Float32Array(P.motes * 3), seed = new Float32Array(P.motes);
    for (let i = 0; i < P.motes; i++) {
      pos[i * 3] = P.center[0] + (Math.random() - 0.5) * P.box[0];
      pos[i * 3 + 1] = P.center[1] + (Math.random() - 0.5) * P.box[1];
      pos[i * 3 + 2] = P.center[2] + (Math.random() - 0.5) * P.box[2];
      seed[i] = Math.random();
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    mg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    motes = new THREE.Points(mg, new THREE.ShaderMaterial({ uniforms: MU, vertexShader: MOTE_VS, fragmentShader: MOTE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    motes.frustumCulled = false; motes.raycast = () => {};
    scene.add(motes);
  }
  const size = new THREE.Vector2();
  sim.onRender(() => {
    U.uProjInv.value.copy(cam.projectionMatrixInverse);
    U.uCamWorld.value.copy(cam.matrixWorld);
    const t = performance.now() / 1000;
    U.uTime.value = t; MU.uTime.value = t;
    sim.renderer.getDrawingBufferSize(size);
    MU.uPix.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov || 50) / 2));
  });
  return { bg, motes, uniforms: U, moteUniforms: MU };
}

/** Organik kabarcık: gürültüyle şekli bozulmuş küre (hücre, organel, düğüm). stretch: [sx, sy, sz] */
export function blobGeometry(r = 1, { detail = 12, amp = 0.12, freq = 1.4, seed = 0, stretch = [1, 1, 1], oct = 3 } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = BufferGeometryUtils.mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const d = 1 + amp * fbm(v.x * freq + seed * 7.1, v.y * freq + seed * 3.3, v.z * freq - seed * 5.7, oct) * 2;
    p.setXYZ(i, v.x * r * d * stretch[0], v.y * r * d * stretch[1], v.z * r * d * stretch[2]);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Değişken yarıçaplı tüp (damar, uzuv, akson). curve: THREE.Curve; radius(t) → yarıçap; arc: [a0, a1] açı aralığı
 * (tam tüp için [0, 2π]); frames: yan vektör = eğri teğeti × view (kesit yönü). Uçlar kapalı (caps) ya da açık.
 */
export function loftTube(curve, radius, { segs = 64, radial = 24, caps = true, squash = 1, view = [0, 0, 1], noiseAmp = 0, noiseFreq = 3 } = {}) {
  const pos = [], idx = [], V = new THREE.Vector3(...view).normalize();
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3(), prevN1 = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P); curve.getTangentAt(t, T);
    N1.crossVectors(T, V);
    if (N1.lengthSq() < 1e-6) N1.copy(prevN1.lengthSq() ? prevN1 : new THREE.Vector3(1, 0, 0));
    N1.normalize(); prevN1.copy(N1);
    N2.crossVectors(N1, T).normalize();
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const nz = noiseAmp ? 1 + noiseAmp * n3(P.x * noiseFreq + Math.cos(a), P.y * noiseFreq + Math.sin(a), P.z * noiseFreq) : 1;
      pos.push(P.x + r * nz * (Math.cos(a) * N1.x + Math.sin(a) * N2.x * squash), P.y + r * nz * (Math.cos(a) * N1.y + Math.sin(a) * N2.y * squash), P.z + r * nz * (Math.cos(a) * N1.z + Math.sin(a) * N2.z * squash));
    }
  }
  const W = radial + 1;
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  if (caps) {
    for (const [ring, t, flip] of [[0, 0, true], [segs, 1, false]]) {
      curve.getPointAt(t, P);
      const ci = pos.length / 3; pos.push(P.x, P.y, P.z);
      for (let j = 0; j < radial; j++) { const a = ring * W + j, b = a + 1; flip ? idx.push(ci, b, a) : idx.push(ci, a, b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Kesit (yarım) tüp: bakış yönüne (view) göre ön yarısı kesilmiş, et kalınlığı olan damar. İçinden akan parçacıklar görünür.
 * radius(t), thick: et kalınlığı (yarıçap oranı).
 */
export function halfTube(curve, radius, { segs = 64, radial = 20, thick = 0.18, view = [0, 0, 1], arc = 0 } = {}) {
  const pos = [], idx = [], V = new THREE.Vector3(...view).normalize();
  const P = new THREE.Vector3(), T = new THREE.Vector3(), N1 = new THREE.Vector3(), N2 = new THREE.Vector3(), prev = new THREE.Vector3(1, 0, 0);
  const rows = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P); curve.getTangentAt(t, T);
    N1.crossVectors(T, V); if (N1.lengthSq() < 1e-6) N1.copy(prev); N1.normalize(); prev.copy(N1);
    N2.crossVectors(N1, T).normalize(); if (N2.dot(V) > 0) N2.negate();
    rows.push({ P: P.clone(), N1: N1.clone(), N2: N2.clone(), r: radius(t) });
  }
  // profil: dış yay (0..π) → iç yay (π..0) kapalı çokgen; bölümler arası dikişsiz
  const prof = [];
  // arc > 0: yan duvarlar öne doğru arc radyan uzar (tüp daha dolgun okunur, önde yine bir yarık kalır)
  const A = (j) => -arc + (j / radial) * (Math.PI + 2 * arc);
  for (let j = 0; j <= radial; j++) prof.push([A(j), 1]);
  for (let j = radial; j >= 0; j--) prof.push([A(j), 1 - thick]);
  const W = prof.length;
  for (const R of rows) for (const [a, k] of prof) {
    const c = Math.cos(a) * R.r * k, s = Math.sin(a) * R.r * k;
    pos.push(R.P.x + c * R.N1.x + s * R.N2.x, R.P.y + c * R.N1.y + s * R.N2.y, R.P.z + c * R.N1.z + s * R.N2.z);
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < W; j++) {
    const j2 = (j + 1) % W, a = i * W + j, b = i * W + j2, c = a + W, d = b + W;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Alyuvar: Evans–Fung bikonkav disk profili (çap = 2r) */
export function rbcGeometry(r = 1, seg = 20) {
  const pts = [], N = 14;
  const z = (x) => 0.5 * Math.sqrt(Math.max(0, 1 - x * x)) * (0.207 + 2.003 * x * x - 1.123 * x ** 4);
  for (let i = 0; i <= N; i++) { const x = Math.sin((i / N) * Math.PI / 2); pts.push(new THREE.Vector2(x * r + 1e-4, (z(x) + 0.015) * r)); }
  for (let i = N; i >= 0; i--) { const x = Math.sin((i / N) * Math.PI / 2); pts.push(new THREE.Vector2(x * r + 1e-4, -(z(x) + 0.015) * r)); }
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(Math.PI / 2);
  return BufferGeometryUtils.mergeVertices(g);
}

// ---------------------------------------------------------------------------------------------------------------
// İşaretli uzaklık alanı (SDF) ile organik yüzey: ilkel şekiller yumuşak birleşimle kaynaşır, "surface nets" ile ağ örülür.
// İnsan gövdesi, kas, kemik, organ gibi dikişsiz biçimler için. Birimler çağıranınki.
// ---------------------------------------------------------------------------------------------------------------
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m3 = new THREE.Matrix3(), _m4 = new THREE.Matrix4();
/** Döndürülmüş elipsoit (iq yaklaşığı). rot: [rx, ry, rz] Euler */
export function sEllipsoid(c, r, rot = null) {
  let inv = null;
  if (rot) {
    if (rot.isMatrix4) _m4.copy(rot); else if (rot.isQuaternion) _m4.makeRotationFromQuaternion(rot); else _m4.makeRotationFromEuler(_e.set(...rot));
    _m4.invert(); inv = new THREE.Matrix3().setFromMatrix4(_m4).elements;
  }
  const R = Math.max(...r);
  return {
    box: [c[0] - R, c[1] - R, c[2] - R, c[0] + R, c[1] + R, c[2] + R],
    d(x, y, z) {
      x -= c[0]; y -= c[1]; z -= c[2];
      if (inv) { const X = inv[0] * x + inv[3] * y + inv[6] * z, Y = inv[1] * x + inv[4] * y + inv[7] * z, Z = inv[2] * x + inv[5] * y + inv[8] * z; x = X; y = Y; z = Z; }
      const k0 = Math.hypot(x / r[0], y / r[1], z / r[2]), k1 = Math.hypot(x / (r[0] * r[0]), y / (r[1] * r[1]), z / (r[2] * r[2]));
      return k1 < 1e-9 ? -Math.min(...r) : (k0 * (k0 - 1)) / k1;
    },
  };
}
/** Konik kapsül (iki uçta farklı yarıçap, iq round cone) */
export function sCone(a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2, R = Math.max(r1, r2);
  return {
    box: [Math.min(a[0], b[0]) - R, Math.min(a[1], b[1]) - R, Math.min(a[2], b[2]) - R, Math.max(a[0], b[0]) + R, Math.max(a[1], b[1]) + R, Math.max(a[2], b[2]) + R],
    d(x, y, z) {
      const pax = x - a[0], pay = y - a[1], paz = z - a[2];
      const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
      const xvx = pax * l2 - bax * yy, xvy = pay * l2 - bay * yy, xvz = paz * l2 - baz * yy;
      const x2 = xvx * xvx + xvy * xvy + xvz * xvz, y2 = yy * yy * l2, z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
  };
}
/** Eğri boyunca kapsül zinciri: pts [[x,y,z],…], radii [r0,…] */
export function sChain(pts, radii) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) out.push(sCone(pts[i], pts[i + 1], radii[i], radii[i + 1]));
  return out;
}
/** Yuvarlatılmış kutu */
export function sBox(c, h, r = 0) {
  return {
    box: [c[0] - h[0] - r, c[1] - h[1] - r, c[2] - h[2] - r, c[0] + h[0] + r, c[1] + h[1] + r, c[2] + h[2] + r],
    d(x, y, z) {
      const qx = Math.abs(x - c[0]) - h[0], qy = Math.abs(y - c[1]) - h[1], qz = Math.abs(z - c[2]) - h[2];
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
    },
  };
}
/** Yarım uzay kesimi (düzlem): n·p > o tarafı silinir (op: 'cut') */
export function sPlane(n, o) {
  const L = Math.hypot(...n), nx = n[0] / L, ny = n[1] / L, nz = n[2] / L;
  return { box: null, d: (x, y, z) => -(nx * x + ny * y + nz * z - o) };
}

/**
 * İlkel listesinden ağ örer. items: [{ p: ilkel | [ilkeller], k: yumuşatma, op: 'add'|'sub'|'cut', warp }]
 * o: { cell, bounds: [x0,y0,z0,x1,y1,z1], noise: {amp, freq} (yüzey pürüzü) }
 */
export function sdfMesh(items, { cell = 0.02, bounds, noiseAmp = 0, noiseFreq = 4 } = {}) {
  // Sınırlar: verilmediyse ilkel kutularından
  let B = bounds;
  if (!B) {
    B = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
    for (const it of items) if (it.op !== 'sub' && it.op !== 'cut') for (const p of [].concat(it.p)) if (p.box) for (let i = 0; i < 3; i++) { B[i] = Math.min(B[i], p.box[i]); B[i + 3] = Math.max(B[i + 3], p.box[i + 3]); }
    const pad = cell * 3 + (items[0]?.k || 0);
    B = B.map((v, i) => (i < 3 ? v - pad : v + pad));
  }
  const nx = Math.ceil((B[3] - B[0]) / cell) + 1, ny = Math.ceil((B[4] - B[1]) / cell) + 1, nz = Math.ceil((B[5] - B[2]) / cell) + 1;
  const F = new Float32Array(nx * ny * nz).fill(1e3);
  const I = (i, j, k) => i + nx * (j + ny * k);
  let first = true;
  for (const it of items) {
    const k = it.k ?? cell * 2, op = it.op || 'add';
    for (const prim of [].concat(it.p)) {
      const bx = prim.box;
      const m = k + cell * 2;
      const i0 = bx && op !== 'cut' ? Math.max(0, Math.floor((bx[0] - m - B[0]) / cell)) : 0, i1 = bx && op !== 'cut' ? Math.min(nx - 1, Math.ceil((bx[3] + m - B[0]) / cell)) : nx - 1;
      const j0 = bx && op !== 'cut' ? Math.max(0, Math.floor((bx[1] - m - B[1]) / cell)) : 0, j1 = bx && op !== 'cut' ? Math.min(ny - 1, Math.ceil((bx[4] + m - B[1]) / cell)) : ny - 1;
      const k0 = bx && op !== 'cut' ? Math.max(0, Math.floor((bx[2] - m - B[2]) / cell)) : 0, k1 = bx && op !== 'cut' ? Math.min(nz - 1, Math.ceil((bx[5] + m - B[2]) / cell)) : nz - 1;
      for (let c = k0; c <= k1; c++) {
        const z = B[2] + c * cell;
        for (let b = j0; b <= j1; b++) {
          const y = B[1] + b * cell;
          let idx = I(i0, b, c);
          for (let a = i0; a <= i1; a++, idx++) {
            const x = B[0] + a * cell, d = prim.d(x, y, z), f = F[idx];
            if (op === 'add') {
              if (first) F[idx] = Math.min(f, d);
              else { const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (d - f)) / k)); F[idx] = d + (f - d) * h - k * h * (1 - h); }
            } else { // 'sub' / 'cut': yumuşak fark
              const h = Math.max(0, Math.min(1, 0.5 - (0.5 * (f + d)) / k));
              F[idx] = f + (-d - f) * h + k * h * (1 - h);
            }
          }
        }
      }
      first = false;
    }
  }
  if (noiseAmp) for (let c = 0; c < nz; c++) for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) {
    const idx = I(a, b, c);
    if (Math.abs(F[idx]) < cell * 4) F[idx] += noiseAmp * noise.noise((B[0] + a * cell) * noiseFreq, (B[1] + b * cell) * noiseFreq, (B[2] + c * cell) * noiseFreq);
  }
  // Surface nets
  const vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const C = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [], idxs = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let q = 0; q < 8; q++) { const c = corner[q]; v[q] = F[I(i + c[0], j + c[1], k + c[2])]; if (v[q] < 0) mask |= 1 << q; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]), ca = corner[a], cb = corner[b];
      sx += ca[0] + (cb[0] - ca[0]) * t; sy += ca[1] + (cb[1] - ca[1]) * t; sz += ca[2] + (cb[2] - ca[2]) * t; n++;
    }
    vid[C(i, j, k)] = pos.length / 3;
    pos.push(B[0] + (i + sx / n) * cell, B[1] + (j + sy / n) * cell, B[2] + (k + sz / n) * cell);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const f0 = F[I(i, j, k)] < 0;
    // x kenarı (i,j,k)→(i+1,j,k): j-1, k-1 hücreleriyle dörtgen
    if (j > 0 && k > 0 && f0 !== (F[I(i + 1, j, k)] < 0)) {
      const a = vid[C(i, j, k)], b = vid[C(i, j - 1, k)], c = vid[C(i, j - 1, k - 1)], d = vid[C(i, j, k - 1)];
      if (f0) idxs.push(a, b, c, a, c, d); else idxs.push(a, c, b, a, d, c);
    }
    if (i > 0 && k > 0 && f0 !== (F[I(i, j + 1, k)] < 0)) {
      const a = vid[C(i, j, k)], b = vid[C(i, j, k - 1)], c = vid[C(i - 1, j, k - 1)], d = vid[C(i - 1, j, k)];
      if (f0) idxs.push(a, b, c, a, c, d); else idxs.push(a, c, b, a, d, c);
    }
    if (i > 0 && j > 0 && f0 !== (F[I(i, j, k + 1)] < 0)) {
      const a = vid[C(i, j, k)], b = vid[C(i - 1, j, k)], c = vid[C(i - 1, j - 1, k)], d = vid[C(i, j - 1, k)];
      if (f0) idxs.push(a, b, c, a, c, d); else idxs.push(a, c, b, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idxs);
  g.computeVertexNormals();
  return g;
}

/**
 * Yumuşak ıslak doku: çekirdek mat.tissue üzerine yerel sarmalayıcı. Düşük frekanslı biçim + çok ince gözenek,
 * ince damarlar, düşük kabartma (karnabahar/sünger görünümü olmasın); NaN normallere karşı koruma (siyah benekler).
 */
export function tissue({ color = 0xd98c7a, scale = 1, veins = 0.4 } = {}) {
  const m = mat.tissue({ color, scale, veins });
  const U = m.userData.uniforms;
  U.pBump.value = 0.04 / Math.max(scale, 0.25);
  m.roughness = 0.34; m.clearcoat = 0.6; m.clearcoatRoughness = 0.2; m.sheen = 0.35;
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      if (dot(objectNormal, objectNormal) < 1e-12) objectNormal = vec3(0.0, 1.0, 0.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('float n = fbm3a(p*2.5 + seed*4.0, 5);', 'float n = fbm3a(p*1.1 + seed*4.0, 3); float fine = vn3a(p*11.0);')
      .replace('float vein = pow(ridge3(p*3.0 + n), 8.0);', 'float vein = pow(ridge3(p*1.4 + n*0.7), 16.0);')
      .replace('col *= 0.85 + 0.25*n;', 'col *= 0.86 + 0.24*n + 0.03*(fine - 0.5);')
      .replace('h = n*0.6 + vein*0.4;', 'h = n*0.5 + vein*0.06 + fine*0.03;')
      .replace('#include <clearcoat_normal_fragment_begin>', `if (any(isnan(normal)) || dot(normal, normal) < 0.25) normal = nonPerturbedNormal;
      if (any(isnan(normal))) normal = vec3(0.0, 0.0, 1.0);
      #include <clearcoat_normal_fragment_begin>`);
  };
  m.customProgramCacheKey = () => 'simlab-tissue-soft';
  return m;
}

/**
 * Islak doku için ucuz yüzey altı saçılma (SSS) benzetimi: yönlü ışıklarda "wrap" aydınlatma (ışık, gölge sınırının
 * ötesine kırmızımsı sızar) + bakış açısına bağlı zayıf kenar ışıması. Var olan onBeforeCompile zincirine eklenir.
 */
export function wetSSS(m, { color = 0xff4a36, wrap = 0.6, strength = 0.45, rim = 0.1 } = {}) {
  const U = { uSssCol: { value: new THREE.Color(color) }, uSssWrap: { value: wrap }, uSssK: { value: strength }, uSssRim: { value: rim } };
  const base = m.onBeforeCompile, baseKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, r) => {
    if (base) base.call(m, sh, r);
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform vec3 uSssCol; uniform float uSssWrap, uSssK, uSssRim;\nvoid main() {')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        vec3 sssAcc = vec3(0.0);
        #if NUM_DIR_LIGHTS > 0
        for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
          float nl = dot(normal, directionalLights[i].direction);
          sssAcc += directionalLights[i].color*(max(0.0, (nl + uSssWrap)/(1.0 + uSssWrap)) - max(0.0, nl));
        }
        #endif
        vec3 alb = sqrt(max(diffuseColor.rgb, vec3(0.0)));
        float fr = pow(1.0 - saturate(dot(normal, geometryViewDir)), 3.0);
        vec3 sss = sssAcc*uSssCol*alb*uSssK + uSssCol*alb*fr*uSssRim;
        if (!(sss.r >= 0.0) || !(sss.g >= 0.0) || !(sss.b >= 0.0)) sss = vec3(0.0);
        reflectedLight.directDiffuse += sss;
      }`);
  };
  m.customProgramCacheKey = () => (baseKey ? baseKey.call(m) : 'std') + '|sss';
  m.userData.sss = U;
  return m;
}
