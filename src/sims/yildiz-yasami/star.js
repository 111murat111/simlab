// Yıldız görseli: Planck kara cisim rengi (CIE 1931 renk eşlemesi), Eddington kenar kararması, kaynayan granülasyon,
// lekeler ve fakula, kromosfer halkası, korona ve manyetik ilmek proninansları. Parlaklık 550 nm'de Planck oranından gelir.
import { THREE, NOISE3_GLSL } from '@core';

// --- Planck → sRGB (Wyman–Sloan–Shirley 2013 çok loblu CIE eşleme fonksiyonu yaklaşımı) ---
const lobe = (l, m, s1, s2) => { const t = (l - m) / (l < m ? s1 : s2); return Math.exp(-0.5 * t * t); };
const xb = (l) => 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
const yb = (l) => 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
const zb = (l) => 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);

/** Kara cisim rengi, doğrusal sRGB, en büyük bileşen = 1. sat: görünürlük için hafif doygunluk artırımı. */
export function planckRGB(T, sat = 1) {
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) {
    const x = 1.4388e7 / (l * T);                 // c2/(λT), λ nm
    const B = x > 80 ? 0 : 1e14 / ((l / 500) ** 5 * (Math.exp(x) - 1));
    X += B * xb(l); Y += B * yb(l); Z += B * zb(l);
  }
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  r = Math.max(0, lum + (r - lum) * sat); g = Math.max(0, lum + (g - lum) * sat); b = Math.max(0, lum + (b - lum) * sat);
  const m = Math.max(r, g, b) || 1;
  return [r / m, g / m, b / m];
}

// Görünürlük için ölçülü doygunluk artışı (renk tonu Planck'tan; yalnız kroma ×1,5)
export const SAT = 1.5;
/** Sıcaklığa göre doygunluk: soğuk yıldızlar ×1,5; > 7 500 K'de azalır → sıcak yıldız diski mavi-beyaz okunur */
export function satOf(T) { const x = Math.min(1, Math.max(0, (T - 7500) / 9000)); return SAT + (0.5 - SAT) * x * x * (3 - 2 * x); }
// log10 T = 3,2 … 6,0 (1 585 K … 1 000 000 K) doku tablosu
const LUT_N = 256, LT0 = 3.2, LT1 = 6.0;
let LUT = null;
function planckLut() {
  if (LUT) return LUT;
  const d = new Uint8Array(LUT_N * 4);
  for (let i = 0; i < LUT_N; i++) {
    const T = 10 ** (LT0 + (LT1 - LT0) * (i / (LUT_N - 1))), c = planckRGB(T, satOf(T));
    d.set([c[0] * 255, c[1] * 255, c[2] * 255, 255].map(Math.round), i * 4);
  }
  LUT = new THREE.DataTexture(d, LUT_N, 1, THREE.RGBAFormat);
  LUT.magFilter = LUT.minFilter = THREE.LinearFilter;
  LUT.needsUpdate = true;
  return LUT;
}
/** Planck rengini THREE.Color (doğrusal) olarak verir. */
export function planckColor(T, out = new THREE.Color()) {
  const c = planckRGB(Math.max(1000, T), satOf(Math.max(1000, T)));
  return out.setRGB(c[0], c[1], c[2]);
}

const BB_GLSL = /* glsl */ `
uniform sampler2D uLut;
vec3 bbCol(float T){
  float x = clamp((log(max(T, 1000.0))*0.4342945 - ${LT0.toFixed(1)})/${(LT1 - LT0).toFixed(1)}, 0.0, 1.0);
  return texture2D(uLut, vec2(x*${((LUT_N - 1) / LUT_N).toFixed(5)} + ${(0.5 / LUT_N).toFixed(5)}, 0.5)).rgb;
}
// 550 nm'de Planck parlaklık oranı B(T)/B(T0): kenar kararması ve granül karşıtlığı fiziksel olarak buradan çıkar
float bbI(float T, float T0){
  float x = 26160.0/max(T, 800.0), x0 = 26160.0/max(T0, 800.0);
  return (exp(min(x0, 60.0)) - 1.0)/max(exp(min(x, 60.0)) - 1.0, 1e-6);
}
`;

