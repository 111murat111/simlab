// Elektrik Devresi — deney tahtasında pil, ampul, anahtar, sigorta; düğüm gerilimi yöntemiyle (MNA) çözüm, akım parçacıkları.
import { createSim, THREE, fmt, clamp, rand, instanced, disposeObject } from '@core';

const G_WIRE = 1000;        // kablo/ampermetre/kapalı anahtar: 1 mΩ
const G_LEAK = 1e-9;        // yüzen düğümler için çok küçük kaçak
const P_NOM = 12;           // ampulün tam parlaklıktaki gücü (W)
const SPACING = 0.55;       // akım parçacıkları arası mesafe
const MAXDOTS = 600, MAXSPARK = 60;
const Y = 0.28;             // kablo yüksekliği

const sim = createSim({
  background: 0x0e1420,
  camera: { position: [0, 15.5, 13.2], target: [0, 0, 0.9], fov: 45 },
  controls: { minDistance: 6, maxDistance: 40 },
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

// --- Deney tahtası ---
{
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 640;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e4d4'; g.fillRect(0, 0, 1024, 640);
  g.fillStyle = '#c9c1aa';
  for (let x = 16; x < 1024; x += 24) for (let y = 16; y < 640; y += 24) g.fillRect(x - 3, y - 3, 6, 6);
  g.fillStyle = '#dc2626'; g.fillRect(0, 4, 1024, 3);
  g.fillStyle = '#2563eb'; g.fillRect(0, 633, 1024, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const board = new THREE.Mesh(new THREE.BoxGeometry(16, 0.4, 10), [
    new THREE.MeshStandardMaterial({ color: 0xd6cfbb }), new THREE.MeshStandardMaterial({ color: 0xd6cfbb }),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: 0xd6cfbb }),
    new THREE.MeshStandardMaterial({ color: 0xd6cfbb }), new THREE.MeshStandardMaterial({ color: 0xd6cfbb }),
  ]);
  board.position.y = -0.2;
  sim.scene.add(board);
  const table = new THREE.Mesh(new THREE.BoxGeometry(40, 0.5, 26), new THREE.MeshStandardMaterial({ color: 0x3b2f25, roughness: 0.9 }));
  table.position.y = -0.65;
  sim.scene.add(table);
}

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
const cyl = (r, len, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat); m.rotation.z = Math.PI / 2; return m; };

function build(key) {
  if (group) disposeObject(group);
  for (const k in byName) delete byName[k];
  group = new THREE.Group();
  sim.scene.add(group);
  const p = PRESETS[key];
  nodes = p.nodes.map(([x, z]) => new THREE.Vector3(x, Y, z));
  const copper = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.7, roughness: 0.35 });
  const solder = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.8, roughness: 0.3 });
  nodes.forEach((n) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), solder); s.position.copy(n); group.add(s); });
  els = p.els.map(([type, a, b, name]) => {
    const A = nodes[a], B = nodes[b], len = A.distanceTo(B);
    const g = new THREE.Group();
    g.position.copy(A).add(B).multiplyScalar(0.5);
    g.rotation.y = -Math.atan2(B.z - A.z, B.x - A.x);
    group.add(g);
    const el = { type, a, b, name, g, len, I: 0, closed: p.sw[name] ?? true, off: 0, R: 0, bi: 0 };
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
  const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); g.add(m); return m; };
  if (type === 'wire') { add(cyl(0.07, len, copper)); return; }
  const inner = type === 'bat' ? Math.min(len - 1, 3.2) : type === 'bulb' ? 0.9 : 1.5;
  const lead = (len - inner) / 2;
  add(cyl(0.06, lead, copper), -len / 2 + lead / 2);
  add(cyl(0.06, lead, copper), len / 2 - lead / 2);
  if (type === 'bat') {
    add(cyl(0.6, inner, new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 })), 0, 0.35);
    add(cyl(0.61, inner * 0.35, new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.6, roughness: 0.3 })), inner * 0.32, 0.35);
    add(cyl(0.22, 0.2, new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.2 })), inner / 2 + 0.1, 0.35);
    el.label = sim.label('', { parent: g, position: [0, 1.3, 0] });
    sim.label('+', { parent: g, position: [len / 2 - 0.3, 0.9, 0], className: 'plain' });
    sim.label('−', { parent: g, position: [-len / 2 + 0.3, 0.9, 0], className: 'plain' });
  } else if (type === 'bulb') {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.5, 18), new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.8, roughness: 0.3 })), 0, 0.25);
    el.glass = new THREE.MeshStandardMaterial({ color: 0xfff7e0, emissive: 0xffb347, emissiveIntensity: 0, transparent: true, opacity: 0.75, roughness: 0.1 });
    add(new THREE.Mesh(new THREE.SphereGeometry(0.58, 24, 16), el.glass), 0, 1.0);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffd08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    glow.rotation.set(0, 0, 0);
    el.glow = add(glow, 0, 1.0);
    el.label = sim.label(el.name, { parent: g, position: [0, 2.0, 0], className: 'clickable' });
    el.label.el.style.pointerEvents = 'none';
    el.pick = g;
  } else if (type === 'sw') {
    add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.18, 0.8), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 })), 0, 0.02);
    const postM = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.25 });
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 10), postM), -0.65, 0.2);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.35, 10), postM), 0.65, 0.2);
    const pivot = add(new THREE.Group(), -0.65, 0.36);
    const lever = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 0.22), postM);
    lever.position.x = 0.67;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
    knob.position.set(1.3, 0.05, 0);
    pivot.add(lever, knob);
    el.pivot = pivot;
    el.label = sim.label(el.name, { parent: g, position: [0, 1.2, 0], className: 'clickable' });
    el.label.el.style.pointerEvents = 'none';
    el.pick = g;
  } else if (type === 'fuse') {
    el.fglass = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.35, roughness: 0.05 });
    add(cyl(0.24, 1.1, el.fglass), 0, 0.3);
    const capM = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9, roughness: 0.25 });
    add(cyl(0.26, 0.22, capM), -0.66, 0.3); add(cyl(0.26, 0.22, capM), 0.66, 0.3);
    el.wireM = new THREE.MeshStandardMaterial({ color: 0x94a3b8, emissive: 0xff5a00, emissiveIntensity: 0 });
    el.filament = add(cyl(0.025, 1.1, el.wireM), 0, 0.3);
    el.label = sim.label('', { parent: g, position: [0, 1.0, 0], className: 'plain' });
  } else if (type === 'amm') {
    add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.1), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 })), 0, 0.25);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), new THREE.MeshBasicMaterial({ color: 0x1e293b }));
    face.rotation.x = -Math.PI / 2;
    add(face, 0, 0.51);
    el.label = sim.label('', { parent: g, position: [0, 1.25, 0] });
  }
}

