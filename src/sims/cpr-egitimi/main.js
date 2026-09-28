// İlk Yardım: CPR Eğitimi — yetişkin temel yaşam desteği (ERC/AHA): zincir adımları, 30:2 göğüs basısı, OED, canlı geri bildirim ve puan.
import { createSim, THREE, RoundedBoxGeometry, clamp, lerp, fmt, mat, procedural, textPlane, textTexture, makePerson } from '@core';
import { sEllipsoid, sdfMesh, loftTube } from './bio.js';
import { STAND, bodyItems } from './human.js';

const sim = createSim({
  studio: { mood: 'day', color: 0x9c978f, warmth: 0.3, fill: 1.15, key: { el: 44, az: 248, power: 1.1 }, radius: 11, height: 5 },
  camera: { position: [1.5, 1.3, 1.85], target: [0.22, 0.4, -0.2], fov: 40, near: 0.02, far: 60 },
  controls: { minDistance: 0.6, maxDistance: 3.2, maxPolarAngle: Math.PI * 0.47 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Yerde yanıtsız yatan bir yetişkin (eğitim mankeni) ve senin kolların. Önce <b>hayat zincirinin</b> ilk adımlarını
    doğru sırayla seç, sonra 2 dakikalık <b>göğüs basısı</b> uygula. Her bası için hız, derinlik ve göğsün geri gelmesi ölçülür.</p>
    <h3>Nasıl bası yapılır?</h3>
    <ul>
      <li><b>Boşluk</b> tuşunu basılı tut / bırak ya da sahnede fareyle (dokunmatikte parmakla) bas-bırak.
      Ne kadar uzun basılı tutarsan o kadar derine inersin; yaklaşık yarım vuruş basılı tutmak ~5–6 cm verir.</li>
      <li>Hedef: dakikada <b>100–120</b> bası, <b>5–6 cm</b> derinlik, her basıdan sonra göğsün <b>tamamen</b> geri gelmesi.</li>
      <li>30 basıdan sonra 2 kurtarıcı nefes (<b>B</b> tuşu ya da düğme). İstersen "Yalnız göğüs basısı" seçeneğini aç.</li>
      <li>Metronomu açarsan dakikada 110 vuruşla tık sesi duyarsın.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>ERC ve AHA yetişkin temel yaşam desteği önerileri: ortam güvenliği → bilinç kontrolü → hava yolunu açıp en fazla 10 sn
    solunum kontrolü → <b>112</b> ve <b>OED/AED</b> → 30 bası : 2 nefes. Hırıltılı, seyrek (agonal) nefes <b>normal solunum değildir</b>.
    OED gelir gelmez açılır ve sesli komutları izlenir. Çocuk ve bebeklerde teknik farklıdır.</p>
    <p><b>Bu simülasyon sertifikalı ilk yardım eğitiminin yerini tutmaz.</b> Gerçek bir mankenle uygulamalı kursa katıl.
    Acil durumda <b>112</b>'yi ara.</p>`,
});

// --- Sahne: eğitim salonu zemini, mavi egzersiz minderi, sırtüstü yatan yetişkin, sol yanında diz çökmüş kurtarıcı ---
// Birimler metre. Kurtarıcı +z'ye bakar; hasta başı −x'te, yüzü yukarıda (hastanın sağı +z).
const scene = sim.scene;
const LOWQ = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
const CELL = LOWQ ? 0.012 : 0.009;
const MAT_H = 0.022; // minder kalınlığı
{
  const mm = new THREE.Mesh(new RoundedBoxGeometry(2.0, MAT_H, 0.95, 3, 0.008), mat.rubber({ color: 0x1f5fa8, scale: 4 }));
  mm.position.set(0.42, MAT_H / 2, 0.02); scene.add(mm);
  // minder dikiş çizgileri (katlama yerleri)
  for (const x of [-0.25, 0.42, 1.09]) {
    const s = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.004, 0.93, 1, 0.002), mat.rubber({ color: 0x184c88 }));
    s.position.set(x, MAT_H, 0.02); scene.add(s);
  }
}