// Kaynayan Worley: hücre merkezleri zamanla salınır → granüller şişer, bölünür, kaybolur. F1 ve F2 döner.
const BOIL_GLSL = /* glsl */ `
vec2 boil(vec3 p, float t){
  vec3 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec3 g = vec3(x, y, z), c = i + g;
    vec3 h = vec3(h13(c), h13(c + 11.3), h13(c + 27.1));
    vec3 o = 0.5 + 0.42*sin(t*(0.6 + 0.8*h.zxy) + 6.2831*h);
    float d = length(g + o - f);
    if (d < d1){ d2 = d1; d1 = d; } else if (d < d2){ d2 = d; }
  }
  return vec2(d1, d2);
}
// Granül parlaklığı 0..1 (merkez parlak, ince koyu şerit); piksel ayak izi büyükse ortalamaya (0,5) söner
float granule(vec3 q, float t){
  vec2 F = boil(q, t);
  float lane = smoothstep(0.0, 0.16, F.y - F.x);
  float g = (1.0 - 0.75*F.x)*lane;
  float aa = 1.0 - smoothstep(0.35, 0.9, length(fwidth(q)));
  return mix(0.5, clamp(g, 0.0, 1.0), aa);
}
`;

const SURF_VS = /* glsl */ `varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`;

const SURF_FS = NOISE3_GLSL + BB_GLSL + BOIL_GLSL + /* glsl */ `
uniform float uTeff, uTime, uGran, uConv, uSpots, uInt, uSeed, uGrav, uMottle, uHot;
varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  vec3 p = normalize(vP + vec3(1e-6));
  vec3 nn = normalize(vN + vec3(0.0, 0.0, 1e-6)), vv = normalize(vV + vec3(0.0, 0.0, 1e-6));
  float mu = clamp(dot(nn, vv), 0.0, 1.0);
  float t = uTime, s = uSeed*13.0;
  // Granülasyon: granül + mezogranül (ağ) + süpergranül modülasyonu; uGran = hücre sıklığı
  float fq = 15.0*uGran;
  float g1 = granule(p*fq + s, t*0.9);
  float g2 = granule(p*fq*2.3 + s + 7.0, t*1.4);
  float meso = fbm3(p*fq*0.28 + s + vec3(0.0, t*0.02, 0.0), 3);
  vec3 qs = p*4.0*uGran + s; float sup = mix(0.55, boil(qs, t*0.05).x, 1.0 - smoothstep(0.35, 0.9, length(fwidth(qs))));
  float gran = (g1*0.72 + g2*0.28)*(0.8 + 0.4*meso) - 0.12*(1.0 - smoothstep(0.05, 0.35, sup));
  // Aktif kuşaklar (±5–35° enlem): lekeler ve parlak fakula
  float lat = abs(p.y);
  float belt = smoothstep(0.06, 0.16, lat)*(1.0 - smoothstep(0.42, 0.6, lat));
  float act = smoothstep(0.52, 0.68, fbm3(p*2.4 + s + 40.0, 4))*belt;
  float sn = fbm3(p*6.5 + s + 3.0 + vec3(t*0.004), 5) + 0.15*(vn3(p*40.0 + s) - 0.5);
  float umb = smoothstep(0.66, 0.70, sn)*act*uSpots;
  float pen = smoothstep(0.585, 0.64, sn)*act*uSpots;
  // Yarı gölge lifleri: leke merkezine doğru uzanan ince radyal çizgiler (açısal gürültü)
  float fib = vn3(vec3(atan(p.z, p.x)*60.0, p.y*60.0, s));
  float fac = smoothstep(0.45, 0.62, fbm3(p*18.0 + s, 3))*act*uSpots;
  // Sıcaklık alanı (Teff'e göre oran)
  // Rayleigh–Jeans bölgesinde (sıcak yıldız) parlaklık ~T ile değişir: aynı görünür karşıtlık için ΔT büyür
  float rj = 1.0 + 2.5*(1.0 - smoothstep(0.3, 1.0, uConv));
  float Tn = 1.0 + uConv*rj*((gran - 0.5)*0.075);
  // Işınımsal zarf (O/B/A): granül yok; yüzey altı demir-konveksiyon katmanının manyetik lekeleri → geniş, düşük karşıtlı benekler
  float mot = fbm3(p*2.6 + s + vec3(t*0.01), 4) - 0.5;
  float blob = 1.0 - smoothstep(0.1, 0.45, boil(p*4.5 + s + 20.0, t*0.05).x);
  Tn += (1.0 - uConv)*uMottle*(mot*0.16 + blob*0.05);
  Tn *= 1.0 + uGrav*(p.y*p.y - 0.33);                                              // hızlı dönen sıcak yıldız: kutuplar sıcak (von Zeipel)
  Tn *= 1.0 - (pen*(0.13 + 0.05*fib) + umb*0.2)*min(uConv*rj, 1.0);                       // yarı gölge ≈ 0,85 Teff, gölge ≈ 0,68 Teff
  Tn *= 1.0 + fac*0.06*pow(1.0 - mu, 1.5)*uConv;                                 // fakula kenarda görünür
  // Eddington gri atmosfer: μ yönünde görülen katman T(τ=μ)⁴ = ¾ Teff⁴ (μ + ⅔) → kenar hem soğuk hem sönük
  float Tloc = uTeff*Tn*pow(0.75*(mu + 0.6667), 0.25);
  // Işınımsal zarfta 550 nm Planck oranı kenar kararmasını az verir (u ≈ 0,3); V bandı model atmosfer değerine (u ≈ 0,4) yaklaştır
  float I = bbI(Tloc, uTeff*1.057);
  // Sıcak (ışınımsal) yıldız: 550 nm Planck oranı kenar kararmasını az verir → model atmosfer V bandı doğrusal yasası
  // I(μ) = (1 − u(1 − μ))^1,5, u ≈ 0,75 (dış %15'lik halka belirgin kararır); ince hücreli, düşük genlikli yüzey altı konveksiyon deseni (≈ %15–20) ve koyu benekler
  float gh = granule(p*fq*2.2 + s + 3.0, t*1.2), gh2 = granule(p*fq*4.6 + s + 9.0, t*1.6);
  float dark = smoothstep(0.52, 0.7, fbm3(p*5.0 + s + 60.0 + vec3(t*0.006), 4));
  I *= mix(1.0, pow(max(1.0 - 0.75*(1.0 - mu), 0.0), 1.5)*(1.0 + 0.42*(gh*0.7 + gh2*0.3 - 0.5))*(1.0 - 0.16*dark), uHot);
  vec3 c = bbCol(Tloc)*I;
  c *= 0.7 + 0.3*smoothstep(0.0, 0.05, mu);                                         // çokgen silüette koyu piksel kalmasın
  gl_FragColor = vec4(max(c*uInt, vec3(0.0)), 1.0);
}`;

