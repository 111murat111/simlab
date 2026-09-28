// Antibiyotik Direnci — petri kabında direnç geni taşıyan bakteriler, doz takvimi, farmakokinetik ve seçilim.
import { createSim, THREE, fmt, clamp, heatColor, instanced, TAU, mat, procedural, textTexture, RoundedBoxGeometry } from '@core';
import { createModel, BINS, DR, K } from './model.js';

const HOURS_PER_SEC = 2;   // 1× hızda 1 sn = 2 saat
const H = 0.25;            // model adımı (saat)
const END = 21 * 24;       // varsayılan gözlem süresi (saat)
const T0 = 6;              // ilk doz saati
const MAXV = 1500;         // ekranda en çok hücre
const DISH_R = 5;
const AGAR_Y = 0.26;

const sim = createSim({
  studio: { mood: 'lab', color: 0xa89d8c, warmth: 0.35, key: { el: 58, az: 215, power: 1.25 }, radius: 7, height: 4 },
  look: { aoRadius: 0.004 },
  camera: { position: [0, 0.068, 0.135], target: [0, 0.004, -0.014], fov: 46, near: 0.003, far: 40 },
  controls: { minDistance: 5 * 0.009, maxDistance: 26 * 0.009 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Petri kabında bir bakteri popülasyonu var. Her bakterinin bir <b>direnç düzeyi</b> (MIC: onu durdurmaya yetecek en düşük
    ilaç derişimi) vardır ve bu özellik yavrulara geçer. Bölünme sırasında nadiren <b>mutasyon</b> olur; bazı yavrular biraz daha
    dirençli doğar. Direnç ücretsiz değildir: dirençli bakteriler ilaçsız ortamda biraz daha yavaş çoğalır.</p>
    <p>Renkler direnci gösterir: <b style="color:#60a5fa">mavi</b> hassas, <b style="color:#facc15">sarı</b>–<b style="color:#f97316">turuncu</b>
    orta, <b style="color:#ef4444">kırmızı</b> çok dirençli. Mor sis, ilacın kaptaki derişimidir.</p>
    <h3>Dene</h3>
    <ul>
      <li><b>Tam tedavi</b> senaryosunu izle: son kalan az sayıdaki dirençli hücre de temizlenir.</li>
      <li><b>Erken bırak</b>: bakteri sayısı çok düşmüşken ilacı kes. Hayatta kalanlar çoğunlukla dirençlidir ve popülasyon
        onların yavrularıyla yeniden büyür (nüks). Sonra “aynı ilaçla yeniden tedavi”yi dene.</li>
      <li>Doz aralığını 24 saate çıkar veya yarılanma ömrünü kısalt: ilaç dozlar arasında MIC'in altına düşer, dirençliler seçilir.</li>
    </ul>
    <h3>Model</h3>
    <p>İlaç derişimi tek bölmeli farmakokinetikle azalır: <b>C(t) = C₀·e<sup>−kt</sup></b>, k = ln2 / yarılanma ömrü; her dozda
    derişim artar ve birikir. Öldürme hızı Emax/Hill eğrisini izler: <b>E = Emax·xⁿ/(1+xⁿ)</b>, x = C / (MIC·EC50).
    Büyüme lojistiktir (taşıma kapasitesi ≈ 10⁹ bakteri); bağışıklık sistemi seyrek popülasyonları temizlemeye yardım eder.
    Milyarlarca bakteri hesaplanır; ekranda <b>logaritmik ölçekle</b> en çok ${fmt(MAXV)} hücre çizilir, 200'ün altında her nokta
    tek bir bakteridir. Nadir mutantlar en az bir hücreyle gösterilir.</p>
    <p><small>Sayılar temsilidir; gerçek ilaç, doz ve süreler bakteri türüne ve hastaya göre değişir.</small></p>
    <h3>Gerçek hayatta</h3>
    <p>Antibiyotiği yalnızca hekim reçete ettiğinde, önerilen doz, aralık ve sürede kullan; kendi kendine yarıda bırakma, artanı
    saklama, başkasıyla paylaşma. Antibiyotikler grip ve soğuk algınlığı gibi virüs hastalıklarına etki etmez. Gereksiz kullanım
    dirençli bakterilerin seçilmesini hızlandırır.</p>`,
});

// --- Sahne: laboratuvar tezgâhı, cam petri kabı, amber agar (1 birim = 9 mm; kök grup metreye ölçekler) ---
const LOWQ = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
const S = 0.009;            // birim → metre (kabın iç çapı ≈ 90 mm)
const BOT = -0.3;           // kabın dış tabanı (birim); agar ≈ 4,3 mm kalınlıkta
const root = new THREE.Group();
root.scale.setScalar(S);
root.position.y = -BOT * S; // kap tezgâha otursun
sim.scene.add(root);
const lathe = (pts, seg = 96) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
{
  // Biyogüvenlik kabini (Sınıf II): paslanmaz çelik çalışma yüzeyi, arka ve yan paneller, arka emiş ızgarası
  sim.sky.mesh.position.y = -0.9;
  const steel = procedural({
    key: 'ab-steel', physical: true, bump: 0.0004, params: { color: 0xcdc7bd, metalness: 0.7, roughness: 0.36, envMapIntensity: 0.7 },
    pattern: `float n = fbm3(p*vec3(3.0, 3.0, 3.0), 3), b = vn3(vec3(p.x*6.0, p.y*40.0, p.z*420.0));
      col *= 0.95 + 0.07*n + 0.02*(b - 0.5); rough = 0.3 + 0.04*b + 0.06*n; h = n;`,
  });
  const top = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.02, 0.62, 3, 0.004), steel);
  top.position.set(0, -0.01, -0.03);
  top.userData.noFit = true;
  sim.scene.add(top);
  // ön delikli hava ızgarası (operatörün önünde)
  const grille = procedural({
    key: 'ab-grille', physical: true, params: { color: 0xb9bec3, metalness: 0.85, roughness: 0.35 },
    pattern: `vec2 q = p.xz/0.006; vec2 f = fract(q) - 0.5; float d = length(f); float w = fwidth(d)*1.5;
      float hole = (1.0 - smoothstep(0.28 - w, 0.28 + w, d))*aaW(vec3(q, 0.0));
      col = mix(col, vec3(0.02), hole); rough = mix(rough, 1.0, hole); metal = mix(metal, 0.0, hole);`,
  });
  const fg = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.004, 0.08), grille);
  fg.position.set(0, 0.002, 0.24); fg.userData.noFit = true;
  sim.scene.add(fg);
  const wallM = procedural({
    key: 'ab-wall', physical: true, bump: 0.0002, params: { color: 0xd2ccc2, metalness: 0.6, roughness: 0.5 },
    pattern: `float b = vn3(vec3(p.x*20.0, p.y*60.0, p.z*20.0)), n = fbm3(p*4.0, 3);
      col *= 0.93 + 0.07*n + 0.04*(b - 0.5); rough = 0.36 + 0.08*b;
      // arka paneldeki emiş yarıkları (alt 7 cm)
      float slot = step(abs(fract(p.x/0.018) - 0.5), 0.22)*step(0.012, p.y)*step(p.y, 0.065)*step(0.5, pn.z);
      col = mix(col, vec3(0.03), slot); metal = mix(metal, 0.0, slot); rough = mix(rough, 1.0, slot); h = b - slot;`,
  });
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.72, 0.01), wallM);
  back.position.set(0, 0.36, -0.345);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.72, 0.62), wallM);
    side.position.set(sx * 0.5, 0.36, -0.03);
    side.userData.noCast = side.userData.noFit = true;
    sim.scene.add(side);
  }
  back.userData.noCast = back.userData.noFit = true;
  sim.scene.add(back);
  // tavandaki LED armatür paneli (kabinin kendi aydınlatması)
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.01, 0.12), mat.glow({ color: 0xf4f6ff, intensity: 2.2 }));
  led.position.set(0, 0.715, -0.1); led.userData.noCast = true;
  sim.scene.add(led);
  const cab = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.86, 0.8, 3, 0.01), mat.paintedMetal({ color: 0xd9dcdf, wear: 0.05, scale: 0.4 }));
  cab.position.set(0, -0.45, -0.05);
  cab.userData.noFit = true;
  sim.scene.add(cab);

  // Arka planda: kapalı, dolu petri kabı yığını; tüp standı; besiyeri şişesi
  const lathW = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const plastic = mat.glass({ tint: 0xf4fbff, rough: 0.06, thickness: 0.001 });
  const agarB = new THREE.MeshPhysicalMaterial({ color: 0xd9a852, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05, transmission: 0.35, thickness: 0.004, ior: 1.34,
    attenuationColor: new THREE.Color(0xc98a2a), attenuationDistance: 0.01 });
  const stack = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const y0 = i * 0.0142;
    const d = new THREE.Mesh(lathW([[0, 0], [0.0445, 0], [0.0445, 0.0125], [0.0435, 0.0125], [0.0435, 0.0012], [0, 0.0012]]), plastic);
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.0045, 48), agarB);
    a.position.y = 0.0035;
    const lid2 = new THREE.Mesh(lathW([[0, 0.0142], [0.0462, 0.0142], [0.0462, 0.004], [0.0452, 0.004], [0.0452, 0.013], [0, 0.013]]), plastic);
    for (const o of [d, a, lid2]) { o.position.y += y0; o.userData.noCast = o !== a; stack.add(o); }
  }
  // yığının etiketi (keçeli kalem yazısı)
  stack.position.set(-0.13, 0, -0.14); stack.rotation.z = 0.0;
  sim.scene.add(stack);
  const rackM = mat.plastic({ color: 0xeef0f2, gloss: 0.25 });
  const rack = new THREE.Group();
  const plateM = procedural({
    key: 'ab-rack', params: { color: 0xeef0f2, roughness: 0.55 },
    pattern: `vec2 q = (p.xz - vec2(0.0))/0.022; vec2 f = fract(q + 0.5) - 0.5; float d = length(f); float w = fwidth(d)*1.5;
      float hole = (1.0 - smoothstep(0.34 - w, 0.34 + w, d))*step(0.9, pn.y)*step(abs(p.z), 0.022)*step(abs(p.x), 0.066);
      col = mix(col, col*0.12, hole); h = -hole;`,
  });
  for (const y of [0.012, 0.06]) {
    const pl = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.004, 0.06, 2, 0.0015), y > 0.03 ? plateM : rackM);
    pl.position.y = y; rack.add(pl);
  }
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new RoundedBoxGeometry(0.004, 0.064, 0.06, 1, 0.0015), rackM); e.position.set(sx * 0.078, 0.032, 0); rack.add(e); }
  const tubeG = lathW([[0.0075, 0.1], [0.0075, 0.008], [0.006, 0.0025], [0.0035, 0.0003], [0, 0]], 24);
  const brothG = lathW([[0, 0.001], [0.0033, 0.0014], [0.0058, 0.004], [0.0068, 0.008], [0.0068, 0.05], [0, 0.05]], 20);
  const capCols = [0x2f6fd0, 0x2f6fd0, 0xd0402f, 0x2f6fd0, 0xe0b020, 0xd0402f, 0x2f6fd0, 0x3a9a50];
  const broth = mat.liquid({ color: 0xd9b050, density: 0.25 });
  let ti = 0;
  for (const z of [-0.011, 0.011]) for (let k = 0; k < 6; k++) {
    if ((k + (z > 0 ? 1 : 0)) % 3 === 2) continue;
    const x = -0.055 + k * 0.022;
    const t = new THREE.Mesh(tubeG, plastic); t.position.set(x, 0.014, z); t.userData.noCast = true; rack.add(t);
    const b = new THREE.Mesh(brothG, broth); b.position.set(x, 0.014, z); b.scale.y = 0.8 + 0.4 * ((ti * 37) % 5) / 5; rack.add(b);
    const c = new THREE.Mesh(lathW([[0, 0], [0.0088, 0], [0.009, 0.018], [0.008, 0.02], [0, 0.02]], 24), mat.plastic({ color: capCols[ti++ % 8], gloss: 0.5 }));
    c.position.set(x, 0.106, z); rack.add(c);
  }
  rack.position.set(0.15, 0, -0.17); rack.rotation.y = -0.25;
  sim.scene.add(rack);
  {
    const bot = new THREE.Group();
    const bg = new THREE.Mesh(lathW([[0, 0], [0.034, 0], [0.036, 0.004], [0.036, 0.09], [0.03, 0.108], [0.015, 0.118], [0.015, 0.132], [0, 0.132]]), mat.glass({ tint: 0xf0fbff, rough: 0.02, thickness: 0.002 }));
    bg.userData.noCast = true;
    const lq = new THREE.Mesh(lathW([[0, 0.004], [0.0335, 0.004], [0.0335, 0.07], [0, 0.07]]), mat.liquid({ color: 0xc89a40, density: 0.2 }));
    const cp = new THREE.Mesh(lathW([[0, 0.128], [0.0175, 0.128], [0.018, 0.15], [0.016, 0.152], [0, 0.152]]), mat.plastic({ color: 0x1f5fb8, gloss: 0.4 }));
    const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.0362, 0.0362, 0.04, 48, 1, true, -0.9, 1.8), new THREE.MeshStandardMaterial({
      map: textTexture('Mueller-Hinton\nagar · 500 mL', { size: 44, color: '#1c2430', bg: '#f3f1ea', pad: 16 }), roughness: 0.7 }));
    lb.position.y = 0.045;
    bot.add(bg, lq, cp, lb);
    bot.position.set(-0.24, 0, -0.24);
    sim.scene.add(bot);
  }

  // Petri kabı: kalın tabanlı cam, dudaklı duvar
  const glassMat = mat.glass({ tint: 0xeef8ff, rough: 0.03, thickness: 0.002 });
  const dish = new THREE.Mesh(lathe([[0, BOT], [5.26, BOT], [5.34, BOT + 0.03], [5.37, BOT + 0.1], [5.37, 1.25], [5.34, 1.3], [5.27, 1.3], [5.24, 1.25],
    [5.24, BOT + 0.12], [5.2, BOT + 0.08], [0, BOT + 0.08]]), glassMat);
  dish.userData.noCast = true;
  root.add(dish);
  // Agar: ıslak, amber jel; kenarda cama tırmanan menisküs
  // Mueller-Hinton agar: yarı saydam, bal rengi jel (ışık içinden geçip çelik zeminden yansır)
  const agarMat = new THREE.MeshPhysicalMaterial({ color: 0xe8c47a, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03,
    transmission: 0.55, thickness: 0.5, ior: 1.34, attenuationColor: new THREE.Color(0xc98a2a), attenuationDistance: 0.008,
    emissive: 0x3a2406, emissiveIntensity: 0.12 });
  const agar = new THREE.Mesh(lathe([[0, BOT + 0.08], [5.2, BOT + 0.08], [5.24, BOT + 0.12], [5.24, 0.36], [5.2, 0.33], [5.1, 0.285], [4.9, 0.265], [4.5, AGAR_Y], [0, AGAR_Y]]), agarMat);
  root.add(agar);
  // Kabın yan duvarında el yazısı etiket bandı (suş, tarih)
  {
    const lt = textTexture('E. coli ATCC 25922 · 21.09', { size: 46, color: '#1b2a6b', bg: '#f4f1e8', pad: 10, font: 'italic 600 {s}px "Segoe Print", "Comic Sans MS", cursive' });
    const arc = 0.5 * lt.userData.aspect * 0.55 / 5.4 * 2.0;
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.55, 64, 1, true, -arc / 2, arc),
      new THREE.MeshStandardMaterial({ map: lt, roughness: 0.75, transparent: true, opacity: 0.96 }));
    lab.position.y = 0.55;
    lab.userData.noCast = true;
    root.add(lab);
  }
  // Kabin LED'inin sıcak beyaz yansıması ve oda dolgusu
  sim.scene.add(new THREE.HemisphereLight(0xffeccc, 0x86704f, 0.85));

  // Ters çevrilmiş kapak (arkada, sağda) ve etiketli keçeli kalem
  const lid = new THREE.Mesh(lathe([[0, BOT], [5.6, BOT], [5.68, BOT + 0.03], [5.7, BOT + 0.1], [5.7, 0.7], [5.66, 0.75], [5.6, 0.7], [5.6, BOT + 0.1], [0, BOT + 0.1]]), glassMat);
  lid.position.set(10.5, 0, -8.5);
  lid.userData.noCast = true;
  root.add(lid);
  const pen = new THREE.Group();
  const body = new THREE.Mesh(lathe([[0, 0], [0.5, 0], [0.62, 0.3], [0.78, 1.2], [0.8, 9.2], [0, 9.2]], 32), mat.plastic({ color: 0x15171b, gloss: 0.6 }));
  const cap = new THREE.Mesh(lathe([[0, 9.1], [0.86, 9.1], [0.9, 9.4], [0.9, 13.4], [0.8, 13.9], [0, 14.0]], 32), mat.plastic({ color: 0xc62828, gloss: 0.7 }));
  const clip = new THREE.Mesh(new RoundedBoxGeometry(0.3, 4.6, 0.25, 2, 0.1), mat.plastic({ color: 0xc62828, gloss: 0.7 }));
  clip.position.set(0, 11.2, 0.95);
  pen.add(body, cap, clip);
  pen.rotation.set(-Math.PI / 2, 0, 1.2);
  pen.position.set(-11.5, BOT + 0.9, 6.5);
  root.add(pen);
}

// İlaç sisi (derişime göre opaklık): agarın üstünde yukarı doğru sönen mor bulut
const drugMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0, depthWrite: false });
drugMat.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLoc = position;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLoc;')
    .replace('#include <opaque_fragment>', `float fy = 1.0 - smoothstep(-0.2, 0.2, vLoc.y);
      float fr = 1.0 - smoothstep(4.2, 5.2, length(vLoc.xz));
      diffuseColor.a *= (0.35 + 0.65*fy)*(0.55 + 0.45*fr);
      #include <opaque_fragment>`);
};
const drugFog = new THREE.Mesh(new THREE.CylinderGeometry(DISH_R + 0.2, DISH_R + 0.2, 0.4, 72, 1, true), drugMat);
drugFog.position.y = 0.46;
drugFog.userData.noAO = true;
root.add(drugFog);
const drugTop = new THREE.Mesh(new THREE.CircleGeometry(DISH_R + 0.2, 72).rotateX(-Math.PI / 2), drugMat);
drugTop.position.y = -0.14;
drugFog.add(drugTop);

// Doz damlası (mikropipet ucundan) ve halka dalgası
const drop = new THREE.Mesh(lathe([[0, -0.28], [0.16, -0.25], [0.26, -0.12], [0.28, 0.02], [0.2, 0.2], [0.08, 0.38], [0, 0.48]], 32),
  new THREE.MeshPhysicalMaterial({ color: 0xc084fc, roughness: 0.02, clearcoat: 1, transmission: 0.6, thickness: 0.002, emissive: 0x4c1d95, emissiveIntensity: 0.4 }));
drop.visible = false;
root.add(drop);
const pip = new THREE.Group();
{
  const tip = new THREE.Mesh(lathe([[0, 0], [0.14, 0], [0.2, 0.3], [0.62, 6.0], [0.7, 6.2], [0.7, 7.0], [0, 7.0]], 32),
    new THREE.MeshPhysicalMaterial({ color: 0xf2f5f8, roughness: 0.35, transmission: 0.7, thickness: 0.001, clearcoat: 0.4 }));
  const barrel = new THREE.Mesh(lathe([[0, 6.6], [0.6, 6.6], [0.72, 7.4], [1.1, 9.0], [1.3, 16], [1.3, 24], [0, 24]], 32), mat.plastic({ color: 0xe9ecef, gloss: 0.5 }));
  pip.add(tip, barrel);
  pip.position.set(0, AGAR_Y + 4.35, 0);
  pip.visible = false;
  root.add(pip);
}
const ringMat = new THREE.MeshBasicMaterial({ color: 0xd8b4fe, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), ringMat);
ring.rotation.x = -Math.PI / 2;
ring.position.y = AGAR_Y + 0.03;
ring.userData.noAO = true;
root.add(ring);
let dropAnim = -1, ringAnim = -1;
sim.onRender(() => { pip.visible = dropAnim >= 0 || ringAnim >= 0 && ringAnim < 0.4; });

const status = sim.label('', { parent: root, position: [0, 1.6, -DISH_R - 0.6], className: 'big' });

// --- Bakteri (temsilî): agar üstünde ıslak, parlak, kubbemsi koloni kümeleri ---
// Her nokta bir koloni birimi: kenarı hafif yayvan, ortası kabarık (E. coli benzeri krem koloni)
const cellGeo = lathe([[0.15, -0.012], [0.16, 0.0], [0.15, 0.012], [0.13, 0.03], [0.095, 0.048], [0.05, 0.058], [0, 0.061]], LOWQ ? 14 : 20);  // alttan üste: dışa bakan normaller
cellGeo.scale(1, 1, 0.9);
const cellMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.12,
  sheen: 0.5, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xfff4dc) });
