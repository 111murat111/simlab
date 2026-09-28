// Hastane odası başucu sahnesi (metre): başucu masası, hasta monitörü (canlı derişim grafiği + kan örneği), ilaç şişesi,
// blister, su bardağı, paslanmaz tepside enjektör, serum askısı + infüzyon pompası, hasta yatağı, pencere ve duvarlar.
import { THREE, mat, procedural, RoundedBoxGeometry, clamp, lerp } from '@core';

const V2 = (a) => a.map(([r, y]) => new THREE.Vector2(r, y));
const lathe = (pts, seg = 48) => new THREE.LatheGeometry(V2(pts), seg);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { tex: t, canvas: c, g };
}

export function buildClinic(sim, LOWQ) {
  const scene = sim.scene;
  const root = new THREE.Group();
  scene.add(root);
  const add = (geo, m, pos = [0, 0, 0], rot = [0, 0, 0], parent = root) => { const o = new THREE.Mesh(geo, m); o.position.fromArray(pos); o.rotation.set(...rot); parent.add(o); return o; };
  const noCast = (o) => { o.userData.noCast = true; return o; };

  // ---------- Oda ----------
  const vinyl = procedural({
    key: 'ilac-vinyl', scale: 1, bump: 0.004, params: { color: 0xc9c3b4, roughness: 0.35 },
    pattern: `
      float n = fbm3(p*1.5, 4), sp = vn3(p*140.0), sp2 = step(0.82, vn3(p*60.0 + 3.0));
      col *= 0.9 + 0.12*n + 0.06*(sp - 0.5);
      col = mix(col, col*vec3(0.75, 0.8, 0.82), sp2*0.5);
      vec2 tl = abs(fract(p.xz*1.0) - 0.5);
      float seam = smoothstep(0.495, 0.5, max(tl.x, tl.y));
      col *= 1.0 - 0.18*seam;
      rough = 0.28 + 0.15*n + 0.1*seam;
      h = sp*0.3 - seam;`,
  });
  noCast(add(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), vinyl, [0, 0, 0]));
  const paint = mat.concrete({ color: 0xd8d2c4, stains: 0.08, scale: 0.6 });
  const wallMat = procedural({
    key: 'ilac-wall', scale: 1, bump: 0.006, params: { color: 0xe6e2d6, roughness: 0.85 },
    pattern: `float n = fbm3(p*3.0, 4), f = vn3(p*60.0); col *= 0.93 + 0.08*n + 0.03*(f - 0.5); h = n*0.3 + f*0.3;`,
  });
  // Arka duvar: pencere boşluklu (4 parça)
  const WZ = -1.6, WX0 = -0.2, WX1 = 0.95, WY0 = 1.05, WY1 = 2.3;
  const wallPart = (x0, x1, y0, y1) => noCast(add(new THREE.PlaneGeometry(x1 - x0, y1 - y0), wallMat, [(x0 + x1) / 2, (y0 + y1) / 2, WZ]));
  wallPart(-5, WX0, 0, 3); wallPart(WX1, 5, 0, 3); wallPart(WX0, WX1, 0, WY0); wallPart(WX0, WX1, WY1, 3);
  // Sağ duvar
  noCast(add(new THREE.PlaneGeometry(6, 3), wallMat, [3.2, 1.5, 0.5], [0, -Math.PI / 2, 0]));
  // Duvar koruma bandı (ahşap) ve süpürgelik
  const woodRail = mat.wood({ color: 0xa87a4c, varnish: true, scale: 3 });
  noCast(add(new RoundedBoxGeometry(10, 0.14, 0.03, 2, 0.01), woodRail, [0, 0.92, WZ + 0.015]));
  noCast(add(new RoundedBoxGeometry(10, 0.1, 0.015, 2, 0.005), mat.plastic({ color: 0x6b7069, gloss: 0.3 }), [0, 0.05, WZ + 0.008]));
  // Pencere: çerçeve, parlak dış ışık, jaluzi
  const frameMat = mat.paintedMetal({ color: 0xe8e8e4, wear: 0.02 });
  const fw = WX1 - WX0, fh = WY1 - WY0, fx = (WX0 + WX1) / 2, fy = (WY0 + WY1) / 2;
  for (const [w, h, x, y] of [[fw + 0.08, 0.06, fx, WY0], [fw + 0.08, 0.06, fx, WY1], [0.06, fh, WX0, fy], [0.06, fh, WX1, fy], [0.04, fh, fx, fy], [fw, 0.04, fx, fy + 0.15]])
    noCast(add(new RoundedBoxGeometry(w, h, 0.08, 2, 0.01), frameMat, [x, y, WZ]));
  noCast(add(new RoundedBoxGeometry(fw + 0.2, 0.04, 0.22, 2, 0.01), frameMat, [fx, WY0 - 0.02, WZ + 0.08])); // pencere pervazı
  // Dışarısı: gün ışığında gökyüzü, uzak ağaçlar ve binalar (parlak, bloom alır)
  const outside = canvasTex(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9cc4ec'); gr.addColorStop(0.6, '#dbe9f6'); gr.addColorStop(1, '#eef3f0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(60 + i * 70, 90 + (i % 3) * 30, 60, 16, 0, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 9; i++) { g.fillStyle = i % 2 ? '#b9c3cc' : '#c9d0d6'; const bw = 40 + (i * 37) % 50, bh = 90 + (i * 53) % 120; g.fillRect(i * 58 - 10, h * 0.72 - bh, bw, bh + 60);
      g.fillStyle = 'rgba(120,140,160,0.5)'; for (let y = h * 0.72 - bh + 10; y < h * 0.72; y += 16) for (let x = i * 58 - 4; x < i * 58 - 10 + bw - 8; x += 12) g.fillRect(x, y, 6, 8); }
    for (let i = 0; i < 26; i++) { g.fillStyle = ['#6f9a5a', '#5f8a4e', '#86ad6a'][i % 3]; g.beginPath(); g.arc(i * 21, h * 0.74 + Math.sin(i) * 8, 26 + (i * 7) % 14, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#a3ab9c'; g.fillRect(0, h * 0.8, w, h * 0.2);
  });
  const skyMat = mat.glow({ color: 0xffffff, intensity: 1.5 });
  skyMat.emissiveMap = outside.tex;
  const sky = add(new THREE.PlaneGeometry(fw + 0.4, fh + 0.4), skyMat, [fx, fy, WZ - 0.12]);
  noCast(sky);
  const slats = new THREE.InstancedMesh(new RoundedBoxGeometry(fw - 0.04, 0.004, 0.035, 1, 0.0015), mat.plastic({ color: 0xf2f0ea, gloss: 0.2 }), 22);
  { const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.9, 0, 0));
    for (let i = 0; i < 14; i++) slats.setMatrixAt(i, m.compose(new THREE.Vector3(fx, WY1 - 0.06 - i * 0.03, WZ + 0.06), q, new THREE.Vector3(1, 1, 1))); }
  slats.count = 14;
  slats.userData.noCast = true;
  root.add(slats);
  // Alt duvar paneli (açık adaçayı yeşili, silinebilir boya) — hastane duvarı
  const dado = procedural({ key: 'ilac-wall', scale: 1, bump: 0.006, params: { color: 0xa9c2b2, roughness: 0.6 },
    pattern: `float n = fbm3(p*3.0, 4), f = vn3(p*60.0); col *= 0.93 + 0.08*n + 0.03*(f - 0.5); h = n*0.3 + f*0.3;` });
  noCast(add(new THREE.PlaneGeometry(10, 0.86), dado, [0, 0.47, WZ + 0.004]));
  noCast(add(new THREE.PlaneGeometry(6, 0.86), dado, [3.196, 0.47, 0.5], [0, -Math.PI / 2, 0]));
  // Yatak başı servis paneli: oksijen (yeşil) ve vakum (sarı) prizleri, elektrik prizleri, okuma lambası
  const HW = new THREE.Group(); HW.position.set(1.62, 1.38, WZ + 0.03); root.add(HW);
  noCast(add(new RoundedBoxGeometry(1.3, 0.2, 0.06, 3, 0.02), mat.paintedMetal({ color: 0xeef0ec, wear: 0.02 }), [0, 0, 0], [0, 0, 0], HW));
  noCast(add(new RoundedBoxGeometry(1.3, 0.03, 0.062, 2, 0.01), mat.brushedMetal({ color: 0xbfc4c8, rough: 0.4 }), [0, -0.085, 0.002], [0, 0, 0], HW));
  [[-0.5, 0x1f9d55], [-0.4, 0xf2c230], [0.38, 0xf4f4f2], [0.48, 0xf4f4f2]].forEach(([x, c], i) => {
    noCast(add(new RoundedBoxGeometry(0.075, 0.075, 0.012, 2, 0.008), mat.plastic({ color: i < 2 ? 0xf4f4f2 : 0xe6e6e2, gloss: 0.4 }), [x, 0.01, 0.036], [0, 0, 0], HW));
    noCast(add(new THREE.CylinderGeometry(0.016, 0.018, 0.014, 20).rotateX(Math.PI / 2), mat.plastic({ color: c, gloss: 0.6 }), [x, 0.01, 0.046], [0, 0, 0], HW));
  });
  noCast(add(new RoundedBoxGeometry(0.34, 0.035, 0.05, 2, 0.012), mat.plastic({ color: 0xf2f2ee, gloss: 0.3 }), [0, 0.12, 0.02], [0, 0, 0], HW));
  noCast(add(new THREE.PlaneGeometry(0.3, 0.02).rotateX(Math.PI / 2), mat.glow({ color: 0xfff1d6, intensity: 0.9 }), [0, 0.1, 0.02], [0, 0, 0], HW));
  // Duvar saati (yatağın üstünde)
  const clockFace = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, w, w); g.translate(w / 2, w / 2);
    g.fillStyle = '#1f2937'; g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillText(String(i), Math.sin(a) * 96, -Math.cos(a) * 96); }
    for (let i = 0; i < 60; i++) { const a = (i / 60) * Math.PI * 2; g.fillRect(Math.sin(a) * 116 - 1, -Math.cos(a) * 116 - 1, i % 5 ? 2 : 4, i % 5 ? 2 : 4); }
    g.lineCap = 'round'; g.strokeStyle = '#111827';
    g.lineWidth = 8; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(0.5) * 55, -Math.cos(0.5) * 55); g.stroke();
    g.lineWidth = 5; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(4.2) * 85, -Math.cos(4.2) * 85); g.stroke();
    g.strokeStyle = '#dc2626'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(2.4) * 95, -Math.cos(2.4) * 95); g.stroke();
  });
  const faceMat = mat.plastic({ color: 0xffffff, gloss: 0.2 }); faceMat.map = clockFace.tex;
  noCast(add(new THREE.CylinderGeometry(0.16, 0.16, 0.035, 48).rotateX(Math.PI / 2), mat.plastic({ color: 0x374151, gloss: 0.5 }), [1.62, 2.12, WZ + 0.02]));
  noCast(add(new THREE.CircleGeometry(0.145, 48), faceMat, [1.62, 2.12, WZ + 0.039]));
  // El antiseptiği dağıtıcısı (pencere yanında) ve bilgi panosu (sağ duvar)
  const SAN = new THREE.Group(); SAN.position.set(1.12, 1.3, WZ + 0.05); root.add(SAN);
  noCast(add(new RoundedBoxGeometry(0.11, 0.22, 0.09, 3, 0.02), mat.plastic({ color: 0xf5f5f2, gloss: 0.5 }), [0, 0, 0], [0, 0, 0], SAN));
  noCast(add(new RoundedBoxGeometry(0.07, 0.035, 0.05, 2, 0.01), mat.plastic({ color: 0x2b7bd0, gloss: 0.6 }), [0, -0.1, 0.03], [0, 0, 0], SAN));
  const board = canvasTex(512, 360, (g, w, h) => {
    g.fillStyle = '#fdfcf7'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0f766e'; g.fillRect(0, 0, w, 64);
    g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.fillText('El hijyeni: 5 an', 22, 43);
    g.fillStyle = '#1f2937'; g.font = '22px sans-serif';
    ['1. Hastaya dokunmadan önce', '2. Aseptik işlemden önce', '3. Vücut sıvısı temasından sonra', '4. Hastaya dokunduktan sonra', '5. Hasta çevresine dokunduktan sonra']
      .forEach((t, i) => g.fillText(t, 26, 108 + i * 50));
  });
  const boardMat = mat.plastic({ color: 0xffffff, gloss: 0.2 }); boardMat.map = board.tex;
  noCast(add(new RoundedBoxGeometry(0.6, 0.44, 0.02, 2, 0.006), mat.plastic({ color: 0x9aa3a8, gloss: 0.3 }), [3.19, 1.55, -0.55], [0, -Math.PI / 2, 0]));
  noCast(add(new THREE.PlaneGeometry(0.56, 0.4), boardMat, [3.178, 1.55, -0.55], [0, -Math.PI / 2, 0]));

  // ---------- Hasta yatağı (sağ arkada) ----------
  const bed = new THREE.Group(); bed.position.set(1.55, 0, -0.55); bed.rotation.y = 0.08; root.add(bed);
  const sheet = mat.fabric({ color: 0xd9dee0, scale: 1.6 }), blanket = mat.fabric({ color: 0x6f8fae, scale: 1.6 });
  const steel = mat.brushedMetal({ color: 0xb4b9bf, scale: 3, rough: 0.5 });
  add(new RoundedBoxGeometry(0.92, 0.18, 2.0, 5, 0.07), sheet, [0, 0.62, 0], [0, 0, 0], bed);
  const bl = add(new RoundedBoxGeometry(0.96, 0.05, 1.2, 5, 0.024), blanket, [0, 0.72, 0.35], [0, 0, 0], bed);
  { const p = bl.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, p.getY(i) + 0.012 * Math.sin(x * 14 + z * 5) + 0.008 * Math.sin(z * 19)); } bl.geometry.computeVertexNormals(); }
  add(new RoundedBoxGeometry(0.62, 0.12, 0.38, 5, 0.06), sheet, [0, 0.76, -0.72], [0.12, 0, 0], bed);
  add(new RoundedBoxGeometry(1.0, 0.1, 2.1, 3, 0.03), mat.paintedMetal({ color: 0xd8dcdc, wear: 0.05 }), [0, 0.48, 0], [0, 0, 0], bed);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0, 0.55, -0.8], [0, 0.9, -0.75], [0, 0.92, -0.1], [0, 0.9, 0.3], [0, 0.55, 0.35]].map((p) => new THREE.Vector3(...p))), 40, 0.014, 10), steel);
    rail.position.x = s * 0.5; bed.add(rail);
  }
  const headboard = add(new RoundedBoxGeometry(1.0, 0.6, 0.05, 4, 0.02), mat.plastic({ color: 0xd9dcd6, gloss: 0.4 }), [0, 0.95, -1.03], [0, 0, 0], bed);

  // ---------- Başucu masası ----------
  const TY = 0.75;
  const table = new THREE.Group(); root.add(table);
  // Masa üstü: açık meşe desenli laminat — seyrek, yumuşak boyuna damar (moire olmasın diye düşük frekans)
  const lam = procedural({
    key: 'ilac-laminate', physical: true, scale: 1, bump: 0.0015,
    params: { color: 0xd2b08a, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.28 },
    pattern: `
      float w = fbm3(vec3(p.x*1.2, p.y*2.0, p.z*9.0), 4);
      float streak = fbm3(vec3(p.x*0.8, 0.0, p.z*26.0 + w*2.0), 3);
      float fleck = vn3(vec3(p.x*30.0, p.y*30.0, p.z*160.0));
      col *= 0.86 + 0.18*w + 0.12*(streak - 0.5) + 0.04*(fleck - 0.5);
      col = mix(col, col*vec3(0.86, 0.76, 0.66), smoothstep(0.55, 0.8, streak)*0.35);
      rough = 0.38 + 0.1*streak;
      h = streak*0.5 + fleck*0.1;`,
  });
  add(new RoundedBoxGeometry(1.1, 0.03, 0.62, 4, 0.012), lam, [0, TY - 0.015, -0.05], [0, 0, 0], table);
  const tframe = mat.paintedMetal({ color: 0xe5e7e3, wear: 0.06 });
  add(new RoundedBoxGeometry(1.04, 0.07, 0.56, 3, 0.01), tframe, [0, TY - 0.065, -0.05], [0, 0, 0], table);
  for (const [x, z] of [[-0.5, 0.2], [0.5, 0.2], [-0.5, -0.3], [0.5, -0.3]]) add(new THREE.CylinderGeometry(0.018, 0.018, TY - 0.1, 16), tframe, [x, (TY - 0.1) / 2, z], [0, 0, 0], table);

  // ---------- Hasta monitörü ----------
  const MON = new THREE.Group(); MON.position.set(-0.22, TY, -0.2); MON.rotation.y = 0.28; root.add(MON);
  const darkPl = mat.plastic({ color: 0x2c3036, gloss: 0.35 });
  add(lathe([[0, 0], [0.09, 0], [0.095, 0.006], [0.085, 0.016], [0.03, 0.022], [0, 0.022]], 48), darkPl, [0, 0, 0], [0, 0, 0], MON);
  add(new THREE.CylinderGeometry(0.014, 0.018, 0.12, 20), steel, [0, 0.08, 0], [0, 0, 0], MON);
  const housing = add(new RoundedBoxGeometry(0.4, 0.29, 0.07, 5, 0.016), mat.plastic({ color: 0xe3e5e2, gloss: 0.4 }), [0, 0.27, 0], [-0.08, 0, 0], MON);
  const bezel = add(new RoundedBoxGeometry(0.36, 0.23, 0.01, 3, 0.004), darkPl, [0, 0.015, 0.034], [0, 0, 0], housing);
  const scr = canvasTex(1024, 640, () => {});
  const screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: scr.tex, emissiveIntensity: 1.35, roughness: 0.18, metalness: 0 });
  const screen = add(new THREE.PlaneGeometry(0.336, 0.21), screenMat, [0, 0.015, 0.0395], [0, 0, 0], housing);
  noCast(screen);
  for (let i = 0; i < 5; i++) add(new RoundedBoxGeometry(0.03, 0.012, 0.008, 2, 0.003), darkPl, [-0.1 + i * 0.045, -0.123, 0.034], [0, 0, 0], housing);
  const led = add(new THREE.SphereGeometry(0.0035, 12, 8), mat.glow({ color: 0x33ff88, intensity: 6 }), [0.155, -0.123, 0.036], [0, 0, 0], housing);

  // ---------- İlaç şişesi (amber cam, beyaz kapak, etiket, içinde kapsüller) ----------
  const BOT = new THREE.Group(); BOT.position.set(0.14, TY, 0.02); root.add(BOT);
  const amber = mat.glass({ tint: 0xc0600c, rough: 0.06, thickness: 0.004 });
  amber.attenuationDistance = 0.012; amber.color.set(0xffd9a8);
  const bottleGeo = lathe([[0, 0.0015], [0.018, 0], [0.021, 0.004], [0.022, 0.012], [0.022, 0.07], [0.021, 0.076], [0.018, 0.079], [0.018, 0.086], [0.0165, 0.086], [0.0165, 0.08], [0.0195, 0.075], [0.0205, 0.07], [0.0205, 0.012], [0.0195, 0.005], [0.0, 0.004]], 56);
  const bottle = add(bottleGeo, amber, [0, 0, 0], [0, 0, 0], BOT);
  const capPts = [[0, 0.1], [0.021, 0.1], [0.0235, 0.098]];
  for (let i = 0; i <= 20; i++) capPts.push([0.0235 + (i % 2 ? 0.0006 : 0), 0.097 - i * 0.0008]);
  capPts.push([0.0235, 0.08], [0.019, 0.08]);
  add(lathe(capPts, 64), mat.plastic({ color: 0xf6f6f2, gloss: 0.3 }), [0, 0, 0], [0, 0, 0], BOT);
  const lab = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#f7f4ec'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1e40af'; g.fillRect(0, 0, w, 46);
    g.fillStyle = '#fff'; g.font = '600 30px system-ui, sans-serif'; g.fillText('ECZANE · REÇETE', 20, 33);
    g.fillStyle = '#111'; g.font = '700 44px system-ui, sans-serif'; g.fillText('Temsili ilaç', 20, 104);
    g.font = '28px system-ui, sans-serif'; g.fillText('Hekimin önerdiği dozda', 20, 150); g.fillText('düzenli aralıkla alınız.', 20, 186);
    g.fillStyle = '#555'; g.font = '22px system-ui, sans-serif'; g.fillText('Temsili ürün — eğitim amaçlı', 20, 232);
  });
  const labelMat = new THREE.MeshStandardMaterial({ map: lab.tex, roughness: 0.75 });
  add(new THREE.CylinderGeometry(0.0224, 0.0224, 0.05, 48, 1, true, -1.9, 3.8), labelMat, [0, 0.042, 0], [0, 0.35, 0], BOT);
  // Kapsül: iki renkli kabuk
  const capsGeo = (col) => lathe([[0, 0], [0.002, 0.0003], [0.0033, 0.0015], [0.0038, 0.0035], [0.0038, 0.009], [0, 0.009]], 20);
  const capA = mat.plastic({ color: 0xf59e0b, gloss: 0.9 }), capB = mat.plastic({ color: 0xf8f5ee, gloss: 0.9 });
  const capsule = () => { const g = new THREE.Group(); const a = new THREE.Mesh(capsGeo(), capA); const b = new THREE.Mesh(capsGeo(), capB); b.rotation.x = Math.PI; b.position.y = 0.017; g.add(a, b); return g; };
  for (let i = 0; i < 7; i++) { const c = capsule(); c.position.set(Math.cos(i * 2.4) * 0.009, 0.008 + (i % 3) * 0.006, Math.sin(i * 2.4) * 0.009); c.rotation.set(1.4 + i, i * 0.7, 0.3 * i); BOT.add(c); }
  // Dökülmüş iki kapsül
  for (const [x, z, r] of [[0.21, 0.1, 0.4], [0.235, 0.075, 2.1]]) { const c = capsule(); c.position.set(x, TY + 0.0038, z); c.rotation.set(Math.PI / 2, 0, r); root.add(c); }

  // ---------- Blister (10 gözlü) ----------
  const BL = new THREE.Group(); BL.position.set(-0.24, TY + 0.0055, 0.2); BL.rotation.set(0, -0.35, 0); root.add(BL);
  const foil = procedural({
    key: 'ilac-foil', scale: 1, bump: 0.002, params: { color: 0xd8dde2, roughness: 0.28, metalness: 1 },
    pattern: `float n = fbm3(p*40.0, 3), c = vn3(p*400.0); col *= 0.9 + 0.12*n; rough = 0.22 + 0.2*n + 0.05*c; h = n*0.5 + c*0.2;`,
  });
  add(new RoundedBoxGeometry(0.115, 0.0012, 0.058, 2, 0.0005), foil, [0, -0.0048, 0], [0, 0, 0], BL);
  const bubbleMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.32, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide, depthWrite: false });
  const bubbleGeo = lathe([[0.0085, 0], [0.0085, 0.0008], [0.0078, 0.0035], [0.0065, 0.0055], [0.004, 0.0068], [0, 0.0072]], 32);
  const bubbles = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) {
    const g = new THREE.Group(); g.position.set(-0.042 + c * 0.021, -0.0042, -0.013 + r * 0.026); BL.add(g);
    const b = new THREE.Mesh(bubbleGeo, bubbleMat); b.userData.noCast = true; g.add(b);
    const cap = capsule(); cap.rotation.set(0, 0, Math.PI / 2); cap.position.set(0.0085, 0.0038, 0); cap.scale.setScalar(0.95); g.add(cap);
    bubbles.push({ g, b, cap });
  }
  let used = 0;

  // ---------- Su bardağı ----------
  const glassM = mat.glass({ tint: 0xf2fbff, rough: 0.02, thickness: 0.003 });
  add(lathe([[0, 0], [0.03, 0], [0.032, 0.002], [0.036, 0.11], [0.0335, 0.11], [0.0295, 0.008], [0, 0.008]], 56), glassM, [0.3, TY, -0.07]);
  add(lathe([[0, 0.0082], [0.0294, 0.0082], [0.033, 0.075], [0, 0.075]], 48), mat.liquid({ color: 0xd8f0ff, density: 0.8 }), [0.3, TY, -0.07]);

  // ---------- Paslanmaz tepsi + enjektör ----------
  const TR = new THREE.Group(); TR.position.set(0.02, TY, 0.2); TR.rotation.y = 0.2; root.add(TR);
  {
    const s = new THREE.Shape(); const w = 0.13, d = 0.07, r = 0.02;
    s.moveTo(-w + r, -d); s.lineTo(w - r, -d); s.quadraticCurveTo(w, -d, w, -d + r); s.lineTo(w, d - r); s.quadraticCurveTo(w, d, w - r, d); s.lineTo(-w + r, d); s.quadraticCurveTo(-w, d, -w, d - r); s.lineTo(-w, -d + r); s.quadraticCurveTo(-w, -d, -w + r, -d);
    const hole = new THREE.Path(); const w2 = w - 0.008, d2 = d - 0.008, r2 = 0.014;
    hole.moveTo(-w2 + r2, -d2); hole.lineTo(w2 - r2, -d2); hole.quadraticCurveTo(w2, -d2, w2, -d2 + r2); hole.lineTo(w2, d2 - r2); hole.quadraticCurveTo(w2, d2, w2 - r2, d2); hole.lineTo(-w2 + r2, d2); hole.quadraticCurveTo(-w2, d2, -w2, d2 - r2); hole.lineTo(-w2, -d2 + r2); hole.quadraticCurveTo(-w2, -d2, -w2 + r2, -d2);
    s.holes.push(hole);
    const rim = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 3, curveSegments: 10 });
    rim.rotateX(-Math.PI / 2);
    const ss = mat.brushedMetal({ color: 0xd4d8dc, scale: 4, rough: 0.42 });
    add(rim, ss, [0, 0.002, 0], [0, 0, 0], TR);
    const fl = new THREE.ExtrudeGeometry(new THREE.Shape(hole.getPoints()), { depth: 0.002, bevelEnabled: false }); fl.rotateX(-Math.PI / 2);
    add(fl, ss, [0, 0.001, 0], [0, 0, 0], TR);
  }
  const SY = new THREE.Group(); SY.position.set(0, 0.012, 0); SY.rotation.set(0, 0, Math.PI / 2); TR.add(SY);
  const barrelMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, transparent: true, opacity: 0.38, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  const barrel = add(lathe([[0.0062, -0.045], [0.0065, -0.045], [0.0065, 0.04], [0.0068, 0.041], [0.0068, 0.045], [0.0062, 0.045]], 32), barrelMat, [0, 0, 0], [0, 0, 0], SY);
  noCast(barrel);
  add(new RoundedBoxGeometry(0.03, 0.002, 0.018, 2, 0.0008), mat.plastic({ color: 0xf2f2f2, gloss: 0.4 }), [0, -0.044, 0], [0, 0, 0], SY); // parmak kanadı
  const ticks = canvasTex(64, 512, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#222'; for (let i = 0; i <= 20; i++) g.fillRect(0, 20 + i * 22, i % 5 ? 20 : 40, 3); });
  const tickM = new THREE.MeshBasicMaterial({ map: ticks.tex, transparent: true, depthWrite: false });
  noCast(add(new THREE.CylinderGeometry(0.00655, 0.00655, 0.075, 24, 1, true, -0.4, 0.8), tickM, [0, 0, 0], [0, 0, 0], SY));
  const drugFill = add(new THREE.CylinderGeometry(0.0058, 0.0058, 1, 24), mat.liquid({ color: 0xffe6a0, density: 0.05 }), [0, 0, 0], [0, 0, 0], SY);
  const plunger = new THREE.Group(); SY.add(plunger);
  add(lathe([[0, 0], [0.0058, 0], [0.006, 0.001], [0.0058, 0.002], [0.006, 0.003], [0.0058, 0.004], [0.0045, 0.005], [0, 0.005]], 24), mat.rubber({ color: 0x1b1b1d }), [0, 0, 0], [0, 0, 0], plunger);
  add(new RoundedBoxGeometry(0.0022, 0.09, 0.009, 1, 0.0006), mat.plastic({ color: 0xf2f2f2, gloss: 0.4 }), [0, -0.045, 0], [0, 0, 0], plunger);
  add(new RoundedBoxGeometry(0.009, 0.09, 0.0022, 1, 0.0006), mat.plastic({ color: 0xf2f2f2, gloss: 0.4 }), [0, -0.045, 0], [0, 0, 0], plunger);
  add(lathe([[0, 0], [0.009, 0], [0.0095, 0.001], [0.009, 0.002], [0, 0.002]], 24), mat.plastic({ color: 0xf2f2f2, gloss: 0.4 }), [0, -0.092, 0], [0, 0, 0], plunger);
  add(lathe([[0.0015, 0.045], [0.004, 0.045], [0.0035, 0.056], [0.0015, 0.058]], 20), mat.plastic({ color: 0x2563eb, gloss: 0.6 }), [0, 0, 0], [0, 0, 0], SY); // iğne göbeği
  add(new THREE.CylinderGeometry(0.0003, 0.0003, 0.03, 8), steel, [0, 0.072, 0], [0, 0, 0], SY);
  add(lathe([[0.0022, 0.057], [0.0026, 0.058], [0.0022, 0.1], [0.0015, 0.101], [0, 0.101]], 20), mat.plastic({ color: 0x3b82f6, gloss: 0.4 }), [0, 0, 0], [0, 0, 0], SY); // kapak
  let plungeT = 1;
  const setSyringe = (f) => { // f: 0 dolu … 1 boş
    const top = 0.04, bot = -0.04, y = lerp(bot, top - 0.005, f);
    plunger.position.y = y;
    const L = Math.max(top - (y + 0.005), 0.0005);
    drugFill.scale.y = L; drugFill.position.y = y + 0.005 + L / 2;
    drugFill.visible = L > 0.001;
  };
  setSyringe(0);

  // ---------- Serum askısı + torba + damla odacığı + infüzyon pompası ----------
  const IV = new THREE.Group(); IV.position.set(0.68, 0, -0.42); root.add(IV);
  add(new THREE.CylinderGeometry(0.011, 0.011, 1.95, 16), steel, [0, 0.975, 0], [0, 0, 0], IV);
  for (const a of [0, Math.PI]) {
    const h = add(new THREE.TorusGeometry(0.03, 0.004, 8, 24, Math.PI * 1.4), steel, [Math.cos(a) * 0.09, 1.9, 0], [0, a, Math.PI * 0.8], IV);
    add(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 8), steel, [Math.cos(a) * 0.045, 1.93, 0], [0, 0, Math.PI / 2], IV);
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    add(new RoundedBoxGeometry(0.34, 0.025, 0.035, 2, 0.008), steel, [Math.cos(a) * 0.16, 0.06, Math.sin(a) * 0.16], [0, -a, 0], IV);
    add(new THREE.CylinderGeometry(0.025, 0.025, 0.022, 16).rotateX(Math.PI / 2), mat.rubber(), [Math.cos(a) * 0.32, 0.025, Math.sin(a) * 0.32], [0, -a + Math.PI / 2, 0], IV);
  }
  const bagGeo = new RoundedBoxGeometry(0.15, 0.24, 0.03, 6, 0.014);
  { const p = bagGeo.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i); p.setZ(i, z * (1.4 - 1.6 * Math.abs(y) / 0.12) * 1.2); } bagGeo.computeVertexNormals(); }
  const bagM = new THREE.MeshPhysicalMaterial({ color: 0xf6fbff, roughness: 0.22, transparent: true, opacity: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide, depthWrite: false });
  const bag = add(bagGeo, bagM, [0.09, 1.72, 0], [0, 0, 0], IV); noCast(bag);
  const bagFluid = add(new RoundedBoxGeometry(0.13, 0.2, 0.022, 4, 0.01), mat.liquid({ color: 0xe8f6ff, density: 0.25 }), [0.09, 1.71, 0], [0, 0, 0], IV);
  const bagLab = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#0f4c81'; g.font = '700 34px system-ui'; g.fillText('%0,9 NaCl', 20, 60); g.font = '26px system-ui'; g.fillStyle = '#222'; g.fillText('500 mL', 20, 100); g.fillText('+ İlaç (IV)', 20, 140); g.fillStyle = '#b91c1c'; g.fillRect(20, 170, 200, 6); });
  add(new THREE.PlaneGeometry(0.08, 0.08), new THREE.MeshStandardMaterial({ map: bagLab.tex, roughness: 0.6, transparent: true, opacity: 0.92 }), [0.09, 1.71, 0.022], [0, 0, 0], IV);
  const chamberM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.35, clearcoat: 1, depthWrite: false });
  noCast(add(lathe([[0, 0], [0.006, 0], [0.009, 0.006], [0.009, 0.05], [0.005, 0.058], [0.002, 0.07], [0, 0.07]], 24), chamberM, [0.09, 1.5, 0], [0, 0, 0], IV));
  add(lathe([[0, 0.0], [0.0085, 0.0], [0.0085, 0.012], [0, 0.012]], 20), mat.liquid({ color: 0xd8f0ff, density: 0.4 }), [0.09, 1.505, 0], [0, 0, 0], IV);
  const drop = add(new THREE.SphereGeometry(0.0022, 12, 8), mat.liquid({ color: 0xd8f0ff, density: 0.4 }), [0.09, 1.55, 0], [0, 0, 0], IV);
  const tubeM = new THREE.MeshPhysicalMaterial({ color: 0xf2f8ff, roughness: 0.12, transparent: true, opacity: 0.55, clearcoat: 0.8, depthWrite: false });
  noCast(add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0.09, 1.5, 0], [0.09, 1.38, 0.01], [0.06, 1.25, 0.05], [0.0, 1.16, 0.07], [0.0, 1.12, 0.07]].map((p) => new THREE.Vector3(...p))), 40, 0.0022, 8), tubeM, [0, 0, 0], [0, 0, 0], IV));
  noCast(add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[0.0, 0.9, 0.07], [0.02, 0.8, 0.12], [0.2, 0.72, 0.2], [0.55, 0.74, 0.25], [0.8, 0.78, 0.25]].map((p) => new THREE.Vector3(...p))), 50, 0.0022, 8), tubeM, [0, 0, 0], [0, 0, 0], IV));
  // Pompa
  const pump = new THREE.Group(); pump.position.set(0, 1.01, 0.05); IV.add(pump);
  add(new RoundedBoxGeometry(0.13, 0.2, 0.09, 5, 0.014), mat.plastic({ color: 0xe8eae6, gloss: 0.4 }), [0, 0, 0], [0, 0, 0], pump);
  add(new RoundedBoxGeometry(0.03, 0.05, 0.05, 2, 0.006), steel, [-0.075, 0, -0.03], [0, 0, 0], pump);
  const pumpScr = canvasTex(256, 160, () => {});
  const pumpMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: pumpScr.tex, emissiveIntensity: 1.2, roughness: 0.2 });
  noCast(add(new THREE.PlaneGeometry(0.09, 0.056), pumpMat, [0, 0.045, 0.0455], [0, 0, 0], pump));
  for (let i = 0; i < 3; i++) add(new RoundedBoxGeometry(0.022, 0.014, 0.008, 2, 0.004), mat.plastic({ color: i === 2 ? 0x16a34a : 0x9ca3af, gloss: 0.5 }), [-0.03 + i * 0.03, -0.04, 0.045], [0, 0, 0], pump);
  const pumpLed = add(new THREE.SphereGeometry(0.004, 12, 8), mat.glow({ color: 0x22ff66, intensity: 5 }), [0.05, -0.075, 0.045], [0, 0, 0], pump);

  // ---------- Çizimler ----------
  function drawPump(on, rate) {
    const g = pumpScr.g, w = 256, h = 160;
    g.fillStyle = on ? '#07121c' : '#050608'; g.fillRect(0, 0, w, h);
    if (on) {
      g.fillStyle = '#7dd3fc'; g.font = '600 26px system-ui'; g.fillText('İNFÜZYON', 16, 36);
      g.fillStyle = '#ffffff'; g.font = '700 50px system-ui'; g.fillText(rate, 16, 100);
      g.fillStyle = '#94a3b8'; g.font = '22px system-ui'; g.fillText('mg/saat', 16, 136);
    } else { g.fillStyle = '#334155'; g.font = '600 24px system-ui'; g.fillText('BEKLEMEDE', 16, 90); }
    pumpScr.tex.needsUpdate = true;
    pumpLed.visible = on;
  }
  const dots = Array.from({ length: 160 }, () => [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 6.28, 0.3 + Math.random()]);
  const rbc = Array.from({ length: 26 }, () => [Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 6.28]);
  /** Monitör: derişim grafiği (pencere bantları), büyük değer, kan örneği (parçacık sayısı ∝ C) */
  function drawMonitor(d) {
    const g = scr.g, W = 1024, H = 640;
    g.fillStyle = '#04080d'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0b1622'; g.fillRect(0, 0, W, 64);
    g.fillStyle = '#7dd3fc'; g.font = '600 30px system-ui'; g.fillText('İLAÇ DÜZEYİ · ' + d.drug, 24, 43);
    g.fillStyle = '#94a3b8'; g.font = '26px system-ui'; g.textAlign = 'right'; g.fillText(d.time, W - 24, 43); g.textAlign = 'left';
    // Grafik
    const X0 = 30, Y0 = 90, GW = 610, GH = 420, top = d.top;
    const Y = (c) => Y0 + GH * (1 - clamp(c / top, 0, 1));
    g.fillStyle = 'rgba(239,68,68,0.16)'; g.fillRect(X0, Y0, GW, Y(d.mtc) - Y0);
    g.fillStyle = 'rgba(34,197,94,0.18)'; g.fillRect(X0, Y(d.mtc), GW, Y(d.mec) - Y(d.mtc));
    g.strokeStyle = 'rgba(148,163,184,0.18)'; g.lineWidth = 1;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(X0 + (GW * i) / 8, Y0); g.lineTo(X0 + (GW * i) / 8, Y0 + GH); g.stroke(); }
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(X0, Y0 + (GH * i) / 4); g.lineTo(X0 + GW, Y0 + (GH * i) / 4); g.stroke(); }
    g.setLineDash([10, 8]); g.lineWidth = 2;
    g.strokeStyle = '#ef4444'; g.beginPath(); g.moveTo(X0, Y(d.mtc)); g.lineTo(X0 + GW, Y(d.mtc)); g.stroke();
    g.strokeStyle = '#22c55e'; g.beginPath(); g.moveTo(X0, Y(d.mec)); g.lineTo(X0 + GW, Y(d.mec)); g.stroke();
    g.setLineDash([]);
    const hist = d.hist, n = hist.length;
    if (n > 1) {
      g.strokeStyle = '#38bdf8'; g.lineWidth = 5; g.shadowColor = '#38bdf8'; g.shadowBlur = 14; g.beginPath();
      for (let i = 0; i < n; i++) { const x = X0 + (GW * i) / (d.maxN - 1), y = Y(hist[i]); i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke(); g.shadowBlur = 0;
    }
    g.fillStyle = '#64748b'; g.font = '22px system-ui'; g.fillText('toksik', X0 + 8, Y(d.mtc) - 8); g.fillText('en düşük etkili', X0 + 8, Y(d.mec) + 26);
    // Değer
    g.fillStyle = d.zoneCol; g.font = '700 108px system-ui'; g.fillText(d.C, 670, 190);
    g.fillStyle = '#94a3b8'; g.font = '30px system-ui'; g.fillText('mg/L', 675, 232);
    g.fillStyle = d.zoneCol; g.font = '600 32px system-ui'; g.fillText(d.zone, 675, 282);
    // Kan örneği
    const cx = 845, cy = 450, R = 128;
    g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    const bg = g.createRadialGradient(cx, cy, 10, cx, cy, R); bg.addColorStop(0, '#5a0d12'); bg.addColorStop(1, '#22040a');
    g.fillStyle = bg; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    const t = d.t;
    for (const [x, y, a] of rbc) {
      const px = cx + ((x + t * 0.05 + 1) % 2 - 1) * R, py = cy + y * R;
      g.fillStyle = '#b3202a'; g.beginPath(); g.ellipse(px, py, 20, 13, a, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#7a1018'; g.beginPath(); g.ellipse(px, py, 9, 5, a, 0, Math.PI * 2); g.fill();
    }
    const k = Math.round(clamp(d.frac, 0, 1) * dots.length);
    for (let i = 0; i < k; i++) {
      const [x, y, a, s] = dots[i];
      const px = cx + ((x + t * 0.08 * s + 1) % 2 - 1) * R + Math.sin(t * 2 + a) * 4, py = cy + y * R + Math.cos(t * 1.7 + a) * 4;
      const gr = g.createRadialGradient(px, py, 0, px, py, 9); gr.addColorStop(0, d.dotCol); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(px, py, 9, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    g.strokeStyle = '#94a3b8'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#94a3b8'; g.font = '22px system-ui'; g.fillText('kan örneği (büyütülmüş)', cx - 120, cy - R - 12);
    // Alt satır
    g.fillStyle = '#cbd5e1'; g.font = '26px system-ui';
    g.fillText(d.foot, 30, 580);
    scr.tex.needsUpdate = true;
  }

  return {
    root, TY,
    screenMat,
    objects: { monitor: housing, bottle, blister: BL, syringe: SY, bag, pump, bed },
    labels: [[MON, [0, 0.47, 0], 'Hasta monitörü'], [BOT, [0, 0.14, 0], 'İlaç şişesi'], [BL, [0, 0.03, 0.04], 'Blister'], [TR, [0.06, 0.05, 0.05], 'Enjektör'], [IV, [0.1, 1.92, 0], 'Serum ve infüzyon pompası']],
    drawMonitor, drawPump,
    takePill() {
      if (used >= bubbles.length) { bubbles.forEach((b) => { b.cap.visible = true; b.b.scale.y = 1; }); used = 0; }
      const b = bubbles[used++]; b.cap.visible = false; b.b.scale.y = 0.35;
    },
    resetPills() { bubbles.forEach((b) => { b.cap.visible = true; b.b.scale.y = 1; }); used = 0; },
    pushSyringe() { plungeT = 0; },
    setIV(on, inf) { bagFluid.visible = true; drawPump(inf, ''); },
    update(dt, t, { infusing, rate, ivMode }) {
      if (plungeT < 1) { plungeT = Math.min(1, plungeT + dt * 0.7); setSyringe(plungeT < 0.8 ? plungeT / 0.8 : 1); if (plungeT >= 1) setSyringe(0); }
      const k = (t * (infusing ? 1.6 : 0.3)) % 1;
      drop.position.y = 1.555 - k * 0.04; drop.visible = infusing || ivMode ? true : k < 0.1;
      led.material.emissiveIntensity = 4 + 3 * Math.max(0, Math.sin(t * 6));
    },
  };
}
