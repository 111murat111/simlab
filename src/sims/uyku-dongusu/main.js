// Uyku Döngüsü — Borbély iki-süreç modeli (S + C) ve ~90 dk NREM/REM döngüleriyle hipnogram.
import { createSim, THREE, RoundedBoxGeometry, clamp, smoothstep, seeded, fmt, textPlane, mat, procedural } from '@core';
import { blobGeometry, sdfMesh, sEllipsoid , tissue } from './bio.js';
import { STAND, bodyItems, dressGeometry, bodyMaterial } from './human.js';

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
  studio: { mood: 'night', color: 0x39405a, warmth: -0.2, key: { el: 27, az: -40, power: 1 }, radius: 12, height: 6 },
  camera: { position: [2.76, 2.58, 3.12], target: [-0.36, 0.72, -0.96], fov: 50, near: 0.05, far: 80 },
  controls: { minDistance: 2.4, maxDistance: 13.2 },
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
// Sahne birimi u (eski yerleşim korunur); kök grup K ile metreye ölçekler (yatak ≈ 1,3 × 2,1 m, tavan ≈ 3 m).
const LOWQ = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
const K = 0.6;
const scene = sim.scene;
const root = new THREE.Group();
root.scale.setScalar(K);
scene.add(root);
// Mantığın sürdüğü ışık değerleri (vekil): ay/güneş penceredeki stüdyo ana ışığına, ortam ise pozlamaya aktarılır
const amb = { intensity: 1, color: new THREE.Color(0x3a4a7a) };
const moonLight = { intensity: 1.5 };
const sunLight = { intensity: 0 };
sim.sky.mesh.visible = false;

// Malzemeler
const plaster = (color) => procedural({
  key: 'uyku-siva', scale: K, bump: 0.004, params: { color, roughness: 0.88 },
  pattern: `float n = fbm3(p*2.0, 4), g = vn3(p*60.0); col *= 0.93 + 0.1*n + 0.03*(g - 0.5); h = g*0.6 + n*0.4;`,
});
const parquet = procedural({
  key: 'uyku-parke', physical: true, scale: K, bump: 0.006,
  params: { color: 0x7a5236, roughness: 0.5, clearcoat: 0.45, clearcoatRoughness: 0.3 },
  pattern: `
    vec2 uv = vec2(p.x*0.9, p.z*7.0);
    float row = floor(uv.y); uv.x += h13(vec3(row, 1.0, 0.0))*3.0;
    float plank = floor(uv.x); vec2 f = fract(uv);
    float id = h13(vec3(row, plank, 2.0));
    float gap = smoothstep(0.0, 0.03, f.y)*smoothstep(1.0, 0.97, f.y)*smoothstep(0.0, 0.004, f.x)*smoothstep(1.0, 0.996, f.x);
    float grain = fbm3(vec3(p.x*2.0 + id*9.0, p.z*40.0, id*5.0), 4);
    col *= (0.78 + 0.4*id)*(0.8 + 0.35*grain);
    col *= mix(0.4, 1.0, gap);
    rough = mix(0.85, 0.42 + 0.15*grain, gap);
    h = gap*0.6 + grain*0.3;`,
});
const walnut = mat.wood({ color: 0x5e3e28, varnish: true, scale: K * 0.7 });
const paint = mat.paintedMetal({ color: 0xece8e0, wear: 0, scale: K });
const add = (m, x, y, z) => { m.position.set(x, y, z); root.add(m); return m; };

