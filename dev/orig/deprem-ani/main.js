// Deprem Anı Simülatörü — dört odada sarsıntı anı kararları, düşen eşyalar ve AFAD önerilerine dayalı geri bildirim.
import { createSim, THREE, clamp, rand, fmt, disposeObject, smoothstep, instanced } from '@core';
import { buildRoom, ROOMS, W, D } from './rooms.js';

const sim = createSim({
  background: 0x1b2233,
  camera: { position: [6.4, 7.4, 8.8], target: [-0.3, 0.5, -0.4], fov: 44 },
  controls: { minDistance: 6, maxDistance: 17, maxPolarAngle: 1.3, minPolarAngle: 0.35, minAzimuthAngle: 0.08, maxAzimuthAngle: 1.45, enablePan: false },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Kesitli bir oda (bebek evi gibi) ve içinde sen varsın. Sarsıntı başlayınca birkaç saniye içinde nereye gideceğine
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
const ambient = new THREE.AmbientLight(0xffffff, 0.35);
sim.scene.add(ambient);

// --- Çocuk karakter ---
const avatar = new THREE.Group();
{
  const shirt = new THREE.MeshLambertMaterial({ color: 0xf97316 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xf2c29b });
  const pants = new THREE.MeshLambertMaterial({ color: 0x1e3a8a });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.3, 4, 12), shirt);
  body.position.y = 0.72;
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.3, 4, 10), pants);
  legs.position.y = 0.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 14), skin);
  head.position.y = 1.1;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3f2a1d }));
  hair.position.y = 1.12;
  avatar.add(legs, body, head, hair);
  avatar.userData.arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.21, 0.9, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 4, 8), shirt);
    arm.position.y = -0.18;
    sh.add(arm);
    avatar.add(sh);
    return sh;
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 32), new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  ring.visible = false;
  avatar.add(ring);
  avatar.userData.ring = ring;
}
const youLabel = sim.label('Sen', { parent: avatar, position: [0, 1.45, 0], className: 'plain' });

const POSES = {
  stand: { y: 0, sy: 1, rz: 0, arm: 0.08, dx: 0 },
  sit: { y: 0.18, sy: 0.82, rz: 0, arm: 0.5, dx: 0 },
  crouch: { y: 0, sy: 0.55, rz: 0, arm: 2.7, dx: 0 },
  lie: { y: 0.66, sy: 1, rz: Math.PI / 2, arm: 0.1, dx: 0.62 },
  pillow: { y: 0.66, sy: 1, rz: Math.PI / 2, arm: 2.6, dx: 0.62 },
  gone: { y: 0, sy: 1, rz: 0, arm: 0.08, dx: 0 },
};
const av = { x: 0, z: 0, path: [], pose: 'stand', cur: { ...POSES.stand }, gone: false, facing: 0 };

function placeAvatar(pos, pose) {
  av.x = pos[0]; av.z = pos[1]; av.path = []; av.pose = pose; av.gone = false;
  Object.assign(av.cur, POSES[pose]);
  avatar.visible = true;
  avatar.userData.ring.visible = false;
  youLabel.visible = true;
}

function updateAvatar(dt) {
  const moving = av.path.length > 0;
  if (moving) {
    const [tx, tz] = av.path[0];
    const dx = tx - av.x, dz = tz - av.z, d = Math.hypot(dx, dz), step = 2.6 * dt;
    av.facing = Math.atan2(dx, dz);
    if (d <= step) { av.x = tx; av.z = tz; av.path.shift(); }
    else { av.x += (dx / d) * step; av.z += (dz / d) * step; }
    if (!av.path.length && av.pose === 'gone') av.gone = true;
  }
  const tgt = POSES[moving ? 'stand' : av.pose];
  const k = 1 - Math.exp(-dt * 10);
  for (const key of ['y', 'sy', 'rz', 'arm', 'dx']) av.cur[key] += (tgt[key] - av.cur[key]) * k;
  avatar.position.set(av.x + av.cur.dx, av.cur.y, av.z);
  avatar.scale.set(1, av.cur.sy, 1);
  avatar.rotation.set(0, av.cur.rz > 0.3 ? 0 : av.facing, av.cur.rz);
  const [l, r] = avatar.userData.arms;
  const walk = moving ? Math.sin(sim.time * 14) * 0.5 : 0;
  l.rotation.z = -av.cur.arm; r.rotation.z = av.cur.arm;
  l.rotation.x = walk; r.rotation.x = -walk;
  avatar.visible = !av.gone;
  youLabel.visible = !av.gone && phase !== 'final';
}

// --- Kırık cam parçaları ---
const SHARDS = 60;
const shardMesh = instanced(new THREE.CircleGeometry(0.07, 3), new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide }), SHARDS);
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
  shaker.add(room.group);
  room.group.add(shardMesh);
  room.group.add(avatar);
  hideShards();
  shaker.position.set(0, 0, 0);
  shaker.rotation.set(0, 0, 0);
  // Işık: gece karanlık ve mavimsi
  const { hemi, sun } = sim.scene.userData;
  sim.scene.background.setHex(def.night ? 0x0a0f1f : 0x1b2233);
  hemi.intensity = def.night ? 0.35 : 1.4;
  hemi.color.setHex(def.night ? 0x8090c0 : 0xdfe8ff);
  sun.intensity = def.night ? 0.45 : 2.2;
  sun.color.setHex(def.night ? 0x9fb4ff : 0xffffff);
  ambient.intensity = def.night ? 0.2 : 0.35;
  placeAvatar(def.start.pos, def.start.pose);
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
  path.push(s.pos);
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
    p.x += (av.x - 0.45 - p.x) * Math.min(1, dt * 5);
    p.y += (0.86 - p.y) * Math.min(1, dt * 5);
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
