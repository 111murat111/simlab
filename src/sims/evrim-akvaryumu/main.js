// Evrim Akvaryumu — kalıtsal genli av balıkları, görerek avlanan avcılar: kamuflajın doğal seçilimle evrimi.
import { createSim, THREE, BufferGeometryUtils, RoundedBoxGeometry, fmt, instanced, rand, mat, procedural, treeParts, leafMaterial } from '@core';
import { createWorld, MAXP, MAXF, MAXH, BOX, hueDiff } from './model.js';

const TIME = 2; // model saniyesi / gerçek saniye (1× hızda)
const INITIAL = 150;

const sim = createSim({
  studio: { color: 0x5a5046, mood: 'lab', warmth: 0.35, key: { el: 68, az: 180, power: 1.05 }, fill: 0.85, radius: 20, height: 12 },
  look: { aoRadius: 0.06 },
  camera: { position: [0.2, 1.16, 1.58], target: [0, 1.1, 0], fov: 45, near: 0.02, far: 60 },
  controls: { minDistance: 0.6, maxDistance: 5 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Akşam ışığında bir oturma odası; dolabın üstünde yaklaşık 1,7 m'lik tatlı su akvaryumu: çakıl zemin, taş fon, kök, kayalar,
    kılıç bitkileri, kriptokorinler ve gövdeli bitkiler. Çakılın, taş fonun ve şerit yaprakların tonu aşağıdaki <b>zemin rengi</b>
    ayarına uyar. Av balıkları yaklaşık 4–13 cm boyundadır (çoğu 7–8 cm).</p>
    <p>Küçük balıkların her birinin üç <b>geni</b> var: <b>renk tonu</b>, <b>hız</b> ve <b>boyut</b>. Yem yiyip yeterli
    enerji toplayan balık yavru yapar; yavru genleri ebeveynden alır ama küçük rastgele değişiklikler
    (<b>mutasyon</b>) olur. Av balıklarının hepsi aynı türdür: yan yüzlerindeki renk, renk genini gösterir;
    hız geni yüksek olan balık daha uzun ve ince gövdeli, küçük ve çatallı yüzgeçlidir; düşük olan derin gövdeli ve geniş yüzgeçlidir; boyut geni büyüklüğü belirler.
    Koyu, çizgili, uzun gövdeli büyük balıklar <b>avcı</b>dır: gözleriyle avlanır. Zeminin rengine benzeyen
    balığı fark etmeleri zordur, zıt renkli balık ise hemen göze batar.</p>
    <p>Kimse balıklara "renk değiştirin" demez. Göze batanlar daha sık yenir, kamufle olanlar daha çok yavru bırakır;
    nesiller geçtikçe popülasyonun ortalama rengi zemine yaklaşır. Buna <b>doğal seçilim</b> denir.</p>
    <h3>Dene</h3>
    <ul>
      <li>8× hızda birkaç dakika bekle: renk histogramı zeminin rengi etrafında toplanır, "renk farkı" grafiği düşer.</li>
      <li>Sonra <b>zemin rengini</b> değiştir (ör. Sarı kum → Mavi taş). Önce çok balık avlanır, sonra popülasyon yeni
      renge doğru evrilir.</li>
      <li><b>Avcı sayısını 0</b> yap: seçilim kalkar, renkler rastgele dağılır (yalnızca mutasyon ve şans).</li>
      <li>Avcıları artır: hızlı ve küçük balıklar avantaj kazanır. Hız ve büyüklüğün bedeli daha fazla enerji harcamaktır.</li>
      <li>Mutasyon oranını 0 yap: yeni varyasyon oluşmaz, evrim yavaşlar; çok yükseltirsen uyum bozulur.</li>
    </ul>
    <h3>Model ve sınırları</h3>
    <p>Bireye dayalı bir modeldir: her balığın enerjisi, yaşı ve genleri ayrı ayrı izlenir. Avcının bir balığı fark etme
    olasılığı, balığın zeminle renk tonu farkı ve boyutuyla artar. Gerçekte parlaklık, desen, hareket ve ışık da önemlidir;
    burada yalnızca renk tonu (renk çemberindeki konum) kullanılır. Sayılar ölçeklenmiştir.</p>
    <h3>Gerçek hayatta</h3>
    <p>İngiltere'de sanayi devriminde kurumla kararan ağaç gövdelerinde koyu renkli <b>biberli güveler</b> çoğaldı, hava
    temizlenince açık renkliler geri döndü. Kum renkli kertenkeleler, deniz dibindeki pisi balıkları ve karda beyaz tüy
    değiştiren hayvanlar da kamuflajın örnekleridir.</p>`,
});

const w = createWorld();
const tmpColor = new THREE.Color();
const floorColor = new THREE.Color();
const _sum = {};

// --- Akvaryum (metre): oturma odasında dolap üstünde 1,7 m'lik tatlı su akvaryumu. Tank içi model birimi: 1 birim = 7,5 cm ---
const K = 0.075, STAND_H = 0.75;
const TW = BOX.x * 2 + 0.6, TD = BOX.z * 2 + 0.6, TH = BOX.y1 + 0.9;
const tank = new THREE.Group();
tank.scale.setScalar(K);
tank.position.y = STAND_H + 0.2 * K;
sim.scene.add(tank);
if (sim.stage?.mesh) sim.stage.mesh.visible = false;
const U = { uTime: { value: 0 } };
const gh = (x, z) => { const t = (TD / 2 - z) / TD; return 0.1 + 0.42 * t * t + 0.05 * Math.sin(x * 0.7 + 1.3) * Math.cos(z * 0.9); };
const softDot = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.35)'); r.addColorStop(0.6, 'rgba(255,255,255,0.25)'); r.addColorStop(0.82, 'rgba(255,255,255,0.9)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

// Oda: meşe parke, koyu boyalı duvar, ceviz dolap
{
  const add = (o, cast = true) => { o.castShadow = cast; o.receiveShadow = true; sim.scene.add(o); return o; };
  const planks = [];
  for (let i = 0; i < 40; i++) planks.push(new THREE.BoxGeometry(0.15, 1.8, 0.02).translate(-3 + i * 0.15, ((i * 7) % 5) * 0.36, 0).toNonIndexed());
  const pg = BufferGeometryUtils.mergeGeometries(planks), oak = mat.wood({ color: 0x8a6848, varnish: 0.5, scale: 1.3 });
  for (let r = -2; r <= 3; r++) { const f = add(new THREE.Mesh(pg, oak), false); f.rotation.x = -Math.PI / 2; f.position.set(0, -0.01 * ((r + 2) % 2), r * 1.8); f.userData.noCast = f.userData.noFit = true; }
  const paint = procedural({ key: 'ea-wall', bump: 0.01, params: { color: 0x7a6e62, roughness: 0.9 },
    pattern: `float n = fbm3(p*2.5, 4); col *= 0.9 + 0.14*n; h = n;` });
  add(new THREE.Mesh(new THREE.BoxGeometry(6, 2.8, 0.1).translate(0, 1.4, -0.62), paint), false).userData.noFit = true;
  add(new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 0.02).translate(0, 0.04, -0.56), mat.paintedMetal({ color: 0xe8e4dc, wear: 0.02 })), false);
  // dolap: gövde, iki kapak, kulplar
  const walnut = mat.wood({ color: 0x3f2a1c, varnish: 0.8, scale: 1.6 });
  const SW = TW * K + 0.06, SD = TD * K + 0.06;
  const body = new THREE.Mesh(new RoundedBoxGeometry(STAND_H - 0.06, SW, SD, 2, 0.008), walnut);
  body.rotation.z = -Math.PI / 2; body.position.set(0, 0.06 + (STAND_H - 0.06) / 2, 0); add(body);
  add(new THREE.Mesh(new THREE.BoxGeometry(SW - 0.04, 0.06, SD - 0.06).translate(0, 0.03, -0.01), mat.rubber()), false);
  for (const x of [-SW / 4, SW / 4]) {
    const door = new THREE.Mesh(new RoundedBoxGeometry(STAND_H - 0.14, SW / 2 - 0.02, 0.018, 2, 0.004), walnut);
    door.rotation.z = -Math.PI / 2; door.position.set(x, 0.06 + (STAND_H - 0.06) / 2, SD / 2 + 0.008); add(door);
    const h = add(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.14, 10), mat.brushedMetal({ color: 0xbfc3c8 })));
    h.position.set(x + (x < 0 ? 1 : -1) * (SW / 4 - 0.05), 0.5, SD / 2 + 0.03);
  }
  // lambader (sıcak, yumuşak ışık), duvarda çerçeveli resim, saksıda kauçuk bitkisi
  const brass = mat.brushedMetal({ color: 0x9a8260 });
  const lx = -SW / 2 - 0.42;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.025, 24).translate(lx, 0.012, -0.3), brass));
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.5, 8).translate(lx, 0.76, -0.3), brass));
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0xf2e6cf, emissive: 0xffc98a, emissiveIntensity: 0.9, roughness: 0.9, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.19, 0.26, 28, 1, true), shadeMat);
  shade.position.set(lx, 1.52, -0.3); shade.userData.noCast = true; sim.scene.add(shade);
  const bulb = new THREE.PointLight(0xffc27a, 1.4, 3.5, 2); bulb.position.set(lx, 1.45, -0.25); sim.scene.add(bulb);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshBasicMaterial({ map: softDot, color: 0x6a4a28, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.position.set(lx + 0.1, 1.5, -0.56); sim.scene.add(pool);
  const art = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 320;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 320); gr.addColorStop(0, '#c9d6d8'); gr.addColorStop(0.55, '#e6dcc4'); gr.addColorStop(1, '#7d8f6a');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 320);
    g.fillStyle = 'rgba(70,90,80,0.55)'; g.beginPath(); g.moveTo(0, 210); g.bezierCurveTo(70, 150, 150, 190, 256, 140); g.lineTo(256, 320); g.lineTo(0, 320); g.fill();
    g.fillStyle = 'rgba(40,55,45,0.7)'; g.beginPath(); g.moveTo(0, 260); g.bezierCurveTo(90, 220, 170, 250, 256, 230); g.lineTo(256, 320); g.lineTo(0, 320); g.fill();
    g.fillStyle = 'rgba(240,200,140,0.8)'; g.beginPath(); g.arc(180, 95, 26, 0, 7); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const fx = SW / 2 + 0.36;
  add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.025).translate(fx, 1.5, -0.555), mat.wood({ color: 0x2a1c12, varnish: 0.6 })), false);
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.43).translate(fx, 1.5, -0.541), new THREE.MeshStandardMaterial({ map: art, roughness: 0.7 })), false);
  const pot = add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.3, 24).translate(fx + 0.02, 0.15, -0.3), mat.ceramic({ color: 0xd8d0c4 })));
  pot.receiveShadow = true;
  const { trunk, crown } = treeParts('shrub', 5);
  const leafM = leafMaterial(0x3f6a2a, { wind: 0.05 });
  const pl = new THREE.Group();
  pl.add(new THREE.Mesh(trunk, leafM), new THREE.Mesh(crown, leafM));
  pl.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  pl.position.set(fx + 0.02, 0.28, -0.3); pl.scale.setScalar(0.42); sim.scene.add(pl);
}

// Çakıl: öne doğru alçalan yatak (renk = zemin rengi geni), üstünde hareketli kostik ışık ağı
const floorMat = procedural({ key: 'ea-gravel', bump: 0.05, uniforms: U, params: { color: 0xffffff, roughness: 0.85 },
  pattern: `
    float c1 = cells3(p*9.0), c2 = cells3(p*16.0 + 5.0);
    float peb = 1.0 - smoothstep(0.2, 0.62, c1);
    float tone = h13(floor(p*9.0 + 0.5));
    col *= 0.62 + 0.5*tone*peb + 0.12*(1.0 - c2);
    col *= mix(0.55, 1.0, peb);
    h = peb*0.8 + (1.0 - c2)*0.2;
    vec2 q = p.xz*0.55;
    float k1 = cells3(vec3(q, uTime*0.35)), k2 = cells3(vec3(q*1.37 + 3.1, uTime*0.28 + 4.0));
    float caus = pow(smoothstep(0.3, 0.72, k1)*smoothstep(0.3, 0.72, k2), 1.6);
    col *= 1.0 + 1.1*caus*smoothstep(0.3, 0.8, pn.y);
    rough = 0.75 + 0.2*(1.0 - peb);` });
{
  const gg = new THREE.PlaneGeometry(TW - 0.12, TD - 0.12, 96, 48).rotateX(-Math.PI / 2);
  const pa = gg.attributes.position;
  for (let i = 0; i < pa.count; i++) pa.setY(i, gh(pa.getX(i), pa.getZ(i)));
  gg.computeVertexNormals();
  const top = new THREE.Mesh(gg, floorMat); top.receiveShadow = true; tank.add(top);
  // ön cam arkasında görünen çakıl kesiti
  const front = new THREE.Mesh(new THREE.PlaneGeometry(TW - 0.12, 1, 96, 1), floorMat);
  const fa = front.geometry.attributes.position;
  for (let i = 0; i < fa.count; i++) fa.setY(i, fa.getY(i) > 0 ? gh(fa.getX(i), TD / 2 - 0.06) : -0.14);
  front.position.z = TD / 2 - 0.06; tank.add(front);
}
// Arka plan: taş görünümlü 3B akvaryum fonu (tonu zemine uyar)
const backMat = procedural({ key: 'ea-backdrop', bump: 0.06, params: { color: 0x888888, roughness: 0.92 },
  pattern: `
    float n = fbm3(p*0.35, 5), c = cells3(p*0.9);
    col *= 0.45 + 0.7*n + 0.2*(c - 0.5);
    h = n*0.7 + c*0.3;` });
{
  const bg = new THREE.PlaneGeometry(TW - 0.14, TH - 0.4, 80, 36);
  const pa = bg.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i);
    pa.setZ(i, 0.28 * (Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2) * 0.5 + 0.5) + 0.12 * Math.sin(x * 2.3 + y * 1.7));
  }
  bg.computeVertexNormals();
  const back = new THREE.Mesh(bg, backMat);
  back.position.set(0, (TH - 0.4) / 2, -TD / 2 + 0.06); back.receiveShadow = true;
  tank.add(back);
}
// Cam: ince yansıtıcı levhalar, yeşilimsi cam kenarları, siyah silikon ve plastik çerçeve
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xe8f4f0, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.08, depthWrite: false, specularIntensity: 1, envMapIntensity: 1.4, side: THREE.DoubleSide });
{
  const panes = [[TW, TH, 0, TH / 2, TD / 2, 0], [TD, TH, TW / 2, TH / 2, 0, Math.PI / 2], [TD, TH, -TW / 2, TH / 2, 0, Math.PI / 2]];
  for (const [w_, h_, x, y, z, ry] of panes) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w_, h_), glassMat); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 4; tank.add(m); }
  const edgeMat = mat.plastic({ color: 0x6fb39c, gloss: 0.9 }); edgeMat.transparent = true; edgeMat.opacity = 0.55;
  const sil = mat.rubber({ color: 0x141414 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.16, TH, 0.16), edgeMat); e.position.set(sx * TW / 2, TH / 2, sz * TD / 2); e.renderOrder = 3; tank.add(e);
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.12, TH - 0.1, 0.12), sil); s.position.set(sx * (TW / 2 - 0.1), TH / 2, sz * (TD / 2 - 0.1)); tank.add(s);
  }
  const trim = mat.plastic({ color: 0x151515, gloss: 0.6 });
  for (const [y, hh] of [[-0.12, 0.34], [TH - 0.1, 0.3]]) {
    for (const sz of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(TW + 0.3, hh, 0.3), trim); b.position.set(0, y, sz * TD / 2); b.userData.noCast = y > 1; tank.add(b); }
    for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, hh, TD + 0.3), trim); b.position.set(sx * TW / 2, y, 0); b.userData.noCast = y > 1; tank.add(b); }
  }
  // kapak ve LED aydınlatma (gölge atmaz: ışık tankın içine düşsün)
  const hood = new THREE.Mesh(new RoundedBoxGeometry(TW + 0.4, 0.9, TD + 0.4, 2, 0.12), mat.plastic({ color: 0x1a1a1c, gloss: 0.5 }));
  hood.position.y = TH + 0.45; hood.userData.noCast = true; tank.add(hood);
  const led = new THREE.Mesh(new RoundedBoxGeometry(TW - 1, 0.08, 1.4, 1, 0.03), mat.glow({ color: 0xeaf6ff, intensity: 1.6 }));
  led.position.set(0, TH + 0.06, -0.9); tank.add(led); // kapağın içinde: önden görünmez, parlak şerit yapmaz
  // ön camda oda yansıması: yumuşak çapraz parlama şeritleri
  const refl = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    for (const [x0, w0, a] of [[60, 70, 0.55], [150, 26, 0.35], [330, 110, 0.4], [455, 20, 0.3]]) {
      const gr = g.createLinearGradient(x0, 0, x0 + w0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,248,236,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.save(); g.transform(1, 0, -0.35, 1, 20, 0); g.fillRect(x0, 0, w0, 128); g.restore();
    }
    const v = g.createLinearGradient(0, 0, 0, 128); v.addColorStop(0, 'rgba(0,0,0,0.6)'); v.addColorStop(0.35, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, 512, 128);
    return new THREE.CanvasTexture(c);
  })();
  const sheen = new THREE.Mesh(new THREE.PlaneGeometry(TW - 0.2, TH - 0.2), new THREE.MeshBasicMaterial({ map: refl, color: 0x3a3a38, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sheen.position.set(0, TH / 2, TD / 2 + 0.02); sheen.renderOrder = 7; sheen.userData.noAO = true; tank.add(sheen);
  // cam kenarlarından sızan LED ışığı (kalın camın yeşil kenar parıltısı)
  const edgeGlow = mat.glow({ color: 0x9fe6cf, intensity: 1.3 });
  const eg = [[0.05, TH - 0.4, 0.05, -TW / 2, TH / 2 - 0.05, TD / 2], [0.05, TH - 0.4, 0.05, TW / 2, TH / 2 - 0.05, TD / 2]];
  for (const [a, b, c2, x, y, z] of eg) { const m = new THREE.Mesh(new THREE.BoxGeometry(a, b, c2), edgeGlow); m.position.set(x, y, z); m.userData.noCast = true; m.renderOrder = 6; tank.add(m); }
}
// Su: arka tarafı hafif turkuaz tonlayan hacim + alttan gümüş gibi görünen dalgalı yüzey
const water = new THREE.Mesh(new THREE.PlaneGeometry(TW - 0.1, TD - 0.1),
  procedural({ key: 'ea-surf2', uniforms: U, bump: 0.05, params: { color: 0x6f9c96, metalness: 0.0, roughness: 0.28, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false },
    pattern: `float w = vn3(vec3(p.xy*0.35, uTime*0.3))*0.7 + vn3(vec3(p.xy*0.8 + 7.0, uTime*0.45))*0.3; h = w; col *= 0.85 + 0.25*w;` }));
water.rotation.x = -Math.PI / 2;
water.position.y = BOX.y1 + 0.35;
water.renderOrder = 2;
tank.add(water);
{
  const vol = new THREE.Mesh(new THREE.BoxGeometry(TW - 0.12, BOX.y1 + 0.3, TD - 0.12),
    new THREE.MeshBasicMaterial({ color: 0x1f6f68, transparent: true, opacity: 0.16, side: THREE.BackSide, depthWrite: false }));
  vol.position.y = (BOX.y1 + 0.3) / 2; vol.renderOrder = 1; tank.add(vol);
}
const lamp = new THREE.SpotLight(0xeef6ff, 1.3, 3, 1.05, 0.7, 2);
lamp.position.set(0, STAND_H + TH * K + 0.02, -0.05);
lamp.target.position.set(0, STAND_H, 0.02);
sim.scene.add(lamp, lamp.target);
// Işık huzmeleri: yüzeyden süzülen yumuşak ışık
const rays = [];
{
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d'), im = g.createImageData(64, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
    const u = (x - 31.5) / 32, v = y / 255, a = Math.exp(-u * u * 5) * Math.pow(1 - v, 1.4) * 255;
    const i = (y * 64 + x) * 4; im.data[i] = im.data[i + 1] = im.data[i + 2] = 255; im.data[i + 3] = a;
  }
  g.putImageData(im, 0, 0);
  const rt = new THREE.CanvasTexture(c);
  for (let k = 0; k < 9; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rand(0.8, 2.2), BOX.y1).translate(0, -BOX.y1 / 2, 0),
      new THREE.MeshBasicMaterial({ map: rt, color: 0xcfeeff, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(-BOX.x + 1.5 + k * (2 * BOX.x - 3) / 8 + rand(-0.6, 0.6), BOX.y1 + 0.3, rand(-BOX.z + 1, BOX.z - 1.5));
    m.rotation.set(0, rand(-0.35, 0.35), 0.22 + rand(-0.06, 0.06));
    m.renderOrder = 5; m.userData.ph = rand(0, 6.28);
    rays.push(m); tank.add(m);
  }
}

// Kayalar ve kök (driftwood)
{
  const rg = new THREE.IcosahedronGeometry(0.6, 2), pa = rg.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const n = 1 + 0.18 * Math.sin(v.x * 5.1 + v.y * 3.3) * Math.cos(v.z * 4.2 - v.y * 2.1); v.multiplyScalar(n); v.y = Math.max(v.y, -0.25); pa.setXYZ(i, v.x, v.y, v.z); }
  rg.computeVertexNormals();
  const rocks = new THREE.InstancedMesh(rg, mat.rock({ color: 0x6f6a64, scale: 1.5, strata: 0.5 }), 11);
  const d = new THREE.Object3D();
  for (let k = 0; k < 11; k++) {
    const x = rand(-BOX.x + 1, BOX.x - 1), z = rand(-BOX.z + 0.6, -BOX.z * 0.1);
    const s = rand(0.7, 1.8);
    d.position.set(x, gh(x, z) + 0.05, z);
    d.rotation.set(rand(-0.3, 0.3), rand(0, 6.28), rand(-0.3, 0.3));
    d.scale.set(s * rand(0.9, 1.5), s * rand(0.5, 0.9), s * rand(0.8, 1.3));
    d.updateMatrix(); rocks.setMatrixAt(k, d.matrix);
  }
  rocks.castShadow = rocks.receiveShadow = true;
  tank.add(rocks);
  const wood = mat.wood({ color: 0x4a3222, scale: 2.5 });
  const branch = (pts, r) => { const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 8), wood); m.castShadow = m.receiveShadow = true; tank.add(m); };
  branch([[-8.5, 0.4, -3.2], [-6.5, 1.4, -2.8], [-5, 3.2, -3.4], [-4.2, 5.4, -3.9]], 0.32);
  branch([[-6.5, 1.4, -2.8], [-7.6, 3, -2.2], [-8.6, 4.4, -2.6]], 0.18);
  branch([[-5, 3.2, -3.4], [-3.4, 3.9, -2.5], [-2.2, 4.3, -2.9]], 0.14);
  branch([[5.2, 0.35, -1.6], [6.8, 0.9, -2.2], [8.6, 1.7, -3.4]], 0.26);
  // hava taşı, hortum ve filtre emiş borusu
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.3, 16), mat.ceramic({ color: 0x9aa0a6 }));
  stone.position.set(BOX.x - 1.2, gh(BOX.x - 1.2, -BOX.z + 1) + 0.12, -BOX.z + 1); tank.add(stone);
  const hose = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, TH, 8), mat.plastic({ color: 0xcfd8d8, gloss: 0.9 }));
  hose.position.set(BOX.x - 0.5, TH / 2 + 0.4, -BOX.z + 0.25); tank.add(hose);
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, TH - 1.4, 12), mat.plastic({ color: 0x1b1d1f, gloss: 0.6 }));
  pipe.position.set(-BOX.x + 0.3, (TH - 1.4) / 2 + 1.4, -BOX.z + 0.3); tank.add(pipe);
  const strainer = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 12), mat.plastic({ color: 0x2a2d30, gloss: 0.3 }));
  strainer.position.set(-BOX.x + 0.3, 1.5, -BOX.z + 0.3); tank.add(strainer);
  // filtre dönüş borusu ve ağzı (kabarcıklar buradan)
  const ret = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, TH - 5.7, 10), mat.plastic({ color: 0x1b1d1f, gloss: 0.6 }));
  ret.position.set(-BOX.x + 0.9, (TH + 5.7) / 2, -BOX.z + 0.5); tank.add(ret);
  const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 0.3, 12), mat.plastic({ color: 0x1b1d1f, gloss: 0.6 }));
  nz.position.set(-BOX.x + 0.9, 5.75, -BOX.z + 0.5); tank.add(nz);
}

// Su bitkileri (Vallisneria benzeri şeritler; tonu zemine uyar, salınır)
const WEEDS = 20;
const weedGeo = (() => {
  const parts = [];
  for (let b = 0; b < 6; b++) {
    const g = new THREE.PlaneGeometry(0.12, 1, 1, 10).translate(0, 0.5, 0);
    const pa = g.attributes.position, bend = rand(-0.25, 0.25), tw = rand(-0.8, 0.8);
    for (let i = 0; i < pa.count; i++) {
      const y = pa.getY(i), x = pa.getX(i) * (1 - y * 0.35);
      const a = tw * y;
      pa.setXYZ(i, Math.cos(a) * x + bend * y * y, y, Math.sin(a) * x + bend * 0.5 * y * y);
    }
    g.rotateY(rand(0, Math.PI)).translate(rand(-0.12, 0.12), 0, rand(-0.12, 0.12)).scale(1, rand(0.7, 1), 1);
    g.computeVertexNormals();
    parts.push(g);
  }
  return BufferGeometryUtils.mergeGeometries(parts);
})();
const weedMat = mat.foliage({ color: 0xffffff, scale: 2 });
const weeds = instanced(weedGeo, weedMat, WEEDS);
const weedData = [];
for (let k = 0; k < WEEDS; k++) {
  const side = k % 3;
  const x = side === 2 ? rand(-BOX.x + 0.4, BOX.x - 0.4) : (side ? 1 : -1) * rand(BOX.x - 2, BOX.x - 0.3);
  const z = side === 2 ? rand(-BOX.z + 0.2, -BOX.z + 1.2) : rand(-BOX.z + 0.3, 0);
  weedData.push({ x, z, y: gh(x, z) - 0.05, h: rand(2.4, 5.2), ph: rand(0, 6.28), l: rand(0.26, 0.4) });
  weeds.setColorAt(k, tmpColor.setRGB(1, 1, 1));
}
weeds.castShadow = true;
tank.add(weeds);

// Yapraklı bitkiler: kılıç bitkisi rozetleri (Echinodorus), kriptokorin, gövdeli bitki demetleri (Rotala); alfa kesimli yaprak kartları
const leafTex = (() => {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const shape = (t) => Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.15 * t); // mızrak biçimli yaprak ayası
  g.beginPath(); g.moveTo(32, 250);
  for (let y = 250; y >= 4; y -= 3) g.lineTo(32 + 29 * shape((250 - y) / 246), y);
  for (let y = 4; y <= 250; y += 3) g.lineTo(32 - 29 * shape((250 - y) / 246), y);
  g.closePath();
  const gr = g.createLinearGradient(0, 256, 0, 0);
  gr.addColorStop(0, '#5f8f2c'); gr.addColorStop(0.55, '#7fb03a'); gr.addColorStop(1, '#9cc04c');
  g.fillStyle = gr; g.fill();
  g.save(); g.clip();
  g.strokeStyle = 'rgba(214,236,150,0.75)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(32, 256); g.lineTo(32, 0); g.stroke();
  g.strokeStyle = 'rgba(40,70,20,0.35)'; g.lineWidth = 1;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(32, 250); g.bezierCurveTo(32 + s * 22, 190, 32 + s * 20, 70, 32, 6); g.stroke(); }
  for (let y = 236; y > 20; y -= 14) { g.beginPath(); g.moveTo(32, y); g.lineTo(4, y - 18); g.moveTo(32, y); g.lineTo(60, y - 18); g.stroke(); }
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
})();
const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0 });
// Tek yaprak: sap + dışa kıvrılan aya (yerel +Y yukarı, +Z dışarı)
function leafCard(L, W, bend, stalk = 0.3) {
  const g = new THREE.PlaneGeometry(W, L, 1, 8).translate(0, L / 2, 0);
  const pa = g.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const t = pa.getY(i) / L, a = bend * t;
    const r = stalk + L * t;
    pa.setXYZ(i, pa.getX(i) * (1 - 0.2 * Math.abs(pa.getX(i)) / W), r * Math.cos(a) * 0.95, r * Math.sin(a) + 0.08 * Math.abs(pa.getX(i)) / W);
  }
  g.computeVertexNormals();
  return g;
}
function rosette(n, L, W, seedBend) {
  const parts = [];
  for (let k = 0; k < n; k++) {
    const l = L * rand(0.65, 1), b = seedBend * rand(0.6, 1.3) * (0.6 + 0.8 * (1 - l / L));
    parts.push(leafCard(l, W * rand(0.8, 1.1), b, 0.25 * l).rotateY((k / n) * Math.PI * 2 + rand(-0.2, 0.2)));
  }
  const stalks = new THREE.CylinderGeometry(0.03, 0.05, 0.4, 5).translate(0, 0.2, 0);
  stalks.deleteAttribute('uv'); stalks.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(stalks.attributes.position.count * 2).fill(0.5), 2));
  parts.push(stalks);
  return BufferGeometryUtils.mergeGeometries(parts);
}
function stemBunch() {
  const parts = [];
  for (let s = 0; s < 7; s++) {
    const bx = rand(-0.35, 0.35), bz = rand(-0.35, 0.35), H = rand(4.2, 6.6), lean = rand(-0.12, 0.12);
    const stem = new THREE.CylinderGeometry(0.025, 0.035, H, 4).translate(0, H / 2, 0);
    stem.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(stem.attributes.position.count * 2).fill(0.5), 2));
    stem.rotateZ(lean).translate(bx, 0, bz); parts.push(stem);
    for (let y = 0.4; y < H; y += 0.22) {
      const sz = 0.35 + 0.25 * Math.sin(Math.min(1, y / H) * Math.PI * 0.8);
      for (const a of [0, Math.PI]) {
        const lf = leafCard(sz, 0.13, 1.3, 0.02).rotateY(a + y * 1.9);
        lf.translate(bx - Math.sin(lean) * y, y, bz); parts.push(lf);
      }
    }
  }
  return BufferGeometryUtils.mergeGeometries(parts);
}
const plantSpots = [];
{
  const add = (geo, spots, cols) => {
    const m = new THREE.InstancedMesh(geo, leafMat, spots.length);
    spots.forEach(([x, z, s], k) => {
      plantSpots.push({ m, k, x, z, y: gh(x, z) - 0.08, s, ph: rand(0, 6.28), ry: rand(0, 6.28) });
      m.setColorAt(k, tmpColor.setHex(cols[k % cols.length]));
    });
    m.castShadow = m.receiveShadow = true;
    tank.add(m);
  };
  add(rosette(14, 2.6, 0.55, 1.0), [[-3.2, -3.1, 1.15], [3.6, -2.6, 1.0], [7.2, -3.4, 1.25], [-7.4, -1.6, 0.9]], [0xffffff, 0xe6f0d0, 0xd8e8c0]);
  add(rosette(9, 1.2, 0.36, 1.3), [[-5.2, 2.9, 1], [-1.4, 3.3, 0.8], [2.4, 3.0, 0.95], [5.6, 2.6, 1.05], [8.6, 1.4, 0.9], [-9.0, 1.2, 1]], [0xb58a5a, 0xc8b070, 0x9fa860]);
  add(stemBunch(), [[-9.4, -4.2, 1], [9.5, -4.3, 1.05], [0.8, -4.5, 0.9]], [0xffffff, 0xf0a878, 0xd7e39a]);
}

// --- Balıklar (+X yönüne bakar). Gövde: yanal basık iğ biçimi, solungaç kapağı, göz. Yüzgeçler ayrı, yarı saydam örnek ağında.
// Gövde biçimi genlerden gelir (syncMeshes): hız geni yüksek → uzun ve ince, düşük → derin gövdeli; boyut geni → büyüklük.
function fishBody(pred) {
  const prof = [];
  for (let i = 0; i <= 20; i++) {
    const u = i / 20;
    const r = u === 1 ? 0 : Math.max(0.08, 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(u, 1.3)), 0.8));
    prof.push(new THREE.Vector2(r, -1 + 2 * u));
  }
  const body = new THREE.LatheGeometry(prof, 18).rotateZ(-Math.PI / 2).scale(1, 1, pred ? 0.5 : 0.42);
  const pa = body.attributes.position;
  for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); pa.setY(i, y * (y > 0 ? 1.04 : 0.9)); }
  body.computeVertexNormals();
  const tag = (g, v) => { g.deleteAttribute('uv'); g.setAttribute('fpart', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(v), 1)); return g; };
  const parts = [tag(body, 0)];
  for (const s of [-1, 1]) {
    parts.push(tag(new THREE.SphereGeometry(0.085, 12, 8).scale(1, 1, 0.5).translate(0.6, 0.1, s * 0.15), 2));
    parts.push(tag(new THREE.SphereGeometry(0.05, 10, 6).translate(0.61, 0.1, s * 0.172), 1));
  }
  const g = BufferGeometryUtils.mergeGeometries(parts);
  if (pred) g.scale(1.3, 1, 1);
  return g;
}
function fishFins(pred) {
  const fin = (pts, base, rays, rx = 0, pivotY = 0, z = 0) => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))));
    g.deleteAttribute('uv');
    if (rx) g.translate(0, -pivotY, 0).rotateX(rx).translate(0, pivotY, z);
    const n = g.attributes.position.count, b = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) b.set([base[0], base[1], rays], i * 3);
    g.setAttribute('fbase', new THREE.BufferAttribute(b, 3));
    return g;
  };
  const parts = [
    fin([[-0.9, 0.08], [-1.62, 0.56], [-1.4, 0.14], [-1.34, 0], [-1.4, -0.14], [-1.62, -0.56], [-0.9, -0.08]], [-0.9, 0], 22),
    pred ? fin([[-0.75, 0.34], [0.35, 0.47], [0.1, 0.7], [-0.6, 0.78], [-0.9, 0.5]], [-0.2, 0.4], 30)
      : fin([[-0.5, 0.36], [0.1, 0.46], [-0.22, 0.86], [-0.62, 0.72], [-0.66, 0.34]], [-0.25, 0.4], 16),
    fin([[-0.1, -0.34], [-0.62, -0.26], [-0.78, -0.58], [-0.3, -0.62]], [-0.4, -0.3], 16),
  ];
  for (const s of [-1, 1]) {
    parts.push(fin([[0.25, -0.3], [0.05, -0.33], [-0.18, -0.62], [0.08, -0.52]], [0.15, -0.32], 10, -s * 0.45, -0.3, 0));
    parts.push(fin([[0.48, -0.06], [0.46, -0.16], [0.12, -0.34], [0.06, -0.16]], [0.47, -0.1], 10, -s * 0.9, -0.1, s * 0.15));
  }
  const g = BufferGeometryUtils.mergeGeometries(parts);
  g.computeVertexNormals();
  if (pred) g.scale(1.3, 1, 1);
  return g;
}
// Gövde/yüzgeç malzemesi: geometri uzayında (örnek konumundan bağımsız) sırt koyuluğu, gümüş karın, yanal çizgi, pullar;
// kuyruk vuruşu vertex shader'da (gövde ve yüzgeç aynı formülle kıvrılır, kopmaz). Tür rengi = örnek rengi (renk geni).
function fishMaterial({ fin = false, pred = false } = {}) {
  const m = new THREE.MeshStandardMaterial(fin
    ? { color: 0xffffff, roughness: 0.45, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }
    : { color: 0xffffff, roughness: 0.32, metalness: 0.04 });
  m.defines = { WAGF: pred ? '6.0' : '10.0', WAGA: pred ? '0.14' : '0.2' };
  if (fin) m.defines.FIN = '';
  if (pred) m.defines.PRED = '';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; varying vec3 vFP; varying vec3 vFA;
        #ifdef FIN
          attribute vec3 fbase; attribute float iFin;
        #else
          attribute float fpart;
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef FIN
          // yüzgeç geni: yüzgeç kökünden dışa ölçek (yavaş/derin gövdeli → geniş yüzgeç, hızlı → küçük, çatallı kuyruk)
          transformed.xy = fbase.xy + (transformed.xy - fbase.xy)*iFin;
        #endif
        vFP = position;
        #ifdef FIN
          vFA = fbase;
        #else
          vFA = vec3(fpart, 0.0, 0.0);
        #endif
        {
          vec3 ip = vec3(0.0);
          #ifdef USE_INSTANCING
            ip = instanceMatrix[3].xyz;
          #endif
          float ph = uTime*WAGF + dot(ip, vec3(1.7, 0.9, 2.3));
          float bx = clamp((0.15 - position.x)/1.7, 0.0, 1.0);
          transformed.z += sin(ph - position.x*2.2)*WAGA*bx*bx;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFP; varying vec3 vFA;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 q = vFP; vec3 base = diffuseColor.rgb;
          #ifdef FIN
            float d = length(q.xy - vFA.xy);
            float ang = atan(q.y - vFA.y, q.x - vFA.x);
            float ray = pow(0.5 + 0.5*cos(ang*vFA.z), 4.0);
            diffuseColor.rgb = mix(base*1.05 + 0.05, base*0.55, ray*0.55);
            diffuseColor.a *= clamp(0.78 - 0.42*smoothstep(0.05, 0.75, d) + 0.22*ray, 0.2, 1.0);
          #else
            #ifdef PRED
              float xs = q.x/1.3;
            #else
              float xs = q.x;
            #endif
            vec3 c = base;
            float dors = smoothstep(-0.02, 0.4, q.y + 0.05*xs);
            float bel = smoothstep(-0.05, -0.36, q.y);
            // sırt: koyu zeytin tonu, karın: gümüş-beyaz; renk geni yan yüzde en canlı (tetra/barbus benzeri)
            c = mix(c, c*0.35 + vec3(0.03, 0.035, 0.02), dors*0.75);
            c = mix(c, vec3(0.86, 0.87, 0.84), bel*0.6);
            float lat = exp(-pow((q.y - 0.03 + 0.05*xs)/0.035, 2.0))*smoothstep(0.7, 0.25, xs)*smoothstep(-1.0, -0.6, xs);
            c = mix(c, min(base*1.5 + 0.12, vec3(1.0)), lat*0.7);
            // pullar: sıra sıra kayan yarım daireler, arka kenarı koyu, ortası parlak
            vec2 sp = vec2(xs*17.0, q.y*19.0);
            sp.y += 0.5*mod(floor(sp.x), 2.0);
            vec2 cl = fract(sp) - vec2(0.35, 0.5);
            float rd = length(cl*vec2(1.0, 1.15));
            float rim = smoothstep(0.33, 0.5, rd)*step(cl.x, 0.2);
            float scl = step(xs, 0.52)*step(-0.95, xs);
            c *= 1.0 - scl*(0.2*rim - 0.08*(1.0 - smoothstep(0.0, 0.3, rd)));
            // kuyruk sapında koyu leke, solungaç kapağı
            c *= 1.0 - 0.35*smoothstep(0.1, 0.0, length(vec2((xs + 0.86)*1.4, q.y*1.6)) - 0.12);
            float gill = 1.0 - smoothstep(0.0, 0.035, abs(length(vec2(xs, q.y) - vec2(0.92, -0.04)) - 0.46));
            c *= 1.0 - 0.35*gill*step(0.3, xs);
            #ifdef PRED
              c *= 1.0 - 0.5*smoothstep(0.45, 0.9, sin(xs*14.0 + 1.0))*step(xs, 0.45)*smoothstep(-0.35, 0.05, q.y);
              c = mix(c, vec3(0.05), smoothstep(0.02, 0.0, abs(q.y + 0.1 - 0.12*(xs - 1.0)))*step(0.8, xs));
            #endif
            if (vFA.x > 1.5) c = vec3(0.8, 0.62, 0.28);
            else if (vFA.x > 0.5) c = vec3(0.01);
            diffuseColor.rgb = c;
          #endif
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        #ifndef FIN
          roughnessFactor = mix(0.36, 0.2, smoothstep(0.0, -0.3, vFP.y));
          if (vFA.x > 0.5) roughnessFactor = 0.06;
        #endif`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        #ifndef FIN
          // pulların guanin parıltısı: yan ve karında gümüşi yansıma
          metalnessFactor = vFA.x > 0.5 ? 0.0 : mix(0.12, 0.5, smoothstep(0.15, -0.3, vFP.y));
        #endif`);
  };
  m.customProgramCacheKey = () => 'ea-fish-' + (fin ? 'f' : 'b') + (pred ? 'p' : '');
  return m;
}

const preyMesh = instanced(fishBody(false), fishMaterial(), MAXP);
preyMesh.count = 0;
preyMesh.frustumCulled = false;
preyMesh.castShadow = true;
for (let i = 0; i < MAXP; i++) preyMesh.setColorAt(i, tmpColor.setRGB(1, 1, 1));
tank.add(preyMesh);
const preyFinGeo = fishFins(false), preyFinGene = new THREE.InstancedBufferAttribute(new Float32Array(MAXP).fill(1), 1);
preyFinGeo.setAttribute('iFin', preyFinGene);
const preyFins = new THREE.InstancedMesh(preyFinGeo, fishMaterial({ fin: true }), MAXP);
preyFins.instanceMatrix = preyMesh.instanceMatrix; preyFins.instanceColor = preyMesh.instanceColor;
preyFins.count = 0; preyFins.frustumCulled = false; preyFins.renderOrder = 3; preyFins.userData.noAO = true;
tank.add(preyFins);

const predMesh = instanced(fishBody(true), fishMaterial({ pred: true }), MAXH);
predMesh.frustumCulled = false;
predMesh.castShadow = true;
for (let i = 0; i < MAXH; i++) predMesh.setColorAt(i, tmpColor.setHex(0x3f4a5a));
tank.add(predMesh);
const predFinGeo = fishFins(true);
predFinGeo.setAttribute('iFin', new THREE.InstancedBufferAttribute(new Float32Array(MAXH).fill(1), 1));
const predFins = new THREE.InstancedMesh(predFinGeo, fishMaterial({ fin: true, pred: true }), MAXH);
predFins.instanceMatrix = predMesh.instanceMatrix; predFins.instanceColor = predMesh.instanceColor;
predFins.frustumCulled = false; predFins.renderOrder = 3; predFins.userData.noAO = true;
tank.add(predFins);
const predLabels = [];
const predAnchors = [];
for (let i = 0; i < MAXH; i++) {
  const a = new THREE.Object3D();
  tank.add(a);
  predAnchors.push(a);
  const l = sim.label('avcı', { parent: a, position: [0, 0.9, 0], className: 'plain' });
  l.el.style.fontSize = '11px';
  l.el.style.color = '#fca5a5';
  predLabels.push(l);
}

const foodMesh = instanced(new THREE.IcosahedronGeometry(0.07, 1), mat.plastic({ color: 0xc9782a, gloss: 0.25 }), MAXF);
foodMesh.count = 0;
foodMesh.frustumCulled = false;
tank.add(foodMesh);

// Kabarcıklar (yumuşak yuvarlak sprite; boyut metre cinsinden)
// iki kaynak: sağda hava taşı, solda filtre çıkışının venturi kabarcıkları (yüzeye yakın başlar)
const BUB = 130;
const bubPos = new Float32Array(BUB * 3), bubBase = [];
for (let k = 0; k < BUB; k++) {
  const f = k % 3 === 0;
  const b = f ? [-BOX.x + 0.9 + rand(-0.15, 0.15), 0, -BOX.z + 0.5 + rand(-0.1, 0.1), 5.6] : [BOX.x - 1.2 + rand(-0.15, 0.15), 0, -BOX.z + 1 + rand(-0.15, 0.15), 0.3];
  bubBase.push(b);
  bubPos.set([b[0], rand(b[3], BOX.y1), b[2]], k * 3);
}
const bubGeo = new THREE.BufferGeometry();
bubGeo.setAttribute('position', new THREE.BufferAttribute(bubPos, 3));
const bubbles = new THREE.Points(bubGeo, new THREE.PointsMaterial({ map: softDot, color: 0xe6fbff, size: 0.02, transparent: true, depthWrite: false, opacity: 0.9 }));
bubbles.frustumCulled = false;
bubbles.renderOrder = 6;
tank.add(bubbles);

// --- Renkler ---
const hueToColor = (h, out) => out.setHSL(h, 0.66, 0.47);
function applyFloor() {
  const h = w.params.floorHue;
  floorColor.setHSL(h, 0.55, 0.5);
  floorMat.color.copy(floorColor);
  backMat.color.setHSL(h, 0.35, 0.24);
  for (let k = 0; k < WEEDS; k++) weeds.setColorAt(k, tmpColor.setHSL((h + 0.02 * (k % 3)) % 1, 0.5, weedData[k].l));
  weeds.instanceColor.needsUpdate = true;
  floorChip.style.background = '#' + floorColor.getHexString();
}

// --- Çizim ---
const dummy = new THREE.Object3D();
dummy.rotation.order = 'YZX';
let wiggle = 0;
function syncMeshes() {
  const P = w.P;
  const n = P.n;
  preyMesh.count = preyFins.count = n;
  for (let i = 0; i < n; i++) {
    const vx = P.vx[i], vy = P.vy[i], vz = P.vz[i];
    const hs = Math.hypot(vx, vz) + 1e-5;
    dummy.position.set(P.px[i], P.py[i], P.pz[i]);
    dummy.rotation.set(0, Math.atan2(-vz, vx) + Math.sin(wiggle * 3 + i) * 0.06, Math.atan2(vy, hs) * 0.8);
    const s = 0.5 * P.size[i] * Math.min(1, 0.55 + P.age[i] / 14);
    const sp = Math.min(1, Math.max(0, (P.spd[i] - 0.8) / 3.6)); // hız geni → gövde oranı (hızlı: uzun ve ince)
    dummy.scale.set(s * (0.85 + 0.35 * sp), s * (1.18 - 0.4 * sp), s * (1.05 - 0.15 * sp));
    preyFinGene.array[i] = 1.5 - 0.7 * sp;                         // yavaş/derin gövdeli: geniş yüzgeç; hızlı: küçük yüzgeç
    dummy.updateMatrix();
    preyMesh.setMatrixAt(i, dummy.matrix);
    preyMesh.setColorAt(i, hueToColor(P.hue[i], tmpColor));
  }
  preyMesh.instanceMatrix.needsUpdate = true;
  preyFinGene.needsUpdate = true;
  if (preyMesh.instanceColor) preyMesh.instanceColor.needsUpdate = true;

  const H = w.H;
  for (let k = 0; k < MAXH; k++) {
    const q = H[k];
    if (!q.active) {
      dummy.scale.set(0, 0, 0);
      predLabels[k].visible = false;
    } else {
      dummy.position.set(q.x, q.y, q.z);
      dummy.rotation.set(0, Math.atan2(-q.vz, q.vx) + Math.sin(wiggle * 2 + k) * 0.05, Math.atan2(q.vy, Math.hypot(q.vx, q.vz) + 1e-5) * 0.7);
      dummy.scale.set(0.95, 0.95, 0.95);
      predAnchors[k].position.set(q.x, q.y, q.z);
      predLabels[k].visible = showLabels.value;
      predMesh.setColorAt(k, tmpColor.setHex(q.state === 1 ? 0x7f1d1d : 0x3f4a5a));
    }
    dummy.updateMatrix();
    predMesh.setMatrixAt(k, dummy.matrix);
  }
  predMesh.instanceMatrix.needsUpdate = true;
  predMesh.instanceColor.needsUpdate = true;

  const F = w.F;
  foodMesh.count = F.n;
  dummy.rotation.set(0, 0, 0);
  dummy.scale.set(1, 1, 1);
  for (let i = 0; i < F.n; i++) {
    dummy.position.set(F.x[i], Math.max(F.y[i], gh(F.x[i], F.z[i]) + 0.06), F.z[i]);
    dummy.updateMatrix();
    foodMesh.setMatrixAt(i, dummy.matrix);
  }
  foodMesh.instanceMatrix.needsUpdate = true;
}

// --- Arayüz ---
const ui = sim.ui;
ui.section('Akvaryum');
const predators = ui.slider({ label: 'Avcı sayısı', min: 0, max: 10, step: 1, value: 5,
  onChange: (v) => { w.params.predators = v; w.syncPredators(); } });
const mutation = ui.slider({ label: 'Mutasyon oranı', min: 0, max: 0.15, step: 0.01, value: 0.05,
  format: (v) => (v === 0 ? 'yok' : `${fmt(v * 100, 0)} · ${v < 0.03 ? 'düşük' : v < 0.08 ? 'orta' : 'yüksek'}`),
  onChange: (v) => { w.params.mutation = v; } });
const food = ui.slider({ label: 'Yem miktarı', min: 2, max: 30, step: 1, value: 12, unit: 'tane/sn',
  onChange: (v) => { w.params.food = v; } });

const HUE_NAMES = [[0.04, 'kırmızı'], [0.1, 'turuncu'], [0.18, 'sarı'], [0.26, 'fıstık yeşili'], [0.45, 'yeşil'],
  [0.54, 'turkuaz'], [0.7, 'mavi'], [0.8, 'mor'], [0.93, 'pembe'], [1.01, 'kırmızı']];
const hueName = (h) => HUE_NAMES.find(([lim]) => h < lim)[1];
let floorToastTimer = 0;
const floorHue = ui.slider({ label: 'Zemin rengi', min: 0, max: 0.99, step: 0.01, value: 0.13,
  format: (v) => `${fmt(v * 360, 0)}° · ${hueName(v)}`,
  onInput: (v) => { w.params.floorHue = v; applyFloor(); floorPreset.set(null); },
  onChange: () => {
    clearTimeout(floorToastTimer);
    floorToastTimer = setTimeout(() => sim.toast('Zemin değişti: şimdi hangi balıklar göze batıyor?', 'warn'), 250);
  } });
const floorChip = ui.text('<span></span>').el;
floorChip.style.cssText = 'height:10px;border-radius:5px;margin:-4px 0 8px;';
const floorPreset = ui.segmented({
  options: [{ value: 0.13, label: 'Sarı kum' }, { value: 0.33, label: 'Yeşil yosun' }, { value: 0.6, label: 'Mavi taş' }, { value: 0.97, label: 'Mercan' }],
  value: 0.13,
  onChange: (v) => { floorHue.set(v, true); floorPreset.set(v); sim.toast('Zemin değişti: şimdi hangi balıklar göze batıyor?', 'warn'); },
});
ui.buttons([
  { label: '🍤 Yem serp', onClick: () => w.sprinkle(40) },
  { label: '🐟 Göçmen balıklar', title: 'Rastgele renkli 20 yeni balık ekler', onClick: () => immigrants(20) },
]);

ui.section('Durum');
const stGen = ui.stat({ label: 'Ortalama nesil' });
const stPop = ui.stat({ label: 'Av balığı' });
const stMatch = ui.stat({ label: 'Zeminle renk uyumu' });
const stEaten = ui.stat({ label: 'Avlanan / açlık' });
const stSpeed = ui.stat({ label: 'Ortalama hız' });
const stSize = ui.stat({ label: 'Ortalama boyut' });

// Renk histogramı
const histWrap = ui.text('<div class="chart-title">Renk tonu dağılımı (▼ zemin rengi)</div>');
const hist = document.createElement('canvas');
hist.style.cssText = 'width:100%;height:64px;display:block;border-radius:6px;background:rgba(148,163,184,.08)';
histWrap.el.append(hist);
const hctx = hist.getContext('2d');
const BINS = 36;
const bins = new Float32Array(BINS);
function drawHist() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = hist.clientWidth || 280, Hh = 64;
  if (hist.width !== Math.round(W * dpr)) { hist.width = Math.round(W * dpr); hist.height = Hh * dpr; }
  hctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hctx.clearRect(0, 0, W, Hh);
  bins.fill(0);
  const P = w.P;
  for (let i = 0; i < P.n; i++) bins[Math.min(BINS - 1, Math.floor(P.hue[i] * BINS))]++;
  let mx = 1;
  for (let b = 0; b < BINS; b++) mx = Math.max(mx, bins[b]);
  const bw = W / BINS;
  for (let b = 0; b < BINS; b++) {
    const hgt = (bins[b] / mx) * (Hh - 16);
    hctx.fillStyle = `hsl(${((b + 0.5) / BINS) * 360},72%,52%)`;
    hctx.fillRect(b * bw + 0.5, Hh - 6 - hgt, bw - 1, hgt);
    hctx.fillRect(b * bw + 0.5, Hh - 4, bw - 1, 4);
  }
  const fx = w.params.floorHue * W;
  hctx.fillStyle = '#fff';
  hctx.beginPath(); hctx.moveTo(fx - 5, 0); hctx.lineTo(fx + 5, 0); hctx.lineTo(fx, 8); hctx.closePath(); hctx.fill();
}

