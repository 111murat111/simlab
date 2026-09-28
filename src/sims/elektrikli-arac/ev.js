// Yerel yardımcılar (elektrikli-arac): ayrıntılı elektrikli otomobil (tekerlek davlumbazlı gövde profili, içe eğimli cam kabin,
// kapı derzleri, kollar, far/stop grupları, çok kollu jant + fren diski + kaliper), şarj istasyonu parçaları ve trafik lambası.
// Hepsi gerçek ölçek (m), +x = ileri.
import { THREE, mat, procedural, RoundedBoxGeometry, BufferGeometryUtils } from '@core';

let M = null;
function mats() {
  if (M) return M;
  M = {
    rubber: mat.rubber({ color: 0x18191b }),
    rim: mat.brushedMetal({ color: 0xc9ccd0, rough: 0.22 }),
    rimDark: mat.paintedMetal({ color: 0x2a2d31, wear: 0.05 }),
    disc: mat.brushedMetal({ color: 0x8d9095, rough: 0.45 }),
    caliper: mat.paintedMetal({ color: 0x2b2e33, wear: 0.05 }),
    well: mat.plastic({ color: 0x0d0e10, gloss: 0.05 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a0f14, roughness: 0.04, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x9aa4ad, roughness: 0.05, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.02 }),
    trim: mat.plastic({ color: 0x1c1e21, gloss: 0.25 }),
    gloss: mat.plastic({ color: 0x0b0c0e, gloss: 0.9 }),
    chrome: mat.brushedMetal({ color: 0xdfe2e5, rough: 0.12 }),
    plate: mat.plastic({ color: 0xf2f2ee, gloss: 0.3 }),
    euro: mat.plastic({ color: 0x1d3f9a, gloss: 0.3 }),
    head: mat.glow({ color: 0xf4f7ff, intensity: 2.4 }),
    drl: mat.glow({ color: 0xe8f1ff, intensity: 3.2 }),
    tail: mat.glow({ color: 0xff1f14, intensity: 1.7 }),
  };
  return M;
}

/** Araç tipi: 'hatch' (küçük), 'sedan' (kompakt, fastback), 'suv'. */
function dims(type) {
  if (type === 'suv') return { L: 4.7, W: 1.9, H: 1.66, sill: 0.44, belt: 1.06, wr: 0.37, wx: 1.45 };
  if (type === 'hatch') return { L: 4.05, W: 1.78, H: 1.52, sill: 0.34, belt: 0.92, wr: 0.33, wx: 1.25 };
  return { L: 4.7, W: 1.85, H: 1.44, sill: 0.3, belt: 0.88, wr: 0.34, wx: 1.44 };
}
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function bodyGeo(type) {
  const D = dims(type), bv = 0.1, x0 = -D.L / 2 + bv, x1 = D.L / 2 - bv;
  // Yan profil: kapalı ön (ızgarasız), kısa burun, yüksek bel çizgisi, iki tekerlek davlumbazı (kavis, pahın içinde kalır)
  const ra = D.wr + 0.045 + bv, dy = D.sill - D.wr, dx = Math.sqrt(ra * ra - dy * dy);
  const sh = new THREE.Shape();
  sh.moveTo(x0 + 0.12, D.sill);
  for (const cx of [-D.wx, D.wx]) {
    sh.lineTo(cx - dx, D.sill);
    sh.absarc(cx, D.wr, ra, Math.atan2(dy, -dx), Math.atan2(dy, dx), true);
  }
  sh.lineTo(x1 - 0.18, D.sill);
  sh.quadraticCurveTo(x1 + 0.02, D.sill + 0.02, x1, D.sill + 0.3);
  sh.quadraticCurveTo(x1 - 0.04, D.belt - 0.08, x1 - 0.55, D.belt - 0.02);
  sh.lineTo(x0 + (type === 'hatch' ? 0.1 : 0.3), D.belt + 0.03);
  sh.quadraticCurveTo(x0 - 0.02, D.belt, x0, D.belt - 0.28);
  sh.lineTo(x0, D.sill + 0.2);
  sh.quadraticCurveTo(x0, D.sill, x0 + 0.12, D.sill);
  const body = new THREE.ExtrudeGeometry(sh, { depth: D.W - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 3, curveSegments: 14 });
  body.translate(0, 0, -(D.W - 2 * bv) / 2);
  // Plan görünüşünde yuvarlatılmış burun/kuyruk ve içe çekilmiş marşpiyel
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), ax = Math.abs(x) / (D.L / 2);
    const k = (1 - 0.13 * ss(0.55, 1.02, ax) ** 1.5) * (1 - 0.035 * ss(D.sill + 0.16, D.sill - 0.02, y)) * (1 - 0.02 * ss(D.belt - 0.25, D.belt + 0.05, y));
    p.setZ(i, p.getZ(i) * k);
  }
  body.computeVertexNormals();
  // Kabin (camlar): akıcı fastback / dik hatchback / SUV; yukarı doğru içe eğimli (tumblehome)
  const fA = x1 - (type === 'suv' ? 1.1 : 1.3), rA = type === 'hatch' ? x0 + 0.12 : type === 'suv' ? x0 + 0.18 : x0 + 0.55;
  const roofF = fA - (type === 'suv' ? 0.55 : 0.85), roofR = rA + (type === 'hatch' ? 0.28 : type === 'suv' ? 0.15 : 0.95);
  const c = new THREE.Shape();
  c.moveTo(fA, D.belt - 0.02);
  c.quadraticCurveTo(roofF + 0.25, D.H - 0.1, roofF, D.H - 0.04);
  c.lineTo(roofR, D.H - 0.04);
  c.quadraticCurveTo(rA + (type === 'sedan' ? 0.35 : 0.05), D.H - 0.12, rA, D.belt - 0.02);
  c.lineTo(fA, D.belt - 0.02);
  const cw = D.W - 0.26;
  const cabin = new THREE.ExtrudeGeometry(c, { depth: cw - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 3, curveSegments: 12 });
  cabin.translate(0, 0, -(cw - 0.16) / 2);
  const q = cabin.attributes.position;
  for (let i = 0; i < q.count; i++) q.setZ(i, q.getZ(i) * (1 - 0.16 * ss(D.belt, D.H, q.getY(i))));
  cabin.computeVertexNormals();
  // Tavan kenarları (boya) — ortası panoramik cam kalır
  const rl = Math.abs(roofF - roofR) - 0.2, tw = cw * (1 - 0.16) / 2;
  const rails = [-1, 1].map((s) => new RoundedBoxGeometry(rl, 0.05, 0.14, 2, 0.02).translate((roofF + roofR) / 2, D.H + 0.005, s * (tw - 0.05)));
  return { D, body, cabin, rails, fA, rA, ra: ra - bv };
}

