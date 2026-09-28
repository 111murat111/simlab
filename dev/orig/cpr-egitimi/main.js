// İlk Yardım: CPR Eğitimi — yetişkin temel yaşam desteği (ERC/AHA): zincir adımları, 30:2 göğüs basısı, OED, canlı geri bildirim ve puan.
import { createSim, THREE, RoundedBoxGeometry, clamp, lerp, fmt, makeGround } from '@core';

const sim = createSim({
  background: 0x0d1424,
  camera: { position: [5.8, 7.6, 9.2], target: [0.4, 1.4, 0], fov: 45 },
  controls: { minDistance: 6, maxDistance: 22, maxPolarAngle: Math.PI * 0.45 },
  shadows: false,
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Yerde yanıtsız yatan bir yetişkin (eğitim mankeni) ve senin kolların. Önce <b>hayat zincirinin</b> ilk adımlarını
    doğru sırayla seç, sonra 2 dakikalık <b>göğüs basısı</b> uygula. Her bası için hız, derinlik ve göğsün geri gelmesi ölçülür.</p>
    <h3>Nasıl bası yapılır?</h3>
    <ul>
      <li><b>Boşluk</b> tuşunu basılı tut / bırak ya da sahnede fareyle (dokunmatikte parmakla) bas-bırak.
      Ne kadar uzun basılı tutarsan o kadar derine inersin; yaklaşık yarım vuruş basılı tutmak ~5–6 cm verir.</li>
      <li>Hedef: dakikada <b>100–120</b> bası, <b>5–6 cm</b> derinlik, her basıdan sonra göğsün <b>tamamen</b> geri gelmesi.</li>
      <li>30 basıdan sonra 2 kurtarıcı nefes (<b>B</b> tuşu ya da düğme). İstersen "Yalnız göğüs basısı" seçeneğini aç.</li>
      <li>Metronomu açarsan dakikada 110 vuruşla tık sesi duyarsın.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>ERC ve AHA yetişkin temel yaşam desteği önerileri: ortam güvenliği → bilinç kontrolü → hava yolunu açıp en fazla 10 sn
    solunum kontrolü → <b>112</b> ve <b>OED/AED</b> → 30 bası : 2 nefes. Hırıltılı, seyrek (agonal) nefes <b>normal solunum değildir</b>.
    OED gelir gelmez açılır ve sesli komutları izlenir. Çocuk ve bebeklerde teknik farklıdır.</p>
    <p><b>Bu simülasyon sertifikalı ilk yardım eğitiminin yerini tutmaz.</b> Gerçek bir mankenle uygulamalı kursa katıl.
    Acil durumda <b>112</b>'yi ara.</p>`,
});

// --- Sahne ---
sim.scene.add(makeGround(40, 0x1a2436));
const SKIN = 0xe6c3a0;
const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 });
const manikin = new THREE.Group();
sim.scene.add(manikin);
const UP = new THREE.Vector3(0, 1, 0);
function capsule(a, b, r, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, A.distanceTo(B), 6, 16), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(UP, B.sub(A).normalize());
  return m;
}
// Göğüs (basıyla ezilir): tabanı y=0'da
const CHEST_H = 2.3;
const chestGeo = new RoundedBoxGeometry(2.9, CHEST_H, 3.5, 4, 0.7).translate(0, CHEST_H / 2, 0);
const chest = new THREE.Mesh(chestGeo, skinMat);
chest.position.set(0.1, 0, 0);
manikin.add(chest);
const abdomen = new THREE.Mesh(new RoundedBoxGeometry(2.4, 1.9, 3.2, 4, 0.6).translate(0, 0.95, 0), skinMat);
abdomen.position.set(2.6, 0, 0);
manikin.add(abdomen);
const hips = new THREE.Mesh(new RoundedBoxGeometry(1.8, 1.8, 3.4, 4, 0.6).translate(0, 0.9, 0), new THREE.MeshStandardMaterial({ color: 0x33415c, roughness: 0.8 }));
hips.position.set(4.5, 0, 0);
manikin.add(hips);
const legMat = hips.material;
manikin.add(capsule([5, 0.7, 0.9], [10.5, 0.55, 1.0], 0.65, legMat), capsule([5, 0.7, -0.9], [10.5, 0.55, -1.0], 0.65, legMat));
manikin.add(capsule([-1.0, 1.2, 2.05], [2.9, 0.6, 2.25], 0.5, skinMat), capsule([-1.0, 1.2, -2.05], [2.9, 0.6, -2.25], 0.5, skinMat));
manikin.add(capsule([-1.5, 1.1, 0], [-2.4, 1.1, 0], 0.55, skinMat));
const head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), skinMat);
head.scale.set(1.05, 0.95, 0.9);
head.position.set(-3.25, 1.05, 0);
manikin.add(head);
{
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.9 });
  for (const z of [-0.33, 0.33]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), dark); e.position.set(-3.35, 1.95, z); e.scale.y = 0.4; manikin.add(e); }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), skinMat); nose.position.set(-3.6, 1.95, 0); manikin.add(nose);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 6, 16, Math.PI), dark); mouth.rotation.set(-Math.PI / 2, 0, Math.PI / 2); mouth.position.set(-3.9, 1.8, 0); manikin.add(mouth);
  // Göğüs kemiği işareti ve bası noktası
  const sternum = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.02, 0.35), new THREE.MeshStandardMaterial({ color: 0xcfa983, roughness: 0.7 }));
  sternum.position.set(0.05, CHEST_H - 0.005, 0);
  chest.add(sternum);
}
const target = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 40), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
target.rotation.x = -Math.PI / 2;
target.position.set(0.55, CHEST_H + 0.02, 0);
chest.add(target);
// Metronom halkası
const beatRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 48), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
beatRing.rotation.x = -Math.PI / 2;
beatRing.position.set(0.55, CHEST_H + 0.03, 0);
chest.add(beatRing);

