// SimLab çekirdeği: her simülasyon yalnızca buradan import eder (`import { createSim, THREE } from '@core'`).
// Paketlenirken tek bir IIFE (window.SimCore) olur; simülasyon paketleri bunu paylaşır.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createPanel } from './ui.js';
import { createLook } from './look.js';
import { createSky } from './gfx/atmosphere.js';
import { createOcean, seaState } from './gfx/ocean.js';
import { createTerrain, terrainMaterial, landscape, depthTexture, terrainSkirt, NOISE3_GLSL } from './gfx/terrain.js';
import { createVegetation, treeParts, leafMaterial } from './gfx/vegetation.js';
import { mat, procedural } from './gfx/materials.js';
import { createStudio, createSpace } from './gfx/stage.js';
import { GLSL_COMMON } from './gfx/glsl.js';
import { makeBuilding, makeBlock, populateCity, buildingMaterials, cityLightSet, cityRng, PALETTES } from './gfx/buildings.js';
import { makeCity, streetMaterials, streetTrees, streetLamps, carFleet, CAR_COLORS } from './gfx/streets.js';
import { makePerson, crowd, POSES, OUTFITS } from './gfx/people.js';
import * as util from './util.js';

export { THREE, OrbitControls, CSS2DRenderer, CSS2DObject, RoundedBoxGeometry, ConvexGeometry, ImprovedNoise, BufferGeometryUtils };
export * from './util.js';
export { createSky, createOcean, seaState, createTerrain, terrainMaterial, landscape, depthTexture, terrainSkirt, NOISE3_GLSL,
  createVegetation, treeParts, leafMaterial, mat, procedural, createStudio, createSpace, GLSL_COMMON };
// Kent: gerçek geometrili binalar (LOD'lu karolar) + sokak kiti
export { makeBuilding, makeBlock, populateCity, buildingMaterials, cityLightSet, cityRng, PALETTES, makeCity, streetMaterials, streetTrees, streetLamps, carFleet, CAR_COLORS };
// İnsanlar: eklemli figür (makePerson) ve örneklenmiş kalabalık (crowd)
export { makePerson, crowd, POSES, OUTFITS };

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

/**
 * Bir simülasyon sahnesi kurar ve döngüyü başlatır.
 * @param {object} o
 * @param {number|string} [o.background=0x0b1020]
 * @param {{fov?:number, position?:number[], target?:number[], near?:number, far?:number, ortho?:number}} [o.camera]
 *        ortho verilirse OrthographicCamera kullanılır (değer = görünen yükseklik, dünya birimi).
 * @param {boolean|object} [o.controls=true]  OrbitControls; nesne verilirse özellikleri kopyalanır.
 * @param {boolean} [o.shadows=false]
 * @param {boolean|'soft'} [o.lights=true]   Varsayılan yarıküre + yönlü ışık.
 * @param {number[]} [o.fog]                 [yakın, uzak]
 * @param {boolean} [o.playback=true]        Oynat/duraklat/hız çubuğu.
 * @param {boolean|object} [o.look=true]   Görsel katman (ortam ışığı, gökyüzü, gölge, bloom); bkz. look.js.
 * @param {string} [o.info]                  "Nasıl çalışır?" penceresine eklenecek HTML.
 */