const cellMesh = instanced(cellGeo, cellMat, MAXV);
cellMesh.frustumCulled = false;
root.add(cellMesh);
const mArr = cellMesh.instanceMatrix.array;
cellMesh.setColorAt(0, new THREE.Color(1, 1, 1));
const cArr = cellMesh.instanceColor.array;

const cx = new Float32Array(MAXV), cz = new Float32Array(MAXV), ca = new Float32Array(MAXV);
const cbin = new Int8Array(MAXV);
const cstate = new Uint8Array(MAXV); // 0 boş, 1 canlı, 2 ölüyor
const clife = new Float32Array(MAXV); // doğum: 0→1 büyüme, ölüm: 1→0
const binCol = [];
// Kromojenik besiyeri benzeri renk: doğal krem koloni rengi direnç rengine doğru karıştırılır
const creamCol = new THREE.Color(0xeedcb4);
for (let i = 0; i < BINS; i++) binCol.push(creamCol.clone().lerp(heatColor(Math.min(1, i / 6) * 0.95 + (i ? 0.05 : 0)), 0.36));
const plainCol = creamCol;
const csz = new Float32Array(MAXV).map(() => 0.7 + Math.random() * 0.6);
const deadCol = new THREE.Color(0x6b7280);
const tmpCol = new THREE.Color();
const colonies = [];
function newColonies() {
  colonies.length = 0;
  for (let k = 0; k < 18; k++) {
    const r = Math.sqrt(Math.random()) * (DISH_R - 1), a = Math.random() * TAU;
    colonies.push([Math.cos(a) * r, Math.sin(a) * r, 0.45 + Math.random() * 0.45]);
  }
}