const colorChart = ui.chart({ title: 'Zeminle renk farkı (nesiller boyunca, °)', yMin: 0, yMax: 180, maxPoints: 160,
  series: [{ name: 'Ortalama renk farkı', color: '#f472b6', fill: true }, { name: 'Renk çeşitliliği', color: '#a78bfa' }] });
const geneChart = ui.chart({ title: 'Ortalama hız ve boyut', yMin: 0, maxPoints: 160,
  series: [{ name: 'Av hızı', color: '#38bdf8' }, { name: 'Boyut', color: '#facc15' }, { name: 'Avcı hızı', color: '#94a3b8' }] });
const popChart = ui.chart({ title: 'Popülasyon', yMin: 0, maxPoints: 160,
  series: [{ name: 'Av balığı', color: '#22c55e' }, { name: 'Avcı × 10', color: '#ef4444' }] });

ui.section('Görünüm', { open: false });
const showLabels = ui.toggle({ label: 'Avcı etiketleri', value: true });
ui.buttons([
  { label: '🎥 Genel', onClick: () => sim.moveCamera([0.2, 1.16, 1.58], [0, 1.1, 0]) },
  { label: '🔍 Balıklar', onClick: () => sim.moveCamera([0.12, 1.06, 0.78], [0.02, 1.04, 0]) },
  { label: '↙️ Yandan', onClick: () => sim.moveCamera([-1.25, 1.12, 1.05], [0, 1.05, 0]) },
]);
ui.toggle({ label: 'Kabarcıklar', value: true, onChange: (v) => (bubbles.visible = v) });
ui.text('İpucu: bir balığa tıkla, genlerini gör.', 'card');

