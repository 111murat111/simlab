// Sanal Laboratuvar: Titrasyon — büret, erlenmeyer, manyetik karıştırıcı; tam yük dengesiyle pH, indikatör rengi, pH–hacim eğrisi.
import { createSim, THREE, RoundedBoxGeometry, fmt, clamp, lerp, smoothstep, rand, textPlane, mat } from '@core';
import { labRoom, glassGeometry, liquidGeometry, glassMesh, liquidMesh, reagentBottle, epoxy } from './labkit.js';
import { dressLab } from './dressing.js';

const KW = 1e-14;
const KA_ACETIC = 1.8e-5;
const DROP_ML = 0.05;
const BURETTE_ML = 50;
const FLASK_Y = 0.35;           // karıştırıcı üst yüzeyi
const TIP_Y = 2.85;             // büret ucu
const MARK0_Y = 9.2, PER_ML = 0.11;  // büret 0 mL çizgisi ve mL başına yükseklik
const FLASK_CAP = 125;          // erlen hacmi (mL)

const INDICATORS = {
  fenol: { name: 'Fenolftalein', lo: 8.2, hi: 10, cols: [0xd6ecff, 0xff2fa0], op: [0.42, 0.8], text: 'renksiz → pembe' },
  metil: { name: 'Metil oranj', lo: 3.1, hi: 4.4, cols: [0xe0262b, 0xf28c28, 0xf5c518], op: [0.72, 0.72], text: 'kırmızı → sarı' },
  btb: { name: 'Bromtimol mavisi', lo: 6.0, hi: 7.6, cols: [0xe6cf1c, 0x35a853, 0x1d5fd6], op: [0.7, 0.75], text: 'sarı → mavi' },
};
const ACIDS = {
  HCl: { name: 'HCl', strong: true, base: false, titrant: 'NaOH' },
  AcOH: { name: 'CH₃COOH', strong: false, base: false, titrant: 'NaOH' },
  NaOH: { name: 'NaOH', strong: true, base: true, titrant: 'HCl' },
};
const A = () => ACIDS[st.acid];