/** Jant: 5 çift kollu alaşım + göbek kapağı; arkasında fren diski ve kaliper. Dış grup z ekseninde döner. */
const WG = new Map();
function wheelGeos(r, w) {
  const key = r + ':' + w;
  if (WG.has(key)) return WG.get(key);
  const ri = r * 0.66;
  const tp = [[ri, -w / 2], [r * 0.9, -w / 2], [r * 0.98, -w * 0.42], [r, -w * 0.3], [r, w * 0.3], [r * 0.98, w * 0.42], [r * 0.9, w / 2], [ri, w / 2]];
  const tyre = new THREE.LatheGeometry(tp.map(([a, b]) => new THREE.Vector2(a, b)), 32).rotateX(Math.PI / 2);
  // jant çanağı (dudak + derin iç yüzey)
  const bp = [[ri * 0.99, w * 0.47], [ri * 1.02, w * 0.44], [ri * 0.94, w * 0.4], [ri * 0.9, -w * 0.3], [ri * 0.5, -w * 0.32]];
  const barrel = new THREE.LatheGeometry(bp.map(([a, b]) => new THREE.Vector2(a, b)), 32).rotateX(Math.PI / 2);
  // kollar: göbekten dudağa uzanan, dışa bombeli çift kol (5 × 2)
  const spokes = [];
  for (let k = 0; k < 10; k++) {
    const a = (Math.floor(k / 2) / 5) * Math.PI * 2 + (k % 2 ? 0.14 : -0.14);
    const s = new THREE.Shape();
    s.moveTo(ri * 0.2, -0.018); s.lineTo(ri * 0.93, -0.03); s.lineTo(ri * 0.93, 0.03); s.lineTo(ri * 0.2, 0.018);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1 });
    g.translate(0, 0, w * 0.34).rotateZ(a);
    spokes.push(g);
  }
  const hub = new THREE.CylinderGeometry(ri * 0.24, ri * 0.28, 0.06, 20).rotateX(Math.PI / 2).translate(0, 0, w * 0.38);
  const cap = new THREE.CylinderGeometry(ri * 0.11, ri * 0.11, 0.02, 16).rotateX(Math.PI / 2).translate(0, 0, w * 0.42);
  const disc = new THREE.CylinderGeometry(ri * 0.82, ri * 0.82, 0.03, 28).rotateX(Math.PI / 2).translate(0, 0, w * 0.05);
  const clean = (g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; };
  const G = { tyre, rim: BufferGeometryUtils.mergeGeometries([barrel, hub, ...spokes].map(clean)), cap, disc,
    caliper: new RoundedBoxGeometry(0.1, ri * 0.55, 0.07, 2, 0.02).translate(ri * 0.62, 0, w * 0.12) };
  WG.set(key, G);
  return G;
}
function wheel(r, w, flip) {
  const m = mats(), G = wheelGeos(r, w), g = new THREE.Group();
  // g (konum) → spin (z'de döner) → inner (sol tekerlekte ters çevrilmiş parçalar); kaliper dönmez
  const spin = new THREE.Group(), inner = new THREE.Group();
  inner.add(new THREE.Mesh(G.tyre, m.rubber), new THREE.Mesh(G.rim, m.rim), new THREE.Mesh(G.cap, m.rimDark), new THREE.Mesh(G.disc, m.disc));
  if (flip) inner.rotation.y = Math.PI;
  spin.add(inner);
  const calG = new THREE.Group(); calG.add(new THREE.Mesh(G.caliper, m.caliper)); if (flip) calG.rotation.y = Math.PI;
  g.add(spin, calG);
  g.userData.spin = spin;
  return g;
}

