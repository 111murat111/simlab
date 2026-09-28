// Motor laboratuvarı: çekirdek gfx parçalarını tek başına dener. ?scene=ocean|terrain &el=16 &low
import * as THREE from 'three';
import { createSky } from '../src/core/gfx/atmosphere.js';
import { createOcean } from '../src/core/gfx/ocean.js';
import { createTerrain, landscape, depthTexture, terrainSkirt } from '../src/core/gfx/terrain.js';
import { createVegetation } from '../src/core/gfx/vegetation.js';
import { createStudio, createSpace } from '../src/core/gfx/stage.js';
import { mat } from '../src/core/gfx/materials.js';
import { createLook } from '../src/core/look.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const q = new URLSearchParams(location.search);
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ antialias: false });
const W = innerWidth, H = innerHeight;
renderer.setSize(W, H); document.body.appendChild(renderer.domElement);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.debug.onShaderError = (gl, prog, vs, fs) => {
  console.error('SHADER', gl.getProgramInfoLog(prog), '| VS:', gl.getShaderInfoLog(vs), '| FS:', gl.getShaderInfoLog(fs));
};
const camera = new THREE.PerspectiveCamera(55, W / H, 0.25, 30000);
const which0 = q.get('scene') || 'ocean';
const sky = which0 === 'studio' ? createStudio(renderer, scene, { mood: q.get('mood') || 'day' }) : which0 === 'space' ? createSpace(renderer, scene, { star: [-300, 60, 120] }) : createSky(renderer, scene, { elevation: +(q.get('el') ?? 16), azimuth: +(q.get('az') ?? 212), clouds: +(q.get('cl') ?? 0.3), visibility: +(q.get('vis') ?? 0) });
const sun = new THREE.DirectionalLight(); scene.add(sun, sun.target);
scene.userData.sun = sun;
let ocean = null, veg = null;
const which = q.get('scene') || 'ocean';
if (which === 'ocean') {
  ocean = createOcean(renderer, sky, { wind: 9 });
  scene.add(ocean.mesh);
  const buoy = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3, 32), new THREE.MeshStandardMaterial({ color: 0xaa2211, roughness: 0.45 }));
  buoy.position.set(0, 1, 0); scene.add(buoy);
  // Açık Deniz ile aynı kamera: hedef (0,1.8,0), uzaklık 46, güneşe bakan yaw
  const yaw = -212 * Math.PI / 180 + 0.1, pitch = 0.1, d = 46;
  camera.position.set(d * Math.cos(pitch) * Math.sin(yaw), 1.8 + d * Math.sin(pitch), d * Math.cos(pitch) * Math.cos(yaw));
  camera.lookAt(0, 1.8, 0);
} else if (which === 'studio' || which === 'space') {
  const names = which === 'studio' ? ['brushedMetal', 'glass', 'wood', 'ceramic', 'paintedMetal', 'plastic', 'fabric', 'liquid'] : [];
  names.forEach((n, i) => {
    const g = i % 2 ? new THREE.SphereGeometry(0.6, 64, 32) : new RoundedBoxGeometry(1.1, 1.1, 1.1, 4, 0.1);
    const m = new THREE.Mesh(g, mat[n]()); m.position.set((i % 4 - 1.5) * 1.6, 0.6, Math.floor(i / 4) * 1.6 - 0.8); m.rotation.y = i; scene.add(m);
  });
  if (which === 'space') {
    const pl = new THREE.Mesh(new THREE.SphereGeometry(3, 128, 64), mat.rock({ color: 0x9a8f84, scale: 1.2 }));
    scene.add(pl);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.8, 64, 32), mat.rock({ color: 0x777370, scale: 3 })); moon.position.set(5, 1, -3); scene.add(moon);
    camera.position.set(2, 2.5, 10); camera.lookAt(0.8, 0, 0);
  } else { camera.position.set(4.2, 3, 6.5); camera.lookAt(0, 0.5, 0); }
} else if (which === 'land') {
  // Türbin arazisiyle aynı: koyu bant teşhisi (?forest=0|1, ?veg=0|1)
  const hf0 = landscape({ seed: 12, size: 1100, height: 190, base: -30, warp: 0.55 });
  const hf = (x, z) => { const r = Math.hypot(x, z), f = THREE.MathUtils.smoothstep(r, 70, 320);
    return THREE.MathUtils.lerp(4, hf0(x, z) - hf0(0, 0) + 4 + 0.012 * r, f) + 26 * (1 - Math.exp(-((r / 2600) ** 2))); };
  scene.add(createTerrain(hf, { size: [6400, 6400], res: [384, 384], materialOptions: { water: -50, forest: +(q.get('forest') ?? 0.8) } }));
  scene.add(terrainSkirt(hf, { inner: 3200, outer: 60000 }));
  if (q.get('veg') === '1') { veg = createVegetation(hf, { rect: [-2400, -2400, 2400, 2400], trees: 2600, shrubs: 2600, rocks: 500, near: [0, 0, 900] }); scene.add(veg.group); }
  camera.far = 80000; camera.updateProjectionMatrix();
  camera.position.set(-460, 330, 560); camera.lookAt(160, 70, 0);
} else if (which === 'materials') {
  const names = Object.keys(mat);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), mat.concrete({ scale: 0.5 }));
  scene.add(ground);
  names.forEach((n, i) => {
    const col = i % 5, row = Math.floor(i / 5);
    const g = i % 2 ? new THREE.SphereGeometry(0.9, 64, 32) : new RoundedBoxGeometry(1.6, 1.6, 1.6, 4, 0.12);
    const m = new THREE.Mesh(g, mat[n]());
    m.position.set((col - 2) * 2.6, 0.9, (row - 1) * 2.6);
    m.rotation.y = i * 0.7;
    scene.add(m);
  });
  camera.position.set(3, 3.2, 8.5); camera.lookAt(0, 0.7, 0);
} else {
  // Kıyı: kuzeye doğru yükselen aşınmış tepeler, güneyde deniz
  const hf = landscape({ seed: 3, size: 1100, height: 320, base: -40,
    shape: (x, z, h) => h + 0.09 * (-z) - 25 });
  const R = 2400;
  scene.add(createTerrain(hf, { size: [2 * R, 2 * R], res: [320, 320] }));
  scene.add(terrainSkirt(hf, { inner: R, outer: 25000 }));
  ocean = createOcean(renderer, sky, { wind: 7, windDir: 200 });
  ocean.setDepth(depthTexture(hf, [-R, -R, R, R], 256), [-R, -R, R, R]);
  scene.add(ocean.mesh);
  // Kameraya en yakın kıyı noktası (h≈4 m)
  let best = null;
  for (let z = -600; z < 1200; z += 10) for (let x = -900; x < 900; x += 10) {
    const h = hf(x, z); if (h > 3 && h < 6 && hf(x, z + 40) < 0) { const d = Math.hypot(x + 100, z - 400); if (!best || d < best[2]) best = [x, z, d]; }
  }
  veg = createVegetation(hf, { rect: [-1600, -1600, 1600, 1400], trees: +(q.get('trees') ?? 5000), rocks: 900, shrubs: +(q.get('shrubs') ?? 6000), grass: +(q.get('grass') ?? 30000), near: best ? [best[0], best[1] - 150, 450] : null, grassAt: best ? [best[0] - 20, best[1] + 50, 45] : null });
  scene.add(veg.group);
  if (q.get('cam') === 'near' && best) {
    camera.position.set(best[0] - 30, 9, best[1] + 70); camera.lookAt(best[0] + 20, 12, best[1] - 120);
  } else { camera.position.set(-650, 140, 900); camera.lookAt(100, 40, -200); }
}
const lookOpt = { physSky: sky, exposure: +(q.get('exp') ?? 0.6) };
(q.get('look') || '').split(',').forEach((k) => { if (k.startsWith('-')) lookOpt[k.slice(1)] = false; });
const look = createLook(renderer, scene, camera, lookOpt);
window.__scene = scene;
look.setSize(W, H, 1);
let t = 0; window.__f = 0;
(function loop() {
  requestAnimationFrame(loop);
  t += 0.05;
  camera.updateMatrixWorld();
  sky.update(camera, t); ocean?.update(0.05, camera); veg?.update(t, 1);
  look.render(new THREE.Vector3(0, 0, 0)); window.__f++;
})();
