// Laboratuvar / mutfak / optik masası seti (yerel yardımcı, metre ölçeğinde): seramik fayans, cilalı taş, epoksi tezgâh,
// optik delikli tabla malzemeleri; cam kap ve menisküslü sıvı geometrisi; modellenmiş oda (tezgâh, dolaplar, fayans duvar,
// raf, pencere). Diğer laboratuvar simülasyonlarına kopyalanır (çapraz import yok).
import { THREE, mat, procedural, RoundedBoxGeometry } from '@core';

// --- Malzemeler ---
/** Seramik fayans: derz, karo başına ton farkı, sırlı parlaklık. size: karo kenarı (m) */
export const tiles = ({ color = 0xe9ebe8, grout = 0xb9b6ae, size = 0.15, scale = 1, gloss = 1 } = {}) => procedural({
  key: 'lab-tiles', physical: true, scale, bump: 0.004,
  params: { color, roughness: 0.2, clearcoat: 0.6 * gloss, clearcoatRoughness: 0.12 },
  uniforms: { uGrout: { value: new THREE.Color(grout) }, uSize: { value: size } },
  pattern: `
    vec3 a = axisDominant(pn); vec2 uv = (a.x > 0.5 ? p.zy : (a.y > 0.5 ? p.xz : p.xy))/uSize;
    vec2 f = fract(uv), id = floor(uv);
    float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    float w = max(fwidth(uv.x), fwidth(uv.y));
    float g = smoothstep(0.018, 0.018 + w + 0.01, e);
    float n = fbm3(p*6.0, 3), tint = h13(vec3(id, 1.7));
    vec3 tile = col*(0.93 + 0.08*tint + 0.05*(n - 0.5));
    col = mix(uGrout*(0.8 + 0.3*n), tile, g);
    rough = mix(0.85, 0.16 + 0.08*n, g);
    h = g*0.7 + smoothstep(0.0, 0.12, e)*0.3;`,
});
/** Cilalı taş (kuvars / granit) tezgâh: benek + damar */
export const stone = ({ color = 0xd9d4ca, scale = 1, speck = 1 } = {}) => procedural({
  key: 'lab-stone', physical: true, scale, bump: 0.002,
  params: { color, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.08 },
  uniforms: { uSpeck: { value: speck } },
  pattern: `
    float n = fbm3(p*9.0, 4), v = fbm3(p*vec3(3.0, 3.0, 9.0) + 4.0, 5);
    float s1 = smoothstep(0.72, 0.8, vn3(p*260.0)), s2 = smoothstep(0.75, 0.82, vn3(p*170.0 + 7.0));
    col *= 0.9 + 0.16*n;
    col = mix(col, col*0.35, s1*0.7*uSpeck);
    col = mix(col, vec3(0.95), s2*0.25*uSpeck);
    col = mix(col, col*0.8, smoothstep(0.62, 0.7, v)*0.5);
    rough = 0.18 + 0.1*n;
    h = n*0.2 - s1*0.2;`,
});
/** Laboratuvar tezgâhı: kimyasala dayanıklı koyu epoksi reçine (saten) */
export const epoxy = ({ color = 0x1d2023, scale = 1 } = {}) => procedural({
  key: 'lab-epoxy', physical: true, scale, bump: 0.002,
  params: { color, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.3 },
  pattern: `
    float n = fbm3(p*4.0, 4), sp = vn3(p*300.0);
    col *= 0.85 + 0.25*n + 0.08*(sp - 0.5);
    rough = 0.32 + 0.14*n + 0.05*sp;
    h = n*0.3 + sp*0.1;`,
});
/** Optik tabla: siyah eloksallı alüminyum, 25 mm aralıklı M6 delik ızgarası */
export const breadboard = ({ color = 0x16181b, scale = 1, pitch = 0.025 } = {}) => procedural({
  key: 'lab-breadboard', scale, bump: 0.003,
  params: { color, roughness: 0.42, metalness: 0.55 },
  uniforms: { uPitch: { value: pitch } },
  pattern: `
    vec2 uv = p.xz/uPitch; vec2 f = fract(uv) - 0.5; float d = length(f);
    float w = fwidth(d)*1.5;
    float hole = (1.0 - smoothstep(0.13 - w, 0.13 + w, d))*aaW(vec3(uv, 0.0))*step(0.9, pn.y);
    float n = fbm3(p*5.0, 3), br = vn3(vec3(p.x*400.0, p.y*4.0, p.z*4.0));
    col *= 0.85 + 0.25*n + 0.08*br;
    col = mix(col, vec3(0.004), hole);
    rough = mix(0.38 + 0.1*n, 0.9, hole);
    metal = mix(0.55, 0.0, hole);
    h = -hole + br*0.1;`,
});