/**
 * Elektrikli otomobil. userData: body (boyalı gövde, material.color değiştirilebilir), wheels (z'de dönen gruplar),
 * port (şarj soketi konumu, yerel), L, W. petrol: true → ızgara + egzoz + yakıt kapağı (benzinli).
 */
export function makeEV(type = 'sedan', color = 0x38bdf8, { petrol = false } = {}) {
  const m = mats(), G = bodyGeo(type), D = G.D, g = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 });
  const add = (geo, mm, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mm); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const body = add(G.body, paint);
  add(G.cabin, m.glass);
  for (const r of G.rails) add(r, paint);
  // Tekerlek yuvaları: koyu iç astar (davlumbaz tünelinin tavanı) — araçtan karşıya bakılmaz
  for (const x of [-D.wx, D.wx]) {
    const well = new THREE.CylinderGeometry(G.ra - 0.01, G.ra - 0.01, D.W - 0.06, 22, 1, true, Math.PI / 2, Math.PI).rotateX(Math.PI / 2);
    const o = add(well, m.well, x, D.wr, 0); o.material.side = THREE.DoubleSide; o.castShadow = false;
    add(new THREE.CircleGeometry(G.ra - 0.01, 22), m.well, x, D.wr, 0).castShadow = false;
  }
  // Alt koruma kaplaması (mat siyah plastik) davlumbazlar arasında, ön/arka tampon altı
  add(new RoundedBoxGeometry(2 * D.wx - 2 * G.ra - 0.05, 0.12, D.W - 0.02, 2, 0.04), m.trim, 0, D.sill + 0.02, 0);
  add(new RoundedBoxGeometry(0.2, 0.14, D.W - 0.34, 2, 0.05), m.trim, D.L / 2 - 0.16, D.sill + 0.05, 0);
  add(new RoundedBoxGeometry(0.2, 0.16, D.W - 0.34, 2, 0.05), m.trim, -D.L / 2 + 0.16, D.sill + 0.08, 0);
  // Kapı derzleri + gömme kapı kolları (iki yan)
  const seam = new THREE.BoxGeometry(0.008, D.belt - D.sill - 0.18, 0.012);
  const bx = (G.fA + G.rA) / 2 + 0.1, doors = type === 'hatch' ? [G.fA + 0.05, bx, G.rA + 0.45] : [G.fA + 0.05, bx, G.rA + (type === 'sedan' ? 0.62 : 0.3)];
  for (let i = 0; i < doors.length; i++) if (Math.abs(Math.abs(doors[i]) - D.wx) < G.ra + 0.03) doors[i] = Math.sign(doors[i]) * (D.wx - G.ra - 0.04);
  for (const s of [-1, 1]) {
    for (const x of doors) add(seam, m.gloss, x, (D.belt + D.sill) / 2 + 0.02, s * (D.W / 2 - 0.004));
    add(new THREE.BoxGeometry(doors[2] - doors[0], 0.008, 0.012), m.gloss, (doors[0] + doors[2]) / 2, D.belt - 0.05, s * (D.W / 2 - 0.018));
    for (const x of [bx + 0.35, doors[2] + 0.3]) add(new RoundedBoxGeometry(0.2, 0.03, 0.02, 1, 0.008), m.chrome, x - 0.3, D.belt - 0.12, s * (D.W / 2 + 0.002));
    // yan cam alt çıtası (parlak siyah) ve ayna
    add(new RoundedBoxGeometry(G.fA - G.rA - 0.1, 0.035, 0.03, 1, 0.012), m.gloss, (G.fA + G.rA) / 2, D.belt - 0.005, s * ((D.W - 0.26) / 2 - 0.015));
    add(new RoundedBoxGeometry(0.2, 0.13, 0.18, 2, 0.05), paint, G.fA - 0.05, D.belt + 0.1, s * (D.W / 2 + 0.03));
    add(new RoundedBoxGeometry(0.06, 0.02, 0.08, 1, 0.008), m.drl, G.fA - 0.08, D.belt + 0.05, s * (D.W / 2 + 0.08));
  }
  // Ön: ince LED gündüz farı bandı, far grupları (lens + ışık), alt hava girişi, plaka
  add(new RoundedBoxGeometry(0.05, 0.035, D.W - 0.4, 1, 0.015), m.drl, D.L / 2 - 0.035, D.sill + 0.36, 0);
  for (const s of [-1, 1]) {
    add(new RoundedBoxGeometry(0.16, 0.11, 0.38, 2, 0.04), m.lens, D.L / 2 - 0.12, D.sill + 0.4, s * (D.W / 2 - 0.3));
    add(new RoundedBoxGeometry(0.1, 0.06, 0.26, 1, 0.02), m.head, D.L / 2 - 0.08, D.sill + 0.4, s * (D.W / 2 - 0.32));
    add(new RoundedBoxGeometry(0.08, 0.07, 0.3, 1, 0.025), m.tail, -D.L / 2 + 0.05, D.belt - 0.14, s * (D.W / 2 - 0.26));
  }
  add(new RoundedBoxGeometry(0.06, 0.12, D.W - 0.8, 2, 0.04), m.trim, D.L / 2 - 0.03, D.sill + 0.12, 0);
  add(new RoundedBoxGeometry(0.06, 0.05, D.W - 0.24, 1, 0.02), m.tail, -D.L / 2 + 0.035, D.belt - 0.14, 0);
  for (const [x, y] of [[D.L / 2 + 0.005, D.sill + 0.22], [-D.L / 2 - 0.005, D.sill + 0.32]]) {
    add(new THREE.BoxGeometry(0.012, 0.11, 0.52), m.plate, x, y, 0);
    add(new THREE.BoxGeometry(0.014, 0.11, 0.05), m.euro, x, y, 0.235);
  }
  if (petrol) {
    // Benzinli: ön ızgara + krom çerçeve, egzoz borusu, yakıt kapağı
    add(new RoundedBoxGeometry(0.06, 0.22, D.W - 0.7, 2, 0.04), m.trim, D.L / 2 - 0.04, D.sill + 0.2, 0);
    add(new RoundedBoxGeometry(0.05, 0.25, D.W - 0.65, 2, 0.03), m.chrome, D.L / 2 - 0.06, D.sill + 0.2, 0);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12).rotateZ(Math.PI / 2), m.chrome, -D.L / 2 + 0.02, D.sill - 0.06, D.W / 2 - 0.45);
    add(new RoundedBoxGeometry(0.02, 0.16, 0.16, 2, 0.05).rotateY(Math.PI / 2), paint, -D.L / 2 + 0.75, D.belt - 0.12, D.W / 2 + 0.01);
  }
  // Şarj soketi kapağı (sol ön çamurluk)
  const portX = D.L / 2 - 0.72, portY = D.belt - 0.12;
  if (!petrol) add(new RoundedBoxGeometry(0.2, 0.16, 0.02, 2, 0.04), paint, portX, portY, -D.W / 2 - 0.005);
  // Tekerlekler
  const wheels = [];
  for (const x of [-D.wx, D.wx]) for (const z of [-D.W / 2 + 0.17, D.W / 2 - 0.17]) {
    const w = wheel(D.wr, 0.24, z < 0); w.position.set(x, D.wr, z); w.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); g.add(w);
    wheels.push(w.userData.spin);
  }
  g.userData = { body, wheels, port: new THREE.Vector3(portX, portY, -D.W / 2 - 0.02), L: D.L, W: D.W };
  return g;
}

