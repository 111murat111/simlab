// Ev Kimyası Güvenliği — iki temizlik ürününü sanal kovada karıştır; güvenli köpürme mi, zehirli gaz mı? (uyarı amaçlı)
import { createSim, THREE, RoundedBoxGeometry, rand, clamp, lerp, smoothstep, fmt, textTexture, pick, mat, procedural } from '@core';
import { PRODUCTS, GASES, SYM, LEVEL, FIRST_AID, result, pairKey, ALL_PAIRS } from './data.js';
import { labRoom, glassGeometry, liquidGeometry, glassMesh, liquidMesh, tiles } from './labkit.js';

// Sahne metre ölçeğinde; kova + şişe düzeni U ölçekli bir "içerik" grubunda (1 birim = 17 cm) tezgâhın üstünde durur.
const U = 0.17, BENCH = 0.9, WALL_Z = -0.58, DEPTH = 0.8, CZ = -0.04;
const toC = (y) => (y - BENCH) / U;           // dünya yüksekliği → içerik birimi
const WALL_C = (WALL_Z + 0.03 - CZ) / U;      // duvar yüzü (içerik z)
const FRONT_C = (WALL_Z + DEPTH - CZ) / U;    // tezgâh ön kenarı
const FLOOR_C = toC(0.02);
const WIN = { y: 1.52, w: 1.0, h: 0.76 };
const WIN_C = { x: WIN.w / 2 / U, y0: toC(WIN.y - WIN.h / 2), y1: toC(WIN.y + WIN.h / 2), yc: toC(WIN.y) };

const BUCKET = new THREE.Vector3(0, 0, 0.4);
const B_R0 = 0.6, B_R1 = 0.86, B_H = 1.1;
const byId = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

const sim = createSim({
  studio: { color: 0xc9c0b2, mood: 'day', warmth: 0.25, key: { el: 50, az: 212 }, radius: 22 },
  look: { aoRadius: 0.06 },
  camera: { position: [0, BENCH + 6.2 * U, CZ + 9.4 * U], target: [0, BENCH + 0.9 * U, CZ - 0.4 * U], fov: 45, near: 0.01, far: 200 },
  controls: { maxPolarAngle: 1.45, minDistance: 4 * U, maxDistance: 20 * U },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Mutfak tezgahında sık kullanılan dokuz temizlik ürünü var. İkisini seçip <b>Karıştır</b>'a basınca şişeler sanal kovaya
    boşaltılır ve sonuç gösterilir: zararsız köpürme, <b>önerilmeyen</b> bir karışım ya da <b>zehirli gaz</b>.</p>
    <ul>
      <li><b>Çamaşır suyu + asit</b> (tuz ruhu, sirke, kireç çözücü) → <b>klor gazı (Cl₂)</b>: sarı-yeşil, havadan ağır, yere çöker.</li>
      <li><b>Çamaşır suyu + amonyak</b> → <b>kloramin</b> buharları.</li>
      <li><b>Çamaşır suyu + alkol</b> → <b>kloroform</b> ve diğer klorlu bileşikler.</li>
      <li><b>Oksijenli su + sirke</b> → aşındırıcı <b>perasetik asit</b>.</li>
      <li><b>Karbonat + sirke</b> → zararsız CO₂ köpüğü (ama kapalı kapta basınç!).</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li>Şişelere tıklayarak ya da panelden iki ürün seç ve karıştır. Klor bulutunun tezgaha çöküp yayıldığını izle.</li>
      <li><b>Pencereyi aç</b>: havalandırmanın bulutu nasıl dağıttığını gör.</li>
      <li>"Tüm kombinasyonlar" tablosundaki 36 çifti keşfet, sonra <b>Quiz</b> ile kendini dene.</li>
    </ul>
    <h3>Acil durumda</h3>
    <p>Temiz havaya çık · <b>114</b> Ulusal Zehir Danışma Merkezi (UZEM, 7/24) · nefes darlığı/bilinç bulanıklığında <b>112</b>.</p>
    <p><small>Bu simülasyon yalnızca uyarı amaçlıdır; miktar ya da tarif vermez. Gaz bulutları ve köpük görsel temsildir, gerçek
    derişimleri göstermez. Ürün içerikleri markaya göre değişir; her zaman etiketi oku ve ürünleri <b>asla karıştırma</b>.</small></p>`,
});

// --- Mutfak: taş tezgâh, ahşap dolaplar, fayans duvar, üst dolaplar, sürgülü pencere ---
labRoom(sim.scene, { width: 3.4, depth: DEPTH, benchH: BENCH, style: 'kitchen', wallZ: WALL_Z, shelf: false, window: false });
const content = new THREE.Group();
content.position.set(0, BENCH, CZ);
content.scale.setScalar(U);
sim.scene.add(content);

// Üst dolaplar (pencerenin iki yanında)
{
  const body = mat.paintedMetal({ color: 0x6d7f73, wear: 0.02 });
  const door = mat.wood({ color: 0x8a6440, varnish: true });
  const handle = mat.brushedMetal({ color: 0xc9ccd0 });
  for (const sx of [-1, 1]) {
    const x = sx * 1.15;
    const c = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.72, 0.34), body);
    c.position.set(x, 1.86, WALL_Z + 0.17); sim.scene.add(c);
    for (const dx of [-0.275, 0.275]) {
      const d = new THREE.Mesh(new RoundedBoxGeometry(0.54, 0.7, 0.02, 2, 0.004), door);
      d.position.set(x + dx, 1.86, WALL_Z + 0.35); sim.scene.add(d);
      const h = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.14, 0.02, 2, 0.005), handle);
      h.position.set(x + dx - Math.sign(dx) * 0.22, 1.6, WALL_Z + 0.372); sim.scene.add(h);
    }
  }
  // Tezgâh altı ışık çubuğu hissi yerine: duvar dibinde fayans süpürgelik kenarı
  const lip = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.012, 0.012), tiles({ color: 0xe8e2d6, size: 0.1 }));
  lip.position.set(0, BENCH + 0.006, WALL_Z + 0.006); sim.scene.add(lip);
}

// Pencere: aydınlık dış manzara, beyaz PVC kasa, iki kanat (alt kanat yukarı sürülerek açılır)
const win = new THREE.Group();
win.position.set(0, WIN.y, WALL_Z + 0.004);
sim.scene.add(win);
{
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w, WIN.h), new THREE.ShaderMaterial({
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; void main(){
      vec3 top = vec3(0.5, 0.7, 1.0)*2.0, hor = vec3(1.0, 0.97, 0.92)*3.0;
      vec3 c = mix(hor, top, smoothstep(0.15, 1.0, vUv.y));
      float hill = smoothstep(0.30, 0.28, vUv.y - 0.05*sin(vUv.x*7.0 + 1.3) - 0.025*sin(vUv.x*19.0));
      float trees = smoothstep(0.24, 0.22, vUv.y - 0.06*abs(sin(vUv.x*31.0)) - 0.03*sin(vUv.x*67.0));
      c = mix(c, vec3(0.42, 0.5, 0.42)*1.4, hill);
      c = mix(c, vec3(0.16, 0.24, 0.13), trees);
      gl_FragColor = vec4(c, 1.0); }`,
  }));
  sky.userData.noShadow = true;
  win.add(sky);
}
const frameMat = mat.plastic({ color: 0xf2f2ef, gloss: 0.3 });
const bar = (parent, w, h, x, y, z, d = 0.06) => {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.008), frameMat);
  m.position.set(x, y, z); parent.add(m); return m;
};
bar(win, WIN.w + 0.12, 0.06, 0, WIN.h / 2 + 0.03, 0.03);
bar(win, WIN.w + 0.12, 0.06, 0, -WIN.h / 2 - 0.03, 0.03);
bar(win, 0.06, WIN.h + 0.12, -WIN.w / 2 - 0.03, 0, 0.03);
bar(win, 0.06, WIN.h + 0.12, WIN.w / 2 + 0.03, 0, 0.03);
{
  const sill = new THREE.Mesh(new RoundedBoxGeometry(WIN.w + 0.24, 0.025, 0.12, 2, 0.006), mat.ceramic({ color: 0xf1ede4 }));
  sill.position.set(0, -WIN.h / 2 - 0.075, 0.05); win.add(sill);
}
const paneMat = mat.glass({ thickness: 0.004, rough: 0.02 });
const upperSash = new THREE.Group();
const lowerSash = new THREE.Group();
const SASH_H = WIN.h / 2 + 0.02;
for (const [s, y, z] of [[upperSash, WIN.h / 4, 0.02], [lowerSash, -WIN.h / 4, 0.05]]) {
  const pane = new THREE.Mesh(new THREE.BoxGeometry(WIN.w - 0.06, SASH_H - 0.05, 0.004), paneMat);
  pane.userData.noCast = true; pane.userData.noAO = true;
  s.add(pane);
  bar(s, WIN.w, 0.035, 0, SASH_H / 2 - 0.018, 0, 0.03);
  bar(s, WIN.w, 0.035, 0, -SASH_H / 2 + 0.018, 0, 0.03);
  bar(s, 0.035, SASH_H, -WIN.w / 2 + 0.018, 0, 0, 0.03);
  bar(s, 0.035, SASH_H, WIN.w / 2 - 0.018, 0, 0, 0.03);
  s.position.set(0, y, z);
  win.add(s);
}
const SASH_CLOSED = -WIN.h / 4, SASH_OPEN = WIN.h / 4 - 0.02;

