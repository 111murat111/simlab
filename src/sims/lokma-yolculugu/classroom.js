// Fen sınıfı / anatomi laboratuvarı arka planı. Duvarlar önceden bulanıklaştırılmış çizimlerdir: fotoğraftaki alan derinliği
// gibi odak yalnız modelde kalır. Zemin dokusu da uzaklaştıkça yumuşar. Ölçüler metre; model orijinde durur.
import { THREE, procedural } from '@core';

const RX = 3.4, Z0 = -3.1, Z1 = 3.6, H = 3.2;

function canvas(w, h, draw, blur, post) {
  const a = document.createElement('canvas'); a.width = w; a.height = h;
  draw(a.getContext('2d'), w, h);
  const b = document.createElement('canvas'); b.width = w; b.height = h;
  const g = b.getContext('2d'); g.filter = `blur(${blur}px)`; g.drawImage(a, 0, 0);
  g.filter = 'none';
  if (post) post(g, w, h);
  const t = new THREE.CanvasTexture(b); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
// Duvar koordinatı: metre → piksel (x soldan, y yerden)
const M = (w, h, W) => ({ x: (m) => (m / W) * w, y: (m) => h - (m / H) * h, s: (m) => (m / W) * w });

function wallBase(g, w, h, W, { upper = '#d8d3c6', lower = '#8f9f92' } = {}) {
  const c = M(w, h, W);
  g.fillStyle = upper; g.fillRect(0, 0, w, h);
  g.fillStyle = lower; g.fillRect(0, c.y(1.0), w, h);
  g.fillStyle = '#6f6a5f'; g.fillRect(0, c.y(1.02), w, c.s(0.03));
  g.fillStyle = '#4a4a46'; g.fillRect(0, c.y(0.1), w, c.s(0.1)); // süpürgelik
  const gr = g.createLinearGradient(0, 0, 0, c.y(2.4)); gr.addColorStop(0, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, c.y(2.4));
  return c;
}

// Arka duvar: yeşil yazı tahtası (tebeşirle mide çizimi), anatomi posterleri, saat, iskelet modeli, cam dolap
function backWall(g, w, h) {
  const W = 2 * RX, c = wallBase(g, w, h, W);
  const X = (m) => c.x(m + RX);
  // yazı tahtası
  g.fillStyle = '#7a5a3a'; g.fillRect(X(-2.0), c.y(2.25), c.s(3.1), c.s(1.35));
  g.fillStyle = '#2d4a3b'; g.fillRect(X(-1.95), c.y(2.2), c.s(3.0), c.s(1.25));
  g.strokeStyle = 'rgba(235,240,230,0.55)'; g.lineWidth = c.s(0.012);
  g.fillStyle = '#9c8c70'; g.fillRect(X(-2.0), c.y(0.97), c.s(3.1), c.s(0.05)); // tebeşirlik
  // saat
  g.fillStyle = '#f4f2ec'; g.beginPath(); g.arc(X(1.55), c.y(2.55), c.s(0.17), 0, 7); g.fill();
  g.strokeStyle = '#2b2b2b'; g.lineWidth = c.s(0.02); g.stroke();
  // anatomi posterleri
  const poster = (x, y, pw, ph, organs) => {
    g.fillStyle = '#f3efe4'; g.fillRect(X(x), c.y(y + ph), c.s(pw), c.s(ph));
    g.fillStyle = '#b8483c'; for (const [ox, oy, rx, ry] of organs) { g.beginPath(); g.ellipse(X(x + ox), c.y(y + oy), c.s(rx), c.s(ry), 0.3, 0, 7); g.fill(); }
    g.fillStyle = '#6a5a4a'; for (let i = 0; i < 4; i++) g.fillRect(X(x + 0.05), c.y(y + 0.12 + i * 0.05), c.s(pw * 0.5), c.s(0.015));
  };
  poster(1.25, 1.2, 0.6, 0.85, [[0.3, 0.6, 0.12, 0.08], [0.25, 0.42, 0.14, 0.07], [0.35, 0.3, 0.08, 0.1]]);
  poster(2.0, 1.25, 0.55, 0.78, [[0.27, 0.5, 0.15, 0.2]]);
  // cam kapaklı dolap (sağ uç): kavanozlar
  g.fillStyle = '#6b5236'; g.fillRect(X(2.7), c.y(2.3), c.s(0.7), c.s(2.3));
  g.fillStyle = '#c9d3d2'; g.fillRect(X(2.75), c.y(2.2), c.s(0.6), c.s(1.0));
  const jar = ['#c9a86a', '#b86d5a', '#9fb07a', '#d8c7a8'];
  for (let r = 0; r < 2; r++) for (let k = 0; k < 4; k++) { g.fillStyle = jar[(r + k) % 4]; g.fillRect(X(2.8 + k * 0.14), c.y(1.4 + r * 0.45 + 0.28), c.s(0.1), c.s(0.28)); }
  // iskelet modeli (sol)
  g.fillStyle = '#e8e0cc';
  const sx = -2.7;
  g.beginPath(); g.ellipse(X(sx), c.y(1.62), c.s(0.09), c.s(0.11), 0, 0, 7); g.fill();
  g.fillRect(X(sx - 0.015), c.y(1.5), c.s(0.03), c.s(0.55));
  for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(X(sx), c.y(1.4 - i * 0.05), c.s(0.15 - i * 0.008), c.s(0.018), 0, 0, 7); g.fill(); }
  g.beginPath(); g.ellipse(X(sx), c.y(0.95), c.s(0.14), c.s(0.07), 0, 0, 7); g.fill();
  for (const s of [-1, 1]) { g.fillRect(X(sx + s * 0.07 - 0.012), c.y(0.92), c.s(0.025), c.s(0.75)); g.fillRect(X(sx + s * 0.2 - 0.01), c.y(1.45), c.s(0.02), c.s(0.6)); }
  g.fillStyle = '#444'; g.fillRect(X(sx - 0.02), c.y(0.15), c.s(0.04), c.s(0.12)); g.fillRect(X(sx - 0.2), c.y(0.05), c.s(0.4), c.s(0.03));
}