/** Güneş paneli hücre malzemesi (üst yüz: hücre ızgarası + bara + alüminyum çerçeve; 1,0 × 1,7 m modül için). */
export const pvMat = () => procedural({
  key: 'ea-pv-cells', params: { color: 0x0b1628, roughness: 0.1, metalness: 0.3 }, bump: 0.01,
  pattern: `vec3 a = axisDominant(pn);
    if (a.y > 0.5 && pn.y > 0.0) {
      vec2 uv = p.xz*vec2(6.0/1.0, 10.0/1.7) + vec2(3.0, 5.0);
      vec2 f = fract(uv);
      float gap = smoothstep(0.0, 0.05, min(f.x, 1.0 - f.x))*smoothstep(0.0, 0.05, min(f.y, 1.0 - f.y));
      float edge = step(0.03, min(min(p.x + 0.5, 0.5 - p.x), min(p.z + 0.85, 0.85 - p.z)));
      float bus = max(step(abs(f.x - 0.33), 0.014), step(abs(f.x - 0.66), 0.014));
      col = mix(vec3(0.78, 0.8, 0.83), vec3(0.025, 0.05, 0.12)*(0.85 + 0.3*h13(vec3(floor(uv), 3.0))), gap);
      col = mix(col, vec3(0.55, 0.57, 0.6), bus*gap);
      col = mix(vec3(0.72, 0.74, 0.77), col, edge);
      rough = mix(0.35, 0.06, gap*edge); metal = mix(0.85, 0.25, edge); h = gap;
    } else { col = vec3(0.7, 0.72, 0.75); rough = 0.35; metal = 0.9; }`,
});

