// Bir Yıldızın Hayatı — kütle–ışıklılık ve ömür ilişkileri, HR diyagramında evrim izi ve kütleye göre son (beyaz cüce / nötron yıldızı / kara delik).
import { createSim, THREE, fmt, clamp, lerp, smoothstep, rand, TAU, NOISE3_GLSL, mat } from '@core';
import { createStar, planckRGB, satOf } from './star.js';

const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;

const T_SUN = 5772;
const NS_LIMIT = 8, BH_LIMIT = 20; // yaklaşık sınırlar (M☉)

const sim = createSim({
  space: { star: [0, 0, 0], power: 1, milky: 1, nebula: 0.8, stars: 0.55, galaxyTilt: 40 },
  look: { bloomStrength: 0.32 },
  camera: { position: [0, 2.5, 9], target: [0, 0, 0], fov: 45, far: 3000 },
  controls: { maxDistance: 300, minDistance: 1.5, maxPolarAngle: Math.PI, enablePan: false },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Seçtiğin kütlede doğan bir yıldız: 3B sahnede boyutu ve rengi (yüzey sıcaklığına göre), panelde ise
    <b>Hertzsprung–Russell (HR) diyagramındaki</b> yolu. Zaman çizgisini kaydırarak ya da oynatarak ana koldan
    son evresine kadar ilerle. Solda yanında karşılaştırma için <b>Güneş</b> durur.</p>
    <h3>Model (yaklaşık)</h3>
    <ul>
      <li><b>Ana kol ömrü:</b> t ≈ 10 milyar yıl × (M/M☉)<sup>−2,5</sup>. Kütlesi 2 kat olan yıldız ≈ 5,7 kat kısa yaşar.</li>
      <li><b>Kütle–ışıklılık:</b> L ∝ M<sup>3,5</sup> civarı (parçalı: M &lt; 0,43 için 0,23·M<sup>2,3</sup>; 0,43–2 için M<sup>4</sup>; 2–55 için 1,4·M<sup>3,5</sup>).
      Yarıçap R ≈ M<sup>0,8</sup> (M &lt; 1) ya da M<sup>0,57</sup>; sıcaklık Stefan–Boltzmann yasasından: <b>L = 4πR²σT⁴</b>.</li>
      <li><b>Son:</b> ≲ 8 M☉ → gezegenimsi bulutsu + <b>beyaz cüce</b>; ≈ 8–20 M☉ → süpernova + <b>nötron yıldızı</b>;
      ≳ 20–25 M☉ → <b>kara delik</b>. Bu sınırlar yaklaşıktır; kütle kaybı, dönme ve metal bolluğuna göre değişir.</li>
      <li><b>Yüzey görünümü:</b> renk, Planck kara cisim spektrumunun göz renk eşleme fonksiyonlarıyla (CIE 1931) çarpımından gelir
      (görünürlük için doygunluk hafifçe artırıldı). Kenar kararması Eddington gri atmosfer yaklaşımıyla: kenarda daha soğuk, üst katmanı görürüz.
      Soğuk yıldızlarda (≲ 7.500 K) konveksiyon <b>granülleri</b>, lekeler ve proninans ilmekleri; dev yıldızlarda birkaç dev konveksiyon hücresi.
      Sıcak O/B yıldızlarında granül yok denecek kadar zayıftır; hafif benekler ve hızlı dönüşten kutupların daha sıcak olması görünür.</li>
      <li><b>Chandrasekhar sınırı ≈ 1,4 M☉:</b> Beyaz cüceyi elektron dejenerasyon basıncı taşır; kütle bu sınırı aşarsa basınç yetmez ve cüce çöker.
      Bu yüzden 8 M☉'lik bir yıldızın bile ardında bıraktığı beyaz cüce 1,4 M☉'den hafiftir: yıldız dış katmanlarını rüzgârla ve bulutsu olarak atar.
      Beyaz cüce kütlesi yaklaşık M<sub>BC</sub> ≈ 0,109·M + 0,394 (başlangıç–son kütle ilişkisi).</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li><b>Güneş</b>: ≈ 10 milyar yıl ana kol, sonra kırmızı dev (≈ 100–200 R☉), gezegenimsi bulutsu ve Dünya boyutunda bir beyaz cüce.</li>
      <li><b>0,2 M☉</b> kırmızı cüce: ömrü evrenin yaşının (13,8 milyar yıl) yüzlerce katı. Hiçbiri henüz ölmedi!</li>
      <li><b>10 M☉</b> ve <b>40 M☉</b>'i karşılaştır: ikisi de süpernova olur ama biri nötron yıldızı, diğeri kara delik bırakır.</li>
      <li>Panelde "yaşam çizelgesi" gerçek oranları gösterir: dev evreleri ve bulutsu, ana kola göre ne kadar kısa?</li>
    </ul>
    <h3>Sınırlar</h3>
    <p><small>Evre süreleri ve dev evresindeki parlaklık/sıcaklıklar ders kitabı düzeyinde temsili değerlerdir; gerçek evrim izleri
    ayrıntılı yıldız modelleriyle hesaplanır. Çok kütleli yıldızlarda (≳ 10 M☉) M<sup>−2,5</sup> formülü ömrü olduğundan kısa verir;
    gerçekte en kütleli yıldızlar bile birkaç milyon yıl yaşar. 3B'deki boyutlar logaritmik ölçeklidir (gerçek oranlar 10⁸ katı aşar).</small></p>`,
});

