// Sanal Laboratuvar: Titrasyon — büret, erlenmeyer, manyetik karıştırıcı; tam yük dengesiyle pH, indikatör rengi, pH–hacim eğrisi.
import { createSim, THREE, RoundedBoxGeometry, fmt, clamp, lerp, smoothstep, rand, textPlane } from '@core';

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
  background: 0x121826,
  camera: { position: [5.8, 5.0, 11.4], target: [0.5, 4.2, 0], fov: 45 },
  controls: { minDistance: 4, maxDistance: 26 },
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
sim.renderer.localClippingEnabled = true;

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

// --- Sahne: oda, masa ---
{
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#9aa7b8'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const v = 214 + Math.floor(Math.random() * 16);
    g.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
    g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 4);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  wall.position.set(0, 6, -3.4);
  sim.scene.add(wall);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshStandardMaterial({ color: 0x3a4254, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -3.2;
  sim.scene.add(floor);
}
const bench = new THREE.Mesh(new RoundedBoxGeometry(16, 0.4, 6.4, 3, 0.08), new THREE.MeshStandardMaterial({ color: 0x1f2633, roughness: 0.35 }));
bench.position.set(0, -0.2, -0.2);
sim.scene.add(bench);
const cabinet = new THREE.Mesh(new THREE.BoxGeometry(15.4, 2.8, 5.8), new THREE.MeshStandardMaterial({ color: 0xb8c2d0, roughness: 0.7 }));
cabinet.position.set(0, -1.8, -0.4);
sim.scene.add(cabinet);
const fill = new THREE.PointLight(0xfff1dd, 18, 30, 1.6);
fill.position.set(-4, 8, 5);
sim.scene.add(fill);

// Temas gölgesi (ucuz sahte gölge)
const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
function contactShadow(x, z, sx, sz) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.005, z);
  sim.scene.add(m);
}

const glassMat = new THREE.MeshPhongMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.28, shininess: 120, specular: 0xffffff, side: THREE.DoubleSide, depthWrite: false });
const metalMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.8, roughness: 0.3 });

// --- Manyetik karıştırıcı ---
const stirrer = new THREE.Group();
stirrer.add(new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.35, 2.2, 3, 0.08), new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.5 })));
stirrer.children[0].position.y = 0.175;
const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.02, 48), new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.3 }));
plate.position.y = 0.355;
stirrer.add(plate);
const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0x334155 }));
knob.rotation.x = Math.PI / 2;
knob.position.set(0.7, 0.17, 1.14);
stirrer.add(knob);
const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
led.position.set(-0.8, 0.2, 1.12);
stirrer.add(led);
sim.scene.add(stirrer);
contactShadow(0, 0, 3.4, 3.1);

// --- Erlenmeyer ---
const flask = new THREE.Group();
flask.position.y = FLASK_Y;
sim.scene.add(flask);
const glass = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.74, 0], [0.8, 0.05], [0.3, 2.02], [0.3, 2.6], [0.35, 2.66]].map(([x, y]) => new THREE.Vector2(x, y)), 48), glassMat);
glass.renderOrder = 3;
flask.add(glass);
// Sıvı: tam koni + kırpma düzlemi; yüzey diski ölçeklenir
const L0 = 0.02, LH = 1.98, LR0 = 0.76, LR1 = 0.26;
const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), FLASK_Y + 0.2);
const liqMat = new THREE.MeshPhongMaterial({ color: 0xeef6ff, transparent: true, opacity: 0.3, shininess: 60, side: THREE.DoubleSide, depthWrite: false, clippingPlanes: [clipPlane] });
const liquid = new THREE.Mesh(new THREE.LatheGeometry([[0, L0], [0.72, L0], [LR0, 0.06], [LR1, L0 + LH]].map(([x, y]) => new THREE.Vector2(x, y)), 48), liqMat);
liquid.renderOrder = 1;
flask.add(liquid);
const swirlTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    g.beginPath();
    for (let a = 0; a < 5; a += 0.05) { const r = a * 11; g.lineTo(64 + r * Math.cos(a + k * Math.PI / 2), 64 + r * Math.sin(a + k * Math.PI / 2)); }
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
})();
const surfMat = new THREE.MeshPhongMaterial({ color: 0xeef6ff, map: swirlTex, transparent: true, opacity: 0.45, shininess: 100, depthWrite: false });
const surface = new THREE.Mesh(new THREE.CircleGeometry(1, 48), surfMat);
surface.rotation.x = -Math.PI / 2;
surface.renderOrder = 2;
flask.add(surface);
const stirBar = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.36, 4, 12), new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }));
stirBar.rotation.z = Math.PI / 2;
const stirPivot = new THREE.Group();
stirPivot.position.y = 0.075;
stirPivot.add(stirBar);
flask.add(stirPivot);
const flaskLabel = sim.label('', { parent: flask, position: [0, -0.15, 0.95], className: 'plain' });