// --- İlk yardım eğitim salonu: meşe parke, lambri, solda güneş alan pencereler, arkada pano, OED dolabı, masa, sandalyeler ---
{
  const shell = [];
  const put = (m, x, y, z, ry = 0) => { m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; };
  const parquet = procedural({
    key: 'cpr-parke', physical: true, bump: 0.004,
    params: { color: 0xb08457, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.25 },
    pattern: `
      vec2 uv = vec2(p.x/1.2, p.z/0.14);
      float row = floor(uv.y); uv.x += h13(vec3(row, 1.0, 0.0))*5.0;
      float id = h13(vec3(row, floor(uv.x), 2.0)); vec2 f = fract(uv);
      float gap = smoothstep(0.0, 0.035, f.y)*smoothstep(1.0, 0.965, f.y)*smoothstep(0.0, 0.004, f.x)*smoothstep(1.0, 0.996, f.x);
      float grain = fbm3(vec3(p.x*3.0 + id*9.0, id*4.0, p.z*55.0), 4);
      col *= (0.8 + 0.32*id)*(0.82 + 0.3*grain);
      col *= mix(0.45, 1.0, gap);
      rough = mix(0.8, 0.38 + 0.15*grain, gap); h = gap*0.6 + grain*0.3;`,
  });
  const paint = (color) => procedural({
    key: 'cpr-duvar', bump: 0.003, params: { color, roughness: 0.86 },
    pattern: `float n = fbm3(p*1.8, 4), g = vn3(p*80.0); col *= 0.94 + 0.08*n + 0.03*(g - 0.5); h = g*0.5 + n*0.5;`,
  });
  const X0 = -2.7, X1 = 4.6, Z0 = -2.8, Z1 = 3.6, H = 3.0;
  shell.push(put(new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.06, Z1 - Z0), parquet), (X0 + X1) / 2, -0.031, (Z0 + Z1) / 2));
  shell.push(put(new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, 0.08, Z1 - Z0), paint(0xf1efea)), (X0 + X1) / 2, H + 0.04, (Z0 + Z1) / 2));
  shell.push(put(new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, H, 0.15), paint(0xdfe3de)), (X0 + X1) / 2, H / 2, Z0 - 0.075));
  shell.push(put(new THREE.Mesh(new THREE.BoxGeometry(X1 - X0, H, 0.15), paint(0xdfe3de)), (X0 + X1) / 2, H / 2, Z1 + 0.075));
  shell.push(put(new THREE.Mesh(new THREE.BoxGeometry(0.15, H, Z1 - Z0), paint(0xe4e1d8)), X1 + 0.075, H / 2, (Z0 + Z1) / 2));
  // Sol duvar: iki pencere boşluklu (dışarıda gündüz: gök, ağaçlar, karşı bina)
  const WINS = [{ z: -1.7, w: 1.5 }, { z: 0.55, w: 1.5 }], WY0 = 0.95, WY1 = 2.45;
  {
    const sh = new THREE.Shape([[Z0, 0], [Z1, 0], [Z1, H], [Z0, H]].map(([a, b]) => new THREE.Vector2(a, b)));
    for (const w of WINS) sh.holes.push(new THREE.Path([[w.z - w.w / 2, WY0], [w.z + w.w / 2, WY0], [w.z + w.w / 2, WY1], [w.z - w.w / 2, WY1]].map(([a, b]) => new THREE.Vector2(a, b))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.15, bevelEnabled: false, curveSegments: 1 });
    g.rotateY(-Math.PI / 2);   // (z, y, derinlik) → (−derinlik, y, z)
    const lw = new THREE.Mesh(g, paint(0xe4e1d8));
    lw.position.set(X0, 0, 0); scene.add(lw); shell.push(lw);
    // dış görünüm
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    const gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#8fb6e0'); gr.addColorStop(0.6, '#d8e6f0'); gr.addColorStop(1, '#e9eef0');
    x.fillStyle = gr; x.fillRect(0, 0, 512, 256);
    x.fillStyle = '#c9c2b4'; x.fillRect(300, 70, 170, 186); x.fillStyle = '#9aa3a8';
    for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) x.fillRect(312 + i * 32, 84 + j * 28, 18, 16);
    for (let i = 0; i < 26; i++) { const tx = (i * 97) % 512, ty = 150 + (i % 5) * 12, r = 26 + (i * 13) % 30; x.fillStyle = ['#4f7a3a', '#5e8a44', '#3f6a33'][i % 3]; x.beginPath(); x.arc(tx, ty, r, 0, 7); x.fill(); }
    x.fillStyle = '#7d8a6a'; x.fillRect(0, 222, 512, 34);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const out = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.7, 1.7, 1.7), fog: false }));
    out.rotation.y = Math.PI / 2; out.position.set(X0 - 1.6, 1.7, -0.5); out.userData.noFit = true; scene.add(out);
    const frameM = mat.plastic({ color: 0xf2f2ef, gloss: 0.35 });
    const glassM = mat.glass({ tint: 0xeef6f8, rough: 0.02, thickness: 0.004 });
    for (const w of WINS) {
      const fr = (h, d, zz, yy, len, vert) => {
        const m = new THREE.Mesh(new RoundedBoxGeometry(0.12, vert ? len : h, vert ? h : len, 2, 0.012), frameM);
        m.position.set(X0 + 0.01, yy, zz); scene.add(m); return m;
      };
      fr(0.07, 0, w.z, WY1 - 0.035, w.w, false); fr(0.07, 0, w.z, WY0 + 0.035, w.w, false);
      fr(0.07, 0, w.z - w.w / 2 + 0.035, (WY0 + WY1) / 2, WY1 - WY0, true); fr(0.07, 0, w.z + w.w / 2 - 0.035, (WY0 + WY1) / 2, WY1 - WY0, true);
      fr(0.06, 0, w.z, (WY0 + WY1) / 2, WY1 - WY0, true);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(w.w - 0.1, WY1 - WY0 - 0.1), glassM);
      gl.rotation.y = Math.PI / 2; gl.position.set(X0 - 0.02, (WY0 + WY1) / 2, w.z); gl.userData.noCast = true; scene.add(gl);
      const sill = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.04, w.w + 0.16, 2, 0.012), mat.ceramic({ color: 0xe8e4dc }));
      sill.position.set(X0 + 0.12, WY0 - 0.02, w.z); scene.add(sill);
    }
  }
  // Lambri (alt duvar paneli) ve süpürgelik: arka ve sağ duvar
  const wainM = paint(0x6f8577);   // boyalı lambri (adaçayı yeşili)
  put(new THREE.Mesh(new RoundedBoxGeometry(X1 - X0, 0.9, 0.03, 2, 0.008), wainM), (X0 + X1) / 2, 0.45, Z0 + 0.015);
  put(new THREE.Mesh(new RoundedBoxGeometry(X1 - X0, 0.05, 0.06, 2, 0.015), wainM), (X0 + X1) / 2, 0.91, Z0 + 0.03);
  put(new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.9, Z1 - Z0, 2, 0.008), wainM), X1 - 0.015, 0.45, (Z0 + Z1) / 2);
  put(new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.1, Z1 - Z0, 2, 0.01), wainM), X0 + 0.03, 0.05, (Z0 + Z1) / 2);
  // Tavan: gömme LED paneller (parlar)
  const led = mat.glow({ color: 0xfff6ea, intensity: 2.6 }), trimM = mat.paintedMetal({ color: 0xeeeeea, wear: 0 });
  for (const x of [-1.0, 1.6]) for (const z of [-1.6, 0.9]) {
    const t = put(new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.03, 0.66, 2, 0.01), trimM), x, H - 0.01, z); t.userData.noCast = true;
    const l = put(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.012, 0.6), led), x, H - 0.03, z); l.userData.noCast = true;
  }
  // Pano: "Hayat zinciri" eğitim afişi ve 30:2 şeması
  const poster = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
    const g = c.getContext('2d'); draw(g, c.width, c.height);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
  };
  const chain = poster(1.6, 0.9, (g, W, Hh) => {
    g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#c0392b'; g.fillRect(0, 0, W, 64);
    g.fillStyle = '#fff'; g.font = '700 36px system-ui'; g.textAlign = 'center'; g.fillText('HAYAT ZİNCİRİ', W / 2, 45);
    const steps = [['112', 'Ara'], ['30:2', 'CPR'], ['OED', 'Şok'], ['+', 'İleri bakım']];
    steps.forEach(([a, b], i) => {
      const cx = 64 + i * 128, cy = 150;
      g.fillStyle = ['#c0392b', '#e67e22', '#27ae60', '#2c6fbb'][i]; g.beginPath(); g.arc(cx, cy, 48, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = '800 30px system-ui'; g.fillText(a, cx, cy + 10);
      g.fillStyle = '#333'; g.font = '600 22px system-ui'; g.fillText(b, cx, cy + 86);
      if (i < 3) { g.strokeStyle = '#999'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx + 52, cy); g.lineTo(cx + 76, cy); g.stroke(); }
    });
    g.fillStyle = '#555'; g.font = '500 19px system-ui'; g.fillText('100–120 bası/dk · 5–6 cm derinlik · tam geri bırak', W / 2, Hh - 22);
  });
  put(chain, 0.5, 1.75, Z0 + 0.018);
  const pcork = put(new THREE.Mesh(new RoundedBoxGeometry(1.72, 1.02, 0.03, 2, 0.01), mat.wood({ color: 0x5a4030, varnish: true, scale: 3 })), 0.5, 1.75, Z0 + 0.0);
  pcork.position.z = Z0 - 0.003;
  // OED duvar dolabı: beyaz kasa, yeşil tabela (ışıklı)
  {
    const cab = put(new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.52, 0.2, 3, 0.02), mat.plastic({ color: 0xf4f4f1, gloss: 0.5 })), 2.35, 1.35, Z0 + 0.1);
    const door = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.44, 0.012, 2, 0.006), mat.glass({ tint: 0xeaf6ee, rough: 0.05, thickness: 0.003 })); door.position.z = 0.104; cab.add(door);
    const inside = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.3, 0.08, 3, 0.02), mat.plastic({ color: 0x1f9d55, gloss: 0.5 })); inside.position.set(0, -0.03, 0.02); cab.add(inside);
    const t = textTexture('OED', { size: 64, color: '#ffffff', bg: '#138a46', pad: 14 });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34 / t.userData.aspect), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1.3, 1.3, 1.3) }));
    sign.position.set(2.35, 1.78, Z0 + 0.012); scene.add(sign);
  }
  // Duvar saati
  {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
    g.strokeStyle = '#222'; g.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; g.beginPath(); g.moveTo(64 + Math.cos(a) * 50, 64 + Math.sin(a) * 50); g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); g.stroke(); }
    g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 26, 64 - 16); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 - 6, 64 - 44); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const rim = put(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.014, 12, 48), mat.paintedMetal({ color: 0x2a2a2a, wear: 0.05 })), -1.35, 2.4, Z0 + 0.02);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.155, 40), new THREE.MeshStandardMaterial({ map: t, roughness: 0.4 })); face.position.z = -0.004; rim.add(face);
  }
  // Masa: eğitim malzemeleri (ilk yardım çantası, OED eğitim cihazı, cep maskeleri)
  {
    const tbl = new THREE.Group();
    const top = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.035, 0.7, 2, 0.012), mat.plastic({ color: 0xe9e6de, gloss: 0.3 })); top.position.y = 0.74; tbl.add(top);
    const legM = mat.brushedMetal({ color: 0xa9adb3 });
    for (const [x, z] of [[-0.64, -0.3], [0.64, -0.3], [-0.64, 0.3], [0.64, 0.3]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.72, 12), legM); l.position.set(x, 0.36, z); tbl.add(l); }
    const kit = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.2, 0.26, 3, 0.04), mat.fabric({ color: 0xc0392b, scale: 2 })); kit.position.set(-0.35, 0.86, 0); tbl.add(kit);
    const cross = textPlane('✚', 0.12, { color: '#ffffff' }); cross.position.set(-0.35, 0.87, 0.132); tbl.add(cross);
    const trainer = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.09, 0.24, 4, 0.03), mat.plastic({ color: 0xf2c230, gloss: 0.5 })); trainer.position.set(0.18, 0.8, 0.02); tbl.add(trainer);
    const trf = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.01, 0.16, 2, 0.004), mat.plastic({ color: 0x2b2f33, gloss: 0.4 })); trf.position.set(0.18, 0.846, 0.02); tbl.add(trf);
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat.plastic({ color: 0xdfe8ee, gloss: 0.7 })); m.scale.set(1, 0.6, 1.2); m.position.set(0.5, 0.758 + i * 0.022, -0.12); tbl.add(m); }
    put(tbl, 2.6, 0, -2.2);
  }
  // İstiflenmiş sandalyeler (plastik kabuk, çelik ayak) — sağ duvar boyunca
  {
    const seatG = new THREE.LatheGeometry([[0, 0], [0.2, 0], [0.22, 0.02], [0.2, 0.03], [0, 0.03]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
    const seatM = mat.plastic({ color: 0x2c6fbb, gloss: 0.4 }), legM = mat.brushedMetal({ color: 0x9ea3a9 });
    for (let i = 0; i < 3; i++) {
      const ch = new THREE.Group();
      const seat = new THREE.Mesh(seatG, seatM); seat.scale.set(1.05, 1, 1); seat.position.y = 0.45; ch.add(seat);
      const back = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.34, 0.03, 3, 0.012), seatM); back.position.set(0, 0.72, -0.2); back.rotation.x = -0.12; ch.add(back);
      for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.46, 8), legM); l.position.set(x, 0.225, z); ch.add(l); }
      put(ch, 4.1, 0, -1.4 + i * 0.62, -Math.PI / 2);
    }
  }
  // İkinci eğitim mankeni (yarım gövde) kırmızı minderde, arka planda
  {
    const mm = put(new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.02, 0.7, 3, 0.008), mat.rubber({ color: 0xa8322a, scale: 4 })), 0.9, 0.01, -1.75);
    mm.userData.noFit = true;
    const items = bodyItems(STAND, { parts: { arms: false, legs: false } });
    items.push({ p: [sEllipsoid([0, 0.84, 0], [0.4, 0.06, 0.4])], k: 0.02, op: 'sub' });
    const g = sdfMesh(items, { cell: LOWQ ? 0.016 : 0.012 });
    const M = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0)).setPosition(0.9 + 1.2, 0.12, -1.75);
    g.applyMatrix4(M);
    const man = new THREE.Mesh(g, mat.plastic({ color: 0xd7b59c, gloss: 0.25 }));
    man.userData.noFit = true; scene.add(man);
  }
  shell.forEach((m) => { m.userData.noCast = true; m.userData.noFit = true; });
}

