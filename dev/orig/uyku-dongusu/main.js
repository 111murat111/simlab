// Uyku Döngüsü — Borbély iki-süreç modeli (S + C) ve ~90 dk NREM/REM döngüleriyle hipnogram.
import { createSim, THREE, RoundedBoxGeometry, clamp, smoothstep, seeded, fmt, textPlane } from '@core';

const STAGES = [
  { key: 'W', name: 'Uyanık', color: '#f59e0b' },
  { key: 'REM', name: 'REM (rüya)', color: '#ef4444' },
  { key: 'N1', name: 'N1 · hafif', color: '#a5b4fc' },
  { key: 'N2', name: 'N2 · hafif', color: '#60a5fa' },
  { key: 'N3', name: 'N3 · derin', color: '#1d4ed8' },
];
const PRE = 60, POST = 20;         // yatmadan önceki / uyandıktan sonraki dakikalar
const MIN_PER_SEC = 6;             // 1× hızda 1 sn = 6 dk
const TAU_R = 18.2, TAU_D = 4.2;   // saat (Daan–Beersma–Borbély)

const sim = createSim({
  background: 0x060914,
  camera: { position: [4.6, 4.3, 5.2], target: [-0.6, 1.2, -1.6], fov: 50 },
  controls: { minDistance: 4, maxDistance: 22 },
  lights: false,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Gece boyunca uyku, yaklaşık <b>90 dakikalık döngülerden</b> oluşur: hafif uyku (N1, N2) → derin uyku (N3) → REM (rüya).
    Derin uyku gecenin <b>başında</b>, REM ise <b>sabaha doğru</b> yoğunlaşır. Aşağıdaki merdiven biçimli grafik bir <b>hipnogramdır</b>.</p>
    <h3>Model</h3>
    <ul>
      <li><b>Süreç S (uyku basıncı):</b> uyanıkken adenozin birikir, S yükselir; uykuda üstel olarak azalır. Derin uykunun miktarı S'e bağlıdır.</li>
      <li><b>Süreç C (sirkadiyen saat):</b> iç saat akşam uyanıklığı destekler, gece yarısından sonra uykuyu kolaylaştırır; REM sabaha karşı artar.</li>
      <li><b>Kafein</b> adenozin reseptörlerini tıkar (yarılanma ömrü ~5 saat): uykuya dalmayı geciktirir, derin uykuyu azaltır.</li>
      <li><b>Ekran ışığı</b> (mavi ağırlıklı) melatonin salgısını baskılar, iç saati biraz geciktirir.</li>
      <li><b>Alkol</b> uykuya dalmayı hızlandırır ama gecenin ilk yarısında REM'i bastırır, vücuttan atılınca uykuyu böler.</li>
      <li>Serin (≈16–20 °C), sessiz oda ve gün içindeki egzersiz uyku kalitesini destekler.</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li>"Sınav gecesi" hazır ayarını seç: geç yatış, akşam kahvesi ve uzun ekran süresi derin uykuyu ve REM'i nasıl kısıyor?</li>
      <li>Kafeini aynı dozda sabah 09:00'a al: gece vücutta ne kadar kaldığına bak.</li>
      <li>Yatış saatini sabit tutup kalkış saatini erkene çek: en çok hangi evre kayboluyor? (İpucu: REM.)</li>
    </ul>
    <p><small>⚠️ Bu bir eğitim modelidir; sayılar yaklaşıktır ve kişiden kişiye değişir. Tıbbi tanı ya da tavsiye yerine geçmez.
    Uyku sorunların sürüyorsa bir sağlık profesyoneline danış.</small></p>`,
});

// --- Girdiler ---
const DEF = { bed: 23, wake: 7, screen: 30, caf: 0, cafT: 15, alc: 0, ex: 30, temp: 19, noise: 30 };
const P = { ...DEF };
let seed = 7;
let night = null;

const clockStr = (h) => { const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

// --- Model ---
function simulateNight(p, sd) {
  const rng = seeded(sd);
  const bed = p.bed, wakeAbs = p.wake + 24;
  const TIB = Math.round((wakeAbs - bed) * 60);
  const delta = (0.75 * p.screen) / 180;                        // iç saat gecikmesi (saat)
  const C = (h) => 0.1 * Math.cos((2 * Math.PI * (h - 17 - delta)) / 24);
  const remProp = (h) => 0.5 + 0.5 * Math.cos((2 * Math.PI * (h - 30 - delta)) / 24);
  const cafMg = (h) => (h >= p.cafT ? p.caf * Math.pow(0.5, (h - p.cafT) / 5) : 0);
  const alcLeft = (h) => Math.max(0, p.alc - (h - bed + 0.5));   // ~1 standart içki / saat atılır
  const awakeH = bed - p.wake;
  const S0 = 1 - 0.8 * Math.exp(-awakeH / TAU_R);
  const nz = clamp((p.noise - 35) / 35, 0, 1);
  const dv = Math.max(0, Math.abs(p.temp - 18) - 2);
  const scr = p.screen / 180;

  const Seff = S0 - (0.12 * cafMg(bed)) / 100 - 0.05 * scr;
  const gap = 0.6 + C(bed) - Seff;
  let sol = 10 + 120 * Math.max(0, gap + 0.07) + 12 * nz + 1.5 * dv - 3 * p.alc - p.ex * 0.04 + (rng() - 0.5) * 4;
  sol = Math.round(clamp(sol, 3, TIB));

  const seg = [];
  const push = (st, dur) => { dur = Math.round(dur); if (dur > 0) seg.push([st, dur]); };
  push(0, sol);
  let t = sol, slept = 0, i = 0, afterWake = true, wakeups = 0, natural = -1;
  while (t < TIB && i < 12) {
    const h = bed + t / 60;
    const S = S0 * Math.exp(-slept / (TAU_D * 60));
    const cafF = Math.min(1, cafMg(h) / 200);
    const alc = alcLeft(h);
    const rebound = p.alc > 0 && alc === 0;
    const n1 = afterWake ? 3 + rng() * 4 + nz * 4 : 0;
    let n3 = Math.max(0, (S - (0.12 * cafMg(h)) / 100 - 0.28) * 85) * (1 + (p.ex / 90) * 0.12) * (1 - 0.35 * cafF) * (1 - 0.06 * dv) * (alc > 0 ? 1.08 : 1);
    if (n3 < 3) n3 = 0;
    let rem = (6 + 7 * i) * (0.6 + 0.6 * remProp(h)) * (1 - 0.1 * scr) * (1 - 0.03 * dv);
    if (alc > 0) rem *= Math.max(0.15, 1 - 0.35 * alc);
    else if (rebound && i >= 2) rem *= 1.15;
    rem = Math.min(rem, 45);
    const len = 84 + rng() * 18;
    const n2 = Math.max(14, len - n1 - n3 - rem);
    push(2, n1);
    push(3, n3 > 0 ? Math.max(8, n2 * 0.45) : n2 * 0.6);
    push(4, n3);
    // Gürültü kaynaklı kısa uyanma (N2 içinde)
    const n2b = n3 > 0 ? n2 - Math.max(8, n2 * 0.45) : n2 * 0.4;
    if (rng() < 0.45 * nz + (rebound ? 0.4 : 0)) { push(3, n2b / 2); push(0, 1 + rng() * 2); push(2, 2); push(3, n2b / 2); wakeups++; }
    else push(3, n2b);
    push(1, rem);
    slept += n1 + n2 + n3 + rem;
    // Döngü sonu: uyanma olasılığı
    const pW = 0.18 + 0.3 * nz + 0.05 * dv + 0.15 * cafF + 0.05 * scr + (rebound ? 0.45 : 0);
    afterWake = rng() < pW;
    if (afterWake) { push(0, 1 + rng() * 4 + nz * 5 + (rebound ? 4 : 0) + dv); wakeups++; }
    t = seg.reduce((s, x) => s + x[1], 0);
    i++;
    // Uyku basıncı alt eşiğin (0,17 + C) altına inince kendiliğinden uyanılır
    const hN = bed + t / 60;
    if (slept > 360 && S0 * Math.exp(-slept / (TAU_D * 60)) < 0.17 + C(hN) + 0.01 && t < TIB) { natural = Math.round(t); push(0, TIB - t); break; }
  }
  // Dakikalık dizi (yatıştan alarma)
  const stage = new Uint8Array(TIB);
  let k = 0;
  for (const [st, d] of seg) for (let j = 0; j < d && k < TIB; j++) stage[k++] = st;
  for (; k < TIB; k++) stage[k] = 3;
  const count = [0, 0, 0, 0, 0];
  for (const s of stage) count[s]++;
  // Uykuya dalıştan sonraki uyanmaları say (sayılan uyanmalar alarmdan önceyse)
  let aw = 0;
  for (let m = sol + 1; m < (natural >= 0 ? natural : TIB); m++) if (stage[m] === 0 && stage[m - 1] !== 0) aw++;
  const tst = TIB - count[0];
  const eff = TIB > 0 ? tst / TIB : 0;
  const atAlarm = stage[TIB - 1];
  let score = 55 * Math.min(1, tst / 480) + 15 * Math.min(1, count[4] / 60) + 15 * Math.min(1, count[1] / 90) + 15 * eff
    - (atAlarm === 4 ? 12 : 0) - Math.min(15, 3 * aw) - 5 * p.alc - 6 * scr;
  score = Math.round(clamp(score, 0, 100));
  return { natural, stage, TIB, sol: Math.min(sol, TIB), tst, eff, count, aw, atAlarm, score, S0, C, cafMg, alcLeft, bed, wakeAbs, delta, remProp, Seff };
}

// --- 3B oda ---
const scene = sim.scene;
const amb = new THREE.AmbientLight(0x3a4a7a, 1);
scene.add(new THREE.HemisphereLight(0x8fa6e8, 0x2a1e18, 0.9));
scene.add(amb);
const moonLight = new THREE.DirectionalLight(0x9fb6ff, 1.5);
moonLight.position.set(-2, 5, 4);
scene.add(moonLight);
const sunLight = new THREE.DirectionalLight(0xffd7a0, 0);
sunLight.position.set(-2, 4, -6);
scene.add(sunLight);

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), std(0x6b4a33));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.2), std(0x3b3f6b));
rug.rotation.x = -Math.PI / 2;
rug.position.set(1.6, 0.01, 1.4);
scene.add(rug);
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), std(0x3e4a70));
backWall.position.set(0, 2.5, -4);
scene.add(backWall);
const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), std(0x36405f));
sideWall.rotation.y = Math.PI / 2;
sideWall.position.set(-5, 2.5, 0);
scene.add(sideWall);

// Pencere: gökyüzü tuvali + ay
const skyC = document.createElement('canvas');
skyC.width = 256; skyC.height = 160;
const skyTex = new THREE.CanvasTexture(skyC);
skyTex.colorSpace = THREE.SRGBColorSpace;
const stars = Array.from({ length: 60 }, () => [Math.random() * 256, Math.random() * 120, Math.random()]);
function drawSky(dawn) {
  const g = skyC.getContext('2d');
  const top = new THREE.Color(0x070b1f).lerp(new THREE.Color(0x5b8bd6), dawn);
  const bot = new THREE.Color(0x18234a).lerp(new THREE.Color(0xffb870), dawn);
  const gr = g.createLinearGradient(0, 0, 0, 160);
  gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(1, '#' + bot.getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 256, 160);
  g.fillStyle = `rgba(255,255,255,${0.9 * (1 - dawn)})`;
  for (const [x, y, s] of stars) g.fillRect(x, y, 1 + s, 1 + s);
  // Şehir siluet
  g.fillStyle = '#' + new THREE.Color(0x0a0f1e).lerp(new THREE.Color(0x3b3240), dawn).getHexString();
  for (let x = 0; x < 256; x += 18) { const hh = 14 + ((x * 37) % 23); g.fillRect(x, 160 - hh, 16, hh); }
  skyTex.needsUpdate = true;
}
const WIN = { x: -2.2, y: 2.7, w: 3, h: 1.9 };
const sky = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w, WIN.h), new THREE.MeshBasicMaterial({ map: skyTex }));
sky.position.set(WIN.x, WIN.y, -3.98);
scene.add(sky);
const moon = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), new THREE.MeshBasicMaterial({ color: 0xf5f1d8 }));
scene.add(moon);
{
  const fm = std(0xd6d3cc);
  const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), fm); m.position.set(x, y, -3.94); scene.add(m); };
  bar(WIN.w + 0.2, 0.1, WIN.x, WIN.y + WIN.h / 2); bar(WIN.w + 0.2, 0.14, WIN.x, WIN.y - WIN.h / 2);
  bar(0.1, WIN.h, WIN.x - WIN.w / 2, WIN.y); bar(0.1, WIN.h, WIN.x + WIN.w / 2, WIN.y); bar(0.06, WIN.h, WIN.x, WIN.y);
  const cur = std(0x6d4c7d);
  [-1, 1].forEach((s) => { const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.08), cur); c.position.set(WIN.x + s * (WIN.w / 2 + 0.35), WIN.y - 0.2, -3.9); scene.add(c); });
}

// Yatak ve uyuyan kişi
const bedG = new THREE.Group();
bedG.position.set(0.2, 0, -1.2);
scene.add(bedG);
{
  const frame = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.45, 3.6, 3, 0.06), std(0x5a3d2b));
  frame.position.set(0, 0.3, 0);
  const head = new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.3, 0.15, 3, 0.05), std(0x4a3222));
  head.position.set(0, 0.75, -1.85);
  const matt = new THREE.Mesh(new RoundedBoxGeometry(2.05, 0.3, 3.45, 3, 0.1), std(0xe7e5e4));
  matt.position.set(0, 0.62, 0);
  const pillow = new THREE.Mesh(new RoundedBoxGeometry(1.3, 0.22, 0.6, 4, 0.1), std(0xf1f5f9));
  pillow.position.set(0, 0.86, -1.35);
  bedG.add(frame, head, matt, pillow);
}
const person = new THREE.Group();
bedG.add(person);
const headM = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 16), std(0xe0b48f));
headM.position.set(0, 1.12, -1.3);
const hair = new THREE.Mesh(new THREE.SphereGeometry(0.285, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), std(0x2b1d14));
hair.position.copy(headM.position);
hair.rotation.x = -0.9;
const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1f1f1f });
const eyes = [-0.09, 0.09].map((x) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.02), eyeMat); e.position.set(x, 1.2, -1.07); return e; });
person.add(headM, hair, ...eyes);
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.6, 6, 16), std(0x4f6fc4));
body.rotation.x = Math.PI / 2;
body.scale.set(1.25, 1, 0.55);
body.position.set(0, 0.86, 0.2);
person.add(body);
const blanket = new THREE.Mesh(new RoundedBoxGeometry(2.15, 0.12, 2.6, 3, 0.05), std(0x4f6fc4));
blanket.position.set(0, 0.8, 0.45);
bedG.add(blanket);

// Komodin, lamba, telefon, kupa, bardak
const stand = new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.7, 0.7, 3, 0.04), std(0x6b4a33));
stand.position.set(-1.55, 0.35, -2.9);
scene.add(stand);
const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.45, 12), std(0x8b8b8b));
lampBase.position.set(-1.7, 0.93, -3.0);
const shadeMat = new THREE.MeshStandardMaterial({ color: 0xfde68a, emissive: 0xffc46b, emissiveIntensity: 1, side: THREE.DoubleSide });
const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.28, 20, 1, true), shadeMat);
shade.position.set(-1.7, 1.22, -3.0);
scene.add(lampBase, shade);
const lampLight = new THREE.PointLight(0xffc46b, 4, 7, 1.5);
lampLight.position.set(-1.7, 1.25, -3.0);
scene.add(lampLight);
const phone = new THREE.Group();
{
  const case_ = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.02, 0.38, 2, 0.01), std(0x111111));
  phone.add(case_);
}
const phoneScreenMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0b });
const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.33), phoneScreenMat);
phoneScreen.rotation.x = -Math.PI / 2;
phoneScreen.position.y = 0.012;
phone.add(phoneScreen);
scene.add(phone);
const phoneLight = new THREE.PointLight(0x7fb2ff, 0, 3, 1.5);
phone.add(phoneLight);
phoneLight.position.set(0, 0.25, 0);
const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.16, 16), std(0xf8fafc));
mug.position.set(-1.35, 0.78, -2.75);
scene.add(mug);
const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0xb45309, transparent: true, opacity: 0.7 }));
glass.position.set(-1.35, 0.8, -3.1);
scene.add(glass);
// Saat ve termometre etiketleri
const clockLbl = sim.label('', { position: [1.2, 3.6, -3.95], className: 'big' });
const thermoLbl = sim.label('', { position: [-4.95, 3.3, -1.5] });
const stageLbl = sim.label('', { parent: bedG, position: [0, 2.2, -1.1], className: 'big' });

// Zzz ve gürültü halkaları
const zzz = [0, 1, 2].map((i) => {
  const z = textPlane('z', 0.35, { color: '#c7d2fe', font: '800 {s}px system-ui' });
  z.userData.ph = i / 3;
  bedG.add(z);
  return z;
});
const noiseRings = [0, 1, 2].map((i) => {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32, 1, -Math.PI / 2, Math.PI), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  r.position.set(WIN.x, WIN.y - 0.3, -3.9);
  r.userData.ph = i / 3;
  scene.add(r);
  return r;
});

// --- Animasyon ---
let tMin = 0;        // yatmadan PRE dk önceden itibaren
let ended = false;
function stageAt(m) {
  if (!night) return 0;
  const k = Math.floor(m - PRE);
  if (k < 0 || k >= night.TIB) return 0;
  return night.stage[k];
}
sim.onUpdate((dt) => {
  if (!night) return;
  const total = PRE + night.TIB + POST;
  if (ended) { tMin = 0; ended = false; sim.hud.hide(); }
  tMin += dt * MIN_PER_SEC;
  if (tMin >= total) {
    tMin = total;
    ended = true;
    sim.pause();
    showMorning();
  }
});
function showMorning() {
  const n = night;
  const tone = n.score >= 70 ? 'good' : n.score >= 45 ? 'warn' : 'bad';
  const face = n.score >= 70 ? '😃' : n.score >= 45 ? '😐' : '😫';
  sim.hud.show(`<h2>${face} Günaydın! Dinçlik: ${n.score}/100</h2>
    ${fmtDur(n.tst)} uyku · derin ${n.count[4]} dk · REM ${n.count[1]} dk · ${n.aw} uyanma<br>
    <button class="btn primary" data-a="again">▶ Geceyi tekrar izle</button>`, { tone });
  sim.hud.el.querySelector('[data-a=again]').onclick = () => { sim.hud.hide(); tMin = 0; ended = false; sim.play(); };
}
const fmtDur = (m) => `${Math.floor(m / 60)} sa ${Math.round(m % 60)} dk`;

let breath = 0, zTime = 0, lastDawn = -1, eyeT = 0;
const tmpC = new THREE.Color();
sim.onRender((real) => {
  if (!night) return;
  const h = night.bed + (tMin - PRE) / 60;
  const st = stageAt(tMin);
  const pre = tMin < PRE, post = tMin >= PRE + night.TIB;
  const awake = pre || post || st === 0;
  // Nefes
  const rate = awake ? 0.28 : st === 4 ? 0.2 : st === 1 ? 0.3 + 0.08 * Math.sin(breath * 1.7) : 0.23;
  const amp = st === 4 ? 0.06 : 0.035;
  breath += real * rate * Math.PI * 2;
  const b = Math.sin(breath);
  body.scale.y = 1 + b * amp;
  blanket.position.y = 0.8 + b * amp * 0.5 + 0.08;
  // Baş/ gözler
  eyeT += real;
  const sitUp = pre || post ? 1 : st === 0 ? 0.4 : 0;
  person.rotation.x = -0.35 * sitUp;
  person.position.z = 0.35 * sitUp;
  person.position.y = 0.25 * sitUp;
  eyes.forEach((e) => {
    e.scale.y = awake ? 5 : 1;
    e.position.x = Math.sign(e.position.x) * 0.09 + (st === 1 && !awake ? Math.sin(eyeT * 13) * 0.02 : 0);
  });
  // Zzz
  zTime += real * (st === 4 ? 0.25 : 0.4);
  zzz.forEach((z) => {
    const f = (zTime + z.userData.ph) % 1;
    z.visible = !awake;
    z.position.set(0.3 + f * 0.6, 1.5 + f * 1.1, -1.35);
    z.material.opacity = Math.sin(f * Math.PI);
    z.lookAt(sim.camera.position);
  });
  // Işıklar
  const lampOn = tMin < PRE - 1;
  lampLight.intensity = lampOn ? 4 : 0;
  shadeMat.emissiveIntensity = lampOn ? 1 : 0.02;
  const screenOn = pre && tMin >= PRE - Math.min(PRE, P.screen);
  phoneLight.intensity = screenOn ? 1.6 : 0;
  phoneScreenMat.color.setHex(screenOn ? 0x9cc3ff : 0x0b0b0b);
  if (screenOn) { phone.position.set(0.2 + 0.05, 1.55, -0.7 - 0.2); phone.rotation.set(1.1, 0, 0); }
  else { phone.position.set(-1.35, 0.715, -2.95 + 0.3); phone.rotation.set(0, 0.3, 0); }
  const dawn = smoothstep(29.3, 31, h);
  if (Math.abs(dawn - lastDawn) > 0.02) { drawSky(dawn); lastDawn = dawn; }
  sunLight.intensity = dawn * 1.8;
  moonLight.intensity = 1.5 * (1 - dawn);
  amb.intensity = 1 + dawn * 0.6;
  amb.color.copy(tmpC.setHex(0x3a4a7a).lerp(new THREE.Color(0xc9b8a0), dawn));
  // Ay pencerede sağdan sola geçer
  const mf = clamp((h - 21) / 10, 0, 1);
  moon.position.set(WIN.x + WIN.w * 0.4 - mf * WIN.w * 0.8, WIN.y - 0.4 + Math.sin(mf * Math.PI) * 0.75, -3.96);
  moon.material.opacity = 1 - dawn;
  moon.material.transparent = true;
  // Gürültü halkaları
  const nz = clamp((P.noise - 35) / 35, 0, 1);
  noiseRings.forEach((r) => {
    const f = (eyeT * 0.5 + r.userData.ph) % 1;
    r.visible = nz > 0;
    r.scale.setScalar(0.2 + f * 1.6);
    r.material.opacity = nz * (1 - f) * 0.7;
    r.rotation.y = Math.PI / 2;
  });
  clockLbl.setText(`🕒 ${clockStr(h)}`);
  thermoLbl.setText(`🌡️ ${fmt(P.temp)} °C · 🔊 ${fmt(P.noise)} dB`);
  const S = STAGES[awake ? 0 : st];
  stageLbl.setText(pre ? (screenOn ? '📱 Yatakta ekrana bakıyor' : '📖 Yatmaya hazırlanıyor') : post ? '☀️ Uyandı' : `<span style="color:${S.color}">●</span> ${S.name}`);
  // Hipnogram imleci
  if (sim.frame % 6 === 0) drawHypno();
});

// --- Panel ---
const ui = sim.ui;
ui.section('Hazır senaryolar');
ui.buttons([
  { label: '🌿 Sağlıklı', onClick: () => preset({ ...DEF }) },
  { label: '📚 Sınav gecesi', onClick: () => preset({ ...DEF, bed: 25, wake: 7, screen: 150, caf: 200, cafT: 21, ex: 0 }) },
]);
ui.buttons([
  { label: '🥵 Sıcak ve gürültülü', onClick: () => preset({ ...DEF, temp: 28, noise: 58 }) },
  { label: '🍷 Kutlama (alkol)', onClick: () => preset({ ...DEF, bed: 24.5, wake: 8, alc: 4, screen: 60 }) },
]);
ui.section('Akşam');
const ctl = {};
ctl.bed = ui.slider({ label: 'Yatış (ışık kapanış) saati', min: 20, max: 26, step: 0.25, value: P.bed, format: clockStr, onInput: (v) => set('bed', v) });
ctl.wake = ui.slider({ label: 'Kalkış (alarm) saati', min: 5, max: 10.5, step: 0.25, value: P.wake, format: clockStr, onInput: (v) => set('wake', v) });
ctl.screen = ui.slider({ label: 'Yatmadan önce ekran süresi', min: 0, max: 180, step: 5, value: P.screen, unit: 'dk', onInput: (v) => set('screen', v) });
ctl.caf = ui.slider({ label: 'Kafein', min: 0, max: 400, step: 10, value: P.caf, format: (v) => `${fmt(v)} mg${v ? ` · ≈${fmt(v / 90, 1)} fincan kahve` : ''}`, onInput: (v) => set('caf', v) });
ctl.cafT = ui.slider({ label: 'Son kafein saati', min: 7, max: 24, step: 0.5, value: P.cafT, format: clockStr, onInput: (v) => set('cafT', v) });
ctl.alc = ui.slider({ label: 'Alkol (yetişkin) — standart içki', min: 0, max: 5, step: 1, value: P.alc, onInput: (v) => set('alc', v) });
ctl.ex = ui.slider({ label: 'Gün içi egzersiz', min: 0, max: 120, step: 5, value: P.ex, unit: 'dk', onInput: (v) => set('ex', v) });
ui.section('Oda');
ctl.temp = ui.slider({ label: 'Oda sıcaklığı', min: 12, max: 32, step: 0.5, value: P.temp, unit: '°C', onInput: (v) => set('temp', v) });
ctl.noise = ui.slider({ label: 'Gürültü', min: 20, max: 70, step: 1, value: P.noise, format: (v) => `${fmt(v)} dB · ${v < 35 ? 'sessiz' : v < 50 ? 'orta' : 'gürültülü'}`, onInput: (v) => set('noise', v) });
ui.button({ label: '🎲 Başka bir gece (rastgelelik)', onClick: () => { seed++; recompute(true); } });

ui.section('Gecenin sonucu');
const mkCanvas = (title, legendHtml, H) => {
  const w = document.createElement('div');
  w.className = 'chart';
  w.innerHTML = `<div class="chart-title">${title}</div>`;
  const c = document.createElement('canvas');
  c.style.height = H + 'px';
  w.append(c);
  if (legendHtml) { const l = document.createElement('div'); l.className = 'legend'; l.innerHTML = legendHtml; w.append(l); }
  ui.append(w);
  return c;
};
const hyC = mkCanvas('Hipnogram (uyku evreleri)', STAGES.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join(''), 150);
const stSol = ui.stat({ label: 'Uykuya dalma', unit: 'dk' });
const stTst = ui.stat({ label: 'Toplam uyku' });
const stN3 = ui.stat({ label: 'Derin uyku (N3)', unit: 'dk' });
const stRem = ui.stat({ label: 'REM', unit: 'dk' });
const stEff = ui.stat({ label: 'Uyku verimi', unit: '%' });
const stAw = ui.stat({ label: 'Gece uyanma' });
const dinc = ui.meter({ label: '☀️ Sabah dinçlik skoru', color: 'linear-gradient(90deg,#ef4444,#f59e0b,#22c55e)' });
const tips = ui.text('', 'card');
const scC = mkCanvas('İki süreç: uyku basıncı S ve sirkadiyen eşikler', '<span><i style="background:#38bdf8"></i>S (adenozin)</span><span><i style="background:#f472b6"></i>Kafeinli S</span><span><i style="background:#a3e635"></i>Uyku / uyanma eşikleri (C)</span>', 130);
ui.text('⚠️ Eğitim amaçlı basitleştirilmiş model; tıbbi tavsiye değildir. Gençler için önerilen uyku 8–10, yetişkinler için 7–9 saattir.', '');

function set(k, v) { P[k] = v; recompute(false); }
function preset(o) {
  Object.assign(P, o);
  for (const k in ctl) ctl[k].set(P[k]);
  recompute(true);
}
function recompute(restart) {
  night = simulateNight(P, seed);
  if (restart || tMin > PRE + night.TIB + POST) { tMin = restart ? 0 : Math.min(tMin, PRE + night.TIB + POST); }
  if (restart) { ended = false; sim.hud.hide(); if (sim.paused) sim.play(); }
  const n = night;
  stSol.set(n.sol, n.sol <= 20 ? 'good' : n.sol <= 40 ? 'warn' : 'bad');
  stTst.set(fmtDur(n.tst), n.tst >= 420 ? 'good' : n.tst >= 360 ? 'warn' : 'bad');
  stN3.set(n.count[4], n.count[4] >= 50 ? 'good' : n.count[4] >= 30 ? 'warn' : 'bad');
  stRem.set(n.count[1], n.count[1] >= 80 ? 'good' : n.count[1] >= 50 ? 'warn' : 'bad');
  stEff.set(Math.round(n.eff * 100), n.eff >= 0.85 ? 'good' : n.eff >= 0.75 ? 'warn' : 'bad');
  stAw.set(n.aw, n.aw <= 2 ? 'good' : n.aw <= 4 ? 'warn' : 'bad');
  dinc.set(n.score / 100, `${n.score}/100`);
  const t = [];
  const cafBed = n.cafMg(P.bed);
  if (cafBed >= 20) t.push(`☕ Yatarken vücudunda hâlâ ≈<b>${fmt(cafBed)} mg</b> kafein var (yarılanma ~5 sa).`);
  if (P.screen >= 60) t.push(`📱 Ekran ışığı iç saati ≈<b>${fmt(n.delta * 60)} dk</b> geciktirdi.`);
  if (P.alc > 0) t.push(`🍷 Alkol ilk saatlerde REM'i bastırdı; atıldıktan sonra uyku bölündü.`);
  if (Math.abs(P.temp - 18) > 3) t.push(`🌡️ Oda ${P.temp > 18 ? 'sıcak' : 'soğuk'}: ideal aralık ≈16–20 °C.`);
  if (P.noise >= 45) t.push('🔊 Gürültü kısa uyanmalara ve hafif uykuya yol açtı.');
  if (n.tst < 420) t.push('⏰ Toplam uyku kısa: en çok sabah saatlerindeki <b>REM</b> kaybolur.');
  if (n.natural >= 0) t.push(`🌅 Uyku basıncı erken bitti: alarmdan önce <b>${clockStr(n.bed + n.natural / 60)}</b> civarı kendiliğinden uyandı.`);
  if (n.atAlarm === 4) t.push('😵 Alarm derin uykuda çaldı: uyku ataleti (sersemlik) olası.');
  if (!t.length) t.push('✅ Düzenli ve dengeli bir gece. Döngülerin başında derin uyku, sonunda uzun REM dönemleri var.');
  tips.set(t.join('<br>'));
  drawHypno();
  drawProcess();
}

function canvasCtx(c, H) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = c.clientWidth || 260;
  if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  g.font = '10px system-ui';
  return [g, W];
}
function drawHypno() {
  if (!night) return;
  const H = 150, [g, W] = canvasCtx(hyC, H);
  const pl = 44, pr = 6, pt = 6, pb = 16, iw = W - pl - pr, ih = H - pt - pb;
  const n = night, row = ih / 4;
  const X = (m) => pl + (m / n.TIB) * iw, Y = (s) => pt + s * row;
  g.textAlign = 'right'; g.textBaseline = 'middle';
  STAGES.forEach((s, i) => {
    g.fillStyle = 'rgba(148,163,184,.9)'; g.fillText(s.key === 'W' ? 'Uyanık' : s.key, pl - 5, Y(i));
    g.strokeStyle = 'rgba(148,163,184,.12)'; g.beginPath(); g.moveTo(pl, Y(i)); g.lineTo(W - pr, Y(i)); g.stroke();
  });
  // Saat işaretleri
  g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = 'rgba(148,163,184,.8)';
  for (let hh = Math.ceil(n.bed); hh <= n.wakeAbs; hh++) {
    const m = (hh - n.bed) * 60;
    if (m < 0 || m > n.TIB) continue;
    g.fillText(clockStr(hh).slice(0, 2), X(m), H);
  }
  // Evre çubukları
  for (let m = 0; m < n.TIB; m++) {
    const s = n.stage[m];
    g.fillStyle = STAGES[s].color;
    g.globalAlpha = 0.9;
    const y0 = Y(s);
    g.fillRect(X(m), s === 1 ? y0 - 4 : y0 - 2, X(m + 1) - X(m) + 0.5, s === 1 ? 8 : 4);
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(226,232,240,.5)'; g.lineWidth = 1; g.beginPath();
  for (let m = 0; m < n.TIB; m++) { const y = Y(n.stage[m]); m ? g.lineTo(X(m), y) : g.moveTo(X(m), y); g.lineTo(X(m + 1), y); }
  g.stroke();
  // İmleç
  const cm = tMin - PRE;
  if (cm >= 0 && cm <= n.TIB) {
    g.strokeStyle = '#fef08a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(cm), pt - 4); g.lineTo(X(cm), H - pb + 2); g.stroke();
  }
}
function drawProcess() {
  const H = 130, [g, W] = canvasCtx(scC, H);
  const n = night, pl = 26, pr = 6, pt = 6, pb = 16, iw = W - pl - pr, ih = H - pt - pb;
  const h0 = P.wake, h1 = P.wake + 26;                          // dünkü uyanıştan yarın öğlene
  const X = (h) => pl + ((h - h0) / (h1 - h0)) * iw, Y = (v) => pt + ih * (1 - v / 1.05);
  const onset = n.bed + n.sol / 60;
  // Uyku bandı
  g.fillStyle = 'rgba(99,102,241,.15)';
  g.fillRect(X(onset), pt, X(n.wakeAbs) - X(onset), ih);
  const curve = (f, color, dash = []) => {
    g.strokeStyle = color; g.setLineDash(dash); g.lineWidth = 1.8; g.beginPath();
    for (let i = 0; i <= 200; i++) { const h = h0 + ((h1 - h0) * i) / 200; const y = Y(f(h)); i ? g.lineTo(X(h), y) : g.moveTo(X(h), y); }
    g.stroke(); g.setLineDash([]);
  };
  const Sof = (h) => {
    if (h <= onset) return 1 - 0.8 * Math.exp(-(h - h0) / TAU_R);
    const Son = 1 - 0.8 * Math.exp(-(onset - h0) / TAU_R);
    if (h <= n.wakeAbs) return Son * Math.exp(-(h - onset) / TAU_D);
    const Sw = Son * Math.exp(-(n.wakeAbs - onset) / TAU_D);
    return 1 - (1 - Sw) * Math.exp(-(h - n.wakeAbs) / TAU_R);
  };
  curve((h) => 0.6 + n.C(h), '#a3e635');
  curve((h) => 0.17 + n.C(h), '#a3e635', [4, 3]);
  curve((h) => (h <= onset ? Sof(h) - (0.12 * n.cafMg(h)) / 100 - (h > n.bed - 3 ? 0.05 * (P.screen / 180) : 0) : Sof(h)), '#f472b6', [3, 3]);
  curve(Sof, '#38bdf8');
  g.fillStyle = 'rgba(148,163,184,.85)'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  for (let hh = Math.ceil(h0 / 6) * 6; hh <= h1; hh += 6) g.fillText(clockStr(hh).slice(0, 5), X(hh), H);
  g.textAlign = 'left'; g.fillText('😴', X(onset) + 2, pt + 12);
}

sim.formatTime = () => (night ? clockStr(night.bed + (tMin - PRE) / 60) : '');
sim.onReset(() => { seed = 7; preset({ ...DEF }); });
new ResizeObserver(() => { drawHypno(); if (night) drawProcess(); }).observe(sim.ui.body);
recompute(true);