// Tezgâhta birkaç gerçekçi eşya: ahşap kesme tahtası, seramik kupa
{
  const board = new THREE.Mesh(new RoundedBoxGeometry(0.38, 0.018, 0.26, 3, 0.006), mat.wood({ color: 0xa87a4c, ring: 10 }));
  board.position.set(1.18, BENCH + 0.009, -0.3); board.rotation.y = 0.18; sim.scene.add(board);
  const mug = new THREE.Mesh(glassGeometry([[0, 0], [0.036, 0], [0.04, 0.004], [0.041, 0.09]], 0.004, 40), mat.ceramic({ color: 0x2f5d8a }));
  mug.position.set(-1.25, BENCH, -0.28); sim.scene.add(mug);
  const hdl = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.006, 10, 24, Math.PI * 1.2), mug.material);
  hdl.rotation.z = -Math.PI * 0.6; hdl.position.set(-1.25 + 0.045, BENCH + 0.048, -0.28); sim.scene.add(hdl);
}

// --- Kova: kalın cidarlı plastik kova, metal sap ---
const bucket = new THREE.Group();
bucket.position.copy(BUCKET);
content.add(bucket);
{
  const m = new THREE.Mesh(glassGeometry([[0, 0], [B_R0, 0], [B_R0 + 0.01, 0.03], [B_R1, B_H]], 0.035, 64), mat.plastic({ color: 0x5f7fa3, gloss: 0.35, scale: U }));
  bucket.add(m);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(B_R1 + 0.01, 0.045, 12, 64), m.material);
  rim.rotation.x = Math.PI / 2; rim.position.y = B_H;
  bucket.add(rim);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(B_R1 + 0.03, 0.02, 8, 48, Math.PI), mat.brushedMetal({ color: 0xc3c8ce, scale: U }));
  handle.position.y = B_H - 0.1;
  handle.rotation.set(-1.1, 0.35, 0);
  bucket.add(handle);
}
const bucketR = (y) => lerp(B_R0, B_R1, y / B_H) - 0.04;
const liqColor = new THREE.Color(), liqTarget = new THREE.Color();
const liquid = liquidMesh(new THREE.BufferGeometry(), 0x8899aa, 0.08);
const liquidMat = liquid.material;
liquidMat.thickness = 0.5;
liquidMat.emissive = new THREE.Color(0);
liquid.visible = false;
bucket.add(liquid);
let liqBuilt = -1;
function buildBucketLiquid(level) {
  if (Math.abs(level - liqBuilt) < 0.008) return;
  liqBuilt = level;
  liquid.geometry.dispose();
  liquid.geometry = liquidGeometry(bucketR, 0.04, Math.max(0.05, level), { meniscus: 0.002 / U, segs: 56, steps: 6 });
}