// Kurtarıcının elleri ve kolları (dik kollar, omuzlar ellerin üstünde)
const rescuer = new THREE.Group();
sim.scene.add(rescuer);
const handMat = new THREE.MeshStandardMaterial({ color: 0xc58c5f, roughness: 0.6 });
const sleeve = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.7, transparent: true, opacity: 0.9 });
const hand1 = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.3, 0.75, 3, 0.14), handMat);
hand1.position.set(0.65, CHEST_H + 0.16, 0);
const hand2 = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.3, 0.7, 3, 0.14), handMat);
hand2.position.set(0.65, CHEST_H + 0.42, 0);
hand2.rotation.y = 0.35;
rescuer.add(hand1, hand2);
rescuer.add(capsule([0.75, CHEST_H + 0.55, 0.25], [0.75, CHEST_H + 3.4, 1.0], 0.28, handMat));
rescuer.add(capsule([0.75, CHEST_H + 0.55, -0.25], [0.75, CHEST_H + 3.4, -1.0], 0.28, handMat));
rescuer.add(capsule([0.75, CHEST_H + 3.2, 0.95], [0.75, CHEST_H + 5.2, 1.5], 0.36, sleeve));
rescuer.add(capsule([0.75, CHEST_H + 3.2, -0.95], [0.75, CHEST_H + 5.2, -1.5], 0.36, sleeve));
const shoulders = capsule([0.75, CHEST_H + 5.3, -1.6], [0.75, CHEST_H + 5.3, 1.6], 0.42, sleeve);
rescuer.add(shoulders);

// Derinlik göstergesi (3B cetvel): 1 cm = 0,3 birim
const GS = 0.3;
const gauge = new THREE.Group();
gauge.position.set(0.65, CHEST_H + 0.05, -2.6);
sim.scene.add(gauge);
{
  const bg = new THREE.Mesh(new THREE.BoxGeometry(0.35, 8 * GS, 0.08), new THREE.MeshBasicMaterial({ color: 0x1e293b }));
  bg.position.y = -4 * GS;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.38, 1 * GS, 0.1), new THREE.MeshBasicMaterial({ color: 0x16a34a }));
  band.position.y = -5.5 * GS;
  gauge.add(bg, band);
  for (const d of [0, 2, 4, 5, 6, 8]) sim.label(`${d} cm`, { parent: gauge, position: [0.55, -d * GS, 0], className: 'plain' }).el.style.fontSize = '10.5px';
}
const marker = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 3), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
marker.rotation.z = -Math.PI / 2;
marker.position.x = -0.35;
gauge.add(marker);
sim.label('Derinlik', { parent: gauge, position: [0, 0.45, 0], className: 'plain' });

