// Kalp Pompası — 4 odacıklı kesit kalp: zamanla değişen elastans modeli, kapaklar, kan akışı, EKG, basınç ve P-V döngüsü.
import { createSim, THREE, clamp, lerp, fmt, mat, procedural } from '@core';
import { darkMedium, halfTube, loftTube, blobGeometry, rbcGeometry, fbm, tissue, wetSSS } from './bio.js';
import { createHeartModel } from './model.js';

const sim = createSim({
  studio: { mood: 'lab', warmth: 0.12, color: 0x1c232b, key: { el: 40, az: 232, power: 1.35 } },
  camera: { position: [-6.1, 2.5, 5.9], target: [0.35, 0.05, -0.7], fov: 44, near: 0.05, far: 200 },
  controls: { minDistance: 3.5, maxDistance: 18, maxPolarAngle: Math.PI * 0.85, minPolarAngle: Math.PI * 0.15 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Kalbin önden kesit görünümü. Ekranın <b>solu hastanın sağıdır</b>: sağ kulakçık ve sağ karıncık solda, sol kalp sağda.
    <b style="color:#60a5fa">Mavi</b> parçacıklar oksijeni azalmış kanı (vena kava → sağ kulakçık → sağ karıncık → pulmoner arter → akciğer),
    <b style="color:#f87171">kırmızı</b> parçacıklar oksijenli kanı (pulmoner venler → sol kulakçık → sol karıncık → aort → vücut) gösterir.</p>
    <p>Her atım üç evreden geçer: <b>atriyal sistol</b> (kulakçıklar kasılıp karıncıkları doldurur, EKG'de P dalgası),
    <b>ventriküler sistol</b> (karıncıklar kasılır; AV kapaklar kapanır, aort ve pulmoner kapaklar açılır, QRS'den T'ye) ve
    <b>diyastol</b> (karıncıklar gevşer ve dolar).</p>
    <h3>Dene</h3>
    <ul>
      <li>Nabzı 40'tan 180'e çıkar: dolum süresi kısalır, atım hacmi düşer ama debi bir süre artar.</li>
      <li>"Egzersiz" hazır ayarında debinin nasıl 2 katına çıktığını izle.</li>
      <li>Aort darlığını artır: sol karıncık basıncı aorttan çok daha yükseğe çıkar (basınç farkı), P-V döngüsü uzar.</li>
      <li>Mitral yetmezliğinde sistolde kırmızı kanın sol kulakçığa geri kaçtığını ve "ileri" atım hacminin düştüğünü gör.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p>Sol karıncık "zamanla değişen elastans" (P = E(t)·(V − V₀)) ile, atardamarlar Windkessel modeliyle, kapak akışları
    Bernoulli bağıntısıyla (ΔP ≈ 4v²) hesaplanır. Sağ kalp aynı zamanlamayla basitleştirilmiş olarak gösterilir.
    Sayılar eğitim amaçlı yaklaşık değerlerdir; <b>tıbbi tanı veya tedavi için kullanılamaz</b>.</p>`,
});
sim.formatTime = (t) => `${fmt(t, 1)} s`;

const model = createHeartModel();
const M = model.s, P = model.p;

// --- Ortam: tıbbi illüstrasyon stüdyosu — soğuk arduvaz degrade fon, kalbin arkasında yumuşak ışık halesi;
// ana ışık (gölgeli) + önden yumuşak dolgu + arkadan soğuk kontur ışığı (ıslak yüzeylerde parlak kenar) ---
darkMedium(sim, { top: 0x26323e, bottom: 0x040507, glow: 0x3c4c5c, glowDir: [0.45, 0.2, -0.87], tint: 0x1c2630, cloud: 0.45, fog: 0x0b0f14,
  density: 0.01, motes: 0 });
{
  const fill = new THREE.DirectionalLight(0xffeee4, 0.6); fill.position.set(2.5, 3, 9);
  const rim = new THREE.DirectionalLight(0xb4ccff, 1.4); rim.position.set(-3, 4.5, -7);
  const under = new THREE.DirectionalLight(0x9aabc4, 0.35); under.position.set(1, -6, 3);
  for (const l of [fill, rim, under]) { l.castShadow = false; sim.scene.add(l, l.target); }
}
// --- Anatomi masası: kıvrımlı yeşil cerrahi örtü + üstünde emaye diseksiyon tepsisi (kalbin gölgesini alır) ---
{
  const TY = -3.12;
  const dg = new THREE.PlaneGeometry(26, 20, 140, 110).rotateX(-Math.PI / 2);
  const dp = dg.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i), z = dp.getZ(i);
    const edge = Math.min(1, Math.max(0, (Math.hypot(x * 0.8, z) - 4.5) / 6));
    const fold = Math.sin(x * 1.1 + fbm(x * 0.2, z * 0.2, 1) * 4) * 0.12 + Math.sin(z * 0.7 + x * 0.3) * 0.08;
    dp.setY(i, TY - 0.08 + (fold + fbm(x * 0.35, z * 0.35, 7, 3) * 0.35) * (0.15 + edge) - edge * edge * 1.2);
  }
  dg.computeVertexNormals();
  const drapeM = mat.fabric({ color: 0x1c4543, scale: 0.6 });
  drapeM.sheen = 0.35;
  const drape = new THREE.Mesh(dg, drapeM);
  drape.position.set(0.4, 0, -0.8); drape.receiveShadow = true; drape.userData.noFit = true; drape.userData.noCast = true;
  sim.scene.add(drape);
  // Tepsi: yuvarlatılmış dikdörtgen taban + pahlı kenar (profil ekstrüzyonu)
  const W = 7.4, D = 5.4, R = 0.45, rr = (w, d, r) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2 + r, -d / 2); sh.lineTo(w / 2 - r, -d / 2); sh.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    sh.lineTo(w / 2, d / 2 - r); sh.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2); sh.lineTo(-w / 2 + r, d / 2);
    sh.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r); sh.lineTo(-w / 2, -d / 2 + r); sh.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    return sh;
  };
  // Emaye diseksiyon tepsisi (beyaz emaye, parlak)
  const enamel = mat.ceramic({ color: 0xe4e2dc, scale: 0.5 });
  const base = new THREE.Mesh(new THREE.ExtrudeGeometry(rr(W, D, R), { depth: 0.04, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.02, bevelSegments: 3, curveSegments: 10 }).rotateX(-Math.PI / 2), enamel);
  const rimShape = rr(W + 0.3, D + 0.3, R + 0.15); rimShape.holes.push(rr(W - 0.05, D - 0.05, R));
  const rimG = new THREE.ExtrudeGeometry(rimShape, { depth: 0.2, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 4, curveSegments: 10 }).rotateX(-Math.PI / 2);
  const rimM = new THREE.Mesh(rimG, enamel);
  const tray = new THREE.Group();
  tray.add(base, rimM);
  tray.position.set(0.45, TY, -0.8);
  tray.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.userData.noFit = true; o.userData.noCast = true; } });
  sim.scene.add(tray);
}

// --- Odacıklar ---
const H = new THREE.Group();
sim.scene.add(H);
const CH = {
  RA: { name: 'Sağ kulakçık', pivot: [-0.8, 0.2], rot: 0.35, rx: 0.72, ry: 0.78, dir: 1, wall: 0.9, side: 'R', z: 0.0,
    info: 'Vücuttan dönen oksijeni azalmış kanı üst ve alt ana toplardamardan (vena kava) toplar. Ortalama basınç yaklaşık 2–8 mmHg. Kalbin doğal pili olan SA düğümü buradadır.' },
  RV: { name: 'Sağ karıncık', pivot: [-0.8, 0.2], rot: 0.22, rx: 0.8, ry: 1.1, dir: -1, wall: 0.88, side: 'R', z: 0.01,
    info: 'Kanı pulmoner artere, yani akciğerlere pompalar. Sistolik basıncı yalnızca ~15–30 mmHg olduğu için duvarı incedir.' },
  LA: { name: 'Sol kulakçık', pivot: [0.78, 0.38], rot: -0.3, rx: 0.68, ry: 0.58, dir: 1, wall: 0.88, side: 'L', z: 0.0,
    info: 'Akciğerden pulmoner venlerle gelen oksijenli kanı toplar. Ortalama basınç ~4–12 mmHg. Yükselirse akciğerde sıvı birikebilir.' },
  LV: { name: 'Sol karıncık', pivot: [0.78, 0.38], rot: 0.28, rx: 0.82, ry: 1.35, dir: -1, wall: 0.6, side: 'L', z: 0.02,
    info: 'Kanı aort yoluyla tüm vücuda pompalar. Sistolik basıncı ~100–140 mmHg; bu yüzden duvarı en kalın odacıktır.' },
};
const KEYS = ['RA', 'RV', 'LA', 'LV'];
// Odacık yerel noktası (x, y) → kalp düzlemi (pivot etrafında rot kadar döndürülmüş, s ölçekli)
const toPlane = (c, x, y, s = 1) => {
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  return [c.pivot[0] + (x * cs - y * sn) * s, c.pivot[1] + (x * sn + y * cs) * s];
};
// Kesit yüzeyinin işaretli uzaklık alanı (SDF): dış kontur = odacık elipslerinin yumuşak birleşimi; boşluklar = odacık
// içleri + kapak ağızları + çıkış yolları. Aynı fonksiyon GLSL'de (kesit yüzü) ve JS'te (arka gövde) kullanılır.
const sdE = (q, e, a) => { const dx = q[0] - e[0], dy = q[1] - e[1], c = Math.cos(a), s = Math.sin(a); const lx = c * dx + s * dy, ly = -s * dx + c * dy; return (Math.hypot(lx / e[2], ly / e[3]) - 1) * Math.min(e[2], e[3]); };
const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return lerp(b, a, h) - k * h * (1 - h); };
const f3 = (v) => v.toFixed(4);
// dış kontur: taban (kulakçıklar) + karıncıkları saran, sola-aşağı (hastanın solu) apekse daralan konik zarf + odacıklar
const OUT_E = [[0.1, 0.0, 1.75, 1.45, 0.3], [0.85, -1.75, 0.75, 0.7, 0.3], [0.3, -0.8, 1.35, 1.8, 0.4], ...KEYS.map((k) => { const c = CH[k], m = toPlane(c, 0, c.dir * c.ry); return [m[0], m[1], c.rx + 0.15, c.ry + 0.1, c.rot]; })];
const outline = (q) => OUT_E.reduce((d, e, i) => { const v = sdE(q, e, e[4]); return i ? smin(d, v, 0.5) : v; }, 0);
const outlineGLSL = OUT_E.reduce((s, e, i) => { const v = `sdE(q, vec4(${f3(e[0])}, ${f3(e[1])}, ${f3(e[2])}, ${f3(e[3])}), ${f3(e[4])})`; return i ? `smin(${s}, ${v}, 0.5)` : v; }, '');
const nodeP = (k, a, b) => { const c = CH[k]; return toPlane(c, a * c.rx * c.wall, c.dir * c.ry + b * c.ry * c.wall); };
const EXTRA = [ // [ax, ay, bx, by, r] kapsül boşluklar
  [...toPlane(CH.RA, 0, 0.22), ...toPlane(CH.RV, 0, -0.26), 0.17], // triküspit ağzı
  [...toPlane(CH.LA, 0, 0.2), ...toPlane(CH.LV, 0, -0.28), 0.17],  // mitral ağzı
  [...nodeP('RV', 0.55, 0.3), -0.25, 0.5, 0.15],                  // sağ karıncık çıkış yolu → pulmoner kapak
  [...nodeP('LV', -0.62, 0.7), 0.35, 0.45, 0.17],                 // sol karıncık çıkış yolu → aort kapağı
  [0.35, 0.45, 0.24, 1.9, 0.19],                                   // çıkan aort
];
const extraGLSL = EXTRA.map((e) => `sdSeg(q, vec2(${f3(e[0])}, ${f3(e[1])}), vec2(${f3(e[2])}, ${f3(e[3])}), ${f3(e[4])})`).reduce((s, v) => (s ? `min(${s}, ${v})` : v), '');

// Kesit yüzü: miyokard kesiti (lif dokusu), odacık kenarında parlak endokard, dış kenarda epikard yağ tabakası
const cavU = { uC0: { value: new THREE.Vector4() }, uC1: { value: new THREE.Vector4() }, uC2: { value: new THREE.Vector4() }, uC3: { value: new THREE.Vector4() }, uRot: { value: new THREE.Vector4(...KEYS.map((k) => CH[k].rot)) } };
const cutMat = procedural({
  key: 'kalp-kesit', physical: true, bump: 0.06,
  params: { color: 0xffffff, roughness: 0.62, clearcoat: 0.3, clearcoatRoughness: 0.35, sheen: 0.1, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xff7a6a), side: THREE.DoubleSide },
  uniforms: cavU,
  pattern: `
    vec2 q = p.xy;
    float o = ${outlineGLSL};
    float cav = min(min(sdE(q, uC0, uRot.x), sdE(q, uC1, uRot.y)), min(sdE(q, uC2, uRot.z), sdE(q, uC3, uRot.w)));
    cav = smin(cav, ${extraGLSL}, 0.08);
    if (o > 0.0 || cav < 0.0) discard;
    float e = min(-o, cav);
    // Kas lifleri: sol karıncık etrafında dairesel, diğer yerlerde gürültüyle bükülmüş
    vec2 lv = q - vec2(1.15, -0.92);
    float ang = atan(lv.y, lv.x), rad = length(lv);
    float warp = fbm3(vec3(q*1.7, 3.0), 4);
    float fib = vn3(vec3(rad*34.0 + warp*6.0, ang*3.0, 1.0))*0.6 + vn3(vec3(q*vec2(9.0, 26.0) + warp*4.0, 7.0))*0.4;
    float blot = fbm3(vec3(q*3.0, 11.0), 4);
    float lay = clamp(-o/0.45, 0.0, 1.0), lay2 = 1.0 - smoothstep(0.0, 0.16, cav);
    // Kaba kesit dokusu: kas demetleri (fasikül) arasında açık renkli ince bağ doku (perimisyum), pıhtılaşmış kan benekleri
    float fas = cells3(vec3(q*vec2(11.0, 7.0) + warp*2.5, 3.0)), fas2 = cells3(vec3(q*26.0 + warp*3.0, 9.0));
    float peri = 1.0 - smoothstep(0.04, 0.14, fas);
    float grain = vn3(vec3(q*85.0, 5.0));
    vec3 myo = mix(vec3(0.12, 0.022, 0.018), vec3(0.17, 0.014, 0.016), smoothstep(0.1, 0.6, lay));
    myo = mix(myo, vec3(0.21, 0.035, 0.03), lay2*0.6);
    myo = mix(myo, myo*vec3(1.2, 0.75, 0.85), blot)*(0.62 + 0.55*fib)*(0.82 + 0.3*fas2)*(0.9 + 0.2*grain);
    myo *= 0.72;
    myo = mix(myo, vec3(0.2, 0.07, 0.06), peri*0.4);
    myo = mix(myo, vec3(0.05, 0.006, 0.008), smoothstep(0.72, 0.9, fbm3(vec3(q*9.0, 17.0), 3))*0.5);
    float cor = smoothstep(0.93, 0.97, vn3(vec3(q*7.0, 21.0)))*(1.0 - smoothstep(0.1, 0.3, -o));
    vec3 endo = vec3(0.52, 0.2, 0.18);
    vec3 fat = vec3(0.52, 0.34, 0.11)*(0.8 + 0.35*cells3(vec3(q*40.0, 2.0)));
    float nEndo = 1.0 - smoothstep(0.0, 0.022, cav);
    float fatW = 0.004 + 0.075*smoothstep(0.55, 0.8, fbm3(vec3(q*2.2, 5.0), 3)) + 0.04*smoothstep(1.3, 1.9, q.y);
    float nFat = 1.0 - smoothstep(fatW*0.7, fatW, -o);
    col = mix(myo, endo, nEndo*0.8);
    col = mix(col, fat, nFat);
    col = mix(col, vec3(0.05, 0.004, 0.006), cor);
    rough = mix(0.66 - 0.18*fib - 0.12*peri, 0.3, nEndo);
    rough = mix(rough, 0.35, nFat);
    h = smoothstep(0.0, 0.08, e)*0.6 + fib*0.45 + blot*0.3 + fas*0.5 + grain*0.12 - peri*0.25 + nFat*0.2*cells3(vec3(q*40.0, 2.0));`,
});
wetSSS(cutMat, { color: 0xb82418, wrap: 0.3, strength: 0.16, rim: 0.03 });
// procedural() desenine SDF yardımcılarını ekle
{
  const base = cutMat.onBeforeCompile;
  cutMat.onBeforeCompile = (sh) => {
    base(sh);
    sh.fragmentShader = sh.fragmentShader.replace('vec3 pCol; float pRough', `
      float sdE(vec2 q, vec4 e, float a){ vec2 d = q - e.xy; float c = cos(a), s = sin(a); d = vec2(c*d.x + s*d.y, -s*d.x + c*d.y); return (length(d/e.zw) - 1.0)*min(e.z, e.w); }
      float sdSeg(vec2 q, vec2 a, vec2 b, float r){ vec2 pa = q - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0); return length(pa - ba*h) - r; }
      float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5*(b - a)/k, 0.0, 1.0); return mix(b, a, h) - k*h*(1.0 - h); }
      vec3 pCol; float pRough`);
  };
}
const cut = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 6.0, 1, 1).translate(0.05, -0.3, 0), cutMat);
cut.userData.noCast = true; cut.userData.noAO = true;
H.add(cut);

// Arka gövde: dış konturdan geriye doğru kubbe; epikard (kas + yağ + koroner damarlar)
let bodyMesh = null;
const C0 = [0.05, -0.3], NT = 160, NU = 36, DEPTH = 1.95;
// Konik form: ön-arka kalınlık tabandan (kulakçıklar) tepeye (apeks) doğru azalır
const taperZ = (y) => { const t = clamp((y + 2.6) / 3.1, 0, 1); return 0.38 + 0.62 * t * t * (3 - 2 * t); };
const Rth = [];
for (let i = 0; i <= NT; i++) {
  const a = (i / NT) * Math.PI * 2, d = [Math.cos(a), Math.sin(a)];
  let r = 4;
  while (r > 0.2 && outline([C0[0] + d[0] * r, C0[1] + d[1] * r]) > 0) r -= 0.004;
  Rth.push(r);
}
const epiMat = procedural({
  key: 'kalp-epikard', physical: true, bump: 0.04,
  params: { color: 0xffffff, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.07, sheen: 0.3, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xff9a88), side: THREE.DoubleSide },
  pattern: `
    float n = fbm3(p*1.8 + 3.0, 5);
    // Yağ: AV oluğu (kulakçık–karıncık sınırı) ve karıncıklar arası oluk boyunca, kulakçık tabanında; loblu
    float groove = exp(-pow((p.y - 0.3 - 0.18*sin(p.x*1.4))/0.32, 2.0)) + 0.8*exp(-pow((p.x - 0.28 + 0.22*p.y)/0.22, 2.0))*smoothstep(0.6, -0.6, p.y);
    float fat = smoothstep(0.62, 0.8, fbm3(p*1.1 + vec3(4.0), 4)*0.8 + groove*0.45 + 0.08*p.y);
    float lob = cells3(p*16.0);
    // Kas lifleri: epikardın altından seçilen eğik (sarmal) lif yönü
    float fibre = vn3(vec3((p.x*0.8 + p.y*0.6)*38.0, (p.y - p.x*0.3)*4.0, p.z*4.0));
    // Kılcal ağ: iki ölçekte ince dallanan damarcıklar (koyu kırmızı-mor) + seyrek büyük dallar
    float v = pow(ridge3(p*1.1 + n*0.9), 16.0), v2 = pow(ridge3(p*2.4 + n*1.3 + 7.0), 20.0);
    float cap = pow(ridge3(p*7.5 + n*2.0 + 3.0), 22.0), cap2 = pow(ridge3(p*15.0 + n*2.5 + 11.0), 26.0);
    float m2 = fbm3(p*0.7 + 9.0, 3);
    vec3 muscle = mix(vec3(0.26, 0.045, 0.045), vec3(0.17, 0.028, 0.045), smoothstep(0.35, 0.7, m2))*(0.82 + 0.4*n)*(0.93 + 0.12*fibre);
    muscle = mix(muscle, vec3(0.36, 0.1, 0.09), smoothstep(0.62, 0.8, fbm3(p*2.6 + 1.0, 3))*0.4);
    vec3 fatc = mix(vec3(0.62, 0.42, 0.13), vec3(0.74, 0.56, 0.24), lob)*(0.85 + 0.25*vn3(p*14.0));
    col = mix(muscle, fatc, fat);
    col = mix(col, vec3(0.3, 0.02, 0.035), clamp(v + v2*0.7, 0.0, 1.0)*0.8);
    col = mix(col, col*vec3(0.62, 0.35, 0.45), clamp(cap + cap2*0.8, 0.0, 1.0)*(1.0 - fat*0.5));
    rough = mix(0.3 + 0.08*fibre, 0.42, fat);
    h = n*0.4 + fat*0.3 + (v + v2*0.6)*0.55 + (cap + cap2)*0.12 + fibre*0.08 + fat*0.35*smoothstep(0.0, 0.5, lob);`,
});
wetSSS(epiMat, { color: 0xe8402c, wrap: 0.5, strength: 0.42, rim: 0.2 });
{
  const pos = [], idx = [];
  for (let u = 0; u <= NU; u++) {
    const w = u / NU, k = Math.pow(Math.cos(w * Math.PI / 2), 0.8) * (1 + 0.16 * Math.sin(w * Math.PI));
    for (let i = 0; i <= NT; i++) {
      const a = (i / NT) * Math.PI * 2, r = Rth[i] * k;
      const x = C0[0] + Math.cos(a) * r, y = C0[1] + Math.sin(a) * r, z = -DEPTH * Math.sin(w * Math.PI / 2) * taperZ(y);
      const b = 1 + 0.035 * fbm(x * 1.3, y * 1.3, z * 1.3) * Math.min(1, w * 6);
      pos.push(C0[0] + (x - C0[0]) * b, C0[1] + (y - C0[1]) * b, z * (1 + 0.05 * fbm(x, y, 4)));
    }
  }
  for (let u = 0; u < NU; u++) for (let i = 0; i < NT; i++) {
    const a = u * (NT + 1) + i, b = a + 1, c = a + NT + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const body = new THREE.Mesh(g, epiMat);
  body.userData.info = { name: 'Kalp duvarı (miyokard + epikard)', info: 'Kalbin dış yüzeyi ince bir zarla (epikard) ve yağ dokusuyla örtülüdür; yüzeydeki koroner damarlar kalp kasının kendisini besler. Kesit yüzünde görülen kalın kırmızı tabaka kalp kasıdır (miyokard).' };
  H.add(body);
  bodyMesh = body;
}


// Odacık iç yüzeyi (endokard): trabeküllü, ıslak, koyu kırmızı yarım elipsoit; hacimle ölçeklenir
const endoMat = () => {
  const m = procedural({
    key: 'kalp-endo', physical: true, bump: 0.05,
    params: { color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide },
    pattern: `
      float n = fbm3(p*2.5, 4), tr = pow(ridge3(vec3(p.x*3.0, p.y*1.2, p.z*3.0) + n), 5.0);
      col = vec3(0.3, 0.03, 0.034)*(0.75 + 0.5*n) + vec3(0.16, 0.035, 0.03)*tr;
      rough = 0.24 + 0.2*n;
      h = tr*0.8 + n*0.3;`,
  });
  return wetSSS(m, { color: 0xd83424, wrap: 0.3, strength: 0.3, rim: 0.06 });
};
const clickables = [bodyMesh];
for (const k of KEYS) {
  const c = CH[k];
  c.g = new THREE.Group();
  c.g.position.set(c.pivot[0], c.pivot[1], 0);
  c.g.rotation.z = c.rot;
  H.add(c.g);
  c.inner = new THREE.Group();
  c.g.add(c.inner);
  const cy = c.dir * c.ry, rz = Math.min(c.rx, c.ry) * (c.side === 'L' && c.dir < 0 ? 0.72 : 0.78);
  c.rz = rz;
  c.mat = endoMat();
  const sg = new THREE.SphereGeometry(1, 56, 28, Math.PI, Math.PI);
  const sp = sg.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < sp.count; i++) {
    v.fromBufferAttribute(sp, i);
    const depth = Math.min(1, -v.z * 3); // kenarda 0 → kontur kesitle aynı kalır
    const tr = 1 - depth * (c.dir < 0 ? 0.1 : 0.05) * Math.abs(fbm(v.x * 5 + k.length, v.y * 2.2, v.z * 5, 2)) * 2.2;
    sp.setXYZ(i, v.x * c.rx * c.wall * tr, v.y * c.ry * c.wall * tr, v.z * rz * tr);
  }
  sg.computeVertexNormals();
  const shell = new THREE.Mesh(sg, c.mat);
  shell.position.set(0, cy, 0);
  c.inner.add(shell);
  shell.userData.info = { name: c.name, info: c.info };
  clickables.push(shell);
  c.center = new THREE.Vector3(0, cy, 0);
}
// Kapak ağızları ve çıkış yolları: kesitin arkasında yarım tüp kanallar
for (const e of EXTRA) {
  const a = new THREE.Vector3(e[0], e[1], 0), b = new THREE.Vector3(e[2], e[3], 0);
  const dir = b.clone().sub(a).normalize();
  const curve = new THREE.LineCurve3(a.clone().addScaledVector(dir, -0.15), b.clone().addScaledVector(dir, 0.15));
  const ch = new THREE.Mesh(halfTube(curve, () => e[4] * 1.05, { segs: 6, radial: 16, thick: 0.25 }), endoMat());
  H.add(ch);
}
// Bölme (septum) tıklanabilir bilgi: kesit yüzü
cut.userData.info = { name: 'Karıncıklar arası bölme (septum) ve kalp kası', info: 'Sağ ve sol karıncığı ayıran kas duvarıdır; oksijenli ve oksijensiz kanın karışmasını önler. Uyarıyı ileten His demeti ve dalları buradan geçer. Sol karıncık duvarı, yüksek basınçla çalıştığı için sağdakinden yaklaşık üç kat kalındır.' };
clickables.push(cut);

// --- Damarlar: önü kesilmiş (yarım) tüpler, et kalınlığı görünür; içinden akan kan hücreleri izlenir ---
const V3 = (a) => new THREE.Vector3(...a);
// Damar duvarı: ıslak, parlak adventisya; ince uzunlamasına lifler ve duvarı besleyen kılcal ağ (vasa vasorum)
function vesselMat(color, sss = 0xff5a40) {
  const m = procedural({
    key: 'kalp-damar', physical: true, bump: 0.025,
    params: { color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.45, sheenRoughness: 0.4, sheenColor: new THREE.Color(0xffd0c4), side: THREE.DoubleSide },
    pattern: `
      float n = fbm3(p*1.9 + seed*3.0, 4);
      float fine = fbm3(p*18.0, 2);
      float vv = pow(ridge3(p*2.4 + n*1.3), 20.0), vv2 = pow(ridge3(p*5.1 + n*0.8 + 3.0), 26.0);
      float cap = pow(ridge3(p*11.0 + n*2.0 + 5.0), 24.0);
      col *= 0.8 + 0.3*n + 0.08*(fine - 0.5);
      col = mix(col, vec3(0.42, 0.035, 0.045), clamp(vv*0.6 + vv2*0.4 + cap*0.35, 0.0, 1.0));
      col = mix(col, col*vec3(1.1, 0.95, 0.8) + vec3(0.04, 0.03, 0.02), smoothstep(0.55, 0.75, fbm3(p*3.0 + 5.0, 3))*0.4);   // adventisya bağ dokusu
      rough = 0.22 + 0.16*n + 0.06*fine;
      h = n*0.3 + fine*0.12 + (vv + vv2)*0.3 + cap*0.1;`,
  });
  m.shadowSide = THREE.BackSide;   // çift yüzlü ince duvarda gölge sivilcesi (acne) olmasın
  return wetSSS(m, { color: sss, wrap: 0.35, strength: 0.28, rim: 0.1 });
}
// Damar ekseni: uçlar sabit, aradaki noktalar hafif kıvrım alır; yarıçap boyunca kök genişlemesi ve düzensiz daralma
let vSeed = 1;
function wavyCurve(pts, amp) {
  const base = new THREE.CatmullRomCurve3(pts.map(V3)), n = Math.max(6, pts.length * 3), out = [], s = vSeed++ * 1.37;
  const T = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const t = i / n, P = base.getPointAt(t);
    base.getTangentAt(t, T);
    A.crossVectors(T, new THREE.Vector3(0, 0, 1)); if (A.lengthSq() < 1e-4) A.set(1, 0, 0); A.normalize();
    B.crossVectors(T, A).normalize();
    const w = Math.sin(Math.PI * t) * amp;
    P.addScaledVector(A, w * Math.sin(t * 7.3 + s)).addScaledVector(B, w * 0.6 * Math.cos(t * 5.1 + s * 2));
    out.push(P);
  }
  return new THREE.CatmullRomCurve3(out);
}
function vessel(pts, r, color, name, info, taper = 0.9, root = 0) {
  const curve = wavyCurve(pts, r * 0.35), ph = vSeed * 2.1;
  const m = vesselMat(color);
  const rad = (t) => r * lerp(1, taper, t) * (1 + 0.05 * Math.sin(t * 6.3 + ph) + 0.03 * Math.sin(t * 17 + ph * 3)) * (1 + root * Math.exp(-(((t - 0.06) / 0.07) ** 2)));
  const mesh = new THREE.Mesh(halfTube(curve, rad, { segs: 90, radial: 30, thick: 0.16, arc: 1.15 }), m);
  mesh.userData.info = { name, info };
  mesh.userData.noCast = true;   // ince çift yüzlü duvar kendi üstüne gölge sivilcesi (tarama deseni) üretmesin
  clickables.push(mesh);
  H.add(mesh);
  return mesh;
}
const BLUEV = 0x5b5f98, REDV = 0xb8545a;
vessel([[-1.55, 3.2, 0], [-1.5, 2.3, 0.02], [-1.3, 1.6, 0.05]], 0.24, BLUEV, 'Üst ana toplardamar (vena kava superior)', 'Baş, boyun ve kollardan dönen kanı sağ kulakçığa getirir.', 1.05);
vessel([[-1.8, -2.4, -0.75], [-1.65, -0.8, -0.55], [-1.35, 0.4, -0.15]], 0.26, BLUEV, 'Alt ana toplardamar (vena kava inferior)', 'Gövde ve bacaklardan dönen kanı sağ kulakçığa getirir.', 1.05);
vessel([[-0.25, 0.5, 0.25], [-0.12, 1.5, 0.35], [0.25, 2.25, 0.3], [0.9, 2.55, 0.15], [1.7, 2.6, 0.0]], 0.2, 0x6468a4, 'Pulmoner arter (akciğer atardamarı)', 'Sağ karıncıktaki oksijeni azalmış kanı akciğerlere taşır. Atardamar olduğu hâlde oksijensiz kan taşıyan tek büyük damardır.', 0.9, 0.12);
vessel([[0.2, 2.2, 0.25], [-0.35, 2.3, -0.5], [-1.5, 2.42, -0.72]], 0.15, 0x6468a4, 'Pulmoner arter (sağ dal)', 'Sağ akciğere giden daldır.');
const aortaPts = [[0.35, 0.45, -0.1], [0.25, 1.5, -0.1], [0.05, 2.55, -0.2], [0.75, 3.1, -0.65], [1.4, 2.5, -1.35], [1.55, 0.9, -2.05], [1.5, -2.4, -2.15]];
vessel(aortaPts, 0.27, REDV, 'Aort (ana atardamar)', 'Sol karıncıktan çıkan oksijenli kanı tüm vücuda dağıtan en büyük atardamardır. Sistolde gerilir, diyastolde geri yaylanarak kan akışını sürdürür (Windkessel etkisi).', 0.85, 0.16);
vessel([[3.0, 1.35, -0.1], [2.3, 1.2, -0.05], [1.6, 1.05, 0]], 0.13, REDV, 'Pulmoner venler (akciğer toplardamarları)', 'Akciğerde oksijenlenen kanı sol kulakçığa getirir.', 1.1);
vessel([[3.0, 0.7, -0.25], [2.3, 0.8, -0.15], [1.5, 0.85, -0.05]], 0.12, REDV, 'Pulmoner venler (akciğer toplardamarları)', 'Akciğerde oksijenlenen kanı sol kulakçığa getirir.', 1.1);
// Aort kemerinden çıkan dallar (baş-kol, sol şah, sol köprücükaltı)
for (const [x, z, r] of [[0.28, -0.3, 0.1], [0.62, -0.42, 0.085], [0.95, -0.6, 0.085]]) {
  const curve = new THREE.CatmullRomCurve3([V3([x, 2.9 + (x - 0.6) * -0.2, z]), V3([x - 0.05, 3.5, z - 0.05]), V3([x - 0.12, 3.95, z - 0.1])]);
  const m = vesselMat(REDV);
  H.add(new THREE.Mesh(loftTube(curve, (t) => r * (1 - 0.15 * t), { segs: 24, radial: 16, caps: true }), m));
}

// --- Koroner damarlar: epikard yüzeyinde, yağ dolu oluklar içinde seyreden atar (kırmızı) ve toplardamarlar (mor) ---
// Kubbe yüzeyi (x, y yönü + w derinlik oranı) → 3B nokta; arka gövdeyle aynı formül, böylece damarlar yüzeye oturur.
const RthAt = (a) => { const f = ((((a / (Math.PI * 2)) % 1) + 1) % 1) * NT, i = Math.floor(f); return lerp(Rth[i], Rth[Math.min(i + 1, NT)], f - i); };
function domeRaw(a, w) {
  const k = Math.pow(Math.cos(w * Math.PI / 2), 0.8) * (1 + 0.16 * Math.sin(w * Math.PI));
  const r = RthAt(a) * k, x = C0[0] + Math.cos(a) * r, y = C0[1] + Math.sin(a) * r, z = -DEPTH * Math.sin(w * Math.PI / 2) * taperZ(y);
  const b = 1 + 0.035 * fbm(x * 1.3, y * 1.3, z * 1.3) * Math.min(1, w * 6);
  return new THREE.Vector3(C0[0] + (x - C0[0]) * b, C0[1] + (y - C0[1]) * b, z * (1 + 0.05 * fbm(x, y, 4)));
}
function domePt(x, y, w, lift) {
  const a = Math.atan2(y - C0[1], x - C0[0]);
  const P = domeRaw(a, w), da = domeRaw(a + 0.01, w).sub(domeRaw(a - 0.01, w)), dw = domeRaw(a, w + 0.01).sub(domeRaw(a, w - 0.01));
  const n = new THREE.Vector3().crossVectors(da, dw).normalize();
  if (n.dot(new THREE.Vector3(P.x - C0[0], P.y - C0[1], P.z + DEPTH * 0.45)) < 0) n.negate();
  return P.addScaledVector(n, lift);
}
const fatMat = wetSSS(procedural({
  key: 'kalp-yag', physical: true, bump: 0.06,
  params: { color: 0xd9a24a, roughness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.15, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xfff0c0) },
  pattern: `
    float c = cells3(p*22.0), n = fbm3(p*4.0, 3);
    col *= 0.78 + 0.3*n + 0.18*smoothstep(0.0, 0.5, c);
    col = mix(col, vec3(0.5, 0.1, 0.06), pow(ridge3(p*6.0 + n), 18.0)*0.7);
    rough = 0.3 + 0.2*(1.0 - c);
    h = smoothstep(0.0, 0.6, c)*0.8 + n*0.3;`,
}), { color: 0xffc070, strength: 0.6, rim: 0.12 });
const CORA = 0xb8343a, CORV = 0x4a3e86;
function coronary(ctrl, r0, r1, color, name, info, fat = 0) {
  const pc = new THREE.CatmullRomCurve3(ctrl.map((c) => new THREE.Vector3(c[0], c[1], c[2])));
  const N = 48, pts = [], fpts = [];
  for (let i = 0; i <= N; i++) {
    const q = pc.getPoint(i / N), r = lerp(r0, r1, i / N);
    pts.push(domePt(q.x, q.y, q.z, r * 0.75));
    if (fat) fpts.push(domePt(q.x, q.y, q.z, fat * 0.2));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const m = new THREE.Mesh(loftTube(curve, (t) => lerp(r0, r1, t) * (1 + 0.08 * Math.sin(t * 31)), { segs: 96, radial: 12, caps: true, noiseAmp: 0.06, noiseFreq: 9 }), vesselMat(color, color === CORV ? 0x8a60ff : 0xff5040));
  m.userData.info = { name, info };
  clickables.push(m); H.add(m);
  if (fat) {
    const fm = new THREE.Mesh(loftTube(new THREE.CatmullRomCurve3(fpts), (t) => fat * (0.75 + 0.35 * Math.sin(t * 7 + ctrl.length)) * (1 - 0.35 * t), { segs: 80, radial: 14, caps: true, noiseAmp: 0.22, noiseFreq: 7 }), fatMat);
    fm.userData.info = { name: 'Epikardiyal yağ dokusu', info: 'Koroner damarlar kalp yüzeyindeki oluklarda yağ dokusuyla çevrilidir; yağ damarları mekanik olarak korur ve kalbe enerji deposu sağlar.' };
    clickables.push(fm); H.add(fm);
  }
}
const RCA_INFO = 'Aort kökünden çıkar, sağ kulakçık ile sağ karıncık arasındaki olukta (AV oluğu) kalbin sağ kenarını dolanır. Sağ kalbi, çoğu insanda SA ve AV düğümlerini de besler. Tıkanırsa alt duvar kalp krizi olur.';
const LCX_INFO = 'Sol ana koroner arterin dalıdır; sol AV oluğunda kalbin sol kenarını dolanır ve sol karıncığın yan duvarını besler.';
const CV_INFO = 'Kalp kasından dönen kanı toplayan toplardamarlar; arka yüzde koroner sinüste birleşip sağ kulakçığa açılır.';
coronary([[-0.35, 1.3, 0.16], [-1.0, 1.0, 0.26], [-1.62, 0.35, 0.34], [-1.66, 0.15, 0.62], [-1.2, 0.05, 0.92]], 0.05, 0.034, CORA, 'Sağ koroner arter', RCA_INFO, 0.11);
coronary([[-1.64, 0.3, 0.36], [-1.78, -0.5, 0.34], [-1.5, -1.35, 0.36], [-0.95, -1.9, 0.42], [-0.35, -2.05, 0.5]], 0.032, 0.018, CORA, 'Sağ koroner arter — akut kenar dalı', RCA_INFO, 0.07);
coronary([[-1.2, 1.05, 0.33], [-1.72, 0.25, 0.44], [-1.75, -0.4, 0.46], [-1.45, -1.25, 0.48]], 0.03, 0.02, CORV, 'Küçük kalp toplardamarı', CV_INFO);
coronary([[0.95, 1.35, 0.2], [1.75, 0.95, 0.3], [2.12, 0.35, 0.38], [2.05, 0.2, 0.66], [1.5, 0.1, 0.94]], 0.046, 0.03, CORA, 'Sirkumfleks arter', LCX_INFO, 0.1);
coronary([[2.08, 0.45, 0.4], [2.2, -0.4, 0.4], [1.95, -1.35, 0.42], [1.35, -2.05, 0.46], [0.75, -2.3, 0.55]], 0.03, 0.017, CORA, 'Sirkumfleks arter — sol kenar dalı', LCX_INFO, 0.06);
coronary([[1.3, -0.1, 0.34], [1.55, -0.9, 0.36], [1.2, -1.75, 0.4]], 0.022, 0.014, CORA, 'Sirkumfleks arter — dal', LCX_INFO);
coronary([[0.85, 1.22, 0.3], [1.72, 0.78, 0.4], [2.02, 0.22, 0.52], [1.9, 0.1, 0.75], [1.1, 0.0, 0.96]], 0.045, 0.06, CORV, 'Büyük kalp toplardamarı → koroner sinüs', CV_INFO);
coronary([[2.15, 0.1, 0.46], [2.05, -0.8, 0.48], [1.7, -1.6, 0.5]], 0.028, 0.018, CORV, 'Sol kenar toplardamarı', CV_INFO);

// --- Kapaklar: kıvrık, yarı saydam yaprakçıklar + lifli halka ---
const VALVES = {
  TV: { name: 'Triküspit kapak', pos: [-0.8, 0.2, -0.05], dir: null, from: 'RA', to: 'RV', w: 0.62, info: 'Sağ kulakçık ile sağ karıncık arasındaki üç yaprakçıklı kapaktır. Sistolde kapanarak kanın geri kaçmasını önler.' },
  MV: { name: 'Mitral kapak', pos: [0.78, 0.38, -0.05], dir: null, from: 'LA', to: 'LV', w: 0.6, info: 'Sol kulakçık ile sol karıncık arasındaki iki yaprakçıklı kapaktır. Yetmezliğinde sistolde kan sol kulakçığa geri kaçar.' },
  PV: { name: 'Pulmoner kapak', pos: [-0.25, 0.5, 0.2], dir: [0.12, 1, 0.1], w: 0.4, info: 'Sağ karıncık ile pulmoner arter arasındaki yarım ay kapaktır.' },
  AV: { name: 'Aort kapağı', pos: [0.35, 0.45, -0.1], dir: [-0.1, 1, 0], w: 0.5, info: 'Sol karıncık ile aort arasındaki yarım ay kapaktır. Darlığında (aort stenozu) karıncık kanı dar bir delikten itmek için çok yüksek basınç üretmek zorunda kalır.' },
};
// Yaprakçık: x ∈ [0, 1] (menteşe → serbest kenar), çukur yüzey, serbest kenarı yuvarlatılmış
const leafGeo = (() => {
  const NUx = 14, NV = 12, pos = [], idx = [];
  for (let i = 0; i <= NUx; i++) for (let j = 0; j <= NV; j++) {
    const u = i / NUx, v = (j / NV) * 2 - 1;
    const wz = 0.14 * (1 - 0.45 * u * u) * Math.sqrt(1 - 0.2 * u);
    pos.push(u, 0.07 * (1 - v * v) * Math.sin(u * Math.PI * 0.9), v * wz);
  }
  for (let i = 0; i < NUx; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + 1, c = a + NV + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
})();
const annulusMat = tissue({ color: 0xc89478, veins: 0.1, scale: 3 });
annulusMat.clearcoat = 0.8; annulusMat.clearcoatRoughness = 0.2;
for (const v of Object.values(VALVES)) {
  v.g = new THREE.Group();
  v.g.position.fromArray(v.pos);
  H.add(v.g);
  v.mat = tissue({ color: 0xf3e3c8, veins: 0.12, scale: 4 });
  v.mat.side = THREE.DoubleSide; v.mat.clearcoat = 1; v.mat.clearcoatRoughness = 0.1; v.mat.sheen = 1;
  wetSSS(v.mat, { color: 0xffb08a, strength: 0.5, rim: 0.12 });
  v.l = new THREE.Group(); v.r = new THREE.Group();
  v.l.position.x = -v.w / 2; v.r.position.x = v.w / 2;
  v.lm = new THREE.Mesh(leafGeo, v.mat); v.rm = new THREE.Mesh(leafGeo, v.mat);
  v.lm.scale.x = v.w / 2; v.rm.scale.x = -v.w / 2;
  v.l.add(v.lm); v.r.add(v.rm);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(v.w / 2, 0.028, 12, 40), annulusMat);
  ring.rotation.x = Math.PI / 2;
  v.g.add(v.l, v.r, ring);
  v.open = 0;
  for (const m of [v.lm, v.rm, ring]) { m.userData.info = { name: v.name, info: v.info }; clickables.push(m); }
}

// Uyarı iletim sistemi: SA ve AV düğümü (atımda parlayan düğümcükler)
const saNode = new THREE.Mesh(blobGeometry(0.085, { detail: 6, amp: 0.2, stretch: [1.4, 0.8, 0.8] }), mat.glow({ color: 0xffd65a, intensity: 1 }));
saNode.position.set(-1.28, 1.52, 0.02);
const avNode = new THREE.Mesh(blobGeometry(0.075, { detail: 6, amp: 0.2, seed: 2, stretch: [1.3, 0.8, 0.8] }), mat.glow({ color: 0xffd65a, intensity: 1 }));
avNode.position.set(-0.28, 0.12, 0.02);
H.add(saNode, avNode);
saNode.userData.info = { name: 'SA düğümü (sinüs düğümü)', info: 'Kalbin doğal pilidir. Her atımı başlatan elektrik uyarısını üretir (EKG\'de P dalgası). Dinlenmede dakikada 60–100 uyarı çıkarır.' };
avNode.userData.info = { name: 'AV düğümü', info: 'Uyarıyı kısa bir süre (~0,1 s) geciktirerek kulakçıkların karıncıklardan önce kasılmasını sağlar (EKG\'de PR aralığı).' };
clickables.push(saNode, avNode);

// --- Etiketler ---
const labels = [];
const L = (t, pos, cls = 'plain') => { const l = sim.label(t, { parent: H, position: pos, className: cls }); labels.push(l); return l; };
L('Sağ kulakçık', [-1.35, 1.05, 0.4]); L('Sağ karıncık', [-0.6, -1.0, 0.4]);
L('Sol kulakçık', [1.2, 1.05, 0.4]); L('Sol karıncık', [1.2, -1.0, 0.4]);
L('Aort', [0.55, 3.35, -0.5]); L('Pulmoner arter', [1.25, 2.9, 0.1]); L('Vena kava', [-1.95, 3.1, 0]);
L('Pulmoner venler', [2.8, 1.65, 0]);
const vlabels = [L('Triküspit', [-1.2, 0.1, 0.35]), L('Mitral', [1.22, 0.3, 0.35]), L('Pulmoner k.', [-0.75, 0.62, 0.35]), L('Aort k.', [0.52, 0.72, 0.1])];
vlabels.forEach((l) => (l.el.style.fontSize = '10.5px', l.el.style.color = '#fde68a'));
const phaseLbl = sim.label('', { parent: H, position: [0.3, -2.95, 0], className: 'big' });

// --- Kan parçacıkları ---
// Düğüm: {w:[x,y,z]} dünya ya da {c:'LV', a, b} odacık içi (birim elips koordinatı); sp = yanal saçılma.
const RIGHT_PRE = [
  [{ w: [-1.55, 3.1, 0], sp: 0.1 }, { w: [-1.45, 2.1, 0.02], sp: 0.12 }],
  [{ w: [-1.8, -2.3, -0.7], sp: 0.12 }, { w: [-1.6, -0.6, -0.5], sp: 0.14 }],
];
const RIGHT_MAIN = [{ c: 'RA', a: -0.1, b: 0.25, sp: 0.42 }, { c: 'RA', a: 0.05, b: -0.5, sp: 0.3 }, { w: VALVES.TV.pos, sp: 0.06, gate: 'AV' },
  { c: 'RV', a: 0, b: 0.45, sp: 0.36 }, { c: 'RV', a: 0.05, b: -0.45, sp: 0.4 }, { c: 'RV', a: 0.55, b: 0.3, sp: 0.2 }, { w: VALVES.PV.pos, sp: 0.05, gate: 'SL' },
  { w: [-0.12, 1.5, 0.35], sp: 0.1 }, { w: [0.25, 2.2, 0.3], sp: 0.1 }];
const RIGHT_POST = [[{ w: [0.9, 2.53, 0.15], sp: 0.08 }, { w: [1.65, 2.6, 0.0], sp: 0.08 }], [{ w: [-0.35, 2.3, -0.5], sp: 0.07 }, { w: [-1.45, 2.42, -0.7], sp: 0.07 }]];
const LEFT_PRE = [[{ w: [2.95, 1.35, -0.1], sp: 0.06 }, { w: [2.0, 1.12, -0.03], sp: 0.07 }], [{ w: [2.95, 0.7, -0.25], sp: 0.06 }, { w: [2.0, 0.8, -0.1], sp: 0.07 }]];
const LEFT_MAIN = [{ c: 'LA', a: 0.1, b: 0.15, sp: 0.38 }, { c: 'LA', a: -0.05, b: -0.5, sp: 0.25 }, { w: VALVES.MV.pos, sp: 0.06, gate: 'AV' },
  { c: 'LV', a: 0.1, b: 0.45, sp: 0.32 }, { c: 'LV', a: 0.05, b: -0.5, sp: 0.36 }, { c: 'LV', a: -0.45, b: 0.1, sp: 0.25 }, { c: 'LV', a: -0.62, b: 0.7, sp: 0.12 },
  { w: VALVES.AV.pos, sp: 0.06, gate: 'SL' }, { w: [0.25, 1.5, -0.1], sp: 0.15 }, { w: [0.05, 2.55, -0.2], sp: 0.15 }, { w: [0.75, 3.1, -0.65], sp: 0.15 },
  { w: [1.4, 2.5, -1.35], sp: 0.15 }, { w: [1.55, 0.9, -2.05], sp: 0.15 }];
function makePaths(pres, main, posts) {
  const out = [];
  for (const a of pres) for (const b of posts) out.push([...a, ...main, ...b]);
  return out;
}
const SIDES = {
  R: { paths: makePaths(RIGHT_PRE, RIGHT_MAIN, RIGHT_POST), color: 0x5a3f8a, n: 130 },
  L: { paths: makePaths(LEFT_PRE, LEFT_MAIN, [[]]), color: 0xb81e26, n: 150 },
};
const tmpV = new THREE.Vector3();
const rbcGeo = rbcGeometry(0.055, 18);
for (const S of Object.values(SIDES)) {
  S.gAV = S.paths[0].findIndex((n) => n.gate === 'AV');
  S.gSL = S.paths[0].findIndex((n) => n.gate === 'SL');
  S.world = S.paths.map((p) => p.map(() => new THREE.Vector3()));
  const rm = tissue({ color: S.color, veins: 0, scale: 30 });
  rm.clearcoat = 1; rm.clearcoatRoughness = 0.15; rm.sheen = 0.5; rm.emissive.set(S.color).multiplyScalar(0.07);
  S.mesh = new THREE.InstancedMesh(rbcGeo, rm, S.n);
  S.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  S.mesh.frustumCulled = false;
  H.add(S.mesh);
  S.parts = Array.from({ length: S.n }, () => spawn(S, {}, Math.random() * (S.paths[0].length - 1)));
}
function spawn(S, p, u = Math.random() * 0.8) {
  p.u = u; p.path = Math.floor(Math.random() * S.paths.length); p.j = Math.random(); p.k = Math.random();
  const v = tmpV.randomDirection().multiplyScalar(Math.cbrt(Math.random()));
  p.o = [v.x, v.y, -Math.abs(v.z) * 0.8];
  p.q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6.3, Math.random() * 6.3, 0));
  return p;
}
function updateNodes() {
  H.updateMatrixWorld(true);
  for (const S of Object.values(SIDES)) {
    S.paths.forEach((path, pi) => path.forEach((n, i) => {
      const w = S.world[pi][i];
      if (n.w) w.fromArray(n.w);
      else {
        const c = CH[n.c];
        w.set(n.a * c.rx * c.wall, c.dir * c.ry + n.b * c.ry * c.wall, -0.12);
        c.inner.localToWorld(w);
      }
    }));
  }
}
const K = 0.042; // düğüm / mL
/** vol: {in, av, back, sl, run} bu karede geçen hacimler (mL) */
function moveParticles(S, vol) {
  const last = S.paths[0].length - 1;
  const avOpen = vol.av > 0.05, slOpen = vol.sl > 0.05;
  const backFrac = vol.back > 0 ? vol.back / (vol.back + vol.sl + 1e-6) : 0;
  for (const p of S.parts) {
    let u = p.u;
    if (u < S.gAV - 1) {
      u += vol.in * K * 1.1;
      if (!avOpen) u = Math.min(u, S.gAV - 1 - 0.05 - p.j * 0.9);
    } else if (u < S.gAV) {
      u += vol.av * K;
      if (!avOpen) u = Math.min(u, S.gAV - 0.08 - p.j * 0.5);
    } else if (u < S.gSL) {
      if (vol.back > 0 && p.k < backFrac * 1.3 && u < S.gSL - 1) {
        u -= vol.back * K * 1.5; // mitral yetmezliği: geri kaçış
        u = Math.max(u, S.gAV - 1.2 - p.j * 0.6);
      } else {
        u += (vol.av * 0.9 + vol.sl) * K;
        if (!slOpen) u = Math.min(u, S.gSL - 0.1 - p.j * 1.6);
      }
    } else {
      u += (vol.sl + vol.run * 0.9) * K * 1.3;
    }
    if (u >= last) spawn(S, p);
    else p.u = u;
  }
}
const dummy = new THREE.Object3D(), A = new THREE.Vector3(), B = new THREE.Vector3();
function placeParticles(S) {
  S.parts.forEach((p, i) => {
    const path = S.paths[p.path], W = S.world[p.path];
    const i0 = Math.min(Math.floor(p.u), path.length - 2), f = p.u - i0;
    A.copy(W[i0]).lerp(W[i0 + 1], f);
    const sp = lerp(path[i0].sp, path[i0 + 1].sp, f);
    dummy.position.set(A.x + p.o[0] * sp, A.y + p.o[1] * sp, A.z + p.o[2] * sp);
    dummy.quaternion.copy(p.q);
    dummy.updateMatrix();
    S.mesh.setMatrixAt(i, dummy.matrix);
  });
  S.mesh.instanceMatrix.needsUpdate = true;
}

// --- EKG ---
function ecg(t) {
  const { PR, Ts } = model.timing();
  const g = (mu, w, a) => a * Math.exp(-(((t - mu) / w) ** 2));
  return g(0.05, 0.025, 0.15) + g(PR - 0.005, 0.008, -0.1) + g(PR + 0.02, 0.01, 1.2) + g(PR + 0.045, 0.01, -0.28) + g(PR + Ts * 0.82, 0.055, 0.3);
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Hazır durumlar');
const PRESETS = {
  dinlenme: { hr: 70, contract: 1, rs: 1, av: 0, mr: 0, venTone: 1 },
  egzersiz: { hr: 150, contract: 1.5, rs: 0.48, av: 0, mr: 0, venTone: 1.35 },
  yetmezlik: { hr: 92, contract: 0.45, rs: 1.15, av: 0, mr: 0.15, venTone: 1.1 },
  as: { hr: 72, contract: 1.05, rs: 1, av: 0.9, mr: 0, venTone: 1 },
  mr: { hr: 80, contract: 1, rs: 1, av: 0, mr: 0.5, venTone: 1 },
};
const presetSeg = ui.segmented({
  options: [{ value: 'dinlenme', label: 'Dinlenme' }, { value: 'egzersiz', label: '🏃 Egzersiz' }, { value: 'yetmezlik', label: 'Kalp yetm.' }, { value: 'as', label: 'Aort darlığı' }, { value: 'mr', label: 'Mitral yetm.' }],
  value: 'dinlenme', onChange: (v) => applyPreset(v),
});
ui.section('Kalp');
const hrSl = ui.slider({ label: 'Nabız', min: 40, max: 180, step: 1, value: 70, unit: 'atım/dk', onChange: (v) => (P.hr = v) });
const ctSl = ui.slider({ label: 'Kasılma gücü (kontraktilite)', min: 0.3, max: 1.6, step: 0.05, value: 1, format: (v) => `%${Math.round(v * 100)}`, onChange: (v) => (P.contract = v) });
const rsSl = ui.slider({ label: 'Damar direnci (periferik)', min: 0.4, max: 2, step: 0.05, value: 1, format: (v) => `%${Math.round(v * 100)}`, onChange: (v) => (P.rs = 1.05 * v) });
ui.section('Kapak hastalıkları');
const avArea = (s) => 3.5 - 2.9 * s;
const asSl = ui.slider({ label: 'Aort darlığı', min: 0, max: 1, step: 0.01, value: 0,
  format: (v) => { const a = avArea(v); return v < 0.01 ? 'yok' : `${fmt(a, 1)} cm² · ${a >= 1.5 ? 'hafif' : a >= 1.0 ? 'orta' : 'ciddi'}`; },
  onChange: (v) => (P.avArea = avArea(v)) });
const mrSl = ui.slider({ label: 'Mitral yetmezliği (sızıntı alanı)', min: 0, max: 0.6, step: 0.01, value: 0,
  format: (v) => (v < 0.005 ? 'yok' : `${fmt(v, 2)} cm² · ${v < 0.2 ? 'hafif' : v < 0.4 ? 'orta' : 'ciddi'}`), onChange: (v) => (P.mrArea = v) });
ui.text('<small>Kapak alanı: normal aort kapağı ~3–4 cm²; &lt;1 cm² ciddi darlık. Mitral sızıntı alanı ≥0,4 cm² ciddi yetmezlik sayılır.</small>');

ui.section('Ölçümler');
const stHR = ui.stat({ label: 'Nabız', unit: '/dk' });
const stSV = ui.stat({ label: 'Atım hacmi (ileri)', unit: 'mL' });
const stCO = ui.stat({ label: 'Kalp debisi', unit: 'L/dk' });
const stBP = ui.stat({ label: 'Tansiyon', unit: 'mmHg' });
const stEF = ui.stat({ label: 'Ejeksiyon fraksiyonu', unit: '%' });
const stLA = ui.stat({ label: 'Sol kulakçık bas.', unit: 'mmHg' });
const stGrad = ui.stat({ label: 'Aort kapak farkı', unit: 'mmHg' });
const stRF = ui.stat({ label: 'Geri kaçan kan', unit: '%' });
const note = ui.text('', 'card');
ui.text('<small>Kalp debisi = nabız × atım hacmi. EF = (diyastol sonu − sistol sonu hacim) / diyastol sonu hacim.</small>');

ui.section('Grafikler');
const ecgChart = ui.chart({ title: 'EKG (mV)', series: [{ name: 'EKG', color: '#4ade80' }], maxPoints: 300, yMin: -0.5, yMax: 1.4, height: 80 });
const pChart = ui.chart({ title: 'Basınçlar (mmHg) — son 3 saniye', series: [{ name: 'Sol karıncık', color: '#f87171' }, { name: 'Aort', color: '#fbbf24' }, { name: 'Sol kulakçık', color: '#60a5fa' }], maxPoints: 300, yMin: 0 });
// P-V döngüsü (özel tuval)
const pvWrap = document.createElement('div');
pvWrap.className = 'chart';
pvWrap.innerHTML = '<div class="chart-title">Sol karıncık basınç–hacim döngüsü</div>';
const pvCv = document.createElement('canvas');
pvCv.style.width = '100%';
pvWrap.append(pvCv);
pvWrap.insertAdjacentHTML('beforeend', '<div class="legend"><span><i style="background:#f87171"></i>şimdiki</span><span><i style="background:#64748b"></i>normal</span><span><i style="background:#a78bfa"></i>kasılma gücü (ESPVR)</span></div>');
ui.append(pvWrap);

ui.section('Görünüm');
ui.toggle({ label: 'Kan parçacıkları', value: true, onChange: (v) => Object.values(SIDES).forEach((S) => (S.mesh.visible = v)) });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => labels.forEach((l) => (l.visible = v)) });
ui.section('Seçilen yapı');
const card = ui.text('<small>Bir odacığa, kapağa ya da damara tıkla.</small>', 'card');

function applyPreset(name) {
  const p = PRESETS[name];
  hrSl.set(p.hr, true); ctSl.set(p.contract, true); rsSl.set(p.rs, true); asSl.set(p.av, true); mrSl.set(p.mr, true);
  P.venTone = p.venTone;
}

sim.onClick(clickables, (hit) => {
  const d = hit.object.userData.info;
  if (!d) return;
  card.set(`<b>${d.name}</b><br>${d.info}`);
  sim.toast(`📍 ${d.name}`);
});

// Normal P-V döngüsü (referans)
const refLoop = (() => {
  const m = createHeartModel();
  for (let i = 0; i < 24000; i++) m.step(0.0005);
  const out = [];
  const T = 60 / m.p.hr;
  for (let t = 0; t < T; t += 0.0005) { m.step(0.0005); if (Math.round(t / 0.0005) % 8 === 0) out.push([m.s.vlv, m.s.plv]); }
  return out;
})();
const pvPts = [];
function drawPV() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = pvCv.clientWidth || 260, Hh = 150;
  if (pvCv.width !== W * dpr) { pvCv.width = W * dpr; pvCv.height = Hh * dpr; pvCv.style.height = Hh + 'px'; }
  const c = pvCv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, Hh);
  const pmax = Math.max(160, ...pvPts.map((p) => p[1] * 1.08));
  const pl = 34, pb = 16, pt = 6, pr = 6;
  const X = (v) => pl + ((W - pl - pr) * v) / 220, Y = (p) => pt + (Hh - pt - pb) * (1 - p / pmax);
  c.strokeStyle = 'rgba(148,163,184,.18)'; c.fillStyle = 'rgba(148,163,184,.8)'; c.font = '10px system-ui'; c.lineWidth = 1;
  c.textAlign = 'right'; c.textBaseline = 'middle';
  for (let i = 0; i <= 3; i++) { const p = (pmax * i) / 3; c.beginPath(); c.moveTo(pl, Y(p)); c.lineTo(W - pr, Y(p)); c.stroke(); c.fillText(fmt(p), pl - 4, Y(p)); }
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  for (const v of [0, 50, 100, 150, 200]) c.fillText(v === 200 ? '200 mL' : String(v), X(v), Hh - 3);
  // ESPVR
  c.strokeStyle = '#a78bfa'; c.setLineDash([4, 3]); c.beginPath();
  const em = 2.3 * P.contract;
  c.moveTo(X(10), Y(0)); const ve = Math.min(220, 10 + pmax / em); c.lineTo(X(ve), Y(em * (ve - 10))); c.stroke();
  c.strokeStyle = '#64748b'; c.beginPath();
  refLoop.forEach(([v, p], i) => (i ? c.lineTo(X(v), Y(p)) : c.moveTo(X(v), Y(p)))); c.closePath(); c.stroke();
  c.setLineDash([]);
  c.strokeStyle = '#f87171'; c.lineWidth = 2; c.beginPath();
  pvPts.forEach(([v, p], i) => (i ? c.lineTo(X(v), Y(p)) : c.moveTo(X(v), Y(p)))); c.stroke();
  const lp = pvPts[pvPts.length - 1];
  if (lp) { c.fillStyle = '#fff'; c.beginPath(); c.arc(X(lp[0]), Y(lp[1]), 3, 0, Math.PI * 2); c.fill(); }
}

// --- Döngü ---
const DT = 0.0005;
let chartAcc = 0, pvAcc = 0, lastBeat = -1;
const vol = { R: { in: 0, av: 0, back: 0, sl: 0, run: 0 }, L: { in: 0, av: 0, back: 0, sl: 0, run: 0 } };
sim.onUpdate((dt) => {
  const n = Math.min(1600, Math.ceil(dt / DT));
  const h = dt / n;
  for (const k of ['R', 'L']) Object.keys(vol[k]).forEach((x) => (vol[k][x] = 0));
  for (let i = 0; i < n; i++) {
    model.step(h);
    const fwd = Math.max(0, M.qmv), back = Math.max(0, -M.qmv), run = (M.pao - M.pv) / P.rs;
    vol.L.in += M.qpv * h; vol.L.av += fwd * h; vol.L.back += back * h; vol.L.sl += M.qav * h; vol.L.run += run * h;
    vol.R.in += M.qr * h; vol.R.av += fwd * h; vol.R.sl += M.qav * h; vol.R.run += M.qr * h;
    chartAcc += h; pvAcc += h;
    if (chartAcc >= 0.01) {
      chartAcc -= 0.01;
      ecgChart.push([ecg(M.t)]);
      pChart.push([M.plv, M.pao, M.pla]);
    }
    if (pvAcc >= 0.006) {
      pvAcc -= 0.006;
      pvPts.push([M.vlv, M.plv]);
      const keep = Math.round((60 / P.hr) * 1.15 / 0.006);
      if (pvPts.length > keep) pvPts.splice(0, pvPts.length - keep);
    }
  }
  vol.L.in = Math.max(0, vol.L.in);
  // Odacık boyutları hacme göre
  const kV = 1 + 0.9 * (Math.cbrt(Math.max(M.vlv, 5) / 130) - 1);
  const kA = 1 + 0.8 * (Math.cbrt(Math.max(M.vla, 5) / 60) - 1);
  CH.LV.inner.scale.setScalar(kV); CH.RV.inner.scale.setScalar(lerp(1, kV, 0.9));
  CH.LA.inner.scale.setScalar(kA); CH.RA.inner.scale.setScalar(kA);
  // Kas "kasılma" parlaması
  const act = M.ev;
  CH.LV.mat.emissive.setRGB(0.12 * act, 0.01 * act, 0.01 * act); CH.RV.mat.emissive.copy(CH.LV.mat.emissive);
  CH.LA.mat.emissive.setRGB(0.12 * M.ea, 0.01 * M.ea, 0.01 * M.ea); CH.RA.mat.emissive.copy(CH.LA.mat.emissive);
  // Kesit yüzündeki boşluklar odacık hacmiyle birlikte değişir
  KEYS.forEach((k, i) => {
    const c = CH[k], s = c.inner.scale.x, m = toPlane(c, 0, c.dir * c.ry, s);
    cavU['uC' + i].value.set(m[0], m[1], c.rx * c.wall * s, c.ry * c.wall * s);
  });
  // Kapaklar
  const avMax = 1.35 * Math.sqrt(P.avArea / 3.5);
  setValve(VALVES.MV, M.qmv > 1 ? 1.25 : M.qmv < -1 ? -0.25 - 0.4 * P.mrArea : 0, P.mrArea);
  setValve(VALVES.TV, M.qmv > 1 ? 1.25 : 0, 0);
  setValve(VALVES.AV, M.qav > 1 ? avMax : 0, 0, 1 - P.avArea / 3.5);
  setValve(VALVES.PV, M.qav > 1 ? 1.3 : 0, 0);
  // Uyarı iletimi
  const { PR, Ts } = model.timing();
  saNode.material.emissiveIntensity = 0.6 + 9 * Math.exp(-(((M.t - 0.03) / 0.04) ** 2));
  avNode.material.emissiveIntensity = 0.6 + 9 * Math.exp(-(((M.t - PR + 0.03) / 0.04) ** 2));
  // Evre
  const tv = M.t - PR;
  let ph;
  if (M.ea > 0.05) ph = ['Atriyal sistol', 'kulakçıklar kasılıyor · P dalgası', '#60a5fa'];
  else if (tv >= 0 && tv < Ts && M.qav > 1) ph = ['Ventriküler sistol', 'ejeksiyon: aort ve pulmoner kapak açık', '#f87171'];
  else if (tv >= 0 && tv < Ts * 0.62) ph = ['Ventriküler sistol', 'izovolümetrik kasılma · QRS, AV kapaklar kapandı', '#f87171'];
  else if (M.qmv > 1) ph = ['Diyastol', 'karıncıklar doluyor', '#4ade80'];
  else ph = ['Diyastol', 'izovolümetrik gevşeme · T dalgası', '#4ade80'];
  phaseLbl.setText(`<span style="color:${ph[2]}">● ${ph[0]}</span> <span style="font-weight:400;font-size:12px;color:#cbd5e1">${ph[1]}</span>`);
  // Parçacıklar
  moveParticles(SIDES.R, vol.R);
  moveParticles(SIDES.L, vol.L);
  if (model.beat.count !== lastBeat) { lastBeat = model.beat.count; updateStats(); }
});
function setValve(v, target, leak, calc = 0) {
  v.open = target;
  v.l.rotation.z = target;
  v.r.rotation.z = -target;
  const short = 1 - 0.55 * leak;
  v.lm.scale.x = (v.w / 2) * short; v.rm.scale.x = (-v.w / 2) * short;
  v.mat.color.setHex(0xf3e3c8).lerp(new THREE.Color(0xc9a64a), clamp(calc, 0, 1));
  v.lm.scale.y = v.rm.scale.y = 1 + 2.5 * calc;
}
// Kapak yönleri (odacık merkezlerinden)
function orientValves() {
  H.updateMatrixWorld(true);
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const v of Object.values(VALVES)) {
    let d;
    if (v.dir) d = V3(v.dir).normalize();
    else {
      A.copy(CH[v.from].center); CH[v.from].inner.localToWorld(A);
      B.copy(CH[v.to].center); CH[v.to].inner.localToWorld(B);
      d = B.sub(A).normalize();
    }
    v.g.quaternion.copy(q.setFromUnitVectors(up, d));
  }
}
orientValves();

// --- Papiller kaslar ve kiriş iplikleri (korda tendinea): karıncık duvarından yükselen kas çıkıntıları, uçlarından
// AV kapak yaprakçıklarının serbest kenarına giden ince, parlak kiriş iplikleri. Sistolde gerilip yaprakçıkların
// kulakçığa doğru ters dönmesini (prolapsus) önler. Papiller kaslar odacıkla birlikte ölçeklenir. ---
const PAPS = [];
{
  const papMat = endoMat();
  for (const [vk, ck, rr] of [['TV', 'RV', 0.075], ['MV', 'LV', 0.1]]) {
    const c = CH[ck], v = VALVES[vk];
    const L = (nx, ny, nz, s = 1) => new THREE.Vector3(nx * c.rx * c.wall * s, c.dir * c.ry + ny * c.ry * c.wall * s, nz * c.rz * s);
    for (const sx of [-1, 1]) {
      const nz0 = -Math.sqrt(1 - 0.5 * 0.5 - 0.25 * 0.25);
      const base = L(sx * 0.5, -0.25, nz0, 0.9), mid = L(sx * 0.46, 0.02, -0.62), tip = L(sx * 0.36, 0.26, -0.4);
      const g = loftTube(new THREE.CatmullRomCurve3([base, mid, tip]), (t) => rr * (1 - 0.55 * t * t) * (t < 0.12 ? 1.4 - t * 3.3 : 1), { segs: 24, radial: 14, caps: true, noiseAmp: 0.12, noiseFreq: 7 });
      const m = new THREE.Mesh(g, papMat);
      m.userData.info = { name: 'Papiller kas', info: 'Karıncık duvarından çıkan kas çıkıntısıdır. Karıncıkla birlikte kasılarak kiriş ipliklerini gerer; böylece kapak yaprakçıkları sistolde kulakçığa doğru ters dönmez.' };
      clickables.push(m);
      c.inner.add(m);
      PAPS.push({ c, v, tip, sx, world: new THREE.Vector3() });
    }
  }
}
const chordMat = wetSSS(new THREE.MeshPhysicalMaterial({ color: 0xf2e6d8, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.6, sheenColor: new THREE.Color(0xffffff) }), { color: 0xffc0a0, strength: 0.4, rim: 0.1 });
const CHORDS = [];
{
  H.updateMatrixWorld(true);
  const tmp = new THREE.Vector3();
  for (const pp of PAPS) {
    pp.c.inner.localToWorld(pp.world.copy(pp.tip));
    const dl = pp.v.lm.localToWorld(tmp.set(0.97, 0, 0)).distanceTo(pp.world), dr = pp.v.rm.localToWorld(tmp.set(0.97, 0, 0)).distanceTo(pp.world);
    const near = dl < dr ? pp.v.lm : pp.v.rm, far = dl < dr ? pp.v.rm : pp.v.lm;
    for (const zz of [-0.058, -0.03, 0, 0.03, 0.058]) CHORDS.push({ pp, leaf: near, pt: new THREE.Vector3(0.96, 0.01, zz), off: new THREE.Vector3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.03, (Math.random() - 0.5) * 0.05), r: 0.0048 });
    for (const zz of [pp.sx * 0.05, pp.sx * 0.02]) CHORDS.push({ pp, leaf: far, pt: new THREE.Vector3(0.94, 0.01, zz), off: new THREE.Vector3((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.04), r: 0.0038 });
  }
}
const chordMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0), chordMat, CHORDS.length);
chordMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
chordMesh.frustumCulled = false; chordMesh.userData.noCast = true;
chordMesh.userData.info = { name: 'Kiriş iplikleri (korda tendinea)', info: 'Papiller kasları AV kapak (triküspit ve mitral) yaprakçıklarına bağlayan ince, sağlam bağ dokusu iplikleridir. Kopmaları ciddi kapak yetmezliğine yol açar.' };
clickables.push(chordMesh);
H.add(chordMesh);
const _cP = new THREE.Vector3(), _cQ = new THREE.Vector3(), _cUp = new THREE.Vector3(0, 1, 0), _cD = new THREE.Object3D();
function placeChords() {
  for (const pp of PAPS) pp.c.inner.localToWorld(pp.world.copy(pp.tip));
  CHORDS.forEach((ch, i) => {
    _cP.copy(ch.pp.world).add(ch.off);
    ch.leaf.localToWorld(_cQ.copy(ch.pt));
    _cQ.sub(_cP);
    const len = Math.max(_cQ.length(), 1e-4);
    _cD.position.copy(_cP);
    _cD.quaternion.setFromUnitVectors(_cUp, _cQ.divideScalar(len));
    _cD.scale.set(ch.r, len, ch.r);
    _cD.updateMatrix();
    chordMesh.setMatrixAt(i, _cD.matrix);
  });
  chordMesh.instanceMatrix.needsUpdate = true;
}

sim.onRender(() => {
  updateNodes();
  placeParticles(SIDES.R);
  placeParticles(SIDES.L);
  placeChords();
  if (sim.frame % 3 === 0) drawPV();
});

function updateStats() {
  const b = model.beat;
  if (b.count < 2) return;
  stHR.set(Math.round(P.hr), P.hr > 100 ? 'warn' : P.hr < 50 ? 'warn' : '');
  stSV.set(Math.round(b.fsv), b.fsv < 50 ? 'bad' : '');
  stCO.set(fmt(b.co, 1), b.co < 4 ? 'bad' : b.co > 8 ? 'good' : '');
  stBP.set(`${Math.round(b.sys)}/${Math.round(b.dia)}`, b.sys >= 140 || b.dia >= 90 ? 'warn' : b.sys < 90 ? 'bad' : '');
  stEF.set(Math.round(b.ef * 100), b.ef < 0.4 ? 'bad' : b.ef < 0.5 ? 'warn' : '');
  stLA.set(Math.round(b.laMean), b.laMean > 18 ? 'bad' : b.laMean > 13 ? 'warn' : '');
  stGrad.set(Math.round(b.grad), b.grad > 40 ? 'bad' : b.grad > 20 ? 'warn' : '');
  const rf = b.rv / (b.rv + b.fsv + 1e-6);
  stRF.set(Math.round(rf * 100), rf >= 0.5 ? 'bad' : rf >= 0.3 ? 'warn' : '');
  const msg = [];
  if (b.co < 4) msg.push('⚠️ <b>Düşük debi:</b> dokulara yeterli kan gitmeyebilir (halsizlik, baş dönmesi).');
  if (b.laMean > 18) msg.push('⚠️ <b>Sol kulakçık basıncı yüksek:</b> akciğerlerde sıvı birikimi (ödem) ve nefes darlığı riski.');
  if (b.grad > 40) msg.push('⚠️ <b>Büyük kapak basınç farkı:</b> sol karıncık darlığı aşmak için aşırı basınç üretiyor; zamanla duvarı kalınlaşır.');
  if (rf >= 0.3) msg.push(`↩️ Her atımda kanın <b>%${Math.round(rf * 100)}</b>'i sol kulakçığa geri kaçıyor; EF yüksek görünse de ileri akış azalıyor.`);
  if (b.ef < 0.4 && rf < 0.3) msg.push('⚠️ <b>Düşük EF:</b> karıncık her atımda kanın ancak küçük bir kısmını atabiliyor (kalp yetmezliği tablosu).');
  if (P.hr > 150) msg.push('⏱ Çok hızlı nabızda diyastol kısalır; karıncık dolamadığı için atım hacmi düşer.');
  if (!msg.length) msg.push('✅ Değerler normal aralıkta: debi ~4–8 L/dk, EF %50–70, tansiyon &lt;140/90.');
  note.set(msg.join('<br>') + '<div style="margin-top:4px;color:var(--muted);font-size:11px">Eğitim amaçlıdır; tıbbi tavsiye değildir. Göğüs ağrısı, bayılma ya da ani nefes darlığında 112\'yi ara.</div>');
}

sim.onReset(() => {
  model.reset();
  presetSeg.set('dinlenme');
  applyPreset('dinlenme');
  pvPts.length = 0;
  ecgChart.clear(); pChart.clear();
  for (const S of Object.values(SIDES)) S.parts.forEach((p) => spawn(S, p, Math.random() * (S.paths[0].length - 1)));
});
note.set('<small>Ölçümler ilk atımlardan sonra görünür…</small>');