function immigrants(n) {
  for (let k = 0; k < n; k++) {
    if (w.P.n >= MAXP) break;
    const P = w.P, i = P.n++;
    // model.addPrey dışarı açık değil; aynı alanları doldur
    P.px[i] = rand(-BOX.x, BOX.x); P.py[i] = rand(BOX.y0, 5); P.pz[i] = rand(-BOX.z, BOX.z);
    P.vx[i] = rand(-0.5, 0.5); P.vy[i] = 0; P.vz[i] = rand(-0.5, 0.5);
    P.hue[i] = Math.random(); P.spd[i] = rand(1.6, 2.8); P.size[i] = rand(0.85, 1.15);
    P.energy[i] = 2; P.age[i] = 8; P.maxAge[i] = rand(80, 110);
    let g = 0; for (let j = 0; j < i; j++) g += P.gen[j];
    P.gen[i] = i ? Math.round(g / i) : 1; P.id[i] = w.nextId++; P.flee[i] = 0;
    P.tFood[i] = -1; P.tFoodId[i] = -1; P.retarget[i] = 0;
  }
  sim.toast(`🐟 ${n} göçmen balık geldi: renkleri rastgele`, 'good');
}

// --- Döngü ---
let lastHalfGen = -1, extinctShown = false;
function pushCharts(s) {
  colorChart.push([s.diffDeg, s.hueSpread * 180]);
  geneChart.push([s.speed, s.size, s.predSpeed]);
  popChart.push([s.n, s.preds * 10]);
}