const rAt = (h) => LR0 - ((LR0 - LR1) * h) / LH;
const volAt = (h) => (Math.PI / 3) * h * (LR0 * LR0 + LR0 * rAt(h) + rAt(h) ** 2);
const ML_TO_W = volAt(LH) / FLASK_CAP;
function liquidHeight(mL) {
  const v = mL * ML_TO_W;
  let a = 0, b = LH;
  for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (volAt(m) < v) a = m; else b = m; }
  return (a + b) / 2;
}
let surfaceY = FLASK_Y + 0.2; // dünya koordinatında sıvı yüzeyi

// --- Büret ve sehpa ---
const burette = new THREE.Group();
sim.scene.add(burette);
const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6.25, 24, 1, true), glassMat);
tube.position.y = 3.35 + 6.25 / 2;
tube.renderOrder = 3;
burette.add(tube);
const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.03, 0.15, 24, 1, true), glassMat);
cone.position.y = 3.275;
burette.add(cone);
const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.018, 0.35, 12), glassMat);
tip.position.y = TIP_Y + 0.175;
burette.add(tip);
const cockBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 16), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3 }));
cockBarrel.rotation.x = Math.PI / 2;
cockBarrel.position.y = 3.07;
burette.add(cockBarrel);
const cockHandle = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.08, 0.06, 2, 0.02), new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.4 }));
cockHandle.position.set(0, 3.07, 0.15);
burette.add(cockHandle);
const burMat = new THREE.MeshPhongMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.5, depthWrite: false });
const burLiquid = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 20).translate(0, 0.5, 0), burMat);
burLiquid.position.y = 3.36;
burLiquid.renderOrder = 1;
burette.add(burLiquid);
const meniscus = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshBasicMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.6, depthWrite: false }));
meniscus.rotation.x = -Math.PI / 2;
burette.add(meniscus);
{
  const pts = [];
  for (let ml = 0; ml <= BURETTE_ML; ml++) {
    const y = MARK0_Y - ml * PER_ML, len = ml % 10 === 0 ? 0.2 : ml % 5 === 0 ? 0.14 : 0.07;
    pts.push(-0.02, y, 0.125, len, y, 0.125);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  burette.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xf1f5f9 })));
  for (let ml = 0; ml <= BURETTE_ML; ml += 10) {
    const t = textPlane(String(ml), 0.2, { color: '#f1f5f9', size: 48 });
    t.position.set(0.4, MARK0_Y - ml * PER_ML, 0.13);
    burette.add(t);
  }
}
const readLabel = sim.label('', { parent: burette, position: [-0.75, MARK0_Y, 0] });
const burLabel = sim.label('', { parent: burette, position: [0, 9.95, 0], className: 'plain' });
// Sehpa, kıskaçlar
{
  const base = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.12, 1.1, 2, 0.04), metalMat);
  base.position.set(0, 0.06, -1.75);
  sim.scene.add(base);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 10.4, 12), metalMat);
  rod.position.set(0, 5.2, -1.7);
  sim.scene.add(rod);
  for (const y of [4.1, 8.4]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.55), metalMat);
    arm.position.set(0, y, -0.9);
    sim.scene.add(arm);
    const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 20), new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 }));
    jaw.rotation.x = Math.PI / 2;
    jaw.position.set(0, y, 0);
    sim.scene.add(jaw);
    const boss = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshStandardMaterial({ color: 0x475569 }));
    boss.position.set(0, y, -1.7);
    sim.scene.add(boss);
  }
}

// --- Şişeler ve pH metre ---
function bottle(x, z, color, name, h = 1.3) {
  const g = new THREE.Group();
  const mat = new THREE.MeshPhongMaterial({ color, transparent: true, opacity: 0.75, shininess: 90 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, h, 28), mat);
  body.position.y = h / 2;
  const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.42, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  shoulder.position.y = h;
  shoulder.scale.y = 0.5;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.25, 16), mat);
  neck.position.y = h + 0.3;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0x111827 }));
  cap.position.y = h + 0.5;
  const lab = textPlane(name, 0.24, { bg: '#f8fafc', color: '#0f172a', size: 44, pad: 10 });
  lab.position.set(0, h * 0.5, 0.43);
  g.add(body, shoulder, neck, cap, lab);
  g.position.set(x, 0, z);
  sim.scene.add(g);
  contactShadow(x, z, 1.4, 1.4);
  return g;
}
bottle(-3.4, -0.9, 0x7c4a1e, 'NaOH');
bottle(-4.6, -0.4, 0xdbeafe, 'HCl', 1.1);
bottle(-3.9, 0.9, 0xe0f2fe, 'CH₃COOH', 0.95);
const indBottle = bottle(-2.2, 1.3, 0xff6fb5, 'İnd.', 0.55);
indBottle.scale.setScalar(0.7);

