// Optik laboratuvarı seti (yerel yardımcı, metre): boyalı oda (jaluzili pencere, kapı, kablo kanalı, asma tavan ve LED
// paneller, uyarı levhası, yazı tahtası, cihaz arabası), titreşim yalıtımlı optik masa (bant sınırlı M6 delik ızgarası),
// siyah perde levhası, direk/tutucu, He-Ne lazer kafası, parlayan ışın ve ışında parlayan toz. Kuantum çift yarıkta kopyası var.
import { THREE, mat, procedural, RoundedBoxGeometry } from '@core';

const V2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y));
const rbox = (w, h, d, r, m, seg = 2) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)), m);
const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

// --- Malzemeler ---
export const paint = (color = 0xd5d8d2) => procedural({
  key: 'ol-paint', scale: 1, bump: 0.004, params: { color, roughness: 0.88 },
  pattern: `float n = fbm3(p*1.3, 4), s = vn3(p*140.0); col *= 0.94 + 0.08*n + 0.03*(s - 0.5); rough = 0.84 + 0.08*s; h = s*0.6 + n*0.4;`,
});
const vinyl = (color = 0x9ea3a3) => procedural({
  key: 'ol-vinyl', scale: 1, bump: 0.004, params: { color, roughness: 0.6 },
  pattern: `
    vec2 uv = p.xz/0.6; vec2 f = fract(uv), id = floor(uv);
    float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float seam = smoothstep(0.0, 0.004 + fwidth(e)*1.5, e);
    float t = h13(vec3(id, 2.0)), n = fbm3(p*2.0, 4);
    float fl = smoothstep(0.64, 0.72, vn3(p*70.0)), fl2 = smoothstep(0.66, 0.74, vn3(p*55.0 + 5.0));
    col *= (0.94 + 0.08*t)*(0.9 + 0.15*n);
    col = mix(col, col*0.5, fl*0.6); col = mix(col, vec3(0.8), fl2*0.25);
    col *= mix(0.62, 1.0, seam);
    rough = 0.5 + 0.2*n + 0.2*(1.0 - seam); h = seam*0.6 + n*0.2;`,
});
const ceilingTiles = () => procedural({
  key: 'ol-ceiling', scale: 1, bump: 0.01, params: { color: 0xeeeeea, roughness: 0.95 },
  pattern: `
    vec2 uv = p.xz/0.6; vec2 f = fract(uv); float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float bar = 1.0 - smoothstep(0.018, 0.022 + fwidth(e)*1.5, e);
    float fis = smoothstep(0.55, 0.75, vn3(p*vec3(80.0, 1.0, 30.0))), n = fbm3(p*6.0, 3);
    col *= 0.92 + 0.08*n - 0.12*fis;
    col = mix(col, vec3(0.95), bar);
    rough = mix(0.95, 0.4, bar); metal = bar*0.3; h = -fis*0.5 + bar*0.8 + n*0.1;`,
});
const galv = () => procedural({
  key: 'ol-galv', scale: 1, bump: 0.003, params: { color: 0xb8bcc0, roughness: 0.4, metalness: 0.85 },
  pattern: `float sp = cells3(p*9.0), n = fbm3(p*3.0, 3); col *= 0.85 + 0.2*smoothstep(0.1, 0.5, sp) + 0.1*n; rough = 0.3 + 0.25*sp; h = sp*0.3;`,
});
/** Optik tabla: siyah eloksallı paslanmaz üst, 25 mm aralıklı M6 delikler; ince frekans uzakta ortalamaya söner */
export const breadboard = ({ color = 0x1b1d20, pitch = 0.025 } = {}) => procedural({
  key: 'ol-breadboard', scale: 1, bump: 0.003,
  params: { color, roughness: 0.5, metalness: 0.35 },
  uniforms: { uPitch: { value: pitch } },
  pattern: `
    vec2 uv = p.xz/uPitch; vec2 f = fract(uv) - 0.5; float d = length(f);
    float fw = max(fwidth(uv.x), fwidth(uv.y));
    float w = fwidth(d)*1.2;
    float fade = 1.0 - smoothstep(0.18, 0.45, fw);
    float hole = (1.0 - smoothstep(0.12 - w, 0.12 + w, d))*fade*step(0.9, pn.y);
    float rim = (1.0 - smoothstep(0.15, 0.2, d))*fade*step(0.9, pn.y) - hole;
    float n = fbm3(p*4.0, 3), br = vn3(vec3(p.x*300.0, p.y*4.0, p.z*6.0));
    col *= 0.9 + 0.22*n + 0.06*br;
    col = mix(col, vec3(0.012), hole) + vec3(0.02)*max(rim, 0.0);
    col = mix(col, col*0.85, (1.0 - fade)*0.12*step(0.9, pn.y));
    rough = mix(0.46 + 0.1*n - 0.08*max(rim, 0.0), 0.95, hole);
    metal = mix(0.35, 0.0, hole);
    h = -hole + br*0.05;`,
});
export const hardboardMat = () => procedural({
  key: 'ol-hardboard', scale: 1, bump: 0.01, params: { color: 0x252a31, roughness: 0.85 },
  pattern: `float n = fbm3(p*8.0, 4), f = vn3(vec3(p.x*260.0, p.y*40.0, p.z*260.0)); col *= 0.8 + 0.3*n + 0.12*f; rough = 0.78 + 0.12*n; h = n*0.5 + f*0.2;`,
});
export const OM = {};
function mats() {
  if (OM.anod) return OM;
  Object.assign(OM, {
    anod: mat.paintedMetal({ color: 0x1a1c20, wear: 0.04 }),
    steel: mat.brushedMetal({ color: 0xd6d9dd, rough: 0.2 }),
    alu: mat.brushedMetal({ color: 0xbfc3c8, rough: 0.3 }),
    rubber: mat.rubber({ color: 0x1c1d1f }),
    grey: mat.paintedMetal({ color: 0x8f959c, wear: 0.05 }),
    light: mat.paintedMetal({ color: 0xd8dadb, wear: 0.03 }),
    cable: mat.rubber({ color: 0x2b2d31 }),
  });
  return OM;
}