// Köpük (InstancedMesh: kabarcık kümeleri) ve fokurdayan kabarcıklar (yumuşak nokta sprite'ları)
const FOAM_N = 130, FIZZ_N = 50;
const foamMat = procedural({
  key: 'ev-foam', physical: true, scale: U, bump: 0.004,
  params: { color: 0xf6f8f8, roughness: 0.3, sheen: 0.8, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.5 },
  pattern: `float c = vn3(p*900.0); col *= 0.9 + 0.12*c; rough = 0.2 + 0.4*c; h = c;`,
});
const foam = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), foamMat, FOAM_N);
foam.userData.noCast = true;
const foamSeed = [];
for (let i = 0; i < FOAM_N; i++) {
  const d = new THREE.Vector3().randomDirection();
  d.y = Math.abs(d.y);
  const r = Math.cbrt(Math.random());
  foamSeed.push({ p: d.multiplyScalar(r), s: rand(0.05, 0.13), ph: rand(0, 6.28) });
}
foam.count = 0;
bucket.add(foam);
const softTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.25)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const fizzP = Array.from({ length: FIZZ_N }, () => ({ x: 0, y: 0, z: 0, v: 0, life: 0, s: 0 }));
const fizzPos = new Float32Array(FIZZ_N * 3);
const fizzGeo = new THREE.BufferGeometry();
fizzGeo.setAttribute('position', new THREE.BufferAttribute(fizzPos, 3).setUsage(THREE.DynamicDrawUsage));
const fizz = new THREE.Points(fizzGeo, new THREE.PointsMaterial({ map: softTex, size: 0.006, color: 0xeef6ff, transparent: true, depthWrite: false, sizeAttenuation: true }));
fizz.frustumCulled = false;
bucket.add(fizz);

// Tehlike levhası ve gaz etiketi
const canvasTex = (w, h, draw) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const signTex = canvasTex(256, 256, (g) => {
  g.beginPath(); g.moveTo(128, 18); g.lineTo(240, 222); g.lineTo(16, 222); g.closePath();
  g.fillStyle = '#facc15'; g.fill();
  g.lineWidth = 16; g.lineJoin = 'round'; g.strokeStyle = '#111'; g.stroke();
  g.fillStyle = '#111'; g.font = 'bold 130px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('!', 128, 145);
});
const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex, transparent: true, depthTest: false }));
sign.scale.setScalar(0.9);
sign.position.set(BUCKET.x, 3.5, BUCKET.z);
sign.visible = false;
sign.renderOrder = 10;
content.add(sign);
const gasLabel = sim.label('', { parent: content, position: [BUCKET.x, 2.75, BUCKET.z], className: 'big' });
gasLabel.visible = false;
const ALARM_K = 0.12;
const alarm = new THREE.PointLight(0xff3b30, 0, 1.6, 1.5);
alarm.position.set(BUCKET.x, 2, BUCKET.z + 1);
content.add(alarm);

// --- Şişeler: HDPE plastik gövde, PET/cam şeffaf şişelerde gerçek sıvı, kâğıt etiket ---
function lathe(profile, seg = 48) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }
function labelTex(p) {
  const t = textTexture(p.tag, { size: 40, color: p.labelFg || '#ffffff', bg: p.labelBg, width: 256, font: '800 {s}px system-ui, sans-serif' });
  t.anisotropy = 4;
  return t;
}
const labelMat = (p) => new THREE.MeshStandardMaterial({ map: labelTex(p), roughness: 0.55 });
function bandLabel(p, r, y, h) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32, 1, true, -Math.PI * 0.42, Math.PI * 0.84), labelMat(p));
  m.position.y = y;
  return m;
}
const PROFILES = {
  bottle: [[0, 0], [0.3, 0], [0.33, 0.05], [0.33, 0.9], [0.26, 1.08], [0.12, 1.22], [0.12, 1.36], [0, 1.36]],
  glass: [[0, 0], [0.27, 0], [0.28, 0.04], [0.28, 0.86], [0.2, 1.02], [0.1, 1.16], [0.09, 1.48], [0, 1.48]],
  spray: [[0, 0], [0.3, 0], [0.31, 0.05], [0.31, 0.84], [0.2, 0.97], [0.11, 1.03], [0.11, 1.13], [0, 1.13]],
  squeeze: [[0, 0], [0.27, 0], [0.3, 0.06], [0.3, 1.0], [0.2, 1.14], [0.09, 1.22], [0, 1.22]],
  brown: [[0, 0], [0.24, 0], [0.25, 0.04], [0.25, 0.7], [0.13, 0.84], [0.1, 0.94], [0, 0.94]],
};
const plastic = (color, gloss = 0.4) => mat.plastic({ color, gloss, scale: U });