const aliveIdx = new Int32Array(MAXV), binStart = new Int32Array(BINS + 1), binCnt = new Int32Array(BINS + 1);
const target = new Int32Array(BINS);

function visCount(N) {
  if (N < 1) return 0;
  if (N < 200) return Math.round(N);
  return Math.min(MAXV, Math.round(200 + (MAXV - 200) * (Math.log10(N) - Math.log10(200)) / (Math.log10(K) - Math.log10(200))));
}

const _pt = [0, 0];
function colonyPoint() {
  // yuvarlak koloni: merkezin çevresinde disk içinde düzgün dağılım
  const c = colonies[Math.floor(Math.random() * colonies.length)];
  const r = c[2] * Math.sqrt(Math.random()), a = Math.random() * TAU;
  _pt[0] = c[0] + Math.cos(a) * r; _pt[1] = c[1] + Math.sin(a) * r;
  return _pt;
}

function spawnAt(s, bin, instant) {
  // ebeveyn: aynı sınıftan (yoksa herhangi) canlı hücre
  let par = -1;
  const n0 = binStart[bin + 1] - binStart[bin];
  if (n0 > 0) par = aliveIdx[binStart[bin] + Math.floor(Math.random() * n0)];
  else if (binStart[BINS] > 0) par = aliveIdx[Math.floor(Math.random() * binStart[BINS])];
  let x, z;
  if (par >= 0) {
    const a = Math.random() * TAU, d = 0.12 + Math.random() * 0.14;
    x = cx[par] + Math.cos(a) * d; z = cz[par] + Math.sin(a) * d;
  } else {
    [x, z] = colonyPoint();
  }
  if (x * x + z * z > (DISH_R - 0.2) ** 2) [x, z] = colonyPoint();
  cx[s] = x; cz[s] = z; ca[s] = Math.random() * TAU; cbin[s] = bin; cstate[s] = 1; clife[s] = instant ? 1 : 0;
}