// --- Voltmetre (ideal: devreye akım çekmez) ---
const vm = new THREE.Group();
vm.position.set(0, 0.3, 4.4);
vm.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.1), new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.5 })));
{
  const f = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshBasicMaterial({ color: 0x1e293b }));
  f.rotation.x = -Math.PI / 2; f.position.y = 0.31; vm.add(f);
}
sim.scene.add(vm);
const vmLabel = sim.label('', { parent: vm, position: [0, 1.0, 0] });
const LEADN = 24;
const leads = [0xef4444, 0x111827].map((c) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LEADN * 3), 3));
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: c }));
  l.frustumCulled = false;
  sim.scene.add(l);
  return l;
});
const _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3();
function layoutLeads() {
  const el = byName[st.vmTarget];
  leads.forEach((l) => (l.visible = !!el));
  if (!el) return;
  // Kırmızı uç: akımın girdiği (yüksek potansiyelli) uç
  const [hi, lo] = V[el.a] >= V[el.b] ? [el.a, el.b] : [el.b, el.a];
  [hi, lo].forEach((n, k) => {
    _p0.set(vm.position.x + (k ? 0.5 : -0.5), 0.6, vm.position.z - 0.4);
    _p1.copy(nodes[n]).lerp(el.g.position, 0.18);
    const arr = leads[k].geometry.attributes.position.array;
    for (let i = 0; i < LEADN; i++) {
      const t = i / (LEADN - 1);
      arr[i * 3] = _p0.x + (_p1.x - _p0.x) * t;
      arr[i * 3 + 1] = _p0.y + (_p1.y + 0.1 - _p0.y) * t + Math.sin(Math.PI * t) * 1.4;
      arr[i * 3 + 2] = _p0.z + (_p1.z - _p0.z) * t;
    }
    leads[k].geometry.attributes.position.needsUpdate = true;
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
      el.glass.emissiveIntensity = b * 2.2;
      el.glass.color.setHex(b > 0.02 ? 0xfff3c4 : 0xe2e8f0);
      el.glow.material.opacity = clamp(b, 0, 1) * 0.9;
      el.glow.scale.setScalar(1.2 + 3 * Math.sqrt(b));
    } else if (el.type === 'sw') {
      el.pivot.rotation.z = el.closed ? 0.06 : 0.75;
    }
  }
}
function syncFuseLook() {
  if (!fuse) return;
  fuse.filament.visible = !fuseBlown;
  fuse.fglass.color.setHex(fuseBlown ? 0x3f3f46 : 0xe0f2fe);
  fuse.fglass.opacity = fuseBlown ? 0.7 : 0.35;
  replaceBtn.disabled = !fuseBlown;
}

// --- Akım parçacıkları ve kıvılcımlar ---
const dotMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
const dots = instanced(new THREE.SphereGeometry(0.09, 8, 6), dotMat, MAXDOTS);
dots.frustumCulled = false;
sim.scene.add(dots);
const sparks = instanced(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffb020 }), MAXSPARK);
sparks.frustumCulled = false;
sim.scene.add(sparks);
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
  const a = dots.instanceMatrix.array;
  let n = 0;
  for (const el of els) {
    if (el.I === 0) continue;
    const A = nodes[el.a], B = nodes[el.b];
    for (let s = el.off; s < el.len && n < MAXDOTS; s += SPACING) {
      const t = s / el.len;
      mat(a, n++ * 16, A.x + (B.x - A.x) * t, Y + 0.1, A.z + (B.z - A.z) * t, 1);
    }
  }
  dots.count = n;
  dots.instanceMatrix.needsUpdate = true;
  dotMat.color.setHex(st.electrons ? 0x7dd3fc : 0xfde047);
  let sc = 0;
  const sa = sparks.instanceMatrix.array;
  for (let i = 0; i < MAXSPARK; i++) if (spk.life[i] > 0) mat(sa, sc++ * 16, spk.p[i * 3], spk.p[i * 3 + 1], spk.p[i * 3 + 2], 1);
  sparks.count = sc;
  sparks.instanceMatrix.needsUpdate = true;
  uiT += real;
  if (uiT > 0.25) { uiT = 0; refreshLabels(); }
});
let uiT = 0;
function mat(a, o, x, y, z, s) {
  a[o] = s; a[o + 1] = 0; a[o + 2] = 0; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = s; a[o + 11] = 0; a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}

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
