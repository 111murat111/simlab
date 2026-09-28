// Sunucu salonu: yükseltilmiş döşeme (delikli soğuk koridor karoları), delikli kapılı raflar (arkasında 1U sunucular,
// yanıp sönen LED'ler — çiçeklenir), kablo tavaları, tavan LED armatürleri, soğuk koridor pusu — yalnız görsel.
import { THREE, mat, procedural, RoundedBoxGeometry, BufferGeometryUtils, seeded } from '@core';

/** Raf malzemesi: vLoc (gerçek yerel koordinat) ile ön kapı deliği, sunucu sıraları ve LED'ler. uTime ile yanıp söner. */
export function rackMaterial({ w = 0.6, h = 2.1, activity = 1 } = {}) {
  const U = { uTime: { value: 0 }, uAct: { value: activity }, uW: { value: w }, uH: { value: h } };
  const m = procedural({
    key: 'srv-rack', bump: 0.015, params: { color: 0x1a1c1f, roughness: 0.45, metalness: 0.6 },
    uniforms: U,
    pattern: `
      vec3 L = vLoc;
      float front = step(0.7, pn.z), back = step(0.7, -pn.z);
      float n = fbm3(p*3.0, 3);
      col = vec3(0.045, 0.047, 0.05)*(0.9 + 0.2*n);
      rough = 0.5; metal = 0.6;
      if (front + back > 0.5) {
        float ex = min(uW*0.5 - abs(L.x), min(L.y, uH - L.y));
        float frame = 1.0 - step(0.035, ex);
        // delikli kapı: uzakta ortalama griye söner
        vec2 q = L.xy/0.007;
        float hole = 1.0 - step(0.32, length(fract(q + vec2(0.5*mod(floor(q.y), 2.0), 0.0)) - 0.5));
        float aa = aaW(vec3(q, 0.0)*0.9);
        float perf = mix(0.45, hole, aa);
        // arkada 1U sunucular
        float u = (L.y - 0.12)/0.0445, row = floor(u), fy = fract(u);
        float inside = step(0.12, L.y)*step(L.y, uH - 0.2)*step(abs(L.x), uW*0.5 - 0.06);
        float r = h13(vec3(row, floor(vRack*97.0), 3.0));
        float gap = step(0.08, fy)*step(fy, 0.92);
        vec3 srv = mix(vec3(0.02), vec3(0.09, 0.095, 0.1)*(0.8 + 0.4*r), gap);
        vec3 door = vec3(0.03, 0.032, 0.035);
        col = mix(door, srv, perf*inside);
        col = mix(col, vec3(0.06, 0.062, 0.066)*(0.9 + 0.2*n), frame);
        rough = mix(0.4, 0.3, frame); metal = 0.7;
        // LED: satır başına 2–3 adet; bazı satırlar boş (r küçük)
        float filled = step(0.18, r)*inside*(1.0 - frame);
        float lx = L.x + uW*0.5 - 0.09;
        float slot = floor(lx/0.028);
        float inLed = step(0.0, lx)*step(slot, 2.0)*step(abs(fract(lx/0.028) - 0.5), 0.3)*step(abs(fy - 0.5), 0.2);
        float rr = h13(vec3(row, slot, floor(vRack*53.0)));
        float blink = step(0.35, fract(uTime*(0.6 + 3.0*rr)*uAct + rr*7.0));
        float on = filled*inLed*mix(1.0, blink, step(0.4, rr))*step(0.1, uAct + 0.05);
        vec3 ledC = rr < 0.08 ? vec3(1.0, 0.55, 0.1) : (rr < 0.55 ? vec3(0.15, 1.0, 0.35) : vec3(0.2, 0.55, 1.0));
        pEm = ledC*on*5.0*(back > 0.5 ? 0.5 : 1.0);
        h = frame*0.8 + perf*0.3;
      } else {
        rough = 0.55; metal = 0.5; h = n*0.2;
      }`,
  });
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    base(sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying float vRack;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vLoc = position; vRack = 0.0;
        #ifdef USE_INSTANCING
          vRack = fract(dot(instanceMatrix[3].xyz, vec3(0.1234, 0.0, 0.3456)));
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLoc; varying float vRack; vec3 pEm = vec3(0.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += pEm;');
  };
  m.customProgramCacheKey = () => 'simlab-srv-rack';
  return m;
}

/** Raf gövdesi: taban y = 0, ön yüz +z. */
export function rackGeometry(w = 0.6, h = 2.1, d = 1.2) {
  return new RoundedBoxGeometry(w * 0.985, h, d, 2, 0.012).translate(0, h / 2, 0);
}

/** Yükseltilmiş döşeme: 60 cm karolar; perf(x, z) → true ise delikli karo. */
export function raisedFloor(x0, z0, x1, z1, perf) {
  const U = { uX0: { value: x0 }, uZ0: { value: z0 } };
  const m = procedural({
    key: 'srv-floor', bump: 0.02, params: { color: 0xb9bcbe, roughness: 0.55, vertexColors: true },
    uniforms: U,
    pattern: `
      vec2 t = p.xz/0.6;
      vec2 f = fract(t);
      float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      float seam = (1.0 - smoothstep(0.004, 0.012, e))*aaW(vec3(t, 0.0)*0.8);
      float r = h13(vec3(floor(t), 1.0));
      float n = fbm3(p*1.5, 3);
      // delikli karo: köşe rengi mavimsi işaretli; taban rengi nötr
      float isPerf = step(0.6, vColor.b - vColor.r + 0.5);
      col = vec3(0.66, 0.67, 0.68)*(0.9 + 0.08*r + 0.08*n);
      vec2 q = p.xz/0.02;
      float hole = 1.0 - step(0.28, length(fract(q) - 0.5));
      float inner = step(0.06, e);
      float perfM = isPerf*inner*mix(0.35, hole, aaW(vec3(q, 0.0)*0.9));
      col = mix(col, vec3(0.06), perfM*0.85);
      col = mix(col, col*0.35, seam);
      rough = 0.45 + 0.15*n + 0.3*seam;
      h = -seam - perfM*0.5;`,
  });
  // karo başına renk: delikli karolar mavimsi işaret (desen tanır, rengi nötrleştirir)
  const geos = [];
  for (let x = x0; x < x1 - 1e-3; x += 0.6) for (let z = z0; z < z1 - 1e-3; z += 0.6) {
    const g = new THREE.PlaneGeometry(0.6, 0.6).rotateX(-Math.PI / 2).translate(x + 0.3, 0, z + 0.3);
    const pf = perf(x + 0.3, z + 0.3);
    const c = pf ? [0.72, 0.74, 0.98] : [0.74, 0.74, 0.74];
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set(c, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  const g = BufferGeometryUtils.mergeGeometries(geos);
  const mesh = new THREE.Mesh(g, m);
  mesh.receiveShadow = true; mesh.userData.noFit = true; mesh.userData.noCast = true;
  return mesh;
}

/** Kafes kablo tavası: (x0,z0)→(x1,z1) boyunca, y yüksekliğinde, w genişlik; içinde kablo demetleri. */
export function cableTray(a, b, y, w, color = 0xd7b21f) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  const parts = [], cables = [];
  for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(0.02, 0.08, L).translate(s * w / 2, 0.04, 0));
  for (let t = -L / 2 + 0.15; t < L / 2; t += 0.3) parts.push(new THREE.BoxGeometry(w, 0.012, 0.012).translate(0, 0.006, t));
  const cab = [0x2b6cb0, 0x1a1a1a, 0x2f855a, 0xc05621, 0x1a1a1a, 0x805ad5];
  const r = seeded(Math.round(a[0] * 13 + a[1] * 7 + y * 3));
  for (let k = 0; k < 9; k++) {
    const cg = new THREE.CylinderGeometry(0.012, 0.012, L, 6).rotateX(Math.PI / 2).translate((k / 8 - 0.5) * w * 0.8 + (r() - 0.5) * 0.02, 0.025 + (k % 3) * 0.02, 0);
    const c = new THREE.Color(cab[Math.floor(r() * cab.length)]);
    const n = cg.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    cg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    cables.push(cg);
  }
  const g = new THREE.Group();
  const tray = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(parts.map((p) => p.toNonIndexed())), mat.paintedMetal({ color, wear: 0.15 }));
  const cm = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(cables), mat.rubber({ color: 0xffffff }));
  cm.material.vertexColors = true;
  g.add(tray, cm);
  g.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
  g.rotation.y = Math.atan2(dx, dz);
  g.traverse((o) => { o.userData.noFit = true; o.castShadow = true; });
  return g;
}

