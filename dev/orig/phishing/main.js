// Oltalama (Phishing) Avcısı — 3B masada e-posta istemcisi; güvenli/oltalama kararı ve ipuçlarının vurgulanması.
import { createSim, THREE, fmt, textPlane, RoundedBoxGeometry, instanced } from '@core';
import { EMAILS, CLUE } from './emails.js';

const sim = createSim({
  background: 0x121a2a,
  camera: { position: [0, 1.04, 0.85], target: [0, 1.0, -0.2], fov: 40, near: 0.01 },
  controls: { minDistance: 0.4, maxDistance: 2.6, maxPolarAngle: Math.PI * 0.6, minAzimuthAngle: -1.1, maxAzimuthAngle: 1.1 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Masandaki bilgisayara e-postalar geliyor. Bazıları gerçek, bazıları seni kandırıp şifreni, kart bilgini ya da
    paranı almaya çalışan <b>oltalama</b> (phishing) e-postaları. Her birini inceleyip <b>Güvenli</b> ya da <b>Oltalama</b> olarak işaretle;
    ardından ipuçları ekranda numaralarla gösterilir.</p>
    <h3>Dene</h3>
    <ul>
      <li>Bağlantıların <b>üzerine gel</b> (dokunmatikte dokun): alttaki durum çubuğunda ve ipucu kutusunda gerçek adres görünür.</li>
      <li>Gönderen adresinde harf oyunlarına bak: <i>anadoIudijital</i> (büyük i), <i>bulutkasa.com-destek.info</i>.</li>
      <li>Alan adında belirleyici olan <b>en sondaki</b> kısımdır: <i>x.com.tr.ornek.net</i> aslında <i>ornek.net</i>'tir.</li>
      <li>Zor seviyede süre sınırı var: acele ettirilmek oltalamacıların en sevdiği yöntemdir.</li>
    </ul>
    <h3>Gerçek hayatta</h3>
    <p>Şüpheli bir mesajda bağlantıya tıklama, ek açma; kurumu <b>resmî numarasından</b> kendin ara. Bankalar ve kurumlar
    şifre, kart CVV'si ya da SMS/OTP kodu istemez. Oltalama girişimlerini kurumunun BT ekibine ve <b>USOM</b>'a bildirebilirsin.
    Şifreni girdiysen hemen değiştir, bankana haber ver.</p>
    <p><small>Buradaki tüm marka, kişi ve alan adları kurgusaldır.</small></p>`,
});

// ---------- Oda ve masa ----------
const S = sim.scene;
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a2f2a, roughness: 0.9 }));
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(8, 4), new THREE.MeshStandardMaterial({ color: 0x243047, roughness: 1 }));
  wall.position.set(0, 2, -0.62);
  S.add(floor, wall);
  // Pencere
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ color: 0x7fb4e6 }));
  win.position.set(-1.05, 1.55, -0.61);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.68, 0.02), new THREE.MeshStandardMaterial({ color: 0xe5e7eb }));
  frame.position.set(-1.05, 1.55, -0.615);
  S.add(frame, win);
  // Poster
  const poster = textPlane('DUR · DÜŞÜN · SONRA TIKLA', 0.07, { color: '#fde68a', bg: '#7f1d1d' });
  poster.position.set(0.95, 1.62, -0.6);
  S.add(poster);
  const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.85), wood);
  top.position.set(0, 0.725, -0.12);
  S.add(top);
  for (const [x, z] of [[-0.8, -0.5], [0.8, -0.5], [-0.8, 0.26], [0.8, 0.26]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), wood);
    leg.position.set(x, 0.35, z);
    S.add(leg);
  }
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5, metalness: 0.3 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.015, 0.18), dark);
  base.position.set(0, 0.757, -0.24);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.03), dark);
  neck.position.set(0, 0.86, -0.25);
  const bezel = new THREE.Mesh(new RoundedBoxGeometry(0.69, 0.45, 0.03, 4, 0.012), new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 }));
  bezel.position.set(0, 1.1, -0.215);
  S.add(base, neck, bezel);
  // Klavye ve tuşlar
  const kb = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.018, 0.15), new THREE.MeshStandardMaterial({ color: 0x374151 }));
  kb.position.set(0, 0.758, 0.06);
  S.add(kb);
  const keys = instanced(new THREE.BoxGeometry(0.024, 0.008, 0.024), new THREE.MeshStandardMaterial({ color: 0xd1d5db }), 60);
  const d = new THREE.Object3D();
  let n = 0;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 15; c++) {
    d.position.set(-0.203 + c * 0.029, 0.771, 0.013 + r * 0.031);
    d.updateMatrix();
    keys.setMatrixAt(n++, d.matrix);
  }
  S.add(keys);
  const mouse = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10), new THREE.MeshStandardMaterial({ color: 0xe5e7eb }));
  mouse.scale.set(0.9, 0.45, 1.4);
  mouse.position.set(0.34, 0.765, 0.07);
  S.add(mouse);
  // Kupa ve bitki
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 20), new THREE.MeshStandardMaterial({ color: 0xdc2626 }));
  mug.position.set(-0.52, 0.8, -0.02);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xc2410c }));
  pot.position.set(0.62, 0.8, -0.3);
  S.add(mug, pot);
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0x16a34a }));
    leaf.position.set(0.62 + Math.cos(i) * 0.04, 0.9 + (i % 3) * 0.04, -0.3 + Math.sin(i * 2) * 0.04);
    S.add(leaf);
  }
  // Monitöre yapışık not
  const note = textPlane('Şifre ve kod paylaşılmaz!', 0.022, { color: '#1f2937', bg: '#fde047' });
  note.position.set(0.3, 0.9, -0.198);
  note.rotation.z = -0.06;
  S.add(note);
}

// ---------- Ekran (CanvasTexture) ----------
const CW = 1024, CH = 640;
const cv = document.createElement('canvas');
cv.width = CW; cv.height = CH;
const g = cv.getContext('2d');
const tex = new THREE.CanvasTexture(cv);
tex.colorSpace = THREE.SRGBColorSpace;
tex.anisotropy = sim.renderer.capabilities.getMaxAnisotropy();
const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.4), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
screen.position.set(0, 1.1, -0.199);
S.add(screen);

// Olta iğnesi: oltalama ortaya çıkınca ekranın önüne iner
const hook = new THREE.Group();
{
  const m = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.8, roughness: 0.25 });
  const line = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 1.2, 6), new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }));
  line.position.y = 0.6;
  const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 8), m);
  shank.position.y = -0.04;
  const bend = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 8, 24, Math.PI * 1.3), m);
  bend.position.set(0.025, -0.08, 0);
  bend.rotation.z = Math.PI;
  hook.add(line, shank, bend);
}
hook.position.set(0.22, 1.9, -0.12);
S.add(hook);
let hookY = 1.9;

// HUD bu simülasyonda altta dursun: e-postanın başlığını örtmesin
sim.hud.el.style.top = 'auto';
sim.hud.el.style.bottom = '60px';
sim.hud.el.style.width = 'min(520px, 92%)';

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
function rr(x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function wrap(text, maxW) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

let regions = {};
function drawEmail(em, { revealed = false, hover = -1, idx = 0, total = 0 } = {}) {
  regions = {};
  g.fillStyle = '#f8fafc'; g.fillRect(0, 0, CW, CH);
  // Başlık çubuğu
  g.fillStyle = '#1e293b'; g.fillRect(0, 0, CW, 44);
  ['#ef4444', '#f59e0b', '#22c55e'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(22 + i * 22, 22, 7, 0, 7); g.fill(); });
  g.fillStyle = '#e2e8f0'; g.font = `600 20px ${FONT}`; g.textBaseline = 'middle';
  g.fillText('e-Posta · Gelen Kutusu', 100, 23);
  if (total) { g.textAlign = 'right'; g.fillText(`${idx + 1} / ${total}`, CW - 18, 23); g.textAlign = 'left'; }
  // Kenar çubuğu
  g.fillStyle = '#e2e8f0'; g.fillRect(0, 44, 150, CH - 80);
  g.font = `500 18px ${FONT}`;
  ['📥 Gelen', '📤 Giden', '📝 Taslak', '⚠️ Spam', '🗑️ Çöp'].forEach((f, i) => {
    if (!i) { g.fillStyle = '#bfdbfe'; g.fillRect(0, 60, 150, 38); }
    g.fillStyle = '#1e293b'; g.fillText(f, 16, 79 + i * 44);
  });
  if (!em) {
    g.fillStyle = '#334155'; g.font = `600 30px ${FONT}`;
    g.fillText('Oltalama Avcısı', 190, 150);
    g.font = `400 22px ${FONT}`; g.fillStyle = '#475569';
    ['Zorluk seç ve başla.', 'Her e-postada gönderen adresine, bağlantıların', 'gerçek adresine ve eklere dikkat et.'].forEach((l, i) => g.fillText(l, 190, 200 + i * 34));
    statusBar('Hazır');
    tex.needsUpdate = true;
    return;
  }
  const X0 = 172, MW = CW - X0 - 28;
  let y = 84;
  g.fillStyle = '#0f172a'; g.font = `700 30px ${FONT}`;
  g.fillText(em.subject, X0, y);
  regions.subject = [X0 - 6, y - 22, Math.min(MW, g.measureText(em.subject).width + 12), 44];
  y += 50;
  // Gönderen
  g.fillStyle = em.phish && revealed ? '#fecaca' : '#c7d2fe';
  g.beginPath(); g.arc(X0 + 20, y + 12, 20, 0, 7); g.fill();
  g.fillStyle = '#1e1b4b'; g.font = `700 20px ${FONT}`; g.textAlign = 'center';
  g.fillText(em.fromName[0], X0 + 20, y + 13); g.textAlign = 'left';
  g.fillStyle = '#0f172a'; g.font = `700 22px ${FONT}`;
  g.fillText(em.fromName, X0 + 52, y);
  const nw = g.measureText(em.fromName).width;
  g.fillStyle = '#475569'; g.font = `400 20px ${FONT}`;
  const addr = `<${em.fromAddr}>`;
  g.fillText(addr, X0 + 52, y + 27);
  regions.from = [X0 + 46, y - 16, Math.max(nw, g.measureText(addr).width) + 14, 58];
  g.textAlign = 'right'; g.fillStyle = '#64748b'; g.font = `400 18px ${FONT}`;
  g.fillText(em.date, CW - 28, y); g.textAlign = 'left';
  y += 58;
  g.fillStyle = '#64748b'; g.font = `400 18px ${FONT}`;
  g.fillText('Kime: deniz.kaya@ornekas.com.tr', X0, y);
  y += 18;
  g.fillStyle = '#cbd5e1'; g.fillRect(X0, y, MW, 2);
  y += 34;
  // Gövde
  g.font = `400 25px ${FONT}`; g.fillStyle = '#1e293b';
  em.body.forEach((p, i) => {
    const lines = wrap(p, MW);
    const y0 = y;
    lines.forEach((l) => { g.fillText(l, X0, y); y += 33; });
    regions['p' + i] = [X0 - 8, y0 - 20, Math.min(MW + 16, Math.max(...lines.map((l) => g.measureText(l).width)) + 16), y - y0 + 6];
    y += 10;
  });
  // Bağlantılar
  em.links.forEach((lk, i) => {
    y += 6;
    if (lk.button) {
      g.font = `700 22px ${FONT}`;
      const w = g.measureText(lk.text).width + 48;
      g.fillStyle = hover === i ? '#1d4ed8' : '#2563eb';
      rr(X0, y - 24, w, 46, 10); g.fill();
      g.fillStyle = '#fff'; g.fillText(lk.text, X0 + 24, y);
      regions['link' + i] = [X0 - 6, y - 30, w + 12, 58];
    } else {
      g.font = `500 22px ${FONT}`;
      const w = g.measureText(lk.text).width;
      if (hover === i) { g.fillStyle = '#dbeafe'; g.fillRect(X0 - 4, y - 17, w + 8, 34); }
      g.fillStyle = '#1d4ed8'; g.fillText(lk.text, X0, y);
      g.fillRect(X0, y + 13, w, 2);
      regions['link' + i] = [X0 - 8, y - 22, w + 16, 44];
    }
    y += 52;
  });
  // Ekler
  em.attachments.forEach((at, i) => {
    g.font = `500 20px ${FONT}`;
    const label = `📎 ${at.name}  ·  ${at.size}`;
    const w = g.measureText(label).width + 32;
    g.fillStyle = '#e2e8f0'; rr(X0, y - 22, w, 46, 10); g.fill();
    g.strokeStyle = '#94a3b8'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#0f172a'; g.fillText(label, X0 + 16, y + 1);
    regions['attach' + i] = [X0 - 6, y - 28, w + 12, 58];
    y += 58;
  });
  // İpuçları
  if (revealed) {
    em.clues.forEach((c, i) => {
      const r = regions[c.at];
      if (!r) return;
      const col = c.type === 'ok' ? '#16a34a' : '#dc2626';
      g.strokeStyle = col; g.lineWidth = 4;
      rr(r[0], r[1], r[2], r[3], 8); g.stroke();
      g.fillStyle = col;
      g.beginPath(); g.arc(r[0], r[1], 15, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = `700 18px ${FONT}`; g.textAlign = 'center';
      g.fillText(String(i + 1), r[0], r[1] + 1); g.textAlign = 'left';
    });
    // Damga
    g.save();
    g.translate(CW - 170, CH - 120); g.rotate(-0.18);
    g.strokeStyle = em.phish ? '#dc2626' : '#16a34a'; g.lineWidth = 5;
    rr(-118, -32, 236, 64, 10); g.stroke();
    g.fillStyle = em.phish ? '#dc2626' : '#16a34a'; g.font = `800 32px ${FONT}`; g.textAlign = 'center';
    g.fillText(em.phish ? 'OLTALAMA' : 'GÜVENLİ', 0, 2);
    g.restore(); g.textAlign = 'left';
  }
  statusBar(hover >= 0 ? `🔗 ${em.links[hover].url}` : em.links.length ? 'Bağlantının gerçek adresini görmek için üzerine gel' : 'Hazır');
  tex.needsUpdate = true;
}
function statusBar(txt) {
  g.fillStyle = '#e5e7eb'; g.fillRect(0, CH - 36, CW, 36);
  g.fillStyle = '#cbd5e1'; g.fillRect(0, CH - 36, CW, 1);
  g.fillStyle = txt.startsWith('🔗') ? '#1d4ed8' : '#475569';
  g.font = `500 18px ${FONT}`; g.textBaseline = 'middle';
  g.fillText(txt, 14, CH - 17);
}

// ---------- Oyun durumu ----------
const DIFF = {
  kolay: { label: 'Kolay', levels: [1, 2] },
  orta: { label: 'Orta', levels: [1, 2, 3] },
  zor: { label: 'Zor', levels: [2, 3] },
};
let st = 'intro', deck = [], cur = 0, score = 0, streak = 0, best = 0, right = 0, wrong = 0;
let hover = -1, hoveredThis = false, hoverCount = 0, linkEmails = 0, timeLeft = 0, qStart = 0;
const missed = {};
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function startGame(diff) {
  if (diff) diffSel.set(diff);
  const D = DIFF[diffSel.value];
  const pool = EMAILS.filter((e) => D.levels.includes(e.level));
  // Dengeli karışım: en az üçte biri güvenli e-posta
  const n = Math.min(Math.round(countS.value), pool.length);
  const ph = shuffle(pool.filter((e) => e.phish)), ok = shuffle(pool.filter((e) => !e.phish));
  const nOk = Math.min(ok.length, Math.max(2, Math.round(n * 0.4)));
  deck = shuffle([...ok.slice(0, nOk), ...ph.slice(0, n - nOk)]);
  cur = 0; score = 0; streak = 0; best = 0; right = 0; wrong = 0; hoverCount = 0; linkEmails = 0;
  for (const k in missed) delete missed[k];
  chart.clear();
  timeLimitT.value = timeLimitT.value || diffSel.value === 'zor';
  showQuestion();
}

function showQuestion() {
  st = 'question';
  hover = -1; hoveredThis = false;
  timeLeft = 30; qStart = sim.time;
  const em = deck[cur];
  drawEmail(em, { idx: cur, total: deck.length });
  cluesText.set('<span style="opacity:.75">Karar verdikten sonra bu e-postadaki ipuçları burada listelenecek.</span>');
  sim.hud.show(`<div style="font-size:14px;opacity:.85">E-posta <b>${cur + 1}/${deck.length}</b> · Puan <b>${score}</b> · Seri <b>${streak}</b>
    <span class="ph-timer">${timeLimitT.value ? ' · ⏱ 30 sn' : ''}</span></div>
    <div style="margin-top:2px">Bu e-posta güvenli mi?</div>
    <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap"><button class="btn good" data-a="safe">✅ Güvenli</button><button class="btn danger" data-a="phish">🎣 Oltalama</button></div>`);
  sim.hud.el.querySelectorAll('button[data-a]').forEach((b) => (b.onclick = () => answer(b.dataset.a === 'phish')));
  updateStats();
}

function answer(saysPhish) {
  if (st !== 'question') return;
  const em = deck[cur];
  const timeout = saysPhish === null;
  const ok = !timeout && saysPhish === em.phish;
  const dtime = sim.time - qStart;
  if (em.links.length) { linkEmails++; if (hoveredThis) hoverCount++; }
  if (ok) {
    right++; streak++; best = Math.max(best, streak);
    score += 10 + Math.min(10, 2 * (streak - 1));
  } else {
    wrong++; streak = 0;
    for (const c of em.clues) if (c.type !== 'ok') missed[c.type] = (missed[c.type] || 0) + 1;
    if (!em.phish) missed.falsePos = (missed.falsePos || 0) + 1;
  }
  chart.push([(right / (right + wrong)) * 100, dtime]);
  st = 'reveal';
  hover = -1;
  drawEmail(em, { revealed: true, idx: cur, total: deck.length });
  hookY = em.phish ? 1.42 : 1.9;
  cluesText.set(`<b>${em.phish ? '🎣 Bu bir oltalama e-postası' : '✅ Bu e-posta güvenli'}</b><ol style="margin:6px 0 0;padding-left:20px">` +
    em.clues.map((c) => `<li><b>${CLUE[c.type]}</b><br>${c.note}</li>`).join('') + '</ol>');
  const last = cur >= deck.length - 1;
  const head = timeout ? '⏱ Süre doldu!' : ok ? '✔ Doğru!' : '✘ Yanlış';
  const tone = ok ? 'good' : 'bad';
  const first = em.clues.find((c) => c.type !== 'ok') || em.clues[0];
  sim.hud.show(`<h2>${head}</h2><div>${em.phish ? 'Bu bir <b>oltalama</b> e-postası.' : 'Bu e-posta <b>güvenli</b>.'}
    ${em.phish ? `En önemli ipucu: ${CLUE[first.type]}` : 'Güven işaretleri ekranda yeşil çerçeveli.'}</div><div style="font-size:13px;opacity:.8">Numaralı ipuçlarının açıklaması panelde.</div>
    <button class="btn primary" data-n>${last ? '🏁 Sonuçları gör' : 'Sonraki ➜'}</button>`, { tone });
  sim.hud.el.querySelector('button[data-n]').onclick = () => { if (last) showEnd(); else { cur++; showQuestion(); } };
  updateStats();
}

function showEnd() {
  st = 'end';
  hookY = 1.9;
  const tot = right + wrong, acc = tot ? (right / tot) * 100 : 0;
  const top = Object.entries(missed).filter(([k]) => k !== 'falsePos').sort((a, b) => b[1] - a[1]).slice(0, 3);
  const grade = acc >= 90 ? '🏆 Oltalama avcısı!' : acc >= 70 ? '👍 İyi gidiyorsun' : '📚 Biraz daha pratik';
  drawEmail(null);
  sim.hud.show(`<h2>${grade}</h2>
    <div>Puan <b>${score}</b> · Doğruluk <b>%${fmt(acc, 0)}</b> · En iyi seri <b>${best}</b></div>
    <div style="font-size:13.5px;margin-top:4px">Bağlantı içeren ${linkEmails} e-postanın <b>${hoverCount}</b> tanesinde gerçek adresi kontrol ettin.</div>
    ${top.length ? `<div style="font-size:13.5px">Kaçırdığın ipuçları: ${top.map(([k]) => CLUE[k]).join(', ')}</div>` : ''}
    ${missed.falsePos ? `<div style="font-size:13.5px">${missed.falsePos} gerçek e-postayı oltalama sandın — aşırı şüphe de iş kaybettirir.</div>` : ''}
    <div style="text-align:left;font-size:13.5px;margin-top:6px"><b>Ne yapmalı?</b> Kurumu resmî numarasından ara · Şifre/OTP paylaşma ·
    Bağlantıya değil adresi kendin yazarak siteye git · Şüpheli e-postayı BT ekibine ve USOM'a bildir.</div>
    <button class="btn primary" data-r>🔁 Tekrar oyna</button>`, { tone: acc >= 70 ? 'good' : 'warn' });
  sim.hud.el.querySelector('button[data-r]').onclick = () => startGame();
  updateStats();
}

function showIntro() {
  st = 'intro';
  hookY = 1.9;
  drawEmail(null);
  sim.hud.show(`<h2>🎣 Oltalama Avcısı</h2>
    <div style="font-size:14px">E-postaları incele: gönderen adresi, bağlantıların gerçek adresi (üzerine gel), ekler ve dil.
    Her biri için <b>Güvenli</b> ya da <b>Oltalama</b> de.</div>
    <button class="btn good" data-d="kolay">Kolay</button><button class="btn primary" data-d="orta">Orta</button><button class="btn danger" data-d="zor">Zor ⏱</button>`);
  sim.hud.el.querySelectorAll('button[data-d]').forEach((b) => (b.onclick = () => startGame(b.dataset.d)));
  cluesText?.set('<span style="opacity:.75">Karar verdikten sonra ipuçları burada listelenecek.</span>');
}

// ---------- Arayüz ----------
const ui = sim.ui;
ui.section('Oyun');
const diffSel = ui.segmented({ label: 'Zorluk', options: [{ value: 'kolay', label: 'Kolay' }, { value: 'orta', label: 'Orta' }, { value: 'zor', label: 'Zor' }], value: 'orta',
  onChange: (v) => { timeLimitT.value = v === 'zor'; } });
const countS = ui.slider({ label: 'E-posta sayısı', min: 6, max: 14, step: 1, value: 10 });
const timeLimitT = ui.toggle({ label: 'Süre sınırı (e-posta başına 30 sn)', value: false });
ui.buttons([{ label: '▶ Yeni oyun', variant: 'primary', onClick: () => startGame() }, { label: '🏠 Başlangıç', onClick: () => showIntro() }]);
ui.section('Skor');
const sScore = ui.stat({ label: 'Puan' });
const sStreak = ui.stat({ label: 'Seri' });
const sBest = ui.stat({ label: 'En iyi seri' });
const sAcc = ui.stat({ label: 'Doğruluk', unit: '%' });
const chart = ui.chart({ title: 'Doğruluk (%) ve karar süresi (sn)', series: [{ name: 'Doğruluk %', color: '#22c55e' }, { name: 'Karar süresi', color: '#60a5fa' }], maxPoints: 20, yMin: 0 });
ui.section('Bu e-postadaki ipuçları');
const cluesText = ui.text('', 'card');
ui.section('Ne yapmalı?');
ui.text(`<ul style="margin:0;padding-left:18px;line-height:1.5">
  <li>📞 Kurumu e-postadaki değil, <b>resmî numarasından</b> ara.</li>
  <li>🔑 <b>Şifre, CVV ve SMS/OTP kodu</b> kimseyle paylaşma — banka da istemez.</li>
  <li>🔗 Bağlantıya tıklamadan önce üzerine gel; en iyisi adresi <b>kendin yaz</b>.</li>
  <li>📎 Beklemediğin <b>.exe, .zip, .scr</b> ya da çift uzantılı ekleri açma.</li>
  <li>🏦 E-postayla gelen <b>IBAN değişikliği</b>ni telefonla teyit etmeden ödeme yapma.</li>
  <li>🚩 Şüpheli e-postayı BT ekibine ve <b>USOM</b>'a bildir; tıkladıysan şifreni hemen değiştir.</li>
</ul>`, 'card');

function updateStats() {
  sScore.set(score);
  sStreak.set(streak, streak >= 3 ? 'good' : '');
  sBest.set(best);
  const tot = right + wrong;
  sAcc.set(tot ? fmt((right / tot) * 100, 0) : '—', tot ? (right / tot >= 0.7 ? 'good' : 'warn') : '');
}

// ---------- Bağlantı üzerine gelme ----------
const tip = document.createElement('div');
tip.style.cssText = 'position:absolute;z-index:5;pointer-events:none;display:none;max-width:260px;padding:6px 10px;border-radius:8px;' +
  'background:rgba(10,15,30,.94);border:1px solid #3b82f6;font-size:12.5px;line-height:1.35;word-break:break-all';
sim.stage.appendChild(tip);
function linkAt(ev) {
  if (st !== 'question' && st !== 'reveal') return -1;
  const hit = sim.raycast(ev, [screen])[0];
  if (!hit || !hit.uv) return -1;
  const x = hit.uv.x * CW, y = (1 - hit.uv.y) * CH;
  const em = deck[cur];
  for (let i = 0; i < em.links.length; i++) {
    const r = regions['link' + i];
    if (r && x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) return i;
  }
  return -1;
}
function setHover(i, ev) {
  const em = deck[cur];
  if (i >= 0) {
    hoveredThis = true;
    const lk = em.links[i];
    const r = sim.stage.getBoundingClientRect();
    const px = Math.min(ev.clientX - r.left + 14, r.width - 270), py = Math.min(ev.clientY - r.top + 16, r.height - 70);
    tip.innerHTML = `<div style="opacity:.7">Görünen: ${lk.text}</div><div>🔗 Gerçek adres: <b style="color:#93c5fd">${lk.url}</b></div>`;
    tip.style.left = Math.max(4, px) + 'px'; tip.style.top = Math.max(4, py) + 'px';
    tip.style.display = 'block';
    sim.dom.style.cursor = 'pointer';
  } else {
    tip.style.display = 'none';
    sim.dom.style.cursor = '';
  }
  if (i !== hover) {
    hover = i;
    drawEmail(em, { revealed: st === 'reveal', hover: i, idx: cur, total: deck.length });
  }
}
sim.dom.addEventListener('pointermove', (ev) => { if (st === 'question' || st === 'reveal') setHover(linkAt(ev), ev); });
sim.dom.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
sim.onClick([screen], (hit, ev) => {
  const i = linkAt(ev);
  if (i < 0) return;
  setHover(i, ev);
  sim.toast('Gerçek hayatta şüpheli bağlantıya tıklama — önce gerçek adresi kontrol et!', 'warn');
});

// ---------- Döngü ----------
let tipT = 0;
sim.onUpdate((dt) => {
  if (st !== 'question' || !timeLimitT.value) return;
  timeLeft -= dt;
  tipT += dt;
  if (tipT > 0.25) {
    tipT = 0;
    const el = sim.hud.el.querySelector('.ph-timer');
    if (el) el.textContent = ` · ⏱ ${fmt(Math.max(0, Math.ceil(timeLeft)))} sn`;
  }
  if (timeLeft <= 0) answer(null);
});
sim.onRender((dt) => {
  hook.position.y += (hookY - hook.position.y) * Math.min(1, dt * 4);
  hook.rotation.z = Math.sin(performance.now() / 600) * 0.08;
});
// Dar ekranlarda monitör kadraja sığsın
let lastAspect = 0;
sim.onRender(() => {
  const a = sim.camera.aspect;
  if (Math.abs(a - lastAspect) < 0.01) return;
  lastAspect = a;
  const vfov = (sim.camera.fov * Math.PI) / 180, hfov = 2 * Math.atan(Math.tan(vfov / 2) * a);
  const dist = Math.max(1.05, 0.37 / Math.tan(hfov / 2));
  sim.moveCamera([0, 1.04, -0.2 + dist], [0, 1.0, -0.2]);
});

sim.onReset(() => showIntro());
showIntro();
updateStats();
