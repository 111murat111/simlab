// Şehir dekoru: birleşik bina kütleleri (cephe pencereleri, akşam yanan ışıklar, çatı donanımı) — yalnız görsel.
import { THREE, procedural, BufferGeometryUtils, seeded } from '@core';

/** Cephe malzemesi: dünya koordinatında pencere ızgarası; lit (0–1) yanan pencere oranı, glow parlaklık. */
export function facadeMaterial({ lit = 0.3, glow = 2.2, floor = 3.4, bay = 3.0 } = {}) {
  const m = procedural({
    key: 'facade-city', scale: 1, bump: 0.0,
    params: { color: 0xffffff, roughness: 0.7, vertexColors: true },
    uniforms: { uLit: { value: lit }, uFloor: { value: floor }, uBay: { value: bay } },
    pattern: `
      vec3 a = axisDominant(pn);
      float roof = a.y;
      vec2 uv = a.x > 0.5 ? p.zy : p.xy;
      vec2 cell = uv / vec2(uBay, uFloor);
      vec2 id = floor(cell), f = fract(cell);
      float fw = length(fwidth(cell));
      float aa = 1.0 - smoothstep(0.25, 0.7, fw);
      float win = step(0.16, f.x)*step(f.x, 0.84)*step(0.26, f.y)*step(f.y, 0.86);
      float band = step(0.9, f.y);
      win = mix(0.45, win, aa)*(1.0 - roof);
      float bid = floor(p.x*0.021 + 0.5) + floor(p.z*0.019 + 0.5)*37.0;
      float r = h13(vec3(id, bid));
      float n = fbm3(p*0.15, 3);
      vec3 wall = col*(0.8 + 0.35*n)*(1.0 - 0.18*band*aa*(1.0 - roof));
      vec3 glassC = mix(vec3(0.05, 0.07, 0.09), vec3(0.16, 0.2, 0.24), r)*(0.8 + 0.4*col.b);
      col = mix(wall, glassC, win*0.9);
      rough = mix(0.85, 0.1 + 0.15*r, win);
      metal = win*0.5;
      pLit = win*step(1.0 - uLit, h13(vec3(id + 3.1, bid + 7.0)))*(0.5 + r)*aa + win*(1.0 - aa)*uLit*0.6;
      h = 1.0 - win;`,
  });
  const base = m.onBeforeCompile;
  m.userData.uniforms.uGlow = { value: glow };
  m.onBeforeCompile = (sh) => {
    base(sh);
    sh.uniforms.uGlow = m.userData.uniforms.uGlow;
    sh.fragmentShader = sh.fragmentShader
      .replace('vec3 pCol;', 'float pLit = 0.0; uniform float uGlow; vec3 pCol;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(1.0, 0.72, 0.42)*pLit*uGlow;');
  };
  m.customProgramCacheKey = () => 'simlab-facade-city';
  return m;
}

const PALETTE = [0xb9b2a6, 0xa89a88, 0xc9c2b5, 0x8d9197, 0x9fa9b3, 0xd2c7b2, 0x7d8a96, 0xb4a48e];

function boxAt(w, h, d, x, y, z, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

/**
 * Şehir: ground (m, sokak seviyesi), avoid (x, z) → true ise bina konmaz, rect [x0, z0, x1, z1], pitch blok aralığı,
 * tall (x, z) → 0–1 kule olasılığı (şehir merkezi). Tek Mesh döner.
 */
export function createCity({ ground = 0, rect = [-2000, -3000, 2000, 200], pitch = 64, seed = 5, avoid = () => false, tall = () => 0.05,
  lit = 0.3, glow = 2.2, maxH = 230 } = {}) {
  const r = seeded(seed), geos = [];
  const [x0, z0, x1, z1] = rect;
  for (let x = x0; x <= x1; x += pitch) for (let z = z0; z <= z1; z += pitch) {
    // blok içinde 1–4 bina
    const k = 1 + Math.floor(r() * 3.2);
    for (let b = 0; b < k; b++) {
      const w = 14 + r() * 26, d = 14 + r() * 26;
      const cx = x + (r() - 0.5) * (pitch - w - 12), cz = z + (r() - 0.5) * (pitch - d - 12);
      if (avoid(cx, cz)) continue;
      const tw = r() < tall(cx, cz);
      let h = tw ? 70 + r() * (maxH - 70) : 9 + r() * r() * 42;
      const col = PALETTE[Math.floor(r() * PALETTE.length)];
      if (tw) {
        // kule: 2–3 kademe
        const t1 = h * (0.55 + r() * 0.2);
        geos.push(boxAt(w, t1, d, cx, ground, cz, col));
        const w2 = w * (0.7 + r() * 0.15), d2 = d * (0.7 + r() * 0.15);
        geos.push(boxAt(w2, h - t1, d2, cx, ground + t1, cz, col));
        if (r() < 0.6) geos.push(boxAt(w2 * 0.35, 6 + r() * 14, d2 * 0.35, cx, ground + h, cz, 0x6b7076));
      } else {
        geos.push(boxAt(w, h, d, cx, ground, cz, col));
        // çatı: parapet + klima / su deposu
        geos.push(boxAt(w * 0.3, 2.2, d * 0.25, cx + (r() - 0.5) * w * 0.4, ground + h, cz + (r() - 0.5) * d * 0.4, 0x8a8c8e));
        if (r() < 0.5) geos.push(boxAt(3, 3.5, 3, cx - w * 0.3, ground + h, cz + d * 0.25, 0x6e6a64));
      }
    }
  }
  const g = BufferGeometryUtils.mergeGeometries(geos, false);
  geos.forEach((x) => x.dispose());
  const mesh = new THREE.Mesh(g, facadeMaterial({ lit, glow }));
  mesh.userData.noFit = true; mesh.userData.noCast = true;
  mesh.name = 'city';
  return mesh;
}