// --- Baskı / tabela dokuları ---
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function printed(w, h, tex, rough = 0.6) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: rough }));
}
/** Lazer uyarı levhası (sarı üçgen + ışın simgesi + metin) */
export function laserSign(w = 0.2) {
  const tex = canvasTex(400, 520, (g, W, H) => {
    g.fillStyle = '#f7f4ea'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(5, 5, W - 10, H - 10);
    const cx = W / 2, top = 40, s = 300;
    g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + s / 2, top + s * 0.87); g.lineTo(cx - s / 2, top + s * 0.87); g.closePath();
    g.fillStyle = '#f5c400'; g.fill(); g.lineJoin = 'round'; g.lineWidth = 16; g.strokeStyle = '#111'; g.stroke();
    const sy = top + s * 0.58;
    g.fillStyle = '#111'; g.beginPath(); g.arc(cx + 18, sy, 16, 0, Math.PI * 2); g.fill();
    g.lineWidth = 6;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const r0 = 26, r1 = i % 2 ? 46 : 60; g.beginPath(); g.moveTo(cx + 18 + Math.cos(a) * r0, sy + Math.sin(a) * r0); g.lineTo(cx + 18 + Math.cos(a) * r1, sy + Math.sin(a) * r1); g.stroke(); }
    g.lineWidth = 8; g.beginPath(); g.moveTo(cx - 95, sy); g.lineTo(cx - 10, sy); g.stroke();
    g.fillStyle = '#111'; g.textAlign = 'center';
    g.font = '800 54px system-ui, sans-serif'; g.fillText('DİKKAT', cx, 405);
    g.font = '700 34px system-ui, sans-serif'; g.fillText('LAZER IŞINI', cx, 447);
    g.font = '500 24px system-ui, sans-serif'; g.fillText('Işına doğrudan bakmayın', cx, 485);
  });
  const m = printed(w, w * 1.3, tex, 0.45);
  return m;
}
/** Beyaz yazı tahtası: satırlar [metin, renk], isteğe bağlı çizim fonksiyonu */
export function whiteboard(w, h, lines, sketch) {
  const g = new THREE.Group();
  const PX = 900, PY = Math.round(PX * h / w);
  const tex = canvasTex(PX, PY, (c, W, H) => {
    c.fillStyle = '#f4f5f2'; c.fillRect(0, 0, W, H);
    // silinmiş eski yazı gölgeleri
    c.globalAlpha = 0.06; c.fillStyle = '#556'; for (let i = 0; i < 9; i++) c.fillRect(60 + ((i * 97) % 500), 40 + ((i * 53) % (H - 80)), 180 + (i % 3) * 60, 10);
    c.globalAlpha = 1;
    c.textAlign = 'left'; c.textBaseline = 'middle';
    lines.forEach(([t, col, size = 52], i) => { c.fillStyle = col; c.font = `italic 600 ${size}px "Segoe Print", "Comic Sans MS", cursive`; c.fillText(t, 50, 70 + i * (H - 100) / Math.max(lines.length, 3)); });
    if (sketch) sketch(c, W, H);
  });
  const board = printed(w, h, tex, 0.18);
  board.material.metalness = 0; board.position.z = 0.011;
  g.add(board);
  const fr = mats().alu;
  const bar = (bw, bh, x, y) => g.add(at(rbox(bw, bh, 0.022, 0.006, fr), x, y, 0.005));
  bar(w + 0.03, 0.02, 0, h / 2 + 0.005); bar(w + 0.03, 0.02, 0, -h / 2 - 0.005); bar(0.02, h, -w / 2 - 0.005, 0); bar(0.02, h, w / 2 + 0.005, 0);
  g.add(at(rbox(w * 0.6, 0.012, 0.06, 0.004, fr), 0, -h / 2 - 0.02, 0.03));
  [0x1d4ed8, 0xb91c1c, 0x111111].forEach((c, i) => {
    const mk = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 12).rotateZ(Math.PI / 2), mat.plastic({ color: c, gloss: 0.4 }));
    g.add(at(mk, -w * 0.2 + i * 0.05, -h / 2 - 0.006, 0.035 + (i % 2) * 0.01));
  });
  return g;
}
/** Cihaz: boyalı kasa, koyu ön panel, parlayan ekran (canvas), düğmeler ve LED */
export function instrument(w, h, d, { body = 0xd4d1ca, text = 'HAZIR', color = '#7dff9a', led = 0x33ff66 } = {}) {
  const g = new THREE.Group();
  g.add(at(rbox(w, h, d, 0.006, mat.paintedMetal({ color: body, wear: 0.05 })), 0, h / 2, 0));
  g.add(at(rbox(w - 0.008, h - 0.008, 0.006, 0.002, mat.plastic({ color: 0x2a2c30, gloss: 0.3 })), 0, h / 2, d / 2));
  const tex = canvasTex(256, 96, (c, W, H) => {
    c.fillStyle = '#031006'; c.fillRect(0, 0, W, H);
    c.fillStyle = color; c.font = '700 54px "Courier New", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, W / 2, H / 2 + 2);
  });
  const dw = Math.min(w * 0.42, 0.12), dh = dw * 0.375;
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.6, roughness: 0.2 }));
  g.add(at(disp, -w / 2 + dw / 2 + 0.015, h * 0.58, d / 2 + 0.0035));
  const knob = new THREE.CylinderGeometry(0.009, 0.01, 0.012, 20).rotateX(Math.PI / 2);
  const km = mat.plastic({ color: 0x3a3c40, gloss: 0.3 });
  for (let i = 0; i < 3; i++) g.add(at(new THREE.Mesh(knob, km), w / 2 - 0.025 - i * 0.03, h * 0.55, d / 2 + 0.009));
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.0035, 12, 8), mat.glow({ color: led, intensity: 5 })), -w / 2 + 0.018, h * 0.2, d / 2 + 0.004));
  g.userData.display = { tex, disp };
  return g;
}