function makeBottle(p) {
  const g = new THREE.Group();
  let h, capY, capR = 0.14;
  if (p.shape === 'jug') {
    const bm = plastic(p.body, 0.25);
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.78, 1.12, 0.55, 5, 0.14), bm);
    body.position.y = 0.56; g.add(body);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.3, 0.2, 32), bm);
    shoulder.position.set(0.14, 1.2, 0); g.add(shoulder);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 12, 28, Math.PI), bm);
    handle.position.set(-0.2, 1.05, 0); handle.rotation.z = Math.PI * 0.1; g.add(handle);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.46), labelMat(p));
    lab.position.set(0, 0.5, 0.278); g.add(lab);
    h = 1.3; capY = 1.3;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.14, 32), plastic(p.cap, 0.5));
    cap.position.set(0.14, 1.37, 0); g.add(cap);
    g.userData.mouth = new THREE.Vector3(0.14, 1.44, 0);
  } else if (p.shape === 'box') {
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.82, 0.36, 3, 0.02), mat.plastic({ color: p.body, gloss: 0.05, scale: U }));
    body.position.y = 0.41; g.add(body);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.4), labelMat(p));
    lab.position.set(0, 0.42, 0.181); g.add(lab);
    const spout = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.06, 0.2, 2, 0.01), plastic(0xf4f4f0, 0.1));
    spout.position.set(0, 0.84, 0); g.add(spout);
    h = 0.87;
    g.userData.mouth = new THREE.Vector3(0, 0.87, 0);
  } else {
    const prof = PROFILES[p.shape];
    h = prof[prof.length - 1][1];
    const bodyR = prof[2][0];
    let body;
    if (p.clear) {
      // Şeffaf PET şişe: gerçek kırılma + içinde renkli sıvı (menisküslü)
      body = glassMesh(glassGeometry(prof.slice(0, -1), 0.02, 48), { thickness: 0.004 });
      const rOf = (y) => {
        for (let i = 1; i < prof.length - 1; i++) {
          const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
          if (y <= y1) return Math.max(0.01, lerp(r0, r1, (y - y0) / Math.max(y1 - y0, 1e-4)) - 0.025);
        }
        return 0.05;
      };
      const liq = liquidMesh(liquidGeometry(rOf, 0.025, 0.8, { meniscus: 0.002 / U, segs: 40 }), p.liquid, 0.05);
      liq.material.thickness = 0.4;
      g.add(liq);
    } else {
      body = new THREE.Mesh(lathe(prof), plastic(p.body, p.shape === 'brown' ? 0.6 : 0.35));
    }
    if (p.shape === 'squeeze') body.scale.set(1.2, 1, 0.72);
    g.add(body);
    const lab = bandLabel(p, bodyR + 0.006, h * 0.4, Math.min(0.46, h * 0.36));
    if (p.shape === 'squeeze') lab.scale.set(1.2, 1, 0.72);
    g.add(lab);
    capY = h;
    capR = prof[prof.length - 2][0] + 0.02;
    if (p.shape === 'spray') {
      const cm = plastic(p.cap, 0.4);
      const head = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.2, 0.42, 2, 0.04), cm);
      head.position.set(0, h + 0.1, 0.08); g.add(head);
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.1, 16), plastic(0x1b1f26, 0.3));
      nozzle.rotation.x = Math.PI / 2; nozzle.position.set(0, h + 0.12, 0.33); g.add(nozzle);
      const trig = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.24, 0.07, 2, 0.02), cm);
      trig.position.set(0, h - 0.05, 0.24); trig.rotation.x = 0.3; g.add(trig);
      h += 0.2;
    } else {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(capR, capR, 0.16, 32), plastic(p.cap, 0.5));
      cap.position.y = capY + 0.08; g.add(cap);
      const rib = new THREE.Mesh(new THREE.TorusGeometry(capR, 0.012, 6, 32), cap.material);
      rib.rotation.x = Math.PI / 2; rib.position.y = capY + 0.15; g.add(rib);
      h += 0.16;
    }
    g.userData.mouth = new THREE.Vector3(0, h, 0);
  }
  g.userData.h = h;
  return g;
}

const bottles = PRODUCTS.map((p, i) => {
  const g = makeBottle(p);
  const a = Math.PI + 0.12 + (i / (PRODUCTS.length - 1)) * (Math.PI - 0.24);
  const home = new THREE.Vector3(BUCKET.x + Math.cos(a) * 3.5, 0, BUCKET.z + Math.sin(a) * 3.3);
  const rotY = Math.atan2(0 - home.x, 9.4 - home.z) * 0.8;
  g.position.copy(home);
  g.rotation.y = rotY;
  g.traverse((o) => { o.userData.pid = p.id; });
  content.add(g);
  // Seçim halkası (veri katmanı): tezgâhta ince ışıklı halka
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 8, 48), mat.glow({ color: 0x38bdf8, intensity: 2.5 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(home.x, 0.03, home.z);
  ring.visible = false;
  ring.userData.noShadow = true;
  content.add(ring);
  const lbl = sim.label(p.short, { parent: content, position: [home.x, g.userData.h + 0.3 + (i % 2) * 0.34, home.z] });
  return { p, g, home, rotY, ring, lbl, bob: 0 };
});
const bottleOf = Object.fromEntries(bottles.map((b) => [b.p.id, b]));

// Dökme akışı (ince sıvı sütunu)
const streams = [0, 1].map(() => {
  const m = liquidMesh(new THREE.CylinderGeometry(0.035, 0.028, 1, 16), 0xffffff, 0.2);
  m.material.thickness = 0.03;
  m.visible = false;
  content.add(m);
  return m;
});

// --- Gaz bulutu partikülleri (yumuşak noktalar, parçacık başına saydamlık) ---
const CN = 520;
const cPos = new Float32Array(CN * 3), cCol = new Float32Array(CN * 3), cAlpha = new Float32Array(CN), cSize = new Float32Array(CN);
const cloud = Array.from({ length: CN }, () => ({ alive: false, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, a: 0, s: 1, buoy: 0 }));
const cGeo = new THREE.BufferGeometry();
cGeo.setAttribute('position', new THREE.BufferAttribute(cPos, 3).setUsage(THREE.DynamicDrawUsage));
cGeo.setAttribute('aColor', new THREE.BufferAttribute(cCol, 3).setUsage(THREE.DynamicDrawUsage));
cGeo.setAttribute('aAlpha', new THREE.BufferAttribute(cAlpha, 1).setUsage(THREE.DynamicDrawUsage));
cGeo.setAttribute('aSize', new THREE.BufferAttribute(cSize, 1).setUsage(THREE.DynamicDrawUsage));
const cMat = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: 400 }, uU: { value: U } },
  vertexShader: `
    attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
    uniform float uScale, uU; varying vec3 vC; varying float vA;
    void main() {
      vC = aColor; vA = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uU * uScale / max(-mv.z, 0.01);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    varying vec3 vC; varying float vA;
    void main() {
      float r = length(gl_PointCoord - 0.5) * 2.0;
      if (r > 1.0) discard;
      gl_FragColor = vec4(vC * 1.6, vA * (1.0 - r) * (1.0 - r));
    }`,
  transparent: true, depthWrite: false,
});
const cloudPts = new THREE.Points(cGeo, cMat);
cloudPts.frustumCulled = false;
cloudPts.renderOrder = 5;
content.add(cloudPts);
let emitAcc = 0;

function emitCloud(gas) {
  const c = cloud.find((q) => !q.alive);
  if (!c) return;
  const r = rand(0, 0.5), a = rand(0, 6.28);
  Object.assign(c, {
    alive: true, x: BUCKET.x + Math.cos(a) * r, y: BUCKET.y + liquidY + 0.05, z: BUCKET.z + Math.sin(a) * r,
    vx: rand(-0.25, 0.25), vy: rand(0.5, 0.95), vz: rand(-0.25, 0.25), age: 0, life: rand(9, 15),
    a: gas.alpha * rand(0.7, 1), s: gas.size * rand(0.7, 1.2), buoy: gas.buoy,
  });
  const i = cloud.indexOf(c), hex = gas.color;
  cCol[i * 3] = ((hex >> 16) & 255) / 255; cCol[i * 3 + 1] = ((hex >> 8) & 255) / 255; cCol[i * 3 + 2] = (hex & 255) / 255;
}

