// Arka plan donanımı: duvar rafları ve cam malzeme, pencere, çeker ocak (sahneye derinlik). Ölçüler metre, duvar z = wz.
import { THREE, RoundedBoxGeometry, mat } from '@core';
import { reagentBottle, epoxy } from './labkit.js';

const V2 = (a) => a.map(([x, y]) => new THREE.Vector2(x, y));

// Ucuz arka plan camı (kırılmasız): ince, parlak, hafif yeşilimsi kenarlı
function bgGlass() {
  return new THREE.MeshPhysicalMaterial({ color: 0xe9f4f2, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22,
    clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, depthWrite: false, side: THREE.DoubleSide });
}
const beakerG = (r, h) => new THREE.LatheGeometry(V2([[0, 0], [r * 0.94, 0], [r, 0.004], [r, h], [r * 1.08, h + 0.003]]), 28);
const flaskG = (r, h) => new THREE.LatheGeometry(V2([[0, 0], [r * 0.95, 0], [r, 0.006], [r * 0.9, h * 0.35], [r * 0.3, h * 0.78], [r * 0.24, h * 0.8], [r * 0.24, h], [r * 0.3, h + 0.003]]), 28);
const volG = (r, h) => new THREE.LatheGeometry(V2([[0, 0], [r * 0.8, 0], [r, r * 0.6], [r * 0.9, r * 1.5], [r * 0.2, r * 2.1], [r * 0.18, h], [r * 0.22, h + 0.003]]), 28);
const cylG = (r, h) => new THREE.LatheGeometry(V2([[0, 0], [r, 0], [r, h], [r * 1.15, h + 0.004]]), 20);

/** Duvardan aşağı sönen yumuşak temas gölgesi (gerçek gölge yerine; büyük sert gölge olmasın) */
function contactShade(w, h) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.2)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.userData.noCast = true; m.userData.noAO = true;
  return m;
}

