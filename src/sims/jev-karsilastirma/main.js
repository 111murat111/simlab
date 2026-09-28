// Jev ve LLM'ler — karar yarışı: aynı sınıflandırma işini yapan modellerin gecikme ve maliyet karşılaştırması (liste fiyatları).
import { createSim, THREE, clamp, gauss, fmt, instanced, mat, procedural } from '@core';
import { buildHall, conveyor, scanGate, silo, coinGeometry, toteGeometry } from './hall.js';

// $/1M token (girdi, çıktı). Jev çıktısı ücretsiz.
const MODELS = [
  { id: 'jev', name: 'Jev 1.13', maker: 'TypeSafe', pin: 0.042, pout: 0, color: '#22d3ee', jev: true },
  { id: 'haiku', name: 'Claude Haiku 4.5', maker: 'Anthropic', pin: 1, pout: 5, color: '#fde047' },
  { id: 'sonnet', name: 'Claude Sonnet 5', maker: 'Anthropic', pin: 2, pout: 10, color: '#fdba74' },
  { id: 'terra', name: 'GPT-5.6 Terra', maker: 'OpenAI', pin: 2, pout: 12, color: '#86efac' },
  { id: 'opus', name: 'Claude Opus 5.5', maker: 'Anthropic', pin: 4, pout: 20, color: '#fb923c' },
  { id: 'astra', name: 'GPT-6 Astra', maker: 'OpenAI', pin: 10, pout: 50, color: '#10b981' },
  { id: 'fable', name: 'Claude Fable 5.1', maker: 'Anthropic', pin: 10, pout: 50, color: '#f87171' },
];
const SCENARIOS = {
  destek: { label: 'Destek talebini doğru ekibe yönlendir', tin: 600, tout: 150, perDay: 4 },
  yorum: { label: 'Ürün yorumunu 1–5 arası puanla', tin: 400, tout: 100, perDay: 5 },
  belge: { label: 'Uzun sözleşmeye 13 soru (tek istek)', tin: 11800, tout: 500, perDay: 3 },
};
const LATENCY = {
  tek: { label: 'Tek karar ölçümü (LLM ≈ 8,6 sn)', llm: 8.566 },
  hizli: { label: 'En iyi durum (LLM ≈ 3 sn)', llm: 3 },
  uzun: { label: 'Akıl yürütmeli uzun iş (LLM ≈ 60 sn)', llm: 60 },
};
const X0 = -8.5, X1 = 8.5, TOWER_X = 11, LANE_W = 2.1;
const MAX_SLOTS = 8, MAX_COINS = 70, COIN_H = 0.11;