const sim = createSim({
  studio: { color: 0xb9b4aa, mood: 'lab', warmth: 0.12, fill: 1.3, key: { el: 52, az: 152, power: 1.15 }, radius: 24 },
  look: { aoRadius: 0.05 },
  camera: { position: [0.45, 1.26, 0.62], target: [-0.2, 1.08, -0.12], fov: 42, near: 0.01, far: 200 },
  controls: { minDistance: 0.18, maxDistance: 2.6 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Erlendeki asidi büretteki NaOH ile (ya da NaOH'u büretteki HCl ile) nötralleştiriyorsun. Her damladan sonra pH,
    <b>tam yük dengesi</b> çözülerek hesaplanır: <b>[H⁺] + [Na⁺] = [OH⁻] + [Cl⁻] + [A⁻]</b>, K<sub>w</sub> = 10⁻¹⁴.
    Zayıf asitte [A⁻] = C·K<sub>a</sub>/(K<sub>a</sub>+[H⁺]) (CH₃COOH için K<sub>a</sub> = 1,8·10⁻⁵, pK<sub>a</sub> ≈ 4,74).</p>
    <ul>
      <li><b>Kuvvetli asit + kuvvetli baz</b> (HCl + NaOH): eşdeğerlik noktasında pH = 7, dik sıçrama ~pH 4–10.</li>
      <li><b>Zayıf asit + kuvvetli baz</b> (CH₃COOH + NaOH): önce <b>tampon bölge</b> (Henderson–Hasselbalch:
      pH = pK<sub>a</sub> + log([A⁻]/[HA])), yarı eşdeğerlikte pH = pK<sub>a</sub>; eşdeğerlikte asetat hidrolizi yüzünden pH ≈ 8,7.</li>
      <li><b>Kuvvetli baz + kuvvetli asit</b> (NaOH, bürette HCl): eğri ters yönde, yüksek pH'tan düşüğe iner; fenolftalein pembeden renksize döner.</li>
    </ul>
    <h3>İndikatör seçimi</h3>
    <p>İndikatör, dönüm aralığı eşdeğerlik sıçramasının içinde kalıyorsa doğru sonuç verir. Fenolftalein (8,2–10) iki titrasyonda da
    iyidir; metil oranj (3,1–4,4) zayıf asitte çok erken renk değiştirir; bromtimol mavisi (6,0–7,6) kuvvetli asit için idealdir.</p>
    <h3>Dene</h3>
    <ul>
      <li>Musluğu aç, eşdeğerliğe yaklaşınca kapat ve <b>tek damla</b> ekle. Damlanın düştüğü yerde anlık pembe leke oluşup
      karıştırıcıyla kaybolur; renk kalıcı olunca dur.</li>
      <li>CH₃COOH + metil oranj dene: renk nerede değişiyor, eşdeğerlik nerede?</li>
      <li><b>Görev</b> modunda asidin derişimi gizlidir: C<sub>asit</sub> = C<sub>baz</sub>·V<sub>baz</sub> / V<sub>asit</sub> ile bul.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Titrasyon; sirkedeki asetik asit oranını, sütün asitliğini, suyun sertliğini ve ilaçların saflığını ölçmek için
    laboratuvarlarda her gün kullanılır. Gerçek bir büret 0,05 mL hassasiyetle, gözü menisküsün hizasında tutarak okunur.</p>
    <p><small>Aktiflik katsayıları, sıcaklık etkisi ve CO₂ emilimi ihmal edilmiştir; karışmanın anlık olduğu varsayılır.</small></p>`,
});

// --- Kimya ---
const st = { acid: 'HCl', Ca: 0.1, Va: 25, Cb: 0.1, ind: 'fenol', Vb: 0, burUsed: 0, open: false };
let task = null; // { Ca, phase }

const acidCa = () => (task ? task.Ca : st.Ca);
function phAt(Vb, Ca = acidCa()) {
  const V = st.Va + Vb, CA = (Ca * st.Va) / V, CT = (st.Cb * Vb) / V;
  const { strong, base } = ACIDS[st.acid];
  // base: analit Na⁺ verir, titrant Cl⁻ verir; asit: analit anyon verir, titrant Na⁺ verir
  const f = base ? (h) => h + CA - KW / h - CT
    : (h) => h + CT - KW / h - (strong ? CA : (CA * KA_ACETIC) / (KA_ACETIC + h));
  let lo = -15, hi = 1; // log10[H+] aralığında ikiye bölme (f monoton artan)
  for (let i = 0; i < 64; i++) {
    const m = (lo + hi) / 2;
    if (f(10 ** m) > 0) hi = m; else lo = m;
  }
  return -(lo + hi) / 2;
}
const veq = (Ca = acidCa()) => (Ca * st.Va) / st.Cb;

function indColor(pH, out = new THREE.Color()) {
  const I = INDICATORS[st.ind];
  const t = smoothstep(I.lo, I.hi, pH);
  const c = I.cols;
  if (c.length === 2) out.setHex(c[0]).lerp(_c.setHex(c[1]), t);
  else if (t < 0.5) out.setHex(c[0]).lerp(_c.setHex(c[1]), t * 2);
  else out.setHex(c[1]).lerp(_c.setHex(c[2]), t * 2 - 1);
  return { color: out, t, opacity: lerp(I.op[0], I.op[1], t) };
}
const _c = new THREE.Color();

// --- Sahne: modellenmiş laboratuvar (metre); düzenek "content" grubunda (1 birim = 4,5 mm → gerçek boy) ---
const U = 0.045;
const BENCH = 0.9;
labRoom(sim.scene, { width: 3.4, depth: 0.78, benchH: BENCH, style: 'lab', wallZ: -0.36, top: epoxy({ color: 0x454a51 }), shelf: false, window: false });
dressLab(sim.scene, { wz: -0.36, benchH: BENCH, width: 3.4 });
const content = new THREE.Group();
content.scale.setScalar(U);
content.position.set(0, BENCH, 0);
sim.scene.add(content);
const W = (y) => BENCH + y * U; // içerik yüksekliği → dünya

const steel = mat.brushedMetal({ color: 0xcfd3d8, rough: 0.25, scale: U });
const castIron = mat.paintedMetal({ color: 0x2c3a46, wear: 0.25, scale: U });
const blackPl = mat.plastic({ color: 0x1b1e22, gloss: 0.35, scale: U });

// --- Manyetik karıştırıcı: emaye gövde, seramik tabla, düğmeler, LED ---
const stirrer = new THREE.Group();
{
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.35, 2.2, 4, 0.1), mat.paintedMetal({ color: 0xc9cccd, wear: 0.04, scale: U }));
  body.position.y = 0.175; stirrer.add(body);
  const panel = new THREE.Mesh(new RoundedBoxGeometry(2.1, 0.2, 0.05, 2, 0.02), mat.plastic({ color: 0x2b3440, gloss: 0.5, scale: U }));
  panel.position.set(0, 0.17, 1.1); stirrer.add(panel);
  for (const x of [0.55, 0.85]) {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.12, 32), blackPl);
    k.rotation.x = Math.PI / 2; k.position.set(x, 0.17, 1.16); stirrer.add(k);
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 0.01), mat.plastic({ color: 0xffffff, scale: U }));
    tick.position.set(x, 0.2, 1.225); stirrer.add(tick);
  }
}
const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.97, 0.04, 64), mat.ceramic({ color: 0xc4c5c1, scale: U }));
Object.assign(plate.material, { roughness: 0.5, clearcoat: 0.12, clearcoatRoughness: 0.45 }); // saten seramik: tavan paneli yansıması patlamasın
plate.position.y = 0.37;
stirrer.add(plate);
const ledMat = mat.glow({ color: 0x22c55e, intensity: 5 });
const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 8), ledMat);
led.position.set(-0.8, 0.17, 1.13);
stirrer.add(led);
content.add(stirrer);

// --- Erlenmeyer (cam cidarlı) + sıvı (menisküslü, karıştırınca girdap) ---
const flask = new THREE.Group();
flask.position.y = FLASK_Y + 0.04;
content.add(flask);
const GT = 0.05; // cam kalınlığı (birim)
const glass = glassMesh(glassGeometry([[0, 0], [0.72, 0], [0.8, 0.06], [0.79, 0.14], [0.3, 2.02], [0.3, 2.56], [0.35, 2.62]], GT, 72), { thickness: 0.06 });
flask.add(glass);
const L0 = 0.02 + GT, LH = 1.94, LR0 = 0.76 - GT, LR1 = 0.26 - GT * 0.4;
const liqMat0 = liquidMesh(new THREE.BufferGeometry(), 0xffffff, 1).material;
liqMat0.thickness = 1.2;
const liquid = new THREE.Mesh(new THREE.BufferGeometry(), liqMat0);
liquid.userData.noCast = true; liquid.userData.noAO = true;
flask.add(liquid);
const stirBar = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.38, 6, 16), mat.plastic({ color: 0xf8fafc, gloss: 0.6, scale: U }));
stirBar.rotation.z = Math.PI / 2;
const stirPivot = new THREE.Group();
stirPivot.position.y = GT + 0.07;
stirPivot.add(stirBar);
flask.add(stirPivot);
const flaskLabel = sim.label('', { parent: flask, position: [0, -0.2, 1.0], className: 'plain' });

const rAt = (h) => LR0 - ((LR0 - LR1) * h) / LH;
const volAt = (h) => (Math.PI / 3) * h * (LR0 * LR0 + LR0 * rAt(h) + rAt(h) ** 2);
const ML_TO_W = volAt(LH) / FLASK_CAP;
function liquidHeight(mL) {
  const v = mL * ML_TO_W;
  let a = 0, b = LH;
  for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (volAt(m) < v) a = m; else b = m; }
  return (a + b) / 2;
}
// Erlen üzerindeki beyaz emaye baskı: hacim çizgileri (25–100 mL) ve yazı alanı → cam gövde okunur
{
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(250,250,247,0.95)'; g.strokeStyle = g.fillStyle;
  g.fillRect(560, 150, 120, 90);
  g.font = '600 24px system-ui, sans-serif'; g.textBaseline = 'middle';
  g.fillText('125 mL', 440, 70);
  g.lineWidth = 4;
  for (let i = 1; i <= 4; i++) {
    const y = 512 - (liquidHeight(i * 25) + L0 - 0.14) / (2.02 - 0.14) * 512;
    g.beginPath(); g.moveTo(452, y); g.lineTo(512, y); g.stroke();
    g.textAlign = 'right'; g.fillText(String(i * 25), 444, y);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.3 + 0.012, 0.79 + 0.012, 2.02 - 0.14, 72, 1, true, Math.PI, Math.PI * 2),
    new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5, depthWrite: false }));
  shell.position.y = (0.14 + 2.02) / 2; shell.rotation.y = 0.5;
  shell.userData.noCast = true; shell.userData.noAO = true;
  flask.add(shell);
}
let surfaceY = FLASK_Y + 0.2; // içerik biriminde sıvı yüzeyi
let liqKey = '';
function buildLiquid(h, vortex) {
  const key = h.toFixed(3) + ':' + vortex.toFixed(2);
  if (key === liqKey) return;
  liqKey = key;
  const g = liquidGeometry((y) => rAt(y - L0) - 0.005, L0, L0 + h, { meniscus: 0.035, segs: 64, steps: 6 });
  // Girdap: yüzeyin merkezi karıştırma hızıyla çöker
  const p = g.attributes.position, top = L0 + h;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > top - 0.06) { const r = Math.hypot(p.getX(i), p.getZ(i)) / Math.max(rAt(h), 0.01); p.setY(i, y - vortex * Math.pow(Math.max(0, 1 - r), 2)); }
  }
  g.computeVertexNormals();
  liquid.geometry.dispose();
  liquid.geometry = g;
}

// --- Büret (cam, musluklu) ve sehpa ---
const burette = new THREE.Group();
content.add(burette);
const tube = glassMesh(glassGeometry([[0, 2.82], [0.022, 2.83], [0.03, 2.98], [0.034, 3.16], [0.125, 3.28], [0.135, 3.36], [0.135, 9.6]], 0.03, 40), { thickness: 0.03 });
burette.add(tube);
const cockBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.3, 24), mat.plastic({ color: 0xf2f2ee, gloss: 0.2, scale: U }));
cockBarrel.rotation.x = Math.PI / 2;
cockBarrel.position.y = 3.07;
burette.add(cockBarrel);
const cockHandle = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.09, 0.07, 2, 0.03), mat.plastic({ color: 0x2563eb, gloss: 0.5, scale: U }));
cockHandle.position.set(0, 3.07, 0.17);
burette.add(cockHandle);
const burMat = liquidMesh(new THREE.BufferGeometry(), 0xf4fbff, 0.6).material;
burMat.thickness = 0.2;
const burLiquid = new THREE.Mesh(new THREE.BufferGeometry(), burMat);
burLiquid.userData.noCast = true; burLiquid.userData.noAO = true;
burette.add(burLiquid);
let burKey = -1;
function buildBurLiquid(lvlY) {
  if (Math.abs(lvlY - burKey) < 1e-4) return;
  burKey = lvlY;
  const g = liquidGeometry((y) => (y < 3.3 ? 0.06 : 0.1), 3.1, Math.max(3.15, lvlY), { meniscus: 0.06, segs: 32, steps: 3 });
  burLiquid.geometry.dispose();
  burLiquid.geometry = g;
}
{
  const pts = [];
  for (let ml = 0; ml <= BURETTE_ML; ml++) {
    const y = MARK0_Y - ml * PER_ML, len = ml % 10 === 0 ? 0.2 : ml % 5 === 0 ? 0.14 : 0.07;
    pts.push(-0.02, y, 0.138, len, y, 0.138);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  burette.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x14305c })));
  for (let ml = 0; ml <= BURETTE_ML; ml += 10) {
    const t = textPlane(String(ml), 0.2, { color: '#14305c', size: 48 });
    t.position.set(0.4, MARK0_Y - ml * PER_ML, 0.14);
    burette.add(t);
  }
}
const readLabel = sim.label('', { parent: burette, position: [-0.75, MARK0_Y, 0] });
const burLabel = sim.label('', { parent: burette, position: [0, 9.95, 0], className: 'plain' });
// Sehpa: dökme taban, paslanmaz çubuk, boss başlıkları, lastik çeneli kıskaçlar
{
  const base = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.16, 1.3, 3, 0.05), castIron);
  base.position.set(0, 0.08, -1.75);
  content.add(base);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 10.4, 24), steel);
  rod.position.set(0, 5.35, -1.7);
  content.add(rod);
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 6), steel);
  nut.position.set(0, 0.2, -1.7); content.add(nut);
  for (const y of [4.1, 8.4]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.55, 16), steel);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, y, -0.9);
    content.add(arm);
    for (const s of [-1, 1]) {
      const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.045, 10, 28, Math.PI * 0.9), mat.rubber({ color: 0x3b3f44, scale: U }));
      jaw.rotation.set(Math.PI / 2, 0, s > 0 ? -Math.PI * 0.45 : Math.PI * 0.55);
      jaw.position.set(0, y, 0);
      content.add(jaw);
    }
    const boss = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.3, 0.3, 2, 0.05), castIron);
    boss.position.set(0, y, -1.7);
    content.add(boss);
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 12), steel);
    screw.rotation.z = Math.PI / 2; screw.position.set(0.28, y, -1.7); content.add(screw);
    const wing = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.22, 0.06, 1, 0.02), steel);
    wing.position.set(0.46, y, -1.7); content.add(wing);
  }
}

// --- Şişeler (gerçek cam, sıvı, etiket) ve pH metre ---
const bottles = [
  reagentBottle({ h: 0.19, r: 0.042, amber: false, liquid: 0xf6fbff, label: 'NaOH', stripe: '#2f6fb1', level: 0.75 }),
  reagentBottle({ h: 0.16, r: 0.036, amber: true, liquid: 0xf8f2e0, label: 'HCl', stripe: '#c0392b', level: 0.6 }),
  reagentBottle({ h: 0.13, r: 0.03, amber: false, liquid: 0xfbf7ea, label: 'CH₃COOH', stripe: '#16a34a', level: 0.55 }),
];
[[-0.16, -0.05, 0.3], [-0.215, -0.13, -0.4], [-0.19, 0.06, 0.8]].forEach(([x, z, r], i) => { bottles[i].position.set(x, BENCH, z); bottles[i].rotation.y = r; sim.scene.add(bottles[i]); });
// İndikatör damlalık şişesi: rengi seçilen indikatörün dönmüş rengi
const indBottle = reagentBottle({ h: 0.075, r: 0.02, amber: false, liquid: 0xff6fb5, label: 'İnd.', stripe: '#db2777', level: 0.7 });
indBottle.position.set(-0.1, BENCH, 0.07);
sim.scene.add(indBottle);
const indLiquid = indBottle.children[1];

const meter = new THREE.Group();
meter.position.set(3.3, 0, 0.2);
meter.rotation.y = -0.35;
content.add(meter);
{
  const body = new THREE.Mesh(new RoundedBoxGeometry(1.6, 1.0, 0.7, 4, 0.1), mat.plastic({ color: 0xe3e5e6, gloss: 0.3, scale: U }));
  body.position.y = 0.5; meter.add(body);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(1.42, 0.68, 0.04, 2, 0.03), mat.plastic({ color: 0x23282e, gloss: 0.6, scale: U }));
  bezel.position.set(0, 0.58, 0.35); meter.add(bezel);
  ['#3b82f6', '#64748b', '#64748b'].forEach((c, i) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.26, 0.08, 0.05, 2, 0.025), mat.rubber({ color: new THREE.Color(c).getHex(), scale: U }));
    b.position.set(-0.4 + i * 0.4, 0.15, 0.36); meter.add(b);
  });
}
const lcdCanvas = document.createElement('canvas');
lcdCanvas.width = 256; lcdCanvas.height = 110;
const lcdTex = new THREE.CanvasTexture(lcdCanvas);
lcdTex.colorSpace = THREE.SRGBColorSpace;
const lcd = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.56), new THREE.MeshStandardMaterial({ map: lcdTex, emissiveMap: lcdTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.25 }));
lcd.position.set(0, 0.58, 0.375);
meter.add(lcd);
let lcdShown = -1;
function drawLcd(pH) {
  const g = lcdCanvas.getContext('2d');
  g.fillStyle = '#9fbf92'; g.fillRect(0, 0, 256, 110);
  g.fillStyle = '#1b2a17';
  g.font = '600 20px system-ui'; g.textAlign = 'left'; g.fillText('pH', 12, 28);
  g.font = '600 16px system-ui'; g.fillText('25,0 °C', 12, 96);
  g.font = '700 64px ui-monospace, monospace'; g.textAlign = 'right';
  g.fillText(fmt(pH, 2), 244, 86);
  lcdTex.needsUpdate = true;
  lcdShown = pH;
}
// pH elektrodu (koyu gövde + cam uç) ve kablo
const probeTop = new THREE.Vector3(0.28, 3.95, 0.05), probeBot = new THREE.Vector3(0.17, FLASK_Y + 0.2, 0.03);
{
  const len = probeTop.distanceTo(probeBot);
  const probe = new THREE.Group();
  const bodyP = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, len * 0.75, 24), blackPl);
  bodyP.position.y = len * 0.625; probe.add(bodyP);
  const stem = glassMesh(new THREE.CylinderGeometry(0.045, 0.045, len * 0.25, 20), { thickness: 0.05 });
  stem.position.y = len * 0.125; probe.add(stem);
  const bulb = glassMesh(new THREE.SphereGeometry(0.055, 20, 12), { thickness: 0.05 });
  probe.add(bulb);
  probe.position.copy(probeBot);
  probe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), probeTop.clone().sub(probeBot).normalize());
  content.add(probe);
  const curve = new THREE.CatmullRomCurve3([probeTop, new THREE.Vector3(0.6, 4.6, 0.1), new THREE.Vector3(2.4, 3.2, 0.3), new THREE.Vector3(3.2, 1.05, 0.1)]);
  content.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.03, 8), mat.rubber({ color: 0x15171a, scale: U })));
}

// --- Damlalar, halkalar, akış, anlık renk lekesi ---
const dropGeo = new THREE.SphereGeometry(0.05, 16, 12);
const drops = [];
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(dropGeo, burMat);
  m.scale.set(1, 1.35, 1);
  m.visible = false;
  m.userData.noCast = true;
  content.add(m);
  drops.push({ m, v: 0, carry: 0, live: false });
}
const softTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const ringGeo = new THREE.RingGeometry(0.88, 1, 48).rotateX(-Math.PI / 2);
const rings = [];
for (let i = 0; i < 6; i++) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  m.visible = false;
  content.add(m);
  rings.push({ m, t: 1 });
}
const flashMat = new THREE.MeshBasicMaterial({ color: 0xff2fa0, map: softTex, transparent: true, opacity: 0, depthWrite: false });
const flash = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), flashMat);
flash.renderOrder = 4;
content.add(flash);
let flashT = 0, flashDur = 1;
const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1, 12).translate(0, -0.5, 0), burMat);
stream.position.y = TIP_Y;
stream.visible = false;
stream.userData.noCast = true;
content.add(stream);

function spawnDrop(carry = 0) {
  const d = drops.find((x) => !x.live);
  if (!d) return false;
  d.live = true; d.v = 0; d.carry = carry;
  d.m.position.set(0, TIP_Y - 0.04, 0);
  d.m.visible = true;
  return true;
}
function splash() {
  const r = rings.find((x) => x.t >= 1) || rings[0];
  r.t = 0;
  r.m.visible = true;
  r.m.position.set(rand(-0.03, 0.03), surfaceY - vortexDepth() * 0.95 + 0.004, rand(-0.03, 0.03));
  // Damla yerinde bazik renk lekesi: eşdeğerliğe yaklaştıkça daha uzun kalır
  const I = INDICATORS[st.ind];
  const base = A().base;
  if (base ? phAt(st.Vb) > I.hi - 0.3 : phAt(st.Vb) < I.lo + 0.3) {
    flashMat.color.setHex(base ? I.cols[0] : I.cols[I.cols.length - 1]);
    const near = smoothstep(0.75, 1.0, st.Vb / veq());
    flashDur = (0.3 + 2.8 * near) / (0.35 + stirRpm.value / 600);
    flashT = flashDur;
    flash.position.set(0, surfaceY - vortexDepth() * 0.95 + 0.006, 0);
  }
}

// --- Durum güncelleme ---
const curve = [];
let lastPh = 0, endpointHit = false;

function addBase(mL) {
  const room = BURETTE_ML - st.burUsed;
  const cap = FLASK_CAP - st.Va - st.Vb;
  const d = Math.min(mL, room, cap);
  if (d <= 0) return 0;
  st.Vb += d; st.burUsed += d;
  if (room - d <= 1e-9) { setOpen(false); sim.toast('Büret boşaldı — “Büreti doldur”a bas.', 'warn'); }
  if (cap - d <= 1e-9) { setOpen(false); sim.toast('Erlen doldu!', 'warn'); }
  return d;
}

function refresh() {
  const pH = phAt(st.Vb);
  lastPh = pH;
  const { color, t, opacity } = indColor(pH);
  // Renk: indikatörün soğurma rengi; opaklık → soğurma mesafesi (renksizde neredeyse şeffaf su)
  liqMat0.attenuationColor.copy(color);
  liqMat0.attenuationDistance = lerp(0.6, 0.012, clamp((opacity - 0.25) / 0.6, 0, 1));
  const h = liquidHeight(st.Va + st.Vb);
  surfaceY = flask.position.y + L0 + h;
  buildLiquid(h, vortexDepth());
  const lvlY = MARK0_Y - st.burUsed * PER_ML;
  buildBurLiquid(lvlY);
  readLabel.position.y = lvlY;
  readLabel.setText(`${fmt(st.burUsed, 2)} mL`);
  if (Math.abs(pH - lcdShown) > 0.004) drawLcd(pH);
  // eğri noktası
  const lastPt = curve[curve.length - 1];
  if (!lastPt || Math.abs(st.Vb - lastPt[0]) > 0.015) { curve.push([st.Vb, pH]); chartDirty = true; }
  // dönüm noktası geri bildirimi (renk yarı yoldan geçince)
  if (!endpointHit && (A().base ? t < 0.5 : t > 0.5) && st.Vb > 0) {
    endpointHit = true;
    const V = veq(), err = ((st.Vb - V) / V) * 100;
    if (task) sim.toast('Renk kalıcı olarak değişti! Musluğu kapat ve “Dönüm noktasına geldim”e bas.', 'good');
    else {
      const tone = Math.abs(err) < 1.5 ? 'good' : Math.abs(err) < 5 ? 'warn' : 'bad';
      const msg = Math.abs(err) < 1.5 ? 'Harika, eşdeğerliği yakaladın!' : err < 0 ? 'İndikatör erken döndü' : 'Eşdeğerliği geçtin';
      sim.toast(`🎯 Dönüm noktası: ${fmt(st.Vb, 2)} mL · eşdeğerlik ${fmt(V, 2)} mL (hata %${fmt(err, 1)}). ${msg}.`, tone);
      if (tone !== 'good' && !A().strong && st.ind === 'metil') sim.toast('Metil oranj zayıf asit titrasyonuna uygun değil: aralığı sıçramanın dışında.', 'warn');
    }
  }
  updateStats(pH);
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Çözeltiler');
const acidSeg = ui.segmented({
  label: 'Erlendeki çözelti (analit)', value: 'HCl',
  options: [{ value: 'HCl', label: 'HCl (kuvvetli asit)' }, { value: 'AcOH', label: 'CH₃COOH (zayıf asit)' }, { value: 'NaOH', label: 'NaOH (kuvvetli baz)' }],
  onChange: (v) => { st.acid = v; newRun(); },
});
const caSl = ui.slider({ label: 'Analit derişimi', min: 0.01, max: 0.2, step: 0.005, value: st.Ca,
  format: (v) => (task ? '? M (gizli)' : `${fmt(v, 3)} M`), onChange: (v) => { st.Ca = v; newRun(); } });
const vaSl = ui.slider({ label: 'Analit hacmi', min: 10, max: 50, step: 5, value: st.Va, unit: 'mL', onChange: (v) => { st.Va = v; newRun(); } });
const cbSl = ui.slider({ label: 'Titrant derişimi (bürette)', min: 0.05, max: 0.5, step: 0.01, value: st.Cb, format: (v) => `${fmt(v, 2)} M`,
  onChange: (v) => { st.Cb = v; newRun(); } });
ui.select({
  label: 'İndikatör', value: 'fenol',
  options: Object.entries(INDICATORS).map(([k, I]) => ({ value: k, label: `${I.name} (${fmt(I.lo, 1)}–${fmt(I.hi, 1)}, ${I.text})` })),
  onChange: (v) => {
    st.ind = v; indLiquid.material.attenuationColor.setHex(INDICATORS[v].cols.at(-1));
    const past = phAt(st.Vb) > (INDICATORS[v].lo + INDICATORS[v].hi) / 2;
    endpointHit = A().base ? !past : past; refresh(); chartDirty = true;
  },
});

ui.section('Büret');
const openTg = ui.toggle({ label: 'Musluk açık', value: false, onChange: (v) => setOpen(v) });
const rateSl = ui.slider({ label: 'Musluk hızı', min: 0.05, max: 2, step: 0.05, value: 0.5, format: (v) => `${fmt(v, 2)} mL/s (~${fmt(v / DROP_ML, 0)} damla/s)` });
ui.buttons([
  { label: '💧 Tek damla', variant: 'primary', onClick: () => { if (!spawnDrop(DROP_ML)) addBase(DROP_ML); } },
  { label: '+1 mL', onClick: () => { addBase(1); refresh(); splash(); } },
  { label: '🔄 Büreti doldur', onClick: () => { st.burUsed = 0; refresh(); sim.toast('Büret 0,00 mL çizgisine dolduruldu (okumalar yeni başlangıçtan).'); } },
]);
const stirRpm = ui.slider({ label: 'Karıştırıcı', min: 0, max: 1200, step: 50, value: 600, unit: 'dev/dk' });

ui.section('Ölçümler');
const sVb = ui.stat({ label: 'Eklenen titrant', unit: 'mL' });
const sPh = ui.stat({ label: 'pH' });
const sVeq = ui.stat({ label: 'Eşdeğerlik', unit: 'mL' });
const sH = ui.stat({ label: '[H⁺]', unit: 'M' });
const regionTxt = ui.text('', 'card');
const showTheory = ui.toggle({ label: 'Kuramsal eğriyi göster', value: true, onChange: () => { chartDirty = true; } });

// pH–hacim grafiği (özel tuval: x ekseni hacim)
const chartWrap = document.createElement('div');
chartWrap.className = 'chart';
chartWrap.innerHTML = '<div class="chart-title">Titrasyon eğrisi: pH – eklenen titrant hacmi (mL)</div>';
const cv = document.createElement('canvas');
cv.style.width = '100%';
chartWrap.append(cv);
const legend = document.createElement('div');
legend.className = 'legend';
chartWrap.append(legend);
ui.append(chartWrap);
let chartDirty = true;

function drawChart() {
  chartDirty = false;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth || 280, H = 190;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = H * dpr; cv.style.height = H + 'px'; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const pl = 28, pr = 8, pt = 8, pb = 20, iw = W - pl - pr, ih = H - pt - pb;
  const V = veq(), trueV = V;
  const xmax = Math.max(10, Math.min(FLASK_CAP - st.Va, Math.ceil((task ? Math.max(40, st.Vb * 1.3) : Math.max(2 * V, st.Vb * 1.1)) / 5) * 5));
  const X = (v) => pl + (iw * v) / xmax, Y = (p) => pt + ih * (1 - p / 14);
  // indikatör aralığı bandı
  const I = INDICATORS[st.ind];
  const grd = g.createLinearGradient(0, Y(I.lo), 0, Y(I.hi));
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  grd.addColorStop(0, hex(I.cols[0])); grd.addColorStop(1, hex(I.cols.at(-1)));
  g.globalAlpha = 0.22; g.fillStyle = grd; g.fillRect(pl, Y(I.hi), iw, Y(I.lo) - Y(I.hi)); g.globalAlpha = 1;
  // ızgara
  g.font = '10px system-ui'; g.fillStyle = 'rgba(148,163,184,.85)'; g.strokeStyle = 'rgba(148,163,184,.16)';
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let p = 0; p <= 14; p += 2) { g.beginPath(); g.moveTo(pl, Y(p)); g.lineTo(W - pr, Y(p)); g.stroke(); g.fillText(p, pl - 4, Y(p)); }
  g.textAlign = 'center'; g.textBaseline = 'top';
  const step = xmax > 60 ? 20 : xmax > 30 ? 10 : 5;
  for (let v = 0; v <= xmax; v += step) g.fillText(v, X(v), H - pb + 4);
  g.textAlign = 'right'; g.fillText('mL', W - pr, H - pb + 4);
  let leg = `<span><i style="background:#38bdf8"></i>Ölçülen</span>`;
  if (!task && showTheory.value) {
    g.setLineDash([4, 3]); g.strokeStyle = 'rgba(226,232,240,.5)'; g.lineWidth = 1.5; g.beginPath();
    for (let i = 0; i <= 240; i++) { const v = (xmax * i) / 240, y = Y(phAt(v)); i ? g.lineTo(X(v), y) : g.moveTo(X(v), y); }
    g.stroke();
    g.strokeStyle = 'rgba(250,204,21,.8)'; g.beginPath(); g.moveTo(X(trueV), pt); g.lineTo(X(trueV), H - pb); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#facc15'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(`Eşd. ${fmt(trueV, 1)}`, X(trueV) + 3, pt + 2);
    if (!A().strong) {
      g.fillStyle = '#a78bfa'; g.beginPath(); g.arc(X(trueV / 2), Y(-Math.log10(KA_ACETIC)), 3.5, 0, 7); g.fill();
      g.textBaseline = 'bottom'; g.fillText('pH = pKa', X(trueV / 2) + 5, Y(4.74) - 2);
    }
    leg += `<span><i style="background:#cbd5e1"></i>Kuramsal</span><span><i style="background:#facc15"></i>Eşdeğerlik</span>`;
  }
  leg += `<span><i style="background:${hex(I.cols.at(-1))}"></i>${I.name} aralığı</span>`;
  legend.innerHTML = leg;
  if (curve.length) {
    g.strokeStyle = '#38bdf8'; g.lineWidth = 2.2; g.lineJoin = 'round'; g.beginPath();
    curve.forEach(([v, p], i) => (i ? g.lineTo(X(v), Y(p)) : g.moveTo(X(v), Y(p))));
    g.stroke();
    const [v, p] = curve[curve.length - 1];
    g.fillStyle = '#fff'; g.beginPath(); g.arc(X(v), Y(p), 3.5, 0, 7); g.fill();
  }
}

ui.section('Görev: bilinmeyen derişim');
const taskTxt = ui.text('Analit derişimi gizlenir. Titre et, dönüm noktasında dur, sonra derişimi hesapla.', '');
ui.buttons([
  { label: '🎯 Görevi başlat', variant: 'good', onClick: startTask },
  { label: '✅ Dönüm noktasına geldim', onClick: checkEndpoint },
]);
const scoreStat = ui.stat({ label: 'Görev puanı' });
scoreStat.set('—');
let totalScore = 0;

ui.section('Titrasyon');
ui.button({ label: '🧪 Yeni titrasyon (aynı ayarlarla)', onClick: () => sim.reset() });

function region(pH) {
  const V = veq(), x = st.Vb / V, { strong, base } = A();
  const eq = strong ? 'HCl + NaOH → NaCl + H₂O' : 'CH₃COOH + NaOH → CH₃COONa + H₂O';
  let r;
  if (base) {
    if (st.Vb === 0) r = 'Başlangıç: yalnız kuvvetli baz, [OH⁻] ≈ C<sub>baz</sub>, pH = 14 + log C.';
    else if (Math.abs(x - 1) < 0.02) r = '<b>Eşdeğerlik noktası</b>: yalnız NaCl + su, pH = 7.';
    else if (x > 1) r = '<b>Asit fazlası</b>: pH’yı artık fazla H⁺ belirliyor.';
    else r = '<b>Baz fazlası</b>: kalan OH⁻ pH’yı belirliyor; eşdeğerlikte dik düşüş gelecek.';
    return `${r}<br><small>${eq}</small>`;
  }
  if (st.Vb === 0) r = strong ? 'Başlangıç: yalnız kuvvetli asit, [H⁺] ≈ C<sub>asit</sub>.' : 'Başlangıç: zayıf asit kısmen iyonlaşmış, [H⁺] ≈ √(K<sub>a</sub>·C).';
  else if (Math.abs(x - 1) < 0.02) r = strong ? '<b>Eşdeğerlik noktası</b>: yalnız NaCl + su, pH = 7.' : '<b>Eşdeğerlik noktası</b>: asetat hidrolizi (CH₃COO⁻ + H₂O ⇌ CH₃COOH + OH⁻) → pH &gt; 7.';
  else if (x > 1) r = '<b>Baz fazlası</b>: pH’yı artık fazla OH⁻ belirliyor.';
  else if (strong) r = '<b>Asit fazlası</b>: kalan H⁺ pH’yı belirliyor; eşdeğerliğe çok yakın sıçrama dik.';
  else if (Math.abs(x - 0.5) < 0.04) r = '<b>Yarı eşdeğerlik</b>: [HA] = [A⁻] → pH = pK<sub>a</sub> ≈ 4,74.';
  else if (x > 0.08 && x < 0.92) {
    const hh = -Math.log10(KA_ACETIC) + Math.log10(x / (1 - x));
    r = `<b>Tampon bölge</b> (CH₃COOH/CH₃COO⁻). Henderson–Hasselbalch: pH ≈ ${fmt(hh, 2)} (tam çözüm ${fmt(pH, 2)}).`;
  } else r = 'Zayıf asit + oluşan asetat: tampon bölgenin kenarı.';
  return `${r}<br><small>${eq}</small>`;
}

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const sup = (n) => String(n).split('').map((c) => SUP[c]).join('');

function updateStats(pH) {
  sVb.set(fmt(st.Vb, 2));
  const I = INDICATORS[st.ind];
  sPh.set(fmt(pH, 2), pH < I.lo ? '' : pH > I.hi ? 'good' : 'warn');
  sVeq.set(task ? '?' : fmt(veq(), 2));
  const h = 10 ** -pH, e = Math.floor(Math.log10(h));
  sH.set(`${fmt(h / 10 ** e, 1)}·10${sup(e)}`);
  regionTxt.set(task ? `İndikatör: <b>${I.name}</b> — ${I.text}. Rengin kalıcı değiştiği ilk damlada dur.` : region(pH));
  flaskLabel.setText(`${A().name} ${task ? '?' : fmt(acidCa(), 3)} M · ${fmt(st.Va, 0)} mL + ${I.name}`);
  burLabel.setText(`Büret: ${A().titrant} ${fmt(st.Cb, 2)} M`);
}

function setOpen(v) {
  st.open = v;
  openTg.set(v);
  cockHandle.rotation.z = v ? Math.PI / 2 : 0;
}

function newRun() {
  st.Vb = 0; st.burUsed = 0; endpointHit = false;
  setOpen(false);
  curve.length = 0;
  drops.forEach((d) => { d.live = false; d.m.visible = false; });
  flashT = 0;
  if (task) task.phase = 'run';
  refresh();
  chartDirty = true;
}

// --- Görev ---
function startTask() {
  task = { Ca: Math.round(rand(0.04, 0.16) * 1000) / 1000, phase: 'run' };
  if (veq() > 45) task.Ca = Math.round(((45 * st.Cb) / st.Va) * 0.8 * 1000) / 1000;
  caSl.disable(true);
  caSl.set(caSl.value);
  taskTxt.set(`<b>Görev sürüyor.</b> ${fmt(st.Va, 0)} mL ${A().name} (derişim gizli), ${fmt(st.Cb, 2)} M ${A().titrant} ile titre edilecek.`);
  newRun();
  sim.hud.show(`<h2>🎯 Bilinmeyen derişim</h2>Erlendeki ${A().name} çözeltisinin derişimi gizli. Musluğu aç, renk dönmeye yaklaşınca damla damla ekle,
    rengin kalıcı değiştiği anda dur ve <b>“Dönüm noktasına geldim”</b>e bas.<br><button class="btn primary" data-a="ok">Başla</button>`);
  sim.hud.el.querySelector('[data-a=ok]').onclick = () => sim.hud.hide();
}

function endTask() {
  task = null;
  caSl.disable(false);
  caSl.set(st.Ca);
  taskTxt.set('Analit derişimi gizlenir. Titre et, dönüm noktasında dur, sonra derişimi hesapla.');
  newRun();
  sim.hud.hide();
}

function checkEndpoint() {
  if (!task) { sim.toast('Önce “Görevi başlat”a bas.', 'warn'); return; }
  if (task.phase !== 'run') return;
  if (st.Vb < 0.5) { sim.toast('Henüz yeterince titrant eklemedin.', 'warn'); return; }
  setOpen(false);
  task.phase = 'ask';
  const Vb = st.Vb, right = (st.Cb * Vb) / st.Va;
  const opts = [right, (st.Cb * st.Va) / Vb, (st.Cb * Vb) / (st.Va + Vb), right * 2];
  const order = opts.map((v, i) => ({ v, i })).sort(() => Math.random() - 0.5);
  sim.hud.show(`<h2>Derişimi hesapla</h2>Harcanan ${A().titrant}: <b>${fmt(Vb, 2)} mL</b> · C<sub>titrant</sub> = ${fmt(st.Cb, 2)} M · V<sub>analit</sub> = ${fmt(st.Va, 0)} mL<br>
    ${A().name} derişimi kaç M? (n<sub>asit</sub> = n<sub>baz</sub>)<br>
    ${order.map((o) => `<button class="btn" data-i="${o.i}">${fmt(o.v, 4)} M</button>`).join('')}`);
  sim.hud.el.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => answer(+b.dataset.i, Vb)));
}

function answer(i, Vb) {
  if (!task || task.phase !== 'ask') return;
  task.phase = 'done';
  const Vtrue = veq(), err = Math.abs(Vb - Vtrue) / Vtrue * 100;
  const calcOk = i === 0;
  let pts = calcOk ? 40 : 0;
  pts += err < 1 ? 60 : err < 3 ? 40 : err < 8 ? 15 : 0;
  totalScore += pts;
  scoreStat.set(totalScore, pts >= 80 ? 'good' : pts >= 40 ? 'warn' : 'bad');
  const acc = err < 1 ? 'Dönüm noktası mükemmel!' : err < 3 ? 'Dönüm noktası iyi.' : Vb < Vtrue ? 'Çok erken durdun.' : `Eşdeğerliği geçtin (fazla ${A().titrant}).`;
  sim.hud.show(`<h2>${pts >= 80 ? '🏆' : pts >= 40 ? '👍' : '🔁'} ${pts} puan</h2>
    Gerçek derişim: <b>${fmt(task.Ca, 3)} M</b> (eşdeğerlik ${fmt(Vtrue, 2)} mL). Senin hacmin: ${fmt(Vb, 2)} mL (hata %${fmt(err, 1)}).<br>
    ${calcOk ? '✔ Formül doğru: C<sub>analit</sub> = C<sub>titrant</sub>·V<sub>titrant</sub>/V<sub>analit</sub>.' : '✘ Formül yanlış. Doğrusu: C<sub>analit</sub> = C<sub>titrant</sub>·V<sub>titrant</sub>/V<sub>analit</sub>.'} ${acc}<br>
    <button class="btn primary" data-a="again">Tekrar oyna</button><button class="btn" data-a="free">Serbest moda dön</button>`,
  { tone: pts >= 80 ? 'good' : pts >= 40 ? 'warn' : 'bad' });
  sim.hud.el.querySelector('[data-a=again]').onclick = () => { if (task?.phase === 'done') startTask(); };
  sim.hud.el.querySelector('[data-a=free]').onclick = () => { if (task) endTask(); };
}

// --- Döngü ---
let dropAcc = 0, lastVortex = 0;
function vortexDepth() { return (stirRpm ? stirRpm.value / 1200 : 0.5) * 0.28; }
sim.onUpdate((dt) => {
  if (st.open) {
    const rate = rateSl.value;
    const added = addBase(rate * dt);
    if (added > 0) {
      dropAcc += (Math.min(rate, 0.6) / DROP_ML) * dt;
      while (dropAcc >= 1) { dropAcc -= 1; spawnDrop(0); }
      refresh();
    }
  }
  stream.visible = st.open && rateSl.value > 0.6;
  if (stream.visible) stream.scale.y = TIP_Y - surfaceY;
  for (const d of drops) {
    if (!d.live) continue;
    d.v += 16 * dt;
    d.m.position.y -= d.v * dt;
    if (d.m.position.y <= surfaceY) {
      d.live = false; d.m.visible = false;
      if (d.carry) { addBase(d.carry); refresh(); }
      splash();
    }
  }
});

sim.onRender((dt) => {
  const w = (stirRpm.value / 60) * Math.PI * 2 * 0.25; // görsel olarak yavaşlatılmış
  stirPivot.rotation.y += w * dt;
  ledMat.emissiveIntensity = stirRpm.value > 0 ? 5 : 0.05;
  const vd = vortexDepth();
  if (Math.abs(vd - lastVortex) > 0.01) { lastVortex = vd; buildLiquid(surfaceY - flask.position.y - L0, vd); }
  for (const r of rings) {
    if (r.t >= 1) continue;
    r.t = Math.min(1, r.t + dt * 1.6);
    r.m.scale.setScalar(0.03 + r.t * 0.3);
    r.m.material.opacity = 0.7 * (1 - r.t);
    if (r.t >= 1) r.m.visible = false;
  }
  if (flashT > 0) {
    flashT = Math.max(0, flashT - dt);
    const k = flashT / flashDur;
    flashMat.opacity = 0.85 * k;
    flash.scale.setScalar(Math.min(rAt(surfaceY - flask.position.y - L0) - 0.02, 0.08 + (1 - k) * 0.5));
  }
  flash.visible = flashT > 0;
  if (chartDirty) drawChart();
});

// Musluğa tıklayınca aç/kapa
const cockHit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
cockHit.position.y = 3.07;
burette.add(cockHit);
sim.onClick([cockHit], () => setOpen(!st.open));

sim.onReset(newRun);
newRun();