let freePtr = 0;
function freeSlot() {
  for (let k = 0; k < MAXV; k++) {
    const s = (freePtr + k) % MAXV;
    if (cstate[s] === 0) { freePtr = s + 1; return s; }
  }
  return -1;
}

/** Ekrandaki hücreleri modeldeki sınıf dağılımına yaklaştırır (ölenler solar, yeniler ebeveyn yanında doğar). */
function reconcile(instant = false) {
  const N = m.total();
  const V = visCount(N);
  for (let b = 0; b < BINS; b++) {
    const nb = m.n[b];
    let t = N > 0 ? Math.round((V * nb) / N) : 0;
    if (nb >= 1 && t === 0) t = 1; // nadir mutant en az bir hücreyle
    target[b] = Math.min(t, Math.ceil(nb));
  }
  // canlıları sınıflara göre sırala
  binCnt.fill(0);
  for (let s = 0; s < MAXV; s++) if (cstate[s] === 1) binCnt[cbin[s]]++;
  let acc = 0;
  for (let b = 0; b <= BINS; b++) { binStart[b] = acc; acc += b < BINS ? binCnt[b] : 0; }
  binCnt.fill(0);
  for (let s = 0; s < MAXV; s++) if (cstate[s] === 1) { const b = cbin[s]; aliveIdx[binStart[b] + binCnt[b]++] = s; }
  for (let b = 0; b < BINS; b++) {
    const have = binStart[b + 1] - binStart[b];
    if (have > target[b]) {
      let kill = have - target[b];
      const off = Math.floor(Math.random() * have);
      for (let k = 0; k < have && kill > 0; k++) {
        const s = aliveIdx[binStart[b] + ((off + k * 7) % have)];
        if (cstate[s] !== 1) continue;
        if (instant) { cstate[s] = 0; } else { cstate[s] = 2; clife[s] = 1; }
        kill--;
      }
    } else if (have < target[b]) {
      for (let k = have; k < target[b]; k++) {
        const s = freeSlot();
        if (s < 0) break;
        spawnAt(s, b, instant);
      }
    }
  }
}

