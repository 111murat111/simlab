// Ebru: Akışkan Sanatı — boya filmi vektör sınırlarla izlenir (ön izleme): damlalar alan koruyan dönüşümle halka olur,
// biz/tarak ya Stam "Stable Fluids" hız alanıyla (sürükleme) ya da Jaffer'in kapalı biçimli çizgi dönüşümleriyle (hazır desenler) taşınır.
import { createSim, THREE, RoundedBoxGeometry, fmt, clamp, lerp, rand, mat, procedural } from '@core';

const NX = 128, NY = 96, SX = NX + 2, SY = NY + 2, SIZE = SX * SY;
const W = 8, H = 6, SURF_Y = 0.62;          // tekne iç ölçüsü (dünya birimi) ve su yüzeyi yüksekliği
const IX = (i, j) => i + SX * j;
const DT = 1 / 30, TOOL_SPEED = 45;          // hücre/sn
const WATER = '#e4dcc8';                     // kitreli su (krem)
const PALETTE = {
  lacivert: [0x1d2f6f, 'Lacivert'], al: [0xb3261e, 'Al (kırmızı)'], sari: [0xe0a526, 'Hardal sarısı'], yesil: [0x2e7d4f, 'Yeşil'],
  turkuaz: [0x2aa3a8, 'Turkuaz'], beyaz: [0xf7f3ea, 'Beyaz'], siyah: [0x1f1f1f, 'Siyah'], gul: [0xd66a86, 'Gül pembesi'], toprak: [0x8a5a2b, 'Toprak'],
};
const LOWQ = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;