const sim = createSim({
  sky: { elevation: 58, azimuth: 168, clouds: 0.25, haze: 1, visibility: 20000 },
  camera: { position: [-1.5, 8.6, 17.5], target: [1.6, 0.6, 0.6], fov: 50, near: 0.05, far: 5000 },
  controls: { maxPolarAngle: Math.PI / 2.1, minDistance: 4, maxDistance: 19.5 },
  look: { aoRadius: 0.6, exposure: 1.05 },
  info: `
    <h3>Ne görüyorsun?</h3>
    <p>Yedi şerit, aynı işi yapan yedi modeldir: bir metni okuyup <b>tek bir karar</b> vermek (ör. "bu talep hangi ekibe
    gitmeli?"). Sahne bir ayrıştırma salonu: her <b>konveyör bant</b> bir model, bant üzerindeki her renkli <b>kasa</b> bir istektir; bandı geçme süresi modelin yanıt süresidir. Bantların sonundaki cam silolardaki jeton kuleleri,
    seçtiğin günlük hacimde <b>aylık faturayı</b> gösterir (logaritmik: her ~8 jeton 10 kat daha pahalı).</p>
    <p><b>Jev</b> (TypeSafe'in "System One" modeli) metin üretmez; yalnızca <b>seçim</b> (choice), <b>puan</b> (score) ya da
    <b>evet olasılığı</b> (noul) döndürür. Bu yüzden çıktı ücreti yoktur ve çok hızlıdır. Genel amaçlı LLM'ler ise aynı kararı
    metin üreterek verir: çıktı token'ı öder, daha uzun sürer — ama yazabilir, açıklayabilir, akıl yürütebilir.</p>
    <h3>Dene</h3>
    <ul>
      <li>"Uzun sözleşme" senaryosuna geç: girdi büyüyünce Jev'in avantajı (yalnız girdi ücreti) nasıl değişiyor?</li>
      <li>LLM çıktısını 20 token'a indir (yalnızca etiket yazsın): fark küçülür ama kapanmaz.</li>
      <li>Günlük hacmi 10 milyona çıkar ve aylık faturaları karşılaştır.</li>
    </ul>
    <h3>Veriler ve kaynaklar (Eylül 2026)</h3>
    <ul>
      <li><b>Jev fiyatı:</b> 1M girdi token'ı $0,042, çıktı ücretsiz; istek başına en çok 64 bin token —
        <a href="https://docs.typesafe.ai/models" target="_blank" rel="noopener">docs.typesafe.ai/models</a>.</li>
      <li><b>LLM fiyatları</b> (1M token girdi/çıktı): Haiku 4.5 $1/$5, Sonnet 5 $2/$10, Opus 5.5 $4/$20, Fable 5.1 $10/$50
        (Anthropic liste fiyatı); GPT-5.6 Terra $2/$12, GPT-6 Astra $10/$50 (OpenAI liste fiyatı, ikincil kaynaklardan).</li>
      <li><b>Gecikme — üretici beyanı:</b> tek kararda Jev 0,114 sn, LLM 8,566 sn; iş akışı testlerinde LLM uçtan uca 3–329 sn,
        Jev 70–500 ms —
        <a href="https://typesafe.ai/blog/introducing-system-one-models-and-jev" target="_blank" rel="noopener">TypeSafe blogu</a>,
        <a href="https://www.eesel.ai/blog/jev-ultrafast" target="_blank" rel="noopener">eesel.ai özeti</a>.</li>
      <li><b>Toplu soru — üretici örneği:</b> 54 bin karakterlik belgeye 13 soru tek istekte $0,000497 / 0,27 sn; ayrı ayrı
        13 istekte $0,006090 / 2,71 sn —
        <a href="https://docs.typesafe.ai/cookbooks/parallel_questions" target="_blank" rel="noopener">TypeSafe cookbook</a>.</li>
      <li>TypeSafe'in kendi testinde Jev, GPT-6 Astra ve Fable 5.1 ortalamasına göre <b>193,6× hızlı, 444,6× ucuz</b> bulunmuş
        (üretici, bunun gerçek kullanımdaki kazançların üst ucu olduğunu belirtiyor).</li>
    </ul>
    <h3>Sınırlar — dürüst karşılaştırma</h3>
    <ul>
      <li>Maliyet satırları gerçek liste fiyatlarıyla <b>hesaplanır</b>; gecikme değerleri <b>üreticinin</b> ölçümüdür, bağımsız
        değildir. LLM'lere tek bir ortak gecikme verilir: model başına karşılaştırılabilir bağımsız ölçüm bulamadık
        (küçük modeller genelde daha hızlıdır). Küplerin süre dağılımı temsilidir.</li>
      <li><b>Doğruluk gösterilmiyor:</b> Jev ile LLM'lerin karar doğruluğunu karşılaştıran bağımsız, doğrulanabilir bir
        ölçüm bulamadık. Hızlı ve ucuz olmak doğru olmak demek değildir; kendi etiketli verinle ölç.</li>
      <li>Önbellek (prompt caching), toplu API (batch) indirimleri ve akıl yürütme token'ları hesaba katılmadı; bunlar
        LLM faturasını ciddi değiştirebilir.</li>
    </ul>`,
});
sim.formatTime = (t) => `${fmt(t, 1)} sn`;

