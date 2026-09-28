(()=>{var Oe=Object.create;var pe=Object.defineProperty;var $e=Object.getOwnPropertyDescriptor;var We=Object.getOwnPropertyNames;var Ue=Object.getPrototypeOf,Ze=Object.prototype.hasOwnProperty;var je=(e,a)=>()=>{try{return a||e((a={exports:{}}).exports,a),a.exports}catch(t){throw a=0,t}};var He=(e,a,t,o)=>{if(a&&typeof a=="object"||typeof a=="function")for(let r of We(a))!Ze.call(e,r)&&r!==t&&pe(e,r,{get:()=>a[r],enumerable:!(o=$e(a,r))||o.enumerable});return e};var Y=(e,a,t)=>(t=e!=null?Oe(Ue(e)):{},He(a||!e||!e.__esModule?pe(t,"default",{value:e,enumerable:!0}):t,e));var N=je((Fa,ve)=>{ve.exports=window.SimCore});var l=Y(N(),1);var p=Y(N(),1),B={value:new p.THREE.Vector3},X=`
float fwA(vec3 q){ return 1.0 - smoothstep(0.3, 0.8, length(fwidth(q))); }
float vnA(vec3 q){ return mix(0.5, vn3(q), fwA(q)); }
float fbmA(vec3 q, int oct){
  float fw = length(fwidth(q)), s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a*mix(0.5, vn3(q), 1.0 - smoothstep(0.3, 0.8, fw)); q = q*2.03 + 17.1; fw *= 2.03; a *= 0.5; }
  return s;
}
float ridgeA(vec3 q, int oct){
  float fw = length(fwidth(q)), s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++){ if (i >= oct) break; float r = 1.0 - abs(vn3(q)*2.0 - 1.0); s += a*mix(0.5, r*r, 1.0 - smoothstep(0.3, 0.8, fw)); q = q*2.07 + 5.3; fw *= 2.07; a *= 0.5; }
  return s;
}
// Worley F1 (h\xFCcre)
float cellsA(vec3 p){
  vec3 i = floor(p), f = fract(p); float d = 1.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec3 g = vec3(x, y, z); vec3 o = vec3(h13(i + g), h13(i + g + 11.3), h13(i + g + 27.1));
    d = min(d, length(g + o - f));
  }
  return mix(0.55, d, fwA(p));
}
// Krater alan\u0131: \xE7anak + s\u0131rt + hafif f\u0131rlat\u0131 \xF6rt\xFCs\xFC; dens = h\xFCcre ba\u015F\u0131na krater olas\u0131l\u0131\u011F\u0131
float craterField(vec3 p, float dens, out float rayOut){
  vec3 i = floor(p), f = fract(p); float h = 0.0; rayOut = 0.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec3 g = vec3(x, y, z), c = i + g;
    if (h13(c + 5.1) > dens) continue;
    vec3 o = vec3(h13(c), h13(c + 11.3), h13(c + 27.1));
    float d = length(g + o - f), R = 0.16 + 0.32*h13(c + 41.7), x2 = d/R;
    float bowl = x2 < 1.0 ? (x2*x2 - 1.0) : 0.0;
    float rim = exp(-pow((x2 - 1.0)*3.5, 2.0))*0.45;
    float ej = x2 > 1.0 ? exp(-(x2 - 1.0)*2.5)*0.12 : 0.0;
    h += (bowl*0.9 + rim + ej)*R;
    rayOut = max(rayOut, (x2 > 0.9 ? exp(-(x2 - 1.0)*1.6) : 0.4)*step(0.8, h13(c + 63.0)));
  }
  float aa = fwA(p);
  rayOut *= aa;
  return h*aa;
}
`,Qe={earth:`
    vec3 q = p*1.25 + uSeed*7.3;
    vec3 w = vec3(fbmA(q*1.8, 4), fbmA(q*1.8 + 9.2, 4), fbmA(q*1.8 + 3.7, 4)) - 0.5;
    float c = fbmA(q + w*0.85, 7) + 0.04*(ridgeA(q*6.0, 4) - 0.5);
    float lat = abs(p.y), sea = uSea;
    float land = smoothstep(sea - 0.004, sea + 0.004, c);
    float shelf = smoothstep(sea - 0.07, sea, c);
    vec3 ocean = mix(vec3(0.006, 0.022, 0.07), vec3(0.018, 0.09, 0.16), shelf);
    ocean = mix(ocean, vec3(0.03, 0.14, 0.2), smoothstep(sea - 0.012, sea, c)*0.6);
    float m1 = fbmA(p*5.0 + 3.0, 5), m2 = fbmA(p*14.0 + 8.0, 4);
    float mount = ridgeA(p*3.5 + w, 6);
    float elev = (c - sea)*6.0 + mount*0.4;
    // \u0130klim ku\u015Faklar\u0131: ekvator orman\u0131, d\xF6nenceler \xE7\xF6l\xFC, \u0131l\u0131man, tundra, buz
    float desert = smoothstep(0.16, 0.26, lat)*(1.0 - smoothstep(0.42, 0.52, lat));
    desert = clamp(desert*1.4 + (m1 - 0.5)*1.2 - smoothstep(0.02, 0.0, c - sea)*0.4, 0.0, 1.0);
    vec3 forest = mix(vec3(0.030, 0.060, 0.022), vec3(0.06, 0.085, 0.035), m2);
    vec3 grass = mix(vec3(0.12, 0.13, 0.06), vec3(0.18, 0.16, 0.08), m2);
    vec3 sand = mix(vec3(0.42, 0.30, 0.16), vec3(0.56, 0.42, 0.25), m2);
    vec3 tundra = vec3(0.16, 0.15, 0.12)*(0.8 + 0.4*m2);
    vec3 lc = mix(forest, grass, smoothstep(0.35, 0.65, m1 + lat*0.4));
    lc = mix(lc, sand, desert);
    lc = mix(lc, tundra, smoothstep(0.62, 0.74, lat + (m1 - 0.5)*0.15));
    lc = mix(lc, vec3(0.22, 0.2, 0.18)*(0.8 + 0.4*m2), smoothstep(0.55, 0.8, elev*0.5 + mount*0.6)*0.8);
    float ice = smoothstep(0.84, 0.88, lat + (m1 - 0.5)*0.12 + smoothstep(0.6, 0.9, elev)*0.1);
    col = mix(ocean, lc, land);
    col = mix(col, vec3(0.78, 0.82, 0.88)*(0.92 + 0.1*m2), ice);
    rough = mix(0.55 + 0.1*m2, 0.88, max(land, ice*0.8));
    h = land*(0.3 + mount*0.9 + m2*0.2) + ice*0.1;
    // Gece \u0131\u015F\u0131klar\u0131: k\u0131y\u0131ya yak\u0131n \u0131l\u0131man/tropik kara, \xE7\xF6l ve buz d\u0131\u015F\u0131nda k\xFCmeler
    float coast = 1.0 - smoothstep(0.0, 0.05, c - sea);
    float city = smoothstep(0.62, 0.9, vnA(p*70.0 + 4.0))*smoothstep(0.35, 0.6, fbmA(p*9.0 + 2.0, 4) + coast*0.25);
    city += smoothstep(0.82, 0.95, vnA(p*160.0))*0.5*smoothstep(0.45, 0.6, fbmA(p*6.0, 3));
    emis = vec3(1.0, 0.58, 0.26)*city*land*(1.0 - desert*0.8)*(1.0 - ice)*(1.0 - smoothstep(0.7, 0.8, lat))*uLights;`,rocky:`
    vec3 q = p + uSeed*5.1;
    float m1 = fbmA(q*2.2, 6), m2 = fbmA(q*9.0, 4);
    float ray = 0.0, ray2 = 0.0;
    float cr = craterField(q*3.0, 0.5, ray)*1.0 + craterField(q*8.0 + 3.0, 0.6, ray2)*0.45 + craterField(q*22.0 + 7.0, 0.7, ray2)*0.2;
    float maria = smoothstep(0.5, 0.62, fbmA(q*1.3 + 11.0, 5))*uMaria;
    col = mix(uC1, uC2, smoothstep(0.3, 0.7, m1));
    col = mix(col, uC3, maria*0.85);
    col *= 0.85 + 0.3*m2;
    col *= 1.0 + 0.9*cr;
    col = mix(col, uC4, ray*0.35*(1.0 - maria*0.5));
    // Kutup ba\u015Fl\u0131klar\u0131 (Mars)
    float cap = smoothstep(uCap, uCap + 0.03, abs(p.y) + (m1 - 0.5)*0.1);
    col = mix(col, vec3(0.8, 0.8, 0.82), cap);
    rough = 0.9;
    h = cr*2.4 + m2*0.15 - maria*0.1;`,gas:`
    vec3 q = p + uSeed*3.3;
    vec3 w = vec3(fbmA(vec3(q.x*2.0, q.y*8.0, q.z*2.0), 5), fbmA(vec3(q.x*2.0, q.y*8.0, q.z*2.0) + 7.7, 5), 0.0) - 0.5;
    vec3 sq = vec3(q.x*1.6, q.y*uStretch, q.z*1.6) + vec3(w.x, 0.0, w.y)*1.6;
    float turb = fbmA(sq, 6);
    float yy = p.y + (turb - 0.5)*0.09*uTurb + 0.012*sin(atan(p.z, p.x)*5.0 + p.y*30.0)*uTurb;
    float b1 = vnA(vec3(yy*uBands, 0.5, uSeed*9.0)), b2 = vnA(vec3(yy*uBands*2.7, 3.1, uSeed*9.0));
    float band = b1*0.7 + b2*0.3;
    col = mix(uC1, uC2, smoothstep(0.25, 0.75, band));
    col = mix(col, uC3, smoothstep(0.55, 0.85, b2)*0.7);
    col *= 0.86 + 0.28*turb;
    // F\u0131rt\u0131na: elips bi\xE7imli dev leke
    float lon = atan(p.z, p.x), la = asin(clamp(p.y, -1.0, 1.0));
    vec2 sd = vec2((lon - 1.2)*cos(la)/0.16, (la - uSpotLat)/0.075);
    float sp = length(sd);
    float swirl = fbmA(vec3(sd*1.5 + vec2(sin(sp*3.0), cos(sp*3.0)), 2.0), 3);
    col = mix(col, uC4*(0.8 + 0.4*swirl), smoothstep(1.0, 0.55, sp)*uSpot);
    // Kutuplara do\u011Fru koyula\u015Fma (kutup ba\u015Fl\u0131\u011F\u0131)
    col *= mix(1.0, 0.72, smoothstep(0.7, 0.98, abs(p.y)));
    rough = 0.75;
    h = turb*0.3;`},he="varying vec3 vPO; varying vec3 vWN; varying vec3 vWP;",Ye="vPO = normalize(position); vWN = normalize(mat3(modelMatrix)*objectNormal); vWP = (modelMatrix*vec4(transformed, 1.0)).xyz;",Xe={earth:{sea:.5,lights:1,atm:5939455,atmK:1},rocky:{c1:7170404,c2:9407365,c3:4867908,c4:12104876,maria:.4,cap:2,atmK:0},gas:{c1:13218707,c2:9133371,c3:15722198,c4:10635822,bands:15,stretch:14,turb:1,spot:0,spotLat:-.38}};function Je(e,a={}){let t={seed:Math.random(),bump:.01,atm:9417983,atmK:.4,...Xe[e],...a},o=s=>new p.THREE.Color(s),r=new p.THREE.MeshStandardMaterial({roughness:.8,metalness:0}),i={uStar:B,uSeed:{value:t.seed},uBump:{value:t.bump},uAtm:{value:o(t.atm)},uAtmK:{value:t.atmK},uSea:{value:t.sea??.5},uLights:{value:t.lights??0},uMaria:{value:t.maria??0},uCap:{value:t.cap??2},uC1:{value:o(t.c1??16777215)},uC2:{value:o(t.c2??16777215)},uC3:{value:o(t.c3??16777215)},uC4:{value:o(t.c4??16777215)},uBands:{value:t.bands??12},uStretch:{value:t.stretch??12},uTurb:{value:t.turb??1},uSpot:{value:t.spot??0},uSpotLat:{value:t.spotLat??-.38}};return r.userData.uniforms=i,r.onBeforeCompile=s=>{Object.assign(s.uniforms,i),s.vertexShader=s.vertexShader.replace("#include <common>",`#include <common>
`+he).replace("#include <begin_vertex>",`#include <begin_vertex>
`+Ye),s.fragmentShader=s.fragmentShader.replace("#include <common>",`#include <common>
        ${he}
        uniform vec3 uStar, uAtm, uC1, uC2, uC3, uC4; uniform float uSeed, uBump, uAtmK, uSea, uLights, uMaria, uCap, uBands, uStretch, uTurb, uSpot, uSpotLat;
        ${p.NOISE3_GLSL}
        ${X}
        float sRough, sH; vec3 sEmis;
        void surface(vec3 p, inout vec3 col, inout float rough, inout float h, inout vec3 emis){ ${Qe[e]} }`).replace("#include <color_fragment>",`#include <color_fragment>
        { vec3 c = diffuseColor.rgb; sRough = roughness; sH = 0.0; sEmis = vec3(0.0);
          surface(normalize(vPO), c, sRough, sH, sEmis); diffuseColor.rgb = c; }`).replace("#include <roughnessmap_fragment>",`#include <roughnessmap_fragment>
roughnessFactor = sRough;`).replace("#include <normal_fragment_maps>",`#include <normal_fragment_maps>
        {
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1);
          float dhx = dFdx(sH)*uBump, dhy = dFdy(sH)*uBump;
          vec3 grad = sign(det)*(dhx*r1 + dhy*r2);
          normal = normalize(abs(det)*normal - grad);
        }`).replace("#include <emissivemap_fragment>",`#include <emissivemap_fragment>
        {
          vec3 L = normalize(uStar - vWP), N = normalize(vWN);
          float ndl = dot(N, L);
          float night = smoothstep(0.08, -0.12, ndl);
          totalEmissiveRadiance += sEmis*night*1.6;
          // Atmosfer: diskin kenar\u0131nda y\u0131ld\u0131z\u0131n ayd\u0131nlatt\u0131\u011F\u0131 mavi sa\xE7\u0131lma
          float nv = clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          float lit = smoothstep(-0.25, 0.45, ndl);
          totalEmissiveRadiance += uAtm*uAtmK*(pow(1.0 - nv, 3.0)*1.4 + 0.06)*lit;
        }`)},r.customProgramCacheKey=()=>"planet-"+e,r}function ea({seed:e=Math.random(),cover:a=.5,color:t=16777215,bands:o=0}={}){let r=new p.THREE.MeshStandardMaterial({color:t,roughness:1,metalness:0,transparent:!0,depthWrite:!1}),i={uSeed:{value:e},uCover:{value:a},uCBands:{value:o}};return r.onBeforeCompile=s=>{Object.assign(s.uniforms,i),s.vertexShader=s.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vPO;`).replace("#include <begin_vertex>",`#include <begin_vertex>
vPO = normalize(position);`),s.fragmentShader=s.fragmentShader.replace("#include <common>",`#include <common>
varying vec3 vPO; uniform float uSeed, uCover, uCBands;
${p.NOISE3_GLSL}
${X}`).replace("#include <color_fragment>",`#include <color_fragment>
        {
          vec3 p = normalize(vPO), q = p*1.6 + uSeed*11.0;
          float lat = p.y;
          // Enleme ba\u011Fl\u0131 ak\u0131\u015F: bulut \u015Feritleri do\u011Fu\u2013bat\u0131 uzar, orta enlemlerde siklon girdaplar\u0131
          vec3 w = vec3(fbmA(q*2.0, 4), fbmA(q*2.0 + 5.2, 4), fbmA(q*2.0 + 9.4, 4)) - 0.5;
          vec3 sq = vec3(q.x, q.y*(2.2 + uCBands), q.z) + w*1.2;
          float n = fbmA(sq*2.2, 7);
          float det = fbmA(q*18.0 + w*3.0, 4);
          float belt = 0.10*exp(-lat*lat*90.0) + 0.08*smoothstep(0.4, 0.75, abs(lat)) - 0.06*smoothstep(0.15, 0.3, abs(lat))*(1.0 - smoothstep(0.35, 0.45, abs(lat)));
          float a = smoothstep(1.0 - uCover - 0.06, 1.0 - uCover + 0.22, n + belt + (det - 0.5)*0.18);
          diffuseColor.a *= a*0.96;
          diffuseColor.rgb *= 0.86 + 0.18*det;
        }`)},r.customProgramCacheKey=()=>"planet-clouds",r}var aa="varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }",ta=`
uniform vec3 uCenter, uStar, uCol; uniform float uR, uRa, uK; varying vec3 vW;
void main(){
  vec3 rd = normalize(vW - cameraPosition), oc = uCenter - cameraPosition;
  float t = dot(oc, rd); vec3 cp = cameraPosition + rd*max(t, 0.0);
  float b = length(cp - uCenter);
  float hN = clamp((b - uR)/(uRa - uR), 0.0, 1.0);
  float dens = exp(-hN*4.5)*(1.0 - hN);
  vec3 n = normalize(cp - uCenter), L = normalize(uStar - uCenter);
  float lit = smoothstep(-0.35, 0.5, dot(n, L));
  float fwd = pow(max(dot(rd, L), 0.0), 6.0)*1.5;  // y\u0131ld\u0131za kar\u015F\u0131 ileri sa\xE7\u0131lma (ters \u0131\u015F\u0131kta parlak halka)
  vec3 c = uCol*dens*(lit + fwd)*uK;
  gl_FragColor = vec4(c, 1.0);
}`;function oa(e,a,t=1,o=.06){let r={uCenter:{value:new p.THREE.Vector3},uStar:B,uCol:{value:new p.THREE.Color(a)},uR:{value:e},uRa:{value:e*(1+o)},uK:{value:t}},i=new p.THREE.Mesh(new p.THREE.SphereGeometry(e*(1+o),64,32),new p.THREE.ShaderMaterial({uniforms:r,vertexShader:aa,fragmentShader:ta,side:p.THREE.BackSide,transparent:!0,depthWrite:!1,blending:p.THREE.AdditiveBlending}));return i.onBeforeRender=()=>{i.getWorldPosition(r.uCenter.value)},i.raycast=()=>{},i.userData.noShadow=!0,i}var ra="varying vec3 vW; varying vec3 vL; void main(){ vL = position; vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }",na=p.NOISE3_GLSL+`
uniform vec3 uCenter, uStar, uC1, uC2, uNormal; uniform float uR, uIn, uOut, uSeed, uOpacity; varying vec3 vW; varying vec3 vL;
void main(){
  float r = length(vL.xy), x = (r - uIn)/(uOut - uIn);
  if (x < 0.0 || x > 1.0) discard;
  float n1 = vn3(vec3(x*38.0, uSeed, 0.0)), n2 = vn3(vec3(x*140.0, uSeed + 3.0, 0.0)), n3 = vn3(vec3(x*520.0, uSeed + 7.0, 0.0));
  float dens = 0.35 + 0.45*n1 + 0.25*n2 + 0.15*n3;
  dens *= 1.0 - 0.9*smoothstep(0.012, 0.0, abs(x - 0.64));         // Cassini bo\u015Flu\u011Fu
  dens *= 1.0 - 0.5*smoothstep(0.0, 0.25, 0.25 - x)*0.8;             // i\xE7 C halkas\u0131 daha seyrek
  dens *= smoothstep(0.0, 0.03, x)*smoothstep(1.0, 0.96, x);
  dens *= 1.0 - 0.7*smoothstep(0.012, 0.0, abs(x - 0.9));             // Encke
  float a = clamp(dens, 0.0, 1.0)*uOpacity;
  vec3 col = mix(uC1, uC2, n1*0.6 + n2*0.4);
  // Ayd\u0131nlatma: y\u0131ld\u0131z \u0131\u015F\u0131\u011F\u0131n\u0131n halka d\xFCzlemine a\xE7\u0131s\u0131 + gezegen g\xF6lgesi (analitik k\xFCre kesi\u015Fimi)
  vec3 L = normalize(uStar - vW);
  float nl = abs(dot(normalize(uNormal), L));
  vec3 oc = vW - uCenter; float bb = dot(oc, L), cc = dot(oc, oc) - uR*uR, disc = bb*bb - cc;
  float shadow = (disc > 0.0 && -bb - sqrt(max(disc, 0.0)) > 0.0) ? 0.06 : 1.0;
  vec3 V = normalize(cameraPosition - vW);
  float back = pow(max(dot(-V, L), 0.0), 4.0)*(1.0 - a)*1.5;         // ters \u0131\u015F\u0131kta ince toz parlar
  vec3 c = col*(0.12 + 1.9*(0.35 + 0.65*nl))*shadow + col*back*shadow;
  gl_FragColor = vec4(c, a);
}`;function la(e,{inner:a=1.24,outer:t=2.27,c1:o=13482388,c2:r=9271902,opacity:i=.92,seed:s=Math.random()}={}){let f=new p.THREE.RingGeometry(e*a,e*t,256,1),c={uCenter:{value:new p.THREE.Vector3},uStar:B,uC1:{value:new p.THREE.Color(o)},uC2:{value:new p.THREE.Color(r)},uNormal:{value:new p.THREE.Vector3},uR:{value:e},uIn:{value:e*a},uOut:{value:e*t},uSeed:{value:s*10},uOpacity:{value:i}},n=new p.THREE.Mesh(f,new p.THREE.ShaderMaterial({uniforms:c,vertexShader:ra,fragmentShader:na,side:p.THREE.DoubleSide,transparent:!0,depthWrite:!1}));n.rotation.x=-Math.PI/2;let m=new p.THREE.Quaternion;return n.onBeforeRender=()=>{n.parent.getWorldPosition(c.uCenter.value),n.getWorldQuaternion(m),c.uNormal.value.set(0,0,1).applyQuaternion(m)},n.raycast=()=>{},n.userData.noShadow=!0,n}var ia=`varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,sa=p.NOISE3_GLSL+X+`
uniform vec3 uCol; uniform float uTime, uInt, uSpots, uGran, uLimb; varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  vec3 p = normalize(vP);
  float mu = clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0);
  vec3 drift = vec3(0.0, 0.0, uTime*0.02);
  float g1 = cellsA(p*42.0*uGran + drift), g2 = cellsA(p*95.0*uGran - drift*1.7);
  float gran = (1.0 - g1)*0.65 + (1.0 - g2)*0.35;                   // gran\xFCl merkezleri parlak, aras\u0131 koyu \u015Ferit
  float sup = fbmA(p*5.0 + uTime*0.004, 5);
  float act = smoothstep(0.55, 0.75, fbmA(p*2.2 + 20.0, 4))*(1.0 - smoothstep(0.25, 0.55, abs(p.y)));
  float spot = smoothstep(0.62, 0.7, fbmA(p*7.0 + 3.0, 5))*act*uSpots;
  float pen = smoothstep(0.55, 0.62, fbmA(p*7.0 + 3.0, 5))*act*uSpots;
  float fac = smoothstep(0.5, 0.65, fbmA(p*14.0, 4))*act*(1.0 - mu);   // fakula: kenarda parlak
  float limb = mix(1.0, 0.38 + 0.62*pow(mu, 0.55), uLimb);                              // kenar kararmas\u0131
  vec3 tint = mix(vec3(1.0, 0.45, 0.18), vec3(1.0), pow(mu, 0.35));   // kenar k\u0131z\u0131lla\u015Fmas\u0131
  vec3 c = uCol*tint*limb*(0.72 + 0.42*gran + 0.25*(sup - 0.5));
  c *= 1.0 - 0.55*pen - 0.4*spot;
  c += uCol*fac*0.5;
  gl_FragColor = vec4(c*uInt, 1.0);
}`,ca=p.NOISE3_GLSL+`
uniform vec3 uCol; uniform float uTime, uInt, uK; varying vec2 vUv;
void main(){
  vec2 d = (vUv - 0.5)*2.0*uK; float r = length(d);
  if (r < 0.97) discard;
  float a = atan(d.y, d.x);
  vec3 dir = vec3(cos(a), sin(a), 0.0);
  float s1 = vn3(dir*4.0 + vec3(0.0, 0.0, r*0.35 - uTime*0.03));
  float s2 = vn3(dir*11.0 + vec3(3.0, 0.0, r*0.8 - uTime*0.05));
  float streak = 0.55 + 0.7*s1*s1 + 0.35*s2;
  float x = r - 1.0;
  float I = exp(-x*9.0)*1.0 + exp(-x*2.2)*0.3*streak + exp(-x*0.7)*0.025;
  I *= smoothstep(uK, uK*0.55, r);
  gl_FragColor = vec4(uCol*I*uInt, 1.0);
}`;function be(e,{color:a=16767400,intensity:t=7,spots:o=1,corona:r=1,gran:i=1,limb:s=1}={}){let f=new p.THREE.Group,c={uCol:{value:new p.THREE.Color(a)},uTime:{value:0},uInt:{value:t},uSpots:{value:o},uGran:{value:i},uLimb:{value:s}},n=new p.THREE.Mesh(new p.THREE.SphereGeometry(e,96,64),new p.THREE.ShaderMaterial({uniforms:c,vertexShader:ia,fragmentShader:sa}));n.userData.noShadow=!0,f.add(n);let m=7,d={uCol:c.uCol,uTime:c.uTime,uInt:{value:t*.3*r},uK:{value:m}},v=new p.THREE.Mesh(new p.THREE.PlaneGeometry(e*2*m,e*2*m),new p.THREE.ShaderMaterial({uniforms:d,vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }",fragmentShader:ca,transparent:!0,depthWrite:!1,blending:p.THREE.AdditiveBlending}));v.raycast=()=>{},v.userData.noShadow=!0;let g=new p.THREE.Quaternion;return v.onBeforeRender=(w,P,M)=>{v.parent.getWorldQuaternion(g).invert(),v.quaternion.copy(g).multiply(M.quaternion),v.updateMatrixWorld()},f.add(v),{group:f,surface:n,corona:v,uniforms:c,setColor(w){c.uCol.value.set(w)},setIntensity(w){c.uInt.value=w,d.uInt.value=w*.3*r},setCorona(w){r=w,d.uInt.value=c.uInt.value*.3*w},update(w){c.uTime.value+=w}}}var ua={merkur:{kind:"rocky",c1:7038304,c2:9341057,c3:5920080,c4:12894134,maria:.25,spin:.2,tilt:0},venus:{kind:"gas",c1:14270605,c2:12163682,c3:15524034,c4:14270605,bands:5,stretch:6,turb:1.6,atm:16767392,atmK:.5,spin:-.1,tilt:.05},dunya:{kind:"earth",clouds:.5,atm:5082623,atmK:1,spin:.9,tilt:.41,halo:6134783},mars:{kind:"rocky",c1:9062954,c2:11034422,c3:5911330,c4:12614220,maria:.55,cap:.9,atm:14721152,atmK:.25,spin:.85,tilt:.44,halo:14195578,haloK:.35},jupiter:{kind:"gas",c1:14206116,c2:10119749,c3:15920352,c4:11883834,bands:16,stretch:16,turb:1.1,spot:1,spotLat:-.38,atm:14272942,atmK:.25,spin:2.2,tilt:.05},saturn:{kind:"gas",c1:14732446,c2:12163686,c3:15853256,c4:13482124,bands:12,stretch:18,turb:.6,atm:15260344,atmK:.25,spin:2,tilt:.47,ring:{}},uranus:{kind:"gas",c1:10475228,c2:8831948,c3:12576490,c4:10475228,bands:6,stretch:10,turb:.35,atm:11068656,atmK:.6,spin:-1.4,tilt:1.71,ring:{inner:1.6,outer:2,c1:7305088,c2:4212300,opacity:.35}},neptun:{kind:"gas",c1:3892424,c2:2903976,c3:7312870,c4:2043758,bands:8,stretch:12,turb:.8,spot:1,spotLat:-.35,atm:7314431,atmK:.7,spin:1.5,tilt:.49}};function ye(e,a,t=Math.random()){let o=typeof a=="string"?ua[a]:a,r=new p.THREE.Group,i=new p.THREE.Group;i.rotation.z=o.tilt||0,r.add(i);let s=e>.9?128:96,f=new p.THREE.Mesh(new p.THREE.SphereGeometry(e,s,s/2),Je(o.kind,{...o,seed:t,bump:e*.02}));i.add(f);let c=null;o.clouds&&(c=new p.THREE.Mesh(new p.THREE.SphereGeometry(e*1.012,s,s/2),ea({seed:t+.37,cover:o.clouds})),c.raycast=()=>{},i.add(c)),(o.halo||o.kind==="earth")&&r.add(oa(e,o.halo??o.atm,o.haloK??1.2,o.kind==="earth"?.07:.05)),o.ring&&i.add(la(e,{...o.ring,seed:t}));let n=o.spin??1;return{group:r,body:i,surface:f,clouds:c,look:o,spin(m){f.rotation.y+=m*n,c&&(c.rotation.y+=m*n*1.12)}}}var S=[200,400,500,600,700,800,900,1e3,1200,2e3],x=S.length-1,K=S.slice(0,-1).map((e,a)=>`${e}\u2013${S[a+1]}`),ma=[200,1600,6200,700,700,300,100,600,300],da=[100,300,600,800,1200,1400,1e3,700,900],fa=[300,1200,1800,2e3,3e3,3500,2e3,1200,1500],ge=[.03,.2,.55,.08,.04,.02,.01,.05,.02],O=900,we=50,pa=5,va=.03,xe=24e-8,V=(e,a=1)=>1.5*Math.exp((e-400)/75)/a,J=S.slice(0,-1).map((e,a)=>((6371+S[a+1])**3-(6371+e)**3)/1e9);function ee(){return{year:2025,S:[...ma],D:[...da],Z:new Array(x).fill(0),F:[...fa],collisions:0,catastrophic:0,reentries:0,removed:0}}var $=(e,a)=>e.S[a]+e.D[a]+e.Z[a]+e.F[a],A=e=>e.reduce((a,t)=>a+t,0);function _(e,a){let t=[];for(let o=0;o<x;o++){let r=e.D[o]+(e.S[o]+e.Z[o])*(1-a.avoid),i=xe*r*r/J[o],s=xe*2*r*e.F[o]/J[o]*.5,f=1/(V(S[o+1],a.sun)-V(S[o],a.sun)),c=i*O+s*we,n=e.F[o]*f*2;t.push({II:i,IF:s,kd:f,prod:c,loss:n,ratio:n>0?c/n:c>0?99:0,growth:(c-n)/Math.max(e.F[o],1)})}return t}function ke(e,a){if(e<=0)return 0;if(e>30)return Math.max(0,Math.round(e+Math.sqrt(e)*ha(a)));let t=Math.exp(-e),o=0,r=1;do o++,r*=a();while(r>t);return o-1}function ha(e){return Math.sqrt(-2*Math.log(1-e()))*Math.cos(2*Math.PI*e())}function T(e,a,t){let o=Math.min(x-1,a+1),r=Math.max(0,a-1);e.F[a]+=t*.6,e.F[o]+=t*.2,e.F[r]+=t*.2}function ba(e,a,t){for(let o of["D","Z","S"]){let r=Math.min(e[o][a],t);if(e[o][a]-=r,t-=r,t<=0)return}}function Se(e,a,t,o){let r=[],i=_(e,a);for(let n=0;n<x;n++){let m=o?ke(i[n].II*t,o):i[n].II*t,d=o?ke(i[n].IF*t,o):i[n].IF*t;if(m>0&&(ba(e,n,2*m),T(e,n,O*m),e.catastrophic+=m,o))for(let v=0;v<Math.min(m,3);v++)r.push({band:n,big:!0});if(d>0){let v=Math.min(e.S[n],d*(e.S[n]*(1-a.avoid))/(e.D[n]+(e.S[n]+e.Z[n])*(1-a.avoid)+1e-9));if(e.S[n]-=v,e.D[n]+=v,T(e,n,we*d),o)for(let g=0;g<Math.min(d,2);g++)r.push({band:n,big:!1})}e.collisions+=m+d}if(!a.rule)for(let n=0;n<x;n++)e.D[n]+=e.Z[n],e.Z[n]=0;let s=a.rule?a.pmd:0;for(let n=0;n<x;n++){let m=e.S[n]/pa*t;e.S[n]-=m,e.Z[n]+=m*s,e.D[n]+=m*(1-s)}for(let n=0;n<x;n++)e.S[n]+=a.launch*ge[n]*t,e.D[n]+=a.launch*ge[n]*va*t;let f={D:new Array(x).fill(0),Z:new Array(x).fill(0),F:new Array(x).fill(0)};for(let n=0;n<x;n++){let m=i[n].kd;for(let[d,v]of[["D",1],["Z",1],["F",2]]){let g=Math.min(e[d][n],e[d][n]*m*v*t);e[d][n]-=g,n===0?e.reentries+=g:f[d][n-1]+=g}if(a.rule){let d=Math.min(e.Z[n],e.Z[n]/a.rule*t*1.5);e.Z[n]-=d,e.reentries+=d}}for(let n=0;n<x;n++)e.D[n]+=f.D[n],e.Z[n]+=f.Z[n],e.F[n]+=f.F[n];let c=a.adr*t;for(;c>1e-9;){let n=-1,m=0;for(let v=0;v<x;v++){let g=e.D[v]*$(e,v)/J[v]*Math.min(1/i[v].kd,300);g>m&&e.D[v]>.5&&(m=g,n=v)}if(n<0)break;let d=Math.min(c,e.D[n]);e.D[n]-=d,e.removed+=d,c-=d}return e.year+=t,r}var u=Y(N(),1);function Ce(e){return(0,u.procedural)({key:"uz-solar",physical:!0,bump:.002,params:{color:e,roughness:.3,metalness:.25},pattern:`
      vec2 q = p.xy*vec2(46.0, 46.0);
      vec2 f = abs(fract(q) - 0.5);
      float gap = step(0.46, max(f.x, f.y));
      float bus = step(0.47, abs(fract(q.y*4.0) - 0.5))*0.6;
      float tone = vn3(vec3(floor(q), seed*9.0));
      col *= 0.8 + 0.35*tone;
      col = mix(col, vec3(0.62, 0.6, 0.55), max(gap, bus));
      metal = mix(metal, 0.9, max(gap, bus));
      rough = mix(rough - 0.05*tone, 0.35, gap);
      h = -gap;`})}var ga=()=>u.mat.paintedMetal({color:15131871,wear:.08});function xa(){let e=new u.THREE.Group,a=u.mat.brushedMetal({color:12106687,rough:.4}),t=ga(),o=u.mat.plastic({color:15855852,gloss:.25}),r=Ce(7031332),i=(m,d,v=0,g=0,w=0)=>{let P=new u.THREE.Mesh(m,d);return P.position.set(v,g,w),e.add(P),P};i(new u.RoundedBoxGeometry(1.5,.05,.05,1,.008),a);for(let m=-7;m<=7;m++)i(new u.THREE.BoxGeometry(.008,.07,.07),a,m*.1);let s=(m,d,v,g=0)=>i(new u.THREE.CylinderGeometry(m,m,d,24).rotateX(Math.PI/2),t,g,-.06,v);s(.045,.34,.02),s(.04,.2,.28),s(.05,.2,-.24),s(.035,.16,-.43),s(.038,.18,.02,.14).rotation.y=Math.PI/2,i(new u.THREE.SphereGeometry(.05,20,14),t,0,-.06,.2);for(let m of[-.26,.26])i(new u.RoundedBoxGeometry(.06,.005,.32,1,.002),o,m,-.02,-.2);let f=[],c=new u.RoundedBoxGeometry(.1,.62,.006,1,.002),n=new u.THREE.CylinderGeometry(.004,.004,1.3,6);for(let m of[-.72,-.6,.6,.72]){let d=new u.THREE.Group;d.position.set(m,0,0),e.add(d),f.push(d);for(let v of[-1,1]){let g=new u.THREE.Mesh(c,r);g.position.y=v*.35,d.add(g)}d.add(new u.THREE.Mesh(n,a))}return{group:e,pivots:f}}function Me(){let e=new u.THREE.Group,a=u.mat.brushedMetal({color:10330792,rough:.35}),t=u.mat.brushedMetal({color:14197826,rough:.22}),o=Ce(1714e3);e.add(new u.THREE.Mesh(new u.RoundedBoxGeometry(.05,.05,.15,1,.004),a));let r=new u.THREE.Mesh(new u.THREE.BoxGeometry(.042,.052,.13),t);e.add(r);let i=new u.RoundedBoxGeometry(.05,.15,.003,1,.001);for(let f=0;f<4;f++){let c=new u.THREE.Group;c.rotation.z=f*Math.PI/2+Math.PI/4,e.add(c);let n=new u.THREE.Mesh(i,o);n.rotation.x=Math.PI/2,n.position.x=.062,c.add(n)}let s=new u.THREE.Mesh(new u.THREE.CylinderGeometry(.0015,.0015,.12,5),a);return s.position.set(.02,.07,.06),e.add(s),e}function ka(){let e=new u.THREE.Group,a=u.mat.paintedMetal({color:14605267,wear:.35}),t=u.mat.paintedMetal({color:2763566,wear:.2}),o=u.mat.brushedMetal({color:7169372,rough:.45}),r=u.mat.brushedMetal({color:13212220,rough:.3}),i=new u.THREE.Mesh(new u.THREE.CylinderGeometry(.08,.08,.42,32),a);e.add(i);let s=new u.THREE.Mesh(new u.THREE.SphereGeometry(.08,32,12,0,Math.PI*2,0,Math.PI/2),a);s.position.y=.21,e.add(s);let f=new u.THREE.Mesh(new u.THREE.CylinderGeometry(.0815,.0815,.06,32),t);f.position.y=.08,e.add(f);let c=new u.THREE.Mesh(new u.THREE.CylinderGeometry(.08,.06,.05,32),r);c.position.y=-.235,e.add(c);let n=new u.THREE.Mesh(new u.THREE.LatheGeometry([[.018,0],[.024,-.02],[.045,-.1],[.058,-.15],[.056,-.152],[.02,-.02]].map(([m,d])=>new u.THREE.Vector2(m,d)),28),o);return n.material.side=u.THREE.DoubleSide,n.position.y=-.26,e.add(n),e}function Ae(e,{spots:a,scale:t=1}){let o=xa(),r=Me(),i=Me(),s=ka(),f=[{o:o.group,s:1.25*t,spin:0},{o:r,s:1.6*t,spin:.25},{o:i,s:1.6*t,spin:-.18},{o:s,s:1.7*t,spin:.12}],c=new u.THREE.Group;e.add(c),f.forEach((M,I)=>{let F=a[I];M.base=F.dir.clone().normalize().multiplyScalar(F.r),M.axis=new u.THREE.Vector3().crossVectors(M.base,F.vel||new u.THREE.Vector3(0,1,0)).normalize(),M.o.scale.setScalar(M.s),M.o.position.copy(M.base),M.o.rotation.set(I*1.3,I*.7,I*.4),c.add(M.o)});let n=new u.THREE.Quaternion,m=new u.THREE.Vector3,d=new u.THREE.Matrix4,v=new u.THREE.Vector3,g=new u.THREE.Vector3,w=new u.THREE.Vector3,P=0;return{root:c,update(M,I){P+=M;for(let C of f)n.setFromAxisAngle(C.axis,P*.004),C.o.position.copy(C.base).applyQuaternion(n),C.o===o.group?(v.copy(C.o.position).normalize(),g.crossVectors(C.axis,v).normalize(),w.crossVectors(v,g),d.makeBasis(w,v,g),C.o.quaternion.setFromRotationMatrix(d)):(C.o.rotateY(M*C.spin),C.o.rotateX(M*C.spin*.6));o.group.updateMatrixWorld(),m.copy(I).transformDirection(d.copy(o.group.matrixWorld).invert());let F=Math.atan2(-m.y,m.z);for(let C of o.pivots)C.rotation.x=F}}}var Q=6.371,wa=3,z=e=>Q+e/1e3*wa,Sa=1.5,j=9e3,ze=[4,10,25,100,250,1e3,2500,1e4],D=[{key:"S",name:"Aktif uydu",color:12182468},{key:"D",name:"\xD6l\xFC uydu / roket g\xF6vdesi",color:14929828},{key:"Z",name:"G\xF6rev sonu ini\u015Fte",color:12571630},{key:"F",name:"Par\xE7a",color:14079186}],y=(0,l.createSim)({space:{star:[360,70,150],power:1.05,milky:.9,nebula:.6,stars:.5,galaxyTilt:70},look:{bloomStrength:.4},camera:{position:[-9,7.5,24],target:[1.5,.5,0],fov:45,near:.05,far:3e3},controls:{maxDistance:120,minDistance:9,maxPolarAngle:Math.PI,enablePan:!1},info:`
    <h3>Ne g\xF6r\xFCyorsun?</h3>
    <p>D\xFCnya ve al\xE7ak y\xF6r\xFCngedeki (LEO, 200\u20132.000 km) \u2265 10 cm nesneler: <b style="color:#6fae80">aktif uydular</b>,
    <b style="color:#b8955a">\xF6l\xFC uydular ve roket g\xF6vdeleri</b>, g\xF6rev sonu kural\u0131na uyup <b style="color:#7d9cc4">al\xE7almakta olan uydular</b>, <b style="color:#8f8a86">\xE7arp\u0131\u015Fma ve patlama par\xE7alar\u0131</b>.
    Her nokta birka\xE7 nesneyi temsil eder; irtifa g\xF6r\xFCn\xFCrl\xFCk i\xE7in 3 kat abart\u0131lm\u0131\u015Ft\u0131r. \xD6n plandaki istasyon, k\xFCp uydular ve bo\u015F roket kademesi
    \xF6l\xE7eksiz \xF6rnek modellerdir (ger\xE7ekte bu \xF6l\xE7ekte bir pikselden \xE7ok k\xFC\xE7\xFCkt\xFCrler). Ekvator d\xFCzlemindeki halkalar
    irtifa bantlar\u0131d\u0131r: renkleri o banttaki par\xE7a n\xFCfusunun <b>\xE7arp\u0131\u015Fma \xFCretimi \u2212 atmosfer temizli\u011Fi</b> ile net b\xFCy\xFCme h\u0131z\u0131n\u0131 g\xF6sterir
    (mavi: atmosfer temizliyor, sar\u0131: denge, k\u0131rm\u0131z\u0131: \xE7arp\u0131\u015Fmalarla kendi kendini besliyor).</p>
    <h3>Model</h3>
    <ul>
      <li><b>\xC7arp\u0131\u015Fma h\u0131z\u0131 \u221D yo\u011Funluk\xB2:</b> Bir banttaki \xE7arp\u0131\u015Fma say\u0131s\u0131 nesne say\u0131s\u0131n\u0131n karesiyle artar, bant hacmine b\xF6l\xFCn\xFCr.
      Aktif uydular manevrayla ka\xE7\u0131nabilir ("ka\xE7\u0131nma ba\u015Far\u0131s\u0131").</li>
      <li><b>Par\xE7alanma:</b> \u0130ki b\xFCt\xFCn nesne \xE7arp\u0131\u015F\u0131rsa NASA Standart Par\xE7alanma Modeline g\xF6re
      N(\u2265L<sub>c</sub>) = 0,1\xB7M<sup>0,75</sup>\xB7L<sub>c</sub><sup>\u22121,71</sup> \u2192 M \u2248 1.000 kg i\xE7in \u2248 900 adet \u2265 10 cm par\xE7a.
      Par\xE7an\u0131n uyduya \xE7arpmas\u0131 daha az par\xE7a \xFCretir (temsili 50).</li>
      <li><b>Atmosfer s\xFCr\xFCklemesi:</b> Nesneler yava\u015F\xE7a al\xE7al\u0131r ve yanar. \xD6m\xFCr irtifayla \xFCstel artar: \u2248 400 km'de 1\u20132 y\u0131l,
      600 km'de onlarca y\u0131l, 800 km'de y\xFCzy\u0131llar, 1.000 km \xFCst\xFCnde binlerce y\u0131l (temsili; G\xFCne\u015F etkinli\u011Fine ba\u011Fl\u0131).</li>
      <li><b>G\xF6rev sonu kural\u0131:</b> Uyumlu uydular g\xF6rev bitince 25 y\u0131l (IADC y\xF6nergesi) ya da 5 y\u0131l (ABD FCC, 2022) i\xE7inde y\xF6r\xFCngeden \xE7\u0131kar;
      uymayanlar \xF6l\xFC nesne olarak kal\u0131r. <b>Aktif enkaz kald\u0131rma</b> en riskli bantlardan b\xFCy\xFCk \xF6l\xFC nesneleri toplar.</li>
      <li><b>Kessler sendromu:</b> Bir bantta \xE7arp\u0131\u015Fmalar\u0131n \xFCretti\u011Fi par\xE7a, s\xFCr\xFCklemenin temizledi\u011Finden fazlaysa n\xFCfus f\u0131rlatma olmadan da b\xFCy\xFCr
      (Kessler & Cour-Palais, 1978).</li>
    </ul>
    <h3>Dene</h3>
    <ul>
      <li><b>F\u0131rlatma durursa</b>: 400 km alt\u0131 birka\xE7 y\u0131lda temizlenir ama 800\u20131.000 km'deki par\xE7alar y\xFCzy\u0131llarca kal\u0131r ve \xE7arp\u0131\u015Fmalar
      par\xE7a say\u0131s\u0131n\u0131 yava\u015F\xE7a art\u0131r\u0131r. NASA'n\u0131n LEGEND sim\xFClasyonlar\u0131 da benzer sonu\xE7 verir (Liou & Johnson, 2006).</li>
      <li><b>Kontrols\xFCz b\xFCy\xFCme</b>: \xE7arp\u0131\u015Fmalar zincirleme artar, grafik \xFCstel ko\u015Far.</li>
      <li><b>ASAT testi</b> d\xFC\u011Fmesine bas: 865 km'ye binlerce par\xE7a eklenir; o band\u0131n halkas\u0131 k\u0131rm\u0131z\u0131ya d\xF6ner ve uzun s\xFCre \xF6yle kal\u0131r.</li>
      <li>"Bug\xFCnk\xFC e\u011Filim"de 5 y\u0131l kural\u0131n\u0131 ve y\u0131lda 20 nesne kald\u0131rmay\u0131 a\xE7: b\xFCy\xFCme ne kadar yava\u015Fl\u0131yor?</li>
    </ul>
    <h3>Ger\xE7ek veriler</h3>
    <ul>
      <li>ESA Uzay \xC7evresi Raporu 2025: \u2248 40.000 nesne izleniyor, bunlar\u0131n \u2248 11.000'i aktif uydu; tahminen 10 cm'den b\xFCy\xFCk
      50.000'den fazla, 1 cm'den b\xFCy\xFCk 1,2 milyondan fazla enkaz var.</li>
      <li>10 \u015Eubat 2009: aktif Iridium 33 ile kullan\u0131lmayan Kosmos 2251, 789 km'de \u2248 11,7 km/s h\u0131zla \xE7arp\u0131\u015Ft\u0131; 2.000'den fazla par\xE7a katalogland\u0131.</li>
      <li>Ocak 2007: \xC7in, \u2248 865 km'deki Fengyun-1C uydusunu f\xFCzeyle vurdu (ASAT testi); 3.000'den fazla izlenebilir par\xE7a olu\u015Ftu.</li>
    </ul>
    <p><small>Ba\u015Flang\u0131\xE7taki bant da\u011F\u0131l\u0131m\u0131, f\u0131rlatma da\u011F\u0131l\u0131m\u0131, s\xFCr\xFCkleme \xF6m\xFCrleri ve \xE7arp\u0131\u015Fma katsay\u0131s\u0131 temsilidir (ba\u015Flang\u0131\xE7ta y\u0131lda \u2248 0,1
    b\xFCy\xFCk \xE7arp\u0131\u015Fma). Model istatistikseldir: tek tek y\xF6r\xFCngeler hesaplanmaz, e\u011Fim ve y\xF6r\xFCnge d\xFCzlemleri g\xF6sterim i\xE7indir.
    Kaynaklar: ESA Space Environment Report 2025; NASA Orbital Debris Program Office (SBM; ODQN); Kessler & Cour-Palais (1978).</small></p>`}),Ie=new l.THREE.Vector3(360,70,150);B.value.copy(Ie);var ue=be(3.4,{color:16773598,intensity:4.5});ue.group.position.copy(Ie);y.scene.add(ue.group);var _e=ye(Q,"dunya",.31),Ma=_e.group;y.scene.add(Ma);var E=[],L=new l.THREE.Group,Ca=new l.THREE.Color(12108492);y.scene.add(L);for(let e=0;e<x;e++){let a=z(S[e]),t=z(S[e+1]),o=new l.THREE.Mesh(new l.THREE.RingGeometry(a+.01,t-.01,160,1),new l.THREE.MeshBasicMaterial({color:10466508,transparent:!0,opacity:.01,side:l.THREE.DoubleSide,depthWrite:!1,blending:l.THREE.AdditiveBlending}));o.rotation.x=-Math.PI/2,o.userData.band=e;let r=new l.THREE.Mesh(new l.THREE.TorusGeometry((a+t)/2,.006,6,256),new l.THREE.MeshBasicMaterial({color:10466508,transparent:!0,opacity:.1,depthWrite:!1,blending:l.THREE.AdditiveBlending}));r.raycast=()=>{},o.add(r),o.userData.edge=r,L.add(o),E.push(o)}for(let[e,a]of[[400,.6],[1e3,Math.PI-.6],[2e3,.6]]){let t=z(e)+.15;y.label(`${(0,l.fmt)(e,0)} km`,{parent:L,position:[t*Math.cos(a),.3,t*Math.sin(a)],className:"plain"})}var Aa=(()=>{let e=document.createElement("canvas");e.width=e.height=32;let a=e.getContext("2d"),t=a.createRadialGradient(16,16,0,16,16,16);t.addColorStop(0,"rgba(255,255,255,1)"),t.addColorStop(.35,"rgba(255,255,255,.75)"),t.addColorStop(1,"rgba(255,255,255,0)"),a.fillStyle=t,a.fillRect(0,0,32,32);let o=new l.THREE.CanvasTexture(e);return o.colorSpace=l.THREE.SRGBColorSpace,o})(),Re=new Float32Array(j*3),Ee=new Float32Array(j*3),q=new l.THREE.BufferGeometry;q.setAttribute("position",new l.THREE.BufferAttribute(Re,3));q.setAttribute("color",new l.THREE.BufferAttribute(Ee,3));var U={uTex:{value:Aa},uSun:{value:new l.THREE.Vector3(360,70,150).normalize()},uR:{value:Q},uTime:{value:0},uPix:{value:600},uSize:{value:.095}},qe=new l.THREE.Points(q,new l.THREE.ShaderMaterial({uniforms:U,transparent:!0,depthWrite:!1,vertexShader:`
    uniform vec3 uSun; uniform float uR, uTime, uPix, uSize; attribute vec3 color; varying vec3 vCol; varying float vA;
    float hh(float n){ return fract(sin(n*12.9898)*43758.5453); }
    void main(){
      vec4 mv = modelViewMatrix*vec4(position, 1.0);
      gl_Position = projectionMatrix*mv;
      float id = float(gl_VertexID), s1 = hh(id), s2 = hh(id + 71.3);
      float along = dot(position, uSun), perp = length(position - along*uSun);
      float lit = along > 0.0 ? 1.0 : smoothstep(uR*0.97, uR*1.04, perp);
      float glint = pow(max(0.0, sin(uTime*(0.4 + s1) + s2*60.0)), 80.0)*step(0.94, s2)*lit;
      vCol = color*(0.18 + 0.82*lit)*(0.75 + 0.5*s1) + vec3(3.2, 3.0, 2.8)*glint;
      vA = 0.55 + 0.4*lit;
      gl_PointSize = clamp(uSize*uPix/max(-mv.z, 0.1)*(0.8 + 0.5*s1)*(1.0 + glint), 1.2, 7.0);
    }`,fragmentShader:`
    uniform sampler2D uTex; varying vec3 vCol; varying float vA;
    void main(){ float a = texture2D(uTex, gl_PointCoord).a*vA; if (a < 0.01) discard; gl_FragColor = vec4(vCol, a); }`}));qe.frustumCulled=!1;y.scene.add(qe);var za=(()=>{let e=new l.THREE.Vector3(-9,7.5,24),a=e.clone().normalize(),t=new l.THREE.Vector3(1.5,.5,0).sub(e).normalize(),o=new l.THREE.Vector3().crossVectors(t,new l.THREE.Vector3(0,1,0)).normalize(),r=new l.THREE.Vector3().crossVectors(o,t).normalize(),i=(s,f,c)=>a.clone().multiplyScalar(s).addScaledVector(o,f).addScaledVector(r,c);return Ae(y.scene,{spots:[{dir:i(.5,.88,.22),r:z(420)},{dir:i(.62,.62,-.58),r:z(550)},{dir:i(.45,-.05,.95),r:z(530)},{dir:i(.55,.8,-.3),r:z(820)}]})})(),Pa={S:[53,53,97.6,70,43,87.9],Z:[53,53,97.6,70,87.9],D:[97.6,82,74,71,65,99],F:[98.6,86.4,74,82,65,97]},me=[];for(let e=0;e<x;e++)me.push(D.map(()=>({n:0,a:new Float32Array(0)})));function Da(e,a,t){let o=me[e][a];if(o.n>=t)return o.a;let r=new Float32Array(Math.max(t,o.n*2,64)*9);r.set(o.a);let i=D[a].key;for(let s=o.n;s<r.length/9;s++){let f=(0,l.rand)(S[e],S[e+1]),c=z(f),n=((0,l.pick)(Pa[i])+(0,l.rand)(-3,3))*Math.PI/180,m=(0,l.rand)(0,l.TAU),d=s*9;r[d]=Math.cos(m),r[d+1]=0,r[d+2]=Math.sin(m),r[d+3]=-Math.sin(m)*Math.cos(n),r[d+4]=Math.sin(n),r[d+5]=Math.cos(m)*Math.cos(n),r[d+6]=c,r[d+7]=(0,l.rand)(0,l.TAU),r[d+8]=.35*(Q/c)**1.5*((0,l.rand)()<.5?1:.97)}return o.a=r,o.n=r.length/9,r}var le=4,ie=[];function de(){let e=Fe();le=ze.find(o=>e/o<=j)||ze.at(-1);let a=0,t=new l.THREE.Color;for(let o=0;o<x;o++){ie[o]=[];for(let r=0;r<D.length;r++){let i=D[r].key,s=h[i][o],f=Math.round(s/le);f=Math.min(f,j-a),ie[o][r]=f,Da(o,r,f),t.setHex(D[r].color).multiplyScalar(.95);for(let c=0;c<f;c++)t.toArray(Ee,(a+c)*3);a+=f}}q.setDrawRange(0,a),q.attributes.color.needsUpdate=!0}var Pe=0;function Ga(e){Pe+=e;let a=Re,t=0;for(let o=0;o<x;o++)for(let r=0;r<D.length;r++){let i=ie[o]?.[r]||0,s=me[o][r].a;for(let f=0;f<i;f++){let c=f*9,n=s[c+7]+s[c+8]*Pe,m=Math.cos(n)*s[c+6],d=Math.sin(n)*s[c+6],v=(t+f)*3;a[v]=m*s[c]+d*s[c+3],a[v+1]=m*s[c+1]+d*s[c+4],a[v+2]=m*s[c+2]+d*s[c+5]}t+=i}q.attributes.position.needsUpdate=!0}var Ia=(()=>{let e=document.createElement("canvas");e.width=e.height=64;let a=e.getContext("2d"),t=a.createRadialGradient(32,32,0,32,32,32);return t.addColorStop(0,"rgba(255,255,255,1)"),t.addColorStop(.3,"rgba(255,190,90,.8)"),t.addColorStop(1,"rgba(255,80,40,0)"),a.fillStyle=t,a.fillRect(0,0,64,64),new l.THREE.CanvasTexture(e)})(),se=Array.from({length:10},()=>{let e=new l.THREE.Sprite(new l.THREE.SpriteMaterial({map:Ia,color:new l.THREE.Color(3,2.6,2.2),transparent:!0,depthWrite:!1,blending:l.THREE.AdditiveBlending}));return e.visible=!1,e.userData.life=0,y.scene.add(e),e});function Z(e,a){let t=se.find(r=>!r.visible)||se[0],o=z((0,l.rand)(S[e],S[e+1]));t.position.copy(new l.THREE.Vector3().randomDirection().multiplyScalar(o)),t.userData={life:1,big:a},t.visible=!0}var h=ee(),k={launch:2500,pmd:.9,rule:25,adr:0,avoid:.9,sun:1},_a=Math.random,De=0;function Fe(){let e=0;for(let a=0;a<x;a++)e+=$(h,a);return e}function ce(e){e==="asat"?(T(h,5,3e3),Z(5,!0),Z(5,!0),y.toast(`\u{1F4A5} ${Math.floor(h.year)}: ASAT testi 865 km'de \u2014 3.000 izlenebilir par\xE7a (Fengyun-1C, 2007 benzeri)`,"bad")):e==="iridium"?(h.S[4]=Math.max(0,h.S[4]-1),h.D[4]=Math.max(0,h.D[4]-1),T(h,4,2e3),Z(4,!0),y.toast(`\u{1F4A5} ${Math.floor(h.year)}: 789 km'de uydu\u2013uydu \xE7arp\u0131\u015Fmas\u0131 \u2014 2.000 par\xE7a (Iridium 33 \u2013 Kosmos 2251, 2009 benzeri)`,"bad")):e==="mega"&&(h.S[2]+=5e3,y.toast("\u{1F680} 550 km band\u0131na 5.000 uydu eklendi","warn")),de()}var b=y.ui;b.section("Haz\u0131r senaryolar");var ae={bugun:{launch:2500,pmd:.9,rule:25,adr:0,avoid:.9,sun:1},sorumlu:{launch:2500,pmd:.95,rule:5,adr:20,avoid:.95,sun:1},kontrolsuz:{launch:5e3,pmd:.5,rule:0,adr:0,avoid:.7,sun:1},durur:{launch:0,pmd:.9,rule:25,adr:0,avoid:.9,sun:1}};b.buttons([{label:"\u{1F4C8} Bug\xFCnk\xFC e\u011Filim",variant:"primary",onClick:()=>H("bugun")},{label:"\u{1F331} Sorumlu kullan\u0131m",onClick:()=>H("sorumlu")}]);b.buttons([{label:"\u{1F525} Kontrols\xFCz b\xFCy\xFCme",onClick:()=>H("kontrolsuz")},{label:"\u26D4 F\u0131rlatma durursa",onClick:()=>H("durur")}]);b.section("Politika ve ko\u015Fullar");var G={};G.launch=b.slider({label:"Y\u0131lda f\u0131rlat\u0131lan uydu",min:0,max:8e3,step:100,value:k.launch,format:e=>`${(0,l.fmt)(e,0)} / y\u0131l`,onInput:e=>k.launch=e});G.rule=b.segmented({label:"G\xF6rev sonu y\xF6r\xFCngeden \xE7\u0131kma kural\u0131",options:[{value:0,label:"Kural yok"},{value:25,label:"25 y\u0131l"},{value:5,label:"5 y\u0131l"}],value:k.rule,onChange:e=>k.rule=e});G.pmd=b.slider({label:"Kurala uyum oran\u0131",min:0,max:1,step:.01,value:k.pmd,format:e=>`%${(0,l.fmt)(e*100,0)}`,onInput:e=>k.pmd=e});G.adr=b.slider({label:"Aktif enkaz kald\u0131rma",min:0,max:200,step:1,value:k.adr,format:e=>`${(0,l.fmt)(e,0)} nesne / y\u0131l`,onInput:e=>k.adr=e});G.avoid=b.slider({label:"Aktif uydular\u0131n \xE7arp\u0131\u015Fmadan ka\xE7\u0131nma ba\u015Far\u0131s\u0131",min:0,max:.99,step:.01,value:k.avoid,format:e=>`%${(0,l.fmt)(e*100,0)}`,onInput:e=>k.avoid=e});G.sun=b.segmented({label:"G\xFCne\u015F etkinli\u011Fi (atmosfer yo\u011Funlu\u011Fu)",options:[{value:.6,label:"D\xFC\u015F\xFCk"},{value:1,label:"Orta"},{value:1.6,label:"Y\xFCksek"}],value:k.sun,onChange:e=>k.sun=e});b.section("Olaylar");b.buttons([{label:"\u{1F4A5} ASAT testi (865 km)",variant:"danger",onClick:()=>ce("asat")},{label:"\u{1F6F0} Uydu \xE7arp\u0131\u015Fmas\u0131 (789 km)",variant:"danger",onClick:()=>ce("iridium")}]);b.button({label:"\u{1F680} Mega tak\u0131my\u0131ld\u0131z: +5.000 uydu (550 km)",onClick:()=>ce("mega")});b.toggle({label:"\u0130rtifa band\u0131 halkalar\u0131",value:!0,onChange:e=>L.visible=e});b.section("G\xF6r\xFCn\xFCm",{open:!1});b.buttons([{label:"\u{1F30D} Genel",onClick:()=>y.moveCamera([-9,7.5,24],[1.5,.5,0])},{label:"\u{1F6F0} Yak\u0131n (ufuk)",onClick:()=>y.moveCamera([-3.2,2.4,10.6],[3.5,-.8,0])},{label:"\u2B07 Kutuptan",onClick:()=>y.moveCamera([.5,27,1.5],[0,0,0])}]);b.section("Durum");var R={year:b.stat({label:"Y\u0131l"}),tot:b.stat({label:"LEO nesne (\u226510 cm)"}),act:b.stat({label:"Aktif uydu"}),frag:b.stat({label:"Par\xE7a"}),col:b.stat({label:"B\xFCy\xFCk \xE7arp\u0131\u015Fma"}),rate:b.stat({label:"\xC7arp\u0131\u015Fma / y\u0131l"})},Ra=b.text("","card"),Ea=b.text(""),te=e=>e>=1e6?`${(0,l.fmt)(e/1e6,1)} mn`:e>=1e4?`${(0,l.fmt)(e/1e3,0)} bin`:(0,l.fmt)(e,0),Be=e=>e>=1e6?`${(0,l.fmt)(e/1e6,1)}mn`:e>=1e4?`${(0,l.fmt)(e/1e3,0)}b`:(0,l.fmt)(e,0),Te=[[0,2,"200\u2013500 km","#38bdf8"],[2,4,"500\u2013700 km","#4ade80"],[4,6,"700\u2013900 km","#fbbf24"],[6,9,"900\u20132.000 km","#f472b6"]],Le=b.chart({title:"Nesne say\u0131s\u0131, irtifa band\u0131na g\xF6re (son 200 y\u0131l; b = bin, mn = milyon)",series:Te.map(([,,e,a])=>({name:e,color:a})),maxPoints:400,height:120,format:Be}),Ne=b.chart({title:"T\xFCr\xFCne g\xF6re",series:D.map(e=>({name:e.name,color:"#"+e.color.toString(16).padStart(6,"0")})),maxPoints:400,height:100,format:Be}),Ve=b.chart({title:"Beklenen \xE7arp\u0131\u015Fma say\u0131s\u0131 / y\u0131l",series:[{name:"b\xFCy\xFCk (b\xFCt\xFCn\u2013b\xFCt\xFCn)",color:"#ef4444",fill:!0},{name:"hasar (par\xE7a\u2013uydu)",color:"#fb923c"}],maxPoints:400,height:90,format:e=>(0,l.fmt)(e,e<10?1:0)});function H(e){Object.assign(k,ae[e]);for(let a in ae[e])G[a].set(ae[e][a]);fe()}function fe(){h=ee(),Le.clear(),Ne.clear(),Ve.clear(),de(),Ke(_(h,k))}var W=new l.THREE.Color;function Ke(e){let a=Fe();R.year.set(String(Math.floor(h.year))),R.tot.set(te(a),a>1e5?"bad":a>5e4?"warn":""),R.act.set(te(A(h.S))),R.frag.set(te(A(h.F))),R.col.set((0,l.fmt)(h.catastrophic,0),h.catastrophic>20?"bad":h.catastrophic>3?"warn":"");let t=A(e.map(r=>r.II));R.rate.set((0,l.fmt)(t,t<10?2:0),t>1?"bad":t>.3?"warn":"good");let o=e.map((r,i)=>[i,r.growth,r.ratio]).filter(([,r,i])=>i>1&&r>.002).sort((r,i)=>i[1]-r[1]);Ra.set(o.length?`\u26A0\uFE0F <b>Kendi kendini besleyen bantlar</b> (\xE7arp\u0131\u015Fma par\xE7as\u0131 > atmosferin temizledi\u011Fi):<br>${o.slice(0,4).map(([r,i])=>`${K[r]} km <b>+%${(0,l.fmt)(i*100,1)}/y\u0131l</b>`).join(" \xB7 ")}
       <br><small>Bu bantlarda f\u0131rlatma dursa bile par\xE7a say\u0131s\u0131 \xE7arp\u0131\u015Fmalarla artar.</small>`:"\u2705 Hi\xE7bir bantta \xE7arp\u0131\u015Fmalar par\xE7a n\xFCfusunu atmosferin temizleyebilece\u011Finden h\u0131zl\u0131 b\xFCy\xFCtm\xFCyor."),Ea.set(`<small><b style="color:#b9e3c4">\u25CF</b> aktif \xB7 <b style="color:#e3cfa4">\u25CF</b> \xF6l\xFC uydu / roket g\xF6vdesi \xB7 <b style="color:#bfd3ee">\u25CF</b> g\xF6rev sonu ini\u015Fte \xB7 <b style="color:#d6d4d2">\u25CF</b> par\xE7a \xB7 1 nokta \u2248 ${(0,l.fmt)(le,0)} nesne \xB7 irtifa 3\xD7 abart\u0131l\u0131</small>`),e.forEach((r,i)=>{let s=(0,l.clamp)(.5+r.growth*25,0,1);(0,l.heatColor)(s,W),W.lerp(Ca,.45),E[i].material.color.copy(W),E[i].material.opacity=.004+Math.abs(s-.5)*.04,E[i].userData.edge.material.color.copy(W),E[i].userData.edge.material.opacity=.06+Math.abs(s-.5)*.5})}y.formatTime=()=>`Y\u0131l ${Math.floor(h.year)}`;var oe=0,re=0,ne=0;y.onUpdate(e=>{let a=e/Sa;for(;a>1e-9;){let t=Math.min(a,.05),o=Se(h,k,t,_a);a-=t;for(let r of o)Z(r.band,r.big),r.big&&performance.now()-De>2500&&(De=performance.now(),y.toast(`\u{1F4A5} ${Math.floor(h.year)}: ${K[r.band]} km band\u0131nda \xE7arp\u0131\u015Fma \u2014 \u2248 ${(0,l.fmt)(O,0)} yeni par\xE7a`,"bad"));if(oe+=t,oe>=.5){oe=0,Le.push(Te.map(([i,s])=>{let f=0;for(let c=i;c<s;c++)f+=$(h,c);return f})),Ne.push([A(h.S),A(h.D),A(h.Z),A(h.F)]);let r=_(h,k);Ve.push([A(r.map(i=>i.II)),A(r.map(i=>i.IF))])}}ne+=e,ne>.3&&(ne=0,de())});var Ge=new l.THREE.Vector2;y.onRender(e=>{U.uTime.value+=e,y.renderer.getDrawingBufferSize(Ge),U.uPix.value=Ge.y/(2*Math.tan(l.THREE.MathUtils.degToRad(y.camera.fov)/2)),_e.spin(y.paused?0:e*.06),ue.update(e),Ga(e),za.update(e,U.uSun.value);for(let a of se){if(!a.visible)continue;if(a.userData.life-=e*.8,a.userData.life<=0){a.visible=!1;continue}let t=a.userData.life;a.scale.setScalar((a.userData.big?3:1.2)*(1.2-t)),a.material.opacity=t}re+=e,re>.3&&(re=0,Ke(_(h,k)))});y.onClick(()=>L.visible?E:[],e=>{let a=e.object.userData.band,t=_(h,k)[a],o=V((S[a]+S[a+1])/2,k.sun);y.toast(`<b>${K[a]} km</b> \xB7 aktif ${(0,l.fmt)(h.S[a],0)} \xB7 \xF6l\xFC ${(0,l.fmt)(h.D[a],0)} \xB7 ini\u015Fte ${(0,l.fmt)(h.Z[a],0)} \xB7 par\xE7a ${(0,l.fmt)(h.F[a],0)}<br>
    s\xFCr\xFCkleme \xF6mr\xFC \u2248 ${o<1?"aylar":o>5e3?"binlerce y\u0131l":(0,l.fmt)(o,0)+" y\u0131l"} \xB7 b\xFCy\xFCk \xE7arp\u0131\u015Fma ${(0,l.fmt)(t.II,3)}/y\u0131l \xB7 par\xE7a net b\xFCy\xFCme %${(0,l.fmt)(t.growth*100,2)}/y\u0131l`)});y.onReset(()=>fe());fe();})();