// --- Fiziksel ilişkiler ---
const lumMS = (M) => (M < 0.43 ? 0.23 * M ** 2.3 : M < 2 ? M ** 4 : M < 55 ? 1.4 * M ** 3.5 : 32000 * M);
const radMS = (M) => (M < 1 ? M ** 0.8 : M ** 0.57);
const tempOf = (L, R) => T_SUN * (L / (R * R)) ** 0.25;
const radOf = (L, T) => Math.sqrt(L) / (T / T_SUN) ** 2;
const tMS = (M) => 10e9 * M ** -2.5;
const wdMass = (M) => (M < 0.5 ? M : Math.min(1.35, 0.109 * M + 0.394));
const wdRad = (Mwd) => 0.0108 * Mwd ** (-1 / 3) * Math.sqrt(Math.max(0.05, 1 - (Mwd / 1.44) ** (4 / 3)));

function fate(M) { return M < NS_LIMIT ? 'wd' : M < BH_LIMIT ? 'ns' : 'bh'; }

/** Yıldızın evrelerini kurar: her evre {key, name, dur(yıl), w(görsel pay), L0,L1,T0,T1, R?} */
function buildLife(M) {
  const L = lumMS(M), T = tempOf(L, radMS(M)), tm = tMS(M);
  const st = [];
  const add = (key, name, dur, w, L0, L1, T0, T1, extra = {}) => st.push({ key, name, dur, w, L0, L1, T0, T1, ...extra });
  if (M < 0.5) {
    add('ms', 'Ana kol (kırmızı cüce)', tm, 0.6, 0.9 * L, 1.6 * L, T, T * 1.08);
    const mw = wdMass(M);
    add('wd', 'Helyum beyaz cüce (kuramsal)', 10e9, 0.4, 0, 0, 12000, 4000, { R: wdRad(mw), mass: mw });
  } else if (M < NS_LIMIT) {
    const lo = M < 2 ? 1 : 0; // düşük kütle mi?
    const b = smoothstep(1.8, 2.4, M);
    const Lrgb = lerp(2500, 8 * L, b), Tr = lerp(3400, 4200, b);
    const Lhb = lerp(50, 2 * L, b), Thb = lerp(5000, 7000, b);
    const Lagb = Math.max(lerp(5000, 12 * L, b), Lrgb * 1.5);
    add('ms', 'Ana kol', tm, 0.34, 0.8 * L, 2 * L, T, T * 0.97);
    add('sg', 'Altdev', tm * (lo ? 0.07 : 0.01), 0.07, 2 * L, 3 * L, T * 0.97, lerp(4900, 5500, b));
    add('rgb', 'Kırmızı dev', tm * (lo ? 0.1 : 0.02), 0.13, 3 * L, Lrgb, lerp(4900, 5500, b), Tr);
    add('hb', 'Helyum yakan dev', tm * (lo ? 0.012 : 0.1), 0.08, Lhb, Lhb * 1.3, Thb, Thb * 0.92);
    add('agb', 'Asimptotik dev kolu', tm * (lo ? 0.002 : 0.005), 0.1, Lhb * 1.3, Lagb, Thb * 0.92, 3000);
    add('pn', 'Gezegenimsi bulutsu', 3e4, 0.12, Lagb, Lagb * 0.7, 3000, 100000);
    const mw = wdMass(M);
    add('wd', 'Beyaz cüce', 10e9, 0.16, 0, 0, 100000, 4500, { R: wdRad(mw), mass: mw });
  } else {
    const wr = M >= 30;
    add('ms', 'Ana kol', tm, 0.34, 0.8 * L, 1.5 * L, T, T * 0.85);
    if (wr) {
      add('bsg', 'Mavi süperdev', tm * 0.05, 0.12, 1.5 * L, 1.7 * L, T * 0.85, 20000);
      add('wr', 'Wolf–Rayet yıldızı', tm * 0.06, 0.16, 1.7 * L, 1.2 * L, 20000, 90000);
    } else {
      add('bsg', 'Mavi–sarı süperdev', tm * 0.02, 0.1, 1.5 * L, 1.7 * L, T * 0.85, 6500);
      add('rsg', 'Kırmızı süperdev', tm * 0.1, 0.18, 1.7 * L, 2 * L, 6500, 3500);
    }
    add('sn', wr ? 'Çekirdek çöküşü (süpernova)' : 'Süpernova (Tip II)', 1, 0.14, 2 * L, 1e9, st.at(-1).T1, 10000);
    if (fate(M) === 'ns') add('ns', 'Nötron yıldızı', 1e9, 0.22, 0, 0, 1e6, 3e5, { R: 12 / 696000, mass: 1.4 });
    else add('bh', 'Kara delik', 1e9, 0.22, 0, 0, 0, 0, { R: 0, mass: null });
  }
  const W = st.reduce((a, s) => a + s.w, 0);
  let u = 0, age = 0;
  for (const s of st) { s.u0 = u; u += s.w / W; s.u1 = u; s.a0 = age; age += s.dur; }
  st.at(-1).u1 = 1;
  return st;
}

/** u ∈ [0,1] görsel ilerleme → anlık durum */
function stateAt(life, u) {
  const s = life.find((x) => u <= x.u1) || life.at(-1);
  const f = clamp((u - s.u0) / (s.u1 - s.u0), 0, 1);
  const out = { s, f, age: s.a0 + f * s.dur };
  if (s.key === 'wd' || s.key === 'ns') {
    out.T = Math.exp(lerp(Math.log(s.T0), Math.log(s.T1), f ** 0.6));
    out.R = s.R;
    out.L = s.R * s.R * (out.T / T_SUN) ** 4;
  } else if (s.key === 'bh') {
    Object.assign(out, { T: 0, R: 0, L: 0 });
  } else {
    const g = s.key === 'sn' ? Math.min(1, f * 6) : f;
    out.L = Math.exp(lerp(Math.log(s.L0), Math.log(s.L1), g));
    out.T = Math.exp(lerp(Math.log(s.T0), Math.log(s.T1), s.key === 'pn' ? f ** 2 : g));
    if (s.key === 'sn') { out.L = f < 0.2 ? out.L : s.L1 * Math.exp(-(f - 0.2) * 6); }
    out.R = radOf(out.L, out.T);
  }
  return out;
}