// OED (AED) cihazı ve pedler
const aed = new THREE.Group();
{
  const box = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.55, 1.2, 3, 0.12), new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.5 }));
  box.position.y = 0.28;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), new THREE.MeshBasicMaterial({ color: 0x0f172a }));
  screen.rotation.x = -Math.PI / 2; screen.position.set(-0.3, 0.56, 0);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x440000 }));
  btn.position.set(0.4, 0.58, 0);
  aed.add(box, screen, btn);
  aed.userData.btn = btn;
  sim.label('OED', { parent: aed, position: [0, 0.9, 0], className: 'plain' });
}
aed.position.set(-1.2, 0, 3.4);
aed.visible = false;
sim.scene.add(aed);
const padMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });
const pads = [new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.05, 0.7, 2, 0.02), padMat), new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.05, 0.7, 2, 0.02), padMat)];
pads[0].position.set(-0.75, CHEST_H + 0.02, -0.95); // sağ köprücük altı (hastanın sağı = -z tarafı)
pads[1].position.set(0.9, CHEST_H - 0.1, 1.45); pads[1].rotation.x = 0.5; // sol koltuk altı
pads.forEach((p) => { p.visible = false; chest.add(p); });

// --- Ses: metronom (kullanıcı açınca) ---
let actx = null;
function click(hi = false) {
  if (!actx) return;
  try {
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = hi ? 1500 : 1000;
    g.gain.setValueAtTime(0.25, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.05);
    o.connect(g).connect(actx.destination);
    o.start(); o.stop(actx.currentTime + 0.06);
  } catch { /* ses yoksa sessiz devam */ }
}

// --- Oyun durumu ---
const SESSION = 120; // s
const CHAIN = [
  { q: 'Birinin yere yığıldığını gördün. İlk ne yaparsın?', ok: 'Ortamın güvenli olduğundan emin ol (trafik, elektrik, yangın)',
    bad: ['Hemen kişiyi oturtmaya çalış', 'Ağzına su dökerek ayılt'], res: 'Ortam güvenli. Kişiye yaklaşıyorsun.',
    why: 'Önce kendi güvenliğin: ikinci bir kazazede olursan kimseye yardım edemezsin.' },
  { q: 'Kişi hareketsiz yatıyor. Şimdi?', ok: 'Omuzlarından hafifçe sars ve yüksek sesle "İyi misiniz?" diye seslen',
    bad: ['Nabzını bulmak için bir dakika uğraş', 'Bacaklarını havaya kaldır'], res: 'Yanıt yok. Yüksek sesle yardım çağırıyorsun.',
    why: 'Bilinç kontrolü: sesli uyarı ve hafifçe sarsma. İlk yardımcılar için nabız aramak önerilmez; zaman kaybettirir.' },
  { q: 'Yanıt vermiyor. Sıradaki adım?', ok: 'Başı geriye it, çeneyi kaldır; en fazla 10 saniye normal solunumu kontrol et',
    bad: ['Parmağınla ağzın içini körlemesine tara', 'Kalp masajına başlamadan 1 dakika bekle'], res: 'Yalnızca seyrek, hırıltılı nefes var — bu <b>normal solunum değildir</b> (agonal solunum).',
    why: 'Hava yolunu baş-çene pozisyonuyla aç, 10 sn\'den uzun bakma. Seyrek hırıltılı nefes kalp durmasının belirtisi olabilir.' },
  { q: 'Normal nefes almıyor. Ne yaparsın?', ok: '112\'yi ara (telefonu hoparlöre al) ve birinden OED getirmesini iste',
    bad: ['Önce kişinin ailesine haber ver', 'Kendin OED aramaya uzaklara koş'], res: '112 hatta: "Göğüs basısına başlayın, sizi yönlendireceğim." Biri OED\'yi getirmeye gitti.',
    why: '112 ve OED hemen istenir. Yalnızsan telefonu hoparlöre al ve hastanın yanından ayrılma.' },
  { q: 'Ellerini nereye koyarsın?', ok: 'Göğsün ortasına, göğüs kemiğinin alt yarısına; kollar düz, omuzlar ellerin üstünde',
    bad: ['Karnın üstüne, mide bölgesine', 'Göğsün sol tarafına, kalbin üstüne'], res: 'Eller doğru yerde. Başla!',
    why: 'Doğru yer göğsün ortası (göğüs kemiğinin alt yarısı). Kollar dirsekten bükülmeden, vücut ağırlığıyla bas.' },
];
const G = {
  phase: 'intro', step: 0, chainScore: 0, chainTries: 0,
  t: 0, depth: 0, pressing: false, rise: 0,
  comps: [], cycle: 0, cur: null, lastPress: -1, lastRelease: -1, pauseStart: -1,
  compressTime: 0, breaths: 0, aedStage: 0, aedTimer: 0, handsOffWarn: false, analysisTouches: 0, longPauses: 0,
};
let demo = { on: false, t: 0 };