// --- Sahne: ayrıştırma salonu, konveyör bantlar, tarayıcı kapıları, cam jeton siloları ---
const TOP = 0.85; // bant üst yüzeyi (m)
buildHall(sim.scene);
// Çatı altındaki salon, açık gökyüzünün ortam ışığını tam almaz: iç yüzeylerde ortam yansımasını kıs (tepe lambaları ve
// ışıklıklardan gelen doğrudan ışık baskın olsun)
sim.scene.traverse((o) => { for (const m of [].concat(o.material || [])) if (m.isMeshStandardMaterial && !m.userData.envCut) { m.envMapIntensity = (m.envMapIntensity ?? 1) * 0.5; m.userData.envCut = true; } });
const lanes = MODELS.map((m, i) => {
  const z = (i - (MODELS.length - 1) / 2) * LANE_W;
  const col = new THREE.Color(m.color);
  sim.scene.add(conveyor(X0, X1 + 0.6, z, TOP, LANE_W * 0.62, m.color));
  const gate = scanGate(X1 + 0.3, z, TOP, LANE_W * 0.62, m.color);
  sim.scene.add(gate.group);
  const finish = { material: gate.light };
  sim.scene.add(silo(TOWER_X, z, 0.62, MAX_COINS * COIN_H + 0.6));
  // zemin: bantlar arası sarı yürüme yolu çizgisi
  const line = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 4, 0.1).rotateX(-Math.PI / 2), mat.plastic({ color: 0xd8b21c }));
  line.position.set((X0 + X1) / 2, 0.004, z + LANE_W / 2); line.receiveShadow = true; line.userData.noFit = true;
  sim.scene.add(line);
  const name = sim.label('', { position: [X0 - 2.4, 1.6, z], className: 'lane-lbl' });
  name.el.style.borderColor = m.color;
  const cost = sim.label('', { position: [TOWER_X + 1.4, 0.4, z] });
  return { m, z, col, finish, name, cost, flash: 0, slots: [], done: 0, spent: 0, costPer: 0, monthly: 0, coins: 0, coinsShown: 0 };
});

// İstek kasaları ve jetonlar (tek InstancedMesh'ler)
// Plastik sevkiyat kasası: dikey nervürler, üst dudak, kısa yüzlerde kulp oyuğu, uzun yüzde barkod etiketi; üstten iç hacim
const toteMat = procedural({
  key: 'jev-tote', bump: 0.003, params: { color: 0xffffff, roughness: 0.5 },
  pattern: `
    vec3 a = axisDominant(pn);
    float side = 1.0 - a.y;
    float u = a.x > 0.5 ? p.z : p.x;
    float rib = smoothstep(0.3, 0.45, abs(fract(u/0.045) - 0.5))*side*step(0.03, p.y)*step(p.y, 0.29);
    float lip = smoothstep(0.29, 0.3, p.y)*side;
    float handle = step(0.5, a.z)*step(0.235, p.y)*step(p.y, 0.285)*step(abs(p.x), 0.075);
    float lab = step(0.5, a.x)*step(0.1, p.y)*step(p.y, 0.2)*step(abs(p.z), 0.085);
    float bars = step(0.5, fract(p.z*260.0 + sin(floor(p.z*130.0)*7.1)*0.4))*step(0.115, p.y)*step(p.y, 0.16)*step(abs(p.z), 0.07);
    float top = step(0.5, a.y)*step(0.3, p.y);
    float inner = top*step(abs(p.x), 0.175)*step(abs(p.z), 0.195);
    col *= 0.9 + 0.1*rib - 0.08*lip;
    col = mix(col, col*0.28, inner);
    col = mix(col, vec3(0.03), handle);
    col = mix(col, mix(vec3(0.86), vec3(0.05), bars), lab);
    rough = mix(0.45 + 0.1*rib, 0.75, lab + handle);
    h = rib*0.5 + lip - handle - inner*0.5;`,
});
const cubes = instanced(toteGeometry(0.42), toteMat, MODELS.length * MAX_SLOTS);
const coinMat = procedural({
  key: 'jev-coin', bump: 0.04, params: { color: 0xd9a93a, roughness: 0.28, metalness: 1 },
  pattern: `
    float r = length(p.xz);
    float n = fbm3(p*6.0 + seed*13.0, 3);
    float ridge = step(0.53, r)*(0.5 + 0.5*sin(atan(p.z, p.x)*140.0));
    float ring = smoothstep(0.38, 0.4, r)*(1.0 - smoothstep(0.42, 0.44, r));
    col *= 0.85 + 0.25*n - 0.1*seed;
    rough = 0.22 + 0.2*n;
    h = ridge*0.6 + ring*0.8 + n*0.2;`,
});
const coins = instanced(coinGeometry(0.55, COIN_H * 0.8), coinMat, MODELS.length * MAX_COINS);
cubes.castShadow = coins.castShadow = true;
sim.scene.add(cubes, coins);
lanes.forEach((ln, i) => { for (let k = 0; k < MAX_SLOTS; k++) cubes.setColorAt(i * MAX_SLOTS + k, ln.col.clone().multiplyScalar(0.85)); });
const tmp = new THREE.Object3D();