// Zemin, halı, duvarlar (arka duvarda gerçek pencere boşluğu: ay/güneş ışığı içeri düşer)
const WIN = { x: -2.2, y: 2.7, w: 3, h: 1.9 };
add(new THREE.Mesh(new THREE.BoxGeometry(14, 0.1, 12).translate(0, -0.05, 0), parquet), 2, 0, 2);
const rug = add(new THREE.Mesh(new RoundedBoxGeometry(3.4, 0.03, 2.2, 3, 0.012), mat.fabric({ color: 0x3b3f6b, scale: K })), 1.6, 0.015, 1.4);
{
  const wallShape = new THREE.Shape([[-5, 0], [9, 0], [9, 5], [-5, 5]].map(([x, y]) => new THREE.Vector2(x, y)));
  const hole = new THREE.Path([[WIN.x - WIN.w / 2, WIN.y - WIN.h / 2], [WIN.x + WIN.w / 2, WIN.y - WIN.h / 2], [WIN.x + WIN.w / 2, WIN.y + WIN.h / 2], [WIN.x - WIN.w / 2, WIN.y + WIN.h / 2]]
    .map(([x, y]) => new THREE.Vector2(x, y)));
  wallShape.holes.push(hole);
  const back = new THREE.Mesh(new THREE.ExtrudeGeometry(wallShape, { depth: 0.25, bevelEnabled: false, curveSegments: 1 }), plaster(0x9ca3b4));
  back.position.z = -4.25;
  root.add(back);
  const side = add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 5, 12.5), plaster(0x949bb0)), -5.125, 2.5, 2);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.25, 5, 12.5), plaster(0x949bb0)), 9.125, 2.5, 2);          // sağ duvar
  add(new THREE.Mesh(new THREE.BoxGeometry(14.5, 0.25, 12.5), plaster(0xd9d6cf)), 2, 5.125, 2);         // tavan
  // Kartonpiyer (tavan kornişi): içbükey profil, arka ve sol duvar boyunca
  {
    const cs = new THREE.Shape(); cs.moveTo(0, 0); cs.lineTo(0.02, 0); cs.quadraticCurveTo(0.05, -0.16, 0.2, -0.2); cs.lineTo(0.2, 0.02); cs.lineTo(0, 0.02); cs.closePath();
    const prof = (len) => new THREE.ExtrudeGeometry(cs, { depth: len, bevelEnabled: false, curveSegments: 8 });
    const cp = mat.ceramic({ color: 0xe8e4dc });
    const a = new THREE.Mesh(prof(14), cp); a.rotation.y = -Math.PI / 2; add(a, 9, 5, -4.0);
    const b2 = new THREE.Mesh(prof(12.2), cp); add(b2, -5, 5, -4.0);
    for (const m of [a, b2]) m.userData.noCast = true;
  }
  // Tavan lambası (sönük): pirinç rozet + opal cam kubbe
  add(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.22, 0], [0.24, -0.03], [0.05, -0.06], [0, -0.06]].map(([x, y]) => new THREE.Vector2(x, y)), 40), mat.brushedMetal({ color: 0xb08d57, scale: 2 })), 1.5, 5.0, 1.5);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 40, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat.glass({ tint: 0xf5f1ea, rough: 0.45, thickness: 0.004 })), 1.5, 4.95, 1.5).userData.noCast = true;
  // Sağ duvar dibinde şifonyer: çekmeceli ahşap gövde, pirinç kulplar, üstünde ayna ve kitaplar
  {
    const dr = add(new THREE.Mesh(new RoundedBoxGeometry(2.2, 1.35, 0.8, 3, 0.03), mat.wood({ color: 0x6b4a32, varnish: true, scale: K * 0.7 })), 6.3, 0.72, -3.7);
    const knobM = mat.brushedMetal({ color: 0xc9a86a, scale: 3 });
    for (let r = 0; r < 3; r++) for (const c of [-0.5, 0.5]) {
      const f = new THREE.Mesh(new RoundedBoxGeometry(0.98, 0.38, 0.04, 2, 0.012), dr.material); f.position.set(c, -0.44 + r * 0.43, 0.41); dr.add(f);
      const k = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.14, 4, 10).rotateZ(Math.PI / 2), knobM); k.position.set(c, -0.44 + r * 0.43, 0.45); dr.add(k);
    }
    for (const x of [-0.95, 0.95]) for (const z of [-0.3, 0.3]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.1, 10), knobM); l.position.set(x, -0.72, z); dr.add(l); }
    const mir = add(new THREE.Mesh(new RoundedBoxGeometry(1.3, 1.6, 0.05, 3, 0.02), dr.material), 6.3, 2.35, -4.05);
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0xcfd6e0, metalness: 1, roughness: 0.04 });
    const mg = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 1.44), glassM); mg.position.z = 0.03; mir.add(mg);
    const bookC = [0x7a2e2e, 0x2f4d6b, 0xc9b27a, 0x3e5a3a, 0x5a3e6b];
    bookC.forEach((c, i) => { const bk = new THREE.Mesh(new RoundedBoxGeometry(0.07 + (i % 2) * 0.03, 0.32 + (i % 3) * 0.04, 0.24, 2, 0.01), mat.fabric({ color: c, scale: K * 3 })); bk.position.set(5.5 + i * 0.1, 1.56 + (0.32 + (i % 3) * 0.04) / 2, -3.7); root.add(bk); });
    const vase = add(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.09, 0], [0.12, 0.08], [0.08, 0.26], [0.05, 0.32], [0.06, 0.36], [0, 0.36]].map(([x, y]) => new THREE.Vector2(x, y)), 32), mat.ceramic({ color: 0x3f6f78 })), 7.0, 1.4, -3.65);
    vase.userData.noAO = false;
  }
  // Süpürgelik
  add(new THREE.Mesh(new RoundedBoxGeometry(10, 0.22, 0.05, 2, 0.015), paint), 0, 0.11, -3.975);
  add(new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.22, 8, 2, 0.015), paint), -4.975, 0.11, 0);
  // Pencere: kasa, orta kayıt, denizlik, cam
  const fr = (w, h, d, x, y, z) => add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.015), paint), x, y, z);
  fr(WIN.w + 0.24, 0.12, 0.3, WIN.x, WIN.y + WIN.h / 2 + 0.06, -4.1);
  fr(WIN.w + 0.24, 0.12, 0.3, WIN.x, WIN.y - WIN.h / 2 - 0.06, -4.1);
  fr(0.12, WIN.h, 0.3, WIN.x - WIN.w / 2 - 0.06, WIN.y, -4.1);
  fr(0.12, WIN.h, 0.3, WIN.x + WIN.w / 2 + 0.06, WIN.y, -4.1);
  fr(0.08, WIN.h, 0.12, WIN.x, WIN.y, -4.14);
  fr(WIN.w + 0.5, 0.06, 0.34, WIN.x, WIN.y - WIN.h / 2 - 0.1, -3.9);
  const pane = add(new THREE.Mesh(new THREE.PlaneGeometry(WIN.w, WIN.h), mat.glass({ tint: 0xeaf3ff, rough: 0.02, thickness: 0.004 })), WIN.x, WIN.y, -4.16);
  pane.userData.noCast = true; pane.raycast = () => {};
  // Perdeler: kıvrımlı kumaş, korniş
  const cur = mat.fabric({ color: 0x6d4c7d, scale: K });
  [-1, 1].forEach((s) => {
    const g = new THREE.PlaneGeometry(0.75, 3.0, 36, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, 0.06 * Math.sin(x * 26 + s) * (0.7 + 0.3 * (y + 1.5) / 3)); p.setX(i, x * (0.85 + 0.15 * (y + 1.5) / 3)); }
    g.computeVertexNormals();
    const c = new THREE.Mesh(g, cur);
    c.material.side = THREE.DoubleSide;
    add(c, WIN.x + s * (WIN.w / 2 + 0.38), WIN.y - 0.05, -3.84);
  });
  const rod = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, WIN.w + 1.8, 16).rotateZ(Math.PI / 2), mat.brushedMetal({ color: 0x9a8a70, scale: 2 })), WIN.x, WIN.y + 1.5, -3.84);
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), rod.material), WIN.x + s * (WIN.w / 2 + 0.9), WIN.y + 1.5, -3.84);
  // Duvarda çerçeveli resim (yağlı boya manzara)
  const pc = document.createElement('canvas'); pc.width = 256; pc.height = 180;
  const g2 = pc.getContext('2d');
  const gr = g2.createLinearGradient(0, 0, 0, 180); gr.addColorStop(0, '#e9c79a'); gr.addColorStop(0.55, '#c58f6b'); gr.addColorStop(1, '#4b5a6e');
  g2.fillStyle = gr; g2.fillRect(0, 0, 256, 180);
  for (const [c, y0, a] of [['#6d7b92', 95, 26], ['#4d5a70', 115, 20], ['#2f3a4c', 138, 14]]) {
    g2.fillStyle = c; g2.beginPath(); g2.moveTo(0, 180);
    for (let x = 0; x <= 256; x += 8) g2.lineTo(x, y0 - a * Math.sin(x * 0.03 + y0) - a * 0.5 * Math.sin(x * 0.09));
    g2.lineTo(256, 180); g2.fill();
  }
  const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
  add(new THREE.Mesh(new RoundedBoxGeometry(1.5, 1.1, 0.06, 2, 0.02), walnut), 1.9, 2.9, -3.97);
  add(new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.94), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.75 })), 1.9, 2.9, -3.935);
}