// --- Geometri ---
/**
 * Cam kap: dış profil [[r, y], ...] (alttan ağıza) → cidar kalınlığı olan kapalı dönel yüzey (yuvarlatılmış ağız).
 * thick: cidar (m). Alt ortadan başlamalı (r = 0).
 */
export function glassGeometry(profile, thick, segs = 64) {
  const out = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const top = out[out.length - 1];
  const pts = [...out];
  // ağız: yarım daire
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    pts.push(new THREE.Vector2(top.x - thick / 2 + Math.cos(a) * thick / 2, top.y + Math.sin(a) * thick / 2));
  }
  const inner = profile.slice(1).map(([r, y], i) => new THREE.Vector2(Math.max(r - thick, 0.0005), i === 0 ? y + thick : y)).reverse();
  pts.push(...inner, new THREE.Vector2(0.0005, profile[0][1] + thick));
  const g = new THREE.LatheGeometry(pts, segs);
  g.computeVertexNormals();
  return g;
}
/** İç yarıçap fonksiyonu rOf(y) ile sıvı: taban y0'dan level'a; kenarda yukarı kıvrılan (içbükey) menisküs. */
export function liquidGeometry(rOf, y0, level, { meniscus = 0.003, segs = 64, steps = 24 } = {}) {
  const pts = [new THREE.Vector2(0.0001, y0)];
  const ys = Math.max(2, steps);
  for (let i = 0; i <= ys; i++) { const y = y0 + (level - y0) * (i / ys); pts.push(new THREE.Vector2(rOf(y), y)); }
  const R = rOf(level);
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(R * (1 - t), level + meniscus * Math.exp(-t * 7) - meniscus * 0.05));
  }
  // yukarıdaki son noktalar içe doğru; lathe sırası: dış → üst merkez
  pts.splice(ys + 2, 0, new THREE.Vector2(R, level + meniscus));
  return new THREE.LatheGeometry(pts, segs);
}
/** Cam malzemesi (gerçek kırılma); gölge düşürmez, AO'ya girmez */
export function glassMesh(geo, o = {}) {
  const m = new THREE.Mesh(geo, mat.glass({ thickness: 0.004, rough: 0.02, ...o }));
  m.userData.noCast = true; m.userData.noAO = true;
  return m;
}
export function liquidMesh(geo, color, density = 0.05, o = {}) {
  const lm = mat.liquid({ color, density, ...o });
  lm.thickness = 0.05;
  const m = new THREE.Mesh(geo, lm);
  m.userData.noCast = true; m.userData.noAO = true;
  return m;
}

// Şişe etiketi: kâğıt, yazı ve renk şeridi
function labelTex(text, stripe) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160;
  const g = c.getContext('2d');
  g.fillStyle = '#f3efe4'; g.fillRect(0, 0, 256, 160);
  g.fillStyle = stripe; g.fillRect(0, 0, 256, 26);
  g.fillStyle = '#1f2328'; g.font = '700 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 88);
  g.font = '500 18px system-ui, sans-serif'; g.fillStyle = '#555'; g.fillText('SimLab · reaktif', 128, 136);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