// --- Parametreler ---
const p = { scen: 'destek', tin: 600, tout: 150, perDay: 4, lat: 'tek', jevLat: 0.114, conc: 4, cmp: 'sonnet' };
const ui = sim.ui;

ui.section('Senaryo');
ui.select({
  label: 'Görev', value: p.scen,
  options: [...Object.entries(SCENARIOS).map(([value, s]) => ({ value, label: s.label })), { value: 'ozel', label: 'Özel (kaydırıcılarla)' }],
  onChange: (v) => {
    p.scen = v;
    const s = SCENARIOS[v];
    if (!s) return;
    slIn.set(s.tin); slOut.set(s.tout); slDay.set(s.perDay);
    Object.assign(p, { tin: s.tin, tout: s.tout, perDay: s.perDay });
    recompute(); sim.reset();
  },
});
const slIn = ui.slider({ label: 'Girdi (metin + soru)', min: 100, max: 32000, step: 100, value: p.tin, unit: ' token', format: (v) => fmt(v), onInput: (v) => { p.tin = v; recompute(); } });
const slOut = ui.slider({ label: 'LLM çıktısı', min: 10, max: 2000, step: 10, value: p.tout, unit: ' token', format: (v) => fmt(v), onInput: (v) => { p.tout = v; recompute(); } });
const slDay = ui.slider({ label: 'Günlük karar sayısı', min: 2, max: 7, step: 0.5, value: p.perDay, format: (v) => fmt(Math.round(10 ** v)), onInput: (v) => { p.perDay = v; recompute(); } });

ui.section('Yarış');
ui.select({ label: 'LLM gecikmesi', value: p.lat, options: Object.entries(LATENCY).map(([value, l]) => ({ value, label: l.label })), onChange: (v) => { p.lat = v; sim.reset(); } });
ui.slider({ label: 'Jev gecikmesi', min: 0.07, max: 0.5, step: 0.01, value: p.jevLat, unit: ' sn', format: (v) => fmt(v, 2), onChange: (v) => { p.jevLat = v; sim.reset(); } });
ui.slider({ label: 'Paralel istek / model', min: 1, max: MAX_SLOTS, step: 1, value: p.conc, onChange: (v) => { p.conc = v; sim.reset(); } });

ui.section('Karşılaştırma');
ui.select({ label: 'Jev ile kıyasla', value: p.cmp, options: MODELS.filter((m) => !m.jev).map((m) => ({ value: m.id, label: m.name })), onChange: (v) => { p.cmp = v; recompute(); highlight(); } });
const stJevCost = ui.stat({ label: 'Jev / karar' });
const stCmpCost = ui.stat({ label: 'LLM / karar' });
const stRatio = ui.stat({ label: 'Jev kaç kat ucuz' });
const stJevMonth = ui.stat({ label: 'Jev / ay' });
const stCmpMonth = ui.stat({ label: 'LLM / ay' });
const stRace = ui.stat({ label: 'Yarışta tamamlanan (Jev : LLM)' });
const chCost = ui.chart({ title: 'Yarışta biriken maliyet (sent, ¢)', series: [{ name: 'Jev', color: MODELS[0].color }, { name: 'Seçili LLM', color: '#fdba74' }], maxPoints: 200, yMin: 0, format: (v) => fmt(v * 100, v * 100 < 1 ? 3 : 2) + '¢' });
const table = ui.text('', 'card');
ui.text('<b>Dikkat:</b> Jev yalnızca karar döndürür; LLM metin de yazabilir. Bu tablo aynı <i>karar işini</i> karşılaştırır, '
  + 'doğruluğu değil. Gecikmeler üretici beyanıdır; ayrıntılar ve kaynaklar ⓘ bilgi kutusunda.', 'card');