// Pencere: gökyüzü tuvali (yıldızlar, ışıklı pencereli şehir) + ay
const skyC = document.createElement('canvas');
skyC.width = 512; skyC.height = 320;
const skyTex = new THREE.CanvasTexture(skyC);
skyTex.colorSpace = THREE.SRGBColorSpace;
const stars = Array.from({ length: 140 }, () => [Math.random() * 512, Math.random() * 220, Math.random()]);
const blds = []; for (let x = 0; x < 512;) { const w = 22 + Math.random() * 40, h = 40 + Math.random() * 90; blds.push([x, w, h, Math.random()]); x += w + 2; }
function drawSky(dawn) {
  const g = skyC.getContext('2d');
  const top = new THREE.Color(0x070b1f).lerp(new THREE.Color(0x5b8bd6), dawn);
  const bot = new THREE.Color(0x1c2850).lerp(new THREE.Color(0xffb870), dawn);
  const gr = g.createLinearGradient(0, 0, 0, 320);
  gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(1, '#' + bot.getHexString());
  g.fillStyle = gr; g.fillRect(0, 0, 512, 320);
  for (const [x, y, s] of stars) { g.fillStyle = `rgba(255,255,255,${(0.35 + 0.6 * s) * (1 - dawn)})`; g.beginPath(); g.arc(x, y, 0.5 + s, 0, 7); g.fill(); }
  const bc = new THREE.Color(0x0a0f1e).lerp(new THREE.Color(0x4a3f4c), dawn);
  for (const [x, w, h, r] of blds) {
    g.fillStyle = '#' + bc.clone().multiplyScalar(0.8 + 0.4 * r).getHexString();
    g.fillRect(x, 320 - h, w, h);
    g.fillStyle = `rgba(255,205,120,${0.85 * (1 - dawn * 0.8)})`;
    for (let yy = 320 - h + 6; yy < 314; yy += 9) for (let xx = x + 4; xx < x + w - 4; xx += 7) if (((xx * 13 + yy * 7 + r * 100) | 0) % 5 === 0) g.fillRect(xx, yy, 3, 4);
  }
  skyTex.needsUpdate = true;
}
const sky = new THREE.Mesh(new THREE.PlaneGeometry(WIN.w + 3, WIN.h + 2), new THREE.MeshBasicMaterial({ map: skyTex, fog: false }));
sky.position.set(WIN.x, WIN.y, -5.2);
root.add(sky);
const moonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xf5f1d8).multiplyScalar(2.2) });
const moon = new THREE.Mesh(new THREE.CircleGeometry(0.17, 40), moonMat);
{
  const hc = document.createElement('canvas'); hc.width = hc.height = 64;
  const hg = hc.getContext('2d'), rg = hg.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(220,230,255,0.55)'); rg.addColorStop(1, 'rgba(220,230,255,0)');
  hg.fillStyle = rg; hg.fillRect(0, 0, 64, 64);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.z = -0.01;
  moon.add(halo);
}
root.add(moon);

