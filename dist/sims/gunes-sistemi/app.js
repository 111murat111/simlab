(()=>{var ge=Object.create;var ae=Object.defineProperty;var xe=Object.getOwnPropertyDescriptor;var be=Object.getOwnPropertyNames;var ye=Object.getPrototypeOf,we=Object.prototype.hasOwnProperty;var Se=(e,t)=>()=>{try{return t||e((t={exports:{}}).exports,t),t.exports}catch(a){throw t=0,a}};var ke=(e,t,a,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let n of be(t))!we.call(e,n)&&n!==a&&ae(e,n,{get:()=>t[n],enumerable:!(o=xe(t,n))||o.enumerable});return e};var oe=(e,t,a)=>(a=e!=null?ge(ye(e)):{},ke(t||!e||!e.__esModule?ae(a,"default",{value:e,enumerable:!0}):a,e));var j=Se((st,ne)=>{ne.exports=window.SimCore});var r=oe(j(),1);var s=oe(j(),1),M={value:new s.THREE.Vector3},H=`
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
`,Ce={earth:`
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
    rough = mix(0.32 + 0.1*m2, 0.88, max(land, ice*0.8));
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
    h = turb*0.3;`},re="varying vec3 vPO; varying vec3 vWN; varying vec3 vWP;",ze="vPO = normalize(position); vWN = normalize(mat3(modelMatrix)*objectNormal); vWP = (modelMatrix*vec4(transformed, 1.0)).xyz;",Ae={earth:{sea:.5,lights:1,atm:5939455,atmK:1},rocky:{c1:7170404,c2:9407365,c3:4867908,c4:12104876,maria:.4,cap:2,atmK:0},gas:{c1:13218707,c2:9133371,c3:15722198,c4:10635822,bands:15,stretch:14,turb:1,spot:0,spotLat:-.38}};function Me(e,t={}){let a={seed:Math.random(),bump:.01,atm:9417983,atmK:.4,...Ae[e],...t},o=i=>new s.THREE.Color(i),n=new s.THREE.MeshStandardMaterial({roughness:.8,metalness:0}),l={uStar:M,uSeed:{value:a.seed},uBump:{value:a.bump},uAtm:{value:o(a.atm)},uAtmK:{value:a.atmK},uSea:{value:a.sea??.5},uLights:{value:a.lights??0},uMaria:{value:a.maria??0},uCap:{value:a.cap??2},uC1:{value:o(a.c1??16777215)},uC2:{value:o(a.c2??16777215)},uC3:{value:o(a.c3??16777215)},uC4:{value:o(a.c4??16777215)},uBands:{value:a.bands??12},uStretch:{value:a.stretch??12},uTurb:{value:a.turb??1},uSpot:{value:a.spot??0},uSpotLat:{value:a.spotLat??-.38}};return n.userData.uniforms=l,n.onBeforeCompile=i=>{Object.assign(i.uniforms,l),i.vertexShader=i.vertexShader.replace("#include <common>",`#include <common>
`+re).replace("#include <begin_vertex>",`#include <begin_vertex>
`+ze),i.fragmentShader=i.fragmentShader.replace("#include <common>",`#include <common>
        ${re}
        uniform vec3 uStar, uAtm, uC1, uC2, uC3, uC4; uniform float uSeed, uBump, uAtmK, uSea, uLights, uMaria, uCap, uBands, uStretch, uTurb, uSpot, uSpotLat;
        ${s.NOISE3_GLSL}
        ${H}
        float sRough, sH; vec3 sEmis;
        void surface(vec3 p, inout vec3 col, inout float rough, inout float h, inout vec3 emis){ ${Ce[e]} }`).replace("#include <color_fragment>",`#include <color_fragment>
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
        }`)},n.customProgramCacheKey=()=>"planet-"+e,n}function qe({seed:e=Math.random(),cover:t=.5,color:a=16777215,bands:o=0}={}){let n=new s.THREE.MeshStandardMaterial({color:a,roughness:1,metalness:0,transparent:!0,depthWrite:!1}),l={uSeed:{value:e},uCover:{value:t},uCBands:{value:o}};return n.onBeforeCompile=i=>{Object.assign(i.uniforms,l),i.vertexShader=i.vertexShader.replace("#include <common>",`#include <common>
varying vec3 vPO;`).replace("#include <begin_vertex>",`#include <begin_vertex>
vPO = normalize(position);`),i.fragmentShader=i.fragmentShader.replace("#include <common>",`#include <common>
varying vec3 vPO; uniform float uSeed, uCover, uCBands;
${s.NOISE3_GLSL}
${H}`).replace("#include <color_fragment>",`#include <color_fragment>
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
        }`)},n.customProgramCacheKey=()=>"planet-clouds",n}var Ve="varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }",Pe=`
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
}`;function Le(e,t,a=1,o=.06){let n={uCenter:{value:new s.THREE.Vector3},uStar:M,uCol:{value:new s.THREE.Color(t)},uR:{value:e},uRa:{value:e*(1+o)},uK:{value:a}},l=new s.THREE.Mesh(new s.THREE.SphereGeometry(e*(1+o),64,32),new s.THREE.ShaderMaterial({uniforms:n,vertexShader:Ve,fragmentShader:Pe,side:s.THREE.BackSide,transparent:!0,depthWrite:!1,blending:s.THREE.AdditiveBlending}));return l.onBeforeRender=()=>{l.getWorldPosition(n.uCenter.value)},l.raycast=()=>{},l.userData.noShadow=!0,l}var Te="varying vec3 vW; varying vec3 vL; void main(){ vL = position; vec4 w = modelMatrix*vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }",_e=s.NOISE3_GLSL+`
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
}`;function Re(e,{inner:t=1.24,outer:a=2.27,c1:o=13482388,c2:n=9271902,opacity:l=.92,seed:i=Math.random()}={}){let p=new s.THREE.RingGeometry(e*t,e*a,256,1),u={uCenter:{value:new s.THREE.Vector3},uStar:M,uC1:{value:new s.THREE.Color(o)},uC2:{value:new s.THREE.Color(n)},uNormal:{value:new s.THREE.Vector3},uR:{value:e},uIn:{value:e*t},uOut:{value:e*a},uSeed:{value:i*10},uOpacity:{value:l}},d=new s.THREE.Mesh(p,new s.THREE.ShaderMaterial({uniforms:u,vertexShader:Te,fragmentShader:_e,side:s.THREE.DoubleSide,transparent:!0,depthWrite:!1}));d.rotation.x=-Math.PI/2;let v=new s.THREE.Quaternion;return d.onBeforeRender=()=>{d.parent.getWorldPosition(u.uCenter.value),d.getWorldQuaternion(v),u.uNormal.value.set(0,0,1).applyQuaternion(v)},d.raycast=()=>{},d.userData.noShadow=!0,d}var Ke=`varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,Be=s.NOISE3_GLSL+H+`
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
}`,Oe=s.NOISE3_GLSL+`
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
}`;function le(e,{color:t=16767400,intensity:a=7,spots:o=1,corona:n=1,gran:l=1,limb:i=1}={}){let p=new s.THREE.Group,u={uCol:{value:new s.THREE.Color(t)},uTime:{value:0},uInt:{value:a},uSpots:{value:o},uGran:{value:l},uLimb:{value:i}},d=new s.THREE.Mesh(new s.THREE.SphereGeometry(e,96,64),new s.THREE.ShaderMaterial({uniforms:u,vertexShader:Ke,fragmentShader:Be}));d.userData.noShadow=!0,p.add(d);let v=7,w={uCol:u.uCol,uTime:u.uTime,uInt:{value:a*.3*n},uK:{value:v}},g=new s.THREE.Mesh(new s.THREE.PlaneGeometry(e*2*v,e*2*v),new s.THREE.ShaderMaterial({uniforms:w,vertexShader:"varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.0); }",fragmentShader:Oe,transparent:!0,depthWrite:!1,blending:s.THREE.AdditiveBlending}));g.raycast=()=>{},g.userData.noShadow=!0;let T=new s.THREE.Quaternion;return g.onBeforeRender=(x,C,_)=>{g.parent.getWorldQuaternion(T).invert(),g.quaternion.copy(T).multiply(_.quaternion),g.updateMatrixWorld()},p.add(g),{group:p,surface:d,corona:g,uniforms:u,setColor(x){u.uCol.value.set(x)},setIntensity(x){u.uInt.value=x,w.uInt.value=x*.3*n},setCorona(x){n=x,w.uInt.value=u.uInt.value*.3*x},update(x){u.uTime.value+=x}}}var h={merkur:{kind:"rocky",c1:7038304,c2:9341057,c3:5920080,c4:12894134,maria:.25,spin:.2,tilt:0},venus:{kind:"gas",c1:14270605,c2:12163682,c3:15524034,c4:14270605,bands:5,stretch:6,turb:1.6,atm:16767392,atmK:.5,spin:-.1,tilt:.05},dunya:{kind:"earth",clouds:.5,atm:5082623,atmK:1,spin:.9,tilt:.41,halo:6134783},mars:{kind:"rocky",c1:9062954,c2:11034422,c3:5911330,c4:12614220,maria:.55,cap:.9,atm:14721152,atmK:.25,spin:.85,tilt:.44,halo:14195578,haloK:.35},jupiter:{kind:"gas",c1:14206116,c2:10119749,c3:15920352,c4:11883834,bands:16,stretch:16,turb:1.1,spot:1,spotLat:-.38,atm:14272942,atmK:.25,spin:2.2,tilt:.05},saturn:{kind:"gas",c1:14732446,c2:12163686,c3:15853256,c4:13482124,bands:12,stretch:18,turb:.6,atm:15260344,atmK:.25,spin:2,tilt:.47,ring:{}},uranus:{kind:"gas",c1:10475228,c2:8831948,c3:12576490,c4:10475228,bands:6,stretch:10,turb:.35,atm:11068656,atmK:.6,spin:-1.4,tilt:1.71,ring:{inner:1.6,outer:2,c1:7305088,c2:4212300,opacity:.35}},neptun:{kind:"gas",c1:3892424,c2:2903976,c3:7312870,c4:2043758,bands:8,stretch:12,turb:.8,spot:1,spotLat:-.35,atm:7314431,atmK:.7,spin:1.5,tilt:.49}};function se(e,t,a=Math.random()){let o=typeof t=="string"?h[t]:t,n=new s.THREE.Group,l=new s.THREE.Group;l.rotation.z=o.tilt||0,n.add(l);let i=e>.9?128:96,p=new s.THREE.Mesh(new s.THREE.SphereGeometry(e,i,i/2),Me(o.kind,{...o,seed:a,bump:e*.02}));l.add(p);let u=null;o.clouds&&(u=new s.THREE.Mesh(new s.THREE.SphereGeometry(e*1.012,i,i/2),qe({seed:a+.37,cover:o.clouds})),u.raycast=()=>{},l.add(u)),(o.halo||o.kind==="earth")&&n.add(Le(e,o.halo??o.atm,o.haloK??1.2,o.kind==="earth"?.07:.05)),o.ring&&l.add(Re(e,{...o.ring,seed:a}));let d=o.spin??1;return{group:n,body:l,surface:p,clouds:u,look:o,spin(v){p.rotation.y+=v*d,u&&(u.rotation.y+=v*d*1.12)}}}var L=1,ce=8,V=360,Q=[6333946,16347926,2278750,15235577,16436245,3003583,16281969,10741301,9684477,16622767],m=(0,r.createSim)({space:{star:[0,0,0],power:1,milky:.9,nebula:.7,stars:.55,galaxyTilt:55},look:{bloomStrength:.4},camera:{position:[0,42,46],fov:45,near:.05,far:5e3},controls:{maxDistance:400,minDistance:1.2,maxPolarAngle:Math.PI},info:`
    <h3>Ne g\xF6r\xFCyorsun?</h3>
    <p>Her cisim di\u011Fer t\xFCm cisimleri Newton'un k\xFCtle\xE7ekim yasas\u0131yla \xE7eker: <b>F = G\xB7m\u2081\xB7m\u2082 / r\xB2</b>.
    Bir gezegenin dairesel y\xF6r\xFCngede kalmas\u0131 i\xE7in h\u0131z\u0131 tam olarak <b>v = \u221A(G\xB7M / r)</b> olmal\u0131d\u0131r.</p>
    <h3>Dene</h3>
    <ul>
      <li>H\u0131z \xE7arpan\u0131n\u0131 <b>1,0</b> yap: dairesel y\xF6r\xFCnge. 1,0\u20131,41 aras\u0131: elips. <b>\u221A2 \u2248 1,41</b> \xFCst\xFC: ka\xE7\u0131\u015F h\u0131z\u0131, gezegen sistemden \xE7\u0131kar.</li>
      <li>\xC7ok a\u011F\u0131r bir gezegen ekle (J\xFCpiter'in 10 kat\u0131), kom\u015Fular\u0131n\u0131n y\xF6r\xFCngelerini nas\u0131l bozdu\u011Funu izle.</li>
      <li>"\u0130kili y\u0131ld\u0131z" haz\u0131r ayar\u0131nda gezegenlerin kaotik davran\u0131\u015F\u0131n\u0131 g\xF6r.</li>
    </ul>
    <p><small>Birimler \xF6l\xE7eklenmi\u015Ftir; mesafeler ve k\xFCtleler ger\xE7ek oranlarda de\u011Fildir.</small></p>`});m.formatTime=e=>`${(0,r.fmt)(e/(2*Math.PI),1)} y\u0131l`;var z=new r.THREE.PolarGridHelper(80,8,16,96,3359066,2371655);z.material.transparent=!0;z.material.opacity=.25;z.material.depthWrite=!1;z.visible=!1;m.scene.add(z);var c=[],G=0,W=0,O=0,de=m.sky.light;function q(e,t,a,o=16773340){let n=1.2+Math.cbrt(e)*.12,l=le(n,{color:o,intensity:2.6,corona:.8}),i=l.group,p=c.filter(d=>d.star).length,u=null;return p===0?de.color.set(o).lerp(new r.THREE.Color(16777215),.45):(u=new r.THREE.PointLight(new r.THREE.Color(o).lerp(new r.THREE.Color(16777215),.45),Math.PI*2.2,0,0),i.add(u)),pe({mesh:i,vis:l,light:u,m:e,r:n,p:new r.THREE.Vector3(...t),v:new r.THREE.Vector3(...a),star:!0,name:"Y\u0131ld\u0131z",color:o})}var ie={Merk\u00FCr:"merkur",Ven\u00FCs:"venus",D\u00FCnya:"dunya",Mars:"mars",J\u00FCpiter:"jupiter",Sat\u00FCrn:"saturn",Uran\u00FCs:"uranus",Nept\u00FCn:"neptun"};function Ne(e,t){if(ie[e])return h[ie[e]];let a=n=>n[Math.floor(Math.random()*n.length)];if(t<1.5)return{...h.merkur,c1:a([7038304,8022618,6183512]),spin:(0,r.rand)(.2,1)};if(t<7)return a([h.dunya,h.mars,{...h.dunya,clouds:.62},h.venus]);if(t<25)return a([h.neptun,h.uranus,{...h.neptun,c1:5935024,c2:4158356,c3:9421016,spot:0}]);let o=a([h.jupiter,h.saturn,{...h.jupiter,c1:14268570,c2:8212282,c3:15720652,spot:0}]);return Math.random()<.35&&!o.ring?{...o,ring:{opacity:.6}}:o}function S(e,t,a,{angle:o=(0,r.rand)(0,Math.PI*2),incl:n=0,name:l}={}){let i=Q[O%Q.length];O++;let p=.35+Math.cbrt(e)*.28,u=se(p,Ne(l,e));u.group.rotation.y=(0,r.rand)(0,Math.PI*2);let d=u.group,v=k(!0),w=new r.THREE.Vector3(Math.cos(o)*t,Math.sin(n)*t*.1,Math.sin(o)*t).add(v.p),g=w.clone().sub(v.p),T=Math.sqrt(L*v.m/g.length()),x=new r.THREE.Vector3(-g.z,0,g.x).normalize().multiplyScalar(T*a).add(v.v),C=pe({mesh:d,vis:u,m:e,r:p,p:w,v:x,star:!1,name:l||`Gezegen ${O}`,color:i}),_=new Float32Array(V*3),te=new Float32Array(V*3),U=new r.THREE.Color(i);for(let A=0;A<V;A++){_.set([w.x,w.y,w.z],A*3);let $=Math.pow(A/(V-1),1.6)*.75;te.set([U.r*$,U.g*$,U.b*$],A*3)}let D=new r.THREE.BufferGeometry;D.setAttribute("position",new r.THREE.BufferAttribute(_,3)),D.setAttribute("color",new r.THREE.BufferAttribute(te,3));let R=new r.THREE.Line(D,new r.THREE.LineBasicMaterial({vertexColors:!0,transparent:!0,blending:r.THREE.AdditiveBlending,depthWrite:!1}));return R.frustumCulled=!1,m.scene.add(R),C.trail=R,C.label=m.label(C.name,{parent:d,position:[0,p+.5,0],className:"plain"}),C.label.visible=Xe.value,R.visible=Ze.value,C}function pe(e){return e.a=new r.THREE.Vector3,m.scene.add(e.mesh),e.mesh.position.copy(e.p),c.push(e),e}function F(e){(0,r.disposeObject)(e.mesh),e.trail&&(0,r.disposeObject)(e.trail),c=c.filter(t=>t!==e),y===e&&(y=null)}function k(e=!1){let t=new r.THREE.Vector3,a=new r.THREE.Vector3,o=0;for(let n of c)e&&!n.star||(t.addScaledVector(n.p,n.m),a.addScaledVector(n.v,n.m),o+=n.m);return o>0&&(t.divideScalar(o),a.divideScalar(o)),{p:t,v:a,m:o}}var K=new r.THREE.Vector3;function X(){for(let e of c)e.a.set(0,0,0);for(let e=0;e<c.length;e++){let t=c[e];for(let a=e+1;a<c.length;a++){let o=c[a];K.subVectors(o.p,t.p);let n=K.lengthSq()+.05,l=L/(n*Math.sqrt(n));t.a.addScaledVector(K,o.m*l),o.a.addScaledVector(K,-t.m*l)}}}function Ee(e){for(let t of c)t.v.addScaledVector(t.a,e/2),t.p.addScaledVector(t.v,e);X();for(let t of c)t.v.addScaledVector(t.a,e/2)}function ve(){for(let e=0;e<c.length;e++)for(let t=e+1;t<c.length;t++){let a=c[e],o=c[t];if(a.p.distanceTo(o.p)<(a.r+o.r)*.85){let[n,l]=a.m>=o.m?[a,o]:[o,a];return n.v.multiplyScalar(n.m).addScaledVector(l.v,l.m).divideScalar(n.m+l.m),n.m+=l.m,F(l),G++,m.toast(`\u{1F4A5} ${l.name}, ${n.name} ile \xE7arp\u0131\u015Ft\u0131`,"bad"),ve()}}}function Ge(){let e=k(!0);for(let t of[...c])!t.star&&t.p.distanceTo(e.p)>260&&(F(t),W++,m.toast(`\u{1F680} ${t.name} sistemden ka\xE7t\u0131`,"warn"))}var We=0;m.onUpdate(e=>{let t=Math.min(e,.05)/ce*He.value;for(let a=0;a<ce;a++)Ee(t);ve(),Ge();for(let a of c)a.mesh.position.copy(a.p);if(++We%2===0)for(let a of c){if(!a.trail)continue;let o=a.trail.geometry.attributes.position.array;o.copyWithin(0,3),o.set([a.p.x,a.p.y,a.p.z],(V-1)*3),a.trail.geometry.attributes.position.needsUpdate=!0}});var y=null,N=0,b=null,E=new r.THREE.Vector3,I=new r.THREE.Vector3(0,1,0),ue=new r.THREE.Vector3,Ie=new r.THREE.Vector3,Fe=new r.THREE.Vector3,me=new r.THREE.Vector3,J=(e,t)=>Math.atan2(e.z-t.z,e.x-t.x);function Ue(e){let t=k(!0).p,a=Ie.copy(t).sub(e.p).setY(0).normalize(),o=Fe.crossVectors(a,I).normalize(),n=Math.max(e.r*4.2,2.2),l=e.p.clone().addScaledVector(a,-n*.35).addScaledVector(o,n*.95).addScaledVector(I,n*.28),i=e.p.clone().addScaledVector(a,n*.3);return[l,i]}function De(){let e=Math.max(28,...c.filter(t=>!t.star).map(t=>t.p.length()*1.15));return[new r.THREE.Vector3(0,e*.62,e*.95),new r.THREE.Vector3(0,0,0)]}function fe(e,t=1.4){let a=m.controls;if(t<=0){let[o,n]=e();m.moveCamera(o.toArray(),n.toArray()),b=null;return}b={fn:e,t:0,dur:t,p0:m.camera.position.clone(),t0:a.target.clone()}}function P(e,t=1.4){y=e,e?(N=J(e.p,k(!0).p),E.copy(e.p),fe(()=>Ue(e),t)):fe(De,t)}m.onRender(e=>{for(let o of c)o.star?o.vis.update(e*(m.paused?0:1)):o.vis.spin(m.paused?0:e);let t=c.find(o=>o.star);t&&(de.position.copy(t.p),M.value.copy(t.p));let a=m.controls;if(b){b.t+=e;let o=(0,r.clamp)(b.t/b.dur,0,1),n=o*o*(3-2*o),[l,i]=b.fn();m.camera.position.lerpVectors(b.p0,l,n),a.target.lerpVectors(b.t0,i,n),y&&(N=J(y.p,k(!0).p),E.copy(y.p)),o>=1&&(b=null)}else if(y){let o=k(!0).p,n=J(y.p,o),l=n-N;l=Math.atan2(Math.sin(l),Math.cos(l)),N=n,ue.copy(m.camera.position).sub(a.target).applyAxisAngle(I,-l),me.copy(a.target).sub(E).applyAxisAngle(I,-l),E.copy(y.p),a.target.copy(y.p).add(me),m.camera.position.copy(a.target).add(ue)}});var $e={ic:()=>{q(B.value,[0,0,0],[0,0,0]),S(1,7,1,{name:"Merk\xFCr"}),S(3,11,1,{name:"Ven\xFCs"}),S(3.2,15,1,{name:"D\xFCnya"}),S(1.5,20,1,{name:"Mars"})},tam:()=>{q(B.value,[0,0,0],[0,0,0]),[["Merk\xFCr",.6,6],["Ven\xFCs",2.5,9],["D\xFCnya",3,12.5],["Mars",1.2,16],["J\xFCpiter",40,25],["Sat\xFCrn",18,34],["Uran\xFCs",8,42],["Nept\xFCn",9,50]].forEach(([e,t,a])=>S(t,a,1,{name:e}))},ikili:()=>{let e=B.value/2,t=4,a=Math.sqrt(L*e/(4*t));q(e,[-t,0,0],[0,0,-a],16765562),q(e,[t,0,0],[0,0,a],10406911),S(2,22,1,{name:"Uzak"}),S(1,13,1,{name:"Yak\u0131n"})},kaos:()=>{q(B.value,[0,0,0],[0,0,0]);for(let e=0;e<7;e++)S((0,r.rand)(5,60),(0,r.rand)(8,30),(0,r.rand)(.8,1.2))}};function ee(e){for(let t of[...c])F(t);G=W=O=0,Z.clear(),$e[e](),X(),b=null,he.value==="yakin"?P(c.find(t=>t.name==="D\xFCnya")||c.find(t=>!t.star&&t.m<20)||c.find(t=>!t.star),Y?0:1.4):P(null,Y?0:1.4),Y=!1}var Y=!0,f=m.ui;f.section("Haz\u0131r sistemler");var je=f.segmented({options:[{value:"ic",label:"\u0130\xE7 gezegenler"},{value:"tam",label:"Tam sistem"},{value:"ikili",label:"\u0130kili y\u0131ld\u0131z"},{value:"kaos",label:"Kaos"}],value:"ic",onChange:e=>ee(e)}),B=f.slider({label:"Y\u0131ld\u0131z k\xFCtlesi",min:200,max:3e3,step:50,value:1e3,format:e=>`${(0,r.fmt)(e/1e3,2)} M\u2609`,onChange:e=>{let t=c.filter(a=>a.star);t.forEach(a=>a.m=e/t.length)}}),He=f.slider({label:"Zaman ak\u0131\u015F\u0131",min:.2,max:5,step:.1,value:1.5,unit:"\xD7"});f.section("Yeni gezegen ekle");var Ye=f.slider({label:"Y\u0131ld\u0131za uzakl\u0131k",min:5,max:60,step:.5,value:18,unit:"br"}),Qe=f.slider({label:"K\xFCtle",min:.5,max:200,step:.5,value:3,format:e=>`${(0,r.fmt)(e/3,1)} \xD7 D\xFCnya`}),Je=f.slider({label:"H\u0131z \xE7arpan\u0131 (1 = dairesel)",min:.3,max:1.6,step:.01,value:1,format:e=>`${(0,r.fmt)(e,2)} \xB7 ${e<.98?"i\xE7e d\xFC\u015Fer":e<=1.02?"dairesel":e<1.414?"elips":"ka\xE7\u0131\u015F!"}`});f.buttons([{label:"\u2795 Gezegen ekle",variant:"primary",onClick:()=>{S(Qe.value,Ye.value,Je.value),X()}},{label:"\u{1F5D1} Son eklenen",onClick:()=>{let e=c.filter(t=>!t.star).pop();e&&F(e)}}]);f.section("G\xF6r\xFCn\xFCm");var Ze=f.toggle({label:"Y\xF6r\xFCnge izleri",value:!0,onChange:e=>c.forEach(t=>t.trail&&(t.trail.visible=e))}),Xe=f.toggle({label:"\u0130sim etiketleri",value:!0,onChange:e=>c.forEach(t=>t.label&&(t.label.visible=e))});f.toggle({label:"Kutupsal \u0131zgara",value:!1,onChange:e=>z.visible=e});f.section("Kamera");var he=f.segmented({options:[{value:"genel",label:"Genel bak\u0131\u015F"},{value:"yakin",label:"Gezegeni izle"}],value:"yakin",onChange:e=>{P(e==="genel"?null:c.find(t=>t.name==="D\xFCnya")||c.find(t=>!t.star)||null)}});f.text("Bir gezegene t\u0131kla: kamera onu yak\u0131ndan izler.","");f.section("Durum");var et=f.stat({label:"Gezegen"}),tt=f.stat({label:"\xC7arp\u0131\u015Fma"}),at=f.stat({label:"Ka\xE7an"}),ot=f.stat({label:"Toplam enerji"}),Z=f.chart({title:"Y\u0131ld\u0131za uzakl\u0131k (ilk 5 gezegen)",series:[0,1,2,3,4].map(e=>({name:`${e+1}`,color:"#"+Q[e].toString(16).padStart(6,"0")})),maxPoints:240});function nt(){let e=0;for(let t=0;t<c.length;t++){let a=c[t];e+=.5*a.m*a.v.lengthSq();for(let o=t+1;o<c.length;o++)e-=L*a.m*c[o].m/a.p.distanceTo(c[o].p)}return e}var rt=0;m.onUpdate(()=>{if(++rt%12)return;let e=c.filter(a=>!a.star);et.set(e.length),tt.set(G,G?"bad":""),at.set(W,W?"warn":""),ot.set((0,r.fmt)(nt(),0));let t=k(!0);Z.push([0,1,2,3,4].map(a=>e[a]?e[a].p.distanceTo(t.p):0)),Z.el.querySelectorAll(".legend i").forEach((a,o)=>{e[o]&&(a.style.background="#"+e[o].color.toString(16).padStart(6,"0"))})});m.onClick(()=>c.map(e=>e.vis.surface),e=>{let t=e.object,a=null;for(;t&&!a;)a=c.find(i=>i.mesh===t),t=t.parent;if(!a)return;a.star||(P(a),he.set("yakin"));let o=k(!0),n=a.p.distanceTo(o.p),l=Math.sqrt(L*o.m/n);m.toast(`<b>${a.name}</b> \xB7 uzakl\u0131k ${(0,r.fmt)(n,1)} \xB7 h\u0131z ${(0,r.fmt)(a.v.length(),2)} (dairesel i\xE7in ${(0,r.fmt)(l,2)})`)});m.onReset(()=>ee(je.value));ee("ic");})();