/** Reaktif şişesi (m): cam gövde (amber ya da şeffaf), sıvı, kapak ve etiket. h: gövde yüksekliği */
export function reagentBottle({ h = 0.16, r = 0.035, amber = false, liquid = 0xf5f3ea, level = 0.7, label = '', stripe = '#2f6fb1', cap = 0x1c1f24 } = {}) {
  const g = new THREE.Group();
  const neckR = r * 0.42, sh = h * 0.78;
  const prof = [[0, 0], [r * 0.92, 0], [r, 0.006], [r, sh], [r * 0.8, sh + r * 0.35], [neckR, h - 0.02], [neckR, h]];
  const glass = glassMesh(glassGeometry(prof, 0.0025, 48), amber ? { tint: 0x7a3a0c, thickness: 0.006 } : {});
  if (amber) { glass.material.attenuationColor = new THREE.Color(0x8a4a10); glass.material.attenuationDistance = 0.012; glass.material.color = new THREE.Color(0xffcf99); }
  g.add(glass);
  if (level > 0) {
    const rOf = (y) => (y < sh ? r - 0.0028 : Math.max(neckR - 0.003, (r - 0.0028) - (y - sh) * ((r - neckR) / (h - 0.02 - sh))));
    g.add(liquidMesh(liquidGeometry(rOf, 0.003, Math.max(0.01, sh * level), { meniscus: 0.002, segs: 40 }), liquid, 0.06));
  }
  const capM = new THREE.Mesh(new THREE.CylinderGeometry(neckR + 0.003, neckR + 0.003, 0.022, 32), mat.plastic({ color: cap, gloss: 0.3 }));
  capM.position.y = h + 0.009; g.add(capM);
  const ribs = new THREE.Mesh(new THREE.TorusGeometry(neckR + 0.003, 0.0012, 6, 40), capM.material);
  ribs.rotation.x = Math.PI / 2; ribs.position.y = h + 0.019; g.add(ribs);
  if (label) {
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.0006, r + 0.0006, sh * 0.5, 40, 1, true, -0.9, 1.8),
      new THREE.MeshStandardMaterial({ map: labelTex(label, stripe), roughness: 0.75 }));
    lab.position.y = sh * 0.42; lab.rotation.y = Math.PI / 2 - 0.9 + 0.9;
    g.add(lab);
  }
  return g;
}

/**
 * Modellenmiş oda: zemin, fayans duvar (üstü boyalı), tezgâh (epoksi / taş / ahşap üst), dolap kapakları, kulp, süpürgelik,
 * duvar rafı (şişeler) ve aydınlık pencere. Tüm ölçüler metre; tezgâh üstü y = benchH.
 * style: 'lab' | 'kitchen' | 'optics'
 */