/** Zemine boyanmış işaret dokusu (şarj park yeri: şimşekli fiş simgesi + numara), tuval ile. */
export function bayDecal(num) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 256, 512);
  x.fillStyle = '#f4f4ee';
  // araç + fiş simgesi (sade piktogram)
  x.lineWidth = 16; x.strokeStyle = '#f4f4ee'; x.lineJoin = 'round';
  x.beginPath(); x.roundRect(48, 70, 160, 150, 26); x.stroke();
  x.beginPath(); x.moveTo(140, 95); x.lineTo(104, 150); x.lineTo(132, 150); x.lineTo(114, 198); x.lineTo(156, 136); x.lineTo(128, 136); x.lineTo(146, 95); x.closePath(); x.fill();
  x.fillRect(118, 220, 20, 40);
  x.font = '800 120px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(num), 128, 380);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Trafik lambası (direk + gövde + siperlikli 3 lamba). Lambalar yerel +z'ye bakar. set(k): 0 kırmızı, 1 sarı, 2 yeşil yanık. */
const LIGHT_ON = [0xff3b3b, 0xffc21a, 0x2cff6a], LIGHT_OFF = [0x3a1414, 0x3a300e, 0x0f3a1c];
let SIG = null;
export function trafficLight() {
  if (!SIG) SIG = {
    pole: new THREE.LatheGeometry([[0.001, 0], [0.15, 0], [0.15, 0.12], [0.08, 0.22], [0.07, 3.9], [0.001, 3.95]].map(([a, b]) => new THREE.Vector2(a, b)), 14),
    body: new RoundedBoxGeometry(0.4, 1.12, 0.28, 2, 0.06),
    plate: new RoundedBoxGeometry(0.66, 1.36, 0.03, 2, 0.05),
    visor: new THREE.CylinderGeometry(0.15, 0.15, 0.24, 16, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2),
    bulb: new THREE.CircleGeometry(0.115, 24),
    mPole: mat.paintedMetal({ color: 0x3b3f44, wear: 0.25 }), mBody: mat.paintedMetal({ color: 0x1b1d20, wear: 0.12 }),
  };
  const g = new THREE.Group();
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  add(SIG.pole, SIG.mPole, 0, 0, 0);
  add(SIG.body, SIG.mBody, 0, 4.45, 0.12);
  add(SIG.plate, SIG.mBody, 0, 4.45, -0.04);
  const bulbs = [0, 1, 2].map((k) => {
    add(SIG.visor, SIG.mBody, 0, 4.82 - k * 0.37, 0.38);
    const b = add(SIG.bulb, mat.glow({ color: LIGHT_OFF[k], intensity: 0.4 }), 0, 4.82 - k * 0.37, 0.265);
    b.castShadow = false;
    return b;
  });
  let cur = -1;
  g.userData.set = (on) => {
    if (on === cur) return;
    cur = on;
    bulbs.forEach((b, k) => { b.material.emissive.setHex(k === on ? LIGHT_ON[k] : LIGHT_OFF[k]); b.material.emissiveIntensity = k === on ? 6 : 0.35; });
  };
  return g;
}