// Yatak ve uyuyan kişi
const bedG = new THREE.Group();
bedG.position.set(0.2, 0, -1.2);
root.add(bedG);
/** Kabarık yastık: köşelere doğru incelen, ortası baş ağırlığıyla çökmüş */
function pillowGeo(w, h, d, dent = 0) {
  const g = new RoundedBoxGeometry(w, h, d, 8, h * 0.45);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2), y = p.getY(i), z = p.getZ(i) / (d / 2);
    let yy = y * (1 - 0.55 * (x * x) ** 2) * (1 - 0.55 * (z * z) ** 2);
    if (y > 0) yy -= dent * Math.exp(-(x * x) / 0.12 - (z * z) / 0.5);
    p.setY(i, yy);
  }
  g.computeVertexNormals();
  return g;
}
{
  const frame = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.32, 3.6, 3, 0.05), walnut);
  frame.position.set(0, 0.36, 0);
  for (const [x, z] of [[-1.0, -1.7], [1.0, -1.7], [-1.0, 1.7], [1.0, 1.7]]) {
    const l = new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.24, 0.14, 2, 0.03), walnut); l.position.set(x, 0.1, z); bedG.add(l);
  }
  const head = new THREE.Mesh(new RoundedBoxGeometry(2.3, 1.35, 0.14, 3, 0.05), walnut);
  head.position.set(0, 0.85, -1.87);
  const pad = new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.8, 0.1, 6, 0.045), mat.fabric({ color: 0x8b8f9c, scale: K }));
  pad.position.set(0, 1.05, -1.78);
  const matt = new THREE.Mesh(new RoundedBoxGeometry(2.05, 0.3, 3.45, 5, 0.1), mat.fabric({ color: 0xe9e6df, scale: K }));
  matt.position.set(0, 0.62, 0);
  const pillow = new THREE.Mesh(pillowGeo(1.3, 0.24, 0.62, 0.07), mat.fabric({ color: 0xf1f0ec, scale: K }));
  pillow.position.set(0, 0.87, -1.35);
  const pillow2 = new THREE.Mesh(pillowGeo(0.9, 0.2, 0.5), mat.fabric({ color: 0xc9cfdc, scale: K }));
  pillow2.position.set(-0.55, 1.02, -1.62); pillow2.rotation.x = -0.9;
  bedG.add(frame, head, pad, matt, pillow, pillow2);
}
// Uyuyan kişi: SDF üst gövde (pijama), baş, saç, göz kapakları; kalçadan doğrulabilir (telefona bakarken)
const person = new THREE.Group();            // mantık vekili: rotation.x = −0,35·doğrulma
const body = new THREE.Object3D();           // mantık vekili: scale.y = nefes
const eyes = [-0.09, 0.09].map((x) => { const e = new THREE.Object3D(); e.position.x = x; return e; }); // vekil: scale.y>1 açık, x titreşimi = REM
const pivot = new THREE.Group();
bedG.add(pivot);
const headFrame = new THREE.Group();
pivot.add(headFrame);
let upper;
const lids = [], balls = [];
{
  const TILT = 0.165;
  const Mrot = new THREE.Matrix4().makeRotationX(-Math.PI / 2 + TILT).multiply(new THREE.Matrix4().makeScale(1 / K, 1 / K, 1 / K));
  const sk = new THREE.Vector3(0, 1.66, -0.024).applyMatrix4(Mrot);
  const off = new THREE.Vector3(0, 1.08, -1.3).sub(sk);
  const LIE = new THREE.Matrix4().makeTranslation(off.x, off.y, off.z).multiply(Mrot);
  const hip = new THREE.Vector3(0, 0.9, -0.02).applyMatrix4(LIE);
  pivot.position.copy(hip);
  new THREE.Matrix4().makeTranslation(-hip.x, -hip.y, -hip.z).multiply(LIE).decompose(headFrame.position, headFrame.quaternion, headFrame.scale);
  const items = bodyItems(STAND, { parts: { legs: false }, build: 1.02 });
  const geo = dressGeometry(sdfMesh(items, { cell: LOWQ ? 0.012 : 0.0085 }), items, { torso: 1, uarm: 1, farm: 1 }, { puff: 0.005 });
  upper = new THREE.Mesh(geo, bodyMaterial({ skin: 0xd6a283, top: 0x5a7fb8, bottom: 0x5a7fb8, scale: 1 }));
  headFrame.add(upper);
  // Saç
  const hair = sdfMesh([
    { p: [sEllipsoid([0, 1.668, -0.03], [0.085, 0.105, 0.104])], k: 0.02 },
    { p: [sEllipsoid([0, 1.6, 0.085], [0.11, 0.078, 0.085]), sEllipsoid([0, 1.545, -0.03], [0.13, 0.06, 0.15]), sEllipsoid([0, 1.59, 0.02], [0.1, 0.05, 0.06])], k: 0.025, op: 'sub' },
  ], { cell: LOWQ ? 0.006 : 0.0045, noiseAmp: 0.0025, noiseFreq: 80 });
  headFrame.add(new THREE.Mesh(hair, mat.fabric({ color: 0x2b1d14, scale: 4 })));
  // Gözler: göz küresi + iris; kapak (yarım küre) kapanır/açılır
  const lidM = tissue({ color: 0xc58e72, veins: 0.03, scale: 30 });
  const ballM = mat.ceramic({ color: 0xf0ece4 });
  const irisM = new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.25 });
  const browM = mat.fabric({ color: 0x2b1d14, scale: 2 });
  for (const s of [-1, 1]) {
    const c = new THREE.Vector3(0.031 * s, 1.626, 0.056);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0122, 20, 14), ballM);
    ball.position.copy(c);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0052, 20), irisM);
    iris.position.z = 0.0121;
    ball.add(iris);
    const lid = new THREE.Group();
    lid.position.copy(c);
    lid.add(new THREE.Mesh(new THREE.SphereGeometry(0.0134, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), lidM));
    const brow = new THREE.Mesh(blobGeometry(0.02, { detail: 5, amp: 0.12, freq: 3, stretch: [1.25, 0.22, 0.3] }), browM);
    brow.position.set(0.034 * s, 1.648, 0.08);
    headFrame.add(ball, lid, brow);
    lids.push(lid); balls.push(ball);
  }
}
// Yorgan: gövde ve bacak kabartılı, yatağın kenarlarından sarkan kumaş (nefesle hafifçe iner-kalkar)
function duvetGeo() {
  const nu = LOWQ ? 60 : 110, nv = LOWQ ? 70 : 130;
  const g = new THREE.PlaneGeometry(1, 1, nu, nv);
  const p = g.attributes.position;
  const bump = (x, z) => {
    const torso = 0.25 * Math.exp(-((x / 0.34) ** 4)) * (1 - THREE.MathUtils.smoothstep(z, -0.35, 0.05));
    const legs = [-0.15, 0.15].reduce((a, cx) => a + 0.14 * Math.exp(-(((x - cx) / 0.16) ** 2)), 0) * THREE.MathUtils.smoothstep(z, -0.6, -0.2) * (1 - THREE.MathUtils.smoothstep(z, 1.05, 1.2));
    const feet = [-0.16, 0.16].reduce((a, cx) => a + 0.21 * Math.exp(-(((x - cx) / 0.14) ** 2)), 0) * Math.exp(-(((z - 0.98) / 0.13) ** 2));
    const top = 0.05 * (1 - THREE.MathUtils.smoothstep(z, -1.3, -1.15));
    return Math.max(torso, legs, feet) - top + 0.012 * Math.sin(x * 11 + z * 3) * Math.sin(z * 7.3);
  };
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) * 2.6, v = -p.getY(i) * 2.9 + 0.1; // u: −1,3…1,3 (en), v: −1,35…1,55 (boy)
    let x = u, z = v, y = bump(Math.min(Math.abs(u), 1.06) * Math.sign(u), Math.min(v, 1.27));
    const ex = Math.abs(u) - 1.06, ez = v - 1.27;
    if (ex > 0) { x = Math.sign(u) * (1.06 + 0.06 * (1 - Math.exp(-ex * 10))); y -= ex * 1.55; }
    if (ez > 0) { z = 1.27 + 0.06 * (1 - Math.exp(-ez * 10)); y -= ez * 1.55; }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}
