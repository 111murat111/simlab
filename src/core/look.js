// Görsel katman (Açık Deniz yaklaşımı): ortam ışığı (IBL), degrade gökyüzü, otomatik yumuşak gölge.
// Post-processing YOK — ton eşleme (ACES) Three.js renderer'da, kenar yumuşatma tarayıcıda (native).
// Sonuç: her kare TEK bir renderer.render() çağrısı. Ekstra tam-ekran geçiş sıfır.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;

// Arka plan rengi (scene.background) ufuk rengi olur; tepeye doğru koyulaşır, güneş yönünde hafif ışıma.
const SKY_VS = /* glsl */ `
varying vec2 vNdc;
void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.99999, 1.0); }`;
const SKY_FS = /* glsl */ `
uniform vec3 uHorizon, uZenith, uGround, uSunCol, uSunDir;
uniform mat4 uProjInv, uCamWorld;
uniform float uOrtho, uSun;
varying vec2 vNdc;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec4 v = uProjInv * vec4(vNdc, 1.0, 1.0);
  vec3 dir = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
  float e = uOrtho > 0.5 ? vNdc.y * 0.5 + 0.1 : dir.y;
  vec3 c = e > 0.0 ? mix(uHorizon, uZenith, pow(clamp(e, 0.0, 1.0), 0.55))
                   : mix(uHorizon, uGround, pow(clamp(-e * 3.0, 0.0, 1.0), 0.7));
  float s = max(dot(dir, uSunDir), 0.0);
  c += uSunCol * uSun * (pow(s, 6.0) * 0.18 + pow(s, 64.0) * 0.35) * (1.0 - uOrtho);
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}`;

