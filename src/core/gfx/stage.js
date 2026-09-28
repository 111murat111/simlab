// Açık hava dışı ortamlar: aynı arayüzle (sunDir, sunColor, exposure(), update()) look.js'e bağlanır; böylece
// gölge, bloom, AO, ton eşleme ve pozlama zinciri her ortamda aynı çalışır.
//   createStudio — ürün fotoğrafı stüdyosu: sonsuz fon (siklorama), softbox yansımaları, ana ışık + dolgu
//   createSpace  — uzay: yıldız alanı (renk sıcaklığı, parlaklık dağılımı), Samanyolu (toz şeritleri), bulutsular;
//                  yıldız ışığı noktasal kaynaktan; ortam ışığı gökten çok zayıf
import * as THREE from 'three';
import { GLSL_COMMON } from './glsl.js';
import { NOISE3_GLSL } from './terrain.js';

const dirFrom = (el, az) => {
  const e = THREE.MathUtils.degToRad(el), a = THREE.MathUtils.degToRad(az);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
};

/**
 * Stüdyo ortamı.
 * @param {object} o { color (fon rengi), floor (zemin rengi, yoksa color), radius (m), height (m), key: {el, az, color, power},
 *                    fill (0–1 softbox yoğunluğu), warmth (−1 soğuk … 1 sıcak), mood: 'day'|'lab'|'night', floorMaterial }
 */
export function createStudio(renderer, scene, o = {}) {
  const P = { color: 0xa9a6a0, radius: 30, height: 18, fill: 1, warmth: 0.2, mood: 'day', key: {}, ...o };
  const K = { el: 48, az: 35, power: 1, ...P.key };
  const moodK = { day: 1, lab: 0.85, night: 0.45 }[P.mood] ?? 1;
  // Softbox odası → PMREM (yansımalarda gerçek ışık kutuları görünür)
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.06, 0.065).multiplyScalar(moodK), side: THREE.BackSide }));
  room.position.y = 8; env.add(room);
  const warm = new THREE.Color(1, 0.93, 0.84), cool = new THREE.Color(0.86, 0.93, 1);
  const tint = (w) => new THREE.Color(1, 1, 1).lerp(w > 0 ? warm : cool, Math.abs(w));
  const box = (w, h, x, y, z, ry, rx, e, col) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(e), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m);
  };
  const f = P.fill * moodK;
  box(14, 10, 0, 17.9, 0, 0, Math.PI / 2, 3.2 * f, tint(P.warmth * 0.3));          // tepe softbox
  box(3, 14, -19.9, 7, 0, Math.PI / 2, 0, 2.2 * f, tint(-0.6));                      // sol şerit (soğuk)
  box(3, 14, 19.9, 7, 4, -Math.PI / 2, 0, 1.6 * f, tint(0.7));                       // sağ şerit (sıcak)
  box(18, 6, 0, 5, -19.9, 0, 0, 0.9 * f, tint(0));                                    // arka dolgu
  box(40, 40, 0, -1.9, 0, 0, -Math.PI / 2, 0.22 * f, new THREE.Color(P.color));       // zemin sekmesi
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, 0.035).texture;
  pmrem.dispose();
  env.traverse((m) => { m.geometry?.dispose(); m.material?.dispose(); });

  // Siklorama: zeminden duvara yumuşak kavisle geçen kâse (her yönden kesintisiz)
  const R = P.radius, rc = R * 0.35, pts = [];
  for (let i = 0; i <= 24; i++) pts.push(new THREE.Vector2(R * 0.6 * i / 24, 0));
  for (let i = 1; i <= 24; i++) { const a = (i / 24) * Math.PI / 2; pts.push(new THREE.Vector2(R * 0.6 + Math.sin(a) * rc, rc - Math.cos(a) * rc)); }
  pts.push(new THREE.Vector2(R * 0.6 + rc, P.height));
  const lathe = new THREE.LatheGeometry(pts, 128);
  const bgCol = new THREE.Color(P.color);
  const cyc = new THREE.Mesh(lathe, P.floorMaterial || new THREE.MeshStandardMaterial({ color: bgCol, roughness: 0.82, side: THREE.DoubleSide }));
  cyc.name = 'gfx:studio'; cyc.receiveShadow = true; cyc.userData.noCast = true;
  // Sahne zeminleri çoğunlukla y=0'da: fon hem biraz aşağıda hem derinlikte geride kalsın (z-fighting yok)
  cyc.position.y = -R * 0.0008;
  cyc.material.polygonOffset = true; cyc.material.polygonOffsetFactor = 4; cyc.material.polygonOffsetUnits = 4;
  scene.add(cyc);
  scene.background = bgCol.clone().multiplyScalar(0.35 * moodK);

  const sunDir = dirFrom(K.el, K.az), sunColor = tint(P.warmth).multiplyScalar(2.4 * K.power * moodK);
  if (K.color != null) sunColor.set(K.color).multiplyScalar(2.4 * K.power * moodK);
  return {
    kind: 'studio', mesh: cyc, sunDir, sunColor, ambient: new THREE.Color(0.3, 0.3, 0.3),
    exposure: () => 0.8,
    setKey(el, az) { sunDir.copy(dirFrom(el, az)); },
    update() {},
  };
}