function updateCloud(dt, t) {
  const open = windowOpen.value;
  let dens = 0;
  for (let i = 0; i < CN; i++) {
    const c = cloud[i];
    if (!c.alive) { cAlpha[i] = 0; cPos[i * 3 + 1] = -99; continue; }
    c.age += dt * (open ? 2.2 : 1);
    c.vy += c.buoy * dt * 3;
    // Hafif türbülans
    c.vx += Math.sin(t * 0.9 + i) * 0.05 * dt;
    c.vz += Math.cos(t * 0.7 + i * 1.3) * 0.05 * dt;
    if (open) { c.vz -= 0.55 * dt; c.vy += (WIN_C.yc - c.y) * 0.08 * dt; }
    const drag = Math.exp(-dt * 0.9);
    c.vx *= drag; c.vy *= drag; c.vz *= drag;
    c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    // Havadan ağır gazlar tezgaha çöker ve yayılır
    const onBench = Math.abs(c.x) < 9.5 && c.z < FRONT_C;
    const floorY = onBench ? 0.2 : FLOOR_C + 0.2;
    if (c.y < floorY) {
      c.y = floorY;
      if (c.vy < 0) { c.vy *= -0.1; const sp = Math.hypot(c.x - BUCKET.x, c.z - BUCKET.z) || 1; c.vx += (c.x - BUCKET.x) / sp * 0.2; c.vz += (c.z - BUCKET.z) / sp * 0.2; }
    }
    if (c.z < WALL_C) { if (open && Math.abs(c.x) < WIN_C.x && c.y > WIN_C.y0 && c.y < WIN_C.y1) c.alive = false; else { c.z = WALL_C; c.vz *= -0.2; } }
    if (c.age > c.life || c.y > 12 || Math.abs(c.x) > 9) c.alive = false;
    const k = c.age / c.life;
    const al = c.alive ? c.a * smoothstep(0, 0.08, k) * (1 - smoothstep(0.6, 1, k)) : 0;
    cAlpha[i] = al;
    cSize[i] = c.s * (0.55 + k * 1.6);
    cPos[i * 3] = c.x; cPos[i * 3 + 1] = c.alive ? c.y : -99; cPos[i * 3 + 2] = c.z;
    dens += al;
  }
  cGeo.attributes.position.needsUpdate = true;
  cGeo.attributes.aAlpha.needsUpdate = true;
  cGeo.attributes.aSize.needsUpdate = true;
  cGeo.attributes.aColor.needsUpdate = true;
  return dens;
}

// --- Durum ---
let sel = ['camasir', 'tuzruhu'];
let mix = null;          // dökme animasyonu
let react = null;        // süren tepkime
let liquidY = 0, liquidTarget = 0;
let foamLevel = 0;
const explored = new Set();
let dangerFound = 0;

function setSelection(a, b, fromUI = false) {
  sel = [a, b];
  if (!fromUI) { selA.set(a); selB.set(b); }
  bottles.forEach((bt) => {
    const k = sel.indexOf(bt.p.id);
    bt.ring.visible = k >= 0;
    if (k >= 0) bt.ring.material.emissive.setHex(k === 0 ? 0x38bdf8 : 0xf59e0b);
    bt.lbl.el.style.borderColor = k === 0 ? '#38bdf8' : k === 1 ? '#f59e0b' : '';
    bt.lbl.el.style.color = k === 0 ? '#7dd3fc' : k === 1 ? '#fcd34d' : '';
  });
  const pa = byId[a], pb = byId[b];
  selInfo.set(`<b style="color:#7dd3fc">① ${pa.name}</b>: ${pa.active} · <i>${pa.nature}</i><br>
    <b style="color:#fcd34d">② ${pb.name}</b>: ${pb.active} · <i>${pb.nature}</i>`);
}

function pickBottle(id) {
  if (mix) return;
  if (sel.includes(id)) { sim.toast(`${byId[id].name} zaten seçili`); return; }
  setSelection(sel[1], id);
}

function snapHome() {
  bottles.forEach((b) => {
    b.g.position.copy(b.home);
    b.g.rotation.set(0, b.rotY, 0);
    b.lbl.visible = true;
  });
  streams.forEach((s) => (s.visible = false));
}

function emptyBucket() {
  liquidY = liquidTarget = 0;
  liquid.visible = false;
  foamLevel = 0;
  foam.count = 0;
  react = null;
  sign.visible = false;
  gasLabel.visible = false;
  alarm.intensity = 0;
  liquidMat.emissive.setHex(0);
}

function startMix(a = sel[0], b = sel[1]) {
  if (a === b) return;
  if (sel[0] !== a || sel[1] !== b) setSelection(a, b);
  snapHome();
  emptyBucket();
  liqColor.setHex(byId[a].liquid);
  liqTarget.setHex(byId[a].liquid).lerp(new THREE.Color(byId[b].liquid), 0.5);
  mix = { a: bottleOf[a], b: bottleOf[b], t: 0, res: result(a, b), started: false };
  sim.hud.hide();
  if (sim.paused) sim.play();
}

const T_GO = 0.9, T_TILT = 1.35, T_POUR = 2.75, T_UNTILT = 3.15, T_BACK = 3.95, T_REACT = 1.7;
const _v = new THREE.Vector3(), _m = new THREE.Vector3();