function drawCells(rdt) {
  const colorOn = showColor.value;
  for (let s = 0; s < MAXV; s++) {
    const o = s * 16, st = cstate[s];
    let sc = 0;
    if (st === 1) {
      if (clife[s] < 1) clife[s] = Math.min(1, clife[s] + rdt * 2.5);
      sc = 0.35 + 0.65 * clife[s];
      const c = colorOn ? binCol[cbin[s]] : plainCol;
      cArr[s * 3] = c.r; cArr[s * 3 + 1] = c.g; cArr[s * 3 + 2] = c.b;
    } else if (st === 2) {
      clife[s] -= rdt * 1.6;
      if (clife[s] <= 0) { cstate[s] = 0; clife[s] = 0; }
      sc = Math.max(0, clife[s]) * 0.9;
      tmpCol.copy(colorOn ? binCol[cbin[s]] : plainCol).lerp(deadCol, 1 - Math.max(0, clife[s]) * 0.6);
      cArr[s * 3] = tmpCol.r; cArr[s * 3 + 1] = tmpCol.g; cArr[s * 3 + 2] = tmpCol.b;
    }
    const k = sc * csz[s], c = Math.cos(ca[s]) * k, sn = Math.sin(ca[s]) * k;
    mArr[o] = c; mArr[o + 1] = 0; mArr[o + 2] = -sn; mArr[o + 3] = 0;
    mArr[o + 4] = 0; mArr[o + 5] = k * (0.8 + 0.3 * csz[s]); mArr[o + 6] = 0; mArr[o + 7] = 0;
    mArr[o + 8] = sn; mArr[o + 9] = 0; mArr[o + 10] = c; mArr[o + 11] = 0;
    mArr[o + 12] = cx[s]; mArr[o + 13] = AGAR_Y - 0.004; mArr[o + 14] = cz[s]; mArr[o + 15] = 1;
  }
  cellMesh.instanceMatrix.needsUpdate = true;
  cellMesh.instanceColor.needsUpdate = true;
}