export function labRoom(scene, { width = 3.2, depth = 0.75, benchH = 0.9, style = 'lab', wallZ, shelf = true, window: win = true, top, ceiling = true, lamp = 8 } = {}) {
  const room = new THREE.Group();
  scene.add(room);
  const wz = wallZ ?? -depth / 2 - 0.01;
  const kitchen = style === 'kitchen';
  // Zemin
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10).rotateX(-Math.PI / 2),
    kitchen ? tiles({ color: 0xcfc7b8, grout: 0x8f877b, size: 0.4, gloss: 0.3 }) : mat.concrete({ color: 0x8d9296, stains: 0.2 }));
  floor.position.set(0, 0.001, wz + 5);
  room.add(floor);
  // Duvar: fayans + boyalı üst kısım
  const tileH = benchH + (kitchen ? 0.6 : 0.75);
  const wallT = new THREE.Mesh(new THREE.BoxGeometry(12, tileH, 0.04), tiles(kitchen ? { color: 0xf2efe6, grout: 0xc9c2b4, size: 0.1 } : { color: 0xe6ebee, grout: 0xaab2b6, size: 0.15 }));
  wallT.position.set(0, tileH / 2, wz - 0.02);
  const wallP = new THREE.Mesh(new THREE.BoxGeometry(12, 3.2 - tileH, 0.04), mat.concrete({ color: kitchen ? 0xe9dfcf : 0xdfe3e4, stains: 0.05, scale: 0.5 }));
  wallP.position.set(0, tileH + (3.2 - tileH) / 2, wz - 0.03);
  room.add(wallT, wallP);
  // Tezgâh üstü
  const topMat = top || (kitchen ? stone({ color: 0xd8d2c6 }) : style === 'optics' ? epoxy({ color: 0x2a2d31 }) : epoxy());
  const worktop = new THREE.Mesh(new RoundedBoxGeometry(width, 0.035, depth, 3, 0.008), topMat);
  worktop.position.set(0, benchH - 0.0175, wz + depth / 2);
  room.add(worktop);
  // Dolaplar: gövde + kapaklar + kulplar + süpürgelik
  const carcassMat = mat.paintedMetal({ color: kitchen ? 0x6d7f73 : 0xc9ced1, wear: 0.03 });
  const doorMat = kitchen ? mat.wood({ color: 0x8a6440, varnish: true }) : mat.paintedMetal({ color: 0xe4e7e8, wear: 0.02 });
  const handleMat = mat.brushedMetal({ color: 0xc9ccd0 });
  const cabH = benchH - 0.035 - 0.1;
  const carcass = new THREE.Mesh(new THREE.BoxGeometry(width - 0.04, cabH, depth - 0.06), carcassMat);
  carcass.position.set(0, 0.1 + cabH / 2, wz + depth / 2 - 0.02);
  room.add(carcass);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(width - 0.08, 0.1, depth - 0.12), mat.rubber({ color: 0x1f2124 }));
  plinth.position.set(0, 0.05, wz + depth / 2 - 0.04);
  room.add(plinth);
  const n = Math.max(2, Math.round(width / 0.6));
  const dw = (width - 0.04) / n;
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + 0.02 + dw * (i + 0.5);
    const drawer = i % 3 === 1;
    const parts = drawer ? [[cabH * 0.28, cabH * 0.86], [cabH * 0.28, cabH * 0.56], [cabH * 0.4, cabH * 0.2]] : [[cabH - 0.006, cabH / 2]];
    for (const [hh, yc] of parts) {
      const door = new THREE.Mesh(new RoundedBoxGeometry(dw - 0.006, hh - 0.006, 0.02, 2, 0.004), doorMat);
      door.position.set(x, 0.1 + yc, wz + depth - 0.04);
      room.add(door);
      const hd = new THREE.Mesh(new RoundedBoxGeometry(drawer ? dw * 0.45 : 0.012, drawer ? 0.012 : 0.16, 0.02, 2, 0.005), handleMat);
      hd.position.set(drawer ? x : x + (i % 2 ? -1 : 1) * (dw / 2 - 0.05), 0.1 + (drawer ? yc + hh / 2 - 0.035 : yc + cabH * 0.28), wz + depth - 0.018);
      room.add(hd);
    }
  }
  // Duvar rafı + şişeler
  if (shelf) {
    const sy = benchH + 0.55;
    const board = new THREE.Mesh(new RoundedBoxGeometry(Math.min(width, 2.4), 0.025, 0.2, 2, 0.006), kitchen ? mat.wood({ color: 0x9a7048 }) : mat.paintedMetal({ color: 0xd6d9db, wear: 0.05 }));
    board.position.set(-width * 0.12, sy, wz + 0.1);
    room.add(board);
    for (const bx of [-0.9, 0.7]) {
      const br = new THREE.Mesh(new RoundedBoxGeometry(0.015, 0.14, 0.18, 1, 0.004), mat.brushedMetal());
      br.position.set(-width * 0.12 + bx, sy - 0.08, wz + 0.09); room.add(br);
    }
    const items = kitchen
      ? [[0.12, 0.04, true, 0xc98a3c, 'Tuz', '#b23'], [0.14, 0.03, false, 0xf4e7c5, 'Şeker', '#2a6'], [0.2, 0.04, true, 0x6b3b12, 'Sirke', '#a52'], [0.1, 0.035, false, 0xf1efe8, 'Karbonat', '#27a']]
      : [[0.18, 0.04, true, 0x9b5a1a, 'HNO₃', '#c33'], [0.16, 0.035, false, 0xf5f3ea, 'NaCl', '#27a'], [0.2, 0.045, true, 0x6b3b12, 'KMnO₄', '#739'], [0.14, 0.03, false, 0xeaf4ff, 'EtOH', '#2a6'], [0.17, 0.038, false, 0xfffbe9, 'H₂SO₄', '#c80']];
    items.forEach(([h, r, amber, liq, lab, s], i) => {
      const b = reagentBottle({ h, r, amber, liquid: liq, level: 0.6 + 0.1 * (i % 3), label: lab, stripe: s });
      b.position.set(-width * 0.12 - 0.85 + i * (1.7 / (items.length - 1)) + (i % 2) * 0.03, sy + 0.0125, wz + 0.1 + ((i % 2) - 0.5) * 0.04);
      b.rotation.y = (i * 0.7) % 1 - 0.5;
      room.add(b);
    });
  }
  // Pencere: çerçeve + parlak gökyüzü paneli (bloom)
  if (win) {
    const wx = width * 0.5 + 0.55, wy = benchH + 0.9, W = 1.1, H = 1.1;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; void main(){
        vec3 top = vec3(0.55, 0.72, 1.0)*2.2, hor = vec3(1.0, 0.97, 0.92)*3.2;
        vec3 c = mix(hor, top, smoothstep(0.1, 1.0, vUv.y));
        float trees = smoothstep(0.26, 0.24, vUv.y - 0.05*sin(vUv.x*23.0) - 0.03*sin(vUv.x*51.0 + 1.0));
        c = mix(c, vec3(0.25, 0.32, 0.2), trees);
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    sky.position.set(wx, wy, wz - 0.035);
    room.add(sky);
    const frameMat = mat.paintedMetal({ color: 0xf1f1ee, wear: 0.02 });
    const bar = (w, h, x, y) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, 0.06, 2, 0.01), frameMat); m.position.set(wx + x, wy + y, wz - 0.01); room.add(m); };
    bar(W + 0.1, 0.05, 0, H / 2); bar(W + 0.1, 0.05, 0, -H / 2); bar(0.05, H, -W / 2, 0); bar(0.05, H, W / 2, 0); bar(0.035, H, 0, 0); bar(W, 0.035, 0, 0.1);
    const sill = new THREE.Mesh(new RoundedBoxGeometry(W + 0.2, 0.03, 0.14, 2, 0.008), frameMat);
    sill.position.set(wx, wy - H / 2 - 0.03, wz + 0.05); room.add(sill);
  }
  // Tavan + gömme LED paneller (görünür ışıklı yüzey + yumuşak tepe ışığı; gölge düşürmez)
  if (ceiling) {
    const cy = 2.9;
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(12, 8).rotateX(Math.PI / 2), mat.concrete({ color: 0xeeeeea, stains: 0.02, scale: 0.5 }));
    ceil.position.set(0, cy, wz + 4); ceil.userData.noCast = true; ceil.userData.noAO = true;
    room.add(ceil);
    const panelMat = mat.glow({ color: kitchen ? 0xfff1dc : 0xf4f7ff, intensity: 3 });
    const trimMat = mat.paintedMetal({ color: 0xe8e8e6, wear: 0.01 });
    for (const px of [-width * 0.28, width * 0.28]) {
      const trim = new THREE.Mesh(new RoundedBoxGeometry(0.64, 0.02, 0.64, 2, 0.005), trimMat);
      trim.position.set(px, cy - 0.01, wz + depth * 0.9); trim.userData.noCast = true; room.add(trim);
      const pan = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.58).rotateX(Math.PI / 2), panelMat);
      pan.position.set(px, cy - 0.021, wz + depth * 0.9); pan.userData.noCast = true; room.add(pan);
      if (lamp > 0) {
        const L = new THREE.PointLight(kitchen ? 0xfff0dc : 0xf2f5ff, lamp, 0, 2);
        L.position.set(px, cy - 0.15, wz + depth * 0.9);
        room.add(L);
      }
    }
  }
  return { group: room, benchH, wallZ: wz, worktop };
}

