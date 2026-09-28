// Gezegen ve yıldız görselleri (yerel yardımcı; motorda gezegen shader'ı yok): prosedürel yüzeyler (Dünya: okyanus, kıta,
// buz, gece ışıkları; kayalık: kraterler; gaz devi: türbülanslı bantlar), bulut katmanı, atmosfer kenar ışıması, gölgeli
// halka ve granüllü, bloom ile parlayan yıldız + korona. Aynı dosya diğer uzay simülasyonlarına kopyalanır (çapraz import yok).
import { THREE, NOISE3_GLSL } from '@core';

/** Tüm gezegen malzemelerinin paylaştığı yıldız konumu (dünya); simülasyon her karede günceller. */
export const starUniform = { value: new THREE.Vector3() };

const AA_GLSL = /* glsl */ `
float fwA(vec3 q){ return 1.0 - smoothstep(0.3, 0.8, length(fwidth(q))); }
float vnA(vec3 q){ return mix(0.5, vn3(q), fwA(q)); }
float fbmA(vec3 q, int oct){
  float fw = length(fwidth(q)), s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a*mix(0.5, vn3(q), 1.0 - smoothstep(0.3, 0.8, fw)); q = q*2.03 + 17.1; fw *= 2.03; a *= 0.5; }
  return s;
}
float ridgeA(vec3 q, int oct){
  float fw = length(fwidth(q)), s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; float r = 1.0 - abs(vn3(q)*2.0 - 1.0); s += a*mix(0.5, r*r, 1.0 - smoothstep(0.3, 0.8, fw)); q = q*2.07 + 5.3; fw *= 2.07; a *= 0.5; }
  return s;
}
// Worley F1 (hücre)
float cellsA(vec3 p){
  vec3 i = floor(p), f = fract(p); float d = 1.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec3 g = vec3(x, y, z); vec3 o = vec3(h13(i + g), h13(i + g + 11.3), h13(i + g + 27.1));
    d = min(d, length(g + o - f));
  }
  return mix(0.55, d, fwA(p));
}
// Krater alanı: çanak + sırt + hafif fırlatı örtüsü; dens = hücre başına krater olasılığı
float craterField(vec3 p, float dens, out float rayOut){
  vec3 i = floor(p), f = fract(p); float h = 0.0; rayOut = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec3 g = vec3(x, y, z), c = i + g;
    if (h13(c + 5.1) > dens) continue;
    vec3 o = vec3(h13(c), h13(c + 11.3), h13(c + 27.1));
    float d = length(g + o - f), R = 0.16 + 0.32*h13(c + 41.7), x2 = d/R;
    float bowl = x2 < 1.0 ? (x2*x2 - 1.0) : 0.0;
    float rim = exp(-pow((x2 - 1.0)*3.5, 2.0))*0.45;
    float ej = x2 > 1.0 ? exp(-(x2 - 1.0)*2.5)*0.12 : 0.0;
    h += (bowl*0.9 + rim + ej)*R;
    rayOut = max(rayOut, (x2 > 0.9 ? exp(-(x2 - 1.0)*1.6) : 0.4)*step(0.8, h13(c + 63.0)));
  }
  float aa = fwA(p);
  rayOut *= aa;
  return h*aa;
}
`;