const SPACE_GLSL = GLSL_COMMON + NOISE3_GLSL + /* glsl */ `
uniform vec3 uGalN, uGalC; uniform float uPix, uMilky, uNeb, uStars;
vec3 starCol(float t){ // 0 kırmızı cüce … 1 mavi dev
  return t < 0.5 ? mix(vec3(1.0, 0.62, 0.38), vec3(1.0, 0.95, 0.88), t*2.0) : mix(vec3(1.0, 0.95, 0.88), vec3(0.72, 0.82, 1.0), t*2.0 - 1.0);
}
vec3 starLayer(vec3 d, float sc, float dens, float pix){
  // Küp yüzü başına 2D hücre ızgarası: her yıldız hücre içinde, 3×3 komşu taraması → kırpılma yok
  vec3 a = abs(d); vec2 uv; float face;
  if (a.x >= a.y && a.x >= a.z){ uv = d.yz/a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y >= a.z){ uv = d.xz/a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else { uv = d.xy/a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  vec2 p = (uv*0.5 + 0.5)*sc, i = floor(p);
  float k2a = 2.0/sc/(1.0 + 0.5*dot(uv, uv));            // hücre birimi → radyan (gnomonik yaklaşık)
  vec3 acc = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 c = i + vec2(x, y);
    vec3 k = vec3(c, face*977.0 + sc);
    float h = h13(k);
    if (h > dens) continue;
    vec2 sp = c + 0.1 + 0.8*vec2(h13(k + 3.1), h13(k + 7.7));
    float ang = length(p - sp)*k2a;
    float mag = pow(h13(k + 21.0), 9.0);                 // çoğu sönük, azı çok parlak
    float w = max(pix, 1e-5)*(1.0 + 0.9*mag);
    acc += starCol(h13(k + 31.0))*exp(-ang*ang/(w*w))*(0.05 + 22.0*mag);
  }
  return acc;
}
vec3 space(vec3 d, float pix){
  float b = dot(d, uGalN), g = exp(-b*b/0.012), gw = exp(-b*b/0.06);
  float core = pow(max(dot(d, uGalC), 0.0), 3.0);
  // Samanyolu: yaygın ışık + toz şeritleri + yıldız yoğunluğu artışı
  float n = fbm3(d*6.0, 6), n2 = fbm3(d*22.0 + 4.0, 4);
  float dust = smoothstep(0.42, 0.7, fbm3(d*9.0 + 11.0, 5))*exp(-b*b/0.004);
  vec3 milky = (vec3(0.55, 0.5, 0.45)*g*(0.35 + 0.9*n) + vec3(0.3, 0.33, 0.45)*gw*0.25*n2)*(0.4 + 2.2*core);
  milky *= 1.0 - 0.85*dust;
  vec3 col = milky*0.03*uMilky;
  // Bulutsular: Hα kırmızı ve OIII turkuaz lekeler
  float neb = smoothstep(0.55, 0.85, fbm3(d*3.0 + 40.0, 5));
  float neb2 = smoothstep(0.6, 0.9, fbm3(d*4.0 + 90.0, 5));
  col += (vec3(0.9, 0.25, 0.3)*neb*(0.6 + n2) + vec3(0.2, 0.55, 0.6)*neb2*n)*0.006*uNeb*(0.3 + gw);
  // Yıldızlar: üç katman, Samanyolu yönünde yoğunlaşır
  float dens = 0.006 + 0.035*gw;
  col += (starLayer(d, 40.0, 0.05, pix)*0.8 + starLayer(d, 110.0, dens, pix)*0.25 + starLayer(d, 260.0, dens*0.5, pix)*0.08*(0.3 + g))*0.3*uStars;
  return col;
}
`;
const SPACE_BG_VS = `out vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.99999, 1.0); }`;
const SPACE_BG_FS = SPACE_GLSL + /* glsl */ `
uniform mat4 uProjInv, uCamWorld; in vec2 vNdc; out vec4 oColor;
void main(){
  vec4 v = uProjInv*vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize((uCamWorld*vec4(v.xyz/v.w, 0.0)).xyz);
  oColor = vec4(space(d, uPix), 1.0);
}`;
const SPACE_EQ_FS = SPACE_GLSL + /* glsl */ `
in vec2 vUv; out vec4 oColor;
void main(){ oColor = vec4(space(eqDir(vUv), 0.006)*0.5, 1.0); }`;