// İnsanlar: motorun eklemli figürleri (@core makePerson). Hasta sırtüstü ('lie'; baş −x, yüz +y, sağ taraf +z), göğsü açık;
// kurtarıcı sol yanında diz çökmüş ('kneel'): kalçadan öne eğilir, kollar dirsekten kilitli ve düz, omuzlar ellerin üstünde,
// eller üst üste göğüs kemiğinin alt yarısında (avuç içi aşağı, parmaklar hastanın karşı yanına). Üst gövde basıyla iner.
const STERNUM = [0.065, 0]; // bası noktası (x, z)
// makePerson parça ağları ilk karede motorun parça sırasıyla eklenir (uzak kademe ağlarından sonra); günlük kısa kollu kıyafette
const PART_NAMES = ['pelvis', 'torso', 'neck', 'head', 'eyes', 'hair', 'uarmL', 'uarmR', 'sleeveL', 'sleeveR', 'farmL', 'farmR', 'handL', 'handR',
  'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR'];
function partsOf(person) {
  const ms = person.children.filter((m) => m.isInstancedMesh && !m.geometry.attributes.iAnim);
  return ms.length === PART_NAMES.length ? Object.fromEntries(PART_NAMES.map((k, i) => [k, ms[i]])) : null;
}
const pressU = { value: new THREE.Vector4(STERNUM[0], STERNUM[1], 0.11, 0) };
/** Malzeme kopyası: bası noktasında dünya y ekseninde yerel çökme (göğüs basısı) — yalnız hastanın gövdesine */
function pressed(m, color) {
  const c = m.clone(), base = m.onBeforeCompile, key = m.customProgramCacheKey();
  c.userData = m.userData;
  if (color != null) c.color.setHex(color);
  c.onBeforeCompile = (sh, r) => {
    base.call(c, sh, r);
    sh.uniforms.uPress = pressU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform vec4 uPress;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix*mvPosition;
        #endif
        {
          vec4 wp = modelMatrix*mvPosition;
          float r = length(wp.xz - uPress.xy);
          wp.y -= uPress.w*exp(-r*r/(uPress.z*uPress.z))*smoothstep(0.05, 0.16, wp.y);
          mvPosition = viewMatrix*wp;
        }
        gl_Position = projectionMatrix*mvPosition;`);
  };
  c.customProgramCacheKey = () => key + '-bas' + (color != null ? '-' + color : '');
  return c;
}
const V_SKIN = 0xc28a6c;
const victim = makePerson({ seed: 5, sex: 'm', height: 1.76, build: 1.05, pose: 'lie', outfit: 'casual', sleeves: 'short', skin: V_SKIN,
  hair: { style: 'short', color: 0x2b1d15 }, colors: { top: V_SKIN, bottom: 0x3b4a5e, shoe: 0x2a2a2c } });
victim.rotation.y = Math.PI / 2;   // baş −x, sağ taraf +z
scene.add(victim);
const vParts = partsOf(victim);
if (vParts) {
  // göğüs açık (OED pedleri çıplak göğse yapışır): gövde ve kol ağızları deri; gözler kapalı (göz kapağı rengi)
  const skinP = pressed(vParts.head.material);
  for (const k of ['torso', 'sleeveL', 'sleeveR']) vParts[k].material = skinP;
  vParts.eyes.material = pressed(vParts.head.material, 0xb98068);
}
// Bası noktası gövde ekseninde göğüs kemiğinin alt yarısında (gövde kemiğinde ≈ 0,29 m): o nokta STERNUM'a gelecek şekilde yerleştir
{
  victim.updateMatrixWorld(true);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(0, 0.29, 0);
  if (vParts) { vParts.torso.getMatrixAt(0, m); p.applyMatrix4(m).applyMatrix4(victim.matrixWorld); } else p.set(-0.3, 0, 0);
  victim.position.set(STERNUM[0] - p.x, MAT_H, STERNUM[1] - p.z);
  victim.updateMatrixWorld(true);
}
// Göğüs üstü yüksekliği (bası noktasında), ışınla
const ray = new THREE.Raycaster(new THREE.Vector3(STERNUM[0], 1, STERNUM[1]), new THREE.Vector3(0, -1, 0));
const CHEST_TOP = ray.intersectObject(victim, true)[0]?.point.y ?? 0.22;

// Kurtarıcı
const RESC = [STERNUM[0], 0.018];
const rescuer = makePerson({ seed: 11, sex: 'm', height: 1.78, build: 1.05, pose: 'kneel', outfit: 'casual', sleeves: 'short', skin: 0xa8765a,
  hair: { style: 'short', color: 0x3a2618 }, colors: { top: 0xb8322a, bottom: 0x33415c, shoe: 0x2b2e33 } });
scene.add(rescuer);
const rParts = partsOf(rescuer);
const UPPER = ['torso', 'neck', 'head', 'eyes', 'hair', 'uarmL', 'uarmR', 'sleeveL', 'sleeveR', 'farmL', 'farmR', 'handL', 'handR'];
const rig = (() => {
  if (!rParts) { rescuer.position.set(RESC[0], RESC[1], -0.5); return null; }
  const hs = 1.78 / 1.75, ARM = (0.29 + 0.25) * hs;
  const m = new THREE.Matrix4(), tA = new THREE.Vector3(), tB = new THREE.Vector3();
  const at = (k, v) => { rParts[k].getMatrixAt(0, m); return v.setFromMatrixPosition(m); };
  const hip = at('thighL', tA).clone().add(at('thighR', tB)).multiplyScalar(0.5);
  const sh0 = { L: at('uarmL', tA).clone(), R: at('uarmR', tB).clone() };
  const flex = (a, v) => v.clone().sub(hip).applyAxisAngle(new THREE.Vector3(1, 0, 0), a).add(hip);
  // Eller (dünya): alttaki sağ elin topuğu bası noktasında, soldaki üstünde kenetli; bilek eklemi topuğun biraz gerisinde
  const WW = { R: new THREE.Vector3(STERNUM[0] + 0.004, CHEST_TOP + 0.016, STERNUM[1] - 0.035), L: new THREE.Vector3(STERNUM[0] - 0.004, CHEST_TOP + 0.045, STERNUM[1] - 0.045) };
  // Kalça bükümü a: omuzlar ellerin tam üstünde (yandan dik kollar) ve omuz–bilek = kol boyu
  const reach = (a) => {
    const sL = flex(a, sh0.L), sR = flex(a, sh0.R), mid = sL.clone().add(sR).multiplyScalar(0.5);
    const oz = WW.R.z - mid.z;                       // kurtarıcı kökünün z'si
    const wl = WW.L.clone().sub(new THREE.Vector3(RESC[0], RESC[1], oz));
    return { oz, d: sL.distanceTo(wl) };
  };
  let lo = 0, hi = 1.3;
  for (let i = 0; i < 40; i++) { const a = (lo + hi) / 2; if (reach(a).d > ARM) lo = a; else hi = a; }
  const A = (lo + hi) / 2, OZ = reach(A).oz;
  rescuer.position.set(RESC[0], RESC[1], OZ);
  const HIP = new THREE.Matrix4().makeTranslation(hip.x, hip.y, hip.z).multiply(new THREE.Matrix4().makeRotationX(A)).multiply(new THREE.Matrix4().makeTranslation(-hip.x, -hip.y, -hip.z));
  const W = { L: WW.L.clone().sub(rescuer.position), R: WW.R.clone().sub(rescuer.position) };
  // el: avuç içi aşağı, parmaklar +z (hastanın karşı yanı); kemik −y parmak yönü, avuç normali sol elde −x, sağda +x
  const handQ = {
    L: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0))),
    R: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0))),
  };
  const T = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), q2 = new THREE.Quaternion(), dn = new THREE.Vector3();
  const w = new THREE.Vector3(), S = new THREE.Vector3(), dir = new THREE.Vector3();
  const put = (k, fn) => { const im = rParts[k]; im.getMatrixAt(0, m); fn(m); im.setMatrixAt(0, m); im.instanceMatrix.needsUpdate = true; };
  return (dy) => {
    T.makeTranslation(0, dy, 0);
    put('pelvis', (mm) => mm.premultiply(HIP));
    for (const k of UPPER) put(k, (mm) => mm.premultiply(HIP).premultiply(T));
    for (const sd of ['L', 'R']) {
      w.copy(W[sd]).y += dy;
      let len = 0;
      put('uarm' + sd, (mm) => {
        mm.decompose(S, q, s);
        dir.copy(w).sub(S); len = dir.length(); dir.normalize();
        dn.set(0, -1, 0).applyQuaternion(q); q2.setFromUnitVectors(dn, dir).multiply(q);
        mm.compose(S, q2, s);
      });
      put('sleeve' + sd, (mm) => { mm.decompose(p, q, s); mm.compose(S, q2, s); });
      put('farm' + sd, (mm) => {                  // dirsek kilitli: önkol üst kolun doğrultusunda, bileğe kadar
        mm.decompose(p, q, s);
        p.copy(S).addScaledVector(dir, 0.29 * hs);
        s.y *= Math.max(0.6, (len - 0.29 * hs) / (0.25 * hs));
        mm.compose(p, q2, s);
      });
      put('hand' + sd, (mm) => { mm.decompose(p, q, s); mm.compose(w, handQ[sd], s); });
    }
  };
})();
let rescDrop = 0;
function setRescuerDrop(dy) { rescDrop = dy; }
sim.onRender(() => { rescuer.update(performance.now() / 1000); if (rig) rig(rescDrop); });

// Bası noktası hedefi ve metronom halkası (veri katmanı): göğüs kemiğinin alt yarısı
const target = new THREE.Mesh(new THREE.RingGeometry(0.042, 0.055, 48), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
target.rotation.x = -Math.PI / 2;
target.position.set(STERNUM[0] - 0.012, CHEST_TOP + 0.004, STERNUM[1]);
scene.add(target);
const beatRing = new THREE.Mesh(new THREE.RingGeometry(0.062, 0.07, 48), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
beatRing.rotation.x = -Math.PI / 2;
beatRing.position.copy(target.position).y += 0.002;
scene.add(beatRing);

// Derinlik göstergesi (3B cetvel, veri katmanı): 1 cm = 0,03 m, hastanın sağ yanında
const GS = 0.03;
const gauge = new THREE.Group();
gauge.position.set(STERNUM[0], CHEST_TOP + 0.005, 0.27);
scene.add(gauge);
{
  const bg = new THREE.Mesh(new RoundedBoxGeometry(0.035, 8 * GS + 0.01, 0.01, 2, 0.004), mat.plastic({ color: 0x1e293b, gloss: 0.6 }));
  bg.position.y = -4 * GS;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.038, 1 * GS, 0.012), mat.glow({ color: 0x16a34a, intensity: 1.2 }));
  band.position.y = -5.5 * GS;
  gauge.add(bg, band);
  for (const d of [0, 2, 4, 6, 8]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0015, 0.013), new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }));
    t.position.set(0.012, -d * GS, 0); gauge.add(t);
  }
  for (const d of [0, 2, 4, 5, 6, 8]) sim.label(`${d} cm`, { parent: gauge, position: [0.055, -d * GS, 0], className: 'plain' }).el.style.fontSize = '10.5px';
}
const marker = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.028, 3), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
marker.rotation.z = -Math.PI / 2;
marker.position.x = -0.034;
gauge.add(marker);
sim.label('Derinlik', { parent: gauge, position: [0, 0.04, 0], className: 'plain' });

// Telefon: hoparlörde 112 (parlayan ekran)
{
  const ph = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.009, 0.155, 3, 0.004), mat.plastic({ color: 0x15171a, gloss: 0.9 }));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.142), mat.glow({ color: 0x2f7d4f, intensity: 1.1 }));
  scr.rotation.x = -Math.PI / 2; scr.position.y = 0.0048;
  const lab = textPlane('112', 0.03, { color: '#ffffff' });
  lab.rotation.x = -Math.PI / 2; lab.rotation.z = Math.PI / 2; lab.position.set(0, 0.0052, 0);
  ph.add(body, scr, lab);
  ph.position.set(-0.52, MAT_H + 0.0045, 0.36); ph.rotation.y = 0.5;
  scene.add(ph);
}

// OED (AED) cihazı: yuvarlatılmış gövde, sap, ekran, parlayan şok düğmesi, ped kablosu
const aed = new THREE.Group();
{
  const shell = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.085, 0.24, 5, 0.03), mat.plastic({ color: 0x1f9d55, gloss: 0.55 }));
  shell.position.y = 0.0425;
  const face = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.01, 0.18, 3, 0.004), mat.plastic({ color: 0x2b2f33, gloss: 0.4 }));
  face.position.y = 0.086;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.05), mat.glow({ color: 0x7dd3fc, intensity: 0.9 }));
  screen.rotation.x = -Math.PI / 2; screen.position.set(-0.05, 0.0915, -0.03);
  const btnBase = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.026, 0.006, 32), mat.rubber({ color: 0x333333 }));
  btnBase.position.set(0.06, 0.093, 0.02);
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.018, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.glow({ color: 0xff3322, intensity: 0.6 }));
  btn.scale.y = 0.45; btn.position.set(0.06, 0.095, 0.02);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 12, 32, Math.PI), mat.rubber({ color: 0x222222 }));
  handle.position.set(0, 0.085, -0.09);
  const bolt = textPlane('⚡', 0.022, { color: '#ffffff' });
  bolt.rotation.x = -Math.PI / 2; bolt.position.set(0.06, 0.1, 0.055);
  aed.add(shell, face, screen, btnBase, btn, handle, bolt);
  aed.userData.btn = btn;
  sim.label('OED', { parent: aed, position: [0, 0.16, 0], className: 'plain' });
}
aed.position.set(-0.48, MAT_H, 0.3);
aed.rotation.y = -0.4;
aed.visible = false;
scene.add(aed);
// Pedler: göğüs yüzeyine oturtulur (sağ köprücük altı, sol koltuk altı çizgisi)
const padMat = mat.plastic({ color: 0xf1f5f9, gloss: 0.2 });
padMat.emissive = new THREE.Color(0xa8dcff); padMat.emissiveIntensity = 0;
const pads = [];
// ayakta koordinattan (ped yerleri) hastanın yatış çerçevesine: gövde kemiği (göğüs kemiği ≈ ayakta y 1,25 m, gövde kemiğinde 0,29)
const vTorso = new THREE.Matrix4();
if (vParts) { vParts.torso.getMatrixAt(0, vTorso); vTorso.premultiply(victim.matrixWorld); vTorso.multiply(new THREE.Matrix4().makeTranslation(0, -1.25 + 0.29, 0)); }
for (const [sx, sy, sz, rot] of [[-0.075, 1.335, 0.1, 0.2], [0.13, 1.19, 0.04, -0.5]]) {
  const p = new THREE.Vector3(sx, sy, sz).applyMatrix4(vTorso);
  const r = new THREE.Raycaster(new THREE.Vector3(p.x, 0.6, p.z), new THREE.Vector3(0, -1, 0));
  const hit = r.intersectObject(victim, true)[0];
  const pad = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.004, 0.085, 2, 0.0018), padMat);
  if (hit) {
    pad.position.copy(hit.point);
    const mw = new THREE.Matrix4();
    if (hit.object.isInstancedMesh) hit.object.getMatrixAt(hit.instanceId, mw);
    const n = hit.face.normal.clone().transformDirection(mw.premultiply(hit.object.matrixWorld));
    pad.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    pad.rotateY(rot);
  }
  pad.visible = false; scene.add(pad); pads.push(pad);
}
{ // ped kablosu (OED'den pedlere)
  const cable = new THREE.Mesh(loftTube(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.44, MAT_H + 0.05, 0.25), new THREE.Vector3(-0.3, MAT_H + 0.01, 0.2), new THREE.Vector3(-0.12, MAT_H + 0.02, 0.18), pads[0].position.clone()]), () => 0.0035, { segs: 40, radial: 6 }), mat.rubber({ color: 0x202020 }));
  cable.visible = false; scene.add(cable); pads.push(cable);
}

// --- Ses: metronom (kullanıcı açınca) ---
let actx = null;
function click(hi = false) {
  if (!actx) return;
  try {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = hi ? 1500 : 1000;
    g.gain.setValueAtTime(0.25, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.05);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + 0.06);
  } catch { /* ses yoksa sessiz devam */ }
}

// --- Oyun durumu ---
const SESSION = 120; // s
const CHAIN = [
  { q: 'Birinin yere yığıldığını gördün. İlk ne yaparsın?', ok: 'Ortamın güvenli olduğundan emin ol (trafik, elektrik, yangın)',
    bad: ['Hemen kişiyi oturtmaya çalış', 'Ağzına su dökerek ayılt'], res: 'Ortam güvenli. Kişiye yaklaşıyorsun.',
    why: 'Önce kendi güvenliğin: ikinci bir kazazede olursan kimseye yardım edemezsin.' },
  { q: 'Kişi hareketsiz yatıyor. Şimdi?', ok: 'Omuzlarından hafifçe sars ve yüksek sesle "İyi misiniz?" diye seslen',
    bad: ['Nabzını bulmak için bir dakika uğraş', 'Bacaklarını havaya kaldır'], res: 'Yanıt yok. Yüksek sesle yardım çağırıyorsun.',
    why: 'Bilinç kontrolü: sesli uyarı ve hafifçe sarsma. İlk yardımcılar için nabız aramak önerilmez; zaman kaybettirir.' },
  { q: 'Yanıt vermiyor. Sıradaki adım?', ok: 'Başı geriye it, çeneyi kaldır; en fazla 10 saniye normal solunumu kontrol et',
    bad: ['Parmağınla ağzın içini körlemesine tara', 'Kalp masajına başlamadan 1 dakika bekle'], res: 'Yalnızca seyrek, hırıltılı nefes var — bu <b>normal solunum değildir</b> (agonal solunum).',
    why: 'Hava yolunu baş-çene pozisyonuyla aç, 10 sn\'den uzun bakma. Seyrek hırıltılı nefes kalp durmasının belirtisi olabilir.' },
  { q: 'Normal nefes almıyor. Ne yaparsın?', ok: '112\'yi ara (telefonu hoparlöre al) ve birinden OED getirmesini iste',
    bad: ['Önce kişinin ailesine haber ver', 'Kendin OED aramaya uzaklara koş'], res: '112 hatta: "Göğüs basısına başlayın, sizi yönlendireceğim." Biri OED\'yi getirmeye gitti.',
    why: '112 ve OED hemen istenir. Yalnızsan telefonu hoparlöre al ve hastanın yanından ayrılma.' },
  { q: 'Ellerini nereye koyarsın?', ok: 'Göğsün ortasına, göğüs kemiğinin alt yarısına; kollar düz, omuzlar ellerin üstünde',
    bad: ['Karnın üstüne, mide bölgesine', 'Göğsün sol tarafına, kalbin üstüne'], res: 'Eller doğru yerde. Başla!',
    why: 'Doğru yer göğsün ortası (göğüs kemiğinin alt yarısı). Kollar dirsekten bükülmeden, vücut ağırlığıyla bas.' },
];
const G = {
  phase: 'intro', step: 0, chainScore: 0, chainTries: 0,
  t: 0, depth: 0, pressing: false, rise: 0,
  comps: [], cycle: 0, cur: null, lastPress: -1, lastRelease: -1, pauseStart: -1,
  compressTime: 0, breaths: 0, aedStage: 0, aedTimer: 0, handsOffWarn: false, analysisTouches: 0, longPauses: 0,
};
let demo = { on: false, t: 0 };

function shuffle(a) { return a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]); }

function showIntro() {
  G.phase = 'intro'; G.step = 0; G.chainScore = 0; G.chainTries = 0;
  sim.controls.enabled = true;
  sim.hud.show(`<h2>🚑 Temel Yaşam Desteği</h2>Bir yetişkin aniden yere yığıldı. Hayat zincirini doğru sırayla uygula,
    sonra 2 dakika göğüs basısı yap.<br><button class="btn primary" data-a="start">Başla</button><button class="btn" data-a="skip">Doğrudan basıya geç</button>
    <div style="font-size:11.5px;color:var(--muted);margin-top:6px">Sertifikalı eğitimin yerini tutmaz · Acil durumda 112</div>`);
  sim.hud.el.querySelector('[data-a=start]').onclick = () => askChain();
  sim.hud.el.querySelector('[data-a=skip]').onclick = () => startCPR();
}
function askChain() {
  G.phase = 'chain';
  const s = CHAIN[G.step];
  const opts = shuffle([s.ok, ...s.bad]);
  sim.hud.show(`<div style="font-size:12px;color:var(--muted)">Adım ${G.step + 1}/${CHAIN.length}</div><b>${s.q}</b><br>` +
    opts.map((o, i) => `<button class="btn" data-o="${i}" style="display:block;width:100%;text-align:left;margin:6px 0 0">${o}</button>`).join(''));
  sim.hud.el.querySelectorAll('[data-o]').forEach((b) => {
    b.onclick = () => {
      const pick = opts[+b.dataset.o];
      if (G.phase !== 'chain') return;
      if (pick === s.ok) {
        if (G.chainTries === 0) G.chainScore++;
        G.chainTries = 0;
        sim.toast(`✅ ${s.why}`, 'good');
        if (G.step === 3) { sim.toast('📞 112 arandı · OED yolda', 'good'); }
        G.step++;
        if (G.step >= CHAIN.length) startCPR(s.res);
        else { sim.hud.show(`${s.res}<br><button class="btn primary" data-n>Devam</button>`, { tone: 'good' }); sim.hud.el.querySelector('[data-n]').onclick = askChain; }
      } else {
        G.chainTries++;
        sim.toast(`❌ Yanlış. ${s.why}`, 'bad');
      }
    };
  });
}

function startCPR(msg = '') {
  Object.assign(G, { phase: 'cpr', t: 0, comps: [], cycle: 0, cur: null, lastPress: -1, lastRelease: -1, pauseStart: 0, compressTime: 0,
    breaths: 0, aedStage: 0, aedTimer: 0, analysisTouches: 0, longPauses: 0 });
  aed.visible = false; pads.forEach((p) => (p.visible = false));
  depthChart.clear();
  sim.controls.enabled = false;
  sim.hud.show(`${msg ? msg + '<br>' : ''}<b>Göğüs basısı!</b> <kbd>Boşluk</kbd> tuşunu basılı tut-bırak ya da sahneye bas-bırak.<br>
    Hedef: <b>100–120/dk</b> · <b>5–6 cm</b> · tam geri dönüş`, { timeout: 5000 });
}

function press() {
  if (G.pressing) return;
  G.pressing = true;
  if (demo.on) return;
  if (G.phase === 'breaths') { sim.toast('Nefesleri atladın; basıya devam', 'warn'); resumeCompressions(); }
  if (G.phase === 'aed' && (G.aedStage === 2 || G.aedStage === 3)) {
    G.analysisTouches++;
    sim.toast('⚠️ OED analiz/şok sırasında hastaya dokunma!', 'bad');
    return;
  }
  if (G.phase !== 'cpr' && G.phase !== 'aed') return;
  const now = G.t;
  if (G.cur) finishComp();
  const c = { t: now, residual: G.depth, max: G.depth, interval: G.lastPress >= 0 ? now - G.lastPress : null };
  if (G.lastRelease >= 0 && now - G.lastRelease > 10 && G.comps.length) { G.longPauses++; sim.toast('⏱ Bası arası 10 sn\'yi geçti. Ara vermeleri kısa tut!', 'warn'); }
  // Önceki basının geri dönüşü, bu basının başındaki kalan derinlikten anlaşılır
  const prev = G.comps[G.comps.length - 1];
  if (prev && prev.recoil == null) prev.recoil = G.depth < 0.5;
  G.cur = c;
  G.lastPress = now;
  G.cycle++;
}
function release() {
  if (!G.pressing) return;
  G.pressing = false;
  if (demo.on) return;
  if (!G.cur) return;
  G.lastRelease = G.t;
  finishComp();
  if (G.phase === 'cpr' && G.cycle >= 30 && !onlyCompr.value) startBreaths();
}
function finishComp() {
  const c = G.cur;
  G.cur = null;
  c.depthOK = c.max >= 4.95 && c.max <= 6.05;
  c.rateOK = c.interval != null && c.interval < 2 ? (60 / c.interval >= 100 && 60 / c.interval <= 120) : null;
  G.comps.push(c);
  lastDepth = c.max;
  const n = G.comps.length;
  if (n % 6 === 0) coach();
}
function coach() {
  const last = G.comps.slice(-6);
  const dm = avg(last.map((c) => c.max));
  const rates = last.filter((c) => c.interval && c.interval < 2).map((c) => 60 / c.interval);
  const r = rates.length ? avg(rates) : 110;
  const rec = last.filter((c) => c.recoil === false).length;
  if (r < 100) sim.toast('⏩ Daha hızlı bas', 'warn');
  else if (r > 120) sim.toast('⏪ Biraz yavaşla', 'warn');
  else if (dm < 4.95) sim.toast('⬇️ Daha derin bas (en az 5 cm)', 'warn');
  else if (dm > 6.05) sim.toast('⬆️ Çok derin; 6 cm\'yi geçme', 'warn');
  else if (rec > 1) sim.toast('↕️ Göğsün tamamen geri gelmesine izin ver', 'warn');
  else sim.toast('👍 Harika ritim ve derinlik!', 'good');
}
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function startBreaths() {
  G.phase = 'breaths'; G.breaths = 0; G.breathStart = G.t;
  sim.hud.show(`<b>30 bası tamam → 2 kurtarıcı nefes</b><br>Başı geriye it, çeneyi kaldır, burnu kapat; göğüs kalkacak şekilde ~1 sn üfle.<br>
    <button class="btn primary" data-b>🫁 Nefes ver (B)</button><button class="btn" data-s>Nefesi atla, basıya dön</button>`);
  sim.hud.el.querySelector('[data-b]').onclick = giveBreath;
  sim.hud.el.querySelector('[data-s]').onclick = resumeCompressions;
}
function giveBreath() {
  if (G.phase !== 'breaths' || G.rise > 0.05) return;
  G.rise = 1; G.breaths++;
  sim.toast(`🫁 Nefes ${G.breaths}/2 — göğüs kalkıyor`);
  if (G.breaths >= 2) setTimeout(() => { if (G.phase === 'breaths') resumeCompressions(); }, 900);
}
function resumeCompressions() {
  if (G.phase !== 'breaths') return;
  const pause = G.t - G.breathStart;
  G.phase = 'cpr'; G.cycle = 0;
  sim.hud.show(pause > 10 ? '⏱ Nefes arası 10 sn\'yi geçti — basıya hemen dön!' : '💪 Basıya devam! 30 bası', { timeout: 2000, tone: pause > 10 ? 'warn' : 'good' });
}

// OED akışı
function aedArrives() {
  G.aedStage = 1; aed.visible = true;
  sim.toast('🟩 OED geldi!', 'good');
  sim.hud.show(`<b>OED geldi.</b> Ne yaparsın?<br>
    <button class="btn primary" data-x="ok" style="display:block;width:100%;margin-top:6px">Cihazı aç, sesli komutları izle; pedleri çıplak göğse yapıştır</button>
    <button class="btn" data-x="no" style="display:block;width:100%;margin-top:6px">Önce kullanım kılavuzunu baştan sona oku</button>`);
  sim.hud.el.querySelector('[data-x=ok]').onclick = () => {
    if (G.aedStage !== 1) return;
    pads.forEach((p) => (p.visible = true));
    G.phase = 'aed'; G.aedStage = 2; G.aedTimer = 0;
    sim.hud.show('🔊 "Kalp ritmi analiz ediliyor. <b>Hastaya dokunmayın!</b>"', { tone: 'warn' });
  };
  sim.hud.el.querySelector('[data-x=no]').onclick = () => sim.toast('❌ OED\'ler sesli komutla yönlendirir; hemen aç ve komutları izle.', 'bad');
}
function aedShockPrompt() {
  G.aedStage = 3;
  sim.hud.show(`🔊 "Şok öneriliyor. Herkes uzaklaşsın!"<br><button class="btn danger" data-k>⚡ Şok düğmesine bas</button>`, { tone: 'bad' });
  sim.hud.el.querySelector('[data-k]').onclick = shock;
}
function shock() {
  if (G.aedStage !== 3) return;
  G.aedStage = 4; G.flash = 1;
  G.phase = 'cpr'; G.cycle = 0;
  sim.hud.show('⚡ Şok verildi. 🔊 "<b>Hemen göğüs basısına başlayın.</b>"', { timeout: 3500, tone: 'good' });
}

function finish() {
  G.phase = 'done';
  sim.controls.enabled = true;
  const cs = G.comps;
  const rated = cs.filter((c) => c.rateOK != null);
  const pDepth = cs.length ? cs.filter((c) => c.depthOK).length / cs.length : 0;
  const pRate = rated.length ? rated.filter((c) => c.rateOK).length / rated.length : 0;
  const withRec = cs.filter((c) => c.recoil != null);
  const pRec = withRec.length ? withRec.filter((c) => c.recoil).length / withRec.length : 0;
  const ccf = G.compressTime / SESSION;
  const mRate = rated.length ? avg(rated.map((c) => 60 / c.interval)) : 0;
  const mDepth = avg(cs.map((c) => c.max));
  const score = Math.round(100 * (0.35 * pDepth + 0.35 * pRate + 0.2 * pRec + 0.1 * clamp(ccf / 0.8, 0, 1)) - 5 * G.analysisTouches);
  const s = clamp(score, 0, 100);
  const grade = s >= 85 ? '🏆 Mükemmel' : s >= 70 ? '👍 İyi' : s >= 50 ? '🙂 Geliştirilmeli' : '📚 Tekrar pratik yap';
  const row = (k, v, ok) => `<tr><td style="text-align:left;padding:1px 8px">${k}</td><td style="text-align:right;color:${ok ? 'var(--good)' : 'var(--warn)'}">${v}</td></tr>`;
  sim.hud.show(`<h2>${grade} · ${s}/100</h2><table style="margin:0 auto;font-size:13.5px">
    ${row('Toplam bası', fmt(cs.length), cs.length > 150)}
    ${row('Ortalama hız', `${fmt(mRate)}/dk`, mRate >= 100 && mRate <= 120)}
    ${row('Ortalama derinlik', `${fmt(mDepth, 1)} cm`, mDepth >= 5 && mDepth <= 6)}
    ${row('Doğru derinlik', `%${fmt(pDepth * 100)}`, pDepth >= 0.7)}
    ${row('Doğru hız', `%${fmt(pRate * 100)}`, pRate >= 0.7)}
    ${row('Tam geri dönüş', `%${fmt(pRec * 100)}`, pRec >= 0.8)}
    ${row('Bası süresi oranı', `%${fmt(ccf * 100)}`, ccf >= 0.6)}
    ${G.step ? row('Zincir adımları (ilk denemede)', `${G.chainScore}/${CHAIN.length}`, G.chainScore === CHAIN.length) : ''}
    </table><div style="font-size:12px;color:var(--muted);margin-top:4px">Gerçekte OED ve 112 ekibi gelene ya da kişi normal nefes alana kadar bası sürer; yorulursan 2 dakikada bir yer değiştirin.</div>
    <button class="btn primary" data-r>Tekrar oyna</button>`, { tone: s >= 70 ? 'good' : 'warn' });
  sim.hud.el.querySelector('[data-r]').onclick = () => showIntro();
}

// --- Girdi: Boşluk (çekirdeğin duraklatma kısayolundan önce yakala), B, fare/dokunma ---
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea')) return;
  if (e.code === 'Space') {
    if (G.phase === 'intro' || G.phase === 'chain' || G.phase === 'done') return; // oyun dışı: normal duraklatma
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) press();
  } else if (e.key === 'b' || e.key === 'B') giveBreath();
}, true);
window.addEventListener('keyup', (e) => { if (e.code === 'Space') release(); }, true);
sim.dom.addEventListener('pointerdown', (e) => {
  if (G.phase !== 'cpr' && G.phase !== 'aed' && G.phase !== 'breaths') return;
  sim.dom.setPointerCapture?.(e.pointerId);
  press();
});
sim.dom.addEventListener('pointerup', release);
sim.dom.addEventListener('pointercancel', release);

// --- Arayüz ---
const ui = sim.ui;
ui.section('Canlı geri bildirim');
const mRate = ui.meter({ label: 'Hız (hedef 100–120/dk)', color: 'var(--good)' });
const mDepth = ui.meter({ label: 'Derinlik (hedef 5–6 cm)', color: 'var(--good)' });
const mRec = ui.meter({ label: 'Geri dönüş (tam bırak)', color: 'var(--good)' });
const mTime = ui.meter({ label: 'Oturum (2 dakika)', color: 'var(--accent)' });
const stCount = ui.stat({ label: 'Bası (bu döngü)', unit: '/30' });
const stTotal = ui.stat({ label: 'Toplam bası' });
const depthChart = ui.chart({ title: 'Göğüs derinliği (cm) — yeşil çizgiler: 5 ve 6 cm', series: [{ name: 'Derinlik', color: '#38bdf8' }, { name: '5 cm', color: '#16a34a' }, { name: '6 cm', color: '#16a34a' }], maxPoints: 240, yMin: 0, yMax: 8, height: 100 });
ui.section('Ayarlar');
const metro = ui.toggle({ label: '🔊 Metronom (110/dk)', value: false, onChange: (v) => {
  if (v && !actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; } }
  if (v) actx?.resume?.();
} });
const onlyCompr = ui.toggle({ label: 'Yalnız göğüs basısı (nefessiz CPR)', value: false });
ui.text('<small>ERC: Kurtarıcı nefes vermeyi bilmiyor ya da istemiyorsan <b>kesintisiz göğüs basısı</b> yap; bu da hayat kurtarır.</small>');
ui.section('Görünüm');
ui.buttons([
  { label: '🏫 Salon', onClick: () => sim.moveCamera([1.5, 1.3, 1.85], [0.22, 0.4, -0.2]) },
  { label: '✋ Eller (yakın)', onClick: () => sim.moveCamera([0.62, 0.72, 0.72], [0.06, 0.3, -0.03]) },
  { label: '↔ Yandan', onClick: () => sim.moveCamera([2.3, 0.75, -0.15], [0.3, 0.4, -0.12]) },
]);
ui.section('Oturum');
ui.buttons([
  { label: '▶ Oturumu başlat', variant: 'primary', onClick: () => startCPR() },
  { label: '🔗 Zincirle başla', onClick: () => showIntro() },
]);
ui.button({ label: '👀 Doğru ritmi göster (10 sn)', onClick: () => { if (G.phase === 'cpr' || G.phase === 'aed') return sim.toast('Önce oturumu bitir'); demo = { on: true, t: 0 }; } });
ui.text(`<b>Hayat zinciri</b><ol style="margin:4px 0;padding-left:18px">
  <li>Ortam güvenliği, bilinç kontrolü</li><li>Hava yolu + solunum kontrolü (≤10 sn)</li><li><b>112</b>'yi ara, <b>OED</b> iste</li>
  <li>30 göğüs basısı : 2 nefes</li><li>OED gelince hemen kullan</li></ol>
  <small>Eğitim amaçlıdır; sertifikalı ilk yardım kursunun yerini tutmaz. Acil durumda 112.</small>`, 'card');

// --- Döngü ---
let lastDepth = 0, metroPh = 0, chartAcc = 0;
const DMAX = 7.2, TP = 0.16, TR = 0.075;
function step(dt, pressing) {
  const target = pressing ? DMAX : 0;
  G.depth += (target - G.depth) * (1 - Math.exp(-dt / (pressing ? TP : TR)));
  if (G.cur) G.cur.max = Math.max(G.cur.max, G.depth);
}
sim.onRender((rdt) => {
  if (sim.paused) return;
  const sdt = rdt * sim.speed;
  // Gösteri modu: simülasyon saatiyle (hız çarpanı geçerli)
  if (demo.on) {
    demo.t += sdt;
    const ph = (demo.t * 110 / 60) % 1;
    const n = Math.max(1, Math.ceil(sdt / 0.02));
    for (let i = 0; i < n; i++) step(sdt / n, ph < 0.46);
    if (demo.t > 10) { demo.on = false; G.depth = 0; }
  } else {
    // Oyun gerçek zamanla akar (kullanıcı gerçek zamanlı bastığı için hız çarpanı uygulanmaz)
    const dt = rdt;
    step(dt, G.pressing);
    if (G.phase === 'cpr' || G.phase === 'breaths' || G.phase === 'aed') {
      G.t += dt;
      if (G.pressing && G.phase === 'cpr') G.compressTime += dt;
      else if (G.phase === 'cpr' && G.lastPress >= 0 && G.t - G.lastPress < 1.2) G.compressTime += dt;
      if (G.aedStage === 0 && G.t > 50) aedArrives();
      if (G.aedStage === 2) { G.aedTimer += dt; if (G.aedTimer > 5) aedShockPrompt(); }
      if (G.t >= SESSION && G.phase !== 'aed') finish();
    }
  }
  // Görseller
  const d = G.depth;
  const drop = d / 100 - G.rise * 0.012; // m
  pressU.value.w = drop;
  setRescuerDrop(-drop);
  target.position.y = CHEST_TOP + 0.004 - drop; beatRing.position.y = target.position.y + 0.002;
  marker.position.y = -d * GS;
  marker.material.color.setHex(d >= 4.95 && d <= 6.05 ? 0x22c55e : d > 6.05 ? 0xef4444 : 0xfacc15);
  G.rise = Math.max(0, G.rise - rdt * 1.1);
  G.flash = Math.max(0, (G.flash || 0) - rdt * 2);
  padMat.emissiveIntensity = G.flash * 8;
  if (aed.visible) aed.userData.btn.material.emissiveIntensity = G.aedStage === 3 && (performance.now() / 300) % 2 < 1 ? 5 : 0.6;
  // Metronom
  metroPh += rdt * 110 / 60;
  if (metroPh >= 1) { metroPh %= 1; if (metro.value) click(); }
  beatRing.material.opacity = metro.value ? Math.max(0, 0.9 - metroPh * 2.2) : 0;
  beatRing.scale.setScalar(1 + metroPh * 0.4);
  target.material.opacity = G.phase === 'cpr' ? 0.35 + 0.35 * Math.sin(performance.now() / 250) ** 2 : 0.3;
  // Grafik
  chartAcc += rdt;
  if (chartAcc > 0.04) { chartAcc = 0; depthChart.push([d, 5, 6]); }
  // Göstergeler
  if (sim.frame % 4 === 0) updateMeters();
});

function updateMeters() {
  const cs = G.comps;
  const recent = cs.slice(-5).filter((c) => c.interval && c.interval < 2);
  const rate = recent.length ? avg(recent.map((c) => 60 / c.interval)) : 0;
  const tone = (ok, near) => (ok ? 'var(--good)' : near ? 'var(--warn)' : 'var(--bad)');
  mRate.set(rate / 160, rate ? `${fmt(rate)}/dk ${rate >= 100 && rate <= 120 ? '✓' : rate < 100 ? '↑ hızlan' : '↓ yavaşla'}` : '—');
  mRate.color(tone(rate >= 100 && rate <= 120, rate >= 90 && rate <= 130));
  const dd = G.cur ? G.cur.max : lastDepth;
  mDepth.set(dd / 8, dd ? `${fmt(dd, 1)} cm ${dd >= 4.95 && dd <= 6.05 ? '✓' : dd < 4.95 ? '↓ daha derin' : '↑ çok derin'}` : '—');
  mDepth.color(tone(dd >= 4.95 && dd <= 6.05, dd >= 4 && dd <= 7));
  const lastRec = [...cs].reverse().find((c) => c.recoil != null);
  const res = G.pressing ? null : G.depth;
  mRec.set(res == null ? 0.5 : 1 - clamp(res / 2, 0, 1), res == null ? 'basılıyor…' : res < 0.5 ? 'tam ✓' : `${fmt(res, 1)} cm kaldı`);
  mRec.color(lastRec && lastRec.recoil === false ? 'var(--warn)' : 'var(--good)');
  const inSession = ['cpr', 'breaths', 'aed', 'done'].includes(G.phase);
  mTime.set(inSession ? G.t / SESSION : 0, inSession ? `${fmt(Math.min(G.t, SESSION))} / ${SESSION} sn` : 'başlamadı');
  stCount.set(G.phase === 'cpr' || G.phase === 'breaths' ? G.cycle : 0);
  stTotal.set(cs.length);
}

sim.formatTime = () => (['cpr', 'breaths', 'aed'].includes(G.phase) ? `CPR ${fmt(Math.min(G.t, SESSION))} sn` : 'Hazır');
sim.onReset(() => {
  demo.on = false; G.pressing = false; G.depth = 0; G.rise = 0;
  aed.visible = false; pads.forEach((p) => (p.visible = false));
  depthChart.clear();
  showIntro();
});
showIntro();
void lerp;