function updateMix(dt) {
  if (!mix) return;
  mix.t += dt;
  const t = mix.t;
  [mix.a, mix.b].forEach((bt, k) => {
    const side = k === 0 ? -1 : 1;
    const pour = _v.set(BUCKET.x + side * 1.35, 2.25, BUCKET.z);
    const go = t < T_UNTILT ? smoothstep(0, T_GO, t) : 1 - smoothstep(T_UNTILT, T_BACK, t);
    bt.g.position.lerpVectors(bt.home, pour, go);
    bt.g.rotation.y = lerp(bt.rotY, 0, go);
    const tilt = smoothstep(T_GO, T_TILT, t) * (1 - smoothstep(T_POUR, T_UNTILT, t));
    bt.g.rotation.z = -side * tilt * 1.95;
    bt.lbl.visible = go < 0.05;
    const s = streams[k];
    s.visible = t > T_TILT && t < T_POUR;
    if (s.visible) {
      bt.g.updateMatrixWorld();
      _m.copy(bt.g.userData.mouth).applyMatrix4(bt.g.matrixWorld);
      const bottom = BUCKET.y + Math.max(liquidY, 0.05);
      const len = Math.max(_m.y - bottom, 0.05);
      s.position.set(_m.x, bottom + len / 2, _m.z);
      s.scale.set(1 + Math.sin(t * 40 + k) * 0.15, len, 1);
      s.material.attenuationColor.setHex(bt.p.shape === 'box' ? 0xffffff : bt.p.liquid);
    }
  });
  if (t > T_TILT && t < T_POUR) {
    liquidTarget = 0.62 * smoothstep(T_TILT, T_POUR, t);
    liquid.visible = true;
  }
  if (!mix.started && t > T_REACT) { mix.started = true; beginReaction(mix.res); }
  if (t > T_BACK) { const r = mix.res; mix = null; snapHome(); announce(r); }
}

function beginReaction(res) {
  react = { res, t: 0 };
  const gasTint = res.gas ? new THREE.Color(GASES[res.gas].color) : null;
  if (gasTint) liqTarget.lerp(gasTint, 0.35);
  explored.add(pairKey(sel[0], sel[1]));
  if (res.level === 'danger') dangerFound++;
  showResult(res);
  updateMatrix();
}

function updateReaction(dt) {
  liquidY = lerp(liquidY, liquidTarget, 1 - Math.exp(-dt * 4));
  if (liquid.visible) buildBucketLiquid(liquidY);
  liqColor.lerp(liqTarget, 1 - Math.exp(-dt * 1.5));
  liquidMat.attenuationColor.copy(liqColor);
  if (!react) return;
  react.t += dt;
  const res = react.res;
  const I = smoothstep(0, 0.6, react.t) * Math.exp(-react.t / 9);
  if (res.gas) {
    const g = GASES[res.gas];
    emitAcc += g.rate * (res.rate ?? 1) * I * dt;
    while (emitAcc >= 1) { emitCloud(g); emitAcc -= 1; }
  }
  const fTarget = (res.foam || 0) * (0.35 + 0.65 * Math.exp(-react.t / 14));
  foamLevel = lerp(foamLevel, fTarget * smoothstep(0, 1.2, react.t), 1 - Math.exp(-dt * 2));
  if (res.heat) liquidMat.emissive.setRGB(0.25 * I, 0.08 * I, 0);
  // Kabarcık/fokurtu
  const fizzRate = Math.max(res.foam || 0, res.gas ? 0.4 : 0) * I;
  for (const f of fizzP) {
    if (f.life <= 0 && Math.random() < fizzRate * dt * 8) {
      const rr = Math.sqrt(Math.random()) * bucketR(liquidY) * 0.9, a = rand(0, 6.28);
      Object.assign(f, { x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: liquidY + foamLevel * 0.5, v: rand(0.3, 1.2) * (0.5 + fizzRate), life: rand(0.3, 0.8), s: rand(0.02, 0.05) });
    }
    if (f.life > 0) { f.life -= dt; f.y += f.v * dt; }
  }
  // Tehlike işaretleri
  const danger = res.level === 'danger' && res.gas && react.t < 30;
  sign.visible = danger;
  if (res.gas && react.t > 1.2 && react.t < 30) {
    gasLabel.visible = true;
    gasLabel.setText(`${res.level === 'danger' ? '☠️' : '⚠️'} ${GASES[res.gas].label}`);
    gasLabel.el.style.borderColor = LEVEL[res.level].color;
  } else gasLabel.visible = false;
}

const _mat = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function drawFoamFizz(t) {
  const lvl = foamLevel;
  if (lvl > 0.01 && liquid.visible) {
    const R = bucketR(liquidY) * (0.95 + Math.min(lvl, 1.3) * 0.12);
    const H = 0.12 + lvl * 0.75;
    const n = Math.min(FOAM_N, Math.ceil(FOAM_N * Math.min(1, lvl * 2.5)));
    for (let i = 0; i < n; i++) {
      const f = foamSeed[i];
      const wob = 1 + Math.sin(t * 3 + f.ph) * 0.12;
      _p.set(f.p.x * R, liquidY + f.p.y * H, f.p.z * R);
      _s.setScalar(f.s * wob * (0.7 + Math.min(lvl, 1) * 0.5));
      foam.setMatrixAt(i, _mat.compose(_p, _q, _s));
    }
    foam.count = n;
    foam.instanceMatrix.needsUpdate = true;
  } else foam.count = 0;
  fizzP.forEach((f, i) => {
    fizzPos[i * 3] = f.x; fizzPos[i * 3 + 1] = f.life > 0 ? f.y : -99; fizzPos[i * 3 + 2] = f.z;
  });
  fizzGeo.attributes.position.needsUpdate = true;
}

// --- Arayüz ---
const ui = sim.ui;
ui.text('⚠️ <b>Yalnızca uyarı amaçlıdır.</b> Gerçekte temizlik ürünlerini <b>asla karıştırma</b>. Bu simülasyon miktar ya da tarif vermez.', 'card');

ui.section('Ürün seç ve karıştır');
const opts = PRODUCTS.map((p) => ({ value: p.id, label: p.name }));
const selA = ui.select({ label: '① Birinci ürün', options: opts, value: sel[0], onChange: (v) => chooseSlot(0, v) });
const selB = ui.select({ label: '② İkinci ürün', options: opts, value: sel[1], onChange: (v) => chooseSlot(1, v) });
function chooseSlot(k, v) {
  const next = [...sel];
  if (next[1 - k] === v) next[1 - k] = sel[k]; // aynı ürün seçilirse yer değiştir
  next[k] = v;
  setSelection(next[0], next[1]);
}
const selInfo = ui.text('', 'card');
ui.buttons([
  { label: '🧪 Sanal olarak karıştır', variant: 'primary', onClick: () => startMix() },
  { label: '🎲 Rastgele', onClick: () => { const [a, b] = pick(ALL_PAIRS); startMix(a, b); } },
]);
ui.button({ label: '🧹 Kovayı boşalt', onClick: () => { mix = null; snapHome(); emptyBucket(); } });

ui.section('Sonuç');
const resultCard = ui.text('<i>Henüz karışım yok. İki ürün seç ve karıştır.</i>', 'card');