function shuffle(a) { return a.map((x) => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map((p) => p[1]); }

function showIntro() {
  G.phase = 'intro'; G.step = 0; G.chainScore = 0; G.chainTries = 0;
  sim.controls.enabled = true;
  sim.hud.show(`<h2>🚑 Temel Yaşam Desteği</h2>Bir yetişkin aniden yere yığıldı. Hayat zincirini doğru sırayla uygula,
    sonra 2 dakika göğüs basısı yap.<br><button class="btn primary" data-a="start">Başla</button><button class="btn" data-a="skip">Doğrudan basıya geç</button>
    <div style="font-size:11.5px;color:var(--muted);margin-top:6px">Sertifikalı eğitimin yerini tutmaz · Acil durumda 112</div>`);
  sim.hud.el.querySelector('[data-a=start]').onclick = () => askChain();
  sim.hud.el.querySelector('[data-a=skip]').onclick = () => startCPR();
}
function askChain() {
  G.phase = 'chain';
  const s = CHAIN[G.step];
  const opts = shuffle([s.ok, ...s.bad]);
  sim.hud.show(`<div style="font-size:12px;color:var(--muted)">Adım ${G.step + 1}/${CHAIN.length}</div><b>${s.q}</b><br>` +
    opts.map((o, i) => `<button class="btn" data-o="${i}" style="display:block;width:100%;text-align:left;margin:6px 0 0">${o}</button>`).join(''));
  sim.hud.el.querySelectorAll('[data-o]').forEach((b) => {
    b.onclick = () => {
      const pick = opts[+b.dataset.o];
      if (G.phase !== 'chain') return;
      if (pick === s.ok) {
        if (G.chainTries === 0) G.chainScore++;
        G.chainTries = 0;
        sim.toast(`✅ ${s.why}`, 'good');
        if (G.step === 3) { sim.toast('📞 112 arandı · OED yolda', 'good'); }
        G.step++;
        if (G.step >= CHAIN.length) startCPR(s.res);
        else { sim.hud.show(`${s.res}<br><button class="btn primary" data-n>Devam</button>`, { tone: 'good' }); sim.hud.el.querySelector('[data-n]').onclick = askChain; }
      } else {
        G.chainTries++;
        sim.toast(`❌ Yanlış. ${s.why}`, 'bad');
      }
    };
  });
}

function startCPR(msg = '') {
  Object.assign(G, { phase: 'cpr', t: 0, comps: [], cycle: 0, cur: null, lastPress: -1, lastRelease: -1, pauseStart: 0, compressTime: 0,
    breaths: 0, aedStage: 0, aedTimer: 0, analysisTouches: 0, longPauses: 0 });
  aed.visible = false; pads.forEach((p) => (p.visible = false));
  depthChart.clear();
  sim.controls.enabled = false;
  sim.hud.show(`${msg ? msg + '<br>' : ''}<b>Göğüs basısı!</b> <kbd>Boşluk</kbd> tuşunu basılı tut-bırak ya da sahneye bas-bırak.<br>
    Hedef: <b>100–120/dk</b> · <b>5–6 cm</b> · tam geri dönüş`, { timeout: 5000 });
}

function press() {
  if (G.pressing) return;
  G.pressing = true;
  if (demo.on) return;
  if (G.phase === 'breaths') { sim.toast('Nefesleri atladın; basıya devam', 'warn'); resumeCompressions(); }
  if (G.phase === 'aed' && (G.aedStage === 2 || G.aedStage === 3)) {
    G.analysisTouches++;
    sim.toast('⚠️ OED analiz/şok sırasında hastaya dokunma!', 'bad');
    return;
  }
  if (G.phase !== 'cpr' && G.phase !== 'aed') return;
  const now = G.t;
  if (G.cur) finishComp();
  const c = { t: now, residual: G.depth, max: G.depth, interval: G.lastPress >= 0 ? now - G.lastPress : null };
  if (G.lastRelease >= 0 && now - G.lastRelease > 10 && G.comps.length) { G.longPauses++; sim.toast('⏱ Bası arası 10 sn\'yi geçti. Ara vermeleri kısa tut!', 'warn'); }
  // Önceki basının geri dönüşü, bu basının başındaki kalan derinlikten anlaşılır
  const prev = G.comps[G.comps.length - 1];
  if (prev && prev.recoil == null) prev.recoil = G.depth < 0.5;
  G.cur = c;
  G.lastPress = now;
  G.cycle++;
}
function release() {
  if (!G.pressing) return;
  G.pressing = false;
  if (demo.on) return;
  if (!G.cur) return;
  G.lastRelease = G.t;
  finishComp();
  if (G.phase === 'cpr' && G.cycle >= 30 && !onlyCompr.value) startBreaths();
}
function finishComp() {
  const c = G.cur;
  G.cur = null;
  c.depthOK = c.max >= 4.95 && c.max <= 6.05;
  c.rateOK = c.interval != null && c.interval < 2 ? (60 / c.interval >= 100 && 60 / c.interval <= 120) : null;
  G.comps.push(c);
  lastDepth = c.max;
  const n = G.comps.length;
  if (n % 6 === 0) coach();
}
function coach() {
  const last = G.comps.slice(-6);
  const dm = avg(last.map((c) => c.max));
  const rates = last.filter((c) => c.interval && c.interval < 2).map((c) => 60 / c.interval);
  const r = rates.length ? avg(rates) : 110;
  const rec = last.filter((c) => c.recoil === false).length;
  if (r < 100) sim.toast('⏩ Daha hızlı bas', 'warn');
  else if (r > 120) sim.toast('⏪ Biraz yavaşla', 'warn');
  else if (dm < 4.95) sim.toast('⬇️ Daha derin bas (en az 5 cm)', 'warn');
  else if (dm > 6.05) sim.toast('⬆️ Çok derin; 6 cm\'yi geçme', 'warn');
  else if (rec > 1) sim.toast('↕️ Göğsün tamamen geri gelmesine izin ver', 'warn');
  else sim.toast('👍 Harika ritim ve derinlik!', 'good');
}
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function startBreaths() {
  G.phase = 'breaths'; G.breaths = 0; G.breathStart = G.t;
  sim.hud.show(`<b>30 bası tamam → 2 kurtarıcı nefes</b><br>Başı geriye it, çeneyi kaldır, burnu kapat; göğüs kalkacak şekilde ~1 sn üfle.<br>
    <button class="btn primary" data-b>🫁 Nefes ver (B)</button><button class="btn" data-s>Nefesi atla, basıya dön</button>`);
  sim.hud.el.querySelector('[data-b]').onclick = giveBreath;
  sim.hud.el.querySelector('[data-s]').onclick = resumeCompressions;
}
function giveBreath() {
  if (G.phase !== 'breaths' || G.rise > 0.05) return;
  G.rise = 1; G.breaths++;
  sim.toast(`🫁 Nefes ${G.breaths}/2 — göğüs kalkıyor`);
  if (G.breaths >= 2) setTimeout(() => { if (G.phase === 'breaths') resumeCompressions(); }, 900);
}
function resumeCompressions() {
  if (G.phase !== 'breaths') return;
  const pause = G.t - G.breathStart;
  G.phase = 'cpr'; G.cycle = 0;
  sim.hud.show(pause > 10 ? '⏱ Nefes arası 10 sn\'yi geçti — basıya hemen dön!' : '💪 Basıya devam! 30 bası', { timeout: 2000, tone: pause > 10 ? 'warn' : 'good' });
}

// OED akışı
function aedArrives() {
  G.aedStage = 1; aed.visible = true;
  sim.toast('🟩 OED geldi!', 'good');
  sim.hud.show(`<b>OED geldi.</b> Ne yaparsın?<br>
    <button class="btn primary" data-x="ok" style="display:block;width:100%;margin-top:6px">Cihazı aç, sesli komutları izle; pedleri çıplak göğse yapıştır</button>
    <button class="btn" data-x="no" style="display:block;width:100%;margin-top:6px">Önce kullanım kılavuzunu baştan sona oku</button>`);
  sim.hud.el.querySelector('[data-x=ok]').onclick = () => {
    if (G.aedStage !== 1) return;
    pads.forEach((p) => (p.visible = true));
    G.phase = 'aed'; G.aedStage = 2; G.aedTimer = 0;
    sim.hud.show('🔊 "Kalp ritmi analiz ediliyor. <b>Hastaya dokunmayın!</b>"', { tone: 'warn' });
  };
  sim.hud.el.querySelector('[data-x=no]').onclick = () => sim.toast('❌ OED\'ler sesli komutla yönlendirir; hemen aç ve komutları izle.', 'bad');
}
function aedShockPrompt() {
  G.aedStage = 3;
  sim.hud.show(`🔊 "Şok öneriliyor. Herkes uzaklaşsın!"<br><button class="btn danger" data-k>⚡ Şok düğmesine bas</button>`, { tone: 'bad' });
  sim.hud.el.querySelector('[data-k]').onclick = shock;
}
function shock() {
  if (G.aedStage !== 3) return;
  G.aedStage = 4; G.flash = 1;
  G.phase = 'cpr'; G.cycle = 0;
  sim.hud.show('⚡ Şok verildi. 🔊 "<b>Hemen göğüs basısına başlayın.</b>"', { timeout: 3500, tone: 'good' });
}

function finish() {
  G.phase = 'done';
  sim.controls.enabled = true;
  const cs = G.comps;
  const rated = cs.filter((c) => c.rateOK != null);
  const pDepth = cs.length ? cs.filter((c) => c.depthOK).length / cs.length : 0;
  const pRate = rated.length ? rated.filter((c) => c.rateOK).length / rated.length : 0;
  const withRec = cs.filter((c) => c.recoil != null);
  const pRec = withRec.length ? withRec.filter((c) => c.recoil).length / withRec.length : 0;
  const ccf = G.compressTime / SESSION;
  const mRate = rated.length ? avg(rated.map((c) => 60 / c.interval)) : 0;
  const mDepth = avg(cs.map((c) => c.max));
  const score = Math.round(100 * (0.35 * pDepth + 0.35 * pRate + 0.2 * pRec + 0.1 * clamp(ccf / 0.8, 0, 1)) - 5 * G.analysisTouches);
  const s = clamp(score, 0, 100);
  const grade = s >= 85 ? '🏆 Mükemmel' : s >= 70 ? '👍 İyi' : s >= 50 ? '🙂 Geliştirilmeli' : '📚 Tekrar pratik yap';
  const row = (k, v, ok) => `<tr><td style="text-align:left;padding:1px 8px">${k}</td><td style="text-align:right;color:${ok ? 'var(--good)' : 'var(--warn)'}">${v}</td></tr>`;
  sim.hud.show(`<h2>${grade} · ${s}/100</h2><table style="margin:0 auto;font-size:13.5px">
    ${row('Toplam bası', fmt(cs.length), cs.length > 150)}
    ${row('Ortalama hız', `${fmt(mRate)}/dk`, mRate >= 100 && mRate <= 120)}
    ${row('Ortalama derinlik', `${fmt(mDepth, 1)} cm`, mDepth >= 5 && mDepth <= 6)}
    ${row('Doğru derinlik', `%${fmt(pDepth * 100)}`, pDepth >= 0.7)}
    ${row('Doğru hız', `%${fmt(pRate * 100)}`, pRate >= 0.7)}
    ${row('Tam geri dönüş', `%${fmt(pRec * 100)}`, pRec >= 0.8)}
    ${row('Bası süresi oranı', `%${fmt(ccf * 100)}`, ccf >= 0.6)}
    ${G.step ? row('Zincir adımları (ilk denemede)', `${G.chainScore}/${CHAIN.length}`, G.chainScore === CHAIN.length) : ''}
    </table><div style="font-size:12px;color:var(--muted);margin-top:4px">Gerçekte OED ve 112 ekibi gelene ya da kişi normal nefes alana kadar bası sürer; yorulursan 2 dakikada bir yer değiştirin.</div>
    <button class="btn primary" data-r>Tekrar oyna</button>`, { tone: s >= 70 ? 'good' : 'warn' });
  sim.hud.el.querySelector('[data-r]').onclick = () => showIntro();
}

// --- Girdi: Boşluk (çekirdeğin duraklatma kısayolundan önce yakala), B, fare/dokunma ---
window.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select, textarea')) return;
  if (e.code === 'Space') {
    if (G.phase === 'intro' || G.phase === 'chain' || G.phase === 'done') return; // oyun dışı: normal duraklatma
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) press();
  } else if (e.key === 'b' || e.key === 'B') giveBreath();
}, true);
window.addEventListener('keyup', (e) => { if (e.code === 'Space') release(); }, true);
sim.dom.addEventListener('pointerdown', (e) => {
  if (G.phase !== 'cpr' && G.phase !== 'aed' && G.phase !== 'breaths') return;
  sim.dom.setPointerCapture?.(e.pointerId);
  press();
});
sim.dom.addEventListener('pointerup', release);
sim.dom.addEventListener('pointercancel', release);