// Yüzey desenleri: p = birim küre üzerindeki nesne konumu, lat = p.y
const SURF = {
  earth: /* glsl */ `
    vec3 q = p*1.25 + uSeed*7.3;
    vec3 w = vec3(fbmA(q*1.8, 4), fbmA(q*1.8 + 9.2, 4), fbmA(q*1.8 + 3.7, 4)) - 0.5;
    float c = fbmA(q + w*0.85, 7) + 0.04*(ridgeA(q*6.0, 4) - 0.5);
    float lat = abs(p.y), sea = uSea;
    float land = smoothstep(sea - 0.004, sea + 0.004, c);
    float shelf = smoothstep(sea - 0.07, sea, c);
    vec3 ocean = mix(vec3(0.006, 0.022, 0.07), vec3(0.018, 0.09, 0.16), shelf);
    ocean = mix(ocean, vec3(0.03, 0.14, 0.2), smoothstep(sea - 0.012, sea, c)*0.6);
    float m1 = fbmA(p*5.0 + 3.0, 5), m2 = fbmA(p*14.0 + 8.0, 4);
    float mount = ridgeA(p*3.5 + w, 6);
    float elev = (c - sea)*6.0 + mount*0.4;
    // İklim kuşakları: ekvator ormanı, dönenceler çölü, ılıman, tundra, buz
    float desert = smoothstep(0.16, 0.26, lat)*(1.0 - smoothstep(0.42, 0.52, lat));
    desert = clamp(desert*1.4 + (m1 - 0.5)*1.2 - smoothstep(0.02, 0.0, c - sea)*0.4, 0.0, 1.0);
    vec3 forest = mix(vec3(0.030, 0.060, 0.022), vec3(0.06, 0.085, 0.035), m2);
    vec3 grass = mix(vec3(0.12, 0.13, 0.06), vec3(0.18, 0.16, 0.08), m2);
    vec3 sand = mix(vec3(0.42, 0.30, 0.16), vec3(0.56, 0.42, 0.25), m2);
    vec3 tundra = vec3(0.16, 0.15, 0.12)*(0.8 + 0.4*m2);
    vec3 lc = mix(forest, grass, smoothstep(0.35, 0.65, m1 + lat*0.4));
    lc = mix(lc, sand, desert);
    lc = mix(lc, tundra, smoothstep(0.62, 0.74, lat + (m1 - 0.5)*0.15));
    lc = mix(lc, vec3(0.22, 0.2, 0.18)*(0.8 + 0.4*m2), smoothstep(0.55, 0.8, elev*0.5 + mount*0.6)*0.8);
    float ice = smoothstep(0.84, 0.88, lat + (m1 - 0.5)*0.12 + smoothstep(0.6, 0.9, elev)*0.1);
    col = mix(ocean, lc, land);
    col = mix(col, vec3(0.78, 0.82, 0.88)*(0.92 + 0.1*m2), ice);
    rough = mix(0.55 + 0.1*m2, 0.88, max(land, ice*0.8));
    h = land*(0.3 + mount*0.9 + m2*0.2) + ice*0.1;
    // Gece ışıkları: kıyıya yakın ılıman/tropik kara, çöl ve buz dışında kümeler
    float coast = 1.0 - smoothstep(0.0, 0.05, c - sea);
    float city = smoothstep(0.62, 0.9, vnA(p*70.0 + 4.0))*smoothstep(0.35, 0.6, fbmA(p*9.0 + 2.0, 4) + coast*0.25);
    city += smoothstep(0.82, 0.95, vnA(p*160.0))*0.5*smoothstep(0.45, 0.6, fbmA(p*6.0, 3));
    emis = vec3(1.0, 0.58, 0.26)*city*land*(1.0 - desert*0.8)*(1.0 - ice)*(1.0 - smoothstep(0.7, 0.8, lat))*uLights;`,
  rocky: /* glsl */ `
    vec3 q = p + uSeed*5.1;
    float m1 = fbmA(q*2.2, 6), m2 = fbmA(q*9.0, 4);
    float ray = 0.0, ray2 = 0.0;
    float cr = craterField(q*3.0, 0.5, ray)*1.0 + craterField(q*8.0 + 3.0, 0.6, ray2)*0.45 + craterField(q*22.0 + 7.0, 0.7, ray2)*0.2;
    float maria = smoothstep(0.5, 0.62, fbmA(q*1.3 + 11.0, 5))*uMaria;
    col = mix(uC1, uC2, smoothstep(0.3, 0.7, m1));
    col = mix(col, uC3, maria*0.85);
    col *= 0.85 + 0.3*m2;
    col *= 1.0 + 0.9*cr;
    col = mix(col, uC4, ray*0.35*(1.0 - maria*0.5));
    // Kutup başlıkları (Mars)
    float cap = smoothstep(uCap, uCap + 0.03, abs(p.y) + (m1 - 0.5)*0.1);
    col = mix(col, vec3(0.8, 0.8, 0.82), cap);
    rough = 0.9;
    h = cr*2.4 + m2*0.15 - maria*0.1;`,
  gas: /* glsl */ `
    vec3 q = p + uSeed*3.3;
    vec3 w = vec3(fbmA(vec3(q.x*2.0, q.y*8.0, q.z*2.0), 5), fbmA(vec3(q.x*2.0, q.y*8.0, q.z*2.0) + 7.7, 5), 0.0) - 0.5;
    vec3 sq = vec3(q.x*1.6, q.y*uStretch, q.z*1.6) + vec3(w.x, 0.0, w.y)*1.6;
    float turb = fbmA(sq, 6);
    float yy = p.y + (turb - 0.5)*0.09*uTurb + 0.012*sin(atan(p.z, p.x)*5.0 + p.y*30.0)*uTurb;
    float b1 = vnA(vec3(yy*uBands, 0.5, uSeed*9.0)), b2 = vnA(vec3(yy*uBands*2.7, 3.1, uSeed*9.0));
    float band = b1*0.7 + b2*0.3;
    col = mix(uC1, uC2, smoothstep(0.25, 0.75, band));
    col = mix(col, uC3, smoothstep(0.55, 0.85, b2)*0.7);
    col *= 0.86 + 0.28*turb;
    // Fırtına: elips biçimli dev leke
    float lon = atan(p.z, p.x), la = asin(clamp(p.y, -1.0, 1.0));
    vec2 sd = vec2((lon - 1.2)*cos(la)/0.16, (la - uSpotLat)/0.075);
    float sp = length(sd);
    float swirl = fbmA(vec3(sd*1.5 + vec2(sin(sp*3.0), cos(sp*3.0)), 2.0), 3);
    col = mix(col, uC4*(0.8 + 0.4*swirl), smoothstep(1.0, 0.55, sp)*uSpot);
    // Kutuplara doğru koyulaşma (kutup başlığı)
    col *= mix(1.0, 0.72, smoothstep(0.7, 0.98, abs(p.y)));
    rough = 0.75;
    h = turb*0.3;`,
};