// --- Oda ---
/**
 * @param o { bench, tableW, tableD, tableZ, back (arka duvar z), halfW, front, H, board: {lines, sketch, x}, doorX, winX }
 */
export function opticsRoom(scene, o = {}) {
  const P = { bench: 0.85, tableW: 2.4, tableD: 1.2, tableZ: -0.1, back: -1.35, halfW: 2.9, front: 3.4, H: 2.85, doorX: -1.95, winX: 1.75, ...o };
  const M = mats();
  const room = new THREE.Group(); scene.add(room);
  const add = (m, x, y, z) => { if (x !== undefined) m.position.set(x, y, z); room.add(m); return m; };
  const shell = (m) => { m.userData.noCast = true; m.userData.noAO = false; return m; };
  const wallM = paint(0xd0d4cf), cx = 0, cz = (P.back + P.front) / 2, D = P.front - P.back, Wd = P.halfW * 2;
  // Zemin, tavan
  add(new THREE.Mesh(new THREE.PlaneGeometry(Wd, D).rotateX(-Math.PI / 2), vinyl()), cx, 0, cz);
  add(shell(new THREE.Mesh(new THREE.PlaneGeometry(Wd, D).rotateX(Math.PI / 2), ceilingTiles())), cx, P.H, cz);
  // Arka duvar: pencere boşluğu çevresinde dört parça
  const WX0 = P.winX - 0.6, WX1 = P.winX + 0.6, WY0 = 0.95, WY1 = 2.15, T = 0.2;
  const wall = (x0, x1, y0, y1) => add(shell(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, T), wallM)), (x0 + x1) / 2, (y0 + y1) / 2, P.back - T / 2);
  wall(-P.halfW, WX0, 0, P.H); wall(WX1, P.halfW, 0, P.H); wall(WX0, WX1, 0, WY0); wall(WX0, WX1, WY1, P.H);
  add(shell(new THREE.Mesh(new THREE.BoxGeometry(T, P.H, D), wallM)), -P.halfW - T / 2, P.H / 2, cz);
  add(shell(new THREE.Mesh(new THREE.BoxGeometry(T, P.H, D), wallM)), P.halfW + T / 2, P.H / 2, cz);
  add(shell(new THREE.Mesh(new THREE.BoxGeometry(Wd, P.H, T), wallM)), 0, P.H / 2, P.front + T / 2);
  // Süpürgelik (kauçuk)
  const skirt = (w, x, z, ry) => { const s = add(rbox(w, 0.1, 0.012, 0.003, M.rubber), x, 0.05, z); s.rotation.y = ry; s.userData.noCast = true; };
  skirt(Wd, 0, P.back + 0.006, 0); skirt(D, -P.halfW + 0.006, cz, Math.PI / 2); skirt(D, P.halfW - 0.006, cz, Math.PI / 2);
  // Pencere: kasa, cam, dışarıda aydınlık gökyüzü + karşı bina silueti, yarıya inmiş jaluzi
  {
    const ww = WX1 - WX0, wh = WY1 - WY0, wx = (WX0 + WX1) / 2, wy = (WY0 + WY1) / 2;
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(ww * 3, wh * 3), new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; void main(){
        vec3 top = vec3(0.62, 0.76, 1.0)*1.9, hor = vec3(1.0, 0.97, 0.92)*2.6;
        vec3 c = mix(hor, top, smoothstep(0.35, 0.9, vUv.y));
        float x = vUv.x*14.0; float bh = 0.34 + 0.12*fract(sin(floor(x)*12.9898)*43758.5)*step(0.3, fract(x*0.5));
        float b = step(vUv.y, bh);
        vec2 wf = fract(vec2(vUv.x*70.0, vUv.y*40.0));
        float win = step(0.3, wf.x)*step(0.35, wf.y)*step(vUv.y, bh - 0.02);
        vec3 bc = mix(vec3(0.62, 0.6, 0.57), vec3(0.42, 0.5, 0.6), win)*1.1;
        float tr = smoothstep(0.02, 0.0, vUv.y - 0.3 - 0.03*sin(vUv.x*40.0) - 0.02*sin(vUv.x*97.0));
        c = mix(c, bc, b); c = mix(c, vec3(0.2, 0.28, 0.16), tr);
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    outside.userData.noCast = true;
    add(outside, wx, wy, P.back - 1.2);
    const pvc = mat.plastic({ color: 0xf0f0ed, gloss: 0.3 });
    const fr = (w, h, x, y) => add(rbox(w, h, 0.07, 0.01, pvc), x, y, P.back - 0.1);
    fr(ww, 0.06, wx, WY0 + 0.03); fr(ww, 0.06, wx, WY1 - 0.03); fr(0.06, wh, WX0 + 0.03, wy); fr(0.06, wh, WX1 - 0.03, wy); fr(0.05, wh, wx, wy);
    add(new THREE.Mesh(new THREE.PlaneGeometry(ww, wh), new THREE.MeshPhysicalMaterial({ color: 0xeaf4ff, transparent: true, opacity: 0.06, roughness: 0.02, depthWrite: false })), wx, wy, P.back - 0.11);
    add(rbox(ww + 0.12, 0.03, 0.26, 0.008, mat.ceramic({ color: 0xe6e2da })), wx, WY0 - 0.015, P.back + 0.05);
    // Jaluzi: üst yarı kapalı (hafif açık lameller), alt yarı açık
    const n = 30, sw = ww - 0.08;
    const slats = new THREE.InstancedMesh(new RoundedBoxGeometry(sw, 0.0025, 0.025, 1, 0.001), mat.paintedMetal({ color: 0xe9e7e1, wear: 0 }), n);
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) { d.position.set(wx, WY1 - 0.07 - i * 0.022, P.back + 0.03); d.rotation.set(0.9 + 0.05 * Math.sin(i * 2.3), 0, 0); d.updateMatrix(); slats.setMatrixAt(i, d.matrix); }
    slats.userData.noCast = true; room.add(slats);
    add(rbox(ww - 0.04, 0.035, 0.05, 0.008, M.light), wx, WY1 - 0.04, P.back + 0.03);
    add(rbox(sw, 0.012, 0.03, 0.004, M.light), wx, WY1 - 0.07 - n * 0.022, P.back + 0.03);
    // Radyatör
    add(rbox(1.0, 0.5, 0.08, 0.012, procedural({
      key: 'ol-radiator', bump: 0.02, params: { color: 0xf0eee9, roughness: 0.45 },
      pattern: `float r = abs(fract(p.x/0.033) - 0.5)*2.0; float g = smoothstep(0.6, 0.95, r); col *= 1.0 - 0.18*g; h = 1.0 - g;`,
    })), wx, 0.45, P.back + 0.07);
  }
  // Kapı: çelik kasa, kayın kaplama kanat, tel camlı küçük pencere, kol, üstte ışıklı "LAZER AÇIK" tabelası
  {
    const dx = P.doorX, dz = P.back + 0.012, DW = 0.95, DH = 2.08;
    const frameM = mat.paintedMetal({ color: 0x5b6168, wear: 0.1 });
    add(rbox(0.06, DH + 0.05, 0.05, 0.008, frameM), dx - DW / 2 - 0.03, (DH + 0.05) / 2, dz + 0.01);
    add(rbox(0.06, DH + 0.05, 0.05, 0.008, frameM), dx + DW / 2 + 0.03, (DH + 0.05) / 2, dz + 0.01);
    add(rbox(DW + 0.12, 0.06, 0.05, 0.008, frameM), dx, DH + 0.03, dz + 0.01);
    add(rbox(DW - 0.01, DH - 0.01, 0.04, 0.006, mat.wood({ color: 0xb48a5c, varnish: true, ring: 10, scale: 1.5 })), dx, DH / 2, dz + 0.005);
    add(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.6), new THREE.MeshPhysicalMaterial({ color: 0x2a3440, roughness: 0.05, metalness: 0.2, clearcoat: 1 })), dx + 0.2, 1.45, dz + 0.027);
    add(rbox(0.24, 0.64, 0.012, 0.004, frameM), dx + 0.2, 1.45, dz + 0.02);
    add(rbox(DW - 0.06, 0.2, 0.004, 0.002, M.steel), dx, 0.12, dz + 0.027);
    const lever = add(rbox(0.14, 0.018, 0.02, 0.008, M.steel), dx - DW / 2 + 0.14, 1.02, dz + 0.06);
    lever.userData.noCast = true;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, 0.04, 20).rotateX(Math.PI / 2), M.steel), dx - DW / 2 + 0.08, 1.02, dz + 0.04);
    const sign = laserSign(0.18); add(sign, dx - 0.12, 1.5, dz + 0.027);
    // ışıklı uyarı kutusu
    const box = add(rbox(0.46, 0.14, 0.07, 0.01, mat.plastic({ color: 0x1f2124, gloss: 0.4 })), dx, DH + 0.2, dz + 0.035);
    box.userData.noCast = true;
    const t = canvasTex(512, 140, (c, W, H) => { c.fillStyle = '#200'; c.fillRect(0, 0, W, H); c.fillStyle = '#ff2a1a'; c.font = '800 84px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('LAZER AÇIK', W / 2, H / 2 + 4); });
    add(new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.115), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 3.2 })), dx, DH + 0.2, dz + 0.071);
  }
  // Kablo kanalı (galvaniz tava), konsolları ve içindeki kablolar
  {
    const ty = 2.42, tz = P.back + 0.2, L = Wd - 0.1, gm = galv();
    add(rbox(L, 0.004, 0.3, 0.001, gm), 0, ty, tz).userData.noCast = true;
    add(rbox(L, 0.07, 0.004, 0.001, gm), 0, ty + 0.035, tz - 0.15).userData.noCast = true;
    add(rbox(L, 0.07, 0.004, 0.001, gm), 0, ty + 0.035, tz + 0.15).userData.noCast = true;
    for (let x = -P.halfW + 0.4; x < P.halfW; x += 1.2) add(rbox(0.03, 0.03, 0.34, 0.004, gm), x, ty - 0.017, tz - 0.01).userData.noCast = true;
    const cm = [mat.rubber({ color: 0x2b2d31 }), mat.rubber({ color: 0x51565c }), mat.plastic({ color: 0xd1c9a8, gloss: 0.2 }), mat.rubber({ color: 0x1d3b62 })];
    for (let k = 0; k < 7; k++) {
      const pts = [];
      for (let i = 0; i <= 12; i++) { const x = -P.halfW + 0.05 + (i / 12) * (Wd - 0.1); pts.push(new THREE.Vector3(x, ty + 0.012 + (k % 3) * 0.012, tz - 0.1 + k * 0.03 + 0.008 * Math.sin(i * 1.7 + k))); }
      const c = add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.006 + (k % 2) * 0.003, 6), cm[k % 4]));
      c.userData.noCast = true;
    }
    // tavadan masaya inen iki kablo (sarkarak)
    for (const [x, x2, c] of [[-0.9, -0.95, 0], [0.55, 0.62, 3]]) {
      const pts = [new THREE.Vector3(x, ty + 0.02, tz), new THREE.Vector3(x, ty - 0.1, tz + 0.05), new THREE.Vector3(x2, 1.6, P.back + 0.12), new THREE.Vector3(x2, 1.2, P.back + 0.08)];
      add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.005, 6), cm[c]));
    }
  }
  // Duvar tipi kablo kanalı + prizler
  {
    const y = 1.18, z = P.back + 0.03, L = P.winX - 0.7 - (P.doorX + 0.6);
    const x0 = P.doorX + 0.6 + L / 2;
    add(rbox(L, 0.09, 0.05, 0.008, mat.plastic({ color: 0xeeeeea, gloss: 0.2 })), x0, y, z);
    const sock = new RoundedBoxGeometry(0.075, 0.075, 0.012, 2, 0.008);
    const sm = mat.plastic({ color: 0xf6f6f2, gloss: 0.5 });
    const holeM = mat.plastic({ color: 0x2a2a2c, gloss: 0.1 });
    for (let i = 0; i < 8; i++) {
      const sx = x0 - L / 2 + 0.25 + i * (L - 0.5) / 7;
      add(new THREE.Mesh(sock, sm), sx, y, z + 0.03);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.004, 24).rotateX(Math.PI / 2), holeM), sx, y, z + 0.037);
    }
  }
  // Tavan LED panelleri (görünür ışık yüzeyi + noktasal ışık)
  {
    const panelMat = mat.glow({ color: 0xf6f8ff, intensity: 3 });
    for (const [px, pz] of [[-1.2, P.tableZ], [1.2, P.tableZ], [0, P.tableZ + 1.8]]) {
      add(rbox(0.62, 0.02, 0.62, 0.004, M.light), px, P.H - 0.01, pz).userData.noCast = true;
      add(new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58).rotateX(Math.PI / 2), panelMat), px, P.H - 0.021, pz).userData.noCast = true;
      const L = new THREE.PointLight(0xf4f6ff, 4.5, 0, 2); L.position.set(px, P.H - 0.2, pz); room.add(L);
    }
  }
  // Yazı tahtası
  if (P.board) {
    const b = whiteboard(1.2, 0.8, P.board.lines, P.board.sketch);
    add(b, P.board.x ?? -0.55, 1.55, P.back + 0.005);
  }
  // Cihaz arabası (sol arka): alüminyum profil çerçeve, iki raf, cihazlar
  {
    const cart = new THREE.Group();
    const cw = 0.62, cd = 0.5;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cart.add(at(rbox(0.03, 1.02, 0.03, 0.004, M.alu), sx * (cw / 2 - 0.015), 0.57, sz * (cd / 2 - 0.015)));
    for (const y of [0.18, 0.62, 1.07]) cart.add(at(rbox(cw, 0.02, cd, 0.004, M.grey), 0, y, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cart.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 20).rotateZ(Math.PI / 2), M.rubber), sx * (cw / 2 - 0.04), 0.037, sz * (cd / 2 - 0.04)));
      cart.add(at(rbox(0.02, 0.06, 0.04, 0.004, M.steel), sx * (cw / 2 - 0.04), 0.08, sz * (cd / 2 - 0.04)));
    }
    const i1 = instrument(0.44, 0.14, 0.36, { text: '632,8 nm', color: '#ff6a55', led: 0xff3322 }); i1.position.set(0, 0.63, 0.02); cart.add(i1);
    const i2 = instrument(0.36, 0.12, 0.3, { body: 0x3a3e44, text: 'HAZIR', color: '#7dff9a' }); i2.position.set(-0.05, 0.19, 0.03); cart.add(i2);
    const i3 = instrument(0.3, 0.16, 0.3, { body: 0xc9ccd0, text: '12,0 V', color: '#8fd8ff', led: 0x44aaff }); i3.position.set(0.02, 1.08, 0); cart.add(i3);
    cart.position.set(P.cart?.[0] ?? -1.62, 0, P.cart?.[1] ?? P.back + 0.5);
    cart.rotation.y = P.cart?.[2] ?? 0.35;
    room.add(cart);
  }
  return { group: room, add };
}