/**
 * Uzay ortamı. Işık: noktasal yıldız ışığı (o.star konumunda) ya da o.sunDir verilirse yönlü ışık.
 * @param {object} o { star:[x,y,z] (yıldız konumu, varsayılan orijin), starColor, power, milky (0–2), nebula (0–2),
 *                    stars (0–2), galaxyTilt (derece), ambient (0–1 çok zayıf dolgu), shadows }
 */
export function createSpace(renderer, scene, o = {}) {
  const P = { star: [0, 0, 0], starColor: 0xfff1e0, power: 1, milky: 1, nebula: 1, stars: 1, galaxyTilt: 62, ambient: 0.05, ...o };
  const t = THREE.MathUtils.degToRad(P.galaxyTilt);
  const U = {
    uGalN: { value: new THREE.Vector3(0, Math.cos(t), Math.sin(t)).normalize() },
    uGalC: { value: new THREE.Vector3(0.8, -Math.sin(t) * 0.6, Math.cos(t) * 0.6).normalize() },
    uPix: { value: 0.001 }, uMilky: { value: P.milky }, uNeb: { value: P.nebula }, uStars: { value: P.stars },
    uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
  };
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const bg = new THREE.Mesh(tri, new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: U, vertexShader: SPACE_BG_VS, fragmentShader: SPACE_BG_FS, depthWrite: false, fog: false,
  }));
  bg.frustumCulled = false; bg.renderOrder = -1e9; bg.name = 'gfx:space'; bg.raycast = () => {};
  scene.add(bg);
  scene.background = null;

  // Ortam ışığı: gökyüzünün eşdikdörtgen kopyası → PMREM (çok zayıf; parlak yüzlerde yıldız yansıması)
  const rt = new THREE.WebGLRenderTarget(1024, 512, { type: THREE.HalfFloatType });
  rt.texture.mapping = THREE.EquirectangularReflectionMapping;
  const qs = new THREE.Scene(), qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, uniforms: U, fragmentShader: SPACE_EQ_FS,
    vertexShader: 'out vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  }));
  qs.add(quad);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(qs, qc); renderer.setRenderTarget(prev);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(rt.texture).texture;
  scene.environmentIntensity = 1;
  pmrem.dispose(); quad.geometry.dispose(); quad.material.dispose();

  // Yıldız ışığı: noktasal, uzaklıkla sönmez (gezegen ölçeği sahnelerde görsel tutarlılık)
  const light = new THREE.PointLight(P.starColor, Math.PI * 2.6 * P.power, 0, 0);
  light.position.fromArray(P.star);
  light.name = 'gfx:starlight';
  if (P.shadows !== false) {
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0005;
  }
  scene.add(light);
  const fill = new THREE.AmbientLight(0x8090b0, P.ambient);
  scene.add(fill);

  const sunDir = new THREE.Vector3(0, 1, 0), sunColor = new THREE.Color(0, 0, 0);
  return {
    kind: 'space', customLight: true, mesh: bg, light, fill, sunDir, sunColor, ambient: new THREE.Color(0.02, 0.02, 0.03),
    uniforms: U, texture: rt.texture,
    exposure: () => 1.0,
    update(camera) {
      U.uProjInv.value.copy(camera.projectionMatrixInverse);
      U.uCamWorld.value.copy(camera.matrixWorld);
      const h = renderer.getSize(new THREE.Vector2()).y || 1;
      U.uPix.value = camera.isPerspectiveCamera ? THREE.MathUtils.degToRad(camera.fov) / h * 1.1 : 0.002;
    },
  };
}