// --- Hesap ---
function usd(v) {
  if (!isFinite(v)) return '—';
  if (v <= 0) return '$0';
  if (v >= 100) return '$' + fmt(v, 0);
  if (v >= 1) return '$' + fmt(v, 2);
  const d = clamp(1 - Math.floor(Math.log10(v)), 2, 9) || 2;
  return '$' + fmt(v, d);
}
const cmpLane = () => lanes.find((l) => l.m.id === p.cmp);

function recompute() {
  const perMonth = 10 ** p.perDay * 30;
  for (const ln of lanes) {
    ln.costPer = (p.tin * ln.m.pin + (ln.m.jev ? 0 : p.tout * ln.m.pout)) / 1e6;
    ln.monthly = ln.costPer * perMonth;
    // log ölçek: $0,01 → 0 jeton, her 10 kat ≈ 8 jeton
    ln.coins = clamp(Math.round((Math.log10(Math.max(ln.monthly, 1e-3)) + 2) * 8), 1, MAX_COINS);
    ln.cost.setText(`<b>${usd(ln.monthly)}</b>/ay`);
  }
  const jev = lanes[0], c = cmpLane();
  stJevCost.set(usd(jev.costPer), 'good');
  stCmpCost.set(usd(c.costPer));
  stRatio.set(`${fmt(c.costPer / jev.costPer, 0)}×`, 'good');
  stJevMonth.set(usd(jev.monthly), 'good');
  stCmpMonth.set(usd(c.monthly), c.monthly > 1000 ? 'bad' : c.monthly > 100 ? 'warn' : undefined);
  table.set(`<b>Ayda ${fmt(perMonth)} karar</b> (girdi ${fmt(p.tin)}, LLM çıktısı ${fmt(p.tout)} token)
    <table class="jev-t"><tr><th>Model</th><th>$/1M g/ç</th><th>Karar</th><th>Ay</th></tr>
    ${lanes.map((l) => `<tr${l.m.id === p.cmp ? ' class="sel"' : ''}><td><span style="color:${l.m.color}">■</span> ${l.m.name}</td>
      <td>${fmt(l.m.pin, l.m.jev ? 3 : 0)} / ${fmt(l.m.pout)}</td><td>${usd(l.costPer)}</td><td>${usd(l.monthly)}</td></tr>`).join('')}
    </table>`);
  updateNames();
}

function updateNames() {
  for (const ln of lanes) ln.name.setText(`<b>${ln.m.name}</b> <small>✓ ${fmt(ln.done)}</small>`);
}

function highlight() {
  for (const ln of lanes) ln.name.el.classList.toggle('sel', ln.m.jev || ln.m.id === p.cmp);
}

// --- Yarış ---
let t = 0, sampleT = 0;
function latencyFor(ln) {
  const mean = ln.m.jev ? p.jevLat : LATENCY[p.lat].llm;
  // temsili dağılım: ortalama çevresinde sağa çarpık (log-normal benzeri)
  const lo = ln.m.jev ? 0.05 : mean * 0.35, hi = ln.m.jev ? 0.5 : mean * 4;
  return clamp(mean * Math.exp(gauss() * 0.3 - 0.045), lo, hi);
}
function resetRace() {
  t = 0; sampleT = 0;
  for (const ln of lanes) {
    ln.done = 0; ln.spent = 0;
    // başlangıçta istekler aynı anda değil, biraz aralıklı çıksın
    ln.slots = Array.from({ length: p.conc }, (_, k) => { const d = latencyFor(ln); return { t0: -d * (k / p.conc), dur: d }; });
  }
  chCost.clear();
  updateNames();
}

