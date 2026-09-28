// Mars gökyüzü: motorun `sky` altyapısını (güneş ışığı + gölge, hava perspektifi, pozlama, bloom) kullanır; Dünya'ya göre
// ayarlı Rayleigh göğü yerine tozlu Mars göğünü çizer: gündüz karamela/pas rengi, güneş çevresinde ve gün batımında mavi
// hale (ince toz tanelerinin ileri saçılması), su buzu tüy bulutları, gece yıldızlar. Ortam ışığı (PMREM) ve sis rengi
// aynı fonksiyondan pişirilir; toz optik derinliği τ doğrudan güneşi (e^−τm), gök parlaklığını ve görüş mesafesini belirler.
import { THREE, GLSL_COMMON } from '@core';

const SKY_FN = GLSL_COMMON + /* glsl */ `
uniform vec3 uSunDir, uSunCol; uniform float uTau, uTime, uSkyK, uNight;
vec3 marsSky(vec3 d, float withSun){
  float sy = uSunDir.y, el = clamp(d.y, 0.0, 1.0), mu = dot(d, uSunDir), m = max(mu, 0.0);
  float dust = smoothstep(0.8, 5.0, uTau);
  float lum = smoothstep(-0.22, 0.25, sy)*(0.4 + 0.6*smoothstep(-0.05, 0.7, sy))*uSkyK;
  // Karamela gök: ufuk açık, tepe koyu pas; güneş tarafı daha aydınlık
  vec3 hor = vec3(0.98, 0.66, 0.43), zen = vec3(0.44, 0.25, 0.15);
  vec3 c = mix(hor, zen, pow(el, 0.5))*(0.55 + 0.45*(0.5 + 0.5*mu))*lum*1.2;
  // Alacakaranlık: güneşin karşısı hızla kararır
  float low = 1.0 - smoothstep(0.0, 0.4, sy);
  c *= 1.0 - low*0.55*(1.0 - m);
  // Mavi hale (gün batımında baskın)
  float halo = pow(m, 4.0)*0.22 + pow(m, 24.0)*0.7 + pow(m, 260.0)*2.2;
  vec3 blue = vec3(0.40, 0.60, 1.0)*halo*(0.3 + 1.6*low)*smoothstep(-0.28, 0.0, sy)*uSkyK*(1.0 - 0.85*dust);
  c += blue*mix(1.0, 1.6, low*(1.0 - smoothstep(0.0, 0.35, el)));
  // Su buzu tüy bulutları (ince, çizgili)
  if (d.y > 0.0){
    vec2 p = d.xz/(d.y + 0.1)*0.7 + vec2(uTime*0.006, uTime*0.0025);
    float n = fbm(vec2(p.x*1.0 + p.y*0.6, p.y*3.2 - p.x*0.4), 5);
    float a = smoothstep(0.56, 0.86, n)*0.4*smoothstep(0.0, 0.18, d.y)*(1.0 - dust);
    vec3 cc = vec3(1.0, 0.9, 0.82)*lum*1.35 + blue*0.6;
    c = mix(c, cc, a);
  }
  // Toz fırtınası: tek düze, koyu pas-kahverengi örtü
  if (dust > 0.001) {
    vec3 storm = vec3(0.62, 0.36, 0.2)*(0.75 + 0.25*mu)*lum*(0.9 + 0.1*fbm(d.xz*3.0/(abs(d.y) + 0.2) + uTime*0.05, 3));
    c = mix(c, storm, dust);
  }
  // Gece: yıldızlar ve Samanyolu (ince atmosfer: çok net)
  if (uNight > 0.01 && d.y > 0.0){
    vec2 g = eqUV(d)*vec2(2400.0, 1200.0); vec2 gi = floor(g);
    float h = hash21(gi);
    float star = step(0.9955, h)*smoothstep(0.5, 0.0, length(fract(g) - 0.5))*(0.5 + 2.5*hash21(gi + 7.0));
    float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.55, 0.78)))*3.0, 2.0));
    c += uNight*(1.0 - dust)*(vec3(0.95, 0.95, 1.0)*star*0.7 + vec3(0.014, 0.013, 0.02)*band*fbm(d.xz*9.0/(d.y + 0.3), 5));
  }
  c += vec3(0.0012, 0.0008, 0.0006);
  // Güneş diski (Mars'tan açısal çap ≈ 0,35°)
  if (withSun > 0.5) c += uSunCol*(smoothstep(0.999982, 0.999991, mu)*40.0 + pow(m, 1200.0)*1.2)*step(0.0, d.y + 0.003);
  // Ufuk altı: koyulaşan zemin rengi
  if (d.y < 0.0) c = mix(c, vec3(0.3, 0.16, 0.09)*lum*0.5, smoothstep(0.0, -0.2, d.y));
  return c;
}`;

const BG_VS = /* glsl */ `out vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.99999, 1.0); }`;
const BG_FS = SKY_FN + /* glsl */ `
uniform mat4 uProjInv, uCamWorld; in vec2 vNdc; out vec4 oColor;
void main(){
  vec4 v = uProjInv*vec4(vNdc, 1.0, 1.0);
  vec3 d = normalize((uCamWorld*vec4(v.xyz/v.w, 0.0)).xyz);
  oColor = vec4(marsSky(d, 1.0), 1.0);
}`;
const EQ_FS = SKY_FN + /* glsl */ `
uniform vec2 uRes; in vec2 vNdc; out vec4 oColor;
void main(){ oColor = vec4(marsSky(eqDir(gl_FragCoord.xy/uRes), 0.0), 1.0); }`;

