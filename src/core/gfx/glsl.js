// Motorun ortak GLSL parçaları (GLSL3; ShaderMaterial({ glslVersion: THREE.GLSL3 }) ile).
export const GLSL_COMMON = /* glsl */ `
#ifndef PI
#define PI 3.14159265359
#endif
vec2 cmul(vec2 a, vec2 b){ return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x); }
vec2 eqUV(vec3 d){ return vec2(atan(d.z, d.x)/(2.0*PI) + 0.5, asin(clamp(d.y, -1.0, 1.0))/PI + 0.5); }
vec3 eqDir(vec2 uv){ float ph = (uv.x - 0.5)*2.0*PI, el = (uv.y - 0.5)*PI; return vec3(cos(ph)*cos(el), sin(el), sin(ph)*cos(el)); }
float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x), mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p, int oct){
  float s = 0.0, a = 0.5; mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a*vnoise(p); p = m*p + 7.1; a *= 0.5; }
  return s;
}
`;
