// Şehir kiti (sim klasörüne yerel yardımcı): cephe gölgelendiricili birleşik bina geometrisi (pencere ızgarası, doğrama,
// denizlik, yansıyan cam, dükkân katı, tuğla/sıva/giydirme cephe), kırma kiremit çatı, balkonlar, çatı ekipmanı,
// asfalt yollar + şerit/yaya geçidi çizgileri, kaldırım + bordür, sokak ağaçları, sokak lambaları, park etmiş araçlar.
// Birimler metre. Her şey mat.* / procedural() ya da bu dosyadaki özel MeshStandardMaterial gölgelendiricisi ile çizilir.
import { THREE, mat, procedural, RoundedBoxGeometry, NOISE3_GLSL, createVegetation, BufferGeometryUtils } from '@core';

function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export const cityRng = rng;

// ---------------------------------------------------------------- Cephe malzemesi
let FAC = null;
/** Bina cephesi: vertex özellikleri fuv (m), fsz (yüz genişliği, bina yüksekliği), fprm (kat yük., aks gen., stil, tohum), fex (dükkân, kırma çatı, tür). */
export function facadeMaterial() {
  if (FAC) return FAC;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const U = { uLit: { value: 0 }, uBump: { value: 0.05 } };
  m.userData.uniforms = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 fuv; attribute vec2 fsz; attribute vec4 fprm; attribute vec3 fex;
        varying vec2 vF; varying vec2 vSz; varying vec4 vPrm; varying vec3 vEx; varying vec3 vOP;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vF = fuv; vSz = fsz; vPrm = fprm; vEx = fex; vOP = position;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 vF; varying vec2 vSz; varying vec4 vPrm; varying vec3 vEx; varying vec3 vOP;
        uniform float uLit; uniform float uBump;
        ${NOISE3_GLSL}
        float fR, fM, fH; vec3 fE;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 wc = diffuseColor.rgb;
          float nz = fbm3(vOP*0.3, 3), nf = vn3(vOP*2.7);
          fR = 0.88; fM = 0.0; fH = 1.0; fE = vec3(0.0);
          float fh = vPrm.x, bw = vPrm.y, sty = vPrm.z, sd = vPrm.w;
          vec3 cc = wc*(0.9 + 0.18*nz);
          if (vEx.z > 0.5) {
            float W = vSz.x, Hb = vSz.y;
            float nb = max(1.0, floor(W/bw + 0.5)), cw = W/nb;
            float iu = floor(vF.x/cw), fu = vF.x/cw - iu;
            float shop = vEx.x, hip = vEx.y;
            float g0 = shop > 0.5 ? max(fh*1.3, 3.9) : fh;
            float isG = step(vF.y, g0);
            float iv = isG > 0.5 ? -1.0 : floor((vF.y - g0)/fh);
            float lh = isG > 0.5 ? g0 : fh;
            float fv = isG > 0.5 ? vF.y/g0 : (vF.y - g0)/fh - iv;
            vec2 q = vec2((fu - 0.5)*cw, (fv - 0.5)*lh);
            // Tuğla örgüsü (stil 2) ve beton kat kirişi bantları
            if (sty > 1.5 && sty < 2.5) {
              float row = floor(vF.y*13.0);
              vec2 bu = vec2(vF.x*4.0 + 0.5*mod(row, 2.0), vF.y*13.0);
              vec2 bf = fract(bu);
              float mm = smoothstep(0.0, 0.07, min(bf.x, 1.0 - bf.x)*0.5)*smoothstep(0.0, 0.1, min(bf.y, 1.0 - bf.y));
              float t = h13(vec3(floor(bu), 3.0 + sd));
              cc = mix(vec3(0.62, 0.6, 0.56)*(0.85 + 0.2*nf), wc*(0.7 + 0.45*t)*(0.85 + 0.25*nz), mm);
              fH = 0.85 + 0.15*mm; fR = mix(0.95, 0.85, mm);
            } else if (sty < 0.5 && isG < 0.5 && fv < 0.07) {
              cc *= 0.9; fH = 1.05; // döşeme kenarı bandı
            }
            bool par = hip < 0.5 && vF.y > Hb - 1.05;
            if (vF.y > Hb - 0.14 && hip < 0.5) { cc = vec3(0.72, 0.71, 0.68)*(0.85 + 0.2*nz); fH = 1.2; fR = 0.8; } // parapet kapağı
            else if (!par) {
              vec2 hw; float oy;
              bool store = isG > 0.5 && shop > 0.5;
              if (store) { hw = vec2(cw*0.5 - 0.32, lh*0.34); oy = -lh*0.1; }
              else if (sty < 0.5) { hw = vec2(min(0.72, cw*0.3), lh*0.25); oy = 0.1; }
              else if (sty < 1.5) { hw = vec2(cw*0.5 - 0.07, lh*0.5 - 0.46); oy = 0.14; }
              else { hw = vec2(min(0.58, cw*0.24), lh*0.29); oy = 0.1; }
              vec2 dq = abs(q - vec2(0.0, oy)) - hw;
              float dd = max(dq.x, dq.y);
              float fw = sty > 0.5 && sty < 1.5 ? 0.045 : 0.065;
              float hsh = h13(vec3(iu + 1.7, iv + 3.1, sd*97.0)), hs2 = h13(vec3(iu*1.3 + 7.1, iv*0.7 + 2.0, sd*31.0));
              if (dd < 0.0) {
                float mull = store ? abs(fract((q.x + hw.x)/(2.0*hw.x/3.0)) - 0.5)*(2.0*hw.x/3.0) : abs(q.x);
                bool frame = dd > -fw || mull < 0.035 || (store && abs(q.y - oy - hw.y + 0.55) < 0.03);
                if (frame) {
                  cc = sty > 0.5 && sty < 1.5 ? vec3(0.1, 0.105, 0.11) : (sty > 1.5 && hsh > 0.5 ? vec3(0.28, 0.18, 0.11) : vec3(0.86, 0.86, 0.84));
                  fR = 0.45; fM = sty > 0.5 && sty < 1.5 ? 0.7 : 0.0; fH = 0.82;
                } else {
                  // Cam: koyu iç mekân + gökyüzü yansıması (metalik ağırlık ile F0 ≈ 0,2)
                  float yy = (q.y - oy + hw.y)/(2.0*hw.y);
                  vec3 inside = vec3(0.26, 0.29, 0.31)*(0.8 + 0.4*hs2);
                  cc = sty > 0.5 && sty < 1.5 ? vec3(0.22, 0.3, 0.33) : inside;
                  fM = 0.9; fR = 0.04 + 0.05*hs2; fH = 0.55;
                  if (!store && hsh < 0.38 && yy > 0.35 + 0.4*hs2) { cc = mix(vec3(0.62, 0.57, 0.48), vec3(0.8, 0.8, 0.78), hs2); fM = 0.55; fR = 0.3; } // perde/jaluzi
                  if (store) { cc = vec3(0.24, 0.27, 0.28); fM = 0.85; }
                  cc *= 0.8 + 0.2*smoothstep(-fw, -fw - 0.12, dd); // pervaz gölgesi
                  float lit = step(hsh*0.97 + hs2*0.03, uLit*0.7);
                  fE = vec3(1.0, 0.7, 0.42)*lit*(0.8 + 0.8*hs2)*(store ? 2.0 : 1.0);
                }
              } else if (!store && dq.x < 0.06 && q.y - oy < -hw.y && q.y - oy > -hw.y - 0.07) {
                cc = vec3(0.8, 0.79, 0.76)*(0.9 + 0.1*nf); fH = 1.2; fR = 0.6; // denizlik
              } else if (store && q.y - oy > hw.y + 0.12 && q.y - oy < hw.y + 0.62 && dq.x < 0.1) {
                // Tabela bandı
                vec3 sc = vec3(h13(vec3(iu, 5.0, sd)), h13(vec3(iu, 6.0, sd)), h13(vec3(iu, 7.0, sd)));
                cc = mix(vec3(0.12), sc*0.7 + 0.1, 0.8); fR = 0.35; fH = 1.1;
                fE = sc*uLit*0.8;
              } else if (!store && dq.x < 0.0 && q.y - oy < -hw.y) {
                cc *= 1.0 - 0.1*smoothstep(0.0, 1.2, -(q.y - oy + hw.y))*nf; // denizlik altı kir izi
              }
            }
            cc *= 0.94 + 0.06*smoothstep(0.0, 1.5, vF.y); // zemine yakın hafif kirlenme
          } else {
            // Düz çatı: kenar kapağı + bitüm/çakıl
            float e = min(min(vF.x, vSz.x - vF.x), min(vF.y, vSz.y - vF.y));
            if (e < 0.25) { cc = vec3(0.72, 0.71, 0.68)*(0.85 + 0.2*nz); fH = 1.2; fR = 0.8; }
            else if (vEx.x > 1.5) { // yeşil çatı: sedum/çim lekeleri
              float g1 = fbm3(vOP*1.3, 4), g2 = vn3(vOP*9.0);
              cc = mix(vec3(0.13, 0.2, 0.06), vec3(0.36, 0.37, 0.12), g1)*(0.75 + 0.4*g2);
              cc = mix(cc, vec3(0.38, 0.17, 0.15), 0.2*step(0.8, g2)); fR = 0.95; fH = 0.4 + 0.6*g2;
            } else if (vEx.x > 0.5) { // beyaz (serin) çatı kaplaması: şerit ek yerleri
              float seam = smoothstep(0.0, 0.03, abs(fract(vF.x/1.5) - 0.5) - 0.47);
              cc = vec3(0.84, 0.85, 0.84)*(0.93 + 0.08*nz)*(1.0 - 0.08*seam); fR = 0.5; fH = 0.8 + 0.2*seam;
            } else { cc = wc*(0.75 + 0.35*nz + 0.15*nf); fH = 0.3 + 0.2*nf; fR = 0.95; }
          }
          diffuseColor.rgb = cc;
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fR;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = fM;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += fE;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float fade = 1.0 - smoothstep(30.0, 160.0, length(vViewPosition));
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1);
          float dhx = dFdx(fH)*uBump*fade, dhy = dFdy(fH)*uBump*fade;
          vec3 grad = sign(det)*(dhx*r1 + dhy*r2);
          normal = normalize(abs(det)*normal - grad);
        }`);
  };
  m.customProgramCacheKey = () => 'simlab-facade-v1';
  FAC = m;
  return m;
}

let TILE = null;
export function roofTileMaterial() {
  return TILE || (TILE = procedural({
    key: 'rooftile', params: { color: 0xa9563a, roughness: 0.75 }, bump: 0.05,
    pattern: `
      float r = p.y*8.5;
      vec2 uv = vec2((p.x + p.z)*3.4 + 0.5*mod(floor(r), 2.0), r);
      vec2 f = fract(uv), id = floor(uv);
      float t = h13(vec3(id, 5.0)), cv = sin(f.x*6.2831)*0.5 + 0.5;
      col *= (0.72 + 0.4*t)*(0.78 + 0.28*cv)*(0.8 + 0.35*fbm3(p*0.6, 3));
      col *= mix(0.55, 1.0, smoothstep(0.0, 0.18, f.y));
      col = mix(col, vec3(0.25, 0.24, 0.2), 0.25*smoothstep(0.55, 0.8, fbm3(p*1.3, 3)));
      rough = 0.65 + 0.25*t; h = cv*0.6 + smoothstep(0.0, 0.2, f.y)*0.4;`,
  }));
}

// ---------------------------------------------------------------- Bina birleştirici
/**
 * Binaları tek bir birleşik geometride toplar (tek çizim çağrısı). add(b): b = { x, z, w, d, h, rot, y0, floorH, bay,
 * style (0 sıva konut, 1 ofis giydirme cephe, 2 tuğla), color, seed, shop, roof: 'flat'|'hip', balconies }.
 */
export function buildingBatch() {
  const P = [], N = [], C = [], FU = [], FS = [], FP = [], FX = [], I = [];
  const RP = [];            // kırma çatı üçgenleri (dünya)
  const list = [];
  const col = new THREE.Color();
  function quad(a, b, c, d, n, uv, sz, prm, ex, color) {
    const base = P.length / 3;
    for (const [v, t] of [[a, uv[0]], [b, uv[1]], [c, uv[2]], [d, uv[3]]]) {
      P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); C.push(color.r, color.g, color.b);
      FU.push(t[0], t[1]); FS.push(sz[0], sz[1]); FP.push(prm[0], prm[1], prm[2], prm[3]); FX.push(ex[0], ex[1], ex[2]);
    }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  function add(b) {
    const B = { rot: 0, y0: 0, floorH: 3, bay: 3.2, style: 0, color: 0xdcd3c3, seed: Math.random(), shop: false, roof: 'flat', ...b };
    list.push(B);
    const c = Math.cos(B.rot), s = Math.sin(B.rot);
    const W = (lx, lz, y) => [B.x + lx * c + lz * s, y, B.z - lx * s + lz * c];
    const Wn = (nx, nz) => [nx * c + nz * s, 0, -nx * s + nz * c];
    col.set(B.color);
    const prm = [B.floorH, B.bay, B.style, B.seed * 10];
    const ex = [B.shop ? 1 : 0, B.roof === 'hip' ? 1 : 0, 1];
    const w2 = B.w / 2, d2 = B.d / 2, y0 = B.y0, y1 = B.y0 + B.h;
    const sides = [
      [[-w2, d2], [w2, d2], [0, 1], B.w], [[w2, d2], [w2, -d2], [1, 0], B.d],
      [[w2, -d2], [-w2, -d2], [0, -1], B.w], [[-w2, -d2], [-w2, d2], [-1, 0], B.d],
    ];
    for (const [p0, p1, n, len] of sides) {
      quad(W(p0[0], p0[1], y0), W(p1[0], p1[1], y0), W(p1[0], p1[1], y1), W(p0[0], p0[1], y1), Wn(n[0], n[1]),
        [[0, 0], [len, 0], [len, B.h], [0, B.h]], [len, B.h], prm, ex, col);
    }
    if (B.roof === 'hip') {
      const o = 0.45, a = w2 + o, bb = d2 + o, rh = Math.min(B.w, B.d) * 0.27;
      const along = B.w >= B.d, r = along ? a - bb : bb - a;
      const T = (lx, lz, y) => W(lx, lz, y);
      const e = [T(-a, bb, y1), T(a, bb, y1), T(a, -bb, y1), T(-a, -bb, y1)];
      const tri = (p, q, t) => RP.push(...p, ...q, ...t);
      if (along) {
        const r0 = T(-r, 0, y1 + rh), r1 = T(r, 0, y1 + rh);
        tri(e[0], e[1], r1); tri(e[0], r1, r0); tri(e[2], e[3], r0); tri(e[2], r0, r1); tri(e[1], e[2], r1); tri(e[3], e[0], r0);
      } else {
        const r0 = T(0, -r, y1 + rh), r1 = T(0, r, y1 + rh);
        tri(e[0], e[1], r1); tri(e[2], e[3], r0); tri(e[1], e[2], r0); tri(e[1], r0, r1); tri(e[3], e[0], r1); tri(e[3], r1, r0);
      }
      tri(e[0], e[3], e[2]); tri(e[0], e[2], e[1]); // saçak altı
    } else {
      quad(W(-w2, d2, y1), W(w2, d2, y1), W(w2, -d2, y1), W(-w2, -d2, y1), [0, 1, 0],
        [[0, B.d], [B.w, B.d], [B.w, 0], [0, 0]], [B.w, B.d], prm, [B.roofType || 0, 0, 0], col.set(B.roofColor ?? 0x95928c));
    }
    return B;
  }
  function build(detail = () => true) {
    const g = new THREE.Group();
    if (P.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      geo.setAttribute('fuv', new THREE.Float32BufferAttribute(FU, 2));
      geo.setAttribute('fsz', new THREE.Float32BufferAttribute(FS, 2));
      geo.setAttribute('fprm', new THREE.Float32BufferAttribute(FP, 4));
      geo.setAttribute('fex', new THREE.Float32BufferAttribute(FX, 3));
      geo.setIndex(I);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, facadeMaterial());
      m.castShadow = m.receiveShadow = true; m.userData.own = true;
      m.name = 'city:buildings';
      g.add(m);
    }
    if (RP.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(RP, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, roofTileMaterial());
      m.castShadow = m.receiveShadow = true; m.userData.own = true;
      g.add(m);
    }
    const dl = list.filter(detail);
    g.add(balconies(dl), rooftops(dl));
    return g;
  }
  return { add, build, list };
}

// Balkonlar: konut (stil 0) ön/arka yüzlerde, zemin kat hariç; döşeme + sıvalı korkuluk + metal küpeşte
function balconies(list) {
  const g = new THREE.Group();
  const slabs = [], pars = [];
  for (const B of list) {
    if (B.style !== 0 || B.balconies === false || B.h < 7) continue;
    const r = rng(Math.floor(B.seed * 1e6) + 5);
    const nb = Math.max(1, Math.round(B.w / B.bay)), cw = B.w / nb;
    const g0 = B.shop ? Math.max(B.floorH * 1.3, 3.9) : B.floorH;
    const nf = Math.floor((B.h - g0 - 0.9) / B.floorH);
    const pick = []; for (let i = 0; i < nb; i++) if (r() < 0.55) pick.push(i);
    for (const side of [1, -1]) for (let f = 0; f < nf; f++) for (const i of pick) {
      const y = B.y0 + g0 + f * B.floorH;
      const lx = side * (-B.w / 2 + (i + 0.5) * cw);
      const c = Math.cos(B.rot + (side < 0 ? Math.PI : 0)), s = Math.sin(B.rot + (side < 0 ? Math.PI : 0));
      // yerel: +z dışarı
      const bx = B.x + (lx * Math.cos(B.rot)) + (side * B.d / 2) * Math.sin(B.rot);
      const bz = B.z - lx * Math.sin(B.rot) + (side * B.d / 2) * Math.cos(B.rot);
      slabs.push({ x: bx, y, z: bz, c, s, w: cw * 0.86, col: B.color });
      pars.push({ x: bx, y, z: bz, c, s, w: cw * 0.86, col: B.color });
    }
  }
  if (!slabs.length) return g;
  const K = kitRes();
  const mSlab = new THREE.InstancedMesh(K.balSlab, K.mSlab, slabs.length);
  const mPar = new THREE.InstancedMesh(K.balPar, K.mPar, pars.length);
  const mRail = new THREE.InstancedMesh(K.balRail, K.mRail, pars.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const cc = new THREE.Color();
  slabs.forEach((b, i) => {
    q.setFromAxisAngle(up, Math.atan2(b.s, b.c));
    m4.compose(v.set(b.x, b.y, b.z), q, sc.set(b.w, 1, 1));
    mSlab.setMatrixAt(i, m4); mPar.setMatrixAt(i, m4); mRail.setMatrixAt(i, m4);
    mPar.setColorAt(i, cc.set(b.col));
  });
  for (const m of [mSlab, mPar, mRail]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  return g;
}

// Çatı ekipmanı: merdiven kulesi, güneş kolektörü + depo (konut), klima dış üniteleri (ofis)
function rooftops(list) {
  const g = new THREE.Group();
  const T = { house: [], panel: [], tank: [], ac: [] };
  for (const B of list) {
    if (B.roof === 'hip' || B.roofType === 2) continue;
    const r = rng(Math.floor(B.seed * 1e6) + 11);
    const top = B.y0 + B.h;
    const at = (lx, lz) => [B.x + lx * Math.cos(B.rot) + lz * Math.sin(B.rot), B.z - lx * Math.sin(B.rot) + lz * Math.cos(B.rot)];
    if (B.h > 9 && B.w > 8 && B.d > 8) { const [x, z] = at((r() - 0.5) * (B.w - 6), (r() - 0.5) * (B.d - 6)); T.house.push([x, top, z, B.rot, B.color]); }
    const n = B.style === 1 ? 2 + Math.floor(r() * 4) : Math.floor(r() * 3.5);
    for (let k = 0; k < n; k++) {
      const [x, z] = at((r() - 0.5) * (B.w - 3), (r() - 0.5) * (B.d - 3));
      if (B.style === 1) T.ac.push([x, top, z, B.rot + (r() < 0.5 ? 0 : Math.PI / 2)]);
      else { T.panel.push([x, top, z, B.rot]); T.tank.push([x, top, z, B.rot]); }
    }
  }
  const make = (geo, m, arr, fn) => {
    if (!arr.length) return;
    const im = new THREE.InstancedMesh(geo, m, arr.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    arr.forEach((a, i) => { q.setFromAxisAngle(up, a[3]); m4.compose(new THREE.Vector3(a[0], a[1], a[2]), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); if (fn) im.setColorAt(i, c.set(a[4])); });
    im.castShadow = im.receiveShadow = true;
    g.add(im);
  };
  const K = kitRes();
  make(K.house, K.mHouse, T.house, true);
  make(K.panel, K.mPanel, T.panel);
  make(K.tank, K.mTank, T.tank);
  make(K.ac, K.mAc, T.ac);
  return g;
}
// Paylaşılan balkon/çatı ekipmanı geometri ve malzemeleri (yeniden kurulumda sızıntı olmasın)
let KR = null;
function kitRes() {
  if (KR) return KR;
  const front = new RoundedBoxGeometry(1, 1.0, 0.1, 1, 0.03).translate(0, 0.5, 1.2);
  const sideA = new RoundedBoxGeometry(0.1, 1.0, 1.2, 1, 0.03).translate(-0.47, 0.5, 0.6);
  const sideB = sideA.clone().translate(0.94, 0, 0);
  const pan = new RoundedBoxGeometry(1.0, 0.07, 2.0, 1, 0.02).rotateX(-0.75).translate(0, 0.95, 0.1);
  const legs = new RoundedBoxGeometry(0.9, 0.06, 1.2, 1, 0.02).translate(0, 0.25, 0.1);
  KR = {
    balSlab: new RoundedBoxGeometry(1, 0.18, 1.25, 2, 0.04).translate(0, -0.09, 0.625),
    balPar: BufferGeometryUtils.mergeGeometries([front, sideA, sideB]),
    balRail: new RoundedBoxGeometry(1.02, 0.05, 0.08, 1, 0.02).translate(0, 1.03, 1.2),
    mSlab: mat.concrete({ color: 0xc9c4ba, stains: 0.35 }),
    mPar: mat.concrete({ color: 0xffffff, stains: 0.25, scale: 1.5 }),
    mRail: mat.brushedMetal({ color: 0x9aa0a6, rough: 0.35 }),
    house: new RoundedBoxGeometry(3.2, 2.7, 3.0, 2, 0.06).translate(0, 1.35, 0),
    mHouse: mat.concrete({ color: 0xffffff, stains: 0.6 }),
    panel: BufferGeometryUtils.mergeGeometries([pan, legs]),
    mPanel: new THREE.MeshPhysicalMaterial({ color: 0x14202e, roughness: 0.12, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05 }),
    tank: new THREE.CapsuleGeometry(0.28, 1.1, 4, 14).rotateZ(Math.PI / 2).translate(0, 1.72, -0.72),
    mTank: mat.paintedMetal({ color: 0xe8e8e4, wear: 0.25 }),
    ac: new RoundedBoxGeometry(1.0, 0.75, 0.45, 2, 0.05).translate(0, 0.375, 0),
    mAc: mat.plastic({ color: 0xd9dad6, gloss: 0.3 }),
  };
  return KR;
}
/** batch.build() grubunu serbest bırak (paylaşılan malzeme/geometrilere dokunmaz). */
export function disposeBuilt(g) {
  g.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    else if (o.isMesh && o.userData.own) o.geometry.dispose();
  });
}

// ---------------------------------------------------------------- Zemin malzemeleri
let GM = null;
export function groundMats() {
  if (GM) return GM;
  GM = {
    asphalt: mat.asphalt({ color: 0x3a3b3e }),
    paver: procedural({
      key: 'paver', params: { color: 0xb9b2a6, roughness: 0.85 }, bump: 0.03,
      pattern: `
        vec3 a = axisDominant(pn);
        if (a.y > 0.5) {
          vec2 uv = p.xz*vec2(3.3, 3.3);
          float row = floor(uv.y); uv.x += mod(row, 2.0)*0.5;
          vec2 f = fract(uv), id = floor(uv);
          float m = smoothstep(0.0, 0.06, min(f.x, 1.0 - f.x))*smoothstep(0.0, 0.06, min(f.y, 1.0 - f.y));
          float t = h13(vec3(id, 2.0)), n = fbm3(p*0.8, 3);
          col *= mix(0.55, (0.82 + 0.22*t)*(0.85 + 0.25*n), m);
          rough = mix(0.95, 0.8, m); h = m;
        } else {
          col = vec3(0.62, 0.61, 0.58)*(0.85 + 0.2*fbm3(p*2.0, 3)); rough = 0.75; h = 1.0; // granit bordür
        }`,
    }),
    lawn: procedural({
      key: 'lawn', params: { color: 0x4f6a2a, roughness: 0.95 }, bump: 0.02,
      pattern: `
        float n = fbm3(p*0.35, 4), m = vn3(p*6.0);
        col = mix(vec3(0.19, 0.27, 0.09), vec3(0.36, 0.38, 0.16), n)*(0.8 + 0.3*m);
        col = mix(col, vec3(0.32, 0.26, 0.17), 0.35*smoothstep(0.62, 0.8, fbm3(p*0.9 + 3.0, 3)));
        h = m;`,
    }),
    paint: procedural({
      key: 'roadpaint', params: { color: 0xe7e5dd, roughness: 0.6 }, bump: 0.01,
      pattern: `float n = fbm3(p*2.5, 3); col *= 0.72 + 0.3*n; col = mix(col, vec3(0.2), 0.35*smoothstep(0.62, 0.85, vn3(p*9.0))); rough = 0.55 + 0.3*n;`,
    }),
    yellow: procedural({
      key: 'roadpaint-y', params: { color: 0xd9a21b, roughness: 0.6 }, bump: 0.01,
      pattern: `float n = fbm3(p*2.5, 3); col *= 0.75 + 0.3*n; rough = 0.55 + 0.3*n;`,
    }),
    pole: mat.paintedMetal({ color: 0x4a4f55, wear: 0.2 }),
    curb: mat.concrete({ color: 0xa8a49c, stains: 0.3 }),
  };
  return GM;
}

// ---------------------------------------------------------------- Yol ağı
/**
 * Izgara şehir: yollar (x = xs[i] ve z = zs[j] eksenleri), aralarında adalar (kaldırım + parseller).
 * o = { xs:[..], zs:[..], road: şerit toplam genişliği, walk: kaldırım genişliği, plan(i,j,rect)→'city'|'park'|'plaza'|'none',
 *       lots(rect, rnd, batch, i, j) → özel parsel yerleşimi (yoksa varsayılan), height(x,z,rnd)→kat, style(x,z,rnd), seed, parked, trees, lamps, extent }
 * Döner: { group, batch, blocks, update(t, wind), setLit(v), lampPositions }
 */
export function createCity(o) {
  const P = { road: 12, walk: 3.5, seed: 3, parked: 40, trees: true, lamps: true, extent: 0, lawnInside: true, ...o };
  const r = rng(P.seed);
  const G = groundMats();
  const group = new THREE.Group();
  group.name = 'city';
  const xs = P.xs, zs = P.zs;
  const batch = buildingBatch();
  const blocks = [];
  const walkGeos = [], lawnGeos = [];
  const treePts = [], lampPts = [], carPts = [], marks = [], yellowMarks = [];
  const rr = (a, b) => a + r() * (b - a);
  const roundRect = (w, d, rad) => {
    const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
    s.moveTo(x + rad, y); s.lineTo(x + w - rad, y); s.quadraticCurveTo(x + w, y, x + w, y + rad);
    s.lineTo(x + w, y + d - rad); s.quadraticCurveTo(x + w, y + d, x + w - rad, y + d);
    s.lineTo(x + rad, y + d); s.quadraticCurveTo(x, y + d, x, y + d - rad);
    s.lineTo(x, y + rad); s.quadraticCurveTo(x, y, x + rad, y);
    return s;
  };
  const slab = (cx, cz, w, d, rad, h) => new THREE.ExtrudeGeometry(roundRect(w, d, rad), { depth: h, bevelEnabled: false, curveSegments: 5 })
    .rotateX(-Math.PI / 2).translate(cx, 0, cz);
  const hr = P.road / 2;
  for (let i = 0; i + 1 < xs.length; i++) for (let j = 0; j + 1 < zs.length; j++) {
    const rect = { x0: xs[i] + hr, x1: xs[i + 1] - hr, z0: zs[j] + hr, z1: zs[j + 1] - hr };
    rect.cx = (rect.x0 + rect.x1) / 2; rect.cz = (rect.z0 + rect.z1) / 2; rect.w = rect.x1 - rect.x0; rect.d = rect.z1 - rect.z0;
    const kind = P.plan ? P.plan(i, j, rect) : 'city';
    blocks.push({ i, j, ...rect, kind });
    if (kind === 'none') continue;
    walkGeos.push(slab(rect.cx, rect.cz, rect.w, rect.d, 4, 0.16));
    const inner = { x0: rect.x0 + P.walk, x1: rect.x1 - P.walk, z0: rect.z0 + P.walk, z1: rect.z1 - P.walk };
    inner.w = inner.x1 - inner.x0; inner.d = inner.z1 - inner.z0; inner.cx = rect.cx; inner.cz = rect.cz;
    if (kind === 'park' || (kind === 'city' && P.lawnInside)) lawnGeos.push(slab(rect.cx, rect.cz, inner.w, inner.d, 1.5, 0.2));
    // Sokak ağaçları ve lambalar kaldırım boyunca
    const edge = (fn, len, step, off) => { for (let s = off; s < len - 2; s += step) fn(s); };
    const perim = [
      (s) => [rect.x0 + s, rect.z1 - 1.1, 0], (s) => [rect.x0 + s, rect.z0 + 1.1, Math.PI],
      (s) => [rect.x1 - 1.1, rect.z0 + s, Math.PI / 2], (s) => [rect.x0 + 1.1, rect.z0 + s, -Math.PI / 2],
    ];
    const lens = [rect.w, rect.w, rect.d, rect.d];
    perim.forEach((f, k) => {
      if (P.trees) edge((s) => { if (r() < 0.85) treePts.push(f(s)); }, lens[k], rr(8, 11), rr(5, 8));
      if (P.lamps) edge((s) => { const p = f(s); lampPts.push([p[0], p[1], p[2]]); }, lens[k], 28, 12);
    });
    if (kind === 'park') {
      for (let k = 0; k < inner.w * inner.d / 70; k++) treePts.push([rr(inner.x0 + 2, inner.x1 - 2), rr(inner.z0 + 2, inner.z1 - 2), r() * 6, 1]);
    } else if (kind !== 'plaza') {
      if (P.lots) P.lots(inner, r, batch, i, j);
      else defaultLots(inner, r, batch, P);
    }
  }
  // Sürekli asfalt zemin
  const X0 = xs[0] - P.extent, X1 = xs[xs.length - 1] + P.extent, Z0 = zs[0] - P.extent, Z1 = zs[zs.length - 1] + P.extent;
  const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + P.road, Z1 - Z0 + P.road).rotateX(-Math.PI / 2).translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2), G.asphalt);
  asphalt.receiveShadow = true; asphalt.userData.noFit = true;
  group.add(asphalt);
  if (walkGeos.length) { const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(walkGeos), G.paver); m.receiveShadow = m.castShadow = true; m.userData.noFit = true; group.add(m); }
  if (lawnGeos.length) { const m = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(lawnGeos), G.lawn); m.receiveShadow = true; m.userData.noFit = true; group.add(m); }
  // Yol çizgileri: orta kesikli çizgi, kavşakta yaya geçitleri
  const zmin = zs[0], zmax = zs[zs.length - 1], xmin = xs[0], xmax = xs[xs.length - 1];
  for (const x of xs) for (let j = 0; j + 1 < zs.length; j++) {
    for (let z = zs[j] + hr + 4; z < zs[j + 1] - hr - 4; z += 9) marks.push([x, z + 1.5, 0.15, 3, 0]);
  }
  for (const z of zs) for (let i = 0; i + 1 < xs.length; i++) {
    for (let x = xs[i] + hr + 4; x < xs[i + 1] - hr - 4; x += 9) marks.push([x + 1.5, z, 3, 0.15, 0]);
  }
  for (const x of xs) for (const z of zs) {
    for (let k = -4; k <= 4; k++) {
      if (z > zmin) marks.push([x + k * 1.1, z - hr - 2.2, 0.55, 3, 0]);
      if (z < zmax) marks.push([x + k * 1.1, z + hr + 2.2, 0.55, 3, 0]);
      if (x > xmin) marks.push([x - hr - 2.2, z + k * 1.1, 3, 0.55, 0]);
      if (x < xmax) marks.push([x + hr + 2.2, z + k * 1.1, 3, 0.55, 0]);
    }
  }
  const markGeo = new THREE.BoxGeometry(1, 0.02, 1);
  const mk = new THREE.InstancedMesh(markGeo, G.paint, marks.length);
  const m4 = new THREE.Matrix4();
  marks.forEach((a, k) => mk.setMatrixAt(k, m4.makeScale(a[2], 1, a[3]).setPosition(a[0], 0.012, a[1])));
  mk.receiveShadow = true; mk.userData.noFit = true; mk.userData.noAO = true;
  group.add(mk);
  // Park etmiş araçlar: yol kenarı şeridinde
  for (let n = 0, t = 0; n < P.parked && t < P.parked * 20; t++) {
    const alongX = r() < 0.5;
    if (alongX) {
      const z = zs[Math.floor(r() * zs.length)], x = rr(xmin + hr + 6, xmax - hr - 6), side = r() < 0.5 ? 1 : -1;
      if (xs.some((xx) => Math.abs(xx - x) < hr + 7)) continue;
      if (P.parkOk && !P.parkOk(x, z, true)) continue;
      carPts.push([x, z + side * (hr - 1.2), side > 0 ? 0 : Math.PI]); n++;
    } else {
      const x = xs[Math.floor(r() * xs.length)], z = rr(zmin + hr + 6, zmax - hr - 6), side = r() < 0.5 ? 1 : -1;
      if (zs.some((zz) => Math.abs(zz - z) < hr + 7)) continue;
      if (P.parkOk && !P.parkOk(x, z, false)) continue;
      carPts.push([x + side * (hr - 1.2), z, side > 0 ? -Math.PI / 2 : Math.PI / 2]); n++;
    }
  }
  const fleet = carFleet(carPts.length + (P.extraCars || 0), { seed: P.seed + 7 });
  carPts.forEach((c, i) => fleet.set(i, c[0], 0, c[1], c[2]));
  fleet.commit();
  group.add(fleet.group);
  const trees = streetTrees(treePts, P.seed);
  group.add(trees.group);
  const lamps = streetLamps(lampPts);
  group.add(lamps.group);
  const bgroup = batch.build(P.detail);
  group.add(bgroup);
  return {
    group, batch, blocks, fleet, trees, lamps, carPts,
    update(t, wind = 1) { trees.update(t, wind); },
    setLit(v) { facadeMaterial().userData.uniforms.uLit.value = v; lamps.setLit(v); },
  };
}

/** Varsayılan parselleme: adanın dört kenarı boyunca, yola bakan binalar; köşe binaları ön/arka sıradan. */
export function defaultLots(inner, r, batch, P = {}) {
  const rr = (a, b) => a + r() * (b - a);
  const height = P.height || (() => 4 + Math.floor(r() * 4));
  const style = P.style || (() => (r() < 0.75 ? 0 : 2));
  const palette = P.palette || [0xe3d9c6, 0xd8cbb3, 0xece6da, 0xcfc4b0, 0xe6d2b5, 0xd5d9d6, 0xc9b8a0, 0xf0e9dc, 0xd9c2a2];
  const bricks = [0x9c4a32, 0x8d4a36, 0xa65e3e, 0x7f3f2c];
  const gapMin = P.gap ?? 2.5;
  const D = Math.min(14, inner.d / 2 - 1, inner.w / 2 - 1);
  if (D < 6) return;
  const place = (x, z, w, d, rot) => {
    const st = style(x, z, r);
    const fl = height(x, z, r);
    const shop = st !== 2 && r() < (P.shops ?? 0.55);
    const fh = st === 1 ? 3.6 : 3.0;
    const g0 = shop ? Math.max(fh * 1.3, 3.9) : fh;
    const hip = st !== 1 && fl <= 5 && r() < (P.hip ?? 0.35);
    batch.add({
      x, z, w, d, rot, h: g0 + (fl - 1) * fh + (hip ? 0 : 1.0), floorH: fh, bay: st === 1 ? 3.0 : rr(3.0, 3.8), style: st,
      color: st === 2 ? bricks[Math.floor(r() * bricks.length)] : st === 1 ? [0x9aa5ad, 0xb8bec2, 0x7d8a92, 0xc4c0b6][Math.floor(r() * 4)] : palette[Math.floor(r() * palette.length)],
      seed: r(), shop, roof: hip ? 'hip' : 'flat',
    });
  };
  const run = (len, fn) => {
    let s = 0;
    while (s < len - 8) {
      const w = Math.min(rr(11, 20), len - s);
      if (w < 8) break;
      fn(s + w / 2, w);
      s += w + rr(gapMin, gapMin + 2);
    }
  };
  const d = rr(D * 0.8, D);
  run(inner.w, (s, w) => place(inner.x0 + s, inner.z1 - d / 2, w, d, 0));
  run(inner.w, (s, w) => place(inner.x1 - s, inner.z0 + d / 2, w, d, Math.PI));
  const zl = inner.d - 2 * d - 2 * gapMin;
  if (zl > 10) {
    run(zl, (s, w) => place(inner.x1 - d / 2, inner.z1 - d - gapMin - s, w, d, Math.PI / 2));
    run(zl, (s, w) => place(inner.x0 + d / 2, inner.z0 + d + gapMin + s, w, d, -Math.PI / 2));
  }
}

// ---------------------------------------------------------------- Sokak ağaçları (motor ağaç geometrisi, kendi yerleşimimiz)
export function streetTrees(pts, seed = 3, kinds = { broad: 1 }) {
  const veg = createVegetation(() => 10, { rect: [0, 0, 1, 1], trees: 3 * Object.keys(kinds).length, rocks: 0, kinds, seed, leafA: 0x3d5a22, leafB: 0x71803a });
  const group = new THREE.Group();
  const src = veg.group.children.filter((c) => c.isInstancedMesh);
  if (!pts.length || !src.length) return { group, update() {} };
  const per = src.map(() => []);
  const r = rng(seed + 99);
  pts.forEach((p) => per[Math.floor(r() * src.length)].push(p));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), v = new THREE.Vector3();
  src.forEach((s, k) => {
    if (!per[k].length) return;
    const im = new THREE.InstancedMesh(s.geometry, s.material, per[k].length);
    per[k].forEach((p, i) => {
      q.setFromAxisAngle(up, r() * 6.283);
      const big = p[3] ? 0.9 + r() * 0.35 : 0.8 + r() * 0.2;
      m4.compose(v.set(p[0], 0.1, p[1]), q, sc.set(big, big * (0.9 + r() * 0.2), big));
      im.setMatrixAt(i, m4);
    });
    im.castShadow = im.receiveShadow = true; im.userData.noFit = true; im.userData.noAO = true;
    group.add(im);
  });
  return { group, update: veg.update };
}

// ---------------------------------------------------------------- Sokak lambaları
export function streetLamps(pts) {
  const group = new THREE.Group();
  if (!pts.length) return { group, setLit() {} };
  const G = groundMats();
  const prof = [[0.001, 0], [0.16, 0], [0.16, 0.5], [0.1, 0.62], [0.075, 3], [0.055, 8.2], [0.001, 8.25]].map(([a, b]) => new THREE.Vector2(a, b));
  const pole = new THREE.LatheGeometry(prof, 12);
  const arm = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 8.0, 0), new THREE.Vector3(0, 8.6, 0.5), new THREE.Vector3(0, 8.5, 1.6)), 10, 0.045, 6);
  const head = new RoundedBoxGeometry(0.34, 0.14, 0.75, 2, 0.05).translate(0, 8.45, 1.85);
  const lens = new RoundedBoxGeometry(0.26, 0.03, 0.6, 1, 0.01).translate(0, 8.37, 1.85);
  const glowM = mat.glow({ color: 0xffe2b0, intensity: 0 });
  const mP = new THREE.InstancedMesh(BufferGeometryUtils.mergeGeometries([pole, arm, head].map((g) => (g.index ? g.toNonIndexed() : g))), G.pole, pts.length);
  const mL = new THREE.InstancedMesh(lens, glowM, pts.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  pts.forEach((p, i) => { q.setFromAxisAngle(up, p[2]); m4.compose(v.set(p[0], 0.15, p[1]), q, one); mP.setMatrixAt(i, m4); mL.setMatrixAt(i, m4); });
  mP.castShadow = true; mP.receiveShadow = true; mP.userData.noFit = true; mL.userData.noFit = true;
  group.add(mP, mL);
  return { group, setLit(v) { glowM.emissiveIntensity = 0.35 + v * 6; } };
}

// ---------------------------------------------------------------- Araç filosu (örneklenmiş otomobiller)
function carGeo(type) {
  const L = type === 'suv' ? 4.6 : type === 'hatch' ? 4.1 : 4.6, W = type === 'suv' ? 1.86 : 1.76;
  const H = type === 'suv' ? 1.7 : 1.45, sill = type === 'suv' ? 0.42 : 0.3, belt = type === 'suv' ? 1.08 : 0.9, bv = 0.1;
  const sh = new THREE.Shape(), x0 = -L / 2 + bv, x1 = L / 2 - bv;
  sh.moveTo(x0 + 0.2, sill); sh.lineTo(x1 - 0.25, sill);
  sh.quadraticCurveTo(x1, sill + 0.02, x1, sill + 0.28);
  sh.quadraticCurveTo(x1 - 0.02, belt - 0.1, x1 - 0.4, belt - 0.02);
  sh.lineTo(type === 'hatch' ? x0 + 0.1 : x0 + 0.35, belt + 0.02);
  sh.quadraticCurveTo(x0, belt - 0.02, x0, belt - 0.3);
  sh.lineTo(x0, sill + 0.25); sh.quadraticCurveTo(x0, sill, x0 + 0.2, sill);
  const body = new THREE.ExtrudeGeometry(sh, { depth: W - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, -(W - 2 * bv) / 2);
  const c = new THREE.Shape();
  const fA = type === 'suv' ? x1 - 1.05 : x1 - 1.25, rA = type === 'hatch' ? x0 + 0.15 : type === 'suv' ? x0 + 0.2 : x0 + 0.75;
  const roofF = fA - (type === 'suv' ? 0.45 : 0.7), roofR = rA + (type === 'hatch' ? 0.25 : type === 'suv' ? 0.12 : 0.5);
  c.moveTo(fA, belt - 0.02); c.quadraticCurveTo(roofF + 0.2, H - 0.12, roofF, H - 0.05); c.lineTo(roofR, H - 0.05);
  c.quadraticCurveTo(rA + 0.05, H - 0.1, rA, belt - 0.02); c.lineTo(fA, belt - 0.02);
  const cw = W - 0.28;
  const cabin = new THREE.ExtrudeGeometry(c, { depth: cw - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, -(cw - 0.16) / 2);
  const roof = new RoundedBoxGeometry(Math.abs(roofF - roofR) - 0.1, 0.06, cw - 0.2, 2, 0.03).translate((roofF + roofR) / 2, H - 0.02, 0);
  const strip = (g) => (g.index ? g.toNonIndexed() : g);
  const clean = (g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return strip(g); };
  const paint = BufferGeometryUtils.mergeGeometries([clean(body), clean(roof)]);
  const wr = type === 'suv' ? 0.37 : 0.32, wx = L / 2 - (type === 'suv' ? 0.85 : 0.8);
  const lights = [];
  for (const z of [-W / 2 + 0.28, W / 2 - 0.28]) {
    lights.push(clean(new RoundedBoxGeometry(0.08, 0.1, 0.34, 1, 0.03).translate(L / 2 - 0.05, 0.72, z)));
  }
  const tails = [-W / 2 + 0.28, W / 2 - 0.28].map((z) => clean(new RoundedBoxGeometry(0.06, 0.1, 0.3, 1, 0.03).translate(-L / 2 + 0.05, 0.78, z)));
  return { paint, glass: clean(cabin), head: BufferGeometryUtils.mergeGeometries(lights), tail: BufferGeometryUtils.mergeGeometries(tails), L, W, H, wr, wx };
}
const CAR_COLORS = [0xf2f2f0, 0xf2f2f0, 0x1a1c1f, 0x8e959c, 0xb7bcc0, 0x24344f, 0x8a1d1d, 0x6b6f73, 0xd7d2c4, 0x2f4a3a, 0x1e5a8a];
/**
 * n araç (sedan/hatch/suv karışık). set(i, x, y, z, yaw, wheelAngle?) → commit(). Boya instanceColor ile (setColor(i, hex)).
 * +x = ileri (yaw = 0'da +x yönünde).
 */
export function carFleet(n, { seed = 5, types = ['sedan', 'hatch', 'suv'], colors = CAR_COLORS } = {}) {
  const group = new THREE.Group();
  const r = rng(seed);
  const paintM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.06 });
  const glassM = new THREE.MeshPhysicalMaterial({ color: 0x0b1116, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03 });
  const headM = mat.glow({ color: 0xfff2d8, intensity: 1.2 }), tailM = mat.glow({ color: 0xff2a1a, intensity: 0.9 });
  const tyreM = mat.rubber({ color: 0x1b1c1e }), rimM = mat.brushedMetal({ color: 0xb9bec4, rough: 0.3 });
  const assign = Array.from({ length: n }, () => Math.floor(r() * types.length));
  const idx = new Int32Array(n), cnt = types.map(() => 0);
  assign.forEach((t, i) => { idx[i] = cnt[t]++; });
  const T = types.map((type, t) => {
    const g = carGeo(type), c = Math.max(1, cnt[t]);
    const wp = [], rp = [];
    const ri = g.wr * 0.62, w = 0.22;
    for (const [a, b] of [[ri, -w / 2], [g.wr * 0.9, -w / 2], [g.wr, -w * 0.3], [g.wr, w * 0.3], [g.wr * 0.9, w / 2], [ri, w / 2]]) wp.push(new THREE.Vector2(a, b));
    for (const [a, b] of [[0.001, w * 0.4], [ri * 0.5, w * 0.34], [ri, w * 0.44], [ri, -w * 0.44], [0.001, -w * 0.3]]) rp.push(new THREE.Vector2(a, b));
    const tyre = new THREE.LatheGeometry(wp, 18).rotateX(Math.PI / 2), rim = new THREE.LatheGeometry(rp, 14).rotateX(Math.PI / 2);
    const mk = (geo, m, k = 1) => { const im = new THREE.InstancedMesh(geo, m, c * k); im.castShadow = im.receiveShadow = true; im.count = cnt[t] * k; im.frustumCulled = false; group.add(im); return im; };
    return {
      g, paint: mk(g.paint, paintM), glass: mk(g.glass, glassM), head: mk(g.head, headM), tail: mk(g.tail, tailM),
      tyre: mk(tyre, tyreM, 4), rim: mk(rim, rimM, 4),
    };
  });
  const m4 = new THREE.Matrix4(), w4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3(), cc = new THREE.Color();
  const rz = new THREE.Matrix4(), fl = new THREE.Matrix4().makeRotationY(Math.PI);
  const base = new Int32Array(n);
  for (let i = 0; i < n; i++) { const t = T[assign[i]]; base[i] = colors[Math.floor(r() * colors.length)]; t.paint.setColorAt(idx[i], cc.set(base[i])); }
  const api = {
    group, count: n,
    set(i, x, y, z, yaw, wheel = 0) {
      const t = T[assign[i]], k = idx[i], g = t.g;
      q.setFromAxisAngle(up, yaw);
      m4.compose(v.set(x, y, z), q, one);
      t.paint.setMatrixAt(k, m4); t.glass.setMatrixAt(k, m4); t.head.setMatrixAt(k, m4); t.tail.setMatrixAt(k, m4);
      let j = 0;
      for (const wx of [-g.wx, g.wx]) for (const s of [-1, 1]) {
        w4.makeTranslation(wx, g.wr, s * (g.W / 2 - 0.16)).multiply(rz.makeRotationZ(-wheel));
        if (s < 0) w4.multiply(fl);
        w4.premultiply(m4);
        t.tyre.setMatrixAt(k * 4 + j, w4); t.rim.setMatrixAt(k * 4 + j, w4); j++;
      }
    },
    hide(i) { api.set(i, 0, -1000, 0, 0); },
    setColor(i, hex) { const t = T[assign[i]]; t.paint.setColorAt(idx[i], cc.set(hex)); t.paint.instanceColor.needsUpdate = true; },
    /** Boyayı bir renge (THREE.Color) boya; null → aracın kendi rengi. commit() ile yüklenir. */
    tint(i, color) { const t = T[assign[i]]; t.paint.setColorAt(idx[i], color ? color : cc.set(base[i])); },
    base(i, hex) { base[i] = hex; },
    info(i) { const g = T[assign[i]].g; return { L: g.L, W: g.W, H: g.H }; },
    commit() {
      for (const t of T) for (const k of ['paint', 'glass', 'head', 'tail', 'tyre', 'rim']) { t[k].instanceMatrix.needsUpdate = true; if (t[k].instanceColor) t[k].instanceColor.needsUpdate = true; }
    },
    lights(v) { headM.emissiveIntensity = 1.2 + v * 4; tailM.emissiveIntensity = 0.9 + v * 2.5; },
  };
  for (let i = 0; i < n; i++) api.hide(i);
  return api;
}
