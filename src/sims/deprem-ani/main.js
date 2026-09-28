// Deprem Anı Simülatörü — dört odada sarsıntı anı kararları, düşen eşyalar ve AFAD önerilerine dayalı geri bildirim.
import { createSim, THREE, clamp, rand, fmt, disposeObject, smoothstep, instanced, mat, makePerson } from '@core';
import { buildRoom, ROOMS, W, D } from './rooms.js';
import { buildOutside } from './outside.js';
import { floorMirror } from './mirror.js';

const LOW = new URLSearchParams(location.search).has('low') || matchMedia('(pointer: coarse)').matches;
const CAM = { position: [1.35, 2.02, 4.7], target: [-0.15, 0.95, -1.1] };
const sim = createSim({
  // Gerçek gökyüzü: güneş arka duvardaki pencereden içeri girer (gölgeli ışık lekesi), dışarıda kent ve bahçe
  sky: { elevation: 21, azimuth: 336, clouds: 0.3, haze: 1.1, visibility: 5000, wind: [5, 2] },
  shadows: true,
  camera: { ...CAM, fov: 46, near: 0.05, far: 12000 },
  // Kamera odanın açık (kesit) tarafında, eşikte; tavanın altında kalacak şekilde sınırlı
  controls: { minDistance: 2.6, maxDistance: 6.2, minPolarAngle: 1.25, maxPolarAngle: 1.62, minAzimuthAngle: -0.55, maxAzimuthAngle: 0.6, enablePan: false },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Bir apartmanın 2. katındaki oda; kamera odanın kesit tarafında, eşikte duruyor ve içinde sen varsın. Sarsıntı başlayınca birkaç saniye içinde nereye gideceğine
    karar vermelisin. Seçenekleri üstteki düğmelerden ya da odadaki etiketlere / eşyalara tıklayarak seçebilirsin.
    Sarsıntıda sabitlenmemiş dolaplar devrilir, raflardaki eşyalar düşer, camlar kırılabilir, avize sallanır.</p>
    <h3>Dene</h3>
    <ul>
      <li>Dört turu da oyna: salon, sınıf, mutfak ve gece yatak odası. Her odada en güvenli yer farklıdır.</li>
      <li>"Hazırlık" bölümünde eşyaları duvara sabitle ve aynı turu tekrar oyna: kitaplık, gardırop ve buzdolabı artık devrilmez.</li>
      <li>Karar süresini kısalt: gerçek depremde düşünmeye vakit yoktur, doğru davranış alışkanlık olmalıdır.</li>
    </ul>
    <h3>Gerçek hayatta (AFAD önerileri)</h3>
    <ul>
      <li><b>Çök – Kapan – Tutun:</b> Sağlam bir masanın altına çök, bir elinle başını ve enseni koru, diğer elinle masanın ayağını tut.
        Masa yoksa pencere ve devrilebilecek eşyalardan uzak bir iç duvarın dibinde çök, başını-enseni koru.</li>
      <li>Sarsıntı sırasında koşma, merdivene, balkona, asansöre yönelme; pencerelerden uzak dur. Yataktaysan yatakta kal, başını yastıkla koru.</li>
      <li>Sarsıntı bitince: ayakkabını giy, gaz vanasını ve elektriği kapat, deprem çantanı al, asansör değil merdiveni kullan,
        binalardan uzak dur ve toplanma alanına git. Gaz kokusu varsa çakmak yakma, elektrik düğmelerine dokunma.</li>
      <li>Önceden hazırlan: dolapları ve ağır eşyaları duvara sabitle, deprem çantası hazırla, aile afet planı yap,
        en yakın toplanma alanını (e-Devlet / AFAD) öğren. Acil durumda <b>112</b>'yi ara.</li>
    </ul>
    <p><small>Eşya hareketleri basitleştirilmiş bir fizik modeliyle canlandırılır; sonuç ekranları resmî önerilere dayanır.</small></p>`,
});

const ROUND_N = ROOMS.length;
const SHAKE_DUR = 13; // sn

// --- Sahne kökü: sarsılan grup ---
const shaker = new THREE.Group();
sim.scene.add(shaker);

// Dış dünya (bir kez): bahçe, cadde, karşı apartmanlar, tepeler — oda ile birlikte sarsılır
const outside = buildOutside({ low: LOW });
shaker.add(outside.group);
const mirror = floorMirror(sim, { scale: LOW ? 0.4 : 0.5 });

// İç mekân ortam ışığı: gökyüzü ışığı odaya yalnız pencereden girer; iç yüzeylerde ortam yansıması kısılır,
// pozlama iç mekâna göre açılır (dışarısı fotoğraftaki gibi parlak kalır). Gece: loş mavimsi ay ışığı ortamı.
// Gece ortamı: loş, mavimsi ay ışığı odası (stüdyo 'night' ışık kutularıyla aynı düzen). Açılışta BİR kez ve gökyüzü
// ortamıyla aynı küp boyunda (64) pişirilir: gece turuna geçişte yeni PMREM üretilmez, oda malzemeleri yeniden derlenmez.
const NIGHT_ENV = (() => {
  const env = new THREE.Scene(), f = 0.35 * 0.45;
  const cool = new THREE.Color(0.86, 0.93, 1), warm = new THREE.Color(1, 0.93, 0.84), white = new THREE.Color(1, 1, 1);
  const tint = (w) => white.clone().lerp(w > 0 ? warm : cool, Math.abs(w));
  env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 20, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.027, 0.027, 0.03), side: THREE.BackSide })));
  env.children[0].position.y = 8;
  const panel = (w, h, x, y, z, ry, rx, e, col) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(e), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m);
  };
  panel(14, 10, 0, 17.9, 0, 0, Math.PI / 2, 3.2 * f, tint(-0.15));
  panel(3, 14, -19.9, 7, 0, Math.PI / 2, 0, 2.2 * f, tint(-0.6));
  panel(3, 14, 19.9, 7, 4, -Math.PI / 2, 0, 1.6 * f, tint(0.7));
  panel(18, 6, 0, 5, -19.9, 0, 0, 0.9 * f, tint(0));
  panel(40, 40, 0, -1.9, 0, 0, -Math.PI / 2, 0.22 * f, new THREE.Color(0x2a2f45));
  const pm = new THREE.PMREMGenerator(sim.renderer);
  const tex = pm.fromScene(env, 0.035, 0.1, 100, { size: 64 }).texture;
  pm.dispose();
  env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
})();
// Başucu lambası ışığı sahnede HEP vardır (gündüz odalarında kısık): ışık sayısı değişince tüm sahne (kent dahil)
// yeniden derlenir — yazılım WebGL'de gece turunun belleği taşırmasının ana nedeni buydu.
const nightLamp = new THREE.PointLight(0xffb866, 0, 7, 2);
nightLamp.position.set(0, -50, 0);
shaker.add(nightLamp);
// Güneşli döşemeden sekip tavana/üst duvarlara çarpan ılık dolgu ışığı (yalnız aşağıdan: yarıküre ışığının 'zemin' rengi)
const bounce = new THREE.HemisphereLight(0x000000, 0xd9c4a6, 0);
sim.scene.add(bounce);
const skyExposure = sim.sky.exposure.bind(sim.sky);
const IN_ENV = { day: 0.6, night: 1.9 };
let roomMats = [], envSeen = null, isNight = false;
function setMood(def) {
  isNight = !!def.night;
  sim.sky.set(def.sky);
  outside.setLit(isNight ? 1 : 0);
  bounce.intensity = isNight ? 0.06 : 0.8;
  sim.sky.exposure = () => (isNight ? 1.7 : skyExposure() * 1.7);   // gündüz: güneşli parke patlamasın (1,85 → 1,7)
  envSeen = null;
}
function collectRoomMats() {
  const set = new Set();
  room.group.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m && (m.isMeshStandardMaterial) && !m.userData.fullEnv) set.add(m);
  });
  for (const m of person.crowd.materials) if (m && m.isMeshStandardMaterial) set.add(m);   // figür de iç mekân ortamıyla aydınlansın
  roomMats = [...set];
  envSeen = null;
}
sim.onRender(() => {
  if (!room) return;
  const env = isNight ? NIGHT_ENV : sim.scene.environment;
  if (env && env !== envSeen) {
    envSeen = env;
    for (const m of roomMats) { m.envMap = env; m.envMapIntensity = isNight ? IN_ENV.night : IN_ENV.day; }
  }
  // Kent karoları ayrıntıyı tembel üretir: yeni parçalar gölge çerçevesini büyütmesin
  if (sim.frame % 45 === 0) outside.group.traverse((o) => { if (o.isMesh) o.userData.noFit = true; });
  outside.update(performance.now() / 1000, 0.5);
  mirror.render(isNight ? null : room.floorAnchor, room.floor);   // gece: ayna zemin kapalı (ek sahne çizimi yok)
});

// --- Karakter ("Sen"): motorun eklemli insan figürü (@core makePerson; yüz, eller, giysi, poz iskeleti) ---
// Orijin ayak tabanı ortası, yaw 0 → +z'ye bakar. Oturma yüksekliği her odanın başlangıcında (start.seat) verilir.
const avatar = new THREE.Group();
const person = makePerson({ seed: 7, sex: 'm', height: 1.66, build: 0.95, outfit: 'casual', sleeves: 'short', pose: 'sit', seat: 0.43,
  skin: 0xd9a27e, hair: { style: 'short', color: 0x2e1f16 }, colors: { top: 0xd9621e, bottom: 0x2b3f66, shoe: 0xeeeeee } });
avatar.add(person);
{
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 32), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.visible = false;
  avatar.add(ring);
  avatar.userData.ring = ring;
}
const youLabel = sim.label('Sen', { parent: avatar, position: [0, 1.95, 0], className: 'plain' });
sim.onRender(() => person.update(performance.now() / 1000));   // nefes, baş hareketi, koşu döngüsü (duraklatılsa da canlı)

// Oyun pozu → figür pozu; y: gövde kökünün yüksekliği (yatak), lab: "Sen" etiketinin yüksekliği
const POSES = {
  stand: { fig: 'stand', y: 0, lab: 1.95 },
  sit: { fig: 'sit', y: 0, lab: 1.55 },
  crouch: { fig: 'crouch', y: 0, lab: 1.4 },
  lie: { fig: 'lie', y: 0.69, lab: 0.7 },     // yorgan üstü (0,65) + figürün sırt payı; baş −x'te yastığa
  pillow: { fig: 'lie', y: 0.69, lab: 0.7 },
  gone: { fig: 'stand', y: 0, lab: 1.95 },
};
const RUN_SPEED = 2.6;   // m/s — yolu izleme hızı (koşu adımı yerinde, ayak kaymaz)
const av = { x: 0, z: 0, path: [], pose: 'stand', cur: { y: 0, lab: 1.95 }, gone: false, facing: 0, yaw: 0, fig: '', seat: 0.43, faceTo: null };

function setFig(p) {
  if (p === av.fig) return;
  av.fig = p;
  person.setPose(p, av.seat);
  person.crowd.speed(0, p === 'run' ? RUN_SPEED : 0);
}

function placeAvatar(pos, pose, yaw = Math.PI, seat = 0.43) {
  av.x = pos[0]; av.z = pos[1]; av.path = []; av.pose = pose; av.gone = false;
  av.facing = av.yaw = yaw; av.seat = seat; av.fig = ''; av.faceTo = null;
  av.cur.y = POSES[pose].y; av.cur.lab = POSES[pose].lab;
  setFig(POSES[pose].fig);
  avatar.visible = true;
  avatar.userData.ring.visible = false;
  youLabel.visible = true;
}

function updateAvatar(dt) {
  const moving = av.path.length > 0;
  if (moving) {
    const [tx, tz] = av.path[0];
    const dx = tx - av.x, dz = tz - av.z, d = Math.hypot(dx, dz), step = RUN_SPEED * dt;
    if (d > 1e-4) av.facing = Math.atan2(dx, dz);
    if (d <= step) { av.x = tx; av.z = tz; av.path.shift(); }
    else { av.x += (dx / d) * step; av.z += (dz / d) * step; }
    if (!av.path.length && av.pose === 'gone') av.gone = true;
    // Varış: çömelme/masa yanında gidilen noktaya dönük kal; sadece masa hedefleri (fig) kendi yönünü verir
    if (!av.path.length && av.faceTo != null) av.facing = av.faceTo;
  }
  const tgt = POSES[moving ? 'stand' : av.pose];
  setFig(moving ? 'run' : tgt.fig);
  const k = 1 - Math.exp(-dt * 10);
  av.cur.y += (tgt.y - av.cur.y) * k;
  av.cur.lab += (tgt.lab - av.cur.lab) * k;
  // Yatarken baş −x'e (yastığa); diğer pozlarda gidiş yönü — en kısa yoldan yumuşak dönüş
  const want = !moving && tgt.fig === 'lie' ? Math.PI / 2 : av.facing;
  let dy = want - av.yaw;
  dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  av.yaw += dy * (1 - Math.exp(-dt * 12));
  avatar.position.set(av.x, av.cur.y, av.z);
  person.rotation.y = av.yaw;
  youLabel.position.y = av.cur.lab;
  avatar.visible = !av.gone;
  youLabel.visible = !av.gone && phase !== 'final';
}

// --- Kırık cam parçaları ---
const SHARDS = 60;
const shardMesh = instanced(new THREE.CircleGeometry(0.07, 3), new THREE.MeshStandardMaterial({ color: 0xe8f6ff, roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide }), SHARDS);
shardMesh.frustumCulled = false;
const shards = Array.from({ length: SHARDS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), on: false }));
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
let shardNext = 0;
function hideShards() {
  shards.forEach((s) => (s.on = false));
  _m.makeScale(0, 0, 0);
  for (let i = 0; i < SHARDS; i++) shardMesh.setMatrixAt(i, _m);
  shardMesh.instanceMatrix.needsUpdate = true;
}

// --- Oyun durumu ---
let room = null;               // buildRoom çıktısı
let roundIdx = 0;
let phase = 'intro';           // intro | calm | shake | outcome | feedback | final
let phaseT = 0, shakeT = 0, shakeEnd = SHAKE_DUR;
let chosen = null, chooseT = 0, timedOut = false;
let results = new Array(ROUND_N).fill(null);
let spotLabels = [];
let postOrder = [];

function hud(html, tone = '') { sim.hud.show(html, { tone }); return sim.hud.el; }
const btnStyle = 'font-size:13.5px;padding:7px 11px;margin:3px;text-align:left;max-width:100%';

function loadRoom(i) {
  if (room) { room.group.remove(avatar, shardMesh); disposeObject(room.group); }
  spotLabels = [];
  roundIdx = i;
  const def = ROOMS[i];
  room = buildRoom(def);
  if (!def.night) mirror.attach(room.floor.material, def.floor === 'wood' ? 1.3 : 1.0);
  nightLamp.intensity = room.nightLamp ? 2.6 : 0;
  if (room.nightLamp) nightLamp.position.fromArray(room.nightLamp); else nightLamp.position.set(0, -50, 0);
  shaker.add(room.group);
  room.group.add(shardMesh);
  room.group.add(avatar);
  hideShards();
  shaker.position.set(0, 0, 0);
  shaker.rotation.set(0, 0, 0);
  // Işık: gökyüzü (gün saati / gece), iç mekân ortamı
  setMood(def);
  collectRoomMats();
  sim.moveCamera(CAM.position, CAM.target);
  placeAvatar(def.start.pos, def.start.pose, def.start.yaw ?? Math.PI, def.start.seat ?? 0.43);
  for (const t of room.tall) { t.th = 0; t.om = 0; t.falling = false; t.fallAt = rand(3, 6); applyTall(t); }
  roundSel.set(def.key);
}

function startRound(i) {
  loadRoom(i);
  phase = 'intro'; phaseT = 0; shakeT = 0; chosen = null; timedOut = false;
  const def = ROOMS[i];
  const el = hud(`<h2 style="font-size:18px">Tur ${i + 1}/${ROUND_N} · ${def.icon} ${def.title}</h2>
    <p style="margin:2px 0 4px;font-size:14px">${def.intro}</p>
    <p style="margin:0;color:#94a3b8;font-size:12.5px">Önce odaya iyi bak (sürükleyerek çevirebilirsin): Sarsıntıda seni nerede korunursun, nereler tehlikeli?</p>
    <button class="btn primary" data-go>Hazırım ▶</button>`);
  el.querySelector('[data-go]').onclick = begin;
  updateStats();
}

function begin() {
  if (phase !== 'intro') return;
  phase = 'calm'; phaseT = 0;
  sim.hud.hide();
  sim.toast('🔔 Bir uğultu duyuluyor…', 'warn');
}

function startShake() {
  phase = 'shake'; shakeT = 0; shakeEnd = SHAKE_DUR;
  const def = ROOMS[roundIdx];
  const spots = [...def.spots].sort(() => Math.random() - 0.5);
  const el = hud(`<h2>⚠️ Deprem! Ne yapacaksın?</h2>
    <div style="height:8px;background:#334155;border-radius:4px;overflow:hidden;margin:4px 0 6px"><i data-bar style="display:block;height:100%;width:100%;background:#f59e0b"></i></div>
    <div style="display:flex;flex-wrap:wrap;justify-content:center">${spots.map((s) => `<button class="btn" style="${btnStyle}" data-k="${s.key}">${s.icon} ${s.text}</button>`).join('')}</div>`, 'warn');
  el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => choose(b.dataset.k)));
  // Odadaki tıklanabilir etiketler
  spots.forEach((s) => {
    const [x, z] = s.pos;
    const lp = s.pose === 'gone' ? [-3.75, 2.35, z] : z < -D ? [x, 2.4, -2.9] : [x, s.pose === 'pillow' ? 1.4 : 1.55, z];
    const lb = sim.label(`${s.icon} ${s.short}`, { parent: room.group, position: lp, className: 'clickable' });
    lb.el.onclick = (e) => { e.stopPropagation(); choose(s.key); };
    lb.el.onpointerdown = (e) => e.stopPropagation();
    spotLabels.push(lb);
  });
}

function clearSpotLabels() {
  for (const lb of spotLabels) disposeObject(lb);
  spotLabels = [];
}

function choose(key) {
  if (phase !== 'shake' || chosen || timedOut) return;
  const s = ROOMS[roundIdx].spots.find((x) => x.key === key);
  if (!s) return;
  chosen = s; chooseT = shakeT;
  shakeEnd = Math.max(SHAKE_DUR, chooseT + 4.5);
  clearSpotLabels();
  // Yol: kapıdan çıkış ve balkon için ara nokta
  const path = [];
  if (s.pos[0] < -W) path.push([-3.3, s.pos[1]]);
  if (s.pos[1] < -D) path.push([s.pos[0], -2.5]);
  if (av.pose === 'lie' && s.key !== 'yatak') path.push([av.x + 1.1, av.z + 0.2]);
  // Figürün duracağı yer: masa/sıra hedeflerinde (fig) masanın kenarında, dizler masanın altında çömelir
  // (1,66 m'lik figür 0,63 m'lik masa altı boşluğuna sığmaz; tabla içinden geçmesin). Diğer çömelmelerde yüz odaya dönük.
  const [fx, fz] = s.fig || s.pos;
  path.push([fx, fz]);
  av.faceTo = s.fig ? s.fig[2] : s.pose === 'crouch' ? Math.atan2(CAM.position[0] - fx, CAM.position[2] - fz) : null;
  if (!(s.pose === 'pillow' && av.pose === 'lie')) av.path = path;
  av.pose = s.pose;
  if (s.pose === 'pillow' && room.pillow) room.pillow.userData.toHead = true;
  hud(`<h2>${s.icon} ${s.text}</h2><p style="margin:2px 0 0">Kararını verdin (${fmt(chooseT, 1)} sn). Sarsıntı sürüyor, bekle…</p>`, 'warn');
}

function timeUp() {
  timedOut = true;
  clearSpotLabels();
  shakeEnd = Math.max(SHAKE_DUR, shakeT + 3);
  hud('<h2>⏱️ Süre doldu!</h2><p style="margin:2px 0 0">Karar veremedin ve olduğun yerde donup kaldın. Sarsıntı sürüyor…</p>', 'bad');
}

const VERDICT = {
  iyi: { t: '✅ Güvenli seçim!', tone: 'good', pts: 100, color: 0x22c55e },
  orta: { t: '🟡 İdare eder', tone: 'warn', pts: 50, color: 0xf59e0b },
  kötü: { t: '❌ Riskli seçim', tone: 'bad', pts: 0, color: 0xef4444 },
};

function outcome() {
  phase = 'outcome';
  const def = ROOMS[roundIdx];
  let v, why, bonus = 0;
  if (chosen) {
    v = VERDICT[chosen.verdict];
    why = chosen.why;
    if (chosen.tall) {
      const t = room.tall.find((x) => x.name === chosen.tall);
      if (t && t.th > 0.8) why = `<b>${t.name} devrildi!</b> ` + why;
    }
    if (chosen.verdict !== 'kötü') bonus = Math.round(20 * clamp(1 - chooseT / decision.value, 0, 1) * (chosen.verdict === 'iyi' ? 1 : 0.5));
  } else {
    v = VERDICT.kötü;
    why = 'Korkup donmak çok doğal bir tepkidir. Bu yüzden tatbikat yaparız: Ne yapacağını düşünemiyorsan <b>olduğun yerde hemen Çök-Kapan-Tutun</b>; başını ve enseni kollarınla koru.';
  }
  const ring = avatar.userData.ring;
  ring.visible = !av.gone;
  ring.material.color.setHex(v.color);
  results[roundIdx] = { verdict: chosen ? chosen.verdict : 'kötü', pts: v.pts + bonus, bonus, post: null, choice: chosen ? chosen.short : 'Donup kaldı' };
  const post = def.post;
  postOrder = post.options.map((o, i) => i).sort(() => Math.random() - 0.5);
  const el = hud(`<h2>${v.t}</h2>
    <p style="margin:2px 0 6px;text-align:left">${why}</p>
    ${bonus ? `<p style="margin:0 0 6px;color:#86efac">⚡ Hızlı karar bonusu: +${bonus}</p>` : ''}
    <hr style="border:none;border-top:1px solid #334155;margin:6px 0">
    <b>🟢 ${post.q}</b>
    <div style="display:flex;flex-direction:column;align-items:stretch;margin-top:4px">${postOrder.map((i) => `<button class="btn" style="${btnStyle}" data-p="${i}">${post.options[i].text}</button>`).join('')}</div>`, v.tone);
  el.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => answerPost(+b.dataset.p)));
  updateStats();
}

function answerPost(i) {
  if (phase !== 'outcome') return;
  phase = 'feedback';
  const o = ROOMS[roundIdx].post.options[i];
  const r = results[roundIdx];
  r.post = o.ok;
  if (o.ok) r.pts += 50;
  const last = roundIdx === ROUND_N - 1;
  const el = hud(`<h2>${o.ok ? '✅ Doğru!' : '❌ Yanlış'}</h2>
    <p style="margin:2px 0 6px;text-align:left">${o.why}</p>
    ${o.ok ? '' : `<p style="margin:0 0 6px;text-align:left;color:#86efac">Doğrusu: ${ROOMS[roundIdx].post.options.find((x) => x.ok).text}.</p>`}
    <p style="margin:0">Bu tur: <b>${r.pts}</b> / 170 puan</p>
    <button class="btn primary" data-next>${last ? 'Sonuçları gör 🏁' : 'Sonraki tur ▶'}</button>
    <button class="btn" data-again>⟲ Bu turu tekrar</button>`, o.ok ? 'good' : 'bad');
  el.querySelector('[data-next]').onclick = () => (last ? finale() : startRound(roundIdx + 1));
  el.querySelector('[data-again]').onclick = () => startRound(roundIdx);
  updateStats();
}

function finale() {
  phase = 'final';
  const total = results.reduce((a, r) => a + (r ? r.pts : 0), 0), max = ROUND_N * 170;
  const f = total / max;
  const stars = f >= 0.85 ? '⭐⭐⭐' : f >= 0.6 ? '⭐⭐' : f >= 0.3 ? '⭐' : '';
  const title = f >= 0.85 ? 'Deprem kahramanısın!' : f >= 0.6 ? 'Çok iyi gidiyorsun!' : 'Biraz daha tatbikat!';
  const rows = ROOMS.map((d, i) => {
    const r = results[i];
    return `<tr><td>${d.icon} ${d.title}</td><td>${r ? (r.verdict === 'iyi' ? '✅' : r.verdict === 'orta' ? '🟡' : '❌') + ' ' + r.choice : '—'}</td><td>${r ? (r.post ? '✅' : '❌') : '—'}</td><td style="text-align:right">${r ? r.pts : 0}</td></tr>`;
  }).join('');
  const el = hud(`<h2>🏁 ${title} ${stars}</h2>
    <p style="margin:0 0 6px">Toplam puan: <b>${total}</b> / ${max}</p>
    <table style="width:100%;font-size:13px;border-collapse:collapse;text-align:left">
      <tr style="color:#94a3b8"><td>Oda</td><td>Sarsıntıda</td><td>Sonra</td><td style="text-align:right">Puan</td></tr>${rows}</table>
    <p style="margin:8px 0 0;font-size:13px;text-align:left">🧠 Unutma: <b>Çök-Kapan-Tutun</b> · pencereden, dolaptan uzak dur · koşma, asansör ve balkon yok ·
    sarsıntı bitince gaz/elektrik kapat, merdivenle çık, toplanma alanına git.</p>
    <button class="btn primary" data-again>Tekrar oyna ⟲</button>`, f >= 0.6 ? 'good' : 'warn');
  el.querySelector('[data-again]').onclick = () => sim.reset();
  updateStats();
}

// --- Sarsıntı ve fizik ---
const G = 9.81;
const W1 = 2 * Math.PI * 1.4, W2 = 2 * Math.PI * 2.3, W3 = 2 * Math.PI * 1.1, W4 = 2 * Math.PI * 1.9;
function envelope(t) { return smoothstep(0, 1.2, t) * (1 - smoothstep(shakeEnd - 3.5, shakeEnd, t)) * (0.85 + 0.15 * Math.sin(t * 1.7)); }
const intensity = () => (level.value === 'guclu' ? 1 : 0.65);
const acc = { x: 0, z: 0 };

function stepPhysics(h, env) {
  const I = env * intensity(), A = 0.05 * I;
  const st = shakeT;
  acc.x = -A * (0.6 * W1 * W1 * Math.sin(W1 * st) + 0.4 * W2 * W2 * Math.sin(W2 * st + 1));
  acc.z = -A * (0.6 * W3 * W3 * Math.sin(W3 * st + 2) + 0.4 * W4 * W4 * Math.sin(W4 * st));
  const anchored = anchor.value;

  // Serbest eşyalar
  for (const o of room.loose) {
    if (o.state === 0) {
      if (I > o.thr && !(anchored && o.inCab) && Math.random() < h * 1.2) {
        o.state = 1;
        o.v.set(o.dir[0] * rand(0.8, 1.8) + rand(-0.3, 0.3), rand(0.3, 1.2), o.dir[2] * rand(0.8, 1.8) + rand(-0.3, 0.3));
        o.w.set(rand(-6, 6), rand(-4, 4), rand(-6, 6));
      } else if (I > 0.2) {
        // yerinde titreme
        o.mesh.position.x = o.home.x + Math.sin(st * 40 + o.thr * 50) * 0.006 * I;
      }
      continue;
    }
    if (o.state !== 1) continue;
    const p = o.mesh.position;
    o.v.y -= G * h;
    o.v.x -= acc.x * h * 0.3; o.v.z -= acc.z * h * 0.3;
    p.addScaledVector(o.v, h);
    o.mesh.rotation.x += o.w.x * h; o.mesh.rotation.y += o.w.y * h; o.mesh.rotation.z += o.w.z * h;
    if (p.y < o.half && !o.outside) {
      p.y = o.half;
      o.v.y = Math.abs(o.v.y) * 0.3;
      o.v.x *= 0.6; o.v.z *= 0.6; o.w.multiplyScalar(0.5);
      if (o.v.y < 0.4 && Math.hypot(o.v.x, o.v.z) < 0.3) {
        o.state = 2;
        o.mesh.rotation.x = Math.round(o.mesh.rotation.x / (Math.PI / 2)) * (Math.PI / 2);
        o.mesh.rotation.z = Math.round(o.mesh.rotation.z / (Math.PI / 2)) * (Math.PI / 2);
      }
    }
    // Balkondaki eşyalar dışarı düşebilir; oda içindekiler duvarlarda kalır
    if (p.z > -D && p.x > -W) { p.x = clamp(p.x, -W + 0.1, W - 0.1); p.z = clamp(p.z, -D + 0.1, D - 0.1); }
    else if (p.z < -D - 1.35) o.outside = true;
    if (p.y < -6) { o.state = 3; o.mesh.visible = false; }
  }

  // Uzun eşyalar: sabitli değilse devrilir (θ'' ≈ 3g/(2h)·sin θ)
  for (const t of room.tall) {
    if (!t.falling && !anchored && I > 0.6 && shakeT > t.fallAt) {
      t.falling = true; t.om = 0.4;
      for (const it of t.items) if (it.state === 0) { it.state = 1; it.v.set(it.dir[0] * 2, 0.5, it.dir[2] * 2); it.w.set(rand(-5, 5), 0, rand(-5, 5)); }
    }
    if (t.falling && t.th < t.maxA) {
      t.om += (1.5 * G / t.h) * Math.sin(t.th + 0.12) * h;
      t.th += t.om * h;
      if (t.th >= t.maxA) { t.th = t.maxA; t.om = 0; }
    } else if (!t.falling) {
      t.th = (anchored ? 0.004 : 0.02) * I * Math.sin(st * 9 + t.h);
    }
  }

  // Avize (sürülen sarkaç, küçük açı)
  for (const l of room.lamps) {
    const k = G / l.len, c = 0.4;
    l.vx += (-k * l.px - acc.x / l.len - c * l.vx) * h;
    l.vz += (-k * l.pz - acc.z / l.len - c * l.vz) * h;
    l.px = clamp(l.px + l.vx * h, -0.7, 0.7);
    l.pz = clamp(l.pz + l.vz * h, -0.7, 0.7);
  }

  // Cam parçaları
  for (const s of shards) {
    if (!s.on) continue;
    s.v.y -= G * h;
    s.p.addScaledVector(s.v, h);
    s.r.x += h * 8; s.r.y += h * 5;
    if (s.p.y < 0.01) { s.p.y = 0.01; s.v.set(0, 0, 0); s.r.x = -Math.PI / 2; s.r.y = 0; }
  }
}

function breakWindow(wi) {
  if (wi.broken) return;
  wi.broken = true;
  wi.pane.visible = false;
  for (let i = 0; i < 18; i++) {
    const s = shards[shardNext++ % SHARDS];
    s.on = true;
    s.p.set(wi.x + rand(-wi.w / 2, wi.w / 2), wi.y + rand(-wi.h / 2, wi.h / 2), wi.z + 0.05);
    s.v.set(rand(-0.6, 0.6), rand(0, 1), rand(0.8, 2.4));
    s.r.set(rand(0, 6), rand(0, 6), rand(0, 6));
  }
  sim.toast('💥 Pencere camı kırıldı!', 'bad');
}

function applyTall(t) {
  if (t.face === 'back') t.pivot.rotation.x = t.th; else t.pivot.rotation.z = -t.th;
}

let statTick = 0;
sim.onUpdate((dt) => {
  if (!room) return;
  phaseT += dt;
  if (phase === 'calm' && phaseT > 1.2) startShake();
  let env = 0;
  // Sabit alt adımlarla ilerlet (8× hızda da kararlı)
  const n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
  for (let i = 0; i < n; i++) {
    if (phase === 'shake') { shakeT += h; env = envelope(shakeT); }
    else env = 0;
    stepPhysics(h, env);
  }
  if (phase === 'shake') {
    const I = env * intensity();
    // Güçlü sarsıntıda camlar kırılır; pencere önünü seçen kişi camın hemen yanındadır
    if (I > 0.9 && shakeT > 3) room.windows.forEach((wi) => { if (!wi.broken && Math.random() < dt * 0.8) breakWindow(wi); });
    if (!chosen && !timedOut) {
      const left = decision.value - shakeT;
      const bar = sim.hud.el.querySelector('[data-bar]');
      if (bar) bar.style.width = clamp(left / decision.value, 0, 1) * 100 + '%';
      if (left <= 0) timeUp();
    }
    if (shakeT >= shakeEnd) outcome();
    // Ekran (oda) sarsılması
    const vis = (calmCam.value ? 0.3 : 1) * 0.05 * I;
    shaker.position.set(vis * (0.6 * Math.sin(W1 * shakeT) + 0.4 * Math.sin(W2 * shakeT + 1)), vis * 0.3 * Math.sin(W2 * 1.3 * shakeT),
      vis * (0.6 * Math.sin(W3 * shakeT + 2) + 0.4 * Math.sin(W4 * shakeT)));
    shaker.rotation.z = vis * 0.15 * Math.sin(W1 * shakeT + 0.5);
  } else {
    shaker.position.multiplyScalar(0.8);
    shaker.rotation.z *= 0.8;
  }
  // Görseller
  for (const t of room.tall) applyTall(t);
  for (const l of room.lamps) { l.pivot.rotation.z = l.px; l.pivot.rotation.x = -l.pz; }
  if (room.cabDoors) for (const c of room.cabDoors) {
    const I = env * intensity();
    const target = anchor.value ? 0 : I > 0.4 ? 0.9 + 0.4 * Math.sin(shakeT * 6 + c.g.position.x) : c.a;
    c.a += (target - c.a) * Math.min(1, dt * 6);
    c.g.rotation.y = -c.a;
  }
  if (room.door) room.door.rotation.y = -0.5 + (phase === 'shake' ? 0.35 * env * Math.sin(shakeT * 5) : 0);
  if (room.pillow?.userData.toHead) {
    const p = room.pillow.position;
    p.x += (av.x - 0.62 - p.x) * Math.min(1, dt * 5);   // figürün başı kalçadan ≈0,6 m −x'te
    p.y += (0.92 - p.y) * Math.min(1, dt * 5);
  }
  for (const [i, s] of shards.entries()) {
    if (s.on) { _q.setFromEuler(s.r); _m.compose(s.p, _q, _s); shardMesh.setMatrixAt(i, _m); }
  }
  shardMesh.instanceMatrix.needsUpdate = true;
  for (const o of room.loose) if (o.state === 1 || o.state === 2) o.mesh.matrixWorldNeedsUpdate = true;
  updateAvatar(dt);
  if (++statTick % 10 === 0) updateStats(env);
});

// Sahnede tıklama: en yakın seçenek (1,3 m içinde)
const _lp = new THREE.Vector3();
sim.onClick(() => (phase === 'shake' && room ? [room.group] : []), (hit) => {
  if (phase !== 'shake' || chosen || timedOut) return;
  _lp.copy(hit.point);
  room.group.worldToLocal(_lp);
  let best = null, bd = 1.3;
  for (const s of ROOMS[roundIdx].spots) {
    const [x, z] = s.pose === 'gone' ? [-3.9, s.pos[1]] : s.pos;
    const d = Math.hypot(x - _lp.x, z - _lp.z);
    if (d < bd) { bd = d; best = s; }
  }
  if (best) choose(best.key);
});

// --- Panel ---
const ui = sim.ui;
ui.section('Oyun');
const roundSel = ui.segmented({
  label: 'Oda / tur', options: ROOMS.map((r) => ({ value: r.key, label: `${r.icon} ${r.tab}` })),
  value: 'salon', onChange: (v) => startRound(ROOMS.findIndex((r) => r.key === v)),
});
ui.buttons([
  { label: '⟲ Baştan başla', variant: 'primary', onClick: () => sim.reset() },
  { label: '↻ Bu turu tekrar', onClick: () => startRound(roundIdx) },
]);
const stScore = ui.stat({ label: 'Toplam puan' });
const stRound = ui.stat({ label: 'Tur' });
const stSafe = ui.stat({ label: 'Güvenli karar' });
const stTime = ui.stat({ label: 'Karar süresi', unit: 'sn' });
const shakeMeter = ui.meter({ label: 'Sarsıntı şiddeti', color: 'linear-gradient(90deg,#22c55e,#f59e0b,#ef4444)' });

ui.section('Ayarlar');
const level = ui.segmented({ label: 'Deprem büyüklüğü', options: [{ value: 'orta', label: 'Orta' }, { value: 'guclu', label: 'Güçlü' }], value: 'guclu' });
const decision = ui.slider({ label: 'Karar süresi', min: 3, max: 12, step: 1, value: 7, unit: 'sn' });
const calmCam = ui.toggle({ label: 'Ekran sallanmasını azalt', value: false });

ui.section('Hazırlık (deprem öncesi)');
const anchor = ui.toggle({ label: 'Dolaplar, TV ve buzdolabı duvara sabitli; dolap kapaklarında mandal var', value: false });
ui.text('Deprem gelmeden yapılan hazırlık hayat kurtarır: Ağır eşyaları duvara sabitle, yatağını pencere ve dolap yanına koyma, deprem çantanı hazırla, ailecek buluşma yeri belirle.', 'card');

ui.section('Hatırla: Çök – Kapan – Tutun');
ui.text(`<b>1. ÇÖK</b> — Dizlerinin üzerine çök, sarsıntıda yere düşmezsin.<br>
  <b>2. KAPAN</b> — Sağlam bir masanın altına gir; başını ve enseni kollarınla koru.<br>
  <b>3. TUTUN</b> — Masanın ayağını sıkıca tut, sarsıntı bitene kadar bekle.`, 'good');

function updateStats(env = 0) {
  const total = results.reduce((a, r) => a + (r ? r.pts : 0), 0);
  stScore.set(total, total > 0 ? 'good' : '');
  stRound.set(`${roundIdx + 1}/${ROUND_N}`);
  const safe = results.filter((r) => r && r.verdict === 'iyi').length;
  stSafe.set(`${safe}/${results.filter(Boolean).length}`);
  const r = results[roundIdx];
  if (phase === 'shake' && !chosen) stTime.set(fmt(shakeT, 1), shakeT > decision.value * 0.7 ? 'warn' : '');
  else if (chosen) stTime.set(fmt(chooseT, 1), r && r.verdict === 'iyi' ? 'good' : '');
  const I = env * intensity();
  shakeMeter.set(I, I < 0.05 ? 'yok' : I < 0.5 ? 'hafif' : I < 0.8 ? 'kuvvetli' : 'çok kuvvetli');
}

sim.formatTime = () => (phase === 'shake' ? `Sarsıntı ${fmt(shakeT, 1)} sn` : ROOMS[roundIdx].title);
sim.onReset(() => { results = new Array(ROUND_N).fill(null); startRound(0); });
startRound(0);