const meter = new THREE.Group();
meter.position.set(3.3, 0, 0.2);
meter.rotation.y = -0.35;
sim.scene.add(meter);
meter.add(new THREE.Mesh(new RoundedBoxGeometry(1.6, 1.0, 0.7, 3, 0.08), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 })));
meter.children[0].position.y = 0.5;
const lcdCanvas = document.createElement('canvas');
lcdCanvas.width = 256; lcdCanvas.height = 110;
const lcdTex = new THREE.CanvasTexture(lcdCanvas);
lcdTex.colorSpace = THREE.SRGBColorSpace;
const lcd = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.56), new THREE.MeshBasicMaterial({ map: lcdTex }));
lcd.position.set(0, 0.56, 0.36);
meter.add(lcd);
contactShadow(3.3, 0.2, 2.2, 1.4);
let lcdShown = -1;
function drawLcd(pH) {
  const g = lcdCanvas.getContext('2d');
  g.fillStyle = '#a9c79a'; g.fillRect(0, 0, 256, 110);
  g.fillStyle = '#1b2a17';
  g.font = '600 20px system-ui'; g.textAlign = 'left'; g.fillText('pH', 12, 28);
  g.font = '700 64px ui-monospace, monospace'; g.textAlign = 'right';
  g.fillText(fmt(pH, 2), 244, 86);
  lcdTex.needsUpdate = true;
  lcdShown = pH;
}
// Prob ve kablo
const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 3.4, 12), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 }));
const probeTop = new THREE.Vector3(0.28, 3.95, 0.05), probeBot = new THREE.Vector3(0.17, FLASK_Y + 0.13, 0.03);
probe.position.copy(probeTop).add(probeBot).multiplyScalar(0.5);
probe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), probeTop.clone().sub(probeBot).normalize());
probe.scale.y = probeTop.distanceTo(probeBot) / 3.4;
sim.scene.add(probe);
{
  const curve = new THREE.CatmullRomCurve3([probeTop, new THREE.Vector3(0.6, 4.6, 0.1), new THREE.Vector3(2.4, 3.2, 0.3), new THREE.Vector3(3.2, 1.05, 0.1)]);
  sim.scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.025, 6), new THREE.MeshStandardMaterial({ color: 0x111827 })));
}

// --- Damlalar, halkalar, akış, anlık renk lekesi ---
const dropGeo = new THREE.SphereGeometry(0.045, 12, 8);
const drops = [];
for (let i = 0; i < 16; i++) {
  const m = new THREE.Mesh(dropGeo, burMat);
  m.scale.set(1, 1.35, 1);
  m.visible = false;
  sim.scene.add(m);
  drops.push({ m, v: 0, carry: 0, live: false });
}
const ringGeo = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
const rings = [];
for (let i = 0; i < 6; i++) {
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  m.visible = false;
  sim.scene.add(m);
  rings.push({ m, t: 1 });
}
const flashMat = new THREE.MeshBasicMaterial({ color: 0xff2fa0, transparent: true, opacity: 0, depthWrite: false });
const flash = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), flashMat);
flash.renderOrder = 4;
sim.scene.add(flash);
let flashT = 0, flashDur = 1;
const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1, 10).translate(0, -0.5, 0), burMat);
stream.position.y = TIP_Y;
stream.visible = false;
sim.scene.add(stream);

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
  r.m.position.set(rand(-0.03, 0.03), surfaceY + 0.004, rand(-0.03, 0.03));
  // Damla yerinde bazik renk lekesi: eşdeğerliğe yaklaştıkça daha uzun kalır
  const I = INDICATORS[st.ind];
  const base = A().base;
  if (base ? phAt(st.Vb) > I.hi - 0.3 : phAt(st.Vb) < I.lo + 0.3) {
    flashMat.color.setHex(base ? I.cols[0] : I.cols[I.cols.length - 1]);
    const near = smoothstep(0.75, 1.0, st.Vb / veq());
    flashDur = (0.3 + 2.8 * near) / (0.35 + stirRpm.value / 600);
    flashT = flashDur;
    flash.position.set(0, surfaceY + 0.006, 0);
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
  liqMat.color.copy(color); liqMat.opacity = opacity;
  surfMat.color.copy(color); surfMat.opacity = Math.min(0.9, opacity + 0.15);
  const h = liquidHeight(st.Va + st.Vb);
  surfaceY = FLASK_Y + L0 + h;
  clipPlane.constant = surfaceY;
  surface.position.y = L0 + h;
  surface.scale.setScalar(rAt(h) - 0.01);
  const lvlY = MARK0_Y - st.burUsed * PER_ML;
  burLiquid.scale.y = Math.max(0.001, lvlY - 3.36);
  meniscus.position.y = lvlY + 0.002;
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
    st.ind = v; indBottle.children[0].material.color.setHex(INDICATORS[v].cols.at(-1));
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
let dropAcc = 0;
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
  surface.rotation.z -= w * dt * 0.5;
  led.material.color.setHex(stirRpm.value > 0 ? 0x22c55e : 0x334155);
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
    flash.scale.setScalar(Math.min(rAt(surfaceY - FLASK_Y - L0) - 0.02, 0.08 + (1 - k) * 0.5));
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