// --- Arayüz ---
const ui = sim.ui;
ui.section('Canlı geri bildirim');
const mRate = ui.meter({ label: 'Hız (hedef 100–120/dk)', color: 'var(--good)' });
const mDepth = ui.meter({ label: 'Derinlik (hedef 5–6 cm)', color: 'var(--good)' });
const mRec = ui.meter({ label: 'Geri dönüş (tam bırak)', color: 'var(--good)' });
const mTime = ui.meter({ label: 'Oturum (2 dakika)', color: 'var(--accent)' });
const stCount = ui.stat({ label: 'Bası (bu döngü)', unit: '/30' });
const stTotal = ui.stat({ label: 'Toplam bası' });
const depthChart = ui.chart({ title: 'Göğüs derinliği (cm) — yeşil çizgiler: 5 ve 6 cm', series: [{ name: 'Derinlik', color: '#38bdf8' }, { name: '5 cm', color: '#16a34a' }, { name: '6 cm', color: '#16a34a' }], maxPoints: 240, yMin: 0, yMax: 8, height: 100 });
ui.section('Ayarlar');
const metro = ui.toggle({ label: '🔊 Metronom (110/dk)', value: false, onChange: (v) => {
  if (v && !actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; } }
  if (v) actx?.resume?.();
} });
const onlyCompr = ui.toggle({ label: 'Yalnız göğüs basısı (nefessiz CPR)', value: false });
ui.text('<small>ERC: Kurtarıcı nefes vermeyi bilmiyor ya da istemiyorsan <b>kesintisiz göğüs basısı</b> yap; bu da hayat kurtarır.</small>');
ui.section('Oturum');
ui.buttons([
  { label: '▶ Oturumu başlat', variant: 'primary', onClick: () => startCPR() },
  { label: '🔗 Zincirle başla', onClick: () => showIntro() },
]);
ui.button({ label: '👀 Doğru ritmi göster (10 sn)', onClick: () => { if (G.phase === 'cpr' || G.phase === 'aed') return sim.toast('Önce oturumu bitir'); demo = { on: true, t: 0 }; } });
ui.text(`<b>Hayat zinciri</b><ol style="margin:4px 0;padding-left:18px">
  <li>Ortam güvenliği, bilinç kontrolü</li><li>Hava yolu + solunum kontrolü (≤10 sn)</li><li><b>112</b>'yi ara, <b>OED</b> iste</li>
  <li>30 göğüs basısı : 2 nefes</li><li>OED gelince hemen kullan</li></ol>
  <small>Eğitim amaçlıdır; sertifikalı ilk yardım kursunun yerini tutmaz. Acil durumda 112.</small>`, 'card');