// Kara cisim rengi: Planck spektrumu × CIE 1931 eşleme fonksiyonları → sRGB (star.js)
function bbColor(T, out = new THREE.Color()) {
  const c = planckRGB(clamp(T, 1000, 1e6), satOf(clamp(T, 1000, 1e6)));
  return out.setRGB(c[0], c[1], c[2]);
}
const cssColor = (T) => '#' + bbColor(T).getHexString(THREE.SRGBColorSpace);
const visR = (R) => clamp(1.1 * R ** 0.33, 0.1, 22);

// --- Sahne ---
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Yumuşak yuvarlak parçacık dokusu
const glowTex = canvasTex(64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
  gr.addColorStop(0.6, 'rgba(255,255,255,.1)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
});

// Gaz kabuğu (gezegenimsi bulutsu / süpernova kalıntısı): kenarda parlayan ince kabuk, lifli yapı, eklemeli HDR ışık
const SHELL_VS = NOISE3_GLSL + /* glsl */ `
uniform float uWarp, uSeed; varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  vec3 p = position;
  float d = fbm3(normalize(p)*2.2 + uSeed, 4) - 0.5;
  p *= 1.0 + d*uWarp;
  vP = normalize(position);
  vN = normalize(normalMatrix*normal);
  vec4 mv = modelViewMatrix*vec4(p, 1.0); vV = -mv.xyz;
  gl_Position = projectionMatrix*mv;
}`;
const SHELL_FS = NOISE3_GLSL + /* glsl */ `
uniform vec3 uA, uB; uniform float uOp, uSeed, uFil; varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  float nv = abs(dot(normalize(vN), normalize(vV)));
  float limb = pow(1.0 - nv, 2.2)*1.6 + 0.12;                   // kabuk kenarda kalın görünür
  float f1 = fbm3(vP*4.0 + uSeed, 5), f2 = fbm3(vP*11.0 + uSeed*2.0, 4);
  float fil = pow(1.0 - abs(f2*2.0 - 1.0), 6.0);                   // ince filamentler
  float knots = smoothstep(0.6, 0.8, fbm3(vP*7.0 + 5.0, 4));
  float I = limb*(0.45 + 0.9*f1) + fil*uFil*0.9 + knots*0.4*uFil;
  vec3 col = mix(uA, uB, smoothstep(0.35, 0.75, f1 + (1.0 - nv)*0.35));
  gl_FragColor = vec4(col*I*uOp, 1.0);
}`;
function shellMesh(a, b, { warp = 0.35, seed = rand(0, 10), fil = 1 } = {}) {
  const U = { uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uOp: { value: 1 }, uSeed: { value: seed }, uWarp: { value: warp }, uFil: { value: fil } };
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({
    uniforms: U, vertexShader: SHELL_VS, fragmentShader: SHELL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  m.userData.noShadow = true;
  m.raycast = () => {};
  return m;
}

// Yıldız: kaynayan granülasyon, kenar kararması, lekeler, kromosfer, korona, proninans (star.js); renk Planck'tan
const star = new THREE.Group();
sim.scene.add(star);
const S = createStar({ seed: 0.37, prominences: 3, low: LOW });
const starMesh = S.surface;
star.add(S.group);
const starLabel = sim.label('', { parent: sim.scene, position: [0, 2, 0], className: 'plain' });

// Derin uzay fonu: Samanyolu şeridi görüş alanından çapraz geçsin, toz şeritleri ve bulutsular belirgin olsun
{
  const U = sim.sky?.uniforms;
  if (U) {
    const d0 = new THREE.Vector3(0, -2.5, -9).normalize();
    const N = new THREE.Vector3(0.62, 0.78, 0).normalize();
    N.sub(d0.clone().multiplyScalar(N.dot(d0))).normalize();           // şerit merkezden geçer
    const C = d0.clone().add(new THREE.Vector3().crossVectors(N, d0).multiplyScalar(0.35));
    C.sub(N.clone().multiplyScalar(C.dot(N))).normalize();               // galaksi merkezi şeridin üstünde, çerçeveye yakın
    U.uGalN.value.copy(N); U.uGalC.value.copy(C);
    U.uMilky.value = 2.8; U.uNeb.value = 4; U.uStars.value = 0.9;
  }
}

// Güneş (karşılaştırma)
const sun = new THREE.Group();
const SUN = createStar({ seed: 0.81, prominences: 2, low: LOW }).set({ T: T_SUN, gran: 1, conv: 1, spots: 1, int: 1.25, corona: 0.55, chromo: 1, prom: 0.8 });
const sunMesh = SUN.surface;
SUN.group.scale.setScalar(visR(1));
sun.add(SUN.group);
sim.scene.add(sun);
const sunLabel = sim.label('Güneş (bugün)', { parent: sun, position: [0, -visR(1) - 0.7, 0], className: 'plain' });

// Gezegenimsi bulutsu: iç OIII (turkuaz) + dış Hα/NII (kırmızı) kabuk
const nebula = new THREE.Group();
const nebA = shellMesh(0x1fd6c0, 0x6fb8ff, { warp: 0.25, fil: 0.8 });
const nebB = shellMesh(0xff3355, 0xff8a4d, { warp: 0.5, fil: 1.2 });
nebA.scale.set(0.78, 0.9, 0.8);
nebB.scale.set(1.25, 1.1, 1.25);
nebB.rotation.set(0.4, 1, 0.2);
nebula.add(nebA, nebB);
sim.scene.add(nebula);

// Süpernova: genişleyen ateşli kabuk + parçacık bulutu + HDR parlama
const snShell = shellMesh(0xff7a2a, 0x7ad0ff, { warp: 0.45, fil: 1.6 });
sim.scene.add(snShell);
// Kabuk hacmi: homolog genişleme (r = v·t), Rayleigh–Taylor parmakları (kümelenmiş yönler), katmanlı bileşim:
// iç Fe/Si (sıcak mavi-beyaz), orta O [OIII] (turkuaz), dış H (Hα kırmızısı)
const SN_N = LOW ? 5000 : 14000;
const snDir = new Float32Array(SN_N * 3), snCol = new Float32Array(SN_N * 3), snSize = new Float32Array(SN_N);
{
  const clumps = Array.from({ length: 70 }, () => new THREE.Vector3().randomDirection());
  const d = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < SN_N; i++) {
    let v;
    if (rand() < 0.72) {
      const k = clumps[(Math.random() * clumps.length) | 0];
      v = rand(0.45, 1) ** 0.6;
      const spread = 0.06 + 0.22 * (1 - v);                     // parmak ucu dar, kök geniş
      d.copy(k).add(new THREE.Vector3().randomDirection().multiplyScalar(spread * Math.abs(rand(-1, 1)))).normalize();
    } else { d.randomDirection(); v = rand(0.3, 1) ** 0.5; }
    snDir.set([d.x * v, d.y * v, d.z * v], i * 3);
    if (v < 0.62) c.setRGB(0.75, 0.85, 1.6);                     // iç: sıcak demir grubu
    else if (v < 0.8) c.setRGB(0.25, 1.2, 1.0);                  // [OIII]
    else c.setRGB(1.6, 0.35, 0.22);                             // Hα
    c.multiplyScalar(rand(0.3, 0.75));
    snCol.set([c.r, c.g, c.b], i * 3);
    snSize[i] = rand(0.6, 1.6);
  }
}
const snGeo = new THREE.BufferGeometry();
snGeo.setAttribute('position', new THREE.BufferAttribute(snDir, 3));
snGeo.setAttribute('color', new THREE.BufferAttribute(snCol, 3));
snGeo.setAttribute('size', new THREE.BufferAttribute(snSize, 1));
const snMat = new THREE.ShaderMaterial({
  uniforms: { uR: { value: 1 }, uOp: { value: 1 }, uPx: { value: 1 } },
  vertexShader: `attribute vec3 color; attribute float size; uniform float uR, uPx; varying vec3 vC;
    void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position*uR, 1.0);
      gl_PointSize = clamp(size*uPx*(0.1 + uR*0.03)/max(-mv.z, 0.1), 1.5, 48.0); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform float uOp; varying vec3 vC;
    void main(){ vec2 q = gl_PointCoord*2.0 - 1.0; float r2 = dot(q, q); if (r2 > 1.0) discard;
      gl_FragColor = vec4(vC*exp(-r2*3.5)*uOp, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const snPts = new THREE.Points(snGeo, snMat);
snPts.frustumCulled = false;
snPts.onBeforeRender = (r) => { snMat.uniforms.uPx.value = r.getDrawingBufferSize(new THREE.Vector2()).y; };
sim.scene.add(snPts);
const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0xdfe8ff).multiplyScalar(4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
sim.scene.add(flash);

// Pulsar ışınları: eksen boyunca sönen, kenarı yumuşak ışık konileri
const beams = new THREE.Group();
{
  const bm = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0x9ad8ff) } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }',
    fragmentShader: `uniform vec3 uCol; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float along = vUv.y; float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        gl_FragColor = vec4(uCol*edge*pow(along, 2.0)*2.2, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  for (const s of [1, -1]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.5, 7, 32, 1, true), bm);
    c.position.y = s * 3.5;
    c.rotation.x = s > 0 ? Math.PI : 0;
    c.userData.noShadow = true;
    beams.add(c);
  }
  beams.rotation.z = 0.5;
}
// Pulsar kutup başlıkları: manyetik kutuplarda akan parçacıkların ısıttığı sıcak noktalar (ışınların tabanı)
const polar = new THREE.Group();
{
  const capM = mat.glow({ color: 0xcfe6ff, intensity: 7 });
  for (const s of [1, -1]) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1215, 32, 6, 0, TAU, 0, 0.42), capM);
    if (s < 0) cap.rotation.x = Math.PI;
    cap.userData.noShadow = true;
    polar.add(cap);
  }
  beams.add(polar);
}
const beamPivot = new THREE.Group();
beamPivot.add(beams);
sim.scene.add(beamPivot);