// Tahta yazısı (bulanıklaştırmadan sonra, keskin): başlık, tebeşir mide çizimi, sindirim sırası
function boardText(g, w, h) {
  const c = M(w, h, 2 * RX), X = (m) => c.x(m + RX);
  g.save();
  g.fillStyle = 'rgba(240,244,236,0.92)'; g.strokeStyle = 'rgba(240,244,236,0.8)';
  g.shadowColor = 'rgba(240,244,236,0.35)'; g.shadowBlur = 3;
  g.textBaseline = 'alphabetic';
  g.font = `600 ${c.s(0.15)}px "Segoe Print", "Comic Sans MS", "DejaVu Sans", sans-serif`;
  g.fillText('SİNDİRİM', X(-1.88), c.y(1.98));
  g.fillText('SİSTEMİ', X(-1.88), c.y(1.8));
  // tebeşirle mide ve yemek borusu
  g.lineWidth = c.s(0.014); g.lineCap = 'round';
  g.beginPath(); g.moveTo(X(-1.55), c.y(1.7)); g.bezierCurveTo(X(-1.55), c.y(1.52), X(-1.5), c.y(1.45), X(-1.42), c.y(1.4)); g.stroke();
  g.beginPath(); g.moveTo(X(-1.42), c.y(1.4)); g.bezierCurveTo(X(-1.2), c.y(1.48), X(-1.05), c.y(1.32), X(-1.12), c.y(1.14));
  g.bezierCurveTo(X(-1.2), c.y(1.0), X(-1.52), c.y(1.02), X(-1.6), c.y(1.12)); g.stroke();
  g.font = `${c.s(0.065)}px "Segoe Print", "Comic Sans MS", "DejaVu Sans", sans-serif`;
  g.fillText('mide', X(-1.9), c.y(1.28));
  // sağ blok: sıra
  g.font = `600 ${c.s(0.085)}px "Segoe Print", "Comic Sans MS", "DejaVu Sans", sans-serif`;
  g.fillText('Lokmanın yolu:', X(0.1), c.y(2.02));
  g.font = `${c.s(0.072)}px "Segoe Print", "Comic Sans MS", "DejaVu Sans", sans-serif`;
  ['1. Ağız', '2. Yemek borusu', '3. Mide', '4. İnce bağırsak', '5. Kalın bağırsak'].forEach((t, i) => g.fillText(t, X(0.14), c.y(1.86 - i * 0.15)));
  g.restore();
}