const PLANET_VS_HEAD = 'varying vec3 vPO; varying vec3 vWN; varying vec3 vWP;';
const PLANET_VS_BODY = `vPO = normalize(position); vWN = normalize(mat3(modelMatrix)*objectNormal); vWP = (modelMatrix*vec4(transformed, 1.0)).xyz;`;

const DEFAULTS = {
  earth: { sea: 0.5, lights: 1, atm: 0x5aa0ff, atmK: 1 },
  rocky: { c1: 0x6d6964, c2: 0x8f8b85, c3: 0x4a4744, c4: 0xb8b4ac, maria: 0.4, cap: 2, atmK: 0 },
  gas: { c1: 0xc9b393, c2: 0x8b5d3b, c3: 0xefe6d6, c4: 0xa24a2e, bands: 15, stretch: 14, turb: 1, spot: 0, spotLat: -0.38 },
};

/**
 * Gezegen yüzey malzemesi (MeshStandardMaterial + prosedürel desen; motorun yıldız ışığı ve gölgesiyle aydınlanır).
 * kind: 'earth' | 'rocky' | 'gas'; o: renkler (c1..c4), seed, sea, lights, maria, cap (kutup başlığı enlemi, 0–1),
 *       bands, stretch, turb, spot, spotLat, atm (kenar ışıma rengi), atmK (0–1), bump (dünya birimi)
 */