// Kara delik: olay ufku, sıcaklığı içe doğru artan, Doppler ile bir yanı parlak yığılma diski ve foton halkası
const bh = new THREE.Group();
const diskU = { uTime: { value: 0 } };
{
  const hole = new THREE.Mesh(new THREE.SphereGeometry(0.7, 64, 40), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const disk = new THREE.Mesh(new THREE.RingGeometry(0.95, 3.6, 192, 8), new THREE.ShaderMaterial({
    uniforms: diskU,
    vertexShader: 'varying vec2 vL; varying vec3 vW; varying vec3 vVel; void main(){ vL = position.xy; vVel = mat3(modelMatrix)*vec3(-position.y, position.x, 0.0); vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }',
    fragmentShader: NOISE3_GLSL + `uniform float uTime; varying vec2 vL; varying vec3 vW; varying vec3 vVel;
      void main(){
        float r = length(vL), a = atan(vL.y, vL.x);
        float x = (r - 0.95)/(3.6 - 0.95);
        float sw = a + 3.0/(r*r)*0.9 - uTime*1.2/pow(r, 1.5);          // Kepler: içte hızlı dönen spiral
        float n = fbm3(vec3(cos(sw)*r*1.2, sin(sw)*r*1.2, r*3.0), 5);
        float lanes = 0.6 + 0.8*n;
        float T = pow(1.0 - x, 2.2);                                    // içe doğru ısınır
        vec3 hot = vec3(1.0, 0.95, 0.9), warm = vec3(1.0, 0.55, 0.18), cool = vec3(0.6, 0.15, 0.05);
        vec3 col = mix(mix(cool, warm, smoothstep(0.0, 0.5, T)), hot, smoothstep(0.5, 1.0, T));
        // Doppler ışınımı: bize doğru dönen yan daha parlak
        vec3 wv = normalize(vVel + vec3(0.0, 1e-6, 0.0));   // dünya uzayında yörünge hızı yönü (köşe gölgelendiricisinden)
        float dop = 1.0 + 0.75*dot(wv, normalize(cameraPosition - vW));
        float I = (0.25 + 3.2*T)*lanes*dop*dop*smoothstep(0.0, 0.05, x)*smoothstep(1.0, 0.6, x);
        gl_FragColor = vec4(col*I, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  disk.rotation.x = -Math.PI / 2 + 0.25;
  disk.name = 'disk';
  // Foton halkası + diskin bükülmüş arka görüntüsü: kameraya bakan ince parlak halka
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; void main(){ vec2 d = (vUv - 0.5)*4.4; float r = length(d);
      float ph = exp(-pow((r - 0.78)/0.035, 2.0))*2.5;
      float lens = exp(-pow((r - 1.05)/0.22, 2.0))*0.6*(0.4 + 0.6*smoothstep(-0.2, 0.9, d.y/r));
      gl_FragColor = vec4(vec3(1.0, 0.72, 0.42)*(ph + lens), 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  ring.onBeforeRender = (r, s, cam) => { ring.quaternion.copy(cam.quaternion); ring.updateMatrixWorld(); };
  bh.add(hole, disk, ring);
  bh.traverse((o) => { o.userData.noShadow = true; });
}
sim.scene.add(bh);

// --- Durum ---
let M = 10, life = buildLife(M), u = 0, cur = stateAt(life, 0);   // açılışta 10 M☉: Güneş'le farkı (renk, boy, parlaklık) hemen görülsün
let camDist = 9, camX = 0;

function setMass(m) {
  M = m;
  life = buildLife(M);
  u = 0;
  renderTimeline();
  update();
  scrub.set(0);
}

function update() {
  cur = stateAt(life, u);
  const s = cur.s;
  const key = s.key;
  const vr = key === 'bh' ? 0.7 : key === 'ns' ? 0.12 : visR(cur.R);
  const snF = key === 'sn' ? cur.f : 0;
  starMesh.visible = key !== 'bh' && !(key === 'sn' && cur.f > 0.25);
  S.corona.visible = key !== 'bh' && key !== 'sn';   // süpernovada korona yerine parlama + kabuk
  S.group.scale.setScalar(vr);
  // Görünüm evreye göre: konvektif zarf (T ≲ 7 500 K) → granül, leke, fakula, kromosfer ve proninans (manyetik etkinlik);
  // O/B/A yüzeyi ışınımsal: pürüzsüz, hafif benekli, hızlı dönüşle kutuplar sıcak. Devlerde birkaç dev konveksiyon hücresi.
  const T = key === 'ns' ? 6e5 : cur.T || 6000;
  const giant = smoothstep(3, 60, cur.R || 1);
  const conv = 1 - smoothstep(7000, 9500, T);
  const rem = key === 'wd' || key === 'ns';
  const lg = Math.log10(Math.max(cur.L, 1e-6));
  // Sıcak yıldızda da (yüzey altı ince demir-konveksiyon katmanı, manyetik rüzgâr ilmekleri) düşük karşıtlı doku kalır
  const hotTex = rem ? 0 : 0.35 * (1 - conv);
  S.set({
    T,
    gran: rem ? 1 : lerp(1, 0.22, giant),
    conv: rem ? 0 : Math.max(conv, hotTex),
    spots: (key === 'ms' || key === 'sg' ? 1 : 0.35) * Math.max(conv, hotTex * 1.4),
    grav: rem ? 0 : (1 - conv) * (key === 'ms' ? 0.06 : 0.02),
    mottle: rem ? 0.15 : 1,
    hot: rem ? 0 : 1 - conv,
    // Yüzey parlaklığı tonlamada doymasın (granül/leke seçilsin); ışıklılık farkı korona büyüklüğüyle okunur
    int: key === 'ns' ? 2.6 : key === 'wd' ? 1.7 : clamp(1.2 + lg * 0.03, 1.1, 1.45) * lerp(1, 1.3, 1 - conv),   // sıcak yıldız: merkez mavi-beyaz parlak, kenar kararır
    corona: key === 'sn' ? clamp(1 - snF * 1.3, 0, 1) * 2.5 : key === 'ns' ? 1.6 : key === 'wd' ? 0.12 : clamp(0.4 + 0.12 * lg, 0.25, 1.2) * lerp(1, 0.45, giant),
    chromo: rem ? 0 : Math.max(conv, 0.1) * (1 - giant * 0.6),   // sıcak yıldızda sert halka yok; yumuşak korona halesi
    prom: rem || key === 'sn' ? 0 : Math.max(conv, 0.45) * (1 - giant * 0.7),
  });
  polar.visible = key === 'ns';
  // Bulutsu: PN evresinde genişler, beyaz cücenin başında söner
  let neb = 0, nebR = 1;
  if (key === 'pn') { neb = smoothstep(0, 0.25, cur.f); nebR = lerp(3, 9, cur.f); }
  if (key === 'wd' && M >= 0.5) { neb = 1 - smoothstep(0, 0.25, cur.f); nebR = 9 + cur.f * 10; }
  nebula.visible = neb > 0.01;
  nebula.scale.setScalar(nebR);
  nebA.material.uniforms.uOp.value = neb * 0.9;
  nebB.material.uniforms.uOp.value = neb * 0.7;
  // Süpernova: parlama + genişleyen kabuk; kalıntı evresinin başında söner
  let shell = 0, shR = 0;
  if (key === 'sn') { shell = smoothstep(0, 0.2, cur.f); shR = lerp(1, 14, cur.f); }
  if (key === 'ns' || key === 'bh') { shell = 1 - smoothstep(0, 0.3, cur.f); shR = 14 + cur.f * 20; }
  snPts.visible = shell > 0.01;
  snMat.uniforms.uOp.value = shell;
  snShell.visible = shell > 0.01;
  snShell.scale.setScalar(Math.max(shR * 0.92, 0.01));
  snShell.material.uniforms.uOp.value = shell * 0.8;
  snMat.uniforms.uR.value = Math.max(shR, 0.01);
  flash.visible = key === 'sn' && cur.f < 0.5;
  flash.scale.setScalar(lerp(10, 60, smoothstep(0, 0.15, cur.f)) * (1 - smoothstep(0.15, 0.5, cur.f) * 0.8));
  flash.material.opacity = 1 - smoothstep(0.1, 0.5, cur.f);
  beamPivot.visible = key === 'ns';
  bh.visible = key === 'bh';
  starLabel.position.set(0, (key === 'bh' ? 3.6 : Math.max(vr, 0.5)) + 0.8, 0);
  starLabel.setText(`<b>${s.name}</b>`);
  // Karşılaştırma Güneşi yıldızın (ve bulutsunun) solunda
  const extent = Math.max(nebula.visible ? nebR * 1.25 : 0, snPts.visible ? shR : 0, key === 'bh' ? 3.8 : vr, 0.5);
  sun.position.set(-(extent + visR(1) + 1.2), 0, 0);
  camX = showSun.value ? sun.position.x / 2 + 0.4 : 0;
  camDist = 3.2 + extent * 2.6 + (showSun.value ? visR(1) * 1.5 + 1.5 : 0);
  updatePanel();
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Yıldız');
const massOf = (v) => Math.min(40, 10 ** v);
const massSl = ui.slider({ label: 'Başlangıç kütlesi', min: -1, max: 1.605, step: 0.005, value: 1,
  format: (v) => `${fmt(massOf(v), massOf(v) < 1 ? 2 : 1)} M☉`, onChange: (v) => setMass(massOf(v)) });
const presets = [['Kırmızı cüce · 0,2', 0.2], ['Güneş · 1', 1], ['Sirius A benzeri · 2', 2], ['10 M☉', 10], ['25 M☉', 25], ['40 M☉', 40]];
for (let i = 0; i < presets.length; i += 3) {
  ui.buttons(presets.slice(i, i + 3).map(([label, m]) => ({ label, onClick: () => { massSl.set(Math.log10(m)); setMass(m); } })));
}
const showSun = ui.toggle({ label: 'Karşılaştırma için Güneş', value: true, onChange: (v) => { sun.visible = v; update(); } });
ui.toggle({ label: 'Etiketler', value: true, onChange: (v) => { starLabel.visible = sunLabel.visible = v; } });

ui.section('Zaman');
const scrub = ui.slider({ label: 'Yaşam çizgisi (evrelere göre)', min: 0, max: 1, step: 0.001, value: 0, format: () => cur ? fmtAge(cur.age) : '', onInput: (v) => { u = v; update(); } });
const playSl = ui.slider({ label: 'Oynatma hızı', min: 0.2, max: 4, step: 0.1, value: 1, unit: '×' });
ui.buttons([
  { label: '⏮ Doğum', onClick: () => { u = 0; update(); scrub.set(0); } },
  { label: '⏩ Sonraki evre', variant: 'primary', onClick: () => { u = Math.min(1, cur.s.u1 + 0.001); update(); scrub.set(u); } },
  { label: '⏭ Son', onClick: () => { u = 1; update(); scrub.set(1); } },
]);
const timelineEl = ui.text('', 'card');

ui.section('Durum');
const stageTxt = ui.text('', 'card');
const st = {
  T: ui.stat({ label: 'Yüzey sıcaklığı', unit: 'K' }),
  L: ui.stat({ label: 'Işıklılık', unit: 'L☉' }),
  R: ui.stat({ label: 'Yarıçap', unit: 'R☉' }),
  M: ui.stat({ label: 'Kütle', unit: 'M☉' }),
};
const fateTxt = ui.text('', 'card');

// HR diyagramı (özel tuval)
const hrWrap = document.createElement('div');
hrWrap.className = 'chart';
hrWrap.innerHTML = '<div class="chart-title">HR diyagramı: sıcaklık (sağa doğru soğuk) – ışıklılık</div>';
const hr = document.createElement('canvas');
hr.style.width = '100%';
hr.style.height = '230px';
hr.style.display = 'block';
hrWrap.append(hr);
ui.append(hrWrap);
const hrCtx = hr.getContext('2d');
const LT0 = Math.log10(200000), LT1 = Math.log10(2200), LL0 = -5, LL1 = 7;

function drawHR() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = hr.clientWidth || 280, H = 230;
  if (hr.width !== Math.round(W * dpr)) { hr.width = Math.round(W * dpr); hr.height = H * dpr; }
  const g = hrCtx;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const pl = 38, pr = 8, pt = 8, pb = 26, iw = W - pl - pr, ih = H - pt - pb;
  const X = (T) => pl + iw * (Math.log10(T) - LT0) / (LT1 - LT0);
  const Y = (L) => pt + ih * (1 - (Math.log10(Math.max(L, 1e-9)) - LL0) / (LL1 - LL0));
  // sıcaklık renk şeridi
  for (let i = 0; i < iw; i += 3) {
    const T = 10 ** (LT0 + (LT1 - LT0) * (i / iw));
    g.fillStyle = cssColor(T);
    g.globalAlpha = 0.14;
    g.fillRect(pl + i, pt, 3, ih);
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(148,163,184,.2)';
  g.fillStyle = 'rgba(148,163,184,.85)';
  g.font = '10px system-ui';
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (let e = LL0 + 1; e <= LL1; e += 2) {
    const y = Y(10 ** e);
    g.beginPath(); g.moveTo(pl, y); g.lineTo(W - pr, y); g.stroke();
    g.fillText(e === 0 ? '1' : `10${sup(e)}`, pl - 4, y);
  }
  g.textAlign = 'center';
  g.textBaseline = 'top';
  for (const T of [100000, 30000, 10000, 6000, 3000]) {
    const x = X(T);
    g.beginPath(); g.moveTo(x, pt); g.lineTo(x, pt + ih); g.stroke();
    g.fillText(T >= 10000 ? `${fmt(T / 1000, 0)} bin` : fmt(T, 0), x, pt + ih + 3);
  }
  g.fillText('K', W - pr - 4, pt + ih + 13);
  // ana kol
  g.strokeStyle = 'rgba(148,163,184,.55)';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  for (let lm = -1; lm <= 1.61; lm += 0.05) {
    const m = 10 ** lm, L = lumMS(m), T = tempOf(L, radMS(m));
    lm === -1 ? g.moveTo(X(T), Y(L)) : g.lineTo(X(T), Y(L));
  }
  g.stroke();
  g.fillStyle = 'rgba(203,213,225,.7)';
  g.textAlign = 'left';
  g.fillText('ana kol', X(16000) + 8, Y(390) + 2);
  g.fillText('beyaz cüceler', X(60000), Y(3e-3) + 6);
  // Güneş
  g.fillStyle = '#fde68a';
  g.beginPath(); g.arc(X(T_SUN), Y(1), 3.5, 0, TAU); g.fill();
  g.fillText('Güneş', X(T_SUN) + 5, Y(1) - 12);
  // iz
  g.lineWidth = 1.8;
  const pts = [];
  for (let k = 0; k <= 400; k++) {
    const sp = stateAt(life, k / 400);
    if (sp.s.key === 'sn' || sp.s.key === 'bh' || sp.s.key === 'ns') break;
    pts.push([X(sp.T), Y(sp.L), k / 400 <= u]);
  }
  for (const past of [false, true]) {
    g.strokeStyle = past ? '#f8fafc' : 'rgba(248,250,252,.3)';
    g.setLineDash(past ? [] : [3, 3]);
    g.beginPath();
    let started = false;
    for (const [x, y, p] of pts) {
      if (past && !p) break;
      started ? g.lineTo(x, y) : (g.moveTo(x, y), (started = true));
    }
    g.stroke();
  }
  g.setLineDash([]);
  // anlık konum
  const k = cur.s.key;
  g.textAlign = 'left';
  if (k === 'sn') {
    g.fillStyle = '#fca5a5';
    const x = clamp(X(cur.T || 10000), pl + 10, W - pr - 90);
    g.fillText('↑ süpernova: ≈ 10⁹ L☉', x, pt + 2);
  } else if (k === 'ns' || k === 'bh') {
    g.fillStyle = '#cbd5e1';
    g.fillText(k === 'ns' ? 'Nötron yıldızı: diyagramın dışında' : 'Kara delik: ışık yaymaz', pl + 6, pt + 4);
    g.fillText(k === 'ns' ? '(≈ 10⁶ K, 12 km, X ışını)' : '(diyagramda yer almaz)', pl + 6, pt + 18);
  } else {
    const x = X(clamp(cur.T, 2300, 190000)), y = Y(cur.L);
    g.fillStyle = cssColor(cur.T);
    g.strokeStyle = '#fff';
    g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 6, 0, TAU); g.fill(); g.stroke();
  }
  g.save();
  g.translate(10, pt + ih / 2);
  g.rotate(-Math.PI / 2);
  g.textAlign = 'center';
  g.fillStyle = 'rgba(148,163,184,.85)';
  g.fillText('ışıklılık (L☉)', 0, -4);
  g.restore();
}
function sup(n) {
  const m = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  return String(n).split('').map((c) => m[c]).join('');
}

function fmtAge(y) {
  if (y < 1e3) return `${fmt(y, 0)} yıl`;
  if (y < 1e6) return `${fmt(y / 1e3, 1)} bin yıl`;
  if (y < 1e9) return `${fmt(y / 1e6, y < 1e7 ? 2 : 0)} milyon yıl`;
  return `${fmt(y / 1e9, y < 1e11 ? 2 : 0)} milyar yıl`;
}
function fmtNum(v) {
  if (!(v > 0)) return '0';
  if (v >= 1e5 || v < 1e-2) {
    const e = Math.floor(Math.log10(v));
    return `${fmt(v / 10 ** e, 1)}×10${sup(e)}`;
  }
  return fmt(v, v < 10 ? 2 : 0);
}

const STAGE_COL = { ms: '#60a5fa', sg: '#fbbf24', rgb: '#f97316', hb: '#facc15', agb: '#ef4444', pn: '#2dd4bf', wd: '#e2e8f0', bsg: '#93c5fd', rsg: '#dc2626', wr: '#a78bfa', sn: '#f472b6', ns: '#67e8f9', bh: '#475569' };

function renderTimeline() {
  // Gerçek süre oranları (kalıntı evresi hariç)
  const act = life.filter((s) => !['wd', 'ns', 'bh'].includes(s.key));
  const total = act.reduce((a, s) => a + s.dur, 0);
  const segs = act.map((s) => `<span title="${s.name}" style="flex:${Math.max(s.dur / total, 0.004)};background:${STAGE_COL[s.key]}"></span>`).join('');
  const rows = act.map((s) => `<span style="white-space:nowrap"><i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${STAGE_COL[s.key]}"></i> ${s.name}: ${fmtAge(s.dur)} (%${fmt((100 * s.dur) / total, s.dur / total < 0.01 ? 2 : 0)})</span>`).join(' · ');
  timelineEl.set(`<small><b>Yaşam çizelgesi (gerçek oranlar)</b></small>
    <div style="display:flex;height:12px;border-radius:4px;overflow:hidden;margin:6px 0;gap:1px">${segs}</div>
    <small style="line-height:1.6">${rows}</small>`);
}

function updatePanel() {
  const k = cur.s.key;
  const tm = tMS(M);
  stageTxt.set(`<div style="font-size:1.05em"><b style="color:${STAGE_COL[k]}">●</b> <b>${cur.s.name}</b></div>
    <small>Yaş: <b>${fmtAge(cur.age)}</b> · Ana kol ömrü: <b>${fmtAge(tm)}</b>${tm > 13.8e9 ? ' (evrenin yaşından uzun)' : ''}</small>`);
  st.T.set(k === 'bh' ? '—' : fmt(Math.round(cur.T / 10) * 10, 0));
  st.L.set(k === 'bh' ? '0' : fmtNum(cur.L));
  st.R.set(k === 'bh' ? '—' : k === 'ns' ? '≈ 12 km' : fmtNum(cur.R));
  const rem = cur.s.mass;
  st.M.set(k === 'bh' ? '?' : ['wd', 'ns'].includes(k) ? fmt(rem, 2) : fmt(M, M < 1 ? 2 : 1));
  const f = fate(M);
  const mw = wdMass(M);
  const endTxt = M < 0.5
    ? `<b>Son:</b> helyum beyaz cüce (kuramsal). Ana kol ömrü evrenin yaşının (13,8 milyar yıl) ${fmt(tm / 13.8e9, 0)} katı: bu kütlede <b>henüz hiçbir yıldız ölmedi</b>.`
    : f === 'wd'
      ? `<b>Son:</b> gezegenimsi bulutsu + <b>≈ ${fmt(mw, 2)} M☉ beyaz cüce</b> (Dünya boyutunda). Kütlenin ≈ %${fmt(100 * (1 - mw / M), 0)}'i uzaya geri döner.
        Beyaz cüce Chandrasekhar sınırının (≈ 1,4 M☉) altında kaldığı için elektron basıncı onu taşır.${tm > 13.8e9 ? ' Ana kol ömrü evrenin yaşından uzun: bu kütledeki yıldızların hiçbiri henüz dev olmadı.' : ''}`
      : f === 'ns'
        ? `<b>Son:</b> demir çekirdek Chandrasekhar sınırını (≈ 1,4 M☉) aşınca çöker → <b>süpernova</b> → ≈ 1,4 M☉, ≈ 12 km yarıçaplı <b>nötron yıldızı</b> (çoğu zaman pulsar).`
        : `<b>Son:</b> çekirdek çöküşü; nötron basıncı da yetmez → <b>kara delik</b>. Sınır (≈ 20–25 M☉) yaklaşıktır; rüzgârla kütle kaybı sonucu değiştirebilir.`;
  const sunCmp = `Güneş'e göre: ${fmt(M, M < 1 ? 2 : 1)} kat kütle, ana kolda ≈ ${fmtNum(lumMS(M))} kat parlak, ≈ ${fmtNum(tm / 1e10)} kat ömür.`;
  fateTxt.set(`${endTxt}<br><small>${sunCmp}</small>`);
  drawHR();
}

// --- Döngü ---
sim.formatTime = () => (cur ? fmtAge(cur.age) : '');
sim.onUpdate((dt) => {
  if (u >= 1) return;
  // İlerleme hızı: tüm yaşam ≈ 50 sn (1×); hızlı evreler görsel paylarıyla izlenebilir
  u = Math.min(1, u + (dt * playSl.value) / 50);
  update();
  scrub.set(u);
});
sim.onRender((dt) => {
  starMesh.rotation.y += dt * 0.15;
  S.update(sim.paused ? 0 : dt);
  SUN.update(sim.paused ? 0 : dt);
  diskU.uTime.value += sim.paused ? 0 : dt;
  beamPivot.rotation.y += dt * 6;
  // Kamera uzaklığını yıldızın boyuna yumuşakça uydur
  const cam = sim.camera, tg = sim.controls.target;
  const dx = (camX - tg.x) * Math.min(1, dt * 2.5);
  if (Math.abs(dx) > 1e-4) { tg.x += dx; cam.position.x += dx; }
  const d = cam.position.distanceTo(tg);
  if (Math.abs(d - camDist) > 0.05 && !dragging) {
    const nd = lerp(d, camDist, Math.min(1, dt * 2.5));
    cam.position.sub(tg).setLength(nd).add(tg);
  }
});
let dragging = false;
sim.controls.addEventListener('start', () => { dragging = true; });
sim.controls.addEventListener('end', () => { dragging = false; });

sim.onClick(() => [starMesh, sunMesh], (hit) => {
  if (hit.object === sunMesh) sim.toast('<b>Güneş</b> · 1 M☉ · 5.772 K · yaşı ≈ 4,6 milyar yıl, ana kolun ortasında');
  else sim.toast(`<b>${cur.s.name}</b> · ${fmt(cur.T, 0)} K · ${fmtNum(cur.L)} L☉ · ${fmtNum(cur.R)} R☉`);
});

sim.onReset(() => { u = 0; update(); scrub.set(0); });
new ResizeObserver(() => drawHR()).observe(hr);
renderTimeline();
update();