// --- Optik masa ---
/** Titreşim yalıtımlı optik masa: petek gövde (boyalı çelik kenar), delikli üst tabla, dört pnömatik ayak */
export function opticalTable(scene, { w = 2.4, d = 1.2, top = 0.85, z = -0.1, thick = 0.3 } = {}) {
  const M = mats();
  const g = new THREE.Group(); g.position.z = z; scene.add(g);
  const body = rbox(w, thick - 0.012, d, 0.012, mat.paintedMetal({ color: 0x2b3038, wear: 0.06 }));
  body.position.y = top - 0.012 - (thick - 0.012) / 2; g.add(body);
  const plate = rbox(w, 0.014, d, 0.004, breadboard());
  plate.position.y = top - 0.007; g.add(plate);
  // kenar trim bandı (fırçalanmış çelik)
  g.add(at(rbox(w + 0.004, 0.035, 0.006, 0.002, M.steel), 0, top - 0.06, d / 2 + 0.001));
  // üretici etiketi yerine sade plaka
  g.add(at(rbox(0.16, 0.05, 0.004, 0.002, M.alu), -w / 2 + 0.25, top - thick / 2 - 0.02, d / 2 + 0.002));
  // pnömatik ayaklar
  const legH = top - thick;
  const prof = V2([[0, 0], [0.14, 0], [0.145, 0.01], [0.12, 0.03], [0.1, 0.04], [0.1, legH - 0.12], [0.11, legH - 0.1], [0.11, legH - 0.04], [0.085, legH - 0.02], [0.085, legH], [0, legH]]);
  const legG = new THREE.LatheGeometry(prof, 40);
  const legM = mat.paintedMetal({ color: 0x9aa1a8, wear: 0.08 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(at(new THREE.Mesh(legG, legM), sx * (w / 2 - 0.22), 0, sz * (d / 2 - 0.2)));
    g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 10, 40).rotateX(Math.PI / 2), M.rubber), sx * (w / 2 - 0.22), legH - 0.07, sz * (d / 2 - 0.2)));
  }
  for (const sz of [-1, 1]) g.add(at(rbox(w - 0.44, 0.06, 0.05, 0.008, legM), 0, 0.14, sz * (d / 2 - 0.2)));
  for (const sx of [-1, 1]) g.add(at(rbox(0.05, 0.06, d - 0.4, 0.008, legM), sx * (w / 2 - 0.22), 0.14, 0));
  return { group: g, top };
}