const sim = createSim({
  studio: { color: 0x6b5a48, mood: 'day', warmth: 0.35, key: { el: 58, az: 320, power: 1.0 }, fill: 0.8, radius: 20, height: 12 },
  look: { aoRadius: 0.06 },
  camera: { position: [0.3, 1.64, 0.78], target: [0.02, 0.93, -0.04], fov: 45, near: 0.02, far: 60 },
  controls: { minDistance: 0.45, maxDistance: 2.4, maxPolarAngle: Math.PI * 0.42 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Bir ebru atölyesinde, ceviz tezgâhın üstünde yaklaşık 72 × 54 cm'lik bir <b>ebru teknesi</b>; yanında boya kâseleri, gül dalı ve at kılından fırçalar, kâğıt destesi; duvarda kuruyan ebrular. Teknenin içinde <b>kitre</b> (bir bitki zamkı) ile koyulaştırılmış su var. Boyalar suyun yüzeyinde yüzer;
    her yeni damla eskileri <b>dışarı iter</b> ama karışmaz: eski damlalar halkaya dönüşür. Tarak ve biz (sivri çubuk) sıvıyı sürükleyerek desen çizer.
    "Kâğıda bas" deyince kâğıt yüzeye yatırılır, boyayı alır ve kaldırılır — gerçek ebrudaki gibi desen bir kez basılır.</p>
    <h3>Nasıl kullanılır?</h3>
    <ul>
      <li><b>💧 Damla</b>: tekneye tıkla. <b>✨ Serpme</b>: fırçayla serper gibi çok sayıda küçük damla.</li>
      <li><b>✒️ Biz</b> ve <b>🪮 Tarak</b>: teknenin üzerinde sürükle (sürüklerken kamera dönmez). Tarak tüm tekne boyunca
      paralel dişlerle çeker.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li><b>Battal</b> hazır ayarı (serpilmiş zemin), sonra biz ile ileri-geri çizerek kendi <b>gelgit</b>ini yap.</li>
      <li>Kitreyi en aza indir: sıvı uzun süre akar, desen dağılır. En çoğa çıkar: hareket hemen söner, çizgiler keskin kalır.</li>
      <li>Aynı yere üst üste farklı renkte damlalar bırak: halkalar oluşur (her damla öncekileri alanını koruyarak halkaya çevirir).</li>
      <li>"Bülbül yuvası" ve "Çiçekli (lale)" hazır ayarlarını izle, sonra kâğıda bas.</li>
    </ul>
    <h3>Akışkanlar dinamiği ve matematik</h3>
    <p>Elle sürüklemede hareket, sıkıştırılamaz <b>Navier–Stokes</b> denklemleriyle hesaplanır (Jos Stam, "Stable Fluids", SIGGRAPH 1999):
    her adımda hız alanı <b>kendini taşır</b> (adveksiyon), <b>viskozite</b> ile yayılır ve <b>basınç izdüşümü</b> ile
    ıraksaması sıfırlanır (su sıkışmaz). Boya lekelerinin sınırları bu hız alanında taşınan noktalardır; nokta aralığı
    açılınca yeni nokta eklenir, bu yüzden çizgiler keskin kalır. Kitre viskoziteyi artırır: <b>Reynolds sayısı</b>
    düşer, akış ağdalı ve düzenli olur, desen bozulmadan kalır. Damla bırakma, alan koruyan
    <b>p' = c + (p − c)·√(1 + r²/|p − c|²)</b> dönüşümüyle yapılır; hazır desenlerde biz ve tarak çizgileri
    <b>p' = p + z·2<sup>−d/c</sup>·m</b> kayma dönüşümüyle uygulanır (d: çizgiye uzaklık, m: çekiş yönü) — Lu, Jaffer ve ark.,
    "Mathematical Marbling", 2012. Kayma dönüşümü de alanı korur.</p>
    <h3>Gerçek ebru</h3>
    <p>Ebru, kitreyle koyulaştırılmış su üzerine boya serpip fırça, biz ve tarakla desen oluşturup kâğıda aktarma sanatıdır.
    Boyaya katılan <b>öd</b> (sığır ödü) boyanın suyun üstünde açılmasını sağlar. Osmanlı döneminde hattatlar tarafından
    geliştirilmiş, usta–çırak ilişkisiyle aktarılmıştır. "Geleneksel Türk Ebru Sanatı" 2014'te <b>UNESCO İnsanlığın Somut
    Olmayan Kültürel Mirası Temsili Listesi</b>'ne alınmıştır. Başlıca türler: battal, gelgit, taraklı, şal, bülbülyuvası,
    çiçekli (lale, gelincik, papatya…; çiçekli ebru Necmeddin Okyay ile anılır).</p>
    <p><small>Sınırlar: iki boyutlu, tek katmanlı yüzey akışı; boyalar arası yüzey gerilimi ve boya kalınlığı modellenmedi;
    hız alanı 128 × 96 ızgarada çözülür. Kaynak: UNESCO ICH, "Ebru, Turkish art of marbling" (2014).</small></p>`,
});
sim.formatTime = () => `${drops} damla`;

// --- Akışkan (yalnız hız alanı; boya ayrıca vektör sınırlarla izlenir) ---
let u = new Float32Array(SIZE), v = new Float32Array(SIZE), u0 = new Float32Array(SIZE), v0 = new Float32Array(SIZE);
const P = new Float32Array(SIZE), DIV = new Float32Array(SIZE);
let drops = 0, dirty = true, activeSteps = 0;

function setBnd(b, x) {
  for (let j = 1; j <= NY; j++) {
    x[IX(0, j)] = b === 1 ? -x[IX(1, j)] : x[IX(1, j)];
    x[IX(NX + 1, j)] = b === 1 ? -x[IX(NX, j)] : x[IX(NX, j)];
  }
  for (let i = 1; i <= NX; i++) {
    x[IX(i, 0)] = b === 2 ? -x[IX(i, 1)] : x[IX(i, 1)];
    x[IX(i, NY + 1)] = b === 2 ? -x[IX(i, NY)] : x[IX(i, NY)];
  }
  x[IX(0, 0)] = 0.5 * (x[IX(1, 0)] + x[IX(0, 1)]);
  x[IX(0, NY + 1)] = 0.5 * (x[IX(1, NY + 1)] + x[IX(0, NY)]);
  x[IX(NX + 1, 0)] = 0.5 * (x[IX(NX, 0)] + x[IX(NX + 1, 1)]);
  x[IX(NX + 1, NY + 1)] = 0.5 * (x[IX(NX, NY + 1)] + x[IX(NX + 1, NY)]);
}
function linSolve(b, x, x0, a, c, iters) {
  const ic = 1 / c;
  for (let k = 0; k < iters; k++) {
    for (let j = 1; j <= NY; j++) {
      let id = IX(1, j);
      for (let i = 1; i <= NX; i++, id++) x[id] = (x0[id] + a * (x[id - 1] + x[id + 1] + x[id - SX] + x[id + SX])) * ic;
    }
    setBnd(b, x);
  }
}
function diffuse(b, x, x0, visc) {
  const a = DT * visc;
  linSolve(b, x, x0, a, 1 + 4 * a, 8);
}
function advect(b, d, d0, uu, vv) {
  for (let j = 1; j <= NY; j++) {
    for (let i = 1; i <= NX; i++) {
      const id = IX(i, j);
      let x = i - DT * uu[id], y = j - DT * vv[id];
      x = clamp(x, 0.5, NX + 0.5); y = clamp(y, 0.5, NY + 0.5);
      const i0 = x | 0, j0 = y | 0, s1 = x - i0, t1 = y - j0, s0 = 1 - s1, t0 = 1 - t1;
      const a = IX(i0, j0);
      d[id] = s0 * (t0 * d0[a] + t1 * d0[a + SX]) + s1 * (t0 * d0[a + 1] + t1 * d0[a + 1 + SX]);
    }
  }
  setBnd(b, d);
}
function project() {
  for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
    const id = IX(i, j);
    DIV[id] = -0.5 * (u[id + 1] - u[id - 1] + v[id + SX] - v[id - SX]);
    P[id] = 0;
  }
  setBnd(0, DIV); setBnd(0, P);
  linSolve(0, P, DIV, 1, 4, 18);
  for (let j = 1; j <= NY; j++) for (let i = 1; i <= NX; i++) {
    const id = IX(i, j);
    u[id] -= 0.5 * (P[id + 1] - P[id - 1]);
    v[id] -= 0.5 * (P[id + SX] - P[id - SX]);
  }
  setBnd(1, u); setBnd(2, v);
}
const kitreVisc = () => lerp(0.3, 6, kitre.value / 100);
const kitreDamp = () => lerp(0.4, 5, kitre.value / 100);
let lastEnergy = 0, maxSpeed = 0;
function fluidStep() {
  [u, u0] = [u0, u]; [v, v0] = [v0, v];
  u.set(u0); v.set(v0);
  diffuse(1, u, u0, kitreVisc()); diffuse(2, v, v0, kitreVisc());
  project();
  [u, u0] = [u0, u]; [v, v0] = [v0, v];
  advect(1, u, u0, u0, v0); advect(2, v, v0, u0, v0);
  project();
  // Boya sınırları: hız alanında RK2 ile taşınır
  if (maxSpeed > 0.05 || activeSteps > 0) applyMap(flowMap);
  const f = Math.exp(-kitreDamp() * DT);
  let e = 0, mx = 0;
  for (let id = 0; id < SIZE; id++) {
    u[id] *= f; v[id] *= f;
    const s = u[id] * u[id] + v[id] * v[id];
    e += s; if (s > mx) mx = s;
  }
  lastEnergy = e / (NX * NY);
  maxSpeed = Math.sqrt(mx);
}
function velAt(arr, x, y) {
  x = clamp(x, 0.5, NX + 0.5); y = clamp(y, 0.5, NY + 0.5);
  const i0 = x | 0, j0 = y | 0, s = x - i0, t = y - j0, a = IX(i0, j0);
  return (1 - s) * ((1 - t) * arr[a] + t * arr[a + SX]) + s * ((1 - t) * arr[a + 1] + t * arr[a + SX + 1]);
}
function flowMap(x, y, o) {
  const k1x = velAt(u, x, y), k1y = velAt(v, x, y);
  const mx = x + 0.5 * DT * k1x, my = y + 0.5 * DT * k1y;
  o[0] = x + DT * velAt(u, mx, my); o[1] = y + DT * velAt(v, mx, my);
}

// --- Boya filmi: her damla, sınır noktalarından oluşan kapalı bir çokgen (ızgara birimi; x 0,5…NX+0,5) ---
// Eski damlalar önce, yeniler üstte çizilir; alan koruyan dönüşümler çokgenleri iç içe halkalara çevirir.
const shapes = [];
const MAXE = 0.5, MINE = 0.14, LIM = 3;
let totalPts = 0;
const _o = [0, 0];
function applyMap(f) {
  totalPts = 0;
  for (let si = shapes.length - 1; si >= 0; si--) {
    const s = shapes[si], xs = s.x, ys = s.y, n = xs.length;
    const mx = new Float64Array(n), my = new Float64Array(n);
    for (let i = 0; i < n; i++) { f(xs[i], ys[i], _o); mx[i] = _o[0]; my[i] = _o[1]; }
    const nx = [], ny = [];
    const refine = (ax, ay, amx, amy, bx, by, bmx, bmy, d) => {
      const dx = bmx - amx, dy = bmy - amy;
      if (dx * dx + dy * dy <= MAXE * MAXE || d > 6) return;
      const cx = (ax + bx) / 2, cy = (ay + by) / 2;
      f(cx, cy, _o);
      const cmx = _o[0], cmy = _o[1];
      refine(ax, ay, amx, amy, cx, cy, cmx, cmy, d + 1);
      nx.push(cmx); ny.push(cmy);
      refine(cx, cy, cmx, cmy, bx, by, bmx, bmy, d + 1);
    };
    for (let i = 0; i < n; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      nx.push(mx[i]); ny.push(my[i]);
      refine(xs[i], ys[i], mx[i], my[i], xs[j], ys[j], mx[j], my[j], 0);
    }
    // Sıkışan bölgelerde nokta seyreltme + tekne dışına taşanları kenarda topla
    const kx = [], ky = [];
    let lx = 1e9, ly = 1e9, area = 0;
    for (let i = 0; i < nx.length; i++) {
      const x = clamp(nx[i], 0.5 - LIM, NX + 0.5 + LIM), y = clamp(ny[i], 0.5 - LIM, NY + 0.5 + LIM);
      if ((x - lx) ** 2 + (y - ly) ** 2 < MINE * MINE) continue;
      kx.push(x); ky.push(y); lx = x; ly = y;
    }
    for (let i = 0, m = kx.length; i < m; i++) { const j = (i + 1) % m; area += kx[i] * ky[j] - kx[j] * ky[i]; }
    if (kx.length < 3 || Math.abs(area) < 0.04) { shapes.splice(si, 1); continue; }
    s.x = kx; s.y = ky;
    totalPts += kx.length;
  }
  dirty = true;
}
const hexCss = (hex, k = 1) => {
  const r = Math.min(255, ((hex >> 16) & 255) * k) | 0, g = Math.min(255, ((hex >> 8) & 255) * k) | 0, b = Math.min(255, (hex & 255) * k) | 0;
  return `rgb(${r},${g},${b})`;
};
function drop(cx, cy, r, hex) {
  const r2 = r * r;
  applyMap((x, y, o) => {
    const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
    if (d2 < 1e-9) { o[0] = cx + r; o[1] = cy; return; }
    const s = Math.sqrt(1 + r2 / d2);
    o[0] = cx + dx * s; o[1] = cy + dy * s;
  });
  const n = clamp(Math.ceil((2 * Math.PI * r) / 0.4), 16, 360), xs = [], ys = [];
  for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; xs.push(cx + Math.cos(a) * r); ys.push(cy + Math.sin(a) * r); }
  // her damlada boyanın yoğunluğu biraz farklı (ton oynaması)
  const k = 0.92 + Math.random() * 0.14;
  shapes.push({ x: xs, y: ys, fill: hexCss(hex, k), edge: hexCss(hex, k * 0.72) });
  drops++;
  dirty = true;
}
// Jaffer: yönü m olan çizgi boyunca kayma; d = çizgiye dik uzaklık, yer değiştirme z·2^(−d/c)
function lineMap(bx, by, mx, my, z, c) {
  const nx = -my, ny = mx;
  return (x, y, o) => {
    const d = Math.abs((x - bx) * nx + (y - by) * ny), w = z * Math.pow(0.5, d / c);
    o[0] = x + mx * w; o[1] = y + my * w;
  };
}
// Tarak: aynı yönde paralel dişler (dişlerin katkıları toplanır; kayma olduğu için sıra önemsizdir)
function combMap(mx, my, gap, z, c, offset = 0) {
  const across = Math.abs(mx) >= Math.abs(my);   // yatay çekişte dişler y boyunca dizilir
  return (x, y, o) => {
    const q = (across ? y : x) - offset;
    const k0 = Math.round(q / gap);
    let w = 0;
    for (let k = k0 - 3; k <= k0 + 3; k++) w += Math.pow(0.5, Math.abs(q - k * gap) / c);
    o[0] = x + mx * w * z; o[1] = y + my * w * z;
  };
}
// Girdap (bülbül yuvası): halkalar merkez çevresinde döner, açı uzaklıkla söner → alan korunur
function swirlMap(cx, cy, ang, R) {
  return (x, y, o) => {
    const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy, a = ang * Math.exp(-d2 / (R * R));
    const c = Math.cos(a), s = Math.sin(a);
    o[0] = cx + dx * c - dy * s; o[1] = cy + dx * s + dy * c;
  };
}
// Biz ucu kısa bir yol boyunca: ucun çevresi uçla birlikte sürüklenir (yumuşak çekirdek)
function nudgeMap(tx, ty, dx, dy, c) {
  const ic = 1 / (c * c);
  return (x, y, o) => {
    const w = Math.exp(-((x - tx) ** 2 + (y - ty) ** 2) * ic);
    o[0] = x + dx * w; o[1] = y + dy * w;
  };
}
let zemin = null;   // yüzeyi tümüyle kaplayan ilk boya (yoksa kitreli su görünür)
function clearTray() {
  shapes.length = 0; zemin = null;
  u.fill(0); v.fill(0);
  drops = 0; totalPts = 0; dirty = true;
}

// Araç kuvveti: araç ucu çevresindeki sıvıyı aracın hızına çeker (yapışma)
function pull(x, y, dx, dy, rad) {
  const r2 = rad * rad, i0 = Math.max(1, Math.floor(x - rad * 2)), i1 = Math.min(NX, Math.ceil(x + rad * 2));
  const j0 = Math.max(1, Math.floor(y - rad * 2)), j1 = Math.min(NY, Math.ceil(y + rad * 2));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const d2 = (i - x) ** 2 + (j - y) ** 2;
    const w = Math.exp(-d2 / r2) * 0.9;
    const id = IX(i, j);
    u[id] += (dx * TOOL_SPEED - u[id]) * w;
    v[id] += (dy * TOOL_SPEED - v[id]) * w;
  }
}
function toolSegment(tool, a, b) {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-3) return;
  const dx = (b.x - a.x) / len, dy = (b.y - a.y) / len;
  const n = Math.max(1, Math.ceil(len));
  for (let s = 1; s <= n; s++) {
    const x = a.x + (b.x - a.x) * (s / n), y = a.y + (b.y - a.y) * (s / n);
    if (tool === 'biz') pull(x, y, dx, dy, 1.6);
    else {
      const sp = combGap.value;
      if (Math.abs(dx) >= Math.abs(dy)) for (let t = 1 + (sp / 2) % sp; t <= NY; t += sp) pull(x, t, dx, dy, 1.4);
      else for (let t = 1 + (sp / 2) % sp; t <= NX; t += sp) pull(t, y, dx, dy, 1.4);
    }
  }
  activeSteps = 45;
}

// --- Sahne (metre): ebru atölyesi. Tekne ve araçlar TG grubunda (1 birim = 9 cm → tekne içi 72 × 54 cm) ---
const K = 0.09, BY = 0.9;                       // grup ölçeği ve tezgâh üst yüzeyi (m)
const TG = new THREE.Group();
TG.scale.setScalar(K); TG.position.set(0, BY, 0);
sim.scene.add(TG);
if (sim.stage?.mesh) sim.stage.mesh.visible = false;
const addW = (o, cast = true) => { o.castShadow = cast; o.receiveShadow = true; sim.scene.add(o); return o; };
// uzun parça: ahşap halkaları nesnenin y ekseni boyunca uzansın diye geometri y'de uzun kurulur, mesh döndürülür
function plank(len, a, b, axis, material) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(a, len, b, 2, Math.min(a, b) * 0.12), material);
  if (axis === 'x') m.rotation.z = -Math.PI / 2;       // a → düşey, b → derinlik
  else if (axis === 'z') m.rotation.x = Math.PI / 2;   // a → genişlik, b → düşey
  m.castShadow = m.receiveShadow = true;
  return m;
}
const walnut = mat.wood({ color: 0x5a3a24, varnish: 0.7, scale: 1.4 });
const trayWood = mat.wood({ color: 0x7a4a2a, varnish: 0.8, scale: 0.2 });   // grup birimi 9 cm → halkalar ≈ 2,5 cm
{
  // zemin: pişmiş toprak karo
  const tiles = procedural({ key: 'eb-tile', bump: 0.02, params: { color: 0xa0543a, roughness: 0.8 },
    pattern: `
      vec2 q = p.xz / 0.3;
      vec2 f = abs(fract(q) - 0.5);
      float joint = smoothstep(0.47, 0.49, max(f.x, f.y));
      float n = fbm3(p*6.0, 3), t = h13(vec3(floor(q), 1.0));
      col *= 0.8 + 0.25*t + 0.12*n;
      col = mix(col, vec3(0.55, 0.52, 0.47), joint);
      rough = mix(rough, 0.95, joint); h = (1.0 - joint)*0.6 + n*0.2;` });
  const floor = addW(new THREE.Mesh(new THREE.PlaneGeometry(9, 9), tiles), false);
  floor.rotation.x = -Math.PI / 2; floor.position.z = 1.5;
  // duvarlar: kireç sıva
  const plaster = procedural({ key: 'eb-plaster', bump: 0.012, params: { color: 0xe3d9c6, roughness: 0.94 },
    pattern: `float n = fbm3(p*2.2, 4); col *= 0.88 + 0.16*n; h = n;` });
  addW(new THREE.Mesh(new THREE.BoxGeometry(6, 3, 0.12).translate(0.3, 1.5, -0.86), plaster), false);
  addW(new THREE.Mesh(new THREE.BoxGeometry(0.12, 3, 6).translate(-1.55, 1.5, 2.0), plaster), false);
  const skirt = mat.wood({ color: 0x4a3020, varnish: 0.4 });
  addW(plank(6, 0.1, 0.02, 'x', skirt)).position.set(0.3, 0.05, -0.79);
  // tezgâh: ceviz tabla + kayın bacaklar
  const top = plank(1.8, 0.05, 0.9, 'x', walnut);
  top.position.set(0.35, BY - 0.025, -0.02); addW(top);
  const beech = mat.wood({ color: 0x9c7450, varnish: 0.3 });
  for (const [x, z] of [[-0.49, -0.4], [1.19, -0.4], [-0.49, 0.36], [1.19, 0.36]]) addW(plank(BY - 0.05, 0.06, 0.06, 'y', beech)).position.set(x, (BY - 0.05) / 2, z);
  addW(plank(1.62, 0.08, 0.03, 'x', beech)).position.set(0.35, BY - 0.1, 0.38);
  addW(plank(1.62, 0.08, 0.03, 'x', beech)).position.set(0.35, BY - 0.1, -0.42);
  addW(plank(1.62, 0.025, 0.7, 'x', beech)).position.set(0.35, 0.18, -0.02);   // alt raf
}
// Tekne (TG grubunda, eski ölçüler): ceviz taban + dört kenar
const RIM = 0.35, RH = 0.8;
{
  const b = plank(W + RIM * 2, 0.2, H + RIM * 2, 'x', trayWood);
  b.position.y = 0.1; TG.add(b);
  const sides = [[0, (H + RIM) / 2, 'x', W + RIM * 2], [0, -(H + RIM) / 2, 'x', W + RIM * 2], [(W + RIM) / 2, 0, 'z', H], [-(W + RIM) / 2, 0, 'z', H]];
  for (const [x, z, ax, len] of sides) {
    const m = ax === 'x' ? plank(len, RH, RIM, 'x', trayWood) : plank(len, RIM, RH, 'z', trayWood);
    m.position.set(x, RH / 2 + 0.1, z); TG.add(m);
  }
  // pirinç köşe sacları
  const brass = mat.brushedMetal({ color: 0xb08a3c, rough: 0.3 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.5, 0.7, 2, 0.06), brass);
    c.position.set(sx * (W / 2 + RIM * 0.55), 0.55, sz * (H / 2 + RIM * 0.55)); c.castShadow = true; TG.add(c);
  }
}
// Yüzey dokusu: boya filmi tuvale vektör olarak çizilir (keskin sınırlar), üstüne pigment greni biner
const CW = LOWQ ? 1024 : 1536, CH = (CW * 3) / 4;
const cvs = document.createElement('canvas');
cvs.width = CW; cvs.height = CH;
const ctx = cvs.getContext('2d');
const grainTile = (() => {
  // pigment greni: çok ölçekli gürültü (gri 128 = etkisiz) + seyrek öd benekleri
  const n = 256, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d'), img = g.createImageData(n, n);
  const lat = (s) => { const a = new Float32Array(s * s); for (let i = 0; i < a.length; i++) a[i] = Math.random(); return a; };
  const oct = [[8, 0.45], [32, 0.3], [128, 0.25]].map(([s, w]) => [s, w, lat(s)]);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let val = 0;
    for (const [s, w, a] of oct) {
      const fx = (x / n) * s, fy = (y / n) * s, i0 = fx | 0, j0 = fy | 0, tx = fx - i0, ty = fy - j0;
      const sm = (t) => t * t * (3 - 2 * t), A = (i, j) => a[(j % s) * s + (i % s)];
      const a0 = A(i0, j0) + (A(i0 + 1, j0) - A(i0, j0)) * sm(tx), a1 = A(i0, j0 + 1) + (A(i0 + 1, j0 + 1) - A(i0, j0 + 1)) * sm(tx);
      val += (a0 + (a1 - a0) * sm(ty)) * w;
    }
    let k = 128 + (val - 0.5) * 70;
    if (Math.random() < 0.0025) k = 205;
    const o = (y * n + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = k; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
})();
const grainPat = ctx.createPattern(grainTile, 'repeat');
const tex = new THREE.CanvasTexture(cvs);
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = Math.min(8, sim.renderer.capabilities.getMaxAnisotropy());
const PXX = CW / NX, PXY = CH / NY;
function redraw() {
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = zemin == null ? WATER : hexCss(zemin, 0.97);
  ctx.fillRect(0, 0, CW, CH);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, CW / 1100);
  for (const s of shapes) {
    const xs = s.x, ys = s.y;
    ctx.beginPath();
    ctx.moveTo((xs[0] - 0.5) * PXX, (NY + 0.5 - ys[0]) * PXY);
    for (let i = 1; i < xs.length; i++) ctx.lineTo((xs[i] - 0.5) * PXX, (NY + 0.5 - ys[i]) * PXY);
    ctx.closePath();
    ctx.fillStyle = s.fill;
    ctx.fill();
    // pigmentin kenarda toplandığı ince koyu çizgi
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = s.edge;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = grainPat;
  ctx.fillRect(0, 0, CW, CH);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  tex.needsUpdate = true;
  dirty = false;
}
// su yüzeyi: kitreli su ıslak, hafif parlak; boya filmi dokusu üzerinde
const surface = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshPhysicalMaterial({
  map: tex, roughness: 0.32, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.07, specularIntensity: 0.5, envMapIntensity: 0.55 }));
surface.rotation.x = -Math.PI / 2;
surface.position.y = SURF_Y;
surface.receiveShadow = true;
TG.add(surface);
// sarkıt lamba: yansıması parlak su yüzeyinde görünür
const glint = new THREE.PointLight(0xffe2b8, 1.1, 4, 2);
glint.position.set(-0.28, 1.62, 0.12);
glint.castShadow = false;
sim.scene.add(glint);
{
  const shade = new THREE.Mesh(new THREE.LatheGeometry([[0.012, 0.16], [0.03, 0.15], [0.06, 0.1], [0.13, 0.02], [0.135, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 32),
    mat.paintedMetal({ color: 0x24493a, wear: 0.08 }));
  shade.material.side = THREE.DoubleSide;
  shade.position.set(-0.28, 1.64, 0.12); addW(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), mat.glow({ color: 0xffd9a0, intensity: 6 }));
  bulb.position.set(-0.28, 1.655, 0.12); sim.scene.add(bulb);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.2, 6), mat.rubber());
  cord.position.set(-0.28, 1.8 + 0.6, 0.12); sim.scene.add(cord);
}
// Tezgâh üstü: boya kâseleri + gül dalı/at kılı fırçalar, kâğıt destesi, öd şişesi
{
  const cols = ['lacivert', 'al', 'sari', 'yesil', 'turkuaz', 'beyaz'];
  const bowlGeo = new THREE.LatheGeometry([[0, 0], [0.03, 0], [0.042, 0.012], [0.048, 0.034], [0.05, 0.036], [0.045, 0.036], [0.04, 0.012], [0, 0.006]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
  const bowlMat = mat.ceramic({ color: 0xefe8da });
  const twig = mat.wood({ color: 0x6b4a2e, scale: 6 });
  const hair = mat.fabric({ color: 0xcdb58c, scale: 3 });
  cols.forEach((c, i) => {
    const x = 0.56 + (i % 3) * 0.12, z = 0.1 + Math.floor(i / 3) * 0.13;
    const bowl = addW(new THREE.Mesh(bowlGeo, bowlMat)); bowl.position.set(x, BY, z);
    const paint = new THREE.Mesh(new THREE.CircleGeometry(0.041, 24).rotateX(-Math.PI / 2), mat.plastic({ color: PALETTE[c][0], gloss: 0.85 }));
    paint.position.set(x, BY + 0.026, z); paint.receiveShadow = true; sim.scene.add(paint);
    // fırça: kâsenin kenarına yaslı
    const br = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.006, 0.26, 7).translate(0, 0.13, 0), twig);
    const tuft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.006, 0.05, 10).translate(0, -0.02, 0), hair);
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.012, 8), mat.fabric({ color: 0x3a2a1c }));
    stick.castShadow = tuft.castShadow = true;
    br.add(stick, tuft, wrap);
    br.position.set(x - 0.01, BY + 0.03, z + 0.01);
    br.rotation.set(0.25, i * 0.9, -1.05);
    sim.scene.add(br);
  });
  // aharlı ebru kâğıdı destesi
  const sheet = mat.fabric({ color: 0xf1e8d2, scale: 8 });
  for (let k = 0; k < 3; k++) {
    const s = addW(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.006, 0.28), sheet));
    s.position.set(0.86, BY + 0.003 + k * 0.006, -0.22); s.rotation.y = 0.05 * (k - 1) + 0.12;
  }
  // öd (sığır safrası) şişesi: kahverengi cam görünümü
  const bottle = addW(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.028, 0], [0.03, 0.004], [0.03, 0.085], [0.012, 0.11], [0.011, 0.13], [0, 0.13]].map(([r, y]) => new THREE.Vector2(r, y)), 24),
    mat.plastic({ color: 0x5a2e0e, gloss: 0.95 })));
  bottle.position.set(0.52, BY, -0.3);
  const cork = addW(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.01, 0.018, 12), mat.wood({ color: 0xb08a5a, scale: 8 })));
  cork.position.set(0.52, BY + 0.138, -0.3);
  // boya ezme taşı (mermer) ve ezgi
  const marble = mat.rock({ color: 0xd8d4cc, strata: 0.15 });
  const slab = addW(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.02, 0.16, 2, 0.004), marble)); slab.position.set(0.62, BY + 0.01, -0.12);
  const muller = addW(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.03, 0], [0.032, 0.006], [0.014, 0.03], [0.012, 0.07], [0.016, 0.08], [0, 0.085]].map(([r, y]) => new THREE.Vector2(r, y)), 20), marble));
  muller.position.set(0.66, BY + 0.02, -0.1);
}
// Duvar: kuruyan ebrular (ip ve mandal) + boya kavanozlu raf
function marbled(seed, cols, mode) {
  const w = 256, h = 192, a = document.createElement('canvas'), b = document.createElement('canvas');
  a.width = b.width = w; a.height = b.height = h;
  const g = a.getContext('2d');
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) {
    const x = r() * w, y = r() * h, rad = 6 + r() * 20;
    for (let k = 0; k < 3; k++) { g.fillStyle = '#' + PALETTE[cols[(i + k) % cols.length]][0].toString(16).padStart(6, '0'); g.beginPath(); g.arc(x, y, rad * (1 - k * 0.3), 0, Math.PI * 2); g.fill(); }
  }
  const src = g.getImageData(0, 0, w, h), dst = b.getContext('2d').createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sx = x, sy = y;
    if (mode > 0) sx = x + Math.round(10 * Math.sin(y * 0.09) * (Math.floor(y / 12) % 2 ? 1 : -1));
    if (mode > 1) sy = y + Math.round(8 * Math.sin(x * 0.12));
    sx = (sx + w) % w; sy = Math.min(h - 1, Math.max(0, sy));
    const i = (y * w + x) * 4, j = (sy * w + sx) * 4;
    for (let c = 0; c < 4; c++) dst.data[i + c] = src.data[j + c];
  }
  b.getContext('2d').putImageData(dst, 0, 0);
  const t = new THREE.CanvasTexture(b); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
{
  const WZ = -0.79;
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-1.3, 1.9], [-0.2, 1.84], [0.9, 1.86], [1.9, 1.92]].map(([x, y]) => new THREE.Vector3(x, y, WZ + 0.06))), 40, 0.003, 5), mat.fabric({ color: 0xb9a888 }));
  sim.scene.add(rope);
  const pin = mat.wood({ color: 0xc9a77a, scale: 10 });
  [[-0.95, 11, ['lacivert', 'sari', 'beyaz', 'al'], 1], [-0.2, 23, ['turkuaz', 'beyaz', 'toprak'], 2], [0.55, 37, ['al', 'lacivert', 'sari'], 0], [1.3, 51, ['yesil', 'gul', 'beyaz', 'lacivert'], 1]].forEach(([x, seed, cols, mode]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.345), new THREE.MeshStandardMaterial({ map: marbled(seed, cols, mode), roughness: 0.9, side: THREE.DoubleSide }));
    p.position.set(x, 1.86 - 0.18, WZ + 0.065); p.rotation.set(0.02, 0, (seed % 5 - 2) * 0.006); p.castShadow = true; p.receiveShadow = true;
    sim.scene.add(p);
    for (const dx of [-0.17, 0.17]) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.012), pin); c.position.set(x + dx, 1.85, WZ + 0.07); sim.scene.add(c); }
  });
  // raf ve boya kavanozları
  addW(plank(1.0, 0.03, 0.2, 'x', walnut)).position.set(1.0, 1.32, WZ + 0.1);
  const jarMat = mat.ceramic({ color: 0x3d5a78 }), lid = mat.wood({ color: 0x8a6440, scale: 6 });
  ['sari', 'al', 'lacivert', 'toprak', 'beyaz', 'siyah'].forEach((c, i) => {
    const x = 0.6 + i * 0.15;
    const j = addW(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.13, 20), i % 2 ? jarMat : mat.ceramic({ color: 0xe6dccb })));
    j.position.set(x, 1.335 + 0.065, WZ + 0.1);
    const l = addW(new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.018, 20), lid)); l.position.set(x, 1.335 + 0.139, WZ + 0.1);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0505, 0.0505, 0.03, 20, 1, true), mat.plastic({ color: PALETTE[c][0], gloss: 0.3 }));
    band.position.set(x, 1.38, WZ + 0.1); sim.scene.add(band);
  });
}

// Araç modelleri
const bizMesh = new THREE.Group();
{
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.01, 1.6, 8), mat.brushedMetal({ color: 0xd1d5db, rough: 0.25 }));
  rod.position.y = 0.8;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 10), mat.wood({ color: 0x7c4a21, varnish: 0.5, scale: 6 }));
  grip.position.y = 1.7;
  bizMesh.add(rod, grip);
}
bizMesh.visible = false;
TG.add(bizMesh);
const combMesh = new THREE.Group();
combMesh.visible = false;
TG.add(combMesh);
let combKey = '';
function buildComb(horizontalMove) {
  const key = combGap.value + (horizontalMove ? 'h' : 'v');
  if (key === combKey) return;
  combKey = key;
  combMesh.children.slice().forEach((c) => { c.geometry.dispose(); combMesh.remove(c); });
  const span = horizontalMove ? H : W, n = horizontalMove ? NY : NX, cell = span / n;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, span + 0.4), trayWood);
  bar.position.y = 0.9;
  combMesh.add(bar);
  const toothGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.85, 5);
  const toothMat = mat.brushedMetal({ color: 0xcbd5e1, rough: 0.28 });
  for (let t = 1 + (combGap.value / 2) % combGap.value; t <= n; t += combGap.value) {
    const m = new THREE.Mesh(toothGeo, toothMat);
    m.position.set(0, 0.45, horizontalMove ? span / 2 - (t - 0.5) * cell : -span / 2 + (t - 0.5) * cell);
    combMesh.add(m);
  }
  combMesh.rotation.y = horizontalMove ? 0 : Math.PI / 2;
}
const toWorld = (gx, gy) => [((gx - 0.5) / NX) * W - W / 2, H / 2 - ((gy - 0.5) / NY) * H];
function showTool(tool, g, dir) {
  const [x, z] = toWorld(g.x, g.y);
  if (tool === 'biz') { bizMesh.visible = true; combMesh.visible = false; bizMesh.position.set(x, SURF_Y, z); }
  else if (tool === 'tarak') {
    const hor = Math.abs(dir.x) >= Math.abs(dir.y);
    buildComb(hor);
    combMesh.visible = true; bizMesh.visible = false;
    combMesh.position.set(hor ? x : 0, SURF_Y, hor ? 0 : z);
  }
}
function hideTools() { bizMesh.visible = false; combMesh.visible = false; }

// Kâğıt
const paperPivot = new THREE.Group();
paperPivot.position.set(0, SURF_Y + 0.02, -H / 2);
const pcv = document.createElement('canvas');
pcv.width = LOWQ ? 768 : 1024; pcv.height = (pcv.width * 3) / 4;
const paperTex = new THREE.CanvasTexture(pcv);
paperTex.colorSpace = THREE.SRGBColorSpace;
const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
const paper = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.96, H * 0.96), paperMat);
paper.position.set(0, (H * 0.96) / 2 + H * 0.02, 0.001);
paperPivot.add(paper);
paperPivot.visible = false;
TG.add(paperPivot);
let paperAnim = -1; // <0: yok
function printPaper() {
  if (paperAnim >= 0 && paperAnim < 2.4) return;
  paperMat.map = null; paperMat.color.setHex(0xfaf6ea); paperMat.needsUpdate = true;
  paperPivot.visible = true;
  paperPivot.scale.setScalar(1);
  paperAnim = 0;
  sim.moveCamera([0, BY + 10.5 * K, 9.5 * K], [0, BY + 1.5 * K, -1.5 * K]);
}
function capture() {
  // Baskı, tekne görüntüsünün aynadaki hâlidir (kâğıt ters çevrilir); kâğıdı dik tutunca sol–sağ yer değiştirir
  if (dirty) redraw();
  const g = pcv.getContext('2d');
  g.save();
  g.translate(pcv.width, 0); g.scale(-1, 1);
  g.drawImage(cvs, 0, 0, pcv.width, pcv.height);
  g.restore();
  // aharlı kâğıt: boya kâğıdın dokusunu alır
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#fbf5e6';
  g.fillRect(0, 0, pcv.width, pcv.height);
  g.globalCompositeOperation = 'source-over';
  paperTex.needsUpdate = true;
  paperMat.map = paperTex; paperMat.color.setHex(0xffffff); paperMat.needsUpdate = true;
  printed++;
  clearTray();
  sim.toast('🖨 Desen kâğıda geçti; tekne temizlendi', 'good');
}
let printed = 0;

// --- İşlem kuyruğu (hazır ayarlar): damla, kayma (biz/tarak/girdap), biz yolu ---
let queue = [];
let cur = null;
const dropOp = (x, y, r, hex) => queue.push({ type: 'drop', x, y, r, hex });
// kayma: mk(k) k kesirlik dönüşümü verir (kaymalar ve aynı merkezli dönmeler toplanabilir → parça parça uygulanabilir)
const shearOp = (mk, tool, from, to, dur = 0.7) => queue.push({ type: 'shear', mk, tool, from, to, dur, t: 0 });
const pathOp = (pts, c = 1.5) => queue.push({ type: 'path', pts, c, k: 0 });
function pathStep(op) {
  const a = op.pts[op.k], b = op.pts[op.k + 1];
  applyMap(nudgeMap(a.x, a.y, b.x - a.x, b.y - a.y, op.c));
  op.k++;
}
function processQueue(dt) {
  let dropBudget = 8;
  while (queue.length || cur) {
    if (!cur) cur = queue.shift();
    if (cur.type === 'drop') {
      if (dropBudget-- <= 0) return;
      drop(cur.x, cur.y, cur.r, cur.hex);
      cur = null;
      continue;
    }
    if (cur.type === 'shear') {
      const df = Math.min(1 - cur.t, dt / cur.dur);
      if (df > 0) applyMap(cur.mk(df));
      cur.t += df;
      const f = Math.min(1, cur.t);
      if (cur.tool) showTool(cur.tool, { x: lerp(cur.from.x, cur.to.x, f), y: lerp(cur.from.y, cur.to.y, f) }, { x: cur.to.x - cur.from.x, y: cur.to.y - cur.from.y });
      if (cur.t >= 1 - 1e-6) { cur = null; hideTools(); }
      return;
    }
    // biz yolu: her karede birkaç adım
    for (let s = 0; s < 3 && cur.k < cur.pts.length - 1; s++) pathStep(cur);
    const a = cur.pts[Math.max(cur.k - 1, 0)], b = cur.pts[cur.k];
    showTool('biz', b, { x: b.x - a.x, y: b.y - a.y });
    if (cur.k >= cur.pts.length - 1) { cur = null; hideTools(); }
    return;
  }
}
// Hazır deseni animasyonsuz, bir kerede uygula (açılış karesi)
function runAll() {
  if (cur) { queue.unshift(cur); cur = null; }
  for (const op of queue) {
    if (op.type === 'drop') drop(op.x, op.y, op.r, op.hex);
    else if (op.type === 'shear') applyMap(op.mk(1 - op.t));
    else while (op.k < op.pts.length - 1) pathStep(op);
  }
  queue = [];
  hideTools();
}
const line = (x0, y0, x1, y1) => {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: lerp(x0, x1, i / n), y: lerp(y0, y1, i / n) }));
};
// Battal: ilk renk bol serpilip bütün yüzeyi kaplar (zemin); sonraki renkler sırayla serpilir, her kat öncekileri iter
function battal(colors, n = 300, rmin = 2.3, rmax = 5, base = true) {
  if (base) { zemin = PALETTE[colors[0]][0]; colors = colors.slice(1); }
  const per = Math.ceil(n / colors.length);
  colors.forEach((c, ci) => {
    const k = 1 - ci * 0.1;    // sonraki katların damlaları biraz daha küçük
    for (let i = 0; i < per; i++) dropOp(rand(1, NX), rand(1, NY), rand(rmin, rmax) * k, PALETTE[c][0]);
  });
}
// Gelgit: biz, teknenin bir ucundan öbürüne ileri-geri çekilir
function gelgit(gap = 6, horizontal = true, z = 9, c = 1.5) {
  let dir = 1;
  const span = horizontal ? NY : NX;
  for (let q = gap / 2 + 0.5; q < span; q += gap, dir = -dir) {
    const [mx, my] = horizontal ? [dir, 0] : [0, dir];
    const [bx, by] = horizontal ? [0, q] : [q, 0];
    const from = horizontal ? { x: dir > 0 ? 1 : NX, y: q } : { x: q, y: dir > 0 ? 1 : NY };
    const to = horizontal ? { x: dir > 0 ? NX : 1, y: q } : { x: q, y: dir > 0 ? NY : 1 };
    shearOp((k) => lineMap(bx, by, mx, my, z * k, c), 'biz', from, to, 0.45);
  }
}
function tarak(gap, vertical = true, z = 6, c = 1.1) {
  const off = 1 + (gap / 2) % gap;
  const [mx, my] = vertical ? [0, 1] : [1, 0];
  const from = vertical ? { x: NX / 2, y: 1 } : { x: 1, y: NY / 2 }, to = vertical ? { x: NX / 2, y: NY } : { x: NX, y: NY / 2 };
  combGap.set(gap);
  shearOp((k) => combMap(mx, my, gap, z * k, c, off), 'tarak', from, to, 1.2);
}
const PRESETS = {
  battal: () => battal(['lacivert', 'al', 'sari', 'beyaz']),
  gelgit: () => { battal(['lacivert', 'sari', 'al', 'turkuaz', 'beyaz'], 200); gelgit(6, true, 10, 1.5); },
  tarakli: () => { battal(['lacivert', 'al', 'sari', 'beyaz'], 260); gelgit(5, true, 10, 1.3); tarak(6, true, 6, 1.1); },
  bulbul: () => {
    battal(['lacivert', 'sari', 'al', 'beyaz'], 200); gelgit(5, true, 10, 1.3); tarak(8, true, 5, 1.2);
    // her gözde biz ile küçük bir sarmal çevrilir
    for (let y = 12; y < NY; y += 24) for (let x = 12; x < NX; x += 26) {
      const cx = x + ((y / 24) % 2) * 13, cy = y;
      if (cx > NX - 4) continue;
      shearOp((k) => swirlMap(cx, cy, 2.6 * Math.PI * k, 6.5), 'biz', { x: cx, y: cy }, { x: cx, y: cy }, 0.35);
    }
  },
  lale: () => {
    battal(['beyaz', 'turkuaz', 'sari'], 110, 2, 4.2);
    gelgit(9, true, 5, 2);
    const cx = NX / 2, cy = NY / 2 + 8;
    dropOp(cx, cy, 12, PALETTE.al[0]);
    dropOp(cx, cy - 2, 7, PALETTE.gul[0]);
    dropOp(cx, cy - 3, 3.5, PALETTE.sari[0]);
    for (let y = cy - 16; y > 10; y -= 5) dropOp(cx, y, 2.4, PALETTE.yesil[0]);
    dropOp(cx - 10, cy - 26, 4.2, PALETTE.yesil[0]);
    dropOp(cx + 10, cy - 30, 4.2, PALETTE.yesil[0]);
    pathOp(line(cx, cy - 16, cx, cy + 6), 1.6);          // alttan yukarı: lalenin çentiği
    pathOp(line(cx - 11, cy + 14, cx - 4, cy + 3), 1.3); // taç yaprak uçları
    pathOp(line(cx + 11, cy + 14, cx + 4, cy + 3), 1.3);
    pathOp(line(cx, 9, cx, cy - 13), 1.2);               // sap
    pathOp(line(cx - 17, cy - 33, cx - 3, cy - 21), 1.5); // yapraklar
    pathOp(line(cx + 17, cy - 37, cx + 3, cy - 25), 1.5);
  },
};

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır desenler');
let presetKey = 'tarakli';
function applyPreset(v, instant = false) {
  presetKey = v;
  queue = []; cur = null; hideTools(); clearTray();
  PRESETS[v]();
  if (instant) runAll();
}
ui.segmented({ options: [{ value: 'battal', label: 'Battal' }, { value: 'gelgit', label: 'Gelgit' }, { value: 'tarakli', label: 'Taraklı' },
  { value: 'bulbul', label: 'Bülbül yuvası' }, { value: 'lale', label: 'Çiçekli (lale)' }],
  value: presetKey, onChange: (v) => applyPreset(v) });

ui.section('Araç ve boya');
const tool = ui.segmented({ options: [{ value: 'damla', label: '💧 Damla' }, { value: 'serp', label: '✨ Serpme' }, { value: 'biz', label: '✒️ Biz' }, { value: 'tarak', label: '🪮 Tarak' }], value: 'damla' });
const color = ui.segmented({ label: 'Boya', options: Object.entries(PALETTE).map(([k, [hex, name]]) => ({ value: k, label: `<span style="color:#${hex.toString(16).padStart(6, '0')};text-shadow:0 0 2px #fff8">●</span> ${name}` })), value: 'lacivert' });
const dropR = ui.slider({ label: 'Damla büyüklüğü', min: 2, max: 20, step: 1, value: 8, unit: 'birim' });
const combGap = ui.slider({ label: 'Tarak diş aralığı', min: 4, max: 16, step: 1, value: 8, unit: 'birim' });
const kitre = ui.slider({ label: 'Kitre (suyun koyuluğu)', min: 0, max: 100, step: 5, value: 60, unit: '%' });
ui.buttons([
  { label: '🖨 Kâğıda bas', variant: 'primary', onClick: () => printPaper() },
  { label: '🧽 Tekneyi temizle', onClick: () => { queue = []; cur = null; hideTools(); clearTray(); } },
]);

ui.section('Akış');
const sDrops = ui.stat({ label: 'Damla' });
const sSpeed = ui.stat({ label: 'En hızlı akış', unit: 'birim/sn' });
const sVisc = ui.stat({ label: 'Viskozite', unit: 'birim²/sn' });
const sPrint = ui.stat({ label: 'Basılan kâğıt' });
const chart = ui.chart({ title: 'Akışın kinetik enerjisi (kitre sönümler)', series: [{ name: 'enerji', color: '#38bdf8', fill: true }], maxPoints: 200, yMin: 0, format: (v) => fmt(v, 0) });
ui.text('Tekneye tıkla (damla) ya da biz/tarak seçip sürükle. Desen hoşuna gidince <b>Kâğıda bas</b>.', 'card');

// --- Etkileşim ---
const surfPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(BY + SURF_Y * K));
function toGrid(ev) {
  const pw = sim.pointOnPlane(ev, surfPlane);
  const p = pw && TG.worldToLocal(pw.clone());
  if (!p || Math.abs(p.x) > W / 2 || Math.abs(p.z) > H / 2) return null;
  return { x: ((p.x + W / 2) / W) * NX + 0.5, y: ((H / 2 - p.z) / H) * NY + 0.5 };
}
let drag = null;
sim.dom.addEventListener('pointerdown', (ev) => {
  if (tool.value !== 'biz' && tool.value !== 'tarak') return;
  const g = toGrid(ev);
  if (!g) return;
  drag = { last: g, id: ev.pointerId };
  if (sim.controls) sim.controls.enabled = false;
}, { capture: true });
sim.dom.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const g = toGrid(ev);
  if (!g) return;
  toolSegment(tool.value, drag.last, g);
  showTool(tool.value, g, { x: g.x - drag.last.x, y: g.y - drag.last.y });
  drag.last = g;
});
const endDrag = () => { if (!drag) return; drag = null; hideTools(); if (sim.controls) sim.controls.enabled = true; };
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);

sim.onClick([surface], (hit, ev) => {
  const g = toGrid(ev);
  if (!g) return;
  const hex = PALETTE[color.value][0];
  if (tool.value === 'damla') drop(g.x, g.y, dropR.value, hex);
  else if (tool.value === 'serp') for (let i = 0; i < 18; i++) {
    const a = rand(0, Math.PI * 2), d = rand(0, dropR.value * 2.5);
    queue.push({ type: 'drop', x: clamp(g.x + Math.cos(a) * d, 1, NX), y: clamp(g.y + Math.sin(a) * d, 1, NY), r: rand(1.2, 2.8), hex });
  }
});

// --- Döngü ---
let chartT = 0;
sim.onUpdate((dt) => {
  processQueue(dt);
  const steps = clamp(Math.round(dt / DT), 1, 3);
  if (activeSteps > 0 || lastEnergy > 0.02) {
    for (let s = 0; s < steps; s++) fluidStep();
    activeSteps = Math.max(0, activeSteps - steps);
  } else { lastEnergy = 0; maxSpeed = 0; }
  chartT += dt;
  if (chartT > 0.2) { chartT = 0; chart.push([lastEnergy]); }
});
let uiT = 0, drawT = 1;
sim.onRender((rdt) => {
  drawT += rdt;
  if (dirty && drawT > 0.05) { drawT = 0; redraw(); }
  if (paperAnim >= 0 && paperAnim < 3) {
    paperAnim += sim.paused ? 0 : rdt;
    const a = paperAnim;
    if (a < 0.8) { paperPivot.rotation.x = Math.PI / 2; paperPivot.position.y = SURF_Y + 0.02 + (1 - a / 0.8) * 2.5; }
    else if (a < 1.2) { paperPivot.position.y = SURF_Y + 0.02; if (!paperMat.map) capture(); }
    else { const t = clamp((a - 1.2) / 1.2, 0, 1), e = t * t * (3 - 2 * t); paperPivot.rotation.x = lerp(Math.PI / 2, -0.5, e); paperPivot.scale.setScalar(lerp(1, 0.62, e)); paperPivot.position.y = SURF_Y + 0.02 + e * 0.6; }
  }
  uiT += rdt;
  if (uiT < 0.25) return;
  uiT = 0;
  sDrops.set(drops); sSpeed.set(fmt(maxSpeed, 1)); sVisc.set(fmt(kitreVisc(), 1)); sPrint.set(printed);
});

sim.onReset(() => { paperPivot.visible = false; sim.moveCamera([0.3, 1.64, 0.78], [0.02, 0.93, -0.04]); paperAnim = -1; chart.clear(); applyPreset(presetKey); });
applyPreset(presetKey, true);
redraw();