export function createLook(renderer, scene, camera, opt = {}) {
  const o = { env: true, sky: true, shadows: true, ...opt };
  const sun = scene.userData.sun, hemi = scene.userData.hemi;
  // Fiziksel gökyüzü varsa ortam ışığı, arka plan, güneş ve pozlama ondan gelir
  const phys = o.physSky || null;
  if (phys) { o.env = false; o.sky = false; }

  // --- Ortam ışığı: stüdyo yansımaları, gece sahnelerinde yarıküre ışığıyla birlikte kısılır ---
  let envBase = 0;
  if (o.env) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    envBase = hemi ? 0.5 : 0.25;
  }

  // --- Gökyüzü ---
  const skyU = {
    uHorizon: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color(1, 0.9, 0.75) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uProjInv: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
    uOrtho: { value: camera.isOrthographicCamera ? 1 : 0 }, uSun: { value: 0 },
  };
  let sky = null;
  if (o.sky) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    sky = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, depthWrite: false, depthTest: false, fog: false,
    }));
    sky.frustumCulled = false;
    sky.renderOrder = -1e9;
    sky.name = 'look:sky';
    sky.raycast = () => {};
    scene.add(sky);
  }
  const hsl = {};
  function updateSky() {
    const bg = scene.background;
    if (!sky) return;
    sky.visible = !!(bg && bg.isColor);
    if (!sky.visible) return;
    bg.getHSL(hsl);
    const H = skyU.uHorizon.value.copy(bg);
    // Tepe: daha koyu ve biraz daha doygun; zemin (ufuk altı): koyulaşmış ufuk
    skyU.uZenith.value.setHSL(hsl.h + 0.015, Math.min(1, hsl.s * 1.15 + 0.05), hsl.l * 0.5);
    skyU.uGround.value.copy(H).multiplyScalar(0.72);
    skyU.uProjInv.value.copy(camera.projectionMatrixInverse);
    skyU.uCamWorld.value.copy(camera.matrixWorld);
    if (sun) {
      skyU.uSunDir.value.copy(sun.position).sub(sun.target.position).normalize();
      skyU.uSun.value = Math.min(1, sun.intensity / 2.2) * Math.min(1, hsl.l * 3.0);
    }
  }

  // --- Gölge: güneş, kameranın baktığı bölgeye göre her karede sığdırılır ---
  const shadowsOn = o.shadows && sun && !(phys && phys.customLight);
  if (o.shadows && phys && phys.customLight) renderer.shadowMap.enabled = true;
  if (shadowsOn) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    sun.castShadow = true;
    const n = LOW ? 1024 : 2048;
    sun.shadow.mapSize.set(n, n);
    sun.shadow.bias = -0.0003;
  }
  const lit = (m) => m && !m.isMeshBasicMaterial && !m.isShaderMaterial && !m.isPointsMaterial;
  const opaque = (m) => m && !m.transparent && m.opacity >= 1 && m.side !== THREE.BackSide && m.visible !== false;
  const sceneBox = new THREE.Box3(), tmpS = new THREE.Sphere(), sceneSphere = new THREE.Sphere();
  let lastScan = -1e9;
  function scan(now) {
    if (now - lastScan < 2000) return;
    lastScan = now;
    sceneBox.makeEmpty();
    scene.traverse((obj) => {
      if (!obj.isMesh || obj === sky || obj.userData.noShadow) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const isLit = mats.some(lit);
      obj.receiveShadow = isLit;
      obj.castShadow = isLit && mats.every(opaque) && !obj.userData.noCast;
      if (obj.castShadow && obj.geometry && !obj.userData.noFit) {
        if (obj.isInstancedMesh) { if (!obj.boundingSphere) obj.computeBoundingSphere(); tmpS.copy(obj.boundingSphere).applyMatrix4(obj.matrixWorld); }
        else { if (!obj.geometry.boundingSphere) obj.geometry.computeBoundingSphere(); tmpS.copy(obj.geometry.boundingSphere).applyMatrix4(obj.matrixWorld); }
        if (Number.isFinite(tmpS.radius)) sceneBox.expandByPoint(tmpS.center.clone().addScalar(tmpS.radius)).expandByPoint(tmpS.center.clone().addScalar(-tmpS.radius));
      }
    });
    if (!sceneBox.isEmpty()) sceneBox.getBoundingSphere(sceneSphere);
  }
  const saved = { p: new THREE.Vector3(), t: new THREE.Vector3() }, dir = new THREE.Vector3(), focus = new THREE.Vector3();
  function fitShadow(target) {
    if (!shadowsOn || sceneBox.isEmpty()) return false;
    saved.p.copy(sun.position); saved.t.copy(sun.target.position);
    dir.copy(sun.position).sub(sun.target.position).normalize();
    // Odak: kameranın hedefi; yarıçap: kamera uzaklığına göre, sahne küresiyle sınırlı
    focus.copy(target);
    const camD = camera.isPerspectiveCamera ? camera.position.distanceTo(target) : camera.userData.orthoHeight || 20;
    const r = Math.min(sceneSphere.radius + focus.distanceTo(sceneSphere.center), Math.max(camD * 1.1, sceneSphere.radius * 0.15));
    sun.target.position.copy(focus);
    sun.position.copy(focus).addScaledVector(dir, r * 2 + sceneSphere.radius);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    const c = sun.shadow.camera;
    Object.assign(c, { left: -r, right: r, top: r, bottom: -r, near: 0.01 * r, far: r * 4 + sceneSphere.radius * 2 });
    c.updateProjectionMatrix();
    sun.shadow.normalBias = (2 * r / sun.shadow.mapSize.x) * 1.2;
    return true;
  }
  function restoreSun() { sun.position.copy(saved.p); sun.target.position.copy(saved.t); sun.target.updateMatrixWorld(); sun.updateMatrixWorld(); }

  return {
    setSize() {},  // Tarayıcı native AA — ekstra render target yok
    render(target) {
      if (phys) {
        if (sun && phys.customLight) sun.intensity = 0;
        else if (sun) { sun.position.copy(phys.sunDir).multiplyScalar(100); sun.target.position.set(0, 0, 0); sun.color.copy(phys.sunColor); sun.intensity = Math.PI; }
        if (hemi) hemi.intensity = 0;
        scene.environmentIntensity = 1;
        renderer.toneMappingExposure = phys.exposure() * (o.exposure ?? 0.6);
      }
      if (envBase) scene.environmentIntensity = envBase * (hemi ? Math.min(1.3, hemi.intensity / 1.4) : 1);
      updateSky();
      if (shadowsOn) scan(performance.now());
      const moved = fitShadow(target);
      renderer.render(scene, camera);
      if (moved) restoreSun();
    },
  };
}
