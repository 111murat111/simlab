// Küçük yardımcılar (THREE'ye bağımlı olmayanlar hariç hepsi saf fonksiyon).
import * as THREE from 'three';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mapRange = (v, a1, b1, a2, b2) => a2 + ((v - a1) * (b2 - a2)) / (b1 - a1);
export const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const TAU = Math.PI * 2;

/** Tekrarlanabilir rastgele sayı üreteci (mulberry32). */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal dağılımlı rastgele sayı. */
export function gauss(mean = 0, sd = 1) {
  const u = 1 - Math.random(), v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

const HEAT = [[0, 0x2563eb], [0.35, 0x22c55e], [0.6, 0xfacc15], [0.8, 0xf97316], [1, 0xdc2626]];
/** 0..1 → mavi-yeşil-sarı-turuncu-kırmızı ısı rengi. out verilirse ona yazar. */
export function heatColor(t, out = new THREE.Color()) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < HEAT.length; i++) {
    if (t <= HEAT[i][0]) {
      const [t0, c0] = HEAT[i - 1], [t1, c1] = HEAT[i];
      return out.setHex(c0).lerp(_c.setHex(c1), (t - t0) / (t1 - t0));
    }
  }
  return out.setHex(HEAT[HEAT.length - 1][1]);
}
const _c = new THREE.Color();

/** Sayıyı Türkçe biçimde yazar: 12.345,6 */
export function fmt(n, digits = 0) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtClock(sec) {
  const s = Math.floor(sec), m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Tuval üzerine yazı çizip doku döndürür (3B tabela, düğme yüzü vb. için). */
export function textTexture(text, { size = 64, color = '#fff', bg = null, font = '600 {s}px system-ui, sans-serif', pad = 12, width } = {}) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const f = font.replace('{s}', size);
  ctx.font = f;
  const lines = String(text).split('\n');
  const w = width ?? Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2);
  const h = Math.ceil(lines.length * size * 1.2 + pad * 2);
  c.width = w; c.height = h;
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.font = f;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, w / 2, pad + size * 0.6 + i * size * 1.2));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.aspect = w / h;
  return tex;
}

/** Yazılı düz levha (Mesh). height dünya birimi. */
export function textPlane(text, height = 1, opts = {}) {
  const tex = textTexture(text, opts);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(height * tex.userData.aspect, height),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
  );
  return m;
}

/** Nesnenin tüm geometri/materyallerini serbest bırakıp sahneden çıkarır. */
export function disposeObject(obj) {
  if (!obj) return;
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map?.dispose(); m.dispose(); });
    if (o.isCSS2DObject && o.element) o.element.remove();
  });
  obj.removeFromParent();
}

/** Basit ızgara zemin. */
export function makeGround(size = 40, color = 0x1a2233, { grid = true, receiveShadow = true } = {}) {
  const g = new THREE.Group();
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = receiveShadow;
  g.add(plane);
  if (grid) {
    const gh = new THREE.GridHelper(size, size, 0x334155, 0x1e293b);
    gh.position.y = 0.002;
    gh.material.transparent = true;
    gh.material.opacity = 0.5;
    g.add(gh);
  }
  return g;
}

/** Çok sayıda aynı nesne için InstancedMesh kısayolu. */
export function instanced(geometry, material, count) {
  const m = new THREE.InstancedMesh(geometry, material, count);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return m;
}
