// Parke / karo yansıması: zemin düzlemine göre aynalanmış kamerayla sahne düşük çözünürlüklü bir dokuya çizilir;
// zemin malzemesi bu dokuyu Fresnel × parlaklık (pürüzlülüğe göre bulanık) ile ekler (three Reflector yöntemi).
import { THREE } from '@core';

export function floorMirror(sim, { scale = 0.5 } = {}) {
  const renderer = sim.renderer, scene = sim.scene, camera = sim.camera;
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
  rt.texture.generateMipmaps = false;
  const texMat = new THREE.Matrix4();
  const U = { tRefl: { value: rt.texture }, uReflMat: { value: texMat }, uReflPx: { value: new THREE.Vector2(0.25, 0.25) }, uReflOn: { value: 0 } };
  const rcam = new THREE.PerspectiveCamera();
  const plane = new THREE.Plane(), normal = new THREE.Vector3(), wpos = new THREE.Vector3(), cpos = new THREE.Vector3();
  const rot = new THREE.Matrix4(), look = new THREE.Vector3(), view = new THREE.Vector3(), tgt = new THREE.Vector3();
  const clip = new THREE.Vector4(), q = new THREE.Vector4(), sz = new THREE.Vector2(), bg = new THREE.Color();

  /** Prosedürel zemin malzemesine yansıma ekler (k: yansıma gücü). */
  function attach(material, k = 1) {
    const orig = material.onBeforeCompile, key = material.customProgramCacheKey();
    const uk = { value: k };
    material.onBeforeCompile = (sh, r) => {
      orig.call(material, sh, r);
      Object.assign(sh.uniforms, U, { uReflK: uk });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform mat4 uReflMat; varying vec4 vReflUv;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvReflUv = uReflMat * (modelMatrix * vec4(transformed, 1.0));');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D tRefl; uniform vec2 uReflPx; uniform float uReflK, uReflOn; varying vec4 vReflUv;')
        .replace('#include <opaque_fragment>', `
        if (uReflOn > 0.5 && vReflUv.w > 0.0) {
          vec2 ruv = vReflUv.xy / vReflUv.w;
          // cilalı zeminde yansıma dikey uzar; pürüzlülükle bulanıklaşır
          float bl = mix(1.0, 7.0, clamp(pRough*1.8 - 0.45, 0.0, 1.0));
          vec3 rc = vec3(0.0);
          for (int i = -3; i <= 3; i++) rc += texture2D(tRefl, clamp(ruv + vec2(float(i)*0.3, float(i))*uReflPx*bl, 0.001, 0.999)).rgb;
          rc /= 7.0;
          float cv = clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
          float F = 0.04 + 0.96*pow(1.0 - cv, 5.0);
          float gloss = 1.0 - smoothstep(0.3, 0.78, pRough);
          vec3 add = rc*F*gloss*uReflK;
          if (add.r >= 0.0 && add.g >= 0.0 && add.b >= 0.0) outgoingLight += min(add, vec3(8.0));
        }
        #include <opaque_fragment>`);
    };
    material.customProgramCacheKey = () => key + '-refl';
    material.needsUpdate = true;
    return uk;
  }

  /** Her kare (çizimden önce): anchor = zemin üst yüzünde, +z'si yukarı bakan nesne; hide = zemin meshi. */
  function render(anchor, hide) {
    if (!anchor) { U.uReflOn.value = 0; return; }
    renderer.getDrawingBufferSize(sz);
    const w = Math.max(4, Math.round(sz.x * scale)), h = Math.max(4, Math.round(sz.y * scale));
    if (rt.width !== w || rt.height !== h) { rt.setSize(w, h); U.uReflPx.value.set(1 / w, 1 / h); }
    camera.updateMatrixWorld();
    anchor.updateWorldMatrix(true, false);
    wpos.setFromMatrixPosition(anchor.matrixWorld);
    cpos.setFromMatrixPosition(camera.matrixWorld);
    rot.extractRotation(anchor.matrixWorld);
    normal.set(0, 0, 1).applyMatrix4(rot);
    view.subVectors(wpos, cpos);
    if (view.dot(normal) > 0) { U.uReflOn.value = 0; return; }
    view.reflect(normal).negate().add(wpos);
    rot.extractRotation(camera.matrixWorld);
    look.set(0, 0, -1).applyMatrix4(rot).add(cpos);
    tgt.subVectors(wpos, look).reflect(normal).negate().add(wpos);
    rcam.position.copy(view);
    rcam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    rcam.lookAt(tgt);
    rcam.far = camera.far;
    rcam.updateMatrixWorld();
    rcam.projectionMatrix.copy(camera.projectionMatrix);
    rcam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(rcam.projectionMatrix).multiply(rcam.matrixWorldInverse);
    // eğik yakın düzlem: zeminin altı çizilmez
    plane.setFromNormalAndCoplanarPoint(normal, wpos).applyMatrix4(rcam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = rcam.projectionMatrix.elements;
    q.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(q));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;

    const skyMesh = sim.sky?.mesh, skyVis = skyMesh ? skyMesh.visible : false;
    const prevBg = scene.background, prevRT = renderer.getRenderTarget(), prevAuto = renderer.shadowMap.autoUpdate;
    hide.visible = false;
    if (skyMesh) skyMesh.visible = false;
    bg.copy(sim.sky?.horizon || new THREE.Color(0.5, 0.6, 0.7));
    scene.background = bg;
    renderer.shadowMap.autoUpdate = false;
    U.uReflOn.value = 0;
    renderer.setRenderTarget(rt);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, rcam);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevAuto;
    scene.background = prevBg;
    if (skyMesh) skyMesh.visible = skyVis;
    hide.visible = true;
    U.uReflOn.value = 1;
  }

  return { attach, render, rt };
}
