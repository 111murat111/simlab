// Katman Katman İnsan — deri, kas, iskelet ve organ katmanları; tıkla-öğren ve "Organı bul" oyunu.
import { createSim, THREE, BufferGeometryUtils, ImprovedNoise, RoundedBoxGeometry, lerp, smoothstep, mat, procedural, textTexture } from '@core';
import { sdfMesh, sEllipsoid, sCone, sBox, loftTube, fbm , tissue } from './bio.js';
import { bodyItems, skinMaterial } from './human.js';

// Model birimi (u) → metre. İç yapı (kemik, organ) u biriminde kurulur, kök grup K ile ölçeklenir: boy ≈ 1,76 m.
const K = 0.254;
const C = (a) => a.map((v) => v * K);
const LOWQ = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;

const sim = createSim({
  studio: { mood: 'lab', color: 0x7d8286, warmth: 0.22, fill: 1.25, key: { el: 52, az: 208, power: 1.05 }, radius: 14, height: 7 },
  camera: { position: C([2.2, 4.6, 10.2]), target: C([0, 3.75, 0]), fov: 40, near: 0.03, far: 80 },
  controls: { minDistance: 2.2 * K, maxDistance: 16 * K, minPolarAngle: 0.75, maxPolarAngle: 1.72 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Anatomi müzesinin salonunda kaide üzerinde duran bir insan modeli dört katmandan oluşur: <b>deri</b>, <b>kaslar</b>,
    <b>iskelet</b> ve <b>iç organlar</b>. Her katmanı açıp kapatabilir, saydamlığını değiştirebilirsin. Bir parçaya
    tıkladığında adı, katmanı ve görevi bilgi kartında görünür, parça parlayarak vurgulanır.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>🧅 Katmanları soy</b> düğmesiyle deriden organlara doğru içeri gir.</li>
      <li>Modeli arkadan çevir: sırt kasları, kürek kemikleri ve böbrekler arkada saklanıyor.</li>
      <li>Kalbin attığını ve akciğerlerin nefes alıp verdiğini izle.</li>
      <li><b>Çocuk modu</b>: "Organı bul" oyununda verilen organı tıklayarak bul, puan topla.</li>
    </ul>
    <p><small>Model, yumuşakça kaynaşan matematiksel yüzeylerden kurulmuş basitleştirilmiş bir eğitim modelidir; organ boyut
    ve konumları yaklaşıktır (boy ≈ 1,76 m). Eğitim amaçlıdır, tıbbi tavsiye değildir.</small></p>`,
});

const scene = sim.scene;
const PLINTH = 0.07; // kaide yüksekliği (m)
const root = new THREE.Group();
root.scale.setScalar(K);
root.position.y = PLINTH;
scene.add(root);

// --- Kaide: cilalı ceviz gövde, fırçalanmış çelik bilezik, lastik taban ---
{
  const prof = [[0, 0], [0.5, 0], [0.505, 0.004], [0.505, 0.012], [0.495, 0.016], [0.49, 0.06], [0.482, 0.068], [0.47, 0.07], [0, 0.07]];
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 128);
  const wood = new THREE.Mesh(g, mat.wood({ color: 0x5a3a22, varnish: true, ring: 6, scale: 3 }));
  scene.add(wood);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.498, 0.006, 12, 128), mat.brushedMetal({ color: 0xb8bcc2 }));
  band.rotation.x = Math.PI / 2; band.position.y = 0.014; scene.add(band);
  const foot = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.47, 0], [0.475, 0.004], [0.46, 0.006], [0, 0.006]].map(([r, y]) => new THREE.Vector2(r, y)), 96), mat.rubber());
  foot.position.y = -0.004; scene.add(foot);
  // İsim plakası
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.004), mat.brushedMetal({ color: 0xc9a86a, rough: 0.25 }));
  plate.position.set(0, 0.037, 0.494); scene.add(plate);
}

// --- Anatomi salonu: terrazzo zemin, ahşap lambri, pano ve vitrinler, tavanda gömme ışık bantları ---
{
  const shell = [];
  const put = (m, x, y, z, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; };
  const terrazzo = procedural({
    key: 'ki-terrazzo', physical: true, bump: 0.004, params: { color: 0xc9c3b8, roughness: 0.28, clearcoat: 0.5, clearcoatRoughness: 0.18 },
    pattern: `
      vec2 q = p.xz/0.8; vec2 f = fract(q);
      float joint = smoothstep(0.0, 0.006, f.x)*smoothstep(1.0, 0.994, f.x)*smoothstep(0.0, 0.006, f.y)*smoothstep(1.0, 0.994, f.y);
      float tid = h13(vec3(floor(q), 3.0));
      float chip = cells3(p*26.0), chip2 = cells3(p*61.0 + 4.0);
      vec3 base = col*(0.94 + 0.08*tid + 0.06*fbm3(p*1.5, 3));
      base = mix(base, vec3(0.32, 0.3, 0.28), smoothstep(0.08, 0.02, chip)*0.8);
      base = mix(base, vec3(0.62, 0.42, 0.33), smoothstep(0.07, 0.02, chip2)*0.6);
      base = mix(base, vec3(0.93, 0.92, 0.9), smoothstep(0.06, 0.015, cells3(p*40.0 + 9.0))*0.7);
      col = mix(base*0.55, base, joint);
      rough = mix(0.6, 0.22 + 0.1*fbm3(p*3.0, 3), joint);
      h = joint*0.5;`,
  });
  const wallP = (color) => procedural({
    key: 'ki-wall', bump: 0.004, params: { color, roughness: 0.86 },
    pattern: `float n = fbm3(p*1.6, 4), g = vn3(p*70.0); col *= 0.94 + 0.08*n + 0.03*(g - 0.5); h = g*0.5 + n*0.5;`,
  });
  const oak = mat.wood({ color: 0x7a5534, varnish: true, scale: 1.6 });
  const steel = mat.brushedMetal({ color: 0xb9bdc2 });
  // Oda kabuğu (gölge atmaz: tepe ışığı içeri düşsün)
  shell.push(put(new THREE.Mesh(new THREE.BoxGeometry(13, 0.1, 10), terrazzo), 0, -0.054, -0.5));
  shell.push(put(new THREE.Mesh(new THREE.BoxGeometry(13, 4, 0.2), wallP(0xd8d2c6)), 0, 2, -4.6));
  for (const sx of [-1, 1]) shell.push(put(new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 10), wallP(0xcfc8ba)), sx * 6.5, 2, -0.5));
  shell.push(put(new THREE.Mesh(new THREE.BoxGeometry(13, 4, 0.2), wallP(0xd8d2c6)), 0, 2, 4.5));
  shell.push(put(new THREE.Mesh(new THREE.BoxGeometry(13, 0.12, 10), wallP(0xeeebe5)), 0, 4.06, -0.5));
  // Ahşap lambri (panel + üst pervaz) ve süpürgelik: arka ve yan duvarlar
  const wain = (len, x, z, ry) => {
    const g = new THREE.Group();
    const back = new THREE.Mesh(new RoundedBoxGeometry(len, 1.0, 0.04, 2, 0.01), oak); back.position.y = 0.5; g.add(back);
    const cap = new THREE.Mesh(new RoundedBoxGeometry(len, 0.06, 0.08, 2, 0.02), oak); cap.position.set(0, 1.02, 0.02); g.add(cap);
    const n = Math.round(len / 1.1);
    for (let i = 0; i < n; i++) {
      const pnl = new THREE.Mesh(new RoundedBoxGeometry(len / n - 0.16, 0.66, 0.03, 3, 0.012), oak);
      pnl.position.set(-len / 2 + (i + 0.5) * (len / n), 0.52, 0.03); g.add(pnl);
    }
    return put(g, x, 0, z, ry);
  };
  wain(12.6, 0, -4.48, 0); wain(9.6, -6.38, -0.5, Math.PI / 2); wain(9.6, 6.38, -0.5, -Math.PI / 2);
  // Tavan: gömme lineer LED bantları (gerçekten parlar) ve ray spotları
  const led = mat.glow({ color: 0xfff3e0, intensity: 3.2 });
  const trim = mat.paintedMetal({ color: 0xe9e9e6, wear: 0 });
  for (const z of [-3.2, -1.0, 1.2, 3.2]) {
    const fr = put(new THREE.Mesh(new RoundedBoxGeometry(5.2, 0.05, 0.22, 2, 0.015), trim), 0, 3.99, z); fr.userData.noCast = true;
    const l = put(new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.02, 0.12), led), 0, 3.965, z); l.userData.noCast = true;
  }
  const rail = put(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.04, 8, 2, 0.01), mat.paintedMetal({ color: 0x2a2c2f, wear: 0 })), 0, 3.97, -0.5);
  rail.rotation.y = Math.PI / 2; rail.userData.noCast = true;
  const spotG = new THREE.LatheGeometry([[0, 0], [0.05, 0], [0.06, 0.02], [0.06, 0.16], [0.045, 0.18], [0, 0.18]].map(([r, y]) => new THREE.Vector2(r, y)), 24).translate(0, -0.18, 0);
  const spotM = mat.paintedMetal({ color: 0x2a2c2f, wear: 0.05 }), lens = mat.glow({ color: 0xfff0d8, intensity: 5 });
  for (const x of [-2.6, -1.2, 1.2, 2.6]) {
    const sp = put(new THREE.Mesh(spotG, spotM), x, 3.93, -0.5); sp.rotation.x = 0.5 * Math.sign(-x) * 0 + 0.35; sp.rotation.z = -Math.sign(x) * 0.5; sp.userData.noCast = true;
    const ln = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20).rotateX(Math.PI / 2).translate(0, -0.181, 0), lens); sp.add(ln);
  }
  // Yumuşak tepe ışığı: figürü üstten saran geniş spot (gölge yumuşak)
  const top = new THREE.SpotLight(0xfff1dc, 14, 0, 0.62, 0.9, 2);
  top.position.set(0.3, 3.9, 1.2); top.target.position.set(0, 0.9, 0);
  top.castShadow = true; top.shadow.mapSize.set(1024, 1024); top.shadow.radius = 6; top.shadow.bias = -0.0005;
  scene.add(top, top.target);
  // Duvar panoları: çizimli anatomi levhaları (tuval dokusu), ahşap çerçeve
  const chart = (title, draw) => {
    const c = document.createElement('canvas'); c.width = 360; c.height = 500;
    const g = c.getContext('2d');
    g.fillStyle = '#f1ebdd'; g.fillRect(0, 0, 360, 500);
    g.fillStyle = '#3a2f28'; g.font = '700 30px Georgia, serif'; g.textAlign = 'center'; g.fillText(title, 180, 48);
    g.strokeStyle = '#8a7a66'; g.lineWidth = 2; g.strokeRect(14, 14, 332, 472);
    draw(g);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  const figure = (g, fill, stroke) => {
    g.fillStyle = fill; g.strokeStyle = stroke; g.lineWidth = 3;
    g.beginPath(); g.ellipse(180, 105, 26, 32, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(140, 150); g.quadraticCurveTo(180, 138, 220, 150); g.lineTo(232, 285); g.lineTo(206, 300); g.lineTo(212, 455); g.lineTo(186, 455);
    g.lineTo(180, 320); g.lineTo(174, 455); g.lineTo(148, 455); g.lineTo(154, 300); g.lineTo(128, 285); g.closePath(); g.fill(); g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(180 + s * 42, 155); g.quadraticCurveTo(180 + s * 72, 230, 180 + s * 78, 320); g.lineWidth = 14; g.stroke(); g.lineWidth = 3; }
  };
  const charts = [
    chart('DOLAŞIM SİSTEMİ', (g) => {
      figure(g, '#f3dccb', '#b89a86');
      g.strokeStyle = '#b3261e'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(186, 190); g.lineTo(186, 300); g.lineTo(196, 450); g.moveTo(186, 300); g.lineTo(166, 450); g.moveTo(186, 170); g.quadraticCurveTo(230, 170, 250, 300); g.moveTo(176, 170); g.quadraticCurveTo(130, 170, 110, 300); g.stroke();
      g.strokeStyle = '#1e4fa3'; g.beginPath(); g.moveTo(174, 190); g.lineTo(174, 300); g.lineTo(162, 450); g.moveTo(174, 300); g.lineTo(200, 450); g.stroke();
      g.fillStyle = '#b3261e'; g.beginPath(); g.ellipse(184, 205, 14, 17, 0.4, 0, 7); g.fill();
    }),
    chart('İSKELET SİSTEMİ', (g) => {
      figure(g, '#ede4d3', '#c9bca4');
      g.strokeStyle = '#6f6453'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(180, 140); g.lineTo(180, 290); for (let i = 0; i < 7; i++) { const y = 175 + i * 14; g.moveTo(152 + i, y); g.quadraticCurveTo(180, y - 8, 208 - i, y); } g.stroke();
      g.beginPath(); g.ellipse(180, 295, 30, 14, 0, 0, 7); g.stroke();
      g.beginPath(); g.moveTo(166, 305); g.lineTo(160, 450); g.moveTo(194, 305); g.lineTo(200, 450); g.stroke();
    }),
    chart('SİNDİRİM SİSTEMİ', (g) => {
      figure(g, '#f3dccb', '#b89a86');
      g.fillStyle = '#8c4a2f'; g.beginPath(); g.ellipse(162, 225, 30, 18, -0.2, 0, 7); g.fill();
      g.fillStyle = '#c77b5a'; g.beginPath(); g.ellipse(200, 232, 22, 16, 0.3, 0, 7); g.fill();
      g.strokeStyle = '#c98a6a'; g.lineWidth = 7; g.beginPath(); for (let i = 0; i < 5; i++) { const y = 258 + i * 8; g.moveTo(150, y); g.bezierCurveTo(165, y - 10, 195, y + 10, 210, y); } g.stroke();
      g.strokeStyle = '#a8674a'; g.lineWidth = 3; g.beginPath(); g.moveTo(180, 130); g.lineTo(186, 215); g.stroke();
    }),
  ];
  const frameM = mat.wood({ color: 0x3e2a1c, varnish: true, scale: 3 });
  [[-4.6, charts[0]], [-3.1, charts[1]], [4.6, charts[2]]].forEach(([x, t]) => {
    const f = put(new THREE.Mesh(new RoundedBoxGeometry(1.08, 1.46, 0.05, 2, 0.015), frameM), x, 1.95, -4.46);
    const pap = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 1.33), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
    pap.position.z = 0.027; f.add(pap);
  });
  // Salon adı: duvara oturan pirinç harfler etkisi
  {
    const t = textTexture('ANATOMİ SALONU', { size: 72, color: '#b8904f', font: '700 {s}px Georgia, serif', pad: 8 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6 / t.userData.aspect), new THREE.MeshStandardMaterial({ map: t, transparent: true, metalness: 0.8, roughness: 0.35 }));
    put(m, 0, 3.35, -4.49).userData.noCast = true;
  }
  // Vitrinler: ahşap alt dolap + çelik çerçeveli cam kasa; içinde örnek kavanozları ve kafatası kalıbı
  // Vitrin camı ve kavanozlar: kırılmasız ince cam (çok sayıda iletim geçişi yazılım WebGL'de ağır) — yansıma + hafif saydamlık
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0xeef5f6, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16,
    specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false });
  const liquidM = new THREE.MeshPhysicalMaterial({ color: 0xe6cf8c, roughness: 0.08, transparent: true, opacity: 0.42, depthWrite: false });
  const specM = tissue({ color: 0xc98f7a, veins: 0.25, scale: 20 });
  const boneM = mat.ceramic({ color: 0xe6dcc6 });
  const jarG = new THREE.LatheGeometry([[0, 0], [0.07, 0], [0.075, 0.01], [0.075, 0.2], [0.06, 0.215], [0.06, 0.23], [0, 0.23]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  const lidG = new THREE.CylinderGeometry(0.064, 0.064, 0.02, 24);
  const vitrine = (x, z, ry) => {
    const g = new THREE.Group();
    const cab = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.85, 0.6, 3, 0.02), oak); cab.position.y = 0.425; g.add(cab);
    for (const sx of [-0.29, 0.29]) { const d = new THREE.Mesh(new RoundedBoxGeometry(0.55, 0.7, 0.02, 2, 0.008), oak); d.position.set(sx, 0.43, 0.305); g.add(d); }
    const glass = new THREE.Mesh(new RoundedBoxGeometry(1.16, 1.2, 0.56, 2, 0.01), glassM); glass.position.y = 1.46; glass.userData.noCast = true; g.add(glass);
    for (const [ex, ez] of [[-0.58, -0.28], [0.58, -0.28], [-0.58, 0.28], [0.58, 0.28]]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.018, 1.2, 0.018), steel); e.position.set(ex, 1.46, ez); g.add(e); }
    const capT = new THREE.Mesh(new RoundedBoxGeometry(1.22, 0.05, 0.62, 2, 0.015), oak); capT.position.y = 2.08; g.add(capT);
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.012, 0.52), glassM); shelf.position.y = 1.45; shelf.userData.noCast = true; g.add(shelf);
    const inLed = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.01, 0.03), mat.glow({ color: 0xfff5e6, intensity: 2.5 })); inLed.position.set(0, 2.045, 0.2); g.add(inLed);
    [-0.35, 0, 0.35].forEach((jx, i) => {
      for (const yy of [0.86, 1.462]) {
        const j = new THREE.Mesh(jarG, glassM); j.position.set(jx, yy, 0); j.userData.noCast = true; g.add(j);
        const lq = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.17, 24), liquidM); lq.position.set(jx, yy + 0.095, 0); lq.userData.noCast = true; g.add(lq);
        const lid = new THREE.Mesh(lidG, steel); lid.position.set(jx, yy + 0.24, 0); g.add(lid);
        if (!(yy > 1 && i === 1)) { const sp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045 + 0.01 * i, 3), specM); sp.scale.set(1, 1.3 - 0.2 * i, 0.9); sp.position.set(jx, yy + 0.09, 0); g.add(sp); }
      }
    });
    // Üst rafta kafatası kalıbı (kafa + çene), kaide üstünde
    const sk = new THREE.Mesh(new THREE.SphereGeometry(0.1, 28, 20), boneM); sk.scale.set(0.82, 0.92, 1.05); sk.position.set(0, 1.58, 0); g.add(sk);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.5), boneM); jaw.scale.set(1.1, 0.9, 1.2); jaw.position.set(0, 1.5, 0.03); g.add(jaw);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.03, 24), oak); ped.position.set(0, 1.47, 0); g.add(ped);
    return put(g, x, 0, z, ry);
  };
  vitrine(-2.1, -4.05, 0); vitrine(2.1, -4.05, 0); vitrine(-5.95, -1.6, Math.PI / 2); vitrine(5.95, -1.6, -Math.PI / 2);
  // Ziyaretçi bariyeri: çelik dikmeler + kadife kordon
  const cord = mat.fabric({ color: 0x7a1f2a, scale: 6 });
  const posts = [[-1.2, 1.1], [1.2, 1.1], [1.2, -0.9], [-1.2, -0.9]];
  posts.forEach(([x, z]) => {
    const pst = put(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.16, 0], [0.16, 0.02], [0.03, 0.04], [0.025, 0.92], [0.04, 0.94], [0.035, 0.98], [0, 0.99]].map(([r, y]) => new THREE.Vector2(r, y)), 32), steel), x, 0, z);
    pst.userData.noFit = true;
  });
  for (let i = 0; i < 4; i++) {
    if (i === 0) continue;   // ön taraf açık (kamera)
    const [ax, az] = posts[i], [bx, bz] = posts[(i + 1) % 4];
    const mid = new THREE.Vector3((ax + bx) / 2, 0.72, (az + bz) / 2);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(ax, 0.9, az), mid, new THREE.Vector3(bx, 0.9, bz));
    const cm = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.014, 8), cord); cm.userData.noFit = true; scene.add(cm);
  }
  shell.forEach((m) => { m.userData.noCast = true; m.userData.noFit = true; });
}

// --- Yardımcılar (u birimi) ---
const V = (a) => new THREE.Vector3(...a);
const mirror = (p) => [-p[0], p[1], p[2]];
const sides = (fn) => [fn((p) => p), fn(mirror)];
const merge = (list) => BufferGeometryUtils.mergeGeometries(list.map((g) => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; }));
const CELL = LOWQ ? 0.028 : 0.02;
const sdf = (items, cell = CELL) => sdfMesh(items, { cell });
/** Yön boyunca yassı/iğ biçimli elipsoit: a→b, w genişlik, t kalınlık (thin: kalınlık yönü) */
function seg(a, b, w, t, thin = [0, 0, 1]) {
  const A = V(a), B = V(b), y = B.clone().sub(A), L = y.length() / 2; y.normalize();
  const z = V(thin); z.addScaledVector(y, -z.dot(y)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return sEllipsoid(A.add(B).multiplyScalar(0.5).toArray(), [w, L, t], new THREE.Matrix4().makeBasis(x, y, z));
}
/** İğ biçimli kas: göbek + iki uçta kiriş */
const fusi = (a, b, r, thin = [0, 0, 1], flat = 1) => [seg(lerpA(a, b, 0.1), lerpA(a, b, 0.9), r, r * flat, thin), sCone(a, lerpA(a, b, 0.2), r * 0.25, r * 0.5), sCone(lerpA(a, b, 0.8), b, r * 0.5, r * 0.25)];
const lerpA = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const tube = (pts, r, seg2 = 64, rad = 10) => loftTube(new THREE.CatmullRomCurve3(pts.map(V)), typeof r === 'function' ? r : () => r, { segs: seg2, radial: rad });
const ellipsoidSDF = (pos, s, rot = [0, 0, 0], k = 0.03) => sdf([{ p: [sEllipsoid(pos, s, rot)], k }]);

// --- Malzemeler ---
const wet = (m, cc = 0.9, cr = 0.18) => { m.clearcoat = cc; m.clearcoatRoughness = cr; return m; };
const muscleMat = (dir = 'y', color = 0xa3302c) => wet(procedural({
  key: 'kas-' + dir, physical: true, scale: 1, bump: 0.004,
  params: { color, roughness: 0.42, sheen: 0.5, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xff9a8a) },
  pattern: `
    vec3 q = ${dir === 'y' ? 'vec3(p.x*95.0, p.y*2.5, p.z*95.0)' : dir === 'x' ? 'vec3(p.x*2.5, p.y*95.0, p.z*95.0)' : 'vec3(p.x*70.0 + p.y*70.0, (p.y - p.x)*2.5, p.z*95.0)'};
    float fib = vn3(q)*0.65 + vn3(q*2.1 + 3.0)*0.35, n = fbm3(p*3.0 + seed*5.0, 4);
    col *= 0.7 + 0.45*fib + 0.2*(n - 0.5);
    float tend = smoothstep(0.62, 0.8, fbm3(p*1.6 + 11.0, 3));
    col = mix(col, vec3(0.62, 0.52, 0.44), tend*0.25);
    rough = 0.36 + 0.2*(1.0 - fib);
    h = fib*0.7 + n*0.3;`,
}), 0.7, 0.25);
const boneMat = () => procedural({
  key: 'kemik', physical: true, scale: 1, bump: 0.006,
  params: { color: 0xe6dcc0, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4, sheen: 0.3, sheenColor: new THREE.Color(0xfff2d8) },
  pattern: `
    float n = fbm3(p*4.0 + seed*7.0, 5), c = cells3(p*26.0), pore = smoothstep(0.08, 0.0, c);
    col *= 0.86 + 0.2*n;
    col = mix(col, col*vec3(0.85, 0.78, 0.62), smoothstep(0.55, 0.8, fbm3(p*1.2 + 3.0, 3))*0.6);
    col *= 1.0 - 0.25*pore;
    rough = 0.5 + 0.2*n + 0.1*pore;
    h = n*0.6 - pore*0.5;`,
});
const organMat = (color, veins = 0.35, scale = 2) => wet(tissue({ color, veins, scale }), 0.9, 0.15);

// --- Katmanlar ve parçalar ---
const LAYERS = {
  skin: { name: 'Deri', group: new THREE.Group(), on: true, opacity: 0.22 },
  muscle: { name: 'Kaslar', group: new THREE.Group(), on: true, opacity: 0.35 },
  skeleton: { name: 'İskelet', group: new THREE.Group(), on: true, opacity: 1 },
  organs: { name: 'Organlar', group: new THREE.Group(), on: true, opacity: 1 },
};
Object.values(LAYERS).forEach((l) => root.add(l.group));
const LAYER_EMOJI = { skin: '🟫', muscle: '💪', skeleton: '🦴', organs: '🫀' };

const parts = [];
const partByName = {};
/** Bir mesh'i adlandırılmış parçaya bağlar (aynı ada sahip mesh'ler birlikte vurgulanır). material: malzeme ya da üretici */
function part(layer, name, info, geo, material, mesh) {
  const m0 = typeof material === 'function' ? material() : material;
  m0.transparent = true;
  const m = mesh || new THREE.Mesh(geo, m0);
  if (mesh) m.material = m0;
  let p = partByName[name];
  if (!p) { p = partByName[name] = { name, info, layer, meshes: [] }; parts.push(p); }
  p.meshes.push(m);
  m.userData.part = p;
  m.userData.baseEmissive = m0.emissive ? m0.emissive.clone() : new THREE.Color(0);
  LAYERS[layer].group.add(m);
  return m;
}

const J = { // eklem noktaları (u; sağ taraf: -x; model +z yönüne bakar)
  shoulder: [-0.8, 5.55, 0], elbow: [-1.05, 4.45, -0.05], wrist: [-1.24, 3.45, 0.05], hand: [-1.31, 3.0, 0.08],
  hip: [-0.3, 3.5, 0], knee: [-0.33, 1.95, 0.03], ankle: [-0.34, 0.3, -0.02], toe: [-0.37, 0.07, 0.62],
};
const JM = {}; // metre (beden SDF'i için)
for (const [k2, v] of Object.entries(J)) JM[k2] = C(v);
Object.assign(JM, { pelvis: [0, 0.93, 0], neck: [0, 1.45, -0.01], fwd: [0, 0, 1] });

// ---------- DERİ ----------
{
  const info = 'En büyük organımız! Vücudu mikroplara, suya ve güneşe karşı korur, ter ile ısıyı düzenler, dokunma, sıcak ve acıyı hisseder.';
  const g = sdfMesh(bodyItems(JM, { floorCut: 0 }), { cell: LOWQ ? 0.012 : 0.0085 }).scale(1 / K, 1 / K, 1 / K);
  part('skin', 'Deri', info, g, () => { const m = skinMaterial({ color: 0xc8937a, scale: K, gloss: 0.35 }); m.depthWrite = false; return m; });
}

// ---------- KASLAR ----------
{
  const base = () => { const m = muscleMat('d', 0x7e2622); m.depthWrite = false; return m; };
  const deep = sdfMesh(bodyItems(JM, { parts: { head: false, arms: false, legs: false }, offset: -0.012 }), { cell: LOWQ ? 0.014 : 0.01 }).scale(1 / K, 1 / K, 1 / K);
  part('muscle', 'Derin gövde kasları', 'Omurgayı dik tutan ve solunuma yardım eden derin kaslar (ör. diyafram, sırt kasları, kaburgalar arası kaslar).', deep, base);
  const M = (name, info, items, dir = 'y') => part('muscle', name, info, sdf(items), () => { const m = muscleMat(dir); m.depthWrite = false; return m; });
  const both = (fn) => sides(fn).flat();
  M('Göğüs kası (pektoralis)', 'Kolu öne ve içe çeker; şınav gibi itme hareketlerinde çalışır.',
    [{ p: both((f) => [5.5, 5.3, 5.08].map((y, i) => seg(f([-0.07, y, 0.34 - i * 0.01]), f([-0.66, 5.36, 0.16]), 0.12, 0.045, [0, 0.2, 1]))), k: 0.08 }], 'x');
  M('Omuz kası (deltoid)', 'Kolu yana, öne ve yukarı kaldırır.',
    [{ p: both((f) => [sEllipsoid(f([-0.84, 5.5, 0]), [0.19, 0.22, 0.2]), sCone(f([-0.88, 5.35, 0]), f([-0.95, 4.95, -0.01]), 0.13, 0.05)]), k: 0.06 }]);
  M('Karın kası (rektus abdominis)', 'Gövdeyi öne büker ve karın içindeki organları destekler ("altı kas" görünümü).',
    [{ p: [4.98, 4.74, 4.5, 4.2].flatMap((y, i) => [-1, 1].map((s) => sBox([s * 0.088, y, 0.315 - i * 0.004], [0.052, i === 3 ? 0.13 : 0.085, 0.012], 0.03))), k: 0.012 }]);
  M('Dış eğik karın kasları', 'Gövdeyi yana büker ve döndürür.',
    [{ p: both((f) => [seg(f([-0.5, 5.1, 0.14]), f([-0.3, 3.95, 0.24]), 0.14, 0.06, [-0.8, 0, 0.6])]), k: 0.05 }], 'd');
  M('Boyun kası (sternokleidomastoid)', 'Başı yana döndürür ve öne eğer.', [{ p: both((f) => fusi(f([-0.15, 6.22, -0.05]), f([-0.04, 5.86, 0.15]), 0.05, [0.6, 0, 0.8])), k: 0.02 }]);
  M('Trapez kası', 'Omuzları kaldırır; kürek kemiklerini ve başı hareket ettirir.',
    [{ p: [seg([0, 6.2, -0.24], [0, 4.7, -0.3], 0.12, 0.04), ...sides((f) => seg(f([-0.02, 5.95, -0.26]), f([-0.74, 5.6, -0.06]), 0.13, 0.05, [0, 0.5, -1])), ...sides((f) => seg(f([-0.05, 5.3, -0.33]), f([-0.62, 5.58, -0.18]), 0.12, 0.04, [0, 0, -1]))], k: 0.09 }], 'x');
  M('Sırt kası (latissimus dorsi)', 'Kolu aşağı ve geriye çeker (tırmanma, yüzme, kürek çekme).',
    [{ p: both((f) => [seg(f([-0.16, 4.2, -0.3]), f([-0.66, 5.25, -0.14]), 0.24, 0.045, [-0.4, 0, -1]), seg(f([-0.4, 4.5, -0.25]), f([-0.62, 5.1, -0.08]), 0.15, 0.05, [-1, 0, -0.4])]), k: 0.08 }], 'd');
  M('Kalça kası (gluteus maximus)', 'Vücudun en büyük kası; kalçayı açar, ayağa kalkmayı, merdiven çıkmayı sağlar.',
    [{ p: both((f) => [sEllipsoid(f([-0.27, 3.52, -0.27]), [0.26, 0.29, 0.18], [0.2, f === mirror ? 0.3 : -0.3, 0])]), k: 0.04 }]);
  const off = (p, dz, dx = 0) => [p[0] + dx, p[1], p[2] + dz];
  M('Pazı kası (biseps)', 'Dirseği büker ve önkolu avuç yukarı çevirir.', [{ p: both((f) => fusi(off(f(J.shoulder), 0.08), off(f(J.elbow), 0.08), 0.1, [0, 0, 1], 0.9)), k: 0.03 }]);
  M('Arka kol kası (triseps)', 'Dirseği açar (kolu düzleştirir).', [{ p: both((f) => fusi(off(f(J.shoulder), -0.08), off(f(J.elbow), -0.08), 0.11)), k: 0.03 }]);
  M('Önkol kasları', 'El bileğini ve parmakları büker, açar; kavramayı sağlar.', [{ p: both((f) => [...fusi(off(f(J.elbow), 0.03), f(J.wrist), 0.1), ...fusi(off(f(J.elbow), -0.04, -0.04), off(f(J.wrist), -0.02), 0.08)]), k: 0.03 }]);
  M('Ön uyluk kası (kuadriseps)', 'Dizi açar; yürürken, zıplarken ve çömelip kalkarken çalışır.',
    [{ p: both((f) => [...fusi(off(f(J.hip), 0.1, -0.02), off(f(J.knee), 0.1), 0.17), seg(off(f(J.hip), 0.02, -0.14), off(f(J.knee), 0.06, -0.08), 0.1, 0.1)]), k: 0.05 }]);
  M('Arka uyluk kasları (hamstring)', 'Dizi büker ve kalçayı geriye doğru açar.', [{ p: both((f) => fusi(off(f(J.hip), -0.1), off(f(J.knee), -0.09), 0.15)), k: 0.04 }]);
  M('Baldır kası (gastroknemius)', 'Topuğu kaldırır; parmak ucunda durmayı, koşmayı ve zıplamayı sağlar.',
    [{ p: both((f) => [...[-0.05, 0.05].map((dx) => seg(off(f([-0.33, 1.85, 0.0]), -0.1, dx), off(f([-0.34, 1.05, 0]), -0.08, dx * 0.5), 0.085, 0.09)), sCone(off(f([-0.34, 1.1, 0]), -0.08), off(f(J.ankle), -0.1), 0.06, 0.035)]), k: 0.04 }]);
  M('Ön bacak kası (tibialis anterior)', 'Ayak ucunu yukarı kaldırır; yürürken ayağın takılmasını önler.', [{ p: both((f) => fusi(off(f([-0.33, 1.8, 0.03]), 0.09, -0.04), off(f([-0.34, 0.45, 0]), 0.08, -0.02), 0.06)), k: 0.03 }]);
}

// ---------- İSKELET ----------
const vertebrae = [];
{
  const B = (name, info, geo) => part('skeleton', name, info, geo, boneMat);
  const skull = sdf([
    { p: [sEllipsoid([0, 6.54, -0.04], [0.3, 0.33, 0.37]), sEllipsoid([0, 6.32, 0.12], [0.22, 0.23, 0.22])], k: 0.08 },
    { p: sides((f) => sCone(f([-0.2, 6.3, 0.14]), f([-0.27, 6.3, -0.08]), 0.04, 0.035)), k: 0.04 },   // elmacık kemeri
    { p: [sEllipsoid([0, 6.16, 0.2], [0.14, 0.05, 0.1])], k: 0.04 },                                   // üst çene
    { p: sides((f) => sEllipsoid(f([-0.105, 6.36, 0.3]), [0.078, 0.072, 0.09])), k: 0.02, op: 'sub' }, // göz çukurları
    { p: [sEllipsoid([0, 6.25, 0.33], [0.038, 0.06, 0.06])], k: 0.015, op: 'sub' },                    // burun boşluğu
    { p: sides((f) => sEllipsoid(f([-0.3, 6.38, -0.06]), [0.05, 0.05, 0.05])), k: 0.02, op: 'sub' },  // kulak yolu
  ], 0.018);
  B('Kafatası', 'Beyni korur; 22 kemiğin (8 kafa + 14 yüz kemiği) birleşmesinden oluşur.', skull);
  // Dişler: iki sıra küçük kron
  {
    const teeth = [];
    for (let i = 0; i < 12; i++) { const a = (i / 11 - 0.5) * 2.2; teeth.push(sEllipsoid([Math.sin(a) * 0.12, 6.115, 0.19 + Math.cos(a) * 0.1 - 0.1], [0.017, 0.028, 0.014])); }
    part('skeleton', 'Kafatası', null, sdf([{ p: teeth, k: 0.004 }], 0.012), () => { const m = mat.ceramic({ color: 0xf0ead8 }); return m; });
  }
  B('Alt çene (mandibula)', 'Kafatasının hareket edebilen tek kemiği; konuşmayı ve çiğnemeyi sağlar.',
    sdf([{ p: [...sides((f) => sCone(f([-0.22, 6.3, -0.07]), f([-0.2, 6.06, -0.02]), 0.035, 0.04)), ...sides((f) => sCone(f([-0.2, 6.06, -0.02]), f([-0.08, 6.02, 0.2]), 0.04, 0.035)), sCone([-0.08, 6.02, 0.2], [0.08, 6.02, 0.2], 0.035, 0.035), sEllipsoid([0, 6.0, 0.23], [0.06, 0.035, 0.03])], k: 0.03 }], 0.015));

  // Omurga: omur gövdesi + diken çıkıntısı + yan çıkıntılar (InstancedMesh)
  const N = 26;
  const vGeo = sdf([
    { p: [sEllipsoid([0, 0, 0], [0.06, 0.034, 0.05])], k: 0.01 },
    { p: [sCone([0, 0.005, -0.05], [0, -0.03, -0.14], 0.018, 0.012), sCone([-0.02, 0.01, -0.05], [-0.08, 0.01, -0.07], 0.013, 0.01), sCone([0.02, 0.01, -0.05], [0.08, 0.01, -0.07], 0.013, 0.01), sEllipsoid([0, 0.005, -0.055], [0.035, 0.018, 0.02])], k: 0.015 },
    { p: [sEllipsoid([0, 0.0, -0.03], [0.018, 0.04, 0.016])], k: 0.01, op: 'sub' },
  ], 0.008);
  const vm = new THREE.InstancedMesh(vGeo, boneMat(), N);
  const mm = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), y = lerp(3.72, 6.15, t);
    const z = -0.2 - 0.045 * Math.sin(t * Math.PI * 2.1 + 0.4);
    const s = lerp(1.35, 0.8, t);
    mm.compose(new THREE.Vector3(0, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1 * Math.cos(t * Math.PI * 2.1 + 0.4), 0, 0)), new THREE.Vector3(s, 1, s));
    vm.setMatrixAt(i, mm);
    vertebrae.push(new THREE.Vector3(0, y, z));
  }
  part('skeleton', 'Omurga', '33 omurdan oluşur (7 boyun, 12 sırt, 5 bel omuru, sağrı ve kuyruk sokumu). Omuriliği korur ve vücudu dik tutar.', null, boneMat, vm);
  B('Omurga', null, sdf([{ p: [sCone([0, 3.72, -0.2], [0, 3.42, -0.16], 0.13, 0.03), sEllipsoid([0, 3.6, -0.2], [0.13, 0.12, 0.05], [0.25, 0, 0])], k: 0.04 }], 0.015));

  // Kaburgalar: basık, sivrilen tüpler; önde kıkırdak
  const ribs = [], cart = [];
  for (let i = 0; i < 12; i++) {
    const y = 5.62 - i * 0.1;
    const r = lerp(0.46, 0.6, Math.sin(Math.min(1, i / 7) * Math.PI / 2)) - (i > 9 ? 0.05 : 0);
    const frontX = i < 7 ? 0.06 : i < 10 ? 0.14 + (i - 7) * 0.08 : r * 0.9;
    const frontZ = i < 10 ? 0.34 : 0.05;
    for (const s of [-1, 1]) {
      const pts = [[s * 0.05, y, -0.21], [s * r * 0.8, y - 0.03, -0.2], [s * r, y - 0.09, 0], [s * r * 0.8, y - 0.17, frontZ * 0.8], [s * frontX, y - 0.22 - (i > 6 ? 0.08 : 0), frontZ]];
      const body = i < 10 ? pts.slice(0, 4).concat([lerpA(pts[3], pts[4], 0.35)]) : pts.slice(0, 4);
      ribs.push(loftTube(new THREE.CatmullRomCurve3(body.map(V)), (t) => 0.024 * (1 - 0.25 * t), { segs: 28, radial: 8, squash: 0.55, view: [0, 1, 0] }));
      if (i < 10) cart.push(loftTube(new THREE.CatmullRomCurve3([lerpA(pts[3], pts[4], 0.3), lerpA(pts[3], pts[4], 0.7), pts[4]].map(V)), () => 0.017, { segs: 10, radial: 8, squash: 0.6, view: [0, 1, 0] }));
    }
  }
  B('Kaburgalar', '12 çift kaburga kalbi ve akciğerleri bir kafes gibi korur; soluk alırken göğüs kafesi genişler.', merge(ribs));
  part('skeleton', 'Kaburgalar', null, merge(cart), () => wet(tissue({ color: 0xc9cfd2, veins: 0.05, scale: 3 }), 0.8, 0.2));
  B('Göğüs kemiği (sternum)', 'Kaburgaların önde bağlandığı yassı kemik; CPR\'da bası bu kemiğin alt yarısına yapılır.',
    sdf([{ p: [sEllipsoid([0, 5.58, 0.34], [0.075, 0.07, 0.022]), seg([0, 5.5, 0.345], [0, 5.02, 0.37], 0.05, 0.02, [0, 0.1, 1]), sCone([0, 5.02, 0.37], [0, 4.92, 0.37], 0.02, 0.008)], k: 0.02 }], 0.012));
  B('Köprücük kemiği (klavikula)', 'Kolu gövdeye bağlayan çubuk biçimli kemik; en sık kırılan kemiklerdendir.',
    merge(sides((f) => tube([f([-0.05, 5.7, 0.25]), f([-0.35, 5.74, 0.2]), f([-0.72, 5.72, 0.02])], (t) => 0.028 + 0.01 * Math.abs(t - 0.5) * 2, 24, 10))));
  const scap = new THREE.Shape([new THREE.Vector2(0, 0.22), new THREE.Vector2(0.24, 0.18), new THREE.Vector2(0.05, -0.28)]);
  B('Kürek kemiği (skapula)', 'Sırttaki üçgen yassı kemik; omuz ekleminin hareketine yön verir.',
    merge(sides((f) => {
      const e = new THREE.ExtrudeGeometry(scap, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 3 }).scale(f === mirror ? 1 : -1, 1, 1);
      const spine = loftTube(new THREE.CatmullRomCurve3([V([0.03, 0.12, 0.03]), V([0.22, 0.16, 0.06]), V([0.3, 0.18, 0.08])]), (t) => 0.018 * (1 - 0.3 * t), { segs: 12, radial: 8 }).scale(f === mirror ? 1 : -1, 1, -1);
      const g = merge([e.toNonIndexed(), spine.toNonIndexed()]);
      return g.translate(f([-0.2, 5.3, -0.33])[0], 5.3, -0.36);
    })));
  B('Leğen kemiği (pelvis)', 'Gövdenin ağırlığını bacaklara aktarır; mesane gibi iç organları taşır ve korur.', sdf([
    { p: sides((f) => seg(f([-0.2, 3.62, -0.1]), f([-0.46, 3.95, 0.02]), 0.17, 0.035, f([-0.9, 0.1, 0.45]))), k: 0.05 }, // kalça kanatları
    { p: [...sides((f) => sCone(f([-0.24, 3.6, -0.08]), f([-0.3, 3.4, 0.05]), 0.06, 0.05)), ...sides((f) => sCone(f([-0.3, 3.4, 0.05]), f([-0.06, 3.38, 0.2]), 0.04, 0.035)), ...sides((f) => sCone(f([-0.3, 3.4, 0.05]), f([-0.2, 3.3, -0.06]), 0.04, 0.045))], k: 0.05 },
    { p: [sEllipsoid([0, 3.62, -0.18], [0.14, 0.18, 0.05], [0.4, 0, 0])], k: 0.06 },                            // sağrı
    { p: sides((f) => sEllipsoid(f([-0.36, 3.48, 0.03]), [0.065, 0.065, 0.065])), k: 0.02, op: 'sub' },        // kalça çukuru
    { p: sides((f) => sEllipsoid(f([-0.17, 3.36, 0.1]), [0.06, 0.045, 0.1])), k: 0.02, op: 'sub' },            // obturator deliği
  ], 0.018));
  // Uzun kemik: gövde + iki uçta eklem başları (SDF)
  const longBone = (a, b, r, ha = 1.8, hb = 1.7) => {
    const d = V(b).sub(V(a)).normalize(), a2 = V(a).addScaledVector(d, r * 0.6).toArray(), b2 = V(b).addScaledVector(d, -r * 0.6).toArray();
    return [sCone(a2, lerpA(a2, b2, 0.5), r * 1.05, r * 0.85), sCone(lerpA(a2, b2, 0.5), b2, r * 0.85, r * 1.05), sEllipsoid(a2, [r * ha, r * ha * 0.9, r * ha * 0.85]), sEllipsoid(b2, [r * hb, r * hb * 0.9, r * hb * 0.85])];
  };
  B('Üst kol kemiği (humerus)', 'Omuzdan dirseğe uzanan uzun kemik.', sdf([{ p: sides((f) => longBone(f(J.shoulder), f(J.elbow), 0.04)).flat(), k: 0.05 }], 0.014));
  B('Önkol kemikleri (radius ve ulna)', 'Önkolu oluşturan iki kemik; birbirinin etrafında dönerek avucu çevirmeyi sağlar.',
    sdf([{ p: sides((f) => [...longBone(f([-1.03, 4.43, -0.02]), f([-1.21, 3.47, 0.08]), 0.026, 1.4, 1.8), ...longBone(f([-1.08, 4.43, -0.08]), f([-1.27, 3.47, 0.0]), 0.023, 1.8, 1.3)]).flat(), k: 0.025 }], 0.012));
  B('El kemikleri', 'Her elde 27 kemik vardır; bu sayede çok hassas hareketler yapabiliriz.',
    sdf([{ p: sides((f) => [sEllipsoid(f([-1.27, 3.33, 0.06]), [0.05, 0.07, 0.035]), ...[0, 1, 2, 3].flatMap((k2) => {
      const a = f([-1.23 - k2 * 0.025, 3.26, 0.02 + k2 * 0.02]), m1 = f([-1.25 - k2 * 0.03, 3.1, 0.04 + k2 * 0.022]), m2 = f([-1.27 - k2 * 0.034, 2.98, 0.06 + k2 * 0.02]), tip = f([-1.28 - k2 * 0.036, 2.88 + k2 * 0.01 * (k2 === 3 ? 3 : 0), 0.07 + k2 * 0.018]);
      return [sCone(a, m1, 0.013, 0.011), sCone(m1, m2, 0.011, 0.009), sCone(m2, tip, 0.009, 0.007)];
    }), sCone(f([-1.22, 3.3, 0.1]), f([-1.2, 3.14, 0.16]), 0.014, 0.01)]).flat(), k: 0.012 }], 0.009));
  B('Uyluk kemiği (femur)', 'Vücudun en uzun ve en güçlü kemiği.', sdf([{ p: sides((f) => [...longBone(f([-0.36, 3.46, 0]), f(J.knee), 0.055, 1.2, 1.8), sCone(f([-0.36, 3.44, 0]), f([-0.27, 3.5, 0.02]), 0.04, 0.045), sEllipsoid(f([-0.27, 3.5, 0.02]), [0.065, 0.065, 0.065])]).flat(), k: 0.04 }], 0.016));
  B('Diz kapağı (patella)', 'Diz ekleminin önündeki küçük yuvarlak kemik; ön uyluk kasının kirişi içindedir.', sdf([{ p: sides((f) => sEllipsoid(f([-0.33, 1.97, 0.15]), [0.06, 0.07, 0.03])), k: 0.02 }], 0.01));
  B('Kaval ve baldır kemiği (tibia, fibula)', 'Diz ile ayak bileği arasındaki iki kemik; tibia vücut ağırlığını taşır.',
    sdf([{ p: sides((f) => [...longBone(f([-0.31, 1.88, 0.03]), f([-0.33, 0.34, 0]), 0.045, 2.0, 1.3), ...longBone(f([-0.43, 1.83, -0.02]), f([-0.42, 0.36, -0.03]), 0.022, 1.4, 1.5)]).flat(), k: 0.03 }], 0.013));
  B('Ayak kemikleri', 'Her ayakta 26 kemik bulunur; kemerli yapısı yürürken yükü dağıtır.',
    sdf([{ p: sides((f) => [sEllipsoid(f([-0.34, 0.16, -0.08]), [0.06, 0.07, 0.09]), sEllipsoid(f([-0.35, 0.2, 0.05]), [0.06, 0.05, 0.07]),
      ...[0, 1, 2, 3, 4].flatMap((k2) => { const x = -0.29 - k2 * 0.035, a = f([x, 0.17, 0.12]), m = f([x - 0.01, 0.08, 0.42 - k2 * 0.03]), t = f([x - 0.012, 0.05, 0.56 - k2 * 0.05]); return [sCone(a, m, k2 ? 0.018 : 0.026, k2 ? 0.014 : 0.022), sCone(m, t, k2 ? 0.013 : 0.02, k2 ? 0.01 : 0.017)]; })]).flat(), k: 0.02 }], 0.012));
}

// ---------- ORGANLAR ----------
let heart, lungs, brain;
{
  const O = (name, info, geo, material) => part('organs', name, info, geo, material);
  // Beyin: kıvrımlar gürültüyle
  const bg = new THREE.SphereGeometry(0.29, LOWQ ? 96 : 140, LOWQ ? 64 : 96);
  const noise = new ImprovedNoise(), p = bg.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const w = noise.noise(v.x * 9, v.y * 9, v.z * 9) * 0.35;
    const n = 1 - Math.abs(noise.noise(v.x * 24 + w, v.y * 24 + w, v.z * 24));
    let k2 = 1 + 0.06 * (Math.pow(n, 1.5) - 0.55);
    if (Math.abs(v.x) < 0.03 && v.y > -0.05) k2 -= 0.09 * (1 - Math.abs(v.x) / 0.03);
    v.multiplyScalar(k2);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  bg.deleteAttribute('uv');
  bg.scale(0.88, 0.8, 1.08).translate(0, 6.58, -0.03);
  bg.computeVertexNormals();
  const cereb = sdf([{ p: [sEllipsoid([0, 6.37, -0.22], [0.17, 0.09, 0.11]), sCone([0, 6.36, -0.12], [0, 6.08, -0.14], 0.05, 0.04)], k: 0.03 }], 0.012);
  brain = O('Beyin', 'Vücudun komuta merkezi: düşünme, hafıza, duyular ve hareketleri yönetir. Yaklaşık 86 milyar nöron içerir.', merge([bg, cereb]), () => organMat(0xe7a6a8, 0.5, 6));

  lungs = O('Akciğerler', 'Soluduğumuz havadaki oksijeni kana geçirir, karbondioksiti dışarı atar. Sağ akciğer 3, sol akciğer 2 lobludur.',
    sdf([
      { p: [sEllipsoid([-0.31, 5.12, -0.02], [0.24, 0.5, 0.26]), sEllipsoid([0.31, 5.14, -0.03], [0.21, 0.48, 0.25])], k: 0.02 },
      { p: [sEllipsoid([0.08, 4.95, 0.12], [0.2, 0.22, 0.2])], k: 0.06, op: 'sub' },              // kalp girintisi
      { p: [sBox([-0.31, 5.02, 0], [0.4, 0.008, 0.4], 0), sBox([0.31, 5.05, 0], [0.4, 0.008, 0.4], 0)].map((b2, i) => b2), k: 0.01, op: 'sub' }, // lob yarıkları
    ], 0.018), () => organMat(0xd98a8e, 0.55, 4));
  O('Soluk borusu (trakea)', 'Havayı akciğerlere taşır; C biçimli kıkırdak halkalar onu hep açık tutar.',
    merge([tube([[0, 6.02, 0.08], [0, 5.7, 0.05], [0, 5.5, 0.02]], (t) => 0.04 * (1 + 0.1 * Math.max(0, Math.sin(t * 60))), 90, 12), tube([[0, 5.52, 0.02], [-0.12, 5.4, 0], [-0.22, 5.3, -0.02]], 0.028, 16, 8), tube([[0, 5.52, 0.02], [0.12, 5.4, 0], [0.22, 5.3, -0.02]], 0.028, 16, 8)]), () => organMat(0xd9cfc0, 0.1, 5));
  heart = O('Kalp', 'Kaslı bir pompa: dakikada yaklaşık 60–100 kez atarak kanı akciğerlere ve tüm vücuda gönderir.',
    sdf([{ p: [sEllipsoid([0, 0.02, 0], [0.16, 0.17, 0.13]), sCone([0, -0.04, 0], [0.02, -0.26, 0.02], 0.13, 0.03), sEllipsoid([-0.08, 0.12, -0.02], [0.09, 0.07, 0.08]), sEllipsoid([0.08, 0.13, -0.04], [0.08, 0.06, 0.07])], k: 0.05 }], 0.012).rotateZ(0.55), () => organMat(0xa8323c, 0.6, 5));
  heart.geometry.translate(0.07, 5.0, 0.15);
  O('Aort ve ana damarlar', 'Aort kalpten çıkan en büyük atardamardır; kanı tüm vücuda dağıtır. Toplardamarlar kanı kalbe geri getirir.',
    tube([[0.02, 5.12, 0.15], [0.02, 5.42, 0.08], [-0.03, 5.45, -0.08], [-0.03, 5.2, -0.15], [-0.02, 4.4, -0.13], [0, 3.8, -0.1]], (t) => 0.045 - 0.012 * t, 64, 12), () => organMat(0xb53a3a, 0.3, 4));
  O('Toplardamarlar (ana toplardamar)', 'Oksijeni azalmış kanı vücuttan kalbe geri taşır.', tube([[-0.1, 5.5, 0.08], [-0.1, 5.05, 0.12], [-0.08, 4.4, -0.05], [-0.06, 3.8, -0.06]], 0.036, 48, 12), () => organMat(0x4a5aa8, 0.25, 4));
  O('Karaciğer', 'En büyük iç organ: safra üretir, besinleri işleyip depolar, zararlı maddeleri etkisiz hale getirir.',
    sdf([{ p: [sEllipsoid([-0.22, 4.66, 0.08], [0.33, 0.19, 0.26], [0, 0, -0.25]), sEllipsoid([0.12, 4.72, 0.1], [0.22, 0.1, 0.2], [0, 0, 0.2])], k: 0.08 },
      { p: [sEllipsoid([0.0, 4.46, 0.15], [0.4, 0.1, 0.4])], k: 0.06, op: 'sub' }], 0.018), () => organMat(0x6e2a22, 0.2, 3));
  O('Mide', 'Besinleri mide asidi ve pepsin enzimiyle karıştırıp çorba kıvamına (kimus) getirir.',
    tube([[0.1, 4.92, 0.06], [0.2, 4.84, 0.1], [0.34, 4.74, 0.12], [0.36, 4.56, 0.14], [0.24, 4.44, 0.15], [0.06, 4.45, 0.15], [-0.05, 4.53, 0.13]], (t) => 0.045 + 0.085 * Math.sin(Math.min(1, t * 1.25) * Math.PI) ** 0.7, 60, 18), () => organMat(0xd99080, 0.35, 4));
  // İnce bağırsak: kıvrımlı tüp
  const si = [];
  for (let k2 = 0; k2 < 6; k2++) for (let j = 0; j <= 8; j++) {
    const u = k2 % 2 ? 1 - j / 8 : j / 8;
    si.push([lerp(-0.28, 0.28, u), 4.14 - k2 * 0.075 + 0.02 * Math.sin(j * 2.1 + k2), 0.15 + 0.05 * Math.cos(j * 1.7 + k2 * 0.9)]);
  }
  O('İnce bağırsak', 'Yaklaşık 6 m uzunluğunda kıvrımlı bir tüp; besinlerin çoğu burada sindirilir ve kana emilir.', tube(si, 0.04, LOWQ ? 300 : 420, 10), () => organMat(0xe4a09a, 0.4, 5));
  O('Kalın bağırsak', 'Suyu ve tuzları geri emer, dışkıyı oluşturur; yararlı bakteriler burada yaşar.',
    tube([[-0.38, 3.72, 0.12], [-0.42, 4.0, 0.14], [-0.4, 4.28, 0.17], [-0.2, 4.33, 0.22], [0.2, 4.33, 0.22], [0.4, 4.28, 0.17], [0.43, 3.95, 0.14], [0.35, 3.66, 0.1], [0.12, 3.6, 0.02], [0, 3.52, -0.08]], (t) => 0.068 * (1 + 0.12 * Math.abs(Math.sin(t * 70))), 240, 14), () => organMat(0xc58c66, 0.3, 4));
  O('Böbrekler', 'Kanı süzerek idrar üretir; vücudun su-tuz dengesini ve kan basıncını düzenler.',
    merge([sdf([{ p: [sEllipsoid([-0.24, 4.3, -0.2], [0.085, 0.15, 0.07], [0, 0, 0.15]), sEllipsoid([0.24, 4.36, -0.2], [0.085, 0.15, 0.07], [0, 0, -0.15])], k: 0.02 },
      { p: [sEllipsoid([-0.16, 4.3, -0.18], [0.04, 0.05, 0.05]), sEllipsoid([0.16, 4.36, -0.18], [0.04, 0.05, 0.05])], k: 0.02, op: 'sub' }], 0.012),
      tube([[-0.18, 4.28, -0.17], [-0.14, 3.9, -0.05], [-0.05, 3.6, 0.08]], 0.012, 24, 6), tube([[0.18, 4.34, -0.17], [0.14, 3.9, -0.05], [0.05, 3.6, 0.08]], 0.012, 24, 6)]), () => organMat(0x7e2a30, 0.3, 4));
  O('Mesane', 'Böbreklerden gelen idrarı biriktirir; dolunca tuvalete gitme isteği duyarız.', sdf([{ p: [sEllipsoid([0, 3.55, 0.12], [0.1, 0.085, 0.09]), sCone([0, 3.5, 0.12], [0, 3.42, 0.1], 0.04, 0.015)], k: 0.03 }], 0.01), () => organMat(0xd8b46a, 0.25, 5));
}

// --- Katman görünürlüğü ---
function applyLayer(key) {
  const L = LAYERS[key];
  L.group.visible = L.on && L.opacity > 0.01;
  for (const p of parts) if (p.layer === key) for (const m of p.meshes) {
    m.material.opacity = L.opacity;
    m.material.transparent = L.opacity < 0.99;
    m.material.depthWrite = key !== 'skin' && L.opacity > 0.6;
  }
}

// --- Seçim ve vurgulama ---
let selected = null;
const selLabel = sim.label('', { position: [0, 0, 0], className: 'big' });
selLabel.visible = false;
function select(p, point) {
  if (selected) selected.meshes.forEach((m) => m.material.emissive.copy(m.userData.baseEmissive));
  selected = p;
  if (!p) { selLabel.visible = false; infoCard.set('<b>Bir parçaya tıkla</b> — adı ve görevi burada görünecek.'); return; }
  const info = p.info || partByName[p.name].info;
  infoCard.set(`<div style="font-size:16px;font-weight:700;margin-bottom:4px">${p.name}</div>
    <div style="margin-bottom:6px;opacity:.8">${LAYER_EMOJI[p.layer]} Katman: <b>${LAYERS[p.layer].name}</b></div>${info}`);
  selLabel.setText(p.name);
  if (point) selLabel.position.copy(point);
  selLabel.visible = showLabel.value;
}

function visibleMeshes() {
  const out = [];
  for (const p of parts) {
    const L = LAYERS[p.layer];
    if (L.on && L.opacity > 0.03) out.push(...p.meshes);
  }
  return out;
}
/** İlk "katı" isabet: saydam katmanların (opaklık < %50) içinden görülür. */
function pickHit(hits) {
  for (const h of hits) if (LAYERS[h.object.userData.part.layer].opacity >= 0.5) return h;
  return hits[0];
}

sim.onClick(visibleMeshes, (_, ev) => {
  const hits = sim.raycast(ev, visibleMeshes());
  if (!hits.length) return;
  const h = pickHit(hits);
  if (game.active) return gameClick(hits, h);
  select(h.object.userData.part, h.point);
});

// --- Katmanları soy animasyonu ---
let peel = null; // { t, dir }
const PEEL = [['skin', 0.4, 2.6, 1, 0], ['muscle', 3.0, 5.4, 1, 0], ['skeleton', 5.8, 8.0, 1, 0.12]];
function startPeel(dir) {
  for (const k of Object.keys(LAYERS)) { LAYERS[k].on = true; ctl[k].toggle.set(true); }
  LAYERS.organs.opacity = 1;
  peel = { t: dir > 0 ? 0 : 8.4, dir };
  sim.toast(dir > 0 ? '🧅 Katmanlar soyuluyor: deri → kas → iskelet → organlar' : '🧍 Katmanlar geri giydiriliyor', '');
}
sim.onUpdate((dt) => {
  if (!peel) return;
  peel.t += dt * peel.dir;
  for (const [k, a, b, v0, v1] of PEEL) {
    LAYERS[k].opacity = lerp(v0, v1, smoothstep(a, b, peel.t));
    ctl[k].slider.set(Math.round(LAYERS[k].opacity * 100));
  }
  Object.keys(LAYERS).forEach(applyLayer);
  if (peel.t > 8.6 || peel.t < 0) peel = null;
});

// --- Nabız ve soluk ---
sim.onUpdate((dt, t) => {
  const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.2)), 6);
  heart.scale.setScalar(1 + beat * 0.07);
  heart.position.set(0.07, 5.0, 0.15).multiplyScalar(-(beat * 0.07));
  const br = Math.sin(t * Math.PI * 2 * 0.25);
  lungs.scale.set(1 + br * 0.035, 1 + br * 0.02, 1 + br * 0.04);
  lungs.position.set(0, 5.13 * -(br * 0.02), 0);
  if (selected) {
    const k = 0.35 + 0.25 * Math.sin(t * 6);
    selected.meshes.forEach((m) => m.material.emissive.setRGB(0.15 * k, 0.45 * k, 1.0 * k));
  }
});

// --- Organı bul oyunu ---
const TARGETS = [
  ['Kalp', 'Göğsün ortasında, biraz solda; iki akciğerin arasında.'], ['Beyin', 'Kafatasının içinde!'],
  ['Akciğerler', 'Göğüs kafesini dolduran iki pembe süngerimsi organ.'], ['Karaciğer', 'Karnın sağ üst tarafında, kaburgaların altında.'],
  ['Mide', 'Karnın sol üst tarafında, J harfine benzer.'], ['İnce bağırsak', 'Karnın ortasında kıvrım kıvrım.'],
  ['Kalın bağırsak', 'İnce bağırsağın etrafını çerçeve gibi sarar.'], ['Böbrekler', 'Arkada, bel hizasında iki fasulye. Modeli çevir!'],
  ['Mesane', 'En altta, leğen kemiğinin içinde.'], ['Kafatası', 'Beyni saran kemik kask.'], ['Kaburgalar', 'Göğüs kafesinin kemik çubukları.'],
  ['Uyluk kemiği (femur)', 'Vücudun en uzun kemiği; kalçadan dize.'], ['Omurga', 'Sırtın ortasında üst üste dizili omurlar.'],
  ['Leğen kemiği (pelvis)', 'Kalçadaki kemik halka.'],
];
const game = { active: false, list: [], i: 0, score: 0, tries: 0, correct: 0, clicks: 0 };
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startGame() {
  peel = null;
  const preset = { skin: [true, 0.12], muscle: [false, 0.35], skeleton: [true, 0.55], organs: [true, 1] };
  for (const [k, [on, op]] of Object.entries(preset)) { LAYERS[k].on = on; LAYERS[k].opacity = op; ctl[k].toggle.set(on); ctl[k].slider.set(op * 100); applyLayer(k); }
  Object.assign(game, { active: true, list: shuffle([...TARGETS]).slice(0, 10), i: 0, score: 0, tries: 0, correct: 0, clicks: 0 });
  select(null);
  sim.moveCamera(C([0, 4.3, 9]), C([0, 4.6, 0]));
  showQuestion();
}
function showQuestion(extra = '') {
  const [name] = game.list[game.i];
  sim.hud.show(`<h2>🔎 Organı bul! (${game.i + 1}/${game.list.length})</h2>
    <div style="font-size:22px;margin:4px 0">Bul: <b style="color:#38bdf8">${name}</b></div>
    <div>Puan: <b>${game.score}</b>${extra}</div>
    <button class="btn" data-a="hint">💡 İpucu</button><button class="btn" data-a="skip">⏭ Pas</button><button class="btn danger" data-a="stop">✖ Bitir</button>`);
  const b = (a) => sim.hud.el.querySelector(`[data-a=${a}]`);
  b('hint').onclick = () => showQuestion(`<div style="margin-top:6px;color:#fbbf24">💡 ${game.list[game.i][1]}</div>`);
  b('skip').onclick = () => nextQuestion();
  b('stop').onclick = () => endGame();
  gameStats();
}
function gameClick(hits, first) {
  if (!game.active || game.tries < 0) return;
  const [name] = game.list[game.i];
  game.clicks++;
  const hit = hits.slice(0, 6).find((h) => h.object.userData.part.name === name);
  if (hit) {
    const pts = game.tries === 0 ? 10 : game.tries === 1 ? 5 : 2;
    game.score += pts; game.correct++;
    select(hit.object.userData.part, hit.point);
    sim.toast(`✅ Harika! Bu <b>${name}</b> (+${pts})`, 'good');
    setTimeout(nextQuestion, 900);
    game.tries = -99;
  } else if (game.tries >= 0) {
    game.tries++;
    sim.toast(`❌ Bu <b>${first.object.userData.part.name}</b>. Tekrar dene!`, 'bad');
  }
  gameStats();
}
function nextQuestion() {
  if (!game.active) return;
  game.tries = 0;
  game.i++;
  if (game.i >= game.list.length) return endGame();
  showQuestion();
}
function endGame() {
  if (!game.active) return;
  game.active = false;
  const max = game.list.length * 10, pct = game.score / max;
  const medal = pct >= 0.85 ? '🏆 Anatomi ustası!' : pct >= 0.6 ? '🥈 Çok iyi!' : pct >= 0.3 ? '🥉 İyi başlangıç!' : '📚 Biraz daha keşfet!';
  sim.hud.show(`<h2>${medal}</h2><div>Puan: <b>${game.score}</b> / ${max} · Doğru: <b>${game.correct}</b> · Tıklama: ${game.clicks}</div>
    <button class="btn primary" data-a="again">🔁 Tekrar oyna</button><button class="btn" data-a="close">Kapat</button>`, { tone: pct >= 0.6 ? 'good' : 'warn' });
  sim.hud.el.querySelector('[data-a=again]').onclick = startGame;
  sim.hud.el.querySelector('[data-a=close]').onclick = () => sim.hud.hide();
  gameStats();
}
function gameStats() {
  stScore.set(game.score, game.active ? 'good' : '');
  stQ.set(game.active ? `${Math.min(game.i + 1, game.list.length)}/${game.list.length}` : '—');
  stCorrect.set(game.correct);
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Katmanlar');
const ctl = {};
for (const [k, L] of Object.entries(LAYERS)) {
  const toggle = ui.toggle({ label: `${LAYER_EMOJI[k]} ${L.name}`, value: L.on, onChange: (v) => { L.on = v; peel = null; applyLayer(k); } });
  const slider = ui.slider({ label: `${L.name} opaklığı`, min: 0, max: 100, step: 1, value: L.opacity * 100, unit: '%',
    onInput: (v) => { L.opacity = v / 100; peel = null; applyLayer(k); } });
  ctl[k] = { toggle, slider };
}
ui.buttons([
  { label: '🧅 Katmanları soy', variant: 'primary', onClick: () => startPeel(1) },
  { label: '🧍 Geri giydir', onClick: () => startPeel(-1) },
]);

ui.section('Bilgi kartı');
const infoCard = ui.text('', 'card');
const showLabel = ui.toggle({ label: 'Seçili parçanın etiketi', value: true, onChange: (v) => (selLabel.visible = v && !!selected) });

ui.section('Görünüm');
ui.buttons([
  { label: 'Ön', onClick: () => sim.moveCamera(C([0, 4.3, 10.5]), C([0, 3.7, 0])) },
  { label: 'Arka', onClick: () => sim.moveCamera(C([0, 4.3, -10.5]), C([0, 3.7, 0])) },
  { label: 'Yan', onClick: () => sim.moveCamera(C([10.5, 4.3, 0]), C([0, 3.7, 0])) },
  { label: 'Gövde', onClick: () => sim.moveCamera(C([1.2, 5.0, 4.4]), C([0, 4.7, 0])) },
  { label: 'Baş', onClick: () => sim.moveCamera(C([0.8, 6.6, 2.4]), C([0, 6.4, 0])) },
]);
ui.toggle({ label: 'Otomatik döndür', value: false, onChange: (v) => { sim.controls.autoRotate = v; sim.controls.autoRotateSpeed = 1.5; } });

ui.section('🧒 Çocuk modu: Organı bul');
ui.text('Sana bir organ ya da kemik adı verilecek; modelde bulup tıkla. İlk denemede 10, ikincide 5 puan!');
ui.buttons([{ label: '🎮 Oyunu başlat', variant: 'good', onClick: startGame }, { label: 'Bitir', onClick: endGame }]);
const stScore = ui.stat({ label: 'Puan' });
const stQ = ui.stat({ label: 'Soru' });
const stCorrect = ui.stat({ label: 'Doğru' });

ui.section('Model');
ui.stat({ label: 'Parça' }).set(parts.length);
ui.stat({ label: 'Organ' }).set(parts.filter((p) => p.layer === 'organs').length);
ui.stat({ label: 'Kemik grubu' }).set(parts.filter((p) => p.layer === 'skeleton').length);
ui.text('<small>Eğitim amaçlıdır, tıbbi tavsiye değildir. Organ boyut ve konumları yaklaşıktır.</small>');

function resetAll() {
  peel = null;
  game.active = false;
  sim.hud.hide();
  const def = { skin: [true, 0.22], muscle: [true, 0.35], skeleton: [true, 1], organs: [true, 1] };
  for (const [k, [on, op]] of Object.entries(def)) {
    LAYERS[k].on = on; LAYERS[k].opacity = op; ctl[k].toggle.set(on); ctl[k].slider.set(op * 100); applyLayer(k);
  }
  select(null);
  gameStats();
  sim.moveCamera(C([2.2, 4.6, 10.2]), C([0, 3.75, 0]));
}
sim.onReset(resetAll);
resetAll();

// Ölçekli gruplar: prosedürel kabartma gücü görünüm (dünya) birimindedir → nesnenin dünya ölçeğine uyarlanır (benekli görünüm olmasın)
{
  const done = new WeakSet(), ws = new THREE.Vector3();
  const fixBump = () => sim.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      const u = m.userData?.uniforms?.pBump;
      if (!u || done.has(m)) continue;
      done.add(m);
      o.getWorldScale(ws);
      u.value *= Math.max(ws.x, 1e-4) < 0.999 ? ws.x : 1;
    }
  });
  let nb = 0;
  sim.onRender(() => { if (nb++ % 30 === 0) fixBump(); });
}