// Pencere duvarı: üç geniş pencere, yarı çekik jaluzi, ağaçlar; altta kalorifer
function windowWall(g, w, h) {
  const W = Z1 - Z0, c = wallBase(g, w, h, W, { upper: '#8d887d', lower: '#5f6a61' });
  for (let i = 0; i < 3; i++) {
    const x0 = 0.6 + i * 2.1, ww = 1.6, y0 = 1.0, y1 = 2.6;
    const sky = g.createLinearGradient(0, c.y(y1), 0, c.y(y0)); sky.addColorStop(0, '#dfe9f5'); sky.addColorStop(1, '#ffffff');
    g.fillStyle = sky; g.fillRect(c.x(x0), c.y(y1), c.s(ww), c.s(y1 - y0));
    g.fillStyle = '#9fb58a';
    for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(c.x(x0 + 0.15 + k * 0.22), c.y(y0 + 0.35 + (k % 3) * 0.08), c.s(0.22), c.s(0.28), 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(245,242,235,0.85)'; for (let k = 0; k < 9; k++) g.fillRect(c.x(x0), c.y(y1 - k * 0.045), c.s(ww), c.s(0.022));
    g.fillStyle = '#ecebe6';
    g.fillRect(c.x(x0 - 0.05), c.y(y1 + 0.05), c.s(ww + 0.1), c.s(0.06)); g.fillRect(c.x(x0 - 0.05), c.y(y0 + 0.01), c.s(ww + 0.1), c.s(0.06));
    g.fillRect(c.x(x0 - 0.05), c.y(y1), c.s(0.05), c.s(y1 - y0)); g.fillRect(c.x(x0 + ww), c.y(y1), c.s(0.05), c.s(y1 - y0)); g.fillRect(c.x(x0 + ww / 2 - 0.02), c.y(y1), c.s(0.04), c.s(y1 - y0));
    g.fillStyle = '#d7d5cf'; for (let k = 0; k < 14; k++) g.fillRect(c.x(x0 + 0.1 + k * 0.1), c.y(0.8), c.s(0.06), c.s(0.5));
  }
}

// Karşı duvar: kitaplık, lavabo tezgâhı, kapı
function cabinetWall(g, w, h) {
  const W = Z1 - Z0, c = wallBase(g, w, h, W);
  const book = ['#7d3b32', '#2f5a7a', '#c9a34a', '#3f6a45', '#8a6a9a', '#d9d2c2', '#5a4a3a'];
  g.fillStyle = '#6e5334'; g.fillRect(c.x(0.4), c.y(2.2), c.s(2.2), c.s(2.2));
  for (let r = 0; r < 4; r++) {
    const y = 0.25 + r * 0.5; let x = 0.48;
    g.fillStyle = '#4c3923'; g.fillRect(c.x(0.45), c.y(y), c.s(2.1), c.s(0.03));
    while (x < 2.5) { const bw = 0.035 + ((x * 97) % 5) * 0.008, bh = 0.26 + ((x * 53) % 7) * 0.02; g.fillStyle = book[Math.floor(x * 131) % book.length]; g.fillRect(c.x(x), c.y(y + bh), c.s(bw), c.s(bh)); x += bw + 0.006; }
  }
  g.fillStyle = '#e3e3de'; g.fillRect(c.x(3.0), c.y(0.9), c.s(1.6), c.s(0.8));
  g.fillStyle = '#3b3f44'; g.fillRect(c.x(2.98), c.y(0.93), c.s(1.64), c.s(0.04));
  g.fillStyle = '#b8bcc0'; g.fillRect(c.x(3.7), c.y(1.25), c.s(0.03), c.s(0.3));
  g.fillStyle = '#7a5a3a'; g.fillRect(c.x(5.2), c.y(2.1), c.s(1.0), c.s(2.1));
  g.fillStyle = '#c8d4d8'; g.fillRect(c.x(5.45), c.y(1.9), c.s(0.5), c.s(0.5));
  g.fillStyle = '#c8b26a'; g.fillRect(c.x(5.3), c.y(1.05), c.s(0.12), c.s(0.03));
}

// Zemin: açık yeşilimsi gri vinil karolar; derz ve benekler uzaklaştıkça yumuşar (alan derinliği)
export function classroomFloor() {
  const m = procedural({
    key: 'lok-floor', bump: 0.004, params: { color: 0xa7aca4, roughness: 0.42 },
    pattern: `
      float d = length(p.xz - vec2(0.0, 0.1));
      float sharp = 1.0 - smoothstep(0.7, 2.6, d);
      vec2 q = p.xz/0.6;
      vec2 f = abs(fract(q) - 0.5);
      float grout = smoothstep(0.485, 0.495, max(f.x, f.y))*sharp;
      float tone = vn3(vec3(floor(q), 3.0));
      float sp = vn3(p*60.0)*sharp;
      col *= 0.9 + 0.12*tone + 0.06*(sp - 0.5);
      col *= 1.0 - 0.25*grout;
      rough = rough + 0.1*tone*sharp;
      h = -grout;`,
  });
  m.side = THREE.DoubleSide;
  return m;
}

export function createClassroom(scene) {
  const g = new THREE.Group(); g.name = 'classroom';
  // Duvarlar ışık alır (PBR); pencere duvarı ise ışık kaynağıdır (gün ışığı), düz çizilir
  const plane = (tex, w, mul, pos, rotY, basic = false) => {
    const mm = basic ? new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(mul, mul, mul), fog: false })
      : new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(mul, mul, mul), roughness: 0.9 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), mm);
    m.position.set(...pos); m.rotation.y = rotY; m.userData.noCast = true; m.userData.noAO = true; m.userData.noFit = true;
    g.add(m); return m;
  };
  // hafif alan derinliği bulanıklığı; tahta yazısı keskin kalır
  const back = canvas(2048, 960, backWall, 2.5, boardText), win = canvas(2048, 960, windowWall, 4), cab = canvas(2048, 960, cabinetWall, 4);
  const back2 = canvas(2048, 960, backWall, 4);
  plane(back, 2 * RX, 0.95, [0, H / 2, Z0], 0);
  plane(back2, 2 * RX, 0.8, [0, H / 2, Z1], Math.PI);
  plane(win, Z1 - Z0, 1.9, [-RX, H / 2, (Z0 + Z1) / 2], Math.PI / 2, true);
  plane(cab, Z1 - Z0, 0.95, [RX, H / 2, (Z0 + Z1) / 2], -Math.PI / 2);
  // Tavan: soluk, iki aydınlatma şeridi
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * RX, Z1 - Z0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9d9a92 }));
  ceil.position.set(0, H, (Z0 + Z1) / 2); ceil.userData.noCast = true; ceil.userData.noFit = true; g.add(ceil);
  for (const x of [-1.2, 1.2]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 4.5).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.9) }));
    s.position.set(x, H - 0.01, 0.2); s.userData.noCast = true; s.userData.noFit = true; g.add(s);
  }
  scene.add(g);
  return g;
}
