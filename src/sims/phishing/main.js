// Oltalama (Phishing) Avcısı — 3B masada e-posta istemcisi; güvenli/oltalama kararı ve ipuçlarının vurgulanması.
import { createSim, THREE, fmt, textPlane, RoundedBoxGeometry, instanced, mat, procedural } from '@core';
import { createCity } from './city.js';
import { EMAILS, CLUE } from './emails.js';

const sim = createSim({
  sky: { elevation: 28, azimuth: 338, clouds: 0.3, haze: 1, visibility: 5000, wind: [4, 1] },
  camera: { position: [0.12, 1.12, 1.08], target: [0, 1.0, -0.2], fov: 40, near: 0.02, far: 30000 },
  look: { aoRadius: 0.12 },
  controls: { minDistance: 0.4, maxDistance: 2.6, maxPolarAngle: Math.PI * 0.6, minAzimuthAngle: -1.1, maxAzimuthAngle: 1.1 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Masandaki bilgisayara e-postalar geliyor. Bazıları gerçek, bazıları seni kandırıp şifreni, kart bilgini ya da
    paranı almaya çalışan <b>oltalama</b> (phishing) e-postaları. Her birini inceleyip <b>Güvenli</b> ya da <b>Oltalama</b> olarak işaretle;
    ardından ipuçları ekranda numaralarla gösterilir.</p>
    <h3>Dene</h3>
    <ul>
      <li>Bağlantıların <b>üzerine gel</b> (dokunmatikte dokun): alttaki durum çubuğunda ve ipucu kutusunda gerçek adres görünür.</li>
      <li>Gönderen adresinde harf oyunlarına bak: <i>anadoIudijital</i> (büyük i), <i>bulutkasa.com-destek.info</i>.</li>
      <li>Alan adında belirleyici olan <b>en sondaki</b> kısımdır: <i>x.com.tr.ornek.net</i> aslında <i>ornek.net</i>'tir.</li>
      <li>Zor seviyede süre sınırı var: acele ettirilmek oltalamacıların en sevdiği yöntemdir.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Şüpheli bir mesajda bağlantıya tıklama, ek açma; kurumu <b>resmî numarasından</b> kendin ara. Bankalar ve kurumlar
    şifre, kart CVV'si ya da SMS/OTP kodu istemez. Oltalama girişimlerini kurumunun BT ekibine ve <b>USOM</b>'a bildirebilirsin.
    Şifreni girdiysen hemen değiştir, bankana haber ver.</p>
    <p><small>Buradaki tüm marka, kişi ve alan adları kurgusaldır.</small></p>`,
});

// ---------- Oda ve masa (metre): üçüncü kattaki ofis, pencereden öğleden sonra güneşi, dışarıda şehir ----------
const S = sim.scene;
const V2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y));
const printed = (text, h, opts) => { // basılı kâğıt/poster: ışıkla aydınlanan yazı
  const p = textPlane(text, h, opts);
  p.material = new THREE.MeshStandardMaterial({ map: p.material.map, transparent: !opts.bg, roughness: 0.85 });
  return p;
};
const room = new THREE.Group(); // iç mekân: gökyüzü ortam ışığı içeride kısılır (oda gökyüzünü görmez)
S.add(room);
const add = (m, x, y, z) => { if (x !== undefined) m.position.set(x, y, z); room.add(m); return m; };
const rbox = (w, h, d, r, m) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), m);
{
  // Boyalı sıva (ince pürüz, hafif ton dalgası) ve meşe parke (tahta tahta, lif boyuna)
  const paint = procedural({
    key: 'ph-paint', scale: 1, bump: 0.004, params: { color: 0xe4ddd0, roughness: 0.88 },
    pattern: `float n = fbm3(p*1.3, 4), s = vn3(p*140.0); col *= 0.94 + 0.08*n + 0.03*(s - 0.5); rough = 0.84 + 0.08*s; h = s*0.6 + n*0.4;`,
  });
  const parquet = procedural({
    key: 'ph-parquet', physical: true, scale: 1, bump: 0.01,
    params: { color: 0x8a6444, roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.3 },
    pattern: `
      float row = floor(p.z/0.16); float off = h13(vec3(row, 1.0, 2.0))*1.3;
      float col2 = floor((p.x + off)/1.1); float id = h13(vec3(row, col2, 5.0));
      vec2 f = vec2(fract((p.x + off)/1.1), fract(p.z/0.16));
      float seam = smoothstep(0.0, 0.012, f.y)*smoothstep(0.0, 0.012, 1.0 - f.y)*smoothstep(0.0, 0.002, f.x)*smoothstep(0.0, 0.002, 1.0 - f.x);
      float grain = fbm3(vec3(p.x*3.0, p.y, p.z*90.0) + id*20.0, 4);
      float streak = vn3(vec3(p.x*0.8, 0.0, p.z*260.0) + id*9.0);
      col *= (0.78 + 0.35*id)*(0.8 + 0.3*grain + 0.12*streak)*mix(0.55, 1.0, seam);
      rough = 0.42 + 0.18*grain + 0.3*(1.0 - seam);
      h = seam*0.7 + grain*0.3;`,
  });
  add(new THREE.Mesh(new THREE.PlaneGeometry(8, 5).rotateX(-Math.PI / 2), parquet), 0, 0, 1.88);
  add(new THREE.Mesh(new THREE.PlaneGeometry(8, 5).rotateX(Math.PI / 2), paint), 0, 2.8, 1.88);
  // Arka duvar: geniş pencere boşluğu çevresinde dört parça; yan duvarlar odayı kapatır
  const WZ = -0.62, WX0 = -1.62, WX1 = -0.42, WY0 = 0.92, WY1 = 2.12;
  const wallPart = (x0, x1, y0, y1) => add(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, 0.24), paint), (x0 + x1) / 2, (y0 + y1) / 2, WZ - 0.12);
  wallPart(-4, WX0, 0, 2.8); wallPart(WX1, 4, 0, 2.8); wallPart(WX0, WX1, 0, WY0); wallPart(WX0, WX1, WY1, 2.8);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.8, 4.2), paint), -2.3, 1.4, 1.4);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.8, 4.2), paint), 2.3, 1.4, 1.4);
  const trim = mat.paintedMetal({ color: 0xf1efea, wear: 0 });
  add(rbox(8, 0.09, 0.02, 0.005, trim), 0, 0.045, WZ + 0.01);
  // Pencere: beyaz PVC kasa, orta kayıt, cam, mermer denizlik, yukarı toplanmış jaluzi
  const pvc = mat.plastic({ color: 0xf2f2ef, gloss: 0.3 });
  const fr = (w, h, x, y) => add(rbox(w, h, 0.07, 0.01, pvc), x, y, WZ - 0.05);
  const cx = (WX0 + WX1) / 2, cy = (WY0 + WY1) / 2;
  fr(WX1 - WX0, 0.06, cx, WY0 + 0.03); fr(WX1 - WX0, 0.06, cx, WY1 - 0.03);
  fr(0.06, WY1 - WY0, WX0 + 0.03, cy); fr(0.06, WY1 - WY0, WX1 - 0.03, cy); fr(0.05, WY1 - WY0, cx, cy);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(WX1 - WX0, WY1 - WY0), new THREE.MeshPhysicalMaterial({ color: 0xeaf4ff, transparent: true, opacity: 0.06, roughness: 0.02, depthWrite: false }));
  add(glass, cx, cy, WZ - 0.06);
  add(rbox(WX1 - WX0 + 0.14, 0.03, 0.28, 0.01, procedural({
    key: 'ph-marble', physical: true, bump: 0.002, params: { color: 0xe9e5dd, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.1 },
    pattern: `float v = pow(ridge3(p*vec3(3.0, 3.0, 6.0) + fbm3(p*4.0, 4)*2.0), 10.0); col = mix(col, vec3(0.55, 0.55, 0.57), v*0.6); h = v;`,
  })), cx, WY0 - 0.015, WZ + 0.03);
  const slats = instanced(new RoundedBoxGeometry(WX1 - WX0 - 0.1, 0.004, 0.025, 1, 0.0015), mat.paintedMetal({ color: 0xe8e6e0, wear: 0 }), 22);
  { const d = new THREE.Object3D(); for (let i = 0; i < 22; i++) { d.position.set(cx, WY1 - 0.1 - i * 0.0055, WZ + 0.02); d.rotation.x = 0.05 * Math.sin(i * 3.1); d.updateMatrix(); slats.setMatrixAt(i, d.matrix); } }
  room.add(slats);
  add(rbox(WX1 - WX0 - 0.06, 0.03, 0.04, 0.008, trim), cx, WY1 - 0.06, WZ + 0.02);
  // Pencere altında panel radyatör (dikey kanallı)
  const rad = procedural({
    key: 'ph-radiator', bump: 0.02, params: { color: 0xf0eee9, roughness: 0.45 },
    pattern: `float r = abs(fract(p.x/0.033) - 0.5)*2.0; float g = smoothstep(0.6, 0.95, r); col *= 1.0 - 0.18*g; h = 1.0 - g;`,
  });
  add(rbox(1.0, 0.5, 0.08, 0.012, rad), cx, 0.42, WZ + 0.06);
  // Dışarısı: aşağıda şehir, karşıda binalar
  S.add(createCity({ ground: -9, rect: [-700, -1400, 700, -30], pitch: 60, seed: 4, lit: 0.08, glow: 0.8, tall: () => 0.06, avoid: (x, z) => z > -30 }));
  const street = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), mat.asphalt({ color: 0x4a4b4f }));
  street.position.set(0, -9, -1500); street.userData.noFit = true; street.userData.noCast = true; S.add(street);
  // Duvar posteri (çerçeveli baskı)
  const poster = printed('DUR · DÜŞÜN · SONRA TIKLA', 0.06, { color: '#fde68a', bg: '#7f1d1d' });
  add(poster, 0.78, 1.4, WZ + 0.014);
  const pw = poster.geometry.parameters.width;
  add(rbox(pw + 0.05, 0.11, 0.015, 0.004, mat.wood({ color: 0x2a1c12, varnish: true })), 0.78, 1.4, WZ + 0.005);
  const oak = mat.wood({ color: 0xa47a4e, varnish: true, ring: 12, scale: 2.5 });
  // Masa: meşe tabla, siyah çelik çerçeve
  const topG = new RoundedBoxGeometry(0.05, 1.7, 0.85, 3, 0.01); topG.rotateZ(Math.PI / 2);
  add(new THREE.Mesh(topG, oak), 0, 0.725, -0.12);
  const frameM = mat.paintedMetal({ color: 0x1f2226, wear: 0.08 });
  for (const x of [-0.78, 0.78]) {
    for (const z of [-0.46, 0.22]) add(rbox(0.05, 0.7, 0.05, 0.008, frameM), x, 0.35, z);
    add(rbox(0.06, 0.03, 0.78, 0.008, frameM), x, 0.015, -0.12);
  }
  add(rbox(1.5, 0.06, 0.03, 0.008, frameM), 0, 0.67, -0.46);
  // Monitör: ince çerçeve, arkası mat plastik, alüminyum ayak
  const alu = mat.brushedMetal({ color: 0xb7bbc0 });
  add(rbox(0.26, 0.012, 0.18, 0.005, alu), 0, 0.756, -0.24);
  const neck = add(rbox(0.05, 0.26, 0.022, 0.008, alu), 0, 0.88, -0.262); neck.rotation.x = -0.08;
  add(new THREE.Mesh(new RoundedBoxGeometry(0.69, 0.45, 0.03, 4, 0.012), mat.plastic({ color: 0x15171a, gloss: 0.2 })), 0, 1.1, -0.215);
  add(rbox(0.12, 0.012, 0.004, 0.002, mat.plastic({ color: 0x2a2d31, gloss: 0.4 })), 0, 0.89, -0.199); // alt logo şeridi
  // Klavye: alüminyum gövde, 5 sıra tuş + boşluk sırası (farklı genişlikler)
  const kb = add(rbox(0.44, 0.012, 0.145, 0.005, alu), 0, 0.757, 0.06); kb.rotation.x = 0.03;
  const keyRows = [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2], [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5], [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
    [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75], [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25]];
  const nKeys = keyRows.reduce((s, r) => s + r.length, 0);
  const keys = instanced(new RoundedBoxGeometry(0.0255, 0.007, 0.0235, 2, 0.003), mat.plastic({ color: 0x2a2c30, gloss: 0.1 }), nKeys);
  { const d = new THREE.Object3D(); let n = 0; const U = 0.0272;
    keyRows.forEach((row, r) => { let x = -0.2; row.forEach((w) => {
      d.position.set(x + (w * U) / 2, 0.7665 + r * 0.0009, 0.004 + r * 0.0265); d.scale.set((w * U - 0.0017) / 0.0255, 1, 1);
      d.updateMatrix(); keys.setMatrixAt(n++, d.matrix); x += w * U; }); }); }
  room.add(keys);
  // Fare ve fare altlığı
  const mouseG = new THREE.LatheGeometry(V2([[0, 0], [0.028, 0.001], [0.031, 0.008], [0.027, 0.02], [0.016, 0.028], [0, 0.03]]), 32);
  mouseG.scale(0.95, 1, 1.55);
  add(new THREE.Mesh(mouseG, mat.plastic({ color: 0xe9e9e6, gloss: 0.5 })), 0.36, 0.753, 0.07);
  add(rbox(0.25, 0.003, 0.21, 0.0015, mat.fabric({ color: 0x2c3036 })), 0.36, 0.7515, 0.07);
  // Kupa (kırmızı seramik) + kulp, çay
  const mug = new THREE.Group();
  mug.add(new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 0], [0.036, 0], [0.04, 0.004], [0.041, 0.1], [0.038, 0.103], [0.036, 0.098], [0.034, 0.008], [0, 0.008]]), 36), mat.ceramic({ color: 0xb91c1c })));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.0065, 10, 20, Math.PI * 1.1), mat.ceramic({ color: 0xb91c1c }));
  handle.rotation.z = -Math.PI * 0.55; handle.position.set(0.043, 0.052, 0); mug.add(handle);
  const tea = new THREE.Mesh(new THREE.CircleGeometry(0.035, 28).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x5a1e05, roughness: 0.05, clearcoat: 1 }));
  tea.position.y = 0.08; mug.add(tea);
  add(mug, -0.47, 0.75, 0.02); mug.rotation.y = 0.6;
  // Çalışma lambası: ağır taban, iki kol, eklemler, alüminyum başlık, sıcak ampul (gerçek spot ışığı)
  const lamp = new THREE.Group();
  const black = mat.paintedMetal({ color: 0x202226, wear: 0.05 });
  lamp.add(new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 0], [0.075, 0], [0.078, 0.006], [0.07, 0.022], [0.02, 0.028], [0, 0.028]]), 40), black));
  const arm = (len) => { const g = new THREE.CylinderGeometry(0.007, 0.007, len, 12); g.translate(0, len / 2, 0); return new THREE.Mesh(g, black); };
  const joint = () => new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 16).rotateZ(Math.PI / 2), alu);
  const a1 = arm(0.36); a1.position.y = 0.028; a1.rotation.z = -0.35; lamp.add(a1);
  const j1 = joint(); j1.position.y = 0.36; a1.add(j1);
  const a2 = arm(0.32); a2.position.y = 0.36; a2.rotation.z = 1.75; a1.add(a2);
  const head = new THREE.Group(); head.position.y = 0.32; head.rotation.z = -1.0; a2.add(head);
  head.add(joint());
  const shade = new THREE.Mesh(new THREE.LatheGeometry(V2([[0.012, 0.03], [0.02, 0.02], [0.05, -0.05], [0.062, -0.1], [0.059, -0.1], [0.047, -0.05], [0.017, 0.018], [0.009, 0.027]]), 40), mat.paintedMetal({ color: 0x2b3c4f, wear: 0.05 }));
  shade.material.side = THREE.DoubleSide;
  head.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 20, 14), mat.glow({ color: 0xffd7a0, intensity: 2.5 }));
  bulb.position.y = -0.065; head.add(bulb);
  const spot = new THREE.SpotLight(0xffc98a, 0.4, 3, 0.75, 0.6, 2);
  spot.position.y = -0.07; head.add(spot);
  const spotT = new THREE.Object3D(); spotT.position.y = -1; head.add(spotT); spot.target = spotT;
  add(lamp, -0.6, 0.75, -0.38); lamp.rotation.y = -0.5;
  // Paşa kılıcı (sansevieria) saksıda: dik, ince uzun yapraklar
  const pot = add(new THREE.Mesh(new THREE.LatheGeometry(V2([[0, 0], [0.045, 0], [0.05, 0.005], [0.062, 0.11], [0.066, 0.115], [0.06, 0.118], [0, 0.1]]), 32), mat.ceramic({ color: 0xd8d2c6 })), 0.64, 0.75, -0.32);
  const bladeS = new THREE.Shape(V2([[-0.012, 0], [0.012, 0], [0.016, 0.12], [0.01, 0.26], [0, 0.32], [-0.01, 0.26], [-0.016, 0.12]]));
  const bladeG = new THREE.ExtrudeGeometry(bladeS, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1 });
  const leafM = procedural({
    key: 'sansevieria', scale: 60, bump: 0.01, params: { color: 0x3c6b2c, roughness: 0.55, side: THREE.DoubleSide },
    pattern: `float b = 0.5 + 0.5*sin(p.y*1.3 + fbm3(p*vec3(0.4, 0.2, 0.4), 3)*6.0); col *= mix(vec3(0.55, 0.7, 0.5), vec3(1.15, 1.2, 0.95), b); rough = 0.5; h = b;`,
  });
  for (let i = 0; i < 9; i++) {
    const b = new THREE.Mesh(bladeG, leafM);
    const a = i * 2.4, rr0 = 0.012 + (i % 3) * 0.01;
    b.position.set(Math.cos(a) * rr0, 0.09, Math.sin(a) * rr0);
    b.rotation.set(Math.sin(a) * 0.18, a, Math.cos(a) * 0.18);
    b.scale.setScalar(0.8 + (i % 4) * 0.12);
    pot.add(b);
  }
  // Kitaplar, not defteri + kalem, telefon
  [0x1e3a5f, 0x7a2e2e, 0xd9c7a3].forEach((c, i) => {
    const bk = add(rbox(0.21, 0.03, 0.28, 0.004, mat.fabric({ color: c })), 0.66, 0.765 + i * 0.031, 0.1); bk.rotation.y = 0.1 - i * 0.07;
  });
  const paper = procedural({
    key: 'ph-paper', bump: 0.0, params: { color: 0xf4f1e8, roughness: 0.9 },
    pattern: `float l = step(0.9, fract(p.z/0.008)); col *= 1.0 - 0.18*l*vec3(1.0, 0.6, 0.3); h = 0.0;`,
  });
  const nb = add(rbox(0.15, 0.008, 0.21, 0.002, paper), -0.3, 0.754, 0.2); nb.rotation.y = 0.18;
  add(rbox(0.155, 0.004, 0.215, 0.002, mat.fabric({ color: 0x1f2a36 })), -0.3, 0.7505, 0.2).rotation.y = 0.18;
  const pen = add(new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 12).rotateZ(Math.PI / 2), mat.plastic({ color: 0x1d4ed8, gloss: 0.7 })), -0.27, 0.763, 0.18);
  pen.rotation.y = -0.7;
  const phone = add(rbox(0.075, 0.008, 0.155, 0.004, new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, roughness: 0.08, clearcoat: 1 })), -0.6, 0.754, 0.2);
  phone.rotation.y = -0.25;
  // Monitöre yapışık not (kâğıt)
  const note = printed('Şifre ve kod paylaşılmaz!', 0.022, { color: '#1f2937', bg: '#fde047' });
  add(note, 0.3, 0.9, -0.198); note.rotation.z = -0.06;
}

// ---------- Ekran (CanvasTexture) ----------
const CW = 1024, CH = 640;
const cv = document.createElement('canvas');
cv.width = CW; cv.height = CH;
const g = cv.getContext('2d');
const tex = new THREE.CanvasTexture(cv);
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = sim.renderer.capabilities.getMaxAnisotropy();
// Ekran: ölçülü ışık yayan tuval (gerçek bir monitör fotoğrafı gibi okunur, patlamaz); üstte parlak cam yansıması
const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.4), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.62, roughness: 0.18, metalness: 0 }));
screen.position.set(0, 1.1, -0.199);
S.add(screen);
// İç mekân ortam ışığı: gökyüzü haritası kısık bağlanır (oda gökyüzünün yalnız pencereden görünen parçasını alır)
{
  const inner = new Set();
  room.traverse((o) => { if (o.material && (o.material.isMeshStandardMaterial)) inner.add(o.material); });
  let bound = null;
  sim.onRender(() => {
    if (S.environment === bound) return;
    bound = S.environment;
    for (const m of inner) { m.envMap = bound; m.envMapIntensity = 0.7; }
  });
}

// Olta iğnesi: oltalama ortaya çıkınca ekranın önüne iner
const hook = new THREE.Group();
{
  const m = mat.brushedMetal({ color: 0xcfd4da, rough: 0.2 });
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }));
  line.position.y = 0.6;
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 8), m);
  shank.position.y = -0.04;
  const bend = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 8, 24, Math.PI * 1.3), m);
  bend.position.set(0.025, -0.08, 0);
  bend.rotation.z = Math.PI;
  hook.add(line, shank, bend);
}
hook.position.set(0.22, 1.9, -0.12);
S.add(hook);
let hookY = 1.9;

// HUD bu simülasyonda altta dursun: e-postanın başlığını örtmesin
sim.hud.el.style.top = 'auto';
sim.hud.el.style.bottom = '60px';
sim.hud.el.style.width = 'min(520px, 92%)';

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
function rr(x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function wrap(text, maxW) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

let regions = {};
function drawEmail(em, { revealed = false, hover = -1, idx = 0, total = 0 } = {}) {
  regions = {};
  g.fillStyle = '#f8fafc'; g.fillRect(0, 0, CW, CH);
  // Başlık çubuğu
  g.fillStyle = '#1e293b'; g.fillRect(0, 0, CW, 44);
  ['#ef4444', '#f59e0b', '#22c55e'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(22 + i * 22, 22, 7, 0, 7); g.fill(); });
  g.fillStyle = '#e2e8f0'; g.font = `600 20px ${FONT}`; g.textBaseline = 'middle';
  g.fillText('e-Posta · Gelen Kutusu', 100, 23);
  if (total) { g.textAlign = 'right'; g.fillText(`${idx + 1} / ${total}`, CW - 18, 23); g.textAlign = 'left'; }
  // Kenar çubuğu
  g.fillStyle = '#e2e8f0'; g.fillRect(0, 44, 150, CH - 80);
  g.font = `500 18px ${FONT}`;
  ['📥 Gelen', '📤 Giden', '📝 Taslak', '⚠️ Spam', '🗑️ Çöp'].forEach((f, i) => {
    if (!i) { g.fillStyle = '#bfdbfe'; g.fillRect(0, 60, 150, 38); }
    g.fillStyle = '#1e293b'; g.fillText(f, 16, 79 + i * 44);
  });
  if (!em) {
    g.fillStyle = '#334155'; g.font = `600 30px ${FONT}`;
    g.fillText('Oltalama Avcısı', 190, 150);
    g.font = `400 22px ${FONT}`; g.fillStyle = '#475569';
    ['Zorluk seç ve başla.', 'Her e-postada gönderen adresine, bağlantıların', 'gerçek adresine ve eklere dikkat et.'].forEach((l, i) => g.fillText(l, 190, 200 + i * 34));
    statusBar('Hazır');
    tex.needsUpdate = true;
    return;
  }
  const X0 = 172, MW = CW - X0 - 28;
  let y = 84;
  g.fillStyle = '#0f172a'; g.font = `700 30px ${FONT}`;
  g.fillText(em.subject, X0, y);
  regions.subject = [X0 - 6, y - 22, Math.min(MW, g.measureText(em.subject).width + 12), 44];
  y += 50;
  // Gönderen
  g.fillStyle = em.phish && revealed ? '#fecaca' : '#c7d2fe';
  g.beginPath(); g.arc(X0 + 20, y + 12, 20, 0, 7); g.fill();
  g.fillStyle = '#1e1b4b'; g.font = `700 20px ${FONT}`; g.textAlign = 'center';
  g.fillText(em.fromName[0], X0 + 20, y + 13); g.textAlign = 'left';
  g.fillStyle = '#0f172a'; g.font = `700 22px ${FONT}`;
  g.fillText(em.fromName, X0 + 52, y);
  const nw = g.measureText(em.fromName).width;
  g.fillStyle = '#475569'; g.font = `400 20px ${FONT}`;
  const addr = `<${em.fromAddr}>`;
  g.fillText(addr, X0 + 52, y + 27);
  regions.from = [X0 + 46, y - 16, Math.max(nw, g.measureText(addr).width) + 14, 58];
  g.textAlign = 'right'; g.fillStyle = '#64748b'; g.font = `400 18px ${FONT}`;
  g.fillText(em.date, CW - 28, y); g.textAlign = 'left';
  y += 58;
  g.fillStyle = '#64748b'; g.font = `400 18px ${FONT}`;
  g.fillText('Kime: deniz.kaya@ornekas.com.tr', X0, y);
  y += 18;
  g.fillStyle = '#cbd5e1'; g.fillRect(X0, y, MW, 2);
  y += 34;
  // Gövde
  g.font = `400 25px ${FONT}`; g.fillStyle = '#1e293b';
  em.body.forEach((p, i) => {
    const lines = wrap(p, MW);
    const y0 = y;
    lines.forEach((l) => { g.fillText(l, X0, y); y += 33; });
    regions['p' + i] = [X0 - 8, y0 - 20, Math.min(MW + 16, Math.max(...lines.map((l) => g.measureText(l).width)) + 16), y - y0 + 6];
    y += 10;
  });
  // Bağlantılar
  em.links.forEach((lk, i) => {
    y += 6;
    if (lk.button) {
      g.font = `700 22px ${FONT}`;
      const w = g.measureText(lk.text).width + 48;
      g.fillStyle = hover === i ? '#1d4ed8' : '#2563eb';
      rr(X0, y - 24, w, 46, 10); g.fill();
      g.fillStyle = '#fff'; g.fillText(lk.text, X0 + 24, y);
      regions['link' + i] = [X0 - 6, y - 30, w + 12, 58];
    } else {
      g.font = `500 22px ${FONT}`;
      const w = g.measureText(lk.text).width;
      if (hover === i) { g.fillStyle = '#dbeafe'; g.fillRect(X0 - 4, y - 17, w + 8, 34); }
      g.fillStyle = '#1d4ed8'; g.fillText(lk.text, X0, y);
      g.fillRect(X0, y + 13, w, 2);
      regions['link' + i] = [X0 - 8, y - 22, w + 16, 44];
    }
    y += 52;
  });
  // Ekler
  em.attachments.forEach((at, i) => {
    g.font = `500 20px ${FONT}`;
    const label = `📎 ${at.name}  ·  ${at.size}`;
    const w = g.measureText(label).width + 32;
    g.fillStyle = '#e2e8f0'; rr(X0, y - 22, w, 46, 10); g.fill();
    g.strokeStyle = '#94a3b8'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#0f172a'; g.fillText(label, X0 + 16, y + 1);
    regions['attach' + i] = [X0 - 6, y - 28, w + 12, 58];
    y += 58;
  });
  // İpuçları
  if (revealed) {
    em.clues.forEach((c, i) => {
      const r = regions[c.at];
      if (!r) return;
      const col = c.type === 'ok' ? '#16a34a' : '#dc2626';
      g.strokeStyle = col; g.lineWidth = 4;
      rr(r[0], r[1], r[2], r[3], 8); g.stroke();
      g.fillStyle = col;
      g.beginPath(); g.arc(r[0], r[1], 15, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = `700 18px ${FONT}`; g.textAlign = 'center';
      g.fillText(String(i + 1), r[0], r[1] + 1); g.textAlign = 'left';
    });
    // Damga
    g.save();
    g.translate(CW - 170, CH - 120); g.rotate(-0.18);
    g.strokeStyle = em.phish ? '#dc2626' : '#16a34a'; g.lineWidth = 5;
    rr(-118, -32, 236, 64, 10); g.stroke();
    g.fillStyle = em.phish ? '#dc2626' : '#16a34a'; g.font = `800 32px ${FONT}`; g.textAlign = 'center';
    g.fillText(em.phish ? 'OLTALAMA' : 'GÜVENLİ', 0, 2);
    g.restore(); g.textAlign = 'left';
  }
  statusBar(hover >= 0 ? `🔗 ${em.links[hover].url}` : em.links.length ? 'Bağlantının gerçek adresini görmek için üzerine gel' : 'Hazır');
  tex.needsUpdate = true;
}
function statusBar(txt) {
  g.fillStyle = '#e5e7eb'; g.fillRect(0, CH - 36, CW, 36);
  g.fillStyle = '#cbd5e1'; g.fillRect(0, CH - 36, CW, 1);
  g.fillStyle = txt.startsWith('🔗') ? '#1d4ed8' : '#475569';
  g.font = `500 18px ${FONT}`; g.textBaseline = 'middle';
  g.fillText(txt, 14, CH - 17);
}

// ---------- Oyun durumu ----------
const DIFF = {
  kolay: { label: 'Kolay', levels: [1, 2] },
  orta: { label: 'Orta', levels: [1, 2, 3] },
  zor: { label: 'Zor', levels: [2, 3] },
};
let st = 'intro', deck = [], cur = 0, score = 0, streak = 0, best = 0, right = 0, wrong = 0;
let hover = -1, hoveredThis = false, hoverCount = 0, linkEmails = 0, timeLeft = 0, qStart = 0;
const missed = {};
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function startGame(diff) {
  if (diff) diffSel.set(diff);
  const D = DIFF[diffSel.value];
  const pool = EMAILS.filter((e) => D.levels.includes(e.level));
  // Dengeli karışım: en az üçte biri güvenli e-posta
  const n = Math.min(Math.round(countS.value), pool.length);
  const ph = shuffle(pool.filter((e) => e.phish)), ok = shuffle(pool.filter((e) => !e.phish));
  const nOk = Math.min(ok.length, Math.max(2, Math.round(n * 0.4)));
  deck = shuffle([...ok.slice(0, nOk), ...ph.slice(0, n - nOk)]);
  cur = 0; score = 0; streak = 0; best = 0; right = 0; wrong = 0; hoverCount = 0; linkEmails = 0;
  for (const k in missed) delete missed[k];
  chart.clear();
  timeLimitT.value = timeLimitT.value || diffSel.value === 'zor';
  showQuestion();
}

function showQuestion() {
  st = 'question';
  hover = -1; hoveredThis = false;
  timeLeft = 30; qStart = sim.time;
  const em = deck[cur];
  drawEmail(em, { idx: cur, total: deck.length });
  cluesText.set('<span style="opacity:.75">Karar verdikten sonra bu e-postadaki ipuçları burada listelenecek.</span>');
  sim.hud.show(`<div style="font-size:14px;opacity:.85">E-posta <b>${cur + 1}/${deck.length}</b> · Puan <b>${score}</b> · Seri <b>${streak}</b>
    <span class="ph-timer">${timeLimitT.value ? ' · ⏱ 30 sn' : ''}</span></div>
    <div style="margin-top:2px">Bu e-posta güvenli mi?</div>
    <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap"><button class="btn good" data-a="safe">✅ Güvenli</button><button class="btn danger" data-a="phish">🎣 Oltalama</button></div>`);
  sim.hud.el.querySelectorAll('button[data-a]').forEach((b) => (b.onclick = () => answer(b.dataset.a === 'phish')));
  updateStats();
}

function answer(saysPhish) {
  if (st !== 'question') return;
  const em = deck[cur];
  const timeout = saysPhish === null;
  const ok = !timeout && saysPhish === em.phish;
  const dtime = sim.time - qStart;
  if (em.links.length) { linkEmails++; if (hoveredThis) hoverCount++; }
  if (ok) {
    right++; streak++; best = Math.max(best, streak);
    score += 10 + Math.min(10, 2 * (streak - 1));
  } else {
    wrong++; streak = 0;
    for (const c of em.clues) if (c.type !== 'ok') missed[c.type] = (missed[c.type] || 0) + 1;
    if (!em.phish) missed.falsePos = (missed.falsePos || 0) + 1;
  }
  chart.push([(right / (right + wrong)) * 100, dtime]);
  st = 'reveal';
  hover = -1;
  drawEmail(em, { revealed: true, idx: cur, total: deck.length });
  hookY = em.phish ? 1.42 : 1.9;
  cluesText.set(`<b>${em.phish ? '🎣 Bu bir oltalama e-postası' : '✅ Bu e-posta güvenli'}</b><ol style="margin:6px 0 0;padding-left:20px">` +
    em.clues.map((c) => `<li><b>${CLUE[c.type]}</b><br>${c.note}</li>`).join('') + '</ol>');
  const last = cur >= deck.length - 1;
  const head = timeout ? '⏱ Süre doldu!' : ok ? '✔ Doğru!' : '✘ Yanlış';
  const tone = ok ? 'good' : 'bad';
  const first = em.clues.find((c) => c.type !== 'ok') || em.clues[0];
  sim.hud.show(`<h2>${head}</h2><div>${em.phish ? 'Bu bir <b>oltalama</b> e-postası.' : 'Bu e-posta <b>güvenli</b>.'}
    ${em.phish ? `En önemli ipucu: ${CLUE[first.type]}` : 'Güven işaretleri ekranda yeşil çerçeveli.'}</div><div style="font-size:13px;opacity:.8">Numaralı ipuçlarının açıklaması panelde.</div>
    <button class="btn primary" data-n>${last ? '🏁 Sonuçları gör' : 'Sonraki ➜'}</button>`, { tone });
  sim.hud.el.querySelector('button[data-n]').onclick = () => { if (last) showEnd(); else { cur++; showQuestion(); } };
  updateStats();
}

function showEnd() {
  st = 'end';
  hookY = 1.9;
  const tot = right + wrong, acc = tot ? (right / tot) * 100 : 0;
  const top = Object.entries(missed).filter(([k]) => k !== 'falsePos').sort((a, b) => b[1] - a[1]).slice(0, 3);
  const grade = acc >= 90 ? '🏆 Oltalama avcısı!' : acc >= 70 ? '👍 İyi gidiyorsun' : '📚 Biraz daha pratik';
  drawEmail(null);
  sim.hud.show(`<h2>${grade}</h2>
    <div>Puan <b>${score}</b> · Doğruluk <b>%${fmt(acc, 0)}</b> · En iyi seri <b>${best}</b></div>
    <div style="font-size:13.5px;margin-top:4px">Bağlantı içeren ${linkEmails} e-postanın <b>${hoverCount}</b> tanesinde gerçek adresi kontrol ettin.</div>
    ${top.length ? `<div style="font-size:13.5px">Kaçırdığın ipuçları: ${top.map(([k]) => CLUE[k]).join(', ')}</div>` : ''}
    ${missed.falsePos ? `<div style="font-size:13.5px">${missed.falsePos} gerçek e-postayı oltalama sandın — aşırı şüphe de iş kaybettirir.</div>` : ''}
    <div style="text-align:left;font-size:13.5px;margin-top:6px"><b>Ne yapmalı?</b> Kurumu resmî numarasından ara · Şifre/OTP paylaşma ·
    Bağlantıya değil adresi kendin yazarak siteye git · Şüpheli e-postayı BT ekibine ve USOM'a bildir.</div>
    <button class="btn primary" data-r>🔁 Tekrar oyna</button>`, { tone: acc >= 70 ? 'good' : 'warn' });
  sim.hud.el.querySelector('button[data-r]').onclick = () => startGame();
  updateStats();
}

function showIntro() {
  st = 'intro';
  hookY = 1.9;
  drawEmail(null);
  sim.hud.show(`<h2>🎣 Oltalama Avcısı</h2>
    <div style="font-size:14px">E-postaları incele: gönderen adresi, bağlantıların gerçek adresi (üzerine gel), ekler ve dil.
    Her biri için <b>Güvenli</b> ya da <b>Oltalama</b> de.</div>
    <button class="btn good" data-d="kolay">Kolay</button><button class="btn primary" data-d="orta">Orta</button><button class="btn danger" data-d="zor">Zor ⏱</button>`);
  sim.hud.el.querySelectorAll('button[data-d]').forEach((b) => (b.onclick = () => startGame(b.dataset.d)));
  cluesText?.set('<span style="opacity:.75">Karar verdikten sonra ipuçları burada listelenecek.</span>');
}

// ---------- Arayüz ----------
const ui = sim.ui;
ui.section('Oyun');
const diffSel = ui.segmented({ label: 'Zorluk', options: [{ value: 'kolay', label: 'Kolay' }, { value: 'orta', label: 'Orta' }, { value: 'zor', label: 'Zor' }], value: 'orta',
  onChange: (v) => { timeLimitT.value = v === 'zor'; } });
const countS = ui.slider({ label: 'E-posta sayısı', min: 6, max: 14, step: 1, value: 10 });
const timeLimitT = ui.toggle({ label: 'Süre sınırı (e-posta başına 30 sn)', value: false });
ui.buttons([{ label: '▶ Yeni oyun', variant: 'primary', onClick: () => startGame() }, { label: '🏠 Başlangıç', onClick: () => showIntro() }]);
ui.section('Skor');
const sScore = ui.stat({ label: 'Puan' });
const sStreak = ui.stat({ label: 'Seri' });
const sBest = ui.stat({ label: 'En iyi seri' });
const sAcc = ui.stat({ label: 'Doğruluk', unit: '%' });
const chart = ui.chart({ title: 'Doğruluk (%) ve karar süresi (sn)', series: [{ name: 'Doğruluk %', color: '#22c55e' }, { name: 'Karar süresi', color: '#60a5fa' }], maxPoints: 20, yMin: 0 });
ui.section('Bu e-postadaki ipuçları');
const cluesText = ui.text('', 'card');
ui.section('Ne yapmalı?');
ui.text(`<ul style="margin:0;padding-left:18px;line-height:1.5">
  <li>📞 Kurumu e-postadaki değil, <b>resmî numarasından</b> ara.</li>
  <li>🔑 <b>Şifre, CVV ve SMS/OTP kodu</b> kimseyle paylaşma — banka da istemez.</li>
  <li>🔗 Bağlantıya tıklamadan önce üzerine gel; en iyisi adresi <b>kendin yaz</b>.</li>
  <li>📎 Beklemediğin <b>.exe, .zip, .scr</b> ya da çift uzantılı ekleri açma.</li>
  <li>🏦 E-postayla gelen <b>IBAN değişikliği</b>ni telefonla teyit etmeden ödeme yapma.</li>
  <li>🚩 Şüpheli e-postayı BT ekibine ve <b>USOM</b>'a bildir; tıkladıysan şifreni hemen değiştir.</li>
</ul>`, 'card');

function updateStats() {
  sScore.set(score);
  sStreak.set(streak, streak >= 3 ? 'good' : '');
  sBest.set(best);
  const tot = right + wrong;
  sAcc.set(tot ? fmt((right / tot) * 100, 0) : '—', tot ? (right / tot >= 0.7 ? 'good' : 'warn') : '');
}

// ---------- Bağlantı üzerine gelme ----------
const tip = document.createElement('div');
tip.style.cssText = 'position:absolute;z-index:5;pointer-events:none;display:none;max-width:260px;padding:6px 10px;border-radius:8px;' +
  'background:rgba(10,15,30,.94);border:1px solid #3b82f6;font-size:12.5px;line-height:1.35;word-break:break-all';
sim.stage.appendChild(tip);
function linkAt(ev) {
  if (st !== 'question' && st !== 'reveal') return -1;
  const hit = sim.raycast(ev, [screen])[0];
  if (!hit || !hit.uv) return -1;
  const x = hit.uv.x * CW, y = (1 - hit.uv.y) * CH;
  const em = deck[cur];
  for (let i = 0; i < em.links.length; i++) {
    const r = regions['link' + i];
    if (r && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) return i;
  }
  return -1;
}
function setHover(i, ev) {
  const em = deck[cur];
  if (i >= 0) {
    hoveredThis = true;
    const lk = em.links[i];
    const r = sim.stage.getBoundingClientRect();
    const px = Math.min(ev.clientX - r.left + 14, r.width - 270), py = Math.min(ev.clientY - r.top + 16, r.height - 70);
    tip.innerHTML = `<div style="opacity:.7">Görünen: ${lk.text}</div><div>🔗 Gerçek adres: <b style="color:#93c5fd">${lk.url}</b></div>`;
    tip.style.left = Math.max(4, px) + 'px'; tip.style.top = Math.max(4, py) + 'px';
    tip.style.display = 'block';
    sim.dom.style.cursor = 'pointer';
  } else {
    tip.style.display = 'none';
    sim.dom.style.cursor = '';
  }
  if (i !== hover) {
    hover = i;
    drawEmail(em, { revealed: st === 'reveal', hover: i, idx: cur, total: deck.length });
  }
}
sim.dom.addEventListener('pointermove', (ev) => { if (st === 'question' || st === 'reveal') setHover(linkAt(ev), ev); });
sim.dom.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
sim.onClick([screen], (hit, ev) => {
  const i = linkAt(ev);
  if (i < 0) return;
  setHover(i, ev);
  sim.toast('Gerçek hayatta şüpheli bağlantıya tıklama — önce gerçek adresi kontrol et!', 'warn');
});

// ---------- Döngü ----------
let tipT = 0;
sim.onUpdate((dt) => {
  if (st !== 'question' || !timeLimitT.value) return;
  timeLeft -= dt;
  tipT += dt;
  if (tipT > 0.25) {
    tipT = 0;
    const el = sim.hud.el.querySelector('.ph-timer');
    if (el) el.textContent = ` · ⏱ ${fmt(Math.max(0, Math.ceil(timeLeft)))} sn`;
  }
  if (timeLeft <= 0) answer(null);
});
sim.onRender((dt) => {
  hook.position.y += (hookY - hook.position.y) * Math.min(1, dt * 4);
  hook.rotation.z = Math.sin(performance.now() / 600) * 0.08;
});
// Dar ekranlarda monitör kadraja sığsın
let lastAspect = 0;
sim.onRender(() => {
  const a = sim.camera.aspect;
  if (Math.abs(a - lastAspect) < 0.01) return;
  lastAspect = a;
  const vfov = (sim.camera.fov * Math.PI) / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * a);
  const dist = Math.max(1.42, 0.46 / Math.tan(hfov / 2));
  sim.moveCamera([0.12, 1.12, -0.2 + dist], [0, 1.0, -0.2]);
});

sim.onReset(() => showIntro());
showIntro();
updateStats();