/** Direk + tutucu + sıkma çatalı (metre). Orijin masa yüzeyi, direk ucu h yüksekliğinde. */
export function postMount(h) {
  const M = mats();
  const g = new THREE.Group();
  const fork = rbox(0.07, 0.009, 0.028, 0.003, M.anod); fork.position.y = 0.0045; g.add(fork);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.004, 6), M.steel); bolt.position.set(0.024, 0.011, 0); g.add(bolt);
  const hh = Math.max(0.012, Math.min(0.05, h * 0.5));
  const holder = new THREE.Mesh(new THREE.LatheGeometry(V2([[0.0066, 0], [0.0125, 0], [0.0125, hh - 0.002], [0.0115, hh], [0.0066, hh]]), 28), M.anod);
  holder.position.y = 0.009; g.add(holder);
  const ts = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.018, 12).rotateZ(Math.PI / 2), M.steel); ts.position.set(0.02, 0.009 + hh * 0.7, 0); g.add(ts);
  const tsk = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.006, 16).rotateZ(Math.PI / 2), M.anod); tsk.position.set(0.03, 0.009 + hh * 0.7, 0); g.add(tsk);
  const ph = Math.max(0.005, h - 0.009 - hh * 0.3);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.00635, 0.00635, ph, 20), M.steel);
  post.position.y = h - ph / 2; g.add(post);
  return g;
}