// Kameraya bakan düzlem: kromosfer (ince pembe Hα halkası + spikül dikenleri) ve beyaz Thomson koronası (şeritli)
const COR_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }`;
const COR_FS = NOISE3_GLSL + /* glsl */ `
uniform vec3 uCol, uCh; uniform float uTime, uInt, uK, uRs, uChromo, uSeed, uHalo; varying vec2 vUv;
void main(){
  vec2 d = (vUv - 0.5)*2.0*uK/max(uRs, 1e-3); float r = length(d);   // r = 1: görünen disk kenarı
  if (r < 0.96) discard;                                            // iç kısım küreyle derinlikte örtülür
  float a = atan(d.y, d.x);
  vec3 dir = vec3(cos(a), sin(a), uSeed);
  float x = r - 1.0;
  // Kromosfer: ≈ %1–3 kalınlık, spiküller (ince dikey dikenler)
  float spk = vn3(dir*90.0 + vec3(0.0, 0.0, uTime*0.3))*0.6 + vn3(dir*35.0 + 3.0)*0.4;
  float hgt = 0.012 + 0.018*spk;
  float ch = smoothstep(-0.004, 0.002, x)*(1.0 - smoothstep(hgt*0.5, hgt, x))*uChromo;
  // Korona: kök parlaklığı + manyetik şeritler (miğfer akıntıları), dışa doğru ~r⁻³ söner
  float s1 = vn3(dir*4.0 + vec3(0.0, 0.0, r*0.35 - uTime*0.02));
  float s2 = vn3(dir*13.0 + vec3(3.0, 0.0, r*0.9 - uTime*0.04));
  float streak = 0.45 + 0.8*s1*s1 + 0.35*s2;
  float rr = max(r, 1.0);
  float r4 = rr*rr*rr*rr;
  // uHalo: sıcak yıldızda keskin kök yerine geniş, yumuşak hale (rüzgâr + saçılma)
  float root = mix(0.5/(r4*r4), 0.22/(rr*rr*sqrt(rr)), uHalo);
  float I = (root + 0.16*streak/(rr*rr*rr) + 0.025/rr)*smoothstep(0.96, 0.995, r);
  I *= 1.0 - smoothstep(uK*0.55, uK*0.98, r*uRs);
  vec3 col = uCol*I*uInt + uCh*ch*1.6;
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}`;

// Proninans ilmekleri: Hα'da parlayan plazma; disk dışında belirgin, disk önünde sönük (orada koyu filaman görülür)
const PROM_VS = /* glsl */ `uniform float uR0; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){
  vUv = uv;
  float taper = 0.35 + 0.65*sin(3.14159*uv.x);
  vec3 p = position - normal*uR0*(1.0 - taper);
  vec4 w = modelMatrix*vec4(p, 1.0); vW = w.xyz;
  vN = normalize(normalMatrix*normal); vec4 mv = viewMatrix*w; vV = -mv.xyz;
  gl_Position = projectionMatrix*mv;
}`;
const PROM_FS = NOISE3_GLSL + /* glsl */ `
uniform vec3 uCol, uCenter; uniform float uTime, uInt, uR, uSeed; varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
void main(){
  float core = pow(abs(dot(normalize(vN + vec3(0.0, 0.0, 1e-6)), normalize(vV + vec3(0.0, 0.0, 1e-6)))), 1.6);   // yumuşak kenar
  float thr = vn3(vec3(vUv.x*22.0 - uTime*0.12, vUv.y*6.2832, uSeed))*0.55 + vn3(vec3(vUv.x*60.0 + uTime*0.05, vUv.y*12.566, uSeed + 4.0))*0.45;
  float knot = smoothstep(0.35, 0.8, vn3(vec3(vUv.x*9.0, uSeed*3.0, uTime*0.03)));
  float I = core*(0.1 + 1.2*thr*thr*thr)*(0.35 + 0.9*knot)*smoothstep(0.0, 0.1, vUv.x)*(1.0 - smoothstep(0.9, 1.0, vUv.x));
  vec3 rd = normalize(vW - cameraPosition), oc = uCenter - cameraPosition;
  float b = length(cross(rd, oc));
  I *= mix(0.12, 1.0, smoothstep(uR*0.99, uR*1.03, b));
  gl_FragColor = vec4(max(uCol*I*uInt, vec3(0.0)), 1.0);
}`;

function loopCurve(rnd, R) {
  // Aktif kuşakta iki ayak noktası; tepe yüksekliği 0,09–0,23 R (≤ %25), hafif burulma
  const lat = (rnd() < 0.5 ? 1 : -1) * (0.15 + rnd() * 0.35), lon = rnd() * Math.PI * 2;
  const span = 0.06 + rnd() * 0.08, ang = rnd() * Math.PI;
  const c = new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon));
  const e1 = new THREE.Vector3(0, 1, 0).cross(c).normalize(), e2 = c.clone().cross(e1).normalize();
  const dir = e1.clone().multiplyScalar(Math.cos(ang)).add(e2.clone().multiplyScalar(Math.sin(ang)));
  const side = c.clone().cross(dir).normalize();
  const H = 0.09 + rnd() * 0.14, tw = (rnd() - 0.5) * 0.1;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 10, th = (u - 0.5) * span * 2;
    const h = 1 + H * Math.sin(Math.PI * u) ** 0.8 - 0.015;   // ayaklar diskin içinde
    const q = c.clone().multiplyScalar(Math.cos(th)).add(dir.clone().multiplyScalar(Math.sin(th)));
    q.addScaledVector(side, tw * Math.sin(Math.PI * u) * (1 + 0.4 * Math.sin(u * 9)));
    pts.push(q.normalize().multiplyScalar(R * h));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/**
 * Yıldız. Dönen: { group, surface, corona, prom, uniforms, set({ T, gran, conv, spots, grav, mottle, int, corona, chromo, prom }), update(dt) }
 * Grup ölçeklenir (yarıçap 1 birim).
 */
export function createStar({ T = 5772, seed = 1, prominences = 6, low = false } = {}) {
  const group = new THREE.Group();
  const U = {
    uLut: { value: planckLut() }, uTeff: { value: T }, uTime: { value: 0 }, uGran: { value: 1 }, uConv: { value: 1 }, uSpots: { value: 1 },
    uInt: { value: 1.6 }, uSeed: { value: seed }, uGrav: { value: 0 }, uMottle: { value: 1 }, uHot: { value: 0 },
  };
  const surface = new THREE.Mesh(new THREE.SphereGeometry(1, low ? 96 : 160, low ? 64 : 112), new THREE.ShaderMaterial({ uniforms: U, vertexShader: SURF_VS, fragmentShader: SURF_FS }));
  surface.userData.noShadow = true;
  group.add(surface);

  // Korona + kromosfer düzlemi (görünen kenar yarıçapına göre: perspektifte silüet r·d/√(d²−r²))
  const K = 7;
  const CU = { uCol: { value: new THREE.Color() }, uCh: { value: new THREE.Color() }, uTime: U.uTime, uInt: { value: 1 }, uK: { value: K }, uRs: { value: 1 }, uChromo: { value: 1 }, uSeed: { value: seed }, uHalo: { value: 0 } };
  const cor = new THREE.Mesh(new THREE.PlaneGeometry(2 * K, 2 * K), new THREE.ShaderMaterial({
    uniforms: CU, vertexShader: COR_VS, fragmentShader: COR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  cor.raycast = () => {};
  cor.userData.noShadow = true;
  const wc = new THREE.Vector3(), ws = new THREE.Vector3();
  cor.onBeforeRender = (r, s, cam) => {
    cor.lookAt(cam.position);                       // düzlem görüş hattına dik: silüet tam çember olur
    cor.updateMatrixWorld();
    group.getWorldPosition(wc); group.getWorldScale(ws);
    const R = ws.x, dd = Math.max(cam.position.distanceTo(wc), R * 1.01);
    CU.uRs.value = cam.isPerspectiveCamera ? 1 / Math.sqrt(Math.max(1 - (R / dd) ** 2, 0.02)) : 1;
  };
  group.add(cor);

  // Proninans ilmekleri (yüzeyle birlikte döner)
  const prom = new THREE.Group();
  const PU = { uCol: { value: new THREE.Color() }, uCenter: { value: new THREE.Vector3() }, uTime: U.uTime, uInt: { value: 1 }, uR: { value: 1 }, uSeed: { value: seed }, uR0: { value: 0.011 } };
  const pm = new THREE.ShaderMaterial({ uniforms: PU, vertexShader: PROM_VS, fragmentShader: PROM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const rnd = mulberry(Math.round(seed * 1000) + 7);
  for (let i = 0; i < prominences; i++) {
    const curve = loopCurve(rnd, 1);
    // İlmek demeti: 2–3 ince iplik yan yana
    const n = 2;
    for (let k = 0; k < n; k++) {
      const off = new THREE.Vector3((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.02);
      const c2 = new THREE.CatmullRomCurve3(curve.points.map((p, j) => p.clone().addScaledVector(off, Math.sin(Math.PI * j / 10))));
      const m = new THREE.Mesh(new THREE.TubeGeometry(c2, low ? 40 : 64, 0.011 + rnd() * 0.008, 8, false), pm);
      m.userData.noShadow = true;
      m.raycast = () => {};
      prom.add(m);
    }
  }
  surface.add(prom);
  prom.children.forEach((m) => { m.onBeforeRender = () => { group.getWorldPosition(PU.uCenter.value); group.getWorldScale(ws); PU.uR.value = ws.x; }; });

  const api = {
    group, surface, corona: cor, prom, uniforms: U,
    /** Görünüm: T (K), gran (hücre sıklığı çarpanı), conv (konvektif zarf 0–1), spots, grav, mottle, int, corona, chromo, prom (0–1) */
    set(o) {
      if (o.T != null) {
        U.uTeff.value = o.T;
        planckColor(o.T, CU.uCol.value);
        CU.uCol.value.lerp(new THREE.Color(1, 1, 1), 0.35);                 // korona: sıcak plazmadan saçılan fotosfer ışığı (inci beyazı)
        // Kromosfer / proninans: Hα (656 nm) pembesi; sıcak yıldızda yıldız rengine kayar
        const hot = Math.min(1, Math.max(0, (o.T - 7000) / 6000));
        CU.uCh.value.setRGB(1.0, 0.3, 0.3).lerp(planckColor(o.T), hot);
        PU.uCol.value.setRGB(1.0, 0.24, 0.3).lerp(planckColor(o.T), hot * 0.35);
      }
      for (const [k, u] of [['gran', 'uGran'], ['conv', 'uConv'], ['spots', 'uSpots'], ['grav', 'uGrav'], ['mottle', 'uMottle'], ['hot', 'uHot'], ['int', 'uInt']]) if (o[k] != null) U[u].value = o[k];
      if (o.corona != null) CU.uInt.value = o.corona;
      if (o.chromo != null) CU.uChromo.value = o.chromo;
      if (o.hot != null) CU.uHalo.value = o.hot;
      if (o.prom != null) { PU.uInt.value = o.prom * 2.4; prom.visible = o.prom > 0.01; }
      return api;
    },
    update(dt) { U.uTime.value += dt; },
  };
  return api;
}