ui.section('Ortam');
const windowOpen = ui.toggle({ label: 'Pencereyi aç (havalandırma)', value: false, onChange: (v) => sim.toast(v ? '🪟 Pencere açık: bulut dışarı çekiliyor' : 'Pencere kapalı') });
const densMeter = ui.meter({ label: 'Ortamdaki gaz bulutu (göreli)', color: '#c4e03c' });
const densChart = ui.chart({ title: 'Gaz bulutu yoğunluğu (göreli, %)', series: [{ name: 'Gaz bulutu', color: '#c4e03c', fill: true }], yMin: 0, yMax: 100, maxPoints: 240 });
const stExplored = ui.stat({ label: 'Keşfedilen çift' });
const stDanger = ui.stat({ label: 'Tehlikeli karışım' });
const stQuiz = ui.stat({ label: 'Quiz puanı' });

ui.section('Tüm kombinasyonlar');
const matrix = ui.text('');
matrix.el.addEventListener('click', (e) => {
  const c = e.target.closest('[data-a]');
  if (c) startMix(c.dataset.a, c.dataset.b);
});
function updateMatrix() {
  const col = { safe: '#166534', warn: '#92400e', danger: '#991b1b' };
  const cell = 'display:flex;align-items:center;justify-content:center;height:24px;border-radius:4px;font-size:10.5px;font-weight:700;';
  let h = `<div style="display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:2px">`;
  h += `<span></span>` + PRODUCTS.map((p) => `<span style="${cell}color:#94a3b8">${p.code}</span>`).join('');
  for (const a of PRODUCTS) {
    h += `<span style="${cell}color:#94a3b8">${a.code}</span>`;
    for (const b of PRODUCTS) {
      if (a === b) { h += `<span style="${cell}background:#1e293b;color:#475569">—</span>`; continue; }
      const r = result(a.id, b.id), seen = explored.has(pairKey(a.id, b.id));
      h += `<span data-a="${a.id}" data-b="${b.id}" title="${a.name} + ${b.name}: ${LEVEL[r.level].name}"
        style="${cell}cursor:pointer;background:${col[r.level]};opacity:${seen ? 1 : 0.55};${seen ? 'outline:1px solid #e2e8f0;' : ''}">${LEVEL[r.level].icon.replace('️', '')}</span>`;
    }
  }
  h += `</div><div style="margin-top:6px;font-size:11.5px">${PRODUCTS.map((p) => `<b>${p.code}</b> ${p.name}`).join(' · ')}<br>
    Hücreye tıkla → o çift karıştırılır. Çerçeveli hücreler denediklerin.</div>`;
  matrix.set(h);
  stExplored.set(`${explored.size}/36`, explored.size === 36 ? 'good' : '');
  stDanger.set(dangerFound, dangerFound ? 'bad' : '');
}

ui.section('Quiz: Bu ikisi karıştırılır mı?');
ui.text('8 soru. Her çift için tahmin et: <b>Güvenli</b>, <b>Önerilmez</b> ya da <b>Tehlikeli</b>. Tam doğru 10 puan; temkinli tahmin kısmi puan alır.');
ui.button({ label: '🎯 Quiz başlat', variant: 'good', onClick: () => startQuiz() });

ui.section('Altın kurallar', { open: false });
ui.text(`<ol style="margin:0;padding-left:18px">
  <li>Temizlik ürünlerini <b>asla karıştırma</b>; birini kullandıktan sonra yüzeyi bol suyla durula.</li>
  <li>Ürünü orijinal, etiketli kabında sakla; pet şişeye/etiketsiz kaba aktarma.</li>
  <li>Etiketi oku: "asit", "hipoklorit", "amonyak" ve tehlike işaretlerine bak.</li>
  <li>Temizlik yaparken ortamı havalandır; kapalı banyoda özellikle dikkatli ol.</li>
  <li>Çocukların ulaşamayacağı, kilitli bir yerde sakla.</li>
  <li>Zehirlenme şüphesinde: <b>114</b> (UZEM) · acil durumda <b>112</b>.</li>
</ol>`, 'card');

function showResult(res) {
  const L = LEVEL[res.level];
  const pa = byId[sel[0]], pb = byId[sel[1]];
  resultCard.set(`<div style="color:${L.color};font-weight:800;font-size:15px">${L.icon} ${L.name}</div>
    <div style="margin:4px 0"><b>${pa.name} + ${pb.name}</b>: ${res.title}</div>
    <div style="font-family:ui-monospace,monospace;font-size:12px;background:#0b1224;border-radius:6px;padding:6px 8px;margin:6px 0;color:#e2e8f0">${res.eq}</div>
    <div>${res.text}</div>
    <div style="margin-top:6px"><b>Olası belirtiler:</b> ${SYM[res.sym]}</div>
    ${res.level !== 'safe' ? `<div style="margin-top:6px"><b>Maruz kalırsan:</b>${FIRST_AID}</div>` : '<div style="margin-top:6px"><small>Güvenli çiftlerde bile gereksiz karışım yapma; ürünleri ayrı kullan.</small></div>'}`);
  densMeter.color(res.gas ? '#' + GASES[res.gas].color.toString(16).padStart(6, '0') : '#94a3b8');
}

function announce(res) {
  if (quiz.active) return;
  const L = LEVEL[res.level];
  const extra = res.level === 'danger' ? '<br><small>Temiz havaya çık · <b>114</b> UZEM · acil durumda <b>112</b></small>' : '';
  sim.hud.show(`<h2>${L.icon} ${res.title}</h2><div>${byId[sel[0]].name} + ${byId[sel[1]].name} · <b style="color:${L.color}">${L.name}</b>${extra}</div>`,
    { timeout: 6500, tone: L.tone });
}

// --- Quiz ---
const quiz = { active: false, list: [], i: 0, score: 0, answered: false };
const ANS = [
  { v: 'safe', label: '✅ Güvenli', cls: 'good' },
  { v: 'warn', label: '⚠️ Önerilmez', cls: '' },
  { v: 'danger', label: '☠️ Tehlikeli', cls: 'danger' },
];
const ORDER = { safe: 0, warn: 1, danger: 2 };
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function startQuiz() {
  const by = { safe: [], warn: [], danger: [] };
  shuffle([...ALL_PAIRS]).forEach((pr) => by[result(...pr).level].push(pr));
  quiz.list = shuffle([...by.danger.slice(0, 4), ...by.warn.slice(0, 2), ...by.safe.slice(0, 2)]);
  quiz.i = 0; quiz.score = 0; quiz.active = true;
  stQuiz.set('0');
  askQuiz();
}