// --- Model ve tedavi takvimi ---
const m = createModel();
let T = 0, nextDose = T0, dosesGiven = 0, courseStart = T0, lastDoseT = -1, stopAt = Infinity;
let stoppedEarly = false, verdict = null, nextChart = 0, courseNo = 1, endT = END;

const plannedDoses = () => Math.max(1, Math.round((days.value * 24) / tau.value));
const courseOver = () => dosesGiven >= plannedDoses() || T >= stopAt;

function giveDose() {
  m.C += dose.value;
  dosesGiven++;
  lastDoseT = T;
  nextDose += tau.value;
  dropAnim = 0;
}

function stopNow() {
  if (courseOver()) return;
  stopAt = T;
  stoppedEarly = true;
  sim.toast(`⛔ Tedavi ${fmt(T / 24, 1)}. günde bırakıldı`, 'warn');
}

function newCourse() {
  courseStart = T + 0.01;
  nextDose = courseStart;
  dosesGiven = 0;
  // yeni kür tam süre uygulanır
  earlyStop.set(false);
  stopAt = Infinity;
  stoppedEarly = false;
  verdict = null;
  courseNo++;
  endT = Math.max(endT, T + (days.value + 6) * 24);
  sim.hud.hide();
  verdictBox.set('');
  sim.toast(`💊 ${courseNo}. tedavi kürü başladı (aynı ilaç)`);
}

function advance(hours) {
  let steps = Math.ceil(hours / H);
  while (steps-- > 0 && T < endT) {
    if (T >= nextDose - 1e-6 && dosesGiven < plannedDoses() && T < stopAt) giveDose();
    m.step(H);
    T += H;
    if (T >= nextChart) { pushChart(); nextChart += 2; }
    judge();
  }
}

function judge() {
  if (verdict) return;
  const N = m.total();
  const mic = Math.pow(2, m.meanR());
  if (N === 0) {
    verdict = 'temiz';
    showVerdict(`<h2>✅ Enfeksiyon temizlendi</h2><p>${fmt(T / 24, 1)}. günde son bakteri de öldü. Tedavi, ilacın etkisinden
      kısmen kaçabilen az sayıdaki dirençli hücre de yok olana kadar sürdü.</p>`, 'good');
    return;
  }
  if (courseOver() && T > Math.max(lastDoseT, stopAt === Infinity ? 0 : stopAt) + 24 && N > 1e8) {
    const early = stoppedEarly && dosesGiven < plannedDoses();
    verdict = early ? 'nüks' : 'başarısız';
    const why = early
      ? `Tedavi ${fmt(stopAt / 24, 1)}. günde bırakıldı. O anda hayatta kalan az sayıdaki bakteri çoğunlukla dirençliydi;
         yeniden çoğalan popülasyonun ortalama direnci <b>${fmt(mic, 1)} kat</b>.`
      : `İlaç derişimi dozlar arasında bakterilerin bir kısmının MIC değerinin altına düştü; hayatta kalan dirençliler seçildi.
         Yeni popülasyonun ortalama direnci <b>${fmt(mic, 1)} kat</b>.`;
    showVerdict(`<h2>${early ? '⚠️ Nüks: bakteriler geri döndü' : '❌ Tedavi başarısız'}</h2><p>${why} Aynı ilaç artık daha az etkili.</p>`, 'bad', true);
    return;
  }
  if (T >= endT - H) {
    verdict = 'süre';
    showVerdict(`<h2>⏱ Gözlem süresi bitti</h2><p>Bakteri sayısı: ${big(N)}, ortalama direnç ${fmt(mic, 1)} kat.</p>`, 'warn', true);
  }
}

