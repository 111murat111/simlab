// Kaldırım taşı malzemesi (yerel).
import { procedural } from '@core';

export const paving = ({ color = 0xb9b1a3, size = 0.6 } = {}) => procedural({
  key: 'paving-r', scale: 1, bump: 0.02, params: { color, roughness: 0.86 },
  uniforms: { uSize: { value: size } },
  pattern: `
    vec2 uv = p.xz/uSize;
    uv.x += mod(floor(uv.y), 2.0)*0.5;
    vec2 f = fract(uv), id = floor(uv);
    float fw = length(fwidth(uv));
    float j = smoothstep(0.0, 0.03 + fw, min(f.x, 1.0 - f.x))*smoothstep(0.0, 0.03 + fw, min(f.y, 1.0 - f.y));
    j = mix(1.0, j, 1.0 - smoothstep(0.15, 0.5, fw));
    float tint = h13(vec3(id, 2.0)), n = fbm3(p*1.3, 4);
    col *= (0.86 + 0.2*tint)*(0.88 + 0.2*n);
    col = mix(col*0.55, col, j);
    rough = mix(0.95, 0.8, j);
    h = j*0.6 + n*0.4;`,
});