function askQuiz() {
  quiz.answered = false;
  const [a, b] = quiz.list[quiz.i];
  mix = null; snapHome(); emptyBucket();
  setSelection(a, b);
  sim.hud.show(`<h2>Soru ${quiz.i + 1}/${quiz.list.length}</h2>
    <div>Bu ikisi karıştırılır mı?</div>
    <div style="font-size:17px;margin:6px 0"><b style="color:#7dd3fc">${byId[a].name}</b> + <b style="color:#fcd34d">${byId[b].name}</b></div>
    <div>${ANS.map((x) => `<button class="btn ${x.cls}" data-ans="${x.v}">${x.label}</button>`).join('')}</div>`);
  sim.hud.el.querySelectorAll('[data-ans]').forEach((btn) => { btn.onclick = () => answerQuiz(btn.dataset.ans); });
}

function answerQuiz(ans) {
  if (!quiz.active || quiz.answered) return;
  quiz.answered = true;
  const [a, b] = quiz.list[quiz.i];
  const res = result(a, b);
  const d = ORDER[ans] - ORDER[res.level];
  const pts = d === 0 ? 10 : d === 1 ? 5 : d === 2 ? 3 : 0; // temkinli (daha tehlikeli) tahmin kısmi puan alır
  quiz.score += pts;
  stQuiz.set(quiz.score);
  const L = LEVEL[res.level];
  startMix(a, b);
  const last = quiz.i === quiz.list.length - 1;
  sim.hud.show(`<h2>${pts === 10 ? '🎉 Doğru!' : pts ? '🙂 Kısmen doğru' : '❌ Yanlış'} <small>+${pts}</small></h2>
    <div>${byId[a].name} + ${byId[b].name}: <b style="color:${L.color}">${L.icon} ${L.name}</b></div>
    <div style="font-size:13px;margin-top:4px">${res.title}. ${res.text}</div>
    <button class="btn primary" data-next>${last ? 'Sonucu gör' : 'Sonraki ▶'}</button>`, { tone: L.tone });
  sim.hud.el.querySelector('[data-next]').onclick = () => {
    if (!quiz.active) return;
    if (last) endQuiz(); else { quiz.i++; askQuiz(); }
  };
}

function endQuiz() {
  quiz.active = false;
  const max = quiz.list.length * 10, s = quiz.score;
  const msg = s >= max * 0.85 ? '🏆 Harika! Ev kimyası güvenliği uzmanısın.' : s >= max * 0.6 ? '👍 İyi! Birkaç çifti tekrar gözden geçir.' : '📚 Tabloyu inceleyip tekrar dene.';
  sim.hud.show(`<h2>Quiz bitti: ${s} / ${max}</h2><div>${msg}</div>
    <div style="font-size:13px;margin-top:4px">Unutma: şüphedeysen <b>karıştırma</b>. Zehirlenme şüphesinde <b>114</b>, acil durumda <b>112</b>.</div>
    <button class="btn good" data-again>🔁 Tekrar oyna</button><button class="btn" data-close>Kapat</button>`, { tone: s >= max * 0.6 ? 'good' : 'warn' });
  sim.hud.el.querySelector('[data-again]').onclick = () => startQuiz();
  sim.hud.el.querySelector('[data-close]').onclick = () => sim.hud.hide();
}

// --- Döngü ---
let statAcc = 0;
sim.onUpdate((dt, t) => {
  updateMix(dt);
  updateReaction(dt);
  const dens = updateCloud(dt, t);
  statAcc += dt;
  if (statAcc > 0.25) {
    statAcc = 0;
    const pct = clamp(dens / 70 * 100, 0, 100);
    densMeter.set(pct / 100, pct < 1 ? 'temiz' : `${fmt(pct, 0)}%`);
    densChart.push([pct]);
  }
});

sim.onRender((dt) => {
  const t = performance.now() / 1000;
  const v2 = sim.renderer.getDrawingBufferSize(new THREE.Vector2());
  cMat.uniforms.uScale.value = v2.y / (2 * Math.tan(THREE.MathUtils.degToRad(sim.camera.fov / 2)));
  drawFoamFizz(t);
  bottles.forEach((b) => {
    if (b.ring.visible) { b.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.06); }
    const up = !mix && sel.includes(b.p.id) ? 0.08 + Math.sin(t * 3 + b.home.x) * 0.04 : 0;
    if (!mix || (b !== mix.a && b !== mix.b)) b.g.position.y = lerp(b.g.position.y, up, 1 - Math.exp(-dt * 8));
  });
  if (sign.visible) { sign.position.y = 3.5 + Math.sin(t * 2.5) * 0.08; sign.material.opacity = 0.75 + Math.sin(t * 6) * 0.25; }
  alarm.intensity = sign.visible ? (6 + Math.sin(t * 6) * 5) * ALARM_K : lerp(alarm.intensity, 0, 1 - Math.exp(-dt * 4));
  lowerSash.position.y = lerp(lowerSash.position.y, windowOpen.value ? SASH_OPEN : SASH_CLOSED, 1 - Math.exp(-dt * 4));
});

sim.onClick(() => bottles.map((b) => b.g), (hit) => {
  let o = hit.object;
  while (o && !o.userData.pid) o = o.parent;
  if (o && !quiz.active) pickBottle(o.userData.pid);
});

sim.onReset(() => {
  mix = null;
  quiz.active = false;
  snapHome();
  emptyBucket();
  cloud.forEach((c) => (c.alive = false));
  densChart.clear();
  sim.hud.hide();
  resultCard.set('<i>Henüz karışım yok. İki ürün seç ve karıştır.</i>');
});

setSelection(sel[0], sel[1]);
updateMatrix();
stQuiz.set('—');
sim.hud.show('Şişelere tıklayarak ya da panelden <b>iki ürün seç</b>, sonra <b>🧪 Karıştır</b>. <small>(Yalnızca sanal — gerçekte asla deneme!)</small>', { timeout: 8000 });
