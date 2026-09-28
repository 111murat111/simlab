f='src/sims/trafik-kavsak/main.js'; s=open(f).read()
a="""  const Y0 = 0.16; // kaldırım/meydan döşemesi üst kotu
  const stone = mat.concrete({ color: 0xc9c2b4, stains: 0.35 }), dark = mat.concrete({ color: 0x8d8880, stains: 0.5 });"""
b="""  const Y0 = 0.16; // kaldırım/meydan döşemesi üst kotu
  const stone = mat.concrete({ color: 0xc9c2b4, stains: 0.35 }), dark = mat.concrete({ color: 0x8d8880, stains: 0.5 });
  // Meydan döşemesi: büyük format granit plaklar (derzli, lekeli, aşınmış), yağmur oluğu kanalı ve ızgaralar
  {
    const GS = groundMats();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(67.6, 67.6).rotateX(-Math.PI / 2), GS.slab);
    floor.position.set(37.5, Y0 + 0.004, 37.5); floor.receiveShadow = true; floor.userData.noFit = true; plaza.add(floor);
    const chan = new THREE.Mesh(new THREE.BoxGeometry(60, 0.03, 0.3), GS.iron);
    chan.position.set(37.5, Y0 + 0.006, 22.5); chan.receiveShadow = true; chan.userData.noAO = true; plaza.add(chan);
    const gr = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.02, 0.9), GS.iron, 8);
    const gm = new THREE.Matrix4();
    [[12, 12], [62, 12], [12, 62], [62, 62], [37.5, 8.5], [8.5, 37.5], [66.5, 37.5], [37.5, 50]].forEach(([x, z], i) => gr.setMatrixAt(i, gm.makeTranslation(x, Y0 + 0.008, z)));
    gr.receiveShadow = true; gr.userData.noAO = true; plaza.add(gr);
  }"""
assert a in s; s=s.replace(a,b)
a=s[s.index("  // İnsanlar (1,6–1,85 m): gövde, bacaklar, kollar, baş; giysi renkleri örnek başına"):s.index("  for (const m of [pI, hI]) { m.castShadow = m.receiveShadow = true; plaza.add(m); }\n}")+len("  for (const m of [pI, hI]) { m.castShadow = m.receiveShadow = true; plaza.add(m); }\n}")]
b="""  // İnsanlar (1,6–1,85 m): üst giysi, pantolon, ten, saç ayrı örnek kümeleri; iki poz (duran / yürüyen: bacak ve kol salınımı)
  {
    const cap = (r, l, x, y, z, rz = 0, rx = 0) => new THREE.CapsuleGeometry(r, l, 3, 8).rotateX(rx).rotateZ(rz).translate(x, y, z).toNonIndexed();
    const torso = (walk) => BufferGeometryUtils.mergeGeometries([
      cap(0.17, 0.5, 0, 1.18, 0),
      cap(0.055, 0.55, -0.25, 1.13, walk ? 0.12 : 0, 0.12, walk ? 0.45 : 0), cap(0.055, 0.55, 0.25, 1.13, walk ? -0.12 : 0, -0.12, walk ? -0.45 : 0),
    ]);
    const legs = (walk) => BufferGeometryUtils.mergeGeometries([cap(0.075, 0.72, -0.09, 0.44, 0, 0, walk ? 0.32 : 0), cap(0.075, 0.72, 0.09, 0.44, 0, 0, walk ? -0.32 : 0)]);
    const head = new THREE.SphereGeometry(0.11, 14, 10).translate(0, 1.64, 0);
    const hair = new THREE.SphereGeometry(0.118, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).translate(0, 1.655, -0.01);
    const spots = [[21, 20, 1], [22.2, 20.6, 0], [33, 21, 1], [31, 35, 0], [20, 34, 1], [34, 7, 1], [36, 6.5, 0], [40, 6.2, 1], [16, 25, 0], [35, 29, 1], [14, 33, 1], [28, 37, 0], [36.5, 12.5, 1], [50, 30, 1], [48, 44, 0], [24, 48, 1]];
    const shirts = [0x2b3a55, 0x7a2e2e, 0xd8d2c4, 0x3b4a32, 0x1d1f22, 0x9a7a52, 0x5a6f8a, 0xe9e4d8, 0x8a4a6a, 0x2f6a7a];
    const pants = [0x1e2430, 0x2a2a2e, 0x4a4238, 0x33415a, 0x1b1b1b, 0x6b6660, 0x3d3a45];
    const skins = [0xc99a78, 0xb8845e, 0xe0b898, 0x8f6446, 0xd4a583];
    const hairs = [0x1a1512, 0x2c1e14, 0x4a3320, 0x7a5a3a, 0x3a3a3a, 0xa08560];
    const shirtM = mat.fabric({ color: 0xffffff }), pantM = mat.fabric({ color: 0xffffff, scale: 1.3 }), skinM = mat.tissue({ color: 0xffffff, veins: 0 }), hairM = mat.fabric({ color: 0xffffff, scale: 3 });
    const sets = [0, 1].map((w) => ({ t: new THREE.InstancedMesh(torso(w), shirtM, spots.length), l: new THREE.InstancedMesh(legs(w), pantM, spots.length), n: 0 }));
    const hI = new THREE.InstancedMesh(head, skinM, spots.length), rI = new THREE.InstancedMesh(hair, hairM, spots.length);
    const cc = new THREE.Color();
    spots.forEach(([x, z, w], i) => {
      const s = 0.92 + (i % 4) * 0.035, S = sets[w], k = S.n++;
      m4.compose(v.set(x, Y0, z), q.setFromAxisAngle(up, i * 2.1), new THREE.Vector3(s, s, s));
      S.t.setMatrixAt(k, m4); S.l.setMatrixAt(k, m4); hI.setMatrixAt(i, m4); rI.setMatrixAt(i, m4);
      S.t.setColorAt(k, cc.set(shirts[i % shirts.length])); S.l.setColorAt(k, cc.set(pants[(i * 3) % pants.length]));
      hI.setColorAt(i, cc.set(skins[(i * 7) % skins.length])); rI.setColorAt(i, cc.set(hairs[(i * 5) % hairs.length]));
    });
    for (const S of sets) { S.t.count = S.l.count = S.n; }
    for (const m of [sets[0].t, sets[0].l, sets[1].t, sets[1].l, hI, rI]) { m.castShadow = m.receiveShadow = true; m.userData.noFit = true; plaza.add(m); }
  }
}"""
s=s.replace(a,b)
open(f,'w').write(s)