export function dressLab(scene, { wz, benchH, width }) {
  const g = new THREE.Group(); scene.add(g);
  const glassM = bgGlass();
  const liquids = [0x9fd3f0, 0xf2e3a0, 0xe7a0c8, 0xbfe6b8, 0xf4f4f0];
  const liqM = liquids.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, transparent: true, opacity: 0.55, depthWrite: false }));
  const add = (o, x, y, z) => { o.position.set(x, y, z); g.add(o); return o; };

  // --- Duvar rafları (iki kat) ---
  const shelfM = mat.paintedMetal({ color: 0xd8dcde, wear: 0.04 }), brM = mat.paintedMetal({ color: 0xb4b9bd, wear: 0.02 });
  const x0 = -1.02, x1 = -0.2, sw = x1 - x0, cx = (x0 + x1) / 2;
  const rail = new THREE.BoxGeometry(0.018, 0.62, 0.012);
  for (const x of [x0 + 0.06, x1 - 0.06]) add(new THREE.Mesh(rail, brM), x, benchH + 0.66, wz + 0.006);
  for (const [k, y] of [[0, benchH + 0.42], [1, benchH + 0.72]]) {
    add(new THREE.Mesh(new RoundedBoxGeometry(sw, 0.02, 0.2, 2, 0.005), shelfM), cx, y, wz + 0.1);
    add(new THREE.Mesh(new RoundedBoxGeometry(sw, 0.03, 0.006, 1, 0.002), shelfM), cx, y + 0.012, wz + 0.197); // ön dudak
    for (const x of [x0 + 0.06, x1 - 0.06]) add(new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.1, 0.18, 1, 0.003), brM), x, y - 0.055, wz + 0.095);
    const sh = add(contactShade(sw * 0.98, 0.16), cx, y - 0.09, wz + 0.002);
    sh.renderOrder = 1;
    // Cam malzeme dizisi
    const items = k === 0
      ? [['b', 0.035, 0.07], ['e', 0.04, 0.1], ['c', 0.012, 0.2], ['b', 0.028, 0.055], ['v', 0.03, 0.2], ['b', 0.045, 0.09], ['e', 0.03, 0.08], ['c', 0.01, 0.16]]
      : [['r'], ['b', 0.04, 0.08], ['v', 0.022, 0.15], ['r'], ['e', 0.045, 0.11], ['b', 0.03, 0.06], ['r']];
    let x = x0 + 0.08;
    items.forEach(([t, r, h], i) => {
      const z = wz + 0.1 + ((i % 3) - 1) * 0.035;
      if (t === 'r') {
        const b = reagentBottle({ h: 0.14 + (i % 2) * 0.03, r: 0.03, amber: i % 2 === 0, liquid: 0xf2efe6, level: 0.5 + 0.15 * (i % 3), label: ['KCl', 'CuSO₄', 'NaHCO₃', 'AgNO₃'][i % 4], stripe: ['#2f6fb1', '#0e7490', '#16a34a', '#7c3aed'][i % 4] });
        b.traverse((o) => { if (o.isMesh) { o.userData.noCast = true; } });
        b.rotation.y = 0.4 + i; add(b, x + 0.03, y + 0.01, z); x += 0.1; return;
      }
      const geo = t === 'b' ? beakerG(r, h) : t === 'e' ? flaskG(r, h) : t === 'v' ? volG(r, h) : cylG(r, h);
      const m = add(new THREE.Mesh(geo, glassM), x + r, y + 0.01, z);
      m.userData.noCast = true; m.userData.noAO = true; m.renderOrder = 3;
      if (i % 3 !== 2) {
        const lh = (t === 'v' ? r * 1.2 : h * (0.25 + 0.15 * (i % 3)));
        const lr = t === 'v' ? r * 0.85 : t === 'e' ? r * 0.88 : r * 0.9;
        const l = add(new THREE.Mesh(new THREE.CylinderGeometry(lr, lr * (t === 'e' ? 1.05 : 1), lh, 20), liqM[i % liqM.length]), x + r, y + 0.012 + lh / 2, z);
        l.userData.noCast = true; l.userData.noAO = true; l.renderOrder = 2;
      }
      x += r * 2 + 0.03;
    });
  }

  // --- Pencere (dar, uzun; parlak gök ve ağaçlar) ---
  {
    const wx = -1.42, W = 0.6, y0 = benchH + 0.3, H = 1.25, wy = y0 + H / 2;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }',
      fragmentShader: `varying vec2 vUv; void main(){
        vec3 top = vec3(0.6, 0.75, 1.0)*1.9, hor = vec3(1.0, 0.97, 0.92)*2.4;
        vec3 c = mix(hor, top, smoothstep(0.2, 1.0, vUv.y));
        float edge = 0.34 + 0.06*sin(vUv.x*19.0) + 0.04*sin(vUv.x*47.0 + 1.0) + 0.02*sin(vUv.x*113.0);
        float trees = smoothstep(edge + 0.01, edge - 0.01, vUv.y);
        vec3 tc = mix(vec3(0.16, 0.24, 0.13), vec3(0.34, 0.45, 0.24), smoothstep(0.0, edge, vUv.y));
        c = mix(c, tc*1.3, trees);
        c = mix(c, vec3(0.7, 0.68, 0.64)*1.4, smoothstep(0.1, 0.08, vUv.y));
        gl_FragColor = vec4(c, 1.0); }`,
    }));
    sky.userData.noCast = true; sky.userData.noAO = true;
    add(sky, wx, wy, wz + 0.002);
    const fm = mat.paintedMetal({ color: 0xf0f0ed, wear: 0.02 });
    const bar = (w, h, x, y, d = 0.07) => add(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, 0.008), fm), wx + x, wy + y, wz + 0.02);
    bar(W + 0.08, 0.045, 0, H / 2); bar(W + 0.08, 0.045, 0, -H / 2); bar(0.045, H, -W / 2, 0); bar(0.045, H, W / 2, 0); bar(W, 0.03, 0, 0.18);
    // Denizlik
    add(new THREE.Mesh(new RoundedBoxGeometry(W + 0.12, 0.025, 0.1, 2, 0.006), mat.ceramic({ color: 0xe9e6df })), wx, y0 - 0.035, wz + 0.05);
    // Pencereden içeri vuran soluk gün ışığı (tezgâh üstünde ılık leke)
    const L = new THREE.PointLight(0xfff4e6, 0.6, 2.2, 2); L.position.set(wx, y0 + 0.5, wz + 0.25); g.add(L);
  }

  // --- Çeker ocak (tezgâhın bittiği yerde, yere oturur) ---
  {
    const hx0 = -width / 2 - 0.04, HW = 1.2, hx = hx0 - HW / 2, D = 0.86, zc = wz + D / 2, top = 2.35;
    const body = mat.paintedMetal({ color: 0xe9ebea, wear: 0.03 }), trim = mat.paintedMetal({ color: 0x3d4a57, wear: 0.05 });
    const inner = mat.plastic({ color: 0xf2f3f0, gloss: 0.4 }), post = mat.brushedMetal({ color: 0xc0c4c8, rough: 0.3 });
    // alt dolap
    add(new THREE.Mesh(new RoundedBoxGeometry(HW, benchH - 0.02, D - 0.06, 2, 0.01), body), hx, (benchH - 0.02) / 2, zc - 0.02);
    for (const s of [-1, 1]) add(new THREE.Mesh(new RoundedBoxGeometry(HW / 2 - 0.02, benchH - 0.14, 0.02, 2, 0.004), body), hx + s * HW / 4, benchH / 2 + 0.02, zc + D / 2 - 0.04);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), post), hx - 0.03, benchH * 0.75, zc + D / 2 - 0.025);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), post), hx + 0.03, benchH * 0.75, zc + D / 2 - 0.025);
    // çalışma yüzeyi (epoksi, kenar dudaklı)
    add(new THREE.Mesh(new RoundedBoxGeometry(HW, 0.035, D, 2, 0.008), epoxy({ color: 0x2b2f34 })), hx, benchH - 0.017, zc);
    // yan duvarlar (aerodinamik ön profil)
    for (const s of [-1, 1]) {
      add(new THREE.Mesh(new RoundedBoxGeometry(0.07, top - benchH, D, 2, 0.02), body), hx + s * (HW / 2 - 0.035), (top + benchH) / 2, zc);
      add(new THREE.Mesh(new RoundedBoxGeometry(0.075, top - benchH - 0.05, 0.05, 2, 0.02), trim), hx + s * (HW / 2 - 0.035), (top + benchH) / 2 + 0.02, zc + D / 2 - 0.01);
    }
    // arka ve tavan (iç yüzey), üst kafa paneli
    add(new THREE.Mesh(new THREE.BoxGeometry(HW - 0.14, top - benchH, 0.02), inner), hx, (top + benchH) / 2, wz + 0.02);
    add(new THREE.Mesh(new THREE.BoxGeometry(HW, 0.02, D), body), hx, top, zc);
    add(new THREE.Mesh(new RoundedBoxGeometry(HW, 0.34, 0.08, 2, 0.015), body), hx, top - 0.17, zc + D / 2 - 0.03);
    // iç aydınlatma (kafa panelinin arkasında ışık şeridi) + küçük gerçek ışık
    add(new THREE.Mesh(new THREE.BoxGeometry(HW - 0.2, 0.03, 0.08), mat.glow({ color: 0xf5f8ff, intensity: 2.2 })), hx, top - 0.37, zc + 0.2);
    const L = new THREE.PointLight(0xf2f6ff, 0.8, 1.6, 2); L.position.set(hx, top - 0.5, zc); g.add(L);
    // yarı açık sürgülü cam kapak (sash) + tutamak
    const sy = benchH + 0.62, sh = 0.72;
    const sash = add(new THREE.Mesh(new THREE.BoxGeometry(HW - 0.14, sh, 0.008), new THREE.MeshPhysicalMaterial({ color: 0xdfeceb, roughness: 0.03, transparent: true, opacity: 0.16, clearcoat: 1, depthWrite: false })), hx, sy + sh / 2, zc + D / 2 - 0.05);
    sash.userData.noCast = true;
    for (const y of [sy, sy + sh]) add(new THREE.Mesh(new RoundedBoxGeometry(HW - 0.12, 0.035, 0.03, 2, 0.008), trim), hx, y, zc + D / 2 - 0.05);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, HW - 0.3, 12).rotateZ(Math.PI / 2), post), hx, sy - 0.03, zc + D / 2 - 0.02);
    // hava akışı göstergesi (yeşil)
    add(new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.05, 0.012, 1, 0.004), trim), hx + HW / 2 - 0.16, top - 0.12, zc + D / 2 + 0.015);
    add(new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.02), mat.glow({ color: 0x4ade80, intensity: 1.8 })), hx + HW / 2 - 0.16, top - 0.12, zc + D / 2 + 0.022);
    // içeride: bir iki kap ve ısıtıcı
    const glassM2 = bgGlass();
    add(new THREE.Mesh(beakerG(0.05, 0.1), glassM2), hx + 0.2, benchH, zc - 0.1).userData.noCast = true;
    add(new THREE.Mesh(flaskG(0.06, 0.16), glassM2), hx - 0.1, benchH, zc - 0.15).userData.noCast = true;
    add(new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.08, 0.2, 2, 0.01), mat.ceramic({ color: 0xdedcd6 })), hx - 0.32, benchH + 0.04, zc - 0.05);
  }
  return g;
}