/** Tavan LED armatürü (şerit): çiçeklenen yüzey. */
export function ledStrip(len, x, y, z, rotY = 0) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.06, len, 1, 0.02), mat.paintedMetal({ color: 0xe6e6e3, wear: 0.05 }));
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.01, len - 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.75, 2.9) }));
  lens.position.y = -0.03;
  g.add(body, lens);
  g.position.set(x, y, z); g.rotation.y = rotY;
  g.traverse((o) => { o.userData.noFit = true; o.userData.noCast = true; });
  return g;
}

/** Soğuk koridor pusu: yere yakın, yavaş sürüklenen yumuşak, soluk mavi ışık lekeleri. */
export function haze(n, box, color = [0.18, 0.28, 0.42]) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const r = seeded(77), pos = new Float32Array(n * 3), base = [];
  const [x0, y0, z0, x1, y1, z1] = box;
  for (let i = 0; i < n; i++) { const p = [x0 + r() * (x1 - x0), y0 + r() * r() * (y1 - y0), z0 + r() * (z1 - z0)]; base.push(p); pos.set(p, i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, map: tex, color: new THREE.Color(...color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; pts.userData.noFit = true; pts.userData.noCast = true;
  pts.userData.update = (t) => {
    for (let i = 0; i < n; i++) {
      const b = base[i];
      pos[i * 3] = b[0] + Math.sin(t * 0.13 + i) * 0.25; pos[i * 3 + 1] = b[1] + Math.sin(t * 0.21 + i * 1.7) * 0.08; pos[i * 3 + 2] = b[2] + Math.cos(t * 0.11 + i * 0.7) * 0.25;
    }
    g.attributes.position.needsUpdate = true;
  };
  return pts;
}