// --- Döngü ---
let lastDepth = 0, metroPh = 0, chartAcc = 0;
const DMAX = 7.2, TP = 0.16, TR = 0.075;
function step(dt, pressing) {
  const target = pressing ? DMAX : 0;
  G.depth += (target - G.depth) * (1 - Math.exp(-dt / (pressing ? TP : TR)));
  if (G.cur) G.cur.max = Math.max(G.cur.max, G.depth);
}
sim.onRender((rdt) => {
  if (sim.paused) return;
  const sdt = rdt * sim.speed;
  // Gösteri modu: simülasyon saatiyle (hız çarpanı geçerli)
  if (demo.on) {
    demo.t += sdt;
    const ph = (demo.t * 110 / 60) % 1;
    const n = Math.max(1, Math.ceil(sdt / 0.02));
    for (let i = 0; i < n; i++) step(sdt / n, ph < 0.46);
    if (demo.t > 10) { demo.on = false; G.depth = 0; }
  } else {
    // Oyun gerçek zamanla akar (kullanıcı gerçek zamanlı bastığı için hız çarpanı uygulanmaz)
    const dt = rdt;
    step(dt, G.pressing);
    if (G.phase === 'cpr' || G.phase === 'breaths' || G.phase === 'aed') {
      G.t += dt;
      if (G.pressing && G.phase === 'cpr') G.compressTime += dt;
      else if (G.phase === 'cpr' && G.lastPress >= 0 && G.t - G.lastPress < 1.2) G.compressTime += dt;
      if (G.aedStage === 0 && G.t > 50) aedArrives();
      if (G.aedStage === 2) { G.aedTimer += dt; if (G.aedTimer > 5) aedShockPrompt(); }
      if (G.t >= SESSION && G.phase !== 'aed') finish();
    }
  }
  // Görseller
  const d = G.depth;
  chest.scale.y = (CHEST_H - (d / 10) + G.rise * 0.12) / CHEST_H;
  rescuer.position.y = -d / 10 + G.rise * 0.12;
  marker.position.y = -d * GS;
  marker.material.color.setHex(d >= 4.95 && d <= 6.05 ? 0x22c55e : d > 6.05 ? 0xef4444 : 0xfacc15);
  G.rise = Math.max(0, G.rise - rdt * 1.1);
  G.flash = Math.max(0, (G.flash || 0) - rdt * 2);
  sim.scene.background.setRGB(0.05 + G.flash * 0.6, 0.08 + G.flash * 0.6, 0.14 + G.flash * 0.3);
  if (aed.visible) aed.userData.btn.material.emissive.setHex(G.aedStage === 3 && (performance.now() / 300) % 2 < 1 ? 0xff2222 : 0x440000);
  // Metronom
  metroPh += rdt * 110 / 60;
  if (metroPh >= 1) { metroPh %= 1; if (metro.value) click(); }
  beatRing.material.opacity = metro.value ? Math.max(0, 0.9 - metroPh * 2.2) : 0;
  beatRing.scale.setScalar(1 + metroPh * 0.4);
  target.material.opacity = G.phase === 'cpr' ? 0.35 + 0.35 * Math.sin(performance.now() / 250) ** 2 : 0.3;
  // Grafik
  chartAcc += rdt;
  if (chartAcc > 0.04) { chartAcc = 0; depthChart.push([d, 5, 6]); }
  // Göstergeler
  if (sim.frame % 4 === 0) updateMeters();
});