/**
 * sim.sky'yi Mars'a çevirir. Dönen nesne: set({ sunDir: Vector3, tau }) — her kare çağrılabilir.
 * @param {object} sim createSim({ sky: {...} }) ile kurulmuş simülasyon
 */
export function marsSky(sim) {
  const sky = sim.sky, renderer = sim.renderer, scene = sim.scene;
  const U = {
    uSunDir: { value: sky.sunDir }, uSunCol: { value: new THREE.Vector3() }, uTau: { value: 0.5 },
    uTime: { value: 0 }, uSkyK: { value: 1 }, uNight: { value: 0 },
  };
  const bgMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: BG_VS, fragmentShader: BG_FS, depthTest: false, depthWrite: false, fog: false,
    uniforms: { ...U, uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() } },
  });
  sky.mesh.material = bgMat;

  // Ortam ışığı için eşdikdörtgen pişirme
  const W = 128, H = 64;
  const eqRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
  eqRT.texture.mapping = THREE.EquirectangularReflectionMapping;
  eqRT.texture.wrapS = THREE.RepeatWrapping;
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const eqMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: BG_VS, fragmentShader: EQ_FS, depthTest: false, depthWrite: false,
    uniforms: { ...U, uRes: { value: new THREE.Vector2(W, H) } } });
  const eqScene = new THREE.Scene(), eqMesh = new THREE.Mesh(tri, eqMat);
  eqMesh.frustumCulled = false; eqScene.add(eqMesh);
  const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, lastBake = -1e9;
  const baked = { dir: new THREE.Vector3(0, -2, 0), tau: -1 };
  const fogCol = new THREE.Color(0.6, 0.4, 0.28);
  const px = new Uint16Array(4);

  function bake() {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(eqRT); renderer.render(eqScene, cam2); renderer.setRenderTarget(prev);
    const old = envRT;
    envRT = pmrem.fromEquirectangular(eqRT.texture);
    old?.dispose();
    try {
      const f = THREE.DataUtils.fromHalfFloat;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < 8; i++) {
        renderer.readRenderTargetPixels(eqRT, (i * 16 + 8) % W, H / 2 + 1, 1, 1, px);
        r += f(px[0]); g += f(px[1]); b += f(px[2]);
      }
      fogCol.setRGB(r / 8, g / 8, b / 8);
    } catch { /* okunamazsa önceki renk */ }
    baked.dir.copy(sky.sunDir); baked.tau = U.uTau.value;
  }

  // Güneş: Mars yörüngesinde ~%43 Dünya ışınımı; kamera pozlaması bunu dengeler. Doğrudan ışık e^(−τ·m), renk tozla kızarır.
  const st = { tau: 0.5 };
  function light() {
    const sy = sky.sunDir.y, tau = st.tau;
    const mAir = 1 / Math.max(sy + 0.03, 0.03);
    const direct = Math.exp(-tau * Math.min(mAir, 40)) * THREE.MathUtils.smoothstep(sy, -0.02, 0.03);
    const redden = 1 - direct;
    sky.sunColor.setRGB(1.0, 0.9 - 0.12 * redden, 0.8 - 0.25 * redden).multiplyScalar(2.9 * direct);
    U.uSunCol.value.set(sky.sunColor.r, sky.sunColor.g, sky.sunColor.b);
    U.uSkyK.value = Math.min(1.25, Math.exp(-0.25 * (tau - 0.5)));
    U.uTau.value = tau;
    U.uNight.value = THREE.MathUtils.smoothstep(-sy, -0.02, 0.2);
    // Görüş: toz ölçek yüksekliği ≈ 11 km → sönüm katsayısı τ/H
    sky.fog.density = tau / 11000;
  }

  // Pozlama: Açık Deniz eğrisi + Mars'ın zayıf güneşi için telafi; fırtınada kamera kısmen açılır
  sky.exposure = () => {
    const sy = sky.sunDir.y, se = Math.max(sy, 0);
    let e = 1.25 / (0.22 + 0.95 * Math.sqrt(se));
    if (sy < 0) e *= 1 + Math.min(-Math.asin(Math.max(sy, -1)) * 57.3, 14) * 0.3;
    const clearT = Math.exp(-0.5 / Math.max(se, 0.1)) + 0.4, T = Math.exp(-st.tau / Math.max(se, 0.1)) + 0.4 * Math.exp(-0.25 * (st.tau - 0.5));
    return e * Math.min(2.5, Math.sqrt(clearT / Math.max(T, 1e-3)));
  };

  let frameMs = 16, lastFrame = performance.now();
  const origUpdate = sky.update;
  sky.update = (camera, time) => {
    origUpdate(camera, time);
    U.uTime.value = time;
    bgMat.uniforms.uProjInv.value.copy(camera.projectionMatrixInverse);
    bgMat.uniforms.uCamWorld.value.copy(camera.matrixWorld);
    const now = performance.now();
    // Yavaş cihazda (uzun kare) ortam ışığını seyrek yenile: pişirme başına maliyet sabit, kare başına değil
    frameMs = frameMs * 0.8 + Math.min(5000, now - lastFrame) * 0.2; lastFrame = now;
    const gap = Math.max(400, frameMs * 12);
    const changed = baked.dir.distanceTo(sky.sunDir) > (frameMs > 150 ? 0.12 : 0.03) || Math.abs(baked.tau - st.tau) > 0.08 * Math.max(1, st.tau);
    if (!envRT || (changed && now - lastBake > gap)) { lastBake = now; bake(); }
    scene.environment = envRT.texture;
    sky.fog.color.copy(fogCol);
  };

  return {
    uniforms: U,
    set({ sunDir, tau }) {
      if (sunDir) sky.sunDir.copy(sunDir).normalize();
      if (tau != null) st.tau = tau;
      light();
    },
  };
}