export function planetMaterial(kind, o = {}) {
  const P = { seed: Math.random(), bump: 0.01, atm: 0x8fb4ff, atmK: 0.4, ...DEFAULTS[kind], ...o };
  const C = (x) => new THREE.Color(x);
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  const U = {
    uStar: starUniform, uSeed: { value: P.seed }, uBump: { value: P.bump }, uAtm: { value: C(P.atm) }, uAtmK: { value: P.atmK },
    uSea: { value: P.sea ?? 0.5 }, uLights: { value: P.lights ?? 0 }, uMaria: { value: P.maria ?? 0 }, uCap: { value: P.cap ?? 2 },
    uC1: { value: C(P.c1 ?? 0xffffff) }, uC2: { value: C(P.c2 ?? 0xffffff) }, uC3: { value: C(P.c3 ?? 0xffffff) }, uC4: { value: C(P.c4 ?? 0xffffff) },
    uBands: { value: P.bands ?? 12 }, uStretch: { value: P.stretch ?? 12 }, uTurb: { value: P.turb ?? 1 }, uSpot: { value: P.spot ?? 0 }, uSpotLat: { value: P.spotLat ?? -0.38 },
  };
  m.userData.uniforms = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + PLANET_VS_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + PLANET_VS_BODY);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${PLANET_VS_HEAD}
        uniform vec3 uStar, uAtm, uC1, uC2, uC3, uC4; uniform float uSeed, uBump, uAtmK, uSea, uLights, uMaria, uCap, uBands, uStretch, uTurb, uSpot, uSpotLat;
        ${NOISE3_GLSL}
        ${AA_GLSL}
        float sRough, sH; vec3 sEmis;
        void surface(vec3 p, inout vec3 col, inout float rough, inout float h, inout vec3 emis){ ${SURF[kind]} }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 c = diffuseColor.rgb; sRough = roughness; sH = 0.0; sEmis = vec3(0.0);
          surface(normalize(vPO), c, sRough, sH, sEmis); diffuseColor.rgb = c; }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = sRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1);
          float dhx = dFdx(sH)*uBump, dhy = dFdy(sH)*uBump;
          vec3 grad = sign(det)*(dhx*r1 + dhy*r2);
          normal = normalize(abs(det)*normal - grad);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 L = normalize(uStar - vWP), N = normalize(vWN);
          float ndl = dot(N, L);
          float night = smoothstep(0.08, -0.12, ndl);
          totalEmissiveRadiance += sEmis*night*1.6;
          // Atmosfer: diskin kenarında yıldızın aydınlattığı mavi saçılma
          float nv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          float lit = smoothstep(-0.25, 0.45, ndl);
          totalEmissiveRadiance += uAtm*uAtmK*(pow(1.0 - nv, 3.0)*1.4 + 0.06)*lit;
        }`);
  };
  m.customProgramCacheKey = () => 'planet-' + kind;
  return m;
}

/** Bulut katmanı (yarı saydam; yıldız ışığıyla aydınlanır, gece tarafı kararır). */
export function cloudMaterial({ seed = Math.random(), cover = 0.5, color = 0xffffff, bands = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, transparent: true, depthWrite: false });
  const U = { uSeed: { value: seed }, uCover: { value: cover }, uCBands: { value: bands } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPO;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPO = normalize(position);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vPO; uniform float uSeed, uCover, uCBands;\n${NOISE3_GLSL}\n${AA_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 p = normalize(vPO), q = p*1.6 + uSeed*11.0;
          float lat = p.y;
          // Enleme bağlı akış: bulut şeritleri doğu–batı uzar, orta enlemlerde siklon girdapları
          vec3 w = vec3(fbmA(q*2.0, 4), fbmA(q*2.0 + 5.2, 4), fbmA(q*2.0 + 9.4, 4)) - 0.5;
          vec3 sq = vec3(q.x, q.y*(2.2 + uCBands), q.z) + w*1.2;
          float n = fbmA(sq*2.2, 7);
          float det = fbmA(q*18.0 + w*3.0, 4);
          float belt = 0.10*exp(-lat*lat*90.0) + 0.08*smoothstep(0.4, 0.75, abs(lat)) - 0.06*smoothstep(0.15, 0.3, abs(lat))*(1.0 - smoothstep(0.35, 0.45, abs(lat)));
          float a = smoothstep(1.0 - uCover - 0.06, 1.0 - uCover + 0.22, n + belt + (det - 0.5)*0.18);
          diffuseColor.a *= a*0.96;
          diffuseColor.rgb *= 0.86 + 0.18*det;
        }`);
  };
  m.customProgramCacheKey = () => 'planet-clouds';
  return m;
}