const blanketMat = mat.fabric({ color: 0x5b74a8, scale: K });
blanketMat.side = THREE.DoubleSide;
const blanket = new THREE.Mesh(duvetGeo(), blanketMat);
blanket.position.set(0, 0.8, 0.45);
bedG.add(blanket);

// Komodin, lamba, telefon, kupa, bardak
const stand = add(new THREE.Mesh(new RoundedBoxGeometry(0.8, 0.7, 0.7, 3, 0.03), walnut), -1.55, 0.35, -2.9);
{
  const drawer = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.26, 0.03, 2, 0.01), walnut); drawer.position.set(0, 0.12, 0.35); stand.add(drawer);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 14, 10), mat.brushedMetal({ color: 0xc9a86a, scale: 3 })); knob.position.set(0, 0.12, 0.38); stand.add(knob);
}
const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const lampBase = add(new THREE.Mesh(lathe([[0, 0], [0.13, 0], [0.14, 0.03], [0.1, 0.12], [0.13, 0.26], [0.09, 0.4], [0.03, 0.44], [0.02, 0.55], [0, 0.55]]), mat.ceramic({ color: 0x9aa7b5 })), -1.7, 0.7, -3.0);
const shadeMat = mat.fabric({ color: 0xfde6b8, scale: K * 2 });
shadeMat.emissive = new THREE.Color(0xffc46b); shadeMat.emissiveIntensity = 1; shadeMat.side = THREE.DoubleSide;
const shade = add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.3, 40, 1, true), shadeMat), -1.7, 1.26, -3.0);
shade.userData.noCast = true;
const bulbMat = mat.glow({ color: 0xffd08a, intensity: 6 });
add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), bulbMat), -1.7, 1.2, -3.0);
const lampLight = new THREE.PointLight(0xffc27a, 9, 0, 2);
lampLight.castShadow = true; lampLight.shadow.mapSize.set(512, 512); lampLight.shadow.bias = -0.004; lampLight.shadow.radius = 4;
lampLight.position.set(-1.7, 1.25, -3.0);
root.add(lampLight);
const phone = new THREE.Group();
{
  const case_ = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.02, 0.38, 3, 0.009), mat.plastic({ color: 0x16181c, gloss: 0.8 }));
  phone.add(case_);
}
const phoneScreenMat = new THREE.MeshBasicMaterial({ color: 0x0b0b0b });
phoneScreenMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= 2.2;\n#include <opaque_fragment>'); };
phoneScreenMat.customProgramCacheKey = () => 'uyku-ekran';
const phoneScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.33), phoneScreenMat);
phoneScreen.rotation.x = -Math.PI / 2;
phoneScreen.position.y = 0.0105;
phone.add(phoneScreen);
root.add(phone);
const phoneLight = new THREE.PointLight(0x7fb2ff, 0, 3 * K, 1.5);
phone.add(phoneLight);
phoneLight.position.set(0, 0.25, 0);
const mug = add(new THREE.Mesh(lathe([[0, 0], [0.07, 0], [0.075, 0.01], [0.08, 0.16], [0.072, 0.16], [0.067, 0.02], [0, 0.02]]), mat.ceramic({ color: 0xf2efe8 })), -1.35, 0.7, -2.75);
{
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.011, 10, 24, Math.PI * 1.2), mug.material);
  handle.rotation.z = -Math.PI * 0.6; handle.position.set(0.085, 0.085, 0); mug.add(handle);
  const tea = new THREE.Mesh(new THREE.CircleGeometry(0.066, 28).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x5a2e12, roughness: 0.05, clearcoat: 1 }));
  tea.position.y = 0.13; mug.add(tea);
}
const glass = add(new THREE.Mesh(lathe([[0, 0], [0.055, 0], [0.06, 0.005], [0.062, 0.2], [0.057, 0.2], [0.055, 0.012], [0, 0.012]]), mat.glass({ tint: 0xf4f8ff, rough: 0.03, thickness: 0.003 })), -1.35, 0.7, -3.1);
glass.userData.noCast = true;
{
  const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.053, 0.1, 28), new THREE.MeshPhysicalMaterial({ color: 0xb45309, roughness: 0.05, clearcoat: 1, emissive: 0x3a1402, emissiveIntensity: 0.4 }));
  drink.position.y = 0.063; glass.add(drink);
}
// Saat ve termometre etiketleri
const clockLbl = sim.label('', { parent: root, position: [1.2, 3.6, -3.95], className: 'big' });
const thermoLbl = sim.label('', { parent: root, position: [-4.95, 3.3, -1.5] });
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
  r.userData.noAO = true;
  root.add(r);
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
  lampLight.intensity = lampOn ? 9 : 0;
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
{ const q = +new URLSearchParams(location.search).get('t'); if (q > 0) tMin = q; }   // ?t=dakika: belirli ana atla (önizleme)

