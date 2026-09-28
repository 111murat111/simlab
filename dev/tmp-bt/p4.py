f='src/core/gfx/buildings.js'; s=open(f).read()
rep=[
# sign material factory
("""  const glass = glassMaterial();
  const sign = procedural({ key: 'bld-sign', params: { color: 0xffffff, roughness: 0.35 }, bump: 0.004, uniforms: { uSignLit: { value: 0.05 } },
    pattern: 'float n = fbm3(p*3.0, 3); col *= 0.94 + 0.08*n; rough = 0.3 + 0.15*n; h = n;' });
  {
    const base = sign.onBeforeCompile;
    sign.onBeforeCompile = (sh) => { base(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\\n totalEmissiveRadiance += diffuseColor.rgb*uSignLit;'); };
  }
  MATS = {""","""  const glass = glassMaterial(), sign = signMaterial();
  MATS = {"""),
("""// Cam: iç mekân eşlemesi""","""function signMaterial() {
  const sign = procedural({ key: 'bld-sign', params: { color: 0xffffff, roughness: 0.35 }, bump: 0.004, uniforms: { uSignLit: { value: 0.05 } },
    pattern: 'float n = fbm3(p*3.0, 3); col *= 0.94 + 0.08*n; rough = 0.3 + 0.15*n; h = n;' });
  const base = sign.onBeforeCompile;
  sign.onBeforeCompile = (sh) => { base(sh); sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\\n totalEmissiveRadiance += diffuseColor.rgb*uSignLit;'); };
  return sign;
}
/** Bağımsız gece ışığı seti (bölge bölge karartma için): populateCity({ ownLights: true }) bunu kendisi yapar. */
export function cityLightSet() { return { glass: glassMaterial(), shell: shellMaterial(), sign: signMaterial() }; }

// Cam: iç mekân eşlemesi"""),
("""  finish(group) {
    const M = buildingMaterials(), L = lib();""","""  finish(group, M = buildingMaterials()) {
    const L = lib();"""),
("      const im = new THREE.InstancedMesh(geo, P.m, list.length);","      const im = new THREE.InstancedMesh(geo, M[P.mat], list.length);"),
("function buildShell(specs, origin) {","function buildShell(specs, origin, shellMat = buildingMaterials().shell) {"),
("  const m = new THREE.Mesh(g, buildingMaterials().shell);","  const m = new THREE.Mesh(g, shellMat);"),
("""    this.low = buildShell(specs, [cx, cz]);
    this.add(this.low);""","""    this.low = buildShell(specs, [cx, cz], opts.mats?.shell);
    if (opts.noRaycast) this.low.raycast = () => {};
    this.add(this.low);"""),
("""    this.high = this.bld.finish(new THREE.Group());
    this.bld = null;""","""    this.high = this.bld.finish(new THREE.Group(), this.opts.mats);
    this.bld = null;
    if (this.opts.noRaycast) this.high.traverse((o) => { if (o.isMesh) o.raycast = () => {}; });"""),
("""  const tile = o.tile ?? 100, near = o.near ?? (LOWQ ? 170 : 280), budget = o.budget ?? 10;""",
 """  const tile = o.tile ?? 100, near = o.near ?? (LOWQ ? 170 : 280), budget = o.budget ?? 10;
  const mats = { ...buildingMaterials(), ...(o.ownLights ? cityLightSet() : null), ...(o.mats || null) };"""),
("    const t = new CityTile(list, (i + 0.5) * tile, (j + 0.5) * tile, { near, budget });","    const t = new CityTile(list, (i + 0.5) * tile, (j + 0.5) * tile, { near, budget, mats, noRaycast: !!o.noRaycast });"),
("    setLit(v) { const M = buildingMaterials(); M.glass.userData.uniforms.uLit.value = v; M.shell.userData.uniforms.uLit.value = v; M.sign.userData.uniforms.uSignLit.value = 0.05 + v * 1.6; },",
 "    mats,\n    setLit(v) { mats.glass.userData.uniforms.uLit.value = v; mats.shell.userData.uniforms.uLit.value = v; mats.sign.userData.uniforms.uSignLit.value = 0.05 + v * 1.6; },"),
]
for a,b in rep:
    assert a in s, a[:60]
    s=s.replace(a,b)
open(f,'w').write(s)
f='src/core/gfx/streets.js'; s=open(f).read()
a="  const buildings = populateCity({ lots: [...lots, ...extra], seed: P.seed, near: P.near, tile: P.tile, budget: P.budget, camera: P.camera });"
b="  const buildings = populateCity({ lots: [...lots, ...extra], seed: P.seed, near: P.near, tile: P.tile, budget: P.budget, camera: P.camera, ownLights: P.ownLights, noRaycast: P.noRaycast, mats: P.mats });"
assert a in s; s=s.replace(a,b)
# büyük format granit döşeme (meydan)
a="    pole: mat.paintedMetal({ color: 0x4a4f55, wear: 0.2 }),"
b="""    slab: procedural({
      key: 'street-slab', params: { color: 0xb5afa4, roughness: 0.8 }, bump: 0.025,
      pattern: `
        vec2 uv = p.xz/vec2(0.9, 0.6);
        float row = floor(uv.y); uv.x += mod(row, 2.0)*0.5;
        vec2 f = fract(uv), id = floor(uv);
        float m = smoothstep(0.0, 0.03, min(f.x, 1.0 - f.x)*0.66)*smoothstep(0.0, 0.03, min(f.y, 1.0 - f.y));
        float aa = 1.0 - smoothstep(0.1, 0.35, length(fwidth(uv)));
        m = mix(0.95, m, aa);
        float t = mix(0.5, h13(vec3(id, 6.0)), aa), n = fbm3(p*0.6, 4), sp = vn3(p*40.0);
        col *= mix(0.5, (0.82 + 0.2*t)*(0.86 + 0.2*n) + 0.05*(sp - 0.5), m);
        col *= 1.0 - 0.22*smoothstep(0.55, 0.85, fbm3(p*0.25 + 7.0, 3));
        col = mix(col, vec3(0.35, 0.33, 0.3), 0.5*smoothstep(0.7, 0.9, fbm3(p*0.9 + 21.0, 3)));
        rough = mix(0.95, 0.72 + 0.15*sp, m); h = m*0.7 + sp*0.3;`,
    }),
    pole: mat.paintedMetal({ color: 0x4a4f55, wear: 0.2 }),"""
assert a in s; s=s.replace(a,b)
open(f,'w').write(s)
