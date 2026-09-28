// Elektrik Devresi — deney tahtasında pil, ampul, anahtar, sigorta; düğüm gerilimi yöntemiyle (MNA) çözüm, akım parçacıkları.
import { createSim, THREE, fmt, clamp, rand, disposeObject, mat, procedural, RoundedBoxGeometry, textTexture } from '@core';
import { labRoom } from './labkit.js';

const G_WIRE = 1000;        // kablo/ampermetre/kapalı anahtar: 1 mΩ
const G_LEAK = 1e-9;        // yüzen düğümler için çok küçük kaçak
const P_NOM = 12;           // ampulün tam parlaklıktaki gücü (W)
const SPACING = 0.55;       // akım parçacıkları arası mesafe
const MAXDOTS = 600, MAXSPARK = 60;
const Y = 0.28;             // kablo yüksekliği

// Gerçek ölçek: deney tahtası 40 × 25 cm → 1 birim = 2,5 cm (U). Tahta laboratuvar tezgâhının üstünde.
const U = 0.025, BENCH = 0.9, TOP = BENCH + 0.4 * U;
const sim = createSim({
  studio: { color: 0xb9b4aa, mood: 'lab', warmth: 0.14, key: { el: 55, az: 152 }, radius: 22 },
  look: { aoRadius: 0.02 },
  camera: { position: [0.07, TOP + 0.25, 0.43], target: [0, TOP - 0.01, 0.0], fov: 42, near: 0.005, far: 100 },
  controls: { minDistance: 6 * U, maxDistance: 40 * U },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Deney tahtasında bir pil, ampuller, anahtarlar, bir sigorta ve bir ampermetre var. Sarı noktalar akımı gösterir;
    hızları o koldaki akımla orantılıdır. Devre, her düğüm için <b>Kirchhoff'un akım yasası</b> (giren = çıkan) yazılarak
    çözülür (düğüm gerilimi yöntemi, MNA).</p>
    <p><b>Ohm yasası:</b> V = I·R. <b>Güç:</b> P = V·I = I²·R. Ampulün parlaklığı harcadığı güçle artar.
    Seri bağlamada akım her yerde aynıdır, gerilim paylaşılır; paralel bağlamada gerilim aynıdır, akım paylaşılır.</p>
    <h3>Dene</h3>
    <ul>
      <li>Seri devrede bir ampule daha çok direnç ver: hepsi sönükleşir. Anahtarı aç: hepsi söner.</li>
      <li>Paralel devrede S2'yi aç: diğer ampuller etkilenmez ama ampermetredeki toplam akım azalır.</li>
      <li>"Kısa devre"de S2'ye tıkla: akım ampulü atlayıp neredeyse dirençsiz yoldan akar, sigorta atar.
      Sigorta akımını büyütürsen daha geç atar.</li>
      <li>Ampullere tıkla: voltmetre o ampulün uçlarına bağlanır.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Evdeki prizler paralel bağlıdır; bu yüzden her cihaz aynı 230 V'u alır ve biri kapanınca diğerleri çalışmaya devam
    eder. Sigorta ve otomatik sigortalar (kaçak akım rölesiyle birlikte) aşırı akımda devreyi keserek kabloların ısınıp
    yangın çıkarmasını önler. <b>Kısa devre tehlikelidir:</b> pil ya da prizle asla deneme yapma.</p>
    <p><small>Ampuller sabit dirençli kabul edildi (gerçek ampulün direnci ısındıkça artar). Pilin küçük bir iç direnci var;
    sigorta basit bir I²·t ısınma modeliyle atar.</small></p>`,
});

const st = { V: 12, r: 0.5, fuseA: 3, R: [12, 12, 12], electrons: false, preset: 'seri', vmTarget: 'L1' };

// --- Laboratuvar tezgâhı + deney tahtası (MDF delikli pano, 9,4 mm aralıklı delikler, kenarda +/− şeritleri) ---
// Elektronik tezgâhı: kayın masif tabla, üstünde antistatik (ESD) kauçuk paspas; arkada fayans duvar, raf, pencere
labRoom(sim.scene, { width: 3.2, depth: 0.75, benchH: BENCH, style: 'lab', wallZ: -0.36, top: procedural({
  // kayın masif (lamine) tabla: 4 cm'lik çıtalar, boyuna lif, çıta başına ton farkı, cilalı
  key: 'ed-beech', physical: true, bump: 0.0015, params: { color: 0xcaa274, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.2 },
  pattern: `
    float strip = floor(p.z/0.04);
    float sh = h13(vec3(strip, 1.7, 3.1));
    float w = fbm3(vec3(p.x*1.5, strip*3.7, p.z*9.0), 3);
    float fib = vn3(vec3(p.x*18.0 + w*4.0, strip, p.z*700.0));
    float fl = smoothstep(0.35, 0.8, fbm3(vec3(p.x*6.0 + strip*5.0, 0.0, p.z*60.0), 3));
    float seam = 1.0 - smoothstep(0.0, 0.0012, abs(fract(p.z/0.04 + 0.5) - 0.5)*0.04);
    col *= (0.86 + 0.2*sh)*(0.92 + 0.12*fib)*(1.0 - 0.1*fl);
    col = mix(col, col*vec3(0.75, 0.62, 0.5), seam*0.6*step(0.9, pn.y));
    rough = 0.4 + 0.1*fib; h = fib*0.5 - seam;`,
}) });
{
  const esd = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.003, 0.42, 2, 0.0012), procedural({
    key: 'ed-esd', bump: 0.004, params: { color: 0x51707e, roughness: 0.82 },
    pattern: `float n = fbm3(p*6.0, 3), s = vn3(p*140.0); col *= 0.88 + 0.16*n + 0.04*(s - 0.5); rough = 0.78 + 0.1*n; h = s*0.4;`,
  }));
  esd.position.set(0.02, BENCH + 0.0015, 0.0);
  sim.scene.add(esd);
  // Tezgâhtaki aletler: kablo makaraları, tornavida, yedek ampul kutusu
  const L = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  [[0xc0271f, -0.305, -0.1], [0x1b1d20, -0.265, -0.2], [0xe2b91c, 0.33, -0.2]].forEach(([c, x, z], i) => {
    const sp = new THREE.Group();
    const fl = mat.plastic({ color: 0x2b2d30, gloss: 0.4 });
    for (const y of [0.002, 0.036]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.004, 40), fl); f.position.y = y; sp.add(f);
    }
    const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.027, 0.03, 48, 1, true), procedural({
      key: 'ed-coil', bump: 0.0006, params: { color: c, roughness: 0.4 },
      pattern: `float r = abs(sin(p.y*1800.0)); col *= 0.7 + 0.35*sqrt(r); rough = 0.3 + 0.2*(1.0 - r); h = sqrt(r);`,
    }));
    coil.position.y = 0.019; sp.add(coil);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.041, 20, 1, true), fl); hub.position.y = 0.019; sp.add(hub);
    // makaradan sarkan serbest kablo ucu
    const tail = new THREE.CatmullRomCurve3([[0.027, 0.03, 0], [0.04, 0.02, 0.02], [0.05, 0.003, 0.05], [0.03 + i * 0.01, 0.003, 0.09]].map((q) => new THREE.Vector3(...q)));
    sp.add(new THREE.Mesh(new THREE.TubeGeometry(tail, 24, 0.0017, 6), mat.plastic({ color: c, gloss: 0.55 })));
    sp.position.set(x, BENCH, z); sp.rotation.y = i * 1.3 + 0.5;
    sim.scene.add(sp);
  });
  {
    const sd = new THREE.Group();
    const h = new THREE.Mesh(L([[0, 0], [0.008, 0], [0.011, 0.01], [0.011, 0.07], [0.0095, 0.085], [0.006, 0.095], [0, 0.096]], 12), mat.plastic({ color: 0xd03a22, gloss: 0.8 }));
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.075, 12), mat.brushedMetal({ color: 0xd2d5d9, rough: 0.2 }));
    sh.position.y = -0.037;
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.0045, 0.012, 0.0012), sh.material); tip.position.y = -0.078;
    sd.add(h, sh, tip);
    sd.rotation.set(0, 0.5, Math.PI / 2);
    sd.position.set(-0.17, BENCH + 0.014, 0.16);
    sim.scene.add(sd);
  }
  {
    const card = procedural({ key: 'ed-card', params: { color: 0xb88c58, roughness: 0.85 }, bump: 0.0008,
      pattern: `float n = fbm3(p*300.0, 3); col *= 0.9 + 0.12*n; h = n;` });
    const bx = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.03, 0.05, 2, 0.002), card);
    bx.position.set(0.3, BENCH + 0.015, -0.03); bx.rotation.y = -0.35;
    const lab = textTexture('E10 · 12 V · 1 W\n10 adet ampul', { size: 40, color: '#2a2016', bg: '#efe6d2', pad: 14 });
    const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06 / lab.userData.aspect), new THREE.MeshStandardMaterial({ map: lab, roughness: 0.8 }));
    lp.rotation.x = -Math.PI / 2; lp.position.y = 0.0152; bx.add(lp);
    sim.scene.add(bx);
  }
}
const content = new THREE.Group();
content.position.set(0, TOP, 0);
content.scale.setScalar(U);
sim.scene.add(content);
{
  const peg = procedural({
    key: 'ed-pegboard', scale: U, bump: 0.003,
    params: { color: 0xe3dcc8, roughness: 0.78 },
    pattern: `
      vec2 q = p.xz/0.0094; vec2 f = fract(q) - 0.5; float d = length(f);
      float w = fwidth(d)*1.5;
      float hole = (1.0 - smoothstep(0.16 - w, 0.16 + w, d))*aaW(vec3(q, 0.0))*step(0.9, pn.y);
      float n = fbm3(p*40.0, 3), fib = vn3(vec3(p.x*900.0, p.y*60.0, p.z*300.0));
      col *= 0.9 + 0.12*n + 0.05*fib;
      float edge = step(0.9, pn.y);
      col = mix(col, vec3(0.62, 0.1, 0.08), edge*(1.0 - smoothstep(0.0012, 0.0016, abs(p.z + 0.118)))*0.9);
      col = mix(col, vec3(0.1, 0.22, 0.6), edge*(1.0 - smoothstep(0.0012, 0.0016, abs(p.z - 0.118)))*0.9);
      col = mix(col, col*0.25, hole);
      rough = mix(0.72 + 0.1*n, 0.95, hole);
      h = -hole + n*0.2;`,
  });
  const board = new THREE.Mesh(new RoundedBoxGeometry(16, 0.4, 10, 3, 0.05), peg);
  board.position.y = -0.2;
  content.add(board);
  for (const [x, z] of [[-7.4, -4.4], [7.4, -4.4], [-7.4, 4.4], [7.4, 4.4]]) {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.2, 16), mat.rubber({ scale: U }));
    f.position.set(x, -0.5, z); content.add(f);
  }
}
const M = {
  copper: mat.brushedMetal({ color: 0xd08a55, rough: 0.28, scale: U }),
  brass: mat.brushedMetal({ color: 0xcfae62, rough: 0.3, scale: U }),
  steel: mat.brushedMetal({ color: 0xd2d5d9, rough: 0.22, scale: U }),
  black: mat.plastic({ color: 0x1b1d20, gloss: 0.5, scale: U }),
  red: mat.plastic({ color: 0xc0271f, gloss: 0.7, scale: U }),
  porcelain: mat.ceramic({ color: 0xf1eee6, scale: U }),
  yellow: mat.plastic({ color: 0xe2b91c, gloss: 0.35, scale: U }),
  blue: mat.plastic({ color: 0x1f6fb8, gloss: 0.35, scale: U }),
  lcd: new THREE.MeshStandardMaterial({ color: 0x0c0f10, roughness: 0.18, metalness: 0 }),
};

// --- Hazır devreler: düğümler (x, z) ve elemanlar (a → b) ---
const PRESETS = {
  seri: {
    nodes: [[-6, 3], [-6, -3], [-2, -3], [2, -3], [6, -3], [6, 3], [2, 3], [-2, 3]],
    els: [['bat', 0, 1, 'Pil'], ['fuse', 1, 2, 'Sigorta'], ['sw', 2, 3, 'S1'], ['amm', 3, 4, 'A'],
      ['bulb', 4, 5, 'L1'], ['bulb', 5, 6, 'L2'], ['bulb', 6, 7, 'L3'], ['wire', 7, 0]],
    sw: { S1: true },
  },
  paralel: {
    nodes: [[-6, 3], [-6, -3], [-3, -3], [0, -3], [3, -3], [6, -3], [6, 0], [6, 3], [3, 3], [0, 3], [-3, 3]],
    els: [['bat', 0, 1, 'Pil'], ['fuse', 1, 2, 'Sigorta'], ['sw', 2, 3, 'S1'], ['wire', 3, 4], ['wire', 4, 5],
      ['bulb', 3, 9, 'L1'], ['bulb', 4, 8, 'L2'], ['sw', 5, 6, 'S2'], ['bulb', 6, 7, 'L3'],
      ['wire', 7, 8], ['wire', 8, 9], ['amm', 9, 10, 'A'], ['wire', 10, 0]],
    sw: { S1: true, S2: true },
  },
  karisik: {
    nodes: [[-6, 3], [-6, -3], [-3, -3], [0, -3], [3, -3], [6, -3], [6, 3], [3, 3], [0, 3], [-3, 3]],
    els: [['bat', 0, 1, 'Pil'], ['fuse', 1, 2, 'Sigorta'], ['sw', 2, 3, 'S1'], ['bulb', 3, 4, 'L1'], ['wire', 4, 5],
      ['bulb', 5, 6, 'L2'], ['bulb', 4, 7, 'L3'], ['wire', 6, 7], ['amm', 7, 8, 'A'], ['wire', 8, 9], ['wire', 9, 0]],
    sw: { S1: true },
  },
  kisa: {
    nodes: [[-6, 3], [-6, -3], [-2, -3], [2, -3], [6, -3], [6, 3], [2, 3], [-2, 3]],
    els: [['bat', 0, 1, 'Pil'], ['fuse', 1, 2, 'Sigorta'], ['sw', 2, 3, 'S1'], ['wire', 3, 4], ['bulb', 4, 5, 'L1'],
      ['wire', 5, 6], ['sw', 3, 6, 'S2'], ['amm', 6, 7, 'A'], ['wire', 7, 0]],
    sw: { S1: true, S2: false },
  },
};

// --- Devre durumu ---
let nodes = [], els = [], group = null, fuse = null;
let V = new Float64Array(16);
const heat = { v: 0 };
let fuseBlown = false;
const byName = {};

// --- Ortak görseller ---
let glowTex;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,220,140,.55)'); gr.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
function glassMesh(geo, th) {
  const m = new THREE.Mesh(geo, mat.glass({ thickness: th, rough: 0.02 }));
  m.userData.noCast = true; m.userData.noAO = true;
  return m;
}
const cyl = (r, len, m0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), m0); m.rotation.z = Math.PI / 2; return m; };
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
// PVC yalıtımlı kablolar: + tarafı kırmızı, − tarafı siyah, diğerleri sırayla
const INS = [0xc0271f, 0x1b1d20, 0xe2b91c, 0x1f6fb8, 0x2e8b57, 0xe0e0dc].map((c) => mat.plastic({ color: c, gloss: 0.55, scale: U }));
// Kablonun izi (grup yerel koordinatı, x ekseni boyunca): uçta klemense bağlanır, arada tahtaya sarkar, hafif yana kıvrılır
function slackCurve(p0, p1, sway, rest) {
  const dx = p1.x - p0.x, dz = p1.z - p0.z, L = Math.hypot(dx, dz), pts = [];
  const nx = L ? -dz / L : 0, nz = L ? dx / L : 0;
  const n = Math.max(5, Math.round(L * 2.5));
  const drop = Math.min(0.7, L * 0.3);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const l0 = Math.max(0, 1 - (t * L) / drop), l1 = Math.max(0, 1 - ((1 - t) * L) / drop);
    const y = rest + (p0.y - rest) * l0 * l0 * (3 - 2 * l0) + (p1.y - rest) * l1 * l1 * (3 - 2 * l1);
    const w = sway * Math.sin(Math.PI * t) * Math.min(1, L / 2.5);
    pts.push(new THREE.Vector3(p0.x + dx * t + nx * w, y, p0.z + dz * t + nz * w));
  }
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}
function wireMesh(curve, m, r = 0.07) {
  const w = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, Math.round(curve.getLength() * 8)), r, 8), m);
  return w;
}
// Parçacık yolu: yerel noktalar → içerik koordinatına (grup dönüşümü) çevrilmiş, eşit aralıklı örnekler
function setPath(el, localPts) {
  el.g.updateMatrix();
  const pts = localPts.map((p) => p.clone().applyMatrix4(el.g.matrix));
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  el.path = pts; el.cum = cum; el.plen = cum[cum.length - 1] || 1;
}
const _pp = new THREE.Vector3();
function pathAt(el, s) {
  const c = el.cum, P = el.path;
  let i = 1;
  while (i < c.length - 1 && c[i] < s) i++;
  const t = (s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
  return _pp.copy(P[i - 1]).lerp(P[i], clamp(t, 0, 1));
}
// Dijital ölçü aleti (multimetre): kauçuk kılıf, gri ön panel, yansımalı LCD (canvas), döner seçici, soketler
function makeMeter(holster) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.5, 2.5, 3, 0.16), holster);
  body.position.y = 0.25; g.add(body);
  const face = new THREE.Mesh(new RoundedBoxGeometry(1.42, 0.06, 2.2, 2, 0.04), mat.plastic({ color: 0x3a3f45, gloss: 0.3, scale: U }));
  face.position.y = 0.5; g.add(face);
  const c = document.createElement('canvas'); c.width = 256; c.height = 112;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.5), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }));
  lcd.rotation.x = -Math.PI / 2; lcd.position.set(0, 0.535, -0.62); g.add(lcd);
  const dial = new THREE.Mesh(lathe([[0, 0], [0.42, 0], [0.44, 0.04], [0.4, 0.12], [0, 0.12]], 40), mat.plastic({ color: 0x1f2226, gloss: 0.5, scale: U }));
  dial.position.set(0, 0.53, 0.25); g.add(dial);
  const ptr = new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.05, 0.36, 1, 0.02), mat.plastic({ color: 0xf1f1ee, scale: U }));
  ptr.position.set(0, 0.66, 0.12); g.add(ptr);
  [[-0.45, 0x1b1d20], [0, 0x1b1d20], [0.45, 0xc0271f]].forEach(([x, col]) => {
    const j = new THREE.Mesh(lathe([[0.05, 0], [0.12, 0], [0.12, 0.07], [0.05, 0.07], [0.05, 0.02]], 20), mat.plastic({ color: col, gloss: 0.6, scale: U }));
    j.position.set(x, 0.53, 0.85); g.add(j);
  });
  let last = '';
  g.userData.show = (txt, unit) => {
    const key = txt + unit;
    if (key === last) return;
    last = key;
    const x = c.getContext('2d');
    x.fillStyle = '#9aa592'; x.fillRect(0, 0, 256, 112);
    x.textBaseline = 'middle'; x.textAlign = 'right';
    x.font = '700 64px ui-monospace, monospace';
    x.fillStyle = '#1e2620'; x.fillText(txt, 196, 58);
    x.font = '700 34px ui-monospace, monospace'; x.textAlign = 'left'; x.fillText(unit, 204, 70);
    x.font = '600 18px sans-serif'; x.fillText('DC', 14, 20);
    tex.needsUpdate = true;
  };
  return g;
}
const lcdNum = (v) => (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',');

function build(key) {
  if (group) disposeObject(group);
  for (const k in byName) delete byName[k];
  group = new THREE.Group();
  content.add(group);
  const p = PRESETS[key];
  nodes = p.nodes.map(([x, z]) => new THREE.Vector3(x, Y, z));
  const copper = M.copper;
  // Düğümler: pirinç vidalı bağlantı klemensi (pul + yarıklı vida başı)
  nodes.forEach((n) => {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 20), M.brass); w.position.set(n.x, 0.03, n.z); group.add(w);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, Y + 0.08, 20), M.brass); h.position.set(n.x, (Y + 0.08) / 2, n.z); group.add(h);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.05), M.black); sl.position.set(n.x, Y + 0.09, n.z); sl.rotation.y = (n.x * 7 + n.z * 3) % 3; group.add(sl);
  });
  let ci = 0;
  els = p.els.map(([type, a, b, name]) => {
    const A = nodes[a], B = nodes[b], len = A.distanceTo(B);
    const g = new THREE.Group();
    g.position.copy(A).add(B).multiplyScalar(0.5);
    g.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x);
    group.add(g);
    const el = { type, a, b, name, g, len, I: 0, closed: p.sw[name] ?? true, off: 0, R: 0, bi: 0 };
    // kablo rengi: pilin − ucuna giden siyah, + ucuna giden kırmızı, diğerleri sırayla sarı/mavi/yeşil/beyaz
    el.col = a === 0 || b === 0 ? 1 : a === 1 || b === 1 ? 0 : 2 + (ci++ % 4);
    el.sway = (((a * 7 + b * 3) % 5) - 2) * 0.13;
    makeVisual(el, copper);
    if (name) byName[name] = el;
    return el;
  });
  fuse = byName.Sigorta;
  fuseBlown = false;
  heat.v = 0;
  syncFuseLook();
  solve();
}

function makeVisual(el, copper) {
  const { g, len, type } = el;
  const b0 = -Y;                     // tahta yüzeyi (grup yerel y)
  const REST = b0 + 0.075;           // tahtaya yatan kablonun ekseni
  const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); return m; };
  const ins = INS[el.col];
  const sway = el.sway;
  // Klemens vidası: pirinç pul + yarıklı baş
  const screw = (x, y, z) => {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 16), M.brass), x, y + 0.015, z);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.07, 14), M.brass), x, y + 0.065, z);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.025), M.black), x, y + 0.095, z).rotation.y = x * 3.1;
  };
  const endA = new THREE.Vector3(-len / 2, -0.05, 0), endB = new THREE.Vector3(len / 2, -0.05, 0);
  const leadPts = [];
  // A düğümünden p'ye ve q'dan B düğümüne yalıtımlı bağlantı kablosu
  const leads = (p, q, mA = ins, mB = ins) => {
    const cA = slackCurve(endA, p, sway, REST), cB = slackCurve(q, endB, -sway, REST);
    add(wireMesh(cA, mA)); add(wireMesh(cB, mB));
    // kablo ucunda soyulmuş bakır tel
    for (const e of [p, q]) add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), copper), e.x, e.y, e.z);
    leadPts[0] = cA.getPoints(Math.max(8, Math.round(cA.getLength() * 3)));
    leadPts[1] = cB.getPoints(Math.max(8, Math.round(cB.getLength() * 3)));
  };
  const V3 = (x, y, z = 0) => new THREE.Vector3(x, y, z);
  if (type === 'wire') {
    const c = slackCurve(endA, endB, sway, REST);
    add(wireMesh(c, ins));
    setPath(el, c.getPoints(Math.max(10, Math.round(c.getLength() * 3))));
    return;
  }
  if (type === 'bat') {
    // 8 × AA (1,5 V) seri pil yuvası: 2 sıra × 4 hücre, yay kontaklı siyah ABS kutu
    const HX = 2.25, HZ = 1.3;
    const box = procedural({ key: 'ed-abs', scale: U, params: { color: 0x202225, roughness: 0.55 },
      pattern: `float n = vn3(p*900.0); col *= 0.94 + 0.08*n; rough = 0.5 + 0.12*n;` });
    add(new THREE.Mesh(new RoundedBoxGeometry(HX * 2, 0.1, HZ * 2, 2, 0.03), box), 0, b0 + 0.05);
    for (const sx of [-1, 1]) add(new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.62, HZ * 2, 2, 0.04), box), sx * (HX - 0.07), b0 + 0.31);
    for (const sz of [-1, 1]) add(new THREE.Mesh(new RoundedBoxGeometry(HX * 2, 0.36, 0.1, 2, 0.03), box), 0, b0 + 0.18, sz * (HZ - 0.05));
    add(new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.3, HZ * 2 - 0.1, 1, 0.02), box), 0, b0 + 0.2);
    const wrapA = mat.plastic({ color: 0x1d5e3a, gloss: 0.75, scale: U }), wrapB = mat.plastic({ color: 0xd9d6cf, gloss: 0.75, scale: U });
    const band = mat.brushedMetal({ color: 0xc9a55a, rough: 0.3, scale: U });
    const coilGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 40 }, (_, i) => {
      const t = i / 39, a = t * Math.PI * 2 * 4; return V3(t * 0.15, Math.cos(a) * 0.12, Math.sin(a) * 0.12);
    })), 60, 0.018, 5);
    let k = 0;
    for (const z of [-0.93, -0.31, 0.31, 0.93]) for (const sx of [-1, 1]) {
      const cy = b0 + 0.38, cx = sx * 1.02, dir = (k++ % 2 ? 1 : -1);
      add(cyl(0.28, 1.84, dir > 0 ? wrapA : wrapB), cx, cy, z);
      add(cyl(0.283, 0.5, band), cx + dir * 0.62, cy, z);
      add(cyl(0.1, 0.1, M.steel), cx + dir * 0.96, cy, z);
      add(cyl(0.22, 0.04, M.steel), cx - dir * 0.93, cy, z);
      const sp = add(new THREE.Mesh(coilGeo, M.steel), cx - dir * 0.95, cy, z);
      if (dir > 0) sp.rotation.y = Math.PI;   // yay, hücrenin − ucundan dışa doğru uzanır
    }
    const pOut = V3(-HX + 0.06, b0 + 0.42, 0.93), qOut = V3(HX - 0.06, b0 + 0.42, -0.93);
    leads(pOut, qOut, INS[1], INS[0]);
    setPath(el, [...leadPts[0], V3(-1.6, b0 + 0.38, 0.93), V3(1.6, b0 + 0.38, 0.31), V3(-1.6, b0 + 0.38, -0.31), V3(1.6, b0 + 0.38, -0.93), ...leadPts[1]]);
    el.label = sim.label('', { parent: g, position: [0, 1.3, 0] });
    sim.label('+', { parent: g, position: [len / 2 - 0.3, 0.7, 0], className: 'plain' });
    sim.label('−', { parent: g, position: [-len / 2 + 0.3, 0.7, 0], className: 'plain' });
  } else if (type === 'bulb') {
    // Duy tabanı + bakalit E10 duy, pirinç vida dişli taban, cam balon, helis tungsten tel
    const plate = mat.plastic({ color: 0xe8e4da, gloss: 0.3, scale: U });
    add(new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.12, 1.1, 2, 0.04), plate), 0, b0 + 0.06);
    const bak = mat.plastic({ color: 0x17181a, gloss: 0.6, scale: U });
    add(new THREE.Mesh(lathe([[0, 0], [0.42, 0], [0.43, 0.05], [0.36, 0.12], [0.34, 0.4], [0.27, 0.43], [0.22, 0.41], [0, 0.41]], 40), bak), 0, b0 + 0.12);
    const thread = [];
    for (let i = 0; i <= 48; i++) { const t = i / 48; thread.push([0.2 + 0.022 * Math.sin(t * Math.PI * 2 * 5), t * 0.34]); }
    thread.unshift([0, -0.02], [0.12, -0.02], [0.18, 0]); thread.push([0.19, 0.36], [0.17, 0.37]);
    add(new THREE.Mesh(lathe(thread, 36), M.brass), 0, b0 + 0.5);
    const G0 = b0 + 0.84;
    const glassProf = [[0.17, 0], [0.19, 0.08], [0.26, 0.2], [0.4, 0.38], [0.48, 0.58], [0.5, 0.75], [0.47, 0.92], [0.38, 1.05], [0.22, 1.14], [0.001, 1.17]];
    add(glassMesh(lathe(glassProf, 48), 0.02), 0, G0);
    // cam taşıyıcı (stem) ve tel tutucular
    add(glassMesh(lathe([[0.12, 0], [0.1, 0.12], [0.05, 0.3], [0.04, 0.42], [0.001, 0.44]], 20), 0.02), 0, G0);
    const FY = G0 + 0.72;
    const coil = [];
    for (let i = 0; i <= 140; i++) { const t = i / 140, a = t * Math.PI * 2 * 9; coil.push(V3(-0.17 + 0.34 * t, FY + Math.cos(a) * 0.035, Math.sin(a) * 0.035)); }
    el.glass = mat.glow({ color: 0xffb35a, intensity: 0 });
    el.glass.color = new THREE.Color(0x3a3a3a);
    add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 280, 0.009, 4), el.glass));
    for (const sx of [-1, 1]) {
      const c = new THREE.CatmullRomCurve3([V3(sx * 0.03, G0 + 0.36), V3(sx * 0.1, G0 + 0.52), V3(sx * 0.18, FY)]);
      add(new THREE.Mesh(new THREE.TubeGeometry(c, 10, 0.011, 5), M.steel));
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    el.glow = add(glow, 0, FY);
    // Akkor telin çevreye saçtığı ışık (dünya ölçeğinde nokta ışık)
    el.light = add(new THREE.PointLight(0xffa850, 0, 0.6, 2), 0, FY);
    for (const sx of [-1, 1]) screw(sx * 0.78, b0 + 0.12, 0.28);
    leads(V3(-0.78, b0 + 0.19, 0.28), V3(0.78, b0 + 0.19, 0.28));
    setPath(el, [...leadPts[0], V3(-0.3, b0 + 0.3, 0.1), V3(0, FY, 0), V3(0.3, b0 + 0.3, 0.1), ...leadPts[1]]);
    el.label = sim.label(el.name, { parent: g, position: [0, 2.3, 0], className: 'clickable' });
    el.label.el.style.pointerEvents = 'none';
    el.pick = g;
  } else if (type === 'sw') {
    // Bıçak şalter: porselen taban, bakır menteşe ve yaylı çene, bakalit sap
    add(new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.24, 1.0, 2, 0.06), M.porcelain), 0, b0 + 0.12);
    const T = b0 + 0.24;
    for (const sz of [-1, 1]) {
      add(new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.42, 0.04, 1, 0.012), copper), -0.72, T + 0.21, sz * 0.055);
      add(new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.36, 0.04, 1, 0.012), copper), 0.74, T + 0.18, sz * 0.055);
    }
    add(new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.05, 0.2, 1, 0.01), copper), -0.72, T + 0.025);
    add(new THREE.Mesh(new RoundedBoxGeometry(0.32, 0.05, 0.2, 1, 0.01), copper), 0.74, T + 0.025);
    add(cyl(0.04, 0.2, M.steel), -0.72, T + 0.34).rotation.set(Math.PI / 2, 0, 0);
    const pivot = add(new THREE.Group(), -0.72, T + 0.34);
    const lever = new THREE.Mesh(new RoundedBoxGeometry(1.62, 0.16, 0.06, 1, 0.015), copper);
    lever.position.x = 0.75;
    const handle = new THREE.Mesh(lathe([[0, 0], [0.07, 0], [0.08, 0.1], [0.07, 0.35], [0.1, 0.48], [0.09, 0.56], [0, 0.58]], 24), M.black);
    handle.position.set(1.52, 0.05, 0);
    pivot.add(lever, handle);
    el.pivot = pivot;
    for (const sx of [-1, 1]) screw(sx * 0.88, T, 0.3);
    leads(V3(-0.88, T + 0.07, 0.3), V3(0.88, T + 0.07, 0.3));
    setPath(el, [...leadPts[0], V3(-0.72, T + 0.34), V3(0.74, T + 0.3), ...leadPts[1]]);
    el.label = sim.label(el.name, { parent: g, position: [0, 1.4, 0], className: 'clickable' });
    el.label.el.style.pointerEvents = 'none';
    el.pick = g;
  } else if (type === 'fuse') {
    // Cam kartuş sigorta, porselen yuvada yay klipsler
    add(new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.16, 0.8, 2, 0.04), M.porcelain), 0, b0 + 0.08);
    const T = b0 + 0.16;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) add(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.44, 0.03, 1, 0.01), M.steel), sx * 0.66, T + 0.2, sz * 0.24).rotation.x = -sz * 0.12;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.56), M.steel), sx * 0.66, T + 0.015);
    }
    const FYY = T + 0.34;
    const fg = glassMesh(new THREE.CylinderGeometry(0.2, 0.2, 1.1, 32, 1, true), 0.02);
    fg.rotation.z = Math.PI / 2;
    el.fglass = fg.material;
    add(fg, 0, FYY);
    add(cyl(0.215, 0.22, M.steel), -0.66, FYY); add(cyl(0.215, 0.22, M.steel), 0.66, FYY);
    el.wireM = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.3, emissive: 0xff5a00, emissiveIntensity: 0 });
    el.filament = add(cyl(0.02, 1.1, el.wireM), 0, FYY);
    for (const sx of [-1, 1]) screw(sx * 0.9, T, 0.22);
    leads(V3(-0.9, T + 0.07, 0.22), V3(0.9, T + 0.07, 0.22));
    setPath(el, [...leadPts[0], V3(-0.55, FYY), V3(0.55, FYY), ...leadPts[1]]);
    el.label = sim.label('', { parent: g, position: [0, 1.1, 0], className: 'plain' });
  } else if (type === 'amm') {
    // Ampermetre: devreye seri bağlı dijital multimetre (sarı kılıf); gövde dünya eksenine hizalı durur
    const m = makeMeter(mat.rubber({ color: 0xe0b020, scale: U }));
    m.position.set(0, b0, 0);
    m.rotation.y = -g.rotation.y;
    g.add(m);
    el.meter = m;
    m.updateMatrix();
    const jack = (x) => new THREE.Vector3(x, 0.6, 0.85).applyMatrix4(m.matrix);
    const jA = jack(0), jB = jack(0.45);
    // A (akım girişi) soketine kırmızı, COM soketine siyah ölçü kablosu; fişler dik takılı
    const plug = (p, pm) => {
      add(new THREE.Mesh(lathe([[0, 0], [0.1, 0], [0.11, 0.25], [0.085, 0.45], [0, 0.46]], 16), pm), p.x, p.y, p.z);
    };
    const pIn = jA.x < jB.x ? [jA, jB] : [jB, jA];      // grup yerelinde A tarafına yakın soket önce
    const [pa, pb] = pIn;
    const up = (p) => p.clone().add(V3(0, 0.46, 0));
    const cA = new THREE.CatmullRomCurve3([endA, V3(endA.x * 0.6 + pa.x * 0.4, REST, sway * 0.6), V3(pa.x, REST, (pa.z + (pa.z > 0 ? 1.2 : -1.2))), V3(pa.x, up(pa).y + 0.35, pa.z + (pa.z > 0 ? 0.45 : -0.45)), up(pa)], false, 'centripetal');
    const cB = new THREE.CatmullRomCurve3([up(pb), V3(pb.x, up(pb).y + 0.35, pb.z + (pb.z > 0 ? 0.45 : -0.45)), V3(pb.x, REST, (pb.z + (pb.z > 0 ? 1.2 : -1.2))), V3(endB.x * 0.6 + pb.x * 0.4, REST, -sway * 0.6), endB], false, 'centripetal');
    const redA = pa === jB;   // akım soketi (x=0,45) A tarafındaysa kırmızı kablo A'da
    add(wireMesh(cA, redA ? M.red : M.black, 0.06)); add(wireMesh(cB, redA ? M.black : M.red, 0.06));
    plug(pa, redA ? M.red : M.black); plug(pb, redA ? M.black : M.red);
    setPath(el, [...cA.getPoints(24), pa, pb, ...cB.getPoints(24)]);
    el.label = sim.label('', { parent: g, position: [0, 1.5, 0] });
  }
}

// --- Voltmetre (ideal: devreye akım çekmez): tahtanın önünde, ESD paspasta duran ikinci multimetre ---
const vm = makeMeter(mat.rubber({ color: 0xd8581c, scale: U }));
vm.position.set(4.6, -0.28, 7.2);
vm.rotation.y = 0.12;
content.add(vm);
vm.updateMatrix();
const vmLabel = sim.label('', { parent: vm, position: [0, 1.4, 0] });
// Ölçü kabloları: silikon kaplı esnek kablo (kırmızı / siyah) + prob kalemi; hedef değişince yeniden kurulur
const leads = [M.red, M.black].map((m) => {
  const l = new THREE.Mesh(new THREE.BufferGeometry(), m);
  l.frustumCulled = false;
  content.add(l);
  const probe = new THREE.Group();
  const body = new THREE.Mesh(lathe([[0, 0], [0.11, 0], [0.12, 0.9], [0.16, 0.95], [0.1, 1.05], [0.075, 1.4], [0, 1.42]], 18), m);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.005, 0.3, 8), M.steel);
  tip.position.y = 1.55;
  probe.add(body, tip);
  content.add(probe);
  l.userData.probe = probe;
  return l;
});
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function layoutLeads() {
  const el = byName[st.vmTarget];
  leads.forEach((l) => (l.visible = l.userData.probe.visible = !!el));
  if (!el) return;
  // Kırmızı uç: akımın girdiği (yüksek potansiyelli) uç
  const [hi, lo] = V[el.a] >= V[el.b] ? [el.a, el.b] : [el.b, el.a];
  [hi, lo].forEach((n, k) => {
    _p0.set(k ? 0 : 0.45, 0.6, 0.85).applyMatrix4(vm.matrix);
    _p1.copy(nodes[n]).lerp(el.g.position, 0.1);
    _p1.y = 0.1;
    // prob kalemi: klemense yaslanmış, tahtanın önüne doğru eğik
    const pr = leads[k].userData.probe;
    const back = new THREE.Vector3(0, 0.62, 1).normalize();
    pr.position.copy(_p1).addScaledVector(back, 1.85);
    pr.quaternion.setFromUnitVectors(_up, back.clone().negate());
    const tail = pr.position.clone();
    // soketten dik çıkar, aletin yanından paspasa iner, tahta kenarını aşıp prob kalemine gider
    const ex = tail.x < _p0.x ? -1 : 1;
    const pts = [
      _p0.clone(), _p0.clone().add(new THREE.Vector3(0, 0.45, 0.25)),
      new THREE.Vector3(_p0.x + ex * (1.3 + k * 0.35), -0.24, _p0.z + 0.2),
      new THREE.Vector3(_p0.x + ex * (1.5 + k * 0.35) + (tail.x - _p0.x) * 0.3, -0.24, 5.9 + k * 0.2),
      new THREE.Vector3(tail.x * 0.7 + _p0.x * 0.3 + k * 0.3, 0.1, 4.9),
      tail.clone().addScaledVector(back, 0.7), tail,
    ];
    leads[k].geometry.dispose();
    leads[k].geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 60, 0.06, 8);
  });
}

// --- Çözücü: düğüm gerilimi yöntemi (Norton eşdeğerli pil) ---
function conductance(el) {
  switch (el.type) {
    case 'wire': case 'amm': return G_WIRE;
    case 'sw': return el.closed ? G_WIRE : 0;
    case 'fuse': return fuseBlown ? 0 : G_WIRE;
    case 'bulb': return 1 / st.R[+el.name[1] - 1];
    case 'bat': return 1 / st.r;
  }
  return 0;
}
function solve() {
  const n = nodes.length, m = n - 1;           // düğüm 0 = pilin − ucu (toprak)
  const A = new Float64Array(m * m), bv = new Float64Array(m);
  const stamp = (i, j, g) => {
    if (i > 0) A[(i - 1) * m + (i - 1)] += g;
    if (j > 0) A[(j - 1) * m + (j - 1)] += g;
    if (i > 0 && j > 0) { A[(i - 1) * m + (j - 1)] -= g; A[(j - 1) * m + (i - 1)] -= g; }
  };
  for (let i = 0; i < m; i++) A[i * m + i] += G_LEAK;
  for (const el of els) {
    el.G = conductance(el);
    stamp(el.a, el.b, el.G);
    if (el.type === 'bat') { const J = st.V / st.r; if (el.b > 0) bv[el.b - 1] += J; if (el.a > 0) bv[el.a - 1] -= J; }
  }
  // Kısmi pivotlu Gauss eliminasyonu
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(A[r * m + c]) > Math.abs(A[p * m + c])) p = r;
    if (p !== c) { for (let k = 0; k < m; k++) { const t = A[c * m + k]; A[c * m + k] = A[p * m + k]; A[p * m + k] = t; } const t = bv[c]; bv[c] = bv[p]; bv[p] = t; }
    const d = A[c * m + c] || 1e-12;
    for (let r = c + 1; r < m; r++) {
      const f = A[r * m + c] / d;
      if (!f) continue;
      for (let k = c; k < m; k++) A[r * m + k] -= f * A[c * m + k];
      bv[r] -= f * bv[c];
    }
  }
  V = new Float64Array(n);
  for (let r = m - 1; r >= 0; r--) {
    let s = bv[r];
    for (let k = r + 1; k < m; k++) s -= A[r * m + k] * V[k + 1];
    V[r + 1] = s / (A[r * m + r] || 1e-12);
  }
  for (const el of els) {
    const dv = V[el.a] - V[el.b];
    el.I = el.type === 'bat' ? (st.V + dv) / st.r : el.G * dv;   // a → b yönünde akım
    if (Math.abs(el.I) < 1e-6) el.I = 0;
    if (el.type === 'bulb') { el.P = el.I * el.I / el.G || 0; el.U = Math.abs(dv); }
  }
  applyLooks();
  layoutLeads();
  refreshLabels();
}

function applyLooks() {
  for (const el of els) {
    if (el.type === 'bulb') {
      const b = clamp(Math.sqrt(el.P / P_NOM), 0, 1.4); // algılanan parlaklık ~ √P
      el.glass.emissiveIntensity = b * 14;
      el.glow.material.opacity = clamp(b, 0, 1) * 0.55;
      el.glow.scale.setScalar(0.6 + 1.8 * Math.sqrt(b));
      el.light.intensity = 0.03 * b * b;
    } else if (el.type === 'sw') {
      el.pivot.rotation.z = el.closed ? 0.0 : 0.8;
    }
  }
}
function syncFuseLook() {
  if (!fuse) return;
  fuse.filament.visible = !fuseBlown;
  fuse.fglass.color.setHex(fuseBlown ? 0x57524c : 0xffffff);   // atan sigortanın camı buharlaşan metalle kararır
  fuse.fglass.roughness = fuseBlown ? 0.35 : 0.03;
  replaceBtn.disabled = !fuseBlown;
}

// --- Akım parçacıkları ve kıvılcımlar ---
// Yumuşak ışıklı nokta sprite'ları (akım parçacıkları, kıvılcımlar)
const ptScale = { value: 400 };
function glowPoints(n, size, color, k) {
  const pos = new Float32Array(n * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const m = new THREE.ShaderMaterial({
    uniforms: { uScale: ptScale, uSize: { value: size * U }, uCol: { value: new THREE.Color(color).multiplyScalar(k) } },
    vertexShader: `uniform float uScale, uSize; void main(){ vec4 mv = modelViewMatrix*vec4(position, 1.0); gl_PointSize = uSize*uScale/max(-mv.z, 0.001); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uCol; void main(){ float r = length(gl_PointCoord - 0.5)*2.0; if (r > 1.0) discard;
      float core = smoothstep(0.5, 0.3, r), halo = exp(-r*r*4.5); gl_FragColor = vec4(uCol*(core + halo*0.5), max(core, halo*0.6)); }`,
    transparent: true, depthWrite: false,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false; p.renderOrder = 4;
  content.add(p);
  return { p, pos, g, m };
}
const dots = glowPoints(MAXDOTS, 0.3, 0xfde047, 2.2);
const dotMat = { color: dots.m.uniforms.uCol.value };
const sparks = glowPoints(MAXSPARK, 0.22, 0xffa42a, 5);
const spk = { p: new Float32Array(MAXSPARK * 3), v: new Float32Array(MAXSPARK * 3), life: new Float32Array(MAXSPARK) };

function burst(pos) {
  for (let i = 0; i < MAXSPARK; i++) {
    spk.p[i * 3] = pos.x; spk.p[i * 3 + 1] = pos.y + 0.3; spk.p[i * 3 + 2] = pos.z;
    const a = rand(0, Math.PI * 2), s = rand(1.5, 5);
    spk.v[i * 3] = Math.cos(a) * s; spk.v[i * 3 + 1] = rand(2, 6); spk.v[i * 3 + 2] = Math.sin(a) * s;
    spk.life[i] = rand(0.5, 1.2);
  }
}

function blow() {
  fuseBlown = true;
  heat.v = 0;
  syncFuseLook();
  burst(fuse.g.position);
  solve();
  sim.hud.show(`<h2>💥 Sigorta attı!</h2><p>Akım ${fmt(st.fuseA, 1)} A sınırını aştı; sigorta devreyi keserek kabloları korudu.
    ${hasShort() ? 'Kısa devre hâlâ var: önce <b>S2</b> anahtarını aç.' : ''}</p><button class="btn primary">🔧 Sigortayı değiştir</button>`, { tone: 'bad' });
  sim.hud.el.querySelector('button').onclick = () => replaceFuse();
  sim.toast('Sigorta attı!', 'bad');
}
function replaceFuse() {
  fuseBlown = false;
  heat.v = 0;
  syncFuseLook();
  solve();
  sim.hud.hide();
  sim.toast('Yeni sigorta takıldı', 'good');
}
const hasShort = () => st.preset === 'kisa' && byName.S2?.closed;

// --- Döngü ---
let chartT = 0;
sim.onUpdate((dt) => {
  // Sigorta ısınması (I²t): akım sınırın k katıysa ~0,5/(k² − 1) s içinde atar
  if (fuse && !fuseBlown) {
    const k = Math.abs(fuse.I) / st.fuseA;
    heat.v = k > 1 ? heat.v + (dt * (k * k - 1)) / 0.5 : Math.max(0, heat.v - dt * 0.6);
    if (heat.v >= 1) blow();
    fuse.wireM.emissiveIntensity = clamp(heat.v, 0, 1) * 2;
  }
  const kv = 1.4 * (st.electrons ? -1 : 1);
  for (const el of els) el.off = (((el.off + el.I * kv * dt) % SPACING) + SPACING) % SPACING;
  for (let i = 0; i < MAXSPARK; i++) {
    if (spk.life[i] <= 0) continue;
    spk.life[i] -= dt;
    spk.v[i * 3 + 1] -= 12 * dt;
    for (let c = 0; c < 3; c++) spk.p[i * 3 + c] += spk.v[i * 3 + c] * dt;
    if (spk.p[i * 3 + 1] < 0.05) { spk.p[i * 3 + 1] = 0.05; spk.v[i * 3 + 1] *= -0.4; }
  }
  chartT += dt;
  if (chartT >= 0.25) {
    chartT = 0;
    const b = ['L1', 'L2', 'L3'].map((n) => byName[n]?.P ?? 0);
    powChart.push(b);
  }
});

sim.onRender((real) => {
  const vp = sim.renderer.getDrawingBufferSize(_vp);
  ptScale.value = vp.y / (2 * Math.tan(THREE.MathUtils.degToRad(sim.camera.fov / 2)));
  const a = dots.pos;
  let n = 0;
  for (const el of els) {
    if (el.I === 0) continue;
    // parçacıklar kablonun gerçek (sarkık) izini ve eleman içindeki yolu izler
    for (let s = el.off; s < el.plen && n < MAXDOTS; s += SPACING) {
      const q = pathAt(el, s), o = n++ * 3;
      a[o] = q.x; a[o + 1] = q.y + 0.1; a[o + 2] = q.z;
    }
  }
  dots.g.setDrawRange(0, n);
  dots.g.attributes.position.needsUpdate = true;
  dotMat.color.setHex(st.electrons ? 0x7dd3fc : 0xfde047).multiplyScalar(2.2);
  let sc = 0;
  const sa = sparks.pos;
  for (let i = 0; i < MAXSPARK; i++) if (spk.life[i] > 0) { const o = sc++ * 3; sa[o] = spk.p[i * 3]; sa[o + 1] = spk.p[i * 3 + 1]; sa[o + 2] = spk.p[i * 3 + 2]; }
  sparks.g.setDrawRange(0, sc);
  sparks.g.attributes.position.needsUpdate = true;
  uiT += real;
  if (uiT > 0.25) { uiT = 0; refreshLabels(); }
});
let uiT = 0;
const _vp = new THREE.Vector2();

// --- Tıklama: anahtarlar ve ampuller ---
sim.onClick(() => els.filter((e) => e.pick).map((e) => e.pick), (hit) => {
  let o = hit.object;
  const el = els.find((e) => { let p = o; while (p) { if (p === e.pick) return true; p = p.parent; } return false; });
  if (!el) return;
  if (el.type === 'sw') setSwitch(el.name, !el.closed);
  else if (el.type === 'bulb') { vmSel.set(el.name, true); sim.toast(`Voltmetre ${el.name} uçlarına bağlandı`); }
});

function setSwitch(name, v) {
  const el = byName[name];
  if (!el) return;
  el.closed = v;
  swToggles[name]?.set(v);
  solve();
}

// --- Panel ---
const ui = sim.ui;
ui.section('Devre');
ui.segmented({
  options: [{ value: 'seri', label: 'Seri' }, { value: 'paralel', label: 'Paralel' }, { value: 'karisik', label: 'Karışık' }, { value: 'kisa', label: 'Kısa devre' }],
  value: st.preset, onChange: (v) => loadPreset(v),
});
const hint = ui.text('', '');
ui.toggle({ label: 'Elektron akışını göster (− → +)', value: false, onChange: (v) => { st.electrons = v; } });

ui.section('Pil ve sigorta');
ui.slider({ label: 'Pil gerilimi', min: 1.5, max: 24, step: 0.5, value: st.V, unit: 'V', onChange: (v) => { st.V = v; solve(); } });
ui.slider({ label: 'Pilin iç direnci', min: 0.1, max: 2, step: 0.1, value: st.r, unit: 'Ω', onChange: (v) => { st.r = v; solve(); } });
ui.slider({ label: 'Sigorta akımı', min: 0.5, max: 10, step: 0.5, value: st.fuseA, unit: 'A', onChange: (v) => { st.fuseA = v; refreshLabels(); } });
const heatMeter = ui.meter({ label: 'Sigorta ısınması', color: 'linear-gradient(90deg,#f59e0b,#ef4444)' });
const replaceBtn = ui.button({ label: '🔧 Sigortayı değiştir', variant: 'good', onClick: () => replaceFuse() });

ui.section('Ampuller ve anahtarlar');
const rSliders = [0, 1, 2].map((i) => ui.slider({ label: `L${i + 1} direnci`, min: 2, max: 60, step: 1, value: st.R[i], unit: 'Ω',
  onChange: (v) => { st.R[i] = v; solve(); } }));
const swToggles = {
  S1: ui.toggle({ label: 'S1 anahtarı kapalı', value: true, onChange: (v) => setSwitch('S1', v) }),
  S2: ui.toggle({ label: 'S2 anahtarı kapalı', value: true, onChange: (v) => setSwitch('S2', v) }),
};
ui.text('İpucu: 3B sahnede anahtarlara ve ampullere tıklayabilirsin.', '');

ui.section('Ölçümler');
const vmSel = ui.select({ label: 'Voltmetre bağlı', options: [], onChange: (v) => { st.vmTarget = v; layoutLeads(); refreshLabels(); } });
const stI = ui.stat({ label: 'Ampermetre', unit: 'A' });
const stU = ui.stat({ label: 'Voltmetre', unit: 'V' });
const stP = ui.stat({ label: 'Toplam güç', unit: 'W' });
const stReq = ui.stat({ label: 'Dış eşdeğer direnç', unit: 'Ω' });
const stTerm = ui.stat({ label: 'Pil uç gerilimi', unit: 'V' });
const stBat = ui.stat({ label: 'Pil akımı', unit: 'A' });
const table = ui.text('', '');
const powChart = ui.chart({ title: 'Ampul güçleri (W)', series: [{ name: 'L1', color: '#facc15' }, { name: 'L2', color: '#fb923c' }, { name: 'L3', color: '#f472b6' }], maxPoints: 200, yMin: 0 });

function refreshLabels() {
  if (!els.length) return;
  const bat = byName.Pil, amm = byName.A, term = V[bat.b] - V[bat.a];
  bat.label.setText(`${fmt(st.V, 1)} V`);
  amm.label.setText(`Ⓐ ${fmt(Math.abs(amm.I), 2)} A`);
  fuse.label.setText(fuseBlown ? '💥 attı' : `Sigorta ${fmt(st.fuseA, 1)} A`);
  let pSum = 0, rows = '';
  for (const el of els) {
    if (el.type === 'bulb') {
      pSum += el.P;
      el.label.setText(`${el.name} · ${fmt(el.P, 1)} W`);
      rows += `<tr><td><b>${el.name}</b></td><td>${fmt(st.R[+el.name[1] - 1], 0)} Ω</td><td>${fmt(el.U, 2)} V</td><td>${fmt(Math.abs(el.I), 2)} A</td><td>${fmt(el.P, 1)} W</td></tr>`;
    } else if (el.type === 'sw') el.label.setText(`${el.name} ${el.closed ? '(kapalı)' : '(açık)'}`);
  }
  const t = byName[st.vmTarget];
  const u = t ? Math.abs(V[t.a] - V[t.b]) : 0;
  vmLabel.setText(`Ⓥ ${fmt(u, 2)} V`);
  vm.userData.show(lcdNum(u), 'V');
  amm.meter?.userData.show(fuseBlown ? '0,00' : lcdNum(Math.abs(amm.I)), 'A');
  stI.set(fmt(Math.abs(amm.I), 2), fuseBlown ? 'bad' : Math.abs(amm.I) > st.fuseA ? 'warn' : '');
  stU.set(fmt(u, 2));
  stP.set(fmt(pSum, 1));
  stReq.set(Math.abs(bat.I) > 1e-4 ? fmt(term / Math.abs(bat.I), 2) : '∞');
  stTerm.set(fmt(term, 2));
  stBat.set(fmt(Math.abs(bat.I), 2), Math.abs(bat.I) > st.fuseA ? 'bad' : '');
  heatMeter.set(fuseBlown ? 1 : clamp(heat.v, 0, 1), fuseBlown ? 'attı' : `${fmt(Math.abs(fuse.I), 2)} / ${fmt(st.fuseA, 1)} A`);
  table.set(`<table style="width:100%;font-size:12px;border-collapse:collapse"><tr style="opacity:.7"><td>Ampul</td><td>R</td><td>V</td><td>I</td><td>P</td></tr>${rows}</table>`);
}

const HINTS = {
  seri: 'Üç ampul <b>seri</b>: aynı akım hepsinden geçer, pil gerilimi paylaşılır.',
  paralel: 'Üç ampul <b>paralel</b>: her biri pilin tam gerilimini alır; toplam akım kolların toplamıdır.',
  karisik: 'L1 seri, L2 ve L3 kendi aralarında paralel: L1 en parlak yanar.',
  kisa: '<b>S2</b>\'ye tıkla ya da aşağıdan kapat: akım ampulü atlar, sigorta atar.',
};
function loadPreset(key) {
  st.preset = key;
  build(key);
  const bulbs = els.filter((e) => e.type === 'bulb').map((e) => e.name);
  rSliders.forEach((s, i) => (s.el.style.display = i < bulbs.length ? '' : 'none'));
  for (const k in swToggles) {
    swToggles[k].el.style.display = byName[k] ? '' : 'none';
    if (byName[k]) swToggles[k].set(byName[k].closed);
  }
  vmSel.select.innerHTML = [...bulbs, 'Pil'].map((b) => `<option value="${b}">${b === 'Pil' ? 'Pilin uçları' : b + ' uçları'}</option>`).join('');
  if (!byName[st.vmTarget]) st.vmTarget = bulbs[0];
  vmSel.set(st.vmTarget);
  hint.set(HINTS[key]);
  powChart.clear();
  sim.hud.hide();
  solve();
}

sim.onReset(() => loadPreset(st.preset));
loadPreset('seri');