sim.onUpdate((dt) => {
  w.step(Math.min(dt * TIME, 1.6));
  wiggle += dt;
  w.summary(_sum);
  const hg = Math.floor(_sum.gen * 2);
  if (_sum.n && hg !== lastHalfGen) { lastHalfGen = hg; pushCharts(_sum); }
  if (!w.P.n && !extinctShown) {
    extinctShown = true;
    sim.hud.show(`<h2>Av balıkları tükendi</h2><p>Avcılar tüm balıkları yedi ya da yem yetmedi. Daha az avcı ya da daha çok yemle dene.</p>
      <button class="btn primary" data-act="restart">⟲ Yeniden başlat</button>`, { tone: 'bad' });
    sim.hud.el.querySelector('[data-act=restart]').onclick = () => sim.reset();
  }
});

let statAcc = 1;
sim.onRender((rdt) => {
  syncMeshes();
  // yosun salınımı ve kabarcıklar (gerçek zamanla)
  const t = performance.now() / 1000;
  for (let k = 0; k < WEEDS; k++) {
    const d = weedData[k];
    dummy.position.set(d.x, d.y, d.z);
    dummy.rotation.set(Math.sin(t * 0.9 + d.ph) * 0.12, 0, Math.sin(t * 0.7 + d.ph) * 0.1);
    dummy.scale.set(1, d.h, 1);
    dummy.updateMatrix();
    weeds.setMatrixAt(k, dummy.matrix);
  }
  weeds.instanceMatrix.needsUpdate = true;
  for (const q of plantSpots) {
    dummy.position.set(q.x, q.y, q.z);
    dummy.rotation.set(Math.sin(t * 0.8 + q.ph) * 0.05, q.ry, Math.sin(t * 0.6 + q.ph) * 0.05);
    dummy.scale.setScalar(q.s);
    dummy.updateMatrix();
    q.m.setMatrixAt(q.k, dummy.matrix);
    q.m.instanceMatrix.needsUpdate = true;
  }
  U.uTime.value = t;
  for (const r of rays) r.material.opacity = 0.07 + 0.045 * Math.sin(t * 0.45 + r.userData.ph);
  if (bubbles.visible) {
    for (let k = 0; k < BUB; k++) {
      const b = bubBase[k];
      let y = bubPos[k * 3 + 1] + rdt * (1.3 + (k % 5) * 0.25);
      if (y > BOX.y1 + 0.3) y = b[3];
      bubPos[k * 3] = b[0] + Math.sin(y * 2.3 + k) * 0.06 * y; bubPos[k * 3 + 1] = y; bubPos[k * 3 + 2] = b[2] + Math.cos(y * 1.9 + k) * 0.04 * y;
    }
    bubGeo.attributes.position.needsUpdate = true;
  }
  statAcc += rdt;
  if (statAcc < 0.5) return;
  statAcc = 0;
  const s = w.summary(_sum);
  stGen.set(s.n ? fmt(s.gen, 1) : '—');
  stPop.set(s.n, s.n < 30 ? 'bad' : s.n < 70 ? 'warn' : '');
  const match = s.n ? Math.round(100 - s.diffDeg / 1.8) : 0;
  stMatch.set(s.n ? `%${match}` : '—', match > 80 ? 'good' : match < 55 ? 'bad' : 'warn');
  stEaten.set(`${fmt(w.stats.eaten)} / ${fmt(w.stats.starved)}`);
  stSpeed.set(s.n ? fmt(s.speed, 2) : '—');
  stSize.set(s.n ? fmt(s.size, 2) : '—');
  drawHist();
});

