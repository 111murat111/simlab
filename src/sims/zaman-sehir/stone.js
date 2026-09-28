// Yerel malzemeler: kesme taş (derzli blok), oluklu sütun taşı, meydan döşemesi — nesne uzayında, metre ölçeğinde.
import { procedural } from '@core';

/** Kesme taş: sıra yüksekliği course (m), blok boyu len (m) */
export const ashlar = ({ color = 0xd9d1c0, course = 0.62, len = 1.3 } = {}) => procedural({
  key: 'ashlar', scale: 1, bump: 0.03, params: { color, roughness: 0.82 },
  uniforms: { uCourse: { value: course }, uLen: { value: len } },
  pattern: `
    vec3 a = axisDominant(pn); vec2 uv = a.x > 0.5 ? p.zy : (a.y > 0.5 ? p.xz : p.xy);
    uv /= vec2(uLen, uCourse);
    float row = floor(uv.y); uv.x += mod(row, 2.0)*0.5;
    vec2 f = fract(uv), id = floor(uv);
    float fw = length(fwidth(uv));
    float j = smoothstep(0.0, 0.02 + fw, min(f.x, 1.0 - f.x)*uLen/uCourse*0.5)*smoothstep(0.0, 0.03 + fw, min(f.y, 1.0 - f.y));
    j = mix(1.0, j, 1.0 - smoothstep(0.2, 0.6, fw));
    float tint = h13(vec3(id, 5.0));
    float n = fbm3(p*1.8, 5), sp = vn3(p*30.0);
    col *= (0.9 + 0.14*tint)*(0.86 + 0.22*n + 0.05*(sp - 0.5));
    col *= 1.0 - 0.18*smoothstep(0.55, 0.85, fbm3(p*0.25 + vec3(0.0, p.y*0.4, 0.0), 3));
    col = mix(col*0.62, col, j);
    rough = mix(0.95, 0.78 + 0.1*n, j);
    h = j*0.7 + n*0.3;`,
});

/** Oluklu sütun: 24 oluk (nesne ekseni y) */
export const fluted = ({ color = 0xdcd4c3 } = {}) => procedural({
  key: 'fluted', scale: 1, bump: 0.05, params: { color, roughness: 0.8 },
  pattern: `
    float ang = atan(p.z, p.x);
    float fl = 0.5 + 0.5*cos(ang*24.0);
    float n = fbm3(p*2.0, 4);
    col *= (0.9 + 0.18*n)*(0.92 + 0.08*fl);
    h = fl*0.8 + n*0.2;`,
});

/** Meydan döşemesi: büyük taş plaklar + derz */
export const paving = ({ color = 0xb9b1a3, size = 1.6 } = {}) => procedural({
  key: 'paving', scale: 1, bump: 0.02, params: { color, roughness: 0.86 },
  uniforms: { uSize: { value: size } },
  pattern: `
    vec2 uv = p.xz/uSize;
    uv.x += mod(floor(uv.y), 2.0)*0.5;
    vec2 f = fract(uv), id = floor(uv);
    float fw = length(fwidth(uv));
    float j = smoothstep(0.0, 0.015 + fw, min(f.x, 1.0 - f.x))*smoothstep(0.0, 0.015 + fw, min(f.y, 1.0 - f.y));
    j = mix(1.0, j, 1.0 - smoothstep(0.15, 0.5, fw));
    float tint = h13(vec3(id, 2.0)), n = fbm3(p*1.3, 4);
    col *= (0.86 + 0.2*tint)*(0.88 + 0.2*n);
    col *= 1.0 - 0.12*smoothstep(0.5, 0.9, fbm3(p*0.08, 3));
    col = mix(col*0.55, col, j);
    rough = mix(0.95, 0.8, j);
    h = j*0.6 + n*0.4;`,
});

/** Tuğla (sanayi yapıları) */
export const oldBrick = ({ color = 0x8e4a33 } = {}) => procedural({
  key: 'oldbrick', scale: 1, bump: 0.03, params: { color, roughness: 0.9 },
  pattern: `
    vec3 a = axisDominant(pn); vec2 uv = a.x > 0.5 ? p.zy : (a.y > 0.5 ? p.xz : p.xy);
    uv /= vec2(0.24, 0.075);
    float row = floor(uv.y); uv.x += mod(row, 2.0)*0.5;
    vec2 f = fract(uv), id = floor(uv);
    float fw = length(fwidth(uv));
    float m = smoothstep(0.0, 0.06 + fw, min(f.x, 1.0 - f.x)*0.3)*smoothstep(0.0, 0.1 + fw, min(f.y, 1.0 - f.y));
    float aa = 1.0 - smoothstep(0.2, 0.6, fw);
    m = mix(0.85, m, aa);
    float tint = h13(vec3(id, 3.0));
    float n = fbm3(p*0.9, 4);
    vec3 b = col*mix(0.9, 0.7 + 0.45*tint, aa)*(0.85 + 0.25*n);
    col = mix(vec3(0.62, 0.6, 0.56)*(0.8 + 0.2*n), b, m);
    col *= 1.0 - 0.25*smoothstep(0.5, 0.9, fbm3(p*0.3 + vec3(0.0, p.y*0.6, 0.0), 3));
    rough = mix(0.95, 0.85, m);
    h = m*0.8 + n*0.2;`,
});