/** Laboratuvar sehpası: dökme taban, paslanmaz çubuk (m). h: çubuk boyu */
export function retortStand(h = 0.6) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.014, 0.13, 3, 0.005), mat.paintedMetal({ color: 0x2f3b45, wear: 0.25 }));
  base.position.y = 0.007; g.add(base);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, h, 24), mat.brushedMetal({ color: 0xd0d3d7, rough: 0.22 }));
  rod.position.set(0, h / 2, -0.04); g.add(rod);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 8), rod.material);
  cap.position.set(0, h, -0.04); g.add(cap);
  return g;
}
/** Bosa kıskacı + kol (m), çubuğa takılı; y yüksekliğinde, reach uzunlukta +z'ye uzanır */
export function clamp3(y, reach = 0.06, jawR = 0.012) {
  const g = new THREE.Group();
  const boss = new THREE.Mesh(new RoundedBoxGeometry(0.022, 0.022, 0.022, 2, 0.004), mat.paintedMetal({ color: 0x3b4650, wear: 0.3 }));
  boss.position.set(0, y, -0.04); g.add(boss);
  const screw = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 12), mat.brushedMetal());
  screw.rotation.z = Math.PI / 2; screw.position.set(0.018, y, -0.04); g.add(screw);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, reach, 12), mat.brushedMetal({ color: 0xc8ccd0 }));
  arm.rotation.x = Math.PI / 2; arm.position.set(0, y, -0.04 + reach / 2); g.add(arm);
  const jaw = new THREE.Mesh(new THREE.TorusGeometry(jawR, 0.0035, 10, 32, Math.PI * 1.6), mat.rubber({ color: 0x3a3d40 }));
  jaw.rotation.set(Math.PI / 2, 0, Math.PI * 0.7); jaw.position.set(0, y, -0.04 + reach + jawR * 0.6); g.add(jaw);
  return g;
}