sim.formatTime = () => `${Math.max(1, Math.round(_sum.gen || 1))}. nesil`;

// Balığa tıkla → genleri
sim.onClick(() => { preyMesh.computeBoundingSphere(); return [preyMesh]; }, (hit) => {
  const i = hit.instanceId;
  const P = w.P;
  if (i == null || i >= P.n) return;
  const c = hueDiff(P.hue[i], w.params.floorHue);
  sim.toast(`🐟 <b>${P.gen[i]}. nesil</b> · renk ${fmt(P.hue[i] * 360, 0)}° (${hueName(P.hue[i])}) · hız ${fmt(P.spd[i], 2)} · boyut ${fmt(P.size[i], 2)}<br>` +
    `Zeminle renk farkı: ${fmt(c * 180, 0)}° → ${c < 0.15 ? 'iyi kamufle' : c < 0.4 ? 'biraz göze batıyor' : 'çok göze batıyor'}`);
});

sim.onReset(() => {
  w.reset(INITIAL);
  colorChart.clear(); geneChart.clear(); popChart.clear();
  lastHalfGen = -1; extinctShown = false;
  sim.hud.hide();
  w.summary(_sum);
});

applyFloor();
if (new URLSearchParams(location.search).get('view') === 'yakin') sim.moveCamera([0.12, 1.06, 0.78], [0.02, 1.04, 0]);
w.params.predators = predators.value;
w.params.mutation = mutation.value;
w.params.food = food.value;
sim.reset();