const ATM_VS = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const ATM_FS = /* glsl */ `
uniform vec3 uCenter, uStar, uCol; uniform float uR, uRa, uK; varying vec3 vW;
void main(){
  vec3 rd = normalize(vW - cameraPosition), oc = uCenter - cameraPosition;
  float t = dot(oc, rd); vec3 cp = cameraPosition + rd*max(t, 0.0);
  float b = length(cp - uCenter);
  float hN = clamp((b - uR)/(uRa - uR), 0.0, 1.0);
  float dens = exp(-hN*4.5)*(1.0 - hN);
  vec3 n = normalize(cp - uCenter), L = normalize(uStar - uCenter);
  float lit = smoothstep(-0.35, 0.5, dot(n, L));
  float fwd = pow(max(dot(rd, L), 0.0), 6.0)*1.5;  // yıldıza karşı ileri saçılma (ters ışıkta parlak halka)
  vec3 c = uCol*dens*(lit + fwd)*uK;
  gl_FragColor = vec4(c, 1.0);
}`;

/** Diskin dışına taşan atmosfer halesi (arka yüz kabuk, eklemeli). */
export function atmosphereShell(radius, color, strength = 1, thick = 0.06) {
  const U = { uCenter: { value: new THREE.Vector3() }, uStar: starUniform, uCol: { value: new THREE.Color(color) }, uR: { value: radius }, uRa: { value: radius * (1 + thick) }, uK: { value: strength } };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * (1 + thick), 64, 32), new THREE.ShaderMaterial({
    uniforms: U, vertexShader: ATM_VS, fragmentShader: ATM_FS, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  mesh.onBeforeRender = () => { mesh.getWorldPosition(U.uCenter.value); };
  mesh.raycast = () => {};
  mesh.userData.noShadow = true;
  return mesh;
}

const RING_VS = /* glsl */ `varying vec3 vW; varying vec3 vL; void main(){ vL = position; vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const RING_FS = NOISE3_GLSL + /* glsl */ `
uniform vec3 uCenter, uStar, uC1, uC2, uNormal; uniform float uR, uIn, uOut, uSeed, uOpacity; varying vec3 vW; varying vec3 vL;
void main(){
  float r = length(vL.xy), x = (r - uIn)/(uOut - uIn);
  if (x < 0.0 || x > 1.0) discard;
  float n1 = vn3(vec3(x*38.0, uSeed, 0.0)), n2 = vn3(vec3(x*140.0, uSeed + 3.0, 0.0)), n3 = vn3(vec3(x*520.0, uSeed + 7.0, 0.0));
  float dens = 0.35 + 0.45*n1 + 0.25*n2 + 0.15*n3;
  dens *= 1.0 - 0.9*smoothstep(0.012, 0.0, abs(x - 0.64));         // Cassini boşluğu
  dens *= 1.0 - 0.5*smoothstep(0.0, 0.25, 0.25 - x)*0.8;             // iç C halkası daha seyrek
  dens *= smoothstep(0.0, 0.03, x)*smoothstep(1.0, 0.96, x);
  dens *= 1.0 - 0.7*smoothstep(0.012, 0.0, abs(x - 0.9));             // Encke
  float a = clamp(dens, 0.0, 1.0)*uOpacity;
  vec3 col = mix(uC1, uC2, n1*0.6 + n2*0.4);
  // Aydınlatma: yıldız ışığının halka düzlemine açısı + gezegen gölgesi (analitik küre kesişimi)
  vec3 L = normalize(uStar - vW);
  float nl = abs(dot(normalize(uNormal), L));
  vec3 oc = vW - uCenter; float bb = dot(oc, L), cc = dot(oc, oc) - uR*uR, disc = bb*bb - cc;
  float shadow = (disc > 0.0 && -bb - sqrt(max(disc, 0.0)) > 0.0) ? 0.06 : 1.0;
  vec3 V = normalize(cameraPosition - vW);
  float back = pow(max(dot(-V, L), 0.0), 4.0)*(1.0 - a)*1.5;         // ters ışıkta ince toz parlar
  vec3 c = col*(0.12 + 1.9*(0.35 + 0.65*nl))*shadow + col*back*shadow;
  gl_FragColor = vec4(c, a);
}`;

/** Gezegen halkası (gölge alan, yarı saydam; iç/dış yarıçap gezegen yarıçapı cinsinden). */
export function ringMesh(radius, { inner = 1.24, outer = 2.27, c1 = 0xcdb994, c2 = 0x8d7a5e, opacity = 0.92, seed = Math.random() } = {}) {
  const g = new THREE.RingGeometry(radius * inner, radius * outer, 256, 1);
  const U = {
    uCenter: { value: new THREE.Vector3() }, uStar: starUniform, uC1: { value: new THREE.Color(c1) }, uC2: { value: new THREE.Color(c2) },
    uNormal: { value: new THREE.Vector3() }, uR: { value: radius }, uIn: { value: radius * inner }, uOut: { value: radius * outer },
    uSeed: { value: seed * 10 }, uOpacity: { value: opacity },
  };
  const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: RING_VS, fragmentShader: RING_FS, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  const q = new THREE.Quaternion();
  mesh.onBeforeRender = () => {
    mesh.parent.getWorldPosition(U.uCenter.value);
    mesh.getWorldQuaternion(q);
    U.uNormal.value.set(0, 0, 1).applyQuaternion(q);
  };
  mesh.raycast = () => {};
  mesh.userData.noShadow = true;
  return mesh;
}

// --- Yıldız ---
const STAR_VS = /* glsl */ `varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`;
const STAR_FS = NOISE3_GLSL + AA_GLSL + /* glsl */ `
uniform vec3 uCol; uniform float uTime, uInt, uSpots, uGran, uLimb; varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  vec3 p = normalize(vP);
  float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  vec3 drift = vec3(0.0, 0.0, uTime*0.02);
  float g1 = cellsA(p*42.0*uGran + drift), g2 = cellsA(p*95.0*uGran - drift*1.7);
  float gran = (1.0 - g1)*0.65 + (1.0 - g2)*0.35;                   // granül merkezleri parlak, arası koyu şerit
  float sup = fbmA(p*5.0 + uTime*0.004, 5);
  float act = smoothstep(0.55, 0.75, fbmA(p*2.2 + 20.0, 4))*(1.0 - smoothstep(0.25, 0.55, abs(p.y)));
  float spot = smoothstep(0.62, 0.7, fbmA(p*7.0 + 3.0, 5))*act*uSpots;
  float pen = smoothstep(0.55, 0.62, fbmA(p*7.0 + 3.0, 5))*act*uSpots;
  float fac = smoothstep(0.5, 0.65, fbmA(p*14.0, 4))*act*(1.0 - mu);   // fakula: kenarda parlak
  float limb = mix(1.0, 0.38 + 0.62*pow(mu, 0.55), uLimb);                              // kenar kararması
  vec3 tint = mix(vec3(1.0, 0.45, 0.18), vec3(1.0), pow(mu, 0.35));   // kenar kızıllaşması
  vec3 c = uCol*tint*limb*(0.72 + 0.42*gran + 0.25*(sup - 0.5));
  c *= 1.0 - 0.55*pen - 0.4*spot;
  c += uCol*fac*0.5;
  gl_FragColor = vec4(c*uInt, 1.0);
}`;
const CORONA_FS = NOISE3_GLSL + /* glsl */ `
uniform vec3 uCol; uniform float uTime, uInt, uK; varying vec2 vUv;
void main(){
  vec2 d = (vUv - 0.5)*2.0*uK; float r = length(d);
  if (r < 0.97) discard;
  float a = atan(d.y, d.x);
  vec3 dir = vec3(cos(a), sin(a), 0.0);
  float s1 = vn3(dir*4.0 + vec3(0.0, 0.0, r*0.35 - uTime*0.03));
  float s2 = vn3(dir*11.0 + vec3(3.0, 0.0, r*0.8 - uTime*0.05));
  float streak = 0.55 + 0.7*s1*s1 + 0.35*s2;
  float x = r - 1.0;
  float I = exp(-x*9.0)*1.0 + exp(-x*2.2)*0.3*streak + exp(-x*0.7)*0.025;
  I *= smoothstep(uK, uK*0.55, r);
  gl_FragColor = vec4(uCol*I*uInt, 1.0);
}`;

/**
 * Yıldız: granüllü yüzey (HDR, bloom ile parlar), kenar kararması, lekeler ve korona. color: yıldızın rengi (sıcaklık).
 * Dönen nesne: { group, surface, corona, setColor(hex), update(dt) }
 */
export function createStar(radius, { color = 0xffd9a8, intensity = 7, spots = 1, corona = 1, gran = 1, limb = 1 } = {}) {
  const group = new THREE.Group();
  const U = { uCol: { value: new THREE.Color(color) }, uTime: { value: 0 }, uInt: { value: intensity }, uSpots: { value: spots }, uGran: { value: gran }, uLimb: { value: limb } };
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), new THREE.ShaderMaterial({ uniforms: U, vertexShader: STAR_VS, fragmentShader: STAR_FS }));
  surface.userData.noShadow = true;
  group.add(surface);
  const K = 7;
  const CU = { uCol: U.uCol, uTime: U.uTime, uInt: { value: intensity * 0.3 * corona }, uK: { value: K } };
  const cor = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2 * K, radius * 2 * K), new THREE.ShaderMaterial({
    uniforms: CU, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
    fragmentShader: CORONA_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  cor.raycast = () => {};
  cor.userData.noShadow = true;
  const cq = new THREE.Quaternion();
  cor.onBeforeRender = (r, s, cam) => { cor.parent.getWorldQuaternion(cq).invert(); cor.quaternion.copy(cq).multiply(cam.quaternion); cor.updateMatrixWorld(); };
  group.add(cor);
  return {
    group, surface, corona: cor, uniforms: U,
    setColor(c) { U.uCol.value.set(c); },
    setIntensity(v) { U.uInt.value = v; CU.uInt.value = v * 0.3 * corona; },
    setCorona(k) { corona = k; CU.uInt.value = U.uInt.value * 0.3 * k; },
    update(dt) { U.uTime.value += dt; },
  };
}

/** Yıldız rengi (yaklaşık kara cisim, sRGB hex) — sıcaklık K. */
export function starColor(T) {
  // Tanner Helland yaklaşımı
  const t = T / 100;
  let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = (v) => Math.max(0, Math.min(255, v)) / 255;
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

// --- Hazır gezegen tipleri ---
export const PLANET_LOOKS = {
  merkur: { kind: 'rocky', c1: 0x6b6560, c2: 0x8e8881, c3: 0x5a5550, c4: 0xc4bfb6, maria: 0.25, spin: 0.2, tilt: 0 },
  venus: { kind: 'gas', c1: 0xd9c08d, c2: 0xb99a62, c3: 0xece0c2, c4: 0xd9c08d, bands: 5, stretch: 6, turb: 1.6, atm: 0xffd9a0, atmK: 0.5, spin: -0.1, tilt: 0.05 },
  dunya: { kind: 'earth', clouds: 0.5, atm: 0x4d8dff, atmK: 1, spin: 0.9, tilt: 0.41, halo: 0x5d9bff },
  mars: { kind: 'rocky', c1: 0x8a4a2a, c2: 0xa85f36, c3: 0x5a3322, c4: 0xc07a4c, maria: 0.55, cap: 0.9, atm: 0xe0a080, atmK: 0.25, spin: 0.85, tilt: 0.44, halo: 0xd89b7a, haloK: 0.35 },
  jupiter: { kind: 'gas', c1: 0xd8c4a4, c2: 0x9a6a45, c3: 0xf2ece0, c4: 0xb5553a, bands: 16, stretch: 16, turb: 1.1, spot: 1, spotLat: -0.38, atm: 0xd9c9ae, atmK: 0.25, spin: 2.2, tilt: 0.05 },
  saturn: { kind: 'gas', c1: 0xe0cc9e, c2: 0xb99a66, c3: 0xf1e6c8, c4: 0xcdb88c, bands: 12, stretch: 18, turb: 0.6, atm: 0xe8dab8, atmK: 0.25, spin: 2, tilt: 0.47, ring: {} },
  uranus: { kind: 'gas', c1: 0x9fd6dc, c2: 0x86c3cc, c3: 0xbfe6ea, c4: 0x9fd6dc, bands: 6, stretch: 10, turb: 0.35, atm: 0xa8e4f0, atmK: 0.6, spin: -1.4, tilt: 1.71, ring: { inner: 1.6, outer: 2.0, c1: 0x6f7780, c2: 0x40464c, opacity: 0.35 } },
  neptun: { kind: 'gas', c1: 0x3b64c8, c2: 0x2c4fa8, c3: 0x6f95e6, c4: 0x1f2f6e, bands: 8, stretch: 12, turb: 0.8, spot: 1, spotLat: -0.35, atm: 0x6f9bff, atmK: 0.7, spin: 1.5, tilt: 0.49 },
};

/**
 * Gezegen: yüzey + (varsa) bulut + atmosfer halesi + halka. look: PLANET_LOOKS anahtarı ya da nesne.
 * Dönen: { group (konumlandır), body (eksen eğikliği), surface (tıklama için), spin(dt), dispose() }
 */
export function createPlanet(radius, look, seed = Math.random()) {
  const L = typeof look === 'string' ? PLANET_LOOKS[look] : look;
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.z = L.tilt || 0;
  group.add(body);
  const seg = radius > 0.9 ? 128 : 96;
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, seg, seg / 2), planetMaterial(L.kind, { ...L, seed, bump: radius * 0.02 }));
  body.add(surface);
  let clouds = null;
  if (L.clouds) {
    clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.012, seg, seg / 2), cloudMaterial({ seed: seed + 0.37, cover: L.clouds }));
    clouds.raycast = () => {};
    body.add(clouds);
  }
  if (L.halo || L.kind === 'earth') group.add(atmosphereShell(radius, L.halo ?? L.atm, L.haloK ?? 1.2, L.kind === 'earth' ? 0.07 : 0.05));
  if (L.ring) body.add(ringMesh(radius, { ...L.ring, seed }));
  const w = L.spin ?? 1;
  return {
    group, body, surface, clouds, look: L,
    spin(dt) { surface.rotation.y += dt * w; if (clouds) clouds.rotation.y += dt * w * 1.12; },
  };
}