sim.onUpdate((dt) => {
  t += dt;
  let changed = false;
  for (const ln of lanes) {
    for (const s of ln.slots) {
      let guard = 0;
      while (t - s.t0 >= s.dur && guard++ < 500) {
        ln.done++; ln.spent += ln.costPer; ln.flash = 1; changed = true;
        s.t0 += s.dur; s.dur = latencyFor(ln);
      }
    }
  }
  if (changed) updateNames();
  const jev = lanes[0], c = cmpLane();
  stRace.set(`${fmt(jev.done)} : ${fmt(c.done)}`);
  if (t - sampleT >= 0.25) { sampleT = t; chCost.push([jev.spent, c.spent]); }
});

// Dar/dikey ekranda kamerayı geri çek ki şeritler kadraja sığsın
const camBase = sim.camera.position.clone(), camTarget = new THREE.Vector3(1.6, 0.6, 0.6);
let lastAspect = 0;
sim.onRender((realDt) => {
  const a = sim.camera.aspect;
  if (Math.abs(a - lastAspect) > 0.02) {
    lastAspect = a;
    sim.camera.position.copy(camBase).sub(camTarget).multiplyScalar(Math.max(1, 1.15 / a)).add(camTarget);
  }
  let ci = 0;
  lanes.forEach((ln, i) => {
    for (let k = 0; k < MAX_SLOTS; k++) {
      const s = ln.slots[k];
      if (s) {
        const f = clamp((t - s.t0) / s.dur, 0, 1);
        tmp.position.set(X0 + (X1 - X0) * f, TOP, ln.z + (k - (p.conc - 1) / 2) * (LANE_W * 0.55 / Math.max(p.conc, 2)));
        tmp.scale.setScalar(ln.m.jev ? 0.7 : 1);
        tmp.rotation.set(0, (k % 3 - 1) * 0.12, 0);
      } else tmp.scale.setScalar(0);
      tmp.updateMatrix();
      cubes.setMatrixAt(i * MAX_SLOTS + k, tmp.matrix);
    }
    ln.flash = Math.max(0, ln.flash - realDt * 4);
    ln.finish.material.emissiveIntensity = 0.6 + ln.flash * 3.5;
    // kuleler hedef yüksekliğe yumuşakça büyür
    ln.coinsShown += (ln.coins - ln.coinsShown) * Math.min(1, realDt * 6);
    const n = Math.round(ln.coinsShown);
    for (let k = 0; k < MAX_COINS; k++) {
      if (k < n) { tmp.position.set(TOWER_X + Math.sin(k * 1.7) * 0.02, 0.3 + COIN_H * (k + 0.5), ln.z + Math.cos(k * 2.3) * 0.02); tmp.scale.setScalar(1); }
      else tmp.scale.setScalar(0);
      tmp.rotation.set(Math.sin(k * 3.1) * 0.03, k * 0.9, 0);
      tmp.updateMatrix();
      coins.setMatrixAt(ci++, tmp.matrix);
    }
  });
  cubes.instanceMatrix.needsUpdate = true;
  coins.instanceMatrix.needsUpdate = true;
});

sim.onReset(resetRace);

// Panel tablosu ve şerit etiketleri için küçük stil
const css = document.createElement('style');
css.textContent = `
  .lbl.lane-lbl { border-left: 3px solid; text-align: left; line-height: 1.2; opacity: .8 }
  .lbl.lane-lbl.sel { opacity: 1; box-shadow: 0 0 0 1px rgba(255,255,255,.35) }
  @media (max-width: 640px) { .lbl.lane-lbl, .lbl { font-size: 10px; padding: 1px 4px } .lbl.lane-lbl small { display: none } }
  table.jev-t { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11.5px }
  table.jev-t th, table.jev-t td { padding: 3px 4px; text-align: right; white-space: nowrap }
  table.jev-t th:first-child, table.jev-t td:first-child { text-align: left; white-space: normal }
  table.jev-t tr.sel td { background: rgba(253,186,116,.12) }
  table.jev-t th { color: #94a3b8; font-weight: 600 }`;
document.head.appendChild(css);

recompute();
highlight();
resetRace();