/** He-Ne lazer kafası (metre): gövde +x yönüne ışır, çıkış açıklığı orijinde; iki V-yataklı direk üzerinde (axisH) */
export function laserHead({ len = 0.3, r = 0.022, axisH = 0.1, body = 0x1d2f4a, label = 'He-Ne · 632,8 nm' } = {}) {
  const M = mats();
  const g = new THREE.Group();
  const prof = V2([[0, 0], [r * 0.7, 0], [r, 0.006], [r, len - 0.006], [r * 0.8, len], [r * 0.35, len + 0.004], [r * 0.35, len + 0.012], [0, len + 0.012]]);
  const bodyG = new THREE.LatheGeometry(prof, 40); bodyG.rotateZ(-Math.PI / 2); bodyG.translate(-len - 0.012, 0, 0);
  g.add(new THREE.Mesh(bodyG, mat.paintedMetal({ color: body, wear: 0.06 })));
  // ön başlık (fırçalanmış) + açıklık
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.02, 28).rotateZ(Math.PI / 2), M.steel); cap.position.x = -0.006; g.add(cap);
  const ap = new THREE.Mesh(new THREE.CircleGeometry(r * 0.2, 20).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 })); ap.position.x = 0.0045; g.add(ap);
  // etiket bandı
  const tex = canvasTex(512, 96, (c, W, H) => {
    c.fillStyle = '#e9e6dc'; c.fillRect(0, 0, W, H); c.fillStyle = '#f5c400'; c.fillRect(0, 0, 90, H);
    c.fillStyle = '#111'; c.font = '700 40px system-ui, sans-serif'; c.textBaseline = 'middle'; c.fillText(label, 110, H / 2 + 2);
    c.beginPath(); c.moveTo(45, 14); c.lineTo(80, 80); c.lineTo(10, 80); c.closePath(); c.lineWidth = 6; c.stroke();
  });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.0006, r + 0.0006, len * 0.42, 40, 1, true, -1.3, 2.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  band.rotation.z = -Math.PI / 2; band.rotation.x = -Math.PI / 4; band.position.x = -len * 0.55; g.add(band);
  // arka kablo
  const pts = [new THREE.Vector3(-len - 0.012, 0, 0), new THREE.Vector3(-len - 0.06, -0.01, 0), new THREE.Vector3(-len - 0.1, -axisH + 0.01, 0.02), new THREE.Vector3(-len - 0.25, -axisH + 0.004, 0.08)];
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.004, 8), M.cable));
  // V-yatak kelepçeleri + direkler
  for (const fx of [0.22, 0.78]) {
    const x = -len * fx;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.004, 0.004, 10, 36).rotateY(Math.PI / 2), M.anod); ring.position.x = x; g.add(ring);
    const vb = rbox(0.02, 0.022, r * 2.4, 0.004, M.anod); vb.position.set(x, -r - 0.008, 0); g.add(vb);
    const pm = postMount(axisH - r - 0.019); pm.position.set(x, -axisH, 0); g.add(pm);
  }
  // çalışma LED'i
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.003, 12, 8), mat.glow({ color: 0x33ff55, intensity: 6 }));
  led.position.set(-len * 0.9, r * 0.95, 0); g.add(led);
  return g;
}