function updateMeters() {
  const cs = G.comps;
  const recent = cs.slice(-5).filter((c) => c.interval && c.interval < 2);
  const rate = recent.length ? avg(recent.map((c) => 60 / c.interval)) : 0;
  const tone = (ok, near) => (ok ? 'var(--good)' : near ? 'var(--warn)' : 'var(--bad)');
  mRate.set(rate / 160, rate ? `${fmt(rate)}/dk ${rate >= 100 && rate <= 120 ? '✓' : rate < 100 ? '↑ hızlan' : '↓ yavaşla'}` : '—');
  mRate.color(tone(rate >= 100 && rate <= 120, rate >= 90 && rate <= 130));
  const dd = G.cur ? G.cur.max : lastDepth;
  mDepth.set(dd / 8, dd ? `${fmt(dd, 1)} cm ${dd >= 4.95 && dd <= 6.05 ? '✓' : dd < 4.95 ? '↓ daha derin' : '↑ çok derin'}` : '—');
  mDepth.color(tone(dd >= 4.95 && dd <= 6.05, dd >= 4 && dd <= 7));
  const lastRec = [...cs].reverse().find((c) => c.recoil != null);
  const res = G.pressing ? null : G.depth;
  mRec.set(res == null ? 0.5 : 1 - clamp(res / 2, 0, 1), res == null ? 'basılıyor…' : res < 0.5 ? 'tam ✓' : `${fmt(res, 1)} cm kaldı`);
  mRec.color(lastRec && lastRec.recoil === false ? 'var(--warn)' : 'var(--good)');
  const inSession = ['cpr', 'breaths', 'aed', 'done'].includes(G.phase);
  mTime.set(inSession ? G.t / SESSION : 0, inSession ? `${fmt(Math.min(G.t, SESSION))} / ${SESSION} sn` : 'başlamadı');
  stCount.set(G.phase === 'cpr' || G.phase === 'breaths' ? G.cycle : 0);
  stTotal.set(cs.length);
}

sim.formatTime = () => (['cpr', 'breaths', 'aed'].includes(G.phase) ? `CPR ${fmt(Math.min(G.t, SESSION))} sn` : 'Hazır');
sim.onReset(() => {
  demo.on = false; G.pressing = false; G.depth = 0; G.rise = 0;
  aed.visible = false; pads.forEach((p) => (p.visible = false));
  depthChart.clear();
  showIntro();
});
showIntro();
void lerp;
