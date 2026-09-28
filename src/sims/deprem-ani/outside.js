// Pencere dışı: odanın bulunduğu apartmanın önündeki bahçe, cadde ve karşı adalar (motor kent kiti), uzak tepeler.
// Oda 2. kattadır: dünya grubunun zemini oda döşemesinin GH metre altındadır. Işığı gökyüzü (createSim sky) verir.
import { THREE, landscape, createTerrain, terrainSkirt, createVegetation, makeCity, makeBlock } from '@core';

export const GH = 6.4; // oda döşemesinin sokak kotundan yüksekliği (2. kat)

export function buildOutside({ low = false } = {}) {
  const group = new THREE.Group();
  group.name = 'deprem:outside';
  group.position.y = -GH;

  // Arazi: kent düz, 450 m ötesinde tepeler (ufuk çizgisi binaların üstünden görünür)
  const hills = landscape({ seed: 23, size: 1400, height: 320, base: -20, warp: 0.5 });
  const hf = (x, z) => {
    const r = Math.hypot(x, z * 1.15);
    return -0.05 + THREE.MathUtils.smoothstep(r, 450, 2600) * (hills(x, z) + 140);
  };
  const terr = createTerrain(hf, { size: [7000, 7000], res: low ? [120, 120] : [200, 200], materialOptions: { water: -900, grass: 0x5d6a33, dry: 0x9a8d5c, forest: 0.85 } });
  const skirt = terrainSkirt(hf, { inner: 3500, outer: 30000 });
  group.add(terr, skirt);

  // Kent: önümüzdeki cadde z = −20 (oda cephesi z ≈ −3,3); karşı ada ve arkasındaki ada; yan adalar
  const XS = [-150, -62, 62, 150], ZS = [-200, -112, -20, 70];
  const city = makeCity({
    xs: XS, zs: ZS, road: 10, walk: 3.5, seed: 14, parked: low ? 14 : 26, trees: true, lamps: true, lawnInside: true,
    camera: [2, GH + 1.5, 0], near: low ? 150 : 220, tile: 90,
    lots: (inner, r, i, j) => {
      const L = makeBlock(inner, {
        seed: r() * 1000, shops: j === 1 ? 0.75 : 0.5, roofs: { hip: 0.55 }, gap: j === 1 ? 0 : 2.5,
        floors: (x, z, rr, type) => (type === 'apartment' ? 4 + Math.floor(rr() * 4) : type === 'office' ? 6 + Math.floor(rr() * 5) : undefined),
      });
      // Kendi binamızın parseli boş kalır (oda burada)
      return i === 1 && j === 2 ? L.filter((l) => !(Math.abs(l.x) < 24 && l.z < inner.z0 + 22)) : L;
    },
  });
  group.add(city.group);

  // Ön bahçe: gerçek ağaçlar (motor bitki örtüsü), çalılar, çim; pencerenin tam önü açık kalır
  const flat = () => 0.17;
  const veg = createVegetation(flat, {
    rect: [-26, -12.5, 26, -4.8], trees: low ? 7 : 10, shrubs: low ? 18 : 30, rocks: 0, grass: 0, seed: 9, water: -10,
    kinds: { broad: 0.55, cypress: 0.25, pine: 0.2 },
    forest: (x) => (Math.abs(x - 1) < 6.5 ? 0 : 1),
  });
  group.add(veg.group);

  // Dış dünya odanın gölge çerçevesini büyütmesin (gölge haritası odaya odaklansın)
  group.traverse((o) => { if (o.isMesh) o.userData.noFit = true; });

  return {
    group, city,
    update(t, wind = 0.6) { city.update(t, wind); veg.update(t, wind); },
    setLit(v) { city.setLit(v); },
  };
}