/** Aynalı kinematik tutucu (metre): kare ön plaka, iki ayar vidası, ayna; orijin ayna merkezi, normal +x */
export function mirrorMount(axisH, { r = 0.0127 } = {}) {
  const M = mats();
  const g = new THREE.Group();
  g.add(at(rbox(0.008, 0.04, 0.04, 0.003, M.anod), -0.012, 0, 0));
  g.add(at(rbox(0.008, 0.04, 0.04, 0.003, M.anod), -0.002, 0, 0));
  const mir = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.006, 32).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.03 }));
  mir.position.x = 0.004; g.add(mir);
  for (const [y, z] of [[0.014, -0.014], [-0.014, 0.014]]) g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 12).rotateZ(Math.PI / 2), M.steel), -0.024, y, z));
  const pm = postMount(axisH - 0.02); pm.position.y = -axisH; g.add(pm);
  return g;
}

/** Parlayan ışın: çekirdek + hale (toplamsal). set(a, b) iki uç noktası. */
export function glowBeam(color = 0xff2a1a, r = 0.0012) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  const mk = (op, s) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    m.userData.s = s; m.userData.noCast = true; m.userData.noAO = true; m.raycast = () => {};
    return m;
  };
  const g = new THREE.Group();
  const core = mk(1, 1), halo = mk(0.18, 4), halo2 = mk(0.06, 11);
  g.add(halo2, halo, core);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
  g.userData.set = (a, b) => {
    A.copy(a); B.copy(b);
    const L = A.distanceTo(B);
    q.setFromUnitVectors(Y, B.clone().sub(A).normalize());
    for (const m of [core, halo, halo2]) { m.position.copy(A).add(B).multiplyScalar(0.5); m.quaternion.copy(q); m.scale.set(r * m.userData.s, L, r * m.userData.s); }
  };
  g.userData.color = (c) => { for (const m of [core, halo, halo2]) m.material.color.set(c); };
  return g;
}
/** Yumuşak parlama noktası (açıklıktaki ışıma) */
let _glowTex = null;
export function softTex() {
  if (_glowTex) return _glowTex;
  _glowTex = canvasTex(64, 64, (c) => {
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr; c.fillRect(0, 0, 64, 64);
  });
  _glowTex.colorSpace = THREE.NoColorSpace;
  return _glowTex;
}
export function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  s.scale.setScalar(size); s.raycast = () => {};
  return s;
}