function showVerdict(html, tone, retry = false) {
  sim.hud.show(`${html}${retry ? '<button class="btn primary" data-a="kur">🔁 Aynı ilaçla yeniden tedavi</button>' : ''}
    <button class="btn" data-a="bas">⟲ Baştan başla</button>`, { tone });
  sim.hud.el.querySelector('[data-a="bas"]').onclick = () => sim.reset();
  const k = sim.hud.el.querySelector('[data-a="kur"]');
  if (k) k.onclick = () => newCourse();
  verdictBox.set(html.replace(/<h2>/, '<b>').replace(/<\/h2>/, '</b><br>'));
  verdictBox.el.className = 'ctl-text ' + (tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : 'warn');
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (e) => String(e).split('').map((d) => (d === '-' ? '⁻' : SUP[+d])).join('');
function big(n) {
  if (n < 1000) return fmt(Math.round(n));
  const e = Math.floor(Math.log10(n));
  return `${fmt(n / 10 ** e, 1)} × 10${sup(e)}`;
}
function sci(x) {
  const e = Math.floor(Math.log10(x) + 1e-9), mnt = x / 10 ** e;
  return `${Math.abs(mnt - 1) < 0.05 ? '' : fmt(mnt, 1) + ' × '}10${sup(e)}`;
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Senaryolar');
const SCEN = {
  tam: { dose: 6, tau: 8, days: 7, hl: 4, early: false, text: '<b>Tam tedavi:</b> 7 gün, 8 saatte bir doz. Önerilen süre boyunca ilaç derişimi yüksek tutulur.' },
  erken: { dose: 6, tau: 8, days: 7, hl: 4, early: true, stop: 3, text: '<b>Erken bırak:</b> aynı plan, ama “kendimi iyi hissediyorum” diye 3. günde bırakılıyor.' },
  dusuk: { dose: 3, tau: 8, days: 7, hl: 4, early: false, text: '<b>Düşük doz:</b> ilaç derişimi hassasları öldürmeye yeter ama orta dirençlileri durduramaz.' },
  atlama: { dose: 6, tau: 24, days: 7, hl: 4, early: false, text: '<b>Seyrek doz:</b> günde yalnızca bir doz; ilaç dozlar arasında MIC’in altına düşer.' },
};
const scenText = ui.text(SCEN.tam.text, 'card');
function applyScen(key) {
  const s = SCEN[key];
  dose.set(s.dose); tau.set(s.tau); days.set(s.days); halfLife.set(s.hl);
  earlyStop.set(s.early); if (s.stop) stopDay.set(s.stop);
  scenText.set(s.text);
  sim.reset();
  sim.play();
}
ui.buttons([
  { label: '✅ Tam tedavi', variant: 'good', onClick: () => applyScen('tam') },
  { label: '⚠️ Erken bırak', variant: 'danger', onClick: () => applyScen('erken') },
]);
ui.buttons([
  { label: '📉 Düşük doz', onClick: () => applyScen('dusuk') },
  { label: '⏰ Seyrek doz', onClick: () => applyScen('atlama') },
]);

ui.section('Tedavi planı');
const dose = ui.slider({ label: 'Doz (tepe artışı)', min: 0, max: 16, step: 0.5, value: 6, format: (v) => `${fmt(v, 1)} × MIC₀` });
const tau = ui.slider({ label: 'Doz aralığı', min: 4, max: 24, step: 2, value: 8, unit: 'saat' });
const days = ui.slider({ label: 'Tedavi süresi', min: 1, max: 14, step: 1, value: 7, unit: 'gün' });
const halfLife = ui.slider({ label: 'İlacın yarılanma ömrü', min: 1, max: 12, step: 0.5, value: 4, unit: 'saat',
  onChange: (v) => { m.halfLife = v; } });
const earlyStop = ui.toggle({ label: 'Tedaviyi erken bırak', value: false,
  onChange: (v) => { if (!courseOver() || !v) { stopAt = v ? courseStart + stopDay.value * 24 : Infinity; stoppedEarly = v; } } });
const stopDay = ui.slider({ label: 'Bırakma günü', min: 1, max: 7, step: 0.5, value: 3, format: (v) => `${fmt(v, 1)}. gün`,
  onChange: (v) => { if (earlyStop.value && !courseOver()) stopAt = courseStart + v * 24; } });
ui.buttons([
  { label: '⛔ Şimdi bırak', onClick: () => stopNow() },
  { label: '💊 Yeni kür', variant: 'primary', onClick: () => newCourse() },
]);

ui.section('Biyoloji');
const muS = ui.slider({ label: 'Mutasyon olasılığı (bölünme başına)', min: -8, max: -5, step: 0.5, value: -6,
  format: (v) => sci(10 ** v),
  onChange: (v) => { m.p.mu = 10 ** v; } });
const costS = ui.slider({ label: 'Direncin bedeli (büyüme kaybı)', min: 0, max: 0.15, step: 0.01, value: 0.05,
  format: (v) => `%${fmt(v * 100)} / 2 kat MIC`, onChange: (v) => { m.p.cost = v; } });
const immune = ui.toggle({ label: 'Bağışıklık sistemi yardım etsin', value: true, onChange: (v) => { m.p.immune = v; } });
const showColor = ui.toggle({ label: 'Direnci renkle göster', value: true });
ui.text(`<div style="height:8px;border-radius:4px;background:linear-gradient(90deg,#2563eb,#22c55e,#facc15,#f97316,#dc2626)"></div>
  <div style="display:flex;justify-content:space-between;font-size:11.5px"><span>MIC 1× (hassas)</span><span>2×</span><span>4×</span><span>≥ 8×</span></div>`);

ui.section('Durum');
const stN = ui.stat({ label: 'Bakteri' });
const stMic = ui.stat({ label: 'Ortalama MIC', unit: '×' });
const stC = ui.stat({ label: 'İlaç derişimi', unit: '× MIC₀' });
const stDose = ui.stat({ label: 'Alınan doz' });
const stRes = ui.stat({ label: 'Dirençli (MIC ≥ 4×)' });
const stPhase = ui.stat({ label: 'Tedavi' });
const verdictBox = ui.text('');
const popChart = ui.chart({ title: 'Bakteri sayısı (log₁₀) ve ortalama direnç (log₂ MIC)', maxPoints: END / 2 + 1, yMin: 0, yMax: 9.5,
  series: [{ name: 'log₁₀ bakteri', color: '#22c55e', fill: true }, { name: 'Ort. direnç (log₂ MIC)', color: '#f97316' }] });
const drugChart = ui.chart({ title: 'İlaç derişimi (× MIC₀)', maxPoints: END / 2 + 1, yMin: 0,
  series: [{ name: 'İlaç', color: '#a855f7', fill: true }, { name: 'Hassas MIC', color: '#94a3b8' }, { name: 'Ort. MIC', color: '#f97316' }] });
let lastMic = 1;

function pushChart() {
  const N = m.total();
  if (N > 0) lastMic = Math.pow(2, m.meanR());
  popChart.push([N > 0 ? Math.log10(N) : 0, N > 0 ? m.meanR() : 0]);
  drugChart.push([m.C, 1, lastMic]);
}

function resistantFrac() {
  let r = 0, s = 0;
  for (let i = 0; i < BINS; i++) { s += m.n[i]; if (i * DR >= 2) r += m.n[i]; }
  return s > 0 ? r / s : 0;
}

function updateStats() {
  const N = m.total();
  stN.set(big(N), N === 0 ? 'good' : N > 1e8 ? 'bad' : 'warn');
  const mic = Math.pow(2, m.meanR());
  stMic.set(N > 0 ? fmt(mic, 1) : '—', mic >= 4 ? 'bad' : mic >= 2 ? 'warn' : '');
  stC.set(fmt(m.C, 1), m.C >= 1 ? 'good' : '');
  stDose.set(`${dosesGiven} / ${plannedDoses()}`);
  const f = resistantFrac();
  stRes.set(N === 0 ? '—' : f <= 0 ? '%0' : f < 0.001 ? '< %0,1' : `%${fmt(f * 100, f < 0.1 ? 1 : 0)}`, f > 0.5 ? 'bad' : f > 0.01 ? 'warn' : '');
  let ph;
  if (T < courseStart) ph = 'Başlamadı';
  else if (!courseOver()) ph = `${Math.floor((T - courseStart) / 24) + 1}. gün`;
  else ph = T >= stopAt && dosesGiven < plannedDoses() ? 'Bırakıldı' : 'Bitti';
  stPhase.set(ph, ph === 'Bırakıldı' ? 'warn' : '');
  let s;
  if (N === 0) s = '✅ Kap temiz';
  else if (T < courseStart) s = '🦠 Enfeksiyon kuruldu';
  else if (!courseOver()) s = `💊 Tedavi: ${Math.floor((T - courseStart) / 24) + 1}. gün / ${fmt(days.value)}`;
  else if (T >= stopAt && dosesGiven < plannedDoses()) s = '⛔ Tedavi yarıda bırakıldı';
  else s = '🏁 Tedavi tamamlandı';
  status.setText(s);
}

sim.formatTime = () => `${Math.floor(T / 24) + 1}. gün ${String(Math.floor(T % 24)).padStart(2, '0')}:00`;

// --- Döngü ---
sim.onUpdate((dt) => {
  if (T >= endT) return;
  advance(dt * HOURS_PER_SEC);
});

let statTick = 0;
sim.onRender((rdt) => {
  reconcile();
  drawCells(rdt);
  drugMat.opacity = 0.38 * (m.C / (m.C + 4));
  if (dropAnim >= 0) {
    dropAnim += rdt * 2.2;
    drop.visible = dropAnim < 1;
    drop.position.set(0, AGAR_Y + 4 * (1 - dropAnim * dropAnim), 0);
    if (dropAnim >= 1) { dropAnim = -1; ringAnim = 0; }
  }
  if (ringAnim >= 0) {
    ringAnim += rdt * 0.9;
    const s = 0.3 + ringAnim * (DISH_R - 0.2);
    ring.scale.set(s, s, 1);
    ringMat.opacity = 0.8 * (1 - ringAnim);
    if (ringAnim >= 1) { ringAnim = -1; ringMat.opacity = 0; }
  }
  if (++statTick % 6 === 0) updateStats();
});

function reset() {
  m.p.mu = 10 ** muS.value; m.p.cost = costS.value; m.p.immune = immune.value;
  m.halfLife = halfLife.value;
  m.C = 0;
  m.seed(K * 0.9);
  T = 0; nextDose = T0; courseStart = T0; dosesGiven = 0; lastDoseT = -1; courseNo = 1; endT = END;
  stopAt = earlyStop.value ? T0 + stopDay.value * 24 : Infinity;
  stoppedEarly = earlyStop.value;
  verdict = null; nextChart = 0; lastMic = 1;
  dropAnim = ringAnim = -1; drop.visible = false; ringMat.opacity = 0;
  popChart.clear(); drugChart.clear();
  sim.hud.hide();
  verdictBox.set('');
  cstate.fill(0);
  newColonies();
  reconcile(true);
  pushChart();
  nextChart = 2;
  updateStats();
}
sim.onReset(reset);
reset();
sim.toast('İpucu: “Erken bırak” senaryosunu “Tam tedavi” ile karşılaştır.');

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