// Vekil değerlerden görünüme: ay/güneş → pencereden giren ana ışık, ortam → pozlama, doğrulma, nefes, göz kapakları, REM
{
  const baseExp = sim.sky.exposure.bind(sim.sky);
  let expK = 1.25;
  sim.sky.exposure = () => baseExp() * expK;
  const moonC = new THREE.Color(0.42, 0.52, 0.95), sunC = new THREE.Color(1.0, 0.78, 0.55), _tc = new THREE.Color();
  // Gündüz: pencereden odaya yayılan gök ışığı (geniş, yumuşak, gölgesiz) + ortam yansımalarının güçlenmesi (gün ışığı)
  const skyFill = new THREE.SpotLight(0xdfe9ff, 0, 0, 1.25, 1, 1.2);
  skyFill.position.set(WIN.x, WIN.y, -3.7); skyFill.target.position.set(WIN.x + 3, 0.5, 2.5);
  root.add(skyFill, skyFill.target);
  const bounce = new THREE.PointLight(0xffe2c0, 0, 0, 1.4);   // güneş lekesinden yansıyan sıcak dolgu (zemin/yatak)
  bounce.position.set(1.8, 3.6, 2.2); root.add(bounce);
  let lastEnv = -1;
  sim.onRender(() => {
    const dawn = clamp(sunLight.intensity / 1.8, 0, 1);
    sim.sky.sunColor.copy(moonC).multiplyScalar(1.4 * moonLight.intensity / 1.5).add(_tc.copy(sunC).multiplyScalar(4.2 * dawn));
    expK = 1.25 + 0.25 * dawn;
    skyFill.intensity = 38 * dawn;
    bounce.intensity = 6 * dawn;
    if (Math.abs(dawn - lastEnv) > 0.02) {
      lastEnv = dawn;
      scene.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of [].concat(o.material)) {
          if (!m || m.isMeshBasicMaterial || m.isShaderMaterial) continue;
          if (m.userData.envBase == null) m.userData.envBase = m.envMapIntensity ?? 1;
          m.envMapIntensity = m.userData.envBase * (1 + 3.5 * dawn);
        }
      });
    }
    pivot.rotation.x = 0.6 * clamp(-person.rotation.x / 0.35, 0, 1);
    upper.scale.z = 1 + (body.scale.y - 1) * 0.8;
    eyes.forEach((e, i) => {
      lids[i].rotation.x = e.scale.y > 1.5 ? 0.3 : Math.PI / 2;
      balls[i].rotation.y = (e.position.x - Math.sign(e.position.x) * 0.09) * 14;
    });
    bulbMat.emissiveIntensity = shadeMat.emissiveIntensity > 0.5 ? 6 : 0;
  });
}

// Ölçekli gruplar: prosedürel kabartma gücü görünüm (dünya) birimindedir → nesnenin dünya ölçeğine uyarlanır (benekli görünüm olmasın)
{
  const done = new WeakSet(), ws = new THREE.Vector3();
  const fixBump = () => sim.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material || [])) {
      const u = m.userData?.uniforms?.pBump;
      if (!u || done.has(m)) continue;
      done.add(m);
      o.getWorldScale(ws);
      u.value *= Math.max(ws.x, 1e-4) < 0.999 ? ws.x : 1;
    }
  });
  let nb = 0;
  sim.onRender(() => { if (nb++ % 30 === 0) fixBump(); });
}