export function createSim(o = {}) {
  const meta = window.SIM_META || { title: 'Simülasyon', desc: '', emoji: '🔬' };
  const stage = document.getElementById('stage');
  const panelEl = document.getElementById('panel');

  const _mobile = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, _mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (o.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }
  stage.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'label-layer';
  stage.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(o.background ?? 0x0b1020);
  if (o.fog) scene.fog = new THREE.Fog(scene.background, o.fog[0], o.fog[1]);

  const cam = o.camera || {};
  let camera;
  if (cam.ortho) {
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, cam.near ?? -1000, cam.far ?? 1000);
    camera.userData.orthoHeight = cam.ortho;
  } else {
    camera = new THREE.PerspectiveCamera(cam.fov ?? 50, 1, cam.near ?? 0.1, cam.far ?? 2000);
  }
  camera.position.fromArray(cam.position || [0, 6, 14]);
  const target = new THREE.Vector3().fromArray(cam.target || [0, 0, 0]);
  camera.lookAt(target);

  let controls = null;
  if (o.controls !== false) {
    controls = new OrbitControls(camera, labelRenderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.495;
    if (typeof o.controls === 'object') Object.assign(controls, o.controls);
    controls.update();
  }

  if (o.lights !== false) {
    const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x2a2f3a, 1.4);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(8, 14, 6);
    if (o.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const s = o.shadowSize ?? 20;
      Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: 80 });
      sun.shadow.bias = -0.0005;
    }
    scene.add(sun);
    scene.userData.sun = sun;
    scene.userData.hemi = hemi;
  }

  // ?look=off ya da ?look=-shadows,-bloom (hata ayıklama / zayıf cihaz)
  const lookQ = new URLSearchParams(location.search).get('look');
  const lookOpt = typeof o.look === 'object' ? { ...o.look } : {};
  if (lookQ) lookQ.split(',').forEach((k) => { if (k.startsWith('-')) lookOpt[k.slice(1)] = false; });
  // Motor: fiziksel gökyüzü ve FFT okyanus (isteğe bağlı)
  const opt = (v) => (v === true ? {} : v);
  const physSky = o.sky ? createSky(renderer, scene, opt(o.sky))
    : o.studio ? createStudio(renderer, scene, opt(o.studio))
    : o.space ? createSpace(renderer, scene, opt(o.space)) : null;
  if (physSky) lookOpt.physSky = physSky;
  const ocean = physSky && o.sky && o.ocean ? createOcean(renderer, physSky, o.ocean === true ? {} : o.ocean) : null;
  if (ocean) scene.add(ocean.mesh);
  const look = o.look === false || lookQ === 'off' ? null : createLook(renderer, scene, camera, lookOpt);

  // --- HUD (ortadaki büyük mesajlar) ve bildirimler ---
  const hud = document.createElement('div');
  hud.className = 'hud hidden';
  stage.appendChild(hud);
  const toasts = document.createElement('div');
  toasts.className = 'toasts';
  stage.appendChild(toasts);
  let hudTimer = 0;

  const ui = createPanel(panelEl);

  const updaters = [];
  const renderers = [];
  const resetters = [];
  const clickers = [];

  const sim = {
    THREE, scene, camera, renderer, controls, ui, stage, meta, sky: physSky, ocean,
    time: 0, speed: 1, paused: false, frame: 0,
    /** Simülasyon zamanıyla çağrılır (duraklatılınca durur). fn(dt, time) */
    onUpdate(fn) { updaters.push(fn); return sim; },
    /** Her karede çağrılır (duraklatılmış olsa bile). fn(realDt) */
    onRender(fn) { renderers.push(fn); return sim; },
    onReset(fn) { resetters.push(fn); return sim; },
    reset() {
      sim.time = 0;
      resetters.forEach((f) => f());
    },
    pause(v = true) { sim.paused = v; syncPlay(); },
    play() { sim.pause(false); },
    setSpeed(v) { sim.speed = v; speedSel.value = String(v); },

    /** 3B nesneye iliştirilmiş HTML etiket. parent: Object3D, pos: [x,y,z] (yerel) */
    label(text, { parent = scene, position = [0, 0, 0], className = '' } = {}) {
      const el = document.createElement('div');
      el.className = 'lbl ' + className;
      el.innerHTML = text;
      const obj = new CSS2DObject(el);
      obj.position.fromArray(position);
      obj.setText = (t) => { el.innerHTML = t; };
      obj.el = el;
      parent.add(obj);
      return obj;
    },

    hud: {
      show(html, { timeout = 0, tone = '' } = {}) {
        clearTimeout(hudTimer);
        hud.innerHTML = html;
        hud.className = 'hud ' + tone;
        if (timeout) hudTimer = setTimeout(() => sim.hud.hide(), timeout);
      },
      hide() { hud.className = 'hud hidden'; },
      el: hud,
    },

    toast(msg, tone = '') {
      const t = document.createElement('div');
      t.className = 'toast ' + tone;
      t.innerHTML = msg;
      toasts.appendChild(t);
      setTimeout(() => t.classList.add('out'), 2600);
      setTimeout(() => t.remove(), 3100);
    },

    /** Ekran koordinatından (PointerEvent) ışın atar; isabet listesini döndürür. */
    raycast(ev, objects, recursive = true) {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(objects, recursive);
    },
    /** Ekran noktasını bir düzlemle kesiştirir (sürükle-bırak için). */
    pointOnPlane(ev, plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)) {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const out = new THREE.Vector3();
      return raycaster.ray.intersectPlane(plane, out) ? out : null;
    },
    /** Tıklama (sürükleme değil) olursa cb(hit, ev). objects: dizi ya da dizi döndüren fonksiyon. */
    onClick(objects, cb) { clickers.push({ objects, cb }); return sim; },
    /** Olay dinleyicilerinin bağlanacağı eleman (kamera kontrolleriyle aynı katman). */
    get dom() { return labelRenderer.domElement; },

    /** "Nasıl çalışır?" penceresinin içeriği. */
    setInfo(html) { infoExtra = html; },
    moveCamera(position, tgt) {
      camera.position.fromArray(position);
      if (tgt) (controls ? controls.target : target).fromArray(tgt);
      if (controls) controls.update(); else camera.lookAt(target);
    },
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  // Tıklama ile sürüklemeyi ayır
  let down = null;
  labelRenderer.domElement.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  labelRenderer.domElement.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 6) return;
    for (const c of clickers) {
      const list = typeof c.objects === 'function' ? c.objects() : c.objects;
      const hits = sim.raycast(e, list);
      if (hits.length) { c.cb(hits[0], e); }
    }
  });

  // --- Oynatma çubuğu ---
  const bar = document.createElement('div');
  bar.className = 'playbar';
  bar.innerHTML = `
    <button class="pb-play" title="Oynat / Duraklat (Boşluk)">⏸</button>
    <button class="pb-reset" title="Baştan başlat (R)">⟲</button>
    <select class="pb-speed" title="Hız">${SPEEDS.map((s) => `<option value="${s}" ${s === 1 ? 'selected' : ''}>${s}×</option>`).join('')}</select>
    <span class="pb-time"></span>`;
  if (o.playback !== false) stage.appendChild(bar);
  const playBtn = bar.querySelector('.pb-play');
  const speedSel = bar.querySelector('.pb-speed');
  const timeEl = bar.querySelector('.pb-time');
  function syncPlay() { playBtn.textContent = sim.paused ? '▶' : '⏸'; }
  playBtn.onclick = () => sim.pause(!sim.paused);
  bar.querySelector('.pb-reset').onclick = () => sim.reset();
  speedSel.onchange = () => { sim.speed = parseFloat(speedSel.value); };
  sim.formatTime = null; // simülasyon kendi zaman biçimini atayabilir: (t) => '12. gün'

  window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    if (o.playback === false) return;
    if (e.code === 'Space') { e.preventDefault(); sim.pause(!sim.paused); }
    if (e.key === 'r' || e.key === 'R') sim.reset();
  });

  // --- Bilgi penceresi ---
  let infoExtra = o.info || '';
  const infoBtn = document.getElementById('info-btn');
  const modal = document.getElementById('info-modal');
  if (infoBtn && modal) {
    infoBtn.onclick = () => {
      modal.querySelector('.modal-body').innerHTML =
        `<p class="lead">${meta.desc}</p>${infoExtra}
         <p class="keys"><kbd>Sürükle</kbd> döndür · <kbd>Sağ tık / iki parmak</kbd> kaydır · <kbd>Tekerlek</kbd> yakınlaş ·
         <kbd>Boşluk</kbd> duraklat · <kbd>R</kbd> sıfırla</p>`;
      modal.showModal();
    };
    modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('.modal-close')) modal.close(); });
  }

  // --- Boyutlandırma ---
  function resize() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    if (look) look.setSize(w, h, renderer.getPixelRatio());
    labelRenderer.setSize(w, h);
    if (camera.isPerspectiveCamera) {
      camera.aspect = w / h;
    } else {
      const hh = camera.userData.orthoHeight / 2, a = w / h;
      Object.assign(camera, { left: -hh * a, right: hh * a, top: hh, bottom: -hh });
    }
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  // --- Döngü ---
  let last = performance.now(), wall = 0; // wall: bulut zamanı (hızla ölçekli, duraklatınca da akar)
  function loop(now) {
    requestAnimationFrame(loop);
    const real = Math.min(Math.max((now - last) / 1000, 0), 0.1);
    last = now;
    if (!sim.paused) {
      const dt = real * sim.speed;
      sim.time += dt;
      for (const f of updaters) f(dt, sim.time);
    }
    for (const f of renderers) f(real);
    if (controls) controls.update();
    camera.updateMatrixWorld();
    wall += real * Math.max(sim.speed, 0.25);
    if (physSky) physSky.update(camera, wall);
    if (ocean) ocean.update(sim.paused ? 0 : real * Math.min(sim.speed, 2), camera);
    if (look) { look.render(controls ? controls.target : target); }
    else renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    if (sim.frame % 10 === 0) timeEl.textContent = sim.formatTime ? sim.formatTime(sim.time) : util.fmtClock(sim.time);
    sim.frame++;
  }
  requestAnimationFrame(loop);
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  window.__sim = sim; // test ve hata ayıklama için
  return sim;
}