/**
 * Havadaki toz: ışın içinden geçerken parlayan yumuşak noktalar. box: [x0,y0,z0,x1,y1,z1] (ebeveyn koordinatı).
 * update(t, light) — light(x, y, z, outColor) noktadaki ışın parlaklığını outColor'a yazar.
 */
export function dustMotes({ count = 500, box, size = 0.004, seed = 7 } = {}) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const base = new Float32Array(count * 3), ph = new Float32Array(count * 3);
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 3; k++) { base[i * 3 + k] = box[k] + rnd() * (box[k + 3] - box[k]); ph[i * 3 + k] = rnd() * 6.283; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: softTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  pts.frustumCulled = false; pts.userData.noAO = true; pts.raycast = () => {};
  const c = new THREE.Color(), span = [box[3] - box[0], box[4] - box[1], box[5] - box[2]];
  const amp = Math.min(span[0], span[1], span[2]) * 0.08;
  function update(t, light) {
    for (let i = 0; i < count; i++) {
      const j = i * 3;
      // yavaş süzülme + çok hafif çökme; kutunun içinde sarmalanır
      let x = base[j] + Math.sin(t * 0.13 + ph[j]) * amp + t * 0.004 * span[0] * Math.sin(ph[j + 1]);
      let y = base[j + 1] + Math.sin(t * 0.11 + ph[j + 1]) * amp - t * 0.003 * span[1];
      let z = base[j + 2] + Math.sin(t * 0.17 + ph[j + 2]) * amp;
      x = box[0] + (((x - box[0]) % span[0]) + span[0]) % span[0];
      y = box[1] + (((y - box[1]) % span[1]) + span[1]) % span[1];
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
      c.setRGB(0, 0, 0);
      light(x, y, z, c);
      const tw = 0.6 + 0.4 * Math.sin(t * 1.7 + ph[j] * 3.0);
      col[j] = c.r * tw; col[j + 1] = c.g * tw; col[j + 2] = c.b * tw;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
  return { points: pts, update };
}
